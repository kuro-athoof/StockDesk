import { useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { Badge, EmptyState } from '../components/ui';
import { runHealthChecks, type HealthSeverity } from '../lib/dataQuality';

const SEV_TONE: Record<HealthSeverity, 'out' | 'low' | 'neutral'> = {
  high: 'out', medium: 'low', low: 'neutral',
};

const KIND_LABEL: Record<string, string> = {
  missing_barcode: 'Missing barcode',
  missing_supplier_color: 'Missing supplier color #',
  missing_color_name: 'Missing color name',
  duplicate_barcode: 'Duplicate barcode',
  duplicate_variant: 'Duplicate variant',
  inactive_with_stock: 'Inactive but holds stock',
  product_missing_supplier: 'Product missing supplier',
  product_missing_category: 'Product missing category',
};

export function MasterDataHealth() {
  const { products, variants, scopedBalances, productName } = useStore();

  const issues = useMemo(
    () => runHealthChecks(products, variants, scopedBalances, productName),
    [products, variants, scopedBalances, productName],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    issues.forEach((i) => { c[i.kind] = (c[i.kind] ?? 0) + 1; });
    return c;
  }, [issues]);

  const highCount = issues.filter((i) => i.severity === 'high').length;

  if (issues.length === 0) {
    return <EmptyState title="Master data looks healthy" hint="No missing barcodes, duplicates, or inactive-with-stock issues found." />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="text-sm text-ink-600">
          <b className="text-ink-900">{issues.length}</b> issues found
          {highCount > 0 && <span className="text-red-600"> · {highCount} high priority</span>}
        </div>
      </div>

      {/* Summary chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(counts).map(([kind, n]) => (
          <span key={kind} className="rounded-full bg-ink-50 px-3 py-1 text-xs text-ink-600">
            {KIND_LABEL[kind] ?? kind}: <b>{n}</b>
          </span>
        ))}
      </div>

      {/* Issue list */}
      <div className="card divide-y divide-ink-50">
        {issues.map((i) => (
          <div key={i.id} className="flex items-start gap-3 px-4 py-3">
            <Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink-800">{KIND_LABEL[i.kind] ?? i.kind}</div>
              <div className="text-xs text-ink-500">{i.message}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-ink-400">Health checks reflect godown master data only — products, variants, and godown stock for your visible owners.</p>
    </div>
  );
}
