import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useStore } from '../context/StoreContext';
import { ROLE_LABELS } from '../types';
import { can, type Capability } from '../lib/permissions';

interface NavItem { to: string; label: string; cap?: Capability; }

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/products', label: 'Products' },
  { to: '/receiving', label: 'Receiving', cap: 'receive_stock' },
  { to: '/transfers', label: 'Transfers', cap: 'transfer_stock' },
  { to: '/stock', label: 'Stock' },
  { to: '/stock-count', label: 'Stock Count', cap: 'perform_count' },
  { to: '/barcode', label: 'Barcode Lookup' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/country-rates', label: 'Country Rates' },
  { to: '/reports', label: 'Reports', cap: 'view_reports' },
  { to: '/audit', label: 'Audit Log', cap: 'view_reports' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/users', label: 'Users & Access', cap: 'manage_users' },
  { to: '/settings', label: 'Settings', cap: 'manage_settings' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout, demoMode } = useStore();
  const navigate = useNavigate();
  if (!user) return null;

  const visible = NAV.filter((n) => !n.cap || can(user.role, n.cap));

  return (
    <div className="flex h-full">
      {/* Sidebar — 228px to match KURO design system */}
      <aside className="flex w-[228px] shrink-0 flex-col border-r border-ink-100 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-500 text-sm font-bold text-white">SD</div>
          <div>
            <div className="text-sm font-bold leading-tight text-ink-900">StockDesk <span className="text-teal-600">Pro</span></div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">by KURO</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {visible.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `mb-0.5 block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-teal-50 text-teal-700' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-100 p-3">
          <div className="rounded-lg bg-ink-50 px-3 py-2">
            <div className="truncate text-sm font-semibold text-ink-800">{user.name}</div>
            <div className="text-xs text-ink-400">{ROLE_LABELS[user.role]}</div>
          </div>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="btn-ghost mt-2 w-full"
          >Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-100 bg-white px-6">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2 text-xs text-ink-400">
            {demoMode && <span className="chip bg-amber-50 text-amber-700">Demo Mode</span>}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  return (
    <input
      className="input max-w-md"
      placeholder="Search product, color #, design #, barcode, supplier…"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const q = (e.target as HTMLInputElement).value.trim();
          if (q) navigate(`/barcode?q=${encodeURIComponent(q)}`);
        }
      }}
    />
  );
}
