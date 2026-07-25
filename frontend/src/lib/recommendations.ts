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

export interface NarrativeOut {
  narrative: string;
}

export const getRecommendations = (assessmentId: number) =>
  api.get<RecommendationOut[]>(
    `/api/assessments/${assessmentId}/recommendations`
  );

export const getNarrative = (assessmentId: number) =>
  api.get<NarrativeOut>(`/api/assessments/${assessmentId}/narrative`);
