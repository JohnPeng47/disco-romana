'use client';

export default function StatBar({ label, value }: { label: string; value: number }) {
  const pct = ((value + 10) / 20) * 100;
  const cls = value > 0 ? 'stat-positive' : value < 0 ? 'stat-negative' : '';
  const color = value > 0 ? 'var(--green)' : value < 0 ? 'var(--red)' : 'var(--text-dim)';

  return (
    <>
      <div className="stat-row">
        <span className="stat-label">{label}</span>
        <span className={`stat-value ${cls}`}>
          {value > 0 ? '+' : ''}{value}
        </span>
      </div>
      <div className="stat-bar">
        <div className="stat-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </>
  );
}
