import type { ReactNode } from 'react';

export type Tone = 'orange' | 'blue' | 'amber' | 'green' | 'violet' | 'rose' | 'gray';

// Hiển thị số: có digits thì cố định số chữ số thập phân, không thì tối đa 1 chữ số + phân tách hàng nghìn
export function fmtVal(v: string | number, digits?: number): string {
  if (typeof v !== 'number') return v;
  return digits !== undefined ? v.toFixed(digits) : v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function StatusPill({ online }: { online: boolean }) {
  return (
    <span className={`pill ${online ? 'pill-on' : 'pill-off'}`}>
      <span className="pill-dot" />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

interface MetricTileProps {
  icon: ReactNode;
  tone: Tone;
  label: string;
  value: string | number;
  unit?: string;
  digits?: number;
  hint?: string;
  wide?: boolean;
}

export function MetricTile({ icon, tone, label, value, unit, digits, hint, wide }: MetricTileProps) {
  return (
    <div className={`metric-tile${wide ? ' wide' : ''}`}>
      <div className={`metric-icon tone-${tone}`} aria-hidden>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="metric-label">{label}</div>
        <div className="metric-value">
          {fmtVal(value, digits)}
          {unit && value !== '—' && <span className="metric-unit">{unit}</span>}
        </div>
        {hint && <div className="metric-hint">{hint}</div>}
      </div>
    </div>
  );
}