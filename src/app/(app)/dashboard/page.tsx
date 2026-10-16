"use client";

import { useEffect, useState } from "react";

import AiCheck from "@/components/AiCheck";
import ModuleList from "@/components/ModuleList";
import { countRows, listUsageSince } from "@/lib/client/data";
import { useStatus } from "@/lib/client/useStatus";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

interface Usage {
  requests24h: number;
  tokens24h: number;
  costMonth: number;
  estimated: boolean;
}

function Check({ ok, label, hint }: { ok: boolean | undefined; label: string; hint?: string }) {
  return (
    <li>
      <div className="row">
        <span>{label}</span>
        <span className="badge" data-variant={ok === undefined ? "off" : ok ? "ok" : "danger"}>
          {ok === undefined ? "…" : ok ? "OK" : "manquant"}
        </span>
      </div>
      {hint && !ok && <div className="muted small" style={{ marginTop: 4 }}>{hint}</div>}
    </li>
  );
}

function Meter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="meter" data-level={pct >= 80 ? "warn" : undefined}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function DashboardPage() {
  const { status, error } = useStatus();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [counts, setCounts] = useState<{ conversations: number; memories: number; messages: number } | null>(null);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const since = dayAgo < monthStart ? dayAgo : monthStart;
    listUsageSince(sb, since.toISOString())
      .then((rows) => {
        const u: Usage = { requests24h: 0, tokens24h: 0, costMonth: 0, estimated: false };
        for (const r of rows) {
          const at = Date.parse(r.created_at);
          if (at >= dayAgo.getTime()) {
            u.requests24h += 1;
            u.tokens24h += r.input_tokens + r.output_tokens;
          }
          if (at >= monthStart.getTime()) u.costMonth += Number(r.estimated_cost_usd);
          if (r.tokens_estimated) u.estimated = true;
        }
        setUsage(u);
      })
      .catch(() => undefined);
    Promise.all([countRows(sb, "conversations"), countRows(sb, "memories"), countRows(sb, "messages")])
      .then(([conversations, memories, messages]) => setCounts({ conversations, memories, messages }))
      .catch(() => undefined);
  }, []);

  const b = status?.budget;

  return (
    <main className="screen">
      <h1 className="h1">Dashboard</h1>
      <p className="lead">État réel des systèmes. Rien n&apos;est simulé.</p>

      <section className="panel">
        <h2 className="panel-title">Diagnostic</h2>
        {error && <div className="notice" data-variant="error">Diagnostic indisponible (serveur injoignable).</div>}
        <ul className="list">
          <Check
            ok={status ? status.supabaseConfigured && isSupabaseConfigured : undefined}
            label="Base de données & authentification (Supabase)"
            hint="Ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans Vercel, puis redéployez."
          />
          <Check
            ok={status?.aiConfigured}
            label={`Fournisseur IA${status?.ai ? ` — ${status.ai.label}` : ""}`}
            hint={
              status?.ai
                ? `Variable attendue : ${status.ai.keyEnv} (nom exact, en majuscules). Ajoutez-la dans Vercel pour Production, puis redéployez.${
                    status.ai.keyLikeEnvNames?.length
                      ? ` Variables proches trouvées : ${status.ai.keyLikeEnvNames.join(", ")}.`
                      : " Aucune variable de clé trouvée dans ce déploiement."
                  }`
                : "Ajoutez la clé API du fournisseur choisi dans Vercel."
            }
          />
          <Check
            ok={status?.allowlistConfigured}
            label="Liste blanche d'accès"
            hint="Définissez JARVIS_ALLOWED_EMAILS avec votre adresse : sans elle, personne ne peut utiliser l'IA."
          />
          {status?.authenticated && (
            <Check
              ok={status.allowed}
              label={`Compte ${status.email ?? ""} autorisé`}
              hint="Cette adresse n'est pas dans JARVIS_ALLOWED_EMAILS."
            />
          )}
        </ul>
        {status?.ai && (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Modèle <span className="mono">{status.ai.model}</span> ·{" "}
            {status.ai.paid ? "payant à l'usage" : "niveau gratuit"}. {status.ai.note}
          </p>
        )}
        {status?.authenticated && status.aiConfigured && <AiCheck />}
      </section>

      <section className="panel">
        <h2 className="panel-title">Consommation</h2>
        {!isSupabaseConfigured ? (
          <p className="muted small">Disponible une fois Supabase configuré.</p>
        ) : (
          <div className="grid-2">
            <div className="stat">
              <div className="stat-value">
                {usage?.requests24h ?? "—"}
                {b ? <span className="muted small"> / {b.dailyRequestLimit}</span> : null}
              </div>
              <div className="stat-label">Requêtes (24 h)</div>
              {b && usage && <Meter value={usage.requests24h} max={b.dailyRequestLimit} />}
            </div>
            <div className="stat">
              <div className="stat-value">
                {usage ? `${usage.estimated ? "≈" : ""}${Math.round(usage.tokens24h / 1000)}k` : "—"}
              </div>
              <div className="stat-label">
                Jetons (24 h){b ? ` / ${Math.round(b.dailyTokenLimit / 1000)}k` : ""}
              </div>
              {b && usage && <Meter value={usage.tokens24h} max={b.dailyTokenLimit} />}
            </div>
            <div className="stat" style={{ gridColumn: "1 / -1" }}>
              <div className="stat-value">{usage ? `${usage.costMonth.toFixed(4)} $` : "—"}</div>
              <div className="stat-label">
                Coût estimé ce mois-ci
                {b
                  ? b.monthlyBudgetUsd > 0
                    ? ` / budget ${b.monthlyBudgetUsd.toFixed(2)} $`
                    : " · aucun budget payant autorisé"
                  : ""}
              </div>
              {b && usage && b.monthlyBudgetUsd > 0 && <Meter value={usage.costMonth} max={b.monthlyBudgetUsd} />}
            </div>
          </div>
        )}
      </section>

      {counts && (
        <section className="panel">
          <h2 className="panel-title">Données</h2>
          <div className="grid-2">
            <div className="stat">
              <div className="stat-value">{counts.conversations}</div>
              <div className="stat-label">Conversations</div>
            </div>
            <div className="stat">
              <div className="stat-value">{counts.messages}</div>
              <div className="stat-label">Messages</div>
            </div>
            <div className="stat" style={{ gridColumn: "1 / -1" }}>
              <div className="stat-value">{counts.memories}</div>
              <div className="stat-label">Souvenirs</div>
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <h2 className="panel-title">Modules</h2>
        <ModuleList />
      </section>
    </main>
  );
}
