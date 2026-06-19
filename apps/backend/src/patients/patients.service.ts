import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RiskCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { QueryPatientDto } from './dto/query-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryPatientDto) {
    const where: Prisma.PatientWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { mrn: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const patients = await this.prisma.patient.findMany({
      where,
      orderBy: { admittedAt: 'desc' },
      include: {
        predictions: { orderBy: { createdAt: 'desc' }, take: 1 },
        vitals: { orderBy: { recordedAt: 'desc' }, take: 1 },
        _count: { select: { alerts: { where: { acknowledged: false } } } },
      },
    });

    const mapped = patients.map((p) => this.toSummary(p));
    // risk filter is applied on the derived latest prediction
    return query.risk ? mapped.filter((p) => p.riskCategory === query.risk) : mapped;
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        predictions: { orderBy: { createdAt: 'desc' }, take: 20 },
        vitals: { orderBy: { recordedAt: 'desc' }, take: 50, include: { recordedBy: { select: { name: true } } } },
        alerts: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!patient) throw new NotFoundException('Pasien tidak ditemukan.');
    return patient;
  }

  async create(dto: CreatePatientDto) {
    return this.prisma.patient.create({ data: dto });
  }

  async update(id: string, dto: UpdatePatientDto) {
    await this.ensureExists(id);
    return this.prisma.patient.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.patient.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.patient.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Pasien tidak ditemukan.');
  }

  /** Flatten a patient + its latest prediction/vital into a list-friendly summary. */
  private toSummary(p: any) {
    const latestPrediction = p.predictions?.[0] ?? null;
    const latestVital = p.vitals?.[0] ?? null;
    return {
      id: p.id,
      mrn: p.mrn,
      name: p.name,
      age: p.age,
      gender: p.gender,
      ward: p.ward,
      bed: p.bed,
      status: p.status,
      lengthOfStay: p.lengthOfStay,
      admittedAt: p.admittedAt,
      riskCategory: (latestPrediction?.riskCategory ?? null) as RiskCategory | null,
      probability: latestPrediction?.probability ?? null,
      lastVitalAt: latestVital?.recordedAt ?? null,
      latestVital,
      openAlerts: p._count?.alerts ?? 0,
    };
  }
}
