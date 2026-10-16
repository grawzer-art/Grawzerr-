import { ProviderError, classifyHttpError } from "./types";

/** Audio containers accepted by Groq's Whisper endpoint, by MIME type (parameters ignored). */
const EXTENSIONS: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/flac": "flac",
};

export function audioExtension(mimeType: string): string | null {
  return EXTENSIONS[mimeType.split(";")[0].trim().toLowerCase()] ?? null;
}

/**
 * Whisper is known to "hear" these phrases in silence or noise (artefacts of
 * its subtitle training data). A transcript made only of them is discarded.
 */
const HALLUCINATIONS = [
  "sous-titres réalisés par la communauté d'amara.org",
  "sous-titres réalisés para la communauté d'amara.org",
  "sous-titrage st' 501",
  "sous-titrage st'501",
  "sous-titrage société radio-canada",
  "sous-titrage fr : vfnet",
  "merci d'avoir regardé cette vidéo",
  "merci d'avoir regardé",
  "merci de votre attention",
  "abonnez-vous",
  "n'oubliez pas de vous abonner",
  "amara.org",
  "...",
  "…",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[\s.!?…,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isLikelyHallucination(text: string): boolean {
  const t = normalize(text);
  if (!t) return true;
  return HALLUCINATIONS.some((h) => {
    const n = normalize(h);
    return n !== "" && (t === n || (t.includes(n) && t.length < n.length + 12));
  });
}

interface WhisperSegment {
  text?: string;
  no_speech_prob?: number;
}

interface WhisperResponse {
  text?: string;
  duration?: number;
  segments?: WhisperSegment[];
}

/** Keeps the segments Whisper believes contain speech, minus known hallucinations. */
export function cleanTranscript(res: WhisperResponse): string {
  const text = Array.isArray(res.segments)
    ? res.segments
        .filter((s) => (s.no_speech_prob ?? 0) < 0.8)
        .map((s) => (s.text ?? "").trim())
        .filter((s) => s && !isLikelyHallucination(s))
        .join(" ")
    : (res.text ?? "");
  const out = text.replace(/\s+/g, " ").trim();
  return isLikelyHallucination(out) ? "" : out;
}

export interface TranscribeOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  audio: Blob;
  filename: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface Transcription {
  text: string;
  durationSec: number | null;
}

/** Sends one recording to an OpenAI-compatible Whisper endpoint (Groq). */
export async function transcribe(opts: TranscribeOptions): Promise<Transcription> {
  const form = new FormData();
  form.append("file", opts.audio, opts.filename);
  form.append("model", opts.model);
  form.append("language", "fr");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  // Spelling hint only: Whisper does not follow instructions given here.
  form.append("prompt", "Conversation en français avec JARVIS, un assistant personnel.");

  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${opts.apiKey}` },
      body: form,
      signal: opts.signal,
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    throw new ProviderError("network", "network error");
  }
  const body = await res.text().catch(() => "");
  if (!res.ok) throw classifyHttpError(res.status, body, [opts.apiKey]);
  let parsed: WhisperResponse;
  try {
    parsed = JSON.parse(body) as WhisperResponse;
  } catch {
    throw new ProviderError("unavailable", "invalid transcription response", res.status);
  }
  return {
    text: cleanTranscript(parsed),
    durationSec: typeof parsed.duration === "number" ? parsed.duration : null,
  };
}
