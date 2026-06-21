import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, EmptyState, Field } from '../components/ui';
import { MOVE_REASON_LABELS, type MoveReason, type Transfer, type TransferLine } from '../types';
import { can } from '../lib/permissions';

function lineId() { return `tl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

// ---- Shared Qty Calculator (same as Receiving) ----
function QtyCalculator({ onApply, onClose }: {
  onApply: (pcs: number, totalQty: number, uom: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'quick' | 'detailed'>('quick');
  const [pcsCount, setPcsCount] = useState('');
  const [eachQty, setEachQty]   = useState('');
  const [inputUom, setInputUom] = useState('Yard');
  const [entries, setEntries]   = useState('');
  const [multiplier, setMultiplier] = useState('1');
  const [outputUom, setOutputUom]   = useState('Yard');

  const result = (() => {
    const mult = parseFloat(multiplier) || 1;
    if (mode === 'quick') {
      const p = parseInt(pcsCount) || 0;
      const each = parseFloat(eachQty) || 0;
      const inputTotal = Math.round(p * each * 100) / 100;
      return { pcs: p, inputTotal, inputUom, totalQty: Math.round(inputTotal * mult * 100) / 100, outputUom };
    }
    const nums = entries.split(/[\n,]+/).map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n > 0);
    const inputTotal = Math.round(nums.reduce((s, n) => s + n, 0) * 100) / 100;
    return { pcs: nums.length, inputTotal, inputUom, totalQty: Math.round(inputTotal * mult * 100) / 100, outputUom };
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-80 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-ink-900">Qty Calculator</h3>
          <button className="text-ink-400 hover:text-ink-700" onClick={onClose}>✕</button>
        </div>
        <div className="mb-3 flex gap-2 text-xs">
          {(['quick', 'detailed'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded px-3 py-1 font-semibold capitalize ${mode === m ? 'bg-teal-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
              {m}
            </button>
          ))}
        </div>
        {mode === 'quick' ? (
          <div className="space-y-2">
            <Field label="PCS"><input className="input" type="number" placeholder="10" value={pcsCount} onChange={(e) => setPcsCount(e.target.value)} /></Field>
            <Field label="Qty each"><input className="input" type="number" placeholder="25" value={eachQty} onChange={(e) => setEachQty(e.target.value)} /></Field>
            <Field label="Input UOM"><input className="input" value={inputUom} onChange={(e) => setInputUom(e.target.value)} /></Field>
          </div>
        ) : (
          <div className="space-y-2">
            <Field label="Enter each qty (one per line)">
              <textarea className="input h-24 resize-none font-mono text-sm" placeholder={'25\n24\n26\n25'} value={entries} onChange={(e) => setEntries(e.target.value)} />
            </Field>
            <Field label="Input UOM"><input className="input" value={inputUom} onChange={(e) => setInputUom(e.target.value)} /></Field>
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="Multiplier"><input className="input" type="number" value={multiplier} placeholder="1" onChange={(e) => setMultiplier(e.target.value)} /></Field>
          <Field label="Output UOM"><input className="input" value={outputUom} onChange={(e) => setOutputUom(e.target.value)} /></Field>
        </div>
        <div className="mt-3 space-y-1 rounded-lg bg-ink-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-ink-400">PCS:</span><b>{result.pcs}</b></div>
          <div className="flex justify-between"><span className="text-ink-400">Input Total:</span><b>{result.inputTotal} {result.inputUom}</b></div>
          <div className="flex justify-between"><span className="text-ink-400">Multiplier:</span><b>{parseFloat(multiplier) || 1}</b></div>
          <div className="flex justify-between border-t border-ink-100 pt-1"><span className="font-semibold text-ink-500">Total Qty:</span><b className="text-teal-700">{result.totalQty} {result.outputUom}</b></div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={result.pcs === 0}
            onClick={() => { onApply(result.pcs, result.totalQty, result.outputUom); onClose(); }}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Confirm Dialog ----
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

// ---- Move Stock list (TASK 4 columns) ----
export function Transfers() {
  const { user, transfers, variants, visibleShopIds, shopName, deleteTransferDraft } = useStore();
  const [editing, setEditing] = useState<Transfer | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canMove = can(user?.role, 'transfer_stock');
  const visible = useMemo(
    () => transfers
      .filter((t) => visibleShopIds.includes(t.fromShopId))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [transfers, visibleShopIds],
  );

  if (editing) return <MoveEditor transfer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />;

  return (
    <div>
      {confirmDelete && (
        <ConfirmDialog
          message="Delete this draft move? This cannot be undone."
          onConfirm={async () => {
            const res = await deleteTransferDraft(confirmDelete);
            if (res.ok) setConfirmDelete(null);
            else alert(`Delete failed: ${res.error}`);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      <PageHeader
        title="Move Stock"
        subtitle="Move stock out of the godown. Decrements variant PCS and quantity."
        action={canMove && <button className="btn-primary" onClick={() => setEditing('new')}>New move</button>}
      />
      {visible.length === 0 ? (
        <EmptyState title="No moves yet" hint={canMove ? 'Create one to record stock leaving the godown.' : 'Nothing to show.'} />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {visible.map((t) => {
              const totalPcs = t.lines.reduce((s, l) => s + (l.rollQty ?? 0), 0);
              const totalQty = t.lines.reduce((s, l) => s + (l.quantity ?? 0), 0);
              return (
                <div key={t.id} className="card p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-ink-800">{t.transferNo}</span>
                    <Badge tone={t.status === 'sent' || t.status === 'received' ? 'ok' : 'neutral'}>{t.status}</Badge>
                  </div>
                  <div className="text-sm text-ink-500">{shopName(t.fromShopId)} · {t.reason ? MOVE_REASON_LABELS[t.reason] : '—'}</div>
                  <div className="text-xs text-ink-400">{totalQty > 0 ? `${totalQty} qty` : ''}{totalPcs > 0 ? ` · ${totalPcs} PCS` : ''}</div>
                  <div className="mt-2 flex gap-2">
                    <button className="btn-ghost px-3 py-1 text-xs flex-1" onClick={() => setEditing(t)}>{t.status === 'draft' ? 'Edit' : 'View'}</button>
                    {t.status === 'draft' && <button className="btn-ghost px-2 py-1 text-xs text-red-500" onClick={() => setConfirmDelete(t.id)}>Delete</button>}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3">Move No</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">From Shop</th>
                  <th className="px-4 py-3">Reason</th><th className="px-4 py-3 text-right">PCS</th>
                  <th className="px-4 py-3 text-right">Total Qty</th><th className="px-4 py-3 text-right">Lines</th>
                  <th className="px-4 py-3">Status</th><th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const totalPcs = t.lines.reduce((s, l) => s + (l.rollQty ?? 0), 0);
                  const totalQty = t.lines.reduce((s, l) => s + (l.quantity ?? 0), 0);
                  const unit = t.lines[0] ? (variants.find((v) => v.id === t.lines[0].variantId)?.uom ?? t.lines[0].unit) : '';
                  return (
                    <tr key={t.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                      <td className="px-4 py-3 font-semibold text-ink-800">{t.transferNo}</td>
                      <td className="px-4 py-3 text-ink-500">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 text-ink-600">{shopName(t.fromShopId)}</td>
                      <td className="px-4 py-3 text-ink-500">{t.reason ? MOVE_REASON_LABELS[t.reason] : '—'}</td>
                      <td className="px-4 py-3 text-right text-ink-600">{totalPcs || '—'}</td>
                      <td className="px-4 py-3 text-right text-ink-600">{totalQty > 0 ? `${totalQty} ${unit}` : '—'}</td>
                      <td className="px-4 py-3 text-right text-ink-500">{t.lines.length}</td>
                      <td className="px-4 py-3"><Badge tone={t.status === 'sent' || t.status === 'received' ? 'ok' : 'neutral'}>{t.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(t)}>{t.status === 'draft' ? 'Edit' : 'View'}</button>
                          {t.status === 'draft' && <button className="btn-ghost px-2 py-1 text-xs text-red-500 hover:bg-red-50" onClick={() => setConfirmDelete(t.id)}>Delete</button>}
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => window.print()}>Print</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Move editor (table-based, with Qty Calculator and smart addLine) ----
function MoveEditor({ transfer, onClose }: { transfer: Transfer | null; onClose: () => void }) {
  const { user, shops, variants, products, visibleShopIds, balances,
    nextTransferNo, saveTransferDraft, sendTransfer, deleteTransferDraft,
  } = useStore();

  const editableShops = shops.filter((s) => visibleShopIds.includes(s.id));
  const readOnly = transfer?.status === 'sent' || transfer?.status === 'received';

  const [fromShopId, setFromShopId] = useState(transfer?.fromShopId ?? editableShops[0]?.id ?? '');
  const [reason, setReason] = useState<MoveReason>(transfer?.reason ?? 'shop_refill');
  const [notes, setNotes] = useState(transfer?.notes ?? '');
  const [lines, setLines] = useState<TransferLine[]>(transfer?.lines ?? []);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'out'; text: string } | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [calcFor, setCalcFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const transferNo = transfer?.transferNo ?? nextTransferNo();

  // T2B: Smart addLine — copies previous row's Product/Variant/UOM, clears PCS/Qty
  const addLine = () => {
    const prev = lines.length > 0 ? lines[lines.length - 1] : null;
    setLines((p) => [...p, {
      id: lineId(),
      barcode: prev?.barcode ?? '',
      productId: prev?.productId ?? '',
      variantId: prev?.variantId ?? '',
      unit: prev?.unit ?? 'Yard',
      rollQty: 0,
      quantity: 0,
      remarks: '',
    }]);
  };

  const removeLine = (id: string) => setLines((p) => p.filter((l) => l.id !== id));
  const patchLine = (id: string, patch: Partial<TransferLine>) =>
    setLines((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // T2B: Barcode scan — fill Product, Variant, UOM
  const onBarcodeScanned = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const v = variants.find((x) => x.barcode?.toLowerCase() === trimmed.toLowerCase());
    if (!v) { setMsg({ tone: 'out', text: `No product/variant found for "${trimmed}"` }); return; }
    const p = products.find((x) => x.id === v.productId);
    if (lines.some((l) => l.variantId === v.id)) {
      setMsg({ tone: 'out', text: `${p?.name} · ${v.label} already in list` }); return;
    }
    setLines((prev) => [...prev, {
      id: lineId(), barcode: trimmed,
      productId: v.productId, variantId: v.id,
      unit: v.uom ?? p?.defaultUnit ?? 'Yard',
      rollQty: 0, quantity: 0, remarks: '',
    }]);
    setMsg({ tone: 'ok', text: `${p?.name} · ${v.colorName ?? v.label} added` });
    setBarcodeInput('');
  };

  // T2C: available stock from owner balance only
  const ownerAvailable = (variantId: string) =>
    balances.find((b) => b.variantId === variantId && b.ownerShopId === fromShopId);

  // Validation — owner-specific
  const warnings = (() => {
    const w: string[] = [];
    if (!fromShopId) w.push('Select an owner shop');
    if (!reason) w.push('Select a reason');
    lines.forEach((l, i) => {
      const n = i + 1;
      if (!l.variantId) { w.push(`Line ${n}: no variant`); return; }
      const v = variants.find((x) => x.id === l.variantId);
      const pcs = l.rollQty ?? 0;
      const qty = l.quantity ?? 0;
      if (qty <= 0) w.push(`Line ${n}: quantity must be > 0`);
      const ob = ownerAvailable(l.variantId);
      const availQty = ob?.quantity ?? 0;
      const availPcs = ob?.rollCount ?? 0;
      if (qty > availQty) w.push(`Line ${n}: only ${availQty} ${v?.uom ?? ''} available for this shop`);
      if (pcs > 0 && pcs > availPcs) w.push(`Line ${n}: only ${availPcs} PCS available for this shop`);
      if (reason === 'damaged_goods' && !l.remarks?.trim()) w.push(`Line ${n}: remarks required for damaged goods`);
    });
    return w;
  })();

  const doPost = async () => {
    if (lines.length === 0) { setMsg({ tone: 'out', text: 'Add at least one line' }); return; }
    if (lines.some((l) => !l.variantId || (l.quantity ?? 0) <= 0)) {
      setMsg({ tone: 'out', text: 'Every line needs a variant and qty > 0' }); return;
    }
    if (warnings.length > 0) { setMsg({ tone: 'out', text: warnings[0] }); return; }
    const totalValue = lines.reduce((s, l) => {
      const v = variants.find((x) => x.id === l.variantId);
      return s + (l.quantity ?? 0) * (v?.cost ?? 0);
    }, 0);
    const payload = {
      id: transfer?.id, transferNo, type: 'transfer_out' as const,
      reason, fromShopId, toShopId: fromShopId,
      preparedBy: user?.uid ?? '', notes, lines,
      totalCostValue: Math.round(totalValue * 100) / 100,
    };
    const res = await sendTransfer(payload);
    if (res.ok) { setMsg({ tone: 'ok', text: 'Stock moved ✓' }); setTimeout(onClose, 900); }
    else setMsg({ tone: 'out', text: res.error ?? 'Move failed' });
  };

  const doSaveDraft = () => {
    if (!fromShopId) { setMsg({ tone: 'out', text: 'Select a shop first' }); return; }
    saveTransferDraft({ id: transfer?.id, transferNo, type: 'transfer_out', reason, fromShopId, toShopId: fromShopId, preparedBy: user?.uid ?? '', notes, lines });
    setMsg({ tone: 'ok', text: 'Draft saved' });
  };

  return (
    <div>
      {calcFor && (
        <QtyCalculator
          onApply={(pcs, totalQty, uom) => { patchLine(calcFor, { rollQty: pcs, quantity: totalQty, unit: uom }); setCalcFor(null); }}
          onClose={() => setCalcFor(null)}
        />
      )}
      {confirmDelete && transfer?.status === 'draft' && (
        <ConfirmDialog
          message={`Delete draft ${transferNo}? This cannot be undone.`}
          onConfirm={async () => {
            const res = await deleteTransferDraft(transfer.id);
            if (res.ok) onClose();
            else setMsg({ tone: 'out', text: `Delete failed: ${res.error}` });
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <PageHeader
        title={`Move Stock ${transferNo}`}
        subtitle={transfer ? `Status: ${transfer.status}` : 'New move'}
        action={<button className="btn-ghost" onClick={onClose}>← Back</button>}
      />

      {/* Header */}
      <div className="card mb-4 p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="Owner shop (from godown)">
            <select className="input" disabled={readOnly} value={fromShopId} onChange={(e) => setFromShopId(e.target.value)}>
              <option value="">Select…</option>
              {editableShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Reason">
            <select className="input" disabled={readOnly} value={reason} onChange={(e) => setReason(e.target.value as MoveReason)}>
              {(Object.keys(MOVE_REASON_LABELS) as MoveReason[]).map((r) => (
                <option key={r} value={r}>{MOVE_REASON_LABELS[r]}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes / Destination">
            <input className="input" disabled={readOnly} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shop name, order #…" />
          </Field>
        </div>
        {!readOnly && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1">
              <label className="label">Scan barcode to add line</label>
              <input className="input font-mono" placeholder="AUR-C01…" value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onBarcodeScanned(barcodeInput); }} />
            </div>
            <div className="mt-4">
              <button className="btn-ghost" onClick={() => onBarcodeScanned(barcodeInput)}>Add</button>
            </div>
          </div>
        )}
      </div>

      {/* Lines — cards on mobile, table on desktop */}
      <div className="card mb-4">
        {/* Mobile cards */}
        <div className="md:hidden">
          {lines.length === 0 && <div className="px-4 py-6 text-center text-sm text-ink-400">No lines. Scan a barcode or click "+ Add row".</div>}
          {lines.map((l) => {
            const v = variants.find((x) => x.id === l.variantId);
            const pVars = variants.filter((x) => x.productId === l.productId);
            const ob = ownerAvailable(l.variantId);
            return (
              <div key={l.id} className="border-b border-ink-100 last:border-0 p-4 space-y-2">
                <div className="flex gap-2">
                  <select className="input flex-1 text-sm" disabled={readOnly} value={l.productId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); patchLine(l.id, { productId: e.target.value, variantId: '', unit: p?.defaultUnit ?? 'Yard' }); }}>
                    <option value="">Product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select className="input flex-1 text-sm" disabled={readOnly} value={l.variantId} onChange={(e) => { const fv = variants.find((x) => x.id === e.target.value); patchLine(l.id, { variantId: e.target.value, barcode: fv?.barcode ?? '', unit: fv?.uom ?? 'Yard' }); }}>
                    <option value="">Variant…</option>{pVars.map((fv) => <option key={fv.id} value={fv.id}>{fv.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[10px] text-ink-400">PCS</div>
                    <div className="flex gap-1">
                      <input type="number" className="input w-full text-right" disabled={readOnly} value={l.rollQty || ''} placeholder="0" onChange={(e) => patchLine(l.id, { rollQty: Number(e.target.value) || 0 })} />
                      {!readOnly && <button className="h-8 w-8 flex-shrink-0 rounded bg-ink-100 text-xs hover:bg-teal-100" onClick={() => setCalcFor(l.id)}>+</button>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-400">Total Qty</div>
                    <input type="number" className="input w-full font-semibold text-right" disabled={readOnly} value={l.quantity || ''} placeholder="0" onChange={(e) => patchLine(l.id, { quantity: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-400">UOM</div>
                    <input className="input w-full" disabled={readOnly} value={l.unit} onChange={(e) => patchLine(l.id, { unit: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-teal-700 font-semibold">Avail: {ob ? `${ob.quantity} ${v?.uom ?? l.unit}` : '—'}</span>
                  <input className="input flex-1 mx-2 text-sm" disabled={readOnly} value={l.remarks ?? ''} placeholder={reason === 'damaged_goods' ? 'remarks required' : 'remarks…'} onChange={(e) => patchLine(l.id, { remarks: e.target.value })} />
                  {!readOnly && <button className="text-ink-400 hover:text-red-500" onClick={() => removeLine(l.id)}>✕</button>}
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
              <th className="px-2 py-2">Barcode</th><th className="px-2 py-2">Product</th><th className="px-2 py-2">Variant</th><th className="px-2 py-2 text-right">PCS</th><th className="px-2 py-2 text-right">Total Qty</th><th className="px-2 py-2">UOM</th><th className="px-2 py-2">Available</th><th className="px-2 py-2">Remarks</th><th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const v = variants.find((x) => x.id === l.variantId);
              const pVars = variants.filter((x) => x.productId === l.productId);
              const ob = ownerAvailable(l.variantId);
              return (
                <tr key={l.id} className="border-b border-ink-50 last:border-0">
                  <td className="px-2 py-1.5">
                    <input className="input w-20 px-2 py-1 font-mono text-xs" disabled={readOnly}
                      value={l.barcode ?? ''} placeholder="scan"
                      onChange={(e) => {
                        const code = e.target.value;
                        const fv = variants.find((x) => x.barcode?.toLowerCase() === code.toLowerCase());
                        if (fv) {
                          const p = products.find((x) => x.id === fv.productId);
                          patchLine(l.id, { barcode: code, variantId: fv.id, productId: fv.productId, unit: fv.uom ?? p?.defaultUnit ?? 'Yard' });
                        } else patchLine(l.id, { barcode: code });
                      }} />
                  </td>
                  <td className="px-2 py-1.5">
                    <select className="input min-w-[110px] px-2 py-1" disabled={readOnly} value={l.productId}
                      onChange={(e) => {
                        const p = products.find((x) => x.id === e.target.value);
                        patchLine(l.id, { productId: e.target.value, variantId: '', unit: p?.defaultUnit ?? 'Yard' });
                      }}>
                      <option value="">—</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select className="input min-w-[90px] px-2 py-1" disabled={readOnly} value={l.variantId}
                      onChange={(e) => {
                        const fv = variants.find((x) => x.id === e.target.value);
                        patchLine(l.id, { variantId: e.target.value, barcode: fv?.barcode ?? '', unit: fv?.uom ?? 'Yard' });
                      }}>
                      <option value="">—</option>
                      {pVars.map((fv) => <option key={fv.id} value={fv.id}>{fv.label}</option>)}
                    </select>
                  </td>
                  {/* PCS with calculator */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input type="number" className="input w-14 px-2 py-1 text-right" disabled={readOnly}
                        value={l.rollQty || ''} placeholder="0"
                        onChange={(e) => patchLine(l.id, { rollQty: Number(e.target.value) || 0 })} />
                      {!readOnly && (
                        <button className="flex h-6 w-6 items-center justify-center rounded bg-ink-100 text-xs font-bold text-ink-500 hover:bg-teal-100 hover:text-teal-700"
                          title="Qty Calculator" onClick={() => setCalcFor(l.id)}>+</button>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" className="input w-16 px-2 py-1 text-right font-semibold" disabled={readOnly}
                      value={l.quantity || ''} placeholder="0"
                      onChange={(e) => patchLine(l.id, { quantity: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className="input w-14 px-2 py-1" disabled={readOnly}
                      value={l.unit} onChange={(e) => patchLine(l.id, { unit: e.target.value })} />
                  </td>
                  {/* T2C: owner-shop available only */}
                  <td className="px-2 py-1.5">
                    {ob ? (
                      <div className="text-xs">
                        <div className="font-semibold text-teal-700">{ob.quantity} {v?.uom ?? l.unit}</div>
                        {(ob.rollCount ?? 0) > 0 && <div className="text-ink-400">{ob.rollCount} PCS</div>}
                      </div>
                    ) : <span className="text-xs text-ink-400">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <input className="input w-24 px-2 py-1 text-xs" disabled={readOnly}
                      value={l.remarks ?? ''} placeholder={reason === 'damaged_goods' ? 'required' : 'optional'}
                      onChange={(e) => patchLine(l.id, { remarks: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    {!readOnly && <button className="text-ink-400 hover:text-red-500" onClick={() => removeLine(l.id)}>✕</button>}
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-ink-400">
                No lines. Scan a barcode or click "+ Add row".
              </td></tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold text-xs text-ink-400">
                <td colSpan={3} className="px-2 py-2">Totals</td>
                <td className="px-2 py-2 text-right text-ink-700">{lines.reduce((s, l) => s + (l.rollQty ?? 0), 0)}</td>
                <td className="px-2 py-2 text-right text-ink-700">{lines.reduce((s, l) => s + (l.quantity ?? 0), 0)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
        </div>{/* end desktop table */}
      </div>

      {/* Warnings */}
      {!readOnly && warnings.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-amber-700">Check before posting</div>
          <ul className="mt-1 space-y-0.5">
            {warnings.map((w, i) => <li key={i} className="text-xs text-amber-800">• {w}</li>)}
          </ul>
        </div>
      )}

      {/* Sticky actions on mobile */}
      {!readOnly && (
        <div className="fixed bottom-16 inset-x-0 z-20 border-t border-ink-100 bg-white px-4 py-3 md:relative md:bottom-auto md:inset-x-auto md:border-0 md:bg-transparent md:p-0">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost text-sm" onClick={addLine}>+ Add row</button>
            <div className="ml-auto flex gap-2">
              {transfer?.status === 'draft' && (
                <button className="btn-ghost text-sm text-red-500 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>Delete draft</button>
              )}
              <button className="btn-ghost text-sm" onClick={doSaveDraft}>Save draft</button>
              {can(user?.role, 'transfer_stock') && (
                <button className="btn-primary text-sm" onClick={doPost}>Post move</button>
              )}
            </div>
          </div>
        </div>
      )}
      {msg && <div className="mt-3"><Badge tone={msg.tone}>{msg.text}</Badge></div>}
      {readOnly && <p className="mt-3 text-xs text-ink-400">Posted moves are permanent.</p>}
    </div>
  );
}
