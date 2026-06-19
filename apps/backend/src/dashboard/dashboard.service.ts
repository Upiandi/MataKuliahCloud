import { Injectable } from '@nestjs/common';
import { PatientStatus, RiskCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary() {
    const patients = await this.prisma.patient.findMany({
      where: { status: PatientStatus.ADMITTED },
      include: { predictions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const risk = { HIGH: 0, MODERATE: 0, LOW: 0, UNKNOWN: 0 };
    let monitored = 0;
    for (const p of patients) {
      const latest = p.predictions[0];
      if (!latest) {
        risk.UNKNOWN++;
        continue;
      }
      monitored++;
      risk[latest.riskCategory] += 1;
    }

    const [openAlerts, criticalAlerts, predictionCount, mlPredictionCount] = await Promise.all([
      this.prisma.alert.count({ where: { acknowledged: false } }),
      this.prisma.alert.count({ where: { acknowledged: false, severity: 'CRITICAL' } }),
      this.prisma.prediction.count(),
      this.prisma.prediction.count({ where: { source: 'ML_PIPELINE' } }),
    ]);

    return {
      totalPatients: patients.length,
      monitored,
      risk,
      openAlerts,
      criticalAlerts,
      predictionCount,
      mlPredictionCount,
    };
  }

  /** Patients whose latest prediction is HIGH (or MODERATE), most urgent first. */
  async watchlist(limit = 8) {
    const patients = await this.prisma.patient.findMany({
      where: { status: PatientStatus.ADMITTED },
      include: {
        predictions: { orderBy: { createdAt: 'desc' }, take: 1 },
        vitals: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
    });

    return patients
      .map((p) => ({
        id: p.id,
        name: p.name,
        mrn: p.mrn,
        ward: p.ward,
        bed: p.bed,
        age: p.age,
        riskCategory: p.predictions[0]?.riskCategory ?? null,
        probability: p.predictions[0]?.probability ?? 0,
        latestVital: p.vitals[0] ?? null,
      }))
      .filter((p) => p.riskCategory === RiskCategory.HIGH || p.riskCategory === RiskCategory.MODERATE)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, limit);
  }
}
