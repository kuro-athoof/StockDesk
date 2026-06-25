import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useStore } from '../context/StoreContext';
import { ROLE_LABELS } from '../types';
import { can, type Capability } from '../lib/permissions';

interface NavItem { to: string; label: string; cap?: Capability; icon?: string; }
interface NavSection { heading?: string; items: NavItem[]; }

const SECTIONS: NavSection[] = [
  { items: [{ to: '/', label: 'Dashboard', icon: '⊞' }] },
  {
    heading: 'Operations',
    items: [
      { to: '/receiving',   label: 'Receive Stock',   icon: '📥', cap: 'receive_stock' },
      { to: '/transfers',   label: 'Move Stock',       icon: '📤', cap: 'transfer_stock' },
      { to: '/warehouse',   label: 'Warehouse Mode',   icon: '⬛', cap: 'warehouse_mode' },
      { to: '/damaged',     label: 'Damaged / Issues', icon: '⚠️', cap: 'perform_count' },
      { to: '/stock-count', label: 'Stock Count',      icon: '🔢', cap: 'perform_count' },
    ],
  },
  {
    heading: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: '🏷' },
      { to: '/stock',    label: 'Stock',    icon: '📦' },
    ],
  },
  {
    heading: 'Reports',
    items: [{ to: '/reports', label: 'Reports', icon: '📊', cap: 'view_reports' }],
  },
  {
    heading: 'Admin',
    items: [{ to: '/admin', label: 'Administration', icon: '⚙', cap: 'view_reports' }],
  },
];

// Bottom nav (mobile) — warehouse staff see Scan as primary; others see their ops
const BOTTOM_NAV: NavItem[] = [
  { to: '/',          label: 'Home',    icon: '⊞' },
  { to: '/warehouse', label: 'Scan',    icon: '⬛', cap: 'warehouse_mode' },
  { to: '/receiving', label: 'Receive', icon: '📥', cap: 'receive_stock' },
  { to: '/transfers', label: 'Move',    icon: '📤', cap: 'transfer_stock' },
  { to: '/stock',     label: 'Stock',   icon: '📦' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout, demoMode } = useStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  if (!user) return null;

  const allSections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((n) => !n.cap || can(user.role, n.cap)) })).filter((s) => s.items.length > 0);
  const bottomItems = BOTTOM_NAV.filter((n) => !n.cap || can(user.role, n.cap));

  return (
    <div className="flex h-full">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 flex w-[228px] shrink-0 flex-col border-r border-ink-100 bg-white transition-transform duration-200
        md:relative md:translate-x-0 md:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-500 text-sm font-bold text-white">SD</div>
          <div>
            <div className="text-sm font-bold leading-tight text-ink-900">StockDesk <span className="text-teal-600">Pro</span></div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">by KURO</div>
          </div>
          <button className="ml-auto text-ink-400 hover:text-ink-700 md:hidden" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {allSections.map((section, i) => (
            <div key={i} className="mb-2">
              {section.heading && (
                <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-300">{section.heading}</div>
              )}
              {section.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `mb-0.5 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'bg-teal-50 text-teal-700' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'
                    }`
                  }>
                  <span className="text-base">{n.icon}</span>{n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-ink-100 p-3">
          <div className="rounded-lg bg-ink-50 px-3 py-2">
            <div className="truncate text-sm font-semibold text-ink-800">{user.name}</div>
            <div className="text-xs text-ink-400">{ROLE_LABELS[user.role]}</div>
          </div>
          <button onClick={() => { logout(); navigate('/'); }} className="btn-ghost mt-2 w-full text-sm">Sign out</button>
        </div>
      </aside>

      {/* Main content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-100 bg-white px-4 md:px-6">
          {/* Hamburger — mobile only */}
          <button className="mr-1 rounded-lg p-2 text-ink-500 hover:bg-ink-50 md:hidden" onClick={() => setSidebarOpen(true)}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/>
            </svg>
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2 text-xs text-ink-400">
            {demoMode && <span className="chip bg-amber-50 text-amber-700">Demo</span>}
          </div>
        </header>

        {/* Page content — extra bottom padding on mobile so bottom nav doesn't cover content */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>

      {/* Bottom navigation — mobile only */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex border-t border-ink-100 bg-white md:hidden">
        {bottomItems.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center py-2 text-[10px] font-semibold transition-colors ${
                isActive ? 'text-teal-600' : 'text-ink-400 hover:text-ink-600'
              }`
            }>
            <span className="mb-0.5 text-xl">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  return (
    <input
      className="input min-w-0 flex-1 max-w-md text-sm"
      placeholder="Search barcode, product…"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const q = (e.target as HTMLInputElement).value.trim();
          if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
        }
      }}
    />
  );
}
