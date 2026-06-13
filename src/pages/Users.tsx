import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, Modal, Field } from '../components/ui';
import { ROLE_LABELS, type Role, type AppUser } from '../types';
import { can, type Capability } from '../lib/permissions';

const ALL_ROLES: Role[] = ['admin', 'purchase_manager', 'shop_manager', 'warehouse_staff', 'auditor'];

const MATRIX_CAPS: { cap: Capability; label: string }[] = [
  { cap: 'manage_users', label: 'Manage users' },
  { cap: 'manage_products', label: 'Manage products' },
  { cap: 'receive_stock', label: 'Receive stock' },
  { cap: 'transfer_stock', label: 'Transfer stock' },
  { cap: 'adjust_stock', label: 'Adjust stock' },
  { cap: 'override_negative', label: 'Override negative' },
  { cap: 'approve_ownership_transfer', label: 'Approve ownership' },
  { cap: 'perform_count', label: 'Stock count' },
  { cap: 'view_costs', label: 'View costs' },
  { cap: 'view_reports', label: 'View reports' },
  { cap: 'export_reports', label: 'Export reports' },
  { cap: 'manage_settings', label: 'Manage settings' },
];

export function Users() {
  const { user, users, shops, shopName, updateUser } = useStore();
  const [editId, setEditId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('shop_manager');
  const [assigned, setAssigned] = useState<string[]>([]);

  const openEdit = (u: AppUser) => {
    setEditId(u.uid); setRole(u.role); setAssigned(u.assignedShopIds);
  };
  const save = () => {
    if (!editId) return;
    const scoped = role === 'shop_manager' || role === 'warehouse_staff';
    updateUser(editId, { role, assignedShopIds: scoped ? assigned : [] });
    setEditId(null);
  };
  const toggleShop = (id: string) =>
    setAssigned((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const scopedRole = role === 'shop_manager' || role === 'warehouse_staff';

  return (
    <div>
      <PageHeader title="Users & Access" subtitle="Roles, shop assignments, and the permission matrix" />

      {/* User list */}
      <div className="card mb-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Assigned shops</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-3 font-semibold text-ink-800">
                  {u.name}{user?.uid === u.uid && <span className="ml-2 text-xs text-teal-600">(you)</span>}
                </td>
                <td className="px-4 py-3 text-ink-500">{u.email}</td>
                <td className="px-4 py-3 text-ink-600">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-3 text-ink-600">
                  {u.assignedShopIds.length === 0
                    ? <span className="text-ink-400">All shops</span>
                    : u.assignedShopIds.map(shopName).join(', ')}
                </td>
                <td className="px-4 py-3"><Badge tone={u.active ? 'ok' : 'neutral'}>{u.active ? 'Active' : 'Disabled'}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <button className="btn-ghost px-3 py-1 text-xs" onClick={() => openEdit(u)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Permission matrix */}
      <h3 className="mb-2 text-sm font-bold text-ink-900">Permission matrix</h3>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Capability</th>
              {ALL_ROLES.map((r) => <th key={r} className="px-3 py-3 text-center">{ROLE_LABELS[r].split(' ')[0]}</th>)}
            </tr>
          </thead>
          <tbody>
            {MATRIX_CAPS.map(({ cap, label }) => (
              <tr key={cap} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-2.5 font-medium text-ink-700">{label}</td>
                {ALL_ROLES.map((r) => (
                  <td key={r} className="px-3 py-2.5 text-center">
                    {can(r, cap)
                      ? <span className="text-teal-600">●</span>
                      : <span className="text-ink-200">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!editId} onClose={() => setEditId(null)} title="Edit user access">
        <div className="space-y-3">
          <Field label="Role">
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
          {scopedRole ? (
            <Field label="Assigned shops">
              <div className="space-y-1.5">
                {shops.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-ink-700">
                    <input type="checkbox" checked={assigned.includes(s.id)} onChange={() => toggleShop(s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            </Field>
          ) : (
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
              This role sees all shops — no assignment needed.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
