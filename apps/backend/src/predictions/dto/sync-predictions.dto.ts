import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Gender, RiskCategory } from '@prisma/client';

export class SyncPredictionItemDto {
  /** Medical record number used to match (or provision) the patient. */
  @IsString()
  mrn: string;

  @IsEnum(RiskCategory)
  riskCategory: RiskCategory;

  @IsNumber()
  @Min(0)
  @Max(1)
  probability: number;

  @IsOptional()
  @IsInt()
  sirsScore?: number;

  @IsOptional()
  @IsInt()
  qsofa?: number;

  @IsOptional()
  @IsString()
  modelVersion?: string;

  @IsOptional()
  @IsString()
  recordedAt?: string;

  // Optional demographics so an unknown patient can be auto-provisioned.
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  age?: number;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}

export class SyncPredictionsDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SyncPredictionItemDto)
  items: SyncPredictionItemDto[];
}
