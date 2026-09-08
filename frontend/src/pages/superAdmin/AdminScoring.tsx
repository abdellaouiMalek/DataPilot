/**
 * Référentiel de scoring, the maturity bands and dimension weights the
 * scoring engine actually uses.
 *
 * Everything here is live: bands come from `maturity_levels` (read by
 * app.services.scoring.map_to_maturity_level on every submission and report)
 * and weights from `dimensions.weight`. Both are the same rows the framework
 * page and the questionnaire read, so an edit here changes how results are
 * scored and labelled, hence the explicit warnings for overlapping bands,
 * uncovered score ranges and weights that don't total 100.
 *
 * Scores are on the questionnaire's own 1→5 scale (the values respondents
 * pick), not a 0-100 percentage; the scale bounds come from the API.
 */

import { useEffect, useState } from "react";
import { Edit2, RotateCcw, X, AlertCircle, AlertTriangle, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { AdminLoader } from "@/components/AdminLoader";
import { useConfirm } from "@/hooks/useConfirm";
import {
  getScoringReferential,
  resetMaturityLevels,
  updateMaturityLevel,
  type MaturityLevel,
  type ScoringReferential,
} from "@/lib/adminScoring";
import { adminApi, type Dimension } from "@/lib/admin";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Une erreur est survenue. Vérifiez que l'API est démarrée.";
}

// 1.9 -> "1,9", 2 -> "2", matches the French formatting used elsewhere.
const fmt = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);

// Only active questions are served to respondents (see /api/dimensions), so
// they're the only ones that can contribute a score.
const countQuestions = (dimension: Dimension) =>
  dimension.subDimensions
    .filter(sub => sub.status === "Active")
    .reduce((total, sub) => total + sub.questions.filter(q => q.status === "Active").length, 0);

// ── Response-type rules ───────────────────────────────────────────────────────
// Deliberately describes what actually runs, not what the framework editor
// lets you configure: QuestionnairePage renders the same 1→5 Likert for every
// question and the API only accepts `value` 1-5 (schemas/assessment.py), so
// only "Échelle de maturité" is scored as designed today. The other types are
// stored and editable but their per-option points never reach the engine, 
// flagged here rather than left to be discovered from a wrong score.
const RESPONSE_TYPE_RULES: Record<
  string,
  { levels: string; scoring: string; example: string; applied: boolean }
> = {
  "Échelle de maturité": {
    levels: "5 niveaux (1 → 5)",
    scoring: "La valeur choisie entre dans la moyenne pondérée de la dimension",
    example: "Niveau 3, poids 8 → pèse 8 fois plus qu'un poids 1 dans la moyenne",
    applied: true,
  },
  "Oui/Non": {
    levels: "2 options configurées",
    scoring: "Présenté au répondant comme une échelle 1 → 5 ; les 2 options ne sont pas rendues",
    example: "la réponse enregistrée reste un niveau 1 à 5",
    applied: false,
  },
  "Choix unique": {
    levels: "Points par option",
    scoring: "Les points par option ne sont pas utilisés par le calcul",
    example: "Option B = 3 pts → ignoré, seul le niveau 1 à 5 est enregistré",
    applied: false,
  },
  "Choix multiple": {
    levels: "Points par option",
    scoring: "Les points par option ne sont pas utilisés par le calcul",
    example: "cocher 2 options sur 4 → ignoré, seul le niveau 1 à 5 est enregistré",
    applied: false,
  },
  "Texte libre": {
    levels: "Réponse libre",
    scoring: "Non scoré",
    example: "aucune contribution au score",
    applied: false,
  },
};

// ── Edit modal ────────────────────────────────────────────────────────────────

function LevelModal({
  level,
  scale,
  onClose,
  onSaved,
}: {
  level: MaturityLevel;
  scale: { min: number; max: number };
  onClose: () => void;
  onSaved: (referential: ScoringReferential) => void;
}) {
  const [label, setLabel] = useState(level.label);
  const [minScore, setMinScore] = useState(String(level.min_score));
  const [maxScore, setMaxScore] = useState(String(level.max_score));
  const [description, setDescription] = useState(level.description);
  const [color, setColor] = useState(level.color);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const min = Number(minScore.replace(",", "."));
    const max = Number(maxScore.replace(",", "."));
    if (!label.trim()) return setError("Le libellé est obligatoire.");
    if (Number.isNaN(min) || Number.isNaN(max)) return setError("Les seuils doivent être numériques.");

    setSaving(true);
    setError(null);
    try {
      const referential = await updateMaturityLevel(level.id, {
        label: label.trim(),
        min_score: min,
        max_score: max,
        description,
        color,
      });
      toast.success("Niveau enregistré", { description: `« ${label.trim()} » mis à jour.` });
      onSaved(referential);
      onClose();
    } catch (err) {
      // 400s carry the backend's own message (chevauchement, hors échelle…),
      // which is more precise than anything we could rebuild here.
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 4,
    border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "white", borderRadius: 8, width: 520, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ey-black)" }}>Modifier le niveau : {level.label}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ey-gray-mid)" }}><X size={18} /></button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          {error && (
            <div style={{ padding: "10px 12px", backgroundColor: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 6, fontSize: 12, color: "#CC0000", display: "flex", gap: 8 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Libellé du niveau</label>
            <input value={label} onChange={e => setLabel(e.target.value)} style={field} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Score minimum</label>
              <input type="number" step="0.1" min={scale.min} max={scale.max} value={minScore} onChange={e => setMinScore(e.target.value)} style={field} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Score maximum</label>
              <input type="number" step="0.1" min={scale.min} max={scale.max} value={maxScore} onChange={e => setMaxScore(e.target.value)} style={field} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--ey-gray-mid)", marginTop: -8 }}>
            Échelle du questionnaire : {fmt(scale.min)} - {fmt(scale.max)}. Les niveaux ne peuvent pas se chevaucher.
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...field, resize: "vertical" }} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Couleur du badge</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: "100%", height: 38, borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", cursor: "pointer", padding: 4 }} />
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: "8px 18px", borderRadius: 4, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "white", cursor: saving ? "not-allowed" : "pointer", color: "var(--ey-gray-dark)" }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 4, fontSize: 13, fontWeight: 600, border: "none", backgroundColor: "var(--ey-black)", color: "white", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving && <Loader2 size={13} className="animate-spin" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * "Référentiel de scoring" -- lecture seule pour les deux espaces
 * (super-admin ET admin, voir routes.tsx) : les niveaux de maturité
 * viennent de `/api/maturity-levels` (public, voir
 * backend/app/routers/config.py) et les pondérations par dimension de
 * `/api/super-admin/dimensions` (ouvert en lecture aux deux rôles, voir
 * backend/app/routers/admin.py). Aucune des deux ne peut être modifiée
 * depuis ici : il n'existe pas d'endpoint d'écriture pour les niveaux de
 * maturité côté backend -- l'ancienne UI d'édition (Modifier / Restaurer
 * les défauts) ne faisait déjà rien de réel, elle a été retirée plutôt
 * que laissée comme un bouton qui ne marche pas.
 */
export function ScoringReferential() {
  const [referential, setReferential] = useState<ScoringReferential | null>(null);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [editingLevel, setEditingLevel] = useState<MaturityLevel | null>(null);
  // Dimension whose weight is being edited inline, plus its draft value.
  const [editingWeight, setEditingWeight] = useState<{ id: string; value: string } | null>(null);
  const [savingWeight, setSavingWeight] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const reload = () => {
    setLoading(true);
    setLoadError(false);
    setRefreshKey(k => k + 1);
  };

  useEffect(() => {
    let cancelled = false;
    // Bands and weights are fetched together: the page only makes sense with
    // both (a weight total is meaningless without the scale it feeds).
    Promise.all([getScoringReferential(), adminApi.listDimensions()])
      .then(([ref, dims]) => {
        if (cancelled) return;
        setReferential(ref);
        setDimensions(dims);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleReset = async () => {
    if (!(await confirm({
      title: "Restaurer les niveaux de maturité par défaut ?",
      description:
        "Les seuils, libellés, descriptions et couleurs personnalisés seront perdus.\n\n" +
        "Les évaluations déjà enregistrées ne sont pas recalculées.",
      icon: RotateCcw,
      confirmLabel: "Restaurer",
    }))) return;

    setResetting(true);
    try {
      setReferential(await resetMaturityLevels());
      toast.success("Référentiel restauré", { description: "Les niveaux par défaut ont été rétablis." });
    } catch (err) {
      toast.error("Échec de la restauration", { description: errorMessage(err) });
    } finally {
      setResetting(false);
    }
  };

  const saveWeight = async (dimension: Dimension) => {
    if (!editingWeight) return;
    const weight = Number(editingWeight.value.replace(",", "."));
    if (Number.isNaN(weight) || weight < 0) {
      toast.error("Pondération invalide", { description: "Saisissez un nombre positif." });
      return;
    }
    // Same 100 % ceiling the backend enforces -- checked here too so the
    // admin gets an immediate, specific answer instead of a failed save.
    // Only active dimensions count toward the total, matching totalWeight
    // above; editing an inactive one's weight can't push it over.
    if (dimension.status === "Active") {
      const otherTotal = totalWeight - dimension.weight;
      const newTotal = otherTotal + weight;
      if (newTotal > 100.01) {
        toast.error("Total des poids dépassé", {
          description: `${fmt(otherTotal)} % + ${fmt(weight)} % = ${fmt(newTotal)} % : le total des dimensions actives ne peut pas dépasser 100 %.`,
        });
        return;
      }
    }
    setSavingWeight(true);
    try {
      await adminApi.updateDimension(dimension.id, { weight });
      setDimensions(prev => prev.map(d => (d.id === dimension.id ? { ...d, weight } : d)));
      setEditingWeight(null);
      toast.success("Pondération enregistrée", { description: `${dimension.name}, ${fmt(weight)} %` });
    } catch (err) {
      toast.error("Échec de l'enregistrement", { description: errorMessage(err) });
    } finally {
      setSavingWeight(false);
    }
  };

  const levels = referential?.levels ?? [];
  const scale = referential?.scale ?? { min: 0, max: 5 };
  const span = scale.max - scale.min || 1;
  // Inactive dimensions never reach respondents, so they neither carry weight
  // in the global score nor belong in the 100 % total.
  const activeDimensions = dimensions.filter(d => d.status === "Active");
  const inactiveCount = dimensions.length - activeDimensions.length;
  const totalWeight = activeDimensions.reduce((total, d) => total + d.weight, 0);
  const questionTypes = Object.entries(RESPONSE_TYPE_RULES).map(([type, rule]) => ({
    type,
    ...rule,
    count: activeDimensions.reduce(
      (total, d) => total + d.subDimensions
        .filter(sub => sub.status === "Active")
        .reduce((sum, sub) => sum + sub.questions.filter(
          q => q.status === "Active" && q.type === type).length, 0), 0),
  }));

  const card: React.CSSProperties = {
    backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)",
    borderRadius: 6, overflow: "hidden",
  };

  if (loading) {
    return (
      <AdminLoader label="Chargement du référentiel…" />
    );
  }

  if (loadError || !referential) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ ...card, padding: 24, borderLeft: "4px solid #CC0000" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ey-black)" }}>Impossible de charger le référentiel de scoring</div>
          <div style={{ fontSize: 12, color: "var(--ey-gray-mid)", marginTop: 4 }}>Vérifiez que l'API est démarrée, puis réessayez.</div>
          <button onClick={reload} style={{ marginTop: 14, padding: "8px 16px", borderRadius: 4, fontSize: 13, fontWeight: 600, border: "none", backgroundColor: "var(--ey-black)", color: "white", cursor: "pointer" }}>Réessayer</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--ey-black)", margin: 0, letterSpacing: "-0.02em" }}>Référentiel de scoring</h2>
          <p style={{ fontSize: 13, color: "var(--ey-gray-mid)", margin: "4px 0 0" }}>
            Niveaux de maturité, seuils et pondérations utilisés pour calculer les scores
          </p>
        </div>
        <button onClick={handleReset} disabled={resetting}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 4, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "white", cursor: resetting ? "not-allowed" : "pointer", color: "var(--ey-gray-dark)", opacity: resetting ? 0.7 : 1 }}>
          {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Restaurer les défauts
        </button>
      </div>

      {/* Configuration warnings, a band overlap mislabels results, a gap
          leaves them with no label at all. */}
      {(referential.overlaps.length > 0 || referential.gaps.length > 0) && (
        <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {referential.overlaps.length > 0 && (
            <div style={{ padding: "12px 16px", backgroundColor: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 6, display: "flex", gap: 10 }}>
              <AlertTriangle size={15} style={{ color: "#CC0000", flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#CC0000" }}>Niveaux qui se chevauchent</div>
                {referential.overlaps.map(message => (
                  <div key={message} style={{ fontSize: 12, color: "#7F1D1D", marginTop: 3 }}>{message}</div>
                ))}
              </div>
            </div>
          )}
          {referential.gaps.length > 0 && (
            <div style={{ padding: "12px 16px", backgroundColor: "#FFF8E1", border: "1px solid #FDE68A", borderRadius: 6, display: "flex", gap: 10 }}>
              <AlertCircle size={15} style={{ color: "#B45309", flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E" }}>Plages de score sans niveau</div>
                <div style={{ fontSize: 12, color: "#92400E", marginTop: 3 }}>
                  {referential.gaps.join(" · ")}, un score dans ces plages n'obtient aucun libellé de maturité.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Score scale visual */}
      <div style={{ ...card, padding: "18px 22px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ey-gray-dark)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Échelle de score globale ({fmt(scale.min)} - {fmt(scale.max)})
        </div>
        <div style={{ position: "relative", height: 20, borderRadius: 4, overflow: "hidden", display: "flex", backgroundColor: "var(--ey-gray-bg)" }}>
          {[...levels].sort((a, b) => a.min_score - b.min_score).map(level => (
            <div key={level.id} style={{
              flex: Math.max(0.01, (level.max_score - level.min_score) / span),
              backgroundColor: level.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#1A1A1A",
            }}>
              {fmt(level.min_score)}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", marginTop: 8, gap: 16 }}>
          {levels.map(level => (
            <div key={level.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: level.color, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "var(--ey-gray-mid)" }}>{level.label} ({fmt(level.min_score)}-{fmt(level.max_score)})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Maturity levels table */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>Niveaux de maturité</div>
          <span style={{ fontSize: 11, color: "var(--ey-gray-mid)" }}>
            {levels.length} niveau{levels.length > 1 ? "x" : ""} configuré{levels.length > 1 ? "s" : ""}
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--ey-gray-bg)", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              {["Niveau", "Nom", "Score min", "Score max", "Description", "Badge", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--ey-gray-mid)", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levels.map((level, i) => (
              <tr key={level.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", backgroundColor: i % 2 === 0 ? "white" : "#FAFAFA" }}>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: level.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>
                    {i + 1}
                  </div>
                </td>
                <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>{level.label}</td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", backgroundColor: "var(--ey-gray-bg)", borderRadius: 4, padding: "4px 10px", fontSize: 13, fontWeight: 700, color: "var(--ey-black)" }}>{fmt(level.min_score)}</div>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", backgroundColor: "var(--ey-gray-bg)", borderRadius: 4, padding: "4px 10px", fontSize: 13, fontWeight: 700, color: "var(--ey-black)" }}>{fmt(level.max_score)}</div>
                </td>
                <td style={{ padding: "14px 16px", maxWidth: 300 }}>
                  <p style={{ fontSize: 12, color: "var(--ey-gray-mid)", margin: 0, lineHeight: 1.5 }}>{level.description || "-"}</p>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: `${level.color}33`, color: "var(--ey-black)", borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: level.color }} />
                    {level.label}
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <button onClick={() => setEditingLevel(level)} title="Modifier ce niveau"
                    style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ey-gray-dark)" }}>
                    <Edit2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Dimension weights */}
        <div style={card}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>Pondérations par dimension</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: Math.round(totalWeight) === 100 ? "#2E7D32" : "#B45309" }}>
              Total {fmt(totalWeight)} %
            </span>
          </div>

          {Math.round(totalWeight) !== 100 && activeDimensions.length > 0 && (
            <div style={{ padding: "10px 20px", backgroundColor: "#FFF8E1", borderBottom: "1px solid #FDE68A", fontSize: 11, color: "#92400E" }}>
              Les pondérations ne totalisent pas 100 %. Le score global reste une moyenne pondérée
              (les poids sont relatifs), mais l'écart rend la lecture des pourcentages trompeuse.
            </div>
          )}

          {inactiveCount > 0 && (
            <div style={{ padding: "8px 20px", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 11, color: "var(--ey-gray-mid)" }}>
              {inactiveCount} dimension{inactiveCount > 1 ? "s" : ""} inactive{inactiveCount > 1 ? "s" : ""}, 
              non présentée{inactiveCount > 1 ? "s" : ""} aux répondants, donc hors total et hors calcul.
            </div>
          )}

          <div>
            {activeDimensions.length === 0 && (
              <div style={{ padding: "16px 20px", fontSize: 12, color: "var(--ey-gray-mid)" }}>Aucune dimension active.</div>
            )}
            {activeDimensions.map((dimension, i) => {
              // Narrowed alias rather than a boolean, so `draft.value` below
              // type-checks without a non-null assertion.
              const draft = editingWeight && editingWeight.id === dimension.id ? editingWeight : null;
              return (
                <div key={dimension.id} style={{ padding: "12px 20px", borderBottom: i < activeDimensions.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ey-black)", marginBottom: 4 }}>{dimension.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, backgroundColor: "var(--ey-gray-bg)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, dimension.weight)}%`, height: "100%", backgroundColor: dimension.color || "var(--ey-yellow)" }} />
                      </div>
                      {draft ? (
                        <input
                          autoFocus
                          type="number"
                          min={0}
                          step="1"
                          value={draft.value}
                          onChange={e => setEditingWeight({ id: dimension.id, value: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === "Enter") void saveWeight(dimension);
                            if (e.key === "Escape") setEditingWeight(null);
                          }}
                          style={{ width: 62, padding: "3px 6px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.25)", fontSize: 12, fontWeight: 700, textAlign: "right", outline: "none" }}
                        />
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ey-black)", minWidth: 38, textAlign: "right" }}>{fmt(dimension.weight)} %</span>
                      )}
                    </div>
                  </div>

                  <span style={{ fontSize: 11, color: "var(--ey-gray-mid)", minWidth: 70, textAlign: "right" }}>
                    {countQuestions(dimension)} question{countQuestions(dimension) > 1 ? "s" : ""}
                  </span>

                  {draft ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => void saveWeight(dimension)} disabled={savingWeight} title="Enregistrer"
                        style={{ width: 24, height: 24, borderRadius: 3, border: "none", backgroundColor: "var(--ey-black)", cursor: savingWeight ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ey-yellow)" }}>
                        {savingWeight ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      </button>
                      <button onClick={() => setEditingWeight(null)} title="Annuler"
                        style={{ width: 24, height: 24, borderRadius: 3, border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ey-gray-dark)" }}>
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingWeight({ id: dimension.id, value: String(dimension.weight) })} title="Modifier la pondération"
                      style={{ width: 24, height: 24, borderRadius: 3, border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ey-gray-dark)" }}>
                      <Edit2 size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Scoring rules */}
        <div style={card}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>Règles de calcul par type de réponse</div>
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: "12px 14px", backgroundColor: "#F5F7FF", border: "1px solid #DBE4FF", borderRadius: 6, fontSize: 11, color: "#1E3A8A", lineHeight: 1.55 }}>
              Score d'une dimension = moyenne des réponses <strong>pondérée par le poids de chaque question</strong>.
              Score global = moyenne des scores de dimension pondérée par les pondérations ci-contre.
              Les poids sont donc relatifs : ils ne s'additionnent pas en points.
            </div>
            {questionTypes.map(rule => (
              <div key={rule.type} style={{ padding: "12px 14px", backgroundColor: "var(--ey-gray-bg)", borderRadius: 6, opacity: rule.count === 0 ? 0.55 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ey-black)" }}>{rule.type}</span>
                  <span style={{ fontSize: 10, color: "var(--ey-gray-mid)", backgroundColor: "white", padding: "1px 7px", borderRadius: 3 }}>{rule.levels}</span>
                  {/* A type with questions but no scoring path is the case
                      worth spotting: those answers still land on the 1→5
                      scale, so the score is silently not what was configured. */}
                  {!rule.applied && rule.count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", backgroundColor: "#FFF8E1", border: "1px solid #FDE68A", padding: "1px 7px", borderRadius: 3 }}>
                      non appliqué
                    </span>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 700, color: rule.count === 0 ? "var(--ey-gray-mid)" : "var(--ey-black)", marginLeft: "auto" }}>
                    {rule.count} question{rule.count > 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ey-gray-mid)", marginBottom: 4 }}>{rule.scoring}</div>
                <div style={{ fontSize: 11, color: "var(--ey-gray-dark)", fontStyle: "italic" }}>ex. {rule.example}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editingLevel && (
        <LevelModal
          level={editingLevel}
          scale={scale}
          onClose={() => setEditingLevel(null)}
          onSaved={setReferential}
        />
      )}
      {confirmDialog}
    </div>
  );
}
