/**
 * Clinical risk-scoring engine (pure functions).
 *
 * Mirrors the feature engineering used by the Spark ML pipeline
 * (pipelines/ml/spark_ml_ultimate.py): SIRS, qSOFA, MAP, shock index, plus a
 * logistic rule-based mortality estimate. Kept dependency-free so it can be
 * reused by the API (RiskService) and the Prisma seed script.
 */

export interface VitalsInput {
  pulseRate: number;
  respiratoryRate: number;
  systolicBp: number;
  diastolicBp: number;
  oxygenSaturation: number;
  temperature?: number | null;
  crp?: number | null;
  glucose?: number | null;
  creatinine?: number | null;
  wbc?: number | null;
  age: number;
}

export type RiskCategory = 'LOW' | 'MODERATE' | 'HIGH';

export interface RiskResult {
  map: number;
  shockIndex: number;
  sirsScore: number;
  qsofa: number;
  newsScore: number;
  probability: number; // mortality probability [0..1]
  riskCategory: RiskCategory;
}

export interface DerivedAlert {
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));
const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Mean arterial pressure = (SBP + 2*DBP) / 3 */
export function meanArterialPressure(systolic: number, diastolic: number): number {
  return round((systolic + 2 * diastolic) / 3, 1);
}

/** Shock index = HR / SBP (>= 0.9 suggests hemodynamic instability) */
export function shockIndex(pulse: number, systolic: number): number {
  return round(pulse / (systolic + 1), 2);
}

/** SIRS score (0-4). */
export function sirsScore(v: VitalsInput): number {
  let s = 0;
  if (v.temperature != null && (v.temperature > 38 || v.temperature < 36)) s += 1;
  if (v.pulseRate > 90) s += 1;
  if (v.respiratoryRate > 20) s += 1;
  if (v.wbc != null && (v.wbc > 12 || v.wbc < 4)) s += 1;
  return s;
}

/** qSOFA score (0-3). Mental status unavailable in dataset -> max 2 here. */
export function qsofaScore(v: VitalsInput): number {
  let s = 0;
  if (v.respiratoryRate >= 22) s += 1;
  if (v.systolicBp <= 100) s += 1;
  return s;
}

/** Simplified NEWS2 aggregate (respiration, SpO2, SBP, pulse, temperature). */
export function newsScore(v: VitalsInput): number {
  let s = 0;

  // Respiration rate
  if (v.respiratoryRate <= 8) s += 3;
  else if (v.respiratoryRate <= 11) s += 1;
  else if (v.respiratoryRate <= 20) s += 0;
  else if (v.respiratoryRate <= 24) s += 2;
  else s += 3;

  // Oxygen saturation
  if (v.oxygenSaturation <= 91) s += 3;
  else if (v.oxygenSaturation <= 93) s += 2;
  else if (v.oxygenSaturation <= 95) s += 1;

  // Systolic BP
  if (v.systolicBp <= 90) s += 3;
  else if (v.systolicBp <= 100) s += 2;
  else if (v.systolicBp <= 110) s += 1;
  else if (v.systolicBp >= 220) s += 3;

  // Pulse
  if (v.pulseRate <= 40) s += 3;
  else if (v.pulseRate <= 50) s += 1;
  else if (v.pulseRate <= 90) s += 0;
  else if (v.pulseRate <= 110) s += 1;
  else if (v.pulseRate <= 130) s += 2;
  else s += 3;

  // Temperature (skip if not provided)
  if (v.temperature != null) {
    if (v.temperature <= 35) s += 3;
    else if (v.temperature <= 36) s += 1;
    else if (v.temperature <= 38) s += 0;
    else if (v.temperature <= 39) s += 1;
    else s += 2;
  }

  return s;
}

/**
 * Rule-based mortality probability via a hand-tuned logistic model over the
 * same risk factors the GBT pipeline weights highly.
 */
export function mortalityProbability(v: VitalsInput, qsofa: number, sirs: number, si: number): number {
  let z = -4.0; // intercept -> baseline low risk

  if (v.age >= 80) z += 1.2;
  else if (v.age >= 65) z += 0.7;

  if (v.oxygenSaturation < 85) z += 1.6;
  else if (v.oxygenSaturation < 90) z += 0.9;

  if (v.systolicBp < 80) z += 1.5;
  else if (v.systolicBp < 90) z += 0.8;

  if (v.respiratoryRate > 30) z += 1.0;
  else if (v.respiratoryRate > 22) z += 0.5;

  if (v.pulseRate > 130) z += 0.8;
  else if (v.pulseRate > 100) z += 0.4;

  if (v.crp != null) {
    if (v.crp > 100) z += 0.8;
    else if (v.crp > 50) z += 0.4;
  }
  if (v.creatinine != null) {
    if (v.creatinine > 2.5) z += 1.0;
    else if (v.creatinine > 1.5) z += 0.5;
  }
  if (v.wbc != null) {
    if (v.wbc > 20 || v.wbc < 4) z += 0.6;
    else if (v.wbc > 12) z += 0.3;
  }
  if (v.glucose != null && v.glucose > 180) z += 0.3;

  z += qsofa * 0.6;
  z += sirs * 0.3;

  if (si > 1.0) z += 0.8;
  else if (si > 0.9) z += 0.4;

  return round(sigmoid(z), 4);
}

export function categorize(probability: number, qsofa: number, sirs: number): RiskCategory {
  if (probability >= 0.5 || qsofa >= 2) return 'HIGH';
  if (probability >= 0.2 || sirs >= 2) return 'MODERATE';
  return 'LOW';
}

/** Compute the full clinical assessment for a set of vitals. */
export function assessVitals(v: VitalsInput): RiskResult {
  const map = meanArterialPressure(v.systolicBp, v.diastolicBp);
  const si = shockIndex(v.pulseRate, v.systolicBp);
  const sirs = sirsScore(v);
  const qsofa = qsofaScore(v);
  const news = newsScore(v);
  const probability = mortalityProbability(v, qsofa, sirs, si);
  const riskCategory = categorize(probability, qsofa, sirs);

  return { map, shockIndex: si, sirsScore: sirs, qsofa, newsScore: news, probability, riskCategory };
}

/** Derive discrete clinical alerts from a vitals snapshot + risk result. */
export function deriveAlerts(v: VitalsInput, r: RiskResult): DerivedAlert[] {
  const alerts: DerivedAlert[] = [];

  if (r.riskCategory === 'HIGH') {
    alerts.push({
      type: 'HIGH_MORTALITY_RISK',
      severity: 'CRITICAL',
      message: `Risiko mortalitas tinggi (${(r.probability * 100).toFixed(0)}%) — qSOFA ${r.qsofa}, SIRS ${r.sirsScore}.`,
    });
  }

  if (v.oxygenSaturation < 85) {
    alerts.push({ type: 'SEVERE_HYPOXIA', severity: 'CRITICAL', message: `SpO₂ kritis ${v.oxygenSaturation}%.` });
  } else if (v.oxygenSaturation < 90) {
    alerts.push({ type: 'HYPOXIA', severity: 'WARNING', message: `Hipoksia: SpO₂ ${v.oxygenSaturation}%.` });
  }

  if (v.systolicBp < 80) {
    alerts.push({ type: 'SEVERE_HYPOTENSION', severity: 'CRITICAL', message: `Hipotensi berat: TD sistolik ${v.systolicBp} mmHg.` });
  } else if (v.systolicBp < 90) {
    alerts.push({ type: 'HYPOTENSION', severity: 'WARNING', message: `Hipotensi: TD sistolik ${v.systolicBp} mmHg.` });
  }

  if (v.respiratoryRate > 30) {
    alerts.push({ type: 'SEVERE_TACHYPNEA', severity: 'WARNING', message: `Takipnea berat: RR ${v.respiratoryRate}/min.` });
  }

  if (r.shockIndex > 1.0) {
    alerts.push({ type: 'HIGH_SHOCK_INDEX', severity: 'WARNING', message: `Shock index tinggi (${r.shockIndex}).` });
  }

  return alerts;
}
