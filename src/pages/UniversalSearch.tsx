import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { PageHeader, EmptyState } from '../components/ui';

export function UniversalSearch() {
  const [params] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const {
    variants, products, suppliers, audit, productName, visibleShopIds, scopedBalances,
  } = useStore();

  useEffect(() => { setQ(initial); }, [initial]);

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.trim().toLowerCase();
    const scored = variants.map((v) => {
      const p = products.find((x) => x.id === v.productId);
      const sup = p?.supplierId ? suppliers.find((s) => s.id === p.supplierId) : undefined;
      const barcode = (v.barcode ?? '').toLowerCase();
      const hay = [
        v.barcode, v.label, v.ourColorNumber, v.supplierColorNumber,
        v.colorName, v.colorFamily, v.designNumber, v.collection,
        p?.name, p?.category, sup?.name,
      ].join(' ').toLowerCase();
      if (!hay.includes(needle)) return null;
      let rank = 3;
      if (barcode === needle) rank = 0;
      else if (barcode.startsWith(needle)) rank = 1;
      else if ((p?.name ?? '').toLowerCase().startsWith(needle) || v.label.toLowerCase().startsWith(needle)) rank = 2;
      return { v, rank };
    }).filter(Boolean) as { v: typeof variants[number]; rank: number }[];
    scored.sort((a, b) => a.rank - b.rank);
    return scored.map((s) => s.v).slice(0, 40);
  }, [q, variants, products, suppliers]);

  return (
    <div>
      <PageHeader title="Search" subtitle="Product, variant, barcode, color #, supplier color #, color name, design code" />

      <input
        autoFocus
        className="input mb-6 max-w-2xl text-lg"
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {q.trim() && matches.length === 0 && (
        <EmptyState title="No match found" hint="Try product name, barcode, color number, or supplier color #." />
      )}

      <div className="space-y-3">
        {matches.map((v) => {
          const p = products.find((x) => x.id === v.productId);
          const sup = p?.supplierId ? suppliers.find((s) => s.id === p.supplierId) : undefined;
          const isFabric = p?.type === 'fabric';
          const all = audit.filter((a) => a.variantId === v.id && visibleShopIds.includes(a.ownerShopId));
          const lastRcv = all.filter((a) => a.action === 'RECEIVE').sort((a, b) => b.timestamp - a.timestamp)[0];
          const lastOut = all.filter((a) => a.action === 'TRANSFER_OUT').sort((a, b) => b.timestamp - a.timestamp)[0];
          return (
            <div key={v.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-bold text-ink-900">{productName(v.productId)}</div>
                  <div className="text-sm text-ink-500">
                    {v.colorName ?? v.label}
                    {v.ourColorNumber && <span> · Our #{v.ourColorNumber}</span>}
                    {v.supplierColorNumber && <span> · Sup #{v.supplierColorNumber}</span>}
                  </div>
                </div>
                <div className="font-mono text-sm font-semibold text-ink-700">{v.barcode ?? '—'}</div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-500">
                {v.designNumber && <span>Design: <b className="text-ink-700">{v.designNumber}</b></span>}
                {v.collection && <span>Collection: <b className="text-ink-700">{v.collection}</b></span>}
                {sup && <span>Supplier: <b className="text-ink-700">{sup.name}</b></span>}
                {p?.category && <span>Category: <b className="text-ink-700">{p.category}</b></span>}
              </div>

              {isFabric && (
                <div className="mt-3 grid grid-cols-4 gap-3 text-center">
                  {(() => {
                    // P3: stock_balances is the source of truth for current qty
                    const vBals = scopedBalances.filter((b) => b.variantId === v.id);
                    const balQty = Math.round(vBals.reduce((s, b) => s + b.quantity, 0) * 100) / 100;
                    const balPcs = vBals.reduce((s, b) => s + (b.rollCount ?? 0), 0);
                    return (<>
                      <div className="rounded-lg bg-ink-50 p-2">
                        <div className="text-[10px] text-ink-400">PCS</div>
                        <div className="font-bold text-ink-900">{balPcs}</div>
                      </div>
                      <div className="rounded-lg bg-ink-50 p-2">
                        <div className="text-[10px] text-ink-400">Total Qty</div>
                        <div className="font-bold text-ink-900">{balQty} <span className="text-xs font-normal text-ink-400">{v.uom}</span></div>
                      </div>
                      <div className="rounded-lg bg-ink-50 p-2">
                        <div className="text-[10px] text-ink-400">Cost</div>
                        <div className="font-bold text-ink-900">{v.cost?.toFixed(2) ?? '—'}</div>
                      </div>
                      <div className="rounded-lg bg-teal-50 p-2">
                        <div className="text-[10px] text-teal-600">Value</div>
                        <div className="font-bold text-teal-700">{Math.round(balQty * (v.cost ?? 0)).toLocaleString()}</div>
                      </div>
                    </>);
                  })()}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-400">
                <span>Last receive: <b className="text-ink-600">{lastRcv ? new Date(lastRcv.timestamp).toLocaleDateString() : '—'}</b></span>
                <span>Last transfer: <b className="text-ink-600">{lastOut ? new Date(lastOut.timestamp).toLocaleDateString() : '—'}</b></span>
                {v.lastReceiveDate && !lastRcv && <span>Received: <b className="text-ink-600">{new Date(v.lastReceiveDate).toLocaleDateString()}</b></span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
