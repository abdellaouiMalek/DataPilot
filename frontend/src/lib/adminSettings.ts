/**
 * Client for the platform settings (`/api/super-admin/settings`).
 *
 * Two sections with two different sources of truth: security settings live on
 * the Keycloak realm, notifications in the app's own table.
 */

import { api } from "./api";

export interface SecuritySettings {
  /** Realm-wide: every account is asked to enrol a second factor at next sign-in. */
  two_factor_required: boolean;
  session_idle_minutes: number;
  /** null = no expiry rule set. */
  password_expiry_days: number | null;
}

export interface NotificationSettings {
  /** null disables every notification, there is nowhere to send them. */
  notify_email: string | null;
  notify_on_assessment: boolean;
  notify_on_new_user: boolean;
}

export interface PlatformSettings {
  security: SecuritySettings;
  notifications: NotificationSettings;
  /** False when SMTP is unconfigured: notifications would go nowhere. */
  smtp_configured: boolean;
}

export interface SettingsPayload {
  security?: SecuritySettings;
  notifications?: NotificationSettings;
}

export const getSettings = () =>
  api.get<PlatformSettings>("/api/super-admin/settings");

export const updateSettings = (payload: SettingsPayload) =>
  api.put<PlatformSettings>("/api/super-admin/settings", payload);
