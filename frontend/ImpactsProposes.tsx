import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

export type ImpactAction = "accepté" | "modifié" | "rejeté" | null;

export interface MaturityLevel {
  level: number;
  label: string;
  color: string;
  answer: string;
  recommandation: string;
}

export interface ImpactCard {
  id: string;
  exigence: string;
  element: string;
  dimension: string;
  type: "réglementaire" | "mise à jour" | "mise à jour question" | "nouvelle question" | "recommandation";
  action: ImpactAction;
  sourceArticle?: { ref: string; text: string };
  recommandation?: string;
  oldRecommandation?: string;
  question?: string;
  oldQuestion?: string;
  suggestedAnswers?: MaturityLevel[];
}

export const impactCardsData: ImpactCard[] = [
  {
    id: "i1",
    exigence: "Chiffrement obligatoire des données sensibles au repos et en transit selon les normes AES-256.",
    element: "D4-Q4",
    dimension: "Architecture & Technologies Data — Sécurité des accès",
    type: "mise à jour",
    action: null,
    sourceArticle: {
      ref: "Art. 5 · BCT n°2024-03",
      text: "Les données sensibles stockées au repos et en transit doivent être chiffrées conformément aux standards AES-256 ou équivalents reconnus par l'ANSSI.",
    },
    oldRecommandation: "Appliquer un chiffrement des données sensibles en base de données. Une revue annuelle des pratiques est recommandée.",
    recommandation: "Mettre en place une politique de chiffrement formalisée couvrant les bases de données, les flux réseau et les supports amovibles. Auditer les systèmes existants pour identifier les données non chiffrées et établir un plan de mise en conformité sous 6 mois.",
  },
  {
    id: "i2",
    exigence: "Nomination d'un Délégué à la Protection des Données (DPO) rattaché hiérarchiquement à la direction générale.",
    element: "Nouvelle question",
    dimension: "Gouvernance des données — Data Ownership & Stewardship",
    type: "nouvelle question",
    action: null,
    question: "Un Délégué à la Protection des Données (DPO) est-il officiellement désigné, rattaché hiérarchiquement à la direction générale, avec un mandat documenté et des moyens alloués ?",
    suggestedAnswers: [
      { level: 1, label: "Initial",          color: "#CC0000", answer: "Aucun DPO désigné. La protection des données n'est pas formalisée.",                                     recommandation: "Lancer immédiatement la désignation d'un DPO et définir son mandat. Sensibiliser la direction à l'obligation réglementaire BCT." },
      { level: 2, label: "En développement", color: "#E65100", answer: "Un responsable informel existe mais sans mandat officiel ni rattachement à la direction générale.",       recommandation: "Formaliser le rôle via une lettre de mission signée par le DG. Allouer un budget dédié et planifier les premières actions de conformité." },
      { level: 3, label: "Défini",           color: "#F57F17", answer: "Un DPO est officiellement nommé, rattaché à la direction, avec un mandat documenté.",                     recommandation: "Définir un plan d'action annuel avec indicateurs. Organiser des comités trimestriels de suivi. Former les équipes data aux obligations réglementaires." },
      { level: 4, label: "Maîtrisé",         color: "#2E7D32", answer: "Le DPO est actif, avec des reportings réguliers à la direction et un suivi des actions de conformité.",   recommandation: "Mettre en place un tableau de bord de conformité RGPD. Intégrer le DPO dans les projets data dès leur conception (Privacy by Design)." },
      { level: 5, label: "Optimisé",         color: "#1565C0", answer: "Le DPO est pleinement intégré à la gouvernance. La culture protection des données est ancrée dans l'organisation.", recommandation: "" },
    ],
  },
  {
    id: "i6",
    exigence: "Révision des critères d'évaluation de la gouvernance des données suite à la circulaire BCT n°2024-03.",
    element: "D1-Q2",
    dimension: "Gouvernance des données — Politique et stratégie data",
    type: "mise à jour question",
    action: null,
    sourceArticle: {
      ref: "Art. 2 · BCT n°2024-03",
      text: "Les établissements doivent disposer d'une politique de gouvernance des données formalisée, approuvée par l'organe de direction et révisée annuellement.",
    },
    oldQuestion: "Existe-t-il une politique de gouvernance des données au sein de votre établissement ?",
    question: "Votre établissement dispose-t-il d'une politique de gouvernance des données formalisée, approuvée par l'organe de direction et soumise à révision annuelle conformément aux exigences BCT ?",
  },
  {
    id: "i5",
    exigence: "Obligation de déclaration des incidents de cybersécurité significatifs à la BCT dans un délai de 72 heures.",
    element: "D3-Q7",
    dimension: "Sécurité, Conformité & Contrôle — Gestion des incidents",
    type: "réglementaire",
    action: null,
    sourceArticle: {
      ref: "Art. 11 · BCT n°2024-03",
      text: "Tout incident de cybersécurité significatif doit être déclaré à la BCT dans un délai maximal de soixante-douze (72) heures suivant sa détection.",
    },
    recommandation: "Établir une procédure formalisée de gestion et de notification des incidents de cybersécurité. Désigner un responsable des notifications réglementaires et mettre en place un registre des incidents conforme aux exigences BCT.",
  },
  {
    id: "i3",
    exigence: "Test annuel obligatoire du Plan de Reprise d'Activité (PRA) avec rapport transmis à la BCT dans les 30 jours.",
    element: "D4-Q5",
    dimension: "Sécurité, Conformité & Contrôle — Continuité d'activité",
    type: "recommandation",
    action: null,
    sourceArticle: {
      ref: "Art. 9 · BCT n°2024-03",
      text: "Le Plan de Reprise d'Activité doit faire l'objet d'un test annuel. Le rapport est transmis à la BCT dans les trente (30) jours suivant sa réalisation.",
    },
    recommandation: "Planifier un test du PRA à fréquence annuelle avec scénarios réalistes (panne datacenter, cyberattaque). Désigner un responsable de la continuité d'activité et formaliser le processus de rédaction du rapport BCT. Archiver les preuves de test.",
  },
  {
    id: "i4",
    exigence: "Journalisation systématique de tous les accès aux données personnelles, conservation des journaux 5 ans minimum.",
    element: "D2-Q3",
    dimension: "Gouvernance des données — Traçabilité des accès",
    type: "mise à jour",
    action: null,
    sourceArticle: {
      ref: "Art. 3 · BCT n°2024-03",
      text: "Tout traitement de données à caractère personnel doit faire l'objet d'une journalisation systématique. Les journaux doivent être conservés pour une durée minimale de cinq (5) ans.",
    },
    oldRecommandation: "Conserver les journaux d'accès aux données personnelles pendant une durée minimale de 3 ans et prévoir une revue périodique.",
    recommandation: "Déployer un système de SIEM (Security Information and Event Management) capable de capturer et conserver tous les accès aux données personnelles. Définir une politique de rétention des logs conforme à l'Art. 3. Prévoir un audit semestriel des journaux d'accès.",
  },
];

const LEVEL_COLORS: Record<number, { color: string; bg: string; label: string }> = {
  1: { color: "#CC0000", bg: "#FFF5F5", label: "Initial"          },
  2: { color: "#E65100", bg: "#FFF8F3", label: "En développement" },
  3: { color: "#B45309", bg: "#FFFBEB", label: "Défini"           },
  4: { color: "#2E7D32", bg: "#F0FDF4", label: "Maîtrisé"         },
  5: { color: "#1565C0", bg: "#EFF6FF", label: "Optimisé"         },
};

export function ImpactCardList({
  impacts, setAction, total,
}: {
  impacts: ImpactCard[];
  setAction: (id: string, a: ImpactAction) => void;
  total: number;
}) {
  const [expanded,    setExpanded]    = useState<Record<string, boolean>>({});
  const [activeLevel, setActiveLevel] = useState<Record<string, number>>({});
  const [editing,     setEditing]     = useState<Record<string, boolean>>({});
  const [editDraft,   setEditDraft]   = useState<Record<string, Partial<ImpactCard> & { levelAnswers?: Record<number, { answer: string; recommandation: string }> }>>({});

  const toggleExpand = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const getLevel = (id: string) => activeLevel[id] ?? 1;

  const startEdit = (c: ImpactCard) => {
    const levelAnswers: Record<number, { answer: string; recommandation: string }> = {};
    c.suggestedAnswers?.forEach(a => { levelAnswers[a.level] = { answer: a.answer, recommandation: a.recommandation }; });
    setEditDraft(p => ({ ...p, [c.id]: {
      recommandation: c.recommandation ?? "",
      question: c.question ?? "",
      levelAnswers,
    }}));
    setEditing(p => ({ ...p, [c.id]: true }));
    setExpanded(p => ({ ...p, [c.id]: true }));
  };

  const cancelEdit = (id: string) => setEditing(p => ({ ...p, [id]: false }));

  const confirmEdit = (c: ImpactCard) => {
    const draft = editDraft[c.id];
    if (draft) {
      if (draft.recommandation !== undefined) c.recommandation = draft.recommandation;
      if (draft.question !== undefined && c.type === "mise à jour question") c.question = draft.question;
      if (draft.levelAnswers && c.suggestedAnswers) {
        c.suggestedAnswers = c.suggestedAnswers.map(a => ({
          ...a,
          answer: draft.levelAnswers![a.level]?.answer ?? a.answer,
          recommandation: draft.levelAnswers![a.level]?.recommandation ?? a.recommandation,
        }));
      }
    }
    setEditing(p => ({ ...p, [c.id]: false }));
    setAction(c.id, "modifié");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Impacts proposés</span>
          <span style={{ fontSize: 12, fontWeight: 400, color: "#9B9B9B", marginLeft: 6 }}>· {total} exigence{total !== 1 ? "s" : ""} détectée{total !== 1 ? "s" : ""}</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em" }}>À valider par l'expert</span>
      </div>

      {impacts.map((c) => {
        const actionColor = c.action === "accepté" ? "#2E7D32" : c.action === "rejeté" ? "#CC0000" : c.action === "modifié" ? "#E65100" : null;
        const isNQ       = c.type === "nouvelle question";
        const isMaj      = c.type === "mise à jour" || c.type === "mise à jour question";
        const isReg      = c.type === "réglementaire";
        const isOpen     = expanded[c.id] ?? false;
        const isEditing  = editing[c.id] ?? false;
        const draft      = editDraft[c.id] ?? {};
        const lvl        = getLevel(c.id);
        const activeLvl  = c.suggestedAnswers?.find(a => a.level === lvl);

        const typeMap = {
          "réglementaire":        { bg: "#F0F4FF", color: "#3730A3", label: "Réglementaire" },
          "mise à jour":          { bg: "#EEF2FF", color: "#3730A3", label: "Mise à jour recommandations" },
          "mise à jour question": { bg: "#EEF2FF", color: "#3730A3", label: "Mise à jour question" },
          "nouvelle question":    { bg: "#EEF2F7", color: "#2C4A6E", label: "Nouvelle question" },
          "recommandation":       { bg: "#FFF7ED", color: "#9A3412", label: "Recommandation" },
        };
        const typeCfg = typeMap[c.type];

        return (
          <div
            key={c.id}
            style={{
              backgroundColor: "#fff",
              borderRadius: 10,
              border: `1px solid ${actionColor ? `${actionColor}30` : "#E8E8E8"}`,
              boxShadow: actionColor ? `0 0 0 1px ${actionColor}18` : "0 1px 4px rgba(0,0,0,0.05)",
              overflow: "hidden",
              opacity: c.action === "rejeté" ? 0.55 : 1,
              transition: "all 0.2s",
            }}
          >
            {/* ── Top accent bar ── */}
            <div style={{ height: 3, backgroundColor: actionColor ?? "#E0E0E0" }} />

            {/* ── Header row ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px 12px", borderBottom: "1px solid #F2F2F2" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: typeCfg.color, backgroundColor: typeCfg.bg, padding: "3px 9px", borderRadius: 4, letterSpacing: "0.04em" }}>{typeCfg.label.toUpperCase()}</span>
              {actionColor && (
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: actionColor }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: actionColor }} />
                  {c.action === "accepté" ? "Accepté" : c.action === "rejeté" ? "Rejeté" : "À modifier"}
                </span>
              )}
            </div>

            {/* ── Exigence + Dimension (all types) ── */}
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #F2F2F2" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#C0C0C0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Exigence réglementaire</div>
              <p style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.65, margin: 0, fontWeight: 500 }}>{c.exigence}</p>
            </div>
            <div style={{ padding: "11px 18px", borderBottom: "1px solid #F2F2F2", display: "flex", gap: 24 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#C0C0C0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Dimension concernée</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#3A3A3A" }}>{c.dimension}</div>
              </div>
              <div style={{ borderLeft: "1px solid #F0F0F0", paddingLeft: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#C0C0C0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Référence</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", fontFamily: "monospace" }}>{c.element}</div>
              </div>
            </div>

            {/* ── Pure réglementaire body ── */}
            {isReg && c.recommandation && (
              <div style={{ padding: "20px 18px", borderBottom: "1px solid #F2F2F2" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#C0C0C0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Recommandation à qualifier</div>
                <div style={{ backgroundColor: "#fff", border: "1px solid #1A1A1A", borderRadius: 6, padding: "14px 16px", marginBottom: 14 }}>
                  <p style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.75, margin: 0 }}>{c.recommandation}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldCheck size={13} style={{ color: "#3730A3" }} />
                  <span style={{ fontSize: 11, color: "#3730A3", fontWeight: 500 }}>Cette recommandation doit être marquée comme exigence réglementaire dans le référentiel.</span>
                </div>
              </div>
            )}

            {/* ── Question amendment (mise à jour with oldQuestion) ── */}
            {isMaj && c.oldQuestion && c.question && (
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #F2F2F2" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Modifier question</div>
                <div style={{ backgroundColor: "#F7F7F7", borderRadius: 6, padding: "12px 14px", marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", letterSpacing: "0.06em", marginBottom: 5 }}>Texte en vigueur</div>
                  <p style={{ fontSize: 12, color: "#7A7A7A", lineHeight: 1.7, margin: 0 }}>{c.oldQuestion}</p>
                </div>
                <div style={{ backgroundColor: "#fff", border: `1.5px solid ${isEditing ? "#3730A3" : "#1A1A1A"}`, borderRadius: 6, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#1A1A1A", letterSpacing: "0.06em", marginBottom: 5 }}>Texte révisé</div>
                  {isEditing
                    ? <textarea value={draft.question ?? c.question ?? ""} onChange={e => setEditDraft(p => ({ ...p, [c.id]: { ...p[c.id], question: e.target.value } }))} style={{ width: "100%", fontSize: 12, color: "#1A1A1A", lineHeight: 1.7, border: "none", outline: "none", resize: "vertical", minHeight: 72, fontFamily: "inherit", padding: 0, backgroundColor: "transparent", boxSizing: "border-box" }} />
                    : <p style={{ fontSize: 12, color: "#1A1A1A", lineHeight: 1.7, margin: 0 }}>{c.question}</p>
                  }
                </div>
              </div>
            )}

            {/* ── Recommandation amendment (mise à jour / recommandation) ── */}
            {(isMaj || c.type === "recommandation") && c.recommandation && (() => {
              const isUpdate = isMaj && !!c.oldRecommandation;
              return (
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #F2F2F2" }}>
                  {isUpdate ? (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Modifier recommandation</div>
                      <div style={{ backgroundColor: "#F7F7F7", borderRadius: 6, padding: "12px 14px", marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", letterSpacing: "0.06em", marginBottom: 5 }}>Texte en vigueur</div>
                        <p style={{ fontSize: 12, color: "#7A7A7A", lineHeight: 1.7, margin: 0 }}>{c.oldRecommandation}</p>
                      </div>
                      <div style={{ backgroundColor: "#fff", border: `1.5px solid ${isEditing ? "#3730A3" : "#1A1A1A"}`, borderRadius: 6, padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#1A1A1A", letterSpacing: "0.06em", marginBottom: 5 }}>Texte révisé</div>
                        {isEditing
                          ? <textarea value={draft.recommandation ?? c.recommandation ?? ""} onChange={e => setEditDraft(p => ({ ...p, [c.id]: { ...p[c.id], recommandation: e.target.value } }))} style={{ width: "100%", fontSize: 12, color: "#1A1A1A", lineHeight: 1.7, border: "none", outline: "none", resize: "vertical", minHeight: 72, fontFamily: "inherit", padding: 0, backgroundColor: "transparent", boxSizing: "border-box" }} />
                          : <p style={{ fontSize: 12, color: "#1A1A1A", lineHeight: 1.7, margin: 0 }}>{c.recommandation}</p>
                        }
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Recommandation</div>
                      <div style={{ backgroundColor: "#fff", border: `1.5px solid ${isEditing ? "#3730A3" : "#1A1A1A"}`, borderRadius: 6, padding: "12px 14px" }}>
                        {isEditing
                          ? <textarea value={draft.recommandation ?? c.recommandation ?? ""} onChange={e => setEditDraft(p => ({ ...p, [c.id]: { ...p[c.id], recommandation: e.target.value } }))} style={{ width: "100%", fontSize: 12, color: "#1A1A1A", lineHeight: 1.7, border: "none", outline: "none", resize: "vertical", minHeight: 72, fontFamily: "inherit", padding: 0, backgroundColor: "transparent", boxSizing: "border-box" }} />
                          : <p style={{ fontSize: 12, color: "#1A1A1A", lineHeight: 1.7, margin: 0 }}>{c.recommandation}</p>
                        }
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* ── Question proposée (nouvelle question only) ── */}
            {isNQ && c.question && (
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #F2F2F2" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Question proposée au référentiel</div>
                <div style={{ backgroundColor: "#fff", border: "1px solid #1A1A1A", borderRadius: 6, padding: "12px 14px" }}>
                  <p style={{ fontSize: 13, fontWeight: 400, color: "#1A1A1A", lineHeight: 1.7, margin: 0 }}>{c.question}</p>
                </div>
              </div>
            )}

            {/* ── Niveaux de maturité (nouvelle question only) ── */}
            {isNQ && c.suggestedAnswers && (
              <div style={{ borderBottom: "1px solid #F2F2F2" }}>
                {/* Expand toggle */}
                <button
                  onClick={() => toggleExpand(c.id)}
                  className="no-outline"
                  style={{ width: "100%", padding: "11px 18px", display: "flex", alignItems: "center", gap: 10, background: isOpen ? "#FAFAFA" : "none", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {isOpen
                      ? <ChevronDown size={11} style={{ color: "#fff" }} />
                      : <ChevronRight size={11} style={{ color: "#fff" }} />}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>Réponses suggérées par niveau de maturité</span>
                  <span style={{ fontSize: 11, color: "#9B9B9B", marginLeft: 4 }}>5 niveaux définis</span>
                </button>

                {isOpen && (
                  <div style={{ backgroundColor: "#FAFAFA", padding: "0 18px 16px" }}>
                    {/* Level tabs */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                      {c.suggestedAnswers.map(a => {
                        const lc = LEVEL_COLORS[a.level];
                        const isActive = lvl === a.level;
                        return (
                          <button
                            key={a.level}
                            onClick={() => setActiveLevel(p => ({ ...p, [c.id]: a.level }))}
                            className="no-outline"
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 20, border: `1.5px solid ${isActive ? lc.color : "#E0E0E0"}`, backgroundColor: "#fff", cursor: "pointer", transition: "all 0.12s" }}
                          >
                            <span style={{ fontSize: 11, fontWeight: 800, color: lc.color }}>{a.level}</span>
                            <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 400, color: isActive ? lc.color : "#9B9B9B" }}>{a.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active level content */}
                    {activeLvl && (
                      <div style={{ display: "grid", gridTemplateColumns: activeLvl.recommandation ? "1fr 1fr" : "1fr", gap: 10 }}>
                        {/* Answer */}
                        <div style={{ backgroundColor: "#fff", border: `1px solid ${isEditing ? "#3730A3" : `${LEVEL_COLORS[lvl].color}22`}`, borderLeft: `3px solid ${LEVEL_COLORS[lvl].color}`, borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: LEVEL_COLORS[lvl].color }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: LEVEL_COLORS[lvl].color, textTransform: "uppercase", letterSpacing: "0.08em" }}>Réponse type — Niveau {lvl}</span>
                          </div>
                          {isEditing
                            ? <textarea value={draft.levelAnswers?.[lvl]?.answer ?? activeLvl.answer} onChange={e => setEditDraft(p => ({ ...p, [c.id]: { ...p[c.id], levelAnswers: { ...p[c.id]?.levelAnswers, [lvl]: { answer: e.target.value, recommandation: p[c.id]?.levelAnswers?.[lvl]?.recommandation ?? activeLvl.recommandation } } } }))} style={{ width: "100%", fontSize: 12, color: "#3A3A3A", lineHeight: 1.6, border: "none", outline: "none", resize: "vertical", minHeight: 60, fontFamily: "inherit", padding: 0, backgroundColor: "transparent", boxSizing: "border-box" }} />
                            : <p style={{ fontSize: 12, color: "#3A3A3A", lineHeight: 1.6, margin: 0 }}>{activeLvl.answer}</p>
                          }
                        </div>
                        {/* Recommendation — only when present */}
                        {activeLvl.recommandation && (
                          <div style={{ backgroundColor: "#fff", border: `1px solid ${isEditing ? "#3730A3" : "#E8E8E8"}`, borderLeft: "3px solid #FFE600", borderRadius: 8, padding: "12px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                              <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#1A1A1A" }} />
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#1A1A1A", textTransform: "uppercase", letterSpacing: "0.08em" }}>Recommandation associée</span>
                            </div>
                            {isEditing
                              ? <textarea value={draft.levelAnswers?.[lvl]?.recommandation ?? activeLvl.recommandation} onChange={e => setEditDraft(p => ({ ...p, [c.id]: { ...p[c.id], levelAnswers: { ...p[c.id]?.levelAnswers, [lvl]: { answer: p[c.id]?.levelAnswers?.[lvl]?.answer ?? activeLvl.answer, recommandation: e.target.value } } } }))} style={{ width: "100%", fontSize: 12, color: "#3A3A3A", lineHeight: 1.6, border: "none", outline: "none", resize: "vertical", minHeight: 60, fontFamily: "inherit", padding: 0, backgroundColor: "transparent", boxSizing: "border-box" }} />
                              : <p style={{ fontSize: 12, color: "#3A3A3A", lineHeight: 1.6, margin: 0 }}>{activeLvl.recommandation}</p>
                            }
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Action footer ── */}
            <div style={{ padding: "11px 18px", backgroundColor: c.action ? "#FAFAFA" : "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              {c.action === "accepté" || c.action === "rejeté" ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: actionColor! }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: actionColor! }}>
                      {isReg
                        ? c.action === "accepté" ? "Marquée comme réglementaire — sera intégrée au référentiel" : "Non qualifiée comme réglementaire"
                        : c.action === "accepté" ? "Acceptée — sera intégrée au référentiel" : "Rejetée — non intégrée"
                      }
                    </span>
                  </div>
                  <button
                    onClick={() => setAction(c.id, null)}
                    style={{ fontSize: 11, fontWeight: 600, color: "#9B9B9B", background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, padding: "5px 12px", cursor: "pointer", flexShrink: 0 }}
                  >
                    Annuler
                  </button>
                </>
              ) : c.action === "modifié" ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: actionColor! }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: actionColor! }}>Modifié — en attente de validation finale</span>
                  </div>
                  <div style={{ display: "flex", gap: 7 }}>
                    <button onClick={() => setAction(c.id, null)} style={{ fontSize: 11, fontWeight: 600, color: "#9B9B9B", background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, padding: "5px 12px", cursor: "pointer" }}>Annuler</button>
                    {[
                      { label: "Accepter", color: "#2E7D32", icon: Check,   onClick: () => setAction(c.id, "accepté") },
                      { label: "Rejeter",  color: "#CC0000", icon: XCircle, onClick: () => setAction(c.id, "rejeté")  },
                    ].map(btn => (
                      <button key={btn.label} onClick={btn.onClick}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1.5px solid ${btn.color}30`, backgroundColor: `${btn.color}0A`, color: btn.color, cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = btn.color; b.style.color = "#fff"; b.style.borderColor = btn.color; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = `${btn.color}0A`; b.style.color = btn.color; b.style.borderColor = `${btn.color}30`; }}
                      >
                        <btn.icon size={12} />{btn.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : isEditing ? (
                <>
                  <span style={{ fontSize: 11, color: "#3730A3", fontWeight: 500 }}>Mode édition — modifiez les champs ci-dessus</span>
                  <div style={{ display: "flex", gap: 7 }}>
                    <button onClick={() => cancelEdit(c.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1.5px solid #E0E0E0", backgroundColor: "#fff", color: "#4A4A4A", cursor: "pointer" }}>
                      <X size={12} /> Annuler
                    </button>
                    <button onClick={() => confirmEdit(c)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>
                      <Check size={12} /> Confirmer
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: "#C0C0C0" }}>En attente de décision</span>
                  <div style={{ display: "flex", gap: 7 }}>
                    {([
                      { label: "Accepter", action: "accepté" as ImpactAction, color: "#2E7D32", icon: Check,   onClick: () => setAction(c.id, "accepté") },
                      ...(!isReg ? [{ label: "Modifier", action: "modifié" as ImpactAction, color: "#E65100", icon: Edit2, onClick: () => startEdit(c) }] : []),
                      { label: "Rejeter",  action: "rejeté"  as ImpactAction, color: "#CC0000", icon: XCircle, onClick: () => setAction(c.id, "rejeté") },
                    ] as { label: string; action: ImpactAction; color: string; icon: any; onClick: () => void }[]).map(btn => (
                      <button
                        key={btn.label}
                        onClick={btn.onClick}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1.5px solid ${btn.color}30`, backgroundColor: `${btn.color}0A`, color: btn.color, cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = btn.color; b.style.color = "#fff"; b.style.borderColor = btn.color; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = `${btn.color}0A`; b.style.color = btn.color; b.style.borderColor = `${btn.color}30`; }}
                      >
                        <btn.icon size={12} />{btn.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface ImpactsProposesProps {
  /**
   * Replace this value with the impacts returned by your backend.
   * When omitted, the Figma demonstration data is displayed.
   */
  initialImpacts?: ImpactCard[];
}

/**
 * Standalone section extracted from VeilleReglementaire.tsx.
 * It contains only the “Impacts proposés” heading and its validation cards.
 */
export default function ImpactsProposes({
  initialImpacts = impactCardsData,
}: ImpactsProposesProps) {
  const [impacts, setImpacts] = useState<ImpactCard[]>(initialImpacts);

  const setAction = (id: string, action: ImpactAction) => {
    setImpacts((current) =>
      current.map((impact) =>
        impact.id === id ? { ...impact, action } : impact,
      ),
    );
  };

  return (
    <section
      style={{
        width: "100%",
        padding: "24px",
        boxSizing: "border-box",
        backgroundColor: "#F2F2F2",
      }}
    >
      <ImpactCardList
        impacts={impacts}
        setAction={setAction}
        total={impacts.length}
      />
    </section>
  );
}
