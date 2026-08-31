import { Outlet, useNavigation } from 'react-router-dom';
import { LayoutDashboard, Settings, Users } from 'lucide-react';
import { AdminSidebar } from '../superAdmin/AdminSidebar';
import type { NavItem } from '../superAdmin/AdminSidebar';
import { AdminTopbar } from '../superAdmin/AdminTopbar';
import { AdminLoader } from '../../components/AdminLoader';

/**
 * Espace admin : même châssis que le back-office super admin, mais réduit
 * aux sections autorisées. La barre latérale est partagée
 * (`superAdmin/AdminSidebar`) et paramétrée par `items`, de sorte qu'un
 * changement de style profite aux deux espaces. "Versions du
 * questionnaire" reprend exactement le même path/label/icône que dans
 * `AdminSidebar`'s `navItems` par défaut (super admin) -- même entrée,
 * juste préfixée `/admin`.
 */
const navItems: NavItem[] = [
  { path: "/admin",          label: "Tableau de bord",          icon: LayoutDashboard },
  { path: "/admin/users",    label: "Gestion des utilisateurs", icon: Users },
  { path: "/admin/settings", label: "Paramètres",               icon: Settings },
];

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
      <AdminSidebar
        items={navItems}
        rootPath="/admin"
        subtitle="Back Office"
        footerLabel="Admin"
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* `scope` recadre la barre sur cet espace : ses liens de compte
            pointaient vers /super-admin/settings, où ce rôle est refusé. */}
        <AdminTopbar scope="admin" />
        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {loadingRoute ? <AdminLoader /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}
