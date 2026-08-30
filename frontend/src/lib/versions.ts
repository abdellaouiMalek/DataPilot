/**
 * Client for the read-only "questionnaire versions" endpoints
 * (`/api/versions`) -- every PUBLISHED "Veille réglementaire" circular is
 * one version (see backend/app/routers/versions.py). Deliberately
 * separate from `regulatoryApi` (super-admin only, covers the full
 * in-review workflow) : readable by both `admin` and `super_admin`, and
 * only ever returns already-published circulars.
 *
 * Reuses `Circular`/`CircularDetail` and their mappers from `lib/regulatory`
 * -- same underlying data, just a different, more permissive read surface.
 */

import { api } from "./api";
import {
  mapCircular, mapCircularDetail,
  type ApiCircular, type ApiCircularDetail, type Circular, type CircularDetail,
} from "./regulatory";

export const versionsApi = {
  list: async (): Promise<Circular[]> =>
    (await api.get<ApiCircular[]>("/api/versions")).map(mapCircular),

  get: async (circularId: number): Promise<CircularDetail> =>
    mapCircularDetail(await api.get<ApiCircularDetail>(`/api/versions/${circularId}`)),
};
