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
import { StockCount } from './pages/StockCount';
import { Administration } from './pages/Administration';
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
        <Route path="/search" element={<UniversalSearch />} />

        {/* Operations */}
        <Route path="/receiving" element={<Guard cap="receive_stock"><Receiving /></Guard>} />
        <Route path="/transfers" element={<Guard cap="transfer_stock"><Transfers /></Guard>} />
        <Route path="/warehouse" element={<Guard cap="transfer_stock"><WarehouseMode /></Guard>} />
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
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </StoreProvider>
  );
}
