import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge } from '../components/ui';
import { can } from '../lib/permissions';

// Report tabs
type ReportKey = 'low' | 'damaged' | 'receiving' | 'transfers' | 'by_owner' | 'color_map';
const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'low',         label: 'Low Stock' },
  { key: 'damaged',     label: 'Damaged' },
  { key: 'receiving',   label: 'Receiving History' },
  { key: 'transfers',   label: 'Transfer History' },
  { key: 'by_owner',    label: 'Stock by Owner' },
  { key: 'color_map',   label: 'Supplier Color Map' },
];

// Reorder level: no per-variant field exists yet, so use the global low-stock threshold.
const REORDER_LEVEL_FALLBACK = 10;

export function Reports() {
  const {
    scopedBalances, variants, products, audit, settings, shops, suppliers, categories,
    visibleShopIds, shopName, productName, supplierName, damageReports,
    stockCounts, transfers, user,
  } = useStore();

  const showCosts = can(user?.role, 'view_costs'); // Phase 2: cost visibility gate

  const [active, setActive] = useState<ReportKey>('low');
  const [exportOpen, setExportOpen] = useState(false);

  // ── Global filters ──────────────────────────────────────────────────────────
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo]     = useState('');
  const [fOwner, setFOwner]       = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fProduct, setFProduct]   = useState('');
  const [fCategory, setFCategory] = useState('');
  // applied filters (only change when Apply clicked)
  const [applied, setApplied] = useState({ dateFrom: '', dateTo: '', owner: '', supplier: '', product: '', category: '' });

  const visibleShops = shops.filter((s) => visibleShopIds.includes(s.id));
  const reorderLevel = settings.lowStockThreshold ?? REORDER_LEVEL_FALLBACK;

  const applyFilters = () => setApplied({ dateFrom: fDateFrom, dateTo: fDateTo, owner: fOwner, supplier: fSupplier, product: fProduct, category: fCategory });
  const resetFilters = () => {
    setFDateFrom(''); setFDateTo(''); setFOwner(''); setFSupplier(''); setFProduct(''); setFCategory('');
    setApplied({ dateFrom: '', dateTo: '', owner: '', supplier: '', product: '', category: '' });
  };

  // ── Helpers: does a balance/audit row pass the applied filters? ──────────────
  const matchesProductFilters = (productId: string, ownerShopId?: string) => {
    const p = products.find((x) => x.id === productId);
    if (applied.owner && ownerShopId && ownerShopId !== applied.owner) return false;
    if (applied.supplier && p?.supplierId !== applied.supplier) return false;
    if (applied.product && productId !== applied.product) return false;
    if (applied.category && p?.category !== applied.category) return false;
    return true;
  };
  const inDateRange = (ts: number) => {
    if (applied.dateFrom && ts < new Date(applied.dateFrom).getTime()) return false;
    if (applied.dateTo && ts > new Date(applied.dateTo).getTime() + 86400_000) return false;
    return true;
  };

  // Balances passing filters (owner/supplier/product/category) — date doesn't apply to live balances.
  const filteredBalances = useMemo(
    () => scopedBalances.filter((b) => matchesProductFilters(b.productId, b.ownerShopId)),
    [scopedBalances, applied, products],
  );

  // ── Executive KPIs ───────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalVariants = new Set(filteredBalances.map((b) => b.variantId)).size;
    const totalQty   = filteredBalances.reduce((s, b) => s + b.quantity, 0);
    const totalRolls = filteredBalances.reduce((s, b) => s + (b.rollCount ?? 0), 0);
    const totalCost  = filteredBalances.reduce((s, b) => {
      const v = variants.find((x) => x.id === b.variantId);
      return s + b.quantity * (v?.cost ?? 0);
    }, 0);
    const lowStock = filteredBalances.filter((b) => b.quantity > 0 && b.quantity <= reorderLevel).length;
    const damagedPending = damageReports.filter((d) => d.status === 'pending' && visibleShopIds.includes(d.shopId)).length;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const transfersToday = audit.filter((a) => a.action === 'TRANSFER_OUT' && a.timestamp >= todayStart.getTime() && visibleShopIds.includes(a.ownerShopId)).length;
    const countsPending = stockCounts.filter((c) => c.status === 'submitted' && visibleShopIds.includes(c.shopId)).length;
    return { totalVariants, totalQty: Math.round(totalQty * 100) / 100, totalRolls, totalCost: Math.round(totalCost), lowStock, damagedPending, transfersToday, countsPending };
  }, [filteredBalances, variants, damageReports, audit, stockCounts, visibleShopIds, reorderLevel]);

  return (
    <div>
      <PageHeader
        title="Reports Center"
        subtitle="Operational inventory reports — sourced from stock_balances, audit_logs, and damage_reports"
        action={
          <div className="relative">
            <button className="btn-ghost flex items-center gap-1" onClick={() => setExportOpen((o) => !o)}>
              Export ▼
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 z-40 mt-1 w-56 rounded-xl border border-ink-100 bg-white p-2 shadow-xl">
                  {(['Excel', 'PDF', 'CSV'] as const).map((fmt) => (
                    <div key={fmt} className="rounded-lg p-1 hover:bg-ink-50">
                      <div className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-ink-400">{fmt}</div>
                      {(['Current Report', 'Full Report', 'Summary Only'] as const).map((scope) => (
                        <button key={scope}
                          className="block w-full rounded px-3 py-1.5 text-left text-sm text-ink-600 hover:bg-teal-50 hover:text-teal-700"
                          onClick={() => { alert(`Export ${fmt} · ${scope} — backend generation coming in V2`); setExportOpen(false); }}>
                          {scope}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        }
      />

      {/* ── Executive KPI cards ── */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Variants"  value={kpis.totalVariants.toLocaleString()} />
        <Kpi label="Total Qty"       value={kpis.totalQty.toLocaleString()} />
        <Kpi label="Total Rolls/PCS" value={kpis.totalRolls.toLocaleString()} />
        {showCosts && <Kpi label="Total Cost Value" value={`MVR ${kpis.totalCost.toLocaleString()}`} accent />}
        <Kpi label="Low Stock Items" value={String(kpis.lowStock)} tone={kpis.lowStock > 0 ? 'amber' : 'green'} />
        <Kpi label="Damaged Pending" value={String(kpis.damagedPending)} tone={kpis.damagedPending > 0 ? 'red' : 'green'} />
        <Kpi label="Transfers Today" value={String(kpis.transfersToday)} />
        <Kpi label="Counts Pending"  value={String(kpis.countsPending)} tone={kpis.countsPending > 0 ? 'amber' : 'green'} />
      </div>

      {/* ── Global filter bar ── */}
      <div className="card mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FilterField label="Date From"><input type="date" className="input" value={fDateFrom} onChange={(e) => setFDateFrom(e.target.value)} /></FilterField>
          <FilterField label="Date To"><input type="date" className="input" value={fDateTo} onChange={(e) => setFDateTo(e.target.value)} /></FilterField>
          <FilterField label="Owner">
            <select className="input" value={fOwner} onChange={(e) => setFOwner(e.target.value)}>
              <option value="">All owners</option>
              {visibleShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Supplier">
            <select className="input" value={fSupplier} onChange={(e) => setFSupplier(e.target.value)}>
              <option value="">All suppliers</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Product">
            <select className="input" value={fProduct} onChange={(e) => setFProduct(e.target.value)}>
              <option value="">All products</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Category">
            <select className="input" value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FilterField>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost" onClick={resetFilters}>Reset Filters</button>
          <button className="btn-primary" onClick={applyFilters}>Apply Filters</button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button key={r.key} onClick={() => setActive(r.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${active === r.key ? 'bg-teal-500 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'}`}>
            {r.label}
          </button>
        ))}
      </div>

      {/* ── LOW STOCK ── */}
      {active === 'low' && (
        <LowStockReport balances={filteredBalances} variants={variants} reorderLevel={reorderLevel}
          productName={productName} shopName={shopName} />
      )}

      {/* ── DAMAGED ── */}
      {active === 'damaged' && (
        <DamagedReport reports={damageReports.filter((d) => visibleShopIds.includes(d.shopId) && matchesProductFilters(d.productId, d.shopId) && inDateRange(d.reportedAt))}
          variants={variants} productName={productName} showCosts={showCosts} />
      )}

      {/* ── RECEIVING HISTORY ── */}
      {active === 'receiving' && (
        <AuditReport
          title="Receiving History"
          rows={audit.filter((a) => a.action === 'RECEIVE' && visibleShopIds.includes(a.ownerShopId) && matchesProductFilters(a.productId, a.ownerShopId) && inDateRange(a.timestamp)).sort((a, b) => b.timestamp - a.timestamp)}
          variants={variants} productName={productName} shopName={shopName} positive />
      )}

      {/* ── TRANSFER HISTORY ── */}
      {active === 'transfers' && (
        <TransferReport
          rows={audit.filter((a) => a.action === 'TRANSFER_OUT' && visibleShopIds.includes(a.ownerShopId) && matchesProductFilters(a.productId, a.ownerShopId) && inDateRange(a.timestamp)).sort((a, b) => b.timestamp - a.timestamp)}
          transfers={transfers} variants={variants} productName={productName} shopName={shopName} />
      )}

      {/* ── STOCK BY OWNER ── */}
      {active === 'by_owner' && (
        <div className="card overflow-x-auto">
          <Table head={showCosts ? ['Owner', 'Variants', 'Total Qty', 'Total Rolls', 'Cost Value'] : ['Owner', 'Variants', 'Total Qty', 'Total Rolls']}>
            {visibleShops.map((s) => {
              const bs = filteredBalances.filter((b) => b.ownerShopId === s.id);
              const qty = bs.reduce((x, b) => x + b.quantity, 0);
              const rolls = bs.reduce((x, b) => x + (b.rollCount ?? 0), 0);
              const value = bs.reduce((x, b) => x + b.quantity * (variants.find((v) => v.id === b.variantId)?.cost ?? 0), 0);
              return (
                <tr key={s.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                  <Td bold>{s.name}</Td><Td>{bs.length}</Td><Td>{qty.toLocaleString()}</Td><Td>{rolls}</Td>
                  {showCosts && <Td>MVR {Math.round(value).toLocaleString()}</Td>}
                </tr>
              );
            })}
          </Table>
        </div>
      )}

      {/* ── SUPPLIER COLOR MAP ── */}
      {active === 'color_map' && (
        <div className="card overflow-x-auto">
          <Table head={['Product', 'Our color #', 'Supplier color #', 'Supplier', 'Barcode']}>
            {variants.filter((v) => v.productType !== 'general' && matchesProductFilters(v.productId)).map((v) => {
              const p = products.find((x) => x.id === v.productId);
              return (
                <tr key={v.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                  <Td bold>{p?.name}</Td><Td>{v.ourColorNumber ?? v.designNumber ?? '—'}</Td>
                  <Td>{v.supplierColorNumber ?? '—'}</Td><Td>{supplierName(p?.supplierId ?? '')}</Td><Td mono>{v.barcode ?? '—'}</Td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── LOW STOCK ────────────────────────────────────────────────────────────────
function LowStockReport({ balances, variants, reorderLevel, productName, shopName }: {
  balances: ReturnType<typeof useStore>['scopedBalances'];
  variants: ReturnType<typeof useStore>['variants'];
  reorderLevel: number;
  productName: (id: string) => string;
  shopName: (id: string) => string;
}) {
  const rows = balances.filter((b) => b.quantity <= reorderLevel).sort((a, b) => a.quantity - b.quantity);
  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {rows.length === 0 && <div className="card p-6 text-center text-sm text-ink-400">No low-stock items.</div>}
        {rows.map((b) => {
          const v = variants.find((x) => x.id === b.variantId);
          const shortBy = Math.max(0, reorderLevel - b.quantity);
          return (
            <div key={b.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div><div className="font-semibold text-ink-800">{productName(b.productId)}</div>
                  <div className="text-xs text-ink-400">{v?.label} · {shopName(b.ownerShopId)}</div></div>
                <Badge tone={b.quantity <= 0 ? 'out' : 'neutral'}>{b.quantity <= 0 ? 'Depleted' : 'Low'}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded bg-ink-50 p-2"><div className="text-ink-400">Qty</div><div className="font-bold">{b.quantity}</div></div>
                <div className="rounded bg-ink-50 p-2"><div className="text-ink-400">Rolls</div><div className="font-bold">{b.rollCount ?? 0}</div></div>
                <div className="rounded bg-ink-50 p-2"><div className="text-ink-400">Reorder</div><div className="font-bold">{reorderLevel}</div></div>
                <div className="rounded bg-amber-50 p-2"><div className="text-amber-500">Short</div><div className="font-bold text-amber-700">{shortBy}</div></div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Desktop table */}
      <div className="card hidden overflow-x-auto md:block">
        <Table head={['Product', 'Variant', 'Owner', 'Qty', 'Rolls', 'Reorder Level', 'Short By']}>
          {rows.map((b) => {
            const v = variants.find((x) => x.id === b.variantId);
            const shortBy = Math.max(0, reorderLevel - b.quantity);
            return (
              <tr key={b.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                <Td bold>{productName(b.productId)}</Td><Td>{v?.label}</Td><Td>{shopName(b.ownerShopId)}</Td>
                <Td>{b.quantity}</Td><Td>{b.rollCount ?? 0}</Td><Td>{reorderLevel}</Td>
                <Td><span className="font-bold text-amber-700">{shortBy}</span></Td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-400">No low-stock items.</td></tr>}
        </Table>
      </div>
    </>
  );
}

// ─── DAMAGED ──────────────────────────────────────────────────────────────────
function DamagedReport({ reports, variants, productName, showCosts }: {
  reports: ReturnType<typeof useStore>['damageReports'];
  variants: ReturnType<typeof useStore>['variants'];
  productName: (id: string) => string;
  showCosts: boolean;
}) {
  const sorted = [...reports].sort((a, b) => b.reportedAt - a.reportedAt);
  // KPIs
  const totalQty = sorted.reduce((s, r) => s + r.reportedQty, 0);
  const totalRolls = sorted.reduce((s, r) => s + r.reportedPcs, 0);
  const lossValue = sorted.reduce((s, r) => {
    const v = variants.find((x) => x.id === r.variantId);
    return s + r.reportedQty * (v?.cost ?? 0);
  }, 0);
  const STATUS_TONE = { pending: 'neutral', approved: 'ok', rejected: 'out' } as const;

  return (
    <div>
      <div className={`mb-4 grid grid-cols-1 gap-3 ${showCosts ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <Kpi label="Total Damaged Qty"   value={Math.round(totalQty * 100) / 100 + ''} tone="red" />
        <Kpi label="Total Damaged Rolls" value={String(totalRolls)} tone="red" />
        {showCosts && <Kpi label="Est. Loss Value"     value={`MVR ${Math.round(lossValue).toLocaleString()}`} tone="red" />}
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {sorted.length === 0 && <div className="card p-6 text-center text-sm text-ink-400">No damage reports.</div>}
        {sorted.map((r) => {
          const v = variants.find((x) => x.id === r.variantId);
          return (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div><div className="font-semibold text-ink-800">{productName(r.productId)}</div>
                  <div className="text-xs text-ink-400">{v?.colorName ?? v?.label}</div></div>
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded bg-red-50 p-2"><div className="text-red-400">Qty</div><div className="font-bold text-red-700">{r.reportedQty} {r.uom}</div></div>
                <div className="rounded bg-ink-50 p-2"><div className="text-ink-400">Rolls</div><div className="font-bold">{r.reportedPcs || '—'}</div></div>
                <div className="rounded bg-ink-50 p-2"><div className="text-ink-400">Reason</div><div className="font-bold truncate">{r.reason}</div></div>
              </div>
              <div className="mt-2 text-xs text-ink-400">{new Date(r.reportedAt).toLocaleDateString()} · {r.reportedByName}{r.approvedBy ? ` · approved` : ''}</div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="card hidden overflow-x-auto md:block">
        <Table head={['Date', 'Product', 'Variant', 'Qty', 'Rolls', 'Reason', 'Created By', 'Approved By', 'Status']}>
          {sorted.map((r) => {
            const v = variants.find((x) => x.id === r.variantId);
            return (
              <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                <Td>{new Date(r.reportedAt).toLocaleDateString()}</Td>
                <Td bold>{productName(r.productId)}</Td><Td>{v?.colorName ?? v?.label}</Td>
                <Td>{r.reportedQty} {r.uom}</Td><Td>{r.reportedPcs || '—'}</Td><Td>{r.reason}</Td>
                <Td>{r.reportedByName}</Td>
                <Td>{r.approvedBy ? (r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : 'yes') : '—'}</Td>
                <Td><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></Td>
              </tr>
            );
          })}
          {sorted.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-400">No damage reports.</td></tr>}
        </Table>
      </div>
    </div>
  );
}

// ─── RECEIVING HISTORY (audit) ────────────────────────────────────────────────
function AuditReport({ title, rows, variants, productName, shopName, positive }: {
  title: string;
  rows: ReturnType<typeof useStore>['audit'];
  variants: ReturnType<typeof useStore>['variants'];
  productName: (id: string) => string;
  shopName: (id: string) => string;
  positive?: boolean;
}) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.length === 0 && <div className="card p-6 text-center text-sm text-ink-400">No {title.toLowerCase()} records.</div>}
        {rows.map((a) => {
          const v = variants.find((x) => x.id === a.variantId);
          return (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div><div className="font-semibold text-ink-800">{productName(a.productId)}</div>
                  <div className="text-xs text-ink-400">{v?.label} · {shopName(a.ownerShopId)}</div></div>
                <span className={`font-bold ${positive ? 'text-teal-600' : 'text-red-500'}`}>{positive ? '+' : ''}{a.qtyChanged}</span>
              </div>
              <div className="mt-1 text-xs text-ink-400">{new Date(a.timestamp).toLocaleString()} · {a.userName}</div>
            </div>
          );
        })}
      </div>
      <div className="card hidden overflow-x-auto md:block">
        <Table head={['Date', 'Product', 'Variant', 'Qty', 'Rolls', 'User', 'Notes']}>
          {rows.map((a) => {
            const v = variants.find((x) => x.id === a.variantId);
            // rolls delta is encoded in remarks for some actions; show qty primarily
            return (
              <tr key={a.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                <Td>{new Date(a.timestamp).toLocaleDateString()}</Td>
                <Td bold>{productName(a.productId)}</Td><Td>{v?.label}</Td>
                <Td><span className="font-bold text-teal-600">+{a.qtyChanged}</span></Td>
                <Td>—</Td><Td>{a.userName}</Td>
                <Td><span className="text-xs text-ink-400">{a.remarks ?? '—'}</span></Td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-400">No records.</td></tr>}
        </Table>
      </div>
    </>
  );
}

// ─── TRANSFER HISTORY ─────────────────────────────────────────────────────────
function TransferReport({ rows, transfers, variants, productName, shopName }: {
  rows: ReturnType<typeof useStore>['audit'];
  transfers: ReturnType<typeof useStore>['transfers'];
  variants: ReturnType<typeof useStore>['variants'];
  productName: (id: string) => string;
  shopName: (id: string) => string;
}) {
  // Resolve destination owner from the transfer record via refId when available.
  const destOf = (refId?: string) => {
    if (!refId) return undefined;
    const t = transfers.find((x) => x.transferNo === refId || x.id === refId);
    return t ? shopName(t.toShopId) : undefined;
  };
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.length === 0 && <div className="card p-6 text-center text-sm text-ink-400">No transfers.</div>}
        {rows.map((a) => {
          const v = variants.find((x) => x.id === a.variantId);
          return (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div><div className="font-semibold text-ink-800">{productName(a.productId)}</div>
                  <div className="text-xs text-ink-400">{v?.label}</div></div>
                <span className="font-bold text-red-500">−{Math.abs(a.qtyChanged)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-400">
                <span>From: {shopName(a.ownerShopId)}</span>
                {destOf(a.refId) && <span>To: {destOf(a.refId)}</span>}
                <span>{new Date(a.timestamp).toLocaleDateString()}</span>
                <span>{a.userName}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="card hidden overflow-x-auto md:block">
        <Table head={['Date', 'Product', 'Variant', 'From Owner', 'To Owner', 'Qty', 'Rolls', 'User']}>
          {rows.map((a) => {
            const v = variants.find((x) => x.id === a.variantId);
            return (
              <tr key={a.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                <Td>{new Date(a.timestamp).toLocaleDateString()}</Td>
                <Td bold>{productName(a.productId)}</Td><Td>{v?.label}</Td>
                <Td>{shopName(a.ownerShopId)}</Td><Td>{destOf(a.refId) ?? '—'}</Td>
                <Td><span className="font-bold text-red-500">{Math.abs(a.qtyChanged)}</span></Td>
                <Td>—</Td><Td>{a.userName}</Td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-ink-400">No transfers.</td></tr>}
        </Table>
      </div>
    </>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Kpi({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: 'green' | 'amber' | 'red' }) {
  const colour = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-teal-600' : accent ? 'text-teal-600' : 'text-ink-900';
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${colour}`}>{value}</div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</label>
      {children}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
          {head.map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({ children, bold, mono }: { children: React.ReactNode; bold?: boolean; mono?: boolean }) {
  return <td className={`px-4 py-3 ${bold ? 'font-semibold text-ink-800' : 'text-ink-600'} ${mono ? 'font-mono text-xs' : ''}`}>{children}</td>;
}
