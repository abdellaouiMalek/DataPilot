/**
 * Authenticated client for the admin framework endpoints (`/api/admin/*`).
 *
 * The backend speaks `is_active` / `text` / numeric ids; the admin UI speaks
 * `status` ("Active"/"Inactive") / `label` / string ids. This module maps
 * between the two so the page can stay in its own vocabulary.
 */

import { api } from "./api";

export type Status = "Active" | "Inactive";

// ── UI-facing shapes (consumed by AdminDimensions.tsx) ──────────────────────
export interface Question {
  id: string;
  label: string;
  description: string;
  type: string;
  weight: number;
  order: number;
  isRequired: boolean;
  // Per-level point overrides for "Échelle de maturité" questions (index 0 = level 1).
  levelScores: number[] | null;
  status: Status;
}

export interface SubDimension {
  id: string;
  name: string;
  status: Status;
  questions: Question[];
}

export interface Dimension {
  id: string;
  name: string;
  description: string;
  weight: number;
  status: Status;
  color: string;
  subDimensions: SubDimension[];
}

// What a force-delete would wipe out, shown to the admin before they confirm.
export interface DeleteImpact {
  answerCount: number;
  assessmentCount: number;
  recommendationCount: number;
}

// ── Raw API shapes ──────────────────────────────────────────────────────────
interface ApiQuestion {
  id: number;
  dimension_id: number;
  sub_dimension_id: number | null;
  text: string;
  description: string | null;
  type: string;
  weight: number;
  sort_order: number;
  is_required: boolean;
  level_scores: number[] | null;
  is_active: boolean;
}
interface ApiSubDimension {
  id: number;
  dimension_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  questions: ApiQuestion[];
}
interface ApiDimension {
  id: number;
  key: string;
  code: string;
  name: string;
  short_name: string;
  description: string;
  weight: number;
  color: string;
  sort_order: number;
  is_active: boolean;
  sub_dimensions: ApiSubDimension[];
}

interface ApiDeleteImpact {
  answer_count: number;
  assessment_count: number;
  recommendation_count: number;
}

const toStatus = (active: boolean): Status => (active ? "Active" : "Inactive");
const toActive = (status?: Status) => status !== "Inactive";
const mapImpact = (i: ApiDeleteImpact): DeleteImpact => ({
  answerCount: i.answer_count,
  assessmentCount: i.assessment_count,
  recommendationCount: i.recommendation_count,
});

function mapQuestion(q: ApiQuestion): Question {
  return {
    id: String(q.id),
    label: q.text,
    description: q.description ?? "",
    type: q.type,
    weight: q.weight,
    order: q.sort_order,
    isRequired: q.is_required,
    levelScores: q.level_scores,
    status: toStatus(q.is_active),
  };
}
function mapSub(s: ApiSubDimension): SubDimension {
  return { id: String(s.id), name: s.name, status: toStatus(s.is_active), questions: s.questions.map(mapQuestion) };
}
function mapDimension(d: ApiDimension): Dimension {
  return {
    id: String(d.id),
    name: d.name,
    description: d.description,
    weight: d.weight,
    color: d.color,
    status: toStatus(d.is_active),
    subDimensions: d.sub_dimensions.map(mapSub),
  };
}

// ── Inputs (UI vocabulary) ──────────────────────────────────────────────────
export interface DimensionInput {
  name: string;
  description?: string;
  weight?: number;
  color?: string;
  status?: Status;
}
export interface SubDimensionInput {
  name: string;
  status?: Status;
}
export interface QuestionInput {
  label: string;
  description?: string;
  type?: string;
  weight?: number;
  order?: number;
  isRequired?: boolean;
  levelScores?: number[] | null;
  status?: Status;
}

export const adminApi = {
  listDimensions: async (): Promise<Dimension[]> =>
    (await api.get<ApiDimension[]>("/api/admin/dimensions")).map(mapDimension),

  // Dimensions
  createDimension: (input: DimensionInput) =>
    api.post("/api/admin/dimensions", {
      name: input.name,
      description: input.description ?? "",
      weight: input.weight ?? 0,
      color: input.color ?? "#1A1A1A",
      is_active: toActive(input.status),
    }),
  updateDimension: (id: string, input: Partial<DimensionInput>) =>
    api.patch(`/api/admin/dimensions/${id}`, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.weight !== undefined && { weight: input.weight }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.status !== undefined && { is_active: toActive(input.status) }),
    }),
  deleteDimension: (id: string, force = false) =>
    api.del(`/api/admin/dimensions/${id}${force ? "?force=true" : ""}`),
  getDimensionDeleteImpact: async (id: string): Promise<DeleteImpact> =>
    mapImpact(await api.get<ApiDeleteImpact>(`/api/admin/dimensions/${id}/impact`)),

  // Sub-dimensions
  createSubDimension: (dimensionId: string, input: SubDimensionInput) =>
    api.post<{ id: number }>("/api/admin/subdimensions", {
      dimension_id: Number(dimensionId),
      name: input.name,
      is_active: toActive(input.status),
    }),
  updateSubDimension: (id: string, input: Partial<SubDimensionInput>) =>
    api.patch(`/api/admin/subdimensions/${id}`, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.status !== undefined && { is_active: toActive(input.status) }),
    }),
  deleteSubDimension: (id: string, force = false) =>
    api.del(`/api/admin/subdimensions/${id}${force ? "?force=true" : ""}`),
  getSubDimensionDeleteImpact: async (id: string): Promise<DeleteImpact> =>
    mapImpact(await api.get<ApiDeleteImpact>(`/api/admin/subdimensions/${id}/impact`)),

  // Questions
  createQuestion: (subDimensionId: string, input: QuestionInput) =>
    api.post<{ id: number }>("/api/admin/questions", {
      sub_dimension_id: Number(subDimensionId),
      text: input.label,
      description: input.description ?? "",
      type: input.type ?? "Échelle de maturité",
      weight: input.weight ?? 0,
      sort_order: input.order,
      is_required: input.isRequired ?? true,
      level_scores: input.levelScores ?? null,
      is_active: toActive(input.status),
    }),
  updateQuestion: (id: string, input: Partial<QuestionInput>) =>
    api.patch(`/api/admin/questions/${id}`, {
      ...(input.label !== undefined && { text: input.label }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.weight !== undefined && { weight: input.weight }),
      ...(input.order !== undefined && { sort_order: input.order }),
      ...(input.isRequired !== undefined && { is_required: input.isRequired }),
      ...(input.levelScores !== undefined && { level_scores: input.levelScores }),
      ...(input.status !== undefined && { is_active: toActive(input.status) }),
    }),
  deleteQuestion: (id: string, force = false) =>
    api.del(`/api/admin/questions/${id}${force ? "?force=true" : ""}`),
  getQuestionDeleteImpact: async (id: string): Promise<DeleteImpact> =>
    mapImpact(await api.get<ApiDeleteImpact>(`/api/admin/questions/${id}/impact`)),
};
