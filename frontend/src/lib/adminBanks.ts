/**
 * Client for the admin bank-management endpoints.
 * Authenticated: goes through the token-aware `api` helper.
 */

import { API_URL, api } from "./api";

export interface AdminBank {
  id: number;
  name: string;
  country: string;
  sector: string;
  contact: string | null;
  description: string;
  is_active: boolean;
  archived: boolean;
  logo_url: string | null;
  status: string; // Actif | En attente | Désactivé | Archivé (derived server-side)
  created_at: string | null;
  score: number | null;
  assessments_count: number;
  last_assessment_at: string | null;
}

/** `logo_url` is API-relative ("/static/logos/12.png"); resolve it against
 * the API's own origin, not the frontend's, since they run on different
 * ports in dev. */
export const bankLogoSrc = (logoUrl: string | null) =>
  logoUrl ? `${API_URL}${logoUrl}` : null;

export interface BankPayload {
  name: string;
  country?: string;
  sector?: string;
  contact?: string | null;
  description?: string;
}

export const listBanks = () => api.get<AdminBank[]>("/api/super-admin/banks");

export const createBank = (payload: BankPayload) =>
  api.post<AdminBank>("/api/super-admin/banks", payload);

export const updateBank = (id: number, payload: BankPayload) =>
  api.put<AdminBank>(`/api/super-admin/banks/${id}`, payload);

export const setBankActive = (id: number, is_active: boolean) =>
  api.put<AdminBank>(`/api/super-admin/banks/${id}/active`, { is_active });

export const setBankArchived = (id: number, archived: boolean) =>
  api.put<AdminBank>(`/api/super-admin/banks/${id}/archived`, { archived });

export const uploadBankLogo = (id: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.postForm<AdminBank>(`/api/super-admin/banks/${id}/logo`, form);
};

export const deleteBankLogo = (id: number) =>
  api.del<AdminBank>(`/api/super-admin/banks/${id}/logo`);
