import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, EmptyState } from '../components/ui';
import { can } from '../lib/permissions';
import type { StockCount as Count, CountLine } from '../types';

const STATUS_TONE = { open: 'neutral', submitted: 'info', approved: 'ok', cancelled: 'out' } as const;
function lineId() { return `cl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="card w-72 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="mb-4 text-sm text-ink-800">{message}</p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export function StockCount() {
  const { user, stockCounts, visibleShopIds, shopName, deleteCountDraft } = useStore();
  const [editing, setEditing] = useState<Count | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const visible = useMemo(
    () => stockCounts.filter((c) => visibleShopIds.includes(c.shopId)).sort((a, b) => b.createdAt - a.createdAt),
    [stockCounts, visibleShopIds],
  );

  if (editing) return <CountEditor count={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />;

  return (
    <div>
      {confirmDelete && (
        <ConfirmDialog
          message="Delete this draft count? This cannot be undone."
          onConfirm={async () => {
            const res = await deleteCountDraft(confirmDelete);
            if (res.ok) setConfirmDelete(null);
            else alert(`Delete failed: ${res.error}`);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      <PageHeader
        title="Stock Count"
        subtitle="Physical count sessions. Approved variances post stock corrections with audit."
        action={can(user?.role, 'perform_count') && <button className="btn-primary" onClick={() => setEditing('new')}>New count</button>}
      />

      {visible.length === 0 ? (
        <EmptyState title="No counts yet" hint="Create a count session to verify physical stock." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Count No</th>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Lines</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                  <td className="px-4 py-3 font-semibold text-ink-800">{c.countNo}</td>
                  <td className="px-4 py-3 text-ink-600">{shopName(c.shopId)}</td>
                  <td className="px-4 py-3 text-ink-500">{c.date}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{c.lines.length}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditing(c)}>
                        {c.status === 'open' ? 'Edit' : 'View'}
                      </button>
                      {c.status === 'open' && (
                        <button className="btn-ghost px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                          onClick={() => setConfirmDelete(c.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CountEditor({ count, onClose }: { count: Count | null; onClose: () => void }) {
  const {
    user, shops, products, variants, visibleShopIds,
    nextCountNo, saveCount, submitCount, approveCount, cancelCount, deleteCountDraft, productName,
  } = useStore();

  const editableShops = shops.filter((s) => visibleShopIds.includes(s.id));
  const [shopId, setShopId] = useState(count?.shopId ?? editableShops[0]?.id ?? '');
  const [lines, setLines] = useState<CountLine[]>(count?.lines ?? []);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'out'; text: string } | null>(null);
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false);
  const countNo = count?.countNo ?? nextCountNo();
  const readOnly = count != null && count.status !== 'open';
  const isApprover = can(user?.role, 'approve_adjustment');

  // Expected roll qty + quantity come from the variant aggregates (no rolls).
  const buildLine = (variantId: string): CountLine | null => {
    const v = variants.find((x) => x.id === variantId);
    if (!v) return null;
    const p = products.find((x) => x.id === v.productId);
    const expectedQuantity = v.totalQty ?? 0;
    return {
      id: lineId(), barcode: v.barcode, productId: v.productId, variantId,
      unit: v.uom ?? p?.defaultUnit ?? 'Yard',
      expectedRolls: v.rollQty ?? 0, actualRolls: v.rollQty ?? 0,
      expectedQuantity, actualQuantity: expectedQuantity, variance: 0,
    };
  };

  // Find a variant by barcode and add its count line.
  const onScanBarcode = (code: string) => {
    const v = variants.find((x) => x.barcode?.toLowerCase() === code.trim().toLowerCase());
    if (!v) { setMsg({ tone: 'out', text: `No variant with barcode "${code}"` }); return; }
    addVariantLine(v.id);
  };

  const addVariantLine = (variantId: string) => {
    if (lines.some((l) => l.variantId === variantId)) { setMsg({ tone: 'out', text: 'Already in this count' }); return; }
    const line = buildLine(variantId);
    if (line) { setLines((prev) => [...prev, line]); setMsg(null); }
  };
  const updateLine = (id: string, patch: Partial<CountLine>) =>
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      next.variance = (next.actualQuantity ?? 0) - (next.expectedQuantity ?? 0);
      return next;
    }));
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const payload = () => ({
    id: count?.id, countNo, shopId,
    countedBy: count?.countedBy ?? (user?.uid ?? ''),
    date: count?.date ?? new Date().toISOString().slice(0, 10),
    lines,
  });

  const doSave = () => { saveCount(payload()); setMsg({ tone: 'ok', text: 'Count saved' }); };
  const doSubmit = () => {
    if (lines.length === 0) { setMsg({ tone: 'out', text: 'Add at least one line' }); return; }
    const id = saveCount(payload()); submitCount(id);
    setMsg({ tone: 'ok', text: 'Submitted for approval' }); setTimeout(onClose, 700);
  };
  const doApprove = async () => {
    const res = await approveCount(count!.id);
    if (res.ok) { setMsg({ tone: 'ok', text: 'Approved — variances posted as corrections' }); setTimeout(onClose, 800); }
    else setMsg({ tone: 'out', text: res.error ?? 'Approval failed' });
  };

  return (
    <div>
      {confirmDeleteDraft && count?.status === 'open' && (
        <ConfirmDialog
          message={`Delete draft count ${countNo}? This cannot be undone.`}
          onConfirm={async () => {
            const res = await deleteCountDraft(count.id);
            if (res.ok) onClose();
            else setMsg({ tone: 'out', text: `Delete failed: ${res.error}` });
          }}
          onCancel={() => setConfirmDeleteDraft(false)}
        />
      )}
      <PageHeader
        title={`Stock Count ${countNo}`}
        subtitle={count ? `Status: ${count.status}` : 'New count session'}
        action={<button className="btn-ghost" onClick={onClose}>← Back</button>}
      />

      <div className="card mb-4 p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div>
            <label className="label">Shop</label>
            <select className="input" disabled={readOnly || lines.length > 0} value={shopId} onChange={(e) => setShopId(e.target.value)}>
              {editableShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {!readOnly && (
            <div className="md:col-span-2">
              <label className="label">Scan variant barcode to add</label>
              <input className="input font-mono" placeholder="AUR-C01" onKeyDown={(e) => {
                if (e.key === 'Enter') { onScanBarcode((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; }
              }} />
            </div>
          )}
        </div>
        {!readOnly && (
          <div className="mt-3">
            <label className="label">Or add a variant</label>
            <select className="input max-w-xs" value="" onChange={(e) => e.target.value && addVariantLine(e.target.value)}>
              <option value="">Select variant…</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{productName(v.productId)} · {v.label}</option>)}
            </select>
          </div>
        )}
        <p className="mt-2 text-xs text-ink-400">Expected roll count and quantity come from the variant records. Enter what you physically counted; variance is applied on approval.</p>
      </div>

      <div className="card mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-3 py-2">Product / Variant</th>
              <th className="px-3 py-2 text-right">Exp. PCS</th>
              <th className="px-3 py-2 text-right">Act. PCS</th>
              <th className="px-3 py-2 text-right">Exp. Qty</th>
              <th className="px-3 py-2 text-right">Act. Qty</th>
              <th className="px-3 py-2 text-right">Variance</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const v = variants.find((x) => x.id === l.variantId);
              return (
                <tr key={l.id} className="border-b border-ink-50 last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-ink-800">{productName(l.productId)}</div>
                    <div className="text-xs text-ink-400">{v?.colorName ?? v?.label} · <span className="font-mono">{v?.barcode}</span></div>
                  </td>
                  <td className="px-3 py-2 text-right text-ink-500">{l.expectedRolls ?? '—'}</td>
                  <td className="px-3 py-2"><input type="number" className="input w-16 px-2 py-1 text-right" disabled={readOnly} value={l.actualRolls ?? ''} onChange={(e) => updateLine(l.id, { actualRolls: e.target.value === '' ? undefined : parseFloat(e.target.value) })} /></td>
                  <td className="px-3 py-2 text-right text-ink-500">{l.expectedQuantity}</td>
                  <td className="px-3 py-2"><input type="number" className="input w-20 px-2 py-1 text-right font-semibold" disabled={readOnly} value={l.actualQuantity} onChange={(e) => updateLine(l.id, { actualQuantity: parseFloat(e.target.value) || 0 })} /></td>
                  <td className={`px-3 py-2 text-right font-bold ${l.variance > 0 ? 'text-teal-600' : l.variance < 0 ? 'text-red-500' : 'text-ink-400'}`}>{l.variance > 0 ? '+' : ''}{l.variance}</td>
                  <td className="px-3 py-2"><input className="input min-w-[110px] px-2 py-1" disabled={readOnly} value={l.reason ?? ''} onChange={(e) => updateLine(l.id, { reason: e.target.value })} placeholder={l.variance !== 0 ? 'reason…' : ''} /></td>
                  <td className="px-3 py-2 text-right">{!readOnly && <button className="text-ink-400 hover:text-red-500" onClick={() => removeLine(l.id)}>✕</button>}</td>
                </tr>
              );
            })}
            {lines.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-ink-400">Scan or add products to count.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <>
            <button className="btn-ghost" onClick={doSave}>Save</button>
            <button className="btn-primary" onClick={doSubmit}>Submit count</button>
          </>
        )}
        {count?.status === 'submitted' && isApprover && (
          <button className="btn-primary" onClick={doApprove}>Approve variances</button>
        )}
        {count?.status === 'submitted' && !isApprover && (
          <Badge tone="info">Awaiting manager approval</Badge>
        )}
        {count?.status === 'open' && (
          <button className="btn-ghost text-red-500 hover:bg-red-50" onClick={() => setConfirmDeleteDraft(true)}>Delete draft</button>
        )}
        {count && count.status !== 'approved' && count.status !== 'cancelled' && count.status !== 'open' && (
          <button className="btn-ghost" onClick={() => { cancelCount(count.id); onClose(); }}>Cancel count</button>
        )}
      </div>

      {msg && <div className="mt-3"><Badge tone={msg.tone}>{msg.text}</Badge></div>}
      {count?.status === 'approved' && <p className="mt-3 text-xs text-ink-400">Approved — variances were posted as stock corrections with audit logs.</p>}
    </div>
  );
}
