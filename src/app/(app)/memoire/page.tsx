"use client";

import { useEffect, useMemo, useState } from "react";

import SetupNotice from "@/components/SetupNotice";
import { createMemory, deleteMemory, listMemories, updateMemory, type MemoryInput } from "@/lib/client/data";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  MEMORY_CATEGORY_LABELS,
  MEMORY_STATUS_LABELS,
  type Memory,
  type MemoryCategory,
  type MemoryStatus,
} from "@/lib/types";

const CATEGORIES = Object.keys(MEMORY_CATEGORY_LABELS) as MemoryCategory[];
const STATUS_ORDER: MemoryStatus[] = ["confirmed", "suggested", "outdated"];
const STATUS_HELP: Record<MemoryStatus, string> = {
  confirmed: "Faits validés : JARVIS les utilise dans ses réponses.",
  suggested: "Hypothèses : jamais traitées comme des faits. Confirmez-les ou supprimez-les.",
  outdated: "Informations dépassées : conservées pour l'historique, ignorées par JARVIS.",
};

const EMPTY: MemoryInput = { content: "", category: "personal", importance: 3, status: "confirmed" };

function MemoryForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: MemoryInput;
  onSubmit: (v: MemoryInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.content.trim()) return;
        setBusy(true);
        try {
          await onSubmit({ ...v, content: v.content.trim() });
          if (!onCancel) setV(EMPTY);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span className="field-label">Ce que JARVIS doit retenir</span>
        <textarea
          className="textarea"
          rows={2}
          maxLength={2000}
          value={v.content}
          onChange={(e) => setV({ ...v, content: e.target.value })}
          placeholder="Ex. : Je préfère des réponses courtes le matin."
        />
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">Catégorie</span>
          <select
            className="select"
            value={v.category}
            onChange={(e) => setV({ ...v, category: e.target.value as MemoryCategory })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {MEMORY_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Importance : {v.importance}/5</span>
          <input
            className="range"
            type="range"
            min={1}
            max={5}
            value={v.importance}
            onChange={(e) => setV({ ...v, importance: Number(e.target.value) })}
            style={{ marginTop: 12 }}
          />
        </label>
      </div>
      <div className="field">
        <span className="field-label">Statut</span>
        <div className="segmented">
          {STATUS_ORDER.map((s) => (
            <button key={s} type="button" aria-pressed={v.status === s} onClick={() => setV({ ...v, status: s })}>
              {MEMORY_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Annuler
          </button>
        )}
        <button className="btn btn-primary btn-sm" disabled={busy || !v.content.trim()}>
          {busy ? "…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function MemoryPage() {
  const sb = getBrowserSupabase();
  const [items, setItems] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MemoryCategory | "all">("all");
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    listMemories(sb)
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, [sb]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (m) => (category === "all" || m.category === category) && (!q || m.content.toLowerCase().includes(q)),
    );
  }, [items, query, category]);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!sb) {
    return (
      <main className="screen">
        <h1 className="h1">Mémoire</h1>
        <SetupNotice what="La mémoire" />
      </main>
    );
  }

  return (
    <main className="screen">
      <h1 className="h1">Mémoire</h1>
      <p className="lead">
        Ce que JARVIS sait de vous — uniquement ce que vous autorisez. Vous pouvez tout corriger ou supprimer.
      </p>

      <section className="panel">
        <h2 className="panel-title">Nouveau souvenir</h2>
        <MemoryForm
          initial={EMPTY}
          submitLabel="Mémoriser"
          onSubmit={(v) =>
            run(async () => {
              const row = await createMemory(sb, v);
              setItems((list) => [row, ...(list ?? [])]);
            })
          }
        />
      </section>

      {error && (
        <div className="notice" data-variant="error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      <section className="panel">
        <input
          className="input"
          type="search"
          placeholder="Rechercher dans la mémoire"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div className="chips">
          <button type="button" className="chip" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
            Tout
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {MEMORY_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </section>

      {items === null && !error && <div className="empty">Chargement…</div>}

      {STATUS_ORDER.map((status) => {
        const group = filtered.filter((m) => m.status === status);
        if (items !== null && group.length === 0 && status !== "confirmed") return null;
        return (
          <section className="panel" key={status}>
            <h2 className="panel-title">
              {MEMORY_STATUS_LABELS[status]}s · {group.length}
            </h2>
            <p className="muted small" style={{ marginTop: -6 }}>
              {STATUS_HELP[status]}
            </p>
            {group.length === 0 ? (
              <div className="empty">Aucun souvenir confirmé pour l&apos;instant.</div>
            ) : (
              <ul className="list">
                {group.map((m) => (
                  <li key={m.id}>
                    {editing === m.id ? (
                      <MemoryForm
                        initial={{ content: m.content, category: m.category, importance: m.importance, status: m.status }}
                        submitLabel="Enregistrer"
                        onCancel={() => setEditing(null)}
                        onSubmit={(v) =>
                          run(async () => {
                            const row = await updateMemory(sb, m.id, v);
                            setItems((list) => (list ?? []).map((x) => (x.id === m.id ? row : x)));
                            setEditing(null);
                          })
                        }
                      />
                    ) : (
                      <>
                        <div style={{ lineHeight: 1.5 }}>{m.content}</div>
                        <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                          <span className="muted small">
                            {MEMORY_CATEGORY_LABELS[m.category]} · {"★".repeat(m.importance)}
                            {m.source === "assistant" ? " · proposé par JARVIS" : ""}
                          </span>
                          <span style={{ display: "flex", gap: 6 }}>
                            {m.status !== "confirmed" && (
                              <button
                                className="btn btn-sm"
                                onClick={() =>
                                  run(async () => {
                                    const row = await updateMemory(sb, m.id, { status: "confirmed" });
                                    setItems((list) => (list ?? []).map((x) => (x.id === m.id ? row : x)));
                                  })
                                }
                              >
                                Confirmer
                              </button>
                            )}
                            {m.status === "confirmed" && (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() =>
                                  run(async () => {
                                    const row = await updateMemory(sb, m.id, { status: "outdated" });
                                    setItems((list) => (list ?? []).map((x) => (x.id === m.id ? row : x)));
                                  })
                                }
                              >
                                Obsolète
                              </button>
                            )}
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(m.id)}>
                              Modifier
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => {
                                if (!window.confirm("Supprimer définitivement ce souvenir ?")) return;
                                void run(async () => {
                                  await deleteMemory(sb, m.id);
                                  setItems((list) => (list ?? []).filter((x) => x.id !== m.id));
                                });
                              }}
                            >
                              Supprimer
                            </button>
                          </span>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
