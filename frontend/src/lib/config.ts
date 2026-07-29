/**
 * Client for the public reference-data (config) endpoints.
 *
 * These are intentionally unauthenticated — the landing page is public, so we
 * use a plain `fetch` here instead of the Keycloak-aware `api` helper (which
 * would force a login redirect).
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Échec du chargement (${res.status}) : ${path}`);
  }
  return res.json() as Promise<T>;
}

export interface Question {
  id: number;
  text: string;
  description: string | null;
  sort_order: number;
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

export interface MaturityLevel {
  id: number;
  label: string;
  min_score: number;
  max_score: number;
  color: string;
  description: string;
}

export const getDimensions = () => getJson<Dimension[]>("/api/dimensions");
export const getBanks = () => getJson<Lookup[]>("/api/banks");
export const getDepartments = () => getJson<Lookup[]>("/api/departments");
export const getRoles = () => getJson<Lookup[]>("/api/roles");
export const getMaturityLevels = () => getJson<MaturityLevel[]>("/api/maturity-levels");
