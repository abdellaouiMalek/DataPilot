/**
 * Client for the back-office topbar's quick search (`/api/super-admin/search`).
 *
 * The notification bell has its own client, `lib/notifications.ts`
 * (`/api/notifications`) -- real per-user records, unlike this search which
 * is stateless.
 */

import { api } from "./api";

export type SearchKind =
  | "bank"
  | "user"
  | "dimension"
  | "subdimension"
  | "question"
  | "version";

export interface SearchHit {
  kind: SearchKind;
  /** French plural label, used as the group heading. */
  label: string;
  module: string;
  title: string;
  subtitle: string;
  target: string;
  /** Pre-fills the destination page's own filter so the row is on screen. */
  seed: string;
}

export interface SearchResults {
  query: string;
  hits: SearchHit[];
  users_available: boolean;
}

/** Below this the server rejects the query; the UI waits rather than erroring. */
export const MIN_SEARCH_LENGTH = 2;

export const quickSearch = (q: string) =>
  api.get<SearchResults>(`/api/super-admin/search?q=${encodeURIComponent(q)}`);
