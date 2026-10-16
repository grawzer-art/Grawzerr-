"use client";

import { useState } from "react";

import type { AiCheckResult } from "@/app/api/ai/check/route";

/** Dashboard button that tests the AI key and model without generating tokens. */
export default function AiCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/check", { method: "POST", cache: "no-store" });
      const json = (await res.json()) as AiCheckResult & { error?: unknown };
      if (!res.ok) setError(typeof json.error === "string" ? json.error : `Erreur ${res.status}.`);
      else setResult(json);
    } catch {
      setError("Serveur injoignable.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" className="btn btn-sm" onClick={run} disabled={busy}>
        {busy ? "Test en cours…" : "Tester la connexion IA"}
      </button>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        Vérifie la clé, le modèle et une mini-génération (quelques jetons du quota gratuit, 0 €). Pour un
        fournisseur payant, seule la clé est vérifiée : aucun coût.
      </p>
      {error && (
        <div className="notice" data-variant="error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      {result && (
        <div className="notice" data-variant={result.ok ? "info" : "error"} style={{ marginTop: 10 }} role="status">
          <strong>
            {result.ok
              ? result.generation
                ? "Connexion IA opérationnelle : génération de texte testée avec succès."
                : "Clé reconnue. Génération non testée : fournisseur payant, pour ne rien dépenser."
              : "Connexion IA en échec."}
          </strong>
          {result.error && <div style={{ marginTop: 4 }}>{result.error.message}</div>}
          {result.error?.detail && (
            <div className="mono small" style={{ marginTop: 6 }}>
              Message de Google : « {result.error.detail} »
            </div>
          )}
          <div className="mono small" style={{ marginTop: 8, opacity: 0.85 }}>
            {result.label} · modèle {result.model}
            <br />
            {result.keyEnv} : {result.key.format}, {result.key.length} caractères
            {result.error?.httpStatus ? (
              <>
                <br />
                HTTP {result.error.httpStatus}
                {result.error.reason ? ` · ${result.error.reason}` : ""}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
