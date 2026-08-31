/**
 * Client for the back-office account page (`/api/back-office/profile`).
 *
 * Only the administrator-specific part lives here. Editing one's name, email
 * or organisation still goes through `lib/profile.ts` — that endpoint is
 * shared with every authenticated user, and duplicating the write path would
 * mean two places that can put a person's details into Keycloak.
 */

import { api } from "./api";

export interface ProfileActivityItem {
  id: number;
  created_at: string;
  module: string;
  action: string;
  status: string;
  entity_label: string;
}

export interface AdminProfileOverview {
  id: string;
  username: string | null;
  email: string | null;
  /** Keycloak realm role, e.g. "super_admin". */
  role: string | null;
  email_verified: boolean;
  created_at: string | null;
  /** null when the event log is unavailable or has expired — unknown, not "never". */
  last_login: string | null;
  actions_total: number;
  actions_30d: number;
  last_action_at: string | null;
  recent_actions: ProfileActivityItem[];
}

export interface PasswordResetResult {
  sent: boolean;
  email: string | null;
}

export const getAdminProfile = () =>
  api.get<AdminProfileOverview>("/api/back-office/profile");

/** Mails the signed-in admin a temporary password, required at next sign-in.
 *  Ouvert aux deux rôles back-office (`super_admin` et `admin`). */
export const resetOwnPassword = () =>
  api.post<PasswordResetResult>("/api/back-office/profile/password");
