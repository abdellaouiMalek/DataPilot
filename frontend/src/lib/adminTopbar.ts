/**
 * Client for the back-office topbar: the notification bell and the quick search.
 *
 * Read/unread state is not a server concern — which items a given person has
 * already looked at is per-user and per-device — so it lives in localStorage
 * here, keyed on the notification's stable `key`. The helpers at the bottom
 * are what the topbar uses to decide whether to light the dot.
 */

import { api } from "./api";

export interface AdminNotification {
  /** Stable across polls: `cfg:<alert code>` or `log:<id>`. */
  key: string;
  level: "critical" | "warning" | "info";
  /** Audit-trail module vocabulary, so the UI reuses that module's icon. */
  module: string;
  text: string;
  action: string;
  /** Key into the topbar's `pageRoutes` map. */
  target: string;
  /** null for configuration states — conditions, not events. */
  created_at: string | null;
}

export interface NotificationsResponse {
  items: AdminNotification[];
  /** False when Keycloak is unreachable: user checks were skipped. */
  users_available: boolean;
}

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

export const getNotifications = () =>
  api.get<NotificationsResponse>("/api/super-admin/notifications");

export const quickSearch = (q: string) =>
  api.get<SearchResults>(`/api/super-admin/search?q=${encodeURIComponent(q)}`);

// ── Seen markers ──────────────────────────────────────────────────────────────

const SEEN_PREFIX = "datapilot.notifications.seen";

/** Per account: two admins sharing a browser must not clear each other's dot. */
const seenKey = (userKey: string) => `${SEEN_PREFIX}.${userKey}`;

export function readSeen(userKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(seenKey(userKey));
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    // Corrupt or unavailable storage (private mode, quota): treat everything
    // as unseen rather than breaking the bell.
    return new Set<string>();
  }
}

/**
 * Records the given keys as seen, dropping any previously-stored key that is
 * no longer live — otherwise the list grows for ever with the ids of
 * conditions that were fixed months ago.
 */
export function markSeen(userKey: string, keys: string[]): void {
  try {
    localStorage.setItem(seenKey(userKey), JSON.stringify(keys));
  } catch {
    /* storage unavailable — the dot simply stays lit */
  }
}

export const unseenCount = (items: AdminNotification[], seen: Set<string>) =>
  items.reduce((count, item) => (seen.has(item.key) ? count : count + 1), 0);
