/**
 * Versions du questionnaire, the log of published snapshots.
 *
 * A version is created only by publishing from the framework page; this screen
 * records what was frozen, when, by whom, what changed, and how many
 * assessments were answered on it.
 *
 * Restaurer replays a version's snapshot onto the live dimensions/questions
 * tables and moves the "en ligne" flag to it. The version rows themselves are
 * never rewritten, so restoring back and forth is lossless and the log always
 * shows exactly what each publication contained. Only the label and the note
 * can be corrected afterwards; the snapshot and the computed changelog are the
 * record and stay immutable.
 *
 * A version that is obsolete but still referenced (assessments point at it) is
 * archived, not deleted, deletion is reserved for ones nothing depends on.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GitBranch, Loader2, ChevronDown, X, Eye, CheckCircle2, Archive, RotateCcw,
  Search, Download, FileJson, FileSpreadsheet, Pencil, Trash2, ArchiveRestore,
  MoreHorizontal, AlertTriangle, ClipboardList, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteVersion,
  getFrameworkState,
  getVersion,
  listVersions,
  restoreVersion,
  setVersionArchived,
  updateVersionMeta,
  type ChangelogEntry,
  type DraftInfo,
  type VersionDetail,
  type VersionSummary,
} from "@/lib/adminFramework";
import { useConfirm } from "@/hooks/useConfirm";
import { AdminLoader } from "@/components/AdminLoader";
import { useSeededSearch } from "@/hooks/useSeededSearch";
import type { ApiDimension, ApiQuestion } from "@/lib/admin";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue";
}

const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "-";

const countQuestions = (dimension: { sub_dimensions: { questions: unknown[] }[] }) =>
  dimension.sub_dimensions.reduce((total, sub) => total + sub.questions.length, 0);

const plural = (n: number, singular: string, suffix = "s") =>
  `${n} ${singular}${n > 1 ? suffix : ""}`;

const PER_PAGE = 5;

const EY_BLACK = "FF1A1A1A";
const EY_YELLOW = "FFFFE600";

type StatusFilter = "active" | "archived" | "all";
type SortKey = "recent" | "oldest" | "usage" | "questions";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Plus récentes",
  oldest: "Plus anciennes",
  usage: "Plus utilisées",
  questions: "Plus de questions",
};

/** Exactly one version is applied to the live tables at a time; an archived
 *  one is retired from service and can never also be live. */
function StatusBadge({ live, archived }: { live: boolean; archived: boolean }) {
  const cfg = live
    ? { bg: "#E8F5E9", color: "#2E7D32", text: "En ligne", Icon: CheckCircle2 }
    : archived
      ? { bg: "#FFF5F5", color: "#B23B3B", text: "Archivée", Icon: Archive }
      : { bg: "#F5F5F5", color: "#6B6B6B", text: "Hors ligne", Icon: Archive };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: cfg.bg, color: cfg.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      <cfg.Icon size={10} /> {cfg.text}
    </span>
  );
}

/** One-line digest of a version's changelog, for the table's second row. */
function summarize(version: VersionSummary): string {
  if (version.note) return version.note;
  if (version.changelog.length === 0) return "Version initiale du questionnaire";

  const counts = version.changelog.reduce(
    (acc, entry) => {
      const action = entry.kind.split(".")[1] ?? "updated";
      acc[action] = (acc[action] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const parts: string[] = [];
  if (counts.added) parts.push(`${counts.added} ajout${counts.added > 1 ? "s" : ""}`);
  if (counts.updated) parts.push(`${counts.updated} modification${counts.updated > 1 ? "s" : ""}`);
  if (counts.removed) parts.push(`${counts.removed} retrait${counts.removed > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

const CHANGE_KINDS: Record<string, { text: string; bg: string; color: string }> = {
  added:   { text: "Ajout",   bg: "#E8F5E9", color: "#2E7D32" },
  updated: { text: "Modif.",  bg: "#FFF8E1", color: "#B45309" },
  removed: { text: "Retrait", bg: "#FFEBEE", color: "#CC0000" },
};

function ChangeRow({ entry }: { entry: ChangelogEntry }) {
  const action = entry.kind.split(".")[1] ?? "updated";
  const cfg = CHANGE_KINDS[action] ?? CHANGE_KINDS.updated;
  const scope = entry.kind.startsWith("dimension")
    ? "Dim."
    : entry.kind.startsWith("subdimension")
      ? "Sous-dim."
      : "Question";
  return (
    <div style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
      <span style={{ flexShrink: 0, alignSelf: "flex-start", backgroundColor: cfg.bg, color: cfg.color, borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
        {scope} · {cfg.text}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#1A1A1A" }}>{entry.label}</div>
        {entry.details.map((detail, i) => (
          <div key={i} style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>{detail}</div>
        ))}
      </div>
    </div>
  );
}

// ── Exports ──────────────────────────────────────────────────────────────────

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** The answer scale a question carried, flattened for a spreadsheet cell. */
function answersText(question: ApiQuestion): string {
  const scale = question.level_responses?.length
    ? question.level_responses.map((r, i) => `${i + 1}. ${r.label} (${r.score})`)
    : question.choice_options?.length
      ? question.choice_options.map(o => `${o.label} (${o.score})`)
      : [];
  return scale.join("\n");
}

/** The frozen questionnaire, one row per question, the format a reviewer or
 *  an auditor can actually read outside the app. */
async function exportSnapshotXlsx(version: VersionDetail) {
  // Lazy-loaded so exceljs (~1 MB) is only fetched when an export happens.
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Questionnaire v${version.number}`);

  ws.columns = [
    { width: 26 }, { width: 9 }, { width: 24 }, { width: 5 }, { width: 60 },
    { width: 40 }, { width: 16 }, { width: 8 }, { width: 12 }, { width: 11 }, { width: 46 },
  ];

  ws.mergeCells("A1:K1");
  const title = ws.getCell("A1");
  title.value = `DataPilot · Questionnaire v${version.number}${version.label ? `: ${version.label}` : ""}`;
  title.font = { bold: true, size: 15, color: { argb: EY_YELLOW } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EY_BLACK } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells("A2:K2");
  const sub = ws.getCell("A2");
  sub.value =
    `Figé le ${dateTime(version.created_at)}` +
    `${version.created_by_name ? ` par ${version.created_by_name}` : ""}` +
    `, ${version.dimension_count} dimensions · ${version.question_count} questions`;
  sub.font = { size: 10, color: { argb: "FF6B6B6B" } };

  const header = ws.getRow(3);
  header.values = [
    "Dimension", "Poids dim.", "Sous-dimension", "#", "Question", "Description",
    "Type", "Poids", "Obligatoire", "Statut", "Échelle de réponse",
  ];
  header.eachCell(cell => {
    cell.font = { bold: true, size: 11, color: { argb: EY_YELLOW } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EY_BLACK } };
    cell.border = { bottom: { style: "medium", color: { argb: EY_YELLOW } } };
    cell.alignment = { vertical: "middle" };
  });
  header.height = 22;

  let rows = 0;
  for (const dimension of version.snapshot.dimensions) {
    for (const subDimension of dimension.sub_dimensions) {
      subDimension.questions.forEach((question, index) => {
        const row = ws.addRow([
          dimension.name,
          `${dimension.weight}%`,
          subDimension.name,
          index + 1,
          question.text,
          question.description || "-",
          question.type,
          question.weight,
          question.is_required ? "Oui" : "Non",
          question.is_active ? "Active" : "Inactive",
          answersText(question) || "-",
        ]);
        row.getCell(5).alignment = { wrapText: true, vertical: "top" };
        row.getCell(6).alignment = { wrapText: true, vertical: "top" };
        row.getCell(11).alignment = { wrapText: true, vertical: "top" };
        if (!question.is_active) {
          row.getCell(10).font = { bold: true, color: { argb: "FFB45309" } };
        }
        row.eachCell(cell => {
          cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
        });
        rows += 1;
      });
    }
  }

  ws.autoFilter = { from: "A3", to: `K${3 + rows}` };
  ws.views = [{ state: "frozen", ySplit: 3 }];

  const buffer = await wb.xlsx.writeBuffer();
  download(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `datapilot-questionnaire-v${version.number}-${stamp()}.xlsx`,
  );
}

/** The snapshot verbatim, the fidelity option, for archiving or diffing
 *  outside the app. */
function exportSnapshotJson(version: VersionDetail) {
  const payload = {
    version: {
      number: version.number,
      label: version.label,
      note: version.note,
      is_active: version.is_active,
      archived: version.archived,
      dimension_count: version.dimension_count,
      question_count: version.question_count,
      assessment_count: version.assessment_count,
      created_by_name: version.created_by_name,
      created_at: version.created_at,
    },
    changelog: version.changelog,
    snapshot: version.snapshot,
  };
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `datapilot-questionnaire-v${version.number}-${stamp()}.json`,
  );
}

/** The log itself, as shown, for reporting on how the framework evolved. */
async function exportVersionsXlsx(rows: VersionSummary[], liveId: number | undefined) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Versions");

  ws.columns = [
    { width: 9 }, { width: 38 }, { width: 12 }, { width: 11 }, { width: 12 },
    { width: 13 }, { width: 22 }, { width: 18 }, { width: 60 },
  ];

  ws.mergeCells("A1:I1");
  const title = ws.getCell("A1");
  title.value = "DataPilot, Versions du questionnaire";
  title.font = { bold: true, size: 15, color: { argb: EY_YELLOW } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EY_BLACK } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells("A2:I2");
  const sub = ws.getCell("A2");
  sub.value = `Exporté le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}, ${plural(rows.length, "version")}`;
  sub.font = { size: 10, color: { argb: "FF6B6B6B" } };

  const header = ws.getRow(3);
  header.values = [
    "Version", "Nom", "Statut", "Questions", "Dimensions", "Évaluations",
    "Publiée par", "Publiée le", "Changelog",
  ];
  header.eachCell(cell => {
    cell.font = { bold: true, size: 11, color: { argb: EY_YELLOW } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EY_BLACK } };
    cell.border = { bottom: { style: "medium", color: { argb: EY_YELLOW } } };
    cell.alignment = { vertical: "middle" };
  });
  header.height = 22;

  for (const version of rows) {
    const status = version.id === liveId ? "En ligne" : version.archived ? "Archivée" : "Hors ligne";
    const row = ws.addRow([
      `v${version.number}`,
      version.label || `Publication du ${dateTime(version.created_at)}`,
      status,
      version.question_count,
      version.dimension_count,
      version.assessment_count,
      version.created_by_name || "-",
      dateTime(version.created_at),
      version.changelog.length
        ? version.changelog.map(e => `${e.label}${e.details.length ? ` (${e.details.join(" ; ")})` : ""}`).join("\n")
        : "Version initiale",
    ]);
    row.getCell(3).font = {
      bold: true,
      color: { argb: status === "En ligne" ? "FF2E7D32" : status === "Archivée" ? "FFB23B3B" : "FF6B6B6B" },
    };
    row.getCell(9).alignment = { wrapText: true, vertical: "top" };
    row.eachCell(cell => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  }

  ws.autoFilter = { from: "A3", to: `I${3 + rows.length}` };
  ws.views = [{ state: "frozen", ySplit: 3 }];

  const buffer = await wb.xlsx.writeBuffer();
  download(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `datapilot-versions-${stamp()}.xlsx`,
  );
}

// ── Snapshot viewer ──────────────────────────────────────────────────────────

/** The answer scale as it was frozen. A question's wording alone doesn't say
 *  what respondents could pick, or what each choice was worth, which is the
 *  whole point of consulting an old version. */
function AnswerScale({ question }: { question: ApiQuestion }) {
  const levels = question.level_responses ?? [];
  const choices = question.choice_options ?? [];
  const entries = levels.length
    ? levels.map((r, i) => ({ rank: `${i + 1}`, label: r.label, score: r.score }))
    : choices.map(o => ({ rank: "", label: o.label, score: o.score }));

  if (entries.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
      {entries.map((entry, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex", alignItems: "baseline", gap: 4,
            backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.09)",
            borderRadius: 4, padding: "2px 7px", fontSize: 10, color: "#4A4A4A",
            maxWidth: "100%", overflowWrap: "anywhere",
          }}
        >
          {entry.rank && <b style={{ color: "#B0B0B0" }}>{entry.rank}</b>}
          {entry.label}
          <b style={{ color: "#1A1A1A" }}>{entry.score}</b>
        </span>
      ))}
    </div>
  );
}

function SnapshotDialog({ version, onClose }: { version: VersionDetail; onClose: () => void }) {
  const [exporting, setExporting] = useState(false);

  async function xlsx() {
    setExporting(true);
    try {
      await exportSnapshotXlsx(version);
      toast.success("Export Excel", { description: `Questionnaire v${version.number} exporté.` });
    } catch (e) {
      toast.error("Export impossible", { description: errMsg(e) });
    } finally {
      setExporting(false);
    }
  }

  const iconBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5, padding: "6px 11px",
    borderRadius: 6, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
    border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff",
    color: "#1A1A1A", cursor: "pointer",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: "#fff", borderRadius: 12, width: 780, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.16)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>
              v{version.number}{version.label ? `: ${version.label}` : ""}
            </div>
            <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>
              Questionnaire figé le {dateTime(version.created_at)} · {version.dimension_count} dimensions · {version.question_count} questions
              {version.assessment_count > 0 && ` · ${plural(version.assessment_count, "évaluation")}`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={xlsx} disabled={exporting} style={{ ...iconBtn, cursor: exporting ? "wait" : "pointer" }} title="Exporter le questionnaire figé en Excel">
              {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Excel
            </button>
            <button onClick={() => exportSnapshotJson(version)} style={iconBtn} title="Télécharger le snapshot brut (JSON)">
              <FileJson size={12} /> JSON
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
          </div>
        </div>

        {/* minHeight: 0 is required, not decorative: a flex item defaults to
            min-height:auto and refuses to shrink below its content, so without
            it the list overflows the panel's maxHeight and gets clipped with
            no scrollbar instead of scrolling. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          {version.snapshot.dimensions.map((dimension: ApiDimension) => (
            <div key={dimension.id} style={{ border: "1px solid rgba(0,0,0,0.07)", borderRadius: 9, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", backgroundColor: "#FAFAFA", borderLeft: `4px solid ${dimension.color}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                    {dimension.name}
                  </span>
                  {!dimension.is_active && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#9B9B9B", backgroundColor: "#F0F0F0", borderRadius: 4, padding: "1px 6px", flexShrink: 0 }}>Inactive</span>
                  )}
                  <span style={{ fontSize: 11, color: "#9B9B9B", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {plural(countQuestions(dimension), "question")} · poids {dimension.weight}%
                  </span>
                </div>
                {dimension.description && (
                  <div style={{ fontSize: 11, color: "#8A8A8A", marginTop: 4, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                    {dimension.description}
                  </div>
                )}
              </div>

              {dimension.sub_dimensions.map(sub => (
                <div key={sub.id} style={{ padding: "10px 16px 12px", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7, overflowWrap: "anywhere" }}>
                    {sub.name}
                    {!sub.is_active && <span style={{ textTransform: "none", letterSpacing: 0, color: "#B0B0B0", fontWeight: 500 }}> · inactive</span>}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sub.questions.map((question, index) => (
                      <div
                        key={question.id}
                        style={{
                          display: "flex", gap: 10, alignItems: "flex-start",
                          padding: "7px 10px", borderRadius: 6,
                          backgroundColor: question.is_active ? "#FAFAFA" : "transparent",
                          border: question.is_active ? "1px solid rgba(0,0,0,0.05)" : "1px dashed rgba(0,0,0,0.10)",
                          opacity: question.is_active ? 1 : 0.6,
                        }}
                      >
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#B0B0B0", flexShrink: 0, minWidth: 14, paddingTop: 1 }}>
                          {index + 1}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: "#1A1A1A", lineHeight: 1.45, overflowWrap: "anywhere" }}>
                            {question.text}
                          </div>
                          {question.description && (
                            <div style={{ fontSize: 11, color: "#9B9B9B", fontStyle: "italic", marginTop: 3, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                              {question.description}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
                            <span style={{ fontSize: 10, color: "#9B9B9B" }}>{question.type}</span>
                            <span style={{ fontSize: 10, color: "#C0C0C0" }}>·</span>
                            <span style={{ fontSize: 10, color: "#9B9B9B" }}>poids {question.weight}</span>
                            {!question.is_required && (
                              <><span style={{ fontSize: 10, color: "#C0C0C0" }}>·</span>
                                <span style={{ fontSize: 10, color: "#9B9B9B" }}>facultative</span></>
                            )}
                            {!question.is_active && (
                              <><span style={{ fontSize: 10, color: "#C0C0C0" }}>·</span>
                                <span style={{ fontSize: 10, color: "#B45309", fontWeight: 600 }}>inactive</span></>
                            )}
                          </div>
                          <AnswerScale question={question} />
                        </div>
                      </div>
                    ))}
                    {sub.questions.length === 0 && (
                      <div style={{ fontSize: 11, color: "#B0B0B0" }}>Aucune question</div>
                    )}
                  </div>
                </div>
              ))}

              {dimension.sub_dimensions.length === 0 && (
                <div style={{ padding: "10px 16px", fontSize: 11, color: "#B0B0B0", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  Aucune sous-dimension
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Label / note editor ──────────────────────────────────────────────────────

/** Only the two fields that are the admin's own words. The snapshot and the
 *  computed changelog are the record of what was published and stay frozen. */
function EditDialog({
  version, onClose, onSaved,
}: {
  version: VersionSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(version.label);
  const [note, setNote] = useState(version.note);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateVersionMeta(version.id, { label: label.trim(), note: note.trim() });
      toast.success(`Version v${version.number} mise à jour`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Enregistrement impossible", { description: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 11px", borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1001, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: "#fff", borderRadius: 12, width: 520, maxWidth: "94vw", boxShadow: "0 24px 64px rgba(0,0,0,0.16)", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Modifier la version v{version.number}</div>
            <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>
              Le questionnaire figé et le changelog ne sont pas modifiables
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
        </div>

        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Nom de la version</label>
            <input
              value={label}
              maxLength={200}
              onChange={e => setLabel(e.target.value)}
              placeholder="ex. Édition 2026"
              style={field}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Note</label>
            <textarea
              value={note}
              rows={3}
              onChange={e => setNote(e.target.value)}
              placeholder="Contexte de cette publication…"
              style={{ ...field, resize: "vertical" }}
            />
          </div>
        </div>

        <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
            Annuler
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: saving ? "wait" : "pointer" }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Restore confirmation ─────────────────────────────────────────────────────

/** Difference between the live questionnaire and the one being restored. */
function Delta({ value }: { value: number }) {
  if (value === 0) return <span style={{ fontSize: 11, color: "#9B9B9B" }}>inchangé</span>;
  const up = value > 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#2E7D32" : "#CC0000" }}>
      {up ? "+" : "−"}{Math.abs(value)}
    </span>
  );
}

function VersionCard({ title, version, muted }: {
  title: string;
  version: VersionSummary | undefined;
  muted?: boolean;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: "11px 13px", backgroundColor: muted ? "#FAFAFA" : "#fff" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: muted ? "#6B6B6B" : "#1A1A1A", marginTop: 5, overflowWrap: "anywhere" }}>
        {version ? `v${version.number}` : "-"}
        {version?.label ? <span style={{ fontWeight: 500, fontSize: 12, color: "#9B9B9B" }}>: {version.label}</span> : null}
      </div>
      <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 3 }}>
        {version ? `${version.question_count} questions · ${version.dimension_count} dimensions` : "Aucune"}
      </div>
    </div>
  );
}

/** Restoring rewrites the questionnaire people are answering, so the
 *  confirmation spells out what changes and what survives, a native
 *  `confirm()` can show neither the before/after nor the guarantees. */
function RestoreDialog({ version, current, onClose, onDone }: {
  version: VersionSummary;
  current: VersionSummary | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const questionDelta = version.question_count - (current?.question_count ?? 0);
  const dimensionDelta = version.dimension_count - (current?.dimension_count ?? 0);

  async function confirm() {
    setSubmitting(true);
    try {
      await restoreVersion(version.id);
      toast.success(`v${version.number} est en ligne`, {
        description:
          `Le questionnaire compte désormais ${plural(version.question_count, "question")} ` +
          `sur ${plural(version.dimension_count, "dimension")}.`,
      });
      onDone();
      onClose();
    } catch (e) {
      toast.error(`Restauration de v${version.number} impossible`, { description: errMsg(e) });
      // Left open on failure: the reason is usually actionable (a staged
      // draft), and closing would make the admin hunt for the row again.
      setSubmitting(false);
    }
  }

  const facts: { text: string; strong?: boolean }[] = [
    {
      text: current
        ? `Le questionnaire en ligne (v${current.number}) sera remplacé par le contenu figé dans v${version.number}.`
        : `Le questionnaire en ligne sera remplacé par le contenu figé dans v${version.number}.`,
      strong: true,
    },
    { text: "Aucune version enregistrée n'est modifiée : l'historique reste intact et le retour en arrière reste possible." },
    { text: "Les réponses déjà collectées sont conservées, une question déjà répondue est désactivée, jamais supprimée." },
  ];

  if (version.archived) {
    facts.push({ text: `v${version.number} est archivée : la restaurer la remettra parmi les versions actives.` });
  }
  if (current && current.assessment_count > 0) {
    facts.push({
      text:
        `${plural(current.assessment_count, "évaluation")} ` +
        `${current.assessment_count > 1 ? "restent rattachées" : "reste rattachée"} à v${current.number} ` +
        `et ${current.assessment_count > 1 ? "restent lisibles" : "reste lisible"} sur son questionnaire figé.`,
    });
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1001, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={submitting ? undefined : onClose}
    >
      <div
        style={{ backgroundColor: "#fff", borderRadius: 12, width: 560, maxWidth: "94vw", boxShadow: "0 24px 64px rgba(0,0,0,0.16)", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: "#FFE600", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <RotateCcw size={18} style={{ color: "#1A1A1A" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>
              Remettre la version v{version.number} en ligne ?
            </div>
            <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>
              Le changement est immédiat pour les banques qui répondent au questionnaire
            </div>
          </div>
          {!submitting && (
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", flexShrink: 0 }}><X size={18} /></button>
          )}
        </div>

        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <VersionCard title="Actuellement en ligne" version={current} muted />
            <ArrowRight size={16} style={{ color: "#C0C0C0", flexShrink: 0 }} />
            <VersionCard title="Après restauration" version={version} />
          </div>

          <div style={{ display: "flex", gap: 22, padding: "10px 13px", backgroundColor: "#FAFAFA", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#6B6B6B" }}>Questions</span>
              <Delta value={questionDelta} />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#6B6B6B" }}>Dimensions</span>
              <Delta value={dimensionDelta} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {facts.map((fact, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: fact.strong ? "#D97706" : "#C0C0C0", flexShrink: 0, marginTop: 6 }} />
                <span style={{ fontSize: 12, lineHeight: 1.5, color: fact.strong ? "#92400E" : "#6B6B6B", fontWeight: fact.strong ? 600 : 400 }}>
                  {fact.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{ padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: submitting ? "not-allowed" : "pointer", color: submitting ? "#C0C0C0" : "#4A4A4A" }}
          >
            Annuler
          </button>
          <button
            onClick={confirm}
            disabled={submitting}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: submitting ? "wait" : "pointer" }}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            {submitting ? "Restauration…" : "Restaurer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function QuestionnaireVersions() {
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [draft, setDraft] = useState<DraftInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [viewing, setViewing] = useState<VersionDetail | null>(null);
  const [editing, setEditing] = useState<VersionSummary | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<VersionSummary | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const [search, setSearch] = useSeededSearch();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    // The draft comes along because it decides whether restoring is possible
    // at all: the server refuses while unpublished work is staged.
    Promise.all([listVersions(), getFrameworkState()])
      .then(([list, state]) => {
        if (cancelled) return;
        setVersions(list);
        setDraft(state.draft);
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [refreshKey]);

  // A filter that shrinks the list can strand the reader on a page that no
  // longer exists, so anything that changes what's shown goes through these
  // and starts over at the first page.
  const applySearch = (value: string) => { setSearch(value); setPage(1); };
  const applyStatus = (value: StatusFilter) => { setStatusFilter(value); setPage(1); };
  const applySort = (value: SortKey) => { setSort(value); setPage(1); };

  function reload() {
    setLoading(true);
    setRefreshKey(k => k + 1);
  }

  async function archive(version: VersionSummary, archived: boolean) {
    setOpenMenu(null);
    if (archived && !(await confirm({
      title: `Archiver la version v${version.number} ?`,
      description:
        "Elle sortira de la liste par défaut. Rien n'est supprimé : le questionnaire figé " +
        "reste consultable et la version peut être restaurée à tout moment.",
      icon: Archive,
      confirmLabel: "Archiver",
    }))) return;

    setBusy(version.id);
    try {
      await setVersionArchived(version.id, archived);
      toast.success(archived ? `Version v${version.number} archivée` : `Version v${version.number} désarchivée`);
      reload();
    } catch (e) {
      toast.error(archived ? "Archivage impossible" : "Désarchivage impossible", { description: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  async function remove(version: VersionSummary) {
    setOpenMenu(null);
    if (!(await confirm({
      title: `Supprimer définitivement la version v${version.number} ?`,
      description:
        "Le questionnaire figé et son changelog seront perdus. Cette action est irréversible, " +
        "préférez l'archivage pour retirer une version de la liste.",
      variant: "danger",
      confirmLabel: "Supprimer",
    }))) return;

    setBusy(version.id);
    try {
      await deleteVersion(version.id);
      toast.success(`Version v${version.number} supprimée`);
      reload();
    } catch (e) {
      toast.error("Suppression impossible", { description: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  async function openSnapshot(version: VersionSummary) {
    setLoadingSnapshot(version.id);
    try {
      setViewing(await getVersion(version.id));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoadingSnapshot(null);
    }
  }

  async function exportList(rows: VersionSummary[], liveId: number | undefined) {
    setExporting(true);
    try {
      await exportVersionsXlsx(rows, liveId);
      toast.success("Export Excel", { description: `${plural(rows.length, "version")} exportée${rows.length > 1 ? "s" : ""}.` });
    } catch (e) {
      toast.error("Export impossible", { description: errMsg(e) });
    } finally {
      setExporting(false);
    }
  }

  // The live version is whichever carries the flag, after a restore that is
  // an older one, not the newest.
  const active = versions.find(v => v.is_active) ?? versions[0];
  const archivedCount = versions.filter(v => v.archived).length;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matches = (version: VersionSummary) => {
      if (!needle) return true;
      const haystack = [
        `v${version.number}`,
        version.label,
        version.note,
        version.created_by_name ?? "",
        ...version.changelog.flatMap(entry => [entry.label, ...entry.details]),
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    };

    const inScope = (version: VersionSummary) =>
      statusFilter === "all" ? true : statusFilter === "archived" ? version.archived : !version.archived;

    const rows = versions.filter(v => inScope(v) && matches(v));
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest": return a.number - b.number;
        case "usage": return b.assessment_count - a.assessment_count || b.number - a.number;
        case "questions": return b.question_count - a.question_count || b.number - a.number;
        default: return b.number - a.number;
      }
    });
    return sorted;
  }, [versions, search, statusFilter, sort]);

  // Client-side paging: the list is small and already fully loaded.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const chips: { key: StatusFilter; label: string; count: number }[] = [
    { key: "active", label: "Actives", count: versions.length - archivedCount },
    { key: "archived", label: "Archivées", count: archivedCount },
    { key: "all", label: "Toutes", count: versions.length },
  ];

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>Versions du questionnaire</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0" }}>
            Historique des publications, chaque version fige le questionnaire tel qu'il était à ce moment
          </p>
        </div>
        {versions.length > 0 && (
          <button
            onClick={() => exportList(filtered, active?.id)}
            disabled={exporting || filtered.length === 0}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", color: filtered.length === 0 ? "#C0C0C0" : "#1A1A1A", cursor: exporting ? "wait" : filtered.length === 0 ? "not-allowed" : "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Exporter la liste
          </button>
        )}
      </div>

      {loading && (
        <AdminLoader label="Chargement des versions…" />
      )}

      {!loading && error && (
        <div style={{ textAlign: "center", padding: 50 }}>
          <p style={{ fontSize: 13, color: "#6B6B6B", marginBottom: 14 }}>Impossible de charger les versions.</p>
          <button onClick={() => { setError(false); reload(); }}
            style={{ padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>
            Réessayer
          </button>
        </div>
      )}

      {/* Unpublished work blocks any restore server-side, so say so here rather
          than letting the admin discover it through a failed action. */}
      {!loading && !error && draft && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 16px", backgroundColor: "#FFF8E1", border: "1px solid #FDE68A", borderRadius: 9, marginBottom: 16 }}>
          <AlertTriangle size={15} style={{ color: "#D97706", flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>Des modifications non publiées sont en cours</div>
            <div style={{ fontSize: 12, color: "#92400E", opacity: 0.85, marginTop: 2, lineHeight: 1.5 }}>
              Brouillon{draft.updated_by_name ? ` de ${draft.updated_by_name}` : ""}
              {draft.updated_at ? `, modifié le ${dateTime(draft.updated_at)}` : ""}.
              {" "}Aucune version ne peut être restaurée tant qu'il n'est pas publié ou abandonné.
            </div>
          </div>
          <button
            onClick={() => navigate("/super-admin/dimensions")}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
          >
            <ClipboardList size={12} /> Gestion du framework
          </button>
        </div>
      )}

      {!loading && !error && versions.length === 0 && (
        <div style={{ border: "1px dashed rgba(0,0,0,0.15)", borderRadius: 10, padding: 48, textAlign: "center", backgroundColor: "#fff" }}>
          <GitBranch size={22} style={{ color: "#C0C0C0" }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginTop: 10 }}>Aucune version publiée</div>
          <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4, lineHeight: 1.5 }}>
            Une version est créée en publiant depuis <strong>Gestion du framework</strong>.<br />
            Elle enregistre le questionnaire complet et la liste des modifications appliquées.
          </div>
        </div>
      )}

      {!loading && !error && active && (
        <div style={{ backgroundColor: "#1A1A1A", borderRadius: 12, padding: "20px 26px", marginBottom: 18, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "#FFE600", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <GitBranch size={22} style={{ color: "#1A1A1A" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
              Version en ligne
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
              v{active.number}{active.label ? `: ${active.label}` : ""}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
              {active.question_count} questions · {active.dimension_count} dimensions · publiée le {dateTime(active.created_at)}
              {active.created_by_name ? ` par ${active.created_by_name}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#FFE600", lineHeight: 1 }}>{active.assessment_count}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>
              évaluation{active.assessment_count > 1 ? "s" : ""}
            </div>
          </div>
        </div>
      )}

      {/* Search / filter / sort, grouped in one card like the table below it.
          The card is the only surface here, the field itself draws no border
          and no shadow, so it reads as part of the card rather than a box
          sitting inside another box. */}
      {!loading && !error && versions.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "14px 16px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          {/* Styled in index.css, not inline: the halo, the placeholder colour
              and the focus state need selectors an inline style can't express.
              `data-search` is what opts the field out of the global
              input:focus rule that would otherwise repaint it black. */}
          <div className="search-field" style={{ flex: 1, minWidth: 220 }}>
            <Search className="search-icon" size={16} />
            <input
              className="search-input"
              value={search}
              onChange={e => applySearch(e.target.value)}
              placeholder="Rechercher un numéro, un nom, un auteur, une modification…"
              name="datapilot-version-search"
              autoComplete="off"
              data-search=""
              style={{ fontSize: 13 }}
            />
            {search && (
              <button className="search-clear" onClick={() => applySearch("")} title="Effacer">
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {chips.map(chip => (
              <button
                key={chip.key}
                onClick={() => applyStatus(chip.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 6,
                  fontSize: 12, fontWeight: statusFilter === chip.key ? 700 : 500, cursor: "pointer",
                  border: "1px solid rgba(0,0,0,0.10)",
                  backgroundColor: statusFilter === chip.key ? "#1A1A1A" : "#fff",
                  color: statusFilter === chip.key ? "#FFE600" : "#4A4A4A",
                  whiteSpace: "nowrap",
                }}
              >
                {chip.label}
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>{chip.count}</span>
              </button>
            ))}
          </div>

          <select
            value={sort}
            onChange={e => applySort(e.target.value as SortKey)}
            style={{ padding: "8px 11px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", fontSize: 12, outline: "none", backgroundColor: "#fff", color: "#1A1A1A", cursor: "pointer" }}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map(key => (
              <option key={key} value={key}>{SORT_LABELS[key]}</option>
            ))}
          </select>
        </div>
      )}

      {!loading && !error && versions.length > 0 && filtered.length === 0 && (
        <div style={{ border: "1px dashed rgba(0,0,0,0.15)", borderRadius: 10, padding: 40, textAlign: "center", backgroundColor: "#fff" }}>
          <Search size={20} style={{ color: "#C0C0C0" }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginTop: 9 }}>Aucune version ne correspond</div>
          <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 4 }}>
            Ajustez la recherche ou le filtre pour élargir la liste.
          </div>
        </div>
      )}

      {!loading && !error && paged.length > 0 && (
        <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#FAFAFA", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                <th style={{ width: 34, padding: "10px 14px" }} />
                {["Version", "Nom & Changelog", "Statut", "Questions", "Dimensions", "Évaluations", "Publiée par", "Publiée le", "Actions"].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px", textAlign: "left",
                      fontSize: 10, fontWeight: 700, color: "#9B9B9B",
                      letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((version, i) => {
                const isLive = version.id === active?.id;
                const open = expanded === version.id;
                const rowBg = isLive ? "#FAFFF9" : version.archived ? "#FCFAFA" : "transparent";
                const working = busy === version.id;
                // Archived rows read as retired through muted cell colours, not
                // through `opacity` on the <tr>: opacity creates a stacking
                // context, which would trap the row's fixed-position action
                // menu underneath the click-away overlay and swallow its clicks.
                const strong = version.archived ? "#8A8A8A" : "#1A1A1A";
                const numeric = version.archived ? "#B0B0B0" : "#1A1A1A";
                return (
                  <Fragment key={version.id}>
                    <tr
                      onClick={() => setExpanded(open ? null : version.id)}
                      style={{ borderBottom: open || i < paged.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", backgroundColor: rowBg, cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={e => { if (!isLive) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#FAFAFA"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = rowBg; }}
                    >
                      <td style={{ padding: "12px 14px", verticalAlign: "middle", textAlign: "center" }}>
                        <ChevronDown size={13} style={{ color: "#9B9B9B", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                      </td>

                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                        <span style={{ display: "inline-block", backgroundColor: isLive ? "#1A1A1A" : "#F5F5F5", color: isLive ? "#FFE600" : version.archived ? "#A0A0A0" : "#6B6B6B", borderRadius: 5, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                          v{version.number}
                        </span>
                      </td>

                      <td style={{ padding: "12px 14px", verticalAlign: "middle", maxWidth: 300 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: strong }}>
                          {version.label || `Publication du ${dateTime(version.created_at)}`}
                        </div>
                        <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {summarize(version)}
                        </div>
                      </td>

                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}><StatusBadge live={isLive} archived={version.archived} /></td>
                      <td style={{ padding: "12px 14px", verticalAlign: "middle", fontSize: 13, fontWeight: 700, color: numeric }}>{version.question_count}</td>
                      <td style={{ padding: "12px 14px", verticalAlign: "middle", fontSize: 13, fontWeight: 700, color: numeric }}>{version.dimension_count}</td>

                      {/* What actually rides on this version, the number that
                          makes restoring or deleting it a decision. */}
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                        <span
                          title={
                            version.assessment_count
                              ? `${plural(version.assessment_count, "évaluation")} réalisée${version.assessment_count > 1 ? "s" : ""} sur cette version, elle ne peut pas être supprimée`
                              : "Aucune évaluation réalisée sur cette version"
                          }
                          style={{
                            fontSize: 13, fontWeight: version.assessment_count ? 700 : 500,
                            color: version.assessment_count ? numeric : "#C0C0C0",
                          }}
                        >
                          {version.assessment_count}
                        </span>
                      </td>

                      <td style={{ padding: "12px 14px", verticalAlign: "middle", fontSize: 12, color: "#9B9B9B", whiteSpace: "nowrap" }}>{version.created_by_name || "-"}</td>
                      <td style={{ padding: "12px 14px", verticalAlign: "middle", fontSize: 12, color: "#9B9B9B", whiteSpace: "nowrap" }}>{dateTime(version.created_at)}</td>

                      <td style={{ padding: "12px 14px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                          {!isLive && (
                            <button
                              title={
                                draft
                                  ? "Publiez ou abandonnez les modifications en cours avant de restaurer"
                                  : `Remettre v${version.number} en ligne`
                              }
                              onClick={() => setRestoreTarget(version)}
                              disabled={draft !== null}
                              style={{
                                display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 5,
                                fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)",
                                backgroundColor: draft ? "#F5F5F5" : "#fff",
                                color: draft ? "#B0B0B0" : "#1A1A1A",
                                cursor: draft ? "not-allowed" : "pointer",
                                whiteSpace: "nowrap",
                              }}
                              onMouseEnter={e => { if (draft) return; const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; }}
                              onMouseLeave={e => { if (draft) return; const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#1A1A1A"; }}
                            >
                              <RotateCcw size={11} />
                              Restaurer
                            </button>
                          )}

                          <button
                            title="Consulter le questionnaire figé"
                            onClick={() => openSnapshot(version)}
                            style={{ width: 28, height: 28, borderRadius: 5, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#4A4A4A", transition: "all 0.15s" }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#4A4A4A"; }}
                          >
                            {loadingSnapshot === version.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                          </button>

                          <div style={{ position: "relative" }}>
                            <button
                              title="Autres actions"
                              onClick={e => {
                                if (openMenu === version.id) {
                                  setOpenMenu(null);
                                  return;
                                }
                                const r = e.currentTarget.getBoundingClientRect();
                                const menuHeight = 3 * 40;
                                const top =
                                  r.bottom + 4 + menuHeight > window.innerHeight - 8
                                    ? r.top - menuHeight - 4
                                    : r.bottom + 4;
                                setMenuPos({ top, right: window.innerWidth - r.right });
                                setOpenMenu(version.id);
                              }}
                              style={{ width: 28, height: 28, borderRadius: 5, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6B6B", transition: "all 0.15s" }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#fff"; b.style.borderColor = "#1A1A1A"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#6B6B6B"; b.style.borderColor = "rgba(0,0,0,0.12)"; }}
                            >
                              {working ? <Loader2 size={12} className="animate-spin" /> : <MoreHorizontal size={14} />}
                            </button>

                            {openMenu === version.id && menuPos && (
                              <div style={{ position: "fixed", right: menuPos.right, top: menuPos.top, zIndex: 1000, backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 240, overflow: "hidden" }}>
                                {[
                                  {
                                    label: "Modifier le nom et la note",
                                    icon: Pencil,
                                    danger: false,
                                    disabled: false,
                                    hint: "",
                                    action: () => { setOpenMenu(null); setEditing(version); },
                                  },
                                  version.archived
                                    ? {
                                        label: "Désarchiver la version",
                                        icon: ArchiveRestore,
                                        danger: false,
                                        disabled: false,
                                        hint: "",
                                        action: () => archive(version, false),
                                      }
                                    : {
                                        label: "Archiver la version",
                                        icon: Archive,
                                        danger: false,
                                        disabled: isLive,
                                        hint: isLive ? "La version en ligne ne peut pas être archivée" : "",
                                        action: () => archive(version, true),
                                      },
                                  {
                                    label: "Supprimer définitivement",
                                    icon: Trash2,
                                    danger: true,
                                    disabled: isLive || version.assessment_count > 0,
                                    hint: isLive
                                      ? "La version en ligne ne peut pas être supprimée"
                                      : version.assessment_count > 0
                                        ? `${plural(version.assessment_count, "évaluation")} y sont rattachée${version.assessment_count > 1 ? "s" : ""}`
                                        : "",
                                    action: () => remove(version),
                                  },
                                ].map(({ label, icon: Icon, danger, disabled, hint, action }, ai) => (
                                  <button
                                    key={ai}
                                    onClick={disabled ? undefined : action}
                                    disabled={disabled}
                                    title={hint}
                                    style={{
                                      width: "100%", display: "flex", alignItems: "center", gap: 9,
                                      padding: "10px 14px", border: "none", background: "none",
                                      cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500,
                                      color: disabled ? "#C0C0C0" : danger ? "#CC0000" : "#1A1A1A",
                                      textAlign: "left", borderTop: ai > 0 ? "1px solid rgba(0,0,0,0.05)" : "none",
                                    }}
                                    onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.backgroundColor = danger ? "#FFF5F5" : "#F7F7F7"; }}
                                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"}
                                  >
                                    <Icon size={13} /> {label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Full changelog, spanning the table so long details stay readable */}
                    {open && (
                      <tr style={{ borderBottom: i < paged.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
                        <td colSpan={10} style={{ padding: "6px 18px 16px 48px", backgroundColor: "#FCFCFC" }}>
                          {version.note && (
                            <div style={{ fontSize: 12, color: "#4A4A4A", padding: "8px 0", fontStyle: "italic" }}>{version.note}</div>
                          )}
                          {version.changelog.map((entry, j) => <ChangeRow key={j} entry={entry} />)}
                          {version.changelog.length === 0 && (
                            <div style={{ fontSize: 12, color: "#9B9B9B", padding: "8px 0" }}>
                              Version initiale, aucune modification antérieure à comparer.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && filtered.length > PER_PAGE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 9, border: "1px solid rgba(0,0,0,0.07)", padding: "12px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <span style={{ fontSize: 12, color: "#9B9B9B" }}>
            <strong style={{ color: "#1A1A1A" }}>{(currentPage - 1) * PER_PAGE + 1}</strong>-<strong style={{ color: "#1A1A1A" }}>{Math.min(currentPage * PER_PAGE, filtered.length)}</strong> sur <strong style={{ color: "#1A1A1A" }}>{filtered.length}</strong> versions
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: currentPage === 1 ? "#F5F5F5" : "#fff", color: currentPage === 1 ? "#C0C0C0" : "#1A1A1A", cursor: currentPage === 1 ? "not-allowed" : "pointer" }}>
              &larr; Précédent
            </button>
            {pageWindow(currentPage, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`gap-${i}`} style={{ width: 20, textAlign: "center", fontSize: 12, color: "#C0C0C0" }}>…</span>
              ) : (
                <button key={p} onClick={() => setPage(p)}
                  style={{ width: 32, height: 32, borderRadius: 6, fontSize: 12, fontWeight: p === currentPage ? 800 : 500, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: p === currentPage ? "#1A1A1A" : "#fff", color: p === currentPage ? "#FFE600" : "#4A4A4A", cursor: "pointer" }}>
                  {p}
                </button>
              ),
            )}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: currentPage === totalPages ? "#F5F5F5" : "#fff", color: currentPage === totalPages ? "#C0C0C0" : "#1A1A1A", cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}>
              Suivant &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Click-away layer for the row menu */}
      {openMenu !== null && <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={() => setOpenMenu(null)} />}

      {restoreTarget && (
        <RestoreDialog
          version={restoreTarget}
          current={active}
          onClose={() => setRestoreTarget(null)}
          onDone={reload}
        />
      )}
      {viewing && <SnapshotDialog version={viewing} onClose={() => setViewing(null)} />}
      {editing && (
        <EditDialog version={editing} onClose={() => setEditing(null)} onSaved={reload} />
      )}
      {confirmDialog}
    </div>
  );
}

/** First, last, and the neighbours of the current page, so filtering down to
 *  a long list doesn't spill a row of numbers across the footer. */
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);

  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}
