/**
 * Tableau de bord du back-office.
 *
 * Toutes les valeurs affichées viennent de `/api/super-admin/dashboard` : un
 * seul appel agrégé côté serveur, pour que les chiffres d'une carte à l'autre
 * proviennent de la même lecture et ne puissent pas se contredire.
 *
 * Deux points à connaître avant de lire les graphiques :
 *
 * - une évaluation n'existe qu'une fois soumise (rien n'est persisté pendant
 *   la saisie), il n'y a donc pas de série « en cours » à tracer : la courbe
 *   suit les soumissions, les banques évaluées sur la période, et les banques
 *   nouvellement ouvertes ;
 * - « Questions publiées » compte les questions de la version active, pas
 *   celles des tables vivantes : c'est ce que voient réellement les
 *   répondants, les éditions non publiées n'y figurent pas.
 *
 * Les comptes utilisateurs viennent de Keycloak ; s'il est injoignable le
 * backend renvoie `users_available: false` et la page affiche « - » plutôt
 * qu'un zéro trompeur.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Building2, HelpCircle, GitBranch, Activity,
  AlertTriangle, AlertCircle, CheckCircle2,
  ArrowRight, ChevronRight, TrendingUp, TrendingDown,
  Loader2, MoreHorizontal, Minus,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  getDashboard,
  type Dashboard,
  type DashboardAlert,
  type TrendRange,
} from "@/lib/adminDashboard";
import { ROLE_LABELS } from "@/lib/adminUsers";
import { routeFor } from "@/lib/adminRoutes";
import { modCfg } from "@/lib/auditModules";
import { AdminLoader } from "@/components/AdminLoader";

// ── Palette ────────────────────────────────────────────────────────────────────
const EY = { black: "#1A1A1A", yellow: "#FFE600", gray: "#F2F2F2", mid: "#6B6B6B", light: "#E8E8E8" };

const TONES = {
  up:      { color: "#2E7D32", bg: "#E8F5E9" },
  down:    { color: "#CC0000", bg: "#FFEBEE" },
  info:    { color: "#1565C0", bg: "#E3F2FD" },
  neutral: { color: "#6B6B6B", bg: "#F2F2F2" },
} as const;

/** Libellés des boutons de période ↔ paramètre attendu par l'API. */
const RANGES: { label: string; value: TrendRange }[] = [
  { label: "7 jours",  value: "7d"  },
  { label: "30 jours", value: "30d" },
  { label: "12 mois",  value: "12m" },
];

/** Une teinte par rôle métier, du plus au moins privilégié. */
const ROLE_COLORS: Record<string, string> = {
  super_admin: "#1A1A1A",
  admin:       "#4A4A4A",
  consultant:  "#FFE600",
  validateur:  "#8A8A8A",
  repondant:   "#B8B8B8",
  none:        "#DCDCDC",
};

const ALERT_STYLES = {
  critical: { dotBg: "#FFEBEE", dotColor: "#C62828", label: "Critique",  Icon: AlertTriangle },
  warning:  { dotBg: "#FFF8E1", dotColor: "#E65100", label: "Attention", Icon: AlertCircle   },
  info:     { dotBg: "#E3F2FD", dotColor: "#1565C0", label: "Info",      Icon: AlertCircle   },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      backgroundColor: "#fff",
      borderRadius: 12,
      border: "1px solid rgba(0,0,0,0.06)",
      boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      overflow: "hidden",
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ title, action, actionLabel }: { title: string; action?: () => void; actionLabel?: string }) {
  return (
    <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: EY.black, letterSpacing: "-0.01em" }}>{title}</span>
      {actionLabel && (
        <button onClick={action} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: EY.mid, background: "none", border: "none", cursor: "pointer" }}>
          {actionLabel} <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

/** Message centré, pour une carte dont la source de données est vide. */
function Empty({ text }: { text: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 20px", fontSize: 12, color: "#9B9B9B", textAlign: "center" }}>
      {text}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const c: Record<string, string> = { "Actif": "#2E7D32", "Désactivé": "#E65100", "Archivé": "#9B9B9B" };
  return <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: c[status] || "#9B9B9B", display: "inline-block" }} />;
}

function ScoreBar({ value }: { value: number | null }) {
  const color = value == null ? "#9B9B9B" : value >= 4 ? "#2E7D32" : value >= 3 ? "#E65100" : "#9B9B9B";
  const pct = value ? (value / 5) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, backgroundColor: "#F0F0F0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 38, textAlign: "right" }}>
        {value == null ? "-" : `${value.toFixed(1)}/5`}
      </span>
    </div>
  );
}

const CustomAreaTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: "#1A1A1A", borderRadius: 8, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: p.color, display: "inline-block" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{p.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginLeft: "auto" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: "#1A1A1A", borderRadius: 8, padding: "9px 13px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#FFE600" }}>Maturité : {payload[0]?.value} / 5</div>
    </div>
  );
};

/** "14:32" pour aujourd'hui, "12/06" sinon, le fil tient sur une ligne. */
function activityTime(iso: string): string {
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

const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR") : "-";

/** Pastille de variation d'une tuile : signe, teinte et icône cohérents. */
function delta(count: number): { text: string; tone: keyof typeof TONES } {
  if (count > 0) return { text: `+${count}`, tone: "up" };
  if (count < 0) return { text: `${count}`, tone: "down" };
  return { text: "Stable", tone: "neutral" };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const navigate = useNavigate();
  const nav = (page: string) => navigate(routeFor(page));

  const [range, setRange] = useState<TrendRange>("12m");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((next: TrendRange) => {
    let cancelled = false;
    setLoading(true);
    getDashboard(next)
      .then(payload => { if (!cancelled) { setData(payload); setError(null); } })
      .catch(() => { if (!cancelled) setError("Impossible de charger le tableau de bord."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => load(range), [load, range]);

  // Les tuiles restent affichées pendant un changement de période : seul le
  // libellé du bouton actif et le petit spinner signalent le rechargement.
  const kpis = data?.kpis;
  const usersKnown = data?.users_available ?? false;

  const roleTotal = (data?.roles ?? []).reduce((sum, slice) => sum + slice.value, 0);
  const roleData = (data?.roles ?? []).map(slice => ({
    name: slice.role === "none" ? "Sans rôle" : ROLE_LABELS[slice.role],
    value: slice.value,
    color: ROLE_COLORS[slice.role] ?? "#DCDCDC",
  }));

  const tiles = kpis ? [
    {
      label: "Utilisateurs actifs",
      value: usersKnown ? String(kpis.active_users) : "-",
      ...(usersKnown ? delta(kpis.new_users_30d) : { text: "Indisponible", tone: "neutral" as const }),
      icon: Users,
    },
    {
      label: "Banques clientes",
      value: String(kpis.banks),
      ...delta(kpis.new_banks_30d),
      icon: Building2,
    },
    {
      label: "Questions publiées",
      value: String(kpis.questions),
      ...delta(kpis.questions_delta),
      icon: HelpCircle,
    },
    {
      label: "Version active",
      value: kpis.active_version ?? "-",
      text: kpis.active_version_label,
      tone: (kpis.active_version ? "info" : "down") as keyof typeof TONES,
      icon: GitBranch,
    },
    {
      label: "Évaluations soumises",
      value: String(kpis.assessments),
      ...delta(kpis.assessments_30d),
      icon: Activity,
    },
  ] : [];

  const errorBanner = error && (
    <div style={{ backgroundColor: "#FFEBEE", color: "#CC0000", borderRadius: 10, padding: "14px 18px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <AlertTriangle size={16} />
      {error}
      <button
        onClick={() => load(range)}
        style={{ marginLeft: "auto", background: "#CC0000", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
      >
        Réessayer
      </button>
    </div>
  );

  // Un échec sur un simple changement de période ne doit pas vider la page :
  // on garde les chiffres déjà chargés et on signale l'échec au-dessus.
  if (error && !data) {
    return (
      <div style={{ padding: "24px 28px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>
        {errorBanner}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: "24px 28px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>
        <AdminLoader label="Chargement du tableau de bord…" />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* ── Row 0 : greeting + date ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: EY.black, margin: 0, letterSpacing: "-0.02em" }}>
            Tableau de bord
          </h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "3px 0 0" }}>
            Plateforme EY DataMaturity
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <Loader2 size={14} className="animate-spin" style={{ color: "#9B9B9B" }} />}
          {RANGES.map(r => (
            <button key={r.value} onClick={() => setRange(r.value)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
              backgroundColor: range === r.value ? EY.black : "#fff",
              color: range === r.value ? "#FFE600" : EY.mid,
              boxShadow: range === r.value ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
              transition: "all 0.15s",
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {errorBanner}

      {!usersKnown && (
        <div style={{ marginBottom: 16, backgroundColor: "#FFF8E1", color: "#8A5300", border: "1px solid #F5DFA0", borderRadius: 10, padding: "10px 14px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={14} />
          Annuaire des comptes injoignable : les indicateurs utilisateurs sont temporairement indisponibles.
        </div>
      )}

      {/* ── Row 1 : KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 18 }}>
        {tiles.map((k, i) => {
          const Icon = k.icon;
          const tone = TONES[k.tone];
          const TrendIcon = k.tone === "up" ? TrendingUp : k.tone === "down" ? TrendingDown : Minus;
          return (
            <div key={i}
              style={{
                backgroundColor: "#fff", borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.06)",
                boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
                padding: "18px 18px 14px",
                borderTop: `3px solid ${EY.yellow}`,
                position: "relative", overflow: "hidden",
                transition: "box-shadow 0.15s, transform 0.12s",
                cursor: "default",
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; el.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 1px 6px rgba(0,0,0,0.05)"; el.style.transform = "translateY(0)"; }}
            >
              <div style={{ position: "absolute", top: 14, right: 14, opacity: 0.06 }}>
                <Icon size={52} style={{ color: EY.black }} />
              </div>
              <div style={{ fontSize: 11, color: "#9B9B9B", fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: EY.black, letterSpacing: "-0.03em", lineHeight: 1 }}>{k.value}</div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 10, backgroundColor: tone.bg, color: tone.color, borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>
                {k.tone !== "info" && <TrendIcon size={10} />} {k.text}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Row 2 : Area chart (large) + Donut ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16, marginBottom: 16 }}>

        {/* Area chart */}
        <Card>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: EY.black }}>Évolution des évaluations</div>
              <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>Soumissions · Banques évaluées · Nouvelles banques</div>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              {[
                { label: "Soumissions",      color: EY.black },
                { label: "Banques évaluées", color: EY.yellow },
                { label: "Nouvelles",        color: "#B8B8B8" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
                  <span style={{ fontSize: 11, color: EY.mid }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: "16px 12px 12px" }}>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={data.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gBlack" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#1A1A1A" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#1A1A1A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gYellow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#FFE600" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#FFE600" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gGray" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#B8B8B8" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#B8B8B8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                {/* 30 points quotidiens ne tiennent pas en 30 étiquettes : on
                    garde les extrêmes et on laisse Recharts espacer le reste. */}
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9B9B9B" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9B9B9B" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomAreaTooltip />} />
                <Area type="monotone" dataKey="evaluations"       name="Soumissions"      stroke="#1A1A1A" strokeWidth={2.5} fill="url(#gBlack)"  dot={false} activeDot={{ r: 4, fill: "#1A1A1A" }} />
                <Area type="monotone" dataKey="banques"           name="Banques évaluées" stroke="#FFE600" strokeWidth={2}   fill="url(#gYellow)" dot={false} activeDot={{ r: 4, fill: "#FFE600" }} />
                <Area type="monotone" dataKey="nouvelles_banques" name="Nouvelles"        stroke="#B8B8B8" strokeWidth={1.5} fill="url(#gGray)"   dot={false} activeDot={{ r: 3, fill: "#B8B8B8" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Donut */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <CardHeader title="Répartition utilisateurs" actionLabel="Gérer" action={() => nav("users")} />
            {roleData.length === 0 ? (
              <Empty text={usersKnown ? "Aucun compte enregistré." : "Annuaire indisponible."} />
            ) : (
              <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ position: "relative", width: 130, height: 130 }}>
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart>
                      <Pie data={roleData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2} dataKey="value" strokeWidth={0}>
                        {roleData.map((slice, i) => <Cell key={i} fill={slice.color} />)}
                      </Pie>
                      <Tooltip formatter={(val, name) => [val as number, name as string]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: EY.black, lineHeight: 1 }}>{roleTotal}</div>
                    <div style={{ fontSize: 9, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.06em" }}>total</div>
                  </div>
                </div>
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                  {roleData.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: r.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#4A4A4A", flex: 1 }}>{r.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: EY.black }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Row 3 : Bar chart + Alerts timeline + Activity ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16, alignItems: "stretch" }}>

        {/* Bar chart */}
        <div style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <CardHeader title="Score de maturité par banque" actionLabel="Voir tout" action={() => nav("banks")} />
          {data.bank_scores.length === 0 ? (
            <Empty text="Aucune banque n'a encore d'évaluation soumise." />
          ) : (
            <div style={{ flex: 1, padding: "14px 12px 0px", display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, minHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.bank_scores} margin={{ top: 0, right: 4, left: -24, bottom: 0 }} barSize={26}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9B9B9B" }} axisLine={false} tickLine={false} interval={0} tickFormatter={(name: string) => name.length > 10 ? `${name.slice(0, 9)}…` : name} />
                    <YAxis domain={[0, 5]} ticks={[0,1,2,3,4,5]} tick={{ fontSize: 11, fill: "#9B9B9B" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                    <Bar dataKey="score" radius={[5, 5, 0, 0]}>
                      {data.bank_scores.map((entry, i) => (
                        <Cell key={i} fill={entry.score >= 4 ? EY.black : entry.score >= 3 ? "#4A4A4A" : "#C0C0C0"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 12, padding: "12px 4px 14px", borderTop: "1px solid rgba(0,0,0,0.05)", marginTop: 4 }}>
                {[
                  { label: "≥ 4 Maîtrisé", color: EY.black },
                  { label: "3-4 Défini",   color: "#4A4A4A" },
                  { label: "< 3 En dev.",  color: "#C0C0C0" },
                ].map(l => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: EY.mid }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Alerts, timeline style */}
        <div style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <CardHeader title="Alertes de configuration" />
          {data.alerts.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }}>
              <CheckCircle2 size={26} style={{ color: "#2E7D32" }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: "#2E7D32" }}>Aucune anomalie de configuration</div>
            </div>
          ) : (
            <div style={{ flex: 1, padding: "20px", overflowY: "auto", maxHeight: 320 }}>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 15, top: 16, bottom: 0, width: 1.5, backgroundColor: "rgba(0,0,0,0.07)" }} />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {data.alerts.map((a: DashboardAlert, i) => {
                    const cfg = ALERT_STYLES[a.level];
                    const Icon = cfg.Icon;
                    return (
                      <div key={a.code} style={{ display: "flex", gap: 14, paddingBottom: i < data.alerts.length - 1 ? 22 : 0 }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, backgroundColor: cfg.dotBg, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${cfg.dotColor}30`, position: "relative", zIndex: 1 }}>
                          <Icon size={11} style={{ color: cfg.dotColor }} />
                        </div>
                        <div style={{ flex: 1, paddingTop: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.dotColor, backgroundColor: cfg.dotBg, borderRadius: 4, padding: "1px 7px", marginBottom: 4, display: "inline-block" }}>{cfg.label}</span>
                          <div style={{ fontSize: 12, fontWeight: 500, color: EY.black, lineHeight: 1.45, marginBottom: 5 }}>{a.text}</div>
                          <button onClick={() => nav(a.target)} style={{ fontSize: 11, fontWeight: 600, color: cfg.dotColor, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 3 }}>
                            {a.action} <ArrowRight size={10} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <CardHeader title="Activité récente" actionLabel="Tout voir" action={() => nav("logs")} />
          {data.activity.length === 0 ? (
            <Empty text="Aucune action enregistrée pour l'instant." />
          ) : (
            <div style={{ flex: 1, overflowY: "auto", maxHeight: 320 }}>
              {data.activity.map((a, i) => {
                const cfg = modCfg[a.module] ?? { color: EY.mid, bg: "#F5F5F5", Icon: Activity };
                const Icon = cfg.Icon;
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 16px", borderBottom: i < data.activity.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={13} style={{ color: cfg.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: EY.black, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.action}>{a.action}</div>
                      <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 1 }}>{a.actor_name}</div>
                    </div>
                    <span style={{ fontSize: 10, color: "#C0C0C0", flexShrink: 0, marginTop: 2 }}>{activityTime(a.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4 : Banks table ── */}
      <Card>
        <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: EY.black }}>Banques clientes</span>
            <span style={{ fontSize: 11, color: "#9B9B9B", marginLeft: 8 }}>
              {data.banks.filter(b => b.status === "Actif").length} actives sur {data.banks.length}
            </span>
          </div>
          <button onClick={() => nav("banks")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", color: EY.black, transition: "all 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = EY.black; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fff"; (e.currentTarget as HTMLButtonElement).style.color = EY.black; }}
          >
            Voir toutes <ArrowRight size={12} />
          </button>
        </div>
        {data.banks.length === 0 ? (
          <Empty text="Aucune banque enregistrée." />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#FAFAFA" }}>
                {["Banque", "Utilisateurs", "Score maturité", "Statut", "Dernière évaluation", ""].map(h => (
                  <th key={h} style={{ padding: "9px 18px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#9B9B9B", letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Aperçu seulement : la liste complète est sur la page Banques. */}
              {data.banks.slice(0, 8).map((b, i, shown) => (
                <tr key={b.id}
                  style={{ borderBottom: i < shown.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none", transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#FAFAFA"}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "transparent"}
                >
                  <td style={{ padding: "12px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Building2 size={13} style={{ color: "#4A4A4A" }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: EY.black }}>{b.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 18px", fontSize: 13, color: "#4A4A4A" }}>{b.users ?? "-"}</td>
                  <td style={{ padding: "12px 18px", width: 180 }}><ScoreBar value={b.score} /></td>
                  <td style={{ padding: "12px 18px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
                      backgroundColor: b.status === "Actif" ? "#E8F5E9" : b.status === "Désactivé" ? "#FFF8E1" : "#F5F5F5",
                      color: b.status === "Actif" ? "#2E7D32" : b.status === "Désactivé" ? "#E65100" : "#9B9B9B",
                      borderRadius: 20, padding: "3px 10px" }}>
                      <StatusDot status={b.status} /> {b.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 18px", fontSize: 12, color: "#9B9B9B" }}>{dateLabel(b.last_assessment_at)}</td>
                  <td style={{ padding: "12px 18px" }}>
                    <button onClick={() => nav("banks")} title="Ouvrir la gestion des banques" style={{ width: 26, height: 26, borderRadius: 5, border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9B9B9B" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = EY.black; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fff"; (e.currentTarget as HTMLButtonElement).style.color = "#9B9B9B"; }}
                    >
                      <MoreHorizontal size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
