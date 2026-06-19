import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  findAll(acknowledged?: boolean, limit = 100) {
    const where: Prisma.AlertWhereInput = {};
    if (acknowledged !== undefined) where.acknowledged = acknowledged;

    return this.prisma.alert.findMany({
      where,
      orderBy: [{ acknowledged: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      include: { patient: { select: { id: true, name: true, mrn: true, ward: true, bed: true } } },
    });
  }

  async acknowledge(id: string, userId: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert tidak ditemukan.');

    return this.prisma.alert.update({
      where: { id },
      data: { acknowledged: true, acknowledgedById: userId, acknowledgedAt: new Date() },
    });
  }
}
