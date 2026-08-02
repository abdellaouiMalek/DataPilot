/**
 * Client for the "Veille réglementaire" admin endpoints (`/api/admin/regulatory/*`).
 * Importing a circular runs a local-LLM extraction server-side and can take
 * a while (well over a minute on CPU inference) — callers should show a
 * patient loading state, not a short-timeout spinner.
 */

import { api } from "./api";

export type ImpactAction = "accepté" | "modifié" | "rejeté" | null;
export type ImpactType = "réglementaire" | "nouvelle question" | "recommandation";

export interface Impact {
  id: number;
  requirementText: string;
  targetType: string;
  targetDescription: string;
  action: ImpactAction;
  editedText: string | null;
}

export interface Circular {
  id: number;
  reference: string;
  publicationDate: string | null;
  theme: string;
  status: string;
  version: string;
  sourceFilename: string | null;
  sourceUrl: string | null;
  isPublished: boolean;
  createdAt: string;
  impactCount: number;
  pendingCount: number;
}

export interface CircularDetail extends Circular {
  rawText: string | null;
  impacts: Impact[];
}

interface ApiImpact {
  id: number;
  requirement_text: string;
  target_type: string;
  target_description: string;
  action: ImpactAction;
  edited_text: string | null;
}
interface ApiCircular {
  id: number;
  reference: string;
  publication_date: string | null;
  theme: string;
  status: string;
  version: string;
  source_filename: string | null;
  source_url: string | null;
  is_published: boolean;
  created_at: string;
  impact_count: number;
  pending_count: number;
}
interface ApiCircularDetail extends ApiCircular {
  raw_text: string | null;
  impacts: ApiImpact[];
}

function mapImpact(i: ApiImpact): Impact {
  return {
    id: i.id,
    requirementText: i.requirement_text,
    targetType: i.target_type,
    targetDescription: i.target_description,
    action: i.action,
    editedText: i.edited_text,
  };
}
function mapCircular(c: ApiCircular): Circular {
  return {
    id: c.id,
    reference: c.reference,
    publicationDate: c.publication_date,
    theme: c.theme,
    status: c.status,
    version: c.version,
    sourceFilename: c.source_filename,
    sourceUrl: c.source_url,
    isPublished: c.is_published,
    createdAt: c.created_at,
    impactCount: c.impact_count,
    pendingCount: c.pending_count,
  };
}
function mapCircularDetail(c: ApiCircularDetail): CircularDetail {
  return { ...mapCircular(c), rawText: c.raw_text, impacts: c.impacts.map(mapImpact) };
}

export const regulatoryApi = {
  listCirculars: async (): Promise<Circular[]> =>
    (await api.get<ApiCircular[]>("/api/admin/regulatory/circulars")).map(mapCircular),

  getCircular: async (id: number): Promise<CircularDetail> =>
    mapCircularDetail(await api.get<ApiCircularDetail>(`/api/admin/regulatory/circulars/${id}`)),

  importFile: async (file: File): Promise<CircularDetail> => {
    const form = new FormData();
    form.append("file", file);
    return mapCircularDetail(
      await api.postForm<ApiCircularDetail>("/api/admin/regulatory/circulars/import", form)
    );
  },

  importUrl: async (url: string): Promise<CircularDetail> => {
    const form = new FormData();
    form.append("url", url);
    return mapCircularDetail(
      await api.postForm<ApiCircularDetail>("/api/admin/regulatory/circulars/import", form)
    );
  },

  updateImpact: async (
    id: number,
    input: { action: ImpactAction; editedText?: string }
  ): Promise<Impact> =>
    mapImpact(
      await api.patch<ApiImpact>(`/api/admin/regulatory/impacts/${id}`, {
        action: input.action,
        edited_text: input.editedText ?? null,
      })
    ),

  publishCircular: async (id: number): Promise<Circular> =>
    mapCircular(await api.post<ApiCircular>(`/api/admin/regulatory/circulars/${id}/publish`)),
};
