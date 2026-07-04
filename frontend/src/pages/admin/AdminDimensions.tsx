import { useState, useEffect, useCallback } from "react";
import {
  Plus, Edit2, ChevronDown, ChevronRight, GripVertical, X,
  Eye, Trash2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  adminApi,
  type Dimension, type SubDimension, type Question, type Status,
} from "../../lib/admin";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue";
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

function ModalShell({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
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

function QuestionModal({ dim, sub, initial, onClose, onSaved }: {
  dim: Dimension; sub: SubDimension; initial?: Question; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [type, setType] = useState(initial?.type ?? "Échelle de maturité");
  const [weight, setWeight] = useState(initial?.weight ?? 5);
  const [status, setStatus] = useState<Status>(initial?.status ?? "Active");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      if (initial) await adminApi.updateQuestion(initial.id, { label, type, weight, status });
      else await adminApi.createQuestion(sub.id, { label, type, weight, status });
      toast.success(initial ? "Question mise à jour" : "Question créée");
      await onSaved();
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }

  return (
    <ModalShell
      title={initial ? "Modifier la question" : "Nouvelle question"}
      subtitle={`${dim.name} › ${sub.name}`}
      onClose={onClose}
      footer={<>
        <button style={btnGhost} onClick={onClose}>Annuler</button>
        <button style={{ ...btnPrimary, opacity: !label.trim() || saving ? 0.5 : 1 }} disabled={!label.trim() || saving} onClick={save}>
          {saving && <Loader2 size={14} className="animate-spin" />}{initial ? "Enregistrer" : "Créer"}
        </button>
      </>}
    >
      <div><label style={lbl}>Intitulé de la question *</label>
        <textarea style={{ ...inp, resize: "vertical" }} rows={3} value={label} onChange={e => setLabel(e.target.value)} placeholder="Saisissez la question…" autoFocus /></div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div><label style={lbl}>Type de réponse</label>
          <select style={inp} value={type} onChange={e => setType(e.target.value)}>
            {RESPONSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div><label style={lbl}>Poids (1–10)</label>
          <input type="number" min={1} max={10} style={inp} value={weight} onChange={e => setWeight(+e.target.value)} /></div>
      </div>
      <div><label style={lbl}>Statut</label><StatusPicker value={status} onChange={setStatus} /></div>
    </ModalShell>
  );
}

// ── Questions list ──────────────────────────────────────────────────────────

function QuestionsList({ dim, sub, onChanged, onEdit, onAdd }: {
  dim: Dimension; sub: SubDimension; onChanged: () => Promise<void>;
  onEdit: (q: Question) => void; onAdd: () => void;
}) {
  async function remove(q: Question) {
    if (!window.confirm("Supprimer cette question ?")) return;
    try { await adminApi.deleteQuestion(q.id); toast.success("Question supprimée"); await onChanged(); }
    catch (e) { toast.error(errMsg(e)); }
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
          <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
            <button title="Modifier" onClick={() => onEdit(q)} style={iconBtn}><Edit2 size={13} /></button>
            <button title={q.status === "Active" ? "Désactiver" : "Activer"} onClick={() => toggle(q)}
              style={{ ...iconBtn, border: q.status === "Active" ? "1px solid #1A1A1A" : iconBtn.border, backgroundColor: q.status === "Active" ? "#1A1A1A" : "#F7F7F7", color: q.status === "Active" ? "#FFE600" : "#9B9B9B" }}>
              <Eye size={13} />
            </button>
            <button title="Supprimer" onClick={() => remove(q)} style={{ ...iconBtn, color: "#CC0000" }}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
      {sub.questions.length === 0 && (
        <div style={{ fontSize: 12, color: "#9B9B9B", padding: "6px 2px" }}>Aucune question dans cette sous-dimension.</div>
      )}
      <button onClick={onAdd} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: 10, borderRadius: 8, border: `1.5px dashed ${dim.color}40`, backgroundColor: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, color: dim.color, marginTop: 2 }}>
        <Plus size={13} /> Ajouter une question
      </button>
    </div>
  );
}

const iconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(0,0,0,0.09)", backgroundColor: "#F7F7F7", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#4A4A4A" };
const smallIconBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 5, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6B6B" };

// ── Main ────────────────────────────────────────────────────────────────────

export function DimensionsManagement() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedDims, setExpandedDims] = useState<string[]>([]);
  const [expandedSubs, setExpandedSubs] = useState<string[]>([]);

  const [dimModal, setDimModal] = useState<{ initial?: Dimension } | null>(null);
  const [subModal, setSubModal] = useState<{ dim: Dimension; initial?: SubDimension } | null>(null);
  const [qModal, setQModal] = useState<{ dim: Dimension; sub: SubDimension; initial?: Question } | null>(null);

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
    try { await adminApi.deleteDimension(d.id); toast.success("Dimension supprimée"); await load(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  async function deleteSub(s: SubDimension) {
    if (!window.confirm(`Supprimer la sous-dimension « ${s.name} » et ses questions ?`)) return;
    try { await adminApi.deleteSubDimension(s.id); toast.success("Sous-dimension supprimée"); await load(); }
    catch (e) { toast.error(errMsg(e)); }
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
        <button onClick={() => setDimModal({})} style={{ ...btnPrimary, padding: "9px 18px", boxShadow: "0 4px 14px rgba(0,0,0,0.18)" }}>
          <Plus size={15} /> Nouvelle dimension
        </button>
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

      {!loading && !error && (
        <>
          {/* Weight distribution */}
          {dimensions.length > 0 && (
            <div style={{ backgroundColor: "#fff", borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "18px 20px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>Pondérations par dimension</span>
                <span style={{ fontSize: 11, color: "#9B9B9B" }}>{totalWeight}% répartis sur {dimensions.length} dimensions</span>
              </div>
              <div style={{ display: "flex", height: 36, borderRadius: 8, overflow: "hidden", gap: 2, marginBottom: 14 }}>
                {dimensions.map(d => (
                  <div key={d.id} title={`${d.name} — ${d.weight}%`} onClick={() => toggleDim(d.id)} style={{ flex: d.weight || 0.01, backgroundColor: d.color, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    {d.weight >= 12 && <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>{d.weight}%</span>}
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
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={e => { e.stopPropagation(); setDimModal({ initial: dim }); }} title="Modifier" style={smallIconBtn}><Edit2 size={12} /></button>
                        <button onClick={e => { e.stopPropagation(); setSubModal({ dim }); }} title="Ajouter une sous-dimension" style={smallIconBtn}><Plus size={12} /></button>
                        <button onClick={e => { e.stopPropagation(); deleteDim(dim); }} title="Supprimer" style={{ ...smallIconBtn, color: "#CC0000" }}><Trash2 size={12} /></button>
                      </div>
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
                              <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                                <button onClick={e => { e.stopPropagation(); setSubModal({ dim, initial: sub }); }} title="Modifier" style={{ ...smallIconBtn, width: 26, height: 26 }}><Edit2 size={11} /></button>
                                <button onClick={e => { e.stopPropagation(); deleteSub(sub); }} title="Supprimer" style={{ ...smallIconBtn, width: 26, height: 26, color: "#CC0000" }}><Trash2 size={11} /></button>
                              </div>
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
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {dim.subDimensions.length === 0 && (
                        <div style={{ padding: "10px 18px 4px 56px", fontSize: 12, color: "#9B9B9B" }}>Aucune sous-dimension.</div>
                      )}
                      <div style={{ padding: "8px 18px 14px 56px" }}>
                        <button onClick={() => setSubModal({ dim })} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#4A4A4A" }}>
                          <Plus size={12} /> Ajouter une sous-dimension
                        </button>
                      </div>
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
      {qModal && <QuestionModal dim={qModal.dim} sub={qModal.sub} initial={qModal.initial} onClose={() => setQModal(null)} onSaved={load} />}
    </div>
  );
}
