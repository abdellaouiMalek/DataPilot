import { useEffect, useState } from "react";
import {
  Search, Plus, Edit2, Trash2, UserCheck, UserX,
  Key, ChevronDown, X, Download, Upload,
  Users, UserCog, ShieldCheck, Clock, MoreHorizontal,
  TrendingUp, TrendingDown, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listUsers, countUsers, createUser, updateUser, setUserEnabled, setUserArchived, resetUserPassword,
} from "@/lib/adminUsers";
import type { AdminUser, BusinessRole, UserPayload } from "@/lib/adminUsers";
import { ApiError } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<BusinessRole, string> = {
  admin:      "Admin EY",
  consultant: "Consultant EY",
  repondant:  "Répondant Banque",
  validateur: "Validateur Banque",
};

const LABEL_TO_ROLE: Record<string, BusinessRole> = Object.fromEntries(
  Object.entries(ROLE_LABELS).map(([role, label]) => [label, role as BusinessRole]),
);

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  enabled: boolean;
  organization: string;
  status: string;
  createdAt: string;
  lastLogin: string;
}

// Keycloak → UI row. lastLogin is "—" until the user's first login after
// event storage was enabled (events only accumulate going forward).
function toUser(u: AdminUser): User {
  return {
    id: u.id,
    firstName: u.first_name || u.username || "—",
    lastName: u.last_name || "",
    email: u.email || "—",
    role: u.role ? ROLE_LABELS[u.role] : "—",
    enabled: u.enabled,
    organization: u.organization || "—",
    status: u.status,
    createdAt: u.created_at
      ? new Date(u.created_at).toLocaleDateString("fr-FR")
      : "—",
    lastLogin: u.last_login
      ? new Date(u.last_login).toLocaleDateString("fr-FR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        })
      : "—",
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Une erreur est survenue. Vérifiez que l'API est démarrée.";
}

const roles   = ["Tous les rôles",   "Admin EY", "Consultant EY", "Répondant Banque", "Validateur Banque"];
const statuses = ["Tous les statuts", "Actif", "En attente", "Désactivé", "Archivé"];

// ── KPI cards ─────────────────────────────────────────────────────────────────

interface KpiCardData {
  label: string;
  value: string;
  sub: string;
  trend: "up" | "down" | "neutral";
  icon: typeof Users;
  detail: string;
}

interface KpiStats {
  total: number;
  active: number;
  admins: number;
  pending: number;
  createdThisWeek: number;   // accounts created in the last 7 days
  connected30: number;       // users with a login event in the last 30 days
  oldestPendingDays: number; // age (days) of the oldest "En attente" account, -1 if none
}

// All values and chips are computed from live data (created_at + login events);
// only "% vs period" style trends are impossible without stored count history.
function buildKpiCards(s: KpiStats): KpiCardData[] {
  return [
    {
      label:   "Total utilisateurs",
      value:   String(s.total),
      sub:     `+${s.createdThisWeek} cette semaine`,
      trend:   s.createdThisWeek > 0 ? "up" : "neutral",
      icon:    Users,
      detail:  "Sur toutes les organisations",
    },
    {
      label:   "Utilisateurs actifs",
      value:   String(s.active),
      sub:     `${s.connected30} connecté${s.connected30 !== 1 ? "s" : ""} (30 j)`,
      trend:   s.connected30 > 0 ? "up" : "neutral",
      icon:    UserCheck,
      detail:  "Comptes au statut Actif",
    },
    {
      label:   "Admins EY",
      value:   String(s.admins),
      sub:     "Accès complet",
      trend:   "neutral",
      icon:    ShieldCheck,
      detail:  "Admin EY · Permissions totales",
    },
    {
      label:   "En attente d'activation",
      value:   String(s.pending),
      sub:     s.pending === 0
        ? "Aucun en attente"
        : s.oldestPendingDays <= 0
        ? "depuis aujourd'hui"
        : `le plus ancien : ${s.oldestPendingDays} j`,
      trend:   s.pending > 0 && s.oldestPendingDays > 7 ? "down" : "neutral",
      detail:  "Comptes créés non encore activés",
      icon:    Clock,
    },
  ];
}

function KpiCard({ card }: { card: KpiCardData }) {
  const Icon = card.icon;
  const trendColor = card.trend === "up" ? "#2E7D32" : card.trend === "down" ? "#CC0000" : "#6B6B6B";
  const trendBg    = card.trend === "up" ? "#E8F5E9"  : card.trend === "down" ? "#FFEBEE"  : "#F5F5F5";
  return (
    <div
      style={{
        flex: 1, minWidth: 0,
        backgroundColor: "#fff",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
        padding: "18px 18px 14px",
        borderTop: "3px solid #FFE600",
        position: "relative", overflow: "hidden",
        transition: "box-shadow 0.15s, transform 0.12s",
        cursor: "default",
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; el.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 1px 6px rgba(0,0,0,0.05)"; el.style.transform = "translateY(0)"; }}
    >
      <div style={{ position: "absolute", top: 14, right: 14, opacity: 0.06 }}>
        <Icon size={52} style={{ color: "#1A1A1A" }} />
      </div>
      <div style={{ fontSize: 11, color: "#9B9B9B", fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{card.label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1 }}>{card.value}</div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 10, backgroundColor: trendBg, color: trendColor, borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>
        {card.trend === "up"   && <TrendingUp   size={10} />}
        {card.trend === "down" && <TrendingDown size={10} />}
        {card.sub}
      </span>
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    "Actif":      { bg: "#E8F5E9", color: "#2E7D32" },
    "En attente": { bg: "#FFF8E1", color: "#E65100" },
    "Désactivé":  { bg: "#FFEBEE", color: "#CC0000" },
    "Archivé":    { bg: "#ECEFF1", color: "#455A64" },
  };
  const c = cfg[status] || { bg: "#F5F5F5", color: "#6B6B6B" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      backgroundColor: c.bg, color: c.color,
      borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: c.color }} />
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span style={{ fontSize: 13, color: "#4A4A4A", fontWeight: 400 }}>
      {role}
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface UserModalProps {
  user?: User | null;
  onClose: () => void;
  onSaved: () => void;
}

function UserModal({ user, onClose, onSaved }: UserModalProps) {
  const [formData, setFormData] = useState({
    firstName:    user?.firstName    || "",
    lastName:     user?.lastName     || "",
    email:        user?.email === "—" ? "" : user?.email || "",
    role:         user?.role && user.role !== "—" ? user.role : "Consultant EY",
    organization: user?.organization === "—" ? "" : user?.organization || "",
    status:       user?.status       || "Actif",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()) {
      toast.error("Champs manquants", { description: "Prénom, nom et email sont obligatoires." });
      return;
    }
    const payload: UserPayload = {
      first_name: formData.firstName.trim(),
      last_name: formData.lastName.trim(),
      email: formData.email.trim(),
      role: LABEL_TO_ROLE[formData.role] ?? "consultant",
      organization: formData.organization.trim() || null,
      status: formData.status as UserPayload["status"],
    };
    setSaving(true);
    try {
      if (user) {
        await updateUser(user.id, payload);
        toast.success("Utilisateur mis à jour", { description: payload.email });
      } else {
        await createUser(payload);
        toast.success("Compte créé", {
          description: payload.status === "Archivé"
            ? `${payload.email} a été créé archivé (aucun email envoyé).`
            : `Un mot de passe temporaire a été envoyé à ${payload.email}.`,
        });
      }
      onSaved();
    } catch (err) {
      toast.error(user ? "Échec de la mise à jour" : "Échec de la création", {
        description: errorMessage(err),
      });
      setSaving(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.13)", fontSize: 13,
    outline: "none", boxSizing: "border-box", color: "#1A1A1A",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 10, width: 520, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.16)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>{user ? "Modifier l'utilisateur" : "Créer un utilisateur"}</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>{user ? user.email : "Ajouter un nouveau compte à la plateforme"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Prénom *", key: "firstName", placeholder: "ex. Alexandre" },
              { label: "Nom *",    key: "lastName",  placeholder: "ex. Dupont" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>{label}</label>
                <input value={(formData as any)[key]} onChange={e => setFormData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} autoComplete="off" style={inp} />
              </div>
            ))}
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Email professionnel *</label>
            <input value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="prenom.nom@organisation.com" type="email" name="datapilot-new-user-email" autoComplete="off" style={inp} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Rôle</label>
              <select value={formData.role} onChange={e => setFormData(p => ({ ...p, role: e.target.value }))} style={{ ...inp, appearance: "none", backgroundColor: "#fff", cursor: "pointer" }}>
                {["Admin EY", "Consultant EY", "Répondant Banque", "Validateur Banque"].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Organisation</label>
              <input value={formData.organization} onChange={e => setFormData(p => ({ ...p, organization: e.target.value }))} placeholder="ex. BNP Paribas" autoComplete="off" style={inp} />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 7 }}>Statut du compte</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Actif", "En attente", "Désactivé", "Archivé"].map(s => (
                <button key={s} onClick={() => setFormData(p => ({ ...p, status: s }))} style={{
                  padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: formData.status === s ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.13)",
                  backgroundColor: formData.status === s ? "#1A1A1A" : "#fff",
                  color: formData.status === s ? "#fff" : "#6B6B6B",
                  transition: "all 0.15s",
                }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.13)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Enregistrement…" : user ? "Enregistrer" : "Créer le compte"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function UserManagement() {
  const [search,         setSearch]         = useState("");
  const [roleFilter,     setRoleFilter]     = useState("Tous les rôles");
  const [statusFilter,   setStatusFilter]   = useState("Tous les statuts");
  const [showModal,      setShowModal]      = useState(false);
  const [editingUser,    setEditingUser]    = useState<User | null>(null);
  const [openMenu,       setOpenMenu]       = useState<string | null>(null);
  const [menuPos,        setMenuPos]        = useState<{ top: number; right: number } | null>(null);
  const [focusRole,      setFocusRole]      = useState(false);
  const [focusStatus,    setFocusStatus]    = useState(false);

  const [users,   setUsers]   = useState<User[]>([]);
  // KPI stats are computed at load time (not during render — needs Date.now())
  // from the raw API rows, which carry real timestamps.
  const [kpiStats, setKpiStats] = useState<KpiStats>({
    total: 0, active: 0, admins: 0, pending: 0,
    createdThisWeek: 0, connected30: 0, oldestPendingDays: -1,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const reload = () => {
    setLoading(true);
    setLoadError(false);
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([listUsers({ max: 100 }), countUsers()])
      .then(([list, count]) => {
        if (cancelled) return;
        setUsers(list.map(toUser));

        const DAY = 24 * 3600 * 1000;
        const now = Date.now();
        const pendingAges = list
          .filter(u => u.status === "En attente" && u.created_at)
          .map(u => Math.floor((now - Date.parse(u.created_at as string)) / DAY));
        setKpiStats({
          total: count.count,
          active: list.filter(u => u.status === "Actif").length,
          admins: list.filter(u => u.role === "admin").length,
          pending: list.filter(u => u.status === "En attente").length,
          createdThisWeek: list.filter(
            u => u.created_at && now - Date.parse(u.created_at) < 7 * DAY,
          ).length,
          connected30: list.filter(
            u => u.last_login && now - Date.parse(u.last_login) < 30 * DAY,
          ).length,
          oldestPendingDays: pendingAges.length ? Math.max(...pendingAges) : -1,
        });
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleToggleEnabled = async (user: User) => {
    setOpenMenu(null);
    const enable = !user.enabled;
    try {
      await setUserEnabled(user.id, enable);
      toast.success(enable ? "Compte activé" : "Compte désactivé", { description: user.email });
      reload();
    } catch (err) {
      toast.error("Échec de l'opération", { description: errorMessage(err) });
    }
  };

  const handleArchive = async (user: User, archived: boolean) => {
    setOpenMenu(null);
    try {
      await setUserArchived(user.id, archived);
      toast.success(archived ? "Compte archivé" : "Compte restauré", {
        description: archived
          ? `${user.email} est masqué de la liste (filtre « Archivé »).`
          : `${user.email} est de nouveau actif.`,
      });
      reload();
    } catch (err) {
      toast.error("Échec de l'opération", { description: errorMessage(err) });
    }
  };

  const handleExport = async (rows: User[]) => {
    if (rows.length === 0) {
      toast.error("Rien à exporter", { description: "Aucun utilisateur ne correspond aux filtres." });
      return;
    }
    // Lazy-loaded so exceljs (~1 MB) is only fetched when an export happens.
    const ExcelJS = (await import("exceljs")).default;

    const EY_BLACK = "FF1A1A1A";
    const EY_YELLOW = "FFFFE600";
    const statusColor: Record<string, string> = {
      "Actif": "FF2E7D32", "En attente": "FFE65100", "Désactivé": "FFCC0000", "Archivé": "FF455A64",
    };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Utilisateurs", { views: [{ state: "frozen", ySplit: 3 }] });

    ws.columns = [
      { key: "firstName", width: 16 }, { key: "lastName", width: 16 },
      { key: "email", width: 34 },     { key: "role", width: 19 },
      { key: "organization", width: 26 }, { key: "status", width: 13 },
      { key: "createdAt", width: 13 }, { key: "lastLogin", width: 19 },
    ];

    // Row 1 — title banner
    ws.mergeCells("A1:H1");
    const title = ws.getCell("A1");
    title.value = "Utilisateurs DataPilot";
    title.font = { bold: true, size: 15, color: { argb: EY_YELLOW } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EY_BLACK } };
    title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 30;

    // Row 2 — export context
    ws.mergeCells("A2:H2");
    const sub = ws.getCell("A2");
    sub.value = `Exporté le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} — ${rows.length} utilisateur${rows.length > 1 ? "s" : ""}`;
    sub.font = { size: 10, color: { argb: "FF6B6B6B" } };

    // Row 3 — styled header
    const header = ws.getRow(3);
    header.values = ["Prénom", "Nom", "Email", "Rôle", "Organisation", "Statut", "Créé le", "Dernière connexion"];
    header.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: EY_YELLOW } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EY_BLACK } };
      cell.border = { bottom: { style: "medium", color: { argb: EY_YELLOW } } };
      cell.alignment = { vertical: "middle" };
    });
    header.height = 22;

    // Data rows
    for (const u of rows) {
      const row = ws.addRow([
        u.firstName, u.lastName, u.email, u.role, u.organization, u.status, u.createdAt, u.lastLogin,
      ]);
      const statusCell = row.getCell(6);
      statusCell.font = { bold: true, color: { argb: statusColor[u.status] ?? "FF1A1A1A" } };
      row.eachCell((cell) => {
        cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
      });
    }

    ws.autoFilter = { from: "A3", to: `H${3 + rows.length}` };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `datapilot-utilisateurs-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export Excel", { description: `${rows.length} utilisateur${rows.length > 1 ? "s" : ""} exporté${rows.length > 1 ? "s" : ""}.` });
  };

  const handleResetPassword = async (user: User) => {
    setOpenMenu(null);
    try {
      await resetUserPassword(user.id);
      toast.success("Mot de passe réinitialisé", {
        description: `Un nouveau mot de passe temporaire a été envoyé à ${user.email}.`,
      });
    } catch (err) {
      toast.error("Échec de la réinitialisation", { description: errorMessage(err) });
    }
  };

  const filtered = users.filter(u => {
    const matchSearch = `${u.firstName} ${u.lastName} ${u.email} ${u.organization}`.toLowerCase().includes(search.toLowerCase());
    const matchRole   = roleFilter   === "Tous les rôles"   || u.role   === roleFilter;
    // Archived accounts are hidden from the day-to-day view; they only appear
    // when the admin explicitly selects the "Archivé" filter.
    const matchStatus = statusFilter === "Tous les statuts"
      ? u.status !== "Archivé"
      : u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  // Client-side pagination over the filtered rows. `page` is clamped instead
  // of synced in an effect so filter changes can never leave it out of range.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageNumbers: number[] = [];
  {
    const end = Math.min(totalPages, Math.max(1, currentPage - 2) + 4);
    for (let p = Math.max(1, end - 4); p <= end; p++) pageNumbers.push(p);
  }

  const kpiCards = buildKpiCards(kpiStats);

  const initials = (u: User) =>
    `${u.firstName[0] || ""}${u.lastName[0] || ""}`.toUpperCase() || "?";

  // avatar bg by role
  const avatarBg = (role: string) => {
    if (role === "Admin EY")          return "#1A1A1A";
    if (role === "Consultant EY")     return "#3730A3";
    if (role === "Validateur Banque") return "#9A3412";
    return "#166534";
  };
  const avatarFg = (role: string) => role === "Admin EY" ? "#FFE600" : "#fff";

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>
            Gestion des utilisateurs
          </h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0", fontWeight: 400 }}>
            Gérez les comptes, les rôles et les permissions des utilisateurs de la plateforme
          </p>
        </div>
        <button
          onClick={() => { setEditingUser(null); setShowModal(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700,
            border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            transition: "background 0.18s, box-shadow 0.18s, transform 0.12s",
          }}
          onMouseEnter={e => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.backgroundColor = "#2D2D2D";
            b.style.boxShadow = "0 6px 20px rgba(0,0,0,0.28)";
            b.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={e => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.backgroundColor = "#1A1A1A";
            b.style.boxShadow = "0 4px 14px rgba(0,0,0,0.18)";
            b.style.transform = "translateY(0)";
          }}
        >
          <Plus size={15} /> Créer un utilisateur
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
        {kpiCards.map((k, i) => <KpiCard key={i} card={k} />)}
      </div>

      {/* ── Filters bar ── */}
      <div style={{
        backgroundColor: "#fff",
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 12,
        display: "flex", gap: 10, alignItems: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        {/* Search */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: 9,
          backgroundColor: "#F7F7F7",
          border: "1.5px solid rgba(0,0,0,0.08)",
          borderRadius: 6, padding: "8px 13px",
        }}>
          <Search size={14} style={{ color: "#9B9B9B", flexShrink: 0 }} />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher un utilisateur, email ou organisation..."
            name="datapilot-user-search"
            autoComplete="off"
            data-plain-focus=""
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#1A1A1A", width: "100%" }}
          />
        </div>

        {/* Role filter */}
        <div style={{ position: "relative" }}>
          <select
            value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
            onFocus={() => setFocusRole(true)}
            onBlur={() => setFocusRole(false)}
            style={{
              padding: "8px 30px 8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: `1.5px solid ${focusRole ? "#1A1A1A" : "rgba(0,0,0,0.10)"}`,
              backgroundColor: "#fff",
              color: roleFilter === "Tous les rôles" ? "#9B9B9B" : "#1A1A1A",
              cursor: "pointer", appearance: "none", outline: "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
              boxShadow: focusRole ? "0 0 0 3px rgba(26,26,26,0.08)" : "none",
            }}
          >
            {roles.map(r => <option key={r}>{r}</option>)}
          </select>
          <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9B9B", pointerEvents: "none" }} />
        </div>

        {/* Status filter */}
        <div style={{ position: "relative" }}>
          <select
            value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            onFocus={() => setFocusStatus(true)}
            onBlur={() => setFocusStatus(false)}
            style={{
              padding: "8px 30px 8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: `1.5px solid ${focusStatus ? "#1A1A1A" : "rgba(0,0,0,0.10)"}`,
              backgroundColor: "#fff",
              color: statusFilter === "Tous les statuts" ? "#9B9B9B" : "#1A1A1A",
              cursor: "pointer", appearance: "none", outline: "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
              boxShadow: focusStatus ? "0 0 0 3px rgba(26,26,26,0.08)" : "none",
            }}
          >
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
          <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9B9B", pointerEvents: "none" }} />
        </div>

        {/* Export */}
        <button
          onClick={() => handleExport(filtered)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 6,
            fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)",
            backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A",
          }}
        >
          <Download size={13} /> Exporter
        </button>

      </div>

      {/* ── Table ── */}
      <div style={{
        backgroundColor: "#fff",
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 8, overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAFAFA", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              {["Utilisateur", "Rôle", "Organisation", "Statut", "Créé le", "Dernière connexion", "Actions"].map(h => (
                <th key={h} style={{
                  padding: "10px 16px", textAlign: "left",
                  fontSize: 10, fontWeight: 700, color: "#9B9B9B",
                  letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {paged.map((user, i) => (
              <tr
                key={user.id}
                style={{ borderBottom: i < paged.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", transition: "background 0.1s" }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#FAFAFA"}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "transparent"}
              >
                {/* Utilisateur */}
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%",
                      backgroundColor: avatarBg(user.role),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800, color: avatarFg(user.role), flexShrink: 0,
                      letterSpacing: "0.02em",
                    }}>
                      {initials(user)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{user.firstName} {user.lastName}</div>
                      <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 1 }}>{user.email}</div>
                    </div>
                  </div>
                </td>

                {/* Rôle */}
                <td style={{ padding: "13px 16px" }}><RoleBadge role={user.role} /></td>

                {/* Organisation */}
                <td style={{ padding: "13px 16px", fontSize: 13, color: "#4A4A4A", fontWeight: 400 }}>{user.organization}</td>

                {/* Statut */}
                <td style={{ padding: "13px 16px" }}><StatusBadge status={user.status} /></td>

                {/* Dates */}
                <td style={{ padding: "13px 16px", fontSize: 12, color: "#9B9B9B", whiteSpace: "nowrap" }}>{user.createdAt}</td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: "#9B9B9B", whiteSpace: "nowrap" }}>{user.lastLogin}</td>

                {/* Actions */}
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={() => { setEditingUser(user); setShowModal(true); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "5px 11px", borderRadius: 5, fontSize: 12, fontWeight: 600,
                        border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff",
                        cursor: "pointer", color: "#1A1A1A",
                        transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
                      }}
                      onMouseEnter={e => {
                        const b = e.currentTarget as HTMLButtonElement;
                        b.style.backgroundColor = "#1A1A1A";
                        b.style.color = "#fff";
                        b.style.borderColor = "#1A1A1A";
                        b.style.boxShadow = "0 2px 8px rgba(0,0,0,0.18)";
                      }}
                      onMouseLeave={e => {
                        const b = e.currentTarget as HTMLButtonElement;
                        b.style.backgroundColor = "#fff";
                        b.style.color = "#1A1A1A";
                        b.style.borderColor = "rgba(0,0,0,0.12)";
                        b.style.boxShadow = "none";
                      }}
                    >
                      <Edit2 size={11} /> Modifier
                    </button>

                    {/* ··· menu */}
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={(e) => {
                          if (openMenu === user.id) {
                            setOpenMenu(null);
                            return;
                          }
                          // Fixed positioning (viewport-relative) so the menu can't be
                          // clipped by the table's overflow:hidden; flip upward when
                          // there's not enough room below the button.
                          const r = e.currentTarget.getBoundingClientRect();
                          const menuHeight = user.status === "Archivé" ? 44 : 122;
                          const top =
                            r.bottom + 4 + menuHeight > window.innerHeight - 8
                              ? r.top - menuHeight - 4
                              : r.bottom + 4;
                          setMenuPos({ top, right: window.innerWidth - r.right });
                          setOpenMenu(user.id);
                        }}
                        style={{
                          width: 28, height: 28, borderRadius: 5,
                          border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6B6B",
                          transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
                        }}
                        onMouseEnter={e => {
                          const b = e.currentTarget as HTMLButtonElement;
                          b.style.backgroundColor = "#1A1A1A";
                          b.style.color = "#fff";
                          b.style.borderColor = "#1A1A1A";
                          b.style.boxShadow = "0 2px 8px rgba(0,0,0,0.18)";
                        }}
                        onMouseLeave={e => {
                          const b = e.currentTarget as HTMLButtonElement;
                          b.style.backgroundColor = "#fff";
                          b.style.color = "#6B6B6B";
                          b.style.borderColor = "rgba(0,0,0,0.12)";
                          b.style.boxShadow = "none";
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {openMenu === user.id && menuPos && (
                        <div style={{
                          position: "fixed", right: menuPos.right, top: menuPos.top, zIndex: 1000,
                          backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.1)",
                          borderRadius: 7, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                          minWidth: 190, overflow: "hidden",
                        }}>
                          {(user.status === "Archivé"
                            ? [
                                { label: "Restaurer le compte", icon: UserCheck, danger: false, action: () => handleArchive(user, false) },
                              ]
                            : [
                                { label: user.enabled ? "Désactiver le compte" : "Activer le compte", icon: user.enabled ? UserX : UserCheck, danger: user.enabled, action: () => handleToggleEnabled(user) },
                                { label: "Réinitialiser le mot de passe", icon: Key, danger: false, action: () => handleResetPassword(user) },
                                { label: "Archiver le compte", icon: Trash2, danger: true, action: () => handleArchive(user, true) },
                              ]
                          ).map(({ label, icon: Icon, danger, action }, ai) => (
                            <button
                              key={ai}
                              onClick={action}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 9,
                                padding: "10px 14px", border: "none", background: "none",
                                cursor: "pointer", fontSize: 12, fontWeight: 500,
                                color: danger ? "#CC0000" : "#1A1A1A", textAlign: "left",
                                borderTop: ai > 0 ? "1px solid rgba(0,0,0,0.05)" : "none",
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = danger ? "#FFF5F5" : "#F7F7F7"}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"}
                            >
                              <Icon size={13} /> {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Loading state */}
        {loading && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <Loader2 size={26} className="animate-spin" style={{ color: "#9B9B9B", marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: "#9B9B9B" }}>Chargement des utilisateurs…</div>
          </div>
        )}

        {/* Error state */}
        {!loading && loadError && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <UserX size={32} style={{ color: "#CC0000", marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#4A4A4A" }}>Impossible de charger les utilisateurs</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>Vérifiez que l'API et Keycloak sont démarrés, puis rechargez la page.</div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !loadError && filtered.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <Users size={32} style={{ color: "#D0D0D0", marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#4A4A4A" }}>Aucun utilisateur trouvé</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>Modifiez vos filtres ou créez un nouvel utilisateur.</div>
          </div>
        )}

        {/* Pagination strip */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          backgroundColor: "#FAFAFA",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 12, color: "#9B9B9B" }}>
              Affichage de{" "}
              <strong style={{ color: "#1A1A1A" }}>
                {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{(currentPage - 1) * pageSize + paged.length}
              </strong>{" "}
              sur <strong style={{ color: "#1A1A1A" }}>{filtered.length}</strong> utilisateur{filtered.length !== 1 ? "s" : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                style={{
                  padding: "4px 8px", borderRadius: 5, fontSize: 12, fontWeight: 500,
                  border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff",
                  color: "#4A4A4A", cursor: "pointer", outline: "none",
                }}
              >
                {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span style={{ fontSize: 12, color: "#9B9B9B" }}>par page</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              style={{
                padding: "5px 11px", borderRadius: 5, fontSize: 12, fontWeight: 500,
                border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff",
                color: "#4A4A4A", cursor: currentPage === 1 ? "not-allowed" : "pointer",
                opacity: currentPage === 1 ? 0.45 : 1,
              }}
            >
              ← Précédent
            </button>
            {pageNumbers.map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  padding: "5px 11px", borderRadius: 5, fontSize: 12, fontWeight: p === currentPage ? 700 : 500,
                  border: "1px solid rgba(0,0,0,0.10)",
                  backgroundColor: p === currentPage ? "#1A1A1A" : "#fff",
                  color: p === currentPage ? "#FFE600" : "#4A4A4A", cursor: "pointer",
                }}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{
                padding: "5px 11px", borderRadius: 5, fontSize: 12, fontWeight: 500,
                border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff",
                color: "#4A4A4A", cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                opacity: currentPage === totalPages ? 0.45 : 1,
              }}
            >
              Suivant →
            </button>
          </div>
        </div>
      </div>

      {/* Click-outside to close menu */}
      {openMenu !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={() => setOpenMenu(null)} />
      )}

      {showModal && (
        <UserModal
          user={editingUser}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
