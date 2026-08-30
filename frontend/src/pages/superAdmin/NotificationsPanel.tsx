import { AlertTriangle, Info, Check, CheckCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  notificationsApi, formatNotificationTime,
  type AppNotification,
} from "../../lib/notifications";

// ── Notifications Panel ───────────────────────────────────────────────────────

export function NotificationsPanel({ items, setItems, onClose, onNavigateToCircular }: {
  items: AppNotification[];
  setItems: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  onClose: () => void;
  /** Optionnel : une notification "nouvelle version publiée" porte un
   * `circularId` (voir lib/notifications.ts) -- appelé en plus de
   * markRead quand il est présent, pour amener l'utilisateur sur le
   * détail de la version. Absent => clic reste juste "marquer lu",
   * comme dans le design d'origine. */
  onNavigateToCircular?: (circularId: number) => void;
}) {
  const unread = items.filter(n => !n.read).length;

  const markAllRead = () => {
    const prev = items;
    setItems(p => p.map(n => ({ ...n, read: true })));
    notificationsApi.markAllRead().catch(e => {
      setItems(prev);
      toast.error(e instanceof Error ? e.message : "Échec de la mise à jour");
    });
  };

  const markRead = (id: number) => {
    const target = items.find(n => n.id === id);
    if (!target || target.read) return; // déjà lue -- pas d'appel inutile
    const prev = items;
    setItems(p => p.map(n => n.id === id ? { ...n, read: true } : n));
    notificationsApi.markRead(id).catch(e => {
      setItems(prev);
      toast.error(e instanceof Error ? e.message : "Échec de la mise à jour");
    });
  };

  const iconMap: Record<string, { icon: any; color: string; bg: string }> = {
    warning: { icon: AlertTriangle, color: "#E65100", bg: "#FFF3E0" },
    info:    { icon: Info,          color: "#0277BD", bg: "#E3F2FD" },
    success: { icon: Check,         color: "#2E7D32", bg: "#E8F5E9" },
  };

  return (
    <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 300, backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.09)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.06)", width: 360, overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>Notifications</span>
          {unread > 0 && (
            <span style={{ backgroundColor: "#FFE600", color: "#1A1A1A", fontSize: 10, fontWeight: 800, borderRadius: 10, padding: "1px 7px" }}>{unread}</span>
          )}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#6B6B6B" }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#1A1A1A"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#6B6B6B"}
          >
            <CheckCheck size={13} /> Tout marquer lu
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {items.length === 0 && (
          <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 12, color: "#9B9B9B" }}>
            Aucune notification pour le moment.
          </div>
        )}
        {items.map((n, i) => {
          const { icon: Icon, color, bg } = iconMap[n.type];
          return (
            <div
              key={n.id}
              onClick={() => {
                markRead(n.id);
                if (n.circularId != null) onNavigateToCircular?.(n.circularId);
              }}
              style={{
                display: "flex", gap: 12, padding: "12px 16px",
                backgroundColor: n.read ? "#fff" : "#FAFAFA",
                borderBottom: i < items.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                cursor: "pointer", transition: "background 0.12s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = "#F5F5F5"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = n.read ? "#fff" : "#FAFAFA"}
            >
              {/* Icon */}
              <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={15} style={{ color }} />
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: n.read ? 400 : 700, color: "#1A1A1A", lineHeight: 1.3 }}>{n.title}</span>
                  {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#FFE600", flexShrink: 0, marginTop: 4 }} />}
                </div>
                <div style={{ fontSize: 12, color: "#6B6B6B", marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5 }}>
                  <Clock size={10} style={{ color: "#B0B0B0" }} />
                  <span style={{ fontSize: 10, color: "#B0B0B0" }}>{formatNotificationTime(n.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer -- no dedicated "all notifications" page exists in the app
          yet, so this stays unwired (matches the design as given rather
          than inventing a destination for it). */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(0,0,0,0.07)", textAlign: "center" }}>
        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#6B6B6B" }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#1A1A1A"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#6B6B6B"}
        >
          Voir toutes les notifications
        </button>
      </div>
    </div>
  );
}
