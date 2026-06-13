import { useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { StatCard, PageHeader, Badge } from '../components/ui';
import { landedCost } from '../lib/costing';

export function Dashboard() {
  const {
    user, scopedBalances, visibleShopIds, shops, products, variants, rates,
    suppliers, audit, settings, shopName, productName,
  } = useStore();

  const visibleShops = shops.filter((s) => visibleShopIds.includes(s.id));

  const unitCostOf = useMemo(() => (productId: string) => {
    const p = products.find((x) => x.id === productId);
    const sup = suppliers.find((s) => s.id === p?.supplierId);
    const rate = rates.find((r) => r.country === sup?.country);
    return rate ? landedCost(2.5, rate) : 5; // demo nominal foreign cost 2.5
  }, [products, suppliers, rates]);

  const stats = useMemo(() => {
    const valueOf = (shopId?: string) =>
      scopedBalances
        .filter((b) => (shopId ? b.ownerShopId === shopId : true))
        .reduce((sum, b) => sum + b.quantity * unitCostOf(b.productId), 0);

    const low = scopedBalances.filter((b) => b.quantity > 0 && b.quantity <= settings.lowStockThreshold).length;
    const out = scopedBalances.filter((b) => b.quantity <= 0).length;

    const cutoff = Date.now() - settings.nonMovingDays * 86400_000;
    const movedVariants = new Set(audit.filter((a) => a.timestamp >= cutoff && a.qtyChanged !== 0).map((a) => a.variantId));
    const nonMovingValue = scopedBalances
      .filter((b) => b.quantity > 0 && !movedVariants.has(b.variantId))
      .reduce((sum, b) => sum + b.quantity * unitCostOf(b.productId), 0);

    return { total: valueOf(), low, out, nonMovingValue, perShop: visibleShops.map((s) => ({ name: s.name, value: valueOf(s.id) })) };
  }, [scopedBalances, audit, settings, unitCostOf, visibleShops]);

  // Top/slow moving by total qty moved (abs) in window
  const movement = useMemo(() => {
    const cutoff = Date.now() - settings.nonMovingDays * 86400_000;
    const byVariant: Record<string, number> = {};
    audit
      .filter((a) => a.timestamp >= cutoff && visibleShopIds.includes(a.ownerShopId) && a.qtyChanged !== 0)
      .forEach((a) => { byVariant[a.variantId] = (byVariant[a.variantId] ?? 0) + Math.abs(a.qtyChanged); });
    const rows = Object.entries(byVariant)
      .map(([vid, qty]) => {
        const v = variants.find((x) => x.id === vid);
        return { vid, qty, label: v ? `${productName(v.productId)} · ${v.label}` : vid };
      })
      .sort((a, b) => b.qty - a.qty);
    return { top: rows.slice(0, 5), slow: [...rows].reverse().slice(0, 5) };
  }, [audit, settings, visibleShopIds, variants, productName]);

  const recentMovements = useMemo(
    () => audit.filter((a) => visibleShopIds.includes(a.ownerShopId) && a.qtyChanged !== 0).slice(0, 6),
    [audit, visibleShopIds],
  );
  const recentAudit = useMemo(
    () => audit.filter((a) => visibleShopIds.includes(a.ownerShopId)).slice(0, 6),
    [audit, visibleShopIds],
  );

  const mvr = (n: number) => `MVR ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.name.split(' ')[0]}`} subtitle={`Stock at a glance · ${visibleShops.map((s) => s.name).join(', ') || 'no shops'}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Stock Value" value={mvr(stats.total)} accent />
        {stats.perShop.slice(0, 2).map((s) => (
          <StatCard key={s.name} label={`${s.name} Stock Value`} value={mvr(s.value)} />
        ))}
        <StatCard label="Low / Out of Stock" value={`${stats.low} / ${stats.out}`} sub="variants needing attention" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Non-Moving Value" value={mvr(stats.nonMovingValue)} sub={`no movement ${settings.nonMovingDays}d+`} />
        <StatCard label="Shops Visible" value={visibleShops.length} />
        <StatCard label="Products" value={products.length} />
        <StatCard label="Active Variants" value={variants.length} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Widget title="Stock Needing Attention">
          {scopedBalances
            .filter((b) => b.quantity <= settings.lowStockThreshold)
            .sort((a, b) => a.quantity - b.quantity)
            .slice(0, 6)
            .map((b) => {
              const v = variants.find((x) => x.id === b.variantId);
              return (
                <Row key={b.id}
                  title={`${productName(b.productId)} · ${v?.label ?? ''}`}
                  sub={shopName(b.ownerShopId)}
                  right={b.quantity <= 0 ? <Badge tone="out">Out of stock</Badge> : <Badge tone="low">{b.quantity} {b.unit} left</Badge>}
                />
              );
            })}
        </Widget>

        <Widget title="Recent Movements">
          {recentMovements.map((a) => (
            <Row key={a.id}
              title={`${a.action.replace(/_/g, ' ')} · ${productName(a.productId)}`}
              sub={`${a.userName} · ${shopName(a.ownerShopId)}`}
              right={<span className={`text-sm font-bold ${a.qtyChanged >= 0 ? 'text-teal-600' : 'text-red-500'}`}>{a.qtyChanged > 0 ? '+' : ''}{a.qtyChanged}</span>}
            />
          ))}
        </Widget>

        <Widget title="Top Moving Products">
          {movement.top.length === 0 ? <Empty /> : movement.top.map((r) => (
            <Row key={r.vid} title={r.label} right={<Badge tone="ok">{r.qty} moved</Badge>} />
          ))}
        </Widget>

        <Widget title="Slow Moving Products">
          {movement.slow.length === 0 ? <Empty /> : movement.slow.map((r) => (
            <Row key={r.vid} title={r.label} right={<Badge tone="neutral">{r.qty} moved</Badge>} />
          ))}
        </Widget>

        <Widget title="Recent Audit Logs">
          {recentAudit.map((a) => (
            <Row key={a.id}
              title={`${a.action.replace(/_/g, ' ')} · ${productName(a.productId)}`}
              sub={`${a.userName} · ${new Date(a.timestamp).toLocaleString()}`}
              right={<span className="text-xs text-ink-400">{a.qtyBefore}→{a.qtyAfter}</span>}
            />
          ))}
        </Widget>

        <Widget title="Stock Value by Shop">
          {stats.perShop.map((s) => (
            <Row key={s.name} title={s.name} right={<span className="text-sm font-bold text-ink-800">{mvr(s.value)}</span>} />
          ))}
        </Widget>
      </div>
    </div>
  );
}

function Widget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-bold text-ink-900">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink-800">{title}</div>
        {sub && <div className="text-xs text-ink-400">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
function Empty() { return <div className="px-3 py-2 text-sm text-ink-400">No movement in window.</div>; }
