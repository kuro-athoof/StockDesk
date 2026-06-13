import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, EmptyState, Modal, Field } from '../components/ui';
import { PRODUCT_TYPE_LABELS, type ProductType, type Product, type Variant } from '../types';
import { can } from '../lib/permissions';

const TABS: (ProductType | 'all')[] = ['all', 'plain_fabric', 'design_fabric', 'general'];

export function Products() {
  const {
    user, products, variants, scopedBalances, shops, visibleShopIds, categories, suppliers,
    addProduct, updateProduct, addVariant, updateVariant, variantsOf, supplierName,
  } = useStore();
  const [tab, setTab] = useState<ProductType | 'all'>('all');
  const [q, setQ] = useState('');
  const [editProduct, setEditProduct] = useState<Product | 'new' | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);

  const editable = !!user && can(user.role, 'manage_products');

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
            const bs = scopedBalances.filter((b) => b.productId === p.id);
            const rolls = bs.reduce((s, b) => s + (b.rollCount ?? 0), 0);
            const low = bs.filter((b) => b.quantity > 0 && b.quantity <= 10).length;
            const out = bs.filter((b) => b.quantity <= 0).length;
            const perShop = shops.filter((s) => visibleShopIds.includes(s.id)).map((s) => ({
              shop: s.name,
              qty: bs.filter((b) => b.ownerShopId === s.id).reduce((x, b) => x + b.quantity, 0),
              unit: bs[0]?.unit ?? '',
            })).filter((x) => x.qty > 0);

            return (
              <div key={p.id} className="card cursor-pointer p-5 transition-shadow hover:shadow-cardhover" onClick={() => setDetail(p)}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-base font-bold text-ink-900">{p.name}</div>
                    <div className="text-xs text-ink-400">{PRODUCT_TYPE_LABELS[p.type]}{p.collection ? ` · ${p.collection}` : ''}{p.category ? ` · ${p.category}` : ''}</div>
                  </div>
                  <Badge tone="neutral">{vs.length} {p.type === 'general' ? 'items' : p.type === 'design_fabric' ? 'designs' : 'colors'}</Badge>
                </div>
                {p.type !== 'general' && <div className="mt-2 text-xs text-ink-400">{rolls} rolls</div>}
                <div className="mt-3 space-y-1">
                  {perShop.length === 0 ? <div className="text-sm text-ink-400">No stock in your shops.</div> :
                    perShop.map((x) => (
                      <div key={x.shop} className="flex justify-between text-sm">
                        <span className="text-ink-500">{x.shop}</span>
                        <span className="font-semibold text-ink-800">{x.qty} {x.unit}</span>
                      </div>
                    ))}
                </div>
                <div className="mt-3 flex gap-2">
                  {low > 0 && <Badge tone="low">Low: {low}</Badge>}
                  {out > 0 && <Badge tone="out">Out: {out}</Badge>}
                  {low === 0 && out === 0 && <Badge tone="ok">Healthy</Badge>}
                </div>
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
          shops={shops.filter((s) => visibleShopIds.includes(s.id))}
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
  const [type, setType] = useState<ProductType>(initial?.type ?? 'plain_fabric');
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? '');
  const [collection, setCollection] = useState(initial?.collection ?? '');
  const [productImage, setProductImage] = useState(initial?.productImage ?? '');
  const [bookletImage, setBookletImage] = useState(initial?.bookletImage ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [defaultUnit, setDefaultUnit] = useState(initial?.defaultUnit ?? 'Meter');

  const save = () => {
    if (!name.trim()) return;
    const base = { type, name: name.trim(), category: category || undefined, supplierId: supplierId || undefined,
      collection: collection || undefined, productImage: productImage || undefined, bookletImage: bookletImage || undefined,
      notes: notes || undefined, defaultUnit };
    if (initial) onSaveEdit(initial.id, base);
    else onSaveNew(base, []);
  };

  const bookletLabel = type === 'design_fabric' ? 'Design Booklet Image URL' : 'Sample Booklet Image URL';

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit product' : 'Add product'} wide>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Product type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ProductType)}>
            {(['plain_fabric', 'design_fabric', 'general'] as ProductType[]).map((t) => (
              <option key={t} value={t}>{PRODUCT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="Product name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Category">
          <input className="input" list="cats" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Supplier">
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Default unit"><input className="input" value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)} /></Field>
        {type === 'design_fabric' && (
          <Field label="Collection"><input className="input" value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="ITY 2025" /></Field>
        )}
        <Field label="Product image URL"><input className="input" value={productImage} onChange={(e) => setProductImage(e.target.value)} /></Field>
        {type !== 'general' && (
          <Field label={bookletLabel}><input className="input" value={bookletImage} onChange={(e) => setBookletImage(e.target.value)} /></Field>
        )}
        <div className="md:col-span-2">
          <Field label="Notes"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save}>{initial ? 'Save changes' : 'Create product'}</button>
      </div>
      {!initial && <p className="mt-2 text-xs text-ink-400">Add variants after creating, from the product detail view.</p>}
    </Modal>
  );
}

function ProductDetail({ product, variants, balances, shops, supplierName, editable, onClose, onEditProduct, onAddVariant, onUpdateVariant }: {
  product: Product;
  variants: Variant[];
  balances: { variantId: string; ownerShopId: string; quantity: number; unit: string; rollCount?: number }[];
  shops: { id: string; name: string }[];
  supplierName: (id: string) => string;
  editable: boolean;
  onClose: () => void;
  onEditProduct: () => void;
  onAddVariant: (v: Omit<Variant, 'id' | 'productId' | 'createdAt'>) => void;
  onUpdateVariant: (id: string, patch: Partial<Variant>) => void;
}) {
  const [editVariant, setEditVariant] = useState<Variant | 'new' | null>(null);
  const isGeneral = product.type === 'general';
  const variantNoun = product.type === 'design_fabric' ? 'design' : product.type === 'general' ? 'item' : 'color';

  return (
    <Modal open onClose={onClose} title={product.name} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <Badge tone="info">{PRODUCT_TYPE_LABELS[product.type]}</Badge>
        {product.category && <span>Category: {product.category}</span>}
        {product.supplierId && <span>· Supplier: {supplierName(product.supplierId)}</span>}
        {product.collection && <span>· {product.collection}</span>}
        {editable && <button className="btn-ghost ml-auto" onClick={onEditProduct}>Edit product</button>}
      </div>
      {product.notes && <p className="mb-4 text-sm text-ink-500">{product.notes}</p>}

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-900">Variants ({variants.length})</h3>
        {editable && <button className="btn-ghost text-xs" onClick={() => setEditVariant('new')}>Add {variantNoun}</button>}
      </div>

      <div className="space-y-2">
        {variants.map((v) => {
          const perShop = shops.map((s) => {
            const b = balances.find((x) => x.variantId === v.id && x.ownerShopId === s.id);
            return { shop: s.name, qty: b?.quantity ?? 0, unit: b?.unit ?? product.defaultUnit };
          }).filter((x) => x.qty !== 0);
          return (
            <div key={v.id} className="rounded-lg border border-ink-100 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink-800">{v.label}</div>
                  <div className="text-xs text-ink-400">
                    {!isGeneral && v.ourColorNumber && <>Our #{v.ourColorNumber} </>}
                    {!isGeneral && v.supplierColorNumber && <>· Supplier #{v.supplierColorNumber} </>}
                    {v.designNumber && <>· {v.designNumber} </>}
                    {v.barcode && <>· <span className="font-mono">{v.barcode}</span></>}
                    {!isGeneral && v.metersPerRoll && <> · {v.metersPerRoll}m/roll</>}
                  </div>
                </div>
                {editable && <button className="text-xs font-semibold text-teal-600" onClick={() => setEditVariant(v)}>Edit</button>}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-500">
                {perShop.length === 0 ? <span>No stock recorded.</span> :
                  perShop.map((x) => <span key={x.shop}>{x.shop}: <b className="text-ink-700">{x.qty} {x.unit}</b></span>)}
              </div>
            </div>
          );
        })}
        {variants.length === 0 && <div className="text-sm text-ink-400">No variants yet.</div>}
      </div>

      {editVariant && (
        <VariantForm
          initial={editVariant === 'new' ? null : editVariant}
          isGeneral={isGeneral}
          productType={product.type}
          onClose={() => setEditVariant(null)}
          onSaveNew={(v) => { onAddVariant(v); setEditVariant(null); }}
          onSaveEdit={(id, patch) => { onUpdateVariant(id, patch); setEditVariant(null); }}
        />
      )}
    </Modal>
  );
}

function VariantForm({ initial, isGeneral, productType, onClose, onSaveNew, onSaveEdit }: {
  initial: Variant | null;
  isGeneral: boolean;
  productType: ProductType;
  onClose: () => void;
  onSaveNew: (v: Omit<Variant, 'id' | 'productId' | 'createdAt'>) => void;
  onSaveEdit: (id: string, patch: Partial<Variant>) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [ourColorNumber, setOur] = useState(initial?.ourColorNumber ?? '');
  const [supplierColorNumber, setSup] = useState(initial?.supplierColorNumber ?? '');
  const [designNumber, setDesign] = useState(initial?.designNumber ?? '');
  const [designImage, setDesignImage] = useState(initial?.designImage ?? '');
  const [barcode, setBarcode] = useState(initial?.barcode ?? '');
  const [metersPerRoll, setMpr] = useState(initial?.metersPerRoll?.toString() ?? '');

  const save = () => {
    if (!label.trim()) return;
    const v: Omit<Variant, 'id' | 'productId' | 'createdAt'> = {
      productType, label: label.trim(),
      ourColorNumber: ourColorNumber || undefined,
      supplierColorNumber: supplierColorNumber || undefined,
      designNumber: designNumber || undefined,
      designImage: designImage || undefined,
      barcode: barcode || undefined,
      metersPerRoll: metersPerRoll ? Number(metersPerRoll) : undefined,
    };
    if (initial) onSaveEdit(initial.id, v);
    else onSaveNew(v);
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit variant' : 'Add variant'}>
      <div className="grid grid-cols-1 gap-3">
        <Field label={isGeneral ? 'Item name' : productType === 'design_fabric' ? 'Design label' : 'Color label'}>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={productType === 'design_fabric' ? 'D001' : 'Color #4'} />
        </Field>
        {productType === 'plain_fabric' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Our color number"><input className="input" value={ourColorNumber} onChange={(e) => setOur(e.target.value)} /></Field>
            <Field label="Supplier color number"><input className="input" value={supplierColorNumber} onChange={(e) => setSup(e.target.value)} /></Field>
          </div>
        )}
        {productType === 'design_fabric' && (
          <>
            <Field label="Design number"><input className="input" value={designNumber} onChange={(e) => setDesign(e.target.value)} /></Field>
            <Field label="Design image URL"><input className="input" value={designImage} onChange={(e) => setDesignImage(e.target.value)} /></Field>
          </>
        )}
        <Field label="Barcode"><input className="input font-mono" value={barcode} onChange={(e) => setBarcode(e.target.value)} /></Field>
        {!isGeneral && (
          <Field label="Meters per roll (nominal)"><input className="input" type="number" value={metersPerRoll} onChange={(e) => setMpr(e.target.value)} /></Field>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save}>{initial ? 'Save' : 'Add'}</button>
      </div>
    </Modal>
  );
}
