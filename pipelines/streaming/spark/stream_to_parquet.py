import os

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, from_json
from pyspark.sql.types import DoubleType, IntegerType, StructField, StructType


def build_schema() -> StructType:
    return StructType([
        StructField("Age", IntegerType()),
        StructField("Gender", IntegerType()),
        StructField("Length_of_stay_in_intensive_care", IntegerType()),
        StructField("Mortalite", IntegerType()),
        StructField("Pulse_rate", DoubleType()),
        StructField("Respiratory_Rate", DoubleType()),
        StructField("Systolic_blood_pressure", DoubleType()),
        StructField("Diastolic_blood_pressure", DoubleType()),
        StructField("Oxygen_saturation", DoubleType()),
        StructField("CRP", DoubleType()),
        StructField("Glukoz", DoubleType()),
        StructField("Creatinine", DoubleType()),
        StructField("WBC", DoubleType()),
    ])


def main() -> None:
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    curated_dir = os.path.join(base_dir, "data", "curated", "icu_stream_parquet")
    checkpoint_dir = os.path.join(base_dir, "data", "curated", "checkpoints", "icu_stream")

    spark = SparkSession.builder.appName("ICU-Sepsis-Stream-To-Parquet").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")

    schema = build_schema()

    kafka_df = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", os.getenv("KAFKA_BOOTSTRAP", "localhost:9092"))
        .option("subscribe", os.getenv("KAFKA_TOPIC", "icu_sepsis_stream"))
        .option("startingOffsets", "earliest")
        .load()
    )

    parsed_df = (
        kafka_df.selectExpr("CAST(value AS STRING) AS json")
        .select(from_json(col("json"), schema).alias("data"))
        .select("data.*")
        .dropna()
    )

    query = (
        parsed_df.writeStream.outputMode("append")
        .format("parquet")
        .option("path", curated_dir)
        .option("checkpointLocation", checkpoint_dir)
        .queryName("icu_sepsis_to_parquet")
        .start()
    )

    query.awaitTermination()


if __name__ == "__main__":
    main()
