# Architecture de JARVIS

## Vue d'ensemble

```
 iPhone (PWA installée, Safari)
 ┌──────────────────────────────────────────────┐
 │ Next.js / React : noyau Canvas, écrans,      │
 │ voix native (Web Speech), service worker     │
 └───────┬──────────────────────────┬───────────┘
         │ HTTPS (cookies de session)│ HTTPS + RLS
         ▼                           ▼
 Vercel (fonctions serveur)     Supabase (Postgres + Auth)
 ┌───────────────────────────┐  ┌───────────────────────────┐
 │ /api/chat                 │  │ conversations, messages,  │
 │  1. vérifie session +     │◄─┤ memories, jarvis_settings,│
 │     liste blanche         │  │ usage_events, action_log  │
 │  2. garde-fous budget     │─►│ Row Level Security        │
 │  3. prompt personnalité   │  └───────────────────────────┘
 │  4. appel IA en streaming │
 │  5. persistance + journal │──► Fournisseur IA interchangeable
 └───────────────────────────┘    (Gemini, Groq, Mistral, OpenRouter,
                                   OpenAI, Anthropic)
```

- **Les clés IA ne quittent jamais le serveur.** Le navigateur ne connaît que l'URL Supabase et la clé *publishable*, publiques par conception : la sécurité repose sur RLS.
- **Le navigateur lit/écrit directement ses données** (mémoire, paramètres, historique) via Supabase ; RLS garantit qu'un utilisateur n'atteint que ses lignes. Tests : `supabase/tests/10_rls.test.sql`.
- **Le serveur seul parle à l'IA**, après avoir vérifié la session, la liste blanche et les plafonds de consommation (qui échouent « fermés » : en cas de doute, pas d'appel).

## Arborescence

| Chemin | Rôle |
|---|---|
| `src/app/(app)/*` | Écrans : JARVIS, Dashboard, Mémoire, Missions, Agenda, Connexions, Historique, Paramètres |
| `src/app/api/chat` | Conversation en streaming (NDJSON) |
| `src/app/api/status` | Diagnostic de configuration (sans secret) |
| `src/proxy.ts` | Rafraîchit la session et redirige vers `/login` |
| `src/components/Core.tsx` | Noyau animé Canvas 2D, 5 états |
| `src/lib/ai/*` | Fournisseurs IA (`gemini.ts` natif, `anthropic.ts`, `openai-compatible.ts`), parseur SSE, classification des erreurs, masquage des secrets, tarifs |
| `src/app/api/ai/check` | Test de connexion IA sans génération (0 jeton) |
| `src/lib/server/logger.ts` | Logs serveur JSON, secrets masqués |
| `src/lib/budget.ts` | Garde-fous de consommation (logique pure, testée) |
| `src/lib/personality.ts` | Prompt système à partir des réglages |
| `src/lib/tone.ts` | Détection transparente du ton |
| `src/lib/client/voice.ts` | Synthèse et dictée natives |
| `supabase/migrations` | Schéma SQL + RLS |
| `tests/` | Tests Vitest (unitaires + intégration de `/api/chat`) |

## Choix techniques

| Besoin | Choix | Pourquoi |
|---|---|---|
| Application | Next.js 16 + React 19 + TypeScript | PWA, routes serveur pour cacher les clés, un seul dépôt |
| Hébergement | Vercel Hobby | Gratuit pour un usage personnel non commercial, déploiement par branche, se configure depuis l'iPhone |
| Données & auth | Supabase Free | Postgres + Auth + RLS, 500 Mo, pgvector disponible pour la recherche sémantique |
| IA | Couche fournisseurs interchangeable | Changer de modèle = changer une variable d'environnement. Gemini passe par l'API native de Google (`streamGenerateContent`, clé dans l'en-tête `x-goog-api-key`), seule compatible de façon fiable avec les clés « AQ. » ; Claude par le SDK officiel ; les autres par le protocole compatible OpenAI |
| Voix | Web Speech API native | Gratuite, voix iOS de qualité (« Thomas »), pas de serveur audio |
| Animations | Canvas 2D, ≤ 2× DPR, pause en arrière-plan | Fluide sur iPhone sans dépendance 3D lourde |

## Fournisseurs IA — comparatif (octobre 2026)

Les offres gratuites changent souvent ; chiffres issus de sources publiques, **à confirmer** sur la page de chaque fournisseur.

| Fournisseur | Coût | Confidentialité | Limites | Remarque |
|---|---|---|---|---|
| **Google Gemini** (AI Studio, sans facturation) | 0 € | Données du niveau gratuit utilisables pour améliorer les produits Google | Quotas par minute et par jour (modèles Flash) | **Défaut recommandé pour démarrer** : bonne qualité en français |
| **Groq** | 0 €, sans carte | Politique de non-entraînement à vérifier | ~30 req/min, ~1 000 req/jour selon le modèle | Très rapide ; modèles open source (Llama, GPT-OSS) |
| **Mistral** (Experiment) | 0 € | Conditions du plan gratuit à vérifier | Limites basses | Entreprise française |
| **OpenRouter** `:free` | 0 € | Dépend du fournisseur sous-jacent | Très limité | Dépannage |
| **Anthropic Claude** | Payant, crédits prépayés | Pas d'entraînement sur les données API par défaut | Plafonds de dépense dans la console | Meilleure personnalité ; Haiku 5.5 : 0,10 $ / 0,50 $ par million de jetons (entrée / sortie), Opus 5.5 : 4 $ / 20 $ |

**Ordre de grandeur** pour un message typique (≈ 3 000 jetons de contexte, 300 en réponse) :
Haiku 5.5 ≈ 0,0005 $ → **1 000 messages ≈ 0,50 $** · Opus 5.5 ≈ 0,02 $ → **1 000 messages ≈ 20 $** (la réflexion interne du modèle ajoute des jetons de sortie).

## Garde-fous de consommation

Vérifiés **avant chaque appel**, à partir de la table `usage_events` :

1. Fournisseur payant + `JARVIS_MONTHLY_BUDGET_USD=0` → **refus** (aucune dépense sans accord explicite).
2. Budget mensuel atteint, ou dépassé par le pire cas de la requête (entrée estimée + sortie maximale) → refus.
3. Plafonds : requêtes/minute, requêtes/24 h, jetons/24 h → refus.
4. Alertes à 80 % affichées sous la réponse.
5. Modèle payant inconnu → tarif volontairement pessimiste.
6. Pas de nouvelle tentative automatique côté Anthropic (chaque appel facturé doit passer par le garde-fou).
7. Si la consommation ne peut pas être lue → refus.

## Migration future vers iOS natif

La logique métier vit côté serveur (`/api/chat`) et dans Supabase. Une app SwiftUI pourra réutiliser Supabase Auth (SDK Swift officiel), appeler les mêmes routes, et remplacer la voix Web Speech par `AVSpeechSynthesizer` / `SFSpeechRecognizer`. Le protocole de streaming NDJSON est indépendant du client.

## Feuille de route technique

**Phase 2 — parle et mémorise**
- ✅ Suggestions de souvenirs (expérimental) : le modèle ajoute en fin de réponse des balises `<souvenir>` que le serveur retire du flux (`src/lib/memory-suggestions.ts`) et enregistre avec le statut `suggested` ; l'utilisateur les retient ou les ignore sous la réponse. Aucun appel IA supplémentaire.
- Recherche sémantique : `pgvector` + embeddings (Gemini propose un modèle d'embeddings gratuit).
- Résumés automatiques des longues conversations (`conversations.summary` existe déjà).
- Rappels internes + Web Push (iOS 16.4+, app installée ; clés VAPID générées une fois).

**Phase 3 — agit**
- Gmail / Calendar : OAuth Google officiel, scopes minimaux (`gmail.readonly`, `calendar.readonly` d'abord), jetons chiffrés côté serveur. Contenus externes encapsulés comme données non fiables.
- Outils (tool use) avec confirmation explicite pour toute action sensible, journalisée.
- Tâches planifiées côté serveur : Supabase `pg_cron` + `pg_net`, ou cron GitHub Actions (gratuit sur dépôt public). Le cron Vercel Hobby est limité (une exécution par jour).
- Raccourcis Apple : un raccourci « Demander à JARVIS » appelant une route protégée par un jeton personnel révocable.

**Phase 4 — proactif**
- Agents spécialisés, missions multi-étapes, centre de contrôle des automatisations (écran Missions).
