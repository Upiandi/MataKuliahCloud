import type { ReactNode } from 'react';
import type { AlertSeverity, RiskCategory } from '../api/types';
import { riskLabel } from '../lib/format';

export function RiskBadge({ risk }: { risk: RiskCategory | null }) {
  const label = risk ? riskLabel[risk] : 'Belum dinilai';
  return (
    <span className={`badge risk-${risk ?? 'null'}`}>
      <span className="badge-dot" />
      {label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const label = severity === 'CRITICAL' ? 'Kritis' : severity === 'WARNING' ? 'Peringatan' : 'Info';
  return <span className={`badge sev-${severity}`}>{label}</span>;
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint != null && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function LiveBadge({ label = 'LIVE' }: { label?: string }) {
  return (
    <span className="live">
      <span className="live-dot" />
      {label}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="center">
      <div className="spinner" />
    </div>
  );
}

export function EmptyState({ title, hint, icon = '📭' }: { title: string; hint?: string; icon?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{title}</div>
      {hint && <div style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
