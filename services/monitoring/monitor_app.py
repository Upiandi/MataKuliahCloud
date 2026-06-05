"""
Simple Flask-based monitoring endpoint for pipeline health.
Reads pipeline_status.json; if missing, triggers a fresh status check.
"""

import json
from pathlib import Path
from flask import Flask, jsonify, Response, redirect
import pandas as pd

# Local imports
try:
    from monitor_pipeline import log_pipeline_status
except Exception:  # fallback if not available
    log_pipeline_status = None

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent.parent
STATUS_FILE = BASE_DIR / "pipeline_status.json"
SERVING_PATH = BASE_DIR / "data" / "serving" / "realtime_predictions"


def load_status():
    """Load pipeline status; generate if missing."""
    if not STATUS_FILE.exists() and log_pipeline_status:
        log_pipeline_status()

    if STATUS_FILE.exists():
        with open(STATUS_FILE, "r") as f:
            return json.load(f)
    return {
        "error": "pipeline_status.json not found",
        "action": "run python monitor_pipeline.py"
    }


def load_recent_predictions(limit: int = 50):
    """Load recent predictions from serving layer parquet - group by patient for latest state."""
    if not SERVING_PATH.exists():
        return None
    files = sorted(
        SERVING_PATH.glob("*.parquet"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    if not files:
        return None
    try:
        # Read recent parquet files (last 10 for more complete data)
        dfs = []
        for f in files[:10]:
            try:
                dfs.append(pd.read_parquet(f))
            except:
                continue
        if not dfs:
            return None
        df = pd.concat(dfs, ignore_index=True)
        
        # Keep only latest record per patient based on prediction_time
        if "patient_id" in df.columns and "prediction_time" in df.columns:
            df["prediction_time"] = pd.to_datetime(df["prediction_time"])
            df = df.sort_values("prediction_time", ascending=False)
            df = df.drop_duplicates(subset="patient_id", keep="first")
        
        # Return latest limit records
        return df.head(limit)
    except Exception as e:
        print(f"Error loading predictions: {e}")
        return None


def summarize(df: pd.DataFrame) -> dict:
    """Build quick summary stats for dashboard cards."""
    if df is None or df.empty:
        return {"total": 0, "alerts": 0, "high": 0, "moderate": 0, "low": 0, "latest": "-"}

    risk_counts = df.get("risk_category", pd.Series([], dtype=str)).value_counts()
    alerts = int(df.get("alert", pd.Series([], dtype=bool)).sum()) if "alert" in df else 0
    latest = str(df.get("prediction_time").max()) if "prediction_time" in df else "-"
    return {
        "total": int(len(df)),
        "alerts": alerts,
        "high": int(risk_counts.get("HIGH", 0)),
        "moderate": int(risk_counts.get("MODERATE", 0)),
        "low": int(risk_counts.get("LOW", 0)),
        "latest": latest,
    }


@app.route("/")
def root():
    return redirect("/dashboard")


@app.route("/health")
def health():
    status = load_status()
    return jsonify({
        "ok": status.get("model_ready", False) and status.get("kafka_ready", False),
        "model_ready": status.get("model_ready"),
        "kafka_ready": status.get("kafka_ready"),
        "timestamp": status.get("timestamp_check")
    })


@app.route("/status")
def status():
    status = load_status()
    return jsonify(status)


@app.route("/recent")
def recent():
    df = load_recent_predictions()
    if df is None:
        return jsonify({"error": "No realtime predictions yet. Run streaming inference."}), 404
    return jsonify(df.to_dict(orient="records"))


@app.route("/dashboard")
def dashboard():
    df = load_recent_predictions()
    stats = summarize(df)

    base_css = """
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; background: #f6f8fa; color: #1f2933; }
      h1 { margin: 0 0 8px 0; font-size: 22px; }
      .sub { color: #475467; margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
      .card { background: white; border: 1px solid #dfe3e8; border-radius: 8px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
      .label { font-size: 12px; text-transform: uppercase; color: #52616b; letter-spacing: 0.04em; }
      .value { font-size: 20px; font-weight: 700; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; background: white; }
      th, td { padding: 8px 10px; border: 1px solid #e5e7eb; font-size: 13px; text-align: left; }
      th { background: #f0f2f5; text-transform: uppercase; letter-spacing: 0.03em; color: #4a5568; }
      .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
      .pill-high { background: #fee2e2; color: #b91c1c; }
      .pill-mod { background: #fff7e6; color: #c56a00; }
      .pill-low { background: #e6f4ea; color: #166534; }
      .muted { color: #6b7280; }
      .empty { background: white; border: 1px dashed #d1d5db; padding: 20px; border-radius: 8px; text-align: center; color: #6b7280; }
    </style>
    """

    if df is None or df.empty:
        html = f"""
        <html><head><meta http-equiv='refresh' content='5'>{base_css}</head>
        <body>
          <h1>Realtime ICU Monitoring Dashboard</h1>
          <div class='empty'>No realtime predictions yet. Pastikan streaming inference aktif dan producer mengirim data.</div>
        </body></html>
        """
        return Response(html, mimetype="text/html")

    cols = [
        "patient_id",
        "Age",
        "Pulse_rate",
        "Respiratory_Rate",
        "Systolic_blood_pressure",
        "Oxygen_saturation",
        "risk_category",
        "alert",
        "prediction_time",
    ]
    safe_cols = [c for c in cols if c in df.columns]
    rows_html = []
    for row in df[safe_cols].to_dict(orient="records"):
        risk = str(row.get("risk_category", "")).upper()
        pill_class = "pill-low" if risk == "LOW" else "pill-mod" if risk == "MODERATE" else "pill-high" if risk == "HIGH" else ""
        risk_cell = f"<span class='pill {pill_class}'>{risk}</span>" if risk else ""
        prob = row.get("probability")
        prob_val = prob[1] if isinstance(prob, (list, tuple)) and len(prob) > 1 else prob
        prob_cell = f"{prob_val:.3f}" if isinstance(prob_val, (int, float)) else prob
        alert_cell = "YES" if row.get("alert") else "-"
        cells = []
        for col in safe_cols:
            if col == "risk_category":
                cells.append(f"<td>{risk_cell}</td>")
            elif col == "probability":
                cells.append(f"<td>{prob_cell}</td>")
            elif col == "alert":
                cells.append(f"<td>{alert_cell}</td>")
            else:
                cells.append(f"<td>{row.get(col, '')}</td>")
        rows_html.append("<tr>" + "".join(cells) + "</tr>")

    head_cells = "".join([f"<th>{col}</th>" for col in safe_cols])
    cards = f"""
      <div class='grid'>
        <div class='card'><div class='label'>Total rows</div><div class='value'>{stats['total']}</div></div>
        <div class='card'><div class='label'>Alerts</div><div class='value'>{stats['alerts']}</div></div>
        <div class='card'><div class='label'>High risk</div><div class='value'>{stats['high']}</div></div>
        <div class='card'><div class='label'>Moderate</div><div class='value'>{stats['moderate']}</div></div>
        <div class='card'><div class='label'>Low</div><div class='value'>{stats['low']}</div></div>
        <div class='card'><div class='label'>Last update</div><div class='value'>{stats['latest']}</div></div>
      </div>
    """

    html = f"""
    <html><head><meta http-equiv='refresh' content='5'>{base_css}</head>
    <body>
      <h1>Realtime ICU Monitoring Dashboard</h1>
      {cards}
      <table>
        <thead><tr>{head_cells}</tr></thead>
        <tbody>{''.join(rows_html)}</tbody>
      </table>
    </body></html>
    """
    return Response(html, mimetype="text/html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
