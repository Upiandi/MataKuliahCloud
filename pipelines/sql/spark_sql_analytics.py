import sys
from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, avg, max, min, count, sum as spark_sum,
    when, round as spark_round
)


def create_spark_session():
    """Create Spark session."""
    return SparkSession.builder \
        .appName("ICU_Healthcare_Analytics") \
        .config("spark.sql.adaptive.enabled", "true") \
        .getOrCreate()


def load_and_register_data(spark, parquet_path):
    """Load Parquet data and register as temporary table."""
    print(f"[INFO] Loading data from: {parquet_path}")
    df = spark.read.parquet(parquet_path)
    df.createOrReplaceTempView("icu_patients")
    print(f"[INFO] Registered table 'icu_patients' with {df.count()} records")
    return df


def analytics_mortality_rate(spark):
    """Query 1: Overall mortality rate and demographics."""
    print("\n╔════════════════════════════════════════════════════════╗")
    print("║ ANALYTICS 1: Mortality Rate & Demographics            ║")
    print("╚════════════════════════════════════════════════════════╝")
    
    query = """
    SELECT
        COUNT(*) as total_patients,
        ROUND(AVG(CASE WHEN Mortalite = 1 THEN 100 ELSE 0 END), 2) as mortality_rate_percent,
        ROUND(AVG(Age), 1) as avg_age,
        MIN(Age) as min_age,
        MAX(Age) as max_age,
        COUNT(DISTINCT Gender) as gender_count
    FROM icu_patients
    WHERE Mortalite IN (0, 1)
    """
    
    spark.sql(query).show()


def analytics_vital_by_mortality(spark):
    """Query 2: Vital signs comparison by mortality outcome."""
    print("\n╔════════════════════════════════════════════════════════╗")
    print("║ ANALYTICS 2: Vital Signs by Mortality Outcome        ║")
    print("╚════════════════════════════════════════════════════════╝")
    
    query = """
    SELECT
        CASE WHEN Mortalite = 0 THEN 'Survived' ELSE 'Mortality' END as outcome,
        COUNT(*) as patient_count,
        ROUND(AVG(Pulse_rate), 1) as avg_pulse,
        ROUND(AVG(Respiratory_Rate), 1) as avg_respiratory,
        ROUND(AVG(Systolic_blood_pressure), 1) as avg_sbp,
        ROUND(AVG(Oxygen_saturation), 1) as avg_spo2
    FROM icu_patients
    WHERE Mortalite IN (0, 1)
    GROUP BY Mortalite
    ORDER BY Mortalite
    """
    
    spark.sql(query).show()


def analytics_lab_values_by_mortality(spark):
    """Query 3: Laboratory values comparison."""
    print("\n╔════════════════════════════════════════════════════════╗")
    print("║ ANALYTICS 3: Laboratory Values by Outcome            ║")
    print("╚════════════════════════════════════════════════════════╝")
    
    query = """
    SELECT
        CASE WHEN Mortalite = 0 THEN 'Survived' ELSE 'Mortality' END as outcome,
        ROUND(AVG(CRP), 2) as avg_crp,
        ROUND(AVG(Glukoz), 1) as avg_glucose,
        ROUND(AVG(Creatinine), 2) as avg_creatinine,
        ROUND(AVG(WBC), 1) as avg_wbc
    FROM icu_patients
    WHERE Mortalite IN (0, 1)
    GROUP BY Mortalite
    ORDER BY Mortalite
    """
    
    spark.sql(query).show()


def analytics_age_risk_stratification(spark):
    """Query 4: Age-based risk stratification."""
    print("\n╔════════════════════════════════════════════════════════╗")
    print("║ ANALYTICS 4: Mortality Risk by Age Group             ║")
    print("╚════════════════════════════════════════════════════════╝")
    
    query = """
    SELECT
        CASE
            WHEN Age < 40 THEN '< 40'
            WHEN Age >= 40 AND Age < 60 THEN '40-59'
            WHEN Age >= 60 AND Age < 80 THEN '60-79'
            ELSE '>= 80'
        END as age_group,
        COUNT(*) as total,
        COUNT(CASE WHEN Mortalite = 1 THEN 1 END) as deaths,
        ROUND(100.0 * COUNT(CASE WHEN Mortalite = 1 THEN 1 END) / COUNT(*), 2) as mortality_percent
    FROM icu_patients
    WHERE Mortalite IN (0, 1)
    GROUP BY age_group
    ORDER BY 
        CASE
            WHEN age_group = '< 40' THEN 1
            WHEN age_group = '40-59' THEN 2
            WHEN age_group = '60-79' THEN 3
            ELSE 4
        END
    """
    
    spark.sql(query).show()


def analytics_high_risk_patients(spark):
    """Query 5: Identify high-risk patient profiles."""
    print("\n╔════════════════════════════════════════════════════════╗")
    print("║ ANALYTICS 5: High-Risk Patient Profiles               ║")
    print("╚════════════════════════════════════════════════════════╝")
    
    query = """
    SELECT
        COUNT(*) as high_risk_count,
        ROUND(AVG(Age), 1) as avg_age,
        ROUND(AVG(Pulse_rate), 1) as avg_pulse,
        ROUND(AVG(CRP), 2) as avg_crp,
        ROUND(AVG(Creatinine), 2) as avg_creatinine,
        ROUND(100.0 * SUM(CASE WHEN Mortalite = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as mortality_percent
    FROM icu_patients
    WHERE 
        Mortalite IN (0, 1)
        AND (
            (Pulse_rate > 100)
            OR (Respiratory_Rate > 25)
            OR (CRP > 50)
            OR (Creatinine > 2.5)
            OR (WBC > 15)
        )
    """
    
    spark.sql(query).show()


def analytics_correlation_insights(spark):
    """Query 6: Extreme abnormal values correlation."""
    print("\n╔════════════════════════════════════════════════════════╗")
    print("║ ANALYTICS 6: Severe Abnormalities & Mortality        ║")
    print("╚════════════════════════════════════════════════════════╝")
    
    query = """
    SELECT
        SUM(CASE WHEN Systolic_blood_pressure < 90 THEN 1 ELSE 0 END) as hypotension_count,
        SUM(CASE WHEN Oxygen_saturation < 90 THEN 1 ELSE 0 END) as hypoxia_count,
        SUM(CASE WHEN Creatinine > 2.5 THEN 1 ELSE 0 END) as high_creatinine_count,
        ROUND(100.0 * SUM(CASE WHEN Mortalite = 1 AND Systolic_blood_pressure < 90 THEN 1 ELSE 0 END) / 
              NULLIF(SUM(CASE WHEN Systolic_blood_pressure < 90 THEN 1 ELSE 0 END), 0), 2) as hypotension_mortality_rate,
        ROUND(100.0 * SUM(CASE WHEN Mortalite = 1 AND Oxygen_saturation < 90 THEN 1 ELSE 0 END) / 
              NULLIF(SUM(CASE WHEN Oxygen_saturation < 90 THEN 1 ELSE 0 END), 0), 2) as hypoxia_mortality_rate
    FROM icu_patients
    WHERE Mortalite IN (0, 1)
    """
    
    spark.sql(query).show()


def analytics_statistical_summary(spark):
    """Query 7: Statistical summary of all continuous variables."""
    print("\n╔════════════════════════════════════════════════════════╗")
    print("║ ANALYTICS 7: Statistical Summary of All Variables    ║")
    print("╚════════════════════════════════════════════════════════╝")
    
    spark.sql("""
    SELECT
        'Age' as variable, 
        ROUND(MIN(Age), 2) as min_val, 
        ROUND(MAX(Age), 2) as max_val, 
        ROUND(AVG(Age), 2) as mean_val
    FROM icu_patients
    UNION ALL
    SELECT 
        'Pulse', MIN(Pulse_rate), MAX(Pulse_rate), ROUND(AVG(Pulse_rate), 2)
    FROM icu_patients
    UNION ALL
    SELECT 
        'Respiratory_Rate', MIN(Respiratory_Rate), MAX(Respiratory_Rate), ROUND(AVG(Respiratory_Rate), 2)
    FROM icu_patients
    UNION ALL
    SELECT 
        'CRP', MIN(CRP), MAX(CRP), ROUND(AVG(CRP), 2)
    FROM icu_patients
    UNION ALL
    SELECT 
        'Creatinine', MIN(Creatinine), MAX(Creatinine), ROUND(AVG(Creatinine), 2)
    FROM icu_patients
    """).show()


def main():
    """Main execution."""
    print("╔════════════════════════════════════════════════════════╗")
    print("║ SC3: Spark SQL Analytics                             ║")
    print("║ Healthcare Big Data Analysis - ICU Sepsis             ║")
    print("╚════════════════════════════════════════════════════════╝")
    
    spark = create_spark_session()
    
    parquet_path = "data/curated/icu_stream_parquet"
    
    try:
        # Load data
        load_and_register_data(spark, parquet_path)
        
        # Execute analytics queries
        analytics_mortality_rate(spark)
        analytics_vital_by_mortality(spark)
        analytics_lab_values_by_mortality(spark)
        analytics_age_risk_stratification(spark)
        analytics_high_risk_patients(spark)
        analytics_correlation_insights(spark)
        analytics_statistical_summary(spark)
        
        print("\n[SUCCESS] Analytics completed successfully!")
        
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        sys.exit(1)
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
