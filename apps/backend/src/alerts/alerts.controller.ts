import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  findAll(@Query('acknowledged') acknowledged?: string) {
    const ack = acknowledged === undefined ? undefined : acknowledged === 'true';
    return this.alerts.findAll(ack);
  }

  @Patch(':id/acknowledge')
  acknowledge(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.alerts.acknowledge(id, userId);
  }
}
