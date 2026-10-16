"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { deleteMemory, listConversations, listMessages, loadSettings, updateMemory } from "@/lib/client/data";
import { readNdjson } from "@/lib/client/ndjson";
import { VoiceRecorder, canRecord, describeMicError, type RecordSession } from "@/lib/client/recorder";
import { useClientValue } from "@/lib/client/useClientValue";
import { useStatus } from "@/lib/client/useStatus";
import { Speaker, canListen, canSpeak, listenOnce, takeSentences } from "@/lib/client/voice";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { TONE_LABELS, type Tone } from "@/lib/tone";
import { MEMORY_CATEGORY_LABELS, type ChatStreamEvent, type MemoryCategory } from "@/lib/types";

import Core, { CORE_STATE_LABELS, type CoreState } from "./Core";
import { IconMic, IconPlus, IconSend, IconSpeaker, IconStop } from "./Icons";
import Markdown from "./Markdown";

interface UiMessage {
  key: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "complete" | "interrupted" | "error";
  tone?: string;
  meta?: string;
  warnings?: string[];
  suggestions?: Suggestion[];
}

interface Suggestion {
  id: string;
  content: string;
  category: MemoryCategory;
  state: "pending" | "busy" | "saved" | "dismissed";
}

/** Set by "Nouvelle conversation" so that returning to this tab does not resume the previous one. */
const FRESH_KEY = "jarvis.freshConversation";
function setFresh(on: boolean) {
  try {
    if (on) sessionStorage.setItem(FRESH_KEY, "1");
    else sessionStorage.removeItem(FRESH_KEY);
  } catch {
    // storage unavailable (private mode): the last conversation is simply resumed
  }
}
function isFresh(): boolean {
  try {
    return sessionStorage.getItem(FRESH_KEY) === "1";
  } catch {
    return false;
  }
}

const SUGGESTIONS = [
  "Qu'est-ce que tu sais faire pour l'instant ?",
  "Aide-moi à organiser ma journée de demain",
  "Donne-moi ton avis franc sur une idée",
  "Explique-moi un sujet complexe simplement",
];

function greeting(address: string): string {
  const h = new Date().getHours();
  const part = h < 5 ? "Bonne nuit" : h < 18 ? "Bonjour" : "Bonsoir";
  return `${part}, ${address}.`;
}

let keySeq = 0;
const nextKey = () => `m${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export default function ChatScreen() {
  const { status } = useStatus();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("c"),
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [core, setCore] = useState<CoreState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [address, setAddress] = useState("Monsieur");
  const [voiceOut, setVoiceOut] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [conversing, setConversing] = useState(false);
  const canSpeakHere = useClientValue(canSpeak, false);
  const canListenHere = useClientValue(canListen, false);
  const canRecordHere = useClientValue(canRecord, false);
  // Whisper (server) when available; Safari dictation otherwise.
  const whisper = canRecordHere && status?.voice?.transcription === true;
  const micAvailable = whisper || canListenHere;

  const abortRef = useRef<AbortController | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const stopListenRef = useRef<(() => void) | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const voicePrefs = useRef({ name: "", rate: 1 });
  const voiceOutRef = useRef(false);
  /** True once the user sent something: a late conversation restore must not overwrite it. */
  const touchedRef = useRef(false);
  // Refs read by the hands-free loop, which outlives a single render.
  const conversationIdRef = useRef<string | null>(conversationId);
  const busyRef = useRef(false);
  const conversingRef = useRef(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const sessionRef = useRef<RecordSession | null>(null);

  const setConversation = useCallback((id: string | null) => {
    conversationIdRef.current = id;
    setConversationId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("c", id);
    else url.searchParams.delete("c");
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    voiceOutRef.current = voiceOut;
  }, [voiceOut]);

  // Feature detection and settings.
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    loadSettings(sb)
      .then((s) => {
        setAddress(s.address_as || s.user_name || "Monsieur");
        setVoiceOut(s.voice_enabled && canSpeak());
        voicePrefs.current = { name: s.voice_name, rate: s.voice_rate };
      })
      .catch(() => undefined);
  }, []);

  // Restore the conversation from ?c=<id> (history links), otherwise resume the latest one.
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    const restore = async () => {
      let id = new URLSearchParams(window.location.search).get("c");
      if (!id) {
        if (isFresh()) return;
        const [last] = await listConversations(sb, 1);
        if (!last || touchedRef.current) return;
        id = last.id;
      }
      const rows = await listMessages(sb, id);
      if (touchedRef.current) return;
      setConversation(id);
      setMessages(
        rows.map((r) => ({
          key: r.id,
          role: r.role,
          content: r.content,
          status: r.status,
          tone: r.tone ?? undefined,
        })),
      );
    };
    restore().catch(() => setNotice("Impossible de charger la conversation."));
  }, [setConversation]);

  // Releases the microphone when leaving the screen.
  useEffect(
    () => () => {
      conversingRef.current = false;
      recorderRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    if (messages.length === 0) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const getSpeaker = useCallback(async () => {
    if (!speakerRef.current) {
      const sp = new Speaker({
        voiceName: voicePrefs.current.name,
        rate: voicePrefs.current.rate,
        onStart: () => {
          setSpeaking(true);
          setCore("speaking");
        },
        onEnd: () => {
          setSpeaking(false);
          setCore((c) => (c === "speaking" ? "idle" : c));
        },
      });
      await sp.init();
      speakerRef.current = sp;
    }
    return speakerRef.current;
  }, []);

  const interrupt = useCallback(() => {
    conversingRef.current = false;
    setConversing(false);
    sessionRef.current?.cancel();
    abortRef.current?.abort();
    speakerRef.current?.stop();
    stopListenRef.current?.();
    setListening(false);
  }, []);

  /** Sends a message and streams the reply. Resolves with the reply text (null on failure). */
  const send = useCallback(
    async (raw: string): Promise<string | null> => {
      const text = raw.trim();
      if (!text || busyRef.current) return null;
      setNotice(null);
      touchedRef.current = true;

      if (!isSupabaseConfigured) {
        setNotice("Mode aperçu : connectez Supabase pour discuter avec JARVIS (voir Dashboard).");
        return null;
      }
      if (status && !status.aiConfigured) {
        setNotice("Aucun fournisseur IA n'est configuré : JARVIS ne peut pas encore répondre. Voir Dashboard > Diagnostic.");
        return null;
      }

      const speakNow = (voiceOutRef.current || conversingRef.current) && canSpeak();
      if (speakNow) Speaker.unlock();
      speakerRef.current?.stop();

      const userKey = nextKey();
      const botKey = nextKey();
      setMessages((m) => [
        ...m,
        { key: userKey, role: "user", content: text, status: "complete" },
        { key: botKey, role: "assistant", content: "", status: "streaming" },
      ]);
      setInput("");
      busyRef.current = true;
      setBusy(true);
      setCore("thinking");
      let reply: string | null = null;

      const controller = new AbortController();
      abortRef.current = controller;
      const patchBot = (fn: (m: UiMessage) => UiMessage) =>
        setMessages((list) => list.map((m) => (m.key === botKey ? fn(m) : m)));

      let speechBuffer = "";
      const speaker = speakNow ? await getSpeaker() : null;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, conversationId: conversationIdRef.current ?? undefined }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => null)) as { message?: string } | null;
          patchBot((m) => ({
            ...m,
            status: "error",
            content: err?.message ?? `Erreur ${res.status}.`,
          }));
          setCore("idle");
          return null;
        }

        let replyText = "";
        let started = false;
        for await (const ev of readNdjson<ChatStreamEvent>(res.body)) {
          if (ev.type === "meta") {
            setConversation(ev.conversationId);
            setFresh(false);
            setMessages((list) => list.map((m) => (m.key === userKey ? { ...m, tone: ev.tone } : m)));
          } else if (ev.type === "delta") {
            if (!started) {
              started = true;
              if (!speaker) setCore("speaking");
            }
            replyText += ev.text;
            patchBot((m) => ({ ...m, content: m.content + ev.text }));
            if (speaker) {
              speechBuffer += ev.text;
              const { sentences, rest } = takeSentences(speechBuffer);
              speechBuffer = rest;
              sentences.forEach((s) => speaker.enqueue(s));
            }
          } else if (ev.type === "done") {
            if (speaker && speechBuffer.trim()) speaker.enqueue(speechBuffer);
            speechBuffer = "";
            reply = replyText;
            const u = ev.usage;
            const tokens = `${u.estimated ? "≈" : ""}${(u.inputTokens + u.outputTokens).toLocaleString("fr-FR")} jetons`;
            const cost = u.costUsd > 0 ? ` · ${u.costUsd.toFixed(4)} $` : "";
            patchBot((m) => ({
              ...m,
              status: ev.stop === "interrupted" ? "interrupted" : "complete",
              meta: `${tokens}${cost}${ev.stop === "max_tokens" ? " · réponse tronquée" : ""}`,
              warnings: ev.warnings,
              suggestions: ev.memorySuggestions?.map((s) => ({ ...s, state: "pending" as const })),
            }));
          } else if (ev.type === "error") {
            patchBot((m) => ({
              ...m,
              status: "error",
              content: m.content ? `${m.content}\n\n⚠️ ${ev.message}` : ev.message,
              meta:
                [ev.reason ? `motif : ${ev.reason}` : "", ev.detail ? `message du fournisseur : « ${ev.detail} »` : ""]
                  .filter(Boolean)
                  .join(" · ") || m.meta,
            }));
          }
        }
      } catch {
        if (controller.signal.aborted) {
          patchBot((m) => ({ ...m, status: "interrupted", meta: "Interrompu" }));
        } else {
          patchBot((m) => ({
            ...m,
            status: "error",
            content: m.content || "Connexion interrompue avec le serveur.",
          }));
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
        abortRef.current = null;
        setMessages((list) =>
          list.map((m) => (m.key === botKey && m.status === "streaming" ? { ...m, status: "complete" } : m)),
        );
        setCore((c) => (speakerRef.current?.busy ? "speaking" : c === "speaking" || c === "thinking" ? "idle" : c));
      }
      return reply;
    },
    [getSpeaker, setConversation, status],
  );

  /**
   * Records one utterance (stops by itself after a pause) and returns its
   * transcript, or null when nothing usable was said.
   */
  const captureSpeech = useCallback(async (inConversation = false): Promise<string | null> => {
    const recorder = (recorderRef.current ??= new VoiceRecorder());
    try {
      await recorder.open();
    } catch (err) {
      setNotice(describeMicError(err));
      return null;
    }
    setListening(true);
    setCore("listening");
    if (!recorder.detectsPauses) setNotice("Touchez le micro quand vous avez fini de parler.");
    let result;
    try {
      const session = recorder.record();
      sessionRef.current = session;
      stopListenRef.current = () => session.stop();
      result = await session.done;
    } catch {
      result = { kind: "cancelled" as const };
    } finally {
      sessionRef.current = null;
      stopListenRef.current = null;
      // iOS plays speech quietly while the microphone is open: release it before JARVIS answers.
      recorder.release();
      setListening(false);
    }
    if (result.kind === "no_speech") {
      setCore("idle");
      setNotice(
        inConversation
          ? "Conversation en pause : je n'entends plus rien. Touchez le noyau pour reprendre."
          : "Je n'ai rien entendu. Touchez le micro et parlez normalement.",
      );
      return null;
    }
    if (result.kind !== "audio") {
      setCore("idle");
      return null;
    }

    setTranscribing(true);
    setCore("thinking");
    try {
      const form = new FormData();
      form.append("audio", result.blob, "audio");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { text?: string; message?: string; detail?: string } | null;
      if (!res.ok) {
        setNotice(
          `${data?.message ?? `Transcription impossible (erreur ${res.status}).`}${data?.detail ? ` Message du fournisseur : « ${data.detail} »` : ""}`,
        );
        return null;
      }
      const text = data?.text?.trim() ?? "";
      if (!text) setNotice("Je n'ai pas compris. Pouvez-vous répéter ?");
      return text || null;
    } catch {
      setNotice("Transcription interrompue : vérifiez la connexion.");
      return null;
    } finally {
      setTranscribing(false);
      setCore((c) => (c === "thinking" ? "idle" : c));
    }
  }, []);

  /** Hands-free mode: listen, answer aloud, listen again, until stopped or silence. */
  const startConversation = useCallback(async () => {
    if (conversingRef.current || busyRef.current) return;
    setNotice(null);
    touchedRef.current = true;
    Speaker.unlock();
    speakerRef.current?.stop();
    conversingRef.current = true;
    setConversing(true);
    try {
      while (conversingRef.current) {
        const heard = await captureSpeech(true);
        if (!heard || !conversingRef.current) break;
        const reply = await send(heard);
        if (reply === null || !conversingRef.current) break;
        const speaker = speakerRef.current;
        if (speaker?.busy) {
          // iOS sometimes never reports the end of speech: do not wait forever.
          const watchdog = new Promise<void>((r) => setTimeout(r, 8000 + reply.length * 90));
          await Promise.race([speaker.whenIdle(), watchdog]);
        }
      }
    } finally {
      conversingRef.current = false;
      setConversing(false);
    }
  }, [captureSpeech, send]);

  const stopConversation = useCallback(() => {
    conversingRef.current = false;
    setConversing(false);
    sessionRef.current?.cancel();
    stopListenRef.current = null;
    recorderRef.current?.release();
    speakerRef.current?.stop();
    setListening(false);
    setCore("idle");
  }, []);

  const toggleListen = () => {
    if (listening) {
      stopListenRef.current?.();
      return;
    }
    speakerRef.current?.stop();
    setNotice(null);
    if (voiceOutRef.current) Speaker.unlock();
    if (whisper) {
      touchedRef.current = true;
      void captureSpeech().then((text) => text && send(text));
      return;
    }
    const stop = listenOnce({
      onInterim: (t) => setInput(t),
      onFinal: (t) => {
        setInput(t);
        void send(t);
      },
      onError: (msg) => setNotice(msg),
      onEnd: () => {
        setListening(false);
        stopListenRef.current = null;
        setCore((c) => (c === "listening" ? "idle" : c));
      },
    });
    if (stop) {
      stopListenRef.current = stop;
      setListening(true);
      setCore("listening");
    }
  };

  const answerSuggestion = async (messageKey: string, id: string, keep: boolean) => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    const patch = (state: Suggestion["state"]) =>
      setMessages((list) =>
        list.map((m) =>
          m.key === messageKey
            ? { ...m, suggestions: m.suggestions?.map((s) => (s.id === id ? { ...s, state } : s)) }
            : m,
        ),
      );
    patch("busy");
    try {
      if (keep) await updateMemory(sb, id, { status: "confirmed" });
      else await deleteMemory(sb, id);
      patch(keep ? "saved" : "dismissed");
    } catch {
      patch("pending");
      setNotice("Impossible d'enregistrer votre choix. Réessayez, ou passez par l'écran Mémoire.");
    }
  };

  const newConversation = () => {
    interrupt();
    touchedRef.current = true;
    setFresh(true);
    setMessages([]);
    setConversation(null);
    setNotice(null);
    setCore("idle");
  };

  const empty = messages.length === 0;
  const caption = transcribing
    ? "Transcription"
    : busy && core === "speaking" && !speaking
      ? "Réponse"
      : core === "idle" && conversing
        ? "Conversation"
        : CORE_STATE_LABELS[core];
  // The core starts a spoken conversation when JARVIS can both hear and speak.
  const coreTalks = whisper && canSpeakHere;
  const setupMissing = !isSupabaseConfigured || (status !== null && !status.aiConfigured);

  return (
    <div className="screen-fixed">
      <div className="core-stage" data-size={empty ? "large" : "compact"}>
        {coreTalks ? (
          <button
            type="button"
            className="core-button"
            data-active={conversing}
            onClick={() => (conversing ? stopConversation() : void startConversation())}
            disabled={!conversing && busy}
            aria-pressed={conversing}
            aria-label={conversing ? "Arrêter la conversation vocale" : "Démarrer une conversation vocale"}
          >
            <Core state={core} className="core-canvas" />
          </button>
        ) : (
          <Core state={core} className="core-canvas" />
        )}
        <span className="core-caption" aria-live="polite">
          {caption}
        </span>
        {!empty && (
          <button
            type="button"
            className="icon-btn"
            style={{ position: "absolute", left: 16, top: 8, width: 38, height: 38 }}
            onClick={newConversation}
            aria-label="Nouvelle conversation"
          >
            <IconPlus />
          </button>
        )}
        {canSpeakHere && (
          <button
            type="button"
            className="icon-btn"
            data-variant={voiceOut ? "primary" : undefined}
            style={{ position: "absolute", right: 16, top: 8, width: 38, height: 38 }}
            onClick={() => {
              if (voiceOut) speakerRef.current?.stop();
              else Speaker.unlock();
              setVoiceOut((v) => !v);
            }}
            aria-pressed={voiceOut}
            aria-label={voiceOut ? "Désactiver la lecture vocale" : "Activer la lecture vocale"}
          >
            <IconSpeaker />
          </button>
        )}
      </div>

      <div className="messages" ref={listRef}>
        {empty && (
          <div style={{ textAlign: "center", padding: "4px 8px 0" }}>
            <h1 className="h1" style={{ fontSize: 22 }}>
              {greeting(address)}
            </h1>
            <p className="lead" style={{ marginBottom: 12 }}>
              {setupMissing
                ? "Mon interface est prête. Il me manque encore une mémoire et un cerveau : voyez le Dashboard."
                : coreTalks
                  ? "Je vous écoute. Écrivez, touchez le micro, ou touchez le noyau pour une conversation à voix haute."
                  : "Je vous écoute. Écrivez, ou touchez le micro."}
            </p>
            {setupMissing && (
              <Link className="btn btn-sm" href="/dashboard">
                Ouvrir le diagnostic
              </Link>
            )}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.key} className={`msg ${m.role === "user" ? "msg-user" : "msg-assistant"}`}>
            {m.role === "user" ? (
              <>
                {m.content}
                {m.tone && m.tone !== "neutral" && (
                  <div className="msg-meta" style={{ justifyContent: "flex-end" }}>
                    ton perçu : {TONE_LABELS[m.tone as Tone] ?? m.tone}
                  </div>
                )}
              </>
            ) : (
              <>
                {m.content ? <Markdown text={m.content} /> : null}
                {m.status === "streaming" && <span className="cursor" aria-hidden="true" />}
                {(m.meta || m.status === "error" || m.status === "interrupted") && (
                  <div className="msg-meta">
                    {m.status === "error" && <span className="badge" data-variant="danger">échec</span>}
                    {m.status === "interrupted" && <span className="badge" data-variant="warn">interrompu</span>}
                    {m.meta && <span>{m.meta}</span>}
                  </div>
                )}
                {m.suggestions?.map((s) => (
                  <div key={s.id} className="memory-proposal">
                    <div className="muted small">
                      {s.state === "saved"
                        ? "Retenu — visible dans Mémoire"
                        : s.state === "dismissed"
                          ? "Ignoré"
                          : `JARVIS propose de retenir · ${MEMORY_CATEGORY_LABELS[s.category]}`}
                    </div>
                    <div style={{ margin: "4px 0 8px", opacity: s.state === "dismissed" ? 0.5 : 1 }}>{s.content}</div>
                    {(s.state === "pending" || s.state === "busy") && (
                      <div className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={s.state === "busy"}
                          onClick={() => void answerSuggestion(m.key, s.id, true)}
                        >
                          Retenir
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={s.state === "busy"}
                          onClick={() => void answerSuggestion(m.key, s.id, false)}
                        >
                          Ignorer
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {m.warnings?.map((w) => (
                  <div key={w} className="notice" style={{ marginTop: 8, fontSize: 13 }}>
                    {w}
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
        {notice && (
          <div className="notice" role="alert">
            {notice}
          </div>
        )}
      </div>

      {empty && !setupMissing && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => void send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        {micAvailable && (
          <button
            type="button"
            className="icon-btn"
            data-active={listening}
            onClick={toggleListen}
            disabled={busy || transcribing}
            aria-pressed={listening}
            aria-label={listening ? "Arrêter l'écoute" : "Parler à JARVIS"}
          >
            <IconMic />
          </button>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.innerWidth > 720) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder={listening ? "Je vous écoute…" : "Message à JARVIS"}
          rows={1}
          maxLength={8000}
          aria-label="Message"
          enterKeyHint="send"
        />
        {busy || speaking ? (
          <button type="button" className="icon-btn" data-active="true" onClick={interrupt} aria-label="Interrompre">
            <IconStop />
          </button>
        ) : (
          <button
            type="submit"
            className="icon-btn"
            data-variant="primary"
            disabled={!input.trim()}
            aria-label="Envoyer"
          >
            <IconSend />
          </button>
        )}
      </form>
    </div>
  );
}
