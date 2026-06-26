import { useMemo, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge, Field } from '../components/ui';
import { BUILT_IN_PROFILES } from '../lib/demoData';
import type { LabelProfile } from '../lib/demoData';
import { buildLabelHtml, buildTestLabelHtml, openPrintWindow, activeProfile } from '../lib/printLabel';
import { can } from '../lib/permissions';

// Static sample data for the label preview — defined outside component to be stable.
const PREVIEW_SAMPLE = {
  productName: 'Aurora Crush',
  variantLabel: 'Black · Color #01',
  ourColorNumber: '01',
  barcode: 'AUR-C01',
  shopName: 'Flora',
  qty: 12,
  uom: 'Muh',
  price: 9.60,
  currency: 'MVR',
};

export function Settings() {
  const {
    settings, updateSettings, units, addUnit, removeUnit,
    categories, addCategory, removeCategory, shops, addShop, updateShop,
    locations, addLocation, removeLocation,
    labelSettings, updateLabelSettings, updateLabelProfile, user,
  } = useStore();

  const [newUnit, setNewUnit] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newShop, setNewShop] = useState('');
  const [loc, setLoc] = useState({ godown: 'Main Godown', rack: '', shelf: '', bin: '' });

  const showCosts = can(user?.role, 'view_costs');
  const profile = useMemo(
    () => activeProfile(labelSettings, BUILT_IN_PROFILES[0]),
    [labelSettings],
  );

  // Build preview HTML whenever profile changes
  const previewHtml = useMemo(
    () => buildLabelHtml(PREVIEW_SAMPLE, profile, 1, true),
    [profile],
  );

  const doPrintTest = () => {
    const html = buildTestLabelHtml(profile);
    if (!openPrintWindow(html)) {
      alert('Popup blocked. Please allow popups for the test print to open.');
    }
  };

  const setActiveProfile = (id: string) => updateLabelSettings({ activeProfileId: id });
  const upd = (patch: Partial<LabelProfile>) => updateLabelProfile(profile.id, patch);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Inventory rules and reference data" />

      {/* ── Inventory rules ── */}
      <section className="card mb-6 p-5">
        <h3 className="mb-4 text-sm font-bold text-ink-900">Inventory rules</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-ink-800">Allow negative stock override</div>
              <div className="text-xs text-ink-400">When off, even managers are blocked from pushing stock below zero.</div>
            </div>
            <input type="checkbox" className="h-5 w-9 accent-teal-500"
              checked={settings.allowNegativeOverride}
              onChange={(e) => updateSettings({ allowNegativeOverride: e.target.checked })} />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Low godown qty highlight</label>
              <input type="number" className="input" value={settings.lowStockThreshold}
                onChange={(e) => updateSettings({ lowStockThreshold: parseInt(e.target.value) || 0 })} />
              <p className="mt-1 text-[11px] text-ink-400">Highlights near-depleted lines.</p>
            </div>
            <div>
              <label className="label">Non-moving after (days)</label>
              <input type="number" className="input" value={settings.nonMovingDays}
                onChange={(e) => updateSettings({ nonMovingDays: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label">Dead stock after (days)</label>
              <input type="number" className="input" value={settings.deadStockDays}
                onChange={(e) => updateSettings({ deadStockDays: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Units */}
        <section className="card p-5">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Units</h3>
          <div className="mb-3 flex gap-2">
            <input className="input" placeholder="Add unit (e.g. Roll)" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
            <button className="btn-primary shrink-0" onClick={() => { if (newUnit.trim()) { addUnit(newUnit.trim()); setNewUnit(''); } }}>Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {units.map((u) => (
              <span key={u.id} className="chip bg-ink-100 text-ink-600">
                {u.code}
                {u.custom && <button className="ml-1 text-ink-400 hover:text-red-500" onClick={() => removeUnit(u.id)}>✕</button>}
              </span>
            ))}
          </div>
        </section>

        {/* Categories */}
        <section className="card p-5">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Categories</h3>
          <div className="mb-3 flex gap-2">
            <input className="input" placeholder="Add category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className="btn-primary shrink-0" onClick={() => { if (newCat.trim()) { addCategory(newCat.trim()); setNewCat(''); } }}>Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span key={c} className="chip bg-ink-100 text-ink-600">
                {c}<button className="ml-1 text-ink-400 hover:text-red-500" onClick={() => removeCategory(c)}>✕</button>
              </span>
            ))}
          </div>
        </section>

        {/* Shops */}
        <section className="card p-5">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Shops</h3>
          <div className="mb-3 flex gap-2">
            <input className="input" placeholder="Add shop" value={newShop} onChange={(e) => setNewShop(e.target.value)} />
            <button className="btn-primary shrink-0" onClick={() => { if (newShop.trim()) { addShop(newShop.trim()); setNewShop(''); } }}>Add</button>
          </div>
          <div className="space-y-2">
            {shops.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
                <span className="text-sm font-medium text-ink-700">{s.name}</span>
                <button className="text-xs" onClick={() => updateShop(s.id, { active: !s.active })}>
                  <Badge tone={s.active ? 'ok' : 'neutral'}>{s.active ? 'Active' : 'Disabled'}</Badge>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Locations */}
        <section className="card p-5">
          <h3 className="mb-3 text-sm font-bold text-ink-900">Locations</h3>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <input className="input" placeholder="Godown" value={loc.godown} onChange={(e) => setLoc({ ...loc, godown: e.target.value })} />
            <input className="input" placeholder="Rack" value={loc.rack} onChange={(e) => setLoc({ ...loc, rack: e.target.value })} />
            <input className="input" placeholder="Shelf" value={loc.shelf} onChange={(e) => setLoc({ ...loc, shelf: e.target.value })} />
            <input className="input" placeholder="Bin" value={loc.bin} onChange={(e) => setLoc({ ...loc, bin: e.target.value })} />
          </div>
          <button className="btn-primary mb-3 w-full" onClick={() => {
            if (loc.godown.trim()) { addLocation(loc); setLoc({ godown: 'Main Godown', rack: '', shelf: '', bin: '' }); }
          }}>Add location</button>
          <div className="space-y-1.5">
            {locations.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
                <span className="text-xs text-ink-600">{l.label}</span>
                <button className="text-ink-400 hover:text-red-500" onClick={() => removeLocation(l.id)}>✕</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Label Print Settings ── */}
      <section className="card mb-6 mt-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Label Print Settings</h3>
            <p className="text-xs text-ink-400">Configure barcode labels for Zebra / ZDesigner printers. Set driver scaling = 100%.</p>
          </div>
          <button className="btn-ghost text-xs" onClick={doPrintTest}>🖨 Print Test Label</button>
        </div>

        {/* Profile selector */}
        <div className="mb-4">
          <Field label="Printer Profile">
            <div className="flex flex-wrap gap-2">
              {labelSettings.profiles.map((p) => (
                <button key={p.id} onClick={() => setActiveProfile(p.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${p.id === labelSettings.activeProfileId ? 'bg-teal-500 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'}`}>
                  {p.name}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_210px]">
          {/* Controls */}
          <div className="space-y-4">
            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Width">
                <div className="flex gap-1">
                  <input type="number" min="10" max="300" className="input" value={profile.widthMm}
                    onChange={(e) => upd({ widthMm: parseFloat(e.target.value) || 50 })} />
                  <select className="input w-16" value={profile.unit} onChange={(e) => upd({ unit: e.target.value as 'mm' | 'in' })}>
                    <option value="mm">mm</option><option value="in">in</option>
                  </select>
                </div>
              </Field>
              <Field label="Height">
                <input type="number" min="10" max="300" className="input" value={profile.heightMm}
                  onChange={(e) => upd({ heightMm: parseFloat(e.target.value) || 30 })} />
              </Field>
              <Field label="Barcode Height (mm)">
                <input type="number" min="4" max="80" className="input" value={profile.barcodeHeightMm}
                  onChange={(e) => upd({ barcodeHeightMm: parseFloat(e.target.value) || 12 })} />
              </Field>
              <Field label="Bar Width Scale">
                <select className="input" value={profile.barcodeWidthScale}
                  onChange={(e) => upd({ barcodeWidthScale: parseFloat(e.target.value) })}>
                  <option value="1">1 — narrow</option>
                  <option value="1.5">1.5</option>
                  <option value="2">2 — normal</option>
                  <option value="2.5">2.5</option>
                  <option value="3">3 — wide</option>
                </select>
              </Field>
            </div>

            {/* Font sizes */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Product Font (pt)">
                <input type="number" min="5" max="24" className="input" value={profile.fontSizePt}
                  onChange={(e) => upd({ fontSizePt: parseInt(e.target.value) || 9 })} />
              </Field>
              <Field label="Variant Font (pt)">
                <input type="number" min="5" max="24" className="input" value={profile.variantFontSizePt}
                  onChange={(e) => upd({ variantFontSizePt: parseInt(e.target.value) || 8 })} />
              </Field>
              <Field label="Barcode Text (pt)">
                <input type="number" min="5" max="20" className="input" value={profile.barcodeFontSizePt}
                  onChange={(e) => upd({ barcodeFontSizePt: parseInt(e.target.value) || 7 })} />
              </Field>
              <Field label="Price Font (pt)">
                <input type="number" min="5" max="20" className="input" value={profile.priceFontSizePt}
                  onChange={(e) => upd({ priceFontSizePt: parseInt(e.target.value) || 8 })} />
              </Field>
            </div>

            {/* Margins & offsets */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Top Margin (mm)">
                <input type="number" min="0" max="30" step="0.5" className="input" value={profile.topMarginMm}
                  onChange={(e) => upd({ topMarginMm: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="Left Margin (mm)">
                <input type="number" min="0" max="30" step="0.5" className="input" value={profile.leftMarginMm}
                  onChange={(e) => upd({ leftMarginMm: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="X Offset (mm)">
                <input type="number" min="-20" max="20" step="0.5" className="input" value={profile.xOffsetMm}
                  onChange={(e) => upd({ xOffsetMm: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="Y Offset (mm)">
                <input type="number" min="-20" max="20" step="0.5" className="input" value={profile.yOffsetMm}
                  onChange={(e) => upd({ yOffsetMm: parseFloat(e.target.value) || 0 })} />
              </Field>
            </div>

            {/* Gap, rotation, copies */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="H Gap (mm)">
                <input type="number" min="0" max="20" step="0.5" className="input" value={profile.hGapMm}
                  onChange={(e) => upd({ hGapMm: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="V Gap (mm)">
                <input type="number" min="0" max="20" step="0.5" className="input" value={profile.vGapMm}
                  onChange={(e) => upd({ vGapMm: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="Rotation">
                <select className="input" value={profile.rotation}
                  onChange={(e) => upd({ rotation: parseInt(e.target.value) as 0|90|180|270 })}>
                  <option value="0">0°</option><option value="90">90°</option>
                  <option value="180">180°</option><option value="270">270°</option>
                </select>
              </Field>
              <Field label="Default Copies">
                <input type="number" min="1" max="100" className="input" value={profile.copiesDefault}
                  onChange={(e) => upd({ copiesDefault: parseInt(e.target.value) || 1 })} />
              </Field>
            </div>

            {/* Visibility toggles */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Show on label</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {([
                  { key: 'showProductName', label: 'Product Name' },
                  { key: 'showVariant',     label: 'Variant / Color' },
                  { key: 'showBarcode',     label: 'Barcode (Code 128)' },
                  { key: 'showBarcodeText', label: 'Barcode Number' },
                  { key: 'showQtyUom',      label: 'Qty / UOM' },
                  { key: 'showBorder',      label: 'Border' },
                  { key: 'showPrice',       label: showCosts ? 'Price' : 'Price (cost roles only)' },
                ] as const).map(({ key, label }) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
                    <input type="checkbox" className="accent-teal-500" checked={profile[key]}
                      onChange={(e) => upd({ [key]: e.target.checked })} />
                    <span className="text-xs font-medium text-ink-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Live Preview</div>
            <div className="rounded-lg border-2 border-dashed border-ink-200 bg-white p-1">
              <iframe
                key={previewHtml.length /* force remount when html changes */}
                srcDoc={previewHtml}
                title="Label preview"
                style={{ width: '100%', height: 200, border: 'none', borderRadius: 4 }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
            <p className="mt-1 text-[10px] text-ink-400">
              {profile.widthMm}×{profile.heightMm}{profile.unit} · Code 128 · {profile.name}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
