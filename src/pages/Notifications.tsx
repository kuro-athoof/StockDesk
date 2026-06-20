import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, EmptyState } from '../components/ui';
import { generateNotifications, type NotifKind } from '../lib/notifications';

const KIND_LABELS: Record<NotifKind | 'all', string> = {
  all: 'All', out: 'Depleted', low: 'Low in godown',
  non_moving: 'Non-moving', dead: 'Dead', pending: 'Pending',
};

const TONE: Record<NotifKind, 'out' | 'low' | 'neutral' | 'info'> = {
  out: 'out', dead: 'out', low: 'low', non_moving: 'neutral', pending: 'info',
};

export function Notifications() {
  const { scopedBalances, variants, products, audit, settings, shopName, productName } = useStore();
  const [filter, setFilter] = useState<NotifKind | 'all'>('all');

  const notifs = useMemo(
    () => generateNotifications(scopedBalances, variants, products, audit, settings, shopName, productName),
    [scopedBalances, variants, products, audit, settings, shopName, productName],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: notifs.length };
    for (const n of notifs) c[n.kind] = (c[n.kind] ?? 0) + 1;
    return c;
  }, [notifs]);

  const visible = filter === 'all' ? notifs : notifs.filter((n) => n.kind === filter);

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Generated live from current stock and movement history" />

      <div className="mb-4 flex flex-wrap gap-2">
        {(['all', 'out', 'low', 'non_moving', 'dead'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              filter === k ? 'bg-teal-500 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
            }`}
          >
            {KIND_LABELS[k]}{counts[k] ? ` (${counts[k]})` : ''}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No notifications" hint="Everything in your shops looks healthy." />
      ) : (
        <div className="space-y-2">
          {visible.map((n) => (
            <div key={n.id} className="card flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-semibold text-ink-800">{n.title}</div>
                <div className="text-xs text-ink-400">{n.detail}</div>
              </div>
              <Badge tone={TONE[n.kind]}>{KIND_LABELS[n.kind]}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
