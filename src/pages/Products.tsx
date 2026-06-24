import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, EmptyState, Modal, Field } from '../components/ui';
import { PRODUCT_TYPE_LABELS, type ProductType, type Product, type Variant } from '../types';
import { can } from '../lib/permissions';
import { sanitizeRemarks } from '../lib/sanitizeRemarks';

// P3: Product aggregates read from scopedBalances (operational source of truth),
// with cost/UOM metadata from variant fields.
function productAgg(variants: Variant[], productId: string, scopedBalances: { variantId: string; quantity: number; unit: string; rollCount?: number }[]) {
  const vs = variants.filter((v) => v.productId === productId);
  let totalPcs = 0, totalQty = 0, value = 0, unit = '';
  for (const v of vs) {
    const bal = scopedBalances.filter((b) => b.variantId === v.id);
    const qty  = bal.reduce((s, b) => s + b.quantity, 0);
    const pcs  = bal.reduce((s, b) => s + (b.rollCount ?? 0), 0);
    totalPcs += pcs;
    totalQty += qty;
    value    += qty * (v.cost ?? 0);
    if (!unit && v.uom) unit = v.uom;
  }
  return { variantCount: vs.length, totalPcs, totalQuantity: Math.round(totalQty * 100) / 100, inventoryValueMvr: Math.round(value * 100) / 100, unit };
}

const TABS: (ProductType | 'all')[] = ['all', 'fabric', 'general'];

export function Products() {
  const {
    user, products, variants, scopedBalances, categories, suppliers,
    addProduct, updateProduct, addVariant, updateVariant, variantsOf, supplierName,
  } = useStore();
  const [tab, setTab] = useState<ProductType | 'all'>('all');
  const [q, setQ] = useState('');
  const [editProduct, setEditProduct] = useState<Product | 'new' | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);

  const editable = !!user && can(user.role, 'manage_products');
  const showCosts = can(user?.role, 'view_costs'); // Phase 2: cost visibility gate

  const filtered = useMemo(() => products.filter((p) => {
    if (tab !== 'all' && p.type !== tab) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [products, tab, q]);

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Operational stock by product — no decorative color dots, staff use physical sample books"
        action={editable && <button className="btn-primary" onClick={() => setEditProduct('new')}>Add product</button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${tab === t ? 'bg-teal-500 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'}`}>
            {t === 'all' ? 'All' : PRODUCT_TYPE_LABELS[t]}
          </button>
        ))}
        <input className="input ml-auto max-w-xs" placeholder="Filter products…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No products match" hint="Try a different type or search." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const vs = variants.filter((v) => v.productId === p.id);
            const isGeneral = p.type === 'general';
            const summary = productAgg(variants, p.id, scopedBalances);
            // General inventory falls back to balance quantity (no variant aggregates).
            const genBs = scopedBalances.filter((b) => b.productId === p.id);
            const genQty = genBs.reduce((x, b) => x + b.quantity, 0);

            return (
              <div key={p.id} className="card cursor-pointer p-5 transition-shadow hover:shadow-cardhover" onClick={() => setDetail(p)}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-base font-bold text-ink-900">{p.name}</div>
                    <div className="text-xs text-ink-400">{p.supplierId ? supplierName(p.supplierId) : 'No supplier'}{p.category ? ` · ${p.category}` : ''}</div>
                  </div>
                  <Badge tone="neutral">{vs.length} {isGeneral ? 'items' : 'colors'}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {!isGeneral && (
                    <div className="rounded-lg bg-ink-50 p-2">
                      <div className="text-[10px] font-semibold uppercase text-ink-400">PCS</div>
                      <div className="text-sm font-bold text-ink-800">{summary.totalPcs}</div>
                    </div>
                  )}
                  <div className="rounded-lg bg-ink-50 p-2">
                    <div className="text-[10px] font-semibold uppercase text-ink-400">Qty</div>
                    <div className="text-sm font-bold text-ink-800">{isGeneral ? genQty : summary.totalQuantity}</div>
                  </div>
                  {showCosts && (
                  <div className="rounded-lg bg-ink-50 p-2">
                    <div className="text-[10px] font-semibold uppercase text-ink-400">Value</div>
                    <div className="text-sm font-bold text-teal-700">{isGeneral ? '—' : `${(summary.inventoryValueMvr / 1000).toFixed(1)}k`}</div>
                  </div>
                  )}
                </div>
                {p.active === false && <div className="mt-2"><Badge tone="out">Inactive</Badge></div>}
              </div>
            );
          })}
        </div>
      )}

      {editProduct && (
        <ProductForm
          initial={editProduct === 'new' ? null : editProduct}
          categories={categories}
          suppliers={suppliers}
          onClose={() => setEditProduct(null)}
          onSaveNew={(p, vs) => { addProduct(p, vs); setEditProduct(null); }}
          onSaveEdit={(id, patch) => { updateProduct(id, patch); setEditProduct(null); }}
        />
      )}

      {detail && (
        <ProductDetail
          product={detail}
          variants={variantsOf(detail.id)}
          balances={scopedBalances.filter((b) => b.productId === detail.id)}
          supplierName={supplierName}
          editable={editable}
          onClose={() => setDetail(null)}
          onEditProduct={() => { setEditProduct(detail); setDetail(null); }}
          onAddVariant={(v) => addVariant(detail.id, v)}
          onUpdateVariant={updateVariant}
        />
      )}
    </div>
  );
}

function ProductForm({ initial, categories, suppliers, onClose, onSaveNew, onSaveEdit }: {
  initial: Product | null;
  categories: string[];
  suppliers: { id: string; name: string }[];
  onClose: () => void;
  onSaveNew: (p: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>, vs: Omit<Variant, 'id' | 'productId' | 'createdAt'>[]) => void;
  onSaveEdit: (id: string, patch: Partial<Product>) => void;
}) {
  const [type, setType] = useState<ProductType>(initial?.type ?? 'fabric');
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? '');
  const [collection, setCollection] = useState(initial?.collection ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [defaultUnit, setDefaultUnit] = useState(initial?.defaultUnit ?? 'Meter');
  const [width, setWidth] = useState(initial?.width ?? '');
  const [gsm, setGsm] = useState(initial?.gsm ?? '');
  const [composition, setComposition] = useState(initial?.composition ?? '');
  const [quality, setQuality] = useState(initial?.quality ?? '');
  const [season, setSeason] = useState(initial?.season ?? '');
  const [sampleReference, setSampleReference] = useState(initial?.sampleReference ?? '');
  const [samplePage, setSamplePage] = useState(initial?.samplePage ?? '');
  const [referenceImage, setReferenceImage] = useState(initial?.referenceImage ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [err, setErr] = useState('');

  const { findDuplicateProduct } = useStore();
  const dupProduct = name.trim() !== '' ? findDuplicateProduct(name.trim(), initial?.id ?? undefined) : undefined;

  const save = () => {
    if (!name.trim()) { setErr('Product name is required'); return; }
    if (!category.trim()) { setErr('Category is required'); return; }
    if (!supplierId) { setErr('Supplier is required'); return; }
    if (dupProduct) { setErr(`A product named "${name.trim()}" already exists`); return; }
    const base = {
      type, name: name.trim(), category: category || undefined, supplierId: supplierId || undefined,
      collection: collection || undefined, notes: notes || undefined, defaultUnit,
      width: width || undefined, gsm: gsm || undefined, composition: composition || undefined,
      quality: quality || undefined, season: season || undefined, sampleReference: sampleReference || undefined,
      samplePage: samplePage || undefined, referenceImage: referenceImage || undefined,
      active,
    };
    if (initial) onSaveEdit(initial.id, base);
    else onSaveNew(base, []);
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit product' : 'Add product'} wide>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Product type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ProductType)}>
            {(['fabric', 'general'] as ProductType[]).map((t) => (
              <option key={t} value={t}>{PRODUCT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="Product name *">
          <input className={`input ${dupProduct ? 'border-amber-300' : ''}`} value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} />
          {dupProduct && <p className="mt-1 text-xs font-semibold text-amber-600">⚠ A product with this name already exists</p>}
        </Field>
        <Field label="Category *">
          <input className="input" list="cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="add or pick" />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Supplier *">
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Default unit"><input className="input" value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)} /></Field>
        {type !== 'general' && (
          <Field label="Collection / season"><input className="input" value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="ITY 2026" /></Field>
        )}
        <Field label="Width"><input className="input" value={width} onChange={(e) => setWidth(e.target.value)} placeholder='58"' /></Field>
        <Field label="GSM"><input className="input" value={gsm} onChange={(e) => setGsm(e.target.value)} placeholder="120" /></Field>
        <Field label="Composition"><input className="input" value={composition} onChange={(e) => setComposition(e.target.value)} placeholder="100% Polyester" /></Field>
        <Field label="Quality / fabric type"><input className="input" value={quality} onChange={(e) => setQuality(e.target.value)} /></Field>
        <Field label="Season"><input className="input" value={season} onChange={(e) => setSeason(e.target.value)} /></Field>
        <Field label="Sample reference number"><input className="input" value={sampleReference} onChange={(e) => setSampleReference(e.target.value)} placeholder="from physical sample book" /></Field>
        <Field label="Active">
          <select className="input" value={active ? 'yes' : 'no'} onChange={(e) => setActive(e.target.value === 'yes')}>
            <option value="yes">Active</option>
            <option value="no">Inactive</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Product details / notes"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-ink-50 p-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Reference (physical sample book)</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Sample book number"><input className="input" value={sampleReference} onChange={(e) => setSampleReference(e.target.value)} placeholder="Book 12" /></Field>
          <Field label="Page number"><input className="input" value={samplePage} onChange={(e) => setSamplePage(e.target.value)} placeholder="Page 34" /></Field>
          <Field label="Reference image URL (optional)"><input className="input" value={referenceImage} onChange={(e) => setReferenceImage(e.target.value)} placeholder="one image only" /></Field>
        </div>
        <p className="mt-2 text-[11px] text-ink-400">One optional reference image only. No color/variant/roll images. Identification uses sample books + color numbers.</p>
      </div>

      <p className="mt-3 text-xs text-ink-400">Required fields marked *. Optional details can be left blank for fast entry.</p>
      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save}>{initial ? 'Save changes' : 'Create product'}</button>
      </div>
      {!initial && <p className="mt-2 text-xs text-ink-400">Add variants after creating, from the product detail view.</p>}
    </Modal>
  );
}

function ProductDetail({ product, variants, supplierName, editable, onClose, onEditProduct, onAddVariant, onUpdateVariant }: {
  product: Product;
  variants: Variant[];
  balances: { variantId: string; ownerShopId: string; quantity: number; unit: string; rollCount?: number }[];
  supplierName: (id: string) => string;
  editable: boolean;
  onClose: () => void;
  onEditProduct: () => void;
  onAddVariant: (v: Omit<Variant, 'id' | 'productId' | 'createdAt'>) => void;
  onUpdateVariant: (id: string, patch: Partial<Variant>) => void;
}) {
  const [editVariant, setEditVariant] = useState<Variant | 'new' | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(variants[0]?.id ?? null);
  const [tab, setTab] = useState<'receipts' | 'transfers' | 'history'>('receipts');
  const isGeneral = product.type === 'general';
  const { audit, scopedBalances, user } = useStore();
  const showCosts = can(user?.role, 'view_costs'); // Phase 2: hide cost/value from warehouse staff

  const lastOf = (variantId: string, action: string) =>
    audit.filter((a) => a.variantId === variantId && a.action === action).sort((a, b) => b.timestamp - a.timestamp)[0];

  // Product-level aggregates read directly from variant fields (no roll records).
  const summary = productAgg(variants, product.id, scopedBalances);
  const avgCost = summary.totalQuantity > 0 ? summary.inventoryValueMvr / summary.totalQuantity : 0;
  const productCode = product.id.replace(/^p_/, '').toUpperCase().slice(0, 8);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-ink-400">
        <button className="hover:text-ink-700" onClick={onClose}>Products</button>
        <span>›</span>
        <span className="font-semibold text-ink-700">{product.name}</span>
      </div>

      {/* Header card */}
      <div className="card mb-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">{product.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <Badge tone="info">{PRODUCT_TYPE_LABELS[product.type]}</Badge>
              {product.category && <span className="text-ink-500">Category: {product.category}</span>}
              {product.supplierId && <span className="text-ink-500">Supplier: {supplierName(product.supplierId)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editable && <button className="btn-ghost" onClick={onEditProduct}>Edit Product</button>}
            {editable && !isGeneral && <button className="btn-primary" onClick={() => setEditVariant('new')}>+ Add Variant</button>}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-8 border-t border-ink-100 pt-4 text-sm">
          <div><div className="text-xs text-ink-400">Product Code</div><div className="font-semibold text-ink-800">{productCode}</div></div>
          <div><div className="text-xs text-ink-400">Created</div><div className="font-semibold text-ink-800">{new Date(product.createdAt).toLocaleDateString()}</div></div>
          <div><div className="text-xs text-ink-400">Status</div>{product.active === false ? <Badge tone="out">Inactive</Badge> : <Badge tone="ok">Active</Badge>}</div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Variants" value={isGeneral ? `${variants.length} Items` : `${variants.length} Colors`} />
        <SummaryCard label="PCS" value={isGeneral ? '—' : String(summary.totalPcs)} />
        <SummaryCard label="Total Quantity" value={`${summary.totalQuantity.toLocaleString()}${summary.unit ? ' ' + summary.unit : ''}`} />
        {showCosts && <SummaryCard label="Total Value" value={`${summary.inventoryValueMvr.toLocaleString(undefined, { minimumFractionDigits: 2 })} MVR`} accent />}
      </div>

      {isGeneral
        ? <GeneralInventoryPanel product={product} variants={variants} scopedBalances={scopedBalances} editable={editable} onAddVariant={() => setEditVariant('new')} />
        : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]">
          {/* Left: variants (colors) */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-900">Variants (Colors)</h3>
              {editable && <button className="btn-ghost text-xs" onClick={() => setEditVariant('new')}>+ Add Color</button>}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  <th className="pb-2">Barcode</th><th className="pb-2">Variant</th><th className="pb-2 text-right">PCS</th><th className="pb-2 text-right">Total Qty</th>{showCosts && <th className="pb-2 text-right">Cost</th>}{showCosts && <th className="pb-2 text-right">Value</th>}<th className="pb-2">Status</th><th />
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const sel = selectedVariant === v.id;
                  // Source of truth: stock_balances (not variant aggregate fields)
                  const vBals = scopedBalances.filter((b) => b.variantId === v.id);
                  const balPcs = vBals.reduce((s, b) => s + (b.rollCount ?? 0), 0);
                  const balQty = Math.round(vBals.reduce((s, b) => s + b.quantity, 0) * 100) / 100;
                  const balValue = Math.round(balQty * (v.cost ?? 0) * 100) / 100;
                  return (
                    <tr key={v.id} className={`cursor-pointer border-b border-ink-50 last:border-0 ${sel ? 'bg-teal-50' : 'hover:bg-ink-50/50'}`} onClick={() => { setSelectedVariant(v.id); setTab('receipts'); }}>
                      <td className="py-2 font-mono text-xs text-ink-700">{v.barcode ?? '—'}</td>
                      <td className="py-2">
                        <div className="font-semibold text-ink-800">{v.colorName ?? v.label}</div>
                        <div className="text-[10px] text-ink-400">{v.ourColorNumber ? `Our #${v.ourColorNumber}` : ''}{v.supplierColorNumber ? ` · Sup #${v.supplierColorNumber}` : ''}</div>
                      </td>
                      <td className="py-2 text-right text-ink-600">{balPcs}</td>
                      <td className="py-2 text-right text-ink-700">{balQty} {v.uom ?? ''}</td>
                      {showCosts && <td className="py-2 text-right text-ink-600">{v.cost != null ? v.cost.toFixed(2) : '—'}</td>}
                      {showCosts && <td className="py-2 text-right font-semibold text-ink-800">{balValue.toLocaleString()}</td>}
                      <td className="py-2">{v.active === false ? <Badge tone="out">Inactive</Badge> : <Badge tone="ok">Active</Badge>}</td>
                      <td className="py-2 text-right">{editable && <button className="text-xs text-teal-600" onClick={(e) => { e.stopPropagation(); setEditVariant(v); }}>Edit</button>}</td>
                    </tr>
                  );
                })}
                {variants.length === 0 && <tr><td colSpan={9} className="py-4 text-center text-sm text-ink-400">No colors yet.</td></tr>}
              </tbody>
            </table>
            </div>
            {variants.length > 0 && (
              <div className={`mt-3 grid gap-2 rounded-lg bg-ink-50 p-3 text-center text-xs ${showCosts ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div><div className="text-ink-400">PCS</div><div className="font-bold text-ink-800">{summary.totalPcs}</div></div>
                <div><div className="text-ink-400">Quantity</div><div className="font-bold text-ink-800">{summary.totalQuantity} {summary.unit}</div></div>
                {showCosts && <div><div className="text-ink-400">Value</div><div className="font-bold text-ink-800">{summary.inventoryValueMvr.toLocaleString()}</div></div>}
              </div>
            )}
          </div>

          {/* Right: variant detail + history tabs (NO roll tables) */}
          <div className="card p-4">
            {selectedVariant ? (() => {
              const v = variants.find((x) => x.id === selectedVariant)!;
              const lastRcv = lastOf(v.id, 'RECEIVE');
              const lastTrf = lastOf(v.id, 'TRANSFER_OUT');
              return (
                <div>
                  <div className="mb-3 border-b border-ink-100 pb-3">
                    <div className="text-base font-bold text-ink-900">{v.colorName ?? v.label}</div>
                    <div className="font-mono text-xs text-ink-400">{v.barcode ?? 'no barcode'}</div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      {(() => {
                        // P3: display quantities from stock_balances (source of truth)
                        const vBals = scopedBalances.filter((b) => b.variantId === v.id);
                        const balQty = vBals.reduce((s, b) => s + b.quantity, 0);
                        const balPcs = vBals.reduce((s, b) => s + (b.rollCount ?? 0), 0);
                        return (<>
                          <Detail label="PCS (balance)" value={String(balPcs)} />
                          <Detail label="Total Qty" value={`${Math.round(balQty * 100) / 100} ${v.uom ?? ''}`} />
                        </>);
                      })()}
                      {showCosts && <Detail label="Cost" value={v.cost != null ? `${v.cost.toFixed(2)} MVR` : '—'} />}
                      {showCosts && <Detail label="Total Value" value={`${Math.round(
                        Math.round(scopedBalances.filter((b) => b.variantId === v.id).reduce((s, b) => s + b.quantity, 0) * 100) / 100
                        * (v.cost ?? 0) * 100) / 100} MVR`} />}
                      <Detail label="UOM" value={v.uom ?? '—'} />
                      <Detail label="Last Receive" value={lastRcv ? new Date(lastRcv.timestamp).toLocaleDateString() : '—'} />
                      <Detail label="Last Transfer" value={lastTrf ? new Date(lastTrf.timestamp).toLocaleDateString() : '—'} />
                    </div>
                  </div>
                  <div className="mb-3 flex gap-4 border-b border-ink-100 text-sm">
                    {(['receipts', 'transfers', 'history'] as const).map((t) => (
                      <button key={t} onClick={() => setTab(t)}
                        className={`-mb-px border-b-2 pb-2 font-semibold capitalize ${tab === t ? 'border-teal-500 text-teal-700' : 'border-transparent text-ink-400 hover:text-ink-600'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <VariantHistory variantId={v.id} tab={tab} audit={audit} showCosts={showCosts} />
                </div>
              );
            })() : <div className="py-8 text-center text-sm text-ink-400">Select a variant to view details.</div>}
          </div>
        </div>
      )}

      {/* Bottom row: summary / costing / quick actions */}
      {!isGeneral && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card p-4">
            <h4 className="mb-2 text-sm font-bold text-ink-900">Product Summary</h4>
            <SummaryRow label="PCS" value={String(summary.totalPcs)} />
            <SummaryRow label="Total Quantity" value={`${summary.totalQuantity} ${summary.unit}`} />
            {showCosts && <SummaryRow label="Average Cost / Unit" value={`${avgCost.toFixed(2)} MVR`} />}
            {showCosts && <SummaryRow label="Total Value" value={`${summary.inventoryValueMvr.toLocaleString(undefined, { minimumFractionDigits: 2 })} MVR`} />}
          </div>
          {showCosts && (
          <div className="card p-4">
            <h4 className="mb-2 text-sm font-bold text-ink-900">Costing Information</h4>
            <CostingInfo variants={variants} productId={product.id} scopedBalances={scopedBalances} />
          </div>
          )}
          <div className="card p-4">
            <h4 className="mb-2 text-sm font-bold text-ink-900">Quick Actions</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-lg bg-ink-50 px-3 py-2 text-center text-ink-500">Receive Stock</span>
              <span className="rounded-lg bg-ink-50 px-3 py-2 text-center text-ink-500">Move Stock</span>
              <span className="rounded-lg bg-ink-50 px-3 py-2 text-center text-ink-500">Stock Count</span>
              
            </div>
          </div>
        </div>
      )}

      {editVariant && (
        <VariantForm
          initial={editVariant === 'new' ? null : editVariant}
          isGeneral={isGeneral}
          productType={product.type}
          productName={product.name}
          existingCount={variants.length}
          onClose={() => setEditVariant(null)}
          onSaveNew={(v) => { onAddVariant(v); setEditVariant(null); }}
          onSaveEdit={(id, patch) => { onUpdateVariant(id, patch); setEditVariant(null); }}
        />
      )}
    </div>
  );
}


function VariantHistory({ variantId, tab, audit, showCosts }: {
  variantId: string;
  tab: 'receipts' | 'transfers' | 'history';
  audit: import('../types').AuditLog[];
  showCosts: boolean;
}) {
  const want = tab === 'receipts' ? 'RECEIVE' : tab === 'transfers' ? 'TRANSFER_OUT' : null;
  const entries = audit.filter((a) => a.variantId === variantId && (want == null || a.action === want))
    .sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
  if (entries.length === 0) return <div className="py-6 text-center text-sm text-ink-400">No {tab} yet.</div>;
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-left text-ink-400"><th className="py-1">Date</th><th>Action</th><th className="text-right">Qty</th><th>By</th><th>Notes</th></tr></thead>
      <tbody>{entries.map((a) => (
        <tr key={a.id} className="border-t border-ink-50">
          <td className="py-1">{new Date(a.timestamp).toLocaleDateString()}</td>
          <td>{a.action.replace(/_/g, ' ')}</td>
          <td className="text-right">{a.qtyChanged}</td>
          <td>{a.userName}</td>
          <td className="max-w-[200px] truncate text-ink-400" title={showCosts ? (a.remarks ?? '') : sanitizeRemarks(a.remarks, false)}>{sanitizeRemarks(a.remarks, showCosts)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-ink-400">{label}</div><div className="font-semibold text-ink-800">{value}</div></div>;
}

function GeneralInventoryPanel({ product, variants, scopedBalances, editable, onAddVariant }: {
  product: Product;
  variants: Variant[];
  scopedBalances: { variantId: string; quantity: number; unit: string }[];
  editable: boolean;
  onAddVariant: () => void;
}) {
  const rows = variants.length ? variants : [];
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-900">Items</h3>
        {editable && <button className="btn-ghost text-xs" onClick={onAddVariant}>+ Add Item</button>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            <th className="pb-2">Item</th><th className="pb-2 text-right">Current Qty</th><th className="pb-2">Unit</th><th className="pb-2">Barcode</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const qty = scopedBalances.filter((b) => b.variantId === v.id).reduce((s, b) => s + b.quantity, 0);
            const unit = scopedBalances.find((b) => b.variantId === v.id)?.unit ?? product.defaultUnit;
            return (
              <tr key={v.id} className="border-b border-ink-50 last:border-0">
                <td className="py-2 font-semibold text-ink-800">{v.label}</td>
                <td className="py-2 text-right">{qty}</td>
                <td className="py-2 text-ink-500">{unit}</td>
                <td className="py-2 font-mono text-xs text-ink-500">{v.barcode ?? '—'}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-sm text-ink-400">No items yet.</td></tr>}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-400">General inventory tracks quantity only. No PCS count or fabric-style aggregates.</p>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent ? 'text-teal-600' : 'text-ink-900'}`}>{value}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between border-b border-ink-50 py-1.5 text-sm last:border-0"><span className="text-ink-500">{label}</span><span className="font-semibold text-ink-800">{value}</span></div>;
}

function CostingInfo({ variants, productId, scopedBalances }: {
  variants: Variant[];
  productId: string;
  scopedBalances: { variantId: string; quantity: number; unit: string; rollCount?: number }[];
}) {
  const vs = variants.filter((v) => v.productId === productId && v.cost != null);
  const sample = vs[0];
  if (!sample) return <p className="text-sm text-ink-400">No costed stock yet.</p>;
  // Source of truth: stock_balances, not variant aggregates
  const vBals = scopedBalances.filter((b) => vs.some((v) => v.id === b.variantId));
  const totalPcs = vBals.reduce((s, b) => s + (b.rollCount ?? 0), 0);
  const totalQty = Math.round(vBals.reduce((s, b) => s + b.quantity, 0) * 100) / 100;
  const totalValue = Math.round(totalQty * (sample.cost ?? 0) * 100) / 100;
  return (
    <div>
      <SummaryRow label={`Cost / ${sample.uom ?? 'unit'}`} value={`${(sample.cost ?? 0).toFixed(2)} MVR`} />
      <SummaryRow label="PCS (balance)" value={String(totalPcs)} />
      <SummaryRow label="Total Qty" value={`${totalQty} ${sample.uom ?? ''}`} />
      <SummaryRow label="Total Value" value={`${totalValue.toLocaleString()} MVR`} />
    </div>
  );
}

function VariantForm({ initial, isGeneral, productType, productName, existingCount, onClose, onSaveNew, onSaveEdit }: {
  initial: Variant | null;
  isGeneral: boolean;
  productType: ProductType;
  productName: string;
  existingCount: number;
  onClose: () => void;
  onSaveNew: (v: Omit<Variant, 'id' | 'productId' | 'createdAt'>) => void;
  onSaveEdit: (id: string, patch: Partial<Variant>) => void;
}) {
  const { isBarcodeUnique, generateBarcodeFor } = useStore();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [ourColorNumber, setOur] = useState(initial?.ourColorNumber ?? '');
  const [supplierColorNumber, setSup] = useState(initial?.supplierColorNumber ?? '');
  const [colorName, setColorName] = useState(initial?.colorName ?? '');
  const [colorFamily, setColorFamily] = useState(initial?.colorFamily ?? '');
  const [colorCode] = useState(initial?.colorCode ?? ''); // preserved if present; no longer edited (no swatches)
  const [designNumber] = useState(initial?.designNumber ?? '');
  const [collection] = useState(initial?.collection ?? '');
  const [barcode, setBarcode] = useState(initial?.barcode ?? '');
  const [barcodeSource, setBarcodeSource] = useState<Variant['barcodeSource']>(initial?.barcodeSource ?? 'manual');
  const [metersPerRoll, setMpr] = useState(initial?.metersPerRoll?.toString() ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [err, setErr] = useState('');

  const barcodeDup = barcode.trim() !== '' && !isBarcodeUnique(barcode.trim(), initial?.id ?? undefined);

  const doGenerate = () => {
    const code = generateBarcodeFor(productName, { ourColorNumber, designNumber, label }, existingCount + 1);
    setBarcode(code);
    setBarcodeSource('generated');
    setErr('');
  };

  const save = () => {
    if (!label.trim()) { setErr('Variant label is required'); return; }
    if (barcodeDup) { setErr('That barcode is already assigned to another variant'); return; }
    const v: Omit<Variant, 'id' | 'productId' | 'createdAt'> = {
      productType, label: label.trim(),
      ourColorNumber: ourColorNumber || undefined,
      supplierColorNumber: supplierColorNumber || undefined,
      colorName: colorName || undefined,
      colorFamily: colorFamily || undefined,
      colorCode: colorCode || undefined,
      designNumber: designNumber || undefined,
      collection: collection || undefined,
      barcode: barcode.trim() || undefined,
      barcodeSource: barcode.trim() ? barcodeSource : undefined,
      active,
      metersPerRoll: metersPerRoll ? Number(metersPerRoll) : undefined,
    };
    if (initial) onSaveEdit(initial.id, v);
    else onSaveNew(v);
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit variant' : 'Add variant'}>
      <div className="grid grid-cols-1 gap-3">
        <Field label={isGeneral ? 'Item name' : 'Variant name'}>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={isGeneral ? 'e.g. 50ml bottle' : 'Color #01 Black  or  D001'} />
        </Field>
        {!isGeneral && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Our color number"><input className="input" value={ourColorNumber} onChange={(e) => setOur(e.target.value)} placeholder="01" /></Field>
            <Field label="Supplier color number"><input className="input" value={supplierColorNumber} onChange={(e) => setSup(e.target.value)} placeholder="C10" /></Field>
            <Field label="Color name"><input className="input" value={colorName} onChange={(e) => setColorName(e.target.value)} placeholder="Midnight Black" /></Field>
            <Field label="Color family"><input className="input" value={colorFamily} onChange={(e) => setColorFamily(e.target.value)} placeholder="Black" /></Field>
          </div>
        )}
        <Field label="Barcode">
          <div className="flex gap-2">
            <input className={`input flex-1 font-mono ${barcodeDup ? 'border-red-300 focus:ring-red-100' : ''}`} value={barcode}
              onChange={(e) => { setBarcode(e.target.value); setBarcodeSource('manual'); }} placeholder="AUR-003" />
            <button type="button" className="btn-ghost shrink-0" onClick={doGenerate}>Generate</button>
          </div>
          {barcodeDup && <p className="mt-1 text-xs font-semibold text-red-600">⚠ Already assigned to another variant</p>}
          {barcode && !barcodeDup && barcodeSource === 'generated' && <p className="mt-1 text-xs text-teal-600">System-generated, unique</p>}
        </Field>
        {!isGeneral && (
          <Field label="Meters per roll (nominal, optional)"><input className="input" type="number" value={metersPerRoll} onChange={(e) => setMpr(e.target.value)} /></Field>
        )}
        <Field label="Active">
          <select className="input" value={active ? 'yes' : 'no'} onChange={(e) => setActive(e.target.value === 'yes')}>
            <option value="yes">Active</option>
            <option value="no">Inactive</option>
          </select>
        </Field>
      </div>
      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
      <p className="mt-2 text-xs text-ink-400">Color images and booklet images are not required — identification uses physical sample books.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={barcodeDup}>{initial ? 'Save' : 'Add'}</button>
      </div>
    </Modal>
  );
}
