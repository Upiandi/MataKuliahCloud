import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsEmail({}, { message: 'Email tidak valid.' })
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(6, { message: 'Password minimal 6 karakter.' })
  password: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
