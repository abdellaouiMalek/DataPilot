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
  type: string;
  weight: number;
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

// ── Raw API shapes ──────────────────────────────────────────────────────────
interface ApiQuestion {
  id: number;
  dimension_id: number;
  sub_dimension_id: number | null;
  text: string;
  type: string;
  weight: number;
  sort_order: number;
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

const toStatus = (active: boolean): Status => (active ? "Active" : "Inactive");
const toActive = (status?: Status) => status !== "Inactive";

function mapQuestion(q: ApiQuestion): Question {
  return { id: String(q.id), label: q.text, type: q.type, weight: q.weight, status: toStatus(q.is_active) };
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
  type?: string;
  weight?: number;
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
  deleteDimension: (id: string) => api.del(`/api/admin/dimensions/${id}`),

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
  deleteSubDimension: (id: string) => api.del(`/api/admin/subdimensions/${id}`),

  // Questions
  createQuestion: (subDimensionId: string, input: QuestionInput) =>
    api.post<{ id: number }>("/api/admin/questions", {
      sub_dimension_id: Number(subDimensionId),
      text: input.label,
      type: input.type ?? "Échelle de maturité",
      weight: input.weight ?? 0,
      is_active: toActive(input.status),
    }),
  updateQuestion: (id: string, input: Partial<QuestionInput>) =>
    api.patch(`/api/admin/questions/${id}`, {
      ...(input.label !== undefined && { text: input.label }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.weight !== undefined && { weight: input.weight }),
      ...(input.status !== undefined && { is_active: toActive(input.status) }),
    }),
  deleteQuestion: (id: string) => api.del(`/api/admin/questions/${id}`),
};
