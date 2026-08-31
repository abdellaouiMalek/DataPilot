/**
 * Barre supérieure du back-office.
 *
 * Deux fonctions réelles, en plus du menu compte :
 *
 * — la **recherche rapide** interroge `/api/super-admin/search`, qui balaie
 *   banques, comptes, dimensions, sous-dimensions, questions et versions.
 *   Ouvrir un résultat ne se contente pas d'aller sur la page : on lui passe
 *   `state.q`, que la page recopie dans son propre filtre, de sorte que la
 *   ligne cherchée est à l'écran à l'arrivée ;
 *
 * — la **cloche** liste ce qui appelle une action : les anomalies de
 *   configuration (les mêmes contrôles que la carte « Alertes » du tableau de
 *   bord, calculés par `app/services/admin_alerts.py`) et les actions
 *   administratives récemment refusées, sinon noyées dans le journal.
 *
 * Le lu/non-lu n'est pas persisté côté serveur : c'est une préférence par
 * personne et par navigateur, gardée en localStorage sur la clé stable de
 * chaque notification (voir `lib/adminTopbar.ts`). La pastille ne s'allume
 * donc que s'il reste quelque chose que ce compte n'a pas encore vu.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell, Search, ChevronDown, LogOut, Settings, User,
  Loader2, X, ArrowRight, CheckCircle2, AlertTriangle, AlertCircle,
  Activity, type LucideIcon,
} from "lucide-react";
import { logout, getCurrentUser } from "../../lib/keycloak";
import { routeFor } from "../../lib/adminRoutes";
import {
  getNotifications,
  markSeen,
  quickSearch,
  readSeen,
  unseenCount,
  MIN_SEARCH_LENGTH,
  type AdminNotification,
  type SearchHit,
} from "../../lib/adminTopbar";
import { modCfg } from "../../lib/auditModules";

const SEARCH_DEBOUNCE_MS = 250;

const LEVELS: Record<string, { color: string; bg: string; Icon: LucideIcon }> = {
  critical: { color: "#C62828", bg: "#FFEBEE", Icon: AlertTriangle },
  warning:  { color: "#E65100", bg: "#FFF8E1", Icon: AlertCircle   },
  info:     { color: "#1565C0", bg: "#E3F2FD", Icon: AlertCircle   },
};

const FALLBACK_MODULE = { color: "#6B6B6B", bg: "#F5F5F5", Icon: Activity };

/** "14:32" aujourd'hui, "12/06" au-delà. Les états de configuration n'ont pas de date. */
function whenLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/**
 * @param scope Espace qui monte la barre. `"admin"` est l'espace restreint
 * (tableau de bord + utilisateurs + paramètres) : sa recherche et sa cloche
 * sont masquées parce qu'elles interrogent `/api/super-admin/*`, que
 * `require_super_admin` refuse à un `admin` -- elles renvoyaient donc 403 en
 * silence -- et parce qu'elles balayent des sections (banques, dimensions,
 * versions) auxquelles ce rôle n'a de toute façon pas accès.
 */
export function AdminTopbar({ scope = "super-admin" }: { scope?: "super-admin" | "admin" } = {}) {
  const settingsPath = scope === "admin" ? "/admin/settings" : "/super-admin/settings";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = getCurrentUser();
  const initials = user?.name
    ? user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "AD";
  // Les marqueurs « vu » sont rattachés au compte : deux admins sur le même
  // poste ne doivent pas éteindre la pastille l'un de l'autre.
  const seenScope = user?.sub || user?.username || "anonymous";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Notifications ──────────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notifAvailable, setNotifAvailable] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(seenScope));
  const notifRef = useRef<HTMLDivElement>(null);

  // Rechargé à chaque changement de page : l'admin navigue en permanence dans
  // le back-office, ce qui garde la liste fraîche sans minuteur de fond.
  useEffect(() => {
    // Masquée hors super admin : ne pas l'appeler non plus, sinon chaque
    // navigation d'un `admin` déclenche un 403 inutile.
    if (scope !== "super-admin") return;
    let cancelled = false;
    getNotifications()
      .then(payload => {
        if (cancelled) return;
        setNotifications(payload.items);
        setNotifAvailable(payload.users_available);
      })
      .catch(() => { if (!cancelled) setNotifications([]); });
    return () => { cancelled = true; };
  }, [pathname, scope]);

  const unread = unseenCount(notifications, seen);

  const openNotifications = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    setMenuOpen(false);
    if (next && notifications.length) {
      // On ne conserve que les clés encore vivantes : sinon la liste des
      // « vues » grossirait indéfiniment avec des anomalies déjà corrigées.
      const keys = notifications.map(n => n.key);
      markSeen(seenScope, keys);
      setSeen(new Set(keys));
    }
  };

  const openTarget = (target: string) => {
    setNotifOpen(false);
    navigate(routeFor(target));
  };

  // ── Recherche rapide ───────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_SEARCH_LENGTH;

  useEffect(() => {
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      quickSearch(trimmed)
        .then(payload => {
          // La requête peut revenir après une frappe plus récente : on ne
          // garde que celle qui correspond encore à ce qui est saisi.
          if (cancelled) return;
          setHits(payload.hits);
          setHighlight(0);
        })
        .catch(() => { if (!cancelled) setHits([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [trimmed]);

  const openHit = useCallback((hit: SearchHit) => {
    setSearchOpen(false);
    setQuery("");
    setHits([]);
    inputRef.current?.blur();
    // `q` est recopié par la page d'arrivée dans son propre champ de filtre.
    navigate(routeFor(hit.target), { state: { q: hit.seed } });
  }, [navigate]);

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSearchOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!hits.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight(i => (i + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(i => (i - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[highlight] ?? hits[0];
      if (hit) openHit(hit);
    }
  };

  /** Indices où commence un nouveau groupe, pour intercaler les intitulés. */
  const groupStarts = useMemo(() => {
    const starts = new Set<number>();
    hits.forEach((hit, i) => {
      if (i === 0 || hits[i - 1].label !== hit.label) starts.add(i);
    });
    return starts;
  }, [hits]);

  // ── Fermeture au clic extérieur, pour les trois panneaux ───────────────────
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (searchRef.current && !searchRef.current.contains(target)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const panel: React.CSSProperties = {
    position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 200,
    backgroundColor: "#fff",
    border: "1px solid rgba(0,0,0,0.09)",
    borderRadius: 10,
    boxShadow: "0 12px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
    overflow: "hidden",
  };

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

      {/* ── Recherche rapide ── */}
      {scope === "super-admin" && (
      <div style={{ position: "relative", width: 260 }} ref={searchRef}>
        <div className="search-field" style={{ width: "100%" }}>
          <Search className="search-icon" size={16} />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Rechercher une banque, un compte…"
            name="datapilot-quick-search" autoComplete="off" data-search=""
            style={{ fontSize: 13, paddingRight: query ? 30 : undefined }}
            value={query}
            onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={onSearchKeyDown}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setHits([]); inputRef.current?.focus(); }}
              title="Effacer"
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                border: "none", background: "none", cursor: "pointer", color: "#9B9B9B",
                display: "flex", alignItems: "center", padding: 2,
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {searchOpen && trimmed.length > 0 && (
          <div style={{ ...panel, width: 400, maxHeight: 420, overflowY: "auto" }}>
            {tooShort ? (
              <div style={{ padding: "16px 18px", fontSize: 12, color: "#9B9B9B" }}>
                Saisissez au moins {MIN_SEARCH_LENGTH} caractères.
              </div>
            ) : searching && !hits.length ? (
              <div style={{ padding: "16px 18px", fontSize: 12, color: "#9B9B9B", display: "flex", alignItems: "center", gap: 8 }}>
                <Loader2 size={13} className="animate-spin" /> Recherche…
              </div>
            ) : !hits.length ? (
              <div style={{ padding: "16px 18px", fontSize: 12, color: "#9B9B9B" }}>
                Aucun résultat pour « {trimmed} ».
              </div>
            ) : (
              hits.map((hit, i) => {
                const cfg = modCfg[hit.module] ?? FALLBACK_MODULE;
                const Icon = cfg.Icon;
                const active = i === highlight;
                return (
                  <div key={`${hit.kind}-${i}`}>
                    {groupStarts.has(i) && (
                      <div style={{
                        padding: "9px 14px 5px", fontSize: 10, fontWeight: 700,
                        color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.07em",
                        backgroundColor: "#FAFAFA", borderBottom: "1px solid rgba(0,0,0,0.04)",
                      }}>
                        {hit.label}
                      </div>
                    )}
                    <button
                      onClick={() => openHit(hit)}
                      onMouseEnter={() => setHighlight(i)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 14px", border: "none", cursor: "pointer", textAlign: "left",
                        backgroundColor: active ? "#F5F5F5" : "transparent",
                      }}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: 7, backgroundColor: cfg.bg,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <Icon size={12} style={{ color: cfg.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={hit.title}>
                          {hit.title}
                        </div>
                        <div style={{ fontSize: 11, color: "#9B9B9B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {hit.subtitle}
                        </div>
                      </div>
                      <ArrowRight size={12} style={{ color: active ? "#6B6B6B" : "#D0D0D0", flexShrink: 0 }} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      )}

      {/* ── Notifications ── */}
      {scope === "super-admin" && (
      <div style={{ position: "relative" }} ref={notifRef}>
        <button
          onClick={openNotifications}
          title={unread ? `${unread} notification${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
          style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: notifOpen ? "#EFEFEF" : "#F7F7F7",
            border: "1px solid rgba(0,0,0,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#6B6B6B", position: "relative", flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#EFEFEF"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = notifOpen ? "#EFEFEF" : "#F7F7F7"}
        >
          <Bell size={16} />
          {/* La pastille ne s'allume que s'il reste du non-vu — jamais en dur. */}
          {unread > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 17, height: 17, padding: "0 4px", borderRadius: 9,
              backgroundColor: "#FFE600", border: "2px solid #fff",
              fontSize: 9.5, fontWeight: 800, color: "#1A1A1A",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        {notifOpen && (
          <div style={{ ...panel, width: 380, maxHeight: 440, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Notifications</span>
              <span style={{ fontSize: 11, color: "#9B9B9B" }}>
                {notifications.length || "Aucune"}
              </span>
            </div>

            {!notifAvailable && (
              <div style={{ padding: "9px 16px", backgroundColor: "#FFF8E1", color: "#8A5300", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                <AlertCircle size={12} />
                Annuaire injoignable : contrôles sur les comptes ignorés.
              </div>
            )}

            <div style={{ overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div style={{ padding: "26px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
                  <CheckCircle2 size={22} style={{ color: "#2E7D32" }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#2E7D32" }}>Rien à signaler</div>
                  <div style={{ fontSize: 11, color: "#9B9B9B", textAlign: "center" }}>
                    Aucune anomalie de configuration ni action refusée.
                  </div>
                </div>
              ) : (
                notifications.map((item, i) => {
                  const level = LEVELS[item.level] ?? LEVELS.info;
                  const mod = modCfg[item.module] ?? FALLBACK_MODULE;
                  const Icon = mod.Icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => openTarget(item.target)}
                      style={{
                        width: "100%", display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "11px 16px", border: "none", background: "none",
                        cursor: "pointer", textAlign: "left",
                        borderBottom: i < notifications.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
                        borderLeft: `3px solid ${level.color}`,
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FAFAFA"}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: 7, backgroundColor: mod.bg,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
                      }}>
                        <Icon size={12} style={{ color: mod.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, color: "#1A1A1A", lineHeight: 1.4 }}>
                          {item.text}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: level.color, backgroundColor: level.bg, borderRadius: 4, padding: "1px 6px" }}>
                            {item.action}
                          </span>
                          <span style={{ fontSize: 10.5, color: "#9B9B9B" }}>{item.module}</span>
                          {item.created_at && (
                            <span style={{ fontSize: 10.5, color: "#C0C0C0", marginLeft: "auto" }}>
                              {whenLabel(item.created_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      )}

      {/* ── Menu compte ── */}
      <div style={{ position: "relative" }} ref={menuRef}>
        <button
          onClick={() => { setMenuOpen(v => !v); setNotifOpen(false); }}
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
          <div style={{ ...panel, minWidth: 220 }}>
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
              {/* Chaque entrée mène quelque part : pas de ligne décorative. */}
              {[
                { icon: User,     label: "Mon compte", action: () => navigate(`${settingsPath}?tab=profile`) },
                { icon: Settings, label: "Paramètres", action: () => navigate(settingsPath) },
              ].map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  onClick={() => { setMenuOpen(false); action(); }}
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
