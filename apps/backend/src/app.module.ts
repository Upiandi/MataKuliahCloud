import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { VitalsModule } from './vitals/vitals.module';
import { RiskModule } from './risk/risk.module';
import { PredictionsModule } from './predictions/predictions.module';
import { AlertsModule } from './alerts/alerts.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SimulatorModule } from './simulator/simulator.module';
import { HealthController } from './health.controller';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    PatientsModule,
    VitalsModule,
    RiskModule,
    PredictionsModule,
    AlertsModule,
    DashboardModule,
    SimulatorModule,
  ],
  controllers: [HealthController],
  providers: [
    // JWT first (authenticates), then roles (authorizes).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
