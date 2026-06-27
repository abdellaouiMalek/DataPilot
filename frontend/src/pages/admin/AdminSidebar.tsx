import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  Layers,
  BarChart3,
  GitBranch,
  History,
  Settings,
  ChevronRight,
  Database,
} from "lucide-react";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const navItems: NavItem[] = [
  { path: "/admin",            label: "Tableau de bord Admin",    icon: LayoutDashboard },
  { path: "/admin/dimensions", label: "Gestion du framework",     icon: Layers },
  { path: "/admin/scoring",    label: "Référentiel de scoring",   icon: BarChart3 },
  { path: "/admin/users",      label: "Gestion des utilisateurs", icon: Users },
  { path: "/admin/banks",      label: "Gestion des banques",      icon: Building2 },
  { path: "/admin/versions",   label: "Versions du questionnaire",icon: GitBranch },
  { path: "/admin/logs",       label: "Historique & logs",        icon: History },
  { path: "/admin/settings",   label: "Paramètres",               icon: Settings },
];

export function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      style={{ backgroundColor: "var(--ey-black)", width: 260, minWidth: 260 }}
      className="h-screen flex flex-col overflow-hidden"
    >
      {/* Logo */}
      <div
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        className="flex items-center gap-3 px-6 py-5"
      >
        <div
          style={{ width: 36, height: 36, backgroundColor: "var(--ey-yellow)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Database size={18} style={{ color: "var(--ey-black)" }} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "white", letterSpacing: "0.02em" }}>
            EY DataMaturity
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Back Office Admin
          </div>
        </div>
      </div>

      {/* Nav section label */}
      <div style={{ padding: "20px 24px 8px", color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Navigation
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4" style={{ scrollbarWidth: "none" }}>
        {navItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-left transition-all duration-150 mb-0.5 group"
              style={{
                backgroundColor: active ? "var(--ey-yellow)" : "transparent",
                color: active ? "var(--ey-black)" : "rgba(255,255,255,0.65)",
                borderRadius: 4,
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLButtonElement).style.color = "white";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.65)";
                }
              }}
            >
              <Icon size={16} />
              <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, flex: 1, letterSpacing: "0.01em" }}>
                {item.label}
              </span>
              {active && <ChevronRight size={14} style={{ opacity: 0.6 }} />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "16px 24px" }}>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 w-full text-left"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: "50%",
              backgroundColor: "var(--ey-yellow)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "var(--ey-black)"
            }}
          >
            AD
          </div>
          <div>
            <div style={{ color: "white", fontSize: 12, fontWeight: 500 }}>Admin EY</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Retour au site</div>
          </div>
        </button>
      </div>
    </aside>
  );
}
