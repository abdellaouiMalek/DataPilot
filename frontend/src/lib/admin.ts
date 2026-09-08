/**
 * Authenticated client for the admin framework endpoints (`/api/super-admin/*`).
 *
 * The backend speaks `is_active` / `text` / numeric ids; the admin UI speaks
 * `status` ("Active"/"Inactive") / `label` / string ids. This module maps
 * between the two so the page can stay in its own vocabulary.
 */

import { api } from "./api";

export type Status = "Active" | "Inactive";

// One maturity-scale rung: its label and the points it awards.
export interface LevelResponse {
  label: string;
  score: number;
}

// One selectable option for a Choix unique/Choix multiple question.
export interface ChoiceOption {
  label: string;
  score: number;
}

// ── UI-facing shapes (consumed by AdminDimensions.tsx) ──────────────────────
export interface Question {
  id: string;
  dimensionId: string;
  subDimensionId: string;
  label: string;
  description: string;
  type: string;
  weight: number;
  order: number;
  isRequired: boolean;
  // Per-level label/point overrides, only meaningful for "Échelle de maturité".
  levelResponses: LevelResponse[] | null;
  // Options list, only meaningful for "Choix unique" / "Choix multiple".
  choiceOptions: ChoiceOption[] | null;
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
export interface ApiQuestion {
  id: number;
  dimension_id: number;
  sub_dimension_id: number | null;
  text: string;
  description: string | null;
  type: string;
  weight: number;
  sort_order: number;
  is_required: boolean;
  level_responses: LevelResponse[] | null;
  choice_options: ChoiceOption[] | null;
  is_active: boolean;
}
export interface ApiSubDimension {
  id: number;
  dimension_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  questions: ApiQuestion[];
}
export interface ApiDimension {
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

// ── Recommendations (consumed by AdminRecommendations.tsx) ──────────────────
// One row = one atomic (trigger_level -> trigger_level + 1) step, see
// backend/app/models/recommendation.py -- a UI action that targets several
// trigger levels at once (e.g. the catalog wizard) creates several rows in
// one call, see createRecommendations below.
export interface Recommendation {
  id: string;
  code: string;
  /** Null for a draft recommendation -- see draftQuestionKey. */
  questionId: string | null;
  /** Set only for a recommendation staged against a question that hasn't
   *  been published yet (see AdminDimensions.tsx's "Configurer les
   *  recommandations" flow) -- the same temp id the framework editor uses
   *  for that question in its draft tree. */
  draftQuestionKey: string | null;
  triggerLevel: number;
  targetLevel: number;
  title: string;
  text: string;
  category: string;
  regulatoryFlag: boolean;
  effort: number;
  status: Status;
}

interface ApiRecommendation {
  id: number;
  code: string;
  question_id: number | null;
  draft_question_key: string | null;
  trigger_level: number;
  target_level: number;
  title: string;
  recommendation_text: string;
  category: string;
  regulatory_flag: boolean;
  effort: number;
  prerequisite_id: number | null;
  is_active: boolean;
}

interface ApiRecommendationBatchResult {
  created: ApiRecommendation[];
  skipped_levels: number[];
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
    dimensionId: String(q.dimension_id),
    subDimensionId: q.sub_dimension_id != null ? String(q.sub_dimension_id) : "",
    label: q.text,
    description: q.description ?? "",
    type: q.type,
    weight: q.weight,
    order: q.sort_order,
    isRequired: q.is_required,
    levelResponses: q.level_responses,
    choiceOptions: q.choice_options,
    status: toStatus(q.is_active),
  };
}
function mapSub(s: ApiSubDimension): SubDimension {
  return { id: String(s.id), name: s.name, status: toStatus(s.is_active), questions: s.questions.map(mapQuestion) };
}
export function mapDimension(d: ApiDimension): Dimension {
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
function mapRecommendation(r: ApiRecommendation): Recommendation {
  return {
    id: String(r.id),
    code: r.code,
    questionId: r.question_id != null ? String(r.question_id) : null,
    draftQuestionKey: r.draft_question_key,
    triggerLevel: r.trigger_level,
    targetLevel: r.target_level,
    title: r.title,
    text: r.recommendation_text,
    category: r.category,
    regulatoryFlag: r.regulatory_flag,
    effort: r.effort,
    status: toStatus(r.is_active),
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
  levelResponses?: LevelResponse[] | null;
  choiceOptions?: ChoiceOption[] | null;
  status?: Status;
  // Only meaningful on update, reassigns the question to another sub-dimension
  // (and, transitively, dimension). Ignored by createQuestion, which already
  // takes the target sub-dimension as its own argument.
  subDimensionId?: string;
}
export interface RecommendationInput {
  title?: string;
  text?: string;
  category?: string;
  effort?: number;
  regulatoryFlag?: boolean;
  status?: Status;
}
// All core fields are required to create a recommendation (unlike the
// partial RecommendationInput used for PATCH) -- status stays optional,
// defaulting to Active server-side.
export interface RecommendationCreateInput {
  title: string;
  text: string;
  category: string;
  effort: number;
  regulatoryFlag: boolean;
  status?: Status;
}

export const adminApi = {
  listDimensions: async (): Promise<Dimension[]> =>
    (await api.get<ApiDimension[]>("/api/super-admin/dimensions")).map(mapDimension),

  // Dimensions
  createDimension: (input: DimensionInput) =>
    api.post<{ id: number }>("/api/super-admin/dimensions", {
      name: input.name,
      description: input.description ?? "",
      weight: input.weight ?? 0,
      color: input.color ?? "#1A1A1A",
      is_active: toActive(input.status),
    }),
  updateDimension: (id: string, input: Partial<DimensionInput>) =>
    api.patch(`/api/super-admin/dimensions/${id}`, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.weight !== undefined && { weight: input.weight }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.status !== undefined && { is_active: toActive(input.status) }),
    }),
  deleteDimension: (id: string, force = false) =>
    api.del(`/api/super-admin/dimensions/${id}${force ? "?force=true" : ""}`),
  getDimensionDeleteImpact: async (id: string): Promise<DeleteImpact> =>
    mapImpact(await api.get<ApiDeleteImpact>(`/api/super-admin/dimensions/${id}/impact`)),

  // Sub-dimensions
  createSubDimension: (dimensionId: string, input: SubDimensionInput) =>
    api.post<{ id: number }>("/api/super-admin/subdimensions", {
      dimension_id: Number(dimensionId),
      name: input.name,
      is_active: toActive(input.status),
    }),
  updateSubDimension: (id: string, input: Partial<SubDimensionInput>) =>
    api.patch(`/api/super-admin/subdimensions/${id}`, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.status !== undefined && { is_active: toActive(input.status) }),
    }),
  deleteSubDimension: (id: string, force = false) =>
    api.del(`/api/super-admin/subdimensions/${id}${force ? "?force=true" : ""}`),
  getSubDimensionDeleteImpact: async (id: string): Promise<DeleteImpact> =>
    mapImpact(await api.get<ApiDeleteImpact>(`/api/super-admin/subdimensions/${id}/impact`)),

  // Questions
  createQuestion: (subDimensionId: string, input: QuestionInput) =>
    api.post<{ id: number }>("/api/super-admin/questions", {
      sub_dimension_id: Number(subDimensionId),
      text: input.label,
      description: input.description ?? "",
      type: input.type ?? "Échelle de maturité",
      weight: input.weight ?? 0,
      sort_order: input.order,
      is_required: input.isRequired ?? true,
      level_responses: input.levelResponses ?? null,
      choice_options: input.choiceOptions ?? null,
      is_active: toActive(input.status),
    }),
  updateQuestion: (id: string, input: Partial<QuestionInput>) =>
    api.patch(`/api/super-admin/questions/${id}`, {
      ...(input.label !== undefined && { text: input.label }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.weight !== undefined && { weight: input.weight }),
      ...(input.order !== undefined && { sort_order: input.order }),
      ...(input.isRequired !== undefined && { is_required: input.isRequired }),
      ...(input.levelResponses !== undefined && { level_responses: input.levelResponses }),
      ...(input.choiceOptions !== undefined && { choice_options: input.choiceOptions }),
      ...(input.status !== undefined && { is_active: toActive(input.status) }),
      ...(input.subDimensionId !== undefined && { sub_dimension_id: Number(input.subDimensionId) }),
    }),
  deleteQuestion: (id: string, force = false) =>
    api.del(`/api/super-admin/questions/${id}${force ? "?force=true" : ""}`),
  getQuestionDeleteImpact: async (id: string): Promise<DeleteImpact> =>
    mapImpact(await api.get<ApiDeleteImpact>(`/api/super-admin/questions/${id}/impact`)),

  // Recommendations
  listRecommendations: async (): Promise<Recommendation[]> =>
    (await api.get<ApiRecommendation[]>("/api/super-admin/recommendations")).map(mapRecommendation),
  // Targets one or several trigger levels at once (1-4 each) -- creates one
  // row per level not already occupied for that question; skippedLevels
  // reports the rest (see RecommendationBatchCreateResult server-side).
  createRecommendations: async (
    questionId: string, triggerLevels: number[], input: RecommendationCreateInput
  ): Promise<{ created: Recommendation[]; skippedLevels: number[] }> => {
    const res = await api.post<ApiRecommendationBatchResult>("/api/super-admin/recommendations", {
      question_id: Number(questionId),
      trigger_levels: triggerLevels,
      title: input.title,
      recommendation_text: input.text,
      category: input.category,
      effort: input.effort,
      regulatory_flag: input.regulatoryFlag,
      is_active: toActive(input.status),
    });
    return { created: res.created.map(mapRecommendation), skippedLevels: res.skipped_levels };
  },
  // Same shape as createRecommendations, but for a question that's still in
  // the framework draft (no real question_id yet) -- see
  // AdminDimensions.tsx's "Configurer les recommandations" flow and
  // WizardDrawer's isNewId(questionId) branch in AdminRecommendations.tsx.
  createDraftRecommendations: async (
    draftQuestionKey: string, triggerLevels: number[], input: RecommendationCreateInput
  ): Promise<{ created: Recommendation[]; skippedLevels: number[] }> => {
    const res = await api.post<ApiRecommendationBatchResult>("/api/super-admin/recommendations", {
      draft_question_key: draftQuestionKey,
      trigger_levels: triggerLevels,
      title: input.title,
      recommendation_text: input.text,
      category: input.category,
      effort: input.effort,
      regulatory_flag: input.regulatoryFlag,
      is_active: toActive(input.status),
    });
    return { created: res.created.map(mapRecommendation), skippedLevels: res.skipped_levels };
  },
  updateRecommendation: (id: string, input: RecommendationInput) =>
    api.patch(`/api/super-admin/recommendations/${id}`, {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.text !== undefined && { recommendation_text: input.text }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.effort !== undefined && { effort: input.effort }),
      ...(input.regulatoryFlag !== undefined && { regulatory_flag: input.regulatoryFlag }),
      ...(input.status !== undefined && { is_active: toActive(input.status) }),
    }),
  deleteRecommendation: (id: string) => api.del(`/api/super-admin/recommendations/${id}`),
};
