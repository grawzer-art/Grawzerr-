"use client";

import { useStatus } from "@/lib/client/useStatus";

const PLANNED = [
  { name: "Gmail", scope: "Lecture seule d'abord (gmail.readonly), envoi uniquement après confirmation.", phase: 3 },
  { name: "Google Calendar", scope: "Lecture des événements, création après autorisation.", phase: 3 },
  { name: "Recherche Internet", scope: "Résultats sourcés, aucune connexion à vos comptes.", phase: 3 },
  { name: "Notifications push", scope: "Web Push, uniquement si JARVIS est installé sur l'écran d'accueil.", phase: 2 },
  { name: "Raccourcis Apple / Siri", scope: "Raccourci « Demander à JARVIS » via une URL sécurisée.", phase: 3 },
];

export default function ConnectionsPage() {
  const { status } = useStatus();
  return (
    <main className="screen">
      <h1 className="h1">Connexions</h1>
      <p className="lead">Chaque service est un connecteur séparé, avec les autorisations minimales.</p>
      <section className="panel">
        <h2 className="panel-title">Actives</h2>
        <ul className="list">
          <li>
            <div className="row">
              <span>Supabase (mémoire & authentification)</span>
              <span className="badge" data-variant={status?.supabaseConfigured ? "ok" : "off"}>
                {status?.supabaseConfigured ? "connecté" : "non configuré"}
              </span>
            </div>
          </li>
          <li>
            <div className="row">
              <span>IA{status?.ai ? ` — ${status.ai.label}` : ""}</span>
              <span className="badge" data-variant={status?.aiConfigured ? "ok" : "off"}>
                {status?.aiConfigured ? "connecté" : "non configuré"}
              </span>
            </div>
            {status?.ai && <div className="muted small mono" style={{ marginTop: 4 }}>{status.ai.model}</div>}
          </li>
        </ul>
      </section>
      <section className="panel">
        <h2 className="panel-title">À venir</h2>
        <ul className="list">
          {PLANNED.map((p) => (
            <li key={p.name}>
              <div className="row">
                <span>{p.name}</span>
                <span className="badge" data-variant="off">
                  phase {p.phase}
                </span>
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                {p.scope}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
