/**
 * Client for the ranked-recommendations endpoint. Authenticated (same
 * Keycloak-aware `api` helper as `assessment.ts`), since it reads a
 * specific assessment's answers.
 */

import { api } from "./api";

export interface ExplanationFactor {
  feature: string;
  shap_value: number;
  direction: "positif" | "negatif";
  label: string;
}

export interface RecommendationOut {
  rank: number;
  score: number;
  code: string;
  title: string;
  recommendation_text: string;
  category: string;
  regulatory_flag: boolean;
  effort: number;
  question_id: number;
  dimension_id: number;
  trigger_level: number;
  target_level: number;
  explanation_factors: ExplanationFactor[];
  texte_reformule: string;
  justification: string;
}

export interface DimensionNoteOut {
  dimension_id: number;
  dimension_name: string;
  dimension_score: number;
  message: string;
}

/** Response shape of `GET /api/assessments/{id}/recommendations`. */
export interface RecommendationPlanOut {
  plan_prioritaire: RecommendationOut[];
  recommandations_completes: RecommendationOut[];
  notes_dimensions: DimensionNoteOut[];
}

export interface NarrativeOut {
  narrative: string;
}

export const getRecommendations = (assessmentId: number) =>
  api.get<RecommendationPlanOut>(
    `/api/assessments/${assessmentId}/recommendations`
  );

export const getNarrative = (assessmentId: number) =>
  api.get<NarrativeOut>(`/api/assessments/${assessmentId}/narrative`);

/** One LLM-authored analysis of the evolution between two assessments,
 * rather than two independent per-assessment narratives. */
export const getComparisonNarrative = (initialId: number, currentId: number) =>
  api.get<NarrativeOut>(
    `/api/assessments/comparison/narrative?initial_id=${initialId}&current_id=${currentId}`
  );
