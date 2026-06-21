/**
 * Damaged / Issues page
 * Warehouse staff submit pending reports (no stock change).
 * Manager/Admin approve (reduces stock + audit) or reject.
 */
import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, EmptyState } from '../components/ui';
import { can } from '../lib/permissions';
import type { DamageStatus } from '../types';

type Tab = 'pending' | 'approved' | 'rejected';
const STATUS_TONE: Record<DamageStatus, 'neutral' | 'ok' | 'out'> = {
  pending: 'neutral', approved: 'ok', rejected: 'out',
};

function RejectDialog({ onConfirm, onCancel }: { onConfirm: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div className="card w-80 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-bold text-ink-900">Reject Damage Report</h3>
        <label className="label">Rejection reason (required)</label>
        <input autoFocus className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cannot verify — please resubmit with photo" />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" disabled={!note.trim()} onClick={() => onConfirm(note)}>Reject</button>
        </div>
      </div>
    </div>
  );
}

export function Damaged() {
  const { user, damageReports, variants, visibleShopIds, shopName, productName, approveDamageReport, rejectDamageReport } = useStore();
  const [tab, setTab] = useState<Tab>('pending');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'out'; text: string } | null>(null);

  const isManager = user?.role === 'admin' || user?.role === 'purchase_manager' || user?.role === 'shop_manager';
  const canApprove = can(user?.role, 'approve_adjustment');

  const records = useMemo(() => {
    return damageReports
      .filter((r) => {
        // Warehouse staff see only their own reports from visible shops
        if (!isManager) return r.reportedBy === user?.uid && visibleShopIds.includes(r.shopId);
        return visibleShopIds.includes(r.shopId);
      })
      .filter((r) => r.status === tab)
      .sort((a, b) => b.reportedAt - a.reportedAt);
  }, [damageReports, tab, isManager, user, visibleShopIds]);

  const counts = useMemo(() => {
    const all = damageReports.filter((r) => isManager ? visibleShopIds.includes(r.shopId) : r.reportedBy === user?.uid);
    return { pending: all.filter((r) => r.status === 'pending').length, approved: all.filter((r) => r.status === 'approved').length, rejected: all.filter((r) => r.status === 'rejected').length };
  }, [damageReports, isManager, user, visibleShopIds]);

  const doApprove = async (id: string) => {
    const res = await approveDamageReport(id);
    if (res.ok) setMsg({ tone: 'ok', text: 'Write-off approved — stock reduced and audit written ✓' });
    else setMsg({ tone: 'out', text: res.error ?? 'Approval failed' });
  };

  const doReject = (id: string, note: string) => {
    rejectDamageReport(id, note);
    setRejectTarget(null);
    setMsg({ tone: 'ok', text: 'Report rejected' });
  };

  return (
    <div>
      {rejectTarget && (
        <RejectDialog
          onConfirm={(note) => doReject(rejectTarget, note)}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      <PageHeader
        title="Damaged / Issues"
        subtitle={isManager
          ? 'Review and approve or reject damage reports. Approval reduces stock and writes a DAMAGE audit.'
          : 'Your submitted damage reports. Managers approve write-offs.'}
      />

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm font-semibold ${msg.tone === 'ok' ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-ink-100">
        {(['pending', 'approved', 'rejected'] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setMsg(null); }}
            className={`-mb-px px-5 py-2.5 text-sm font-semibold capitalize transition-colors ${tab === t ? 'border-b-2 border-teal-500 text-teal-700' : 'text-ink-400 hover:text-ink-600'}`}>
            {t}
            {counts[t] > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${t === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-500'}`}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {records.length === 0 ? (
        <EmptyState
          title={`No ${tab} reports`}
          hint={tab === 'pending' ? 'Warehouse staff submit damage reports from Warehouse Mode.' : `No ${tab} reports yet.`}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Date</th>
                {isManager && <th className="px-4 py-3">Shop</th>}
                <th className="px-4 py-3">Product / Variant</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">PCS</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Reported By</th>
                <th className="px-4 py-3">Status</th>
                {(isManager && tab === 'pending') && <th className="px-4 py-3">Actions</th>}
                {tab === 'approved' && <th className="px-4 py-3">Approved By</th>}
                {tab === 'rejected' && <th className="px-4 py-3">Rejection Note</th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const v = variants.find((x) => x.id === r.variantId);
                return (
                  <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                    <td className="px-4 py-3 text-ink-500">{new Date(r.reportedAt).toLocaleDateString()}</td>
                    {isManager && <td className="px-4 py-3 text-ink-600">{shopName(r.shopId)}</td>}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink-800">{productName(r.productId)}</div>
                      <div className="text-xs text-ink-400">{v?.colorName ?? v?.label} · <span className="font-mono">{r.barcode ?? v?.barcode}</span></div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{r.reportedQty} {r.uom}</td>
                    <td className="px-4 py-3 text-right text-ink-600">{r.reportedPcs > 0 ? r.reportedPcs : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink-700">{r.reason}</div>
                      {r.notes && <div className="text-xs text-ink-400">{r.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-ink-500 text-xs">{r.reportedByName}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                    {isManager && tab === 'pending' && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {canApprove && (
                            <button className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-600"
                              onClick={() => doApprove(r.id)}>
                              Approve
                            </button>
                          )}
                          <button className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-200"
                            onClick={() => setRejectTarget(r.id)}>
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                    {tab === 'approved' && (
                      <td className="px-4 py-3 text-xs text-ink-500">
                        {r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : '—'}
                      </td>
                    )}
                    {tab === 'rejected' && (
                      <td className="px-4 py-3 text-xs text-ink-500">{r.rejectionNote ?? '—'}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
