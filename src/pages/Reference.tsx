import { useStore } from '../context/StoreContext';
import { PageHeader, Badge } from '../components/ui';
import { computeFormulaRate } from '../lib/costing';
import { ROLE_LABELS } from '../types';

export function Suppliers() {
  const { suppliers, products } = useStore();
  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Vendors and their countries of origin" />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3 text-right">Products</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-3 font-semibold text-ink-800">{s.name}</td>
                <td className="px-4 py-3 text-ink-600">{s.country}</td>
                <td className="px-4 py-3 text-right text-ink-600">
                  {products.filter((p) => p.supplierId === s.id).length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CountryRates() {
  const { rates } = useStore();
  return (
    <div>
      <PageHeader title="Country Rates" subtitle="Inventory costing rates — same logic as PurchaseDesk" />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Currency</th>
              <th className="px-4 py-3 text-right">Cur/USD</th>
              <th className="px-4 py-3 text-right">MVR/USD</th>
              <th className="px-4 py-3 text-right">COF %</th>
              <th className="px-4 py-3 text-right">Markup %</th>
              <th className="px-4 py-3 text-right">GST %</th>
              <th className="px-4 py-3 text-right">Formula</th>
              <th className="px-4 py-3 text-right">Final Rate</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => {
              const formula = computeFormulaRate(r);
              return (
                <tr key={r.id} className="border-b border-ink-50 last:border-0">
                  <td className="px-4 py-3 font-semibold text-ink-800">{r.country}</td>
                  <td className="px-4 py-3 text-ink-600">{r.currencyCode}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{r.currencyPerUsd}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{r.mvrPerUsd}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{r.cofPct}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{r.markupPct}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{r.gstPct}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-500">{formula}</td>
                  <td className="px-4 py-3 text-right font-bold text-teal-600">{r.finalUsedRate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Users() {
  const { user } = useStore();
  // demo: show the static role set
  const rows = [
    { name: 'Ahmed Athoof', role: 'admin', shops: 'All', active: true },
    { name: 'Purchase Manager', role: 'purchase_manager', shops: 'All', active: true },
    { name: 'Flora Manager', role: 'shop_manager', shops: 'Flora', active: true },
    { name: 'Warehouse Staff', role: 'warehouse_staff', shops: 'All', active: true },
    { name: 'Auditor', role: 'auditor', shops: 'All', active: true },
  ] as const;
  return (
    <div>
      <PageHeader title="Users & Access" subtitle="Roles and shop assignments" />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Shops</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-3 font-semibold text-ink-800">
                  {r.name}{user?.name === r.name && <span className="ml-2 text-xs text-teal-600">(you)</span>}
                </td>
                <td className="px-4 py-3 text-ink-600">{ROLE_LABELS[r.role]}</td>
                <td className="px-4 py-3 text-ink-600">{r.shops}</td>
                <td className="px-4 py-3"><Badge tone={r.active ? 'ok' : 'neutral'}>{r.active ? 'Active' : 'Disabled'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
