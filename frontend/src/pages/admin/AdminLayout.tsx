import { Outlet, useNavigation } from 'react-router-dom';
import { BarChart3, BookOpen, ClipboardList, GitBranch, LayoutDashboard, Layers, Settings, Users } from 'lucide-react';
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
 *
 * "Catalogue des recommandations", "Gestion du framework" et "Référentiel
 * de scoring" réutilisent la même icône que leur entrée super admin --
 * mêmes pages (`AdminRecommendations.tsx` / `AdminDimensions.tsx` /
 * `AdminScoring.tsx`), en lecture seule ici (voir chacune leur
 * `canEdit`/`readOnly` calculé via `isSuperAdmin()`).
 */
const navItems: NavItem[] = [
  { path: "/admin",               label: "Tableau de bord",             icon: LayoutDashboard },
  { path: "/admin/users",         label: "Gestion des utilisateurs",    icon: Users },
  { path: "/admin/evaluations",   label: "Évaluations",                 icon: ClipboardList },
  { path: "/admin/recommendations", label: "Catalogue des recommandations", icon: BookOpen },
  { path: "/admin/dimensions",    label: "Gestion du framework",        icon: Layers },
  { path: "/admin/scoring",       label: "Référentiel de scoring",      icon: BarChart3 },
  { path: "/admin/versions",      label: "Versions du questionnaire",   icon: GitBranch },
  { path: "/admin/settings",      label: "Paramètres",                  icon: Settings },
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
