/**
 * Warehouse Mode V3 — fixed permissions, cost guards, pending damage reports, count→StockCount
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../context/StoreContext';

import { can } from '../lib/permissions';
import { buildLabelHtml, openPrintWindow, activeProfile } from '../lib/printLabel';
import { BUILT_IN_PROFILES } from '../lib/demoData';
import type { Variant } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────
type ModalType = 'receive' | 'send' | 'count' | 'damaged' | 'print' | 'more' | null;
type ScanEntry = { variantId: string; ts: number };
const DAMAGE_REASONS = ['Torn', 'Stained', 'Wet', 'Dirty', 'Defective', 'Other'] as const;

// ─── Stock tone ───────────────────────────────────────────────────────────────
function stockTone(qty: number, low: number): 'green' | 'amber' | 'red' {
  if (qty <= 0) return 'red';
  if (qty <= low) return 'amber';
  return 'green';
}
const TONE_BG   = { green: 'bg-teal-50 border-teal-200', amber: 'bg-amber-50 border-amber-200', red: 'bg-red-50 border-red-200' };
const TONE_TEXT = { green: 'text-teal-700', amber: 'text-amber-700', red: 'text-red-600' };
const TONE_DOT  = { green: 'bg-teal-400', amber: 'bg-amber-400', red: 'bg-red-500' };

// ─── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button className="text-gray-400 hover:text-gray-700 text-xl" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Confirm({ message, onOk, onCancel }: { message: string; onOk: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="mb-5 text-sm text-gray-800 whitespace-pre-line">{message}</p>
        <div className="flex gap-3">
          <button className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600" onClick={onCancel}>Cancel</button>
          <button className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white" onClick={onOk}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ label, sub, colour, onClick }: { label: string; sub: string; colour: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center rounded-2xl py-4 px-2 font-bold shadow-sm transition-transform active:scale-95 ${colour}`}>
      <span className="text-xl">{label}</span>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">{sub}</span>
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function WarehouseMode() {
  const {
    user, variants, products, locations, visibleShopIds, shops, audit, settings,
    balanceOf, scopedBalances, shopName, productName, applyLocalMovement,
    costHistory, saveCount, nextCountNo, createDamageReport, suppliers, labelSettings,
  } = useStore();

  const [shopId, setShopId]         = useState(visibleShopIds[0] ?? '');
  const [code, setCode]             = useState('');
  const [found, setFound]           = useState<Variant | null>(null);
  const [modal, setModal]           = useState<ModalType>(null);
  const [confirm, setConfirm]       = useState<(() => void) | null>(null);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [toast, setToast]           = useState<{ text: string; ok: boolean } | null>(null);
  const [recentScans, setRecentScans] = useState<ScanEntry[]>([]);
  const [activeTab, setActiveTab]   = useState<'scan' | 'recent' | 'activity'>('scan');
  const [soundOn, setSoundOn]       = useState(false);
  const [showResults, setShowResults] = useState(false); // autocomplete dropdown visibility

  // Modal field state — always reset to safe defaults (Fix 7: never default to current qty)
  const [mPcs, setMPcs]             = useState('');
  const [mQty, setMQty]             = useState('');
  const [mUom, setMUom]             = useState('');
  const [mNotes, setMNotes]         = useState('');
  const [mDest, setMDest]           = useState('');
  const [mReason, setMReason]       = useState('');
  const [mDmgReason, setMDmgReason] = useState<string>(DAMAGE_REASONS[0]);
  const [mPrint, setMPrint]         = useState('1');

  const scanRef = useRef<HTMLInputElement>(null);
  const myShops = shops.filter((s) => visibleShopIds.includes(s.id));

  // Permission helpers
  const isManager = user?.role === 'admin' || user?.role === 'purchase_manager' || user?.role === 'shop_manager';
  // Fix 1: warehouse_staff can only send FROM/TO their assigned shop(s).
  // Admin/Manager can pick any visible destination.
  const canSendToShop = useCallback((destId: string): boolean => {
    if (isManager) return true;
    // warehouse_staff: destination must be within their visibleShopIds
    return visibleShopIds.includes(destId);
  }, [isManager, visibleShopIds]);

  const otherShops = myShops.filter((s) => s.id !== shopId);

  const bal      = found ? balanceOf(found.id, shopId) : undefined;
  const loc      = bal?.locationId ? locations.find((l) => l.id === bal.locationId) : undefined;
  const p        = found ? products.find((x) => x.id === found.productId) : undefined;
  const isFabric = p?.type === 'fabric';
  const LOW      = settings.lowStockThreshold ?? 50;
  const tone     = bal ? stockTone(bal.quantity, LOW) : 'red';
  const itemAudit = found
    ? audit.filter((a) => a.variantId === found.id && a.ownerShopId === shopId).sort((a, b) => b.timestamp - a.timestamp)
    : [];

  // Today stats
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const todayRecv = audit.filter((a) => a.action === 'RECEIVE' && a.timestamp >= todayStart && visibleShopIds.includes(a.ownerShopId)).reduce((s, a) => s + a.qtyChanged, 0);
  const todaySent = audit.filter((a) => a.action === 'TRANSFER_OUT' && a.timestamp >= todayStart && visibleShopIds.includes(a.ownerShopId)).reduce((s, a) => s + Math.abs(a.qtyChanged), 0);

  const refocus = useCallback(() => { setTimeout(() => scanRef.current?.focus(), 80); }, []);
  useEffect(() => { scanRef.current?.focus(); }, []);

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    if (ok && soundOn) {
      try {
        const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.frequency.value = 880;
        g.gain.setValueAtTime(0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        o.start(); o.stop(ctx.currentTime + 0.2);
      } catch { /* AudioContext unavailable — ignore */ }
    }
    setTimeout(() => setToast(null), 2800);
  };

  // Fix 7: open modal with zeroed inputs, show system qty as reference only
  const openModal = (m: ModalType) => {
    setMPcs('');
    setMQty('');  // always start at 0 — never default to current stock
    setMUom(bal?.unit ?? found?.uom ?? 'Yard');
    setMNotes(''); setMDest(otherShops.find((s) => canSendToShop(s.id))?.id ?? otherShops[0]?.id ?? '');
    setMReason(''); setMDmgReason(DAMAGE_REASONS[0]);
    const prof = activeProfile(labelSettings, BUILT_IN_PROFILES[0]);
    setMPrint(String(prof.copiesDefault));
    setModal(m);
  };
  const closeModal = () => { setModal(null); refocus(); };

  // ─── Autocomplete search ─────────────────────────────────────────────────
  // Normalize: lowercase, trim, strip hyphens/spaces so "AURC01" matches "AUR-C01".
  const norm = (s: string | undefined | null) => (s ?? '').toLowerCase().replace(/[\s-]+/g, '').trim();

  const searchResults = useMemo(() => {
    const raw = code.trim();
    if (raw.length < 2) return [];
    const nq = norm(raw);

    type Scored = { v: Variant; rank: number };
    const scored: Scored[] = [];

    for (const v of variants) {
      const prod = products.find((x) => x.id === v.productId);
      const sup = prod?.supplierId ? suppliers.find((s) => s.id === prod.supplierId) : undefined;
      const barcodeN = norm(v.barcode);
      const prodN    = norm(prod?.name);
      const labelN   = norm(v.label);
      const colorN   = norm(v.colorName);
      const ourN     = norm(v.ourColorNumber);
      const supColN  = norm(v.supplierColorNumber);
      const catN     = norm(prod?.category);
      const supN     = norm(sup?.name);

      // Determine best (lowest) rank across all fields.
      let rank = 99;
      if (barcodeN && barcodeN === nq) rank = Math.min(rank, 0);              // exact barcode
      if (barcodeN.startsWith(nq))     rank = Math.min(rank, 1);              // barcode starts-with
      if (prodN.startsWith(nq))        rank = Math.min(rank, 2);              // product starts-with
      if (labelN.startsWith(nq) || colorN.startsWith(nq) || ourN.startsWith(nq) || supColN.startsWith(nq))
                                       rank = Math.min(rank, 3);              // variant/color starts-with
      if (barcodeN.includes(nq) || prodN.includes(nq) || labelN.includes(nq) ||
          colorN.includes(nq) || ourN.includes(nq) || supColN.includes(nq) ||
          catN.includes(nq) || supN.includes(nq))
                                       rank = Math.min(rank, 4);              // contains anywhere

      if (rank < 99) scored.push({ v, rank });
    }

    scored.sort((a, b) => a.rank - b.rank || norm(a.v.barcode).localeCompare(norm(b.v.barcode)));
    return scored.slice(0, 10).map((s) => s.v);
  }, [code, variants, products, suppliers]);

  // Load a selected variant into the item card.
  const selectItem = (v: Variant) => {
    setFound(v); setModal(null); setCode(''); setShowResults(false); setActiveTab('scan');
    setRecentScans((prev) => [{ variantId: v.id, ts: Date.now() }, ...prev.filter((r) => r.variantId !== v.id)].slice(0, 10));
    refocus();
  };

  // Enter key: exact barcode → load; single result → load; multiple → keep open; none → not found.
  const scan = () => {
    const q = code.trim();
    if (!q) return;
    const nq = norm(q);
    // 1. exact barcode match (fast path for scanner input)
    const exact = variants.find((x) => norm(x.barcode) === nq);
    if (exact) { selectItem(exact); return; }
    // 2. single result
    if (searchResults.length === 1) { selectItem(searchResults[0]); return; }
    // 3. multiple results → keep dropdown open, highlight first
    if (searchResults.length > 1) { setShowResults(true); return; }
    // 4. none
    showToast(`Item not found: "${q}"`, false);
    setCode('');
    refocus();
  };

  // ─── Fix 3: Quick Receive — block if no cost ─────────────────────────────
  const doReceive = async () => {
    if (!found) return;
    const qty = parseFloat(mQty);
    if (isNaN(qty) || qty <= 0) { showToast('Enter a quantity', false); return; }
    const pcs = parseInt(mPcs) || 0;
    const unit = mUom || bal?.unit || 'Yard';

    // Check latest cost — block if none exists
    const latestCost = found.cost ?? costHistory.find((c) => c.variantId === found.id && c.ownerShopId === shopId)?.cost;
    if (!latestCost || latestCost <= 0) {
      showToast('No cost found. Use Receive Stock page first.', false);
      return;
    }

    const res = await applyLocalMovement({
      variant: found, ownerShopId: shopId, qtyChanged: qty, unit, action: 'RECEIVE',
      rollDelta: isFabric ? pcs : undefined,
      remarks: `WH quick receive using existing product cost${mNotes ? ': ' + mNotes : ''}`,
    });
    if (res.ok) { showToast(`Received +${qty} ${unit}${pcs ? ', ' + pcs + ' PCS' : ''} ✓`); closeModal(); }
    else showToast(res.error ?? 'Failed', false);
  };

  // ─── Fix 1: Send — enforce shop permission ───────────────────────────────
  const doSend = () => {
    if (!found) return;
    const qty = parseFloat(mQty);
    if (isNaN(qty) || qty <= 0) { showToast('Enter a quantity', false); return; }
    const pcs = parseInt(mPcs) || 0;
    const unit = mUom || bal?.unit || 'Yard';
    const destId = isManager ? mDest : shopId; // warehouse staff: dest = same shop
    if (!canSendToShop(destId)) {
      showToast('You do not have permission to send stock to this shop.', false); return;
    }
    const destName = shops.find((s) => s.id === destId)?.name ?? destId;
    setConfirmMsg(`Send to Shop\n${productName(found.productId)} · ${found.label}\n${qty} ${unit}${pcs ? ', ' + pcs + ' PCS' : ''} → ${destName}`);
    setConfirm(() => async () => {
      const res = await applyLocalMovement({
        variant: found, ownerShopId: shopId, qtyChanged: -qty, unit, action: 'TRANSFER_OUT',
        rollDelta: isFabric ? -pcs : undefined,
        remarks: `WH send to ${destName}${mNotes ? ': ' + mNotes : ''}`,
      });
      setConfirm(null);
      if (res.ok) { showToast(`Sent −${qty} ${unit} to ${destName} ✓`); closeModal(); }
      else if (res.needsOverride) showToast('Not enough stock', false);
      else showToast(res.error ?? 'Failed', false);
    });
  };

  // ─── Fix 4: Count → creates StockCount record (no direct stock change) ───
  const doCount = () => {
    if (!found) return;
    const physQty = parseFloat(mQty);
    if (isNaN(physQty) || physQty < 0) { showToast('Enter physical qty (≥ 0)', false); return; }
    const physPcs = parseInt(mPcs) || 0;
    const unit = mUom || bal?.unit || 'Yard';
    const countNo = nextCountNo();
    const expectedQty = bal?.quantity ?? 0;
    const expectedPcs = bal?.rollCount ?? 0;
    const variance = Math.round((physQty - expectedQty) * 100) / 100;
    const pcsVar = physPcs - expectedPcs;
    // Save as open (warehouse staff) or submitted (managers can self-approve later)
    saveCount({
      countNo, shopId, countType: 'spot', reference: `WH scan: ${found.barcode ?? found.id}`,
      notes: mReason ? `Reason: ${mReason}` : undefined,
      countedBy: user?.uid ?? '',
      date: new Date().toISOString().slice(0, 10),
      lines: [{
        id: `wcl_${Date.now()}`,
        barcode: found.barcode ?? '',
        productId: found.productId, variantId: found.id, unit,
        expectedRolls: expectedPcs, actualRolls: physPcs,
        expectedQuantity: expectedQty, actualQuantity: physQty, variance,
        reason: mReason || undefined,
      }],
      varianceValueMvr: Math.round(variance * (found.cost ?? 0) * 100) / 100,
    });
    showToast(`Count saved as ${countNo}. ${variance !== 0 || pcsVar !== 0 ? 'Variance pending manager approval.' : 'No variance ✓'}`);
    closeModal();
  };

  // ─── Fix 5: Damage → creates DamageReport (pending, no stock change) ────
  const doDamage = () => {
    if (!found || !user) return;
    const qty = parseFloat(mQty);
    if (isNaN(qty) || qty <= 0) { showToast('Enter damaged qty', false); return; }
    const pcs = parseInt(mPcs) || 0;
    const unit = mUom || bal?.unit || 'Yard';
    setConfirmMsg(`Report Damage\n${productName(found.productId)} · ${found.label}\n${qty} ${unit}${pcs ? ', ' + pcs + ' PCS' : ''}\nReason: ${mDmgReason}${mNotes ? '\n' + mNotes : ''}`);
    setConfirm(() => () => {
      createDamageReport({
        shopId, productId: found.productId, variantId: found.id,
        barcode: found.barcode, reportedPcs: pcs, reportedQty: qty, uom: unit,
        reason: mDmgReason, notes: mNotes || undefined,
        reportedBy: user.uid, reportedByName: user.name,
      });
      setConfirm(null);
      showToast('Damage report submitted — awaiting manager approval. Stock not yet reduced.');
      closeModal();
    });
  };

  // ─── Fix 9: Print with popup-blocked fallback ────────────────────────────
  const doPrint = () => {
    if (!found) return;
    const copies = parseInt(mPrint) || 1;
    const b = balanceOf(found.id, shopId);
    const showPriceAllowed = can(user?.role, 'view_costs');
    const profile = activeProfile(labelSettings, BUILT_IN_PROFILES[0]);
    const html = buildLabelHtml(
      {
        productName: productName(found.productId),
        variantLabel: found.colorName ?? found.label,
        ourColorNumber: found.ourColorNumber,
        barcode: found.barcode,
        shopName: shopName(shopId),
        qty: b?.quantity,
        uom: b?.unit ?? found.uom,
        price: found.cost,
        currency: 'MVR',
      },
      profile,
      copies,
      showPriceAllowed,
    );
    const ok = openPrintWindow(html);
    if (!ok) {
      showToast('Popup blocked. Please allow popups or use browser print.', false);
      return;
    }
    showToast(`${copies} label${copies > 1 ? 's' : ''} sent to printer ✓`);
    closeModal();
  };

  const loadScan = (variantId: string) => {
    const v = variants.find((x) => x.id === variantId);
    if (v) { setFound(v); setModal(null); setActiveTab('scan'); }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-gray-50">

      {/* Dialogs */}
      {confirm && <Confirm message={confirmMsg} onOk={confirm} onCancel={() => setConfirm(null)} />}
      {toast && (
        <div className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg ${toast.ok ? 'bg-teal-600' : 'bg-red-500'}`}>
          {toast.text}
        </div>
      )}

      {/* ── RECEIVE modal ── */}
      {modal === 'receive' && found && (
        <Modal title="Receive Stock" onClose={closeModal}>
          <div className="mb-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
            Current: <b className="text-gray-900">{bal?.rollCount ?? 0} {isFabric ? 'Rolls' : 'PCS'} · {bal?.quantity ?? 0} {bal?.unit}</b>
          </div>
          <div className="space-y-3">
            <div><label className="text-xs font-semibold uppercase text-gray-500">{isFabric ? 'Rolls' : 'PCS'}</label>
              <input type="number" min="0" autoFocus className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-lg font-bold" placeholder="0" value={mPcs} onChange={(e) => setMPcs(e.target.value)} /></div>
            <div><label className="text-xs font-semibold uppercase text-gray-500">Total Qty</label>
              <input type="number" min="0" className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-2xl font-bold" placeholder="0" value={mQty} onChange={(e) => setMQty(e.target.value)} /></div>
            <div><label className="text-xs font-semibold uppercase text-gray-500">UOM</label>
              <input className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3" value={mUom} onChange={(e) => setMUom(e.target.value)} /></div>
            <div><label className="text-xs font-semibold uppercase text-gray-500">Notes</label>
              <input className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm" placeholder="optional" value={mNotes} onChange={(e) => setMNotes(e.target.value)} /></div>
          </div>
          <button className="mt-5 w-full rounded-xl bg-teal-500 py-4 text-base font-bold text-white active:bg-teal-600" onClick={doReceive}>RECEIVE</button>
        </Modal>
      )}

      {/* ── SEND modal ── */}
      {modal === 'send' && found && (
        <Modal title="Send to Shop" onClose={closeModal}>
          <div className="mb-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
            Available: <b className="text-gray-900">{bal?.rollCount ?? 0} {isFabric ? 'Rolls' : 'PCS'} · {bal?.quantity ?? 0} {bal?.unit}</b>
          </div>
          {/* Fix 1: only managers see destination dropdown */}
          {isManager && otherShops.length > 0 ? (
            <div className="mb-3">
              <label className="text-xs font-semibold uppercase text-gray-500">Destination Shop</label>
              <select className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3" value={mDest} onChange={(e) => setMDest(e.target.value)}>
                {otherShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="mb-3 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
              Sending from: <b>{shopName(shopId)}</b>
            </div>
          )}
          <div className="space-y-3">
            <div><label className="text-xs font-semibold uppercase text-gray-500">{isFabric ? 'Rolls' : 'PCS'}</label>
              <input type="number" min="0" autoFocus className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-lg font-bold" placeholder="0" value={mPcs} onChange={(e) => setMPcs(e.target.value)} /></div>
            <div><label className="text-xs font-semibold uppercase text-gray-500">Total Qty</label>
              <input type="number" min="0" className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-2xl font-bold" placeholder="0" value={mQty} onChange={(e) => setMQty(e.target.value)} /></div>
            <div><label className="text-xs font-semibold uppercase text-gray-500">Notes</label>
              <input className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm" placeholder="optional" value={mNotes} onChange={(e) => setMNotes(e.target.value)} /></div>
          </div>
          <button className="mt-5 w-full rounded-xl bg-blue-600 py-4 text-base font-bold text-white active:bg-blue-700" onClick={doSend}>SEND TO SHOP</button>
        </Modal>
      )}

      {/* ── COUNT modal — creates stock count record ── */}
      {modal === 'count' && found && (
        <Modal title="Quick Count" onClose={closeModal}>
          <div className="mb-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
            System: <b className="text-gray-900">{bal?.rollCount ?? 0} {isFabric ? 'Rolls' : 'PCS'} · {bal?.quantity ?? 0} {bal?.unit}</b>
            <div className="mt-1 text-xs text-gray-400">Count creates a Stock Count record. Manager approves any variance.</div>
          </div>
          <div className="space-y-3">
            <div><label className="text-xs font-semibold uppercase text-gray-500">Physical {isFabric ? 'Rolls' : 'PCS'}</label>
              <input type="number" min="0" autoFocus className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-lg font-bold" placeholder="0" value={mPcs} onChange={(e) => setMPcs(e.target.value)} /></div>
            <div><label className="text-xs font-semibold uppercase text-gray-500">Physical Qty</label>
              <input type="number" min="0" className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-2xl font-bold" placeholder="0" value={mQty} onChange={(e) => setMQty(e.target.value)} /></div>
            <div><label className="text-xs font-semibold uppercase text-gray-500">Reason (if variance)</label>
              <input className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm" placeholder="e.g. Damage, recount" value={mReason} onChange={(e) => setMReason(e.target.value)} /></div>
          </div>
          <button className="mt-5 w-full rounded-xl bg-orange-500 py-4 text-base font-bold text-white active:bg-orange-600" onClick={doCount}>SAVE COUNT FOR REVIEW</button>
        </Modal>
      )}

      {/* ── DAMAGE modal — creates pending report (no stock change) ── */}
      {modal === 'damaged' && found && (
        <Modal title="Report Damage" onClose={closeModal}>
          <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
            Damage report will be sent to manager for approval. Stock is NOT reduced until approved.
          </div>
          <div className="space-y-3">
            <div><label className="text-xs font-semibold uppercase text-gray-500">{isFabric ? 'Rolls' : 'PCS'} damaged</label>
              <input type="number" min="0" autoFocus className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-lg font-bold" placeholder="0" value={mPcs} onChange={(e) => setMPcs(e.target.value)} /></div>
            <div><label className="text-xs font-semibold uppercase text-gray-500">Total Qty damaged</label>
              <input type="number" min="0" className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-2xl font-bold" placeholder="0" value={mQty} onChange={(e) => setMQty(e.target.value)} /></div>
            <div>
              <label className="text-xs font-semibold uppercase text-gray-500">Damage Type</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAMAGE_REASONS.map((r) => (
                  <button key={r} onClick={() => setMDmgReason(r)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold ${mDmgReason === r ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div><label className="text-xs font-semibold uppercase text-gray-500">Notes</label>
              <input className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm" placeholder="optional details" value={mNotes} onChange={(e) => setMNotes(e.target.value)} /></div>
          </div>
          <button className="mt-5 w-full rounded-xl bg-red-500 py-4 text-base font-bold text-white active:bg-red-600" onClick={doDamage}>REPORT DAMAGE</button>
        </Modal>
      )}

      {/* ── PRINT modal ── */}
      {modal === 'print' && found && (
        <Modal title="Print Label" onClose={closeModal}>
          <div className="mb-4 rounded-xl bg-gray-50 p-4 text-center">
            <div className="text-base font-bold text-gray-900">{productName(found.productId)}</div>
            <div className="text-sm text-gray-500">{found.label}</div>
            <div className="mt-2 font-mono text-2xl font-bold tracking-widest text-gray-800">{found.barcode}</div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-gray-500">Copies</label>
            <div className="mt-2 flex gap-2">
              {['1', '2', '3', '5', '10'].map((n) => (
                <button key={n} onClick={() => setMPrint(n)}
                  className={`flex-1 rounded-xl py-3 text-sm font-bold ${mPrint === n ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                  {n}{n === String(activeProfile(labelSettings, BUILT_IN_PROFILES[0]).copiesDefault) ? ' ★' : ''}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-gray-400">★ default from label settings · {activeProfile(labelSettings, BUILT_IN_PROFILES[0]).name}</p>
          </div>
          <button className="mt-5 w-full rounded-xl bg-purple-600 py-4 text-base font-bold text-white active:bg-purple-700" onClick={doPrint}>
            PRINT {mPrint} LABEL{parseInt(mPrint) > 1 ? 'S' : ''}
          </button>
        </Modal>
      )}

      {/* Fix 8: MORE menu — unfinished = "coming soon" */}
      {modal === 'more' && found && (
        <Modal title="More Actions" onClose={closeModal}>
          <div className="space-y-2">
            {/* eslint-disable-next-line react-hooks/refs -- closeModal reads scanRef only inside a
                setTimeout callback (via refocus), not synchronously during render. */}
            {[
              { label: 'Return to Supplier', icon: '↩', action: () => showToast('Coming soon', false) },
              { label: 'Move Location',      icon: '📦', action: () => showToast('Coming soon', false) },
              { label: 'View Full Details',  icon: '🔍', action: () => window.open(`/products`, '_self') },
              { label: 'History',            icon: '📋', action: () => { closeModal(); setActiveTab('activity'); } },
            ].map(({ label, icon, action }) => (
              <button key={label} onClick={() => { action(); if (label !== 'History') closeModal(); }}
                className="flex w-full items-center gap-3 rounded-xl bg-gray-50 px-4 py-4 text-left text-sm font-semibold text-gray-800 hover:bg-gray-100">
                <span className="text-xl">{icon}</span>{label}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* ── Top scan bar (responsive) ── */}
      <div className="relative border-b border-gray-200 bg-white px-3 py-2 shadow-sm sm:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {myShops.length > 1 && (
            <select className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 sm:w-auto"
              value={shopId} onChange={(e) => setShopId(e.target.value)}>
              {myShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="flex flex-1 gap-2">
            <input ref={scanRef}
              className="min-w-0 flex-1 rounded-xl border-2 border-teal-400 bg-white px-4 py-2.5 text-lg font-bold placeholder-gray-300 focus:border-teal-500 focus:outline-none sm:text-xl"
              placeholder="Scan or search…"
              value={code}
              onChange={(e) => { setCode(e.target.value); setShowResults(true); }}
              onKeyDown={(e) => { if (e.key === 'Enter') scan(); if (e.key === 'Escape') setShowResults(false); }}
              onFocus={() => setShowResults(true)}
              autoFocus />
            <button className="shrink-0 rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-bold text-white active:bg-teal-600" onClick={scan}>FIND</button>
            <button className={`shrink-0 rounded-xl px-3 py-2.5 text-lg ${soundOn ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-400'}`}
              onClick={() => setSoundOn((s) => !s)} title="Sound">🔔</button>
          </div>
        </div>

        {/* ── Autocomplete results dropdown ── */}
        {showResults && code.trim().length >= 2 && (
          <>
            {/* click-away backdrop */}
            <div className="fixed inset-0 z-30" onClick={() => setShowResults(false)} />
            <div className="absolute left-3 right-3 top-full z-40 mt-1 max-h-[60vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl sm:left-auto sm:right-4 sm:w-[480px]">
              {searchResults.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">No matches for "{code.trim()}"</div>
              ) : (
                searchResults.map((v, i) => {
                  const prod = products.find((x) => x.id === v.productId);
                  const b = scopedBalances.find((x) => x.variantId === v.id && x.ownerShopId === shopId);
                  const t = b ? stockTone(b.quantity, LOW) : 'red';
                  return (
                    // eslint-disable-next-line react-hooks/refs
                    <button key={v.id} onClick={() => selectItem(v)}
                      className={`flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left last:border-0 hover:bg-teal-50 ${i === 0 ? 'bg-gray-50' : ''}`}>
                      <span className={`h-3 w-3 shrink-0 rounded-full ${TONE_DOT[t]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-bold text-gray-500">{v.barcode ?? '—'}</div>
                        <div className="truncate text-sm font-bold text-gray-900">{prod?.name ?? productName(v.productId)}</div>
                        <div className="truncate text-xs text-gray-500">
                          {v.colorName ?? v.label}
                          {v.ourColorNumber ? ` · #${v.ourColorNumber}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-sm font-bold ${TONE_TEXT[t]}`}>{b?.quantity ?? 0} {b?.unit ?? v.uom}</div>
                        <div className="text-[11px] text-gray-400">{prod?.type === 'fabric' ? 'Rolls' : 'PCS'}: {b?.rollCount ?? 0}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="hidden w-44 flex-shrink-0 flex-col border-r border-gray-200 bg-white py-2 sm:flex">
          {([
            { id: 'scan',     label: 'Scan & Act',   icon: '⬛' },
            { id: 'recent',   label: 'Recent Scans', icon: '🕐' },
            { id: 'activity', label: 'Activity',     icon: '📋' },
          ] as const).map(({ id, label, icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-left text-sm font-semibold transition-colors ${activeTab === id ? 'bg-teal-50 text-teal-700 border-r-2 border-teal-500' : 'text-gray-600 hover:bg-gray-50'}`}>
              <span>{icon}</span>{label}
            </button>
          ))}
          <div className="my-2 border-t border-gray-100" />
          <a href="/receiving"   className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50">📥 Receive Stock</a>
          <a href="/transfers"   className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50">📤 Move Stock</a>
          <a href="/stock-count" className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50">🔢 Stock Count</a>
          <a href="/damaged"     className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50">⚠️ Damaged</a>
        </div>

        {/* Main area */}
        <div className="flex-1 overflow-y-auto p-4">

          {activeTab === 'scan' && (
            <>
              {!found && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-4 text-6xl">⬛</div>
                  <div className="text-xl font-bold text-gray-500">Scan a barcode to begin</div>
                  <div className="mt-2 text-sm text-gray-400">Or type a product name and press FIND</div>
                </div>
              )}

              {found && (
                <div className="space-y-4">
                  {/* Item card */}
                  <div className={`rounded-2xl border-2 p-5 ${TONE_BG[tone]}`}>
                    <div className="flex items-start justify-between">
                      <div className={`mr-4 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-3xl ${tone === 'green' ? 'bg-teal-100' : tone === 'amber' ? 'bg-amber-100' : 'bg-red-100'}`}>
                        {isFabric ? '🧵' : '📦'}
                      </div>
                      <div className="flex-1">
                        <div className="text-2xl font-extrabold text-gray-900 leading-tight">{productName(found.productId)}</div>
                        <div className="mt-0.5 text-base font-semibold text-gray-600">{found.colorName ?? found.label}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                          {found.ourColorNumber && <span>Our #{found.ourColorNumber}</span>}
                          {found.supplierColorNumber && <span>Supplier #{found.supplierColorNumber}</span>}
                          <span className="font-mono font-semibold text-gray-600">{found.barcode}</span>
                        </div>
                      </div>
                      <button className="ml-2 rounded-full p-2 text-gray-400 hover:bg-white/60" onClick={() => { setFound(null); setCode(''); refocus(); }}>✕</button>
                    </div>

                    {/* Stock cells — Fix 2: show PCS/Rolls label based on type */}
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-white/70 p-3 text-center">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{isFabric ? 'Rolls' : 'PCS'}</div>
                        <div className={`mt-1 text-2xl font-extrabold ${TONE_TEXT[tone]}`}>{bal?.rollCount ?? 0}</div>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3 text-center">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Qty</div>
                        <div className={`mt-1 text-2xl font-extrabold ${TONE_TEXT[tone]}`}>{bal?.quantity ?? 0}</div>
                        <div className="text-xs text-gray-400">{bal?.unit ?? found.uom}</div>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3 text-center">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Location</div>
                        <div className="mt-1 text-base font-bold text-gray-800">{loc?.label ?? '—'}</div>
                      </div>
                    </div>

                    <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 ${tone === 'green' ? 'bg-teal-100' : tone === 'amber' ? 'bg-amber-100' : 'bg-red-100'}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[tone]}`} />
                      <span className={`text-xs font-bold uppercase tracking-wide ${TONE_TEXT[tone]}`}>
                        {tone === 'green' ? 'Stock OK' : tone === 'amber' ? 'Low Stock' : 'Out / Critical'}
                      </span>
                      {itemAudit[0] && <span className="ml-auto text-xs text-gray-400">Last: {new Date(itemAudit[0].timestamp).toLocaleDateString()}</span>}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-3 gap-3">
                    <ActionBtn label="✚ RECEIVE" sub="Add Stock"  colour="bg-teal-500 text-white hover:bg-teal-600"     onClick={() => openModal('receive')} />
                    <ActionBtn label="→ SEND"    sub="To Shop"    colour="bg-blue-600 text-white hover:bg-blue-700"     onClick={() => openModal('send')} />
                    <ActionBtn label="# COUNT"   sub="Check Qty"  colour="bg-orange-500 text-white hover:bg-orange-600" onClick={() => openModal('count')} />
                    <ActionBtn label="⚠ DAMAGE"  sub="Report"     colour="bg-red-500 text-white hover:bg-red-600"      onClick={() => openModal('damaged')} />
                    <ActionBtn label="🖨 PRINT"  sub="Reprint"    colour="bg-purple-600 text-white hover:bg-purple-700" onClick={() => openModal('print')} />
                    <ActionBtn label="··· MORE"  sub="Other"      colour="bg-gray-200 text-gray-700 hover:bg-gray-300"  onClick={() => openModal('more')} />
                  </div>

                  {/* Recent movements */}
                  {itemAudit.length > 0 && (
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Recent Activity</div>
                      <div className="space-y-2">
                        {itemAudit.slice(0, 5).map((a) => (
                          <div key={a.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{a.action.replace(/_/g, ' ')}</span>
                            <span className={`font-bold ${a.qtyChanged > 0 ? 'text-teal-600' : a.qtyChanged < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {a.qtyChanged > 0 ? '+' : ''}{a.qtyChanged} · {new Date(a.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'recent' && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-800">Recent Scans</h2>
                {recentScans.length > 0 && (
                  <button className="text-xs font-semibold text-red-500" onClick={() => setRecentScans([])}>Clear all</button>
                )}
              </div>
              {recentScans.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">No scans yet this session</div>
              ) : recentScans.map(({ variantId, ts }) => {
                const v = variants.find((x) => x.id === variantId);
                const b = scopedBalances.find((x) => x.variantId === variantId && x.ownerShopId === shopId);
                if (!v) return null;
                const t = b ? stockTone(b.quantity, LOW) : 'red';
                return (
                  <button key={variantId} onClick={() => { loadScan(variantId); setActiveTab('scan'); }}
                    className="mb-2 flex w-full items-center gap-3 rounded-2xl bg-white p-4 shadow-sm hover:shadow-md text-left">
                    <span className={`h-3 w-3 flex-shrink-0 rounded-full ${TONE_DOT[t]}`} />
                    <div className="flex-1">
                      <div className="text-sm font-bold text-gray-900">{productName(v.productId)} · {v.label}</div>
                      <div className="text-xs text-gray-400 font-mono">{v.barcode} · {new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className={`text-sm font-bold ${TONE_TEXT[t]}`}>{b?.quantity ?? 0} {b?.unit ?? v.uom}</div>
                  </button>
                );
              })}
            </div>
          )}

          {activeTab === 'activity' && (
            <div>
              <h2 className="mb-3 text-base font-bold text-gray-800">Recent Activity</h2>
              {audit.filter((a) => visibleShopIds.includes(a.ownerShopId)).slice(0, 20).map((a) => {
                const v = variants.find((x) => x.id === a.variantId);
                return (
                  <div key={a.id} className="mb-2 rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-800">{v ? productName(v.productId) + ' · ' + v.label : a.productId}</span>
                      <span className={`text-sm font-bold ${a.qtyChanged > 0 ? 'text-teal-600' : a.qtyChanged < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {a.qtyChanged > 0 ? '+' : ''}{a.qtyChanged}
                      </span>
                    </div>
                    <div className="mt-1 flex gap-2 text-xs text-gray-400">
                      <span>{a.action.replace(/_/g, ' ')}</span><span>·</span>
                      <span>{a.userName}</span><span>·</span>
                      <span>{new Date(a.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 border-t border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-500">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-400" />Online</span>
        <span>Received: <b className="text-teal-700">+{todayRecv}</b></span>
        <span>Sent: <b className="text-red-500">−{todaySent}</b></span>
        <span>Scanned: <b className="text-gray-700">{recentScans.length}</b></span>
        <button className="ml-auto" onClick={() => setSoundOn((s) => !s)}>{soundOn ? '🔔 Sound on' : '🔕 Sound off'}</button>
      </div>
    </div>
  );
}
