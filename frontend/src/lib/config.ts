/**
 * Client for the public reference-data (config) endpoints.
 *
 * These are intentionally unauthenticated, the landing page is public, so we
 * use a plain `fetch` here instead of the Keycloak-aware `api` helper (which
 * would force a login redirect).
 */

import { API_URL } from "./env";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Échec du chargement (${res.status}) : ${path}`);
  }
  return res.json() as Promise<T>;
}

export interface LevelResponse {
  label: string;
  score: number;
}

export interface Question {
  id: number;
  text: string;
  description: string | null;
  sort_order: number;
  /** The real per-question answer scale (label + score, levels 1-5), as set
   *  by the admin framework editor. Null for a question that was never
   *  given specific wording -- the questionnaire page falls back to a
   *  generic scale in that case. */
  level_responses: LevelResponse[] | null;
}

export interface Dimension {
  id: number;
  key: string;
  code: string;
  name: string;
  short_name: string;
  description: string;
  sort_order: number;
  questions: Question[];
}

export interface Lookup {
  id: number;
  name: string;
}

export interface BankLookup extends Lookup {
  logo_url: string | null;
}

/** `logo_url` is API-relative; resolve it against this same API origin,
 * which differs from the frontend's own in dev. */
export const bankLogoSrc = (logoUrl: string | null) =>
  logoUrl ? `${API_URL}${logoUrl}` : null;

export interface MaturityLevel {
  id: number;
  label: string;
  min_score: number;
  max_score: number;
  color: string;
  description: string;
}

export const getDimensions = () => getJson<Dimension[]>("/api/dimensions");
export const getBanks = () => getJson<BankLookup[]>("/api/banks");
export const getDepartments = () => getJson<Lookup[]>("/api/departments");
export const getRoles = () => getJson<Lookup[]>("/api/roles");
export const getMaturityLevels = () => getJson<MaturityLevel[]>("/api/maturity-levels");
