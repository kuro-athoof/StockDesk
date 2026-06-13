import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Modal, Field } from '../components/ui';
import { can } from '../lib/permissions';
import type { Supplier } from '../types';

const BLANK = { name: '', country: '', contact: '', phone: '' };

export function Suppliers() {
  const { user, suppliers, products, addSupplier, updateSupplier } = useStore();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const editable = can(user?.role, 'manage_products');

  const openAdd = () => { setEditId(null); setForm(BLANK); setOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditId(s.id);
    setForm({ name: s.name, country: s.country ?? '', contact: s.contact ?? '', phone: s.phone ?? '' });
    setOpen(true);
  };
  const save = () => {
    if (!form.name.trim()) return;
    if (editId) updateSupplier(editId, form);
    else addSupplier(form);
    setOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Vendors, countries, and contacts"
        action={editable && <button className="btn-primary" onClick={openAdd}>Add supplier</button>}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3 text-right">Products</th>
              {editable && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-3 font-semibold text-ink-800">{s.name}</td>
                <td className="px-4 py-3 text-ink-600">{s.country ?? '—'}</td>
                <td className="px-4 py-3 text-ink-600">{s.contact ?? '—'}</td>
                <td className="px-4 py-3 text-ink-600">{s.phone ?? '—'}</td>
                <td className="px-4 py-3 text-right text-ink-600">
                  {products.filter((p) => p.supplierId === s.id).length}
                </td>
                {editable && (
                  <td className="px-4 py-3 text-right">
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => openEdit(s)}>Edit</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit supplier' : 'Add supplier'}>
        <div className="space-y-3">
          <Field label="Supplier name">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Country">
            <input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </Field>
          <Field label="Contact person">
            <input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={save}>{editId ? 'Save' : 'Add'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
