import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, EmptyState, Field } from '../components/ui';
import { can } from '../lib/permissions';
import type { StockCount as Count, CountLine, CountStatus } from '../types';

// ── Status config ────────────────────────────────────────────────────────────
const STATUS_TONE: Record<CountStatus, 'neutral' | 'info' | 'ok' | 'out'> = {
  open:      'neutral',
  submitted: 'info',
  approved:  'ok',
  rejected:  'out',
  cancelled: 'out',
};
const STATUS_LABEL: Record<CountStatus, string> = {
  open:      'Open',
  submitted: 'Submitted',
  approved:  'Approved',
  rejected:  'Rejected',
  cancelled: 'Cancelled',
};

function lineId() { return `cl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

// ── Variance colour ──────────────────────────────────────────────────────────
function varianceTone(variance: number, expected: number): 'green' | 'amber' | 'red' {
  if (variance === 0) return 'green';
  const pct = expected > 0 ? Math.abs(variance) / expected : 1;
  return pct < 0.05 ? 'amber' : 'red';
}
const VAR_ROW   = { green: '', amber: 'bg-amber-50/60', red: 'bg-red-50/60' };
const VAR_TEXT  = { green: 'text-teal-600', amber: 'text-amber-600', red: 'text-red-600' };

// ── Dialogs ──────────────────────────────────────────────────────────────────
function ConfirmDialog({ message, confirmLabel = 'Delete', onConfirm, onCancel }: {
  message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="card w-72 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="mb-4 text-sm text-ink-800">{message}</p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function RejectDialog({ onConfirm, onCancel }: { onConfirm: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="card w-80 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-bold text-ink-900">Reject Count</h3>
        <Field label="Rejection note (required)">
          <input className="input" autoFocus value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. PCS counts were not entered for all lines" />
        </Field>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" disabled={!note.trim()} onClick={() => onConfirm(note)}>Reject</button>
        </div>
      </div>
    </div>
  );
}

// ── List page ────────────────────────────────────────────────────────────────
export function StockCount() {
  const { user, stockCounts, visibleShopIds, shopName, deleteCountDraft } = useStore();
  const showCosts = can(user?.role, 'view_costs'); // P2: hide MVR variance from warehouse staff
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
        subtitle="Physical count sessions. Approved variances post corrections to stock_balances with full audit."
        action={can(user?.role, 'perform_count') && (
          <button className="btn-primary" onClick={() => setEditing('new')}>New count</button>
        )}
      />

      {visible.length === 0 ? (
        <EmptyState title="No counts yet" hint="Create a count session to verify physical stock." />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {visible.map((c) => (
              <div key={c.id} className="card p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-ink-800">{c.countNo}</span>
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                </div>
                <div className="text-sm text-ink-500">{shopName(c.shopId)} · {c.date} · {c.lines.length} lines</div>
                <div className="mt-2 flex gap-2">
                  <button className="btn-ghost px-3 py-1 text-xs flex-1" onClick={() => setEditing(c)}>{c.status === 'open' || c.status === 'rejected' ? 'Edit' : 'View'}</button>
                  {c.status === 'open' && <button className="btn-ghost px-2 py-1 text-xs text-red-500" onClick={() => setConfirmDelete(c.id)}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3">Count No</th><th className="px-4 py-3">Shop</th><th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Lines</th>
                  {showCosts && <th className="px-4 py-3 text-right">Variance (MVR)</th>}
                  <th className="px-4 py-3">Approved By</th>
                  <th className="px-4 py-3">Status</th><th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                    <td className="px-4 py-3 font-semibold text-ink-800">{c.countNo}</td>
                    <td className="px-4 py-3 text-ink-600">{shopName(c.shopId)}</td>
                    <td className="px-4 py-3 capitalize text-ink-500">{c.countType ?? 'full'}</td>
                    <td className="px-4 py-3 text-ink-500">{c.date}</td>
                    <td className="px-4 py-3 text-right text-ink-600">{c.lines.length}</td>
                    {showCosts && (
                    <td className="px-4 py-3 text-right">
                      {c.varianceValueMvr != null ? <span className={c.varianceValueMvr < 0 ? 'text-red-600 font-semibold' : 'text-ink-600'}>{c.varianceValueMvr > 0 ? '+' : ''}{c.varianceValueMvr.toFixed(2)}</span> : <span className="text-ink-300">—</span>}
                    </td>
                    )}
                    <td className="px-4 py-3 text-ink-500 text-xs">{c.approvedBy ? c.approvedBy.slice(0, 8) + '…' : '—'}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditing(c)}>{c.status === 'open' || c.status === 'rejected' ? 'Edit' : 'View'}</button>
                        {c.status === 'open' && <button className="btn-ghost px-2 py-1 text-xs text-red-500 hover:bg-red-50" onClick={() => setConfirmDelete(c.id)}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────
function CountEditor({ count, onClose }: { count: Count | null; onClose: () => void }) {
  const {
    user, shops, products, variants, scopedBalances, visibleShopIds,
    nextCountNo, saveCount, submitCount, approveCount, rejectCount,
    deleteCountDraft, productName,
  } = useStore();
  const showCosts = can(user?.role, 'view_costs'); // P2: hide MVR variance from warehouse staff

  const editableShops = shops.filter((s) => visibleShopIds.includes(s.id));

  const [shopId, setShopId]       = useState(count?.shopId ?? editableShops[0]?.id ?? '');
  const [countType, setCountType] = useState<Count['countType']>(count?.countType ?? 'full');
  const [reference, setReference] = useState(count?.reference ?? '');
  const [notes, setNotes]         = useState(count?.notes ?? '');
  const [lines, setLines]         = useState<CountLine[]>(count?.lines ?? []);
  const [msg, setMsg]             = useState<{ tone: 'ok' | 'out'; text: string } | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null); // Fix 6: dup highlight
  const [includeZero, setIncludeZero] = useState(false);               // Fix 7: zero stock toggle

  const countNo    = count?.countNo ?? nextCountNo();
  const isApprover = can(user?.role, 'approve_adjustment');
  // Rejected counts can be re-edited and resubmitted.
  const readOnly   = count != null && count.status !== 'open' && count.status !== 'rejected';

  // ── Build line from stock_balances (source of truth) ──────────────────────
  // P3: expected values MUST come from balance.quantity / balance.rollCount,
  //     NOT from variant.totalQty / variant.rollQty.
  const buildLine = (variantId: string): CountLine | null => {
    const v   = variants.find((x) => x.id === variantId);
    if (!v) return null;
    const p   = products.find((x) => x.id === v.productId);
    // Find the balance for this variant in the selected shop.
    const bal = scopedBalances.find((b) => b.variantId === variantId && b.ownerShopId === shopId);
    const expectedQuantity = bal?.quantity ?? 0;
    const expectedRolls    = bal?.rollCount ?? 0;
    return {
      id: lineId(),
      barcode:          v.barcode ?? '',
      productId:        v.productId,
      variantId,
      unit:             v.uom ?? bal?.unit ?? p?.defaultUnit ?? 'Yard',
      // "Rolls" field stores PCS (Option B — keep internal names, display as PCS).
      expectedRolls,
      actualRolls:      expectedRolls,   // prefilled; warehouse adjusts physical count
      expectedQuantity,
      actualQuantity:   expectedQuantity, // prefilled; warehouse adjusts physical count
      variance:         0,
    };
  };

  // ── Barcode scan ───────────────────────────────────────────────────────────
  const onScanBarcode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const v = variants.find((x) => x.barcode?.toLowerCase() === trimmed.toLowerCase());
    if (!v) { setMsg({ tone: 'out', text: `No variant found for barcode "${trimmed}"` }); return; }
    // Fix 6: if already present, highlight the existing row instead of adding duplicate.
    const existingLine = lines.find((l) => l.variantId === v.id);
    if (existingLine) {
      setHighlightId(existingLine.id);
      setMsg({ tone: 'out', text: 'Already in this count — existing row highlighted' });
      document.getElementById(`row-${existingLine.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightId(null), 2000);
      setBarcodeInput('');
      return;
    }
    const line = buildLine(v.id);
    if (line) { setLines((prev) => [...prev, line]); setMsg({ tone: 'ok', text: `${productName(v.productId)} · ${v.label} added` }); }
    setBarcodeInput('');
  };

  // ── Variant search add ─────────────────────────────────────────────────────
  const addVariantLine = (variantId: string) => {
    if (!variantId) return;
    if (lines.some((l) => l.variantId === variantId)) { setMsg({ tone: 'out', text: 'Already in this count' }); return; }
    const line = buildLine(variantId);
    if (line) { setLines((prev) => [...prev, line]); setMsg(null); }
  };

  // ── Bulk Add: Load All Shop Stock ─────────────────────────────────────────
  const bulkLoadShopStock = () => {
    // Fix 7: respect includeZero toggle
    const shopBalances = scopedBalances.filter(
      (b) => b.ownerShopId === shopId && (includeZero || b.quantity > 0),
    );
    if (shopBalances.length === 0) { setMsg({ tone: 'out', text: 'No stock found for this shop' }); return; }
    const existing = new Set(lines.map((l) => l.variantId));
    let added = 0;
    const newLines: CountLine[] = [];
    for (const bal of shopBalances) {
      if (existing.has(bal.variantId)) continue;
      const line = buildLine(bal.variantId);
      if (line) { newLines.push(line); added++; }
    }
    if (added === 0) { setMsg({ tone: 'out', text: 'All shop stock already in this count' }); return; }
    setLines((prev) => [...prev, ...newLines]);
    setMsg({ tone: 'ok', text: `Loaded ${added} lines from ${shops.find((s) => s.id === shopId)?.name ?? 'shop'} stock` });
  };

  // ── Line update with recomputed variance ───────────────────────────────────
  const updateLine = (id: string, patch: Partial<CountLine>) =>
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      next.variance = (next.actualQuantity ?? 0) - (next.expectedQuantity ?? 0);
      return next;
    }));

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  // ── Summary panel calculations ─────────────────────────────────────────────
  const summary = useMemo(() => {
    let totalQtyVariance = 0, totalPcsVariance = 0, positiveAdj = 0, negativeAdj = 0;
    let varianceValueMvr = 0;
    const linesWithVariance = lines.filter((l) => l.variance !== 0);
    for (const l of lines) {
      totalQtyVariance += l.variance;
      const pcsV = (l.actualRolls ?? 0) - (l.expectedRolls ?? 0);
      totalPcsVariance += pcsV;
      if (l.variance > 0) positiveAdj++;
      else if (l.variance < 0) negativeAdj++;
      const v = variants.find((x) => x.id === l.variantId);
      varianceValueMvr += l.variance * (v?.cost ?? 0);
    }
    return {
      lineCount: lines.length, linesWithVariance: linesWithVariance.length,
      totalQtyVariance: Math.round(totalQtyVariance * 100) / 100,
      totalPcsVariance,
      positiveAdj, negativeAdj,
      varianceValueMvr: Math.round(varianceValueMvr * 100) / 100,
    };
  }, [lines, variants]);

  // ── Payload ────────────────────────────────────────────────────────────────
  const buildPayload = () => ({
    id: count?.id, countNo, shopId, countType, reference: reference.trim() || undefined,
    notes: notes.trim() || undefined, countedBy: count?.countedBy ?? (user?.uid ?? ''),
    date: count?.date ?? new Date().toISOString().slice(0, 10),
    lines, varianceValueMvr: summary.varianceValueMvr,
  });

  // ── Actions ────────────────────────────────────────────────────────────────
  const doSave = () => {
    const hasNegative = lines.some((l) => (l.actualRolls ?? 0) < 0 || l.actualQuantity < 0);
    if (hasNegative) { setMsg({ tone: 'out', text: 'Physical PCS and Qty cannot be negative.' }); return; }
    saveCount(buildPayload());
    setMsg({ tone: 'ok', text: 'Draft saved' });
  };
  const doSubmit = () => {
    if (!shopId)            { setMsg({ tone: 'out', text: 'Select a shop' }); return; }
    if (lines.length === 0) { setMsg({ tone: 'out', text: 'Add at least one line before submitting' }); return; }
    // Fix 2: block negative physical counts
    const hasNegative = lines.some((l) => (l.actualRolls ?? 0) < 0 || l.actualQuantity < 0);
    if (hasNegative) { setMsg({ tone: 'out', text: 'Physical PCS and Qty cannot be negative.' }); return; }
    // Fix 3: reason required if PCS variance OR Qty variance exists
    const hasPcsVariance = lines.some((l) => ((l.actualRolls ?? 0) - (l.expectedRolls ?? 0)) !== 0);
    const hasQtyVariance = lines.some((l) => l.variance !== 0);
    if ((hasPcsVariance || hasQtyVariance) && lines.some((l) => {
      const pcsVar = (l.actualRolls ?? 0) - (l.expectedRolls ?? 0);
      return (pcsVar !== 0 || l.variance !== 0) && !l.reason?.trim();
    })) {
      setMsg({ tone: 'out', text: 'All lines with PCS or Qty variance must have a reason.' }); return;
    }
    const id = saveCount(buildPayload());
    submitCount(id);
    setMsg({ tone: 'ok', text: count?.status === 'rejected' ? 'Resubmitted for approval' : 'Submitted for approval' });
    setTimeout(onClose, 700);
  };
  const doApprove = async () => {
    if (!count) return;
    const res = await approveCount(count.id);
    if (res.ok) {
      setMsg({ tone: 'ok', text: 'Approved — balance set to physical counts, audit log written' });
      setTimeout(onClose, 800);
    } else {
      // Fix 4: conflict warning shown in full
      setMsg({ tone: 'out', text: res.error ?? 'Approval failed' });
    }
  };
  const doReject = (note: string) => {
    if (!count) return;
    rejectCount(count.id, note);
    setShowReject(false);
    onClose();
  };

  return (
    <div>
      {/* Dialogs */}
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
      {showReject && <RejectDialog onConfirm={doReject} onCancel={() => setShowReject(false)} />}

      <PageHeader
        title={`Stock Count ${countNo}`}
        subtitle={count ? `${STATUS_LABEL[count.status]}${count.rejectionNote ? ` — ${count.rejectionNote}` : ''}` : 'New count session'}
        action={<button className="btn-ghost" onClick={onClose}>← Back</button>}
      />

      {/* Rejected banner */}
      {count?.status === 'rejected' && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <b>Rejected:</b> {count.rejectionNote} — update the count and resubmit.
        </div>
      )}

      {/* ── Header ── */}
      <div className="card mb-4 p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Shop">
            <select className="input" disabled={readOnly || lines.length > 0} value={shopId}
              onChange={(e) => setShopId(e.target.value)}>
              {editableShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Count Type">
            <select className="input" disabled={readOnly} value={countType}
              onChange={(e) => setCountType(e.target.value as Count['countType'])}>
              <option value="full">Full Count</option>
              <option value="partial">Partial Count</option>
              <option value="spot">Spot Check</option>
            </select>
          </Field>
          <Field label="Reference (optional)">
            <input className="input" disabled={readOnly} value={reference}
              onChange={(e) => setReference(e.target.value)} placeholder="e.g. Monthly June 2026" />
          </Field>
          <Field label="Notes (optional)">
            <input className="input" disabled={readOnly} value={notes}
              onChange={(e) => setNotes(e.target.value)} placeholder="Any notes for the approver" />
          </Field>
        </div>

        {/* ── Entry methods ── */}
        {!readOnly && (
          <div className="mt-4 border-t border-ink-100 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              {/* A: Barcode scan */}
              <div className="flex-1 w-full sm:min-w-[200px] sm:flex-1">
                <label className="label">A. Scan barcode</label>
                <div className="flex gap-2">
                  <input className="input flex-1 font-mono" placeholder="AUR-C01…" value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { onScanBarcode(barcodeInput); } }} />
                  <button className="btn-ghost" onClick={() => onScanBarcode(barcodeInput)}>Add</button>
                </div>
              </div>
              {/* B: Variant search */}
              <div className="flex-1 w-full sm:min-w-[200px] sm:flex-1">
                <label className="label">B. Search variant</label>
                <select className="input" value="" onChange={(e) => addVariantLine(e.target.value)}>
                  <option value="">Select variant…</option>
                  {variants.map((v) => <option key={v.id} value={v.id}>{productName(v.productId)} · {v.label}</option>)}
                </select>
              </div>
              {/* C: Bulk Add */}
              <div>
                <label className="label">C. Bulk load</label>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-primary whitespace-nowrap"
                    onClick={bulkLoadShopStock}
                    title="Adds every balance line for the selected shop — ideal for monthly full counts">
                    ↓ Load All Shop Stock
                  </button>
                  <label className="flex cursor-pointer items-center gap-1 text-xs text-ink-500">
                    <input type="checkbox" className="rounded" checked={includeZero}
                      onChange={(e) => setIncludeZero(e.target.checked)} />
                    Include zero stock
                  </label>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              System PCS and System Qty come from <b>stock_balances</b> for the selected shop. Enter physical counts; variance is applied on approval.
            </p>
          </div>
        )}
      </div>

      {/* Count grid — cards on mobile, table on desktop */}
      <div className="card mb-4">
        {/* Mobile cards */}
        <div className="md:hidden">
          {lines.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-ink-400">Use barcode scan, variant search, or <b>Load All Shop Stock</b> to add lines.</div>
          )}
          {lines.map((l) => {
            const v    = variants.find((x) => x.id === l.variantId);
            const p    = products.find((x) => x.id === l.productId);
            const tone = varianceTone(l.variance, l.expectedQuantity);
            const pcsVar = (l.actualRolls ?? 0) - (l.expectedRolls ?? 0);
            const pcsTone = varianceTone(pcsVar, l.expectedRolls ?? 0);
            const isHighlighted = highlightId === l.id;
            const needsReason = (pcsVar !== 0 || l.variance !== 0) && !l.reason?.trim() && !readOnly;
            return (
              <div key={l.id} id={`row-${l.id}`}
                className={`border-b border-ink-100 last:border-0 p-4 transition-colors ${isHighlighted ? 'bg-amber-100 ring-2 ring-amber-400' : VAR_ROW[tone]}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold text-ink-800 text-sm">{p?.name ?? productName(l.productId)}</div>
                    <div className="text-xs text-ink-500">{v?.colorName ?? v?.label} · <span className="font-mono">{v?.barcode}</span> · {l.unit}</div>
                  </div>
                  {!readOnly && <button className="text-ink-400 hover:text-red-500 ml-2" onClick={() => removeLine(l.id)}>✕</button>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-ink-400 mb-1">System PCS → Physical PCS</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink-500">{l.expectedRolls ?? 0}</span>
                      <span className="text-ink-300">→</span>
                      <input type="number" min="0" className={`input w-16 px-2 py-1 text-right ${(l.actualRolls ?? 0) < 0 ? 'border-red-500' : ''}`} disabled={readOnly} value={l.actualRolls ?? ''} onChange={(e) => updateLine(l.id, { actualRolls: e.target.value === '' ? 0 : parseFloat(e.target.value) })} />
                      {pcsVar !== 0 && <span className={`text-sm font-bold ${VAR_TEXT[pcsTone]}`}>{pcsVar > 0 ? '+' : ''}{pcsVar}</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-400 mb-1">System Qty → Physical Qty</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink-500">{l.expectedQuantity}</span>
                      <span className="text-ink-300">→</span>
                      <input type="number" min="0" className={`input w-20 px-2 py-1 text-right font-semibold ${l.actualQuantity < 0 ? 'border-red-500' : ''}`} disabled={readOnly} value={l.actualQuantity} onChange={(e) => updateLine(l.id, { actualQuantity: parseFloat(e.target.value) || 0 })} />
                      {l.variance !== 0 && <span className={`text-sm font-bold ${VAR_TEXT[tone]}`}>{l.variance > 0 ? '+' : ''}{l.variance}</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <input className={`input w-full px-2 py-1.5 text-sm ${needsReason ? 'border-amber-400' : ''}`} disabled={readOnly} value={l.reason ?? ''} placeholder={needsReason ? 'reason required' : 'reason (optional)'} onChange={(e) => updateLine(l.id, { reason: e.target.value })} />
                </div>
              </div>
            );
          })}
        </div>
        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-3 py-2">Barcode</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Variant</th>
              <th className="px-3 py-2">UOM</th>
              <th className="px-3 py-2 text-right">System PCS</th>
              <th className="px-3 py-2 text-right">Physical PCS</th>
              <th className="px-3 py-2 text-right">PCS Var</th>
              <th className="px-3 py-2 text-right">System Qty</th>
              <th className="px-3 py-2 text-right">Physical Qty</th>
              <th className="px-3 py-2 text-right">Qty Var</th>
              <th className="px-3 py-2 min-w-[110px]">Reason</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const v    = variants.find((x) => x.id === l.variantId);
              const p    = products.find((x) => x.id === l.productId);
              const tone = varianceTone(l.variance, l.expectedQuantity);
              const pcsVar = (l.actualRolls ?? 0) - (l.expectedRolls ?? 0);
              const pcsTone = varianceTone(pcsVar, l.expectedRolls ?? 0);
              // Fix 6: highlight ring for duplicate scan
              const isHighlighted = highlightId === l.id;
              // Fix 3: reason required if either PCS or Qty variance
              const needsReason = (pcsVar !== 0 || l.variance !== 0) && !l.reason?.trim() && !readOnly;
              return (
                <tr key={l.id} id={`row-${l.id}`}
                  className={`border-b border-ink-50 last:border-0 transition-colors ${
                    isHighlighted ? 'bg-amber-100 ring-2 ring-amber-400' : VAR_ROW[tone]
                  }`}>
                  <td className="px-3 py-2 font-mono text-xs text-ink-500">{v?.barcode ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-800 font-semibold">{p?.name ?? productName(l.productId)}</td>
                  <td className="px-3 py-2 text-ink-600">{v?.colorName ?? v?.label ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-400">{l.unit}</td>
                  {/* System PCS (from balance) */}
                  <td className="px-3 py-2 text-right text-ink-500">{l.expectedRolls ?? 0}</td>
                  {/* Physical PCS (entered) */}
                  <td className="px-3 py-2">
                    <input type="number" min="0"
                      className={`input w-16 px-2 py-1 text-right ${(l.actualRolls ?? 0) < 0 ? 'border-red-500' : ''}`}
                      disabled={readOnly}
                      value={l.actualRolls ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                        updateLine(l.id, { actualRolls: val }); // Fix 2: allow any value; validation blocks at submit
                      }} />
                  </td>
                  {/* PCS Variance */}
                  <td className={`px-3 py-2 text-right font-bold text-sm ${VAR_TEXT[pcsTone]}`}>
                    {pcsVar === 0 ? '—' : (pcsVar > 0 ? '+' : '') + pcsVar}
                  </td>
                  {/* System Qty (from balance) */}
                  <td className="px-3 py-2 text-right text-ink-500">{l.expectedQuantity}</td>
                  {/* Physical Qty (entered) */}
                  <td className="px-3 py-2">
                    <input type="number" min="0"
                      className={`input w-20 px-2 py-1 text-right font-semibold ${l.actualQuantity < 0 ? 'border-red-500' : ''}`}
                      disabled={readOnly}
                      value={l.actualQuantity}
                      onChange={(e) => updateLine(l.id, { actualQuantity: parseFloat(e.target.value) || 0 })} />
                  </td>
                  {/* Qty Variance */}
                  <td className={`px-3 py-2 text-right font-bold text-sm ${VAR_TEXT[tone]}`}>
                    {l.variance === 0 ? '—' : (l.variance > 0 ? '+' : '') + l.variance}
                  </td>
                  {/* Reason — required if PCS variance OR Qty variance */}
                  <td className="px-3 py-2">
                    <input className={`input px-2 py-1 text-sm min-w-[100px] ${needsReason ? 'border-amber-400' : ''}`}
                      disabled={readOnly}
                      value={l.reason ?? ''}
                      placeholder={needsReason ? 'reason required' : ''}
                      onChange={(e) => updateLine(l.id, { reason: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!readOnly && <button className="text-ink-400 hover:text-red-500" onClick={() => removeLine(l.id)}>✕</button>}
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-ink-400">
                  Use barcode scan, variant search, or <b>Load All Shop Stock</b> to add lines.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {/* ── Summary panel ── */}
      {lines.length > 0 && (
        <div className="card mb-4 p-4">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Count Summary</h3>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3 lg:grid-cols-6">
            <SummaryCell label="Lines counted"     value={String(summary.lineCount)} />
            <SummaryCell label="Lines with variance" value={String(summary.linesWithVariance)}
              tone={summary.linesWithVariance > 0 ? 'amber' : 'green'} />
            <SummaryCell label="Total PCS variance"  value={(summary.totalPcsVariance > 0 ? '+' : '') + summary.totalPcsVariance}
              tone={summary.totalPcsVariance !== 0 ? 'red' : 'green'} />
            <SummaryCell label="Total Qty variance"  value={(summary.totalQtyVariance > 0 ? '+' : '') + summary.totalQtyVariance}
              tone={summary.totalQtyVariance !== 0 ? 'red' : 'green'} />
            <SummaryCell label="Positive adjustments" value={String(summary.positiveAdj)} tone="green" />
            {showCosts && (
            <SummaryCell label="Est. value diff (MVR)"
              value={(summary.varianceValueMvr > 0 ? '+' : '') + summary.varianceValueMvr.toFixed(2)}
              tone={summary.varianceValueMvr < 0 ? 'red' : summary.varianceValueMvr > 0 ? 'amber' : 'green'} />
            )}
          </div>
        </div>
      )}

      {/* ── Actions — sticky on mobile ── */}
      <div className="fixed bottom-16 inset-x-0 z-20 flex flex-wrap items-center gap-2 border-t border-ink-100 bg-white px-4 py-3 md:relative md:bottom-auto md:inset-x-auto md:border-0 md:bg-transparent md:p-0">
        {/* Warehouse staff actions */}
        {!readOnly && (
          <>
            <button className="btn-ghost" onClick={doSave}>Save draft</button>
            <button className="btn-primary" onClick={doSubmit}>Submit for approval</button>
          </>
        )}
        {/* Rejected → can resubmit after editing */}
        {count?.status === 'rejected' && (
          <>
            <button className="btn-ghost" onClick={doSave}>Save</button>
            <button className="btn-primary" onClick={doSubmit}>Resubmit</button>
          </>
        )}
        {/* Approver actions */}
        {count?.status === 'submitted' && isApprover && (
          <>
            <button className="btn-primary" onClick={doApprove}>Approve & post corrections</button>
            <button className="btn-danger" onClick={() => setShowReject(true)}>Reject</button>
          </>
        )}
        {count?.status === 'submitted' && !isApprover && (
          <Badge tone="info">Awaiting manager approval</Badge>
        )}
        {/* Delete draft */}
        {count?.status === 'open' && (
          <button className="btn-ghost text-red-500 hover:bg-red-50 ml-auto"
            onClick={() => setConfirmDeleteDraft(true)}>Delete draft</button>
        )}
      </div>

      {msg && <div className="mt-3"><Badge tone={msg.tone}>{msg.text}</Badge></div>}
      {count?.status === 'approved' && (
        <p className="mt-3 text-xs text-ink-400">
          Approved on {count.approvedAt ? new Date(count.approvedAt).toLocaleString() : '—'} —
          variances posted to stock_balances with STOCK_COUNT_CORRECTION audit entries.
        </p>
      )}
    </div>
  );
}

// ── Mini components ───────────────────────────────────────────────────────────
function SummaryCell({ label, value, tone = 'neutral' }: {
  label: string; value: string; tone?: 'green' | 'amber' | 'red' | 'neutral';
}) {
  const colours = { green: 'text-teal-700', amber: 'text-amber-700', red: 'text-red-700', neutral: 'text-ink-800' };
  return (
    <div className="rounded-lg bg-ink-50 p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-ink-400">{label}</div>
      <div className={`mt-1 text-base font-bold ${colours[tone]}`}>{value}</div>
    </div>
  );
}
