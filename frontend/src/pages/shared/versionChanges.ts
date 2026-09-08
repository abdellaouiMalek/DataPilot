/**
 * Real data behind VersionDetail.tsx -- maps a published circular's
 * applied impacts (see backend/app/services/regulatory.py::
 * apply_impacts_to_catalog) into the `VersionChange` shape the component
 * renders. VersionDetail.tsx itself is kept byte-for-byte as designed
 * (per explicit instruction) and reads `versionSnapshots` as a plain
 * synchronous lookup -- `setVersionSnapshot` below is the seam a route
 * wrapper uses to populate it after an async fetch, without touching
 * VersionDetail.tsx's own code.
 *
 * The 4 types below (nouvelle question / mise à jour question / mise à
 * jour recommandation / réglementaire) match VersionDetail.tsx's
 * original 4-type design exactly. The real pipeline has 7 (entity_type,
 * proposed_action) combinations (see llm/regulatory_analysis.py::
 * IMPACT_KINDS) -- the 3 the original design didn't cover (nouvelle
 * recommandation, désactivation question, désactivation recommandation)
 * are ADDED here as additional ChangeType values, consistent with the
 * pattern already established for the same gap in AdminVeille.tsx's
 * IMPACT_COLOR/IMPACT_LABEL.
 */

import type { AssociatedRecommendation, CircularDetail, Impact, ProposedData } from "../../lib/regulatory";
import type { MaturityLevel } from "../../lib/config";

export type ChangeType =
  | "nouvelle question"
  | "mise à jour question"
  | "mise à jour recommandation"
  | "réglementaire"
  | "nouvelle recommandation"
  | "désactivation question"
  | "désactivation recommandation";

export interface SuggestedAnswer {
  level: number;
  label: string;
  answer: string;
  recommandation: string;
}

export interface VersionChange {
  id: string;
  type: ChangeType;
  exigence: string;
  dimension: string;
  element: string;
  sourceRef?: string;
  // nouvelle question
  question?: string;
  suggestedAnswers?: SuggestedAnswer[];
  // mise à jour question
  oldQuestion?: string;
  newQuestion?: string;
  // mise à jour recommandation
  oldRecommandation?: string;
  newRecommandation?: string;
  // réglementaire (recommandation existante, indicateur activé)
  recommandation?: string;
  // nouvelle recommandation
  newRecommandationTitle?: string;
  attachedQuestion?: string;
  // désactivation (question ou recommandation)
  disabledTitle?: string;
  justification?: string;
}

export interface VersionSnapshot {
  changes: VersionChange[];
  publishedAt: string;
  publishedBy: string;
  circulaireRef: string;
}

/** Cache mutable, lu de façon SYNCHRONE par VersionDetail.tsx (conçu tel
 * quel, jamais modifié -- voir le docstring du module) : un wrapper de
 * route fait l'appel API async, construit le snapshot via
 * `buildVersionSnapshot`, l'enregistre ici avec `setVersionSnapshot`,
 * PUIS rend `<VersionDetail>`, qui le retrouve alors par simple lookup. */
export const versionSnapshots: Record<string, VersionSnapshot> = {};

export function setVersionSnapshot(versionId: string, snapshot: VersionSnapshot): void {
  versionSnapshots[versionId] = snapshot;
}

// ── Edited-content overlay (miroir de EditedFields/parseEditedPayload
// côté AdminVeille.tsx et _parse_edited_payload côté backend) ───────────

interface EditedFields {
  recommandation?: string;
  question?: string;
  justification?: string;
  levels?: Record<number, { answer?: string; recText?: string }>;
}

function parseEditedPayload(editedText: string | null): EditedFields {
  if (!editedText) return {};
  try {
    const parsed = JSON.parse(editedText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// ── Élément / dimension à l'affichage (même logique que
// impactElementAndDimension dans AdminVeille.tsx, dupliquée ici -- un
// composant de page ne doit pas être une dépendance d'un module partagé) ──

function elementAndDimension(entityType: string, proposedAction: string, p: ProposedData): { element: string; dimension: string } {
  const key = `${entityType}:${proposedAction}`;
  switch (key) {
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

function buildSuggestedAnswers(p: ProposedData, edited: EditedFields, maturityLevels: MaturityLevel[]): SuggestedAnswer[] {
  const labels = p.level_labels ?? [];
  const recos: AssociatedRecommendation[] = p.associated_recommendations ?? [];
  return labels.map((text, i) => {
    const level = i + 1;
    const meta = maturityLevels[i];
    const editedLevel = edited.levels?.[level];
    const rec = recos.find(r => r.trigger_level === level);
    return {
      level,
      label: meta?.label ?? `Niveau ${level}`,
      answer: editedLevel?.answer ?? text,
      recommandation: editedLevel?.recText ?? rec?.recommendation_text ?? "",
    };
  });
}

/** Un impact APPLIQUÉ (action "accepté" ou "modifié" -- voir
 * apply_impacts_to_catalog, jamais "rejeté" ni en attente) -> un
 * VersionChange. "modifié" applique le contenu édité (edited_text) par
 * dessus la proposition d'origine, exactement comme la publication l'a
 * fait -- ce panneau doit refléter ce qui a RÉELLEMENT été écrit au
 * référentiel, pas la proposition brute du LLM. */
function impactToChange(impact: Impact, circularRef: string, maturityLevels: MaturityLevel[]): VersionChange | null {
  if (impact.action !== "accepté" && impact.action !== "modifié") return null;
  const p = impact.proposedData;
  const edited = impact.action === "modifié" ? parseEditedPayload(impact.editedText) : {};
  const key = `${impact.entityType}:${impact.proposedAction}`;
  const { element, dimension } = elementAndDimension(impact.entityType, impact.proposedAction, p);
  const base = {
    id: String(impact.id),
    exigence: impact.requirementText,
    dimension,
    element,
    sourceRef: circularRef,
  };

  switch (key) {
    case "question:ajouter":
      return {
        ...base,
        type: "nouvelle question",
        question: edited.question ?? p.title ?? "",
        suggestedAnswers: buildSuggestedAnswers(p, edited, maturityLevels),
      };
    case "question:modifier":
      return {
        ...base,
        type: "mise à jour question",
        oldQuestion: p.question_title ?? "",
        newQuestion: edited.question ?? p.modification ?? "",
      };
    case "recommandation:modifier":
      return {
        ...base,
        type: "mise à jour recommandation",
        oldRecommandation: p.reco_text ?? "",
        newRecommandation: edited.recommandation ?? p.modification ?? "",
      };
    case "recommandation:activer_flag":
      return {
        ...base,
        type: "réglementaire",
        recommandation: p.reco_text ?? "",
      };
    case "recommandation:ajouter":
      return {
        ...base,
        type: "nouvelle recommandation",
        newRecommandationTitle: p.title ?? "",
        newRecommandation: edited.recommandation ?? p.recommendation_text ?? "",
        attachedQuestion: [p.question_title, p.question_dimension].filter(Boolean).join(", "),
      };
    case "question:desactiver":
      return {
        ...base,
        type: "désactivation question",
        disabledTitle: p.question_title ?? "",
        justification: edited.justification ?? p.justification ?? "",
      };
    case "recommandation:desactiver":
      return {
        ...base,
        type: "désactivation recommandation",
        disabledTitle: p.reco_text ?? "",
        justification: edited.justification ?? p.justification ?? "",
      };
    default:
      return null;
  }
}

export function buildVersionSnapshot(circular: CircularDetail, maturityLevels: MaturityLevel[]): VersionSnapshot {
  const changes = circular.impacts
    .map(i => impactToChange(i, circular.reference, maturityLevels))
    .filter((c): c is VersionChange => c !== null);
  return {
    changes,
    publishedAt: circular.publishedAt ?? circular.createdAt,
    publishedBy: circular.publishedBy ?? "-",
    circulaireRef: circular.reference,
  };
}
