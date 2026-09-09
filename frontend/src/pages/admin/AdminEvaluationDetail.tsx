import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { ArrowLeft, Building2, Calendar, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getAssessment } from "@/lib/assessment";
import type { AssessmentResult } from "@/lib/assessment";
import { getMaturityLevels, bankLogoSrc } from "@/lib/config";
import type { MaturityLevel } from "@/lib/config";
import { downloadEvaluationReport } from "@/lib/reports";
import { tint } from "@/lib/utils";

/**
 * Détail d'une évaluation, dans le châssis de l'espace admin (même sidebar,
 * même bandeau) -- jamais la page ResultsPage.tsx (chrome public Navbar/
 * FlowHeader, actions personnelles comme "Partager" ou le récit IA en
 * streaming) : un admin qui consulte le dossier d'un collègue de sa banque
 * n'est pas "à sa place" dans ce parcours-là.
 *
 * Reprend uniquement ce qui a du sens pour une consultation en lecture
 * seule : le score global, le radar par dimension (même visuel que
 * ResultsPage.tsx), et le téléchargement du rapport PDF -- déjà protégé
 * par le même `get_bank_scope` que la liste, donc aucun changement
 * backend requis pour que ce soit sûr.
 */
export function AdminEvaluationDetail() {
  const navigate = useNavigate();
  const assessmentId = Number(useParams().assessmentId);

  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMaturityLevels(), getAssessment(assessmentId)])
      .then(([levels, data]) => {
        if (cancelled) return;
        setMaturityLevels(levels);
        setResult(data);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [assessmentId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadEvaluationReport(assessmentId);
      toast.success("Rapport PDF téléchargé");
    } catch {
      toast.error("Échec du téléchargement du rapport PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "28px 32px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#9B9B9B", fontSize: 13 }}>
          <Loader2 size={16} className="animate-spin" /> Chargement de l'évaluation…
        </div>
      </div>
    );
  }

  if (loadError || !result) {
    return (
      <div style={{ padding: "28px 32px" }}>
        <div style={{ backgroundColor: "#FFEBEE", color: "#CC0000", borderRadius: 10, padding: "16px 20px", fontSize: 13, fontWeight: 600 }}>
          Cette évaluation est introuvable, ou n'appartient pas à votre banque.
        </div>
        <button
          onClick={() => navigate("/admin/evaluations")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, background: "none", border: "none", cursor: "pointer", color: "#1A1A1A", fontSize: 13, fontWeight: 700 }}
        >
          <ArrowLeft size={14} /> Retour aux évaluations
        </button>
      </div>
    );
  }

  const globalScore = result.score_global ?? 0;
  const level = maturityLevels.find(l => l.label === result.maturity_label)
    ?? maturityLevels.find(l => globalScore >= l.min_score && globalScore <= l.max_score)
    ?? null;

  const radarData = result.dimension_scores.map(d => ({ dimension: d.name, value: d.score, fullMark: 5 }));
  const context = [result.department, result.evaluator_role].filter(Boolean).join(" · ");

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>
      <button
        onClick={() => navigate("/admin/evaluations")}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6B6B6B", fontSize: 12, fontWeight: 600, marginBottom: 16, padding: 0 }}
      >
        <ArrowLeft size={14} /> Retour aux évaluations
      </button>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#9B9B9B", marginBottom: 6 }}>
            {result.bank_logo_url ? (
              <img src={bankLogoSrc(result.bank_logo_url) ?? undefined} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "contain", background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }} />
            ) : <Building2 size={13} />}
            <span style={{ fontWeight: 700, color: "#4A4A4A" }}>{result.bank}</span>
            {context && <span>· {context}</span>}
            <span>· Dossier #{result.id}</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.02em", margin: 0 }}>
            Résultats de l'évaluation
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#9B9B9B", marginTop: 6 }}>
            <Calendar size={12} /> {new Date(result.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: downloading ? "wait" : "pointer", opacity: downloading ? 0.7 : 1, boxShadow: "0 4px 14px rgba(0,0,0,0.18)" }}
        >
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Télécharger le rapport PDF
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "stretch" }}>
        {/* Score global */}
        <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#9B9B9B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Score global
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {globalScore.toFixed(1)}<span style={{ fontSize: 18, color: "#C0C0C0", fontWeight: 600 }}>/5</span>
          </div>
          {level && (
            <span style={{ display: "inline-block", marginTop: 14, padding: "5px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, color: level.color, backgroundColor: tint(level.color, "0.14") }}>
              {level.label}
            </span>
          )}
        </div>

        {/* Radar */}
        <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", padding: "20px 24px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "#9B9B9B", marginBottom: 2 }}>
            EMPREINTE DE MATURITÉ
          </div>
          <div style={{ fontSize: 12.5, color: "#9B9B9B", marginBottom: 10 }}>
            Distribution des scores sur les {radarData.length} dimensions
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} />
                <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Radar name="Score" dataKey="value" stroke="#1A1A1A" strokeWidth={2.5} fill="#FFE600" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Détail par dimension */}
      <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", padding: "20px 24px", marginTop: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "#9B9B9B", marginBottom: 14 }}>
          SCORE PAR DIMENSION
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {result.dimension_scores.map(d => (
            <div key={d.dimension_id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 13, color: "#1A1A1A", fontWeight: 500, width: 220, flexShrink: 0 }}>{d.name}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: "#F0F0F0", overflow: "hidden" }}>
                <div style={{ width: `${(d.score / 5) * 100}%`, height: "100%", backgroundColor: "#1A1A1A", borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A", width: 40, textAlign: "right" }}>{d.score.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
