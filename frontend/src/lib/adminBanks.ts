/**
 * Client for the admin bank-management endpoints.
 * Authenticated: goes through the token-aware `api` helper.
 */

import { api } from "./api";

export interface AdminBank {
  id: number;
  name: string;
  country: string;
  sector: string;
  contact: string | null;
  description: string;
  is_active: boolean;
  archived: boolean;
  status: string; // Actif | En attente | Désactivé | Archivé (derived server-side)
  created_at: string | null;
  score: number | null;
  assessments_count: number;
  last_assessment_at: string | null;
}

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
