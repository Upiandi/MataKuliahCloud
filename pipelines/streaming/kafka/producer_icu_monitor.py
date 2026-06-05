"""
ICU Real-time Patient Monitoring Producer
Simulates vital signs updates for fixed set of patients
"""

import argparse
import json
import os
import time
import random
from typing import Dict, List

import pandas as pd
from kafka import KafkaProducer

DEFAULT_DATA_PATH = "data/raw/ICU Sepsis Dataset.xlsx"
DEFAULT_TOPIC_NAME = "icu-sepsis"
DEFAULT_BOOTSTRAP_SERVER = "localhost:9092"


class PatientSimulator:
    """Simulate realistic vital signs variations for ICU patients."""
    
    def __init__(self, patient_baseline: Dict):
        """Initialize with patient baseline data."""
        self.patient_id = patient_baseline.get("patient_id")
        self.age = patient_baseline["Age"]
        self.gender = patient_baseline["Gender"]
        
        # Store baseline vitals with some variance
        self.baseline = {
            "Pulse_rate": patient_baseline["Pulse_rate"],
            "Respiratory_Rate": patient_baseline["Respiratory_Rate"],
            "Systolic_blood_pressure": patient_baseline["Systolic_blood_pressure"],
            "Diastolic_blood_pressure": patient_baseline["Diastolic_blood_pressure"],
            "Oxygen_saturation": patient_baseline["Oxygen_saturation"],
            "CRP": patient_baseline["CRP"],
            "Glukoz": patient_baseline["Glukoz"],
            "Creatinine": patient_baseline["Creatinine"],
            "WBC": patient_baseline["WBC"],
        }
        
        # Current state - start at baseline
        self.current = self.baseline.copy()
        
    def generate_vitals(self) -> Dict:
        """Generate realistic vital signs with random variations."""
        
        # Pulse: vary ±15 from baseline, range 40-150
        pulse_change = random.uniform(-15, 15)
        self.current["Pulse_rate"] = max(40, min(150, self.baseline["Pulse_rate"] + pulse_change))
        
        # Respiratory rate: vary ±5, range 8-40
        resp_change = random.uniform(-5, 5)
        self.current["Respiratory_Rate"] = max(8, min(40, self.baseline["Respiratory_Rate"] + resp_change))
        
        # Blood pressure: systolic ±20, diastolic ±15
        sys_change = random.uniform(-20, 20)
        dias_change = random.uniform(-15, 15)
        self.current["Systolic_blood_pressure"] = max(60, min(180, self.baseline["Systolic_blood_pressure"] + sys_change))
        self.current["Diastolic_blood_pressure"] = max(40, min(120, self.baseline["Diastolic_blood_pressure"] + dias_change))
        
        # SpO2: vary ±5, range 80-100
        spo2_change = random.uniform(-5, 5)
        self.current["Oxygen_saturation"] = max(80, min(100, self.baseline["Oxygen_saturation"] + spo2_change))
        
        # Lab values change slower - vary ±10%
        self.current["CRP"] = max(0.1, self.baseline["CRP"] * random.uniform(0.9, 1.1))
        self.current["Glukoz"] = max(50, min(400, self.baseline["Glukoz"] * random.uniform(0.95, 1.05)))
        self.current["Creatinine"] = max(0.3, min(10, self.baseline["Creatinine"] * random.uniform(0.95, 1.05)))
        self.current["WBC"] = max(1, min(50, self.baseline["WBC"] * random.uniform(0.9, 1.1)))
        
        # Occasionally simulate deterioration (10% chance)
        if random.random() < 0.1:
            self.current["Oxygen_saturation"] = max(80, self.current["Oxygen_saturation"] - random.uniform(5, 15))
            self.current["Systolic_blood_pressure"] = max(60, self.current["Systolic_blood_pressure"] - random.uniform(10, 30))
        
        # Occasionally simulate improvement (10% chance)
        if random.random() < 0.1:
            self.current["Oxygen_saturation"] = min(100, self.current["Oxygen_saturation"] + random.uniform(3, 8))
            self.current["Systolic_blood_pressure"] = min(140, self.current["Systolic_blood_pressure"] + random.uniform(5, 15))
        
        return {
            "patient_id": self.patient_id,
            "Age": self.age,
            "Gender": self.gender,
            **{k: round(v, 2) for k, v in self.current.items()}
        }


def load_patients(data_path: str, num_patients: int = 30) -> List[PatientSimulator]:
    """Load baseline patient data and create simulators."""
    import os
    # Resolve path relative to script location if not absolute
    if not os.path.isabs(data_path) and not os.path.exists(data_path):
        # Try from project root
        alt_path = os.path.join(os.path.dirname(__file__), "..", data_path)
        if os.path.exists(alt_path):
            data_path = alt_path
    
    print(f"[DEBUG] Loading from: {os.path.abspath(data_path)}")
    
    df = pd.read_excel(data_path)
    
    # Skip header row (row 0 contains labels)
    df = df.iloc[1:].reset_index(drop=True)
    
    # Select only columns we need and drop rows where any are missing
    cols_needed = [
        "Age", "Gender", "Pulse_rate", "Respiratory_Rate",
        "Systolic_blood_pressure", "Diastolic_blood_pressure",
        "Oxygen_saturation", "CRP", "Glukoz", "Creatinine", "WBC"
    ]
    df = df[cols_needed].dropna()
    print(f"[DEBUG] Loaded {len(df)} complete records")
    
    # Sample fixed number of patients
    df_sample = df.sample(n=min(num_patients, len(df)), random_state=42)
    
    patients = []
    for idx, row in df_sample.iterrows():
        baseline = {
            "patient_id": f"P{idx:04d}",
            "Age": int(row["Age"]),
            "Gender": int(row["Gender"]),
            "Pulse_rate": float(row["Pulse_rate"]),
            "Respiratory_Rate": float(row["Respiratory_Rate"]),
            "Systolic_blood_pressure": float(row["Systolic_blood_pressure"]),
            "Diastolic_blood_pressure": float(row["Diastolic_blood_pressure"]),
            "Oxygen_saturation": float(row["Oxygen_saturation"]),
            "CRP": float(row["CRP"]),
            "Glukoz": float(row["Glukoz"]),
            "Creatinine": float(row["Creatinine"]),
            "WBC": float(row["WBC"]),
        }
        patients.append(PatientSimulator(baseline))
    
    return patients


def create_producer(bootstrap: str) -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=bootstrap,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        linger_ms=10,
        acks="all",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ICU Real-time Monitoring Producer")
    parser.add_argument("--data", default=DEFAULT_DATA_PATH, help="Path to baseline data")
    parser.add_argument("--topic", default=DEFAULT_TOPIC_NAME, help="Kafka topic")
    parser.add_argument("--bootstrap", default=DEFAULT_BOOTSTRAP_SERVER, help="Kafka bootstrap")
    parser.add_argument("--patients", type=int, default=30, help="Number of patients to monitor")
    parser.add_argument("--interval", type=float, default=5.0, help="Update interval (seconds)")
    return parser.parse_args()


def main():
    args = parse_args()
    
    print(f"[ICU MONITOR] Loading {args.patients} patients from {args.data}")
    patients = load_patients(args.data, args.patients)
    print(f"[ICU MONITOR] Monitoring {len(patients)} patients")
    print(f"[ICU MONITOR] Sending updates every {args.interval}s to topic: {args.topic}")
    print("[ICU MONITOR] Press Ctrl+C to stop...\n")
    
    producer = create_producer(args.bootstrap)
    update_count = 0
    
    try:
        while True:
            update_count += 1
            print(f"[Update #{update_count}] Broadcasting vitals for {len(patients)} patients...")
            
            for patient in patients:
                vitals = patient.generate_vitals()
                producer.send(args.topic, value=vitals)
            
            producer.flush()
            print(f"[Update #{update_count}] ✓ Sent at {time.strftime('%H:%M:%S')}")
            time.sleep(args.interval)
            
    except KeyboardInterrupt:
        print(f"\n[ICU MONITOR] Stopped after {update_count} updates")
    finally:
        producer.close()


if __name__ == "__main__":
    main()
