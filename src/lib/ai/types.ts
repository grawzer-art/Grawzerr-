export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamRequest {
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  signal?: AbortSignal;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "stop"; reason: "end" | "max_tokens" | "refusal" | "other" };

/**
 * Result of a connectivity check. `generation: true` means a tiny real
 * generation request succeeded (only done on free tiers); otherwise only the
 * key and model metadata were verified.
 */
export type ProviderCheck = { ok: true; generation: boolean } | { ok: false; error: ProviderError };

export interface CheckOptions {
  /** Also send a minimal generation request. Only allowed for free providers. */
  generate?: boolean;
}

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  stream(request: StreamRequest): AsyncIterable<StreamEvent>;
  /** Verifies the key and the model; optionally a minimal generation. */
  check(signal?: AbortSignal, options?: CheckOptions): Promise<ProviderCheck>;
}

export type ProviderErrorKind =
  | "auth" // key missing, invalid, revoked, or sent in a format the provider refuses
  | "permission" // key valid but not allowed (API disabled, key restrictions, region)
  | "rate_limit" // too many requests for now
  | "quota" // free quota or credits exhausted
  | "model_not_found"
  | "bad_request"
  | "unavailable"
  | "network";

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly status?: number,
    /** Machine-readable cause from the provider (e.g. Google's `API_KEY_INVALID`). */
    public readonly reason?: string,
    /** Provider message, already redacted, for server logs only. */
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// ── Secret redaction ──────────────────────────────────────────────

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/g, // legacy Google API keys
  /AQ\.[0-9A-Za-z_.-]{10,}/g, // Google authentication keys (2026+)
  /sk-ant-[0-9A-Za-z_-]{10,}/g,
  /sk-[0-9A-Za-z_-]{16,}/g,
  /gsk_[0-9A-Za-z]{16,}/g,
  /ya29\.[0-9A-Za-z_.-]{10,}/g, // OAuth access tokens
  /Bearer\s+[0-9A-Za-z_.-]{10,}/gi,
  /([?&]key=)[^&\s"]+/g,
];

/** Removes anything that looks like a credential, plus the given known secrets. */
export function redact(text: string, secrets: string[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[secret]");
  for (const re of SECRET_PATTERNS) out = out.replace(re, (m, p1) => (typeof p1 === "string" ? `${p1}[secret]` : "[secret]"));
  return out.slice(0, 500);
}

/** Describes a key's shape for diagnostics, never its value. */
export function describeKey(key: string): { format: string; length: number } {
  const format = key.startsWith("AIza")
    ? "AIza (ancien format Google)"
    : key.startsWith("AQ.")
      ? "AQ. (clé d'authentification Google)"
      : key.startsWith("sk-ant-")
        ? "sk-ant- (Anthropic)"
        : key.startsWith("gsk_")
          ? "gsk_ (Groq)"
          : key.startsWith("sk-")
            ? "sk- (OpenAI/OpenRouter)"
            : key
              ? "format non reconnu"
              : "absente";
  return { format, length: key.length };
}

// ── Error classification ──────────────────────────────────────────

interface ParsedErrorBody {
  message?: string;
  status?: string; // Google: UNAUTHENTICATED, PERMISSION_DENIED, RESOURCE_EXHAUSTED…
  reason?: string; // Google ErrorInfo.reason, or OpenAI-style error.code/type
}

/** Extracts message/status/reason from Google, OpenAI-style or Anthropic error bodies. */
export function parseErrorBody(body: string): ParsedErrorBody {
  try {
    const json = JSON.parse(body) as unknown;
    const root = (Array.isArray(json) ? json[0] : json) as Record<string, unknown> | undefined;
    const err = (root?.error ?? root) as Record<string, unknown> | undefined;
    if (!err || typeof err !== "object") return {};
    const details = Array.isArray(err.details) ? (err.details as Record<string, unknown>[]) : [];
    const info = details.find((d) => typeof d.reason === "string");
    const reason =
      (info?.reason as string | undefined) ??
      (typeof err.code === "string" ? err.code : undefined) ??
      (typeof err.type === "string" ? err.type : undefined);
    return {
      message: typeof err.message === "string" ? err.message : undefined,
      status: typeof err.status === "string" ? err.status : undefined,
      reason,
    };
  } catch {
    return {};
  }
}

const AUTH_REASONS = new Set([
  "API_KEY_INVALID",
  "API_KEY_EXPIRED",
  "ACCESS_TOKEN_TYPE_UNSUPPORTED",
  "CREDENTIALS_MISSING",
  "invalid_api_key",
  "authentication_error",
]);
const PERMISSION_REASONS = new Set([
  "SERVICE_DISABLED",
  "API_KEY_SERVICE_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "API_KEY_ANDROID_APP_BLOCKED",
  "API_KEY_IOS_APP_BLOCKED",
  "permission_error",
]);

export function classifyHttpError(httpStatus: number, body: string, secrets: string[] = []): ProviderError {
  const parsed = parseErrorBody(body);
  const reason = parsed.reason ?? parsed.status;
  const detail = redact(parsed.message ?? body, secrets);
  const text = `${parsed.message ?? ""} ${body}`;
  let kind: ProviderErrorKind;

  if (reason && AUTH_REASONS.has(reason)) kind = "auth";
  else if (reason && PERMISSION_REASONS.has(reason)) kind = "permission";
  else if (/api key not valid|invalid api key|invalid auth key|invalid x-api-key|incorrect api key/i.test(text)) kind = "auth";
  else if (/location is not supported|not available in your country/i.test(text)) kind = "permission";
  else if (httpStatus === 401) kind = "auth";
  else if (httpStatus === 403) kind = "permission";
  else if (httpStatus === 404 || parsed.status === "NOT_FOUND") kind = "model_not_found";
  else if (httpStatus === 402) kind = "quota";
  else if (httpStatus === 429 || parsed.status === "RESOURCE_EXHAUSTED") {
    kind = /quota|billing|credit|insufficient|limit: 0|per day|perday/i.test(text) ? "quota" : "rate_limit";
  } else if (httpStatus >= 400 && httpStatus < 500) kind = "bad_request";
  else kind = "unavailable";

  return new ProviderError(kind, `HTTP ${httpStatus}`, httpStatus, reason, detail);
}

/** User-facing French explanation. Never includes keys or raw provider payloads. */
export function describeProviderError(err: ProviderError): string {
  switch (err.kind) {
    case "auth":
      // Google answers ACCESS_TOKEN_TYPE_UNSUPPORTED for any invalid "AQ." key (observed 2026-10-16).
      if (err.reason === "ACCESS_TOKEN_TYPE_UNSUPPORTED" || err.reason === "API_KEY_INVALID") {
        return "Google indique que cette clé n'est pas valide (clé tronquée ou modifiée au copier-coller, supprimée dans AI Studio, ou variable changée sans redéploiement). Créez une nouvelle clé dans Google AI Studio, collez-la dans GEMINI_API_KEY sur Vercel, puis redéployez.";
      }
      return "Le fournisseur IA refuse la clé API (clé invalide, révoquée ou mal copiée). Vérifiez la variable dans Vercel, sans espace ni guillemet, puis redéployez.";
    case "permission":
      if (/denied access/i.test(err.detail ?? "")) {
        return "Google bloque la génération de texte pour le projet de cette clé (« Your project has been denied access »). Ce blocage vient du compte Google, pas de JARVIS : la clé est reconnue mais n'a pas le droit de générer. Voir docs/CONFIGURATION.md › « 403 PERMISSION_DENIED ».";
      }
      if (/are blocked/i.test(err.detail ?? "")) {
        return "Les restrictions de cette clé bloquent la génération de texte (API ou méthode non autorisée). Dans Google AI Studio, retirez les restrictions de la clé ou créez-en une nouvelle.";
      }
      if (err.reason === "SERVICE_DISABLED") {
        return "La clé est valide mais l'API Gemini (Generative Language API) n'est pas activée sur son projet Google.";
      }
      if (err.reason?.startsWith("API_KEY_") && err.reason.endsWith("_BLOCKED")) {
        return "La clé est valide mais ses restrictions (site web, IP ou API autorisées) bloquent l'appel depuis Vercel. Retirez ces restrictions dans Google AI Studio.";
      }
      return "Le fournisseur IA refuse l'accès (API non activée, restrictions de clé ou région non prise en charge).";
    case "rate_limit":
      return "Le fournisseur IA limite temporairement les requêtes. Réessayez dans une minute.";
    case "quota":
      return "Le quota gratuit du fournisseur IA est épuisé pour le moment (souvent réinitialisé chaque jour). Aucune facturation n'a été activée.";
    case "model_not_found":
      return "Le modèle demandé n'existe pas ou n'est pas accessible avec cette clé. Vérifiez JARVIS_AI_MODEL (ou supprimez-la pour utiliser le modèle par défaut).";
    case "bad_request":
      return "Le fournisseur IA a rejeté la requête (paramètre invalide).";
    case "network":
      return "Impossible de joindre le fournisseur IA.";
    default:
      return "Le fournisseur IA est momentanément indisponible. Réessayez plus tard.";
  }
}
