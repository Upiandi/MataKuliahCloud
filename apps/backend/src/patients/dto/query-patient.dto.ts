import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PatientStatus, RiskCategory } from '@prisma/client';

export class QueryPatientDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PatientStatus)
  status?: PatientStatus;

  @IsOptional()
  @IsEnum(RiskCategory)
  risk?: RiskCategory;
}
