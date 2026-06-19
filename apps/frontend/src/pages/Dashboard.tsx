import { useNavigate } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useFetch } from '../lib/useFetch';
import type { Alert, DashboardSummary, WatchlistEntry } from '../api/types';
import { EmptyState, LiveBadge, RiskBadge, SeverityBadge, Spinner, Stat } from '../components/ui';
import { pct, timeAgo } from '../lib/format';

const RISK_COLORS: Record<string, string> = {
  HIGH: '#b91c1c',
  MODERATE: '#b45309',
  LOW: '#15803d',
  UNKNOWN: '#cbd5e1',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const POLL = 5000;
  const summary = useFetch<DashboardSummary>('/dashboard/summary', [], { intervalMs: POLL });
  const watchlist = useFetch<WatchlistEntry[]>('/dashboard/watchlist', [], { intervalMs: POLL });
  const alerts = useFetch<Alert[]>('/alerts?acknowledged=false', [], { intervalMs: POLL });

  if (summary.loading) return <Spinner />;
  const s = summary.data;

  const pieData = s
    ? [
        { name: 'Tinggi', key: 'HIGH', value: s.risk.HIGH },
        { name: 'Sedang', key: 'MODERATE', value: s.risk.MODERATE },
        { name: 'Rendah', key: 'LOW', value: s.risk.LOW },
        { name: 'Belum dinilai', key: 'UNKNOWN', value: s.risk.UNKNOWN },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard Pemantauan</h1>
          <div className="page-sub">Ringkasan kondisi pasien ICU secara real-time</div>
        </div>
        <LiveBadge />
      </div>

      <div className="grid grid-stats" style={{ marginBottom: 16 }}>
        <Stat label="Pasien Aktif" value={s?.totalPatients ?? 0} hint={`${s?.monitored ?? 0} sudah dinilai`} />
        <Stat
          label="Risiko Tinggi"
          value={<span style={{ color: 'var(--risk-high)' }}>{s?.risk.HIGH ?? 0}</span>}
          hint="perlu perhatian segera"
        />
        <Stat
          label="Peringatan Aktif"
          value={s?.openAlerts ?? 0}
          hint={`${s?.criticalAlerts ?? 0} kritis`}
        />
        <Stat
          label="Prediksi ML"
          value={s?.mlPredictionCount ?? 0}
          hint={`dari ${s?.predictionCount ?? 0} total prediksi`}
        />
      </div>

      <div className="two-col">
        {/* Watchlist */}
        <div className="card">
          <div className="section-title">
            Watchlist — Prioritas Tinggi
            <span className="tag">{watchlist.data?.length ?? 0} pasien</span>
          </div>
          {watchlist.loading ? (
            <div style={{ padding: 24 }}>
              <div className="spinner" />
            </div>
          ) : watchlist.data && watchlist.data.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Pasien</th>
                  <th>Bed</th>
                  <th>SpO₂</th>
                  <th>TD Sis.</th>
                  <th>Risiko</th>
                  <th>Prob.</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.data.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/patients/${p.id}`)}>
                    <td className="cell-strong">
                      {p.name}
                      <div className="cell-muted" style={{ fontWeight: 400, fontSize: 12 }}>
                        {p.mrn} · {p.age} th
                      </div>
                    </td>
                    <td className="cell-muted mono">{p.bed ?? '—'}</td>
                    <td className="mono">{p.latestVital ? `${p.latestVital.oxygenSaturation}%` : '—'}</td>
                    <td className="mono">{p.latestVital ? p.latestVital.systolicBp : '—'}</td>
                    <td>
                      <RiskBadge risk={p.riskCategory} />
                    </td>
                    <td className="mono cell-strong">{pct(p.probability)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="Tidak ada pasien berisiko tinggi" icon="✅" hint="Semua pasien dalam kondisi stabil." />
          )}
        </div>

        {/* Risk distribution */}
        <div className="card">
          <div className="section-title">Distribusi Risiko</div>
          {pieData.length > 0 ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2}>
                    {pieData.map((d) => (
                      <Cell key={d.key} fill={RISK_COLORS[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 6px 8px' }}>
                {pieData.map((d) => (
                  <div key={d.key} className="spread">
                    <span className="row">
                      <span
                        className="badge-dot"
                        style={{ background: RISK_COLORS[d.key], width: 9, height: 9 }}
                      />
                      {d.name}
                    </span>
                    <span className="cell-strong mono">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title="Belum ada data" icon="📊" />
          )}
        </div>
      </div>

      {/* Recent alerts */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">
          Peringatan Terbaru
          <span className="tag">{alerts.data?.length ?? 0} aktif</span>
        </div>
        {alerts.loading ? (
          <div style={{ padding: 24 }}>
            <div className="spinner" />
          </div>
        ) : alerts.data && alerts.data.length > 0 ? (
          alerts.data.slice(0, 6).map((a) => (
            <div key={a.id} className="alert-row">
              <span className={`alert-bar bar-${a.severity}`} />
              <div className="alert-msg">
                <div className="spread">
                  <span className="cell-strong">{a.patient?.name ?? 'Pasien'}</span>
                  <SeverityBadge severity={a.severity} />
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {a.message}
                </div>
                <div className="alert-meta">
                  {a.patient?.bed ? `${a.patient.bed} · ` : ''}
                  {timeAgo(a.createdAt)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="Tidak ada peringatan aktif" icon="🔕" />
        )}
      </div>
    </>
  );
}
