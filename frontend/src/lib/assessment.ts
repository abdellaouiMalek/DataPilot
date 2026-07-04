/**
 * Client for submitting a completed questionnaire and receiving the computed
 * maturity scores.
 *
 * Unlike the public config endpoints, this is authenticated (the questionnaire
 * and results pages sit behind Keycloak), so it goes through the token-aware
 * `api` helper rather than a plain `fetch`.
 */

import { api } from "./api";

export interface AnswerIn {
  question_id: number;
  value: number;
}

export interface AssessmentCreate {
  bank: string;
  department?: string | null;
  evaluator_role?: string | null;
  answers: AnswerIn[];
}

export interface DimensionScore {
  dimension_id: number;
  key: string;
  name: string;
  score: number;
}

export interface AssessmentResult {
  id: number;
  bank: string;
  department: string | null;
  evaluator_role: string | null;
  score_global: number | null;
  maturity_label: string | null;
  created_at: string;
  dimension_scores: DimensionScore[];
}

export const submitAssessment = (payload: AssessmentCreate) =>
  api.post<AssessmentResult>("/api/assessments", payload);
