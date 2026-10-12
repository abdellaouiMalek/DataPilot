import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowRight, ArrowUpRight, ClipboardList, TrendingUp, Users } from "lucide-react";
import { listUsers, countUsers } from "@/lib/adminUsers";
import { getMyAssessments } from "@/lib/assessment";
import type { AssessmentResult } from "@/lib/assessment";
import { getMaturityLevels } from "@/lib/config";
import type { MaturityLevel } from "@/lib/config";
import { AdminLoader } from "@/components/AdminLoader";
import { formatMonthYear, tint } from "@/lib/utils";
import { buildKpiCards, KpiCard } from "../superAdmin/AdminUsers";
import type { KpiStats } from "../superAdmin/AdminUsers";

/**
 * Tableau de bord de l'espace admin.
 *
 * Élargi au-delà des seuls indicateurs utilisateurs (version précédente) :
 * ajoute les évaluations de la banque -- même donnée que AdminEvaluations.tsx
 * (`getMyAssessments`, déjà élargie côté backend à toute la banque de
 * l'appelant) -- avec une courbe de score dans le temps, calquée sur celle
 * de DashboardPage.tsx (mêmes repères de palier) pour rester cohérente avec
 * ce que l'app affiche déjà ailleurs, et un aperçu des dernières évaluations
 * pour ne pas dupliquer toute la page Évaluations ici.
 *
 * Le tableau de bord super admin agrège aussi banques, dimensions, logs et
 * paramètres : autant de sections auxquelles l'admin n'a pas accès, d'où
 * une version dédiée plutôt qu'un filtrage de l'original.
 */
export function AdminDashboard() {
  const navigate = useNavigate();
  const [userStats, setUserStats] = useState<KpiStats | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  const [assessments, setAssessments] = useState<AssessmentResult[]>([]);
  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  const [evalLoading, setEvalLoading] = useState(true);
  const [evalError, setEvalError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listUsers({ max: 100 }), countUsers()])
      .then(([list, count]) => {
        if (cancelled) return;
        const DAY = 24 * 3600 * 1000;
        const now = Date.now();
        const pendingAges = list
          .filter(u => u.status === "En attente" && u.created_at)
          .map(u => Math.floor((now - Date.parse(u.created_at as string)) / DAY));
        setUserStats({
          total: count.count,
          active: list.filter(u => u.status === "Actif").length,
          admins: 0, // Non affiché ici (buildKpiCards + includeAdmins: false).
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
      .catch(() => { if (!cancelled) setUserError("Impossible de charger les statistiques utilisateurs."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMaturityLevels(), getMyAssessments()])
      .then(([levels, results]) => {
        if (cancelled) return;
        setMaturityLevels(levels);
        setAssessments(results);
      })
      .catch(() => !cancelled && setEvalError(true))
      .finally(() => !cancelled && setEvalLoading(false));
    return () => { cancelled = true; };
  }, []);

  const levelFor = (score: number) =>
    maturityLevels.find(l => score >= l.min_score && score <= l.max_score) ?? null;

  const chronological = useMemo(
    () => [...assessments]
      .filter(a => a.score_global != null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [assessments],
  );

  const trend = useMemo(
    () => chronological.map(a => ({ date: formatMonthYear(a.created_at), score: a.score_global as number })),
    [chronological],
  );

  const evalStats = useMemo(() => {
    const avg = chronological.length
      ? chronological.reduce((sum, a) => sum + (a.score_global ?? 0), 0) / chronological.length
      : null;
    return { total: assessments.length, avg };
  }, [assessments, chronological]);

  const recent = useMemo(
    () => [...assessments].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
    [assessments],
  );

  const evalKpiCards = [
    {
      label: "Évaluations", value: String(evalStats.total),
      sub: "Toute la banque", trend: "neutral" as const,
      icon: ClipboardList, detail: "Soumises par tous les utilisateurs",
    },
    {
      label: "Score moyen", value: evalStats.avg != null ? `${evalStats.avg.toFixed(1)}/5` : "-",
      sub: evalStats.avg != null ? (levelFor(evalStats.avg)?.label ?? "-") : "Aucune donnée", trend: "neutral" as const,
      icon: TrendingUp, detail: "Moyenne de toutes les évaluations",
    },
  ];

  return (
    <div style={{ padding: "28px 32px 40px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
          Tableau de bord
        </h1>
        <p style={{ fontSize: 13, color: "#6B6B6B", marginTop: 4 }}>
          Vue d'ensemble des utilisateurs et des évaluations de votre banque.
        </p>
      </div>

      {userError && (
        <div style={{ backgroundColor: "#FFEBEE", color: "#CC0000", borderRadius: 10, padding: "12px 16px", fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
          {userError}
        </div>
      )}

      {/* ── KPI cards -- utilisateurs + évaluations, même composant partagé ── */}
      {!userStats && !userError ? (
        <AdminLoader variant="inline" label="Chargement des statistiques…" />
      ) : (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
          {userStats && buildKpiCards(userStats, { includeAdmins: false }).map(
            (card, i) => <KpiCard key={`user-${i}`} card={card} />,
          )}
          {!evalLoading && !evalError && evalKpiCards.map(
            (card, i) => <KpiCard key={`eval-${i}`} card={card} />,
          )}
        </div>
      )}

      {/* ── Courbe de score + dernières évaluations ── */}
      {evalError ? (
        <div style={{ backgroundColor: "#FFEBEE", color: "#CC0000", borderRadius: 10, padding: "12px 16px", fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
          Impossible de charger les évaluations.
        </div>
      ) : evalLoading ? (
        <AdminLoader variant="inline" label="Chargement des évaluations…" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, alignItems: "stretch", marginBottom: 24 }}>
          {/* Courbe -- même configuration que DashboardPage.tsx (repères de palier inclus) */}
          <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", padding: "20px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>Évolution du score de maturité</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2, marginBottom: 14 }}>
              {trend.length > 1 ? "Un point par évaluation soumise, toute la banque confondue." : "Disponible à partir de la deuxième évaluation."}
            </div>
            {trend.length > 1 ? (
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="adminScoreFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FFE600" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#FFE600" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                    <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#00000020" }} />
                    <YAxis domain={[0, 5]} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#00000020" }} />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toFixed(2)} / 5`, "Score global"]}
                      contentStyle={{ border: "1px solid #00000010", borderRadius: 6, fontSize: 12 }}
                    />
                    {maturityLevels.slice(1).map(level => (
                      <ReferenceLine
                        key={level.id}
                        y={level.min_score}
                        stroke={level.color}
                        strokeDasharray="4 4"
                        label={{ value: level.label, position: "insideTopLeft", fontSize: 9, fill: "#9ca3af" }}
                      />
                    ))}
                    <Area
                      type="monotone" dataKey="score" stroke="#1A1A1A" strokeWidth={2.5}
                      fill="url(#adminScoreFill)"
                      dot={{ fill: "#FFE600", stroke: "#1A1A1A", strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#C0C0C0" }}>
                <TrendingUp size={28} style={{ marginBottom: 8 }} />
                <span style={{ fontSize: 12.5, color: "#9B9B9B" }}>Pas encore assez de données</span>
              </div>
            )}
          </div>

          {/* Dernières évaluations */}
          <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", padding: "20px 22px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>Dernières évaluations</div>
              <button
                onClick={() => navigate("/admin/evaluations")}
                style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", color: "#6B6B6B", fontSize: 11.5, fontWeight: 600 }}
              >
                Tout voir <ArrowRight size={11} />
              </button>
            </div>
            {recent.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#C0C0C0", textAlign: "center", padding: "20px 0" }}>
                <ClipboardList size={24} style={{ marginBottom: 8 }} />
                <span style={{ fontSize: 12, color: "#9B9B9B" }}>Aucune évaluation pour l'instant</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {recent.map(a => {
                  const level = a.score_global != null ? levelFor(a.score_global) : null;
                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/admin/evaluations/${a.id}`)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 6px", borderRadius: 6, border: "none", background: "none", cursor: "pointer", textAlign: "left", transition: "background-color 0.12s" }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FAFAFA"}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: level ? tint(level.color, "0.16") : "#F0F0F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <ClipboardList size={13} style={{ color: level?.color ?? "#9B9B9B" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.department || "Département non renseigné"}
                        </div>
                        <div style={{ fontSize: 11, color: "#9B9B9B" }}>{formatMonthYear(a.created_at)}</div>
                      </div>
                      {a.score_global != null && (
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1A1A1A", flexShrink: 0 }}>{a.score_global.toFixed(1)}</div>
                      )}
                      <ArrowUpRight size={12} style={{ color: "#C0C0C0", flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate("/admin/users")}
        style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          backgroundColor: "#1A1A1A", color: "#fff",
          border: "none", borderRadius: 10,
          padding: "12px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}
      >
        <Users size={16} />
        Gérer les utilisateurs
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
