"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import SetupNotice from "@/components/SetupNotice";
import { deleteConversation, listActionLog, listConversations } from "@/lib/client/data";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { ActionLogEntry, Conversation } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  "chat.reply": "Réponse de JARVIS",
  "chat.blocked": "Requête bloquée par un garde-fou",
  "memory.create": "Souvenir ajouté",
  "memory.update": "Souvenir modifié",
  "memory.delete": "Souvenir supprimé",
  "memory.suggest": "Souvenirs proposés par JARVIS",
  "settings.update": "Paramètres modifiés",
  "conversation.delete": "Conversation supprimée",
  "ai.check": "Test de connexion IA",
};

const STATUS_VARIANT = { success: "ok", failure: "danger", blocked: "warn", pending: "off" } as const;
const STATUS_LABEL = { success: "succès", failure: "échec", blocked: "bloqué", pending: "en attente" } as const;

function fmt(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export default function HistoryPage() {
  const sb = getBrowserSupabase();
  const [tab, setTab] = useState<"conversations" | "journal">("conversations");
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [log, setLog] = useState<ActionLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    listConversations(sb, 100)
      .then(setConversations)
      .catch((e: Error) => setError(e.message));
    listActionLog(sb, 150)
      .then(setLog)
      .catch((e: Error) => setError(e.message));
  }, [sb]);

  if (!sb) {
    return (
      <main className="screen">
        <h1 className="h1">Historique</h1>
        <SetupNotice what="L'historique" />
      </main>
    );
  }

  return (
    <main className="screen">
      <h1 className="h1">Historique</h1>
      <p className="lead">Vos conversations et le journal de tout ce que JARVIS a fait.</p>
      <div className="segmented" style={{ marginBottom: 12 }}>
        <button type="button" aria-pressed={tab === "conversations"} onClick={() => setTab("conversations")}>
          Conversations
        </button>
        <button type="button" aria-pressed={tab === "journal"} onClick={() => setTab("journal")}>
          Journal d&apos;activité
        </button>
      </div>
      {error && <div className="notice" data-variant="error">{error}</div>}

      {tab === "conversations" ? (
        <section className="panel">
          {conversations === null ? (
            <div className="empty">Chargement…</div>
          ) : conversations.length === 0 ? (
            <div className="empty">Aucune conversation pour l&apos;instant.</div>
          ) : (
            <ul className="list">
              {conversations.map((c) => (
                <li key={c.id}>
                  <div className="row">
                    <Link href={`/?c=${c.id}`} style={{ color: "var(--text)", flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                      <div className="muted small">{fmt(c.updated_at)}</div>
                    </Link>
                    <button
                      className="btn btn-ghost btn-sm"
                      aria-label={`Supprimer « ${c.title} »`}
                      onClick={async () => {
                        if (!window.confirm("Supprimer cette conversation et tous ses messages ?")) return;
                        try {
                          await deleteConversation(sb, c.id);
                          setConversations((l) => (l ?? []).filter((x) => x.id !== c.id));
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="panel">
          {log === null ? (
            <div className="empty">Chargement…</div>
          ) : log.length === 0 ? (
            <div className="empty">Journal vide.</div>
          ) : (
            <ul className="list">
              {log.map((e) => (
                <li key={e.id}>
                  <div className="row">
                    <span>{ACTION_LABELS[e.action] ?? e.action}</span>
                    <span className="badge" data-variant={STATUS_VARIANT[e.status]}>
                      {STATUS_LABEL[e.status]}
                    </span>
                  </div>
                  <div className="muted small mono" style={{ marginTop: 4 }}>
                    {fmt(e.created_at)}
                    {typeof e.detail.model === "string" ? ` · ${e.detail.model}` : ""}
                    {typeof e.detail.code === "string" ? ` · ${e.detail.code}` : ""}
                    {typeof e.detail.error === "string" ? ` · ${e.detail.error}` : ""}
                    {typeof e.detail.reason === "string" ? ` · ${e.detail.reason}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
