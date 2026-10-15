"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import SetupNotice from "@/components/SetupNotice";
import { deleteAllMyData, loadSettings, saveSettings } from "@/lib/client/data";
import { Speaker, canListen, canSpeak, isLikelyMale, loadVoices, sortFrenchVoices } from "@/lib/client/voice";
import { useClientValue } from "@/lib/client/useClientValue";
import { DEFAULT_SETTINGS } from "@/lib/personality";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { JarvisSettings } from "@/lib/types";

type Settings = Omit<JarvisSettings, "user_id">;

function Slider({
  label,
  value,
  onChange,
  left,
  right,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  left: string;
  right: string;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label} · <span className="mono">{value}</span>
      </span>
      <input className="range" type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="row muted small">
        <span>{left}</span>
        <span>{right}</span>
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const sb = getBrowserSupabase();
  const router = useRouter();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [email, setEmail] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");
  const support = {
    speak: useClientValue(canSpeak, false),
    listen: useClientValue(canListen, false),
  };

  useEffect(() => {
    loadVoices().then((v) => setVoices(sortFrenchVoices(v)));
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    loadSettings(sb)
      .then((v) => {
        setS(v);
        setLoaded(true);
      })
      .catch((e: Error) => setMessage({ kind: "error", text: e.message }));
  }, [sb]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((prev) => ({ ...prev, [k]: v }));

  if (!sb) {
    return (
      <main className="screen">
        <h1 className="h1">Paramètres</h1>
        <SetupNotice what="L'enregistrement des paramètres" />
      </main>
    );
  }

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveSettings(sb, s);
      setMessage({ kind: "ok", text: "Paramètres enregistrés. Ils s'appliquent dès le prochain message." });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const testVoice = async () => {
    Speaker.unlock();
    const sp = new Speaker({ voiceName: s.voice_name, rate: s.voice_rate });
    await sp.init();
    sp.enqueue(`Bonjour ${s.address_as || "Monsieur"}. Tous les systèmes sont opérationnels. Enfin, presque tous.`);
  };

  return (
    <main className="screen">
      <h1 className="h1">Paramètres</h1>
      <p className="lead">Façonnez la personnalité de JARVIS. Ces réglages évoluent avec vous.</p>

      <section className="panel">
        <h2 className="panel-title">Identité</h2>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">Votre prénom</span>
            <input className="input" value={s.user_name} maxLength={60} onChange={(e) => set("user_name", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">JARVIS vous appelle</span>
            <input className="input" value={s.address_as} maxLength={40} onChange={(e) => set("address_as", e.target.value)} />
          </label>
        </div>
        <div className="field">
          <span className="field-label">Registre</span>
          <div className="segmented">
            <button type="button" aria-pressed={s.formality === "vous"} onClick={() => set("formality", "vous")}>
              Vouvoiement
            </button>
            <button type="button" aria-pressed={s.formality === "tu"} onClick={() => set("formality", "tu")}>
              Tutoiement
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Personnalité</h2>
        <Slider label="Humour" value={s.humor} onChange={(v) => set("humor", v)} left="Sobre" right="Très drôle" />
        <Slider label="Sarcasme & taquinerie" value={s.sarcasm} onChange={(v) => set("sarcasm", v)} left="Aucun" right="Assumé" />
        <Slider label="Initiative" value={s.proactivity} onChange={(v) => set("proactivity", v)} left="Répond seulement" right="Proactif" />
        <div className="field">
          <span className="field-label">Longueur des réponses</span>
          <div className="segmented">
            {(
              [
                ["concise", "Concises"],
                ["adaptive", "Adaptées"],
                ["detailed", "Détaillées"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={s.verbosity === k} onClick={() => set("verbosity", k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="row field">
          <span>
            Adaptation émotionnelle
            <span className="muted small" style={{ display: "block" }}>
              Simulation comportementale : JARVIS ajuste son ton, sans prétendre ressentir.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={s.emotional_adaptation}
            aria-label="Adaptation émotionnelle"
            onClick={() => set("emotional_adaptation", !s.emotional_adaptation)}
          />
        </div>
        <label className="field">
          <span className="field-label">Préférences relationnelles (facultatif)</span>
          <textarea
            className="textarea"
            rows={3}
            maxLength={2000}
            value={s.relationship_notes}
            onChange={(e) => set("relationship_notes", e.target.value)}
            placeholder="Ex. : Taquine-moi sur mon café, jamais sur mon travail. Sois direct quand je procrastine."
          />
        </label>
      </section>

      <section className="panel">
        <h2 className="panel-title">Voix</h2>
        {!support.speak ? (
          <div className="notice">La synthèse vocale n&apos;est pas disponible dans ce navigateur.</div>
        ) : (
          <>
            <div className="row field">
              <span>Lire les réponses à voix haute</span>
              <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={s.voice_enabled}
                aria-label="Lecture vocale"
                onClick={() => set("voice_enabled", !s.voice_enabled)}
              />
            </div>
            <label className="field">
              <span className="field-label">Voix française</span>
              <select className="select" value={s.voice_name} onChange={(e) => set("voice_name", e.target.value)}>
                <option value="">Automatique (masculine si disponible)</option>
                {voices.map((v) => (
                  <option key={`${v.name}-${v.lang}`} value={v.name}>
                    {v.name} ({v.lang}){isLikelyMale(v) ? " · masculine" : ""}
                  </option>
                ))}
              </select>
            </label>
            {voices.length > 0 && !voices.some(isLikelyMale) && (
              <p className="muted small">
                Aucune voix masculine française détectée. Sur iPhone : Réglages &gt; Accessibilité &gt; Contenu énoncé &gt;
                Voix &gt; Français, puis téléchargez « Thomas » (version améliorée de préférence).
              </p>
            )}
            <label className="field">
              <span className="field-label">Débit · {s.voice_rate.toFixed(2)}×</span>
              <input
                className="range"
                type="range"
                min={0.7}
                max={1.4}
                step={0.05}
                value={s.voice_rate}
                onChange={(e) => set("voice_rate", Number(e.target.value))}
              />
            </label>
            <button type="button" className="btn btn-sm" onClick={testVoice}>
              Tester la voix
            </button>
          </>
        )}
        <p className="muted small" style={{ marginBottom: 0 }}>
          Dictée : {support.listen ? "disponible dans ce navigateur" : "non disponible dans ce navigateur"}. JARVIS
          n&apos;écoute que lorsque vous touchez le micro — jamais en arrière-plan.
        </p>
      </section>

      <div style={{ position: "sticky", bottom: 8, zIndex: 5, marginTop: 12 }}>
        {message && (
          <div className="notice" data-variant={message.kind === "ok" ? "info" : "error"} style={{ marginBottom: 8 }}>
            {message.text}
          </div>
        )}
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={save} disabled={saving || !loaded}>
          {saving ? "Enregistrement…" : "Enregistrer les paramètres"}
        </button>
      </div>

      <section className="panel" style={{ marginTop: 24 }}>
        <h2 className="panel-title">Compte & données</h2>
        <p className="muted small">Connecté : {email || "—"}</p>
        <button
          className="btn btn-ghost"
          style={{ width: "100%", marginBottom: 16 }}
          onClick={async () => {
            await sb.auth.signOut();
            router.replace("/login");
            router.refresh();
          }}
        >
          Se déconnecter
        </button>
        <label className="field">
          <span className="field-label">
            Supprimer toutes mes données (conversations, mémoire, paramètres, journal, consommation). Tapez{" "}
            <strong>SUPPRIMER</strong> pour confirmer.
          </span>
          <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </label>
        <button
          className="btn btn-danger"
          style={{ width: "100%" }}
          disabled={confirmText !== "SUPPRIMER"}
          onClick={async () => {
            try {
              await deleteAllMyData(sb);
              setConfirmText("");
              setS(DEFAULT_SETTINGS);
              setMessage({ kind: "ok", text: "Toutes vos données ont été supprimées." });
            } catch (e) {
              setMessage({ kind: "error", text: (e as Error).message });
            }
          }}
        >
          Tout supprimer définitivement
        </button>
      </section>
    </main>
  );
}
