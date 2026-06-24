import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, EmptyState } from '../components/ui';

export function BarcodeLookup() {
  const [params] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  // Sync local input when the URL ?q= changes, without an effect (avoids the
  // cascading-render lint). React's "adjust state during render" pattern.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setQ(initial);
  }
  const {
    variants, scopedBalances, locations, products,
    shopName, productName, lastMovementOf, visibleShopIds,
  } = useStore();

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.trim().toLowerCase();
    return variants.filter((v) => {
      const p = products.find((x) => x.id === v.productId);
      const hay = [
        v.barcode, v.label, v.ourColorNumber, v.supplierColorNumber,
        v.designNumber, p?.name,
      ].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [q, variants, products]);

  return (
    <div>
      <PageHeader title="Barcode Lookup" subtitle="Scan or type a barcode, color #, design #, or product name" />

      <input
        autoFocus
        className="input mb-6 max-w-lg text-lg"
        placeholder="Scan barcode…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {q.trim() && matches.length === 0 && (
        <EmptyState title="No match found" hint="Check the barcode or try a product name." />
      )}

      <div className="space-y-4">
        {matches.map((v) => {
          // Only show balances in shops the user may see.
          const bs = scopedBalances.filter((b) => b.variantId === v.id);
          const lastMove = lastMovementOf(v.id);
          const moveVisible = lastMove && visibleShopIds.includes(lastMove.ownerShopId);
          return (
            <div key={v.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-ink-900">{productName(v.productId)}</div>
                  <div className="text-sm text-ink-500">{v.label}</div>
                </div>
                <div className="font-mono text-sm text-ink-400">{v.barcode}</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {bs.map((b) => {
                  const loc = locations.find((l) => l.id === b.locationId);
                  return (
                    <div key={b.id} className="rounded-lg bg-ink-50 p-3">
                      <div className="text-xs font-semibold text-ink-400">{shopName(b.ownerShopId)}</div>
                      <div className="mt-1 text-lg font-bold text-ink-900">{b.quantity} <span className="text-xs font-normal text-ink-400">{b.unit}</span></div>
                      {b.rollCount != null && b.rollCount > 0 && <div className="text-xs text-ink-400">{b.rollCount} PCS</div>}
                      <div className="mt-1 text-[11px] text-ink-400">{loc?.label ?? 'No location'}</div>
                    </div>
                  );
                })}
                {bs.length === 0 && <div className="text-sm text-ink-400">No stock in your shops.</div>}
              </div>

              {moveVisible && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                  <Badge tone="info">Last movement</Badge>
                  {lastMove!.action.replace(/_/g, ' ')} · {lastMove!.userName} · {shopName(lastMove!.ownerShopId)} · {new Date(lastMove!.timestamp).toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
