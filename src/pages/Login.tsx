import { useStore } from '../context/StoreContext';
import { ROLE_LABELS } from '../types';
import { DEMO_USERS } from '../lib/demoData';

const HINTS: Record<string, string> = {
  u_admin: 'Full access — settings, users, products, all reports',
  u_purch: 'Receive, transfer, adjust, view costs & reports (all shops)',
  u_flora: 'Flora shop only — request stock, confirm transfers',
  u_sindhitha: 'Sindhitha shop only — request stock, confirm transfers',
  u_ware: 'Flora warehouse — scan, receive, transfer, counts',
  u_audit: 'View everything, export reports, no edits',
};

export function Login() {
  const { login } = useStore();
  return (
    <div className="grid min-h-full place-items-center bg-gradient-to-br from-ink-50 to-teal-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-teal-500 text-lg font-bold text-white">SD</div>
          <h1 className="mt-3 text-2xl font-bold text-ink-900">StockDesk <span className="text-teal-600">Pro</span></h1>
          <p className="text-sm text-ink-400">Warehouse inventory by KURO</p>
        </div>
        <div className="card p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Sign in as (demo)
          </div>
          <div className="space-y-2">
            {DEMO_USERS.map((u) => (
              <button
                key={u.uid}
                onClick={() => login(u.uid)}
                className="w-full rounded-lg border border-ink-100 bg-white px-4 py-3 text-left transition-colors hover:border-teal-300 hover:bg-teal-50"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-ink-900">{u.name}</div>
                  <div className="text-[11px] font-semibold text-ink-400">{ROLE_LABELS[u.role]}</div>
                </div>
                <div className="text-xs text-ink-400">{HINTS[u.uid]}</div>
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-ink-400">
            Wire <code className="rounded bg-ink-50 px-1">.env</code> Firebase keys for live auth.
          </p>
        </div>
      </div>
    </div>
  );
}
