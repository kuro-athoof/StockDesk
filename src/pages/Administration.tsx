import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { can } from '../lib/permissions';
import { Suppliers } from './Suppliers';
import { CountryRates } from './CountryRates';
import { Users } from './Users';
import { Settings } from './Settings';
import { AuditLogPage } from './AuditLog';
import { MasterDataHealth } from './MasterDataHealth';

type Tab = 'health' | 'suppliers' | 'rates' | 'users' | 'settings' | 'audit';

export function Administration() {
  const { user } = useStore();
  const allTabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'health', label: 'Data Health', show: true },
    { key: 'suppliers', label: 'Suppliers', show: true },
    { key: 'rates', label: 'Country Rates', show: can(user?.role, 'view_costs') },
    { key: 'users', label: 'Users & Access', show: can(user?.role, 'manage_users') },
    { key: 'settings', label: 'Settings', show: can(user?.role, 'manage_settings') },
    { key: 'audit', label: 'Audit Log', show: can(user?.role, 'view_reports') },
  ];
  const tabs = allTabs.filter((t) => t.show);

  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'suppliers');

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2 border-b border-ink-100 pb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.key ? 'bg-teal-500 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'health' && <MasterDataHealth />}
      {tab === 'suppliers' && <Suppliers />}
      {tab === 'rates' && <CountryRates />}
      {tab === 'users' && <Users />}
      {tab === 'settings' && <Settings />}
      {tab === 'audit' && <AuditLogPage />}
    </div>
  );
}
