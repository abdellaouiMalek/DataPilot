import { useState } from "react";
import {
  Search, Plus, Edit2, Trash2, UserCheck, UserX,
  Key, ChevronDown, X, Download, Upload,
  Users, UserCog, ShieldCheck, Clock, MoreHorizontal,
  TrendingUp, TrendingDown,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  organization: string;
  status: string;
  createdAt: string;
  lastLogin: string;
  permissions: string[];
}

// ── Mock data ──────────────────────────────────────────────────────────────────

const mockUsers: User[] = [
  { id: 1,  firstName: "Alexandre", lastName: "Dupont",    email: "a.dupont@ey.com",            role: "Admin EY",          organization: "EY France",           status: "Actif",      createdAt: "15/01/2026", lastLogin: "11/06/2026", permissions: ["Lecture", "Écriture", "Administration"] },
  { id: 2,  firstName: "Marine",    lastName: "Bernard",   email: "m.bernard@ey.com",           role: "Consultant EY",     organization: "EY France",           status: "Actif",      createdAt: "20/02/2026", lastLogin: "10/06/2026", permissions: ["Lecture", "Écriture"] },
  { id: 3,  firstName: "Sophie",    lastName: "Martin",    email: "s.martin@ey.com",            role: "Consultant EY",     organization: "EY France",           status: "Actif",      createdAt: "05/03/2026", lastLogin: "09/06/2026", permissions: ["Lecture", "Écriture"] },
  { id: 4,  firstName: "Julien",    lastName: "Rousseau",  email: "j.rousseau@bnpparibas.fr",   role: "Répondant Banque",  organization: "BNP Paribas",         status: "Actif",      createdAt: "11/06/2026", lastLogin: "11/06/2026", permissions: ["Lecture"] },
  { id: 5,  firstName: "Sarah",     lastName: "Mbeki",     email: "s.mbeki@creditmutuel.fr",    role: "Validateur Banque", organization: "Crédit Mutuel",       status: "En attente", createdAt: "10/06/2026", lastLogin: "—",          permissions: ["Lecture", "Validation"] },
  { id: 6,  firstName: "Thomas",    lastName: "Girard",    email: "t.girard@ey.com",            role: "Consultant EY",     organization: "EY France",           status: "Actif",      createdAt: "09/06/2026", lastLogin: "09/06/2026", permissions: ["Lecture", "Écriture"] },
  { id: 7,  firstName: "Amina",     lastName: "Benali",    email: "a.benali@cacf.fr",           role: "Répondant Banque",  organization: "CA Consumer Finance", status: "Actif",      createdAt: "08/06/2026", lastLogin: "10/06/2026", permissions: ["Lecture"] },
  { id: 8,  firstName: "Kevin",     lastName: "Park",      email: "k.park@societegenerale.fr",  role: "Répondant Banque",  organization: "Société Générale",    status: "En attente", createdAt: "07/06/2026", lastLogin: "—",          permissions: ["Lecture"] },
  { id: 9,  firstName: "Lucie",     lastName: "Petit",     email: "l.petit@ey.com",             role: "Consultant EY",     organization: "EY France",           status: "Désactivé",  createdAt: "01/03/2026", lastLogin: "20/05/2026", permissions: [] },
  { id: 10, firstName: "Marc",      lastName: "Chen",      email: "m.chen@caisseepargne.fr",    role: "Validateur Banque", organization: "Caisse d'Épargne",    status: "Actif",      createdAt: "15/04/2026", lastLogin: "08/06/2026", permissions: ["Lecture", "Validation"] },
  { id: 11, firstName: "Nadia",     lastName: "Lefèvre",   email: "n.lefevre@bnpparibas.fr",    role: "Validateur Banque", organization: "BNP Paribas",         status: "Actif",      createdAt: "20/04/2026", lastLogin: "07/06/2026", permissions: ["Lecture", "Validation"] },
  { id: 12, firstName: "Romain",    lastName: "Leclerc",   email: "r.leclerc@ey.com",           role: "Admin EY",          organization: "EY France",           status: "Actif",      createdAt: "10/01/2026", lastLogin: "06/06/2026", permissions: ["Lecture", "Écriture", "Administration"] },
];

const roles   = ["Tous les rôles",   "Admin EY", "Consultant EY", "Répondant Banque", "Validateur Banque"];
const statuses = ["Tous les statuts", "Actif", "En attente", "Désactivé"];

// ── KPI cards ─────────────────────────────────────────────────────────────────

const kpiCards = [
  {
    label:   "Total utilisateurs",
    value:   "48",
    sub:     "+3 cette semaine",
    trend:   "up",
    icon:    Users,
    detail:  "Sur toutes les organisations",
  },
  {
    label:   "Utilisateurs actifs",
    value:   "41",
    sub:     "+5%",
    trend:   "up",
    icon:    UserCheck,
    detail:  "Connectés ces 30 derniers jours",
  },
  {
    label:   "Admins EY",
    value:   "3",
    sub:     "Accès complet",
    trend:   "neutral",
    icon:    ShieldCheck,
    detail:  "Admin EY · Permissions totales",
  },
  {
    label:   "En attente d'activation",
    value:   "2",
    sub:     "-26%",
    trend:   "down",
    detail:  "Comptes créés non encore activés",
    icon:    Clock,
  },
];

function KpiCard({ card }: { card: typeof kpiCards[0] }) {
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

function PermissionTag({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-block",
      backgroundColor: "#F5F5F5", color: "#4A4A4A",
      borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 500,
      border: "1px solid rgba(0,0,0,0.07)",
    }}>
      {label}
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface UserModalProps {
  user?: User | null;
  onClose: () => void;
}

function UserModal({ user, onClose }: UserModalProps) {
  const [formData, setFormData] = useState({
    firstName:    user?.firstName    || "",
    lastName:     user?.lastName     || "",
    email:        user?.email        || "",
    role:         user?.role         || "Consultant EY",
    organization: user?.organization || "",
    status:       user?.status       || "Actif",
  });

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
                <input value={(formData as any)[key]} onChange={e => setFormData(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} style={inp} />
              </div>
            ))}
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Email professionnel *</label>
            <input value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="prenom.nom@organisation.com" type="email" style={inp} />
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
              <input value={formData.organization} onChange={e => setFormData(p => ({ ...p, organization: e.target.value }))} placeholder="ex. BNP Paribas" style={inp} />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 7 }}>Statut du compte</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Actif", "En attente", "Désactivé"].map(s => (
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
          <button style={{ padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>
            {user ? "Enregistrer" : "Créer le compte"}
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
  const [openMenu,       setOpenMenu]       = useState<number | null>(null);
  const [focusSearch,    setFocusSearch]    = useState(false);
  const [focusRole,      setFocusRole]      = useState(false);
  const [focusStatus,    setFocusStatus]    = useState(false);

  const filtered = mockUsers.filter(u => {
    const matchSearch = `${u.firstName} ${u.lastName} ${u.email} ${u.organization}`.toLowerCase().includes(search.toLowerCase());
    const matchRole   = roleFilter   === "Tous les rôles"   || u.role   === roleFilter;
    const matchStatus = statusFilter === "Tous les statuts" || u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  const initials = (u: User) => `${u.firstName[0]}${u.lastName[0]}`;

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
          border: `1.5px solid ${focusSearch ? "#1A1A1A" : "rgba(0,0,0,0.08)"}`,
          borderRadius: 6, padding: "8px 13px",
          transition: "border-color 0.2s, box-shadow 0.2s",
          boxShadow: focusSearch ? "0 0 0 3px rgba(26,26,26,0.08)" : "none",
        }}>
          <Search size={14} style={{ color: focusSearch ? "#1A1A1A" : "#9B9B9B", flexShrink: 0, transition: "color 0.2s" }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            onFocus={() => setFocusSearch(true)}
            onBlur={() => setFocusSearch(false)}
            placeholder="Rechercher un utilisateur, email ou organisation..."
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#1A1A1A", width: "100%" }}
          />
        </div>

        {/* Role filter */}
        <div style={{ position: "relative" }}>
          <select
            value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
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
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
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
        <button style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 6,
          fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)",
          backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A",
        }}>
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
            {filtered.map((user, i) => (
              <tr
                key={user.id}
                style={{ borderBottom: i < filtered.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", transition: "background 0.1s" }}
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
                        onClick={() => setOpenMenu(openMenu === user.id ? null : user.id)}
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
                      {openMenu === user.id && (
                        <div style={{
                          position: "absolute", right: 0, top: 32, zIndex: 100,
                          backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.1)",
                          borderRadius: 7, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                          minWidth: 190, overflow: "hidden",
                        }}>
                          {[
                            { label: user.status === "Actif" ? "Désactiver le compte" : "Activer le compte", icon: user.status === "Actif" ? UserX : UserCheck, danger: user.status === "Actif" },
                            { label: "Réinitialiser le mot de passe", icon: Key, danger: false },
                            { label: "Archiver le compte", icon: Trash2, danger: true },
                          ].map(({ label, icon: Icon, danger }, ai) => (
                            <button
                              key={ai}
                              onClick={() => setOpenMenu(null)}
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

        {/* Empty state */}
        {filtered.length === 0 && (
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
          <span style={{ fontSize: 12, color: "#9B9B9B" }}>
            Affichage de <strong style={{ color: "#1A1A1A" }}>{filtered.length}</strong> utilisateur{filtered.length !== 1 ? "s" : ""} sur <strong style={{ color: "#1A1A1A" }}>{mockUsers.length}</strong>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {["← Précédent", "1", "2", "Suivant →"].map((p, i) => (
              <button key={i} style={{
                padding: "5px 11px", borderRadius: 5, fontSize: 12, fontWeight: i === 1 ? 700 : 500,
                border: "1px solid rgba(0,0,0,0.10)",
                backgroundColor: i === 1 ? "#1A1A1A" : "#fff",
                color: i === 1 ? "#FFE600" : "#4A4A4A", cursor: "pointer",
              }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Click-outside to close menu */}
      {openMenu !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpenMenu(null)} />
      )}

      {showModal && <UserModal user={editingUser} onClose={() => setShowModal(false)} />}
    </div>
  );
}
