import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Modal, Field } from '../components/ui';
import { can } from '../lib/permissions';
import { computeFormulaRate } from '../lib/costing';
import type { CountryRate } from '../types';

const BLANK = {
  country: '', currencyCode: '', currencyPerUsd: 0, mvrPerUsd: 15.42,
  cofPct: 2, markupPct: 0, gstPct: 8, finalUsedRate: 0,
};

export function CountryRates() {
  const { user, rates, addRate, updateRate } = useStore();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof BLANK>(BLANK);
  const editable = can(user?.role, 'view_costs') && (user?.role === 'admin' || user?.role === 'purchase_manager');

  const liveFormula = computeFormulaRate(form);

  const openAdd = () => { setEditId(null); setForm(BLANK); setOpen(true); };
  const openEdit = (r: CountryRate) => {
    setEditId(r.id);
    setForm({
      country: r.country, currencyCode: r.currencyCode, currencyPerUsd: r.currencyPerUsd,
      mvrPerUsd: r.mvrPerUsd, cofPct: r.cofPct, markupPct: r.markupPct, gstPct: r.gstPct,
      finalUsedRate: r.finalUsedRate,
    });
    setOpen(true);
  };
  const save = () => {
    if (!form.country.trim()) return;
    const formulaRate = computeFormulaRate(form);
    const payload = { ...form, formulaRate, finalUsedRate: form.finalUsedRate || formulaRate };
    if (editId) updateRate(editId, payload);
    else addRate(payload);
    setOpen(false);
  };

  const num = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: parseFloat(e.target.value) || 0 });

  return (
    <div>
      <PageHeader
        title="Country Rates"
        subtitle="Inventory costing — formula rate with COF, markup, GST (PurchaseDesk logic)"
        action={editable && <button className="btn-primary" onClick={openAdd}>Add country</button>}
      />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Cur</th>
              <th className="px-4 py-3 text-right">Cur/USD</th>
              <th className="px-4 py-3 text-right">MVR/USD</th>
              <th className="px-4 py-3 text-right">COF %</th>
              <th className="px-4 py-3 text-right">Markup %</th>
              <th className="px-4 py-3 text-right">GST %</th>
              <th className="px-4 py-3 text-right">Formula</th>
              <th className="px-4 py-3 text-right">Final</th>
              {editable && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-3 font-semibold text-ink-800">{r.country}</td>
                <td className="px-4 py-3 text-ink-600">{r.currencyCode}</td>
                <td className="px-4 py-3 text-right text-ink-600">{r.currencyPerUsd}</td>
                <td className="px-4 py-3 text-right text-ink-600">{r.mvrPerUsd}</td>
                <td className="px-4 py-3 text-right text-ink-600">{r.cofPct}</td>
                <td className="px-4 py-3 text-right text-ink-600">{r.markupPct}</td>
                <td className="px-4 py-3 text-right text-ink-600">{r.gstPct}</td>
                <td className="px-4 py-3 text-right font-mono text-ink-500">{computeFormulaRate(r)}</td>
                <td className="px-4 py-3 text-right font-bold text-teal-600">{r.finalUsedRate}</td>
                {editable && (
                  <td className="px-4 py-3 text-right">
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => openEdit(r)}>Edit</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit country rate' : 'Add country rate'} wide>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country"><input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
          <Field label="Currency code"><input className="input" value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value })} /></Field>
          <Field label="Currency per USD"><input type="number" step="0.0001" className="input" value={form.currencyPerUsd} onChange={num('currencyPerUsd')} /></Field>
          <Field label="MVR per USD"><input type="number" step="0.01" className="input" value={form.mvrPerUsd} onChange={num('mvrPerUsd')} /></Field>
          <Field label="COF %"><input type="number" step="0.1" className="input" value={form.cofPct} onChange={num('cofPct')} /></Field>
          <Field label="Markup %"><input type="number" step="0.1" className="input" value={form.markupPct} onChange={num('markupPct')} /></Field>
          <Field label="GST %"><input type="number" step="0.1" className="input" value={form.gstPct} onChange={num('gstPct')} /></Field>
          <Field label="Final used rate (override)"><input type="number" step="0.0001" className="input" value={form.finalUsedRate} onChange={num('finalUsedRate')} placeholder={`${liveFormula}`} /></Field>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-ink-50 px-4 py-3">
          <span className="text-sm text-ink-500">Computed formula rate</span>
          <span className="font-mono text-lg font-bold text-teal-600">{liveFormula}</span>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={save}>{editId ? 'Save' : 'Add'}</button>
        </div>
      </Modal>
    </div>
  );
}
