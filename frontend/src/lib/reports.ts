/**
 * Client for the PDF report endpoints (Jinja2 + WeasyPrint on the backend).
 * Downloads go through `api.getBlob` (same Keycloak-aware auth as the rest
 * of the app) since a plain `<a href>` can't attach an Authorization header.
 */

import { api } from "./api";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Single-assessment PDF report (cover, scores, AI narrative, recommendations). */
export async function downloadEvaluationReport(assessmentId: number): Promise<void> {
  const blob = await api.getBlob(`/api/assessments/${assessmentId}/report.pdf`);
  triggerDownload(blob, `evaluation-${assessmentId}.pdf`);
}

/** Two-assessment comparison/evolution PDF report. */
export async function downloadComparisonReport(
  initialId: number,
  currentId: number
): Promise<void> {
  const blob = await api.getBlob(
    `/api/assessments/comparison/report.pdf?initial_id=${initialId}&current_id=${currentId}`
  );
  triggerDownload(blob, `evolution-${initialId}-${currentId}.pdf`);
}
