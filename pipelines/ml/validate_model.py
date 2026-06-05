"""
Model Validation - Validate saved model on separate batch data
"""

import sys
from pyspark.sql import SparkSession
from pyspark.ml import PipelineModel
from pyspark.ml.evaluation import BinaryClassificationEvaluator, MulticlassClassificationEvaluator


def validate_model():
    """Validate saved model on full dataset."""
    
    spark = SparkSession.builder \
        .appName("Model_Validation") \
        .config("spark.driver.memory", "4g") \
        .getOrCreate()
    
    try:
        print("╔══════════════════════════════════════════════════════════╗")
        print("║  MODEL VALIDATION - Separate Batch Testing              ║")
        print("╚══════════════════════════════════════════════════════════╝\n")
        
        # Load model
        print("[INFO] Loading trained model...")
        model = PipelineModel.load("models/mortality_model_final")
        print("[SUCCESS] Model loaded successfully\n")
        
        # Load data
        print("[INFO] Loading validation data...")
        df = spark.read.parquet("data/curated/icu_stream_parquet")
        df_clean = df.filter(df.Mortalite.isin([0, 1]))
        
        # Apply feature engineering
        print("[INFO] Applying feature engineering...")
        from pyspark.sql.functions import when
        
        df_features = df_clean \
            .withColumn("MAP", (df_clean.Systolic_blood_pressure + 2 * df_clean.Diastolic_blood_pressure) / 3) \
            .withColumn("Pulse_Pressure", df_clean.Systolic_blood_pressure - df_clean.Diastolic_blood_pressure) \
            .withColumn("Shock_Index", df_clean.Pulse_rate / (df_clean.Systolic_blood_pressure + 1)) \
            .withColumn("Age_Risk", when(df_clean.Age >= 65, 1).otherwise(0)) \
            .withColumn("Elderly", when(df_clean.Age >= 80, 1).otherwise(0)) \
            .withColumn("Young", when(df_clean.Age < 40, 1).otherwise(0)) \
            .withColumn("Hypotension", when(df_clean.Systolic_blood_pressure < 90, 1).otherwise(0)) \
            .withColumn("Severe_Hypotension", when(df_clean.Systolic_blood_pressure < 80, 1).otherwise(0)) \
            .withColumn("Hypoxia", when(df_clean.Oxygen_saturation < 90, 1).otherwise(0)) \
            .withColumn("Severe_Hypoxia", when(df_clean.Oxygen_saturation < 85, 1).otherwise(0)) \
            .withColumn("Normal_SpO2", when(df_clean.Oxygen_saturation >= 95, 1).otherwise(0)) \
            .withColumn("Tachypnea", when(df_clean.Respiratory_Rate > 22, 1).otherwise(0)) \
            .withColumn("Severe_Tachypnea", when(df_clean.Respiratory_Rate > 30, 1).otherwise(0)) \
            .withColumn("Bradypnea", when(df_clean.Respiratory_Rate < 12, 1).otherwise(0)) \
            .withColumn("Tachycardia", when(df_clean.Pulse_rate > 100, 1).otherwise(0)) \
            .withColumn("Bradycardia", when(df_clean.Pulse_rate < 60, 1).otherwise(0)) \
            .withColumn("High_CRP", when(df_clean.CRP > 50, 1).otherwise(0)) \
            .withColumn("Very_High_CRP", when(df_clean.CRP > 100, 1).otherwise(0)) \
            .withColumn("Renal_Dysfunction", when(df_clean.Creatinine > 1.5, 1).otherwise(0)) \
            .withColumn("Severe_Renal", when(df_clean.Creatinine > 2.5, 1).otherwise(0)) \
            .withColumn("Leukocytosis", when(df_clean.WBC > 12, 1).otherwise(0)) \
            .withColumn("Severe_Leukocytosis", when(df_clean.WBC > 20, 1).otherwise(0)) \
            .withColumn("Leukopenia", when(df_clean.WBC < 4, 1).otherwise(0)) \
            .withColumn("Hyperglycemia", when(df_clean.Glukoz > 180, 1).otherwise(0)) \
            .withColumn("Age_Oxygen", df_clean.Age * df_clean.Oxygen_saturation / 100) \
            .withColumn("Age_CRP", df_clean.Age * df_clean.CRP / 100) \
            .withColumn("CRP_WBC_Ratio", df_clean.CRP / (df_clean.WBC + 0.1)) \
            .withColumn("CRP_Creatinine", df_clean.CRP * df_clean.Creatinine) \
            .withColumn("Oxygen_BP_Product", df_clean.Oxygen_saturation * (df_clean.Systolic_blood_pressure + 2 * df_clean.Diastolic_blood_pressure) / 300) \
            .withColumn("SIRS_Score", 
                        (when(df_clean.Respiratory_Rate > 20, 1).otherwise(0) +
                         when((df_clean.WBC > 12) | (df_clean.WBC < 4), 1).otherwise(0) +
                         when(df_clean.Pulse_rate > 90, 1).otherwise(0))) \
            .withColumn("qSOFA", 
                        (when(df_clean.Respiratory_Rate >= 22, 1).otherwise(0) +
                         when(df_clean.Systolic_blood_pressure <= 100, 1).otherwise(0))) \
            .withColumn("Critical_Vitals", 
                        when((df_clean.Oxygen_saturation < 90) | 
                             (df_clean.Systolic_blood_pressure < 90), 1).otherwise(0)) \
            .withColumn("Multi_Organ_Failure", 
                        when((df_clean.Creatinine > 2.0) & 
                             (df_clean.Oxygen_saturation < 92), 1).otherwise(0)) \
            .withColumn("Age_Squared", df_clean.Age * df_clean.Age / 1000) \
            .withColumn("SpO2_Squared", df_clean.Oxygen_saturation * df_clean.Oxygen_saturation / 100)
        
        print(f"[INFO] Validation records: {df_features.count()}\n")
        
        # Make predictions
        print("[INFO] Running validation predictions...")
        predictions = model.transform(df_features)
        
        # Evaluate
        print("\n[VALIDATION] ═══════════════════════════════════════")
        print("[VALIDATION] Model Performance on Full Dataset")
        print("[VALIDATION] ═══════════════════════════════════════")
        
        auc = BinaryClassificationEvaluator(
            labelCol="Mortalite", metricName="areaUnderROC"
        ).evaluate(predictions)
        
        accuracy = MulticlassClassificationEvaluator(
            labelCol="Mortalite", predictionCol="prediction", metricName="accuracy"
        ).evaluate(predictions)
        
        print(f"[VALIDATION] ROC-AUC:  {auc:.4f}")
        print(f"[VALIDATION] Accuracy: {accuracy:.4f}")
        
        if accuracy >= 0.85:
            print("[VALIDATION] ✅ Model meets production threshold (>= 0.85)")
        else:
            print("[VALIDATION] ⚠️  Model below production threshold")
        
        print("[VALIDATION] ═══════════════════════════════════════\n")
        
        print("[INFO] Saving validation predictions...")
        predictions.select("Mortalite", "prediction", "probability") \
            .write.mode("overwrite").parquet("data/validation_predictions")
        
        print("[SUCCESS] ✓ Validation complete\n")
        
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        sys.exit(1)
    finally:
        spark.stop()


if __name__ == "__main__":
    validate_model()
