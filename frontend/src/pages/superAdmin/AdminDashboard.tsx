import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Building2, HelpCircle, GitBranch, Activity,
  AlertTriangle, AlertCircle, CheckCircle2, Clock,
  ArrowUpRight, ArrowRight, ChevronRight, TrendingUp,
  Layers, SlidersHorizontal, Edit3, UserPlus, Upload,
  UserX, BarChart2, Shield, ChevronDown, MoreHorizontal,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from "recharts";

// ── Palette ────────────────────────────────────────────────────────────────────
const EY = { black: "#1A1A1A", yellow: "#FFE600", gray: "#F2F2F2", mid: "#6B6B6B", light: "#E8E8E8" };

// ── Mock data ─────────────────────────────────────────────────────────────────

const evaluationTrend = [
  { mois: "Jan", complétions: 3, enCours: 2, nouvelles: 1 },
  { mois: "Fév", complétions: 5, enCours: 3, nouvelles: 2 },
  { mois: "Mar", complétions: 4, enCours: 4, nouvelles: 3 },
  { mois: "Avr", complétions: 8, enCours: 3, nouvelles: 4 },
  { mois: "Mai", complétions: 11, enCours: 5, nouvelles: 6 },
  { mois: "Jun", complétions: 9, enCours: 6, nouvelles: 4 },
  { mois: "Jul", complétions: 13, enCours: 4, nouvelles: 7 },
  { mois: "Aoû", complétions: 10, enCours: 7, nouvelles: 5 },
  { mois: "Sep", complétions: 15, enCours: 5, nouvelles: 8 },
  { mois: "Oct", complétions: 18, enCours: 6, nouvelles: 9 },
  { mois: "Nov", complétions: 22, enCours: 8, nouvelles: 11 },
  { mois: "Déc", complétions: 28, enCours: 9, nouvelles: 14 },
];

const completionsByBank = [
  { banque: "BIAT",    score: 4.1 },
  { banque: "STB",     score: 3.2 },
  { banque: "BNA",     score: 3.8 },
  { banque: "Attijari",score: 4.3 },
  { banque: "BH Bank", score: 2.9 },
  { banque: "UIB",     score: 3.5 },
  { banque: "Amen",    score: 2.4 },
];

const userRoles = [
  { name: "Admin EY",          value: 3,  color: EY.black },
  { name: "Consultant EY",     value: 12, color: EY.yellow },
  { name: "Répondant Banque",  value: 24, color: "#4A4A4A" },
  { name: "Validateur Banque", value: 9,  color: "#B8B8B8" },
];

const activities = [
  { icon: Upload,   module: "Versions",      moduleColor: "#1565C0", moduleBg: "#E3F2FD", user: "A. Dupont",  time: "14:32", action: "Publication questionnaire v2.1" },
  { icon: Edit3,    module: "Questionnaire", moduleColor: "#3730A3", moduleBg: "#EEF2FF", user: "M. Bernard", time: "14:28", action: "Modification Q-042 — Gouvernance" },
  { icon: UserPlus, module: "Utilisateurs",  moduleColor: "#166534", moduleBg: "#F0FDF4", user: "S. Martin",  time: "13:55", action: "Création compte j.rousseau@bnpparibas.fr" },
  { icon: Layers,   module: "Dimensions",    moduleColor: "#6B21A8", moduleBg: "#FDF4FF", user: "A. Dupont",  time: "12:10", action: "Ajout dimension Analytics & Valorisation" },
  { icon: UserX,    module: "Utilisateurs",  moduleColor: "#166534", moduleBg: "#F0FDF4", user: "L. Petit",   time: "11:44", action: "Désactivation compte m.chen@sg.fr" },
  { icon: BarChart2,module: "Scoring",       moduleColor: "#B45309", moduleBg: "#FFFBEB", user: "A. Dupont",  time: "10:20", action: "Mise à jour seuil scoring — Optimisé" },
  { icon: Shield,   module: "Sécurité",      moduleColor: "#CC0000", moduleBg: "#FFEBEE", user: "Système",    time: "09:05", action: "Tentative connexion échouée (IP externe)" },
];

const banks = [
  { name: "BIAT",          status: "Active",     score: 4.1, users: 8, lastEval: "10/06/2026" },
  { name: "Attijari Bank", status: "Active",     score: 4.3, users: 6, lastEval: "08/06/2026" },
  { name: "BNA",           status: "Active",     score: 3.8, users: 5, lastEval: "05/06/2026" },
  { name: "STB",           status: "Active",     score: 3.2, users: 5, lastEval: "03/06/2026" },
  { name: "UIB",           status: "En cours",   score: 3.5, users: 4, lastEval: "01/06/2026" },
  { name: "BH Bank",       status: "En cours",   score: 2.9, users: 3, lastEval: "28/05/2026" },
  { name: "Amen Bank",     status: "En attente", score: 0,   users: 2, lastEval: "—"          },
];

const alerts = [
  { level: "critical", text: "2 utilisateurs en attente d'activation",      action: "Activer" },
  { level: "warning",  text: "Questionnaire v2.2 en brouillon depuis 14j",  action: "Publier" },
  { level: "warning",  text: "2 pondérations de sous-dimensions manquantes", action: "Configurer" },
  { level: "info",     text: "3 questions sans description d'aide",          action: "Compléter" },
];

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

function StatusDot({ status }: { status: string }) {
  const c: Record<string, string> = { "Active": "#2E7D32", "En cours": "#E65100", "En attente": "#9B9B9B" };
  return <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: c[status] || "#9B9B9B", display: "inline-block" }} />;
}

function ScoreBar({ value }: { value: number }) {
  const color = value >= 4 ? "#2E7D32" : value >= 3 ? "#E65100" : "#9B9B9B";
  const pct = value > 0 ? (value / 5) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, backgroundColor: "#F0F0F0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 32, textAlign: "right" }}>{value > 0 ? `${value}/5` : "—"}</span>
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

// ── Route map for navigation ─────────────────────────────────────────────────
const pageRoutes: Record<string, string> = {
  banks: "/super-admin/banks",
  logs: "/super-admin/logs",
  users: "/super-admin/users",
  dimensions: "/super-admin/dimensions",
  scoring: "/super-admin/scoring",
  versions: "/super-admin/versions",
  settings: "/super-admin/settings",
};

// ── Main ──────────────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const navigate = useNavigate();
  const nav = (page: string) => navigate(pageRoutes[page] || "/super-admin");
  const [trendRange, setTrendRange] = useState("12 mois");
  const total = userRoles.reduce((a, r) => a + r.value, 0);

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
        <div style={{ display: "flex", gap: 8 }}>
          {["7 jours", "30 jours", "12 mois"].map(r => (
            <button key={r} onClick={() => setTrendRange(r)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
              backgroundColor: trendRange === r ? EY.black : "#fff",
              color: trendRange === r ? "#FFE600" : EY.mid,
              boxShadow: trendRange === r ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
              transition: "all 0.15s",
            }}>{r}</button>
          ))}
        </div>
      </div>

      {/* ── Row 1 : KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 18 }}>
        {[
          { label: "Utilisateurs actifs",    value: "48",  delta: "+3",    icon: Users,      trend: "#2E7D32", trendBg: "#E8F5E9" },
          { label: "Banques clientes",        value: "12",  delta: "+1",    icon: Building2,  trend: "#2E7D32", trendBg: "#E8F5E9" },
          { label: "Questions publiées",      value: "126", delta: "+6",    icon: HelpCircle, trend: "#2E7D32", trendBg: "#E8F5E9" },
          { label: "Version active",          value: "v2.1",delta: "Publié",icon: GitBranch,  trend: "#1565C0", trendBg: "#E3F2FD" },
          { label: "Évaluations complètes",   value: "28",  delta: "+14",   icon: Activity,   trend: "#2E7D32", trendBg: "#E8F5E9" },
        ].map((k, i) => {
          const Icon = k.icon;
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 10, backgroundColor: k.trendBg, color: k.trend, borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>
                <TrendingUp size={10} /> {k.delta}
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
              <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>Complétions · En cours · Nouvelles banques</div>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              {[
                { label: "Complétions", color: EY.black },
                { label: "En cours",    color: EY.yellow },
                { label: "Nouvelles",   color: "#B8B8B8" },
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
              <AreaChart data={evaluationTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
                <XAxis dataKey="mois" tick={{ fontSize: 11, fill: "#9B9B9B" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9B9B9B" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomAreaTooltip />} />
                <Area type="monotone" dataKey="complétions" stroke="#1A1A1A" strokeWidth={2.5} fill="url(#gBlack)"  dot={false} activeDot={{ r: 4, fill: "#1A1A1A" }} />
                <Area type="monotone" dataKey="enCours"     stroke="#FFE600" strokeWidth={2}   fill="url(#gYellow)" dot={false} activeDot={{ r: 4, fill: "#FFE600" }} />
                <Area type="monotone" dataKey="nouvelles"   stroke="#B8B8B8" strokeWidth={1.5} fill="url(#gGray)"   dot={false} activeDot={{ r: 3, fill: "#B8B8B8" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Donut */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card style={{ flex: 1 }}>
            <CardHeader title="Répartition utilisateurs" />
            <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ position: "relative", width: 130, height: 130 }}>
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie data={userRoles} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2} dataKey="value" strokeWidth={0}>
                      {userRoles.map((_, i) => <Cell key={i} fill={userRoles[i].color} />)}
                    </Pie>
                    <Tooltip formatter={(val: number, name: string) => [val, name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: EY.black, lineHeight: 1 }}>{total}</div>
                  <div style={{ fontSize: 9, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.06em" }}>total</div>
                </div>
              </div>
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                {userRoles.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: r.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#4A4A4A", flex: 1 }}>{r.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: EY.black }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Row 3 : Bar chart + Alerts timeline + Activity ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16, alignItems: "stretch" }}>

        {/* Bar chart */}
        <div style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <CardHeader title="Score de maturité par banque" actionLabel="Voir tout" action={() => nav("banks")} />
          <div style={{ flex: 1, padding: "14px 12px 0px", display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, minHeight: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={completionsByBank} margin={{ top: 0, right: 4, left: -24, bottom: 0 }} barSize={26}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="banque" tick={{ fontSize: 10, fill: "#9B9B9B" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 5]} ticks={[0,1,2,3,4,5]} tick={{ fontSize: 11, fill: "#9B9B9B" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                  <Bar dataKey="score" radius={[5, 5, 0, 0]}>
                    {completionsByBank.map((entry, i) => (
                      <Cell key={i} fill={entry.score >= 4 ? EY.black : entry.score >= 3 ? "#4A4A4A" : "#C0C0C0"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 12, padding: "12px 4px 14px", borderTop: "1px solid rgba(0,0,0,0.05)", marginTop: 4 }}>
              {[
                { label: "≥ 4 Maîtrisé", color: EY.black },
                { label: "3–4 Défini",   color: "#4A4A4A" },
                { label: "< 3 En dev.",  color: "#C0C0C0" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: EY.mid }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alerts — timeline style */}
        <div style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <CardHeader title="Alertes de configuration" />
          <div style={{ flex: 1, padding: "20px 20px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: 15, top: 16, bottom: 0, width: 1.5, backgroundColor: "rgba(0,0,0,0.07)" }} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                {alerts.map((a, i) => {
                  const cfgMap = {
                    critical: { dotBg: "#FFEBEE", dotColor: "#C62828", dotIcon: <AlertTriangle size={11} style={{ color: "#C62828" }} />, label: "Critique", labelColor: "#C62828", labelBg: "#FFEBEE" },
                    warning:  { dotBg: "#FFF8E1", dotColor: "#E65100", dotIcon: <AlertCircle   size={11} style={{ color: "#E65100" }} />, label: "Attention", labelColor: "#E65100", labelBg: "#FFF8E1" },
                    info:     { dotBg: "#E3F2FD", dotColor: "#1565C0", dotIcon: <AlertCircle   size={11} style={{ color: "#1565C0" }} />, label: "Info",      labelColor: "#1565C0", labelBg: "#E3F2FD" },
                  };
                  const cfg = cfgMap[a.level as keyof typeof cfgMap];
                  return (
                    <div key={i} style={{ display: "flex", gap: 14, paddingBottom: i < alerts.length - 1 ? 22 : 0 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, backgroundColor: cfg.dotBg, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${cfg.dotColor}30`, position: "relative", zIndex: 1 }}>
                        {cfg.dotIcon}
                      </div>
                      <div style={{ flex: 1, paddingTop: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: cfg.labelColor, backgroundColor: cfg.labelBg, borderRadius: 4, padding: "1px 7px", marginBottom: 4, display: "inline-block" }}>{cfg.label}</span>
                        <div style={{ fontSize: 12, fontWeight: 500, color: EY.black, lineHeight: 1.45, marginBottom: 5 }}>{a.text}</div>
                        <button style={{ fontSize: 11, fontWeight: 600, color: cfg.labelColor, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 3 }}>
                          {a.action} <ArrowRight size={10} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Activity feed */}
        <div style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <CardHeader title="Activité récente" actionLabel="Tout voir" action={() => nav("logs")} />
          <div style={{ flex: 1, overflowY: "auto" }}>
            {activities.map((a, i) => {
              const Icon = a.icon;
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 16px", borderBottom: i < activities.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: a.moduleBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={13} style={{ color: a.moduleColor }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: EY.black, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.action}</div>
                    <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 1 }}>{a.user}</div>
                  </div>
                  <span style={{ fontSize: 10, color: "#C0C0C0", flexShrink: 0, marginTop: 2 }}>{a.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Row 4 : Banks table ── */}
      <Card>
        <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: EY.black }}>Banques clientes</span>
            <span style={{ fontSize: 11, color: "#9B9B9B", marginLeft: 8 }}>{banks.filter(b => b.status === "Active").length} actives sur {banks.length}</span>
          </div>
          <button onClick={() => nav("banks")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", color: EY.black, transition: "all 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = EY.black; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fff"; (e.currentTarget as HTMLButtonElement).style.color = EY.black; }}
          >
            Voir toutes <ArrowRight size={12} />
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAFAFA" }}>
              {["Banque", "Utilisateurs", "Score maturité", "Statut", "Dernière évaluation", ""].map(h => (
                <th key={h} style={{ padding: "9px 18px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#9B9B9B", letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {banks.map((b, i) => (
              <tr key={i}
                style={{ borderBottom: i < banks.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none", transition: "background 0.1s" }}
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
                <td style={{ padding: "12px 18px", fontSize: 13, color: "#4A4A4A" }}>{b.users}</td>
                <td style={{ padding: "12px 18px", width: 180 }}><ScoreBar value={b.score} /></td>
                <td style={{ padding: "12px 18px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
                    backgroundColor: b.status === "Active" ? "#E8F5E9" : b.status === "En cours" ? "#FFF8E1" : "#F5F5F5",
                    color: b.status === "Active" ? "#2E7D32" : b.status === "En cours" ? "#E65100" : "#9B9B9B",
                    borderRadius: 20, padding: "3px 10px" }}>
                    <StatusDot status={b.status} /> {b.status}
                  </span>
                </td>
                <td style={{ padding: "12px 18px", fontSize: 12, color: "#9B9B9B" }}>{b.lastEval}</td>
                <td style={{ padding: "12px 18px" }}>
                  <button style={{ width: 26, height: 26, borderRadius: 5, border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9B9B9B" }}
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
      </Card>
    </div>
  );
}
