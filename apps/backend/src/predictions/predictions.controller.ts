import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { PredictionsService } from './predictions.service';
import { SyncPredictionsDto } from './dto/sync-predictions.dto';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('predictions')
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}

  @Get()
  recent(@Query('limit') limit?: string) {
    return this.predictions.recent(limit ? parseInt(limit, 10) : 50);
  }

  /** Machine-to-machine ingest from the ML pipeline (x-api-key, not JWT). */
  @Public()
  @UseGuards(ApiKeyGuard)
  @Post('sync')
  sync(@Body() dto: SyncPredictionsDto) {
    return this.predictions.sync(dto);
  }
}
