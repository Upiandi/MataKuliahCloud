import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertSeverity, PredictionSource, RiskCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from '../risk/risk.service';
import { VitalsInput } from '../risk/risk.engine';

interface VitalSnapshot {
  pulseRate: number;
  respiratoryRate: number;
  systolicBp: number;
  diastolicBp: number;
  oxygenSaturation: number;
  temperature: number;
  crp: number;
  glucose: number;
  creatinine: number;
  wbc: number;
}

// Gentle mean-reversion targets + per-tick volatility per metric. The random walk
// reverts slightly toward these "recovering" targets, adds noise, and occasionally
// fires a deterioration/recovery event — so patients drift across risk thresholds
// over time (the realtime behaviour). Mirrors producer_icu_monitor.py.
const TARGET: VitalSnapshot = {
  pulseRate: 82, respiratoryRate: 17, systolicBp: 118, diastolicBp: 76, oxygenSaturation: 96,
  temperature: 36.9, crp: 20, glucose: 120, creatinine: 1.1, wbc: 9,
};
const STEP: VitalSnapshot = {
  pulseRate: 4, respiratoryRate: 1.5, systolicBp: 5, diastolicBp: 3, oxygenSaturation: 1.2,
  temperature: 0.15, crp: 4, glucose: 8, creatinine: 0.08, wbc: 0.6,
};
const BOUNDS: Record<keyof VitalSnapshot, [number, number]> = {
  pulseRate: [40, 170], respiratoryRate: [8, 45], systolicBp: [60, 200], diastolicBp: [35, 120],
  oxygenSaturation: [70, 100], temperature: [34, 41], crp: [1, 300], glucose: [60, 400],
  creatinine: [0.4, 6], wbc: [1, 35],
};

const SEVERITY_RANK: Record<RiskCategory, number> = { LOW: 0, MODERATE: 1, HIGH: 2 };

@Injectable()
export class SimulatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Simulator');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private risk: RiskService,
    private config: ConfigService,
  ) {}

  onModuleInit(): void {
    const enabled = (this.config.get<string>('SIMULATOR_ENABLED') ?? 'true') !== 'false';
    const interval = parseInt(this.config.get<string>('SIMULATOR_INTERVAL_MS') ?? '8000', 10);
    if (!enabled) {
      this.logger.log('Realtime simulator disabled (SIMULATOR_ENABLED=false).');
      return;
    }
    this.logger.log(`Realtime vitals simulator active — tick every ${interval}ms.`);
    this.timer = setInterval(() => void this.tick(), interval);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One simulation step: advance every admitted patient's vitals + risk. */
  private async tick(): Promise<void> {
    if (this.running) return; // skip if a previous tick is still in flight
    this.running = true;
    try {
      const patients = await this.prisma.patient.findMany({
        where: { status: 'ADMITTED' },
        include: {
          vitals: { orderBy: { recordedAt: 'desc' }, take: 1 },
          predictions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      for (const p of patients) {
        const current = this.toSnapshot(p.vitals[0]);
        const next = this.advance(current);
        const input: VitalsInput = { ...next, age: p.age };
        const assessment = this.risk.assess(input);
        const prevCategory = p.predictions[0]?.riskCategory ?? null;

        await this.prisma.$transaction(async (tx) => {
          const vital = await tx.vitalSign.create({
            data: {
              patientId: p.id,
              ...next,
              map: assessment.map,
              shockIndex: assessment.shockIndex,
              sirsScore: assessment.sirsScore,
              qsofa: assessment.qsofa,
              newsScore: assessment.newsScore,
            },
          });

          const prediction = await tx.prediction.create({
            data: {
              patientId: p.id,
              vitalSignId: vital.id,
              source: PredictionSource.RULE_BASED,
              riskCategory: assessment.riskCategory,
              probability: assessment.probability,
              sirsScore: assessment.sirsScore,
              qsofa: assessment.qsofa,
              modelVersion: 'simulator-v1',
            },
          });

          // Raise alerts only when risk ESCALATES vs the prior reading — avoids flooding.
          if (prevCategory === null || SEVERITY_RANK[assessment.riskCategory] > SEVERITY_RANK[prevCategory]) {
            const derived = this.risk.alertsFor(input, assessment);
            if (derived.length > 0) {
              await tx.alert.createMany({
                data: derived.map((a) => ({
                  patientId: p.id,
                  predictionId: prediction.id,
                  severity: a.severity as AlertSeverity,
                  type: a.type,
                  message: a.message,
                })),
              });
            }
          }
        });
      }
    } catch (err) {
      this.logger.error(`Simulator tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private toSnapshot(v?: {
    pulseRate: number; respiratoryRate: number; systolicBp: number; diastolicBp: number;
    oxygenSaturation: number; temperature: number | null; crp: number | null; glucose: number | null;
    creatinine: number | null; wbc: number | null;
  }): VitalSnapshot {
    if (!v) return { ...TARGET };
    return {
      pulseRate: v.pulseRate,
      respiratoryRate: v.respiratoryRate,
      systolicBp: v.systolicBp,
      diastolicBp: v.diastolicBp,
      oxygenSaturation: v.oxygenSaturation,
      temperature: v.temperature ?? TARGET.temperature,
      crp: v.crp ?? TARGET.crp,
      glucose: v.glucose ?? TARGET.glucose,
      creatinine: v.creatinine ?? TARGET.creatinine,
      wbc: v.wbc ?? TARGET.wbc,
    };
  }

  /** Random-walk one snapshot forward, then maybe apply a clinical event. */
  private advance(cur: VitalSnapshot): VitalSnapshot {
    const next = {} as VitalSnapshot;
    (Object.keys(cur) as (keyof VitalSnapshot)[]).forEach((k) => {
      const reverted = cur[k] + (TARGET[k] - cur[k]) * 0.12;
      const noisy = reverted + (Math.random() * 2 - 1) * STEP[k];
      next[k] = this.clamp(k, noisy);
    });

    const roll = Math.random();
    if (roll < 0.12) {
      // deterioration
      next.oxygenSaturation = this.clamp('oxygenSaturation', next.oxygenSaturation - this.rand(5, 15));
      next.systolicBp = this.clamp('systolicBp', next.systolicBp - this.rand(10, 30));
      next.pulseRate = this.clamp('pulseRate', next.pulseRate + this.rand(8, 20));
      next.respiratoryRate = this.clamp('respiratoryRate', next.respiratoryRate + this.rand(3, 8));
      next.crp = this.clamp('crp', next.crp + this.rand(10, 40));
    } else if (roll < 0.24) {
      // recovery
      next.oxygenSaturation = this.clamp('oxygenSaturation', next.oxygenSaturation + this.rand(3, 8));
      next.systolicBp = this.clamp('systolicBp', next.systolicBp + this.rand(5, 15));
      next.pulseRate = this.clamp('pulseRate', next.pulseRate - this.rand(5, 12));
    }
    return next;
  }

  private clamp(key: keyof VitalSnapshot, value: number): number {
    const [min, max] = BOUNDS[key];
    return Math.round(Math.max(min, Math.min(max, value)) * 10) / 10;
  }

  private rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
