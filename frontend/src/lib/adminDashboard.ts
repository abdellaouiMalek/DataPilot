/**
 * Client for the back-office dashboard (`/api/super-admin/dashboard`).
 *
 * One call returns everything the page draws — tiles, trend, donut, bars,
 * alerts, activity, banks table. Aggregating server-side rather than fanning
 * out to the per-module endpoints keeps the figures consistent with each
 * other (they all read the same transaction) and keeps the page to a single
 * round-trip on a view that is opened constantly.
 */

import { api } from "./api";
import type { BusinessRole } from "./adminUsers";

/** Trend window. Short ranges are bucketed by day, the long one by month. */
export type TrendRange = "7d" | "30d" | "12m";

export interface DashboardKpis {
  active_users: number;
  new_users_30d: number;
  banks: number;
  new_banks_30d: number;
  /** Questions in the *published* version, not the live (editable) framework. */
  questions: number;
  /** Against the previously published version; 0 when there is only one. */
  questions_delta: number;
  /** "v3", or null while nothing has been published. */
  active_version: string | null;
  active_version_label: string;
  assessments: number;
  assessments_30d: number;
}

export interface TrendPoint {
  label: string;
  evaluations: number;
  /** Distinct banks that submitted at least once in the bucket. */
  banques: number;
  nouvelles_banques: number;
}

export interface RoleSlice {
  /** Keycloak realm role, or "none" for accounts holding no business role. */
  role: BusinessRole | "none";
  value: number;
}

export interface BankScore {
  name: string;
  score: number;
}

export interface DashboardAlert {
  /** Stable identifier for the condition ("users.pending"); `text` moves with the data. */
  code: string;
  /** Audit-trail module vocabulary, for icon reuse. */
  module: string;
  level: "critical" | "warning" | "info";
  text: string;
  action: string;
  /** Key into the page's `pageRoutes` map — where the action button goes. */
  target: string;
}

export interface ActivityItem {
  id: number;
  created_at: string;
  module: string;
  action: string;
  actor_name: string;
  status: string;
}

export interface BankRow {
  id: number;
  name: string;
  status: string;
  /** null when the bank has never been evaluated. */
  score: number | null;
  /** null when Keycloak is unreachable — unknown, not zero. */
  users: number | null;
  last_assessment_at: string | null;
}

export interface Dashboard {
  kpis: DashboardKpis;
  trend_range: TrendRange;
  trend: TrendPoint[];
  roles: RoleSlice[];
  bank_scores: BankScore[];
  /** Only triggered checks; empty means nothing needs attention. */
  alerts: DashboardAlert[];
  activity: ActivityItem[];
  banks: BankRow[];
  /** False when Keycloak could not be reached: user figures are unknown. */
  users_available: boolean;
}

export const getDashboard = (range: TrendRange) =>
  api.get<Dashboard>(`/api/super-admin/dashboard?range=${range}`);
