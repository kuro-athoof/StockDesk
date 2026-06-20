import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge } from '../components/ui';
import { can } from '../lib/permissions';

export function ComingNext({ title, slice, items }: { title: string; slice: string; items: string[] }) {
  return (
    <div>
      <PageHeader title={title} subtitle={`Scheduled for ${slice}`} />
      <div className="card p-8">
        <Badge tone="info">{slice}</Badge>
        <p className="mt-3 max-w-xl text-sm text-ink-500">
          The foundation this module depends on (schema, security rules, movement engine,
          audit, costing) is already built and working. This screen is delivered in {slice}.
        </p>
        <ul className="mt-4 space-y-1.5">
          {items.map((i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-ink-600">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />{i}
            </li>
          ))}
        </ul>
      </div>
      <AdjustStockTool />
    </div>
  );
}

// A live tool that exercises the movement engine + negative-stock override rule.
function AdjustStockTool() {
  const { user, variants, shops, balanceOf, applyLocalMovement, productName } = useStore();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [shopId, setShopId] = useState(shops[0]?.id ?? '');
  const [delta, setDelta] = useState('-50');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'low' | 'out'; text: string } | null>(null);

  if (!user || !can(user.role, 'adjust_stock')) return null;

  const variant = variants.find((v) => v.id === variantId)!;
  const bal = balanceOf(variantId, shopId);

  const run = async () => {
    const n = parseFloat(delta);
    if (Number.isNaN(n)) { setMsg({ tone: 'out', text: 'Enter a valid number' }); return; }
    const res = await applyLocalMovement({
      variant, ownerShopId: shopId, qtyChanged: n, unit: bal?.unit ?? (variant.productType === 'general' ? 'Piece' : 'Meter'),
      action: 'ADJUSTMENT', remarks: 'Manual adjustment',
    });
    if (res.ok) setMsg({ tone: 'ok', text: `Applied. New balance recorded.` });
    else if (res.needsOverride) setMsg({ tone: 'out', text: `Blocked: ${res.error}. A manager can override.` });
    else setMsg({ tone: 'out', text: res.error ?? 'Failed' });
  };

  return (
    <div className="card mt-6 p-5">
      <h3 className="mb-1 text-sm font-bold text-ink-900">Live engine test — Adjust Stock</h3>
      <p className="mb-4 text-xs text-ink-400">
        Exercises the movement engine: writes a balance + immutable audit log, and enforces
        the negative-stock rule (warehouse staff blocked, managers override).
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className="label">Variant</label>
          <select className="input" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            {variants.map((v) => <option key={v.id} value={v.id}>{productName(v.productId)} · {v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Owner shop</label>
          <select className="input" value={shopId} onChange={(e) => setShopId(e.target.value)}>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Change (+/−)</label>
          <input className="input" value={delta} onChange={(e) => setDelta(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={run}>Apply movement</button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-ink-400">Current balance: <b className="text-ink-700">{bal?.quantity ?? 0} {bal?.unit ?? ''}</b></span>
        {msg && <Badge tone={msg.tone}>{msg.text}</Badge>}
      </div>
    </div>
  );
}
