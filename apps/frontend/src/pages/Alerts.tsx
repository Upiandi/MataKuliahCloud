import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useFetch } from '../lib/useFetch';
import type { Alert } from '../api/types';
import { EmptyState, SeverityBadge, Spinner } from '../components/ui';
import { IconCheck } from '../components/icons';
import { formatDateTime } from '../lib/format';

export default function Alerts() {
  const [showAck, setShowAck] = useState(false);
  const { data, loading, refetch } = useFetch<Alert[]>(`/alerts?acknowledged=${showAck}`, [showAck]);
  const [busy, setBusy] = useState<string | null>(null);

  async function acknowledge(id: string) {
    setBusy(id);
    try {
      await api.patch(`/alerts/${id}/acknowledge`);
      refetch();
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Peringatan</h1>
          <div className="page-sub">Notifikasi klinis dari rule engine & model ML</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className={`btn btn-sm ${!showAck ? 'btn-primary' : ''}`} onClick={() => setShowAck(false)}>
            Aktif
          </button>
          <button className={`btn btn-sm ${showAck ? 'btn-primary' : ''}`} onClick={() => setShowAck(true)}>
            Sudah ditangani
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <Spinner />
        ) : data && data.length > 0 ? (
          data.map((a) => (
            <div key={a.id} className="alert-row">
              <span className={`alert-bar bar-${a.severity}`} />
              <div className="alert-msg">
                <div className="spread">
                  <span className="row" style={{ gap: 8 }}>
                    <span className="cell-strong">{a.type.replace(/_/g, ' ')}</span>
                    <SeverityBadge severity={a.severity} />
                  </span>
                  {!a.acknowledged && (
                    <button className="btn btn-sm" onClick={() => acknowledge(a.id)} disabled={busy === a.id}>
                      <IconCheck width={14} height={14} />
                      {busy === a.id ? '…' : 'Tangani'}
                    </button>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>{a.message}</div>
                <div className="alert-meta">
                  {a.patient && (
                    <Link to={`/patients/${a.patient.id}`} style={{ color: 'var(--accent)', fontWeight: 500 }}>
                      {a.patient.name}
                    </Link>
                  )}
                  {a.patient?.bed ? ` · ${a.patient.bed}` : ''} · {formatDateTime(a.createdAt)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title={showAck ? 'Belum ada peringatan yang ditangani' : 'Tidak ada peringatan aktif'}
            icon={showAck ? '📋' : '🔕'}
          />
        )}
      </div>
    </>
  );
}
