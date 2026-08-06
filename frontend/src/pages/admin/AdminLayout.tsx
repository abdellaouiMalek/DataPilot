import { Outlet } from 'react-router-dom';
import { LayoutDashboard, Users } from 'lucide-react';
import { AdminSidebar } from '../superAdmin/AdminSidebar';
import type { NavItem } from '../superAdmin/AdminSidebar';
import { AdminTopbar } from '../superAdmin/AdminTopbar';

/**
 * Espace admin : même châssis que le back-office super admin, mais réduit
 * aux deux seules sections autorisées. La barre latérale est partagée
 * (`superAdmin/AdminSidebar`) et paramétrée par `items`, de sorte qu'un
 * changement de style profite aux deux espaces.
 */
const navItems: NavItem[] = [
  { path: "/admin",       label: "Tableau de bord",          icon: LayoutDashboard },
  { path: "/admin/users", label: "Gestion des utilisateurs", icon: Users },
];

export function AdminLayout() {
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
        <AdminTopbar />
        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
