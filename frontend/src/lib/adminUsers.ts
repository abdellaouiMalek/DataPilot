/**
 * Client for the admin user-management endpoints (Keycloak-backed).
 * Authenticated: goes through the token-aware `api` helper.
 */

import { api } from "./api";

/**
 * Rôles métier. Seul `super_admin` donne accès au back-office ;
 * `admin` est un rôle métier ordinaire, au même titre que `consultant`.
 */
export type BusinessRole =
  | "super_admin"
  | "admin"
  | "consultant"
  | "repondant"
  | "validateur";

/**
 * Libellés français des rôles métier. Vit ici plutôt que dans la page
 * utilisateurs : le tableau de bord les affiche aussi (répartition des
 * comptes), et deux copies finiraient par diverger.
 */
export const ROLE_LABELS: Record<BusinessRole, string> = {
  super_admin: "Super Admin EY",
  admin:       "Admin",
  consultant:  "Consultant EY",
  repondant:   "Répondant Banque",
  validateur:  "Validateur Banque",
};

export interface AdminUser {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  enabled: boolean;
  status: string;
  organization: string | null;
  // Which bank's assessment data this user can access. Admin-set only.
  bank_id: number | null;
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
  bank_id?: number | null;
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
  return api.get<AdminUser[]>(`/api/super-admin/users${suffix}`);
};

export const countUsers = (search?: string) => {
  const suffix = search ? `?search=${encodeURIComponent(search)}` : "";
  return api.get<{ count: number }>(`/api/super-admin/users/count${suffix}`);
};

export const createUser = (payload: UserPayload) =>
  api.post<AdminUser>("/api/super-admin/users", payload);

export const updateUser = (id: string, payload: UserPayload) =>
  api.put<AdminUser>(`/api/super-admin/users/${id}`, payload);

export const setUserEnabled = (id: string, enabled: boolean) =>
  api.put<AdminUser>(`/api/super-admin/users/${id}/enabled`, { enabled });

export const setUserArchived = (id: string, archived: boolean) =>
  api.put<AdminUser>(`/api/super-admin/users/${id}/archived`, { archived });

export const resetUserPassword = (id: string) =>
  api.put<ActionEmailResult>(`/api/super-admin/users/${id}/reset-password`);
