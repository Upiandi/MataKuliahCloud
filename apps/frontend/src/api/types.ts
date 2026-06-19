export type Role = 'ADMIN' | 'DOCTOR' | 'NURSE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type PatientStatus = 'ADMITTED' | 'DISCHARGED' | 'TRANSFERRED';
export type RiskCategory = 'LOW' | 'MODERATE' | 'HIGH';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type PredictionSource = 'RULE_BASED' | 'ML_PIPELINE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface VitalSign {
  id: string;
  patientId: string;
  recordedAt: string;
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
  map?: number | null;
  shockIndex?: number | null;
  sirsScore?: number | null;
  qsofa?: number | null;
  newsScore?: number | null;
  recordedBy?: { name: string } | null;
}

export interface Prediction {
  id: string;
  patientId: string;
  source: PredictionSource;
  riskCategory: RiskCategory;
  probability: number;
  sirsScore?: number | null;
  qsofa?: number | null;
  modelVersion?: string | null;
  createdAt: string;
}

export interface Alert {
  id: string;
  patientId: string;
  severity: AlertSeverity;
  type: string;
  message: string;
  acknowledged: boolean;
  acknowledgedAt?: string | null;
  createdAt: string;
  patient?: { id: string; name: string; mrn: string; ward?: string; bed?: string };
}

export interface PatientSummary {
  id: string;
  mrn: string;
  name: string;
  age: number;
  gender: Gender;
  ward?: string | null;
  bed?: string | null;
  status: PatientStatus;
  lengthOfStay: number;
  admittedAt: string;
  riskCategory: RiskCategory | null;
  probability: number | null;
  lastVitalAt: string | null;
  latestVital: VitalSign | null;
  openAlerts: number;
}

export interface PatientDetail {
  id: string;
  mrn: string;
  name: string;
  age: number;
  gender: Gender;
  ward?: string | null;
  bed?: string | null;
  status: PatientStatus;
  lengthOfStay: number;
  admittedAt: string;
  vitals: VitalSign[];
  predictions: Prediction[];
  alerts: Alert[];
}

export interface DashboardSummary {
  totalPatients: number;
  monitored: number;
  risk: { HIGH: number; MODERATE: number; LOW: number; UNKNOWN: number };
  openAlerts: number;
  criticalAlerts: number;
  predictionCount: number;
  mlPredictionCount: number;
}

export interface WatchlistEntry {
  id: string;
  name: string;
  mrn: string;
  ward?: string | null;
  bed?: string | null;
  age: number;
  riskCategory: RiskCategory | null;
  probability: number;
  latestVital: VitalSign | null;
}
