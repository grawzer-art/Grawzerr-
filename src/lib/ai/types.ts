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

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  stream(request: StreamRequest): AsyncIterable<StreamEvent>;
}

export type ProviderErrorKind = "auth" | "rate_limit" | "quota" | "bad_request" | "unavailable" | "network";

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function classifyStatus(status: number, body: string): ProviderErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) {
    return /quota|billing|credit|insufficient/i.test(body) ? "quota" : "rate_limit";
  }
  if (status === 402) return "quota";
  if (status >= 400 && status < 500) return "bad_request";
  return "unavailable";
}

/** User-facing French explanation. Never includes keys or raw provider payloads. */
export function describeProviderError(err: ProviderError): string {
  switch (err.kind) {
    case "auth":
      return "Le fournisseur IA refuse la clé API (clé absente, invalide ou révoquée).";
    case "rate_limit":
      return "Le fournisseur IA limite temporairement les requêtes. Réessayez dans un instant.";
    case "quota":
      return "Le quota ou les crédits du fournisseur IA sont épuisés.";
    case "bad_request":
      return "Le fournisseur IA a rejeté la requête (modèle inconnu ou paramètre invalide).";
    case "network":
      return "Impossible de joindre le fournisseur IA.";
    default:
      return "Le fournisseur IA est momentanément indisponible.";
  }
}
