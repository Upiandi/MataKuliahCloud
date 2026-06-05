"""
Real-time Inference on Streaming Data
Integrates trained model into Spark Structured Streaming pipeline
"""

import os
import sys
from pyspark.sql import SparkSession
from pyspark.ml import PipelineModel
from pyspark.sql.functions import (
    col,
    from_json,
    when,
    current_timestamp,
    expr,
)
from pyspark.ml.functions import vector_to_array
from pyspark.sql.types import StructType, StructField, DoubleType, IntegerType, StringType


def create_streaming_session():
    """Create Spark session for streaming with Kafka packages."""

    # Spark does not bundle the Kafka source; pull the connector at startup.
    kafka_packages = "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.1,org.apache.kafka:kafka-clients:3.5.2"
    extra_packages = os.getenv("SPARK_EXTRA_PACKAGES")
    if extra_packages:
        kafka_packages = f"{kafka_packages},{extra_packages}"

    return SparkSession.builder \
        .master("local[*]") \
        .appName("ICU_Streaming_Inference") \
        .config("spark.jars.packages", kafka_packages) \
        .config("spark.sql.adaptive.enabled", "true") \
        .config("spark.driver.memory", "4g") \
        .getOrCreate()


def engineer_features_streaming(df):
    """Apply same feature engineering for streaming data."""
    
    df_features = df \
        .withColumn("MAP", (col("Systolic_blood_pressure") + 2 * col("Diastolic_blood_pressure")) / 3) \
        .withColumn("Pulse_Pressure", col("Systolic_blood_pressure") - col("Diastolic_blood_pressure")) \
        .withColumn("Shock_Index", col("Pulse_rate") / (col("Systolic_blood_pressure") + 1)) \
        .withColumn("Age_Risk", when(col("Age") >= 65, 1).otherwise(0)) \
        .withColumn("Elderly", when(col("Age") >= 80, 1).otherwise(0)) \
        .withColumn("Young", when(col("Age") < 40, 1).otherwise(0)) \
        .withColumn("Hypotension", when(col("Systolic_blood_pressure") < 90, 1).otherwise(0)) \
        .withColumn("Severe_Hypotension", when(col("Systolic_blood_pressure") < 80, 1).otherwise(0)) \
        .withColumn("Hypoxia", when(col("Oxygen_saturation") < 90, 1).otherwise(0)) \
        .withColumn("Severe_Hypoxia", when(col("Oxygen_saturation") < 85, 1).otherwise(0)) \
        .withColumn("Normal_SpO2", when(col("Oxygen_saturation") >= 95, 1).otherwise(0)) \
        .withColumn("Tachypnea", when(col("Respiratory_Rate") > 22, 1).otherwise(0)) \
        .withColumn("Severe_Tachypnea", when(col("Respiratory_Rate") > 30, 1).otherwise(0)) \
        .withColumn("Bradypnea", when(col("Respiratory_Rate") < 12, 1).otherwise(0)) \
        .withColumn("Tachycardia", when(col("Pulse_rate") > 100, 1).otherwise(0)) \
        .withColumn("Bradycardia", when(col("Pulse_rate") < 60, 1).otherwise(0)) \
        .withColumn("High_CRP", when(col("CRP") > 50, 1).otherwise(0)) \
        .withColumn("Very_High_CRP", when(col("CRP") > 100, 1).otherwise(0)) \
        .withColumn("Renal_Dysfunction", when(col("Creatinine") > 1.5, 1).otherwise(0)) \
        .withColumn("Severe_Renal", when(col("Creatinine") > 2.5, 1).otherwise(0)) \
        .withColumn("Leukocytosis", when(col("WBC") > 12, 1).otherwise(0)) \
        .withColumn("Severe_Leukocytosis", when(col("WBC") > 20, 1).otherwise(0)) \
        .withColumn("Leukopenia", when(col("WBC") < 4, 1).otherwise(0)) \
        .withColumn("Hyperglycemia", when(col("Glukoz") > 180, 1).otherwise(0)) \
        .withColumn("Age_Oxygen", col("Age") * col("Oxygen_saturation") / 100) \
        .withColumn("Age_CRP", col("Age") * col("CRP") / 100) \
        .withColumn("CRP_WBC_Ratio", col("CRP") / (col("WBC") + 0.1)) \
        .withColumn("CRP_Creatinine", col("CRP") * col("Creatinine")) \
        .withColumn("Oxygen_BP_Product", col("Oxygen_saturation") * col("MAP") / 100) \
        .withColumn("SIRS_Score", 
                    (when(col("Respiratory_Rate") > 20, 1).otherwise(0) +
                     when((col("WBC") > 12) | (col("WBC") < 4), 1).otherwise(0) +
                     when(col("Pulse_rate") > 90, 1).otherwise(0))) \
        .withColumn("qSOFA", 
                    (when(col("Respiratory_Rate") >= 22, 1).otherwise(0) +
                     when(col("Systolic_blood_pressure") <= 100, 1).otherwise(0))) \
        .withColumn("Critical_Vitals", 
                    when((col("Oxygen_saturation") < 90) | 
                         (col("Systolic_blood_pressure") < 90), 1).otherwise(0)) \
        .withColumn("Multi_Organ_Failure", 
                    when((col("Creatinine") > 2.0) & 
                         (col("Oxygen_saturation") < 92), 1).otherwise(0)) \
        .withColumn("Age_Squared", col("Age") * col("Age") / 1000) \
        .withColumn("SpO2_Squared", col("Oxygen_saturation") * col("Oxygen_saturation") / 100)
    
    return df_features


def classify_risk(df):
    """Classify mortality risk based on prediction probability."""
    prob_arr = vector_to_array(col("probability"))

    df_classified = df \
        .withColumn("risk_category", 
                    when(prob_arr[1] >= 0.75, "HIGH")
                    .when(prob_arr[1] >= 0.50, "MODERATE")
                    .otherwise("LOW")) \
        .withColumn("alert", when(prob_arr[1] >= 0.75, True).otherwise(False)) \
        .withColumn("prediction_time", current_timestamp())
    
    return df_classified


def run_streaming_inference():
    """Run real-time inference on Kafka stream."""

    spark = create_streaming_session()

    print("╔══════════════════════════════════════════════════════════╗")
    print("║  REAL-TIME STREAMING INFERENCE                           ║")
    print("║  Kafka → Feature Engineering → ML Model → Predictions    ║")
    print("╚══════════════════════════════════════════════════════════╝\n")

    try:
        # Load trained model (resolve absolute path from project root)
        from pathlib import Path
        project_root = Path(__file__).resolve().parent.parent.parent
        model_path = str(project_root / "models" / "mortality_model_final")
        print(f"[INFO] Loading trained model from {model_path}...")
        model = PipelineModel.load(model_path)
        print("[SUCCESS] Model loaded\n")

        # Wire up Kafka connection (keep in sync with producer defaults)
        kafka_bootstrap = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
        kafka_topic = os.getenv("KAFKA_TOPIC", "icu_sepsis_stream")
        print(f"[INFO] Connecting to Kafka topic '{kafka_topic}' at {kafka_bootstrap} ...")
        
        # Define schema (producer now sends patient_id)
        schema = StructType([
            StructField("patient_id", StringType(), True),
            StructField("Age", DoubleType(), True),
            StructField("Gender", DoubleType(), True),
            StructField("Pulse_rate", DoubleType(), True),
            StructField("Respiratory_Rate", DoubleType(), True),
            StructField("Systolic_blood_pressure", DoubleType(), True),
            StructField("Diastolic_blood_pressure", DoubleType(), True),
            StructField("Oxygen_saturation", DoubleType(), True),
            StructField("CRP", DoubleType(), True),
            StructField("Glukoz", DoubleType(), True),
            StructField("Creatinine", DoubleType(), True),
            StructField("WBC", DoubleType(), True),
        ])
        
        # Read from Kafka
        df_stream = spark.readStream \
            .format("kafka") \
            .option("kafka.bootstrap.servers", kafka_bootstrap) \
            .option("subscribe", kafka_topic) \
            .option("startingOffsets", "earliest") \
            .option("failOnDataLoss", "false") \
            .load()
        
        # Parse JSON (patient_id sudah ada dari producer)
        df_parsed = df_stream.selectExpr("CAST(value AS STRING) as json") \
            .select(from_json(col("json"), schema).alias("data")) \
            .select("data.*")
        
        # Feature engineering
        print("[INFO] Applying feature engineering...")
        df_features = engineer_features_streaming(df_parsed)
        
        # Make predictions
        print("[INFO] Running real-time predictions...")
        df_predictions = model.transform(df_features)
        
        # Classify risk
        df_final = classify_risk(df_predictions)
        
        # Select output columns
        output_df = df_final.select(
            "patient_id", "Age", "Oxygen_saturation", "Systolic_blood_pressure",
            "Pulse_rate", "Respiratory_Rate",
            "prediction", "probability", "risk_category", "alert", "prediction_time"
        )
        
        # Write to serving layer (Parquet) - use complete mode with watermark for latest state
        print("[INFO] Starting streaming query (writing to serving layer)...\n")
        
        serving_path = str(project_root / "data" / "serving" / "realtime_predictions")
        checkpoint_path = str(project_root / "data" / "serving" / "checkpoints")
        
        query = output_df.writeStream \
            .outputMode("append") \
            .format("parquet") \
            .option("path", serving_path) \
            .option("checkpointLocation", checkpoint_path) \
            .trigger(processingTime="3 seconds") \
            .start()
        
        print("[SUCCESS] ✓ Streaming inference active!")
        print(f"[INFO] Predictions being written to: {serving_path}")
        print("[INFO] High-risk alerts (probability >= 0.75) flagged")
        print("\n[INFO] Press Ctrl+C to stop...\n")
        
        query.awaitTermination()
        
    except KeyboardInterrupt:
        print("\n[INFO] Stopping streaming inference...")
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        spark.stop()


if __name__ == "__main__":
    run_streaming_inference()
