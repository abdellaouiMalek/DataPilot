import { useState } from "react";
import {
  Search, Plus, X, ChevronDown, MoreHorizontal,
  Edit2, Trash2, Copy, Eye, Power,
  RotateCcw, Info, ChevronLeft, ChevronRight,
  CheckCircle, Shield, TrendingUp, FileText, BookOpen,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Criticite  = "Faible" | "Moyenne" | "Élevée" | "Critique";
type TypeReco   = "Réglementaire" | "Amélioration";
type StatutReco = "Actif" | "Brouillon" | "Désactivé";

interface Recommendation {
  id: number;
  code: string;
  titre: string;
  description: string;
  dimension: string;
  sousDimension: string;
  question: string;
  niveauxDeclencheurs: number[];
  criticite: Criticite;
  impact: number;
  effort: number;
  complexite: number;
  risque: number;
  priorite: number;
  type: TypeReco;
  statut: StatutReco;
  reglementaire: boolean;
  referentiel?: string;
  circulaire?: string;
  article?: string;
}

// ── Référentiel ───────────────────────────────────────────────────────────────

const DIMENSIONS = [
  "Gouvernance des données",
  "Architecture & Infrastructure",
  "Qualité des données",
  "Gestion des métadonnées",
  "Sécurité & Conformité",
];

const SOUS_DIMENSIONS: Record<string, string[]> = {
  "Gouvernance des données":      ["Stratégie data", "Organisation & Responsabilités", "Politique de données"],
  "Architecture & Infrastructure":["Data Warehouse", "Intégration des données", "Plateformes analytiques"],
  "Qualité des données":          ["Profiling & Mesure", "Nettoyage & Remédiation", "Monitoring continu"],
  "Gestion des métadonnées":      ["Catalogue de données", "Lineage", "Glossaire métier"],
  "Sécurité & Conformité":        ["Contrôle d'accès", "Chiffrement", "Conformité RGPD"],
};

const QUESTIONS: Record<string, string[]> = {
  "Stratégie data":                ["La banque dispose-t-elle d'une stratégie data documentée ?", "La stratégie est-elle alignée avec les objectifs métiers ?"],
  "Organisation & Responsabilités":["Existe-t-il une fonction Data identifiée ?", "Les rôles et responsabilités data sont-ils formalisés ?"],
  "Politique de données":          ["Une politique de données est-elle formalisée ?", "La politique est-elle approuvée par la direction ?"],
  "Data Warehouse":                ["Disposez-vous d'un entrepôt de données centralisé ?", "Le DWH couvre-t-il l'ensemble des périmètres métiers ?"],
  "Intégration des données":       ["Les processus d'intégration sont-ils documentés ?", "Vos processus d'intégration sont-ils automatisés ?"],
  "Plateformes analytiques":       ["Utilisez-vous une plateforme analytique unifiée ?", "Les outils BI sont-ils connectés aux sources de données ?"],
  "Profiling & Mesure":            ["Avez-vous un processus de contrôle de qualité des données ?", "Des métriques de qualité sont-elles définies ?"],
  "Nettoyage & Remédiation":       ["Des processus de remédiation automatisés existent-ils ?", "Le cycle de vie de la remédiation est-il suivi ?"],
  "Monitoring continu":            ["La qualité des données est-elle monitorée en continu ?", "Des alertes automatiques sont-elles déclenchées ?"],
  "Catalogue de données":          ["Disposez-vous d'un catalogue de données ?", "Le catalogue est-il mis à jour régulièrement ?"],
  "Lineage":                       ["Le lineage des données est-il tracé ?", "Le lineage couvre-t-il les données critiques ?"],
  "Glossaire métier":              ["Un glossaire métier est-il disponible ?", "Le glossaire est-il utilisé dans les projets ?"],
  "Contrôle d'accès":              ["Gérez-vous les accès aux données selon les rôles ?", "Les accès sont-ils revus périodiquement ?"],
  "Chiffrement":                   ["Les données sensibles sont-elles chiffrées ?", "Le chiffrement est-il appliqué en transit et au repos ?"],
  "Conformité RGPD":               ["Les données personnelles sont-elles inventoriées ?", "Les durées de conservation sont-elles respectées ?"],
};

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK: Recommendation[] = [
  {
    id: 1, code: "REC-GOV-001", titre: "Mettre en place un Data Office",
    description: "Créer une structure organisationnelle dédiée à la gouvernance des données avec un Chief Data Officer et des Data Stewards.",
    dimension: "Gouvernance des données", sousDimension: "Organisation & Responsabilités",
    question: "Existe-t-il une fonction Data identifiée ?",
    niveauxDeclencheurs: [1, 2], criticite: "Critique", impact: 5, effort: 4, complexite: 4, risque: 5, priorite: 1,
    type: "Réglementaire", statut: "Actif", reglementaire: true, referentiel: "BCT", circulaire: "Circulaire BCT 2021-06", article: "Art. 12",
  },
  {
    id: 2, code: "REC-GOV-002", titre: "Définir une charte de gouvernance",
    description: "Élaborer et formaliser une politique de gouvernance des données approuvée par le Conseil d'Administration.",
    dimension: "Gouvernance des données", sousDimension: "Politique de données",
    question: "Une politique de données est-elle formalisée ?",
    niveauxDeclencheurs: [1, 2, 3], criticite: "Élevée", impact: 4, effort: 3, complexite: 3, risque: 4, priorite: 2,
    type: "Réglementaire", statut: "Actif", reglementaire: true, referentiel: "BCBS 239", circulaire: "BCBS 239, Principe 1", article: "§ 3.1",
  },
  {
    id: 3, code: "REC-ARCH-001", titre: "Implémenter un Data Warehouse centralisé",
    description: "Déployer une architecture centralisée de stockage et de traitement des données pour tous les périmètres métiers.",
    dimension: "Architecture & Infrastructure", sousDimension: "Data Warehouse",
    question: "Disposez-vous d'un entrepôt de données centralisé ?",
    niveauxDeclencheurs: [1, 2], criticite: "Élevée", impact: 5, effort: 5, complexite: 5, risque: 3, priorite: 3,
    type: "Amélioration", statut: "Actif", reglementaire: false,
  },
  {
    id: 4, code: "REC-QUAL-001", titre: "Déployer un outil de Data Quality Management",
    description: "Mettre en place un outil automatisé de mesure, de profilage et de remédiation de la qualité des données.",
    dimension: "Qualité des données", sousDimension: "Profiling & Mesure",
    question: "Avez-vous un processus de contrôle de qualité des données ?",
    niveauxDeclencheurs: [1, 2, 3], criticite: "Élevée", impact: 4, effort: 4, complexite: 4, risque: 3, priorite: 2,
    type: "Amélioration", statut: "Actif", reglementaire: false,
  },
  {
    id: 5, code: "REC-META-001", titre: "Construire un catalogue de données",
    description: "Développer un référentiel centralisé de métadonnées techniques et métiers accessible à toutes les équipes.",
    dimension: "Gestion des métadonnées", sousDimension: "Catalogue de données",
    question: "Disposez-vous d'un catalogue de données ?",
    niveauxDeclencheurs: [1, 2], criticite: "Moyenne", impact: 3, effort: 3, complexite: 3, risque: 2, priorite: 3,
    type: "Amélioration", statut: "Actif", reglementaire: false,
  },
  {
    id: 6, code: "REC-SEC-001", titre: "Politique de contrôle d'accès RBAC",
    description: "Définir et appliquer des règles d'accès basées sur les rôles pour toutes les données sensibles de la banque.",
    dimension: "Sécurité & Conformité", sousDimension: "Contrôle d'accès",
    question: "Gérez-vous les accès aux données selon les rôles ?",
    niveauxDeclencheurs: [1, 2], criticite: "Critique", impact: 5, effort: 3, complexite: 3, risque: 5, priorite: 1,
    type: "Réglementaire", statut: "Actif", reglementaire: true, referentiel: "BCT", circulaire: "Circulaire BCT 2019-02", article: "Art. 7",
  },
  {
    id: 7, code: "REC-GOV-003", titre: "Programme de formation data",
    description: "Mettre en place un programme de formation continue sur la gouvernance et la qualité des données.",
    dimension: "Gouvernance des données", sousDimension: "Stratégie data",
    question: "La banque dispose-t-elle d'une stratégie data documentée ?",
    niveauxDeclencheurs: [2, 3], criticite: "Faible", impact: 2, effort: 2, complexite: 2, risque: 1, priorite: 4,
    type: "Amélioration", statut: "Brouillon", reglementaire: false,
  },
  {
    id: 8, code: "REC-ARCH-002", titre: "Automatiser les pipelines ETL",
    description: "Remplacer les processus manuels d'ETL par des pipelines automatisés avec monitoring et alerting intégrés.",
    dimension: "Architecture & Infrastructure", sousDimension: "Intégration des données",
    question: "Les processus d'intégration sont-ils documentés ?",
    niveauxDeclencheurs: [1, 2, 3], criticite: "Moyenne", impact: 4, effort: 4, complexite: 3, risque: 2, priorite: 3,
    type: "Amélioration", statut: "Désactivé", reglementaire: false,
  },
  {
    id: 9, code: "REC-SEC-002", titre: "Chiffrement des données sensibles au repos",
    description: "Mettre en œuvre le chiffrement AES-256 pour toutes les données sensibles stockées dans les systèmes de la banque.",
    dimension: "Sécurité & Conformité", sousDimension: "Chiffrement",
    question: "Les données sensibles sont-elles chiffrées ?",
    niveauxDeclencheurs: [1, 2], criticite: "Critique", impact: 5, effort: 3, complexite: 3, risque: 5, priorite: 1,
    type: "Réglementaire", statut: "Actif", reglementaire: true, referentiel: "BCT", circulaire: "Circulaire BCT 2022-01", article: "Art. 15",
  },
  {
    id: 10, code: "REC-QUAL-002", titre: "Monitoring continu de la qualité",
    description: "Déployer un système de monitoring automatique avec alertes en temps réel sur les KPIs de qualité des données.",
    dimension: "Qualité des données", sousDimension: "Monitoring continu",
    question: "La qualité des données est-elle monitorée en continu ?",
    niveauxDeclencheurs: [1, 2, 3], criticite: "Moyenne", impact: 4, effort: 3, complexite: 3, risque: 3, priorite: 2,
    type: "Amélioration", statut: "Brouillon", reglementaire: false,
  },
];

// ── Wizard initial state ───────────────────────────────────────────────────────

function makeInitialWizard(nextId: number) {
  return {
    code: `REC-NEW-${String(nextId).padStart(3, "0")}`,
    titre: "", description: "", objectif: "", statut: "Brouillon" as StatutReco,
    dimension: "", sousDimension: "", question: "",
    niveauxDeclencheurs: [] as number[],
    type: "Amélioration" as TypeReco,
    criticite: "Moyenne" as Criticite,
    impact: 3, effort: 3, complexite: 3, risque: 3, priorite: 3,
    reglementaire: false, referentiel: "BCT", circulaire: "", article: "", commentaireReg: "",
    actions: [""], responsable: "", duree: "",
    horizon: "Moyen terme" as "Court terme" | "Moyen terme" | "Long terme",
    livrables: [""], indicateurs: [""], prerequis: [""],
  };
}
type WizardData = ReturnType<typeof makeInitialWizard>;

// ── Badge components ──────────────────────────────────────────────────────────

function CriticiteBadge({ value }: { value: Criticite }) {
  const cfg: Record<Criticite, string> = {
    "Faible":   "#2E7D32",
    "Moyenne":  "#A16207",
    "Élevée":   "#B91C1C",
    "Critique": "#7F1D1D",
  };
  const color = cfg[value];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
      {value}
    </span>
  );
}

function StatutBadge({ value }: { value: StatutReco }) {
  const cfg: Record<StatutReco, string> = {
    "Actif":     "#2E7D32",
    "Brouillon": "#6B6B6B",
    "Désactivé": "#9B9B9B",
  };
  const color = cfg[value];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
      {value}
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

function ScoreDots({ value }: { value: number }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: i <= value ? "#1A1A1A" : "#E0E0E0" }} />
      ))}
    </div>
  );
}

function MiniScore({ label, value, color = "#1A1A1A" }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#C0C0C0", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: i <= value ? color : "#EBEBEB" }} />
        ))}
        <span style={{ fontSize: 9, fontWeight: 700, color: "#ABABAB", marginLeft: 3 }}>{value}</span>
      </div>
    </div>
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

function FSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...INP, padding: "8px 30px 8px 12px", appearance: "none", cursor: "pointer", color: value ? "#1A1A1A" : "#9B9B9B" }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9B9B", pointerEvents: "none" }} />
    </div>
  );
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          backgroundColor: "#1A1A1A", color: "#fff", borderRadius: 6, padding: "6px 10px",
          fontSize: 11, lineHeight: 1.5, zIndex: 2000, boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          maxWidth: 220, whiteSpace: "normal", width: "max-content",
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

function ScoreSelector({ label, value, onChange, tooltip }: { label: string; value: number; onChange: (v: number) => void; tooltip?: string }) {
  return (
    <div>
      <label style={{ ...LBL, display: "flex", alignItems: "center", gap: 5 }}>
        {label}
        {tooltip && <Tooltip text={tooltip}><Info size={12} style={{ color: "#9B9B9B", cursor: "help" }} /></Tooltip>}
      </label>
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange(n)} style={{
            width: 36, height: 36, borderRadius: 6,
            border: value === n ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.13)",
            backgroundColor: value === n ? "#1A1A1A" : "#fff",
            color: value === n ? "#FFE600" : "#6B6B6B",
            fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all 0.15s",
          }}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function DynamicList({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div>
      <label style={LBL}>{label}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            <input value={item} onChange={e => { const n = [...items]; n[i] = e.target.value; onChange(n); }} placeholder={placeholder} style={{ ...INP, flex: 1 }} />
            {items.length > 1 && (
              <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ width: 32, height: 36, borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#CC0000", flexShrink: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        <button onClick={() => onChange([...items, ""])} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: "1px dashed rgba(0,0,0,0.2)", backgroundColor: "transparent", fontSize: 12, fontWeight: 500, color: "#6B6B6B", cursor: "pointer", alignSelf: "flex-start" }}>
          <Plus size={12} /> Ajouter
        </button>
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, topColor }: { label: string; value: number; sub: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; topColor: string }) {
  return (
    <div
      style={{ flex: 1, minWidth: 0, backgroundColor: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", padding: "18px 18px 14px", borderTop: `3px solid ${topColor}`, position: "relative", overflow: "hidden", transition: "box-shadow 0.15s, transform 0.12s", cursor: "default", outline: "none" }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; el.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = "0 1px 6px rgba(0,0,0,0.05)"; el.style.transform = "translateY(0)"; }}
    >
      <div style={{ position: "absolute", top: 14, right: 14, opacity: 0.05 }}><Icon size={52} style={{ color: "#1A1A1A" }} /></div>
      <div style={{ fontSize: 11, color: "#9B9B9B", fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 10, fontSize: 11, color: "#9B9B9B" }}>{sub}</div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ["Informations générales", "Rattachement", "Classification", "Mise en œuvre", "Vérification"];

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

// ── Wizard drawer ─────────────────────────────────────────────────────────────

function WizardDrawer({ onClose, onSave, nextId, initialData }: { onClose: () => void; onSave: (d: WizardData, activate: boolean) => void; nextId: number; initialData?: Partial<WizardData> }) {
  const [step, setStep] = useState(1);
  const [d, setD] = useState<WizardData>({ ...makeInitialWizard(nextId), ...initialData });
  const set = (patch: Partial<WizardData>) => setD(prev => ({ ...prev, ...patch }));

  const availableSousDims = d.dimension ? (SOUS_DIMENSIONS[d.dimension] || []) : [];
  const availableQuestions = d.sousDimension ? (QUESTIONS[d.sousDimension] || []) : [];

  const renderStep = () => {
    switch (step) {
      // ── Step 1 ──
      case 1: return (
        <div style={ROW}>
          <div>
            <label style={LBL}>Code de la recommandation</label>
            <div style={{ ...INP, backgroundColor: "#F7F7F7", color: "#9B9B9B", display: "flex", alignItems: "center", gap: 8 }}>
              {d.code}
              <span style={{ fontSize: 10, backgroundColor: "#E5E5E5", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>Auto-généré</span>
            </div>
          </div>
          <div>
            <label style={LBL}>Titre *</label>
            <input value={d.titre} onChange={e => set({ titre: e.target.value })} placeholder="ex. Mettre en place un Data Office" style={INP} />
          </div>
          <div>
            <label style={LBL}>Description détaillée *</label>
            <textarea value={d.description} onChange={e => set({ description: e.target.value })} placeholder="Décrivez précisément la recommandation..." style={{ ...TA, minHeight: 100 }} />
          </div>
          <div>
            <label style={LBL}>Objectif / Justification</label>
            <textarea value={d.objectif} onChange={e => set({ objectif: e.target.value })} placeholder="Pourquoi cette recommandation est-elle importante ?" style={TA} />
          </div>
          <div>
            <label style={LBL}>Statut initial</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["Brouillon", "Actif"] as StatutReco[]).map(s => (
                <button key={s} onClick={() => set({ statut: s })} style={{ padding: "7px 18px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: d.statut === s ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.13)", backgroundColor: d.statut === s ? "#1A1A1A" : "#fff", color: d.statut === s ? "#FFE600" : "#6B6B6B", transition: "all 0.15s" }}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      );

      // ── Step 2 ──
      case 2: return (
        <div style={ROW}>
          <div>
            <label style={LBL}>Dimension *</label>
            <FSelect value={d.dimension} onChange={v => set({ dimension: v, sousDimension: "", question: "" })} options={DIMENSIONS} placeholder="Sélectionner une dimension..." />
          </div>
          {d.dimension && (
            <div>
              <label style={LBL}>Sous-dimension *</label>
              <FSelect value={d.sousDimension} onChange={v => set({ sousDimension: v, question: "" })} options={availableSousDims} placeholder="Sélectionner une sous-dimension..." />
            </div>
          )}
          {d.sousDimension && (
            <div>
              <label style={LBL}>Question associée</label>
              <FSelect value={d.question} onChange={v => set({ question: v })} options={availableQuestions} placeholder="Sélectionner une question..." />
            </div>
          )}
          <div>
            <label style={{ ...LBL, marginBottom: 10 }}>Niveaux déclencheurs *</label>
            <div style={{ backgroundColor: "#F7F7F7", borderRadius: 8, padding: 16, border: "1px solid rgba(0,0,0,0.06)" }}>
              <p style={{ fontSize: 12, color: "#6B6B6B", marginBottom: 12, lineHeight: 1.6, margin: "0 0 12px" }}>
                Sélectionnez les niveaux de maturité pour lesquels cette recommandation sera proposée. Un niveau 1 ou 2 correspond aux stades les moins matures.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3, 4, 5].map(n => {
                  const active = d.niveauxDeclencheurs.includes(n);
                  return (
                    <button key={n} onClick={() => { const next = active ? d.niveauxDeclencheurs.filter(x => x !== n) : [...d.niveauxDeclencheurs, n].sort((a, b) => a - b); set({ niveauxDeclencheurs: next }); }} style={{ width: 44, height: 44, borderRadius: 8, border: active ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.13)", backgroundColor: active ? "#1A1A1A" : "#fff", color: active ? "#FFE600" : "#6B6B6B", fontSize: 15, fontWeight: 800, cursor: "pointer", transition: "all 0.15s" }}>{n}</button>
                  );
                })}
              </div>
              {d.niveauxDeclencheurs.length > 0 && (
                <p style={{ fontSize: 11, color: "#2E7D32", marginTop: 10, margin: "10px 0 0", fontWeight: 600 }}>✓ Sélectionnés : {d.niveauxDeclencheurs.join(", ")}</p>
              )}
            </div>
          </div>
        </div>
      );

      // ── Step 3 ──
      case 3: return (
        <div style={ROW}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={LBL}>Type *</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(["Réglementaire", "Amélioration"] as TypeReco[]).map(t => (
                  <button key={t} onClick={() => set({ type: t })} style={{ padding: "9px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", border: d.type === t ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.13)", backgroundColor: d.type === t ? "#1A1A1A" : "#fff", color: d.type === t ? "#FFE600" : "#6B6B6B", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 7 }}>
                    {t === "Réglementaire" ? <Shield size={13} /> : <TrendingUp size={13} />} {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={LBL}>Criticité *</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(["Faible", "Moyenne", "Élevée", "Critique"] as Criticite[]).map(c => {
                  const cols: Record<Criticite, [string, string]> = { "Faible": ["#E8F5E9", "#2E7D32"], "Moyenne": ["#FFF8E1", "#E65100"], "Élevée": ["#FFF3E0", "#BF360C"], "Critique": ["#FFEBEE", "#B71C1C"] };
                  const [bg, color] = cols[c];
                  const active = d.criticite === c;
                  return (
                    <button key={c} onClick={() => set({ criticite: c })} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", border: active ? `2px solid ${color}` : "1px solid rgba(0,0,0,0.10)", backgroundColor: active ? bg : "#fff", color: active ? color : "#6B6B6B", transition: "all 0.15s" }}>{c}</button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <ScoreSelector label="Impact attendu" value={d.impact} onChange={v => set({ impact: v })} tooltip="Amélioration potentielle de la maturité data si la recommandation est appliquée. 5 = transformation majeure." />
            <ScoreSelector label="Effort requis" value={d.effort} onChange={v => set({ effort: v })} tooltip="Charge de travail et ressources nécessaires à la mise en œuvre. 5 = effort très élevé." />
            <ScoreSelector label="Complexité" value={d.complexite} onChange={v => set({ complexite: v })} tooltip="Complexité technique et organisationnelle. 5 = mise en œuvre très complexe." />
            <ScoreSelector label="Risque de non-conformité" value={d.risque} onChange={v => set({ risque: v })} tooltip="Risque réglementaire ou opérationnel si la recommandation n'est pas appliquée. 5 = critique." />
          </div>

          <div>
            <label style={LBL}>Priorité par défaut</label>
            <FSelect value={String(d.priorite)} onChange={v => set({ priorite: Number(v) })} options={["1", "2", "3", "4", "5"]} />
          </div>

          <div>
            <label style={LBL}>Nature réglementaire</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ v: true, l: "Oui, Exigence réglementaire" }, { v: false, l: "Non, Bonne pratique" }].map(({ v, l }) => (
                <button key={String(v)} onClick={() => set({ reglementaire: v })} style={{ padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: d.reglementaire === v ? "2px solid #3730A3" : "1px solid rgba(0,0,0,0.13)", backgroundColor: d.reglementaire === v ? "#EEF2FF" : "#fff", color: d.reglementaire === v ? "#3730A3" : "#6B6B6B", transition: "all 0.15s" }}>{l}</button>
              ))}
            </div>
          </div>

          {d.reglementaire && (
            <div style={{ backgroundColor: "#F5F7FF", borderRadius: 8, padding: 16, border: "1px solid #C7D2FE", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#3730A3", display: "flex", alignItems: "center", gap: 6 }}><Shield size={13} /> Informations réglementaires</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LBL}>Référentiel</label>
                  <FSelect value={d.referentiel} onChange={v => set({ referentiel: v })} options={["BCT", "BCBS 239", "Autre"]} />
                </div>
                <div>
                  <label style={LBL}>Référence circulaire / texte</label>
                  <input value={d.circulaire} onChange={e => set({ circulaire: e.target.value })} placeholder="ex. Circulaire BCT 2021-06" style={INP} />
                </div>
              </div>
              <div>
                <label style={LBL}>Article / Section</label>
                <input value={d.article} onChange={e => set({ article: e.target.value })} placeholder="ex. Art. 12, § 3.1" style={INP} />
              </div>
              <div>
                <label style={LBL}>Commentaire / Lien réglementaire</label>
                <textarea value={d.commentaireReg} onChange={e => set({ commentaireReg: e.target.value })} placeholder="Précisions sur l'exigence réglementaire..." style={TA} />
              </div>
            </div>
          )}
        </div>
      );

      // ── Step 4 ──
      case 4: return (
        <div style={ROW}>
          <DynamicList label="Actions principales à réaliser *" items={d.actions} onChange={v => set({ actions: v })} placeholder="Décrire une action concrète à mettre en œuvre..." />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={LBL}>Responsable recommandé</label><input value={d.responsable} onChange={e => set({ responsable: e.target.value })} placeholder="ex. Chief Data Officer" style={INP} /></div>
            <div><label style={LBL}>Durée estimée</label><input value={d.duree} onChange={e => set({ duree: e.target.value })} placeholder="ex. 3-6 mois" style={INP} /></div>
          </div>
          <div>
            <label style={LBL}>Horizon de mise en œuvre</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["Court terme", "Moyen terme", "Long terme"] as const).map(h => (
                <button key={h} onClick={() => set({ horizon: h })} style={{ padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: d.horizon === h ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.13)", backgroundColor: d.horizon === h ? "#1A1A1A" : "#fff", color: d.horizon === h ? "#FFE600" : "#6B6B6B", transition: "all 0.15s" }}>{h}</button>
              ))}
            </div>
          </div>
          <DynamicList label="Livrables attendus" items={d.livrables} onChange={v => set({ livrables: v })} placeholder="ex. Charte de gouvernance validée" />
          <DynamicList label="Indicateurs de succès" items={d.indicateurs} onChange={v => set({ indicateurs: v })} placeholder="ex. Taux de couverture des métadonnées > 80 %" />
          <DynamicList label="Prérequis" items={d.prerequis} onChange={v => set({ prerequis: v })} placeholder="ex. Engagement de la direction générale" />
        </div>
      );

      // ── Step 5, Summary ──
      case 5: return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Preview card */}
          <div style={{ backgroundColor: "#F7F7F7", borderRadius: 10, padding: 16, border: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Aperçu, tel qu'affiché dans les résultats</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: "#9B9B9B", fontWeight: 700, marginBottom: 2, fontFamily: "monospace" }}>{d.code}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{d.titre || "-"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <CriticiteBadge value={d.criticite} />
                <StatutBadge value={d.statut} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#4A4A4A", lineHeight: 1.6, margin: 0 }}>{d.description || "Aucune description renseignée."}</p>
            {d.dimension && (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <TypeBadge value={d.type} />
                {d.niveauxDeclencheurs.map(n => <span key={n} style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: "#1A1A1A", color: "#FFE600", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>)}
              </div>
            )}
          </div>

          {[
            { title: "Rattachement au référentiel", rows: [["Dimension", d.dimension || "-"], ["Sous-dimension", d.sousDimension || "-"], ["Question", d.question || "-"], ["Niveaux déclencheurs", d.niveauxDeclencheurs.length ? d.niveauxDeclencheurs.join(", ") : "-"]] },
            { title: "Classification & Scoring", rows: [["Type", d.type], ["Criticité", d.criticite], ["Impact", `${d.impact}/5`], ["Effort", `${d.effort}/5`], ["Complexité", `${d.complexite}/5`], ["Risque", `${d.risque}/5`], ["Réglementaire", d.reglementaire ? "Oui" : "Non"], ...(d.reglementaire ? [["Référentiel", d.referentiel || "-"], ["Circulaire", d.circulaire || "-"], ["Article", d.article || "-"]] : [])] },
            { title: "Mise en œuvre", rows: [["Responsable", d.responsable || "-"], ["Durée", d.duree || "-"], ["Horizon", d.horizon], ["Actions", `${d.actions.filter(Boolean).length} action(s)`], ["Livrables", `${d.livrables.filter(Boolean).length} livrable(s)`], ["Indicateurs", `${d.indicateurs.filter(Boolean).length} indicateur(s)`]] },
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
  };

  const BtnPrimary = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>{children}</button>
  );
  const BtnSecondary = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.13)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>{children}</button>
  );

  return (
    <>
      <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 500 }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 501, width: 740, maxWidth: "92vw", backgroundColor: "#fff", display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.18)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1A1A1A" }}>Nouvelle recommandation</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>Étape {step} sur {STEPS.length} - {STEPS[step - 1]}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4 }}><X size={18} /></button>
        </div>
        {/* Step bar */}
        <div style={{ padding: "20px 24px 0", flexShrink: 0 }}><StepIndicator current={step} /></div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>{renderStep()}</div>
        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, backgroundColor: "#FAFAFA" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.13)", backgroundColor: "#fff", cursor: "pointer", color: "#6B6B6B" }}>Annuler</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 1 && <BtnSecondary onClick={() => setStep(s => s - 1)}><ChevronLeft size={14} /> Retour</BtnSecondary>}
            <BtnSecondary onClick={() => onSave(d, false)}><FileText size={13} /> Enregistrer brouillon</BtnSecondary>
            {step < STEPS.length
              ? <BtnPrimary onClick={() => setStep(s => s + 1)}>Suivant <ChevronRight size={14} /></BtnPrimary>
              : <button onClick={() => onSave(d, true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#FFE600", color: "#1A1A1A", cursor: "pointer" }}><CheckCircle size={14} /> Enregistrer et activer</button>
            }
          </div>
        </div>
      </div>
    </>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ rec, onClose, onEdit }: { rec: Recommendation; onClose: () => void; onEdit: (rec: Recommendation) => void }) {
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

  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
      <span style={{ fontSize: 11, color: "#9B9B9B", width: 80, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", gap: 3 }}>
        {[1,2,3,4,5].map(i => <div key={i} style={{ width: 22, height: 6, borderRadius: 3, backgroundColor: i <= value ? "#1A1A1A" : "#EBEBEB" }} />)}
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>{value}<span style={{ color: "#C0C0C0", fontWeight: 400 }}>/5</span></span>
    </div>
  );

  return (
    <>
      <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.28)", zIndex: 500 }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 580, maxWidth: "90vw", zIndex: 501, backgroundColor: "#fff", boxShadow: "-6px 0 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #EBEBEB", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 10, color: "#A0A0A0", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.04em", display: "block", marginBottom: 5 }}>{rec.code}</span>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A", margin: "0 0 12px", lineHeight: 1.35 }}>{rec.titre}</h2>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <CriticiteBadge value={rec.criticite} />
                <span style={{ color: "#D8D8D8" }}>·</span>
                <TypeBadge value={rec.type} />
                <span style={{ color: "#D8D8D8" }}>·</span>
                <StatutBadge value={rec.statut} />
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4, flexShrink: 0 }}><X size={18} /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 28px", display: "flex", flexDirection: "column", gap: 22 }}>

          <Section title="Description">
            <p style={{ fontSize: 13, color: "#3A3A3A", lineHeight: 1.75, margin: 0 }}>{rec.description || "-"}</p>
          </Section>

          <Section title="Rattachement au référentiel">
            <div>
              <GridRow label="Dimension" value={rec.dimension} />
              <GridRow label="Sous-dimension" value={rec.sousDimension} />
              <GridRow label="Question" value={rec.question} />
              <GridRow label="Niveaux déclencheurs" value={rec.niveauxDeclencheurs.length ? rec.niveauxDeclencheurs.map(n => `Niveau ${n}`).join(" · ") : "-"} />
            </div>
          </Section>

          <Section title="Scoring">
            <ScoreBar label="Impact" value={rec.impact} />
            <ScoreBar label="Effort" value={rec.effort} />
            <ScoreBar label="Complexité" value={rec.complexite} />
            <ScoreBar label="Risque" value={rec.risque} />
          </Section>

          {rec.reglementaire && (
            <Section title="Référence réglementaire">
              <div style={{ backgroundColor: "#F5F7FF", border: "1px solid #DBEAFE", borderRadius: 6, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["Référentiel", rec.referentiel],
                  ["Circulaire / Texte", rec.circulaire],
                  ["Article / Section", rec.article],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#1E3A8A", width: 130, flexShrink: 0 }}>{k}</span>
                    <span style={{ fontSize: 11, color: "#3A3A3A" }}>{v}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 28px", borderTop: "1px solid #EBEBEB", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 5, fontSize: 13, fontWeight: 500, border: "1px solid #E5E5E5", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Fermer</button>
          <button onClick={() => { onClose(); onEdit(rec); }} style={{ padding: "8px 18px", borderRadius: 5, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#fff", cursor: "pointer" }}>Modifier</button>
        </div>
      </div>
    </>
  );
}

// ── CSS injected once for hover states (avoids JS inline style sticky-hover bug) ─

const RC_STYLES = `
  /* ── Bouton Consulter ── */
  .rc-btn-consult {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 11px; border-radius: 5px; font-size: 12px; font-weight: 600;
    border: 1px solid #E0E0E0; background: #fff; color: #1A1A1A;
    cursor: pointer; white-space: nowrap; transition: background 0.15s, color 0.15s, border-color 0.15s;
    font-family: inherit; outline: none;
  }
  .rc-btn-consult:hover { background: #1A1A1A; color: #fff; border-color: #1A1A1A; }
  .rc-btn-consult:focus { outline: 2px solid #FFE600 !important; outline-offset: 2px !important; }

  /* ── Bouton ⋮ ── */
  .rc-btn-more {
    width: 26px; height: 26px; border-radius: 4px;
    border: 1px solid #E5E5E5; background: transparent;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    color: #B0B0B0; transition: background 0.15s, color 0.15s, border-color 0.15s;
    font-family: inherit; outline: none;
  }
  .rc-btn-more:hover { background: #1A1A1A; color: #fff; border-color: #1A1A1A; }
  .rc-btn-more:focus { outline: 2px solid #FFE600 !important; outline-offset: 2px !important; }

  /* ── Items du menu dropdown ── */
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

  /* ── Filter chips, outline jaune global neutralisé ── */
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
  const [recs, setRecs] = useState<Recommendation[]>(MOCK);
  const [search, setSearch] = useState("");
  const [fDim, setFDim] = useState("");
  const [fCrit, setFCrit] = useState("");
  const [fType, setFType] = useState("");
  const [fStat, setFStat] = useState("");
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editRec, setEditRec] = useState<Recommendation | null>(null);
  const [focusSearch, setFocusSearch] = useState(false);
  const [viewRec, setViewRec] = useState<Recommendation | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const filtered = recs.filter(r => {
    const q = search.toLowerCase();
    return (
      (!q || r.code.toLowerCase().includes(q) || r.titre.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)) &&
      (!fDim  || r.dimension  === fDim)  &&
      (!fCrit || r.criticite  === fCrit) &&
      (!fType || r.type       === fType) &&
      (!fStat || r.statut     === fStat)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const reset = () => { setSearch(""); setFDim(""); setFCrit(""); setFType(""); setFStat(""); setPage(1); };

  const handleUpdate = (d: WizardData, activate: boolean) => {
    if (!editRec) return;
    setRecs(p => p.map(r => r.id === editRec.id ? {
      ...r, code: d.code, titre: d.titre || "Sans titre", description: d.description,
      dimension: d.dimension, sousDimension: d.sousDimension, question: d.question,
      niveauxDeclencheurs: d.niveauxDeclencheurs, criticite: d.criticite,
      impact: d.impact, effort: d.effort, complexite: d.complexite, risque: d.risque,
      priorite: d.priorite, type: d.type, statut: activate ? "Actif" : r.statut,
      reglementaire: d.reglementaire, referentiel: d.referentiel,
      circulaire: d.circulaire, article: d.article,
    } : r));
    setEditRec(null);
  };

  const handleToggleStatut = (id: number) => {
    setRecs(p => p.map(r => r.id === id ? { ...r, statut: r.statut === "Actif" ? "Désactivé" : "Actif" } : r));
    setOpenMenu(null);
  };

  const handleDuplicate = (rec: Recommendation) => {
    const newId = Math.max(...recs.map(r => r.id)) + 1;
    setRecs(p => [...p, { ...rec, id: newId, code: rec.code + "-COPY", titre: rec.titre + " (copie)", statut: "Brouillon" }]);
    setOpenMenu(null);
  };

  const handleDelete = (id: number) => {
    setRecs(p => p.filter(r => r.id !== id));
    setOpenMenu(null);
  };

  const handleSave = (d: WizardData, activate: boolean) => {
    const newRec: Recommendation = {
      id: recs.length + 1, code: d.code, titre: d.titre || "Sans titre",
      description: d.description, dimension: d.dimension, sousDimension: d.sousDimension,
      question: d.question, niveauxDeclencheurs: d.niveauxDeclencheurs,
      criticite: d.criticite, impact: d.impact, effort: d.effort, complexite: d.complexite,
      risque: d.risque, priorite: d.priorite, type: d.type,
      statut: activate ? "Actif" : "Brouillon", reglementaire: d.reglementaire,
      referentiel: d.referentiel, circulaire: d.circulaire, article: d.article,
    };
    setRecs(p => [...p, newRec]);
    setShowWizard(false);
  };

  const kpis = [
    { label: "Total recommandations", value: recs.length,                                        sub: "Référentiel global",              icon: BookOpen,    topColor: "#FFE600" },
    { label: "Actives",               value: recs.filter(r => r.statut === "Actif").length,      sub: "Disponibles pour les banques",    icon: CheckCircle, topColor: "#FFE600" },
    { label: "Réglementaires",        value: recs.filter(r => r.reglementaire).length,           sub: "Exigences BCT / BCBS",            icon: Shield,      topColor: "#FFE600" },
    { label: "Brouillons",            value: recs.filter(r => r.statut === "Brouillon").length,  sub: "En cours de rédaction",           icon: FileText,    topColor: "#FFE600" },
  ];

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>
      <RCStyleInjector />

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9B9B9B" }}>Super Admin EY</span>
            <span style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: "#C0C0C0", display: "inline-block" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#FFE600", backgroundColor: "#1A1A1A", borderRadius: 4, padding: "1px 7px", letterSpacing: "0.04em" }}>Accès restreint</span>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>Catalogue des recommandations</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0", fontWeight: 400 }}>Référentiel global utilisé par le moteur d'analyse EY DataMaturity</p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.18)", transition: "background 0.18s, box-shadow 0.18s, transform 0.12s" }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#2D2D2D"; b.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.transform = "translateY(0)"; }}
        >
          <Plus size={15} /> Ajouter une recommandation
        </button>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
        {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>

      {/* ── Filters ── */}
      <div style={{ backgroundColor: "#fff", border: "1px solid #E8E8E8", borderRadius: 10, marginBottom: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        {/* Search row */}
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

        {/* Divider + filter chips row */}
        <div style={{ padding: "10px 16px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: "1px solid #F0F0F0", marginTop: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#C0C0C0", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 4, flexShrink: 0 }}>Filtres</span>

          {[
            { value: fDim,  setter: setFDim,  opts: DIMENSIONS,                              ph: "Dimension" },
            { value: fCrit, setter: setFCrit, opts: ["Faible","Moyenne","Élevée","Critique"], ph: "Criticité" },
            { value: fType, setter: setFType, opts: ["Réglementaire","Amélioration"],         ph: "Type"      },
            { value: fStat, setter: setFStat, opts: ["Actif","Brouillon","Désactivé"],        ph: "Statut"    },
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

          {(fDim || fCrit || fType || fStat || search) && (
            <button
              onClick={reset}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: "1px solid #E0E0E0", backgroundColor: "#fff", cursor: "pointer", color: "#9B9B9B", marginLeft: "auto", transition: "all 0.15s" }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "#CC2200"; b.style.borderColor = "#CC2200"; }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = "#9B9B9B"; b.style.borderColor = "#E0E0E0"; }}
            >
              <RotateCcw size={11} /> Réinitialiser
            </button>
          )}

          <span style={{ fontSize: 12, color: "#ABABAB", marginLeft: (fDim || fCrit || fType || fStat || search) ? 0 : "auto" }}>
            <strong style={{ color: "#1A1A1A", fontWeight: 700 }}>{filtered.length}</strong> résultat{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ backgroundColor: "#fff", border: "1px solid #E8E8E8", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 130 }} /><col style={{ width: 90 }} /><col style={{ width: 130 }} /></colgroup>

          <thead>
            <tr style={{ backgroundColor: "#F7F7F7", borderBottom: "1px solid #E8E8E8" }}>
              {[
                { label: "Recommandation", align: "left"  },
                { label: "Criticité",      align: "left"  },
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
                {/* Recommandation */}
                <td style={{ padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#ABABAB", fontFamily: "monospace", letterSpacing: "0.04em", flexShrink: 0 }}>{rec.code}</span>
                    {rec.reglementaire && rec.referentiel && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#1E3A8A", backgroundColor: "#EFF6FF", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>{rec.referentiel}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rec.titre}
                  </div>
                  <div style={{ fontSize: 11, color: "#ABABAB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rec.dimension} <span style={{ color: "#E0E0E0" }}>·</span> {rec.sousDimension}
                  </div>
                </td>

                {/* Criticité */}
                <td style={{ padding: "14px" }}>
                  <CriticiteBadge value={rec.criticite} />
                </td>

                {/* Type */}
                <td style={{ padding: "14px" }}>
                  <TypeBadge value={rec.type} />
                </td>

                {/* Statut */}
                <td style={{ padding: "14px" }}>
                  <StatutBadge value={rec.statut} />
                </td>

                {/* Actions */}
                <td style={{ padding: "14px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      className="rc-btn-consult"
                      onClick={() => setViewRec(rec)}
                    >
                      <Eye size={11} /> Consulter
                    </button>
                    <div style={{ position: "relative" }}>
                      <button
                        className="rc-btn-more"
                        onClick={() => setOpenMenu(openMenu === rec.id ? null : rec.id)}
                      >
                        <MoreHorizontal size={13} />
                      </button>
                      {openMenu === rec.id && (
                        <>
                          {/* backdrop */}
                          <div onClick={() => setOpenMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
                          <div style={{ position: "absolute", right: 0, top: 30, zIndex: 200, backgroundColor: "#fff", border: "1px solid #E8E8E8", borderRadius: 6, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", minWidth: 172, overflow: "hidden" }}>
                            <button className="rc-menu-item" onClick={() => { setEditRec(rec); setOpenMenu(null); }}>
                              <Edit2 size={12} /> Modifier
                            </button>
                            <button className="rc-menu-item" style={{ borderTop: "1px solid #F2F2F2" }} onClick={() => handleDuplicate(rec)}>
                              <Copy size={12} /> Dupliquer
                            </button>
                            <button
                              className={rec.statut === "Actif" ? "rc-menu-item rc-menu-warn" : "rc-menu-item"}
                              style={{ borderTop: "1px solid #F2F2F2" }}
                              onClick={() => handleToggleStatut(rec.id)}
                            >
                              <Power size={12} /> {rec.statut === "Actif" ? "Désactiver" : "Activer"}
                            </button>
                            <button className="rc-menu-item rc-menu-danger" style={{ borderTop: "1px solid #F2F2F2" }} onClick={() => handleDelete(rec.id)}>
                              <Trash2 size={12} /> Supprimer
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{ padding: "56px 20px", textAlign: "center" }}>
            <BookOpen size={28} style={{ color: "#D8D8D8", marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#4A4A4A" }}>Aucune recommandation trouvée</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>Modifiez vos filtres ou ajoutez une nouvelle recommandation.</div>
          </div>
        )}

        {/* Pagination */}
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

      {/* Click-outside overlay for menus */}
      {openMenu !== null && <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setOpenMenu(null)} />}

      {/* Detail panel */}
      {viewRec && <DetailPanel rec={viewRec} onClose={() => setViewRec(null)} onEdit={(r) => { setViewRec(null); setEditRec(r); }} />}

      {/* Wizard, création */}
      {showWizard && <WizardDrawer onClose={() => setShowWizard(false)} onSave={handleSave} nextId={recs.length + 1} />}

      {/* Wizard, édition */}
      {editRec && (
        <WizardDrawer
          onClose={() => setEditRec(null)}
          onSave={handleUpdate}
          nextId={editRec.id}
          initialData={{
            code: editRec.code, titre: editRec.titre, description: editRec.description,
            dimension: editRec.dimension, sousDimension: editRec.sousDimension,
            question: editRec.question, niveauxDeclencheurs: editRec.niveauxDeclencheurs,
            criticite: editRec.criticite, impact: editRec.impact, effort: editRec.effort,
            complexite: editRec.complexite, risque: editRec.risque, priorite: editRec.priorite,
            type: editRec.type, reglementaire: editRec.reglementaire,
            referentiel: editRec.referentiel as "BCT" | "BÂLE III" | "IFRS 9" | undefined,
            circulaire: editRec.circulaire, article: editRec.article,
          }}
        />
      )}
    </div>
  );
}
