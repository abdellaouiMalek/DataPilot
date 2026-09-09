import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight, Award, Calendar, ChevronDown, ClipboardCheck, ClipboardList,
  Search, TrendingUp,
} from "lucide-react";
import { AdminLoader } from "@/components/AdminLoader";
import { getMyAssessments } from "@/lib/assessment";
import type { AssessmentResult } from "@/lib/assessment";
import { getMaturityLevels } from "@/lib/config";
import type { MaturityLevel } from "@/lib/config";
import { tint, formatMonthYear } from "@/lib/utils";

const PAGE_SIZES = [10, 20, 50];
type SortKey = "date" | "score";

/**
 * "Évaluations" de l'espace admin : les résultats soumis par les
 * utilisateurs de la banque de l'admin connecté.
 *
 * Réutilise exactement la même donnée que HistoriquePage.tsx
 * (`getMyAssessments`, déjà élargie côté backend à toute la banque de
 * l'appelant -- voir assessments.py `list_my_assessments`). La mise en
 * page (fond gris, carte de filtres, tableau, pied de pagination) copie
 * volontairement AdminUsers.tsx trait pour trait plutôt que d'inventer une
 * variante : c'est la même personne qui navigue entre "Gestion des
 * utilisateurs" et "Évaluations" dans le même espace, elles doivent se
 * sentir comme deux vues d'un seul outil.
 *
 * "Voir" ouvre AdminEvaluationDetail.tsx (même châssis admin), jamais
 * ResultsPage.tsx (chrome public, actions personnelles) -- un admin qui
 * consulte le dossier d'un collègue reste dans son propre espace.
 */
export function AdminEvaluations() {
  const navigate = useNavigate();
  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  const [assessments, setAssessments] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("Tous les niveaux");
  const [focusLevel, setFocusLevel] = useState(false);
  const [sort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMaturityLevels(), getMyAssessments()])
      .then(([levels, results]) => {
        if (cancelled) return;
        setMaturityLevels(levels);
        setAssessments(results);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const levelFor = (score: number) =>
    maturityLevels.find(l => score >= l.min_score && score <= l.max_score) ?? null;

  const latestId = useMemo(
    () => assessments.reduce<{ id: number; at: string } | null>(
      (best, a) => (!best || a.created_at > best.at) ? { id: a.id, at: a.created_at } : best,
      null,
    )?.id,
    [assessments],
  );

  const stats = useMemo(() => {
    const scored = assessments.filter(a => a.score_global != null);
    const avg = scored.length
      ? scored.reduce((sum, a) => sum + (a.score_global ?? 0), 0) / scored.length
      : null;
    const best = scored.length
      ? scored.reduce((m, a) => (a.score_global! > m.score_global! ? a : m))
      : null;
    const mostRecent = assessments.length
      ? assessments.reduce((m, a) => (a.created_at > m.created_at ? a : m))
      : null;
    return { total: assessments.length, avg, best, mostRecent };
  }, [assessments]);

  const filtered = useMemo(() => assessments.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || `${a.department ?? ""} ${a.evaluator_role ?? ""}`.toLowerCase().includes(q);
    const matchLevel = levelFilter === "Tous les niveaux"
      || (a.score_global != null && levelFor(a.score_global)?.label === levelFilter);
    return matchSearch && matchLevel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [assessments, search, levelFilter, maturityLevels]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const diff = sort.key === "date"
      ? a.created_at.localeCompare(b.created_at)
      : (a.score_global ?? 0) - (b.score_global ?? 0);
    return diff * sort.dir;
  }), [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageNumbers: number[] = [];
  {
    const end = Math.min(totalPages, Math.max(1, currentPage - 2) + 4);
    for (let p = Math.max(1, end - 4); p <= end; p++) pageNumbers.push(p);
  }

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>
          Évaluations
        </h1>
        <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0", fontWeight: 400 }}>
          Résultats soumis par les utilisateurs de votre banque
        </p>
      </div>

      {loadError && (
        <div style={{ backgroundColor: "#FFEBEE", color: "#CC0000", borderRadius: 10, padding: "12px 16px", fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
          Impossible de charger les évaluations.
        </div>
      )}

      {loading ? (
        <AdminLoader variant="inline" label="Chargement des évaluations…" />
      ) : !loadError && (
        <>
          {/* ── KPI cards ── */}
          <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
            <StatTile icon={ClipboardList} label="Évaluations" value={String(stats.total)} sub="Toute la banque" />
            <StatTile icon={TrendingUp} label="Score moyen" value={stats.avg != null ? `${stats.avg.toFixed(1)}/5` : "-"} sub={stats.avg != null ? (levelFor(stats.avg)?.label ?? "") : "Aucune donnée"} />
            <StatTile icon={Award} label="Meilleure évaluation" value={stats.best ? `${stats.best.score_global!.toFixed(1)}/5` : "-"} sub={stats.best?.department || "-"} />
            <StatTile icon={Calendar} label="Dernière évaluation" value={stats.mostRecent ? formatMonthYear(stats.mostRecent.created_at) : "-"} sub={stats.mostRecent?.department || "-"} />
          </div>

          {/* ── Filters bar -- même carte que AdminUsers.tsx ── */}
          <div style={{
            backgroundColor: "#fff",
            border: "1px solid rgba(0,0,0,0.07)",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 12,
            display: "flex", gap: 10, alignItems: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            <div className="search-field" style={{ flex: 1 }}>
              <Search className="search-icon" size={16} />
              <input
                className="search-input"
                value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Rechercher par département ou rôle..."
                name="datapilot-evaluations-search"
                autoComplete="off"
                style={{ fontSize: 13 }}
              />
            </div>

            <div style={{ position: "relative" }}>
              <select
                value={levelFilter} onChange={e => { setLevelFilter(e.target.value); setPage(1); }}
                onFocus={() => setFocusLevel(true)}
                onBlur={() => setFocusLevel(false)}
                style={{
                  padding: "8px 30px 8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                  border: `1.5px solid ${focusLevel ? "#1A1A1A" : "rgba(0,0,0,0.10)"}`,
                  backgroundColor: "#fff",
                  color: levelFilter === "Tous les niveaux" ? "#9B9B9B" : "#1A1A1A",
                  cursor: "pointer", appearance: "none", outline: "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                  boxShadow: focusLevel ? "0 0 0 3px rgba(26,26,26,0.08)" : "none",
                }}
              >
                <option>Tous les niveaux</option>
                {maturityLevels.map(l => <option key={l.id}>{l.label}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9B9B", pointerEvents: "none" }} />
            </div>
          </div>

          {/* ── Table ── */}
          <div style={{
            backgroundColor: "#fff",
            border: "1px solid rgba(0,0,0,0.07)",
            borderRadius: 8, overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            {sorted.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center" }}>
                <ClipboardList size={32} style={{ color: "#D0D0D0", marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: "#4A4A4A" }}>
                  {assessments.length === 0 ? "Aucune évaluation pour l'instant" : "Aucun résultat pour ces filtres"}
                </div>
                <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>
                  {assessments.length === 0
                    ? "Les résultats des utilisateurs de votre banque apparaîtront ici."
                    : "Modifiez votre recherche ou changez de niveau."}
                </div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#FAFAFA", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                      {["Évaluation", "Score", "Niveau", "Date", "Actions"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#9B9B9B", letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((a, i) => {
                      const score = a.score_global ?? 0;
                      const level = a.score_global != null ? levelFor(score) : null;
                      return (
                        <tr
                          key={a.id}
                          style={{ borderBottom: i < paged.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", transition: "background 0.1s" }}
                          onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#FAFAFA"}
                          onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "transparent"}
                        >
                          {/* Évaluation (icône + département/rôle, même rythme que la colonne Utilisateur) */}
                          <td style={{ padding: "13px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                              <div style={{
                                width: 34, height: 34, borderRadius: "50%",
                                backgroundColor: level ? tint(level.color, "0.16") : "#F0F0F0",
                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                              }}>
                                <ClipboardCheck size={15} style={{ color: level?.color ?? "#9B9B9B" }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{a.department || "Département non renseigné"}</div>
                                <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 1 }}>{a.evaluator_role || "-"} · Dossier #{a.id}</div>
                              </div>
                            </div>
                          </td>

                          {/* Score */}
                          <td style={{ padding: "13px 16px" }}>
                            {a.score_global != null ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: "#1A1A1A", minWidth: 30 }}>{score.toFixed(1)}</span>
                                <div style={{ display: "flex", gap: 2 }}>
                                  {Array.from({ length: 5 }, (_, k) => k + 1).map(k => (
                                    <div key={k} style={{ width: 12, height: 5, borderRadius: 2, backgroundColor: k <= Math.round(score) ? (level?.color ?? "#1A1A1A") : "#EBEBEB" }} />
                                  ))}
                                </div>
                              </div>
                            ) : <span style={{ fontSize: 13, color: "#C0C0C0" }}>-</span>}
                          </td>

                          {/* Niveau */}
                          <td style={{ padding: "13px 16px" }}>
                            {level && (
                              <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: level.color, backgroundColor: tint(level.color, "0.14") }}>
                                {level.label}
                              </span>
                            )}
                          </td>

                          {/* Date */}
                          <td style={{ padding: "13px 16px" }}>
                            <div style={{ fontSize: 13, color: "#4A4A4A", fontWeight: 500 }}>{formatMonthYear(a.created_at)}</div>
                            {a.id === latestId && (
                              <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", backgroundColor: "#FFE600", color: "#1A1A1A", padding: "1px 6px", borderRadius: 4, marginTop: 3 }}>
                                DERNIÈRE
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: "13px 16px" }}>
                            <button
                              onClick={() => navigate(`/admin/evaluations/${a.id}`)}
                              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#1A1A1A", fontSize: 12, fontWeight: 700, transition: "border-color 0.12s, background-color 0.12s" }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; b.style.borderColor = "#1A1A1A"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#1A1A1A"; b.style.borderColor = "rgba(0,0,0,0.12)"; }}
                            >
                              Voir <ArrowUpRight size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination strip -- même pied que AdminUsers.tsx */}
            {sorted.length > 0 && (
              <div style={{
                padding: "12px 20px", borderTop: "1px solid rgba(0,0,0,0.06)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                backgroundColor: "#FAFAFA", flexWrap: "wrap", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 12, color: "#9B9B9B" }}>
                    Affichage de{" "}
                    <strong style={{ color: "#1A1A1A" }}>
                      {sorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{(currentPage - 1) * pageSize + paged.length}
                    </strong>{" "}
                    sur <strong style={{ color: "#1A1A1A" }}>{sorted.length}</strong> évaluation{sorted.length !== 1 ? "s" : ""}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <select
                      value={pageSize}
                      onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                      style={{ padding: "4px 8px", borderRadius: 5, fontSize: 12, fontWeight: 500, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", color: "#4A4A4A", cursor: "pointer", outline: "none" }}
                    >
                      {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
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
                    <button
                      key={p}
                      onClick={() => setPage(p)}
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
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Stat tile -- même ADN visuel que KpiCard (AdminUsers.tsx) : carte
// blanche, bordure supérieure jaune, icône en filigrane, survol qui
// soulève la carte. Pas le même composant (KpiCard est typé pour la
// forme spécifique des KPI utilisateurs), mais délibérément la même
// signature visuelle pour que cette page se sente native à l'espace admin.
function StatTile({ icon: Icon, label, value, sub }: {
  icon: typeof ClipboardList; label: string; value: string; sub: string;
}) {
  return (
    <div
      style={{
        flex: 1, minWidth: 180,
        backgroundColor: "#fff",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
        padding: "18px 18px 14px",
        borderTop: "3px solid #FFE600",
        position: "relative", overflow: "hidden",
        transition: "box-shadow 0.15s, transform 0.12s",
      }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; el.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 1px 6px rgba(0,0,0,0.05)"; el.style.transform = "translateY(0)"; }}
    >
      <div style={{ position: "absolute", top: 14, right: 14, opacity: 0.06 }}>
        <Icon size={52} style={{ color: "#1A1A1A" }} />
      </div>
      <div style={{ fontSize: 11, color: "#9B9B9B", fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 600, color: "#6B6B6B" }}>{sub}</div>}
    </div>
  );
}
