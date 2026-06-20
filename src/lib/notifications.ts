import type { Balance, Variant, Product, AuditLog } from '../types';
import type { AppSettings } from './demoData';

export type NotifKind = 'out' | 'low' | 'non_moving' | 'dead' | 'pending';

export interface Notif {
  id: string;
  kind: NotifKind;
  title: string;
  detail: string;
  shopId: string;
  severity: 'high' | 'medium' | 'low';
}

const DAY = 86_400_000;

/**
 * Builds notifications from the current (scoped) balances + audit history.
 * Low/out come from balance vs threshold. Non-moving/dead come from the last
 * movement timestamp vs settings day thresholds.
 */
export function generateNotifications(
  balances: Balance[],
  variants: Variant[],
  _products: Product[],
  audit: AuditLog[],
  settings: AppSettings,
  shopNameFn: (id: string) => string,
  productNameFn: (id: string) => string,
): Notif[] {
  const out: Notif[] = [];
  const now = Date.now();

  const lastMoveTs = (variantId: string, shopId: string): number | null => {
    const m = audit
      .filter((a) => a.variantId === variantId && a.ownerShopId === shopId)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    return m ? m.timestamp : null;
  };

  for (const b of balances) {
    const v = variants.find((x) => x.id === b.variantId);
    const label = `${productNameFn(b.productId)} · ${v?.label ?? ''}`.trim();
    const where = shopNameFn(b.ownerShopId);

    if (b.quantity <= 0) {
      out.push({ id: `out_${b.id}`, kind: 'out', severity: 'medium', shopId: b.ownerShopId,
        title: 'Depleted in godown', detail: `${label} — owner ${where}` });
      continue; // depleted supersedes low
    }
    if (b.quantity <= settings.lowStockThreshold) {
      out.push({ id: `low_${b.id}`, kind: 'low', severity: 'low', shopId: b.ownerShopId,
        title: 'Low in godown', detail: `${label} — ${b.quantity} ${b.unit}, owner ${where}` });
    }

    const ts = lastMoveTs(b.variantId, b.ownerShopId);
    if (ts) {
      const ageDays = Math.floor((now - ts) / DAY);
      if (ageDays >= settings.deadStockDays) {
        out.push({ id: `dead_${b.id}`, kind: 'dead', severity: 'high', shopId: b.ownerShopId,
          title: 'Dead godown stock', detail: `${label} — no godown movement in ${ageDays}d, owner ${where}` });
      } else if (ageDays >= settings.nonMovingDays) {
        out.push({ id: `nonmov_${b.id}`, kind: 'non_moving', severity: 'low', shopId: b.ownerShopId,
          title: 'Non-moving godown stock', detail: `${label} — ${ageDays}d since last godown move, owner ${where}` });
      }
    }
  }

  return out.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}
