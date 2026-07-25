import { useEffect, useState } from "react";
import {
  Search, Plus, Edit2, ChevronDown, X,
  Building2, CheckCircle2,
  MoreHorizontal, Download,
  Trash2, AlertCircle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listBanks, createBank, updateBank, setBankActive, setBankArchived,
} from "@/lib/adminBanks";
import type { AdminBank, BankPayload } from "@/lib/adminBanks";
import { ApiError } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Bank {
  id: number;
  name: string;
  country: string;
  sector: string;
  contact: string;
  description: string;
  isActive: boolean;
  archived: boolean;
  status: string;
  addedAt: string;
  score: number | null;
  assessmentsCount: number;
  lastAssessmentAt: string;
}

function toBank(b: AdminBank): Bank {
  return {
    id: b.id,
    name: b.name,
    country: b.country || "—",
    sector: b.sector || "—",
    contact: b.contact || "",
    description: b.description || "",
    isActive: b.is_active,
    archived: b.archived,
    status: b.status,
    addedAt: b.created_at ? new Date(b.created_at).toLocaleDateString("fr-FR") : "—",
    score: b.score,
    assessmentsCount: b.assessments_count,
    lastAssessmentAt: b.last_assessment_at
      ? new Date(b.last_assessment_at).toLocaleDateString("fr-FR")
      : "—",
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Une erreur est survenue. Vérifiez que l'API est démarrée.";
}

const statuses = ["Tous les statuts", "Actif", "Désactivé", "Archivé"];

// ── Total card ────────────────────────────────────────────────────────────────

function TotalCard({ banks }: { banks: Bank[] }) {
  const visible = banks.filter(b => !b.archived);
  const total = visible.length;
  const actif = visible.filter(b => b.status === "Actif").length;
  const scored = visible.filter(b => b.score != null);
  const avgScore = scored.length
    ? (scored.reduce((a, b) => a + (b.score as number), 0) / scored.length).toFixed(1)
    : "—";
  const inactive = visible.filter(b => b.status === "Désactivé").length;

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
          { value: actif,    label: "Actives",     sub: `sur ${total} banques` },
          { value: avgScore, label: "Score moy.",  sub: "maturité data /5" },
          { value: inactive, label: "Désactivées", sub: "hors ligne" },
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
    "Désactivé":  { bg: "#FFEBEE", color: "#CC0000" },
    "Archivé":    { bg: "#ECEFF1", color: "#455A64" },
  };
  const c = cfg[status] || { bg: "#F5F5F5", color: "#6B6B6B" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: c.bg, color: c.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: c.color }} />
      {status}
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function BankModal({ bank, onClose, onSaved }: { bank?: Bank | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: bank?.name || "",
    country: bank && bank.country !== "—" ? bank.country : "Tunisie",
    sector: bank && bank.sector !== "—" ? bank.sector : "",
    contact: bank?.contact || "",
    description: bank?.description || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Champ manquant", { description: "Le nom de la banque est obligatoire." });
      return;
    }
    const payload: BankPayload = {
      name: form.name.trim(),
      country: form.country.trim(),
      sector: form.sector.trim(),
      contact: form.contact.trim() || null,
      description: form.description.trim(),
    };
    setSaving(true);
    try {
      if (bank) {
        await updateBank(bank.id, payload);
        toast.success("Banque mise à jour", { description: payload.name });
      } else {
        await createBank(payload);
        toast.success("Banque ajoutée", { description: payload.name });
      }
      onSaved();
    } catch (err) {
      toast.error(bank ? "Échec de la mise à jour" : "Échec de l'ajout", { description: errorMessage(err) });
      setSaving(false);
    }
  };

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
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ex. BIAT" autoComplete="off" style={inp} />
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
              <input value={form.sector} onChange={e => setForm(p => ({ ...p, sector: e.target.value }))} placeholder="ex. Banque universelle" autoComplete="off" style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Contact principal</label>
            <input value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value }))} placeholder="prenom.nom@banque.tn" autoComplete="off" style={inp} />
          </div>
          <div>
            <label style={lbl}>Description courte</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Informations complémentaires..." style={{ ...inp, resize: "vertical" }} />
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
          >{saving ? "Enregistrement…" : bank ? "Enregistrer" : "Ajouter la banque"}</button>
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
  const [menuPos,      setMenuPos]      = useState<{ top: number; right: number } | null>(null);
  const [focusStatus,  setFocusStatus]  = useState(false);

  const [banks,     setBanks]     = useState<Bank[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const reload = () => {
    setLoading(true);
    setLoadError(false);
    setRefreshKey(k => k + 1);
  };

  useEffect(() => {
    let cancelled = false;
    listBanks()
      .then(list => !cancelled && setBanks(list.map(toBank)))
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = banks.filter(b => {
    const matchSearch = `${b.name} ${b.sector} ${b.country}`.toLowerCase().includes(search.toLowerCase());
    // Archived banks only appear under the explicit "Archivé" filter.
    const matchStatus = statusFilter === "Tous les statuts"
      ? b.status !== "Archivé"
      : b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageNumbers: number[] = [];
  {
    const end = Math.min(totalPages, Math.max(1, currentPage - 2) + 4);
    for (let p = Math.max(1, end - 4); p <= end; p++) pageNumbers.push(p);
  }

  const handleToggleActive = async (bank: Bank) => {
    setOpenMenu(null);
    try {
      await setBankActive(bank.id, !bank.isActive);
      toast.success(bank.isActive ? "Banque désactivée" : "Banque activée", { description: bank.name });
      reload();
    } catch (err) {
      toast.error("Échec de l'opération", { description: errorMessage(err) });
    }
  };

  const handleArchive = async (bank: Bank, archived: boolean) => {
    setOpenMenu(null);
    try {
      await setBankArchived(bank.id, archived);
      toast.success(archived ? "Banque archivée" : "Banque restaurée", {
        description: archived
          ? `${bank.name} est masquée de la liste (filtre « Archivé »).`
          : `${bank.name} est de nouveau active.`,
      });
      reload();
    } catch (err) {
      toast.error("Échec de l'opération", { description: errorMessage(err) });
    }
  };

  const handleExport = async (rows: Bank[]) => {
    if (rows.length === 0) {
      toast.error("Rien à exporter", { description: "Aucune banque ne correspond aux filtres." });
      return;
    }
    const ExcelJS = (await import("exceljs")).default;

    const EY_BLACK = "FF1A1A1A";
    const EY_YELLOW = "FFFFE600";
    const statusColor: Record<string, string> = {
      "Actif": "FF2E7D32", "En attente": "FF1D4ED8", "Désactivé": "FFCC0000", "Archivé": "FF455A64",
    };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Banques", { views: [{ state: "frozen", ySplit: 3 }] });
    ws.columns = [
      { width: 30 }, { width: 14 }, { width: 26 }, { width: 26 },
      { width: 12 }, { width: 13 }, { width: 14 }, { width: 15 }, { width: 13 },
    ];

    ws.mergeCells("A1:I1");
    const title = ws.getCell("A1");
    title.value = "Banques DataPilot";
    title.font = { bold: true, size: 15, color: { argb: EY_YELLOW } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EY_BLACK } };
    title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 30;

    ws.mergeCells("A2:I2");
    const sub = ws.getCell("A2");
    sub.value = `Exporté le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} — ${rows.length} banque${rows.length > 1 ? "s" : ""}`;
    sub.font = { size: 10, color: { argb: "FF6B6B6B" } };

    const header = ws.getRow(3);
    header.values = ["Banque", "Pays", "Secteur", "Contact", "Score", "Évaluations", "Dernière éval.", "Statut", "Depuis"];
    header.eachCell(cell => {
      cell.font = { bold: true, size: 11, color: { argb: EY_YELLOW } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EY_BLACK } };
      cell.border = { bottom: { style: "medium", color: { argb: EY_YELLOW } } };
      cell.alignment = { vertical: "middle" };
    });
    header.height = 22;

    for (const b of rows) {
      const row = ws.addRow([
        b.name, b.country, b.sector, b.contact || "—",
        b.score != null ? `${b.score.toFixed(1)}/5` : "Non évalué",
        b.assessmentsCount, b.lastAssessmentAt, b.status, b.addedAt,
      ]);
      row.getCell(8).font = { bold: true, color: { argb: statusColor[b.status] ?? "FF1A1A1A" } };
      row.eachCell(cell => {
        cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
      });
    }

    ws.autoFilter = { from: "A3", to: `I${3 + rows.length}` };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `datapilot-banques-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export Excel", { description: `${rows.length} banque${rows.length > 1 ? "s" : ""} exportée${rows.length > 1 ? "s" : ""}.` });
  };

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
      <TotalCard banks={banks} />

      {/* Filters */}
      <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, backgroundColor: "#F7F7F7", borderRadius: 6, padding: "8px 13px", border: "1.5px solid rgba(0,0,0,0.08)" }}>
          <Search size={14} style={{ color: "#9B9B9B", flexShrink: 0 }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher une banque, un secteur ou un pays..."
            name="datapilot-bank-search"
            autoComplete="off"
            data-plain-focus=""
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#1A1A1A", width: "100%" }} />
        </div>
        <div style={{ position: "relative" }}>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} onFocus={() => setFocusStatus(true)} onBlur={() => setFocusStatus(false)}
            style={{ padding: "8px 30px 8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, backgroundColor: "#fff", cursor: "pointer", appearance: "none", outline: "none", color: statusFilter === "Tous les statuts" ? "#9B9B9B" : "#1A1A1A", border: `1.5px solid ${focusStatus ? "#1A1A1A" : "rgba(0,0,0,0.08)"}`, transition: "border-color 0.2s" }}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
          <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9B9B", pointerEvents: "none" }} />
        </div>
        <button
          onClick={() => handleExport(filtered)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A", transition: "all 0.15s" }}
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
              {["Banque", "Pays", "Secteur", "Score maturité", "Évaluations", "Statut", "Depuis", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#9B9B9B", letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((bank, i) => (
              <tr key={bank.id}
                style={{ borderBottom: i < paged.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", transition: "background 0.1s" }}
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

                {/* Pays */}
                <td style={{ padding: "13px 16px", fontSize: 12, color: "#4A4A4A", whiteSpace: "nowrap" }}>{bank.country}</td>

                {/* Secteur */}
                <td style={{ padding: "13px 16px", fontSize: 12, color: "#4A4A4A", maxWidth: 180 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{bank.sector}</span>
                </td>

                {/* Score */}
                <td style={{ padding: "13px 16px" }}>
                  {bank.score == null
                    ? <span style={{ fontSize: 11, color: "#C0C0C0", fontStyle: "italic" }}>Non évalué</span>
                    : (() => {
                        const color = bank.score >= 4 ? "#2E7D32" : bank.score >= 3 ? "#E65100" : "#9B9B9B";
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 52, height: 5, backgroundColor: "#F0F0F0", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${(bank.score / 5) * 100}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color }}>{bank.score.toFixed(1)}/5</span>
                          </div>
                        );
                      })()
                  }
                </td>

                {/* Évaluations */}
                <td style={{ padding: "13px 16px", fontSize: 12, color: "#4A4A4A", whiteSpace: "nowrap" }}>
                  {bank.assessmentsCount > 0
                    ? <>{bank.assessmentsCount} · <span style={{ color: "#9B9B9B" }}>dern. {bank.lastAssessmentAt}</span></>
                    : <span style={{ color: "#C0C0C0" }}>—</span>}
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
                      <button
                        onClick={(e) => {
                          if (openMenu === bank.id) {
                            setOpenMenu(null);
                            return;
                          }
                          const r = e.currentTarget.getBoundingClientRect();
                          const menuHeight = bank.archived ? 44 : 84;
                          const top =
                            r.bottom + 4 + menuHeight > window.innerHeight - 8
                              ? r.top - menuHeight - 4
                              : r.bottom + 4;
                          setMenuPos({ top, right: window.innerWidth - r.right });
                          setOpenMenu(bank.id);
                        }}
                        style={{ width: 28, height: 28, borderRadius: 5, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6B6B", transition: "all 0.15s" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#fff"; b.style.borderColor = "#1A1A1A"; b.style.boxShadow = "0 2px 8px rgba(0,0,0,0.18)"; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#6B6B6B"; b.style.borderColor = "rgba(0,0,0,0.12)"; b.style.boxShadow = "none"; }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {openMenu === bank.id && menuPos && (
                        <div style={{ position: "fixed", right: menuPos.right, top: menuPos.top, zIndex: 1000, backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 190, overflow: "hidden" }}>
                          {(bank.archived
                            ? [
                                { label: "Restaurer la banque", icon: CheckCircle2, danger: false, action: () => handleArchive(bank, false) },
                              ]
                            : [
                                { label: bank.isActive ? "Désactiver la banque" : "Activer la banque", icon: bank.isActive ? AlertCircle : CheckCircle2, danger: bank.isActive, action: () => handleToggleActive(bank) },
                                { label: "Archiver la banque", icon: Trash2, danger: true, action: () => handleArchive(bank, true) },
                              ]
                          ).map(({ label, icon: Icon, danger, action }, ai) => (
                            <button key={ai} onClick={action}
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

        {loading && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <Loader2 size={26} className="animate-spin" style={{ color: "#9B9B9B", marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: "#9B9B9B" }}>Chargement des banques…</div>
          </div>
        )}

        {!loading && loadError && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <AlertCircle size={32} style={{ color: "#CC0000", marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#4A4A4A" }}>Impossible de charger les banques</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>Vérifiez que l'API est démarrée, puis rechargez la page.</div>
          </div>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <Building2 size={32} style={{ color: "#D0D0D0", marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#4A4A4A" }}>Aucune banque trouvée</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>Modifiez vos filtres ou ajoutez une nouvelle banque.</div>
          </div>
        )}

        {/* Pagination strip */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FAFAFA" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 12, color: "#9B9B9B" }}>
              Affichage de{" "}
              <strong style={{ color: "#1A1A1A" }}>
                {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{(currentPage - 1) * pageSize + paged.length}
              </strong>{" "}
              sur <strong style={{ color: "#1A1A1A" }}>{filtered.length}</strong> banque{filtered.length !== 1 ? "s" : ""}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                style={{ padding: "4px 8px", borderRadius: 5, fontSize: 12, fontWeight: 500, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", color: "#4A4A4A", cursor: "pointer", outline: "none" }}
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
              style={{ padding: "5px 11px", borderRadius: 5, fontSize: 12, fontWeight: 500, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", color: "#4A4A4A", cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.45 : 1 }}
            >
              ← Précédent
            </button>
            {pageNumbers.map(p => (
              <button key={p} onClick={() => setPage(p)}
                style={{ padding: "5px 11px", borderRadius: 5, fontSize: 12, fontWeight: p === currentPage ? 700 : 500, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: p === currentPage ? "#1A1A1A" : "#fff", color: p === currentPage ? "#FFE600" : "#4A4A4A", cursor: "pointer" }}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{ padding: "5px 11px", borderRadius: 5, fontSize: 12, fontWeight: 500, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", color: "#4A4A4A", cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.45 : 1 }}
            >
              Suivant →
            </button>
          </div>
        </div>
      </div>

      {openMenu !== null && <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={() => setOpenMenu(null)} />}
      {showModal && (
        <BankModal
          bank={editingBank}
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
