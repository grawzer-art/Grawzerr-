"use client";

/**
 * Microphone capture for the voice mode: records one utterance and stops by
 * itself after a pause (simple energy-based voice activity detection). The
 * audio stays in memory and is only sent to /api/transcribe.
 */

// ── Voice activity detection (pure, unit-tested) ───────────────────

export interface VadOptions {
  /** Silence that ends an utterance once speech has started. */
  silenceMs: number;
  /** Gives up when nobody speaks for this long. */
  noSpeechMs: number;
  /** Hard cap on one utterance. */
  maxMs: number;
}

export const DEFAULT_VAD: VadOptions = { silenceMs: 1300, noSpeechMs: 8000, maxMs: 30_000 };

export type VadState = "waiting" | "speaking" | "done" | "no_speech";

/** Feed it the microphone level (RMS) at regular intervals; it says when to stop. */
export function createVad(opts: VadOptions = DEFAULT_VAD) {
  let floor = 0.01;
  let state: VadState = "waiting";
  let startedAt = -1;
  let voicedFrames = 0;
  let lastVoiceAt = 0;

  return {
    get state() {
      return state;
    },
    step(rms: number, nowMs: number): VadState {
      if (state === "done" || state === "no_speech") return state;
      if (startedAt < 0) startedAt = nowMs;
      const threshold = Math.max(0.02, floor * 3);
      const voiced = rms > threshold;
      // The noise floor follows the room while nobody speaks.
      if (!voiced) floor = floor * 0.95 + rms * 0.05;

      if (state === "waiting") {
        voicedFrames = voiced ? voicedFrames + 1 : 0;
        if (voicedFrames >= 3) {
          state = "speaking";
          lastVoiceAt = nowMs;
        } else if (nowMs - startedAt >= opts.noSpeechMs) {
          state = "no_speech";
        }
      } else {
        if (rms > threshold * 0.6) lastVoiceAt = nowMs;
        if (nowMs - lastVoiceAt >= opts.silenceMs) state = "done";
      }
      if (state !== "no_speech" && nowMs - startedAt >= opts.maxMs) state = state === "waiting" ? "no_speech" : "done";
      return state;
    },
  };
}

// ── Recorder ───────────────────────────────────────────────────────

export function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** iPhone records AAC in MP4; Chrome and Firefox record Opus in WebM/Ogg. */
function pickMimeType(): string | undefined {
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

export type RecordResult =
  | { kind: "audio"; blob: Blob; ms: number }
  | { kind: "no_speech" }
  | { kind: "cancelled" };

export interface RecordSession {
  done: Promise<RecordResult>;
  /** Ends the utterance now and keeps what was said. */
  stop(): void;
  /** Ends the utterance and discards it. */
  cancel(): void;
}

export function describeMicError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Accès au micro refusé. Sur iPhone : Réglages › Safari › Micro (ou appui long sur « aA » › Réglages du site), puis réessayez.";
  }
  if (name === "NotFoundError") return "Aucun micro disponible.";
  return "Impossible d'ouvrir le micro.";
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;

  /** Opens the microphone. The first call must happen inside a tap (iOS). */
  async open(): Promise<void> {
    // The audio context is created and resumed before any await, while the tap is still "active" (iOS).
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    }
    const resumed = this.ctx && this.ctx.state !== "running" ? this.ctx.resume().catch(() => undefined) : null;
    if (!this.stream?.active) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    }
    await resumed;
  }

  /** False when the end of a sentence cannot be detected: the user taps to stop. */
  get detectsPauses(): boolean {
    return this.ctx?.state === "running";
  }

  record(vadOptions: VadOptions = DEFAULT_VAD): RecordSession {
    const stream = this.stream;
    if (!stream) throw new Error("micro fermé");
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const vad = createVad(vadOptions);
    const startedAt = performance.now();
    let outcome: "keep" | "cancel" | "no_speech" = "keep";
    let timer: ReturnType<typeof setInterval> | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    let analyser: AnalyserNode | null = null;
    // A context iOS left suspended would only yield silence: fall back to tap-to-stop.
    if (this.ctx?.state === "running") {
      source = this.ctx.createMediaStreamSource(stream);
      analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
    }
    const samples = new Float32Array(1024);

    const finish = () => {
      if (timer) clearInterval(timer);
      timer = null;
      source?.disconnect();
      if (recorder.state !== "inactive") recorder.stop();
    };

    const done = new Promise<RecordResult>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (outcome === "cancel") return resolve({ kind: "cancelled" });
        if (outcome === "no_speech" || chunks.length === 0) return resolve({ kind: "no_speech" });
        const type = recorder.mimeType || mimeType || chunks[0].type || "audio/mp4";
        resolve({ kind: "audio", blob: new Blob(chunks, { type }), ms: performance.now() - startedAt });
      };
      recorder.onerror = () => resolve({ kind: "cancelled" });
    });

    recorder.start(250);
    if (analyser) {
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        const state = vad.step(Math.sqrt(sum / samples.length), performance.now() - startedAt);
        if (state === "no_speech") {
          outcome = "no_speech";
          finish();
        } else if (state === "done") {
          finish();
        }
      }, 50);
    } else {
      // No Web Audio: no automatic end, the user taps to stop (hard cap kept).
      timer = setInterval(() => {
        if (performance.now() - startedAt >= vadOptions.maxMs) finish();
      }, 250);
    }

    return {
      done,
      stop: () => finish(),
      cancel: () => {
        outcome = "cancel";
        finish();
      },
    };
  }

  /** Releases the microphone (iOS lowers speech volume while it is open). */
  release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  close() {
    this.release();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
