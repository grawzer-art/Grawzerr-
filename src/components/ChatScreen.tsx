"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { listMessages, loadSettings } from "@/lib/client/data";
import { readNdjson } from "@/lib/client/ndjson";
import { useClientValue } from "@/lib/client/useClientValue";
import { useStatus } from "@/lib/client/useStatus";
import { Speaker, canListen, canSpeak, listenOnce, takeSentences } from "@/lib/client/voice";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { TONE_LABELS, type Tone } from "@/lib/tone";
import type { ChatStreamEvent } from "@/lib/types";

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
  const canSpeakHere = useClientValue(canSpeak, false);
  const canListenHere = useClientValue(canListen, false);

  const abortRef = useRef<AbortController | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const stopListenRef = useRef<(() => void) | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const voicePrefs = useRef({ name: "", rate: 1 });
  const voiceOutRef = useRef(false);

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

  // Restore a conversation from ?c=<id> (links from the history screen).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("c");
    const sb = getBrowserSupabase();
    if (!id || !sb) return;
    listMessages(sb, id)
      .then((rows) =>
        setMessages(
          rows.map((r) => ({
            key: r.id,
            role: r.role,
            content: r.content,
            status: r.status,
            tone: r.tone ?? undefined,
          })),
        ),
      )
      .catch(() => setNotice("Impossible de charger cette conversation."));
  }, []);

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
    abortRef.current?.abort();
    speakerRef.current?.stop();
    stopListenRef.current?.();
    setListening(false);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setNotice(null);

      if (!isSupabaseConfigured) {
        setNotice("Mode aperçu : connectez Supabase pour discuter avec JARVIS (voir Dashboard).");
        return;
      }
      if (status && !status.aiConfigured) {
        setNotice("Aucun fournisseur IA n'est configuré : JARVIS ne peut pas encore répondre. Voir Dashboard > Diagnostic.");
        return;
      }

      const speakNow = voiceOutRef.current && canSpeak();
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
      setBusy(true);
      setCore("thinking");

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
          body: JSON.stringify({ message: text, conversationId: conversationId ?? undefined }),
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
          return;
        }

        let started = false;
        for await (const ev of readNdjson<ChatStreamEvent>(res.body)) {
          if (ev.type === "meta") {
            setConversationId(ev.conversationId);
            const url = new URL(window.location.href);
            url.searchParams.set("c", ev.conversationId);
            window.history.replaceState(null, "", url);
            setMessages((list) => list.map((m) => (m.key === userKey ? { ...m, tone: ev.tone } : m)));
          } else if (ev.type === "delta") {
            if (!started) {
              started = true;
              if (!speaker) setCore("speaking");
            }
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
            const u = ev.usage;
            const tokens = `${u.estimated ? "≈" : ""}${(u.inputTokens + u.outputTokens).toLocaleString("fr-FR")} jetons`;
            const cost = u.costUsd > 0 ? ` · ${u.costUsd.toFixed(4)} $` : "";
            patchBot((m) => ({
              ...m,
              status: ev.stop === "interrupted" ? "interrupted" : "complete",
              meta: `${tokens}${cost}${ev.stop === "max_tokens" ? " · réponse tronquée" : ""}`,
              warnings: ev.warnings,
            }));
          } else if (ev.type === "error") {
            patchBot((m) => ({
              ...m,
              status: "error",
              content: m.content ? `${m.content}\n\n⚠️ ${ev.message}` : ev.message,
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
        setBusy(false);
        abortRef.current = null;
        setMessages((list) =>
          list.map((m) => (m.key === botKey && m.status === "streaming" ? { ...m, status: "complete" } : m)),
        );
        setCore((c) => (speakerRef.current?.busy ? "speaking" : c === "speaking" || c === "thinking" ? "idle" : c));
      }
    },
    [busy, conversationId, getSpeaker, status],
  );

  const toggleListen = () => {
    if (listening) {
      stopListenRef.current?.();
      return;
    }
    speakerRef.current?.stop();
    setNotice(null);
    if (voiceOutRef.current) Speaker.unlock();
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

  const newConversation = () => {
    interrupt();
    setMessages([]);
    setConversationId(null);
    setNotice(null);
    setCore("idle");
    const url = new URL(window.location.href);
    url.searchParams.delete("c");
    window.history.replaceState(null, "", url);
  };

  const empty = messages.length === 0;
  const caption = busy && core === "speaking" && !speaking ? "Réponse" : CORE_STATE_LABELS[core];
  const setupMissing = !isSupabaseConfigured || (status !== null && !status.aiConfigured);

  return (
    <div className="screen-fixed">
      <div className="core-stage" data-size={empty ? "large" : "compact"}>
        <Core state={core} className="core-canvas" />
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
        {canListenHere && (
          <button
            type="button"
            className="icon-btn"
            data-active={listening}
            onClick={toggleListen}
            disabled={busy}
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
