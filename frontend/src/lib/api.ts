import keycloak from "./keycloak";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";


async function getFreshToken(): Promise<string | undefined> {
  // No forced keycloak.login() here: public pages (the landing page) call
  // the API while anonymous, and that's an expected outcome, not a reason
  // to yank the browser into a login redirect. Protected routes already
  // force login on mount via RequireAuth; active-session expiry is handled
  // globally by keycloak.onTokenExpired in main.tsx.
  if (!keycloak.authenticated) return undefined;
  try {
    await keycloak.updateToken(30);
  } catch {
    return undefined;
  }
  return keycloak.token;
}

/** Une entrée du `detail` d'une 422 FastAPI. */
interface ValidationDetail {
  loc?: unknown[];
  msg?: string;
}

/**
 * Message lisible à partir du corps d'erreur de l'API.
 *
 * FastAPI répond aux erreurs applicatives avec `detail` en chaîne, mais aux
 * **422 de validation avec un tableau** d'objets `{loc, msg}`. Ce tableau était
 * passé tel quel à `Error()`, qui le rend « [object Object] » : le formulaire
 * disait « Échec de la création » sans jamais nommer le champ fautif, alors que
 * la réponse le contenait. On aplatit donc le tableau en « champ : message ».
 */
function errorDetail(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | null)?.detail;

  if (typeof detail === "string" && detail) return detail;

  if (Array.isArray(detail) && detail.length) {
    return (detail as ValidationDetail[])
      .map((entry) => {
        // `loc` vaut ["body", "email"] : le premier segment dit d'où vient la
        // valeur, pas quel champ c'est, et n'intéresse pas la personne.
        const field = Array.isArray(entry.loc)
          ? entry.loc.filter((part) => part !== "body" && part !== "query").join(".")
          : "";
        const message = entry.msg ?? "valeur invalide";
        return field ? `${field} : ${message}` : message;
      })
      .join(" · ");
  }

  return fallback;
}

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}


export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getFreshToken();
  if (!token) {
    // Not authenticated (or refresh failed) — surface as a 401 rather
    // than sending the request without a token, since the backend's 403
    // ("missing header") isn't handled like a 401 is.
    throw new ApiError(401, "Non authentifié");
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  // FormData sets its own Content-Type (with the multipart boundary) when
  // the browser serializes the request — setting it here manually would
  // drop that boundary and break parsing server-side.
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    throw new ApiError(401, "Non authentifié");
  }

  // Read as text first: a 204 (or any empty body) can still carry a
  // `content-type: application/json` header, and res.json() throws on an
  // empty body ("Unexpected end of JSON input") instead of returning null.
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const text = await res.text();
  const data = isJson && text ? JSON.parse(text) : text;

  if (!res.ok) {
    throw new ApiError(res.status, errorDetail(isJson ? data : null, res.statusText), data);
  }

  return data as T;
}

/** Fetches a binary response (e.g. a generated PDF) as a Blob. Bypasses
 * apiFetch's JSON/text parsing -- a blob response has no JSON body to read. */
async function fetchBlob(path: string): Promise<Blob> {
  const token = await getFreshToken();
  if (!token) {
    throw new ApiError(401, "Non authentifié");
  }
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // Même traitement que plus haut : une 422 sur un export renvoie aussi un
    // tableau de champs, pas une phrase.
    const text = await res.text().catch(() => "");
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    throw new ApiError(res.status, errorDetail(parsed, text || res.statusText));
  }
  return res.blob();
}

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T = unknown>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  getBlob: fetchBlob,
  postForm: <T = unknown>(path: string, form: FormData) =>
    apiFetch<T>(path, { method: "POST", body: form }),
};
