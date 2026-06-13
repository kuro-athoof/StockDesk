import type { ReactNode } from 'react';

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4" onClick={onClose}>
      <div
        className={`card max-h-[88vh] w-full overflow-y-auto p-6 ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-ink-400 hover:bg-ink-50">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, accent }: {
  label: string; value: ReactNode; sub?: string; accent?: boolean;
}) {
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${accent ? 'text-teal-600' : 'text-ink-900'}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-400">{sub}</div>}
    </div>
  );
}

const CHIP_STYLES: Record<string, string> = {
  ok: 'bg-teal-50 text-teal-700',
  low: 'bg-amber-50 text-amber-700',
  out: 'bg-red-50 text-red-600',
  neutral: 'bg-ink-100 text-ink-600',
  info: 'bg-blue-50 text-blue-600',
};

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof CHIP_STYLES; children: ReactNode }) {
  return <span className={`chip ${CHIP_STYLES[tone]}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-1 py-16 text-center">
      <div className="text-sm font-semibold text-ink-700">{title}</div>
      {hint && <div className="text-sm text-ink-400">{hint}</div>}
    </div>
  );
}
