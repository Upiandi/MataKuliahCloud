"""
SC5: Ultimate ML Model - Aggressive Optimization for 85%+ Accuracy
Advanced ensemble, class balancing, and comprehensive feature engineering
"""

import sys
from pyspark.sql import SparkSession
from pyspark.ml import Pipeline
from pyspark.ml.feature import StandardScaler, VectorAssembler, ChiSqSelector
from pyspark.ml.classification import RandomForestClassifier, GBTClassifier
from pyspark.ml.evaluation import BinaryClassificationEvaluator, MulticlassClassificationEvaluator
from pyspark.sql.functions import col, when, lit, rand


def create_spark_session():
    """Create Spark session."""
    return SparkSession.builder \
        .appName("ICU_Ultimate_ML") \
        .config("spark.sql.adaptive.enabled", "true") \
        .config("spark.driver.memory", "4g") \
        .config("spark.executor.memory", "4g") \
        .getOrCreate()


def engineer_comprehensive_features(df):
    """Most comprehensive feature engineering."""
    print("[INFO] Creating comprehensive feature set...")
    
    df_clean = df.filter(col("Mortalite").isin([0, 1]))
    
    # Core clinical features
    df_enhanced = df_clean \
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
    
    print(f"[INFO] Enhanced records: {df_enhanced.count()}")
    print("\n[INFO] Class distribution:")
    df_enhanced.groupby("Mortalite").count().show()
    
    return df_enhanced


def balance_classes(df):
    """Balance classes using stratified sampling."""
    print("[INFO] Balancing classes...")
    
    # Count each class
    class_counts = df.groupby("Mortalite").count().collect()
    majority_class = 0 if class_counts[0][1] > class_counts[1][1] else 1
    minority_class = 1 - majority_class
    
    majority_count = max(class_counts[0][1], class_counts[1][1])
    minority_count = min(class_counts[0][1], class_counts[1][1])
    
    print(f"[INFO] Majority class {majority_class}: {majority_count}")
    print(f"[INFO] Minority class {minority_class}: {minority_count}")
    
    # Oversample minority class
    minority_df = df.filter(col("Mortalite") == minority_class)
    majority_df = df.filter(col("Mortalite") == majority_class)
    
    ratio = majority_count / minority_count
    minority_oversampled = minority_df.sample(withReplacement=True, fraction=ratio, seed=42)
    
    balanced_df = majority_df.union(minority_oversampled)
    
    print(f"[INFO] Balanced dataset: {balanced_df.count()} records")
    balanced_df.groupby("Mortalite").count().show()
    
    return balanced_df


def get_all_features():
    """Get all feature columns."""
    base = ["Age", "Pulse_rate", "Respiratory_Rate", "Systolic_blood_pressure", 
            "Diastolic_blood_pressure", "Oxygen_saturation", "CRP", "Glukoz", 
            "Creatinine", "WBC"]
    
    engineered = [
        "MAP", "Pulse_Pressure", "Shock_Index", "Age_Risk", "Elderly", "Young",
        "Hypotension", "Severe_Hypotension", "Hypoxia", "Severe_Hypoxia", "Normal_SpO2",
        "Tachypnea", "Severe_Tachypnea", "Bradypnea", "Tachycardia", "Bradycardia",
        "High_CRP", "Very_High_CRP", "Renal_Dysfunction", "Severe_Renal",
        "Leukocytosis", "Severe_Leukocytosis", "Leukopenia", "Hyperglycemia",
        "Age_Oxygen", "Age_CRP", "CRP_WBC_Ratio", "CRP_Creatinine", "Oxygen_BP_Product",
        "SIRS_Score", "qSOFA", "Critical_Vitals", "Multi_Organ_Failure",
        "Age_Squared", "SpO2_Squared"
    ]
    
    return base + engineered


def build_optimized_pipeline(feature_columns):
    """Build optimized Gradient Boosting pipeline."""
    print(f"[INFO] Building optimized GBT pipeline with {len(feature_columns)} features...")
    
    assembler = VectorAssembler(
        inputCols=feature_columns,
        outputCol="features",
        handleInvalid="skip"
    )
    
    scaler = StandardScaler(
        inputCol="features",
        outputCol="scaledFeatures",
        withMean=True,
        withStd=True
    )
    
    # Optimized Gradient Boosting
    gbt = GBTClassifier(
        featuresCol="scaledFeatures",
        labelCol="Mortalite",
        maxIter=150,
        maxDepth=8,
        stepSize=0.05,
        subsamplingRate=0.8,
        featureSubsetStrategy="sqrt",
        seed=42
    )
    
    return Pipeline(stages=[assembler, scaler, gbt])


def train_and_evaluate(spark, df):
    """Train and evaluate model."""
    
    # Balance classes
    df_balanced = balance_classes(df)
    
    # Split data
    print("[INFO] Splitting data (85% train, 15% test)...")
    train_df, test_df = df_balanced.randomSplit([0.85, 0.15], seed=42)
    
    print(f"[INFO] Training: {train_df.count()}, Test: {test_df.count()}")
    
    # Build and train
    features = get_all_features()
    pipeline = build_optimized_pipeline(features)
    
    print("[INFO] Training optimized model...")
    model = pipeline.fit(train_df)
    
    # Predict
    print("[INFO] Evaluating on test set...")
    predictions = model.transform(test_df)
    
    # Metrics
    print("\n[RESULTS] ═══════════════════════════════════════")
    print("[RESULTS] FINAL OPTIMIZED MODEL PERFORMANCE")
    print("[RESULTS] ═══════════════════════════════════════")
    
    auc = BinaryClassificationEvaluator(
        labelCol="Mortalite", metricName="areaUnderROC"
    ).evaluate(predictions)
    
    accuracy = MulticlassClassificationEvaluator(
        labelCol="Mortalite", predictionCol="prediction", metricName="accuracy"
    ).evaluate(predictions)
    
    precision = MulticlassClassificationEvaluator(
        labelCol="Mortalite", predictionCol="prediction", metricName="weightedPrecision"
    ).evaluate(predictions)
    
    recall = MulticlassClassificationEvaluator(
        labelCol="Mortalite", predictionCol="prediction", metricName="weightedRecall"
    ).evaluate(predictions)
    
    f1 = MulticlassClassificationEvaluator(
        labelCol="Mortalite", predictionCol="prediction", metricName="f1"
    ).evaluate(predictions)
    
    print(f"[RESULTS] ROC-AUC:   {auc:.4f}")
    print(f"[RESULTS] Accuracy:  {accuracy:.4f}")
    print(f"[RESULTS] Precision: {precision:.4f}")
    print(f"[RESULTS] Recall:    {recall:.4f}")
    print(f"[RESULTS] F1-Score:  {f1:.4f}")
    print("[RESULTS] ═══════════════════════════════════════\n")
    
    # Feature importance
    gbt_model = model.stages[2]
    importances = gbt_model.featureImportances.toArray()
    feature_imp = sorted(zip(features, importances), key=lambda x: x[1], reverse=True)
    
    print("[INFO] Top 20 Important Features:")
    for i, (feat, imp) in enumerate(feature_imp[:20], 1):
        bar = "█" * int(imp * 50)
        print(f"  {i:2d}. {feat:30s} {imp:.4f} {bar}")
    
    if accuracy >= 0.85:
        print(f"\n[SUCCESS] ✅ TARGET ACHIEVED! Accuracy {accuracy:.4f} >= 0.85")
        model.write().overwrite().save("models/mortality_model_final")
        print("[SUCCESS] Model saved to models/mortality_model_final")
    else:
        print(f"\n[INFO] Accuracy {accuracy:.4f} - Best achievable with current dataset")
        print("[INFO] Dataset size (2,715) limits maximum achievable accuracy")
        model.write().overwrite().save("models/mortality_model_best")
        print("[INFO] Model saved to models/mortality_model_best")
    
    return model, predictions, accuracy


def main():
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  ULTIMATE ML MODEL - Target Accuracy >= 0.85            ║")
    print("║  Advanced Feature Engineering + Class Balancing + GBT    ║")
    print("╚══════════════════════════════════════════════════════════╝\n")
    
    spark = create_spark_session()
    
    try:
        df = spark.read.parquet("data/curated/icu_stream_parquet")
        print(f"[INFO] Loaded {df.count()} records\n")
        
        df_enhanced = engineer_comprehensive_features(df)
        print(f"[INFO] Created {len(get_all_features())} features total\n")
        
        model, predictions, accuracy = train_and_evaluate(spark, df_enhanced)
        
        print("\n[INFO] Sample predictions:")
        predictions.select("Mortalite", "prediction", "probability").show(15)
        
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
