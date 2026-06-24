import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge } from '../components/ui';
import { can } from '../lib/permissions';
import { sanitizeRemarks } from '../lib/sanitizeRemarks';
import type { MovementAction } from '../types';

const ACTIONS: MovementAction[] = [
  'RECEIVE', 'INTERNAL_MOVEMENT', 'OWNERSHIP_TRANSFER', 'TRANSFER_OUT', 'ADJUSTMENT',
  'STOCK_COUNT_CORRECTION', 'NEGATIVE_OVERRIDE',
];

const ACTION_TONE: Record<string, 'ok' | 'info' | 'low' | 'out' | 'neutral'> = {
  RECEIVE: 'ok', INTERNAL_MOVEMENT: 'info', OWNERSHIP_TRANSFER: 'info', TRANSFER_OUT: 'out',
  ADJUSTMENT: 'low', STOCK_COUNT_CORRECTION: 'low', NEGATIVE_OVERRIDE: 'out',
};

export function AuditLogPage() {
  const { audit, users, products, shops, visibleShopIds, shopName, productName, user } = useStore();
  const showCosts = can(user?.role, 'view_costs');
  const [userF, setUserF] = useState('all');
  const [actionF, setActionF] = useState('all');
  const [shopF, setShopF] = useState('all');
  const [productF, setProductF] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const visibleShops = shops.filter((s) => visibleShopIds.includes(s.id));

  const rows = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() : 0;
    const toTs = to ? new Date(to).getTime() + 86_400_000 : Infinity;
    return audit
      .filter((a) => visibleShopIds.includes(a.ownerShopId))   // scoping
      .filter((a) => userF === 'all' || a.userId === userF)
      .filter((a) => actionF === 'all' || a.action === actionF)
      .filter((a) => shopF === 'all' || a.ownerShopId === shopF)
      .filter((a) => productF === 'all' || a.productId === productF)
      .filter((a) => a.timestamp >= fromTs && a.timestamp <= toTs)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [audit, visibleShopIds, userF, actionF, shopF, productF, from, to]);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Every stock movement — immutable, append-only" />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <select className="input" value={userF} onChange={(e) => setUserF(e.target.value)}>
          <option value="all">All users</option>
          {users.map((u) => <option key={u.uid} value={u.uid}>{u.name}</option>)}
        </select>
        <select className="input" value={actionF} onChange={(e) => setActionF(e.target.value)}>
          <option value="all">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="input" value={shopF} onChange={(e) => setShopF(e.target.value)}>
          <option value="all">All shops</option>
          {visibleShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input" value={productF} onChange={(e) => setProductF(e.target.value)}>
          <option value="all">All products</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Shop</th>
              <th className="px-4 py-3 text-right">Before</th>
              <th className="px-4 py-3 text-right">Change</th>
              <th className="px-4 py-3 text-right">After</th>
              <th className="px-4 py-3">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                <td className="px-4 py-3 whitespace-nowrap text-xs text-ink-500">{new Date(a.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3 text-ink-600">{a.userName}</td>
                <td className="px-4 py-3"><Badge tone={ACTION_TONE[a.action] ?? 'neutral'}>{a.action.replace(/_/g, ' ')}</Badge></td>
                <td className="px-4 py-3 text-ink-700">{productName(a.productId)}</td>
                <td className="px-4 py-3 text-ink-600">{shopName(a.ownerShopId)}</td>
                <td className="px-4 py-3 text-right text-ink-500">{a.qtyBefore}</td>
                <td className={`px-4 py-3 text-right font-semibold ${a.qtyChanged > 0 ? 'text-teal-600' : a.qtyChanged < 0 ? 'text-red-500' : 'text-ink-400'}`}>
                  {a.qtyChanged > 0 ? '+' : ''}{a.qtyChanged || '—'}
                </td>
                <td className="px-4 py-3 text-right font-bold text-ink-900">{a.qtyAfter}</td>
                <td className="px-4 py-3 text-xs text-ink-400">{sanitizeRemarks(a.remarks, showCosts)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-400">No audit entries match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
