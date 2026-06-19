import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { QueryPatientDto } from './dto/query-patient.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  findAll(@Query() query: QueryPatientDto) {
    return this.patients.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.patients.findOne(id);
  }

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.patients.remove(id);
  }
}
