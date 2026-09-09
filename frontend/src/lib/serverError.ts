import { ApiError } from "./api";

/**
 * Tente de rattacher une erreur serveur au champ concerné, en plus du
 * toast habituel (voir le tableau de décisions du design doc). Honnête sur
 * ce qui est rattachable :
 *
 * - Une 422 FastAPI a un `detail` structuré (tableau de `{loc, msg}`) --
 *   chaque entrée est mappée au champ que `loc` désigne. Ce chemin ne
 *   devrait presque jamais se déclencher une fois les contrôles
 *   client-side en place (voir validation.ts) : c'est un filet de
 *   sécurité, pas le chemin normal.
 * - Un rejet applicatif (ex. 409, `detail` en simple chaîne) n'a aucune
 *   information de champ structurée -- seul un indice fourni par la page
 *   (`fieldHints`, un motif par champ, ex. `{ name: /nom/i }`) permet de
 *   deviner à quel champ l'attacher.
 *
 * Renvoie si quelque chose a été rattaché (permet à un appelant de
 * décider, plus tard, de sauter le toast dans ce cas -- inutilisé pour
 * l'instant, le toast reste toujours affiché).
 */
export function attachServerError<T extends Record<string, unknown>>(
  err: unknown,
  fieldHints: Partial<Record<keyof T, RegExp>>,
  setError: (field: keyof T, message: string) => void
): boolean {
  if (!(err instanceof ApiError)) return false;

  const body = err.body as { detail?: unknown } | undefined;
  if (Array.isArray(body?.detail)) {
    let attached = false;
    for (const entry of body.detail as { loc?: unknown[]; msg?: string }[]) {
      const field = Array.isArray(entry.loc) ? entry.loc[entry.loc.length - 1] : undefined;
      if (typeof field !== "string" || !entry.msg) continue;
      setError(field as keyof T, entry.msg);
      attached = true;
    }
    return attached;
  }

  for (const field in fieldHints) {
    const pattern = fieldHints[field];
    if (pattern && pattern.test(err.message)) {
      setError(field, err.message);
      return true;
    }
  }

  return false;
}
