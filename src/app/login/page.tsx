"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import Core from "@/components/Core";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getBrowserSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      setError(
        /invalid/i.test(err.message)
          ? "Identifiants incorrects."
          : /confirm/i.test(err.message)
            ? "Adresse e-mail non confirmée dans Supabase."
            : "Connexion impossible pour le moment.",
      );
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <main className="login">
      <div className="login-core">
        <Core state={busy ? "thinking" : "idle"} className="core-canvas" />
      </div>
      <h1 className="h1" style={{ textAlign: "center", letterSpacing: "0.3em", fontSize: 22 }}>
        J.A.R.V.I.S
      </h1>
      <p className="lead" style={{ textAlign: "center" }}>
        Identification requise.
      </p>

      {!isSupabaseConfigured ? (
        <div className="notice">
          Supabase n&apos;est pas encore configuré : la connexion est indisponible. L&apos;interface reste visible en
          mode aperçu.{" "}
          <Link href="/" style={{ textDecoration: "underline" }}>
            Ouvrir l&apos;aperçu
          </Link>
        </div>
      ) : (
        <form className="panel" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Adresse e-mail</span>
            <input
              className="input"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Mot de passe</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div className="notice" data-variant="error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Vérification…" : "Se connecter"}
          </button>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Compte unique créé depuis le tableau de bord Supabase. Les inscriptions publiques sont désactivées.
          </p>
        </form>
      )}
    </main>
  );
}
