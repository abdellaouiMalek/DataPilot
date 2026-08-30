/**
 * Client for the in-app notifications endpoints (`/api/notifications`).
 *
 * Any authenticated back-office user (admin or super-admin) has their own
 * list -- the backend derives "whose" from the bearer token, never from a
 * parameter. Currently the only producer is publishing a "Veille
 * réglementaire" update (see backend/app/services/notifications.py),
 * fanned out to every `admin`-role user; the shape here stays generic
 * (type/title/message) so a future producer needs no schema change.
 */

import { api } from "./api";

export type NotificationType = "info" | "success" | "warning";

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  circularId: number | null;
}

interface ApiNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  circular_id: number | null;
}

function mapNotification(n: ApiNotification): AppNotification {
  return {
    id: n.id,
    // Falls back to "info" for a type value the frontend doesn't
    // recognize (e.g. a future producer's new type predating a frontend
    // deploy) rather than rendering nothing.
    type: (["info", "success", "warning"] as const).includes(n.type as NotificationType)
      ? (n.type as NotificationType)
      : "info",
    title: n.title,
    message: n.message,
    read: n.read,
    createdAt: n.created_at,
    circularId: n.circular_id,
  };
}

/** Short, French, relative-time label for the notification list ("À
 * l'instant", "Il y a 5 min", "Il y a 2 h", "Hier", or a plain date once
 * it's more than a week old) -- computed client-side from `createdAt`
 * rather than stored, so it stays accurate no matter how long a
 * notification sits unread. */
export function formatNotificationTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export const notificationsApi = {
  list: async (): Promise<AppNotification[]> =>
    (await api.get<ApiNotification[]>("/api/notifications")).map(mapNotification),

  markRead: async (id: number): Promise<AppNotification> =>
    mapNotification(await api.post<ApiNotification>(`/api/notifications/${id}/read`)),

  markAllRead: async (): Promise<void> => {
    await api.post("/api/notifications/read-all");
  },
};
