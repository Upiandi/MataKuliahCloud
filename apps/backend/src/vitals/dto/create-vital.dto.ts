import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateVitalDto {
  @IsNumber()
  @Min(0)
  @Max(300)
  pulseRate: number;

  @IsNumber()
  @Min(0)
  @Max(80)
  respiratoryRate: number;

  @IsNumber()
  @Min(0)
  @Max(300)
  systolicBp: number;

  @IsNumber()
  @Min(0)
  @Max(200)
  diastolicBp: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  oxygenSaturation: number;

  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(45)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  crp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  glucose?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creatinine?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wbc?: number;
}
