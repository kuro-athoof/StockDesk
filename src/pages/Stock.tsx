import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge } from '../components/ui';

export function Stock() {
  const {
    scopedBalances, variants, products, shops, suppliers, locations, categories,
    visibleShopIds, settings, shopName, productName,
  } = useStore();
  const [shopFilter, setShopFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [supFilter, setSupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out' | 'ok'>('all');
  const [q, setQ] = useState('');

  const visibleShops = shops.filter((s) => visibleShopIds.includes(s.id));

  const rows = useMemo(() => {
    return scopedBalances
      .filter((b) => shopFilter === 'all' || b.ownerShopId === shopFilter)
      .map((b) => {
        const v = variants.find((x) => x.id === b.variantId);
        const p = products.find((x) => x.id === b.productId);
        const loc = locations.find((l) => l.id === b.locationId);
        return { b, v, p, locLabel: loc?.label ?? '—' };
      })
      .filter(({ p }) => catFilter === 'all' || p?.category === catFilter)
      .filter(({ p }) => supFilter === 'all' || p?.supplierId === supFilter)
      .filter(({ b }) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'out') return b.quantity <= 0;
        if (statusFilter === 'low') return b.quantity > 0 && b.quantity <= settings.lowStockThreshold;
        return b.quantity > settings.lowStockThreshold;
      })
      .filter(({ v, p }) => {
        if (!q) return true;
        const hay = `${p?.name} ${v?.label} ${v?.barcode} ${v?.ourColorNumber} ${v?.designNumber}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
      .sort((a, b) => a.b.quantity - b.b.quantity);
  }, [scopedBalances, variants, products, locations, shopFilter, catFilter, supFilter, statusFilter, q, settings.lowStockThreshold]);

  const tone = (qty: number) => (qty <= 0 ? 'out' : qty <= settings.lowStockThreshold ? 'low' : 'ok');

  return (
    <div>
      <PageHeader title="Stock" subtitle="Live balances by owner shop and location" />

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input max-w-[150px]" value={shopFilter} onChange={(e) => setShopFilter(e.target.value)}>
          <option value="all">All shops</option>
          {visibleShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input max-w-[150px]" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input max-w-[160px]" value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
          <option value="all">All suppliers</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input max-w-[140px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">All status</option>
          <option value="low">Low only</option>
          <option value="out">Out only</option>
          <option value="ok">Healthy only</option>
        </select>
        <input className="input max-w-xs" placeholder="Search variant / barcode…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mb-3 text-xs text-ink-400">{rows.length} rows</div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Product / Variant</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3 text-right">Rolls</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b, v, p, locLabel }) => (
              <tr key={b.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-ink-800">{productName(b.productId)}</div>
                  <div className="text-xs text-ink-400">{v?.label}</div>
                </td>
                <td className="px-4 py-3 text-xs text-ink-500">{p?.category ?? '—'}</td>
                <td className="px-4 py-3 text-ink-600">{shopName(b.ownerShopId)}</td>
                <td className="px-4 py-3 text-xs text-ink-500">{locLabel}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-500">{v?.barcode ?? '—'}</td>
                <td className="px-4 py-3 text-right text-ink-600">{b.rollCount ?? '—'}</td>
                <td className="px-4 py-3 text-right font-bold text-ink-900">{b.quantity} <span className="text-xs font-normal text-ink-400">{b.unit}</span></td>
                <td className="px-4 py-3">
                  <Badge tone={tone(b.quantity)}>{b.quantity <= 0 ? 'Out' : b.quantity <= settings.lowStockThreshold ? 'Low' : 'OK'}</Badge>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-ink-400">No stock matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
