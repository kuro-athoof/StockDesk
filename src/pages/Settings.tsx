import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { PageHeader, Badge } from '../components/ui';

export function Settings() {
  const {
    settings, updateSettings, units, addUnit, removeUnit,
    categories, addCategory, removeCategory, shops, addShop, updateShop,
    locations, addLocation, removeLocation,
  } = useStore();

  const [newUnit, setNewUnit] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newShop, setNewShop] = useState('');
  const [loc, setLoc] = useState({ godown: 'Main Godown', rack: '', shelf: '', bin: '' });

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Inventory rules and reference data" />

      {/* Inventory rules */}
      <section className="card mb-6 p-5">
        <h3 className="mb-4 text-sm font-bold text-ink-900">Inventory rules</h3>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-ink-800">Allow negative stock override</div>
              <div className="text-xs text-ink-400">When off, even managers are blocked from pushing stock below zero.</div>
            </div>
            <input
              type="checkbox"
              className="h-5 w-9 accent-teal-500"
              checked={settings.allowNegativeOverride}
              onChange={(e) => updateSettings({ allowNegativeOverride: e.target.checked })}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Low godown qty highlight</label>
              <input type="number" className="input" value={settings.lowStockThreshold}
                onChange={(e) => updateSettings({ lowStockThreshold: parseInt(e.target.value) || 0 })} />
              <p className="mt-1 text-[11px] text-ink-400">Highlights near-depleted godown lines. Not a refill trigger.</p>
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
                {c}
                <button className="ml-1 text-ink-400 hover:text-red-500" onClick={() => removeCategory(c)}>✕</button>
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
    </div>
  );
}
