import { Module } from '@nestjs/common';
import { SimulatorService } from './simulator.service';
import { RiskModule } from '../risk/risk.module';

/**
 * Built-in realtime mode: drives changing vitals/risk without Kafka/Spark.
 * Disable (SIMULATOR_ENABLED=false) when feeding data from the real streaming
 * pipeline via pipelines/bridge/sync_predictions.py instead.
 */
@Module({
  imports: [RiskModule],
  providers: [SimulatorService],
})
export class SimulatorModule {}
