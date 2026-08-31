/**
 * Historique & logs — the audit trail of administrative actions.
 *
 * Everything shown here is read from `/api/super-admin/logs`, written by the
 * backend as a side effect of the actions themselves (see
 * `app.services.audit`). Filters, paging and the stat totals are all resolved
 * server-side: the trail is append-only and grows without bound, so the page
 * never holds more than the rows it is displaying.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Download, ChevronDown, CheckCircle2, XCircle,
  AlertTriangle, Activity, ChevronRight, Loader2,
  type LucideIcon,
} from "lucide-react";
import {
  exportAuditLogs,
  getAuditLogs,
  type AuditLogEntry,
  type AuditLogPage,
} from "../../lib/adminLogs";
import { AdminLoader } from "../../components/AdminLoader";
import { modCfg } from "../../lib/auditModules";

const PER_PAGE = 12;
const SEARCH_DEBOUNCE_MS = 300;

const ALL_MODULES = "Tous les modules";
const ALL_STATUSES = "Tous les statuts";

const stCfg: Record<string, { color: string; bg: string; Icon: LucideIcon }> = {
  "Succès":        { color: "#2E7D32", bg: "#E8F5E9", Icon: CheckCircle2  },
  "Échec":         { color: "#CC0000", bg: "#FFEBEE", Icon: XCircle       },
  "Avertissement": { color: "#E65100", bg: "#FFF8E1", Icon: AlertTriangle },
};

const FALLBACK_STATUS = { color: "#6B6B6B", bg: "#F5F5F5", Icon: Activity };

/** "Aujourd'hui" / "Hier" / "12/06/2026" — the group heading a row falls under. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, today)) return "Aujourd'hui";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Hier";
  return date.toLocaleDateString("fr-FR");
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Two letters from the actor's name, for the avatar bubble. */
function initials(name: string): string {
  const parts = name.trim().split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Page numbers to render, windowed so a long trail doesn't grow a button bar. */
function pageWindow(current: number, total: number): number[] {
  const span = 5;
  let start = Math.max(1, current - Math.floor(span / 2));
  const end = Math.min(total, start + span - 1);
  start = Math.max(1, end - span + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function AuditLogs() {
  const [search,     setSearch]     = useState("");
  const [modFilter,  setModFilter]  = useState(ALL_MODULES);
  const [statFilter, setStatFilter] = useState(ALL_STATUSES);
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [expanded,   setExpanded]   = useState<number | null>(null);
  const [page,       setPage]       = useState(1);

  const [data,      setData]      = useState<AuditLogPage | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Typing shouldn't fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo(
    () => ({
      q: debouncedSearch,
      module: modFilter === ALL_MODULES ? undefined : modFilter,
      status: statFilter === ALL_STATUSES ? undefined : statFilter,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [debouncedSearch, modFilter, statFilter, dateFrom, dateTo]
  );

  // Any filter change invalidates the current page number.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setPage(1);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAuditLogs({ ...filters, page, perPage: PER_PAGE })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Impossible de charger l'historique."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, page]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportAuditLogs(filters);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export impossible.");
    } finally {
      setExporting(false);
    }
  }, [filters]);

  const entries = data?.items ?? [];
  const counts = data?.counts ?? { total: 0, success: 0, warnings: 0, errors: 0 };
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const modules = [ALL_MODULES, ...(data?.modules ?? [])];
  const statuses = [ALL_STATUSES, ...(data?.statuses ?? [])];
  const hasFilters =
    !!search || modFilter !== ALL_MODULES || statFilter !== ALL_STATUSES || !!dateFrom || !!dateTo;

  // Group the page's rows by day, keeping the server's ordering.
  const groups: { date: string; entries: AuditLogEntry[] }[] = [];
  entries.forEach((entry) => {
    const label = dayLabel(entry.created_at);
    const last = groups[groups.length - 1];
    if (last && last.date === label) last.entries.push(entry);
    else groups.push({ date: label, entries: [entry] });
  });

  const pct = (value: number) =>
    counts.total ? `${Math.round((value / counts.total) * 100)}% du total` : "—";

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>Historique & logs</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0" }}>Audit trail des actions administratives</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || total === 0}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: exporting || total === 0 ? "not-allowed" : "pointer", color: exporting || total === 0 ? "#C0C0C0" : "#4A4A4A", transition: "all 0.15s" }}
          onMouseEnter={e => { if (exporting || total === 0) return; const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "#1A1A1A"; b.style.color = "#1A1A1A"; }}
          onMouseLeave={e => { if (exporting || total === 0) return; const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "rgba(0,0,0,0.12)"; b.style.color = "#4A4A4A"; }}
        >
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {exporting ? "Export…" : "Exporter"}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, backgroundColor: "#FFEBEE", border: "1px solid #FECACA", color: "#CC0000", borderRadius: 9, padding: "12px 16px", fontSize: 12, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Stats cards — même style que les autres interfaces */}
      <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total des actions",  value: counts.total,    trendBg: "#F5F5F5", trendColor: "#6B6B6B", sub: hasFilters ? "Sur la période filtrée" : "Depuis le début", Icon: Activity },
          { label: "Succès",             value: counts.success,  trendBg: "#E8F5E9", trendColor: "#2E7D32", sub: pct(counts.success), Icon: CheckCircle2 },
          { label: "Avertissements",     value: counts.warnings, trendBg: "#FFF8E1", trendColor: "#E65100", sub: "À surveiller",       Icon: AlertTriangle },
          { label: "Erreurs / Échecs",   value: counts.errors,   trendBg: "#FFEBEE", trendColor: "#CC0000", sub: "Actions refusées",   Icon: XCircle      },
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
        <div className="search-field" style={{ flex: "1 1 220px" }}>
          <Search className="search-icon" size={16} />
          <input className="search-input" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par action, utilisateur, module…"
            name="datapilot-log-search" autoComplete="off" data-search=""
            style={{ fontSize: 13 }}
          />
        </div>

        {[
          { opts: modules,  val: modFilter,  set: setModFilter,  all: ALL_MODULES  },
          { opts: statuses, val: statFilter, set: setStatFilter, all: ALL_STATUSES },
        ].map(({ opts, val, set, all }, i) => (
          <div key={i} style={{ position: "relative" }}>
            <select value={val} onChange={e => set(e.target.value)}
              style={{ padding: "9px 30px 9px 13px", borderRadius: 8, fontSize: 12, fontWeight: 500, border: "1px solid rgba(0,0,0,0.09)", backgroundColor: "#fff", cursor: "pointer", appearance: "none", outline: "none", color: val === all ? "#9B9B9B" : "#1A1A1A", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              {opts.map(o => <option key={o}>{o}</option>)}
            </select>
            <ChevronDown size={11} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9B9B", pointerEvents: "none" }} />
          </div>
        ))}

        {/* Date range */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, backgroundColor: "#fff", borderRadius: 8, padding: "6px 12px", border: "1px solid rgba(0,0,0,0.09)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <span style={{ fontSize: 11, color: "#9B9B9B", fontWeight: 500, whiteSpace: "nowrap" }}>Du</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: 12, color: dateFrom ? "#1A1A1A" : "#9B9B9B", cursor: "pointer", backgroundColor: "transparent" }} />
          <span style={{ fontSize: 11, color: "#9B9B9B", fontWeight: 500 }}>au</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: 12, color: dateTo ? "#1A1A1A" : "#9B9B9B", cursor: "pointer", backgroundColor: "transparent" }} />
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button onClick={() => { setSearch(""); setModFilter(ALL_MODULES); setStatFilter(ALL_STATUSES); setDateFrom(""); setDateTo(""); }}
            style={{ fontSize: 12, color: "#CC0000", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "4px 8px", borderRadius: 6 }}>
            × Effacer
          </button>
        )}

        {loading && data && (
          <Loader2 size={14} className="animate-spin" style={{ color: "#9B9B9B" }} />
        )}
      </div>

      {/* Log groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20, opacity: loading && data ? 0.55 : 1, transition: "opacity 0.15s" }}>
        {groups.map(({ date, entries: dayEntries }) => (
          <div key={date}>
            {/* Date label */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4A4A4A" }}>{date}</span>
              <span style={{ fontSize: 11, color: "#9B9B9B", backgroundColor: "#E8E8E8", padding: "1px 8px", borderRadius: 20 }}>{dayEntries.length} action{dayEntries.length > 1 ? "s" : ""}</span>
              <div style={{ flex: 1, height: 1, backgroundColor: "rgba(0,0,0,0.08)" }} />
            </div>

            {/* Entries */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dayEntries.map(log => {
                const mc = modCfg[log.module] || { color: "#6B6B6B", bg: "#F5F5F5", Icon: Activity };
                const sc = stCfg[log.status] || FALLBACK_STATUS;
                const ModIcon = mc.Icon;
                const StIcon  = sc.Icon;
                const isOpen  = expanded === log.id;
                const reference = `LOG-${String(log.id).padStart(4, "0")}`;

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
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A", fontFamily: "monospace", minWidth: 44, flexShrink: 0 }}>{timeLabel(log.created_at)}</span>

                      {/* Status icon */}
                      <StIcon size={15} style={{ color: sc.color, flexShrink: 0 }} />

                      {/* Avatar */}
                      <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#FFE600", flexShrink: 0 }}>
                        {initials(log.actor_name)}
                      </div>

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{log.action}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#6B6B6B" }}>par <strong style={{ color: "#1A1A1A", fontWeight: 600 }}>{log.actor_name}</strong></div>
                      </div>

                      {/* Before → After pill (only if meaningful) */}
                      {(log.before || log.after) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, backgroundColor: "#F7F7F7", borderRadius: 6, padding: "5px 10px", flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: "#9B9B9B", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.before || "—"}</span>
                          <span style={{ fontSize: 10, color: "#C0C0C0" }}>→</span>
                          <span style={{ fontSize: 11, color: "#1A1A1A", fontWeight: 600, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.after || "—"}</span>
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
                          { label: "Référence",   value: reference,                       mono: true,  isStatus: false },
                          { label: "Date",        value: new Date(log.created_at).toLocaleString("fr-FR"), mono: true, isStatus: false },
                          { label: "Statut",      value: log.status,                      mono: false, isStatus: true  },
                          { label: "Module",      value: log.module,                      mono: false, isStatus: false },
                          { label: "Élément",     value: log.entity_label || "—",         mono: false, isStatus: false },
                          { label: "Avant",       value: log.before || "—",               mono: false, isStatus: false },
                          { label: "Après",       value: log.after || "—",                mono: false, isStatus: false },
                          { label: "Utilisateur", value: log.actor_email || log.actor_name, mono: false, isStatus: false },
                          { label: "Adresse IP",  value: log.ip || "—",                   mono: true,  isStatus: false },
                          // Whatever extra context the recorder attached to
                          // this particular action (changed fields, counts…).
                          ...Object.entries(log.details ?? {})
                            .filter(([, v]) => v !== null && v !== undefined && v !== "")
                            .map(([key, v]) => ({
                              label: key,
                              value: Array.isArray(v) ? v.join(", ") : String(v),
                              mono: false,
                              isStatus: false,
                            })),
                        ].map((f, fi) => (
                          <div key={fi} style={{ maxWidth: 320 }}>
                            <div style={{ fontSize: 10, color: "#9B9B9B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{f.label}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: f.isStatus ? sc.color : "#1A1A1A", fontFamily: f.mono ? "monospace" : "inherit", wordBreak: "break-word" }}>{f.value}</div>
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

        {loading && !data && (
          <div style={{ backgroundColor: "#fff", borderRadius: 9, border: "1px solid rgba(0,0,0,0.07)" }}>
            <AdminLoader variant="inline" label="Chargement de l'historique…" />
          </div>
        )}

        {!loading && entries.length === 0 && !error && (
          <div style={{ backgroundColor: "#fff", borderRadius: 9, border: "1px solid rgba(0,0,0,0.07)", padding: "48px 20px", textAlign: "center" }}>
            <Activity size={28} style={{ color: "#D0D0D0", marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4A4A4A" }}>
              {hasFilters ? "Aucune entrée trouvée" : "Aucune action enregistrée pour le moment"}
            </div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>
              {hasFilters
                ? "Modifiez vos critères de recherche ou de filtrage."
                : "Les actions effectuées depuis le back-office apparaîtront ici."}
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > PER_PAGE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, backgroundColor: "#fff", borderRadius: 9, border: "1px solid rgba(0,0,0,0.07)", padding: "12px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <span style={{ fontSize: 12, color: "#9B9B9B" }}>
            <strong style={{ color: "#1A1A1A" }}>{(page - 1) * PER_PAGE + 1}</strong>–<strong style={{ color: "#1A1A1A" }}>{Math.min(page * PER_PAGE, total)}</strong> sur <strong style={{ color: "#1A1A1A" }}>{total}</strong> entrées
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: page === 1 ? "#F5F5F5" : "#fff", color: page === 1 ? "#C0C0C0" : "#1A1A1A", cursor: page === 1 ? "not-allowed" : "pointer", transition: "all 0.15s" }}
            >← Précédent</button>

            <div style={{ display: "flex", gap: 4 }}>
              {pageWindow(page, totalPages).map(p => (
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
