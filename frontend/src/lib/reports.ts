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
  const { blob, filename } = await api.getBlob(`/api/assessments/${assessmentId}/report.pdf`);
  triggerDownload(blob, filename ?? `evaluation-${assessmentId}.pdf`);
}

/** Prioritized action plan PDF report (same plan_prioritaire the Recommendations page renders). */
export async function downloadRecommendationsReport(assessmentId: number): Promise<void> {
  const { blob, filename } = await api.getBlob(`/api/assessments/${assessmentId}/recommendations-report.pdf`);
  triggerDownload(blob, filename ?? `recommandations-${assessmentId}.pdf`);
}

/** Comparison/evolution PDF report across two or more assessments. */
export async function downloadComparisonReport(ids: number[]): Promise<void> {
  const { blob, filename } = await api.getBlob(
    `/api/assessments/comparison/report.pdf?ids=${ids.join(",")}`
  );
  triggerDownload(blob, filename ?? `evolution-maturite-data-${ids.join("-")}.pdf`);
}
