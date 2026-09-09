/**
 * "Catalogue des recommandations" -- adapté du design donné
 * (RecommendationCatalog.tsx, racine du repo) et branché sur le vrai
 * catalogue (`/api/super-admin/recommendations`, voir
 * backend/app/models/recommendation.py).
 *
 * Écarts volontaires par rapport au design d'origine, tous dus au fait que
 * la table réelle est beaucoup plus étroite que la maquette (choix
 * explicite de l'utilisateur : "trim to real schema" plutôt que d'étendre
 * le schéma) :
 *  - Une recommandation réelle = UNE étape (trigger_level -> +1), pas une
 *    liste de niveaux : l'assistant de création permet toujours de cocher
 *    plusieurs niveaux (pratique -- même titre/texte/effort pour chaque
 *    palier), mais ça crée une ligne PAR niveau ; ensuite chaque ligne
 *    s'édite/se supprime indépendamment, sans "groupe" fictif.
 *  - Champs retirés (aucun équivalent en base) : criticité, complexité,
 *    risque, priorité, statut "Brouillon" (binaire Actif/Désactivé
 *    uniquement), référentiel/circulaire/article/commentaire réglementaire,
 *    toute l'étape "Mise en œuvre" (actions/responsable/durée/horizon/
 *    livrables/indicateurs/prérequis).
 *  - Champ ajouté (existe en base mais absent de la maquette) : catégorie.
 *  - "Dupliquer" retiré : dupliquer sur la même question+niveau violerait
 *    la contrainte d'unicité (question_id, trigger_level) -- il n'y a pas
 *    de cible sensée à un clic pour ça.
 *  - Dimension/Sous-dimension/Question/Niveau sont IMMUABLES une fois la
 *    recommandation créée (le backend ne les accepte pas en PATCH) :
 *    affichés en lecture seule à l'édition, comme le champ "Code" l'était
 *    déjà dans la maquette d'origine.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, Plus, X, ChevronDown, MoreHorizontal,
  Edit2, Trash2, Eye, Power,
  RotateCcw, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle, Shield, TrendingUp, BookOpen, Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  adminApi,
  type Dimension, type Recommendation, type Status,
} from "../../lib/admin";
import { getFrameworkState, fromApiTree, isNewId } from "../../lib/adminFramework";
import { isSuperAdmin } from "../../lib/keycloak";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue";
}

// ── Real-catalog join (dimension/sous-dimension/question names, absent
// from the raw Recommendation row -- resolved against the loaded
// dimension tree, same pattern as AdminDimensions.tsx's FlatQuestion) ──────

interface FlatRecommendation extends Recommendation {
  dimensionName: string;
  dimensionColor: string;
  subDimensionName: string;
  questionText: string;
  isDraft: boolean;
}

// `dimensions` here is the MERGED tree (live + draft, see mergedDimensions
// in RecommendationCatalog below) -- a draft recommendation's questionId is
// null, so it's resolved by draftQuestionKey against the same merged tree
// instead (a draft question's id in that tree IS its draftQuestionKey).
function flattenRecommendations(recs: Recommendation[], dimensions: Dimension[]): FlatRecommendation[] {
  const byQuestion = new Map<string, { dim: Dimension; subName: string; text: string }>();
  for (const d of dimensions) {
    for (const s of d.subDimensions) {
      for (const q of s.questions) {
        byQuestion.set(q.id, { dim: d, subName: s.name, text: q.label });
      }
    }
  }
  return recs.map(r => {
    const key = r.questionId ?? r.draftQuestionKey ?? "";
    const ctx = byQuestion.get(key);
    return {
      ...r,
      dimensionName: ctx?.dim.name ?? "-",
      dimensionColor: ctx?.dim.color ?? "#9B9B9B",
      subDimensionName: ctx?.subName ?? "-",
      questionText: ctx?.text ?? "-",
      isDraft: r.questionId === null,
    };
  });
}

// Live tree + draft-only nodes, so the catalog's selectors can offer a
// question that hasn't been published yet. A draft dimension/sub-dimension
// only appears if it's genuinely new (isNewId) -- an existing dimension
// being edited in the draft keeps its real id and is already in `live`.
function mergeDraftIntoLive(live: Dimension[], draft: Dimension[]): Dimension[] {
  const liveIds = new Set(live.map(d => d.id));
  const draftOnlyDimensions = draft.filter(d => isNewId(d.id) && !liveIds.has(d.id));

  const merged = live.map(liveDim => {
    const draftDim = draft.find(d => d.id === liveDim.id);
    if (!draftDim) return liveDim;
    const liveSubIds = new Set(liveDim.subDimensions.map(s => s.id));
    const draftOnlySubs = draftDim.subDimensions.filter(s => isNewId(s.id) && !liveSubIds.has(s.id));
    const subDimensions = liveDim.subDimensions.map(liveSub => {
      const draftSub = draftDim.subDimensions.find(s => s.id === liveSub.id);
      if (!draftSub) return liveSub;
      const liveQIds = new Set(liveSub.questions.map(q => q.id));
      const draftOnlyQuestions = draftSub.questions.filter(q => isNewId(q.id) && !liveQIds.has(q.id));
      return draftOnlyQuestions.length
        ? { ...liveSub, questions: [...liveSub.questions, ...draftOnlyQuestions] }
        : liveSub;
    });
    return draftOnlySubs.length ? { ...liveDim, subDimensions: [...subDimensions, ...draftOnlySubs] } : { ...liveDim, subDimensions };
  });

  return [...merged, ...draftOnlyDimensions];
}

type TypeReco = "Réglementaire" | "Amélioration";
const typeOf = (r: { regulatoryFlag: boolean }): TypeReco => r.regulatoryFlag ? "Réglementaire" : "Amélioration";
const statutLabel = (s: Status): "Actif" | "Désactivé" => s === "Active" ? "Actif" : "Désactivé";

// ── Badge components ──────────────────────────────────────────────────────────

function StatutBadge({ value }: { value: Status }) {
  const active = value === "Active";
  const color = active ? "#2E7D32" : "#9B9B9B";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
      {statutLabel(value)}
    </span>
  );
}

function DraftBadge() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 700, color: "#8A6A1A", backgroundColor: "#FFF4DC", borderRadius: 4, padding: "1px 6px" }}>
      Brouillon
    </span>
  );
}

function TypeBadge({ value }: { value: TypeReco }) {
  const reg = value === "Réglementaire";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: reg ? 600 : 400, color: reg ? "#1E3A8A" : "#4A4A4A" }}>
      {reg ? <Shield size={10} style={{ flexShrink: 0 }} /> : <TrendingUp size={10} style={{ flexShrink: 0, color: "#9B9B9B" }} />}
      {value}
    </span>
  );
}

function CategoryBadge({ value }: { value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 600, color: "#6B21A8", backgroundColor: "#FAF5FF", borderRadius: 4, padding: "2px 8px" }}>
      {value}
    </span>
  );
}

// ── Reusable field helpers ────────────────────────────────────────────────────

const INP: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 6,
  border: "1px solid rgba(0,0,0,0.13)", fontSize: 13,
  outline: "none", boxSizing: "border-box", color: "#1A1A1A", backgroundColor: "#fff",
};
const TA: React.CSSProperties = { ...INP, resize: "vertical", minHeight: 80, fontFamily: "inherit" };
const LBL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 };
const ROW: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };

function FSelect({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean }) {
  return (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} style={{ ...INP, padding: "8px 30px 8px 12px", appearance: "none", cursor: disabled ? "not-allowed" : "pointer", color: value ? "#1A1A1A" : "#9B9B9B", backgroundColor: disabled ? "#F7F7F7" : "#fff" }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9B9B", pointerEvents: "none" }} />
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, topColor }: { label: string; value: number; sub: string; icon: LucideIcon; topColor: string }) {
  return (
    <div
      style={{ minWidth: 0, backgroundColor: "#fff", borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "13px 15px 11px", borderTop: `3px solid ${topColor}`, position: "relative", overflow: "hidden", transition: "box-shadow 0.15s, transform 0.12s", cursor: "default", outline: "none" }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 6px 18px rgba(0,0,0,0.10)"; el.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 1px 6px rgba(0,0,0,0.05)"; el.style.transform = "translateY(0)"; }}
    >
      <div style={{ position: "absolute", top: 10, right: 10, opacity: 0.05 }}><Icon size={38} style={{ color: "#1A1A1A" }} /></div>
      <div style={{ fontSize: 10, color: "#9B9B9B", fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: "#9B9B9B" }}>{sub}</div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ["Informations générales", "Rattachement", "Vérification"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, marginBottom: 28 }}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: done ? "#FFE600" : active ? "#1A1A1A" : "#EBEBEB", color: done ? "#1A1A1A" : active ? "#FFE600" : "#9B9B9B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                {done ? <CheckCircle size={14} /> : n}
              </div>
              <div style={{ fontSize: 9, fontWeight: active ? 700 : 400, color: active ? "#1A1A1A" : done ? "#2E7D32" : "#9B9B9B", letterSpacing: "0.03em", textAlign: "center", maxWidth: 64 }}>{label}</div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: "13px 4px 0", backgroundColor: done ? "#FFE600" : "#E5E5E5" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Wizard state ──────────────────────────────────────────────────────────────

interface WizardData {
  titre: string;
  description: string;
  statut: Status;
  dimensionId: string;
  subDimensionId: string;
  questionId: string;
  niveaux: number[];
  /** Null jusqu'à un choix explicite -- plus de valeur par défaut silencieuse,
   *  voir step1Disabled dans WizardDrawer. */
  type: TypeReco | null;
  /** Non saisie par l'admin : dérivée de la dimension choisie (voir
   *  categoryFromDimension) pour la création ; conservée telle quelle en
   *  édition, où il n'y a plus de champ pour la modifier. */
  category: string;
  /** Idem : fixé à 2/3 pour la création, conservé tel quel en édition. */
  effort: number;
}

function makeInitialWizard(): WizardData {
  return {
    titre: "", description: "", statut: "Active",
    dimensionId: "", subDimensionId: "", questionId: "",
    niveaux: [],
    type: null, category: "", effort: 2,
  };
}

// Catégorie = dérivée automatiquement de la dimension plutôt que saisie à la
// main (un champ de moins à remplir à chaque palier) -- même style que les
// catégories déjà en base ("gouvernance", "qualite", "securite"...).
function categoryFromDimension(name: string): string {
  return (
    name
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    || "general"
  );
}

// ── Wizard drawer ─────────────────────────────────────────────────────────────

// Paliers déjà pris pour une question donnée, d'après le catalogue réel --
// utilisé pour choisir automatiquement le prochain palier libre au lieu de
// demander à l'admin de le cocher lui-même.
function occupiedLevelsFor(recs: FlatRecommendation[], questionId: string): number[] {
  return recs
    .filter(r => r.questionId === questionId || r.draftQuestionKey === questionId)
    .map(r => r.triggerLevel);
}

function WizardDrawer({ dimensions, categories, existingRecs, editing, presetQuestionId, onClose, onSaved }: {
  dimensions: Dimension[];
  categories: string[];
  /** Catalogue actuel, pour connaître les paliers déjà pris par une question
   *  et proposer directement le prochain palier libre. */
  existingRecs: FlatRecommendation[];
  /** Présent = édition (rattachement figé, une seule ligne réelle) ; absent = création (rattachement libre, plusieurs niveaux possibles). */
  editing?: FlatRecommendation;
  /** Pré-sélectionne dimension/sous-dimension/question au montage (déclenché
   *  par "Configurer les recommandations" depuis une question tout juste
   *  créée en brouillon) -- ignoré en édition. */
  presetQuestionId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(editing);
  const [d, setD] = useState<WizardData>(() => {
    if (editing) {
      return {
        titre: editing.title, description: editing.text, statut: editing.status,
        dimensionId: "", subDimensionId: "", questionId: editing.questionId ?? editing.draftQuestionKey ?? "",
        niveaux: [editing.triggerLevel],
        type: typeOf(editing), category: editing.category, effort: editing.effort,
      };
    }
    if (presetQuestionId) {
      for (const dim of dimensions) {
        for (const sub of dim.subDimensions) {
          if (sub.questions.some(q => q.id === presetQuestionId)) {
            // Palier attribué directement (le prochain libre, généralement
            // 1 pour une question qui vient d'être créée) -- l'admin arrive
            // prêt à rédiger, sans avoir à le choisir lui-même.
            const nextOpen = [1, 2, 3, 4].find(n => !occupiedLevelsFor(existingRecs, presetQuestionId).includes(n));
            return { ...makeInitialWizard(), dimensionId: dim.id, subDimensionId: sub.id, questionId: presetQuestionId, niveaux: nextOpen !== undefined ? [nextOpen] : [] };
          }
        }
      }
    }
    return makeInitialWizard();
  });
  const set = (patch: Partial<WizardData>) => setD(prev => ({ ...prev, ...patch }));

  // Paliers déjà couverts pour la question courante : ceux qui existaient
  // déjà (existingRecs) union ceux créés dans cette session du tiroir.
  // Attribue automatiquement le prochain palier libre dès que la question
  // change -- il n'y a plus de case à cocher, voir l'étape 2 plus bas.
  const [occupiedLevels, setOccupiedLevels] = useState<number[]>(() =>
    presetQuestionId ? occupiedLevelsFor(existingRecs, presetQuestionId) : []
  );
  useEffect(() => {
    if (isEdit || !d.questionId) return;
    const occupied = occupiedLevelsFor(existingRecs, d.questionId);
    setOccupiedLevels(occupied);
    const nextOpen = [1, 2, 3, 4].find(n => !occupied.includes(n));
    set({ niveaux: nextOpen !== undefined ? [nextOpen] : [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.questionId, isEdit]);

  const selectedDim = dimensions.find(dim => dim.id === d.dimensionId);
  const availableSubs = selectedDim?.subDimensions ?? [];
  const selectedSub = availableSubs.find(s => s.id === d.subDimensionId);
  const availableQuestions = selectedSub?.questions ?? [];

  // Catégorie dérivée de la dimension, tenue à jour automatiquement -- pas
  // de champ à saisir (voir categoryFromDimension). Ne s'applique qu'à la
  // création : en édition, dimensionId reste "" (rattachement figé), donc
  // cet effet ne se déclenche jamais et la catégorie d'origine est conservée.
  useEffect(() => {
    if (!isEdit && selectedDim) set({ category: categoryFromDimension(selectedDim.name) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDim?.id, isEdit]);

  function changeDimension(id: string) { set({ dimensionId: id, subDimensionId: "", questionId: "" }); }
  function changeSub(id: string) { set({ subDimensionId: id, questionId: "" }); }

  const step1Disabled = !d.titre.trim() || !d.description.trim() || d.type === null;
  const canSave = d.titre.trim() && d.description.trim() && d.category.trim() && d.type !== null && (isEdit || (d.questionId && d.niveaux.length > 0));

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit && editing) {
        await adminApi.updateRecommendation(editing.id, {
          title: d.titre, text: d.description, category: d.category,
          effort: d.effort, regulatoryFlag: d.type === "Réglementaire", status: d.statut,
        });
        toast.success("Recommandation mise à jour");
        await onSaved();
        onClose();
      } else {
        const input = {
          title: d.titre, text: d.description, category: d.category,
          effort: d.effort, regulatoryFlag: d.type === "Réglementaire", status: d.statut,
        };
        const res = isNewId(d.questionId)
          ? await adminApi.createDraftRecommendations(d.questionId, d.niveaux, input)
          : await adminApi.createRecommendations(d.questionId, d.niveaux, input);
        await onSaved();

        if (res.created.length > 0) {
          toast.success(`Niveau${res.created.length > 1 ? "x" : ""} ${res.created.map(r => r.triggerLevel).join(", ")} créé${res.created.length > 1 ? "s" : ""}`);
        }
        if (res.skippedLevels.length > 0) {
          toast.warning(`Niveau${res.skippedLevels.length !== 1 ? "x" : ""} déjà existant${res.skippedLevels.length !== 1 ? "s" : ""} pour cette question, ignoré${res.skippedLevels.length !== 1 ? "s" : ""} : ${res.skippedLevels.join(", ")}`);
        }

        // Une question a 4 paliers (1→2 … 4→5), chacun avec son propre texte
        // -- enchaîne directement sur le prochain palier libre plutôt que de
        // fermer le tiroir et forcer à tout reprendre depuis "Ajouter une
        // recommandation". S'arrête dès que les 4 sont couverts, ou si rien
        // n'a été créé (niveaux choisis déjà tous occupés -- rien à enchaîner).
        const justCovered = [...res.created.map(r => r.triggerLevel), ...res.skippedLevels];
        const covered = [...occupiedLevels, ...justCovered];
        const nextOpen = [1, 2, 3, 4].find(n => !covered.includes(n));

        if (res.created.length === 0 || nextOpen === undefined) {
          onClose();
        } else {
          setOccupiedLevels(covered);
          set({ titre: "", description: "", niveaux: [nextOpen] });
          setStep(1);
        }
      }
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  const renderStep = () => {
    switch (step) {
      // ── Step 1 : informations générales ──
      case 1: return (
        <div style={ROW}>
          <div>
            <label style={LBL}>Titre *</label>
            <input value={d.titre} onChange={e => set({ titre: e.target.value })} placeholder="ex. Mettre en place un Data Office" style={INP} />
          </div>
          <div>
            <label style={LBL}>Description détaillée *</label>
            <textarea value={d.description} onChange={e => set({ description: e.target.value })} placeholder="Décrivez précisément la recommandation..." style={{ ...TA, minHeight: 100 }} />
          </div>
          <div>
            <label style={LBL}>Type *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["Réglementaire", "Amélioration"] as TypeReco[]).map(t => (
                <button key={t} type="button" onClick={() => set({ type: t })} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: d.type === t ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.13)", backgroundColor: d.type === t ? "#1A1A1A" : "#fff", color: d.type === t ? "#FFE600" : "#6B6B6B", transition: "all 0.15s" }}>
                  {t === "Réglementaire" ? <Shield size={13} /> : <TrendingUp size={13} />} {t}
                </button>
              ))}
            </div>
            {d.type === null && (
              <p style={{ fontSize: 11, color: "#B45309", marginTop: 6, margin: "6px 0 0" }}>Choisissez un type pour continuer.</p>
            )}
          </div>
          <div>
            <label style={LBL}>Statut</label>
            <div style={{ display: "flex", gap: 8 }}>
              {([["Active", "Actif"], ["Inactive", "Désactivé"]] as const).map(([s, l]) => (
                <button key={s} type="button" onClick={() => set({ statut: s })} style={{ padding: "7px 18px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: d.statut === s ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.13)", backgroundColor: d.statut === s ? "#1A1A1A" : "#fff", color: d.statut === s ? "#FFE600" : "#6B6B6B", transition: "all 0.15s" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      );

      // ── Step 2 : rattachement (figé à l'édition -- immuable côté API) ──
      case 2: return (
        <div style={ROW}>
          {isEdit ? (
            <div style={{ backgroundColor: "#F7F7F7", borderRadius: 8, padding: 16, border: "1px solid rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, color: "#9B9B9B", lineHeight: 1.6 }}>
                La question et le niveau déclencheur ne sont plus modifiables une fois la recommandation créée.
              </div>
              {[
                ["Dimension", editing?.dimensionName],
                ["Sous-dimension", editing?.subDimensionName],
                ["Question", editing?.questionText],
                ["Niveau déclencheur", editing ? `Niveau ${editing.triggerLevel} → Niveau ${editing.targetLevel}` : "-"],
                ["Code", editing?.code],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#9B9B9B", width: 140, flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 12, color: "#1A1A1A", fontFamily: k === "Code" ? "monospace" : "inherit" }}>{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div>
                <label style={LBL}>Dimension *</label>
                <FSelect
                  value={selectedDim ? (isNewId(selectedDim.id) ? `${selectedDim.name} [Brouillon]` : selectedDim.name) : ""}
                  onChange={label => {
                    const dimLabel = (dim: typeof dimensions[number]) => isNewId(dim.id) ? `${dim.name} [Brouillon]` : dim.name;
                    changeDimension(dimensions.find(dim => dimLabel(dim) === label)?.id ?? "");
                  }}
                  options={dimensions.map(dim => isNewId(dim.id) ? `${dim.name} [Brouillon]` : dim.name)}
                  placeholder="Sélectionner une dimension..." />
              </div>
              {selectedDim && (
                <div>
                  <label style={LBL}>Sous-dimension *</label>
                  <FSelect
                    value={(() => {
                      const s = availableSubs.find(s => s.id === d.subDimensionId);
                      return s ? (isNewId(s.id) ? `${s.name} [Brouillon]` : s.name) : "";
                    })()}
                    onChange={label => {
                      const subLabel = (s: typeof availableSubs[number]) => isNewId(s.id) ? `${s.name} [Brouillon]` : s.name;
                      changeSub(availableSubs.find(s => subLabel(s) === label)?.id ?? "");
                    }}
                    options={availableSubs.map(s => isNewId(s.id) ? `${s.name} [Brouillon]` : s.name)}
                    placeholder="Sélectionner une sous-dimension..." />
                </div>
              )}
              {selectedSub && (
                <div>
                  <label style={LBL}>Question *</label>
                  <FSelect
                    value={(() => {
                      const q = availableQuestions.find(q => q.id === d.questionId);
                      return q ? (isNewId(q.id) ? `${q.label} [Brouillon]` : q.label) : "";
                    })()}
                    onChange={label => {
                      const qLabel = (q: typeof availableQuestions[number]) => isNewId(q.id) ? `${q.label} [Brouillon]` : q.label;
                      set({ questionId: availableQuestions.find(q => qLabel(q) === label)?.id ?? "" });
                    }}
                    options={availableQuestions.map(q => isNewId(q.id) ? `${q.label} [Brouillon]` : q.label)}
                    placeholder="Sélectionner une question..."
                  />
                </div>
              )}
              {selectedSub && d.questionId && (
                <div>
                  <label style={{ ...LBL, marginBottom: 10 }}>Palier déclencheur</label>
                  {d.niveaux.length > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, backgroundColor: "#F7F7F7", borderRadius: 8, padding: "14px 16px", border: "1px solid rgba(0,0,0,0.06)" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#1A1A1A", color: "#FFE600", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, flexShrink: 0 }}>{d.niveaux[0]}</div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1A1A1A" }}>Niveau {d.niveaux[0]} → {d.niveaux[0] + 1}</div>
                        <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 1 }}>
                          Attribué automatiquement, c'est le prochain palier libre pour cette question.
                          {occupiedLevels.length > 0 && ` Déjà configurés : ${occupiedLevels.filter(n => n !== d.niveaux[0]).sort((a, b) => a - b).join(", ") || "-"}.`}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: "#FFF4DC", borderRadius: 8, padding: "12px 16px", border: "1px solid #F3D9A8", fontSize: 12, color: "#8A6A1A", lineHeight: 1.6 }}>
                      Cette question a déjà ses 4 recommandations (niveaux {occupiedLevels.sort((a, b) => a - b).join(", ")}). Choisissez une autre question.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      );

      // ── Step 3, Vérification ──
      case 3: {
        const dimName = isEdit ? editing?.dimensionName : selectedDim?.name;
        const subName = isEdit ? editing?.subDimensionName : selectedSub?.name;
        const qText = isEdit ? editing?.questionText : availableQuestions.find(q => q.id === d.questionId)?.label;
        const niveaux = isEdit ? [editing!.triggerLevel] : d.niveaux;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ backgroundColor: "#F7F7F7", borderRadius: 10, padding: 16, border: "1px solid rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Aperçu</div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{d.titre || "-"}</div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <StatutBadge value={d.statut} />
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#4A4A4A", lineHeight: 1.6, margin: 0 }}>{d.description || "Aucune description renseignée."}</p>
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <TypeBadge value={d.type ?? "Amélioration"} />
                {niveaux.map(n => <span key={n} style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: "#1A1A1A", color: "#FFE600", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>)}
              </div>
            </div>

            {[
              {
                title: "Rattachement au référentiel",
                rows: [
                  ["Dimension", dimName || "-"], ["Sous-dimension", subName || "-"], ["Question", qText || "-"],
                  ["Niveaux déclencheurs", niveaux.length ? niveaux.join(", ") : "-"],
                  ["Catégorie (auto)", d.category || "-"],
                ],
              },
            ].map(({ title, rows }) => (
              <div key={title} style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid rgba(0,0,0,0.07)", overflow: "hidden" }}>
                <div style={{ padding: "9px 14px", backgroundColor: "#FAFAFA", borderBottom: "1px solid rgba(0,0,0,0.06)", fontSize: 10, fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
                {rows.map(([k, v]) => (
                  <div key={k} style={{ display: "flex", padding: "7px 14px", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <div style={{ width: 160, flexShrink: 0, fontSize: 12, color: "#9B9B9B" }}>{k}</div>
                    <div style={{ fontSize: 12, color: "#1A1A1A", fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      }
    }
  };

  const BtnPrimary = ({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>{children}</button>
  );
  const BtnSecondary = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.13)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>{children}</button>
  );

  const step2Disabled = !isEdit && (!d.questionId || d.niveaux.length === 0);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 500 }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 501, width: 740, maxWidth: "92vw", backgroundColor: "#fff", display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1A1A1A" }}>{isEdit ? "Modifier la recommandation" : "Nouvelle recommandation"}</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>
              Étape {step} sur {STEPS.length} - {STEPS[step - 1]}
              {!isEdit && occupiedLevels.length > 0 && ` · ${occupiedLevels.length}/4 niveaux configurés`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px 0", flexShrink: 0 }}><StepIndicator current={step} /></div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
          {!isEdit && d.niveaux.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, backgroundColor: "#EEF2FF", border: "1px solid #C7D2FE", marginBottom: 18 }}>
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                {d.niveaux.map(n => (
                  <div key={n} style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: "#1A1A1A", color: "#FFE600", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{n}</div>
                ))}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#3730A3" }}>
                {d.niveaux.length === 1
                  ? `Recommandation pour le niveau ${d.niveaux[0]} → ${d.niveaux[0] + 1}`
                  : `Recommandation pour les niveaux ${d.niveaux.join(", ")}`}
              </div>
            </div>
          )}
          {renderStep()}
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, backgroundColor: "#FAFAFA" }}>
          <button onClick={onClose} disabled={saving} style={{ padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.13)", backgroundColor: "#fff", cursor: saving ? "not-allowed" : "pointer", color: "#6B6B6B" }}>Annuler</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 1 && <BtnSecondary onClick={() => setStep(s => s - 1)}><ChevronLeft size={14} /> Retour</BtnSecondary>}
            {step < STEPS.length
              ? <BtnPrimary onClick={() => setStep(s => s + 1)} disabled={(step === 1 && step1Disabled) || (step === 2 && step2Disabled)}>Suivant <ChevronRight size={14} /></BtnPrimary>
              : <button onClick={save} disabled={!canSave || saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#FFE600", color: "#1A1A1A", cursor: !canSave || saving ? "not-allowed" : "pointer", opacity: !canSave || saving ? 0.6 : 1 }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} {isEdit ? "Enregistrer" : "Créer"}
                </button>
            }
          </div>
        </div>
      </div>
    </>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ rec, onClose, onEdit, canEdit }: { rec: FlatRecommendation; onClose: () => void; onEdit: (rec: FlatRecommendation) => void; canEdit: boolean }) {
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#A0A0A0", textTransform: "uppercase" as const, letterSpacing: "0.09em", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #F0F0F0" }}>
        {title}
      </div>
      {children}
    </div>
  );

  const GridRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "7px 0", borderBottom: "1px solid #F7F7F7" }}>
      <span style={{ fontSize: 11, color: "#9B9B9B", width: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: "#1A1A1A", fontWeight: 500, flex: 1 }}>{value || "-"}</span>
    </div>
  );

  const ScoreBar = ({ label, value, max = 5 }: { label: string; value: number; max?: number }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
      <span style={{ fontSize: 11, color: "#9B9B9B", width: 80, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", gap: 3 }}>
        {Array.from({ length: max }, (_, i) => i + 1).map(i => <div key={i} style={{ width: 22, height: 6, borderRadius: 3, backgroundColor: i <= value ? "#1A1A1A" : "#EBEBEB" }} />)}
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>{value}<span style={{ color: "#C0C0C0", fontWeight: 400 }}>/{max}</span></span>
    </div>
  );

  return (
    <>
      <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.28)", zIndex: 500 }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 580, maxWidth: "90vw", zIndex: 501, backgroundColor: "#fff", boxShadow: "-6px 0 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}>

        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #EBEBEB", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: "#A0A0A0", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.04em" }}>{rec.code}</span>
                {rec.isDraft && <DraftBadge />}
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A", margin: "0 0 12px", lineHeight: 1.35 }}>{rec.title}</h2>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <TypeBadge value={typeOf(rec)} />
                <span style={{ color: "#D8D8D8" }}>·</span>
                <StatutBadge value={rec.status} />
                <span style={{ color: "#D8D8D8" }}>·</span>
                <CategoryBadge value={rec.category} />
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4, flexShrink: 0 }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px", display: "flex", flexDirection: "column", gap: 22 }}>

          <Section title="Description">
            <p style={{ fontSize: 13, color: "#3A3A3A", lineHeight: 1.75, margin: 0 }}>{rec.text || "-"}</p>
          </Section>

          <Section title="Rattachement au référentiel">
            <div>
              <GridRow label="Dimension" value={rec.dimensionName} />
              <GridRow label="Sous-dimension" value={rec.subDimensionName} />
              <GridRow label="Question" value={rec.questionText} />
              <GridRow label="Niveau déclencheur" value={`Niveau ${rec.triggerLevel} → Niveau ${rec.targetLevel}`} />
            </div>
          </Section>

          <Section title="Scoring">
            <ScoreBar label="Effort" value={rec.effort} max={3} />
          </Section>
        </div>

        <div style={{ padding: "14px 28px", borderTop: "1px solid #EBEBEB", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 5, fontSize: 13, fontWeight: 500, border: "1px solid #E5E5E5", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Fermer</button>
          {canEdit && (
            <button onClick={() => { onClose(); onEdit(rec); }} style={{ padding: "8px 18px", borderRadius: 5, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#fff", cursor: "pointer" }}>Modifier</button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Delete confirmation (même langage que celui de Veille réglementaire --
// pas de window.confirm() natif pour une suppression réelle en base) ────────

function DeleteConfirmDialog({ rec, deleting, onCancel, onConfirm }: {
  rec: FlatRecommendation; deleting: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 16, width: 440, maxWidth: "94vw", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.22)" }}>
        <div style={{ padding: "28px 26px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", backgroundColor: "#FFEBEE", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, flexShrink: 0 }}>
            <AlertTriangle size={24} style={{ color: "#CC0000" }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A", marginBottom: 8 }}>Supprimer cette recommandation ?</div>
          <div style={{ fontSize: 13, color: "#6B6B6B", lineHeight: 1.55 }}>
            <span style={{ fontWeight: 600, color: "#1A1A1A" }}>« {rec.title} »</span> (niveau {rec.triggerLevel} → {rec.targetLevel}, code {rec.code}) sera définitivement supprimée du catalogue.
          </div>
        </div>
        <div style={{ padding: "16px 26px 24px", display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={deleting} style={{ flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.13)", backgroundColor: "#fff", color: "#4A4A4A", cursor: deleting ? "not-allowed" : "pointer" }}>Annuler</button>
          <button onClick={onConfirm} disabled={deleting} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#CC0000", color: "#fff", cursor: deleting ? "wait" : "pointer", opacity: deleting ? 0.75 : 1 }}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {deleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSS injected once for hover states (avoids JS inline style sticky-hover bug) ─

const RC_STYLES = `
  .rc-btn-consult {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 11px; border-radius: 5px; font-size: 12px; font-weight: 600;
    border: 1px solid #E0E0E0; background: #fff; color: #1A1A1A;
    cursor: pointer; white-space: nowrap; transition: background 0.15s, color 0.15s, border-color 0.15s;
    font-family: inherit; outline: none;
  }
  .rc-btn-consult:hover { background: #1A1A1A; color: #fff; border-color: #1A1A1A; }
  .rc-btn-consult:focus { outline: 2px solid #FFE600 !important; outline-offset: 2px !important; }

  .rc-btn-more {
    width: 26px; height: 26px; border-radius: 4px;
    border: 1px solid #E5E5E5; background: transparent;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    color: #B0B0B0; transition: background 0.15s, color 0.15s, border-color 0.15s;
    font-family: inherit; outline: none;
  }
  .rc-btn-more:hover { background: #1A1A1A; color: #fff; border-color: #1A1A1A; }
  .rc-btn-more:focus { outline: 2px solid #FFE600 !important; outline-offset: 2px !important; }

  .rc-menu-item {
    width: 100%; display: flex; align-items: center; gap: 9px;
    padding: 9px 13px; border: none; background: transparent;
    cursor: pointer; font-size: 12px; font-weight: 500; color: #1A1A1A;
    text-align: left; transition: background 0.12s;
    font-family: inherit;
  }
  .rc-menu-item:hover { background: #F5F5F5; }
  .rc-menu-warn { color: #A16207; }
  .rc-menu-warn:hover { background: #FFFBEB !important; }
  .rc-menu-danger { color: #CC2200; }
  .rc-menu-danger:hover { background: #FFF5F5 !important; }

  .rc-filter-chip {
    padding: 6px 26px 6px 11px; border-radius: 20px; font-size: 12px; font-weight: 500;
    border: 1.5px solid #E0E0E0; background: #FAFAFA; color: #6B6B6B;
    cursor: pointer; appearance: none;
    outline: none !important;
    outline-color: transparent !important;
    transition: border-color 0.15s, background 0.15s;
    font-family: inherit;
  }
  .rc-filter-chip:hover { border-color: #B0B0B0; background: #F5F5F5; }
  .rc-filter-chip.active { border-color: #FFE600; background: #fff; color: #1A1A1A; font-weight: 600; box-shadow: 0 0 0 3px rgba(255,230,0,0.2); }
  .rc-filter-chip:focus,
  .rc-filter-chip:focus-visible {
    outline: none !important;
    outline-color: transparent !important;
    border-color: #FFE600 !important;
    box-shadow: 0 0 0 3px rgba(255,230,0,0.2) !important;
  }
`;

function RCStyleInjector() {
  return <style>{RC_STYLES}</style>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RecommendationCatalog() {
  // Read-only for the reduced "admin" role (reachable at /admin/recommendations,
  // see routes.tsx) -- the backend already refuses every mutation from that
  // role (require_super_admin on every write endpoint in admin.py), this
  // only keeps the UI from offering controls that would just come back 403.
  const canEdit = isSuperAdmin();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [draftDimensions, setDraftDimensions] = useState<Dimension[]>([]);
  const [recs, setRecs] = useState<FlatRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [fDim, setFDim] = useState("");
  const [fCat, setFCat] = useState("");
  const [fType, setFType] = useState("");
  const [fStat, setFStat] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [presetQuestionId, setPresetQuestionId] = useState<string | null>(null);
  const [editRec, setEditRec] = useState<FlatRecommendation | null>(null);
  const [focusSearch, setFocusSearch] = useState(false);
  const [viewRec, setViewRec] = useState<FlatRecommendation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlatRecommendation | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      // getFrameworkState() (the draft tree) is a super-admin staging
      // endpoint -- the whole admin_framework.py router requires
      // super_admin, no exception. A read-only caller has nothing to do
      // with in-progress drafts anyway (per the backend, list_recommendations
      // already excludes draft rows for them too, see admin.py), so this
      // skips the call entirely instead of it 403ing and failing the
      // Promise.all for everything else on the page.
      const [dims, recommendations, framework] = await Promise.all([
        adminApi.listDimensions(),
        adminApi.listRecommendations(),
        canEdit ? getFrameworkState() : Promise.resolve(null),
      ]);
      // Draft-only nodes (dimension/sub-dimension/question ids failing
      // isNewId are real and already in `dims` -- keep only what isn't).
      const draftTree = framework?.draft ? fromApiTree(framework.draft.tree) : [];
      setDimensions(dims);
      setDraftDimensions(draftTree);
      const merged = mergeDraftIntoLive(dims, draftTree);
      setRecs(flattenRecommendations(recommendations, merged));
    } catch (e) {
      setLoadError(true);
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [canEdit]);
  useEffect(() => { load(); }, [load]);

  // Live dimensions, with any draft-only dimensions/sub-dimensions/questions
  // merged in (tagged via isNewId so the UI can badge them "Brouillon") --
  // passed to WizardDrawer so both the manual flow and the deep-link below
  // can select a draft question, per the brainstormed design.
  const mergedDimensions = useMemo(
    () => mergeDraftIntoLive(dimensions, draftDimensions),
    [dimensions, draftDimensions],
  );

  // Deep-link from AdminDimensions.tsx's "Configurer les recommandations":
  // ?draftQuestionId=<tempId> opens the wizard pre-filled with that draft
  // question, once the merged tree has loaded. Consumed once (param cleared)
  // so a refresh doesn't reopen it.
  useEffect(() => {
    const draftQuestionId = searchParams.get("draftQuestionId");
    // Deep-link opens the create/edit wizard -- never for a read-only caller,
    // even via a crafted URL (the backend would refuse the save anyway, but
    // the wizard itself shouldn't pop open at all).
    if (!draftQuestionId || loading || loadError || !canEdit) return;
    const exists = mergedDimensions.some(d => d.subDimensions.some(s => s.questions.some(q => q.id === draftQuestionId)));
    if (exists) {
      setPresetQuestionId(draftQuestionId);
      setShowWizard(true);
    } else {
      toast.warning("Question de brouillon introuvable, le brouillon a peut-être changé.");
    }
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete("draftQuestionId"); return next; }, { replace: true });
  }, [searchParams, loading, loadError, mergedDimensions, setSearchParams]);

  const categories = Array.from(new Set(recs.map(r => r.category))).sort();

  const filtered = recs.filter(r => {
    const q = search.toLowerCase();
    return (
      (!q || r.code.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.text.toLowerCase().includes(q)) &&
      (!fDim  || r.dimensionName === fDim) &&
      (!fCat  || r.category      === fCat) &&
      (!fType || typeOf(r)       === fType) &&
      (!fStat || statutLabel(r.status) === fStat)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const reset = () => { setSearch(""); setFDim(""); setFCat(""); setFType(""); setFStat(""); setPage(1); };

  async function handleToggleStatut(rec: FlatRecommendation) {
    setOpenMenu(null);
    try {
      await adminApi.updateRecommendation(rec.id, { status: rec.status === "Active" ? "Inactive" : "Active" });
      await load();
    } catch (e) { toast.error(errMsg(e)); }
  }

  async function handleDelete(rec: FlatRecommendation) {
    setDeletingId(rec.id);
    try {
      await adminApi.deleteRecommendation(rec.id);
      toast.success("Recommandation supprimée");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  }

  const kpis = [
    { label: "Total recommandations", value: recs.length,                                              sub: "Référentiel global",              icon: BookOpen,    topColor: "#FFE600" },
    { label: "Actives",               value: recs.filter(r => r.status === "Active").length,           sub: "Disponibles pour les banques",    icon: CheckCircle, topColor: "#FFE600" },
    { label: "Réglementaires",        value: recs.filter(r => r.regulatoryFlag).length,                sub: "Exigences BCT / BCBS",             icon: Shield,      topColor: "#FFE600" },
    { label: "Désactivées",           value: recs.filter(r => r.status === "Inactive").length,          sub: "Retirées du moteur de scoring",   icon: Power,       topColor: "#FFE600" },
  ];

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>
      <RCStyleInjector />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>Catalogue des recommandations</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0", fontWeight: 400 }}>Référentiel global utilisé par le moteur d'analyse EY DataMaturity</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowWizard(true)}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.18)", transition: "background 0.18s, box-shadow 0.18s, transform 0.12s" }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#2D2D2D"; b.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.transform = "translateY(0)"; }}
          >
            <Plus size={15} /> Ajouter une recommandation
          </button>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 60, color: "#9B9B9B" }}>
          <Loader2 size={20} className="animate-spin" /> Chargement du catalogue…
        </div>
      )}

      {!loading && loadError && (
        <div style={{ textAlign: "center", padding: 50 }}>
          <AlertTriangle size={22} style={{ color: "#CC0000", marginBottom: 10 }} />
          <p style={{ fontSize: 13, color: "#6B6B6B", marginBottom: 14 }}>Impossible de charger le catalogue.</p>
          <button onClick={load} style={{ padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>Réessayer</button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
          </div>

          <div style={{ backgroundColor: "#fff", border: "1px solid #E8E8E8", borderRadius: 10, marginBottom: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ padding: "14px 16px 0 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: "#F5F5F5", border: `1.5px solid ${focusSearch ? "#FFE600" : "transparent"}`, borderRadius: 7, padding: "0 14px", boxShadow: focusSearch ? "0 0 0 3px rgba(255,230,0,0.2)" : "none", transition: "border-color 0.18s, box-shadow 0.18s" }}>
                <Search size={14} style={{ color: "#ABABAB", flexShrink: 0 }} />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  onFocus={() => setFocusSearch(true)}
                  onBlur={() => setFocusSearch(false)}
                  placeholder="Rechercher par titre, code, mot-clé…"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#1A1A1A", padding: "11px 0", fontWeight: 400 }}
                />
                {search && (
                  <button onClick={() => { setSearch(""); setPage(1); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#ABABAB", padding: 0, display: "flex", alignItems: "center" }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ padding: "10px 16px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: "1px solid #F0F0F0", marginTop: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#C0C0C0", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 4, flexShrink: 0 }}>Filtres</span>

              {[
                { value: fDim,  setter: setFDim,  opts: dimensions.map(d => d.name), ph: "Dimension" },
                { value: fCat,  setter: setFCat,  opts: categories,                  ph: "Catégorie" },
                { value: fType, setter: setFType, opts: ["Réglementaire","Amélioration"], ph: "Type"   },
                { value: fStat, setter: setFStat, opts: ["Actif","Désactivé"],        ph: "Statut"    },
              ].map(({ value, setter, opts, ph }, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <select
                    value={value}
                    onChange={e => { setter(e.target.value); setPage(1); }}
                    className={`rc-filter-chip${value ? " active" : ""}`}
                  >
                    <option value="">{ph}</option>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <ChevronDown size={10} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "#ABABAB", pointerEvents: "none" }} />
                </div>
              ))}

              {(fDim || fCat || fType || fStat || search) && (
                <button
                  onClick={reset}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: "1px solid #E0E0E0", backgroundColor: "#fff", cursor: "pointer", color: "#9B9B9B", marginLeft: "auto", transition: "all 0.15s" }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "#CC2200"; b.style.borderColor = "#CC2200"; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "#9B9B9B"; b.style.borderColor = "#E0E0E0"; }}
                >
                  <RotateCcw size={11} /> Réinitialiser
                </button>
              )}

              <span style={{ fontSize: 12, color: "#ABABAB", marginLeft: (fDim || fCat || fType || fStat || search) ? 0 : "auto" }}>
                <strong style={{ color: "#1A1A1A", fontWeight: 700 }}>{filtered.length}</strong> résultat{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div style={{ backgroundColor: "#fff", border: "1px solid #E8E8E8", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 130 }} /><col style={{ width: 90 }} /><col style={{ width: 130 }} /></colgroup>

              <thead>
                <tr style={{ backgroundColor: "#F7F7F7", borderBottom: "1px solid #E8E8E8" }}>
                  {[
                    { label: "Recommandation", align: "left"  },
                    { label: "Catégorie",      align: "left"  },
                    { label: "Type",           align: "left"  },
                    { label: "Statut",         align: "left"  },
                    { label: "",               align: "right" },
                  ].map(({ label, align }, i) => (
                    <th key={i} style={{ padding: "10px 14px", textAlign: align as React.CSSProperties["textAlign"], fontSize: 10, fontWeight: 700, color: "#A8A8A8", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {paginated.map((rec) => (
                  <tr
                    key={rec.id}
                    style={{ borderBottom: "1px solid #F0F0F0", transition: "background 0.1s", cursor: "default" }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#FAFAFA"}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "transparent"}
                  >
                    <td style={{ padding: "14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#ABABAB", fontFamily: "monospace", letterSpacing: "0.04em", flexShrink: 0 }}>{rec.code}</span>
                        {rec.isDraft && <DraftBadge />}
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#4A4A4A", backgroundColor: "#F0F0F0", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>Niv. {rec.triggerLevel}→{rec.targetLevel}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#ABABAB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.dimensionName} <span style={{ color: "#E0E0E0" }}>·</span> {rec.subDimensionName}
                      </div>
                    </td>

                    <td style={{ padding: "14px" }}><CategoryBadge value={rec.category} /></td>
                    <td style={{ padding: "14px" }}><TypeBadge value={typeOf(rec)} /></td>
                    <td style={{ padding: "14px" }}><StatutBadge value={rec.status} /></td>

                    <td style={{ padding: "14px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                        <button className="rc-btn-consult" onClick={() => setViewRec(rec)}>
                          <Eye size={11} /> Consulter
                        </button>
                        {canEdit && (
                          <div style={{ position: "relative" }}>
                            <button className="rc-btn-more" onClick={() => setOpenMenu(openMenu === rec.id ? null : rec.id)}>
                              <MoreHorizontal size={13} />
                            </button>
                            {openMenu === rec.id && (
                              <>
                                <div onClick={() => setOpenMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
                                <div style={{ position: "absolute", right: 0, top: 30, zIndex: 200, backgroundColor: "#fff", border: "1px solid #E8E8E8", borderRadius: 6, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", minWidth: 172, overflow: "hidden" }}>
                                  <button className="rc-menu-item" onClick={() => { setEditRec(rec); setOpenMenu(null); }}>
                                    <Edit2 size={12} /> Modifier
                                  </button>
                                  <button
                                    className={rec.status === "Active" ? "rc-menu-item rc-menu-warn" : "rc-menu-item"}
                                    style={{ borderTop: "1px solid #F2F2F2" }}
                                    onClick={() => handleToggleStatut(rec)}
                                  >
                                    <Power size={12} /> {rec.status === "Active" ? "Désactiver" : "Activer"}
                                  </button>
                                  <button className="rc-menu-item rc-menu-danger" style={{ borderTop: "1px solid #F2F2F2" }} onClick={() => { setDeleteTarget(rec); setOpenMenu(null); }}>
                                    <Trash2 size={12} /> Supprimer
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div style={{ padding: "56px 20px", textAlign: "center" }}>
                <BookOpen size={28} style={{ color: "#D8D8D8", marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: "#4A4A4A" }}>Aucune recommandation trouvée</div>
                <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>Modifiez vos filtres ou ajoutez une nouvelle recommandation.</div>
              </div>
            )}

            <div style={{ padding: "11px 16px", borderTop: "1px solid #F0F0F0", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FAFAFA" }}>
              <span style={{ fontSize: 12, color: "#9B9B9B" }}>
                <strong style={{ color: "#1A1A1A" }}>{filtered.length}</strong> résultat{filtered.length !== 1 ? "s" : ""}, page <strong style={{ color: "#1A1A1A" }}>{page}</strong> / {totalPages}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ display: "flex", alignItems: "center", gap: 3, padding: "5px 10px", borderRadius: 4, fontSize: 12, fontWeight: 500, border: "1px solid #E5E5E5", backgroundColor: "#fff", color: page === 1 ? "#D0D0D0" : "#4A4A4A", cursor: page === 1 ? "default" : "pointer" }}>
                  <ChevronLeft size={13} /> Précédent
                </button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).slice(Math.max(0, page - 3), page + 2).map(p => (
                  <button key={p} onClick={() => setPage(p)} style={{ padding: "5px 9px", borderRadius: 4, fontSize: 12, fontWeight: p === page ? 700 : 400, border: "1px solid #E5E5E5", backgroundColor: p === page ? "#1A1A1A" : "#fff", color: p === page ? "#FFE600" : "#4A4A4A", cursor: "pointer" }}>{p}</button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ display: "flex", alignItems: "center", gap: 3, padding: "5px 10px", borderRadius: 4, fontSize: 12, fontWeight: 500, border: "1px solid #E5E5E5", backgroundColor: "#fff", color: page >= totalPages ? "#D0D0D0" : "#4A4A4A", cursor: page >= totalPages ? "default" : "pointer" }}>
                  Suivant <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {openMenu !== null && <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setOpenMenu(null)} />}

      {viewRec && <DetailPanel rec={viewRec} onClose={() => setViewRec(null)} onEdit={(r) => { setViewRec(null); setEditRec(r); }} canEdit={canEdit} />}

      {showWizard && (
        <WizardDrawer
          dimensions={mergedDimensions}
          categories={categories}
          existingRecs={recs}
          presetQuestionId={presetQuestionId ?? undefined}
          onClose={() => { setShowWizard(false); setPresetQuestionId(null); }}
          onSaved={load}
        />
      )}

      {editRec && (
        <WizardDrawer dimensions={mergedDimensions} categories={categories} existingRecs={recs} editing={editRec} onClose={() => setEditRec(null)} onSaved={load} />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          rec={deleteTarget}
          deleting={deletingId === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
    </div>
  );
}
