import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, EmptyState, Field } from '../components/ui';
import { can } from '../lib/permissions';
import type { Receiving, ReceivingLine } from '../types';

const STATUS_TONE = { draft: 'neutral', posted: 'ok', cancelled: 'out' } as const;

function lineId() { return `l_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

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

export function Receiving() {
  const store = useStore();
  const { user, receivings, visibleShopIds, shopName, supplierName, deleteReceivingDraft } = store;
  const [editing, setEditing] = useState<Receiving | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canReceive = can(user?.role, 'receive_stock');
  // Scope receivings to shops the user can see.
  const visible = useMemo(
    () => receivings.filter((r) => visibleShopIds.includes(r.ownerShopId)).sort((a, b) => b.createdAt - a.createdAt),
    [receivings, visibleShopIds],
  );

  if (editing) {
    return <ReceivingEditor receiving={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />;
  }

  return (
    <div>
      {confirmDelete && (
        <ConfirmDialog
          message="Delete this draft receiving? This cannot be undone."
          onConfirm={async () => {
            const res = await deleteReceivingDraft(confirmDelete);
            if (res.ok) setConfirmDelete(null);
            else alert(`Delete failed: ${res.error}`);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      <PageHeader
        title="Receiving"
        subtitle="Record incoming stock. Posting increases balances and writes audit logs."
        action={canReceive && <button className="btn-primary" onClick={() => setEditing('new')}>New receiving</button>}
      />

      {visible.length === 0 ? (
        <EmptyState title="No receivings yet" hint={canReceive ? 'Create one to record incoming stock.' : 'Nothing to show for your shops.'} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Receiving No</th>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3 text-right">Lines</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                  <td className="px-4 py-3 font-semibold text-ink-800">{r.receivingNo}</td>
                  <td className="px-4 py-3 text-ink-600">{shopName(r.ownerShopId)}</td>
                  <td className="px-4 py-3 text-ink-600">{r.supplierId ? supplierName(r.supplierId) : '—'}</td>
                  <td className="px-4 py-3 text-ink-500">{r.invoiceNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{r.lines.length}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditing(r)}>
                        {r.status === 'draft' ? 'Edit' : 'View'}
                      </button>
                      {r.status === 'draft' && (
                        <button className="btn-ghost px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                          onClick={() => setConfirmDelete(r.id)}>Delete</button>
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

const FOB_UOM_OPTIONS = ['Yard', 'Meter', 'Muh', 'PCS', 'Dozen', 'Pack', 'Box', 'Roll'];

// QtyCalculator popup — Quick and Detailed modes with optional UOM multiplier.
function QtyCalculator({ onApply, onClose }: { onApply: (pcs: number, totalQty: number, uom: string) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'quick' | 'detailed'>('quick');
  // Quick mode
  const [pcsCount, setPcsCount] = useState('');
  const [eachQty, setEachQty]   = useState('');
  const [inputUom, setInputUom] = useState('Yard');
  // Detailed mode
  const [entries, setEntries] = useState('');
  // Shared
  const [multiplier, setMultiplier] = useState('1');
  const [outputUom, setOutputUom]   = useState('Yard');

  const result = (() => {
    const mult = parseFloat(multiplier) || 1;
    if (mode === 'quick') {
      const p  = parseInt(pcsCount) || 0;
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
          <button onClick={() => setMode('quick')}
            className={`rounded px-3 py-1 font-semibold ${mode === 'quick' ? 'bg-teal-600 text-white' : 'bg-ink-100 text-ink-600'}`}>Quick</button>
          <button onClick={() => setMode('detailed')}
            className={`rounded px-3 py-1 font-semibold ${mode === 'detailed' ? 'bg-teal-600 text-white' : 'bg-ink-100 text-ink-600'}`}>Detailed</button>
        </div>

        {mode === 'quick' ? (
          <div className="space-y-2">
            <Field label="PCS"><input className="input" type="number" placeholder="10" value={pcsCount} onChange={(e) => setPcsCount(e.target.value)} /></Field>
            <Field label="Qty each"><input className="input" type="number" placeholder="25" value={eachQty} onChange={(e) => setEachQty(e.target.value)} /></Field>
            <Field label="Input UOM"><input className="input" value={inputUom} onChange={(e) => setInputUom(e.target.value)} placeholder="Yard" /></Field>
          </div>
        ) : (
          <div className="space-y-2">
            <Field label="Enter each qty (one per line)">
              <textarea className="input h-24 resize-none font-mono text-sm" placeholder={'25\n24\n26\n25'} value={entries} onChange={(e) => setEntries(e.target.value)} />
            </Field>
            <Field label="Input UOM"><input className="input" value={inputUom} onChange={(e) => setInputUom(e.target.value)} placeholder="Yard" /></Field>
          </div>
        )}

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="Multiplier"><input className="input" type="number" value={multiplier} placeholder="1" onChange={(e) => setMultiplier(e.target.value)} /></Field>
          <Field label="Output UOM"><input className="input" value={outputUom} onChange={(e) => setOutputUom(e.target.value)} placeholder="Yard" /></Field>
        </div>

        {/* Clear summary */}
        <div className="mt-3 space-y-1 rounded-lg bg-ink-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-ink-400">PCS:</span><b>{result.pcs}</b></div>
          <div className="flex justify-between"><span className="text-ink-400">Input Total:</span><b>{result.inputTotal} {result.inputUom}</b></div>
          <div className="flex justify-between"><span className="text-ink-400">Multiplier:</span><b>{parseFloat(multiplier) || 1}</b></div>
          <div className="flex justify-between border-t border-ink-100 pt-1"><span className="text-ink-500 font-semibold">Total Qty:</span><b className="text-teal-700">{result.totalQty} {result.outputUom}</b></div>
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

function ReceivingEditor({ receiving, onClose }: { receiving: Receiving | null; onClose: () => void }) {
  const {
    user, shops, suppliers, products, variants, rates,
    visibleShopIds, nextReceivingNo, saveReceivingDraft, postReceiving, lastFobOf,
    deleteReceivingDraft,
  } = useStore();

  const rateForCountry = (country: string) =>
    rates.find((r) => r.country.toLowerCase() === country.toLowerCase())?.finalUsedRate ?? 0;

  const editableShops = shops.filter((s) => visibleShopIds.includes(s.id));
  const readOnly = receiving?.status === 'posted' || receiving?.status === 'cancelled';

  const [header, setHeader] = useState({
    ownerShopId: receiving?.ownerShopId ?? editableShops[0]?.id ?? '',
    supplierId: receiving?.supplierId ?? '',
    country: receiving?.country ?? '',
    invoiceDate: receiving?.invoiceDate ?? '',
    invoiceNumber: receiving?.invoiceNumber ?? '',
    notes: receiving?.notes ?? '',
  });
  const [lines, setLines] = useState<ReceivingLine[]>(receiving?.lines ?? []);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'out'; text: string } | null>(null);
  const [calcFor, setCalcFor] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false);
  const receivingNo = receiving?.receivingNo ?? nextReceivingNo();

  // Rate always from header country — single source of truth.
  const countryRate = rateForCountry(header.country);

  // Build a clean blank line — never contains undefined fields (Firestore-safe).
  // Copies product/UOM/FOB defaults from the previous row when available (P5).
  const blankLine = (): ReceivingLine => {
    const prev = lines.length > 0 ? lines[lines.length - 1] : null;
    return {
      id: lineId(),
      barcode: '',
      productId: prev?.productId ?? '',
      variantId: '',
      category: '',
      stockUom: prev?.stockUom ?? 'PCS',
      fobUnit: prev?.fobUnit ?? 'PCS',
      fobUomUnit: prev?.fobUomUnit ?? 1,
      fobValue: prev?.fobValue ?? 0,
      // PCS and Total Qty intentionally empty for new row.
      rollQty: 0,
      quantity: 0,
      cost: 0,
      totalCost: 0,
      costChanged: false,
      remarks: '',
    };
  };

  const addLine = () => setLines((p) => [...p, blankLine()]);
  const removeLine = (id: string) => setLines((p) => p.filter((l) => l.id !== id));

  // recompute: never puts undefined into any field — every field has a safe default.
  // Rate ALWAYS comes from header (countryRate), not stored per-line.
  const recompute = (l: ReceivingLine): ReceivingLine => {
    const rate = countryRate; // always header rate
    let cost = 0;
    if ((l.fobValue ?? 0) > 0 && rate > 0) {
      const fobPerUnit = (l.fobValue ?? 0) / Math.max(l.fobUomUnit ?? 1, 0.001);
      cost = Math.round(fobPerUnit * rate * 100) / 100;
    }
    const totalCost = cost > 0 && (l.quantity ?? 0) > 0 ? Math.round((l.quantity ?? 0) * cost * 100) / 100 : 0;
    const prev = l.variantId ? lastFobOf(l.variantId) : undefined;
    const costChanged = cost > 0 && prev != null && Math.abs(cost - prev) > 0.0001;
    return {
      ...l,
      // Ensure every field is defined (no undefined anywhere).
      barcode: l.barcode ?? '',
      category: l.category ?? '',
      stockUom: l.stockUom ?? 'PCS',
      fobUnit: l.fobUnit ?? '',
      fobUomUnit: l.fobUomUnit ?? 1,
      fobValue: l.fobValue ?? 0,
      rollQty: l.rollQty ?? 0,
      quantity: l.quantity ?? 0,
      remarks: l.remarks ?? '',
      cost,
      totalCost,
      costChanged,
      // Do NOT write prevCost — only used for UI display, never stored.
    };
  };

  const patch = (id: string, p: Partial<ReceivingLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? recompute({ ...l, ...p }) : l)));

  // Country change: re-run recompute on all lines with the new rate.
  const setCountry = (country: string) => {
    setHeader((h) => ({ ...h, country }));
    // Recompute uses countryRate from closure — we need the new value, so compute inline.
    const newRate = rateForCountry(country);
    setLines((prev) => prev.map((l) => {
      if ((l.fobValue ?? 0) <= 0 || newRate <= 0) return l;
      const fobPerUnit = (l.fobValue ?? 0) / Math.max(l.fobUomUnit ?? 1, 0.001);
      const cost = Math.round(fobPerUnit * newRate * 100) / 100;
      const totalCost = cost > 0 && (l.quantity ?? 0) > 0 ? Math.round((l.quantity ?? 0) * cost * 100) / 100 : 0;
      return { ...l, cost, totalCost };
    }));
  };

  // Barcode scan: fill product + variant + UOM defaults. No undefined.
  const onBarcodeScanned = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const v = variants.find((x) => x.barcode?.toLowerCase() === trimmed.toLowerCase());
    if (!v) { setMsg({ tone: 'out', text: `No product/variant found for barcode "${trimmed}"` }); return; }
    const p = products.find((x) => x.id === v.productId);
    const uom = v.uom ?? p?.defaultUnit ?? 'Yard';
    const prev = lines.length > 0 ? lines[lines.length - 1] : null;
    const base: ReceivingLine = {
      id: lineId(), barcode: trimmed, productId: v.productId, variantId: v.id,
      category: p?.category ?? '', stockUom: uom, fobUnit: uom,
      fobUomUnit: prev?.fobUomUnit ?? 1, fobValue: prev?.fobValue ?? 0,
      rollQty: 0, quantity: 0, cost: 0, totalCost: 0, costChanged: false, remarks: '',
    };
    const emptyIdx = lines.findIndex((l) => !l.productId);
    if (emptyIdx >= 0) {
      setLines((prev) => prev.map((l, i) => i === emptyIdx ? recompute({ ...l, ...base }) : l));
    } else {
      setLines((prev) => [...prev, recompute(base)]);
    }
    setMsg({ tone: 'ok', text: `${p?.name ?? ''} · ${v.colorName ?? v.label}` });
    setBarcodeInput('');
  };

  // Product select: fill UOM defaults, clear variant.
  const onProduct = (id: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    const uom = p?.defaultUnit ?? 'PCS';
    patch(id, { productId, variantId: '', category: p?.category ?? '', stockUom: uom, fobUnit: uom });
  };

  // Variant select: fill barcode + UOM.
  const onVariant = (id: string, variantId: string) => {
    const v = variants.find((x) => x.id === variantId);
    const p = v ? products.find((x) => x.id === v.productId) : undefined;
    const uom = v?.uom ?? p?.defaultUnit ?? 'PCS';
    patch(id, { variantId, barcode: v?.barcode ?? '', stockUom: uom, fobUnit: uom });
  };

  // ---- Validation: ALL of these are blocking (P3) ----
  const blockingErrors = (() => {
    const e: string[] = [];
    if (!header.ownerShopId) e.push('Owner Shop is required');
    if (!header.supplierId)  e.push('Supplier is required');
    if (!header.country)     e.push('Country is required');
    if (!header.invoiceDate) e.push('Invoice Date is required');
    if (countryRate <= 0)    e.push('Country rate is missing or invalid. Set it in Administration → Country Rates.');
    if (lines.length === 0)  e.push('Add at least one line');
    lines.forEach((l, i) => {
      const n = i + 1;
      if (!l.productId)                  e.push(`Line ${n}: Product is required`);
      if (!l.variantId && l.productId && products.find((p) => p.id === l.productId)?.type === 'fabric')
                                          e.push(`Line ${n}: Variant is required for fabric`);
      if (!l.stockUom?.trim())            e.push(`Line ${n}: UOM is required`);
      if ((l.rollQty ?? 0) <= 0)          e.push(`Line ${n}: PCS must be > 0`);
      if ((l.quantity ?? 0) <= 0)         e.push(`Line ${n}: Total Qty must be > 0`);
      if ((l.fobValue ?? 0) <= 0)         e.push(`Line ${n}: FOB must be > 0`);
      if ((l.fobUomUnit ?? 0) <= 0)       e.push(`Line ${n}: FOB Unit must be > 0`);
      if (!l.fobUnit?.trim())             e.push(`Line ${n}: FOB UOM is required`);
      if (l.fobUnit && l.stockUom && l.fobUnit.trim().toLowerCase() !== l.stockUom.trim().toLowerCase())
                                          e.push(`Line ${n}: UOM and FOB UOM are different. Use Qty Calculator conversion or make them the same.`);
    });
    return e;
  })();

  // ---- Post: enforce ALL validations, pass payload directly to avoid race ----
  const doPost = async () => {
    if (blockingErrors.length > 0) {
      setMsg({ tone: 'out', text: blockingErrors[0] });
      return;
    }
    // Sanitize lines before passing (belt-and-suspenders — no undefined).
    const cleanLines = lines.map(recompute);
    const payload = { id: receiving?.id, receivingNo, ...header, lines: cleanLines };
    const res = await postReceiving(payload);
    if (res.ok) { setMsg({ tone: 'ok', text: 'Posted ✓ — stock updated' }); setTimeout(onClose, 900); }
    else setMsg({ tone: 'out', text: res.error ?? 'Post failed' });
  };

  const doSaveDraft = () => {
    if (!header.ownerShopId) { setMsg({ tone: 'out', text: 'Select an owner shop first' }); return; }
    const cleanLines = lines.map(recompute);
    saveReceivingDraft({ id: receiving?.id, receivingNo, ...header, lines: cleanLines });
    setMsg({ tone: 'ok', text: 'Draft saved' });
  };

  // ---- CSV ----
  const sampleCsv = () => {
    const rows = [
      'barcode,pcs,totalQty,uom,fob,fobUomUnit,fobUom',
      'AUR-C01,10,250,Yard,30,10,Yard',
      ',24,24,PCS,5,1,PCS',
    ].join('\n');
    downloadText(`${receivingNo}-sample.csv`, rows);
  };
  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const [head, ...rows] = text.split(/\r?\n/).filter(Boolean);
      const cols = head.split(',').map((c) => c.trim());
      const imported: ReceivingLine[] = rows.map((row) => {
        const cells = row.split(',');
        const get = (k: string) => cells[cols.indexOf(k)]?.trim();
        const code = get('barcode');
        const v = variants.find((x) => x.barcode === code);
        const p = v ? products.find((x) => x.id === v.productId) : undefined;
        const base: ReceivingLine = {
          id: lineId(), barcode: code ?? '',
          productId: v?.productId ?? '', variantId: v?.id ?? '',
          category: p?.category ?? '', stockUom: get('uom') || p?.defaultUnit || 'Yard',
          quantity: num(get('totalQty')) ?? num(get('pcs')) ?? 0,
          rollQty: num(get('pcs')) ?? 0,
          fobValue: num(get('fob')) ?? 0, fobUnit: get('fobUom') || 'Yard',
          fobUomUnit: num(get('fobUomUnit')) ?? 1,
          cost: 0, totalCost: 0, costChanged: false, remarks: '',
        };
        return recompute(base);
      });
      setLines((prev) => [...prev, ...imported]);
      setMsg({ tone: 'ok', text: `Imported ${imported.length} line(s)` });
    };
    reader.readAsText(file);
  };

  return (
    <div>
      {calcFor && (
        <QtyCalculator
          onApply={(pcs, totalQty, uom) => patch(calcFor, { quantity: totalQty, rollQty: pcs, stockUom: uom })}
          onClose={() => setCalcFor(null)}
        />
      )}
      {confirmDeleteDraft && receiving?.status === 'draft' && (
        <ConfirmDialog
          message={`Delete draft ${receivingNo}? This cannot be undone.`}
          onConfirm={async () => {
            const res = await deleteReceivingDraft(receiving.id);
            if (res.ok) onClose();
            else setMsg({ tone: 'out', text: `Delete failed: ${res.error}` });
          }}
          onCancel={() => setConfirmDeleteDraft(false)}
        />
      )}

      <PageHeader
        title={`Receiving ${receivingNo}`}
        subtitle={receiving ? `Status: ${receiving.status}` : 'New receiving'}
        action={<button className="btn-ghost" onClick={onClose}>← Back</button>}
      />

      {/* Header */}
      <div className="card mb-4 p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="Owner shop">
            <select className="input" disabled={readOnly} value={header.ownerShopId} onChange={(e) => setHeader({ ...header, ownerShopId: e.target.value })}>
              <option value="">Select…</option>
              {editableShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Supplier">
            <select className="input" disabled={readOnly} value={header.supplierId} onChange={(e) => {
              const sup = suppliers.find((x) => x.id === e.target.value);
              // If supplier has a country, update it and recompute costs (P7).
              if (sup?.country && sup.country !== header.country) {
                setHeader((h) => ({ ...h, supplierId: e.target.value, country: sup.country! }));
                setCountry(sup.country!);
              } else {
                setHeader((h) => ({ ...h, supplierId: e.target.value }));
              }
            }}>
              <option value="">Select…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label={`Country${countryRate > 0 ? ` · Rate: ${countryRate}` : ''}`}>
            <input className="input" disabled={readOnly} value={header.country} onChange={(e) => setCountry(e.target.value)} placeholder="Dubai, India…" />
          </Field>
          <Field label="Invoice date"><input type="date" className="input" disabled={readOnly} value={header.invoiceDate} onChange={(e) => setHeader({ ...header, invoiceDate: e.target.value })} /></Field>
          <Field label="Invoice number"><input className="input" disabled={readOnly} value={header.invoiceNumber} onChange={(e) => setHeader({ ...header, invoiceNumber: e.target.value })} /></Field>
          <Field label="Notes"><input className="input" disabled={readOnly} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></Field>
        </div>

        {/* Barcode scan input */}
        {!readOnly && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1">
              <label className="label">Scan barcode to add line</label>
              <input
                className="input font-mono"
                placeholder="Scan AUR-C01…"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { onBarcodeScanned(barcodeInput); }
                }}
              />
            </div>
            <div className="mt-4">
              <button className="btn-ghost" onClick={() => onBarcodeScanned(barcodeInput)}>Add</button>
            </div>
          </div>
        )}
      </div>

      {/* Lines table */}
      <div className="card mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-2 py-2">Barcode</th>
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2">Variant</th>
              <th className="px-2 py-2 text-right">PCS</th>
              <th className="px-2 py-2 text-right">Total Qty</th>
              <th className="px-2 py-2">UOM</th>
              <th className="px-2 py-2 text-right">FOB</th>
              <th className="px-2 py-2 text-right">FOB Unit</th>
              <th className="px-2 py-2">FOB UOM</th>
              <th className="px-2 py-2 text-right">Cost</th>
              <th className="px-2 py-2 text-right">Total Cost</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const prodVariants = variants.filter((v) => v.productId === l.productId);
              return (
                <tr key={l.id} className="border-b border-ink-50 last:border-0">
                  {/* Barcode */}
                  <td className="px-2 py-1.5">
                    <input className="input w-20 px-2 py-1 font-mono text-xs" disabled={readOnly} value={l.barcode ?? ''} placeholder="scan"
                      onChange={(e) => {
                        const code = e.target.value;
                        const v = variants.find((x) => x.barcode?.toLowerCase() === code.toLowerCase());
                        if (v) {
                          const p = products.find((x) => x.id === v.productId);
                          patch(l.id, { barcode: code, productId: v.productId, variantId: v.id, category: p?.category, stockUom: v.uom ?? p?.defaultUnit ?? 'Yard', fobUnit: v.uom ?? p?.defaultUnit ?? 'Yard' });
                        } else patch(l.id, { barcode: code });
                      }}
                    />
                  </td>
                  {/* Product */}
                  <td className="px-2 py-1.5">
                    <select className="input min-w-[110px] px-2 py-1" disabled={readOnly} value={l.productId} onChange={(e) => onProduct(l.id, e.target.value)}>
                      <option value="">—</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  {/* Variant */}
                  <td className="px-2 py-1.5">
                    <select className="input min-w-[90px] px-2 py-1" disabled={readOnly} value={l.variantId} onChange={(e) => onVariant(l.id, e.target.value)}>
                      <option value="">—</option>
                      {prodVariants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </td>
                  {/* PCS with calculator button */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input type="number" className="input w-14 px-2 py-1 text-right" disabled={readOnly} value={l.rollQty ?? ''} placeholder="0"
                        onChange={(e) => patch(l.id, { rollQty: num(e.target.value) })} />
                      {!readOnly && (
                        <button className="flex h-6 w-6 items-center justify-center rounded bg-ink-100 text-xs font-bold text-ink-500 hover:bg-teal-100 hover:text-teal-700"
                          title="Qty Calculator" onClick={() => setCalcFor(l.id)}>+</button>
                      )}
                    </div>
                  </td>
                  {/* Total Qty */}
                  <td className="px-2 py-1.5">
                    <input type="number" className="input w-16 px-2 py-1 text-right font-semibold" disabled={readOnly} value={l.quantity || ''} placeholder="0"
                      onChange={(e) => patch(l.id, { quantity: num(e.target.value) ?? 0 })} />
                  </td>
                  {/* UOM */}
                  <td className="px-2 py-1.5">
                    <input className="input w-14 px-2 py-1" disabled={readOnly} value={l.stockUom} onChange={(e) => patch(l.id, { stockUom: e.target.value })} />
                  </td>
                  {/* FOB */}
                  <td className="px-2 py-1.5">
                    <input type="number" className="input w-16 px-2 py-1 text-right" disabled={readOnly} value={l.fobValue ?? ''} placeholder="FOB"
                      onChange={(e) => patch(l.id, { fobValue: num(e.target.value) })} />
                    {l.costChanged && <div className="text-[10px] font-semibold text-amber-600">⚠ cost changed</div>}
                  </td>
                  {/* FOB Unit (numeric — how many units the FOB covers) */}
                  <td className="px-2 py-1.5">
                    <input type="number" className="input w-12 px-2 py-1 text-right" disabled={readOnly} value={l.fobUomUnit ?? ''} placeholder="1"
                      title="How many UOM this FOB covers (e.g. 10 = 30 AED per 10 Yards)"
                      onChange={(e) => patch(l.id, { fobUomUnit: num(e.target.value) ?? 1 })} />
                  </td>
                  {/* FOB UOM (dropdown) */}
                  <td className="px-2 py-1.5">
                    <select className="input w-18 px-2 py-1" disabled={readOnly} value={l.fobUnit ?? ''} onChange={(e) => patch(l.id, { fobUnit: e.target.value })}>
                      <option value="">—</option>
                      {FOB_UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  {/* Cost (computed, read-only) */}
                  <td className="px-2 py-1.5 text-right font-semibold text-ink-800">
                    {l.cost != null ? l.cost.toFixed(2) : '—'}
                  </td>
                  {/* Total Cost (computed, read-only) */}
                  <td className="px-2 py-1.5 text-right font-semibold text-teal-700">
                    {l.totalCost != null ? l.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                  </td>
                  {/* Actions */}
                  <td className="px-2 py-1.5 text-right">
                    {!readOnly && <button className="text-ink-400 hover:text-red-500" onClick={() => removeLine(l.id)}>✕</button>}
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-6 text-center text-sm text-ink-400">
                No lines yet. Scan a barcode above, or click "+ Add row".
              </td></tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-ink-200 bg-ink-50 font-semibold">
                <td colSpan={4} className="px-2 py-2 text-xs text-ink-400">Totals</td>
                <td className="px-2 py-2 text-right text-ink-800">{lines.reduce((s, l) => s + l.quantity, 0)}</td>
                <td colSpan={5} />
                <td className="px-2 py-2 text-right text-teal-700">
                  {lines.reduce((s, l) => s + (l.totalCost ?? 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Blocking errors (must fix before posting) */}
      {!readOnly && blockingErrors.length > 0 && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-red-700">Fix before posting</div>
          <ul className="mt-1 space-y-0.5">
            {blockingErrors.map((e, i) => <li key={i} className="text-xs text-red-800">• {e}</li>)}
          </ul>
        </div>
      )}

      {/* Actions */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={addLine}>+ Add row</button>
          <label className="btn-ghost cursor-pointer">
            CSV Import
            <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          </label>
          <button className="btn-ghost" onClick={sampleCsv}>Sample CSV</button>
          <div className="ml-auto flex gap-2">
            <button className="btn-ghost" onClick={() => exportReceivingCsv(receivingNo, lines, products, variants)}>Export CSV</button>
            <button className="btn-ghost" onClick={() => window.print()}>Print / PDF</button>
            <button className="btn-ghost" onClick={doSaveDraft}>Save draft</button>
            {can(user?.role, 'receive_stock') && (
              <button className="btn-primary" onClick={doPost}>Post receiving</button>
            )}
          </div>
        </div>
      )}
      {receiving?.status === 'draft' && (
        <button className="btn-danger mt-3" onClick={() => setConfirmDeleteDraft(true)}>Delete draft</button>
      )}

      {msg && <div className="mt-3"><Badge tone={msg.tone}>{msg.text}</Badge></div>}
      {readOnly && <p className="mt-3 text-xs text-ink-400">Posted receivings are permanent. History is never deleted.</p>}
    </div>
  );
}

// ---- helpers ----
function num(v: string | undefined): number | undefined {
  if (v == null || v === '') return undefined;
  const n = parseFloat(v);
  return Number.isNaN(n) ? undefined : n;
}
function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function exportReceivingCsv(no: string, lines: ReceivingLine[], products: { id: string; name: string }[], variants: { id: string; label: string }[]) {
  const head = 'barcode,product,variant,uom,pcs,totalQty,fob,fobUnit,fobUom,cost,totalCost,remarks';
  const rows = lines.map((l) => [
    l.barcode ?? '', products.find((p) => p.id === l.productId)?.name ?? '',
    variants.find((v) => v.id === l.variantId)?.label ?? '', l.stockUom,
    l.rollQty ?? '', l.quantity, l.fobValue ?? '', l.fobUomUnit ?? 1, l.fobUnit ?? '',
    l.cost ?? '', l.totalCost ?? '', l.remarks ?? '',
  ].join(','));
  downloadText(`${no}.csv`, [head, ...rows].join('\n'));
}
