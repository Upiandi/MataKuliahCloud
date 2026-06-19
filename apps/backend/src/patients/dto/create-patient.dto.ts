import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Gender, PatientStatus } from '@prisma/client';

export class CreatePatientDto {
  @IsString()
  mrn: string;

  @IsString()
  name: string;

  @IsInt()
  @Min(0)
  @Max(120)
  age: number;

  @IsEnum(Gender)
  gender: Gender;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsOptional()
  @IsString()
  bed?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  lengthOfStay?: number;

  @IsOptional()
  @IsEnum(PatientStatus)
  status?: PatientStatus;
}
