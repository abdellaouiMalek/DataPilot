/**
 * Client for the audit-trail endpoints (`/api/super-admin/logs`).
 *
 * Filtering and paging are the server's job here, not the page's: the trail
 * grows with every administrative action, so the list is never fully loaded
 * client-side. Every filter the UI exposes maps to a query parameter, and the
 * stat-card totals come back with the page rather than being counted from the
 * rows on screen.
 */

import { api } from "./api";

export interface AuditLogEntry {
  id: number;
  created_at: string;
  actor_name: string;
  actor_email: string | null;
  module: string;
  action: string;
  status: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string;
  /** Empty when the action has no meaningful previous state (a creation). */
  before: string;
  after: string;
  details: Record<string, unknown> | null;
  ip: string | null;
}

export interface AuditLogCounts {
  total: number;
  success: number;
  warnings: number;
  errors: number;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  per_page: number;
  counts: AuditLogCounts;
  /** Filter vocabularies, served by the backend so they can't drift. */
  modules: string[];
  statuses: string[];
}

export interface AuditLogFilters {
  q?: string;
  module?: string;
  status?: string;
  /** ISO date (yyyy-mm-dd), inclusive on both ends. */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
}

function toQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.module) params.set("module", filters.module);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.perPage) params.set("per_page", String(filters.perPage));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const getAuditLogs = (filters: AuditLogFilters = {}) =>
  api.get<AuditLogPage>(`/api/super-admin/logs${toQuery(filters)}`);

/** The current filter set as a CSV file, saved through the browser. */
export async function exportAuditLogs(filters: AuditLogFilters = {}): Promise<void> {
  // Page/per_page are meaningless for an export: it always covers the whole
  // filtered set, not the page being looked at.
  const { page: _page, perPage: _perPage, ...rest } = filters;
  const blob = await api.getBlob(`/api/super-admin/logs/export.csv${toQuery(rest)}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `datapilot-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
