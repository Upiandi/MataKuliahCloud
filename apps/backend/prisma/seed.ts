/**
 * Seed script — provisions demo users and a ward of ICU patients with realistic
 * vital-sign time series. Each reading is scored by the SAME clinical risk
 * engine the API uses, then persisted as a Prediction (+ derived Alerts).
 *
 * Run: npm run prisma:seed   (configured as the Prisma seed command)
 */
import { PrismaClient, Gender, Role, PatientStatus, PredictionSource } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { assessVitals, deriveAlerts, VitalsInput } from '../src/risk/risk.engine';

const prisma = new PrismaClient();

// --- deterministic PRNG (mulberry32) so the demo data is reproducible ---
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260606);
const rand = (min: number, max: number) => min + rng() * (max - min);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Archetype = 'stable' | 'recovering' | 'moderate' | 'deteriorating' | 'critical';

interface VitalEnvelope {
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

// Start/end envelopes per archetype (clinical ranges informed by the dataset thresholds).
const ENVELOPES: Record<Archetype, { start: VitalEnvelope; end: VitalEnvelope }> = {
  stable: {
    start: { pulseRate: 78, respiratoryRate: 16, systolicBp: 122, diastolicBp: 78, oxygenSaturation: 98, temperature: 36.8, crp: 8, glucose: 110, creatinine: 0.9, wbc: 7.5 },
    end: { pulseRate: 76, respiratoryRate: 15, systolicBp: 124, diastolicBp: 79, oxygenSaturation: 98, temperature: 36.7, crp: 6, glucose: 105, creatinine: 0.9, wbc: 7.2 },
  },
  recovering: {
    start: { pulseRate: 104, respiratoryRate: 22, systolicBp: 102, diastolicBp: 66, oxygenSaturation: 93, temperature: 38.1, crp: 95, glucose: 165, creatinine: 1.6, wbc: 14 },
    end: { pulseRate: 84, respiratoryRate: 17, systolicBp: 118, diastolicBp: 74, oxygenSaturation: 97, temperature: 37.0, crp: 40, glucose: 125, creatinine: 1.1, wbc: 9 },
  },
  moderate: {
    start: { pulseRate: 92, respiratoryRate: 19, systolicBp: 112, diastolicBp: 72, oxygenSaturation: 95, temperature: 37.6, crp: 55, glucose: 150, creatinine: 1.3, wbc: 12.5 },
    end: { pulseRate: 100, respiratoryRate: 23, systolicBp: 104, diastolicBp: 67, oxygenSaturation: 93, temperature: 38.0, crp: 78, glucose: 168, creatinine: 1.5, wbc: 13.8 },
  },
  deteriorating: {
    start: { pulseRate: 96, respiratoryRate: 20, systolicBp: 110, diastolicBp: 70, oxygenSaturation: 95, temperature: 37.8, crp: 70, glucose: 160, creatinine: 1.4, wbc: 13 },
    end: { pulseRate: 124, respiratoryRate: 30, systolicBp: 86, diastolicBp: 54, oxygenSaturation: 88, temperature: 39.0, crp: 140, glucose: 205, creatinine: 2.3, wbc: 19 },
  },
  critical: {
    start: { pulseRate: 118, respiratoryRate: 28, systolicBp: 92, diastolicBp: 58, oxygenSaturation: 90, temperature: 38.7, crp: 130, glucose: 195, creatinine: 2.1, wbc: 18 },
    end: { pulseRate: 134, respiratoryRate: 34, systolicBp: 78, diastolicBp: 48, oxygenSaturation: 84, temperature: 39.4, crp: 180, glucose: 230, creatinine: 3.0, wbc: 22 },
  },
};

function vitalsAt(arch: Archetype, t: number): VitalEnvelope {
  const { start, end } = ENVELOPES[arch];
  const jitter = (base: number, pct: number) => base * (1 + rand(-pct, pct));
  return {
    pulseRate: round1(clamp(jitter(lerp(start.pulseRate, end.pulseRate, t), 0.04), 35, 180)),
    respiratoryRate: round1(clamp(jitter(lerp(start.respiratoryRate, end.respiratoryRate, t), 0.05), 8, 45)),
    systolicBp: round1(clamp(jitter(lerp(start.systolicBp, end.systolicBp, t), 0.04), 60, 200)),
    diastolicBp: round1(clamp(jitter(lerp(start.diastolicBp, end.diastolicBp, t), 0.04), 35, 120)),
    oxygenSaturation: round1(clamp(jitter(lerp(start.oxygenSaturation, end.oxygenSaturation, t), 0.015), 70, 100)),
    temperature: round1(clamp(jitter(lerp(start.temperature, end.temperature, t), 0.01), 34, 41)),
    crp: round1(clamp(jitter(lerp(start.crp, end.crp, t), 0.08), 1, 300)),
    glucose: round1(clamp(jitter(lerp(start.glucose, end.glucose, t), 0.06), 60, 400)),
    creatinine: round1(clamp(jitter(lerp(start.creatinine, end.creatinine, t), 0.06), 0.4, 6)),
    wbc: round1(clamp(jitter(lerp(start.wbc, end.wbc, t), 0.07), 1, 35)),
  };
}

interface PatientSpec {
  name: string;
  age: number;
  gender: Gender;
  bed: string;
  lengthOfStay: number;
  archetype: Archetype;
  readings: number;
}

const PATIENTS: PatientSpec[] = [
  { name: 'Budi Santoso', age: 67, gender: Gender.MALE, bed: 'ICU-01', lengthOfStay: 4, archetype: 'deteriorating', readings: 10 },
  { name: 'Siti Aminah', age: 72, gender: Gender.FEMALE, bed: 'ICU-02', lengthOfStay: 6, archetype: 'critical', readings: 10 },
  { name: 'Agus Pranoto', age: 58, gender: Gender.MALE, bed: 'ICU-03', lengthOfStay: 2, archetype: 'moderate', readings: 9 },
  { name: 'Dewi Lestari', age: 45, gender: Gender.FEMALE, bed: 'ICU-04', lengthOfStay: 3, archetype: 'recovering', readings: 9 },
  { name: 'Joko Widodo', age: 63, gender: Gender.MALE, bed: 'ICU-05', lengthOfStay: 1, archetype: 'stable', readings: 8 },
  { name: 'Rina Marlina', age: 81, gender: Gender.FEMALE, bed: 'ICU-06', lengthOfStay: 7, archetype: 'deteriorating', readings: 10 },
  { name: 'Hendra Gunawan', age: 54, gender: Gender.MALE, bed: 'ICU-07', lengthOfStay: 2, archetype: 'moderate', readings: 8 },
  { name: 'Maya Sari', age: 39, gender: Gender.FEMALE, bed: 'ICU-08', lengthOfStay: 5, archetype: 'recovering', readings: 9 },
  { name: 'Bambang Sutrisno', age: 70, gender: Gender.MALE, bed: 'ICU-09', lengthOfStay: 8, archetype: 'critical', readings: 10 },
  { name: 'Nurul Hidayah', age: 49, gender: Gender.FEMALE, bed: 'ICU-10', lengthOfStay: 1, archetype: 'stable', readings: 7 },
  { name: 'Eko Prasetyo', age: 60, gender: Gender.MALE, bed: 'ICU-11', lengthOfStay: 3, archetype: 'moderate', readings: 8 },
  { name: 'Lina Wati', age: 75, gender: Gender.FEMALE, bed: 'ICU-12', lengthOfStay: 4, archetype: 'deteriorating', readings: 9 },
];

async function main() {
  console.log('🌱  Seeding ICU monitoring database...');

  // Reset (dev only) — order matters for FKs.
  await prisma.alert.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.vitalSign.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();

  // --- Users ---
  const passwordHash = await bcrypt.hash('password123', 10);
  const [admin, , nurse] = await Promise.all([
    prisma.user.create({ data: { email: 'admin@icu.test', name: 'Dr. Admin', role: Role.ADMIN, passwordHash } }),
    prisma.user.create({ data: { email: 'dokter@icu.test', name: 'Dr. Sarah', role: Role.DOCTOR, passwordHash } }),
    prisma.user.create({ data: { email: 'perawat@icu.test', name: 'Ns. Andi', role: Role.NURSE, passwordHash } }),
  ]);
  console.log(`👤  Created 3 users (admin@icu.test / dokter@icu.test / perawat@icu.test — password: password123)`);

  const now = Date.now();
  let totalVitals = 0;
  let totalAlerts = 0;

  let idx = 0;
  for (const spec of PATIENTS) {
    idx++;
    const mrn = `MRN-${String(1000 + idx)}`;
    const patient = await prisma.patient.create({
      data: {
        mrn,
        name: spec.name,
        age: spec.age,
        gender: spec.gender,
        ward: 'ICU',
        bed: spec.bed,
        status: PatientStatus.ADMITTED,
        lengthOfStay: spec.lengthOfStay,
        admittedAt: new Date(now - spec.lengthOfStay * 24 * 60 * 60 * 1000),
      },
    });

    // Readings spaced ~2h apart, ending ~now.
    const intervalMs = 2 * 60 * 60 * 1000;
    for (let i = 0; i < spec.readings; i++) {
      const t = spec.readings === 1 ? 1 : i / (spec.readings - 1);
      const recordedAt = new Date(now - (spec.readings - 1 - i) * intervalMs);
      const v = vitalsAt(spec.archetype, t);

      const input: VitalsInput = { ...v, age: spec.age };
      const r = assessVitals(input);

      const vital = await prisma.vitalSign.create({
        data: {
          patientId: patient.id,
          recordedById: nurse.id,
          recordedAt,
          pulseRate: v.pulseRate,
          respiratoryRate: v.respiratoryRate,
          systolicBp: v.systolicBp,
          diastolicBp: v.diastolicBp,
          oxygenSaturation: v.oxygenSaturation,
          temperature: v.temperature,
          crp: v.crp,
          glucose: v.glucose,
          creatinine: v.creatinine,
          wbc: v.wbc,
          map: r.map,
          shockIndex: r.shockIndex,
          sirsScore: r.sirsScore,
          qsofa: r.qsofa,
          newsScore: r.newsScore,
        },
      });
      totalVitals++;

      const prediction = await prisma.prediction.create({
        data: {
          patientId: patient.id,
          vitalSignId: vital.id,
          source: PredictionSource.RULE_BASED,
          riskCategory: r.riskCategory,
          probability: r.probability,
          sirsScore: r.sirsScore,
          qsofa: r.qsofa,
          modelVersion: 'rule-engine-v1',
          createdAt: recordedAt,
        },
      });

      // Only raise alerts for the latest reading to avoid a flood of stale alerts.
      if (i === spec.readings - 1) {
        const derived = deriveAlerts(input, r);
        for (const a of derived) {
          await prisma.alert.create({
            data: {
              patientId: patient.id,
              predictionId: prediction.id,
              severity: a.severity,
              type: a.type,
              message: a.message,
              createdAt: recordedAt,
            },
          });
          totalAlerts++;
        }
      }
    }
  }

  console.log(`🏥  Created ${PATIENTS.length} patients, ${totalVitals} vital readings, ${totalAlerts} active alerts.`);
  console.log('✅  Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
