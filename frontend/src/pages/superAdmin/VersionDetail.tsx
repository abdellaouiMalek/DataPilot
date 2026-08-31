import { useState } from "react";
import {
  ArrowLeft, ChevronDown, ChevronRight,
  FileQuestion, RefreshCw, BookOpen, ShieldCheck, AlertCircle,
  Calendar, User, FileText, CheckCircle2,
} from "lucide-react";
import { versionSnapshots, type VersionChange, type ChangeType } from "../shared/versionChanges";

interface Props {
  versionId: string;
  versionNumber: string;
  versionName: string;
  onBack: () => void;
}

const LEVEL_COLORS: Record<number, string> = {
  1: "#CC0000", 2: "#E65100", 3: "#B45309", 4: "#2E7D32", 5: "#1565C0",
};

const TYPE_META: Record<ChangeType, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  "nouvelle question":          { label: "Nouvelle question",      color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE", icon: <FileQuestion size={11} /> },
  "mise à jour question":       { label: "Màj question",           color: "#6D28D9", bg: "#F5F3FF", border: "#DDD6FE", icon: <RefreshCw    size={11} /> },
  "mise à jour recommandation": { label: "Màj recommandation",     color: "#166534", bg: "#F0FDF4", border: "#BBF7D0", icon: <BookOpen     size={11} /> },
  "réglementaire":              { label: "Exigence réglementaire", color: "#9A3412", bg: "#FFF7ED", border: "#FED7AA", icon: <ShieldCheck  size={11} /> },
  // ── Types ajoutés (absents de la maquette d'origine, qui n'en couvrait
  // que 4 sur les 7 combinaisons réelles -- voir shared/versionChanges.ts) :
  // même langage visuel, sans toucher aux 4 entrées ci-dessus.
  "nouvelle recommandation":    { label: "Nouvelle recommandation", color: "#0F766E", bg: "#F0FDFA", border: "#99F6E4", icon: <BookOpen     size={11} /> },
  "désactivation question":     { label: "Désactivation question",  color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA", icon: <AlertCircle  size={11} /> },
  "désactivation recommandation": { label: "Désactivation recommandation", color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA", icon: <AlertCircle size={11} /> },
};

// ── Expanded panels ───────────────────────────────────────────────────────────

function SourceChip({ element, sourceRef }: { element: string; sourceRef?: string }) {
  if (!sourceRef) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
      <span style={{ fontSize: 11, fontFamily: "monospace", color: "#9B9B9B", backgroundColor: "#F2F2F2", padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>{element}</span>
      <span style={{ fontSize: 11, color: "#ABABAB" }}>·</span>
      <span style={{ fontSize: 11, color: "#9B9B9B" }}>{sourceRef}</span>
    </div>
  );
}

function NouvelleQuestionDetail({ c }: { c: VersionChange }) {
  const [lvl, setLvl] = useState(1);
  const active = c.suggestedAnswers?.find(a => a.level === lvl);
  return (
    <div style={{ padding: "14px 20px 16px 64px", backgroundColor: "#F8FAFF", borderTop: "1px solid #E8EFFF" }}>
      {/* Question text */}
      <p style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", lineHeight: 1.65, margin: "0 0 12px", padding: "10px 14px", backgroundColor: "#fff", border: "1px solid #DBEAFE", borderLeft: "3px solid #1D4ED8", borderRadius: 6 }}>
        {c.question}
      </p>

      {/* Level tabs + answer */}
      {c.suggestedAnswers && (
        <>
          <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
            {c.suggestedAnswers.map(a => (
              <button key={a.level} className="no-outline" onClick={() => setLvl(a.level)}
                style={{ padding: "3px 11px", borderRadius: 20, fontSize: 11, fontWeight: lvl === a.level ? 700 : 400, border: `1.5px solid ${lvl === a.level ? LEVEL_COLORS[a.level] : "#E8E8E8"}`, backgroundColor: lvl === a.level ? `${LEVEL_COLORS[a.level]}10` : "#fff", color: lvl === a.level ? LEVEL_COLORS[a.level] : "#ABABAB", cursor: "pointer", transition: "all 0.1s" }}>
                N{a.level} · {a.label}
              </button>
            ))}
          </div>
          {active && (
            <div style={{ display: "grid", gridTemplateColumns: active.recommandation ? "1fr 1fr" : "1fr", gap: 10 }}>
              <div style={{ backgroundColor: "#fff", borderLeft: `3px solid ${LEVEL_COLORS[lvl]}`, border: `1px solid ${LEVEL_COLORS[lvl]}25`, borderRadius: 6, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Réponse attendue — N{lvl}</div>
                <p style={{ fontSize: 12, color: "#3A3A3A", lineHeight: 1.6, margin: 0 }}>{active.answer}</p>
              </div>
              {active.recommandation && (
                <div style={{ backgroundColor: "#fff", border: "1px solid #EBEBEB", borderLeft: "3px solid #1A1A1A", borderRadius: 6, padding: "10px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Recommandation</div>
                  <p style={{ fontSize: 12, color: "#3A3A3A", lineHeight: 1.6, margin: 0 }}>{active.recommandation}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <SourceChip element={c.element} sourceRef={c.sourceRef} />
    </div>
  );
}

function MiseAJourQuestionDetail({ c }: { c: VersionChange }) {
  return (
    <div style={{ padding: "14px 20px 16px 64px", backgroundColor: "#FAFAFA", borderTop: "1px solid #F0F0F0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ backgroundColor: "#F7F7F7", borderRadius: 6, padding: "10px 14px", borderLeft: "2px solid #D0D0D0" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#BABABA", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Avant</div>
          <p style={{ fontSize: 12, color: "#6B6B6B", lineHeight: 1.65, margin: 0 }}>{c.oldQuestion}</p>
        </div>
        <div style={{ backgroundColor: "#fff", borderRadius: 6, padding: "10px 14px", border: "1px solid #E8E8E8", borderLeft: "2px solid #1A1A1A" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Après</div>
          <p style={{ fontSize: 12, color: "#1A1A1A", lineHeight: 1.65, margin: 0 }}>{c.newQuestion}</p>
        </div>
      </div>
      <SourceChip element={c.element} sourceRef={c.sourceRef} />
    </div>
  );
}

function MiseAJourRecommandationDetail({ c }: { c: VersionChange }) {
  return (
    <div style={{ padding: "14px 20px 16px 64px", backgroundColor: "#FAFAFA", borderTop: "1px solid #F0F0F0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ backgroundColor: "#F7F7F7", borderRadius: 6, padding: "10px 14px", borderLeft: "2px solid #D0D0D0" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#BABABA", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Avant</div>
          <p style={{ fontSize: 12, color: "#6B6B6B", lineHeight: 1.65, margin: 0 }}>{c.oldRecommandation}</p>
        </div>
        <div style={{ backgroundColor: "#fff", borderRadius: 6, padding: "10px 14px", border: "1px solid #E8E8E8", borderLeft: "2px solid #166534" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#ABABAB", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Après</div>
          <p style={{ fontSize: 12, color: "#1A1A1A", lineHeight: 1.65, margin: 0 }}>{c.newRecommandation}</p>
        </div>
      </div>
      <SourceChip element={c.element} sourceRef={c.sourceRef} />
    </div>
  );
}

function ReglementaireDetail({ c }: { c: VersionChange }) {
  return (
    <div style={{ padding: "14px 20px 16px 64px", backgroundColor: "#FFFBF7", borderTop: "1px solid #FEE2C8" }}>
      <p style={{ fontSize: 12, color: "#1A1A1A", lineHeight: 1.7, margin: "0 0 10px", padding: "10px 14px", backgroundColor: "#fff", border: "1px solid #FED7AA", borderLeft: "3px solid #9A3412", borderRadius: 6 }}>
        {c.recommandation}
      </p>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", backgroundColor: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 5, fontSize: 11, color: "#9A3412", fontWeight: 600 }}>
        <ShieldCheck size={12} />
        Réf. BCT : <span style={{ fontFamily: "monospace" }}>{c.element}</span>
        {c.sourceRef && <><span style={{ color: "#FCA974", margin: "0 2px" }}>·</span>{c.sourceRef}</>}
      </div>
    </div>
  );
}

// ── Détails ajoutés (mêmes patterns visuels que les 4 ci-dessus,
// appliqués aux 3 combinaisons que la maquette d'origine ne couvrait pas
// -- voir la note sur TYPE_META) ────────────────────────────────────────

function NouvelleRecommandationDetail({ c }: { c: VersionChange }) {
  return (
    <div style={{ padding: "14px 20px 16px 64px", backgroundColor: "#F0FDFA", borderTop: "1px solid #CCFBF1" }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", lineHeight: 1.65, margin: "0 0 8px", padding: "10px 14px", backgroundColor: "#fff", border: "1px solid #99F6E4", borderLeft: "3px solid #0F766E", borderRadius: 6 }}>
        {c.newRecommandationTitle && <strong style={{ display: "block", marginBottom: 4 }}>{c.newRecommandationTitle}</strong>}
        {c.newRecommandation}
      </p>
      {c.attachedQuestion && (
        <div style={{ fontSize: 11, color: "#0F766E", marginBottom: 4 }}>Rattachée à : {c.attachedQuestion}</div>
      )}
      <SourceChip element={c.element} sourceRef={c.sourceRef} />
    </div>
  );
}

function DesactivationDetail({ c }: { c: VersionChange }) {
  return (
    <div style={{ padding: "14px 20px 16px 64px", backgroundColor: "#FEF2F2", borderTop: "1px solid #FECACA" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 6, padding: "10px 14px", border: "1px solid #FECACA", borderLeft: "2px solid #B91C1C", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#DC9A9A", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Désactivé</div>
        <p style={{ fontSize: 12, color: "#6B6B6B", lineHeight: 1.65, margin: 0, textDecoration: "line-through" }}>{c.disabledTitle}</p>
      </div>
      {c.justification && (
        <div style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 1.6 }}>
          <strong>Motif :</strong> {c.justification}
        </div>
      )}
      <SourceChip element={c.element} sourceRef={c.sourceRef} />
    </div>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function ChangeRow({ c, index, isLast }: { c: VersionChange; index: number; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = TYPE_META[c.type];
  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid #F3F3F3" }}>
      <button
        className="no-outline"
        onClick={() => setOpen(p => !p)}
        style={{
          width: "100%", padding: "11px 20px",
          display: "grid", gridTemplateColumns: "28px 160px 1fr 90px 20px",
          alignItems: "center", gap: 12,
          background: open ? "#FAFBFF" : "#fff", border: "none",
          cursor: "pointer", textAlign: "left", transition: "background 0.12s",
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.background = "#FAFAFA"; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
      >
        {/* Index */}
        <span style={{ fontSize: 11, fontWeight: 700, color: "#D4D4D4", fontFamily: "monospace" }}>
          {String(index).padStart(2, "0")}
        </span>

        {/* Type badge */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: meta.bg, color: meta.color, padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, letterSpacing: "0.03em", border: `1px solid ${meta.border}`, whiteSpace: "nowrap" }}>
          {meta.icon} {meta.label}
        </span>

        {/* Exigence + dimension */}
        <div style={{ overflow: "hidden", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.exigence}
          </div>
          <div style={{ fontSize: 11, color: "#ABABAB", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.dimension}
          </div>
        </div>

        {/* Ref */}
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#ABABAB", fontWeight: 600, backgroundColor: "#F5F5F5", padding: "2px 7px", borderRadius: 4, justifySelf: "end" }}>
          {c.element}
        </span>

        {/* Chevron */}
        <ChevronDown size={14} style={{ color: open ? "#1A1A1A" : "#D0D0D0", transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s, color 0.15s" }} />
      </button>

      {open && (
        <>
          {c.type === "nouvelle question"              && <NouvelleQuestionDetail         c={c} />}
          {c.type === "mise à jour question"           && <MiseAJourQuestionDetail        c={c} />}
          {c.type === "mise à jour recommandation"     && <MiseAJourRecommandationDetail  c={c} />}
          {c.type === "réglementaire"                  && <ReglementaireDetail            c={c} />}
          {c.type === "nouvelle recommandation"        && <NouvelleRecommandationDetail   c={c} />}
          {c.type === "désactivation question"         && <DesactivationDetail            c={c} />}
          {c.type === "désactivation recommandation"   && <DesactivationDetail            c={c} />}
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function VersionDetail({ versionId, versionNumber, versionName, onBack }: Props) {
  const snapshot = versionSnapshots[versionId];
  const [filter, setFilter] = useState<ChangeType | "all">("all");

  const counts = {
    "nouvelle question":          snapshot?.changes.filter(c => c.type === "nouvelle question").length          ?? 0,
    "mise à jour question":       snapshot?.changes.filter(c => c.type === "mise à jour question").length       ?? 0,
    "mise à jour recommandation": snapshot?.changes.filter(c => c.type === "mise à jour recommandation").length ?? 0,
    "réglementaire":              snapshot?.changes.filter(c => c.type === "réglementaire").length              ?? 0,
  };
  const total    = snapshot?.changes.length ?? 0;
  const filtered = snapshot?.changes.filter(c => filter === "all" || c.type === filter) ?? [];

  return (
    <div style={{ padding: "24px 28px 48px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* ── Breadcrumb ── */}
      <button onClick={onBack} className="no-outline"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "#9B9B9B", background: "none", border: "none", cursor: "pointer", padding: "0 0 18px", transition: "color 0.14s" }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#1A1A1A"}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#9B9B9B"}
      >
        <ArrowLeft size={13} />
        Versions du questionnaire
        <ChevronRight size={11} style={{ opacity: 0.4 }} />
        <span style={{ color: "#4A4A4A", fontWeight: 700, fontFamily: "monospace" }}>{versionNumber}</span>
      </button>

      {/* ── Header card ── */}
      <div style={{ borderRadius: 10, marginBottom: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.10)", border: "1px solid rgba(0,0,0,0.10)" }}>

        {/* Dark title band */}
        <div style={{ backgroundColor: "#1A1A1A", padding: "16px 22px", display: "flex", alignItems: "center", gap: 0 }}>
          {/* Left: version + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#FFE600", borderRadius: 6, padding: "5px 12px", flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#1A1A1A", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1 }}>Version</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: "#1A1A1A", fontFamily: "monospace", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{versionNumber}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {versionName}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Questionnaire de maturité data
              </div>
            </div>
          </div>

          {/* Right: metadata + status */}
          {snapshot && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {[
                { icon: <Calendar size={11} />, label: snapshot.publishedAt },
                { icon: <User size={11} />,     label: snapshot.publishedBy },
                { icon: <FileText size={11} />, label: snapshot.circulaireRef },
              ].map((m, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.55)", backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "4px 9px", fontWeight: 500 }}>
                  <span style={{ color: "rgba(255,255,255,0.3)" }}>{m.icon}</span>{m.label}
                </span>
              ))}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#2E7D32", backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 5, padding: "4px 10px", marginLeft: 4 }}>
                <CheckCircle2 size={11} /> Publié
              </span>
            </div>
          )}
        </div>

        {/* KPI stats row */}
        {snapshot && (() => {
          const tiles = [
            { type: null as ChangeType | null,                    icon: null,                       label: "Modifications",   sublabel: "au total",       n: total },
            { type: "nouvelle question"          as ChangeType,   icon: <FileQuestion size={13} />, label: "Nouvelles",       sublabel: "questions",      n: counts["nouvelle question"] },
            { type: "mise à jour question"       as ChangeType,   icon: <RefreshCw    size={13} />, label: "Questions",       sublabel: "révisées",       n: counts["mise à jour question"] },
            { type: "mise à jour recommandation" as ChangeType,   icon: <BookOpen     size={13} />, label: "Recommandations", sublabel: "mises à jour",   n: counts["mise à jour recommandation"] },
            { type: "réglementaire"              as ChangeType,   icon: <ShieldCheck  size={13} />, label: "Exigences",       sublabel: "réglementaires", n: counts["réglementaire"] },
          ];
          return (
            <div style={{ display: "flex", backgroundColor: "#fff" }}>
              {tiles.map((t, i) => {
                const isActive = t.type === null ? filter === "all" : filter === t.type;
                return (
                  <button key={i} className="no-outline"
                    onClick={() => setFilter(t.type === null ? "all" : t.type!)}
                    style={{
                      flex: 1, padding: "14px 16px 12px",
                      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
                      background: isActive ? "#FFFDF0" : "#fff",
                      border: "none", borderRight: i < tiles.length - 1 ? "1px solid #F0F0F0" : "none",
                      borderTop: `3px solid ${isActive ? "#FFE600" : "transparent"}`,
                      cursor: "pointer", transition: "all 0.13s",
                    }}
                    onMouseEnter={e => { if (!isActive) { const b = e.currentTarget as HTMLButtonElement; b.style.background = "#FAFAFA"; b.style.borderTopColor = "rgba(255,230,0,0.3)"; }}}
                    onMouseLeave={e => { if (!isActive) { const b = e.currentTarget as HTMLButtonElement; b.style.background = "#fff"; b.style.borderTopColor = "transparent"; }}}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                      <span style={{ fontSize: 26, fontWeight: 900, color: t.n > 0 ? "#1A1A1A" : "#D4D4D4", lineHeight: 1, letterSpacing: "-0.03em", fontFamily: "monospace" }}>
                        {t.n}
                      </span>
                      {t.icon && (
                        <span style={{ color: isActive ? "#9A8200" : "#D4D4D4", transition: "color 0.13s" }}>{t.icon}</span>
                      )}
                    </div>
                    <div style={{ lineHeight: 1.3 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#2A2A2A" }}>{t.label}</div>
                      <div style={{ fontSize: 10, color: "#ABABAB" }}>{t.sublabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── No snapshot ── */}
      {!snapshot && (
        <div style={{ backgroundColor: "#fff", border: "1px solid #EBEBEB", borderRadius: 10, padding: "40px 24px", textAlign: "center" }}>
          <AlertCircle size={26} style={{ color: "#C8C8C8", marginBottom: 10 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: "#4A4A4A", marginBottom: 4 }}>Aucune modification enregistrée</div>
          <div style={{ fontSize: 12, color: "#9B9B9B" }}>Les modifications apparaissent ici une fois la version publiée.</div>
        </div>
      )}

      {/* ── Changes ── */}
      {snapshot && (
        <>
          {/* ── Standalone filter bar (separate from the table) ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {([
                { key: "all" as const,                             label: "Toutes les modifications", count: total },
                { key: "nouvelle question"          as ChangeType, label: "Nouvelles questions",      count: counts["nouvelle question"] },
                { key: "mise à jour question"       as ChangeType, label: "Questions révisées",       count: counts["mise à jour question"] },
                { key: "mise à jour recommandation" as ChangeType, label: "Recommandations",          count: counts["mise à jour recommandation"] },
                { key: "réglementaire"              as ChangeType, label: "Réglementaire",            count: counts["réglementaire"] },
              ]).map(tab => {
                const isActive = filter === tab.key;
                return (
                  <button key={tab.key} className="no-outline" onClick={() => setFilter(tab.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: isActive ? 700 : 500,
                      border: `1px solid ${isActive ? "#1A1A1A" : "rgba(0,0,0,0.09)"}`,
                      backgroundColor: isActive ? "#1A1A1A" : "#fff",
                      color: isActive ? "#fff" : "#6B6B6B",
                      cursor: "pointer", transition: "all 0.12s",
                      boxShadow: isActive ? "0 1px 6px rgba(0,0,0,0.18)" : "none",
                    }}
                    onMouseEnter={e => { if (!isActive) { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#F0F0F0"; b.style.color = "#1A1A1A"; b.style.borderColor = "rgba(0,0,0,0.18)"; }}}
                    onMouseLeave={e => { if (!isActive) { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#6B6B6B"; b.style.borderColor = "rgba(0,0,0,0.09)"; }}}
                  >
                    {tab.label}
                    <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: isActive ? "rgba(255,255,255,0.18)" : "#EBEBEB", color: isActive ? "#fff" : "#9B9B9B", borderRadius: 9, padding: "1px 6px", lineHeight: 1.7 }}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 12, color: "#ABABAB" }}>
              {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ── Table card ── */}
          <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

            {/* Column header */}
            <div style={{ display: "grid", gridTemplateColumns: "28px 160px 1fr 90px 20px", gap: 12, padding: "8px 20px", backgroundColor: "#FAFAFA", borderBottom: "1px solid #F0F0F0" }}>
              {["N°", "Nature", "Exigence · Dimension", "Réf.", ""].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "#C8C8C8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</span>
              ))}
            </div>

            {filtered.length === 0
              ? <div style={{ padding: "32px", textAlign: "center", fontSize: 12, color: "#ABABAB" }}>Aucune modification dans cette catégorie.</div>
              : filtered.map((c, i) => <ChangeRow key={c.id} c={c} index={i + 1} isLast={i === filtered.length - 1} />)
            }
          </div>
        </>
      )}
    </div>
  );
}
