import React, { useState } from "react";
import {
  Search, Download, ChevronDown, CheckCircle2, XCircle,
  AlertTriangle, Activity, Shield, Users, Building2,
  Layers, BarChart2, GitBranch, ChevronRight,
} from "lucide-react";

interface LogEntry {
  id: string;
  date: string;
  time: string;
  user: string;
  initials: string;
  action: string;
  module: string;
  before: string;
  after: string;
  status: "Succès" | "Échec" | "Avertissement";
}

const mockLogs: LogEntry[] = [
  { id: "LOG-1001", date: "Aujourd'hui",  time: "14:32", user: "Alexandre Dupont",  initials: "AD", action: "Publication questionnaire v2.1",       module: "Versions",     before: "Brouillon",                     after: "Publié",                         status: "Succès" },
  { id: "LOG-1000", date: "Aujourd'hui",  time: "14:28", user: "Marine Bernard",    initials: "MB", action: "Modification question Q-042",            module: "Framework",    before: "Libellé version 1",             after: "Libellé version 2 (Gouvernance)",status: "Succès" },
  { id: "LOG-0999", date: "Aujourd'hui",  time: "13:55", user: "Sophie Martin",     initials: "SM", action: "Création compte utilisateur",            module: "Utilisateurs", before: "—",                             after: "j.rousseau@biat.com.tn · Répondant", status: "Succès" },
  { id: "LOG-0998", date: "Aujourd'hui",  time: "12:10", user: "Alexandre Dupont",  initials: "AD", action: "Ajout dimension Analytics & Valorisation",module: "Framework",    before: "6 dimensions",                  after: "7 dimensions",                   status: "Succès" },
  { id: "LOG-0997", date: "Aujourd'hui",  time: "11:44", user: "Lucie Petit",       initials: "LP", action: "Désactivation compte utilisateur",       module: "Utilisateurs", before: "Actif",                         after: "Désactivé",                      status: "Succès" },
  { id: "LOG-0996", date: "Aujourd'hui",  time: "10:20", user: "Alexandre Dupont",  initials: "AD", action: "Modification seuil — Niveau Optimisé",  module: "Scoring",      before: "min = 85",                      after: "min = 80",                       status: "Succès" },
  { id: "LOG-0995", date: "Hier",         time: "17:05", user: "Marine Bernard",    initials: "MB", action: "Duplication question Q-009 → Q-010",    module: "Framework",    before: "Q-009 (Sécurité)",              after: "Q-010 (copie)",                  status: "Succès" },
  { id: "LOG-0994", date: "Hier",         time: "16:30", user: "Sophie Martin",     initials: "SM", action: "Modification secteur banque BIAT",       module: "Banques",      before: "Secteur : inconnu",             after: "Banque universelle",             status: "Succès" },
  { id: "LOG-0993", date: "Hier",         time: "15:10", user: "Système",           initials: "SY", action: "Tentative de connexion échouée",         module: "Sécurité",     before: "IP : 185.220.x.x",              after: "Accès refusé",                   status: "Échec" },
  { id: "LOG-0992", date: "Hier",         time: "14:00", user: "Alexandre Dupont",  initials: "AD", action: "Restauration paramètres scoring",        module: "Scoring",      before: "Paramètres personnalisés",      after: "Défauts restaurés",              status: "Avertissement" },
  { id: "LOG-0991", date: "09/06/2026",   time: "11:20", user: "Thomas Girard",     initials: "TG", action: "Création compte consultant EY",          module: "Utilisateurs", before: "—",                             after: "t.girard@ey.com · Consultant",   status: "Succès" },
  { id: "LOG-0990", date: "09/06/2026",   time: "09:05", user: "Alexandre Dupont",  initials: "AD", action: "Archivage version questionnaire v2.0",  module: "Versions",     before: "Publié",                        after: "Archivé",                        status: "Succès" },
];

const modules  = ["Tous les modules",  "Framework", "Versions", "Utilisateurs", "Banques", "Scoring", "Sécurité"];
const statuses = ["Tous les statuts",  "Succès", "Échec", "Avertissement"];

const modCfg: Record<string, { color: string; bg: string; Icon: React.ComponentType<{size?: number}> }> = {
  "Framework":    { color: "#6B21A8", bg: "#F5F0FF", Icon: Layers    },
  "Versions":     { color: "#1565C0", bg: "#EBF3FF", Icon: GitBranch },
  "Utilisateurs": { color: "#166534", bg: "#EDFAF3", Icon: Users     },
  "Banques":      { color: "#9A3412", bg: "#FFF3ED", Icon: Building2 },
  "Scoring":      { color: "#B45309", bg: "#FFFBEB", Icon: BarChart2 },
  "Sécurité":     { color: "#CC0000", bg: "#FFF0F0", Icon: Shield    },
};

const stCfg = {
  "Succès":        { color: "#2E7D32", bg: "#E8F5E9", border: "#BBF7D0", Icon: CheckCircle2  },
  "Échec":         { color: "#CC0000", bg: "#FFEBEE", border: "#FECACA", Icon: XCircle       },
  "Avertissement": { color: "#E65100", bg: "#FFF8E1", border: "#FED7AA", Icon: AlertTriangle },
};

export function AuditLogs() {
  const [search,      setSearch]      = useState("");
  const [modFilter,   setModFilter]   = useState("Tous les modules");
  const [statFilter,  setStatFilter]  = useState("Tous les statuts");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [focusSearch, setFocusSearch] = useState(false);
  const [page,        setPage]        = useState(1);
  const PER_PAGE = 8;

  const filtered = mockLogs.filter(l => {
    const q = search.toLowerCase();
    return (
      (!q || `${l.action} ${l.user} ${l.before} ${l.after} ${l.module}`.toLowerCase().includes(q)) &&
      (modFilter  === "Tous les modules"  || l.module === modFilter)  &&
      (statFilter === "Tous les statuts" || l.status === statFilter)
    );
  });

  // Paginate
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Group by date
  const groups: { date: string; entries: LogEntry[] }[] = [];
  paginated.forEach(l => {
    const last = groups[groups.length - 1];
    if (last && last.date === l.date) last.entries.push(l);
    else groups.push({ date: l.date, entries: [l] });
  });

  const counts = {
    total:    mockLogs.length,
    success:  mockLogs.filter(l => l.status === "Succès").length,
    errors:   mockLogs.filter(l => l.status === "Échec").length,
    warnings: mockLogs.filter(l => l.status === "Avertissement").length,
  };

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>Historique & logs</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0" }}>Audit trail des actions administratives</p>
        </div>
        <button
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A", transition: "all 0.15s" }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "#1A1A1A"; b.style.color = "#1A1A1A"; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "rgba(0,0,0,0.12)"; b.style.color = "#4A4A4A"; }}
        >
          <Download size={13} /> Exporter
        </button>
      </div>

      {/* Stats cards — même style que les autres interfaces */}
      <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total des actions",  value: counts.total,    color: "#1A1A1A", trendBg: "#F5F5F5", trendColor: "#6B6B6B", sub: "30 derniers jours", Icon: Activity    },
          { label: "Succès",             value: counts.success,  color: "#1A1A1A", trendBg: "#E8F5E9", trendColor: "#2E7D32", sub: `${Math.round((counts.success/counts.total)*100)}% du total`, Icon: Activity },
          { label: "Avertissements",     value: counts.warnings, color: "#1A1A1A", trendBg: "#FFF8E1", trendColor: "#E65100", sub: "À surveiller",       Icon: AlertTriangle },
          { label: "Erreurs / Échecs",   value: counts.errors,   color: "#1A1A1A", trendBg: "#FFEBEE", trendColor: "#CC0000", sub: "Accès refusés",      Icon: XCircle      },
        ].map((k, i) => {
          const Icon = k.Icon;
          return (
            <div key={i}
              style={{ flex: 1, minWidth: 0, backgroundColor: "#fff", borderRadius: 14, padding: "20px 20px 16px", boxShadow: "0 2px 12px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", gap: 8, position: "relative", overflow: "hidden", borderTop: "3px solid #FFE600", transition: "box-shadow 0.15s, transform 0.12s", cursor: "default" }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; el.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)"; el.style.transform = "translateY(0)"; }}
            >
              <div style={{ position: "absolute", top: 10, right: 12, opacity: 0.07 }}><Icon size={56} style={{ color: "#1A1A1A" }} /></div>
              <div style={{ fontSize: 12, color: "#9B9B9B", fontWeight: 500 }}>{k.label}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1 }}>{k.value}</div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, backgroundColor: k.trendBg, color: k.trendColor, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, alignSelf: "flex-start" }}>{k.sub}</span>
            </div>
          );
        })}
      </div>

      {/* Filter bar — search + selects + date range */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{
          flex: "1 1 220px", display: "flex", alignItems: "center", gap: 9,
          backgroundColor: "#fff", borderRadius: 8, padding: "9px 14px",
          border: `1.5px solid ${focusSearch ? "#1A1A1A" : "rgba(0,0,0,0.09)"}`,
          boxShadow: focusSearch ? "0 0 0 3px rgba(26,26,26,0.07)" : "0 1px 4px rgba(0,0,0,0.04)",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}>
          <Search size={14} style={{ color: focusSearch ? "#1A1A1A" : "#9B9B9B", flexShrink: 0 }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            onFocus={() => setFocusSearch(true)} onBlur={() => setFocusSearch(false)}
            placeholder="Rechercher par action, utilisateur, module…"
            style={{ background: "none", border: "none", outline: "none", fontSize: 13, color: "#1A1A1A", width: "100%" }}
          />
        </div>

        {[
          { opts: modules, val: modFilter, set: (v: string) => { setModFilter(v); setPage(1); } },
          { opts: statuses, val: statFilter, set: (v: string) => { setStatFilter(v); setPage(1); } },
        ].map(({ opts, val, set }, i) => (
          <div key={i} style={{ position: "relative" }}>
            <select value={val} onChange={e => set(e.target.value)}
              style={{ padding: "9px 30px 9px 13px", borderRadius: 8, fontSize: 12, fontWeight: 500, border: "1px solid rgba(0,0,0,0.09)", backgroundColor: "#fff", cursor: "pointer", appearance: "none", outline: "none", color: val.startsWith("Tous") ? "#9B9B9B" : "#1A1A1A", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              {opts.map(o => <option key={o}>{o}</option>)}
            </select>
            <ChevronDown size={11} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9B9B", pointerEvents: "none" }} />
          </div>
        ))}

        {/* Date range */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, backgroundColor: "#fff", borderRadius: 8, padding: "6px 12px", border: "1px solid rgba(0,0,0,0.09)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <span style={{ fontSize: 11, color: "#9B9B9B", fontWeight: 500, whiteSpace: "nowrap" }}>Du</span>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            style={{ border: "none", outline: "none", fontSize: 12, color: dateFrom ? "#1A1A1A" : "#9B9B9B", cursor: "pointer", backgroundColor: "transparent" }} />
          <span style={{ fontSize: 11, color: "#9B9B9B", fontWeight: 500 }}>au</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
            style={{ border: "none", outline: "none", fontSize: 12, color: dateTo ? "#1A1A1A" : "#9B9B9B", cursor: "pointer", backgroundColor: "transparent" }} />
        </div>

        {/* Clear filters */}
        {(search || modFilter !== "Tous les modules" || statFilter !== "Tous les statuts" || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(""); setModFilter("Tous les modules"); setStatFilter("Tous les statuts"); setDateFrom(""); setDateTo(""); setPage(1); }}
            style={{ fontSize: 12, color: "#CC0000", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "4px 8px", borderRadius: 6 }}>
            × Effacer
          </button>
        )}
      </div>

      {/* Log groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {groups.map(({ date, entries }) => (
          <div key={date}>
            {/* Date label */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4A4A4A" }}>{date}</span>
              <span style={{ fontSize: 11, color: "#9B9B9B", backgroundColor: "#E8E8E8", padding: "1px 8px", borderRadius: 20 }}>{entries.length} action{entries.length > 1 ? "s" : ""}</span>
              <div style={{ flex: 1, height: 1, backgroundColor: "rgba(0,0,0,0.08)" }} />
            </div>

            {/* Entries */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {entries.map(log => {
                const mc  = modCfg[log.module] || { color: "#6B6B6B", bg: "#F5F5F5", Icon: Activity };
                const sc  = stCfg[log.status];
                const ModIcon = mc.Icon;
                const StIcon  = sc.Icon;
                const isOpen  = expanded === log.id;

                return (
                  <div key={log.id} style={{
                    backgroundColor: "#fff",
                    borderRadius: 9,
                    border: "1px solid rgba(0,0,0,0.07)",
                    borderLeft: `3px solid ${sc.color}`,
                    overflow: "hidden",
                    boxShadow: isOpen ? "0 4px 16px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.04)",
                    transition: "box-shadow 0.15s",
                  }}>
                    <div
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = "#FAFAFA"}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent"}
                    >
                      {/* Time */}
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A", fontFamily: "monospace", minWidth: 44, flexShrink: 0 }}>{log.time}</span>

                      {/* Status icon */}
                      <StIcon size={15} style={{ color: sc.color, flexShrink: 0 }} />

                      {/* Avatar */}
                      <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: log.user === "Système" ? "#F0F0F0" : "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: log.user === "Système" ? "#6B6B6B" : "#FFE600", flexShrink: 0 }}>
                        {log.initials}
                      </div>

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{log.action}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#6B6B6B" }}>par <strong style={{ color: "#1A1A1A", fontWeight: 600 }}>{log.user}</strong></div>
                      </div>

                      {/* Before → After pill (only if meaningful) */}
                      {log.before !== "—" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, backgroundColor: "#F7F7F7", borderRadius: 6, padding: "5px 10px", flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: "#9B9B9B", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.before}</span>
                          <span style={{ fontSize: 10, color: "#C0C0C0" }}>→</span>
                          <span style={{ fontSize: 11, color: "#1A1A1A", fontWeight: 600, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.after}</span>
                        </div>
                      )}

                      {/* Module */}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: mc.bg, color: mc.color, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                        <ModIcon size={9} /> {log.module}
                      </span>

                      <ChevronRight size={13} style={{ color: "#C0C0C0", flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.18s" }} />
                    </div>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", backgroundColor: "#FAFAFA", padding: "16px 20px 16px 84px", display: "flex", gap: 32, flexWrap: "wrap" }}>
                        {[
                          { label: "Référence",   value: log.id,     mono: true  },
                          { label: "Heure",       value: log.time,   mono: true  },
                          { label: "Statut",      value: log.status, mono: false },
                          { label: "Module",      value: log.module, mono: false },
                          { label: "Avant",       value: log.before, mono: false },
                          { label: "Après",       value: log.after,  mono: false },
                        ].map((f, fi) => (
                          <div key={fi}>
                            <div style={{ fontSize: 10, color: "#9B9B9B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{f.label}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: fi === 2 ? sc.color : "#1A1A1A", fontFamily: f.mono ? "monospace" : "inherit" }}>{f.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ backgroundColor: "#fff", borderRadius: 9, border: "1px solid rgba(0,0,0,0.07)", padding: "48px 20px", textAlign: "center" }}>
            <Activity size={28} style={{ color: "#D0D0D0", marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4A4A4A" }}>Aucune entrée trouvée</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>Modifiez vos critères de recherche ou de filtrage.</div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {filtered.length > PER_PAGE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, backgroundColor: "#fff", borderRadius: 9, border: "1px solid rgba(0,0,0,0.07)", padding: "12px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <span style={{ fontSize: 12, color: "#9B9B9B" }}>
            <strong style={{ color: "#1A1A1A" }}>{(page - 1) * PER_PAGE + 1}</strong>–<strong style={{ color: "#1A1A1A" }}>{Math.min(page * PER_PAGE, filtered.length)}</strong> sur <strong style={{ color: "#1A1A1A" }}>{filtered.length}</strong> entrées
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: page === 1 ? "#F5F5F5" : "#fff", color: page === 1 ? "#C0C0C0" : "#1A1A1A", cursor: page === 1 ? "not-allowed" : "pointer", transition: "all 0.15s" }}
            >← Précédent</button>

            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  style={{ width: 32, height: 32, borderRadius: 6, fontSize: 12, fontWeight: p === page ? 800 : 500, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: p === page ? "#1A1A1A" : "#fff", color: p === page ? "#FFE600" : "#4A4A4A", cursor: "pointer" }}>
                  {p}
                </button>
              ))}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: page === totalPages ? "#F5F5F5" : "#fff", color: page === totalPages ? "#C0C0C0" : "#1A1A1A", cursor: page === totalPages ? "not-allowed" : "pointer", transition: "all 0.15s" }}
            >Suivant →</button>
          </div>
        </div>
      )}
    </div>
  );
}
