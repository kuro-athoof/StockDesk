import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider, useStore } from './context/StoreContext';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Stock } from './pages/Stock';
import { BarcodeLookup } from './pages/BarcodeLookup';
import { Suppliers } from './pages/Suppliers';
import { CountryRates } from './pages/CountryRates';
import { Users } from './pages/Users';
import { Settings } from './pages/Settings';
import { Reports } from './pages/Reports';
import { Notifications } from './pages/Notifications';
import { AuditLogPage } from './pages/AuditLog';
import { ComingNext } from './pages/ComingNext';
import { can, type Capability } from './lib/permissions';

function Guard({ cap, children }: { cap?: Capability; children: React.ReactNode }) {
  const { user } = useStore();
  if (cap && !can(user?.role, cap)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Routed() {
  const { user } = useStore();
  if (!user) return <Login />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/barcode" element={<BarcodeLookup />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/country-rates" element={<CountryRates />} />
        <Route path="/users" element={<Guard cap="manage_users"><Users /></Guard>} />
        <Route path="/settings" element={<Guard cap="manage_settings"><Settings /></Guard>} />
        <Route path="/reports" element={<Guard cap="view_reports"><Reports /></Guard>} />
        <Route path="/audit" element={<Guard cap="view_reports"><AuditLogPage /></Guard>} />
        <Route path="/notifications" element={<Notifications />} />

        {/* Genuine Slice 2/3 movement features — still placeholders */}
        <Route path="/receiving" element={<Guard cap="receive_stock">
          <ComingNext title="Receiving" slice="Slice 2" items={[
            'Receiving header: shop, supplier, country, invoice', 'CSV import + sample CSV',
            'Line items with barcode, qty, cost, location', 'Increases stock via the engine, writes audit',
          ]} /></Guard>} />
        <Route path="/transfers" element={<Guard cap="transfer_stock">
          <ComingNext title="Transfers" slice="Slice 2" items={[
            'Internal Movement (location only)', 'Ownership Transfer (owner change, manager approval)',
            'Draft to Sent to Received status', 'PDF / Excel export', 'Warehouse quick-transfer mode',
          ]} /></Guard>} />
        <Route path="/stock-count" element={<Guard cap="perform_count">
          <ComingNext title="Stock Count" slice="Slice 3" items={[
            'Snapshot expected at count start', 'Scan + enter actual', 'Expected vs actual variance',
            'Differences require approval', 'Variance reports',
          ]} /></Guard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </StoreProvider>
  );
}
