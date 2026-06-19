import { Injectable } from '@nestjs/common';
import { AlertSeverity, Gender, PredictionSource, RiskCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SyncPredictionItemDto, SyncPredictionsDto } from './dto/sync-predictions.dto';

@Injectable()
export class PredictionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Hybrid ingest: accept a batch of predictions from the Spark/parquet ML
   * pipeline, matching patients by MRN (auto-provisioning unknown ones), and
   * persisting them with source = ML_PIPELINE. High-risk items raise an alert.
   */
  async sync(dto: SyncPredictionsDto) {
    let created = 0;
    let provisioned = 0;
    let alerted = 0;

    for (const item of dto.items) {
      const { patientId, isNew } = await this.resolvePatient(item);
      if (isNew) provisioned++;

      const prediction = await this.prisma.prediction.create({
        data: {
          patientId,
          source: PredictionSource.ML_PIPELINE,
          riskCategory: item.riskCategory,
          probability: item.probability,
          sirsScore: item.sirsScore,
          qsofa: item.qsofa,
          modelVersion: item.modelVersion ?? 'ml-pipeline',
          createdAt: this.parseDate(item.recordedAt),
        },
      });
      created++;

      if (item.riskCategory === RiskCategory.HIGH) {
        await this.prisma.alert.create({
          data: {
            patientId,
            predictionId: prediction.id,
            severity: AlertSeverity.CRITICAL,
            type: 'ML_HIGH_RISK',
            message: `Model ML memprediksi risiko tinggi (${(item.probability * 100).toFixed(0)}%).`,
          },
        });
        alerted++;
      }
    }

    return { ok: true, received: dto.items.length, created, provisioned, alerted };
  }

  recent(limit = 50) {
    return this.prisma.prediction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { patient: { select: { id: true, name: true, mrn: true } } },
    });
  }

  private async resolvePatient(item: SyncPredictionItemDto): Promise<{ patientId: string; isNew: boolean }> {
    const existing = await this.prisma.patient.findUnique({ where: { mrn: item.mrn }, select: { id: true } });
    if (existing) return { patientId: existing.id, isNew: false };

    const patient = await this.prisma.patient.create({
      data: {
        mrn: item.mrn,
        name: item.name ?? `Pasien ${item.mrn}`,
        age: item.age ?? 60,
        gender: item.gender ?? Gender.OTHER,
        ward: 'ICU',
      },
    });
    return { patientId: patient.id, isNew: true };
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
}
