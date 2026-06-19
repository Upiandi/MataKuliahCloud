import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../auth/AuthContext';
import type { Gender, PatientStatus, PatientSummary } from '../api/types';
import { EmptyState, LiveBadge, RiskBadge, Spinner } from '../components/ui';
import { IconPlus, IconSearch } from '../components/icons';
import { timeAgo } from '../lib/format';

const STATUS_LABEL: Record<PatientStatus, string> = {
  ADMITTED: 'Dirawat',
  DISCHARGED: 'Pulang',
  TRANSFERRED: 'Dipindah',
};

export default function Patients() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PatientStatus | ''>('ADMITTED');
  const [showModal, setShowModal] = useState(false);

  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  const { data, loading, refetch } = useFetch<PatientSummary[]>(`/patients?${query.toString()}`, [search, status], {
    intervalMs: 5000,
  });

  const canManage = user?.role === 'ADMIN' || user?.role === 'DOCTOR';

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Daftar Pasien</h1>
          <div className="page-sub">Kelola dan pantau seluruh pasien</div>
        </div>
        <div className="row">
          <LiveBadge />
          {canManage && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <IconPlus width={16} height={16} />
              Tambah Pasien
            </button>
          )}
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="search">
          <IconSearch
            width={16}
            height={16}
            style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-subtle)' }}
          />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Cari nama atau MRN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value as PatientStatus | '')}>
          <option value="">Semua status</option>
          <option value="ADMITTED">Dirawat</option>
          <option value="DISCHARGED">Pulang</option>
          <option value="TRANSFERRED">Dipindah</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <Spinner />
        ) : data && data.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Pasien</th>
                <th>Bed</th>
                <th>Usia/JK</th>
                <th>Risiko</th>
                <th>Vital Terakhir</th>
                <th>Alert</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/patients/${p.id}`)}>
                  <td className="cell-strong">
                    {p.name}
                    <div className="cell-muted" style={{ fontWeight: 400, fontSize: 12 }}>
                      {p.mrn}
                    </div>
                  </td>
                  <td className="mono cell-muted">{p.bed ?? '—'}</td>
                  <td className="cell-muted">
                    {p.age} th · {p.gender === 'MALE' ? 'L' : p.gender === 'FEMALE' ? 'P' : '-'}
                  </td>
                  <td>
                    <RiskBadge risk={p.riskCategory} />
                  </td>
                  <td className="cell-muted">{timeAgo(p.lastVitalAt)}</td>
                  <td>
                    {p.openAlerts > 0 ? (
                      <span className="badge sev-CRITICAL">{p.openAlerts}</span>
                    ) : (
                      <span className="cell-muted">—</span>
                    )}
                  </td>
                  <td className="cell-muted">{STATUS_LABEL[p.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="Tidak ada pasien" hint="Coba ubah filter atau tambahkan pasien baru." icon="🛏️" />
        )}
      </div>

      {showModal && (
        <AddPatientModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            refetch();
          }}
        />
      )}
    </>
  );
}

function AddPatientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    mrn: '',
    name: '',
    age: '',
    gender: 'MALE' as Gender,
    bed: '',
    lengthOfStay: '0',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/patients', {
        mrn: form.mrn,
        name: form.name,
        age: parseInt(form.age, 10),
        gender: form.gender,
        bed: form.bed || undefined,
        lengthOfStay: parseInt(form.lengthOfStay, 10) || 0,
      });
      onCreated();
    } catch (err) {
      setError(errorMessage(err, 'Gagal menambah pasien.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Tambah Pasien Baru</h3>
          <button className="btn btn-sm" onClick={onClose}>
            Tutup
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label>No. Rekam Medis</label>
              <input className="input" value={form.mrn} onChange={(e) => set('mrn', e.target.value)} placeholder="MRN-2001" required />
            </div>
            <div className="field">
              <label>Nama Lengkap</label>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
            <div className="field">
              <label>Usia</label>
              <input className="input" type="number" min={0} max={120} value={form.age} onChange={(e) => set('age', e.target.value)} required />
            </div>
            <div className="field">
              <label>Jenis Kelamin</label>
              <select className="select" value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)}>
                <option value="MALE">Laki-laki</option>
                <option value="FEMALE">Perempuan</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </div>
            <div className="field">
              <label>Bed</label>
              <input className="input" value={form.bed} onChange={(e) => set('bed', e.target.value)} placeholder="ICU-13" />
            </div>
            <div className="field">
              <label>Lama Rawat (hari)</label>
              <input className="input" type="number" min={0} value={form.lengthOfStay} onChange={(e) => set('lengthOfStay', e.target.value)} />
            </div>
          </div>

          {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}

          <div className="modal-foot">
            <button type="button" className="btn" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
