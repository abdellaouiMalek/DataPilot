/**
 * Client for the "Veille réglementaire" admin endpoints (`/api/super-admin/regulatory/*`).
 *
 * Importing a circular returns IMMEDIATELY (`analysisStatus: "en_cours"`
 * for a fresh document, or an already-resolved status if this exact file
 * was imported before -- the backend caches by content hash). The actual
 * LLM analysis runs in the background on the server (RAG-retrieval per
 * section against the referential's questions AND recommendations, not
 * the whole catalog); callers must poll `getCircular(id)` until
 * `analysisStatus` is no longer "en_cours" (see `pollCircular` below) --
 * it can take one to a few minutes on local CPU inference, so show a
 * patient loading state, not a short-timeout spinner.
 */

import { api } from "./api";

export type ImpactAction = "accepté" | "modifié" | "rejeté" | null;

export type EntityType = "question" | "recommandation";
export type ProposedAction = "ajouter" | "modifier" | "desactiver" | "activer_flag";

export type AnalysisStatus = "en_attente" | "en_cours" | "terminee" | "erreur";

export interface WeightRecalc {
  dimension: string;
  questions_actives_avant: number;
  questions_actives_apres: number;
  poids_avant: number | null;
  poids_apres: number;
}

export interface AssociatedRecommendation {
  trigger_level: number;
  title: string;
  recommendation_text: string;
  category: string;
  effort: number;
  /** True for the AI-generated stub (palier scaffold) -- the admin drafts
   * the real content during review, this is never published as-is. */
  is_placeholder: boolean;
}

/**
 * Shape of `proposedData` depends on (`entityType`, `proposedAction`) --
 * see `backend/llm/regulatory_analysis.py` for exactly which fields each
 * of the 7 combinations populates. Left as a loose record (not a
 * discriminated union) since it's passed straight through from the
 * backend's JSONB column; components read only the fields relevant to
 * the impact's own (entityType, proposedAction).
 */
export interface ProposedData {
  // question/ajouter
  title?: string;
  level_labels?: string[];
  dimension_hint?: string;
  dimension?: string;
  associated_recommendations?: AssociatedRecommendation[];
  // question/modifier | question/desactiver | recommandation/modifier | recommandation/desactiver | recommandation/activer_flag
  question_code?: string;
  reco_code?: string;
  modification?: string;
  justification?: string;
  reason?: string;
  // question/ajouter | question/desactiver
  weight_recalc?: WeightRecalc;
  // recommandation/ajouter
  recommendation_text?: string;
  category?: string;
  regulatory_flag?: boolean;
  effort?: number;
  trigger_level?: number;

  // ── Contexte du catalogue RÉEL, ajouté côté backend (jamais par le LLM)
  // -- voir app/services/regulatory.py::_enrich_impact. Toujours l'état
  // ACTUEL du référentiel, pour qu'un code seul ("D4Q4-1") ne soit jamais
  // affiché sans ce qu'il désigne réellement. ──
  //
  // recommandation/modifier | recommandation/desactiver | recommandation/activer_flag
  // -- la recommandation EXISTANTE que reco_code référence.
  reco_title?: string;
  reco_text?: string;
  reco_category?: string;
  // recommandation/ajouter (la question EXISTANTE ciblée) |
  // question/modifier | question/desactiver (la question EXISTANTE visée)
  question_title?: string;
  question_dimension?: string;
}

export interface Impact {
  id: number;
  excerpt: string;
  /** The original-language passage (e.g. Arabic) this excerpt was
   * translated from, when the circular wasn't already in French -- null
   * for a circular that was already French (nothing to translate). */
  excerptOriginal: string | null;
  requirementText: string;
  entityType: EntityType;
  proposedAction: ProposedAction;
  proposedData: ProposedData;
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
  detectedLanguage: string | null;
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  isPublished: boolean;
  createdAt: string;
  impactCount: number;
  pendingCount: number;
}

export interface CircularDetail extends Circular {
  /** The analyzed text (French -- translated if the source was Arabic). */
  rawText: string | null;
  /** The source-language text, only set when a translation happened. */
  rawTextOriginal: string | null;
  impacts: Impact[];
}

export interface ReindexResult {
  questions: number;
  recommandations: number;
}

interface ApiImpact {
  id: number;
  excerpt: string;
  excerpt_original: string | null;
  requirement_text: string;
  entity_type: EntityType;
  proposed_action: ProposedAction;
  proposed_data: ProposedData;
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
  detected_language: string | null;
  analysis_status: AnalysisStatus;
  analysis_error: string | null;
  is_published: boolean;
  created_at: string;
  impact_count: number;
  pending_count: number;
}
interface ApiCircularDetail extends ApiCircular {
  raw_text: string | null;
  raw_text_original: string | null;
  impacts: ApiImpact[];
}

function mapImpact(i: ApiImpact): Impact {
  return {
    id: i.id,
    excerpt: i.excerpt,
    excerptOriginal: i.excerpt_original,
    requirementText: i.requirement_text,
    entityType: i.entity_type,
    proposedAction: i.proposed_action,
    proposedData: i.proposed_data,
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
    detectedLanguage: c.detected_language,
    analysisStatus: c.analysis_status,
    analysisError: c.analysis_error,
    isPublished: c.is_published,
    createdAt: c.created_at,
    impactCount: c.impact_count,
    pendingCount: c.pending_count,
  };
}
function mapCircularDetail(c: ApiCircularDetail): CircularDetail {
  return {
    ...mapCircular(c),
    rawText: c.raw_text,
    rawTextOriginal: c.raw_text_original,
    impacts: c.impacts.map(mapImpact),
  };
}

export const regulatoryApi = {
  listCirculars: async (): Promise<Circular[]> =>
    (await api.get<ApiCircular[]>("/api/super-admin/regulatory/circulars")).map(mapCircular),

  getCircular: async (id: number): Promise<CircularDetail> =>
    mapCircularDetail(await api.get<ApiCircularDetail>(`/api/super-admin/regulatory/circulars/${id}`)),

  /** Reference, theme, and publication date are never asked of the admin
   * -- reference/theme are extracted automatically from the circular's
   * own content once analysis runs, and the publication date is simply
   * the import date (see backend/app/routers/regulatory.py). */
  importFile: async (file: File): Promise<CircularDetail> => {
    const form = new FormData();
    form.append("file", file);
    return mapCircularDetail(
      await api.postForm<ApiCircularDetail>("/api/super-admin/regulatory/circulars/import", form)
    );
  },

  importUrl: async (url: string): Promise<CircularDetail> => {
    const form = new FormData();
    form.append("url", url);
    return mapCircularDetail(
      await api.postForm<ApiCircularDetail>("/api/super-admin/regulatory/circulars/import", form)
    );
  },

  /**
   * Polls `getCircular(id)` until `analysisStatus` leaves "en_cours" (or
   * `maxAttempts` is hit). Resolves with whatever the last poll returned --
   * callers check `analysisStatus` themselves to distinguish "terminee"
   * from "erreur" from a timed-out "en_cours".
   */
  pollCircular: async (
    id: number,
    { intervalMs = 4000, maxAttempts = 120 }: { intervalMs?: number; maxAttempts?: number } = {}
  ): Promise<CircularDetail> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const circular = await regulatoryApi.getCircular(id);
      if (circular.analysisStatus !== "en_cours") return circular;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return regulatoryApi.getCircular(id);
  },

  updateImpact: async (
    id: number,
    input: { action: ImpactAction; editedText?: string }
  ): Promise<Impact> =>
    mapImpact(
      await api.patch<ApiImpact>(`/api/super-admin/regulatory/impacts/${id}`, {
        action: input.action,
        edited_text: input.editedText ?? null,
      })
    ),

  publishCircular: async (id: number): Promise<Circular> =>
    mapCircular(await api.post<ApiCircular>(`/api/super-admin/regulatory/circulars/${id}/publish`)),

  /** Rejected by the backend (400) if the circular is already published --
   * publication is meant to leave a permanent regulatory audit trail. */
  deleteCircular: async (id: number): Promise<void> => {
    await api.del(`/api/super-admin/regulatory/circulars/${id}`);
  },

  /** Re-embeds the whole active catalog (questions + recommandations) into
   * the RAG index -- run after adding/editing questions or recommandations
   * elsewhere in the admin so "Veille réglementaire" retrieval reflects
   * them. Not triggered automatically on every catalog edit. */
  reindexCatalog: async (): Promise<ReindexResult> =>
    api.post<ReindexResult>("/api/super-admin/regulatory/reindex"),
};
