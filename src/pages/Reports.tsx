import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge } from '../components/ui';
import { generateNotifications } from '../lib/notifications';

type ReportKey = 'by_shop' | 'low' | 'out' | 'non_moving' | 'color_map' | 'recent';

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'by_shop', label: 'Stock by Shop' },
  { key: 'low', label: 'Low Stock' },
  { key: 'out', label: 'Out of Stock' },
  { key: 'non_moving', label: 'Non-Moving / Dead' },
  { key: 'color_map', label: 'Supplier Color Mapping' },
  { key: 'recent', label: 'Recent Transfers / Adjustments' },
];

export function Reports() {
  const store = useStore();
  const { scopedBalances, variants, products, audit, settings, shops, visibleShopIds, shopName, productName, supplierName } = store;
  const [active, setActive] = useState<ReportKey>('by_shop');

  const visibleShops = shops.filter((s) => visibleShopIds.includes(s.id));

  const notifs = useMemo(
    () => generateNotifications(scopedBalances, variants, products, audit, settings, shopName, productName),
    [scopedBalances, variants, products, audit, settings, shopName, productName],
  );

  const mockExport = (fmt: string) => alert(`Export to ${fmt} — wired in Slice 4.`);

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Live tables from current demo data"
        action={
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => mockExport('Excel')}>Export Excel</button>
            <button className="btn-ghost" onClick={() => mockExport('PDF')}>Export PDF</button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setActive(r.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              active === r.key ? 'bg-teal-500 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {active === 'by_shop' && (
          <Table head={['Shop', 'Variants', 'Total qty', 'Rolls']}>
            {visibleShops.map((s) => {
              const bs = scopedBalances.filter((b) => b.ownerShopId === s.id);
              const qty = bs.reduce((x, b) => x + b.quantity, 0);
              const rolls = bs.reduce((x, b) => x + (b.rollCount ?? 0), 0);
              return <tr key={s.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50"><Td bold>{s.name}</Td><Td>{bs.length}</Td><Td>{qty.toLocaleString()}</Td><Td>{rolls}</Td></tr>;
            })}
          </Table>
        )}

        {active === 'low' && (
          <Table head={['Product', 'Variant', 'Shop', 'Qty', 'Unit']}>
            {scopedBalances.filter((b) => b.quantity > 0 && b.quantity <= settings.lowStockThreshold).map((b) => {
              const v = variants.find((x) => x.id === b.variantId);
              return <tr key={b.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50"><Td bold>{productName(b.productId)}</Td><Td>{v?.label}</Td><Td>{shopName(b.ownerShopId)}</Td><Td>{b.quantity}</Td><Td>{b.unit}</Td></tr>;
            })}
          </Table>
        )}

        {active === 'out' && (
          <Table head={['Product', 'Variant', 'Shop', 'Status']}>
            {scopedBalances.filter((b) => b.quantity <= 0).map((b) => {
              const v = variants.find((x) => x.id === b.variantId);
              return <tr key={b.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50"><Td bold>{productName(b.productId)}</Td><Td>{v?.label}</Td><Td>{shopName(b.ownerShopId)}</Td><Td><Badge tone="out">Out</Badge></Td></tr>;
            })}
          </Table>
        )}

        {active === 'non_moving' && (
          <Table head={['Type', 'Detail']}>
            {notifs.filter((n) => n.kind === 'non_moving' || n.kind === 'dead').map((n) => (
              <tr key={n.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50"><Td><Badge tone={n.kind === 'dead' ? 'out' : 'neutral'}>{n.kind === 'dead' ? 'Dead' : 'Non-moving'}</Badge></Td><Td>{n.detail}</Td></tr>
            ))}
          </Table>
        )}

        {active === 'color_map' && (
          <Table head={['Product', 'Our color #', 'Supplier color #', 'Supplier', 'Barcode']}>
            {variants.filter((v) => v.productType !== 'general').map((v) => {
              const p = products.find((x) => x.id === v.productId);
              return <tr key={v.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50"><Td bold>{p?.name}</Td><Td>{v.ourColorNumber ?? v.designNumber ?? '—'}</Td><Td>{v.supplierColorNumber ?? '—'}</Td><Td>{supplierName(p?.supplierId ?? '')}</Td><Td mono>{v.barcode ?? '—'}</Td></tr>;
            })}
          </Table>
        )}

        {active === 'recent' && (
          <Table head={['Time', 'Action', 'Product', 'Shop', 'Change', 'User']}>
            {audit.filter((a) => visibleShopIds.includes(a.ownerShopId) && (a.action === 'OWNERSHIP_TRANSFER' || a.action === 'INTERNAL_MOVEMENT' || a.action === 'ADJUSTMENT')).sort((a, b) => b.timestamp - a.timestamp).map((a) => (
              <tr key={a.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                <Td>{new Date(a.timestamp).toLocaleDateString()}</Td>
                <Td>{a.action.replace(/_/g, ' ')}</Td>
                <Td bold>{productName(a.productId)}</Td>
                <Td>{shopName(a.ownerShopId)}</Td>
                <Td>{a.qtyChanged > 0 ? '+' : ''}{a.qtyChanged || '—'}</Td>
                <Td>{a.userName}</Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
          {head.map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({ children, bold, mono }: { children: React.ReactNode; bold?: boolean; mono?: boolean }) {
  return <td className={`px-4 py-3 ${bold ? 'font-semibold text-ink-800' : 'text-ink-600'} ${mono ? 'font-mono text-xs' : ''}`}>{children}</td>;
}
