import { useEffect, useRef, useState } from "react";
import {
  Upload, FileText, ChevronRight, ChevronDown, Check, Edit2, XCircle,
  BookOpen, ExternalLink, RefreshCw, CheckCircle2,
  Sparkles, X, ShieldCheck, Clock, ArrowUpRight, Loader2, AlertTriangle, Scale, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  regulatoryApi,
  type Circular, type CircularDetail, type Impact, type ImpactAction, type AssociatedRecommendation,
} from "../../lib/regulatory";
import { getMaturityLevels, type MaturityLevel } from "../../lib/config";
import { useConfirm } from "../../hooks/useConfirm";

function formatDate(iso: string | null): string {
  if (!iso) return "Date non détectée";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// ── Shared ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  backgroundColor: "#fff",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.07)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

function StatutBadge({ statut }: { statut: string }) {
  const active = statut === "En vigueur";
  const draft = statut === "Brouillon";
  const color = active ? "#2E7D32" : draft ? "#E65100" : "#9B9B9B";
  const bg = active ? "#E8F5E9" : draft ? "#FFF3E0" : "#F5F5F5";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: bg, color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color }} />
      {statut}
    </span>
  );
}

// Libellés + couleurs EXACTEMENT ceux de la maquette ImpactsProposes.tsx
// (typeMap) pour les 5 types qu'elle couvre. "question:desactiver" et
// "recommandation:desactiver" n'existent pas dans la maquette (ses 5 types
// de démonstration ne couvrent pas la désactivation) -- extension au même
// langage visuel (rouge d'alerte, cohérent avec le reste de la palette).
const IMPACT_LABEL: Record<string, string> = {
  "recommandation:activer_flag": "Réglementaire",
  "recommandation:modifier": "Mise à jour recommandations",
  "question:modifier": "Mise à jour question",
  "question:ajouter": "Nouvelle question",
  "recommandation:ajouter": "Recommandation",
  "question:desactiver": "Question à désactiver",
  "recommandation:desactiver": "Recommandation à désactiver",
};

const IMPACT_COLOR: Record<string, { bg: string; color: string }> = {
  "recommandation:activer_flag": { bg: "#F0F4FF", color: "#3730A3" },
  "recommandation:modifier":     { bg: "#EEF2FF", color: "#3730A3" },
  "question:modifier":           { bg: "#EEF2FF", color: "#3730A3" },
  "question:ajouter":            { bg: "#EEF2F7", color: "#2C4A6E" },
  "recommandation:ajouter":      { bg: "#FFF7ED", color: "#9A3412" },
  "question:desactiver":         { bg: "#FFF5F5", color: "#B91C1C" },
  "recommandation:desactiver":   { bg: "#FFF5F5", color: "#B91C1C" },
};

function impactKey(impact: Impact): string {
  return `${impact.entityType}:${impact.proposedAction}`;
}

/** Compact "élément / dimension" pair shown at a glance on each card --
 * derived purely from fields already resolved by the backend (never
 * invented here). "Nouvelle question"/"Nouvelle recommandation" cover the
 * "ajouter" cases, which have no catalog code yet -- that's the point. */
function impactElementAndDimension(impact: Impact): { element: string; dimension: string } {
  const p = impact.proposedData;
  switch (impactKey(impact)) {
    case "question:ajouter":
      return { element: "Nouvelle question", dimension: p.dimension || p.dimension_hint || "" };
    case "recommandation:ajouter":
      return { element: "Nouvelle recommandation", dimension: p.question_dimension || "" };
    case "question:modifier":
    case "question:desactiver":
      return { element: p.question_code || "", dimension: p.question_dimension || "" };
    default: // recommandation:modifier | recommandation:desactiver | recommandation:activer_flag
      return { element: p.reco_code || "", dimension: p.question_dimension || "" };
  }
}

interface SuggestedLevel {
  level: number;
  label: string;
  color: string;
  text: string;
  recommendation: AssociatedRecommendation | null;
}

/** Pairs each of the proposed question's `level_labels` (its own maturity
 * scale, from D1 = plus faible) with the REAL, currently-configured
 * maturity levels (name + color, from `/api/maturity-levels` -- the same
 * source used everywhere else in the app, e.g. AdminScoring/ResultsPage --
 * so an admin-customized label/color is reflected here too, not a
 * hardcoded guess) and the recommendation attached to that specific
 * palier (`associated_recommendations`, matched by `trigger_level`).
 * Falls back to a neutral "Niveau N" if the real levels haven't loaded
 * yet (or don't cover 5 levels) -- never blocks rendering on that call. */
function buildSuggestedLevels(impact: Impact, maturityLevels: MaturityLevel[]): SuggestedLevel[] {
  const labels = impact.proposedData.level_labels ?? [];
  const recos = impact.proposedData.associated_recommendations ?? [];
  return labels.map((text, i) => {
    const level = i + 1;
    const meta = maturityLevels[i];
    return {
      level,
      label: meta?.label ?? `Niveau ${level}`,
      color: meta?.color ?? "#6B6B6B",
      text,
      recommendation: recos.find(r => r.trigger_level === level) ?? null,
    };
  });
}

/** Draft/edited content for a proposed impact -- mirrors exactly what the
 * maquette (ImpactsProposes.tsx) lets an expert edit per field: the
 * recommandation text, the question text, the désactivation justification,
 * or (for a new question) each maturity level's answer + associated
 * recommendation. There is still only ONE storage slot on the backend
 * (`RegulatoryImpact.edited_text`, a free Text column via the existing
 * PATCH .../impacts/{id} endpoint -- see ImpactUpdate) : rather than
 * extending the schema, this whole structure is JSON-serialized into that
 * single column (see saveEditedFields/parseEditedPayload below). No
 * backend change needed -- "modifié" still means exactly what it always
 * did (one string persisted per impact), only its CONTENT is now
 * structured JSON instead of plain text when produced by this rich editor. */
interface EditedFields {
  recommandation?: string;
  question?: string;
  justification?: string;
  levels?: Record<number, { answer?: string; recText?: string }>;
}

/** Parses `impact.editedText` back into structured fields. Returns null
 * for a plain-text legacy edit (from before this rich editor existed) --
 * displayed as a simple override banner instead (see ImpactCardBody)
 * rather than silently discarding it. */
function parseEditedPayload(editedText: string | null): EditedFields | null {
  if (!editedText) return null;
  try {
    const parsed = JSON.parse(editedText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as EditedFields;
  } catch {
    // Legacy plain-text edit, or genuinely not JSON -- not a structured payload.
  }
  return null;
}

function EffortDots({ effort }: { effort: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }} title={`Effort estimé : ${effort}/3`}>
      {[1, 2, 3].map(n => (
        <span key={n} style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: n <= effort ? "#6B6B6B" : "#E0E0E0" }} />
      ))}
    </span>
  );
}

function WeightRecalcNote({ impact }: { impact: Impact }) {
  const w = impact.proposedData.weight_recalc;
  if (!w) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 11, color: "#92400E" }}>
      <Scale size={12} style={{ flexShrink: 0 }} />
      <span>
        Recalcul du poids intra-dimension ({w.dimension}) : {w.questions_actives_avant} → {w.questions_actives_apres} question{w.questions_actives_apres !== 1 ? "s" : ""} actives,
        {" "}poids {w.poids_avant != null ? `${w.poids_avant} → ` : ""}{w.poids_apres}.
      </span>
    </div>
  );
}

/** Reference box for an EXISTING catalog element (question or
 * recommandation) that a proposal targets by code -- always shows what
 * the code actually IS (title, and dimension/category context), never
 * just the bare code alone. Falls back to the bare code if the backend
 * couldn't resolve it (referential changed since the analysis ran). */
function CatalogRefBox({ kind, code, title, subtitle, text }: {
  kind: "question" | "recommandation";
  code?: string;
  title?: string;
  subtitle?: string;
  text?: string;
}) {
  if (!title) {
    return code ? (
      <span style={{ fontSize: 11, fontWeight: 700, color: "#6B6B6B", backgroundColor: "#F5F5F5", padding: "2px 8px", borderRadius: 4, alignSelf: "flex-start" }}>{code}</span>
    ) : null;
  }
  const c = kind === "question" ? { bg: "#EEF2FF", border: "#C7D2FE", text: "#3730A3" } : { bg: "#FFF7ED", border: "#FED7AA", text: "#9A3412" };
  return (
    <div style={{ padding: "9px 11px", backgroundColor: c.bg, border: `1px solid ${c.border}`, borderRadius: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: c.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {kind === "question" ? "Question existante" : "Recommandation existante"}
        </span>
        {code && <span style={{ fontSize: 9, fontWeight: 600, color: c.text, opacity: 0.65 }}>· {code}</span>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 10, color: "#6B6B6B", marginTop: 2 }}>{subtitle}</div>}
      {text && <p style={{ fontSize: 11, color: "#4A4A4A", margin: "5px 0 0", lineHeight: 1.5 }}>{text}</p>}
    </div>
  );
}

const editTextareaStyle: React.CSSProperties = {
  width: "100%", fontFamily: "inherit", border: "none", outline: "none",
  resize: "vertical", padding: 0, backgroundColor: "transparent", boxSizing: "border-box",
};

/** Renders the (entityType, proposedAction)-specific fields of a proposed
 * impact (see llm/regulatory_analysis.py for what proposedData carries per
 * combination). Existing-element references (reco_title, question_title,
 * etc.) come from the backend's own catalog lookup at analysis time (see
 * app/services/regulatory.py::_enrich_impact) -- never invented by the LLM,
 * always the real current content, so a bare code is never shown alone.
 *
 * Editing (isEditing/draft/onDraftChange) mirrors the maquette
 * ImpactsProposes.tsx exactly : the actual proposed text (recommandation,
 * question, justification, or -- for a new question -- each maturity
 * level's answer/recommendation) is edited in place, not a generic summary
 * field. Persisted as JSON in the single `edited_text` column the backend
 * already has (see EditedFields/parseEditedPayload) -- no schema change. */
function ProposedDetails({
  impact, maturityLevels, expanded, onToggleExpand, activeLevel, onSetActiveLevel,
  isEditing, draft, onDraftChange,
}: {
  impact: Impact;
  maturityLevels: MaturityLevel[];
  expanded: boolean;
  onToggleExpand: () => void;
  activeLevel: number;
  onSetActiveLevel: (level: number) => void;
  isEditing: boolean;
  draft: EditedFields;
  onDraftChange: (updater: (prev: EditedFields) => EditedFields) => void;
}) {
  const p = impact.proposedData;
  const key = impactKey(impact);

  if (key === "question:ajouter") {
    const levels = buildSuggestedLevels(impact, maturityLevels);
    const active = levels.find(l => l.level === activeLevel) ?? levels[0];
    const draftLevel = active ? draft.levels?.[active.level] : undefined;
    const questionValue = draft.question ?? p.title ?? "";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Question proposée -- la dimension est déjà affichée dans la
            ligne "Dimension concernée" au-dessus de ce bloc (voir le
            wrapper de la carte), pas besoin de la répéter ici. Modifiable
            (draft.question), contrairement aux autres champs de ce type
            avant cette révision -- l'expert peut désormais reformuler la
            question proposée elle-même, pas seulement les paliers. */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Question proposée au référentiel
          </div>
          <div style={{ backgroundColor: "#fff", border: `1.5px solid ${isEditing ? "#3730A3" : "#1A1A1A"}`, borderRadius: 6, padding: "12px 14px" }}>
            {isEditing ? (
              <textarea
                value={questionValue}
                onChange={e => onDraftChange(d => ({ ...d, question: e.target.value }))}
                style={{ ...editTextareaStyle, fontSize: 13, color: "#1A1A1A", lineHeight: 1.7, minHeight: 60 }}
              />
            ) : (
              <p style={{ fontSize: 13, fontWeight: 400, color: "#1A1A1A", lineHeight: 1.7, margin: 0 }}>{questionValue}</p>
            )}
          </div>
        </div>

        {levels.length > 0 && (
          // Vue par palier (onglets colorés, mêmes libellés/couleurs que le
          // barème de maturité réel de l'app -- voir buildSuggestedLevels) :
          // pour chaque niveau, la réponse type ET la recommandation qui
          // ferait franchir ce palier, plutôt qu'une liste à plat -- reprend
          // le comportement de la maquette ImpactsProposes.tsx, avec les
          // vraies données (level_labels + associated_recommendations),
          // pas des exemples statiques.
          <div>
            <button
              onClick={onToggleExpand}
              style={{ width: "100%", padding: "9px 10px", display: "flex", alignItems: "center", gap: 8, background: expanded ? "#FAFAFA" : "#fff", border: "1px solid #E8E8E8", borderRadius: 8, cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {expanded ? <ChevronDown size={10} style={{ color: "#fff" }} /> : <ChevronRight size={10} style={{ color: "#fff" }} />}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#1A1A1A" }}>Réponses suggérées par niveau de maturité</span>
              <span style={{ fontSize: 10, color: "#9B9B9B", marginLeft: "auto" }}>{levels.length} niveaux</span>
            </button>

            {expanded && (
              <div style={{ backgroundColor: "#FAFAFA", border: "1px solid #E8E8E8", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "12px 10px" }}>
                <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
                  {levels.map(l => {
                    const isActive = activeLevel === l.level;
                    return (
                      <button
                        key={l.level}
                        onClick={() => onSetActiveLevel(l.level)}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 20, border: `1.5px solid ${isActive ? l.color : "#E0E0E0"}`, backgroundColor: "#fff", cursor: "pointer" }}
                      >
                        <span style={{ fontSize: 10, fontWeight: 800, color: l.color }}>{l.level}</span>
                        <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, color: isActive ? l.color : "#9B9B9B" }}>{l.label}</span>
                      </button>
                    );
                  })}
                </div>

                {active && (
                  <div style={{ display: "grid", gridTemplateColumns: active.recommendation ? "1fr 1fr" : "1fr", gap: 8 }}>
                    <div style={{ backgroundColor: "#fff", border: `1px solid ${isEditing ? "#3730A3" : `${active.color}22`}`, borderLeft: `3px solid ${active.color}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: active.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                        Réponse type, Niveau {active.level}
                      </div>
                      {isEditing ? (
                        <textarea
                          value={draftLevel?.answer ?? active.text}
                          onChange={e => onDraftChange(d => ({ ...d, levels: { ...d.levels, [active.level]: { ...d.levels?.[active.level], answer: e.target.value } } }))}
                          style={{ ...editTextareaStyle, fontSize: 11, color: "#3A3A3A", lineHeight: 1.55, minHeight: 60 }}
                        />
                      ) : (
                        <p style={{ fontSize: 11, color: "#3A3A3A", lineHeight: 1.55, margin: 0 }}>{active.text}</p>
                      )}
                    </div>
                    {active.recommendation && (
                      <div style={{ backgroundColor: "#fff", border: `1px solid ${isEditing ? "#3730A3" : "#E8E8E8"}`, borderLeft: "3px solid #FFE600", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 700, color: "#1A1A1A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                          Recommandation associée
                          {active.recommendation.is_placeholder && <span style={{ fontSize: 8, fontWeight: 700, color: "#9A5B00", backgroundColor: "#FFF3E0", padding: "1px 5px", borderRadius: 3 }}>À rédiger</span>}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#1A1A1A", marginBottom: 2 }}>{active.recommendation.title}</div>
                        {isEditing ? (
                          <textarea
                            value={draftLevel?.recText ?? active.recommendation.recommendation_text}
                            onChange={e => onDraftChange(d => ({ ...d, levels: { ...d.levels, [active.level]: { ...d.levels?.[active.level], recText: e.target.value } } }))}
                            style={{ ...editTextareaStyle, fontSize: 11, color: "#4A4A4A", lineHeight: 1.5, minHeight: 60 }}
                          />
                        ) : (
                          active.recommendation.recommendation_text && <p style={{ fontSize: 11, color: "#4A4A4A", lineHeight: 1.5, margin: 0 }}>{active.recommendation.recommendation_text}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pas d'AssociatedRecommendations ici : la vue par palier
            ci-dessus reprend déjà associated_recommendations, une palier à
            la fois -- l'afficher aussi à plat serait redondant. */}
        <WeightRecalcNote impact={impact} />
      </div>
    );
  }

  if (key === "question:modifier" || key === "recommandation:modifier") {
    const isQuestion = key === "question:modifier";
    // Pas de CatalogRefBox ici : le texte EXISTANT s'affiche directement
    // dans "Texte en vigueur" ci-dessous (le code reste visible dans la
    // ligne Référence, juste au-dessus de ce bloc) -- pas besoin de le
    // répéter dans une boîte séparée.
    const oldText = isQuestion ? p.question_title : p.reco_text;
    const value = (isQuestion ? draft.question : draft.recommandation) ?? p.modification ?? "";
    return (
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
          {isQuestion ? "Modifier question" : "Modifier recommandation"}
        </div>
        <div style={{ backgroundColor: "#F7F7F7", borderRadius: 6, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#9B9B9B", letterSpacing: "0.06em", marginBottom: 4 }}>Texte en vigueur</div>
          <p style={{ fontSize: 12, color: "#7A7A7A", lineHeight: 1.65, margin: 0 }}>{oldText}</p>
        </div>
        <div style={{ backgroundColor: "#fff", border: `1.5px solid ${isEditing ? "#3730A3" : "#1A1A1A"}`, borderRadius: 6, padding: "10px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#1A1A1A", letterSpacing: "0.06em", marginBottom: 4 }}>Texte révisé</div>
          {isEditing ? (
            <textarea
              value={value}
              onChange={e => onDraftChange(d => isQuestion ? { ...d, question: e.target.value } : { ...d, recommandation: e.target.value })}
              style={{ ...editTextareaStyle, fontSize: 12, color: "#1A1A1A", lineHeight: 1.6, minHeight: 64 }}
            />
          ) : (
            <p style={{ fontSize: 12, color: "#1A1A1A", lineHeight: 1.6, margin: 0 }}>{value}</p>
          )}
        </div>
      </div>
    );
  }

  if (key === "question:desactiver" || key === "recommandation:desactiver") {
    const isQuestion = key === "question:desactiver";
    const value = draft.justification ?? p.justification ?? "";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <CatalogRefBox
          kind={isQuestion ? "question" : "recommandation"}
          code={isQuestion ? p.question_code : p.reco_code}
          title={isQuestion ? p.question_title : p.reco_title}
          subtitle={isQuestion ? p.question_dimension : [p.reco_category, p.question_title].filter(Boolean).join(" · ")}
        />
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#B91C1C", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Motif de désactivation
          </div>
          <div style={{ backgroundColor: "#fff", border: `1.5px solid ${isEditing ? "#3730A3" : "#1A1A1A"}`, borderRadius: 6, padding: "10px 12px" }}>
            {isEditing ? (
              <textarea
                value={value}
                onChange={e => onDraftChange(d => ({ ...d, justification: e.target.value }))}
                style={{ ...editTextareaStyle, fontSize: 12, color: "#1A1A1A", lineHeight: 1.6, minHeight: 64 }}
              />
            ) : (
              <p style={{ fontSize: 12, color: "#1A1A1A", lineHeight: 1.6, margin: 0 }}>{value}</p>
            )}
          </div>
        </div>
        <span style={{ fontSize: 11, color: "#9B9B9B", fontStyle: "italic" }}>Passera au statut « obsolète » (jamais supprimé) à la publication.</span>
        <WeightRecalcNote impact={impact} />
      </div>
    );
  }

  if (key === "recommandation:ajouter") {
    const value = draft.recommandation ?? p.recommendation_text ?? "";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em" }}>Recommandation</div>
        <div style={{ backgroundColor: "#fff", border: `1.5px solid ${isEditing ? "#3730A3" : "#1A1A1A"}`, borderRadius: 6, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>{p.title}</div>
          {isEditing ? (
            <textarea
              value={value}
              onChange={e => onDraftChange(d => ({ ...d, recommandation: e.target.value }))}
              style={{ ...editTextareaStyle, fontSize: 12, color: "#4A4A4A", lineHeight: 1.6, minHeight: 64 }}
            />
          ) : (
            <p style={{ fontSize: 12, color: "#4A4A4A", lineHeight: 1.6, margin: 0 }}>{value}</p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {p.category && <span style={{ fontSize: 11, color: "#6B6B6B", backgroundColor: "#F5F5F5", padding: "2px 8px", borderRadius: 4 }}>{p.category}</span>}
          {typeof p.effort === "number" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6B6B6B" }}>Effort <EffortDots effort={p.effort} /></span>
          )}
          {typeof p.trigger_level === "number" && (
            <span style={{ fontSize: 11, color: "#6B6B6B" }}>Palier {p.trigger_level} → {p.trigger_level + 1}</span>
          )}
        </div>

        {(p.question_title || p.question_code) && (
          <div style={{ fontSize: 12, color: "#4A4A4A", lineHeight: 1.5 }}>
            Rattachée à la question <strong style={{ color: "#1A1A1A" }}>{p.question_title || p.question_code}</strong>
            {p.question_dimension && <> (dimension <strong style={{ color: "#1A1A1A" }}>{p.question_dimension}</strong>)</>}
          </div>
        )}
      </div>
    );
  }

  // recommandation:activer_flag ("réglementaire") -- jamais éditable, ni
  // dans la maquette (pas de bouton "Modifier" pour ce type) ni ici :
  // c'est une recommandation EXISTANTE, il n'y a pas de nouveau texte à
  // rédiger, juste son indicateur réglementaire à activer.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em" }}>Recommandation à qualifier</div>
      <div style={{ backgroundColor: "#fff", border: "1px solid #1A1A1A", borderRadius: 6, padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>{p.reco_title}</div>
        <p style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.75, margin: 0 }}>{p.reco_text}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldCheck size={13} style={{ color: "#3730A3" }} />
        <span style={{ fontSize: 11, color: "#3730A3", fontWeight: 500 }}>Cette recommandation doit être marquée comme exigence réglementaire dans le référentiel.</span>
      </div>
    </div>
  );
}

// ── PDF Icon SVG (3D-style) ───────────────────────────────────────────────────

function PdfIcon3D({ size = 100 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="115" rx="30" ry="5" fill="rgba(0,0,0,0.08)" />
      <rect x="12" y="8" width="66" height="86" rx="7" fill="#F0F0F0" />
      <path d="M62 8 L78 24 L62 24 Z" fill="#D8D8D8" />
      <path d="M62 8 L78 24 H62 V8Z" fill="#E4E4E4" />
      <rect x="22" y="36" width="36" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="22" y="46" width="46" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="22" y="56" width="40" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="22" y="66" width="30" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="14" y="18" width="28" height="14" rx="3" fill="#CC0000" />
      <text x="28" y="29" textAnchor="middle" fill="white" fontSize="8" fontWeight="800" fontFamily="sans-serif">PDF</text>
    </svg>
  );
}

function SpinnerIcon({ size = 100 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`@keyframes vspin { to { transform: rotate(360deg); transform-origin: 50px 55px; } }`}</style>
      <ellipse cx="50" cy="115" rx="30" ry="5" fill="rgba(0,0,0,0.08)" />
      <circle cx="50" cy="55" r="38" stroke="#F0F0F0" strokeWidth="6" />
      <circle cx="50" cy="55" r="38" stroke="#1A1A1A" strokeWidth="6" strokeLinecap="round"
        strokeDasharray="60 180"
        style={{ transformOrigin: "50px 55px", animation: "vspin 0.9s linear infinite" }}
      />
      <rect x="34" y="40" width="32" height="30" rx="4" fill="#F5F5F5" />
      <rect x="34" y="46" width="12" height="7" rx="2" fill="#CC0000" />
      <text x="40" y="52" textAnchor="middle" fill="white" fontSize="5" fontWeight="800" fontFamily="sans-serif">PDF</text>
    </svg>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: (circular: CircularDetail) => void }) {
  const [step, setStep] = useState<"form" | "analyzing" | "done" | "error">("form");
  const [tab, setTab] = useState<"file" | "link">("file");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [result, setResult] = useState<CircularDetail | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function afterSubmit(circular: CircularDetail) {
    if (circular.analysisStatus !== "en_cours") {
      finishWith(circular);
      return;
    }
    setStep("analyzing");
    const resolved = await regulatoryApi.pollCircular(circular.id);
    finishWith(resolved);
  }

  function finishWith(circular: CircularDetail) {
    if (circular.analysisStatus === "en_cours") {
      // Polling gave up (maxAttempts reached) but the analysis is still
      // running server-side -- must NOT report this as "done" with
      // whatever impact_count happens to exist yet (0), or the admin sees
      // a false "0 exigences détectées" even though the real result shows
      // up later in the list (which polls its own live status).
      toast.info("L'analyse prend plus de temps que prévu, elle continue en arrière-plan. Retrouvez cette circulaire dans la liste une fois terminée.");
      onClose();
      return;
    }
    if (circular.analysisStatus === "erreur") {
      setErrorMsg(circular.analysisError || "Échec de l'analyse du document.");
      setStep("error");
      return;
    }
    setResult(circular);
    setStep("done");
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setStep("analyzing");
    try {
      const circular = await regulatoryApi.importFile(file);
      await afterSubmit(circular);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Échec de l'import du document.");
      setStep("error");
    }
  }

  async function handleLink() {
    if (!linkValue.trim()) return;
    setFileName(linkValue.trim());
    setStep("analyzing");
    try {
      const circular = await regulatoryApi.importUrl(linkValue.trim());
      await afterSubmit(circular);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Échec de l'import du document.");
      setStep("error");
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
      `}</style>
      <div style={{ backgroundColor: "#fff", borderRadius: 16, width: 480, maxWidth: "94vw", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,0.22)" }}>

        <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>
            {step === "form" ? "Importer une circulaire" : step === "analyzing" ? "Analyse IA en cours…" : step === "error" ? "Échec de l'analyse" : "Analyse terminée"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4, borderRadius: 6 }}><X size={18} /></button>
        </div>

        <div style={{ padding: "20px 24px 24px" }}>

          {step === "form" && (
            <>
              <div style={{ display: "flex", gap: 0, backgroundColor: "#F5F5F5", borderRadius: 8, padding: 3, marginBottom: 20 }}>
                {(["file", "link"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.15s",
                      backgroundColor: tab === t ? "#fff" : "transparent",
                      color: tab === t ? "#1A1A1A" : "#9B9B9B",
                      boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    }}>
                    {t === "file" ? "Fichier PDF" : "Lien URL"}
                  </button>
                ))}
              </div>

              {tab === "file" ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragging ? "#1A1A1A" : "rgba(0,0,0,0.13)"}`,
                    borderRadius: 14,
                    padding: "36px 24px 28px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
                    backgroundColor: dragging ? "#F7F7F7" : "#FAFAFA",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  <div style={{ marginBottom: 4 }}>
                    <PdfIcon3D size={88} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", marginBottom: 6, textAlign: "center" }}>
                    Déposez votre circulaire ici
                  </div>
                  <div style={{ fontSize: 13, color: "#9B9B9B", textAlign: "center", lineHeight: 1.5 }}>
                    Glissez-déposez votre fichier, ou{" "}
                    <span style={{ color: "#1A1A1A", fontWeight: 600, textDecoration: "underline" }}>parcourir</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#C0C0C0", marginTop: 8 }}>Formats supportés : .pdf</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0 4px" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "28px 0 20px" }}>
                    <div style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ExternalLink size={26} style={{ color: "#9B9B9B" }} />
                    </div>
                    <div style={{ fontSize: 13, color: "#6B6B6B", textAlign: "center", lineHeight: 1.5 }}>
                      Collez le lien vers la circulaire publiée sur le site de la BCT ou autre source officielle.
                    </div>
                  </div>
                  <input
                    value={linkValue}
                    onChange={e => setLinkValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleLink(); }}
                    placeholder="https://www.bct.gov.tn/circulaire-2024-03.pdf"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: "1.5px solid rgba(0,0,0,0.13)", fontSize: 13, color: "#1A1A1A", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = "#1A1A1A"}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = "rgba(0,0,0,0.13)"}
                  />
                  <button
                    onClick={handleLink}
                    disabled={!linkValue.trim()}
                    style={{ padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: linkValue.trim() ? "#1A1A1A" : "#E0E0E0", color: linkValue.trim() ? "#FFE600" : "#9B9B9B", cursor: linkValue.trim() ? "pointer" : "not-allowed", transition: "background 0.15s" }}
                  >
                    Importer et analyser
                  </button>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 16 }}>
                <Sparkles size={12} style={{ color: "#6366F1" }} />
                <span style={{ fontSize: 11, color: "#9B9B9B" }}></span>
              </div>
            </>
          )}

          {step === "analyzing" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "16px 0 8px", animation: "fade-in 0.2s ease" }}>
              <SpinnerIcon size={88} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>
                  Lecture du document…
                </div>
                <div style={{ fontSize: 12, color: "#9B9B9B", maxWidth: 320 }}>
                  L'IA analyse le contenu (texte ou OCR, français ou arabe) et identifie les exigences réglementaires en arrière-plan. Cela peut prendre une à quelques minutes sur ce modèle local, vous pouvez fermer cette fenêtre, l'analyse continue.
                </div>
              </div>
              <div style={{ width: "100%", height: 4, backgroundColor: "#F0F0F0", borderRadius: 2, overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: "40%", height: "100%", backgroundColor: "#1A1A1A", borderRadius: 2, animation: "indeterminate 1.4s ease-in-out infinite" }} />
              </div>
              <div style={{ fontSize: 11, color: "#C0C0C0", fontStyle: "italic" }}>{fileName}</div>
            </div>
          )}

          {step === "error" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "16px 0 8px", animation: "fade-in 0.2s ease" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "#FFEBEE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle size={28} style={{ color: "#CC0000" }} />
              </div>
              <div style={{ fontSize: 13, color: "#6B6B6B", textAlign: "center", maxWidth: 340 }}>{errorMsg}</div>
              <button onClick={() => setStep("form")} style={{ padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
                Réessayer
              </button>
            </div>
          )}

          {step === "done" && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fade-in 0.25s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", backgroundColor: "#E8F5E9", borderRadius: 10, border: "1px solid #C8E6C9" }}>
                <CheckCircle2 size={22} style={{ color: "#2E7D32", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1B5E20" }}>Analyse terminée</div>
                  <div style={{ fontSize: 12, color: "#2E7D32" }}>
                    {result.impactCount} exigence{result.impactCount !== 1 ? "s" : ""} détectée{result.impactCount !== 1 ? "s" : ""}
                    {result.detectedLanguage && result.detectedLanguage !== "unknown" ? ` · document en ${result.detectedLanguage === "ar" ? "arabe" : "français"}` : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "Référence", value: result.reference },
                  { label: "Date d'import", value: formatDate(result.publicationDate) },
                  { label: "Thème", value: result.theme || "-" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", backgroundColor: "#F7F7F7", borderRadius: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.04em", width: 130, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>{value}</span>
                  </div>
                ))}
              </div>
              {result.impactCount === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", backgroundColor: "#FFF3E0", borderRadius: 8, border: "1px solid #FFE0B2" }}>
                  <AlertTriangle size={13} style={{ color: "#9A5B00", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#9A5B00" }}>Aucune exigence exploitable n'a été détectée dans ce document.</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", backgroundColor: "#EEF2FF", borderRadius: 8, border: "1px solid #C7D2FE" }}>
                  <Sparkles size={13} style={{ color: "#3730A3", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#3730A3" }}>L'analyse des impacts sur le référentiel est prête à être validée.</span>
                </div>
              )}
              {/* analysisError peut être renseigné même en cas de succès
                  ("terminee") : signale un résultat PARTIEL -- une ou
                  plusieurs sections du document n'ont pas pu être
                  analysées (panne transitoire locale) alors que le reste
                  a bien été traité -- distinct du cas impactCount === 0
                  ci-dessus (aucune section en échec, juste rien détecté). */}
              {result.analysisError && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", backgroundColor: "#FFF3E0", borderRadius: 8, border: "1px solid #FFE0B2" }}>
                  <AlertTriangle size={13} style={{ color: "#9A5B00", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#9A5B00" }}>{result.analysisError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
            {step === "done" ? "Fermer" : "Annuler"}
          </button>
          {step === "done" && result && (
            <button
              onClick={() => { onClose(); onDone(result); }}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
            >
              <ShieldCheck size={15} /> Consulter l'analyse d'impact
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Impact Analysis ───────────────────────────────────────────────────────────

function ImpactAnalysis({ circular, onBack, onPublished }: {
  circular: CircularDetail; onBack: () => void; onPublished: (updated: Circular) => void;
}) {
  const [impacts, setImpacts] = useState<Impact[]>(circular.impacts);
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Brouillon d'édition RICHE (par champ réel -- recommandation, question,
  // justification, ou par palier pour une nouvelle question), pas un texte
  // générique -- voir EditedFields. Un seul brouillon actif à la fois
  // (editingId), comme aujourd'hui -- pas besoin d'un Record par impact.
  const [editDraft, setEditDraft] = useState<EditedFields>({});
  // Vue par défaut : par article (précise mais lisible, voir
  // split_into_articles côté backend) -- bascule vers le texte intégral
  // sur demande, pour ne jamais rendre inaccessible le préambule/les visas
  // non repris dans la vue par article (voir sa docstring).
  const [showFullText, setShowFullText] = useState(false);
  // Onglets "par palier de maturité" (voir ProposedDetails/question:ajouter) :
  // état par impact (id), pas un seul état global -- plusieurs cartes
  // "nouvelle question" peuvent être ouvertes/à des niveaux différents en
  // même temps sans se marcher dessus.
  const [expandedLevels, setExpandedLevels] = useState<Record<number, boolean>>({});
  const [activeLevelByImpact, setActiveLevelByImpact] = useState<Record<number, number>>({});
  // Barème de maturité RÉEL (label + couleur), la même source que partout
  // ailleurs dans l'app (AdminScoring, ResultsPage...) -- reflète un
  // libellé/couleur personnalisé par l'admin plutôt qu'un nom générique
  // codé en dur. Echec silencieux : ProposedDetails retombe sur "Niveau N"
  // si l'appel échoue, ce n'est qu'un habillage, pas une donnée critique.
  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  useEffect(() => {
    getMaturityLevels().then(setMaturityLevels).catch(() => {});
  }, []);

  async function setAction(id: string | number, action: ImpactAction, editedText?: string) {
    const prev = impacts;
    setImpacts(p => p.map(c => c.id === id ? { ...c, action, editedText: editedText ?? null } : c));
    try {
      await regulatoryApi.updateImpact(Number(id), { action, editedText });
    } catch (e) {
      setImpacts(prev);
      toast.error(e instanceof Error ? e.message : "Échec de la mise à jour");
    }
  }

  function startEdit(impact: Impact) {
    // Pré-remplit le brouillon avec un edited_text déjà structuré s'il y en
    // a un (ré-édition), sinon avec le contenu PROPOSÉ actuel (jamais un
    // champ vide) -- exactement le comportement de la maquette.
    const existing = parseEditedPayload(impact.editedText) ?? {};
    const p = impact.proposedData;
    const key = impactKey(impact);
    const draft: EditedFields = { ...existing };
    if (key === "recommandation:modifier") draft.recommandation ??= p.modification ?? "";
    if (key === "recommandation:ajouter") draft.recommandation ??= p.recommendation_text ?? "";
    if (key === "question:modifier") draft.question ??= p.modification ?? "";
    if (key === "question:desactiver" || key === "recommandation:desactiver") draft.justification ??= p.justification ?? "";
    if (key === "question:ajouter") {
      const levels: NonNullable<EditedFields["levels"]> = { ...(existing.levels ?? {}) };
      (p.level_labels ?? []).forEach((lbl, i) => {
        const lvl = i + 1;
        const rec = (p.associated_recommendations ?? []).find(r => r.trigger_level === lvl);
        levels[lvl] = {
          answer: levels[lvl]?.answer ?? lbl,
          recText: levels[lvl]?.recText ?? rec?.recommendation_text ?? "",
        };
      });
      draft.levels = levels;
      // Ouvre directement les paliers en édition -- sinon rien n'est
      // visible à modifier tant que l'expert ne clique pas séparément.
      setExpandedLevels(p2 => ({ ...p2, [impact.id]: true }));
    }
    setEditDraft(draft);
    setEditingId(impact.id);
  }

  async function saveEdit(id: number) {
    await setAction(id, "modifié", JSON.stringify(editDraft));
    setEditingId(null);
  }

  const done = impacts.filter(c => c.action !== null).length;
  const total = impacts.length;
  const accepted = impacts.filter(c => c.action === "accepté").length;
  const allActioned = total > 0 && done === total;

  async function handlePublish() {
    if (!allActioned || publishing) return;
    setPublishing(true);
    try {
      const updated = await regulatoryApi.publishCircular(circular.id);
      setPublished(true);
      onPublished(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la publication");
    } finally {
      setPublishing(false);
    }
  }

  if (published) {
    return (
      <div style={{ padding: "80px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "#E8F5E9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle2 size={32} style={{ color: "#2E7D32" }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A" }}>Référentiel mis à jour</div>
        <div style={{ fontSize: 13, color: "#6B6B6B", textAlign: "center", maxWidth: 380, lineHeight: 1.6 }}>
          {accepted} modification{accepted > 1 ? "s" : ""} intégrée{accepted > 1 ? "s" : ""} au référentiel. Les banques concernées seront notifiées pour se réévaluer.
        </div>
        <button onClick={onBack} style={{ marginTop: 8, padding: "9px 22px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>
          Retour à la veille
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px 130px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9B9B9B", marginBottom: 22 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#9B9B9B", padding: 0 }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#1A1A1A"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#9B9B9B"}
          >Veille réglementaire</button>
          <ChevronRight size={13} />
          <span style={{ color: "#1A1A1A", fontWeight: 600 }}>Analyse : {circular.reference}</span>
        </div>

        <div style={{ ...card, padding: "14px 20px", marginBottom: 22, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>Validation des exigences</span>
              <span style={{ fontSize: 12, color: "#9B9B9B" }}>{done}/{total}</span>
            </div>
            <div style={{ height: 5, backgroundColor: "#F0F0F0", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: total ? `${(done / total) * 100}%` : "0%", backgroundColor: "#1A1A1A", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
            {[
              { label: "Acceptés",  n: impacts.filter(c => c.action === "accepté").length,  color: "#2E7D32" },
              { label: "À modifier",n: impacts.filter(c => c.action === "modifié").length,  color: "#E65100" },
              { label: "Rejetés",   n: impacts.filter(c => c.action === "rejeté").length,   color: "#CC0000" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.n}</div>
                <div style={{ fontSize: 10, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 20, alignItems: "start" }}>

          <div style={{ ...card, overflow: "hidden", position: "sticky", top: 0 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
              <BookOpen size={13} style={{ color: "#6B6B6B" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>Document source</span>
              {circular.detectedLanguage && circular.detectedLanguage !== "unknown" && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#6B6B6B", backgroundColor: "#F5F5F5", padding: "1px 6px", borderRadius: 4 }}>
                  {circular.detectedLanguage === "ar" ? "AR" : "FR"}
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                {circular.articles.length > 0 && (
                  // Bascule vue par article (par défaut, précise et lisible)
                  // / texte intégral -- le préambule et les visas ("Vu la
                  // loi...") ne sont pas repris dans la vue par article (ils
                  // font doublon avec l'en-tête institution/référence/thème
                  // déjà affiché, voir split_into_articles côté backend) :
                  // cette bascule garantit qu'ils restent accessibles en un
                  // clic, rien n'est jamais masqué définitivement.
                  <button
                    onClick={() => setShowFullText(v => !v)}
                    style={{ fontSize: 11, fontWeight: 600, color: "#6366F1", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    {showFullText ? "Vue par article" : "Texte intégral"}
                  </button>
                )}
                {circular.sourceUrl && (
                  <a href={circular.sourceUrl} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6B6B6B", textDecoration: "none" }}>
                    <ExternalLink size={11} /> Ouvrir
                  </a>
                )}
              </div>
            </div>
            <div style={{ padding: "16px", fontSize: 12, color: "#4A4A4A", lineHeight: 1.8, maxHeight: 520, overflowY: "auto" }}>
              {/* En-tête façon "minute officielle" : institution puis
                  référence · date, puis le thème en titre -- l'admin doit
                  reconnaître le document d'un coup d'œil, comme dans
                  l'exemple fourni (Banque Centrale de Tunisie / Circulaire
                  n°... · date / objet). Ne remplace PAS le texte : tout ce
                  qui suit (les articles) reste le texte intégral, jamais
                  résumé -- voir split_into_articles côté backend. */}
              <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                {circular.institution && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                    {circular.institution}
                  </div>
                )}
                <div style={{ fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 8 }}>
                  {circular.reference}
                  {circular.publicationDate ? ` · ${formatDate(circular.publicationDate)}` : ""}
                  {circular.sourceFilename ? ` · ${circular.sourceFilename}` : ""}
                </div>
                {circular.theme && (
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.4 }}>{circular.theme}</div>
                )}
              </div>

              {circular.articles.length > 0 && !showFullText ? (
                // Découpage par article (précis, verbatim -- pas un résumé
                // généré) : chaque bloc affiche son marqueur ("Art. N")
                // suivi du texte exact de l'article, comme le sommaire
                // d'un texte réglementaire.
                <div>
                  {circular.articles.map((a, i) => (
                    <p key={i} style={{ margin: i === circular.articles.length - 1 ? 0 : "0 0 14px" }}>
                      {a.label && <strong style={{ color: "#1A1A1A" }}>{a.label} : </strong>}
                      {a.text}
                    </p>
                  ))}
                </div>
              ) : circular.rawText ? (
                // Texte intégral tel quel -- soit parce qu'aucun marqueur
                // d'article n'a été détecté (note, communiqué non
                // structuré...), soit sur demande explicite (bascule
                // ci-dessus) pour retrouver le préambule/les visas.
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{circular.rawText}</p>
              ) : (
                <p style={{ color: "#9B9B9B", fontStyle: "italic" }}>Texte source indisponible.</p>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A", marginBottom: 2 }}>
              Impacts proposés <span style={{ fontSize: 12, fontWeight: 400, color: "#9B9B9B" }}>· {total} exigence{total !== 1 ? "s" : ""}</span>
            </div>

            {impacts.map(c => {
              const key = impactKey(c);
              const typeColor = IMPACT_COLOR[key] ?? { bg: "#F5F5F5", color: "#6B6B6B" };
              const actionColor = c.action === "accepté" ? "#2E7D32" : c.action === "rejeté" ? "#CC0000" : c.action === "modifié" ? "#E65100" : null;
              const isEditing = editingId === c.id;
              const { element, dimension } = impactElementAndDimension(c);
              const isActivationFlag = key === "recommandation:activer_flag";
              // Un edited_text pré-existant qui n'est PAS du JSON structuré :
              // un edit "résumé" fait avant ce rebuild -- affiché tel quel
              // en repli plutôt que silencieusement perdu.
              const legacyEdit = !isEditing && c.editedText && !parseEditedPayload(c.editedText) ? c.editedText : null;

              return (
                <div key={c.id} style={{
                  backgroundColor: "#fff", borderRadius: 10, overflow: "hidden",
                  border: `1px solid ${actionColor ? `${actionColor}30` : "#E8E8E8"}`,
                  boxShadow: actionColor ? `0 0 0 1px ${actionColor}18` : "0 1px 4px rgba(0,0,0,0.05)",
                  opacity: c.action === "rejeté" ? 0.55 : 1,
                  transition: "all 0.2s",
                }}>
                  {/* Barre d'accent */}
                  <div style={{ height: 3, backgroundColor: actionColor ?? "#E0E0E0" }} />

                  {/* En-tête : type + statut */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px 12px", borderBottom: "1px solid #F2F2F2" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: typeColor.color, backgroundColor: typeColor.bg, padding: "3px 9px", borderRadius: 4, letterSpacing: "0.04em" }}>
                      {(IMPACT_LABEL[key] ?? key).toUpperCase()}
                    </span>
                    {actionColor && (
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: actionColor }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: actionColor }} />
                        {c.action === "accepté" ? "Accepté" : c.action === "rejeté" ? "Rejeté" : "À modifier"}
                      </span>
                    )}
                  </div>

                  {/* Exigence + Dimension (tous types, jamais éditable --
                      c'est un résumé, le contenu réellement proposé
                      (recommandation/question/paliers) s'édite plus bas,
                      dans ProposedDetails). */}
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid #F2F2F2" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#C0C0C0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Exigence réglementaire</div>
                    <p style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.65, margin: 0, fontWeight: 500 }}>{c.requirementText}</p>
                    {legacyEdit && (
                      <p style={{ fontSize: 11, color: "#9B9B9B", fontStyle: "italic", lineHeight: 1.5, margin: "6px 0 0" }}>Résumé modifié : {legacyEdit}</p>
                    )}
                  </div>
                  <div style={{ padding: "11px 18px", borderBottom: "1px solid #F2F2F2", display: "flex", gap: 24 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#C0C0C0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Dimension concernée</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#3A3A3A" }}>{dimension || "-"}</div>
                    </div>
                    <div style={{ borderLeft: "1px solid #F0F0F0", paddingLeft: 24 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#C0C0C0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Référence</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", fontFamily: "monospace" }}>{element || "-"}</div>
                    </div>
                  </div>

                  {/* Détail spécifique au type -- voir ProposedDetails */}
                  <div style={{ padding: "20px 18px", borderBottom: "1px solid #F2F2F2" }}>
                    <ProposedDetails
                      impact={c}
                      maturityLevels={maturityLevels}
                      expanded={expandedLevels[c.id] ?? false}
                      onToggleExpand={() => setExpandedLevels(p => ({ ...p, [c.id]: !p[c.id] }))}
                      activeLevel={activeLevelByImpact[c.id] ?? 1}
                      onSetActiveLevel={lvl => setActiveLevelByImpact(p => ({ ...p, [c.id]: lvl }))}
                      isEditing={isEditing}
                      draft={isEditing ? editDraft : (parseEditedPayload(c.editedText) ?? {})}
                      onDraftChange={updater => setEditDraft(updater)}
                    />
                  </div>

                  {/* Pied d'action */}
                  <div style={{ padding: "11px 18px", backgroundColor: c.action ? "#FAFAFA" : "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    {isEditing ? (
                      <>
                        <span style={{ fontSize: 11, color: "#3730A3", fontWeight: 500 }}>Mode édition, modifiez les champs ci-dessus</span>
                        <div style={{ display: "flex", gap: 7 }}>
                          <button onClick={() => setEditingId(null)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1.5px solid #E0E0E0", backgroundColor: "#fff", color: "#4A4A4A", cursor: "pointer" }}>
                            <X size={12} /> Annuler
                          </button>
                          <button onClick={() => saveEdit(c.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>
                            <Check size={12} /> Confirmer
                          </button>
                        </div>
                      </>
                    ) : c.action === "accepté" || c.action === "rejeté" ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: actionColor! }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: actionColor! }}>
                            {isActivationFlag
                              ? (c.action === "accepté" ? "Marquée comme réglementaire, sera intégrée au référentiel" : "Non qualifiée comme réglementaire")
                              : (c.action === "accepté" ? "Acceptée, sera intégrée au référentiel" : "Rejetée, non intégrée")}
                          </span>
                        </div>
                        <button onClick={() => setAction(c.id, null)} style={{ fontSize: 11, fontWeight: 600, color: "#9B9B9B", background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, padding: "5px 12px", cursor: "pointer", flexShrink: 0 }}>
                          Annuler
                        </button>
                      </>
                    ) : c.action === "modifié" ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: actionColor! }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: actionColor! }}>Modifié, en attente de validation finale</span>
                        </div>
                        <div style={{ display: "flex", gap: 7 }}>
                          <button onClick={() => setAction(c.id, null)} style={{ fontSize: 11, fontWeight: 600, color: "#9B9B9B", background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, padding: "5px 12px", cursor: "pointer" }}>Annuler</button>
                          <button
                            onClick={() => setAction(c.id, "accepté")}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1.5px solid #2E7D3230", backgroundColor: "#2E7D320A", color: "#2E7D32", cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#2E7D32"; b.style.color = "#fff"; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#2E7D320A"; b.style.color = "#2E7D32"; }}
                          ><Check size={12} /> Accepter</button>
                          <button
                            onClick={() => setAction(c.id, "rejeté")}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1.5px solid #CC000030", backgroundColor: "#CC00000A", color: "#CC0000", cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#CC0000"; b.style.color = "#fff"; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#CC00000A"; b.style.color = "#CC0000"; }}
                          ><XCircle size={12} /> Rejeter</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 11, color: "#C0C0C0" }}>En attente de décision</span>
                        <div style={{ display: "flex", gap: 7 }}>
                          <button
                            onClick={() => setAction(c.id, "accepté")}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1.5px solid #2E7D3230", backgroundColor: "#2E7D320A", color: "#2E7D32", cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#2E7D32"; b.style.color = "#fff"; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#2E7D320A"; b.style.color = "#2E7D32"; }}
                          ><Check size={12} /> Accepter</button>
                          {!isActivationFlag && (
                            <button
                              onClick={() => startEdit(c)}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1.5px solid #E6510030", backgroundColor: "#E651000A", color: "#E65100", cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#E65100"; b.style.color = "#fff"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#E651000A"; b.style.color = "#E65100"; }}
                            ><Edit2 size={12} /> Modifier</button>
                          )}
                          <button
                            onClick={() => setAction(c.id, "rejeté")}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1.5px solid #CC000030", backgroundColor: "#CC00000A", color: "#CC0000", cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#CC0000"; b.style.color = "#fff"; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#CC00000A"; b.style.color = "#CC0000"; }}
                          ><XCircle size={12} /> Rejeter</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {total === 0 && (
              <div style={{ ...card, padding: "24px 18px", textAlign: "center", fontSize: 13, color: "#9B9B9B" }}>
                Aucun impact n'a été détecté pour cette circulaire.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ position: "sticky", bottom: 0, backgroundColor: "#fff", borderTop: "1px solid rgba(0,0,0,0.08)", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -4px 20px rgba(0,0,0,0.06)", zIndex: 10 }}>
        <div style={{ fontSize: 12, color: allActioned ? "#2E7D32" : "#9B9B9B" }}>
          {allActioned
            ? "✓ Toutes les exigences traitées, prêt à publier. Les banques concernées seront invitées à se réévaluer."
            : `${total - done} exigence${total - done > 1 ? "s" : ""} en attente de validation.`}
        </div>
        <button
          onClick={handlePublish}
          disabled={!allActioned || publishing}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: allActioned ? "#1A1A1A" : "#E0E0E0", color: allActioned ? "#FFE600" : "#9B9B9B", cursor: allActioned && !publishing ? "pointer" : "not-allowed", transition: "background 0.15s" }}
          onMouseEnter={e => { if (allActioned) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"; }}
          onMouseLeave={e => { if (allActioned) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"; }}
        >
          {publishing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Valider et publier la nouvelle version
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function VeilleReglementaire() {
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<CircularDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  async function reindex() {
    setReindexing(true);
    try {
      const result = await regulatoryApi.reindexCatalog();
      toast.success(`Index mis à jour : ${result.questions} question(s), ${result.recommandations} recommandation(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la réindexation");
    } finally {
      setReindexing(false);
    }
  }

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      setCirculars(await regulatoryApi.listCirculars());
    } catch (e) {
      setLoadError(true);
      toast.error(e instanceof Error ? e.message : "Échec du chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function openCircular(id: number) {
    setLoadingDetail(id);
    try {
      let circular = await regulatoryApi.getCircular(id);
      if (circular.analysisStatus === "en_cours") {
        toast.info("Analyse encore en cours pour cette circulaire, patientez…");
        circular = await regulatoryApi.pollCircular(id);
      }
      setSelected(circular);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du chargement de la circulaire");
    } finally {
      setLoadingDetail(null);
    }
  }

  async function handleDelete(c: Circular) {
    if (!(await confirm({
      title: "Supprimer cette circulaire ?",
      description: `Vous êtes sur le point de supprimer « ${c.reference} ». Cette action est irréversible.`,
      variant: "danger",
      confirmLabel: "Supprimer",
    }))) return;
    setDeletingId(c.id);
    try {
      await regulatoryApi.deleteCircular(c.id);
      setCirculars(prev => prev.filter(x => x.id !== c.id));
      toast.success("Circulaire supprimée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la suppression");
    } finally {
      setDeletingId(null);
    }
  }

  if (selected) {
    return (
      <ImpactAnalysis
        circular={selected}
        onBack={() => { setSelected(null); load(); }}
        onPublished={() => { load(); }}
      />
    );
  }

  const enVigueur = circulars.filter(c => c.status === "En vigueur").length;
  const abrogees = circulars.filter(c => c.status === "Abrogée").length;

  return (
    <div style={{ padding: "28px 32px 48px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <ShieldCheck size={12} style={{ color: "#B0B0B0" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#B0B0B0", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Banque Centrale de Tunisie</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", margin: "0 0 3px", letterSpacing: "-0.02em" }}>
              Veille réglementaire
            </h1>
            <p style={{ fontSize: 12, color: "#9B9B9B", margin: 0 }}>
              {circulars.length} circulaire{circulars.length !== 1 ? "s" : ""} importée{circulars.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0, marginLeft: 24 }}>
            <button
              onClick={reindex}
              disabled={reindexing}
              title="Ré-encode le référentiel (questions + recommandations) pour le modèle IA"
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", color: "#4A4A4A", cursor: reindexing ? "wait" : "pointer", whiteSpace: "nowrap" }}
            >
              {reindexing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Réindexer le référentiel
            </button>
            <button
              onClick={() => setShowUpload(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer", whiteSpace: "nowrap" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
            >
              <Upload size={14} /> Importer une circulaire
            </button>
          </div>
        </div>

        {circulars.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {[
              { value: circulars.length, label: "circulaires intégrées", dot: "#1A1A1A" },
              { value: enVigueur,        label: "en vigueur",            dot: "#16A34A" },
              { value: abrogees,         label: "abrogées",              dot: "#C0C0C0" },
            ].map((s, i, arr) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, backgroundColor: "#fff", borderRadius: 20, padding: "5px 12px", border: "1px solid rgba(0,0,0,0.08)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: s.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{s.value}</span>
                  <span style={{ fontSize: 12, color: "#9B9B9B" }}>{s.label}</span>
                </div>
                {i < arr.length - 1 && <span style={{ color: "#D0D0D0", fontSize: 14 }}>·</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 60, color: "#9B9B9B" }}>
          <Loader2 size={20} className="animate-spin" /> Chargement de la veille réglementaire…
        </div>
      )}

      {!loading && loadError && (
        <div style={{ textAlign: "center", padding: 50 }}>
          <p style={{ fontSize: 13, color: "#6B6B6B", marginBottom: 14 }}>Impossible de charger les circulaires.</p>
          <button onClick={load} style={{ padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>Réessayer</button>
        </div>
      )}

      {!loading && !loadError && circulars.length === 0 && (
        <div style={{ border: "1px dashed rgba(0,0,0,0.15)", borderRadius: 10, padding: 48, textAlign: "center", fontSize: 13, color: "#9B9B9B", backgroundColor: "#fff" }}>
          Aucune circulaire importée. Commencez par en importer une.
        </div>
      )}

      {!loading && !loadError && circulars.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {circulars.map(c => (
            <div key={c.id} style={{
              ...card, padding: "16px 20px",
              display: "flex", alignItems: "center", gap: 16,
              borderLeft: `3px solid ${c.status === "En vigueur" ? "#2E7D32" : c.status === "Brouillon" ? "#E65100" : "#D0D0D0"}`,
              transition: "box-shadow 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"}
            >
              <div style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: c.status === "En vigueur" ? "#F0F7FF" : "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <FileText size={20} style={{ color: c.status === "En vigueur" ? "#0277BD" : "#C0C0C0" }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{c.reference}</span>
                  <StatutBadge statut={c.status} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#3730A3", backgroundColor: "#EEF2FF", padding: "2px 7px", borderRadius: 4 }}>{c.version}</span>
                  {c.analysisStatus === "en_cours" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#6366F1", backgroundColor: "#EEF2FF", padding: "2px 7px", borderRadius: 4 }}>
                      <Loader2 size={10} className="animate-spin" /> Analyse en cours
                    </span>
                  )}
                  {c.analysisStatus === "erreur" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#CC0000", backgroundColor: "#FFEBEE", padding: "2px 7px", borderRadius: 4 }}>
                      <AlertTriangle size={10} /> Échec de l'analyse
                    </span>
                  )}
                  {/* analysisStatus "terminee" + analysisError renseigne :
                      resultat PARTIEL (une ou plusieurs sections en echec,
                      voir services/regulatory.py run_circular_analysis) --
                      distinct de "erreur" ci-dessus (echec total). */}
                  {c.analysisStatus === "terminee" && c.analysisError && (
                    <span title={c.analysisError} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#9A5B00", backgroundColor: "#FFF3E0", padding: "2px 7px", borderRadius: 4 }}>
                      <AlertTriangle size={10} /> Analyse partielle
                    </span>
                  )}
                  {c.pendingCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#9A5B00", backgroundColor: "#FFF3E0", padding: "2px 7px", borderRadius: 4 }}>{c.pendingCount} en attente</span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#6B6B6B" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={11} /> {formatDate(c.publicationDate)}
                  </span>
                  <span>·</span>
                  <span>{c.theme || "Thème non qualifié"}</span>
                  <span>·</span>
                  <span>{c.impactCount} exigence{c.impactCount !== 1 ? "s" : ""}</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => openCircular(c.id)}
                  disabled={loadingDetail === c.id}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: loadingDetail === c.id ? "wait" : "pointer", color: "#4A4A4A", transition: "all 0.12s", whiteSpace: "nowrap" }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; b.style.borderColor = "#1A1A1A"; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#4A4A4A"; b.style.borderColor = "rgba(0,0,0,0.10)"; }}
                >
                  {loadingDetail === c.id ? <Loader2 size={13} className="animate-spin" /> : <>Voir l'analyse <ArrowUpRight size={13} /></>}
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  disabled={deletingId === c.id}
                  title={c.isPublished ? "Circulaire publiée : suppression impossible" : "Supprimer"}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: deletingId === c.id ? "wait" : "pointer", color: "#9B9B9B", transition: "all 0.12s" }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#FFEBEE"; b.style.color = "#CC0000"; b.style.borderColor = "#FFCDD2"; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#9B9B9B"; b.style.borderColor = "rgba(0,0,0,0.10)"; }}
                >
                  {deletingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, textAlign: "right" }}>
        <span style={{ fontSize: 11, color: "#C0C0C0", fontStyle: "italic" }}>Usage interne EY, confidentiel</span>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onDone={(circular) => { setShowUpload(false); setSelected(circular); load(); }}
        />
      )}

      {confirmDialog}
    </div>
  );
}
