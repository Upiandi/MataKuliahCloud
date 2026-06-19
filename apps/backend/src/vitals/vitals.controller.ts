import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { VitalsService } from './vitals.service';
import { CreateVitalDto } from './dto/create-vital.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('patients/:patientId/vitals')
export class VitalsController {
  constructor(private readonly vitals: VitalsService) {}

  @Get()
  list(@Param('patientId') patientId: string) {
    return this.vitals.findByPatient(patientId);
  }

  @Post()
  record(
    @Param('patientId') patientId: string,
    @Body() dto: CreateVitalDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.vitals.record(patientId, dto, userId);
  }
}
