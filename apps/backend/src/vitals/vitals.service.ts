import { Injectable, NotFoundException } from '@nestjs/common';
import { PredictionSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RiskService } from '../risk/risk.service';
import { CreateVitalDto } from './dto/create-vital.dto';

@Injectable()
export class VitalsService {
  constructor(
    private prisma: PrismaService,
    private risk: RiskService,
  ) {}

  /**
   * Record a vitals snapshot, then (atomically) compute the rule-based risk
   * assessment, persist a Prediction, and raise any derived Alerts.
   */
  async record(patientId: string, dto: CreateVitalDto, recordedById?: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, age: true },
    });
    if (!patient) throw new NotFoundException('Pasien tidak ditemukan.');

    const assessment = this.risk.assess({ ...dto, age: patient.age });
    const derivedAlerts = this.risk.alertsFor({ ...dto, age: patient.age }, assessment);

    return this.prisma.$transaction(async (tx) => {
      const vital = await tx.vitalSign.create({
        data: {
          patientId,
          recordedById,
          pulseRate: dto.pulseRate,
          respiratoryRate: dto.respiratoryRate,
          systolicBp: dto.systolicBp,
          diastolicBp: dto.diastolicBp,
          oxygenSaturation: dto.oxygenSaturation,
          temperature: dto.temperature,
          crp: dto.crp,
          glucose: dto.glucose,
          creatinine: dto.creatinine,
          wbc: dto.wbc,
          map: assessment.map,
          shockIndex: assessment.shockIndex,
          sirsScore: assessment.sirsScore,
          qsofa: assessment.qsofa,
          newsScore: assessment.newsScore,
        },
      });

      const prediction = await tx.prediction.create({
        data: {
          patientId,
          vitalSignId: vital.id,
          source: PredictionSource.RULE_BASED,
          riskCategory: assessment.riskCategory,
          probability: assessment.probability,
          sirsScore: assessment.sirsScore,
          qsofa: assessment.qsofa,
          modelVersion: 'rule-engine-v1',
        },
      });

      if (derivedAlerts.length > 0) {
        await tx.alert.createMany({
          data: derivedAlerts.map((a) => ({
            patientId,
            predictionId: prediction.id,
            severity: a.severity,
            type: a.type,
            message: a.message,
          })),
        });
      }

      return { vital, prediction, alerts: derivedAlerts, assessment };
    });
  }

  findByPatient(patientId: string, limit = 100) {
    return this.prisma.vitalSign.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'asc' },
      take: limit,
    });
  }
}
