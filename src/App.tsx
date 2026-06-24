import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider, useStore } from './context/StoreContext';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Stock } from './pages/Stock';
import { UniversalSearch } from './pages/UniversalSearch';
import { Reports } from './pages/Reports';
import { Receiving } from './pages/Receiving';
import { Transfers } from './pages/Transfers';
import { WarehouseMode } from './pages/WarehouseMode';
import { Damaged } from './pages/Damaged';
import { StockCount } from './pages/StockCount';
import { Administration } from './pages/Administration';
import { can, type Capability } from './lib/permissions';
import { fatalConfigError, initError } from './lib/firebase';

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
        <Route path="/search" element={<UniversalSearch />} />

        {/* Operations */}
        <Route path="/receiving" element={<Guard cap="receive_stock"><Receiving /></Guard>} />
        <Route path="/transfers" element={<Guard cap="transfer_stock"><Transfers /></Guard>} />
        <Route path="/warehouse" element={<Guard cap="transfer_stock"><WarehouseMode /></Guard>} />
        <Route path="/damaged" element={<Guard cap="transfer_stock"><Damaged /></Guard>} />
        <Route path="/stock-count" element={<Guard cap="perform_count"><StockCount /></Guard>} />

        {/* Inventory */}
        <Route path="/products" element={<Products />} />
        <Route path="/stock" element={<Stock />} />

        {/* Reports */}
        <Route path="/reports" element={<Guard cap="view_reports"><Reports /></Guard>} />

        {/* Admin (consolidated) */}
        <Route path="/admin" element={<Guard cap="view_reports"><Administration /></Guard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  // P0.6 + P3 — fail closed in production.
  // fatalConfigError: env vars missing/invalid (caught at module load).
  // initError:        config looked valid but Firebase.initializeApp() threw at runtime.
  // Both leave auth=null and db=null; without this gate the app would hang indefinitely.
  const blockingError = fatalConfigError ?? (import.meta.env.PROD ? initError : null);
  if (blockingError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0f172a' }}>
        <div style={{ maxWidth: 480, background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Setup error</h1>
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{blockingError}</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
            StockDesk will not start in demo mode in production. Contact your administrator.
          </p>
        </div>
      </div>
    );
  }
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </StoreProvider>
  );
}
