import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Bell, Search, ChevronDown, LogOut, Settings, User, Shield } from "lucide-react";
import { logout, getCurrentUser } from "../../lib/keycloak";
import { notificationsApi, type AppNotification } from "../../lib/notifications";
import { NotificationsPanel } from "./NotificationsPanel";

// Intervalle de rafraîchissement des notifications -- pas de WebSocket/SSE
// dans cette app (voir le polling déjà utilisé partout ailleurs, ex.
// pollCircular côté veille réglementaire) : un simple polling suffit à ce
// volume, et évite d'ajouter une dépendance temps-réel pour une seule
// fonctionnalité.
const NOTIFICATIONS_POLL_MS = 30_000;

export function AdminTopbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const initials = user?.name ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : 'AD';
  const unreadCount = notifications.filter(n => !n.read).length;
  // AdminTopbar est monté à la fois sous /admin (rôle `admin`, back-office
  // réduit) et /super-admin (rôle `super_admin`) -- une notification
  // "nouvelle version publiée" doit amener l'utilisateur sur le détail
  // dans SON espace, pas systématiquement celui du super-admin.
  const basePath = location.pathname.startsWith("/admin") ? "/admin" : "/super-admin";
  const openCircular = (circularId: number) => {
    setNotifOpen(false);
    navigate(`${basePath}/versions/${circularId}`);
  };

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    function load() {
      notificationsApi.list().then(items => { if (!cancelled) setNotifications(items); }).catch(() => {
        // Silencieux : un échec de chargement des notifications ne doit
        // jamais perturber le reste du back-office (bandeau, navigation) --
        // le prochain sondage (30s) réessaiera de lui-même.
      });
    }
    load();
    const interval = setInterval(load, NOTIFICATIONS_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <header style={{
      backgroundColor: "#fff",
      borderBottom: "1px solid rgba(0,0,0,0.08)",
      height: 60,
      minHeight: 60,
      display: "flex",
      alignItems: "center",
      paddingLeft: 28,
      paddingRight: 24,
      gap: 12,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>
        Bonjour, <span style={{ color: "#1A1A1A", fontWeight: 800 }}>{user?.name || 'Admin'}</span> 👋
      </div>

      <div style={{ flex: 1 }} />

      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        backgroundColor: "#F7F7F7",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 10, padding: "0 14px",
        height: 38, width: 220,
      }}>
        <Search size={14} style={{ color: "#9B9B9B", flexShrink: 0 }} />
        <input
          placeholder="Recherche rapide..."
          style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#1A1A1A", width: "100%" }}
        />
      </div>

      {/* Notifications */}
      <div style={{ position: "relative" }} ref={notifRef}>
        <button
          onClick={() => setNotifOpen(v => !v)}
          style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: "#F7F7F7",
            border: "1px solid rgba(0,0,0,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#6B6B6B", position: "relative", flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#EFEFEF"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F7F7F7"}
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: 8, right: 8,
              width: 7, height: 7, borderRadius: "50%",
              backgroundColor: "#FFE600",
              border: "1.5px solid #fff",
            }} />
          )}
        </button>

        {notifOpen && (
          <NotificationsPanel
            items={notifications}
            setItems={setNotifications}
            onClose={() => setNotifOpen(false)}
            onNavigateToCircular={openCircular}
          />
        )}
      </div>

      {/* User dropdown */}
      <div style={{ position: "relative" }} ref={menuRef}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "4px 6px",
            border: "none", background: "none",
            borderRadius: 8, cursor: "pointer",
          }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            backgroundColor: "#1A1A1A",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800, color: "#FFE600",
            flexShrink: 0, letterSpacing: "0.02em",
          }}>
            {initials}
          </div>

          <ChevronDown
            size={14}
            style={{
              color: "#9B9B9B",
              transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              marginLeft: 2,
            }}
          />
        </button>

        {menuOpen && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 200,
            backgroundColor: "#fff",
            border: "1px solid rgba(0,0,0,0.09)",
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
            minWidth: 220,
            overflow: "hidden",
          }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: "50%",
                backgroundColor: "#1A1A1A",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: "#FFE600", flexShrink: 0,
              }}>
                {initials}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{user?.name || 'Admin'}</div>
                <div style={{ fontSize: 11, color: "#9B9B9B" }}>{user?.email || ''}</div>
              </div>
            </div>

            <div style={{ padding: "6px 0" }}>
              {[
                { icon: User,    label: "Mon profil" },
                { icon: Shield,  label: "Sécurité & accès" },
                { icon: Settings, label: "Paramètres", action: () => navigate('/super-admin/settings') },
              ].map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  onClick={() => { setMenuOpen(false); action?.(); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 16px", border: "none", background: "none",
                    cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#1A1A1A",
                    textAlign: "left",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F7F7F7"}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"}
                >
                  <Icon size={14} style={{ color: "#6B6B6B" }} />
                  {label}
                </button>
              ))}
            </div>

            <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "6px 0" }}>
              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 16px", border: "none", background: "none",
                  cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#CC0000",
                  textAlign: "left",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FFF5F5"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"}
              >
                <LogOut size={14} />
                Se déconnecter
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
