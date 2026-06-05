import argparse
import json
import os
import time
import random
from typing import Dict, Iterable
from pathlib import Path

import pandas as pd
import numpy as np
from kafka import KafkaProducer

# Use absolute path relative to this script's location
SCRIPT_DIR = Path(__file__).parent.absolute()
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_DATA_PATH = str(PROJECT_ROOT / "data" / "raw" / "ICU Sepsis Dataset.xlsx")
DEFAULT_TOPIC_NAME = "icu_sepsis_stream"
DEFAULT_BOOTSTRAP_SERVER = "localhost:9092"
NUM_PATIENTS = 15  # Monitor 15 pasien saja

COLUMNS = [
    "Age",
    "Gender",
    "Length_of_stay_in_intensive_care",
    "Mortalite",
    "Pulse_rate",
    "Respiratory_Rate",
    "Systolic_blood_pressure",
    "Diastolic_blood_pressure",
    "Oxygen_saturation",
    "CRP",
    "Glukoz",
    "Creatinine",
    "WBC",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Replay ICU Sepsis data to Kafka")
    parser.add_argument("--data", default=DEFAULT_DATA_PATH, help="Path to Excel source")
    parser.add_argument("--topic", default=DEFAULT_TOPIC_NAME, help="Kafka topic name")
    parser.add_argument(
        "--bootstrap",
        default=os.getenv("KAFKA_BOOTSTRAP", DEFAULT_BOOTSTRAP_SERVER),
        help="Kafka bootstrap servers",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.2,
        help="Delay between records (seconds)",
    )
    parser.add_argument(
        "--continuous",
        action="store_true",
        help="Run in continuous mode (loop forever)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="Number of records per batch in continuous mode",
    )
    parser.add_argument(
        "--batch-delay",
        type=float,
        default=3.0,
        help="Delay between batches in continuous mode (seconds)",
    )
    return parser.parse_args()


def load_rows(data_path: str) -> pd.DataFrame:
    df = pd.read_excel(data_path)
    df = df[COLUMNS].dropna()
    # Cast integer-like columns to int to match Spark schema
    int_cols = ["Age", "Gender", "Length_of_stay_in_intensive_care", "Mortalite"]
    df[int_cols] = df[int_cols].astype(int)
    float_cols = [c for c in COLUMNS if c not in int_cols]
    df[float_cols] = df[float_cols].astype(float)
    return df


def create_producer(bootstrap: str) -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=bootstrap,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        linger_ms=50,
        acks="all",
    )


def to_records(df: pd.DataFrame) -> Iterable[Dict[str, float]]:
    for _, row in df.iterrows():
        yield {col: row[col] for col in COLUMNS}


def add_vital_noise(record: Dict, patient_id: int) -> Dict:
    """Add realistic variation to vital signs to simulate continuous monitoring."""
    noisy_record = record.copy()
    noisy_record['patient_id'] = f"patient_{patient_id:03d}"
    
    # Vital signs yang bisa berubah dengan noise kecil (simulasi monitoring real-time)
    noisy_record['Pulse_rate'] = max(30, record['Pulse_rate'] + np.random.uniform(-5, 5))
    noisy_record['Respiratory_Rate'] = max(8, record['Respiratory_Rate'] + np.random.uniform(-2, 2))
    noisy_record['Systolic_blood_pressure'] = max(50, record['Systolic_blood_pressure'] + np.random.uniform(-8, 8))
    noisy_record['Diastolic_blood_pressure'] = max(30, record['Diastolic_blood_pressure'] + np.random.uniform(-5, 5))
    noisy_record['Oxygen_saturation'] = min(100, max(70, record['Oxygen_saturation'] + np.random.uniform(-2, 2)))
    noisy_record['CRP'] = max(0, record['CRP'] + np.random.uniform(-5, 5))
    noisy_record['Glukoz'] = max(50, record['Glukoz'] + np.random.uniform(-10, 10))
    noisy_record['WBC'] = max(1, record['WBC'] + np.random.uniform(-1, 1))
    
    return noisy_record


def main() -> None:
    args = parse_args()
    df = load_rows(args.data)

    print(f"Loaded {len(df)} records from {args.data}")
    
    # Sample 15 pasien unik untuk monitoring
    patients_df = df.sample(n=min(NUM_PATIENTS, len(df)), random_state=42).reset_index(drop=True)
    print(f"Selected {len(patients_df)} patients for continuous monitoring\n")
    
    producer = create_producer(args.bootstrap)

    if args.continuous:
        print(f"[CONTINUOUS MODE] Monitoring {NUM_PATIENTS} patients")
        print(f"Sending updates every {args.sleep}s per patient")
        print("Press Ctrl+C to stop...\n")
        
        batch_count = 0
        try:
            while True:
                batch_count += 1
                # Kirim update untuk setiap pasien dengan vital signs yang berubah
                for idx, (_, row) in enumerate(patients_df.iterrows()):
                    record = {col: row[col] for col in COLUMNS}
                    # Add noise untuk simulasi perubahan kondisi
                    noisy_record = add_vital_noise(record, idx + 1)
                    producer.send(args.topic, value=noisy_record)
                    time.sleep(args.sleep)
                
                producer.flush()
                print(f"[Round {batch_count}] Sent updates for {NUM_PATIENTS} patients to {args.topic}")
                time.sleep(args.batch_delay)
        except KeyboardInterrupt:
            print(f"\n[STOPPED] Completed {batch_count} monitoring rounds")
    else:
        for idx, record in enumerate(to_records(df), start=1):
            producer.send(args.topic, value=record)
            if idx % 50 == 0:
                print(f"Sent {idx} messages to topic {args.topic}")
            time.sleep(args.sleep)
        print(f"Completed sending {len(df)} messages to {args.topic}")

    producer.close()


if __name__ == "__main__":
    main()
