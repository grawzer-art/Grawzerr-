"use client";

/**
 * Voice I/O built on the browser's native Web Speech APIs (free, on-device on
 * iPhone). Nothing is simulated: each capability is feature-detected and the
 * UI says plainly when it is unavailable.
 */

// ── Speech synthesis (JARVIS speaks) ──────────────────────────────

const MALE_HINTS = [
  "thomas",
  "nicolas",
  "henri",
  "jacques",
  "paul",
  "gregoire",
  "grégoire",
  "eddy",
  "reed",
  "rocko",
  "grandpa",
  "daniel",
  "male",
  "homme",
  "guy",
  "antoine",
  "jean",
];

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function isLikelyMale(voice: SpeechSynthesisVoice): boolean {
  const n = voice.name.toLowerCase();
  return MALE_HINTS.some((h) => n.includes(h));
}

/** French voices, likely-male first, then higher-quality ("Enhanced"/"Premium") first. */
export function sortFrenchVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const quality = (v: SpeechSynthesisVoice) => (/premium|enhanced|amélioré|neural/i.test(v.name) ? 1 : 0);
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith("fr"))
    .sort(
      (a, b) =>
        Number(isLikelyMale(b)) - Number(isLikelyMale(a)) ||
        quality(b) - quality(a) ||
        Number(b.lang === "fr-FR") - Number(a.lang === "fr-FR") ||
        a.name.localeCompare(b.name),
    );
}

/** Voices load asynchronously on most browsers; resolves when available (or after a timeout). */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

/** Removes Markdown symbols so they are not read aloud. */
export function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " (bloc de code) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/https?:\/\/\S+/g, "le lien")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits streamed text into complete sentences. Returns the sentences ready to
 * be spoken and the remainder still being written.
 */
export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const re = /[^.!?…\n]+(?:[.!?…]+["»”)]*|\n+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer)) !== null) {
    const s = m[0].trim();
    if (s) sentences.push(s);
    last = m.index + m[0].length;
  }
  return { sentences, rest: buffer.slice(last) };
}

export interface SpeakerOptions {
  voiceName?: string;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

/** Queues sentences and speaks them one after another; can be interrupted at any time. */
export class Speaker {
  private queue: string[] = [];
  private speaking = false;
  private voice: SpeechSynthesisVoice | null = null;
  private idleWaiters: (() => void)[] = [];

  constructor(private opts: SpeakerOptions = {}) {}

  async init() {
    if (!canSpeak()) return;
    const voices = sortFrenchVoices(await loadVoices());
    this.voice = voices.find((v) => v.name === this.opts.voiceName) ?? voices[0] ?? null;
  }

  /** iOS only allows speech after a user gesture: call this inside a tap handler. */
  static unlock() {
    if (!canSpeak()) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }

  get busy() {
    return this.speaking || this.queue.length > 0;
  }

  /** Resolves once everything queued has been spoken (or stopped). */
  whenIdle(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private notifyIdle() {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((w) => w());
  }

  enqueue(text: string) {
    const clean = toSpeakable(text);
    if (!clean || !canSpeak()) return;
    this.queue.push(clean);
    if (!this.speaking) this.next();
  }

  private next() {
    const text = this.queue.shift();
    if (!text) {
      if (this.speaking) {
        this.speaking = false;
        this.opts.onEnd?.();
      }
      this.notifyIdle();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.voice?.lang ?? "fr-FR";
    if (this.voice) u.voice = this.voice;
    u.rate = this.opts.rate ?? 1;
    u.pitch = 0.95;
    u.onend = () => this.next();
    u.onerror = () => this.next();
    if (!this.speaking) {
      this.speaking = true;
      this.opts.onStart?.();
    }
    window.speechSynthesis.speak(u);
  }

  stop() {
    this.queue = [];
    if (canSpeak()) window.speechSynthesis.cancel();
    if (this.speaking) {
      this.speaking = false;
      this.opts.onEnd?.();
    }
    this.notifyIdle();
  }
}

// ── Speech recognition (JARVIS listens) ───────────────────────────

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return recognitionCtor() !== null;
}

export function describeRecognitionError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Accès au micro ou à la dictée refusé. Autorisez le micro pour ce site (Réglages > Safari > Micro) et vérifiez que la dictée/Siri est activée.";
    case "no-speech":
      return "Je n'ai rien entendu. Réessayez en parlant près du micro.";
    case "audio-capture":
      return "Aucun micro disponible.";
    case "network":
      return "La reconnaissance vocale nécessite une connexion réseau.";
    case "aborted":
      return "";
    default:
      return "La reconnaissance vocale a échoué.";
  }
}

export interface ListenHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

/** Starts one dictation session (stops automatically after a pause). Returns a stop function. */
export function listenOnce(handlers: ListenHandlers): (() => void) | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "fr-FR";
  rec.continuous = false;
  rec.interimResults = true;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    handlers.onInterim((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    const msg = describeRecognitionError(e.error);
    if (msg) handlers.onError(msg);
  };
  rec.onend = () => {
    if (finalText.trim()) handlers.onFinal(finalText.trim());
    handlers.onEnd();
  };
  try {
    rec.start();
  } catch {
    handlers.onError("Impossible de démarrer la reconnaissance vocale.");
    return null;
  }
  return () => rec.stop();
}
