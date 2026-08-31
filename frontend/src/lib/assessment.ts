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
  bank_id: number;
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
  bank_id: number;
  bank: string;
  department: string | null;
  evaluator_role: string | null;
  score_global: number | null;
  maturity_label: string | null;
  created_at: string;
  // Published questionnaire version this was answered on. null for
  // assessments submitted before versioning existed.
  version_id: number | null;
  version_number: number | null;
  dimension_scores: DimensionScore[];
  // Whether the caller is the one who submitted this assessment -- the
  // history list is bank-wide (colleagues' submissions included), not
  // just the caller's own.
  submitted_by_me: boolean;
}

export const submitAssessment = (payload: AssessmentCreate) =>
  api.post<AssessmentResult>("/api/assessments", payload);

/** Every assessment for the caller's bank, newest first (colleagues'
 * submissions included -- see `submitted_by_me` to tell them apart). */
export const getMyAssessments = () =>
  api.get<AssessmentResult[]>("/api/assessments/me");

/**
 * Une évaluation, par son id.
 *
 * C'est ce qui rend `/results/:id`, `/recommendations/:id` et `/simulation/:id`
 * rechargeables : la page se reconstruit depuis l'URL au lieu de dépendre de
 * l'état du routeur, que le navigateur jette à chaque rafraîchissement.
 * 404 si l'évaluation appartient à une autre banque.
 */
export const getAssessment = (assessmentId: number) =>
  api.get<AssessmentResult>(`/api/assessments/${assessmentId}`);

/**
 * Lien vers le questionnaire, profil compris.
 *
 * `QuestionnairePage` lit l'etablissement, le departement et le role dans la
 * query string, et refuse de demarrer sans eux (« Veuillez d'abord renseigner
 * votre profil… »). Ils passent par l'URL et non par l'etat du routeur parce
 * qu'un visiteur pas encore authentifie va etre redirige vers Keycloak et
 * revenir : seule l'URL survit a cet aller-retour.
 *
 * Centralise ici plutot que reconstruit sur chaque page qui propose de
 * demarrer une evaluation -- c'est exactement l'oubli d'un de ces parametres
 * qui renvoie l'utilisateur au message ci-dessus.
 */
export const questionnaireUrl = (profile: {
  bankId: number;
  bank: string;
  department: string;
  role: string;
}) =>
  `/questionnaire?${new URLSearchParams({
    bankId: String(profile.bankId),
    bank: profile.bank,
    department: profile.department,
    role: profile.role,
  })}`;
