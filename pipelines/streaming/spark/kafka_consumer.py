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
    spark = SparkSession.builder.appName("ICU-Sepsis-Streaming-Console").getOrCreate()
    spark.sparkContext.setLogLevel("WARN")

    kafka_df = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", os.getenv("KAFKA_BOOTSTRAP", "localhost:9092"))
        .option("subscribe", os.getenv("KAFKA_TOPIC", "icu_sepsis_stream"))
        .option("startingOffsets", "earliest")
        .load()
    )

    schema = build_schema()
    parsed_df = (
        kafka_df.selectExpr("CAST(value AS STRING) AS json")
        .select(from_json(col("json"), schema).alias("data"))
        .select("data.*")
        .dropna()
    )

    query = (
        parsed_df.writeStream.outputMode("append")
        .format("console")
        .option("truncate", False)
        .option("numRows", 5)
        .start()
    )

    query.awaitTermination()


if __name__ == "__main__":
    main()
