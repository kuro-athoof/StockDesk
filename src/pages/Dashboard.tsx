import { useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge } from '../components/ui';

const fmt = (n: number) => `MVR ${Math.round(n).toLocaleString()}`;
const fmtQty = (n: number, u?: string) => `${Math.round(n * 100) / 100}${u ? ' ' + u : ''}`;

// ── helpers ──────────────────────────────────────────────────────────────────
function todayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
}

export function Dashboard() {
  const {
    user, scopedBalances, visibleShopIds, shops, products, variants,
    audit, receivings, transfers, stockCounts, productName,
  } = useStore();

  // Cost map: variantId → latest landed cost from receiving
  const costOf = useMemo(() => {
    const m = new Map<string, number>();
    variants.forEach((v) => { if ((v.cost ?? 0) > 0) m.set(v.id, v.cost!); });
    return m;
  }, [variants]);

  // ── CARD 1: Godown Value ───────────────────────────────────────────────────
  const godownValue = useMemo(() => {
    let totalValue = 0; let totalQty = 0;
    const productSet = new Set<string>(); const variantSet = new Set<string>();
    scopedBalances.forEach((b) => {
      const cost = costOf.get(b.variantId) ?? 0;
      totalValue += b.quantity * cost;
      totalQty   += b.quantity;
      if (b.productId) productSet.add(b.productId);
      if (b.variantId) variantSet.add(b.variantId);
    });
    return { totalValue, totalQty: Math.round(totalQty * 100) / 100, products: productSet.size, variants: variantSet.size };
  }, [scopedBalances, costOf]);

  // ── CARD 2: Today's Receiving ──────────────────────────────────────────────
  const todayReceiving = useMemo(() => {
    const start = todayStart();
    const todays = receivings.filter(
      (r) => r.status === 'posted' && (r.postedAt ?? r.createdAt ?? 0) >= start
               && visibleShopIds.includes(r.ownerShopId ?? ''),
    );
    let totalQty = 0; let totalValue = 0;
    todays.forEach((r) => r.lines.forEach((l) => {
      totalQty   += l.quantity ?? 0;
      totalValue += l.totalCost ?? 0;
    }));
    return { count: todays.length, totalQty: Math.round(totalQty * 100) / 100, totalValue: Math.round(totalValue * 100) / 100 };
  }, [receivings, visibleShopIds]);

  // ── CARD 3: Today's Transfers ──────────────────────────────────────────────
  const todayTransfers = useMemo(() => {
    const start = todayStart();
    const todays = transfers.filter(
      (t) => (t.status === 'sent' || t.status === 'received')
              && (t.sentAt ?? t.createdAt ?? 0) >= start
              && visibleShopIds.includes(t.fromShopId),
    );
    let totalQty = 0;
    todays.forEach((t) => t.lines.forEach((l) => { totalQty += l.quantity ?? 0; }));
    return { count: todays.length, totalQty: Math.round(totalQty * 100) / 100 };
  }, [transfers, visibleShopIds]);

  // ── CARD 4: Low Stock (top 10 lowest) ─────────────────────────────────────
  const lowStock = useMemo(() => {
    return scopedBalances
      .map((b) => {
        const v = variants.find((x) => x.id === b.variantId);
        return { barcode: v?.barcode ?? '—', label: productName(b.productId) + ' · ' + (v?.label ?? ''), qty: b.quantity, uom: b.unit };
      })
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 10);
  }, [scopedBalances, variants, productName]);

  // ── CARD 5: Largest Stock Value (top 10) ──────────────────────────────────
  const largestValue = useMemo(() => {
    return scopedBalances
      .map((b) => {
        const v = variants.find((x) => x.id === b.variantId);
        const value = b.quantity * (costOf.get(b.variantId) ?? 0);
        return { barcode: v?.barcode ?? '—', label: productName(b.productId) + ' · ' + (v?.label ?? ''), value: Math.round(value * 100) / 100 };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [scopedBalances, variants, productName, costOf]);

  // ── CARD 6: Recent Activity (last 10 across all types) ────────────────────
  const recentActivity = useMemo(() => {
    return audit
      .filter((a) => visibleShopIds.includes(a.ownerShopId) && a.qtyChanged !== 0)
      .slice(0, 10)
      .map((a) => {
        const v = variants.find((x) => x.id === a.variantId);
        return {
          time: a.timestamp,
          action: a.action.replace(/_/g, ' '),
          variant: v ? `${productName(v.productId)} · ${v.label}` : a.productId,
          qty: a.qtyChanged,
          uom: v?.uom ?? '',
        };
      });
  }, [audit, visibleShopIds, variants, productName]);

  // ── CARD 7: Drafts Waiting ─────────────────────────────────────────────────
  const drafts = useMemo(() => {
    const rcvDrafts = receivings.filter((r) => r.status === 'draft' && visibleShopIds.includes(r.ownerShopId ?? '')).length;
    const tfrDrafts = transfers.filter((t) => t.status === 'draft' && visibleShopIds.includes(t.fromShopId)).length;
    const cntDrafts = stockCounts.filter((c) => c.status === 'open' && visibleShopIds.includes(c.shopId)).length;
    return { rcvDrafts, tfrDrafts, cntDrafts, total: rcvDrafts + tfrDrafts + cntDrafts };
  }, [receivings, transfers, stockCounts, visibleShopIds]);

  // ── CARD 8: Quick Summary ─────────────────────────────────────────────────
  const summary = useMemo(() => ({
    products: products.length,
    variants: variants.length,
    totalQty: Math.round(scopedBalances.reduce((s, b) => s + b.quantity, 0) * 100) / 100,
    totalValue: Math.round(scopedBalances.reduce((s, b) => s + b.quantity * (costOf.get(b.variantId) ?? 0), 0) * 100) / 100,
  }), [products, variants, scopedBalances, costOf]);

  const visibleShops = shops.filter((s) => visibleShopIds.includes(s.id));

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name.split(' ')[0]}`}
        subtitle={`${visibleShops.map((s) => s.name).join(', ') || 'no shops'} · ${new Date().toLocaleDateString()}`}
      />

      {/* Row 1: 4 stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Card 1: Godown Value */}
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Godown Value</div>
          <div className="mt-1 text-2xl font-bold text-teal-600">{fmt(godownValue.totalValue)}</div>
          <div className="mt-2 flex gap-3 text-xs text-ink-400">
            <span><b className="text-ink-700">{godownValue.products}</b> products</span>
            <span><b className="text-ink-700">{godownValue.variants}</b> variants</span>
          </div>
        </div>

        {/* Card 2: Today's Receiving */}
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Today's Receiving</div>
          <div className="mt-1 text-2xl font-bold text-ink-900">{todayReceiving.count}</div>
          <div className="mt-2 flex gap-3 text-xs text-ink-400">
            <span><b className="text-ink-700">{todayReceiving.totalQty}</b> qty in</span>
            <span><b className="text-ink-700">{fmt(todayReceiving.totalValue)}</b></span>
          </div>
        </div>

        {/* Card 3: Today's Transfers */}
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Today's Moves</div>
          <div className="mt-1 text-2xl font-bold text-ink-900">{todayTransfers.count}</div>
          <div className="mt-2 text-xs text-ink-400">
            <b className="text-ink-700">{todayTransfers.totalQty}</b> qty moved out
          </div>
        </div>

        {/* Card 7: Drafts Waiting */}
        <div className={`card p-4 ${drafts.total > 0 ? 'border-amber-200 bg-amber-50/50' : ''}`}>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Drafts Waiting</div>
          <div className={`mt-1 text-2xl font-bold ${drafts.total > 0 ? 'text-amber-600' : 'text-ink-400'}`}>{drafts.total}</div>
          <div className="mt-2 flex gap-2 text-xs text-ink-400">
            {drafts.rcvDrafts > 0 && <span><b className="text-amber-700">{drafts.rcvDrafts}</b> rcv</span>}
            {drafts.tfrDrafts > 0 && <span><b className="text-amber-700">{drafts.tfrDrafts}</b> move</span>}
            {drafts.cntDrafts > 0 && <span><b className="text-amber-700">{drafts.cntDrafts}</b> count</span>}
            {drafts.total === 0 && <span>all clear</span>}
          </div>
        </div>
      </div>

      {/* Row 2: 3-column grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Card 4: Low Stock */}
        <div className="card p-4 lg:col-span-1">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Low Stock <span className="text-ink-400 font-normal">(lowest 10)</span></h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                <th className="pb-1.5">Barcode</th><th className="pb-1.5">Variant</th><th className="pb-1.5 text-right">Qty</th><th className="pb-1.5">UOM</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((r, i) => (
                <tr key={i} className="border-t border-ink-50">
                  <td className="py-1 font-mono text-ink-500">{r.barcode}</td>
                  <td className="py-1 max-w-[120px] truncate text-ink-700">{r.label}</td>
                  <td className={`py-1 text-right font-bold ${r.qty <= 0 ? 'text-red-500' : 'text-amber-600'}`}>{r.qty}</td>
                  <td className="py-1 text-ink-400">{r.uom}</td>
                </tr>
              ))}
              {lowStock.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-ink-400">No stock yet</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Card 5: Largest Stock Value */}
        <div className="card p-4 lg:col-span-1">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Largest Stock Value <span className="text-ink-400 font-normal">(top 10)</span></h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                <th className="pb-1.5">Barcode</th><th className="pb-1.5">Variant</th><th className="pb-1.5 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {largestValue.map((r, i) => (
                <tr key={i} className="border-t border-ink-50">
                  <td className="py-1 font-mono text-ink-500">{r.barcode}</td>
                  <td className="py-1 max-w-[120px] truncate text-ink-700">{r.label}</td>
                  <td className="py-1 text-right font-bold text-teal-700">{fmt(r.value)}</td>
                </tr>
              ))}
              {largestValue.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-ink-400">No stock yet</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Card 8: Quick Summary */}
        <div className="card p-4 lg:col-span-1">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Quick Summary</h3>
          <div className="space-y-3">
            <SummaryRow label="Products" value={String(summary.products)} />
            <SummaryRow label="Variants" value={String(summary.variants)} />
            <SummaryRow label="Total Qty in Godown" value={fmtQty(summary.totalQty)} />
            <SummaryRow label="Total Godown Value" value={fmt(summary.totalValue)} accent />
          </div>
        </div>
      </div>

      {/* Row 3: Activity */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Card 6: Recent Activity */}
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Recent Activity</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                <th className="pb-1.5">Time</th><th className="pb-1.5">Action</th><th className="pb-1.5">Variant</th><th className="pb-1.5 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((a, i) => (
                <tr key={i} className="border-t border-ink-50">
                  <td className="py-1 text-ink-400">{new Date(a.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-1 capitalize text-ink-600">{a.action.toLowerCase()}</td>
                  <td className="py-1 max-w-[160px] truncate text-ink-700">{a.variant}</td>
                  <td className={`py-1 text-right font-bold ${a.qty >= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                    {a.qty > 0 ? '+' : ''}{a.qty} {a.uom}
                  </td>
                </tr>
              ))}
              {recentActivity.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-ink-400">No activity yet</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Top Moving / Slow Moving side-by-side mini cards */}
        <div className="flex flex-col gap-4">
          <TopMoving audit={audit} visibleShopIds={visibleShopIds} variants={variants} productName={productName} />
          <SlowMoving scopedBalances={scopedBalances} audit={audit} visibleShopIds={visibleShopIds} variants={variants} productName={productName} />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function TopMoving({ audit, visibleShopIds, variants, productName }: {
  audit: ReturnType<typeof useStore>['audit'];
  visibleShopIds: string[];
  variants: ReturnType<typeof useStore>['variants'];
  productName: (id: string) => string;
}) {
  const rows = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    const by: Record<string, number> = {};
    audit.filter((a) => a.timestamp >= cutoff && visibleShopIds.includes(a.ownerShopId) && a.action === 'TRANSFER_OUT')
         .forEach((a) => { by[a.variantId] = (by[a.variantId] ?? 0) + Math.abs(a.qtyChanged); });
    return Object.entries(by).map(([vid, qty]) => {
      const v = variants.find((x) => x.id === vid);
      return { label: v ? `${productName(v.productId)} · ${v.label}` : vid, qty, uom: v?.uom ?? '' };
    }).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [audit, visibleShopIds, variants, productName]);

  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-bold text-ink-900">Top Moving <span className="text-ink-400 font-normal text-xs">(30 days, transfers out)</span></h3>
      {rows.length === 0 ? <p className="text-xs text-ink-400">No transfers in 30 days</p> : rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between border-t border-ink-50 py-1 text-xs">
          <span className="truncate text-ink-700 max-w-[180px]">{r.label}</span>
          <Badge tone="ok">{r.qty} {r.uom}</Badge>
        </div>
      ))}
    </div>
  );
}

function SlowMoving({ scopedBalances, audit, visibleShopIds, variants, productName }: {
  scopedBalances: ReturnType<typeof useStore>['scopedBalances'];
  audit: ReturnType<typeof useStore>['audit'];
  visibleShopIds: string[];
  variants: ReturnType<typeof useStore>['variants'];
  productName: (id: string) => string;
}) {
  const rows = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    const movedSet = new Set(
      audit.filter((a) => a.timestamp >= cutoff && a.action === 'TRANSFER_OUT').map((a) => a.variantId),
    );
    return scopedBalances
      .filter((b) => b.quantity > 0 && !movedSet.has(b.variantId))
      .map((b) => {
        const v = variants.find((x) => x.id === b.variantId);
        const lastMove = audit.filter((a) => a.variantId === b.variantId && a.action === 'TRANSFER_OUT')
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        const days = lastMove ? Math.floor((Date.now() - lastMove.timestamp) / 86400_000) : null;
        return { label: v ? `${productName(b.productId)} · ${v.label}` : b.variantId, days };
      })
      .slice(0, 5);
  }, [scopedBalances, audit, visibleShopIds, variants, productName]);

  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-bold text-ink-900">Slow Moving <span className="text-ink-400 font-normal text-xs">(no transfer 30d)</span></h3>
      {rows.length === 0 ? <p className="text-xs text-ink-400">All variants moved recently</p> : rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between border-t border-ink-50 py-1 text-xs">
          <span className="truncate text-ink-700 max-w-[180px]">{r.label}</span>
          <Badge tone="neutral">{r.days != null ? `${r.days}d ago` : 'never moved'}</Badge>
        </div>
      ))}
    </div>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
      <span className="text-xs text-ink-500">{label}</span>
      <span className={`text-sm font-bold ${accent ? 'text-teal-700' : 'text-ink-800'}`}>{value}</span>
    </div>
  );
}
