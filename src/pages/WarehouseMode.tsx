import { useState, useRef } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge } from '../components/ui';
import type { Variant } from '../types';

type Action = 'receive' | 'move' | 'count' | null;

export function WarehouseMode() {
  const {
    variants, locations, visibleShopIds, audit,
    balanceOf, shopName, productName, applyLocalMovement, shops,
  } = useStore();

  const [code, setCode] = useState('');
  const [found, setFound] = useState<Variant | null>(null);
  const [shopId, setShopId] = useState(visibleShopIds[0] ?? '');
  const [action, setAction] = useState<Action>(null);
  const [qty, setQty] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'out'; text: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const myShops = shops.filter((s) => visibleShopIds.includes(s.id));
  const bal = found ? balanceOf(found.id, shopId) : undefined;
  const loc = bal?.locationId ? locations.find((l) => l.id === bal.locationId) : undefined;
  const lastMove = found ? audit.filter((a) => a.variantId === found.id && a.ownerShopId === shopId).sort((a, b) => b.timestamp - a.timestamp)[0] : undefined;
  const history = found ? audit.filter((a) => a.variantId === found.id && a.ownerShopId === shopId).sort((a, b) => b.timestamp - a.timestamp).slice(0, 12) : [];

  const scan = () => {
    const v = variants.find((x) => x.barcode === code.trim())
      ?? variants.find((x) => `${productName(x.productId)} ${x.label}`.toLowerCase().includes(code.trim().toLowerCase()) && code.trim().length > 2);
    if (v) { setFound(v); setMsg(null); setAction(null); setShowHistory(false); }
    else { setFound(null); setMsg({ tone: 'out', text: 'No item with that barcode or name' }); }
  };

  const reset = () => {
    setCode(''); setFound(null); setQty(''); setAction(null); setShowHistory(false);
    scanRef.current?.focus();
  };

  const runAction = async () => {
    if (!found || !action) return;
    const n = parseFloat(qty);
    if (Number.isNaN(n) || n <= 0) { setMsg({ tone: 'out', text: 'Enter a quantity' }); return; }
    const unit = bal?.unit ?? (found.productType === 'general' ? 'Piece' : 'Meter');
    let delta = 0; let act: 'RECEIVE' | 'TRANSFER_OUT' | 'STOCK_COUNT_CORRECTION' = 'RECEIVE';
    if (action === 'receive') { delta = n; act = 'RECEIVE'; }
    else if (action === 'move') { delta = -n; act = 'TRANSFER_OUT'; }
    else if (action === 'count') { delta = n - (bal?.quantity ?? 0); act = 'STOCK_COUNT_CORRECTION'; }
    const res = await applyLocalMovement({
      variant: found, ownerShopId: shopId, qtyChanged: delta, unit, action: act,
      remarks: `Warehouse ${action === 'move' ? 'transfer out of godown' : action}${action === 'count' ? ` (actual ${n})` : `: ${n} ${unit}`}`,
    });
    if (res.ok) { setMsg({ tone: 'ok', text: `${action} done` }); setQty(''); setAction(null); }
    else if (res.needsOverride) setMsg({ tone: 'out', text: `Blocked: not enough stock. A manager can override.` });
    else setMsg({ tone: 'out', text: res.error ?? 'Failed' });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Warehouse Mode" subtitle="Scan, view, act — fast." />

      <div className="card mb-4 p-5">
        <label className="label">Scan barcode or type code / name</label>
        <div className="flex gap-2">
          <input ref={scanRef} autoFocus className="input flex-1 text-2xl" value={code}
            onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && scan()} placeholder="Scan…" />
          <button className="btn-primary px-8 text-lg" onClick={scan}>Find</button>
        </div>
        {myShops.length > 1 && (
          <div className="mt-3">
            <label className="label">Shop</label>
            <select className="input" value={shopId} onChange={(e) => setShopId(e.target.value)}>
              {myShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {found && (
        <div className="card mb-4 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-2xl font-bold text-ink-900">{productName(found.productId)}</div>
              <div className="text-lg text-ink-500">
                {found.label}{found.colorName && ` · ${found.colorName}`}
              </div>
            </div>
            {found.colorFamily && <span className="rounded bg-ink-100 px-2 py-1 text-xs font-semibold text-ink-600">{found.colorFamily}</span>}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
            {found.ourColorNumber && <span>Our #: <b className="text-ink-700">{found.ourColorNumber}</b></span>}
            {found.supplierColorNumber && <span>Supplier #: <b className="text-ink-700">{found.supplierColorNumber}</b></span>}
            <span>Barcode: <b className="text-ink-700">{found.barcode}</b></span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <Info label="Owner" value={shopName(shopId)} />
            <Info label="Godown Balance" value={bal ? `${bal.quantity} ${bal.unit}` : '0'} big />
            <Info label="Location" value={loc?.label ?? '—'} />
          </div>

          {lastMove && (
            <div className="mt-3 text-center text-xs text-ink-400">
              Last: {lastMove.action.replace(/_/g, ' ')} · {lastMove.userName} · {new Date(lastMove.timestamp).toLocaleDateString()}
            </div>
          )}

          {/* Action buttons — large */}
          <div className="mt-5 grid grid-cols-4 gap-2">
            {(['receive', 'move', 'count'] as const).map((a) => (
              <button key={a} onClick={() => { setAction(a); setShowHistory(false); }}
                className={`rounded-lg py-3 text-sm font-bold ${action === a ? 'bg-teal-500 text-white' : 'bg-ink-50 text-ink-700 hover:bg-ink-100'}`}>
                {a === 'receive' ? 'Receive' : a === 'move' ? 'Transfer Out' : 'Count'}
              </button>
            ))}
            <button onClick={() => { setShowHistory((s) => !s); setAction(null); }}
              className={`rounded-lg py-3 text-xs font-bold ${showHistory ? 'bg-ink-800 text-white' : 'bg-ink-50 text-ink-700 hover:bg-ink-100'}`}>
              History
            </button>
          </div>

          {/* Action input */}
          {action && (
            <div className="mt-4 rounded-lg bg-ink-50 p-4">
              <label className="label">
                {action === 'receive' ? 'Quantity to receive into godown' : action === 'move' ? 'Quantity to transfer out of godown' : 'Actual counted quantity'}
              </label>
              <div className="flex gap-2">
                <input type="number" autoFocus className="input flex-1 text-2xl" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
                <button className="btn-primary px-8 text-lg" onClick={runAction}>{action === 'move' ? 'Transfer Out' : action === 'receive' ? 'Receive' : 'Count'}</button>
              </div>
              {action === 'count' && bal && <p className="mt-2 text-xs text-ink-400">Expected: {bal.quantity} {bal.unit}. Variance will post as a correction.</p>}
            </div>
          )}

          {/* History */}
          {showHistory && (
            <div className="mt-4 rounded-lg bg-ink-50 p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Recent movements</div>
              {history.length === 0 ? <div className="text-sm text-ink-400">No history yet.</div> : (
                <div className="space-y-1">
                  {history.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs">
                      <span className="text-ink-600">{a.action.replace(/_/g, ' ')} · {a.userName}</span>
                      <span className={`font-semibold ${a.qtyChanged > 0 ? 'text-teal-600' : a.qtyChanged < 0 ? 'text-red-500' : 'text-ink-400'}`}>
                        {a.qtyChanged > 0 ? '+' : ''}{a.qtyChanged || '—'} · {new Date(a.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button className="btn-ghost mt-4 w-full" onClick={reset}>Clear / next item</button>
        </div>
      )}

      {msg && <div className="text-center"><Badge tone={msg.tone}>{msg.text}</Badge></div>}
      {!found && !msg && <p className="text-center text-sm text-ink-400">Scan a barcode to begin.</p>}
    </div>
  );
}

function Info({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-lg bg-ink-50 p-3 text-center">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className={`mt-1 font-bold text-ink-900 ${big ? 'text-2xl text-teal-600' : 'text-base'}`}>{value}</div>
    </div>
  );
}
