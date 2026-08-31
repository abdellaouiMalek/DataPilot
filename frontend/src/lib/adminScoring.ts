/**
 * Client for the scoring referential endpoints (`/api/super-admin/scoring/*`).
 *
 * Bands are expressed on the questionnaire's own 1→5 scale (the same values
 * respondents pick), not a 0–100 percentage — the backend sends its bounds in
 * `scale` so this page never hardcodes them.
 */

import { api } from "./api";

export interface MaturityLevel {
  id: number;
  label: string;
  min_score: number;
  max_score: number;
  color: string;
  description: string;
  sort_order: number;
}

export interface ScoringReferential {
  scale: { min: number; max: number };
  levels: MaturityLevel[];
  /** Bands covering the same scores — the mapper would pick the wrong label. */
  overlaps: string[];
  /** Score ranges no band covers — results there get no label at all. */
  gaps: string[];
}

export interface MaturityLevelPayload {
  label?: string;
  min_score?: number;
  max_score?: number;
  color?: string;
  description?: string;
}

export const getScoringReferential = () =>
  api.get<ScoringReferential>("/api/super-admin/scoring/referential");

export const updateMaturityLevel = (id: number, payload: MaturityLevelPayload) =>
  api.patch<ScoringReferential>(
    `/api/super-admin/scoring/maturity-levels/${id}`,
    payload,
  );

export const resetMaturityLevels = () =>
  api.post<ScoringReferential>("/api/super-admin/scoring/maturity-levels/reset", {});
