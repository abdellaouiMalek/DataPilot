/**
 * Client for staged framework editing (`/api/super-admin/framework/*`).
 *
 * The framework page never writes through: it edits a tree locally, autosaves
 * it here as a draft, and only `publish()` touches the live questionnaire, 
 * atomically, producing an immutable version snapshot with a changelog.
 *
 * The wire format is the same shape the admin API already speaks (snake_case,
 * `text` for a question label), so `mapDimension` from ./admin converts it to
 * the UI vocabulary and `toApiTree` converts it back.
 */

import { api } from "./api";
import { mapDimension, type ApiDimension, type Dimension } from "./admin";

export interface ChangelogEntry {
  kind: string;
  label: string;
  details: string[];
}

export interface VersionSummary {
  id: number;
  number: number;
  /** The version currently applied to the live tables, not always the newest,
   *  since restoring an older one moves the flag back to it. */
  is_active: boolean;
  /** Retired from the log's default view. Never true for the live version. */
  archived: boolean;
  label: string;
  note: string;
  changelog: ChangelogEntry[];
  dimension_count: number;
  question_count: number;
  /** Assessments answered on this version, what makes restoring or deleting
   *  it a decision rather than a guess. */
  assessment_count: number;
  created_by_name: string | null;
  created_at: string | null;
}

export interface VersionDetail extends VersionSummary {
  snapshot: { dimensions: ApiDimension[]; dimension_count: number; question_count: number };
}

export interface DraftInfo {
  tree: ApiDimension[];
  base_version_id: number | null;
  updated_by_sub: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

export interface FrameworkState {
  tree: ApiDimension[];
  draft: DraftInfo | null;
  active_version: VersionSummary | null;
}

/** Ids the editor invents for rows that don't exist server-side yet. */
export const isNewId = (id: string) => id.startsWith("new-");

/** UI tree → wire tree. Temporary ids are passed through untouched: the
 *  backend treats any non-numeric id as "create this one". */
export function toApiTree(dimensions: Dimension[]): unknown[] {
  return dimensions.map((dimension, dimensionOrder) => ({
    id: isNewId(dimension.id) ? dimension.id : Number(dimension.id),
    name: dimension.name,
    description: dimension.description,
    weight: dimension.weight,
    color: dimension.color,
    sort_order: dimensionOrder,
    is_active: dimension.status === "Active",
    sub_dimensions: dimension.subDimensions.map((sub, subOrder) => ({
      id: isNewId(sub.id) ? sub.id : Number(sub.id),
      name: sub.name,
      sort_order: subOrder,
      is_active: sub.status === "Active",
      questions: sub.questions.map((question, questionOrder) => ({
        id: isNewId(question.id) ? question.id : Number(question.id),
        text: question.label,
        description: question.description,
        type: question.type,
        weight: question.weight,
        sort_order: questionOrder,
        is_required: question.isRequired,
        is_active: question.status === "Active",
        level_responses: question.levelResponses,
        choice_options: question.choiceOptions,
      })),
    })),
  }));
}

export const fromApiTree = (tree: ApiDimension[]): Dimension[] => tree.map(mapDimension);

export const getFrameworkState = () =>
  api.get<FrameworkState>("/api/super-admin/framework/state");

export const saveDraft = (dimensions: Dimension[], baseVersionId: number | null) =>
  api.put<DraftInfo>("/api/super-admin/framework/draft", {
    tree: toApiTree(dimensions),
    base_version_id: baseVersionId,
  });

export const discardDraft = () => api.del("/api/super-admin/framework/draft");

export const publishFramework = (
  dimensions: Dimension[],
  { label, note, baseVersionId }: { label: string; note: string; baseVersionId: number | null },
) =>
  api.post<VersionDetail>("/api/super-admin/framework/publish", {
    tree: toApiTree(dimensions),
    label,
    note,
    base_version_id: baseVersionId,
  });

export const listVersions = () =>
  api.get<VersionSummary[]>("/api/super-admin/framework/versions");

export const getVersion = (id: number) =>
  api.get<VersionDetail>(`/api/super-admin/framework/versions/${id}`);

/** Replays a version's snapshot onto the live tables and makes it the active
 *  one. The version row itself is left exactly as it was published. */
export const restoreVersion = (id: number) =>
  api.post<VersionDetail>(`/api/super-admin/framework/versions/${id}/restore`, {});

/** Corrects a published version's label/note. The snapshot and the computed
 *  changelog stay immutable, they are the record of what was published. */
export const updateVersionMeta = (id: number, meta: { label: string; note: string }) =>
  api.patch<VersionDetail>(`/api/super-admin/framework/versions/${id}`, meta);

/** Retires a version from the default view, or brings it back. Destroys
 *  nothing: the snapshot stays readable and restoring un-archives it. */
export const setVersionArchived = (id: number, archived: boolean) =>
  api.put<VersionDetail>(`/api/super-admin/framework/versions/${id}/archived`, { archived });

/** Permanent. The server refuses when the version is live, carries
 *  assessments, or is what the pending draft was started from. */
export const deleteVersion = (id: number) =>
  api.del<void>(`/api/super-admin/framework/versions/${id}`);
