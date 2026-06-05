"""
Pipeline Monitoring & Logging System
Simple monitoring for end-to-end pipeline health
"""

import os
import json
import time
from datetime import datetime
from pathlib import Path


def check_data_quality():
    """Check data quality metrics."""
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║  DATA QUALITY MONITORING                                 ║")
    print("╚══════════════════════════════════════════════════════════╝\n")
    
    # Check raw data
    raw_path = "data/raw/ICU Sepsis Dataset.xlsx"
    if os.path.exists(raw_path):
        size = os.path.getsize(raw_path) / 1024
        print(f"[✓] Raw data exists: {size:.1f} KB")
    else:
        print(f"[✗] Raw data missing: {raw_path}")
    
    # Check curated data
    curated_path = "data/curated/icu_stream_parquet"
    if os.path.exists(curated_path):
        print(f"[✓] Curated data exists: {curated_path}")
    else:
        print(f"[✗] Curated data missing: {curated_path}")
    
    # Check serving layer
    serving_path = "data/serving/realtime_predictions"
    if os.path.exists(serving_path):
        print(f"[✓] Serving layer exists: {serving_path}")
    else:
        print(f"[⚠] Serving layer not yet created (normal if streaming not run)")


def check_model_artifacts():
    """Check model artifacts."""
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║  MODEL ARTIFACTS CHECK                                   ║")
    print("╚══════════════════════════════════════════════════════════╝\n")
    
    model_path = "models/mortality_model_final"
    if os.path.exists(model_path):
        print(f"[✓] Trained model exists: {model_path}")
        
        # Check model metadata
        metadata_path = os.path.join(model_path, "metadata")
        if os.path.exists(metadata_path):
            print(f"[✓] Model metadata found")
        
        return True
    else:
        print(f"[✗] Model not found: {model_path}")
        print("[INFO] Run: python3 spark/spark_ml_ultimate.py")
        return False


def check_kafka_status():
    """Check Kafka connectivity."""
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║  KAFKA STREAMING STATUS                                  ║")
    print("╚══════════════════════════════════════════════════════════╝\n")
    
    try:
        from kafka import KafkaProducer, KafkaConsumer
        from kafka.errors import NoBrokersAvailable
        
        # Try to connect
        producer = KafkaProducer(
            bootstrap_servers=['localhost:9092'],
            request_timeout_ms=5000
        )
        print("[✓] Kafka broker reachable at localhost:9092")
        producer.close()
        return True
        
    except NoBrokersAvailable:
        print("[✗] Kafka broker not available")
        print("[INFO] Start Kafka: sudo systemctl start kafka")
        return False
    except Exception as e:
        print(f"[⚠] Kafka check failed: {str(e)}")
        return False


def check_predictions_count():
    """Count prediction records."""
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║  PREDICTION STATISTICS                                   ║")
    print("╚══════════════════════════════════════════════════════════╝\n")
    
    validation_path = "data/validation_predictions"
    if os.path.exists(validation_path):
        print(f"[✓] Validation predictions stored: {validation_path}")
    else:
        print(f"[⚠] Validation predictions not yet generated")
    
    serving_path = "data/serving/realtime_predictions"
    if os.path.exists(serving_path):
        # Count parquet files
        parquet_files = list(Path(serving_path).glob("*.parquet"))
        print(f"[✓] Real-time predictions: {len(parquet_files)} batch files")
    else:
        print(f"[⚠] Real-time predictions not yet generated")


def log_pipeline_status():
    """Log overall pipeline status."""
    
    status = {
        "timestamp": datetime.now().isoformat(),
        "checks": {}
    }
    
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║  PIPELINE HEALTH CHECK                                   ║")
    print("╚══════════════════════════════════════════════════════════╝")
    
    check_data_quality()
    model_ok = check_model_artifacts()
    kafka_ok = check_kafka_status()
    check_predictions_count()
    
    # Overall status
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║  OVERALL PIPELINE STATUS                                 ║")
    print("╚══════════════════════════════════════════════════════════╝\n")
    
    status["model_ready"] = model_ok
    status["kafka_ready"] = kafka_ok
    status["timestamp_check"] = datetime.now().isoformat()
    
    if model_ok and kafka_ok:
        print("[SUCCESS] ✅ Pipeline is production-ready!")
        print("[INFO] Can run: python3 spark/streaming_inference.py")
    elif model_ok:
        print("[PARTIAL] ⚠️  Model ready, but Kafka unavailable")
        print("[INFO] Start Kafka to enable streaming inference")
    else:
        print("[PENDING] ⏳ Model training required")
        print("[INFO] Run: python3 spark/spark_ml_ultimate.py")
    
    # Save status log
    log_file = "pipeline_status.json"
    with open(log_file, 'w') as f:
        json.dump(status, f, indent=2)
    
    print(f"\n[INFO] Status logged to: {log_file}\n")


def main():
    """Run monitoring checks."""
    print("\n" + "="*60)
    print("  HEALTHCARE BIG DATA PIPELINE MONITORING")
    print("="*60 + "\n")
    
    log_pipeline_status()


if __name__ == "__main__":
    main()
