"""
ML → API bridge (hybrid integration).

Reads the Spark/parquet prediction output produced by the Big Data pipeline and
pushes it into the NestJS monitoring API via POST /api/predictions/sync, where it
is stored as predictions with source = ML_PIPELINE (and HIGH risk raises alerts).

This is the glue that makes the "Hybrid" architecture real: the standalone CRUD
app gains live ML predictions whenever the pipeline has produced parquet output.

Usage:
    python pipelines/bridge/sync_predictions.py \
        --source data/serving/realtime_predictions \
        --api-url http://localhost:3000/api \
        --api-key ml-pipeline-ingest-key-change-me

Notes:
    * Stdlib only (urllib) — no extra dependencies beyond pandas/pyarrow which the
      pipeline already requires.
    * Robust to missing columns: synthesises an MRN per row if patient_id is
      absent, and derives risk_category from probability when not present.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pandas as pd

DEFAULT_SOURCES = [
    "data/serving/realtime_predictions",
    "data/validation_predictions",
]


def find_source(explicit: str | None) -> Path | None:
    """Resolve the parquet directory/file to read predictions from."""
    candidates = [explicit] if explicit else DEFAULT_SOURCES
    for c in candidates:
        if not c:
            continue
        p = Path(c)
        if p.exists():
            return p
    return None


def load_predictions(source: Path) -> pd.DataFrame:
    """Read parquet (directory of parts or single file) into one DataFrame."""
    if source.is_dir():
        files = sorted(source.glob("*.parquet"))
        if not files:
            raise FileNotFoundError(f"No .parquet files under {source}")
        return pd.concat((pd.read_parquet(f) for f in files), ignore_index=True)
    return pd.read_parquet(source)


def derive_risk(prob: float) -> str:
    if prob >= 0.5:
        return "HIGH"
    if prob >= 0.2:
        return "MODERATE"
    return "LOW"


def normalise_probability(value) -> float:
    """Spark stores probability as a 2-element vector [p0, p1]; take p1."""
    if isinstance(value, (list, tuple)) and len(value) > 1:
        return float(value[1])
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def to_items(df: pd.DataFrame) -> list[dict]:
    """Map pipeline rows to the API's SyncPredictionItem shape, latest-per-patient."""
    # Keep latest record per patient if we have identity + time columns.
    if "patient_id" in df.columns and "prediction_time" in df.columns:
        df = df.copy()
        df["prediction_time"] = pd.to_datetime(df["prediction_time"], errors="coerce")
        df = df.sort_values("prediction_time").drop_duplicates("patient_id", keep="last")

    items: list[dict] = []
    for idx, row in df.reset_index(drop=True).iterrows():
        prob = normalise_probability(row.get("probability", 0.0))
        risk = str(row.get("risk_category") or derive_risk(prob)).upper()
        if risk not in ("LOW", "MODERATE", "HIGH"):
            risk = derive_risk(prob)

        mrn = row.get("patient_id")
        mrn = f"ML-{int(mrn)}" if pd.notna(mrn) else f"ML-{idx + 1:04d}"

        item = {"mrn": str(mrn), "riskCategory": risk, "probability": round(prob, 4)}

        if pd.notna(row.get("Age")):
            item["age"] = int(row["Age"])
        if pd.notna(row.get("Gender")):
            item["gender"] = "MALE" if int(row["Gender"]) == 1 else "FEMALE"
        if pd.notna(row.get("prediction_time")):
            item["recordedAt"] = pd.to_datetime(row["prediction_time"]).isoformat()
        item["modelVersion"] = str(row.get("model_version", "spark-gbt-v1"))

        items.append(item)
    return items


def post_batch(api_url: str, api_key: str, items: list[dict]) -> dict:
    payload = json.dumps({"items": items}).encode("utf-8")
    req = urllib.request.Request(
        f"{api_url.rstrip('/')}/predictions/sync",
        data=payload,
        headers={"Content-Type": "application/json", "x-api-key": api_key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_items(api_url: str, api_key: str, items: list[dict], batch_size: int) -> bool:
    """POST items in batches; returns False on a fatal API/connection error."""
    total = {"created": 0, "provisioned": 0, "alerted": 0}
    for i in range(0, len(items), batch_size):
        batch = items[i : i + batch_size]
        try:
            result = post_batch(api_url, api_key, batch)
        except urllib.error.HTTPError as e:
            print(f"[ERROR] API rejected batch ({e.code}): {e.read().decode('utf-8', 'ignore')}")
            return False
        except urllib.error.URLError as e:
            print(f"[ERROR] Cannot reach API at {api_url}: {e.reason}")
            return False
        for k in total:
            total[k] += result.get(k, 0)
    print(f"[OK] created={total['created']} provisioned={total['provisioned']} alerted={total['alerted']}")
    return True


def parquet_files(source: Path) -> list[Path]:
    return sorted(source.glob("*.parquet")) if source.is_dir() else [source]


def sync_files(files: list[Path], args) -> bool:
    df = pd.concat((pd.read_parquet(f) for f in files), ignore_index=True)
    if args.limit:
        df = df.head(args.limit)
    items = to_items(df)
    if not items:
        print("[WARN] No predictions to sync this cycle.")
        return True
    print(f"[INFO] Syncing {len(items)} prediction(s) from {len(files)} file(s)...")
    return post_items(args.api_url, args.api_key, items, args.batch_size)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync ML parquet predictions to the monitoring API.")
    parser.add_argument("--source", help="Parquet dir or file (default: serving/validation paths)")
    parser.add_argument("--api-url", default=os.getenv("API_URL", "http://localhost:3000/api"))
    parser.add_argument("--api-key", default=os.getenv("INGEST_API_KEY", "ml-pipeline-ingest-key-change-me"))
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--limit", type=int, default=0, help="Optional cap on number of rows.")
    parser.add_argument(
        "--watch",
        type=float,
        default=0,
        metavar="SECONDS",
        help="Continuously sync only newly-arrived parquet files every N seconds (realtime mode). 0 = run once.",
    )
    args = parser.parse_args()

    source = find_source(args.source)
    if source is None:
        print("[ERROR] No prediction parquet found. Run the ML/streaming pipeline first.")
        print(f"        Looked in: {args.source or ', '.join(DEFAULT_SOURCES)}")
        return 1
    print(f"[INFO] Reading predictions from: {source}")

    # One-shot mode.
    if not args.watch:
        return 0 if sync_files(parquet_files(source), args) else 1

    # Watch mode — keep syncing only new parquet files (pairs with Spark streaming).
    print(f"[INFO] Watch mode: polling every {args.watch}s for new predictions. Ctrl+C to stop.")
    seen: set[str] = set()
    try:
        while True:
            new = [f for f in parquet_files(source) if str(f) not in seen]
            if new:
                if sync_files(new, args):
                    seen.update(str(f) for f in new)
            time.sleep(args.watch)
    except KeyboardInterrupt:
        print("\n[INFO] Stopped watch mode.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
