import { FormEvent, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, errorMessage } from '../api/client';
import { useFetch } from '../lib/useFetch';
import type { PatientDetail as PatientDetailT } from '../api/types';
import { EmptyState, LiveBadge, RiskBadge, SeverityBadge, Spinner } from '../components/ui';
import { IconChevronLeft, IconPlus } from '../components/icons';
import { formatDateTime, formatTime, pct, timeAgo } from '../lib/format';

type Metric = 'oxygenSaturation' | 'pulseRate' | 'respiratoryRate' | 'systolicBp';

const METRICS: { key: Metric; label: string; color: string; unit: string }[] = [
  { key: 'oxygenSaturation', label: 'SpO₂', color: '#0e7490', unit: '%' },
  { key: 'pulseRate', label: 'Nadi', color: '#b45309', unit: 'bpm' },
  { key: 'respiratoryRate', label: 'Respirasi', color: '#7c3aed', unit: '/min' },
  { key: 'systolicBp', label: 'TD Sistolik', color: '#b91c1c', unit: 'mmHg' },
];

// Threshold helpers for highlighting out-of-range values.
function vitalClass(key: string, v: number): string {
  switch (key) {
    case 'oxygenSaturation':
      return v < 85 ? 'crit' : v < 90 ? 'warn' : '';
    case 'systolicBp':
      return v < 80 ? 'crit' : v < 90 ? 'warn' : '';
    case 'pulseRate':
      return v > 130 ? 'crit' : v > 100 || v < 60 ? 'warn' : '';
    case 'respiratoryRate':
      return v > 30 ? 'crit' : v > 22 || v < 12 ? 'warn' : '';
    case 'temperature':
      return v >= 39 || v < 35 ? 'crit' : v >= 38 ? 'warn' : '';
    default:
      return '';
  }
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, refetch } = useFetch<PatientDetailT>(`/patients/${id}`, [id], { intervalMs: 5000 });
  const [metric, setMetric] = useState<Metric>('oxygenSaturation');
  const [showRecord, setShowRecord] = useState(false);

  const vitalsAsc = useMemo(
    () => (data ? [...data.vitals].sort((a, b) => +new Date(a.recordedAt) - +new Date(b.recordedAt)) : []),
    [data],
  );

  if (loading) return <Spinner />;
  if (error || !data) return <EmptyState title="Pasien tidak ditemukan" hint={error} icon="⚠️" />;

  const latest = vitalsAsc[vitalsAsc.length - 1] ?? null;
  const latestPrediction = data.predictions[0] ?? null;
  const openAlerts = data.alerts.filter((a) => !a.acknowledged);

  const chartData = vitalsAsc.map((v) => ({
    time: formatTime(v.recordedAt),
    value: v[metric] as number,
  }));
  const activeMetric = METRICS.find((m) => m.key === metric)!;

  return (
    <>
      <Link to="/patients" className="row muted" style={{ marginBottom: 14, fontSize: 13, fontWeight: 500 }}>
        <IconChevronLeft width={16} height={16} />
        Kembali ke daftar pasien
      </Link>

      <div className="page-head">
        <div>
          <h1 className="page-title">{data.name}</h1>
          <div className="page-sub">
            {data.mrn} · {data.age} tahun · {data.gender === 'MALE' ? 'Laki-laki' : data.gender === 'FEMALE' ? 'Perempuan' : 'Lainnya'} ·{' '}
            {data.ward} {data.bed} · Lama rawat {data.lengthOfStay} hari
          </div>
        </div>
        <div className="row">
          <LiveBadge />
          <RiskBadge risk={latestPrediction?.riskCategory ?? null} />
          <button className="btn btn-primary" onClick={() => setShowRecord(true)}>
            <IconPlus width={16} height={16} />
            Rekam Vital
          </button>
        </div>
      </div>

      {/* Current vitals */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="spread" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 15 }}>Tanda Vital Terkini</h3>
          <span className="muted" style={{ fontSize: 12.5 }}>{latest ? timeAgo(latest.recordedAt) : 'belum ada data'}</span>
        </div>
        {latest ? (
          <div className="vital-grid">
            <VitalCell name="Nadi" value={latest.pulseRate} unit="bpm" cls={vitalClass('pulseRate', latest.pulseRate)} />
            <VitalCell name="Respirasi" value={latest.respiratoryRate} unit="/min" cls={vitalClass('respiratoryRate', latest.respiratoryRate)} />
            <VitalCell name="SpO₂" value={latest.oxygenSaturation} unit="%" cls={vitalClass('oxygenSaturation', latest.oxygenSaturation)} />
            <VitalCell name="TD" value={`${latest.systolicBp}/${latest.diastolicBp}`} unit="mmHg" cls={vitalClass('systolicBp', latest.systolicBp)} />
            {latest.temperature != null && (
              <VitalCell name="Suhu" value={latest.temperature} unit="°C" cls={vitalClass('temperature', latest.temperature)} />
            )}
            <VitalCell name="MAP" value={latest.map ?? '—'} unit="mmHg" />
            <VitalCell name="Shock Index" value={latest.shockIndex ?? '—'} unit="" cls={(latest.shockIndex ?? 0) > 1 ? 'warn' : ''} />
          </div>
        ) : (
          <EmptyState title="Belum ada tanda vital" hint="Rekam tanda vital pertama pasien ini." icon="🩺" />
        )}
      </div>

      <div className="two-col">
        {/* Trend chart */}
        <div className="card">
          <div className="section-title">
            Tren Tanda Vital
            <div className="row" style={{ gap: 6 }}>
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  className={`btn btn-sm ${metric === m.key ? 'btn-primary' : ''}`}
                  onClick={() => setMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-wrap">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#9aa1ab' }} tickLine={false} axisLine={{ stroke: '#e8eaed' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#9aa1ab' }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e8eaed', fontSize: 12 }}
                    formatter={(val) => [`${val} ${activeMetric.unit}`, activeMetric.label]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={activeMetric.color}
                    strokeWidth={2.4}
                    dot={{ r: 2.5, fill: activeMetric.color }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="Data tren belum cukup" hint="Diperlukan minimal 2 pengukuran." icon="📈" />
            )}
          </div>
        </div>

        {/* Clinical scores */}
        <div className="card">
          <div className="section-title">Skor Klinis</div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ScoreRow label="Probabilitas Mortalitas" value={pct(latestPrediction?.probability)} strong />
            <ScoreRow label="qSOFA" value={`${latest?.qsofa ?? '—'} / 3`} />
            <ScoreRow label="SIRS" value={`${latest?.sirsScore ?? '—'} / 4`} />
            <ScoreRow label="NEWS" value={`${latest?.newsScore ?? '—'}`} />
            <div className="divider" />
            <ScoreRow label="CRP" value={latest?.crp != null ? `${latest.crp} mg/L` : '—'} />
            <ScoreRow label="Glukosa" value={latest?.glucose != null ? `${latest.glucose} mg/dL` : '—'} />
            <ScoreRow label="Kreatinin" value={latest?.creatinine != null ? `${latest.creatinine} mg/dL` : '—'} />
            <ScoreRow label="WBC" value={latest?.wbc != null ? `${latest.wbc} ×10⁹/L` : '—'} />
            {latestPrediction && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Sumber:{' '}
                <span className={`tag ${latestPrediction.source === 'ML_PIPELINE' ? 'tag-ml' : ''}`}>
                  {latestPrediction.source === 'ML_PIPELINE' ? 'Model ML' : 'Rule Engine'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alerts for this patient */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">
          Riwayat Peringatan
          <span className="tag">{openAlerts.length} aktif</span>
        </div>
        {data.alerts.length > 0 ? (
          data.alerts.slice(0, 10).map((a) => (
            <div key={a.id} className="alert-row">
              <span className={`alert-bar bar-${a.severity}`} />
              <div className="alert-msg">
                <div className="spread">
                  <span className="cell-strong">{a.type.replace(/_/g, ' ')}</span>
                  <SeverityBadge severity={a.severity} />
                </div>
                <div className="muted" style={{ fontSize: 13 }}>{a.message}</div>
                <div className="alert-meta">
                  {formatDateTime(a.createdAt)}
                  {a.acknowledged ? ' · sudah ditangani' : ''}
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="Tidak ada peringatan" icon="🔕" />
        )}
      </div>

      {showRecord && id && (
        <RecordVitalsModal
          patientId={id}
          onClose={() => setShowRecord(false)}
          onSaved={() => {
            setShowRecord(false);
            refetch();
          }}
        />
      )}
    </>
  );
}

function VitalCell({ name, value, unit, cls = '' }: { name: string; value: number | string; unit: string; cls?: string }) {
  return (
    <div className="vital-cell">
      <div className="vital-name">{name}</div>
      <div className={`vital-num ${cls}`}>
        {value}
        {unit && <span className="vital-unit"> {unit}</span>}
      </div>
    </div>
  );
}

function ScoreRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="spread">
      <span className="muted">{label}</span>
      <span className={strong ? 'cell-strong mono' : 'mono'} style={strong ? { fontSize: 15 } : undefined}>
        {value}
      </span>
    </div>
  );
}

const VITAL_FIELDS: { key: keyof VitalForm; label: string; unit: string; required?: boolean }[] = [
  { key: 'pulseRate', label: 'Nadi', unit: 'bpm', required: true },
  { key: 'respiratoryRate', label: 'Respirasi', unit: '/min', required: true },
  { key: 'systolicBp', label: 'TD Sistolik', unit: 'mmHg', required: true },
  { key: 'diastolicBp', label: 'TD Diastolik', unit: 'mmHg', required: true },
  { key: 'oxygenSaturation', label: 'SpO₂', unit: '%', required: true },
  { key: 'temperature', label: 'Suhu', unit: '°C' },
  { key: 'crp', label: 'CRP', unit: 'mg/L' },
  { key: 'glucose', label: 'Glukosa', unit: 'mg/dL' },
  { key: 'creatinine', label: 'Kreatinin', unit: 'mg/dL' },
  { key: 'wbc', label: 'WBC', unit: '×10⁹/L' },
];

type VitalForm = Record<
  'pulseRate' | 'respiratoryRate' | 'systolicBp' | 'diastolicBp' | 'oxygenSaturation' | 'temperature' | 'crp' | 'glucose' | 'creatinine' | 'wbc',
  string
>;

const EMPTY_FORM: VitalForm = {
  pulseRate: '',
  respiratoryRate: '',
  systolicBp: '',
  diastolicBp: '',
  oxygenSaturation: '',
  temperature: '',
  crp: '',
  glucose: '',
  creatinine: '',
  wbc: '',
};

function RecordVitalsModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: (result: { assessment: { riskCategory: string; probability: number } }) => void;
}) {
  const [form, setForm] = useState<VitalForm>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload: Record<string, number> = {};
      for (const { key } of VITAL_FIELDS) {
        const raw = form[key];
        if (raw !== '') payload[key] = Number(raw);
      }
      const res = await api.post<{ assessment: { riskCategory: string; probability: number } }>(
        `/patients/${patientId}/vitals`,
        payload,
      );
      onSaved(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Gagal menyimpan tanda vital.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Rekam Tanda Vital</h3>
          <button className="btn btn-sm" onClick={onClose}>
            Tutup
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            {VITAL_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label>
                  {f.label} <span className="unit">({f.unit})</span>
                </label>
                <input
                  className="input"
                  type="number"
                  step="any"
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  required={f.required}
                />
              </div>
            ))}
          </div>

          <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
            Risiko & skor klinis (SIRS, qSOFA, NEWS) akan dihitung otomatis saat disimpan.
          </div>

          {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}

          <div className="modal-foot">
            <button type="button" className="btn" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan & Hitung Risiko'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
