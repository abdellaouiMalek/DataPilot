import { useState } from "react";
import {
  Search, Plus, Edit2, ChevronDown, X,
  Building2, Users, CheckCircle2, Clock,
  TrendingUp, MoreHorizontal, Download,
  UserPlus, Trash2, AlertCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Bank {
  id: number;
  name: string;
  country: string;
  sector: string;
  users: number;
  status: string;
  addedAt: string;
  score: number;
  progress: number;
}

// ── Data ───────────────────────────────────────────────────────────────────────

const mockBanks: Bank[] = [
  { id: 1,  name: "BIAT",               country: "Tunisie", sector: "Banque universelle",        users: 8, status: "Actif",     addedAt: "15/01/2026", score: 4.1, progress: 100 },
  { id: 2,  name: "Attijari Bank",       country: "Tunisie", sector: "Banque universelle",        users: 6, status: "Actif",     addedAt: "20/01/2026", score: 4.3, progress: 100 },
  { id: 3,  name: "BNA",                 country: "Tunisie", sector: "Banque nationale agricole", users: 5, status: "Actif",     addedAt: "01/02/2026", score: 3.8, progress: 100 },
  { id: 4,  name: "STB",                 country: "Tunisie", sector: "Banque de développement",   users: 5, status: "Actif",     addedAt: "10/02/2026", score: 3.2, progress: 100 },
  { id: 5,  name: "Arab Tunisian Bank",  country: "Tunisie", sector: "Banque mixte",              users: 4, status: "Actif",     addedAt: "20/03/2026", score: 3.6, progress: 100 },
  { id: 6,  name: "Zitouna Bank",        country: "Tunisie", sector: "Banque islamique",          users: 3, status: "Actif",     addedAt: "01/04/2026", score: 3.1, progress: 100 },
  { id: 7,  name: "UIB",                 country: "Tunisie", sector: "Banque de détail",          users: 4, status: "En cours",  addedAt: "15/02/2026", score: 3.5, progress: 72  },
  { id: 8,  name: "BH Bank",             country: "Tunisie", sector: "Banque de l'habitat",       users: 3, status: "En cours",  addedAt: "01/03/2026", score: 2.9, progress: 58  },
  { id: 9,  name: "Amen Bank",           country: "Tunisie", sector: "Banque privée",             users: 3, status: "En cours",  addedAt: "10/03/2026", score: 2.4, progress: 40  },
  { id: 10, name: "BTK",                 country: "Tunisie", sector: "Banque tuniso-koweïtienne", users: 2, status: "En attente",addedAt: "15/04/2026", score: 0,   progress: 0   },
  { id: 11, name: "BTE",                 country: "Tunisie", sector: "Banque de financement",     users: 2, status: "En attente",addedAt: "01/05/2026", score: 0,   progress: 0   },
  { id: 12, name: "ABC Bank",            country: "Tunisie", sector: "Banque arabe",              users: 2, status: "Archivé",   addedAt: "10/01/2026", score: 0,   progress: 0   },
];

const statuses = ["Tous les statuts", "Actif", "En cours", "En attente", "Archivé"];

// ── Total card ────────────────────────────────────────────────────────────────

function TotalCard() {
  const total = mockBanks.length;
  const actif = mockBanks.filter(b => b.status === "Actif").length;
  const avgScore = (
    mockBanks.filter(b => b.score > 0).reduce((a, b) => a + b.score, 0) /
    mockBanks.filter(b => b.score > 0).length
  ).toFixed(1);

  return (
    <div style={{
      backgroundColor: "#fff", borderRadius: 12,
      border: "1px solid rgba(0,0,0,0.07)",
      boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      padding: "0", marginBottom: 20,
      display: "flex", overflow: "hidden",
      transition: "box-shadow 0.15s, transform 0.12s",
    }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.10)"; el.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 1px 6px rgba(0,0,0,0.05)"; el.style.transform = "translateY(0)"; }}
    >
      {/* Left — dark block */}
      <div style={{ backgroundColor: "#1A1A1A", padding: "22px 28px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 160 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Total</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: "#FFE600", letterSpacing: "-0.04em", lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>banques clientes</div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, backgroundColor: "rgba(0,0,0,0.07)" }} />

      {/* Right — 3 stats inline */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "20px 28px", gap: 0 }}>
        {[
          { value: actif,     label: "Actives",          sub: `sur ${total} banques` },
          { value: avgScore,  label: "Score moy.",       sub: "maturité data /5" },
          { value: mockBanks.filter(b => ["En cours","En attente"].includes(b.status)).length, label: "En cours / attente", sub: "évaluations" },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, borderRight: i < 2 ? "1px solid rgba(0,0,0,0.07)" : "none", padding: "0 24px", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginTop: 5 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    "Actif":      { bg: "#E8F5E9", color: "#2E7D32" },
    "En cours":   { bg: "#FFF8E1", color: "#E65100" },
    "En attente": { bg: "#EFF6FF", color: "#1D4ED8" },
    "Archivé":    { bg: "#F5F5F5", color: "#6B6B6B" },
  };
  const c = cfg[status] || { bg: "#F5F5F5", color: "#6B6B6B" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: c.bg, color: c.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: c.color }} />
      {status}
    </span>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────

const scoreBars = mockBanks.filter(b => b.score > 0).map(b => ({ name: b.name.split(" ")[0], score: b.score }));

const statusDist = [
  { name: "Actif",      value: mockBanks.filter(b => b.status === "Actif").length,      color: "#2E7D32" },
  { name: "En cours",   value: mockBanks.filter(b => b.status === "En cours").length,   color: "#E65100" },
  { name: "En attente", value: mockBanks.filter(b => b.status === "En attente").length, color: "#1D4ED8" },
  { name: "Archivé",    value: mockBanks.filter(b => b.status === "Archivé").length,    color: "#B8B8B8" },
];

const ScoreTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  const color = score >= 4 ? "#2E7D32" : score >= 3 ? "#E65100" : "#9B9B9B";
  return (
    <div style={{ backgroundColor: "#1A1A1A", borderRadius: 8, padding: "8px 12px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#FFE600" }}>{score} / 5</div>
    </div>
  );
};

// ── Modal ─────────────────────────────────────────────────────────────────────

function BankModal({ bank, onClose }: { bank?: Bank | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: bank?.name || "", country: bank?.country || "Tunisie", sector: bank?.sector || "", contact: "", status: bank?.status || "Actif", description: "" });
  const inp: React.CSSProperties = { width: "100%", padding: "8px 11px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none", boxSizing: "border-box", color: "#1A1A1A" };
  const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 12, width: 520, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.16)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>{bank ? "Modifier la banque" : "Ajouter une banque"}</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>{bank ? bank.name : "Enregistrer une nouvelle organisation cliente"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
        </div>
        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Nom de la banque *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ex. BIAT" style={inp} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Pays</label>
              <select value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} style={{ ...inp, appearance: "none", cursor: "pointer", backgroundColor: "#fff" }}>
                {["Tunisie", "Maroc", "Algérie", "France", "Belgique"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Secteur</label>
              <input value={form.sector} onChange={e => setForm(p => ({ ...p, sector: e.target.value }))} placeholder="ex. Banque universelle" style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Contact principal</label>
            <input value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value }))} placeholder="prenom.nom@banque.tn" style={inp} />
          </div>
          <div>
            <label style={lbl}>Description courte</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Informations complémentaires..." style={{ ...inp, resize: "vertical" }} />
          </div>
          <div>
            <label style={lbl}>Statut</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Actif", "En cours", "En attente"].map(s => (
                <button key={s} onClick={() => setForm(p => ({ ...p, status: s }))} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: form.status === s ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.12)", backgroundColor: form.status === s ? "#1A1A1A" : "#fff", color: form.status === s ? "#FFE600" : "#6B6B6B", transition: "all 0.15s" }}>{s}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
          <button style={{ padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
          >{bank ? "Enregistrer" : "Ajouter la banque"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const avatarColors = ["#1A1A1A","#0277BD","#2E7D32","#6B21A8","#B45309","#9A3412","#0369A1","#065F46","#7C2D12","#1E3A5F","#4C1D95","#134E4A"];
const avatarColor = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length];

// ── Main component ─────────────────────────────────────────────────────────────

export function BankManagement() {
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("Tous les statuts");
  const [showModal,    setShowModal]    = useState(false);
  const [editingBank,  setEditingBank]  = useState<Bank | null>(null);
  const [openMenu,     setOpenMenu]     = useState<number | null>(null);
  const [focusSearch,  setFocusSearch]  = useState(false);
  const [focusStatus,  setFocusStatus]  = useState(false);

  const filtered = mockBanks.filter(b => {
    const matchSearch = `${b.name} ${b.sector}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "Tous les statuts" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const focusStyle = (focused: boolean): React.CSSProperties => ({
    border: `1.5px solid ${focused ? "#1A1A1A" : "rgba(0,0,0,0.08)"}`,
    boxShadow: focused ? "0 0 0 3px rgba(26,26,26,0.08)" : "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  });

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>Gestion des banques</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0" }}>Organisations clientes évaluées sur la plateforme</p>
        </div>
        <button onClick={() => { setEditingBank(null); setShowModal(true); }}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.18)", transition: "all 0.15s" }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#2D2D2D"; b.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.transform = "translateY(0)"; }}
        >
          <Plus size={15} /> Ajouter une banque
        </button>
      </div>

      {/* Total card */}
      <TotalCard />

      {/* Filters */}
      <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, backgroundColor: "#F7F7F7", borderRadius: 6, padding: "8px 13px", ...focusStyle(focusSearch) }}>
          <Search size={14} style={{ color: focusSearch ? "#1A1A1A" : "#9B9B9B", flexShrink: 0, transition: "color 0.2s" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setFocusSearch(true)} onBlur={() => setFocusSearch(false)}
            placeholder="Rechercher une banque ou un secteur..."
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#1A1A1A", width: "100%" }} />
        </div>
        <div style={{ position: "relative" }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} onFocus={() => setFocusStatus(true)} onBlur={() => setFocusStatus(false)}
            style={{ padding: "8px 30px 8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, backgroundColor: "#fff", cursor: "pointer", appearance: "none", outline: "none", color: statusFilter === "Tous les statuts" ? "#9B9B9B" : "#1A1A1A", ...focusStyle(focusStatus) }}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
          <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9B9B", pointerEvents: "none" }} />
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A", transition: "all 0.15s" }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "#1A1A1A"; b.style.color = "#1A1A1A"; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "rgba(0,0,0,0.10)"; b.style.color = "#4A4A4A"; }}
        >
          <Download size={13} /> Exporter
        </button>

      </div>

      {/* Table */}
      <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAFAFA", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              {["Banque", "Secteur", "Score maturité", "Statut", "Depuis", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#9B9B9B", letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((bank, i) => (
              <tr key={bank.id}
                style={{ borderBottom: i < filtered.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", transition: "background 0.1s" }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#FAFAFA"}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "transparent"}
              >
                {/* Banque */}
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", backgroundColor: avatarColor(bank.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0, letterSpacing: "0.02em" }}>
                      {bank.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{bank.name}</div>
                  </div>
                </td>

                {/* Secteur */}
                <td style={{ padding: "13px 16px", fontSize: 12, color: "#4A4A4A", maxWidth: 200 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{bank.sector}</span>
                </td>

                {/* Score */}
                <td style={{ padding: "13px 16px" }}>
                  {bank.score === 0
                    ? <span style={{ fontSize: 11, color: "#C0C0C0", fontStyle: "italic" }}>Non évalué</span>
                    : (() => {
                        const color = bank.score >= 4 ? "#2E7D32" : bank.score >= 3 ? "#E65100" : "#9B9B9B";
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 52, height: 5, backgroundColor: "#F0F0F0", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${(bank.score / 5) * 100}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color }}>{bank.score}/5</span>
                          </div>
                        );
                      })()
                  }
                </td>

                {/* Statut */}
                <td style={{ padding: "13px 16px" }}><StatusBadge status={bank.status} /></td>

                {/* Date */}
                <td style={{ padding: "13px 16px", fontSize: 12, color: "#9B9B9B", whiteSpace: "nowrap" }}>{bank.addedAt}</td>

                {/* Actions */}
                <td style={{ padding: "13px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => { setEditingBank(bank); setShowModal(true); }}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 5, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#1A1A1A", transition: "all 0.15s" }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#fff"; b.style.borderColor = "#1A1A1A"; b.style.boxShadow = "0 2px 8px rgba(0,0,0,0.18)"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#1A1A1A"; b.style.borderColor = "rgba(0,0,0,0.12)"; b.style.boxShadow = "none"; }}
                    >
                      <Edit2 size={11} /> Modifier
                    </button>
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setOpenMenu(openMenu === bank.id ? null : bank.id)}
                        style={{ width: 28, height: 28, borderRadius: 5, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6B6B", transition: "all 0.15s" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#fff"; b.style.borderColor = "#1A1A1A"; b.style.boxShadow = "0 2px 8px rgba(0,0,0,0.18)"; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#6B6B6B"; b.style.borderColor = "rgba(0,0,0,0.12)"; b.style.boxShadow = "none"; }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {openMenu === bank.id && (
                        <div style={{ position: "absolute", right: 0, top: 32, zIndex: 100, backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 190, overflow: "hidden" }}>
                          {[
                            { label: "Associer des utilisateurs", icon: UserPlus,   danger: false },
                            { label: "Désactiver la banque",      icon: AlertCircle, danger: false },
                            { label: "Archiver la banque",        icon: Trash2,      danger: true  },
                          ].map(({ label, icon: Icon, danger }, ai) => (
                            <button key={ai} onClick={() => setOpenMenu(null)}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, color: danger ? "#CC0000" : "#1A1A1A", textAlign: "left", borderTop: ai > 0 ? "1px solid rgba(0,0,0,0.05)" : "none" }}
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

        {filtered.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <Building2 size={32} style={{ color: "#D0D0D0", marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#4A4A4A" }}>Aucune banque trouvée</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>Modifiez vos filtres ou ajoutez une nouvelle banque.</div>
          </div>
        )}

        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FAFAFA" }}>
          <span style={{ fontSize: 12, color: "#9B9B9B" }}>
            <strong style={{ color: "#1A1A1A" }}>{filtered.length}</strong> banque{filtered.length !== 1 ? "s" : ""} sur <strong style={{ color: "#1A1A1A" }}>{mockBanks.length}</strong>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {["← Précédent", "1", "2", "Suivant →"].map((p, i) => (
              <button key={i} style={{ padding: "5px 11px", borderRadius: 5, fontSize: 12, fontWeight: i === 1 ? 700 : 500, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: i === 1 ? "#1A1A1A" : "#fff", color: i === 1 ? "#FFE600" : "#4A4A4A", cursor: "pointer" }}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      {openMenu !== null && <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpenMenu(null)} />}
      {showModal && <BankModal bank={editingBank} onClose={() => setShowModal(false)} />}
    </div>
  );
}
