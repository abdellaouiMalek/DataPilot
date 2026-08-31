import { Outlet, useNavigation } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { AdminLoader } from '../../components/AdminLoader';

export function AdminLayout() {
  // Le routeur charge la page à la demande ; pendant ce temps le châssis
  // reste peint et seule la zone de contenu attend.
  const loadingRoute = useNavigation().state === 'loading';

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
      backgroundColor: "var(--ey-gray-bg)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <AdminSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <AdminTopbar />
        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {loadingRoute ? <AdminLoader /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}
