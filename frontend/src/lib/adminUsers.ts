/**
 * Client for the admin user-management endpoints (Keycloak-backed).
 * Authenticated: goes through the token-aware `api` helper.
 */

import { api } from "./api";

export type BusinessRole = "admin" | "consultant" | "repondant" | "validateur";

export interface AdminUser {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  enabled: boolean;
  status: string;
  organization: string | null;
  role: BusinessRole | null;
  created_at: string | null;
  last_login: string | null;
}

export interface UserPayload {
  first_name: string;
  last_name: string;
  email: string;
  role: BusinessRole;
  organization?: string | null;
  status: "Actif" | "En attente" | "Désactivé" | "Archivé";
}

export interface ActionEmailResult {
  sent: boolean;
  email: string | null;
}

export const listUsers = (params?: { search?: string; first?: number; max?: number }) => {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.first != null) qs.set("first", String(params.first));
  if (params?.max != null) qs.set("max", String(params.max));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api.get<AdminUser[]>(`/api/admin/users${suffix}`);
};

export const countUsers = (search?: string) => {
  const suffix = search ? `?search=${encodeURIComponent(search)}` : "";
  return api.get<{ count: number }>(`/api/admin/users/count${suffix}`);
};

export const createUser = (payload: UserPayload) =>
  api.post<AdminUser>("/api/admin/users", payload);

export const updateUser = (id: string, payload: UserPayload) =>
  api.put<AdminUser>(`/api/admin/users/${id}`, payload);

export const setUserEnabled = (id: string, enabled: boolean) =>
  api.put<AdminUser>(`/api/admin/users/${id}/enabled`, { enabled });

export const setUserArchived = (id: string, archived: boolean) =>
  api.put<AdminUser>(`/api/admin/users/${id}/archived`, { archived });

export const resetUserPassword = (id: string) =>
  api.put<ActionEmailResult>(`/api/admin/users/${id}/reset-password`);
