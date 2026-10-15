/** Honest, user-facing status of every planned capability. Keep in sync with README. */

export type ModuleState = "ready" | "experimental" | "planned";

export interface ModuleInfo {
  name: string;
  state: ModuleState;
  phase: 1 | 2 | 3 | 4;
  detail: string;
}

export const MODULES: ModuleInfo[] = [
  { name: "Interface & noyau animé", state: "ready", phase: 1, detail: "PWA installable, 5 états visuels." },
  { name: "Conversation écrite (streaming)", state: "ready", phase: 1, detail: "Nécessite Supabase + une clé IA." },
  { name: "Connexion sécurisée", state: "ready", phase: 1, detail: "Supabase Auth + liste blanche d'e-mails." },
  { name: "Mémoire conversationnelle", state: "ready", phase: 1, detail: "Historique persistant, 40 derniers messages en contexte." },
  { name: "Personnalité réglable", state: "ready", phase: 1, detail: "Humour, sarcasme, tutoiement, longueur, proactivité." },
  { name: "Garde-fous de consommation", state: "ready", phase: 1, detail: "Plafonds par minute, 24 h et budget mensuel." },
  { name: "Mémoire personnelle", state: "ready", phase: 2, detail: "Ajout, correction, obsolescence et suppression manuels." },
  { name: "Détection du ton", state: "experimental", phase: 2, detail: "Heuristique transparente, affichée sous vos messages." },
  { name: "Voix (synthèse et dictée)", state: "experimental", phase: 2, detail: "Voix natives de l'iPhone ; la dictée dépend de Safari/Siri." },
  { name: "Suggestions de souvenirs par JARVIS", state: "planned", phase: 2, detail: "JARVIS proposera, vous validerez." },
  { name: "Recherche sémantique & résumés auto", state: "planned", phase: 2, detail: "Embeddings pgvector + résumés des longues conversations." },
  { name: "Notes, rappels & notifications push", state: "planned", phase: 2, detail: "Web Push iOS 16.4+ (app installée)." },
  { name: "Gmail", state: "planned", phase: 3, detail: "OAuth Google, lecture seule puis envoi après confirmation." },
  { name: "Google Calendar", state: "planned", phase: 3, detail: "Lecture, puis création après autorisation." },
  { name: "Recherche Internet sourcée", state: "planned", phase: 3, detail: "Résultats avec sources." },
  { name: "Automatisations & briefings", state: "planned", phase: 3, detail: "Tâches planifiées côté serveur, centre de contrôle." },
  { name: "Agents spécialisés & missions", state: "planned", phase: 4, detail: "Missions complexes multi-étapes." },
];

export const MODULE_STATE_LABEL: Record<ModuleState, string> = {
  ready: "opérationnel",
  experimental: "expérimental",
  planned: "à venir",
};
