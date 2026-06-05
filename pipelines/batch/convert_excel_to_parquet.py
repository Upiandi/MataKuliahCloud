import os
import sys

import pandas as pd


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    excel_path = os.path.join(base_dir, "data", "raw", "ICU Sepsis Dataset.xlsx")
    parquet_dir = os.path.join(base_dir, "data", "curated", "icu_stream_parquet")

    if not os.path.exists(excel_path):
        print(f"ERROR: Excel file not found: {excel_path}")
        sys.exit(1)

    print(f"Loading data from {excel_path}...")
    df = pd.read_excel(excel_path)
    
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
    
    df = df[COLUMNS].dropna()
    
    # Cast types to match Spark schema
    int_cols = ["Age", "Gender", "Length_of_stay_in_intensive_care", "Mortalite"]
    df[int_cols] = df[int_cols].astype(int)
    float_cols = [c for c in COLUMNS if c not in int_cols]
    df[float_cols] = df[float_cols].astype(float)
    
    print(f"Loaded {len(df)} valid rows")
    print(f"Schema: {list(df.columns)}")
    print(f"Label distribution: {dict(df['Mortalite'].value_counts())}")
    
    # Save to Parquet (create directory structure like Spark does)
    import shutil
    if os.path.exists(parquet_dir):
        shutil.rmtree(parquet_dir)
    os.makedirs(parquet_dir, exist_ok=True)
    
    parquet_file = os.path.join(parquet_dir, "data.parquet")
    df.to_parquet(parquet_file, index=False, engine='pyarrow')
    
    print(f"✓ Saved {len(df)} records to {parquet_file}")
    
    # Verify
    verify_df = pd.read_parquet(parquet_dir)
    print(f"✓ Verification: {len(verify_df)} records in Parquet")


if __name__ == "__main__":
    main()
