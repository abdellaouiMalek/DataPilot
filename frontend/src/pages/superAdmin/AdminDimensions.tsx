import { useState, useEffect, useCallback } from "react";
import {
  Plus, Edit2, ChevronDown, ChevronRight, GripVertical, X,
  Eye, Trash2, Loader2, Search, Copy, ListTree, Table2, Check, ArrowLeft, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "../../lib/api";
import {
  adminApi,
  type Dimension, type SubDimension, type Question, type Status, type DeleteImpact,
  type LevelResponse, type ChoiceOption,
} from "../../lib/admin";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue";
}

// ── Force-delete confirmation ────────────────────────────────────────────────
// The backend RESTRICTs hard-deletes of anything referenced by real assessment
// answers (see app/models/assessment.py). A plain delete surfaces that as a 409;
// this dialog shows the admin what a force-delete would actually wipe out, so
// they can choose to proceed with full knowledge it's destroying history.

interface PendingForceDelete {
  label: string;
  impact: DeleteImpact;
  onConfirm: () => Promise<void>;
}

function ForceDeleteDialog({ pending, onClose }: { pending: PendingForceDelete; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    setDeleting(true);
    try {
      await pending.onConfirm();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
      setDeleting(false);
    }
  }

  const { impact } = pending;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...panel, width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#CC0000" }}>Suppression définitive</div>
          <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>{pending.label}</div>
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: "10px 14px", backgroundColor: "#FFF5F5", border: "1px solid #FFCDD2", borderRadius: 7, fontSize: 12, color: "#CC0000", lineHeight: 1.5 }}>
            Cet élément est référencé par des évaluations existantes. Le supprimer définitivement effacera aussi :
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#1A1A1A", display: "flex", flexDirection: "column", gap: 4 }}>
            <li><strong>{impact.answerCount}</strong> réponse{impact.answerCount !== 1 ? "s" : ""} enregistrée{impact.answerCount !== 1 ? "s" : ""}, sur <strong>{impact.assessmentCount}</strong> évaluation{impact.assessmentCount !== 1 ? "s" : ""}</li>
            {impact.recommendationCount > 0 && (
              <li><strong>{impact.recommendationCount}</strong> règle{impact.recommendationCount !== 1 ? "s" : ""} de recommandation associée{impact.recommendationCount !== 1 ? "s" : ""}</li>
            )}
          </ul>
          <div style={{ fontSize: 12, color: "#9B9B9B" }}>
            Cette action est irréversible : les évaluations concernées perdront ces données de façon permanente et leurs scores ne seront plus cohérents.
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={btnGhost} onClick={onClose} disabled={deleting}>Annuler</button>
          <button
            onClick={confirm}
            disabled={deleting}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#CC0000", color: "#fff", cursor: deleting ? "wait" : "pointer", opacity: deleting ? 0.7 : 1 }}
          >
            {deleting && <Loader2 size={14} className="animate-spin" />}Supprimer définitivement
          </button>
        </div>
      </div>
    </div>
  );
}

const RESPONSE_TYPES = ["Oui/Non", "Échelle de maturité", "Choix unique", "Choix multiple", "Texte libre"];

// ── Badges ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const active = status === "Active";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: active ? "#E8F5E9" : "#F5F5F5", color: active ? "#2E7D32" : "#9B9B9B", borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: active ? "#2E7D32" : "#9E9E9E" }} />
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    "Oui/Non":             { bg: "#EEF2FF", color: "#3730A3" },
    "Échelle de maturité": { bg: "#FFF7ED", color: "#9A3412" },
    "Choix unique":        { bg: "#F0FDF4", color: "#166534" },
    "Choix multiple":      { bg: "#FDF4FF", color: "#6B21A8" },
    "Texte libre":         { bg: "#F0F9FF", color: "#0C4A6E" },
  };
  const c = colors[type] || { bg: "#F5F5F5", color: "#6B6B6B" };
  return <span style={{ backgroundColor: c.bg, color: c.color, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 600 }}>{type}</span>;
}

// ── Shared styles ───────────────────────────────────────────────────────────

const inp: React.CSSProperties = { width: "100%", padding: "8px 11px", borderRadius: 5, border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none", boxSizing: "border-box", color: "#1A1A1A", backgroundColor: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5, letterSpacing: "0.02em" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const panel: React.CSSProperties = { backgroundColor: "#fff", borderRadius: 12, width: 520, maxWidth: "94vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.16)" };
const btnPrimary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" };

function StatusPicker({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {(["Active", "Inactive"] as Status[]).map(s => (
        <button key={s} type="button" onClick={() => onChange(s)} style={{ padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: value === s ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.12)", backgroundColor: value === s ? "#1A1A1A" : "#fff", color: value === s ? "#FFE600" : "#6B6B6B" }}>{s}</button>
      ))}
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children, footer, headerExtra, width = 520 }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
  headerExtra?: React.ReactNode; width?: number;
}) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...panel, width }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>{subtitle}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {headerExtra}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>{footer}</div>
      </div>
    </div>
  );
}

// ── Dimension modal (create / edit) ─────────────────────────────────────────

function DimensionModal({ initial, onClose, onSaved }: {
  initial?: Dimension; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [weight, setWeight] = useState(initial?.weight ?? 10);
  const [color, setColor] = useState(initial?.color ?? "#1A1A1A");
  const [status, setStatus] = useState<Status>(initial?.status ?? "Active");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (initial) await adminApi.updateDimension(initial.id, { name, description, weight, color, status });
      else await adminApi.createDimension({ name, description, weight, color, status });
      toast.success(initial ? "Dimension mise à jour" : "Dimension créée");
      await onSaved();
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  return (
    <ModalShell
      title={initial ? "Modifier la dimension" : "Nouvelle dimension"}
      subtitle={initial?.name}
      onClose={onClose}
      footer={<>
        <button style={btnGhost} onClick={onClose}>Annuler</button>
        <button style={{ ...btnPrimary, opacity: !name.trim() || saving ? 0.5 : 1 }} disabled={!name.trim() || saving} onClick={save}>
          {saving && <Loader2 size={14} className="animate-spin" />}{initial ? "Enregistrer" : "Créer"}
        </button>
      </>}
    >
      <div><label style={lbl}>Nom de la dimension *</label>
        <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="ex. Gouvernance des données" /></div>
      <div><label style={lbl}>Description</label>
        <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><label style={lbl}>Poids (%)</label>
          <input type="number" min={0} max={100} style={inp} value={weight} onChange={e => setWeight(+e.target.value)} /></div>
        <div><label style={lbl}>Couleur</label>
          <input type="color" style={{ ...inp, height: 38, padding: 4, cursor: "pointer" }} value={color} onChange={e => setColor(e.target.value)} /></div>
      </div>
      <div><label style={lbl}>Statut</label><StatusPicker value={status} onChange={setStatus} /></div>
    </ModalShell>
  );
}

// ── Sub-dimension modal (create / edit) ─────────────────────────────────────

function SubDimensionModal({ dim, initial, onClose, onSaved }: {
  dim: Dimension; initial?: SubDimension; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [status, setStatus] = useState<Status>(initial?.status ?? "Active");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (initial) await adminApi.updateSubDimension(initial.id, { name, status });
      else await adminApi.createSubDimension(dim.id, { name, status });
      toast.success(initial ? "Sous-dimension mise à jour" : "Sous-dimension créée");
      await onSaved();
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  return (
    <ModalShell
      title={initial ? "Modifier la sous-dimension" : "Nouvelle sous-dimension"}
      subtitle={initial ? `${dim.name} › ${initial.name}` : `Dans ${dim.name}`}
      onClose={onClose}
      footer={<>
        <button style={btnGhost} onClick={onClose}>Annuler</button>
        <button style={{ ...btnPrimary, opacity: !name.trim() || saving ? 0.5 : 1 }} disabled={!name.trim() || saving} onClick={save}>
          {saving && <Loader2 size={14} className="animate-spin" />}{initial ? "Enregistrer" : "Créer"}
        </button>
      </>}
    >
      <div><label style={lbl}>Nom de la sous-dimension *</label>
        <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="ex. Politiques & Standards" autoFocus /></div>
      <div><label style={lbl}>Statut</label><StatusPicker value={status} onChange={setStatus} /></div>
      <div style={{ padding: "10px 14px", backgroundColor: "#F7F7F7", borderRadius: 7, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: dim.color }} />
        <span style={{ fontSize: 11, color: "#9B9B9B" }}>{dim.name} ›</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>{name || "Aperçu"}</span>
      </div>
    </ModalShell>
  );
}

// ── Question modal (create / edit) ──────────────────────────────────────────

const LEVEL_NAMES = ["Initial", "En développement", "Défini", "Maîtrisé", "Optimisé"];
const DEFAULT_LEVEL_RESPONSES: LevelResponse[] = [
  { label: "Aucune pratique formalisée, approche ad-hoc.", score: 1 },
  { label: "Des initiatives émergent mais restent isolées.", score: 2 },
  { label: "Des politiques et standards sont documentés.", score: 3 },
  { label: "Les pratiques sont mesurées et contrôlées.", score: 4 },
  { label: "Amélioration continue, culture data ancrée.", score: 5 },
];
const DEFAULT_CHOICE_OPTIONS: ChoiceOption[] = [{ label: "", score: 1 }, { label: "", score: 2 }];

// ── Maturity responses editor (per-level label + score) ──────────────────────

function MaturityEditor({ responses, onChange }: {
  responses: LevelResponse[]; onChange: (r: LevelResponse[]) => void;
}) {
  return (
    <div>
      <label style={lbl}>Réponses par niveau</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {LEVEL_NAMES.map((name, i) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", backgroundColor: "#F7F7F7", borderRadius: 6, border: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#FFE600" }}>{i + 1}</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#4A4A4A", width: 105, flexShrink: 0 }}>{name}</span>
            <input
              value={responses[i]?.label ?? ""}
              onChange={e => onChange(responses.map((r, ri) => ri === i ? { ...r, label: e.target.value } : r))}
              placeholder="Libellé de la réponse…"
              style={{ ...inp, flex: 1, fontSize: 12, padding: "6px 10px" }}
            />
            <input
              type="number" min={0} max={20} value={responses[i]?.score ?? i + 1}
              onChange={e => onChange(responses.map((r, ri) => ri === i ? { ...r, score: +e.target.value } : r))}
              style={{ width: 56, padding: "5px 8px", borderRadius: 5, border: "1px solid rgba(0,0,0,0.13)", fontSize: 12, textAlign: "center", outline: "none" }}
            />
            <span style={{ fontSize: 11, color: "#9B9B9B", flexShrink: 0 }}>pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Choice options editor (Choix unique / Choix multiple) ────────────────────

function ChoiceEditor({ options, onChange }: {
  options: ChoiceOption[]; onChange: (o: ChoiceOption[]) => void;
}) {
  return (
    <div>
      <label style={lbl}>Options de réponse</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((opt, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", backgroundColor: "#F7F7F7", borderRadius: 6, border: "1px solid rgba(0,0,0,0.06)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9B9B9B", width: 18, flexShrink: 0 }}>{String.fromCharCode(65 + i)}</span>
            <input
              value={opt.label}
              onChange={e => onChange(options.map((o, oi) => oi === i ? { ...o, label: e.target.value } : o))}
              placeholder={`Option ${String.fromCharCode(65 + i)}…`}
              style={{ ...inp, flex: 1, fontSize: 12, padding: "6px 10px" }}
            />
            <input
              type="number" min={0} max={20} value={opt.score}
              onChange={e => onChange(options.map((o, oi) => oi === i ? { ...o, score: +e.target.value } : o))}
              style={{ width: 56, padding: "5px 8px", borderRadius: 5, border: "1px solid rgba(0,0,0,0.13)", fontSize: 12, textAlign: "center", outline: "none" }}
            />
            <span style={{ fontSize: 11, color: "#9B9B9B", flexShrink: 0 }}>pts</span>
            {options.length > 2 && (
              <button type="button" onClick={() => onChange(options.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#CC0000", padding: 2, flexShrink: 0 }}><X size={12} /></button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...options, { label: "", score: options.length + 1 }])}
        style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7, fontSize: 11, fontWeight: 600, color: "#6B6B6B", background: "none", border: "1px dashed rgba(0,0,0,0.18)", borderRadius: 5, padding: "5px 10px", cursor: "pointer" }}
      >
        <Plus size={11} /> Ajouter une option
      </button>
    </div>
  );
}

function TabSwitch({ tab, onChange }: { tab: "edit" | "preview"; onChange: (t: "edit" | "preview") => void }) {
  return (
    <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(0,0,0,0.12)" }}>
      {([["edit", "Édition"], ["preview", "Prévisualisation"]] as const).map(([t, l]) => (
        <button key={t} type="button" onClick={() => onChange(t)} style={{
          padding: "5px 14px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
          backgroundColor: tab === t ? "#1A1A1A" : "#fff",
          color: tab === t ? "#FFE600" : "#6B6B6B",
        }}>{l}</button>
      ))}
    </div>
  );
}

function QuestionModal({ dimensions, dim, sub, initial, initialTab = "edit", onClose, onSaved }: {
  dimensions: Dimension[];
  dim?: Dimension; sub?: SubDimension;
  initial?: Question;
  initialTab?: "edit" | "preview";
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"edit" | "preview">(initialTab);

  // Dimension/sub-dimension are editable here too (unlike before) so the modal
  // works both scoped (opened from a sub-dimension's "+ Ajouter" button) and
  // unscoped (opened from the flat "Toutes les questions" table, or to move a
  // question to a different sub-dimension entirely).
  const [dimensionId, setDimensionId] = useState(initial?.dimensionId ?? dim?.id ?? dimensions[0]?.id ?? "");
  const selectedDim = dimensions.find(d => d.id === dimensionId) ?? dimensions[0];
  const [subDimensionId, setSubDimensionId] = useState(
    initial?.subDimensionId ?? sub?.id ?? selectedDim?.subDimensions[0]?.id ?? ""
  );
  const selectedSub = selectedDim?.subDimensions.find(s => s.id === subDimensionId);

  function changeDimension(id: string) {
    setDimensionId(id);
    setSubDimensionId(dimensions.find(d => d.id === id)?.subDimensions[0]?.id ?? "");
  }

  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState(initial?.type ?? "Échelle de maturité");
  const [weight, setWeight] = useState(initial?.weight ?? 5);
  const [order, setOrder] = useState(initial?.order ?? 1);
  const [required, setRequired] = useState(initial?.isRequired ?? true);
  const [status, setStatus] = useState<Status>(initial?.status ?? "Active");
  const [levelResponses, setLevelResponses] = useState<LevelResponse[]>(
    initial?.levelResponses?.length === 5 ? initial.levelResponses : DEFAULT_LEVEL_RESPONSES
  );
  const [choiceOptions, setChoiceOptions] = useState<ChoiceOption[]>(
    initial?.choiceOptions?.length ? initial.choiceOptions : DEFAULT_CHOICE_OPTIONS
  );
  const [saving, setSaving] = useState(false);

  const canSave = label.trim() && subDimensionId;
  const isChoiceType = type === "Choix unique" || type === "Choix multiple";

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = {
        label, description, type, weight, order, isRequired: required, status,
        levelResponses: type === "Échelle de maturité" ? levelResponses : null,
        choiceOptions: isChoiceType ? choiceOptions : null,
      };
      if (initial) await adminApi.updateQuestion(initial.id, { ...input, subDimensionId });
      else await adminApi.createQuestion(subDimensionId, input);
      toast.success(initial ? "Question mise à jour" : "Question créée");
      await onSaved();
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  return (
    <ModalShell
      title={initial ? "Modifier la question" : "Nouvelle question"}
      subtitle={selectedDim && selectedSub ? `${selectedDim.name} › ${selectedSub.name}` : "Sélectionnez une sous-dimension"}
      width={620}
      headerExtra={<TabSwitch tab={tab} onChange={setTab} />}
      onClose={onClose}
      footer={<>
        <button style={btnGhost} onClick={onClose}>Annuler</button>
        <button style={{ ...btnPrimary, opacity: !canSave || saving ? 0.5 : 1 }} disabled={!canSave || saving} onClick={save}>
          {saving && <Loader2 size={14} className="animate-spin" />}{initial ? "Enregistrer" : "Créer"}
        </button>
      </>}
    >
      {tab === "edit" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={lbl}>Dimension *</label>
              <select style={inp} value={dimensionId} onChange={e => changeDimension(e.target.value)}>
                {dimensions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select></div>
            <div><label style={lbl}>Sous-dimension *</label>
              <select style={inp} value={subDimensionId} onChange={e => setSubDimensionId(e.target.value)} disabled={!selectedDim?.subDimensions.length}>
                {!selectedDim?.subDimensions.length && <option value="">Aucune sous-dimension</option>}
                {(selectedDim?.subDimensions ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
          </div>
          <div><label style={lbl}>Intitulé de la question *</label>
            <textarea style={{ ...inp, resize: "vertical" }} rows={3} value={label} onChange={e => setLabel(e.target.value)} placeholder="Saisissez la question…" autoFocus /></div>
          <div><label style={lbl}>Description / Aide à la réponse</label>
            <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Informations complémentaires pour guider la réponse…" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14 }}>
            <div><label style={lbl}>Type de réponse</label>
              <select style={inp} value={type} onChange={e => setType(e.target.value)}>
                {RESPONSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label style={lbl}>Poids (1–10)</label>
              <input type="number" min={1} max={10} style={inp} value={weight} onChange={e => setWeight(+e.target.value)} /></div>
            <div><label style={lbl}>Ordre d'affichage</label>
              <input type="number" min={1} style={inp} value={order} onChange={e => setOrder(+e.target.value)} /></div>
          </div>
          {type === "Échelle de maturité" && (
            <MaturityEditor responses={levelResponses} onChange={setLevelResponses} />
          )}
          {isChoiceType && (
            <ChoiceEditor options={choiceOptions} onChange={setChoiceOptions} />
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#4A4A4A" }}>Question obligatoire</label>
              <button type="button" onClick={() => setRequired(r => !r)} style={{
                width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                backgroundColor: required ? "#1A1A1A" : "#D0D0D0", position: "relative", transition: "background 0.15s",
              }}>
                <span style={{ position: "absolute", top: 2, left: required ? 18 : 2, width: 16, height: 16, borderRadius: "50%", backgroundColor: "#fff", transition: "left 0.15s" }} />
              </button>
            </div>
            <StatusPicker value={status} onChange={setStatus} />
          </div>
        </>
      ) : (
        <div style={{ backgroundColor: "#F7F7F7", borderRadius: 8, padding: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9B9B9B", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
            {selectedDim?.name} · {selectedSub?.name}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", marginBottom: 12, lineHeight: 1.5 }}>
            {label || "Intitulé de la question…"}
          </div>
          {description && (
            <div style={{ fontSize: 12, color: "#4A4A4A", marginBottom: 16, padding: "10px 14px", backgroundColor: "#EFF6FF", borderRadius: 6, borderLeft: "3px solid #3B82F6" }}>
              {description}
            </div>
          )}
          {type === "Échelle de maturité" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {LEVEL_NAMES.map((name, i) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", backgroundColor: "#fff", borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 800 }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#1A1A1A", flex: 1 }}>{levelResponses[i]?.label || name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#9B9B9B" }}>{levelResponses[i]?.score ?? i + 1} pts</span>
                </div>
              ))}
            </div>
          )}
          {type === "Oui/Non" && (
            <div style={{ display: "flex", gap: 10 }}>
              {["Oui", "Non"].map(opt => (
                <div key={opt} style={{ flex: 1, padding: "12px 16px", backgroundColor: "#fff", borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)", textAlign: "center", fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{opt}</div>
              ))}
            </div>
          )}
          {isChoiceType && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {choiceOptions.map((opt, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", backgroundColor: "#fff", borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{ width: 18, height: 18, flexShrink: 0, borderRadius: type === "Choix unique" ? "50%" : 4, border: "2px solid rgba(0,0,0,0.2)" }} />
                  <span style={{ fontSize: 13, color: "#1A1A1A", flex: 1 }}>{opt.label || `Option ${String.fromCharCode(65 + i)}`}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#9B9B9B" }}>{opt.score} pts</span>
                </div>
              ))}
            </div>
          )}
          {type === "Texte libre" && (
            <div style={{ padding: "12px 14px", backgroundColor: "#fff", borderRadius: 6, border: "1px dashed rgba(0,0,0,0.15)", fontSize: 12, color: "#B0B0B0", fontStyle: "italic" }}>
              Zone de texte libre pour la réponse…
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

// ── Step bar (guided wizards) ─────────────────────────────────────────────────

function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                backgroundColor: done || active ? "#1A1A1A" : "#F0F0F0",
                display: "flex", alignItems: "center", justifyContent: "center",
                outline: active ? "3px solid #FFE600" : "none", outlineOffset: 1,
              }}>
                {done
                  ? <Check size={12} style={{ color: "#FFE600" }} />
                  : <span style={{ fontSize: 11, fontWeight: 700, color: active ? "#FFE600" : "#9B9B9B" }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? "#1A1A1A" : "#9B9B9B", whiteSpace: "nowrap" }}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, backgroundColor: done ? "#1A1A1A" : "#E0E0E0", margin: "0 10px", marginBottom: 14 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Wizard question step (add one or more questions to a known sub-dimension) ─
// Shared final step of both "New dimension" and "New sub-dimension" wizards.
// Each "+ Autre question" / "Terminer" click saves for real via adminApi — the
// wizard never batches unsaved state, so closing partway through still keeps
// whatever was already created.

function WizardQuestionStep({ subDimensionId, breadcrumb, onBack, onFinish }: {
  subDimensionId: string; breadcrumb: string; onBack: () => void; onFinish: () => void;
}) {
  const blank = () => ({ label: "", description: "", type: "Échelle de maturité", weight: 5, required: true, status: "Active" as Status });
  const [form, setForm] = useState(blank());
  const [levelResponses, setLevelResponses] = useState<LevelResponse[]>(DEFAULT_LEVEL_RESPONSES);
  const [choiceOptions, setChoiceOptions] = useState<ChoiceOption[]>(DEFAULT_CHOICE_OPTIONS);
  const [saving, setSaving] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const isChoiceType = form.type === "Choix unique" || form.type === "Choix multiple";

  async function save(andContinue: boolean) {
    if (!form.label.trim()) { if (!andContinue) onFinish(); return; }
    setSaving(true);
    try {
      await adminApi.createQuestion(subDimensionId, {
        label: form.label, description: form.description, type: form.type, weight: form.weight,
        isRequired: form.required, status: form.status,
        levelResponses: form.type === "Échelle de maturité" ? levelResponses : null,
        choiceOptions: isChoiceType ? choiceOptions : null,
      });
      setAddedCount(c => c + 1);
      if (andContinue) {
        setForm(blank());
        setLevelResponses(DEFAULT_LEVEL_RESPONSES);
        setChoiceOptions(DEFAULT_CHOICE_OPTIONS);
        toast.success("Question ajoutée");
      } else {
        onFinish();
      }
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 11, color: "#9B9B9B" }}>
        {breadcrumb}
        {addedCount > 0 && <span style={{ color: "#2E7D32", fontWeight: 600 }}> · {addedCount} question{addedCount > 1 ? "s" : ""} ajoutée{addedCount > 1 ? "s" : ""}</span>}
      </div>

      <div><label style={lbl}>Libellé de la question *</label>
        <textarea style={{ ...inp, resize: "vertical" }} rows={3} value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="Entrez le libellé de la question…" autoFocus /></div>

      <div><label style={lbl}>Aide à la réponse</label>
        <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Informations complémentaires pour guider la réponse…" /></div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label style={lbl}>Type de réponse</label>
          <select style={inp} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
            {RESPONSE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select></div>
        <div><label style={lbl}>Poids (1–10)</label>
          <input type="number" min={1} max={10} style={inp} value={form.weight} onChange={e => setForm(p => ({ ...p, weight: +e.target.value }))} /></div>
      </div>

      {form.type === "Échelle de maturité" && <MaturityEditor responses={levelResponses} onChange={setLevelResponses} />}
      {isChoiceType && <ChoiceEditor options={choiceOptions} onChange={setChoiceOptions} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: "#4A4A4A" }}>Obligatoire</label>
          <button type="button" onClick={() => setForm(p => ({ ...p, required: !p.required }))} style={{ width: 34, height: 18, borderRadius: 9, border: "none", cursor: "pointer", backgroundColor: form.required ? "#1A1A1A" : "#D0D0D0", position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 2, left: form.required ? 16 : 2, width: 14, height: 14, borderRadius: "50%", backgroundColor: "white", transition: "left 0.2s" }} />
          </button>
        </div>
        <StatusPicker value={form.status} onChange={s => setForm(p => ({ ...p, status: s }))} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.06)", marginTop: 4 }}>
        <button onClick={onBack} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={13} /> Retour</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => save(true)} disabled={saving || !form.label.trim()} style={{ padding: "8px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: "1px dashed rgba(0,0,0,0.2)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A", opacity: saving || !form.label.trim() ? 0.5 : 1 }}>
            + Autre question
          </button>
          <button onClick={() => save(false)} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
            {saving && <Loader2 size={14} className="animate-spin" />}Terminer <Check size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New dimension wizard (Dimension → Sous-dimensions → Questions) ───────────

function NewDimensionWizard({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [dimForm, setDimForm] = useState({ name: "", description: "", weight: 10, color: "#1A1A1A" });
  const [subNames, setSubNames] = useState([""]);
  const [creating, setCreating] = useState(false);
  const [createdDimId, setCreatedDimId] = useState<string | null>(null);
  const [createdSubId, setCreatedSubId] = useState<string | null>(null);
  const [firstSubName, setFirstSubName] = useState("");

  async function createDimensionAndAdvance() {
    if (!dimForm.name.trim()) return;
    setCreating(true);
    try {
      const res = await adminApi.createDimension(dimForm);
      setCreatedDimId(String(res.id));
      setStep(1);
    } catch (e) { toast.error(errMsg(e)); } finally { setCreating(false); }
  }

  async function createSubDimensionsAndAdvance() {
    const names = subNames.map(n => n.trim()).filter(Boolean);
    if (!names.length || !createdDimId) return;
    setCreating(true);
    try {
      let firstId: string | null = null;
      for (const name of names) {
        const res = await adminApi.createSubDimension(createdDimId, { name });
        if (firstId === null) { firstId = String(res.id); setFirstSubName(name); }
      }
      setCreatedSubId(firstId);
      setStep(2);
    } catch (e) { toast.error(errMsg(e)); } finally { setCreating(false); }
  }

  async function finish() {
    toast.success("Dimension créée");
    await onSaved();
    onClose();
  }

  const step1Disabled = creating || !subNames.some(n => n.trim());
  const step0Disabled = creating || !dimForm.name.trim();

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...panel, width: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Nouvelle dimension</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
          <StepBar steps={["Dimension", "Sous-dimensions", "Questions"]} current={step} />

          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={lbl}>Nom *</label>
                <input style={inp} value={dimForm.name} onChange={e => setDimForm(p => ({ ...p, name: e.target.value }))} placeholder="ex. Gouvernance des données" autoFocus /></div>
              <div><label style={lbl}>Description</label>
                <textarea style={{ ...inp, resize: "vertical" }} rows={2} value={dimForm.description} onChange={e => setDimForm(p => ({ ...p, description: e.target.value }))} placeholder="Description courte…" /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div><label style={lbl}>Poids (%)</label>
                  <input type="number" min={0} max={100} style={inp} value={dimForm.weight} onChange={e => setDimForm(p => ({ ...p, weight: +e.target.value }))} /></div>
                <div><label style={lbl}>Couleur</label>
                  <input type="color" style={{ ...inp, height: 38, padding: 4, cursor: "pointer" }} value={dimForm.color} onChange={e => setDimForm(p => ({ ...p, color: e.target.value }))} /></div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ fontSize: 12, color: "#9B9B9B", marginBottom: 14 }}>Sous-dimensions pour <strong style={{ color: "#1A1A1A" }}>{dimForm.name}</strong></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {subNames.map((n, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#9B9B9B", width: 20, flexShrink: 0, textAlign: "center" }}>{i + 1}</span>
                    <input style={inp} value={n} onChange={e => setSubNames(s => s.map((x, xi) => xi === i ? e.target.value : x))} placeholder={`Nom de la sous-dimension ${i + 1}`} />
                    {subNames.length > 1 && (
                      <button onClick={() => setSubNames(s => s.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#CC0000", flexShrink: 0 }}><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setSubNames(s => [...s, ""])} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 12, fontWeight: 600, color: dimForm.color, background: "none", border: `1px dashed ${dimForm.color}`, borderRadius: 5, padding: "6px 12px", cursor: "pointer" }}>
                <Plus size={12} /> Ajouter
              </button>
            </div>
          )}

          {step === 2 && createdSubId && (
            <WizardQuestionStep
              subDimensionId={createdSubId}
              breadcrumb={`${dimForm.name} › ${firstSubName}`}
              onBack={() => setStep(1)}
              onFinish={finish}
            />
          )}
        </div>

        {step < 2 && (
          <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
            {step > 0
              ? <button onClick={() => setStep(s => s - 1)} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}><ArrowLeft size={13} /> Retour</button>
              : <button onClick={onClose} style={btnGhost}>Annuler</button>}
            <button
              onClick={step === 0 ? createDimensionAndAdvance : createSubDimensionsAndAdvance}
              disabled={step === 0 ? step0Disabled : step1Disabled}
              style={{ ...btnPrimary, opacity: (step === 0 ? step0Disabled : step1Disabled) ? 0.5 : 1 }}
            >
              {creating && <Loader2 size={14} className="animate-spin" />}Suivant <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── New sub-dimension wizard (Sous-dimension → Questions) ────────────────────

function NewSubDimensionWizard({ dim, onClose, onSaved }: { dim: Dimension; onClose: () => void; onSaved: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdSubId, setCreatedSubId] = useState<string | null>(null);

  async function createAndAdvance() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await adminApi.createSubDimension(dim.id, { name });
      setCreatedSubId(String(res.id));
      setStep(1);
    } catch (e) { toast.error(errMsg(e)); } finally { setCreating(false); }
  }

  async function finish() {
    toast.success("Sous-dimension créée");
    await onSaved();
    onClose();
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...panel, width: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Nouvelle sous-dimension</div>
            <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>{dim.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
          <StepBar steps={["Sous-dimension", "Questions"]} current={step} />
          {step === 0 && (
            <div><label style={lbl}>Nom *</label>
              <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="ex. Politiques & Standards" autoFocus /></div>
          )}
          {step === 1 && createdSubId && (
            <WizardQuestionStep subDimensionId={createdSubId} breadcrumb={`${dim.name} › ${name}`} onBack={() => setStep(0)} onFinish={finish} />
          )}
        </div>

        {step === 0 && (
          <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
            <button onClick={onClose} style={btnGhost}>Annuler</button>
            <button onClick={createAndAdvance} disabled={creating || !name.trim()} style={{ ...btnPrimary, opacity: creating || !name.trim() ? 0.5 : 1 }}>
              {creating && <Loader2 size={14} className="animate-spin" />}Suivant <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Questions list ──────────────────────────────────────────────────────────

function QuestionsList({ dim, sub, onChanged, onEdit, onAdd, readOnly }: {
  dim: Dimension; sub: SubDimension; onChanged: () => Promise<void>;
  onEdit: (q: Question) => void; onAdd: () => void; readOnly?: boolean;
}) {
  const [forceDelete, setForceDelete] = useState<PendingForceDelete | null>(null);

  async function remove(q: Question) {
    if (!window.confirm("Supprimer cette question ?")) return;
    try {
      await adminApi.deleteQuestion(q.id);
      toast.success("Question supprimée");
      await onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const impact = await adminApi.getQuestionDeleteImpact(q.id);
        const short = q.label.length > 60 ? `${q.label.slice(0, 60)}…` : q.label;
        setForceDelete({
          label: `Question « ${short} »`,
          impact,
          onConfirm: async () => {
            await adminApi.deleteQuestion(q.id, true);
            toast.success("Question supprimée définitivement");
            await onChanged();
          },
        });
        return;
      }
      toast.error(errMsg(e));
    }
  }
  async function toggle(q: Question) {
    try { await adminApi.updateQuestion(q.id, { status: q.status === "Active" ? "Inactive" : "Active" }); await onChanged(); }
    catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <div style={{ padding: "8px 16px 10px 50px", display: "flex", flexDirection: "column", gap: 5 }}>
      {sub.questions.map((q, qi) => (
        <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 12, backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, padding: "10px 14px", opacity: q.status === "Inactive" ? 0.55 : 1 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: `${dim.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: dim.color }}>{qi + 1}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <TypeBadge type={q.type} />
              <span style={{ fontSize: 10, color: "#C0C0C0" }}>·</span>
              <span style={{ fontSize: 10, color: "#9B9B9B" }}>Poids</span>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: i < q.weight ? dim.color : "#EBEBEB" }} />
                ))}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: dim.color }}>{q.weight}</span>
            </div>
          </div>
          {!readOnly && (
            <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
              <button title="Modifier" onClick={() => onEdit(q)} style={iconBtn}><Edit2 size={13} /></button>
              <button title={q.status === "Active" ? "Désactiver" : "Activer"} onClick={() => toggle(q)}
                style={{ ...iconBtn, border: q.status === "Active" ? "1px solid #1A1A1A" : iconBtn.border, backgroundColor: q.status === "Active" ? "#1A1A1A" : "#F7F7F7", color: q.status === "Active" ? "#FFE600" : "#9B9B9B" }}>
                <Eye size={13} />
              </button>
              <button title="Supprimer" onClick={() => remove(q)} style={{ ...iconBtn, color: "#CC0000" }}><Trash2 size={13} /></button>
            </div>
          )}
        </div>
      ))}
      {sub.questions.length === 0 && (
        <div style={{ fontSize: 12, color: "#9B9B9B", padding: "6px 2px" }}>Aucune question dans cette sous-dimension.</div>
      )}
      {!readOnly && (
        <button onClick={onAdd} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: 10, borderRadius: 8, border: `1.5px dashed ${dim.color}40`, backgroundColor: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, color: dim.color, marginTop: 2 }}>
          <Plus size={13} /> Ajouter une question
        </button>
      )}
      {forceDelete && <ForceDeleteDialog pending={forceDelete} onClose={() => setForceDelete(null)} />}
    </div>
  );
}

const iconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(0,0,0,0.09)", backgroundColor: "#F7F7F7", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#4A4A4A" };
const smallIconBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 5, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6B6B" };

// ── Read-only question preview (admin "consult only" view) ──────────────────
// Same visual structure as QuestionModal's "Prévisualisation" tab, but with
// no editable state and no save action at all -- reads straight off the
// stored question, nothing else. Used only from QuestionsTable's read-only
// mode (see `readOnly` below), never from the super-admin's own editable
// QuestionModal.

function QuestionPreviewModal({ q, onClose }: { q: FlatQuestion; onClose: () => void }) {
  const isChoiceType = q.type === "Choix unique" || q.type === "Choix multiple";
  return (
    <ModalShell
      title="Aperçu de la question"
      subtitle={`${q.dimensionName} › ${q.subDimensionName}`}
      onClose={onClose}
      footer={<button style={btnGhost} onClick={onClose}>Fermer</button>}
    >
      <div style={{ backgroundColor: "#F7F7F7", borderRadius: 8, padding: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9B9B9B", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
          {q.dimensionName} · {q.subDimensionName}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", marginBottom: 12, lineHeight: 1.5 }}>
          {q.label}
        </div>
        {q.description && (
          <div style={{ fontSize: 12, color: "#4A4A4A", marginBottom: 16, padding: "10px 14px", backgroundColor: "#EFF6FF", borderRadius: 6, borderLeft: "3px solid #3B82F6" }}>
            {q.description}
          </div>
        )}
        {q.type === "Échelle de maturité" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {LEVEL_NAMES.map((name, i) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", backgroundColor: "#fff", borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800 }}>{i + 1}</span>
                </div>
                <span style={{ fontSize: 13, color: "#1A1A1A", flex: 1 }}>{q.levelResponses?.[i]?.label || name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#9B9B9B" }}>{q.levelResponses?.[i]?.score ?? i + 1} pts</span>
              </div>
            ))}
          </div>
        )}
        {q.type === "Oui/Non" && (
          <div style={{ display: "flex", gap: 10 }}>
            {["Oui", "Non"].map(opt => (
              <div key={opt} style={{ flex: 1, padding: "12px 16px", backgroundColor: "#fff", borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)", textAlign: "center", fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{opt}</div>
            ))}
          </div>
        )}
        {isChoiceType && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(q.choiceOptions ?? []).map((opt, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", backgroundColor: "#fff", borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ width: 18, height: 18, flexShrink: 0, borderRadius: q.type === "Choix unique" ? "50%" : 4, border: "2px solid rgba(0,0,0,0.2)" }} />
                <span style={{ fontSize: 13, color: "#1A1A1A", flex: 1 }}>{opt.label || `Option ${String.fromCharCode(65 + i)}`}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#9B9B9B" }}>{opt.score} pts</span>
              </div>
            ))}
          </div>
        )}
        {q.type === "Texte libre" && (
          <div style={{ padding: "12px 14px", backgroundColor: "#fff", borderRadius: 6, border: "1px dashed rgba(0,0,0,0.15)", fontSize: 12, color: "#B0B0B0", fontStyle: "italic" }}>
            Zone de texte libre pour la réponse…
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── Flat questions table (all questions across every dimension, filterable) ─

interface FlatQuestion extends Question {
  dimensionName: string;
  dimensionColor: string;
  subDimensionName: string;
}

function flattenQuestions(dimensions: Dimension[]): FlatQuestion[] {
  const rows: FlatQuestion[] = [];
  for (const d of dimensions) {
    for (const s of d.subDimensions) {
      for (const q of s.questions) {
        rows.push({ ...q, dimensionName: d.name, dimensionColor: d.color, subDimensionName: s.name });
      }
    }
  }
  return rows;
}

function QuestionsTable({ dimensions, onEdit, onPreview, onAdd, onChanged, readOnly }: {
  dimensions: Dimension[];
  onEdit: (q: FlatQuestion) => void;
  onPreview: (q: FlatQuestion) => void;
  onAdd: () => void;
  onChanged: () => Promise<void>;
  readOnly?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [dimFilter, setDimFilter] = useState("Toutes les dimensions");
  const [typeFilter, setTypeFilter] = useState("Tous les types");
  const [statusFilter, setStatusFilter] = useState("Tous les statuts");
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [forceDelete, setForceDelete] = useState<PendingForceDelete | null>(null);
  const [previewQ, setPreviewQ] = useState<FlatQuestion | null>(null);

  const dimNames = ["Toutes les dimensions", ...dimensions.map(d => d.name)];
  const typeNames = ["Tous les types", ...RESPONSE_TYPES];
  const statusNames = ["Tous les statuts", "Active", "Inactive"];

  const all = flattenQuestions(dimensions);
  const filtered = all.filter(q => {
    const needle = search.trim().toLowerCase();
    const matchSearch = !needle || q.label.toLowerCase().includes(needle) || q.id.includes(needle);
    const matchDim = dimFilter === "Toutes les dimensions" || q.dimensionName === dimFilter;
    const matchType = typeFilter === "Tous les types" || q.type === typeFilter;
    const matchStatus = statusFilter === "Tous les statuts" || q.status === statusFilter;
    return matchSearch && matchDim && matchType && matchStatus;
  });

  async function duplicate(q: FlatQuestion) {
    setDuplicating(q.id);
    try {
      await adminApi.createQuestion(q.subDimensionId, {
        label: `${q.label} (copie)`,
        description: q.description,
        type: q.type,
        weight: q.weight,
        isRequired: q.isRequired,
        levelResponses: q.levelResponses,
        choiceOptions: q.choiceOptions,
        status: q.status,
      });
      toast.success("Question dupliquée");
      await onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDuplicating(null);
    }
  }

  async function remove(q: FlatQuestion) {
    if (!window.confirm("Supprimer cette question ?")) return;
    try {
      await adminApi.deleteQuestion(q.id);
      toast.success("Question supprimée");
      await onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const impact = await adminApi.getQuestionDeleteImpact(q.id);
        const short = q.label.length > 60 ? `${q.label.slice(0, 60)}…` : q.label;
        setForceDelete({
          label: `Question « ${short} »`,
          impact,
          onConfirm: async () => {
            await adminApi.deleteQuestion(q.id, true);
            toast.success("Question supprimée définitivement");
            await onChanged();
          },
        });
        return;
      }
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      {/* Filters */}
      <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 9, backgroundColor: "#F7F7F7", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: "8px 13px" }}>
          <Search size={14} style={{ color: "#9B9B9B", flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par libellé, ID…" style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, width: "100%", color: "#1A1A1A" }} />
        </div>
        {[
          { options: dimNames, value: dimFilter, setter: setDimFilter },
          { options: typeNames, value: typeFilter, setter: setTypeFilter },
          { options: statusNames, value: statusFilter, setter: setStatusFilter },
        ].map(({ options, value, setter }, i) => (
          <div key={i} style={{ position: "relative" }}>
            <select value={value} onChange={e => setter(e.target.value)} style={{ padding: "8px 30px 8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: "1.5px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", appearance: "none", outline: "none", maxWidth: 210, color: value.startsWith("Tou") ? "#9B9B9B" : "#1A1A1A" }}>
              {options.map(o => <option key={o}>{o}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9B9B", pointerEvents: "none" }} />
          </div>
        ))}
        <span style={{ fontSize: 12, color: "#9B9B9B" }}>{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</span>
        {!readOnly && (
          <button onClick={onAdd} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>
            <Plus size={13} /> Ajouter une question
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
          <thead>
            <tr style={{ backgroundColor: "#FAFAFA", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              {["ID", "Dimension", "Sous-dimension", "Libellé", "Type", "Poids", "Statut", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#9B9B9B", letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((q, i) => (
              <tr key={q.id}
                style={{ borderBottom: i < filtered.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", opacity: q.status === "Inactive" ? 0.55 : 1, transition: "background 0.1s" }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#FAFAFA"}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "transparent"}
              >
                <td style={{ padding: "11px 14px" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, backgroundColor: "#F5F5F5", padding: "2px 7px", borderRadius: 4, color: "#4A4A4A", whiteSpace: "nowrap" }}>Q-{q.id}</span>
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: q.dimensionColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#1A1A1A", whiteSpace: "nowrap" }}>{q.dimensionName}</span>
                  </div>
                </td>
                <td style={{ padding: "11px 14px", fontSize: 12, color: "#6B6B6B", whiteSpace: "nowrap" }}>{q.subDimensionName}</td>
                <td style={{ padding: "11px 14px", maxWidth: 280 }}>
                  <div style={{ fontSize: 12, color: "#1A1A1A", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{q.label}</div>
                </td>
                <td style={{ padding: "11px 14px" }}><TypeBadge type={q.type} /></td>
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: "#F0F0F0" }}>
                      <div style={{ width: `${Math.min(100, q.weight * 10)}%`, height: "100%", backgroundColor: q.dimensionColor, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>{q.weight}</span>
                  </div>
                </td>
                <td style={{ padding: "11px 14px" }}><StatusBadge status={q.status} /></td>
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {readOnly ? (
                      <button title="Consulter" onClick={() => setPreviewQ(q)} style={smallIconBtn}><Eye size={12} /></button>
                    ) : (
                      <>
                        <button title="Modifier" onClick={() => onEdit(q)} style={smallIconBtn}><Edit2 size={12} /></button>
                        <button title="Prévisualiser" onClick={() => onPreview(q)} style={smallIconBtn}><Eye size={12} /></button>
                        <button title="Dupliquer" onClick={() => duplicate(q)} disabled={duplicating === q.id} style={{ ...smallIconBtn, cursor: duplicating === q.id ? "wait" : "pointer" }}>
                          {duplicating === q.id ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                        </button>
                        <button title="Supprimer" onClick={() => remove(q)} style={{ ...smallIconBtn, color: "#CC0000" }}><Trash2 size={12} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: "44px 20px", textAlign: "center", fontSize: 13, color: "#9B9B9B" }}>Aucune question ne correspond aux filtres.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {forceDelete && <ForceDeleteDialog pending={forceDelete} onClose={() => setForceDelete(null)} />}
      {previewQ && <QuestionPreviewModal q={previewQ} onClose={() => setPreviewQ(null)} />}
    </>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export function DimensionsManagement({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedDims, setExpandedDims] = useState<string[]>([]);
  const [expandedSubs, setExpandedSubs] = useState<string[]>([]);
  const [view, setView] = useState<"tree" | "table">("tree");

  const [dimModal, setDimModal] = useState<{ initial?: Dimension } | null>(null);
  const [subModal, setSubModal] = useState<{ dim: Dimension; initial?: SubDimension } | null>(null);
  const [qModal, setQModal] = useState<{
    dim?: Dimension; sub?: SubDimension; initial?: Question; initialTab?: "edit" | "preview";
  } | null>(null);
  const [showNewDim, setShowNewDim] = useState(false);
  const [newSubWizard, setNewSubWizard] = useState<{ dim: Dimension } | null>(null);
  const [forceDelete, setForceDelete] = useState<PendingForceDelete | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { setDimensions(await adminApi.listDimensions()); }
    catch (e) { setError(true); toast.error(errMsg(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleDim = (id: string) => setExpandedDims(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleSub = (id: string) => setExpandedSubs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  async function deleteDim(d: Dimension) {
    if (!window.confirm(`Supprimer la dimension « ${d.name} » et tout son contenu ?`)) return;
    try {
      await adminApi.deleteDimension(d.id);
      toast.success("Dimension supprimée");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const impact = await adminApi.getDimensionDeleteImpact(d.id);
        setForceDelete({
          label: `Dimension « ${d.name} »`,
          impact,
          onConfirm: async () => {
            await adminApi.deleteDimension(d.id, true);
            toast.success("Dimension supprimée définitivement");
            await load();
          },
        });
        return;
      }
      toast.error(errMsg(e));
    }
  }
  async function deleteSub(s: SubDimension) {
    if (!window.confirm(`Supprimer la sous-dimension « ${s.name} » et ses questions ?`)) return;
    try {
      await adminApi.deleteSubDimension(s.id);
      toast.success("Sous-dimension supprimée");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const impact = await adminApi.getSubDimensionDeleteImpact(s.id);
        setForceDelete({
          label: `Sous-dimension « ${s.name} »`,
          impact,
          onConfirm: async () => {
            await adminApi.deleteSubDimension(s.id, true);
            toast.success("Sous-dimension supprimée définitivement");
            await load();
          },
        });
        return;
      }
      toast.error(errMsg(e));
    }
  }

  const totalQ = dimensions.reduce((a, d) => a + d.subDimensions.reduce((b, s) => b + s.questions.length, 0), 0);
  const totalS = dimensions.reduce((a, d) => a + d.subDimensions.length, 0);
  const totalWeight = dimensions.reduce((a, d) => a + d.weight, 0);

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>Gestion du framework</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0" }}>
            {dimensions.length} dimensions · {totalS} sous-dimensions · {totalQ} questions
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(0,0,0,0.12)" }}>
            {([["tree", "Arborescence", ListTree], ["table", "Toutes les questions", Table2]] as const).map(([v, l, Icon]) => (
              <button key={v} onClick={() => setView(v)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                backgroundColor: view === v ? "#1A1A1A" : "#fff",
                color: view === v ? "#FFE600" : "#6B6B6B",
              }}>
                <Icon size={13} /> {l}
              </button>
            ))}
          </div>
          {!readOnly && (
            <button onClick={() => setShowNewDim(true)} style={{ ...btnPrimary, padding: "9px 18px", boxShadow: "0 4px 14px rgba(0,0,0,0.18)" }}>
              <Plus size={15} /> Nouvelle dimension
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 60, color: "#9B9B9B" }}>
          <Loader2 size={20} className="animate-spin" /> Chargement du framework…
        </div>
      )}

      {!loading && error && (
        <div style={{ textAlign: "center", padding: 50 }}>
          <p style={{ fontSize: 13, color: "#6B6B6B", marginBottom: 14 }}>Impossible de charger le framework.</p>
          <button style={btnPrimary} onClick={load}>Réessayer</button>
        </div>
      )}

      {!loading && !error && view === "table" && (
        <QuestionsTable
          dimensions={dimensions}
          onAdd={() => setQModal({})}
          onEdit={q => setQModal({ initial: q })}
          onPreview={q => setQModal({ initial: q, initialTab: "preview" })}
          onChanged={load}
          readOnly={readOnly}
        />
      )}

      {!loading && !error && view === "tree" && (
        <>
          {/* Weight distribution */}
          {dimensions.length > 0 && (
            <div style={{ backgroundColor: "#fff", borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "18px 20px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>Pondérations par dimension</span>
                <span style={{ fontSize: 11, color: "#9B9B9B" }}>{totalWeight}% répartis sur {dimensions.length} dimensions</span>
              </div>
              <div style={{ display: "flex", height: 42, borderRadius: 6, overflow: "hidden", gap: 3, marginBottom: 14 }}>
                {dimensions.map(d => (
                  <div
                    key={d.id}
                    title={`${d.name} — ${d.weight}%`}
                    onClick={() => toggleDim(d.id)}
                    style={{ flex: d.weight || 0.01, backgroundColor: d.color, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "filter 0.15s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1.12)"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1)"}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", userSelect: "none" }}>{d.weight}%</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
                {dimensions.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }} onClick={() => toggleDim(d.id)}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: d.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#1A1A1A", fontWeight: 400 }}>{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dimensions list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dimensions.map(dim => {
              const isOpenDim = expandedDims.includes(dim.id);
              const totalQDim = dim.subDimensions.reduce((a, s) => a + s.questions.length, 0);
              return (
                <div key={dim.id} style={{ backgroundColor: "#fff", borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                  {/* Dimension row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", borderLeft: `4px solid ${dim.color}` }} onClick={() => toggleDim(dim.id)}>
                    <GripVertical size={15} style={{ color: "#D0D0D0", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{dim.name}</span>
                        <StatusBadge status={dim.status} />
                      </div>
                      <div style={{ fontSize: 12, color: "#9B9B9B" }}>{dim.description}</div>
                    </div>
                    <div style={{ display: "flex", gap: 20, alignItems: "center", flexShrink: 0 }}>
                      {[{ v: dim.subDimensions.length, l: "sous-dim." }, { v: totalQDim, l: "questions" }, { v: `${dim.weight}%`, l: "poids", color: dim.color }].map((s, i) => (
                        <div key={i} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: s.color || "#1A1A1A" }}>{s.v}</div>
                          <div style={{ fontSize: 10, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.l}</div>
                        </div>
                      ))}
                      {!readOnly && (
                        <div style={{ display: "flex", gap: 5 }}>
                          <button onClick={e => { e.stopPropagation(); setDimModal({ initial: dim }); }} title="Modifier" style={smallIconBtn}><Edit2 size={12} /></button>
                          <button onClick={e => { e.stopPropagation(); setNewSubWizard({ dim }); }} title="Ajouter une sous-dimension" style={smallIconBtn}><Plus size={12} /></button>
                          <button onClick={e => { e.stopPropagation(); deleteDim(dim); }} title="Supprimer" style={{ ...smallIconBtn, color: "#CC0000" }}><Trash2 size={12} /></button>
                        </div>
                      )}
                      {isOpenDim ? <ChevronDown size={16} style={{ color: "#9B9B9B" }} /> : <ChevronRight size={16} style={{ color: "#9B9B9B" }} />}
                    </div>
                  </div>

                  {/* Sub-dimensions */}
                  {isOpenDim && (
                    <div style={{ backgroundColor: "#FAFAFA", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                      {dim.subDimensions.map((sub, si) => {
                        const isOpenSub = expandedSubs.includes(sub.id);
                        return (
                          <div key={sub.id} style={{ borderBottom: si < dim.subDimensions.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px 12px 44px", cursor: "pointer", backgroundColor: isOpenSub ? "#fff" : "#FAFAFA", borderLeft: isOpenSub ? `3px solid ${dim.color}` : "3px solid transparent" }} onClick={() => toggleSub(sub.id)}>
                              <GripVertical size={13} style={{ color: "#D0D0D0", flexShrink: 0 }} />
                              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: isOpenSub ? dim.color : "#C0C0C0", flexShrink: 0 }} />
                              <span style={{ flex: 1, fontSize: 13, fontWeight: isOpenSub ? 700 : 500, color: isOpenSub ? "#1A1A1A" : "#4A4A4A" }}>{sub.name}</span>
                              <span style={{ fontSize: 11, color: "#9B9B9B", marginRight: 10, backgroundColor: "#F0F0F0", padding: "2px 8px", borderRadius: 20 }}>
                                {sub.questions.length} question{sub.questions.length !== 1 ? "s" : ""}
                              </span>
                              <StatusBadge status={sub.status} />
                              {!readOnly && (
                                <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                                  <button onClick={e => { e.stopPropagation(); setSubModal({ dim, initial: sub }); }} title="Modifier" style={{ ...smallIconBtn, width: 26, height: 26 }}><Edit2 size={11} /></button>
                                  <button onClick={e => { e.stopPropagation(); deleteSub(sub); }} title="Supprimer" style={{ ...smallIconBtn, width: 26, height: 26, color: "#CC0000" }}><Trash2 size={11} /></button>
                                </div>
                              )}
                              <div style={{ width: 26, height: 26, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: isOpenSub ? dim.color : "transparent" }}>
                                {isOpenSub ? <ChevronDown size={14} style={{ color: "#fff" }} /> : <ChevronRight size={14} style={{ color: "#9B9B9B" }} />}
                              </div>
                            </div>
                            {isOpenSub && (
                              <div style={{ backgroundColor: "#FAFAFA", borderTop: "1px solid rgba(0,0,0,0.04)", paddingBottom: 10 }}>
                                <QuestionsList
                                  dim={dim} sub={sub} onChanged={load}
                                  onEdit={q => setQModal({ dim, sub, initial: q })}
                                  onAdd={() => setQModal({ dim, sub })}
                                  readOnly={readOnly}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {dim.subDimensions.length === 0 && (
                        <div style={{ padding: "10px 18px 4px 56px", fontSize: 12, color: "#9B9B9B" }}>Aucune sous-dimension.</div>
                      )}
                      {!readOnly && (
                        <div style={{ padding: "8px 18px 14px 56px" }}>
                          <button onClick={() => setNewSubWizard({ dim })} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#4A4A4A" }}>
                            <Plus size={12} /> Ajouter une sous-dimension
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {dimensions.length === 0 && (
              <div style={{ border: "1px dashed rgba(0,0,0,0.15)", borderRadius: 10, padding: 48, textAlign: "center", fontSize: 13, color: "#9B9B9B", backgroundColor: "#fff" }}>
                Aucune dimension. Commencez par en créer une.
              </div>
            )}
          </div>
        </>
      )}

      {dimModal && <DimensionModal initial={dimModal.initial} onClose={() => setDimModal(null)} onSaved={load} />}
      {subModal && <SubDimensionModal dim={subModal.dim} initial={subModal.initial} onClose={() => setSubModal(null)} onSaved={load} />}
      {showNewDim && <NewDimensionWizard onClose={() => setShowNewDim(false)} onSaved={load} />}
      {newSubWizard && <NewSubDimensionWizard dim={newSubWizard.dim} onClose={() => setNewSubWizard(null)} onSaved={load} />}
      {qModal && (
        <QuestionModal
          dimensions={dimensions}
          dim={qModal.dim}
          sub={qModal.sub}
          initial={qModal.initial}
          initialTab={qModal.initialTab}
          onClose={() => setQModal(null)}
          onSaved={load}
        />
      )}
      {forceDelete && <ForceDeleteDialog pending={forceDelete} onClose={() => setForceDelete(null)} />}
    </div>
  );
}

// ── Admin (rôle réduit) : même page, même design, lecture seule ─────────────
// L'espace admin (voir pages/admin/AdminLayout.tsx) doit pouvoir consulter
// le framework exactement comme le super admin le voit, sans jamais pouvoir
// le modifier -- `readOnly` retire chaque bouton de création/modification/
// suppression (voir chaque `{!readOnly && (...)}` ci-dessus) plutôt que de
// dupliquer ce fichier, pour qu'un changement de design ne puisse jamais
// diverger entre les deux espaces.

export function FrameworkConsultation() {
  return <DimensionsManagement readOnly />;
}
