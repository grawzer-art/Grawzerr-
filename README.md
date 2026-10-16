# J.A.R.V.I.S — assistant IA personnel

Assistant personnel inspiré de JARVIS : intelligent, drôle, franc, doté d'une mémoire que vous contrôlez et d'une interface holographique. Application web installable sur iPhone (PWA), conçue pour un coût de **0 €**.

> **Dépôt public** : aucune clé ni donnée personnelle ne doit y figurer. Voir [docs/SECURITE.md](docs/SECURITE.md).

## Démarrer (depuis l'iPhone, sans Mac)

1. **Supabase** : créer le projet, exécuter `supabase/migrations/0001_jarvis_init.sql`, créer son compte.
2. **Clé IA gratuite** : Google AI Studio (Gemini), sans activer la facturation.
3. **Vercel** : importer ce dépôt, renseigner les variables, déployer.
4. **Safari → Partager → Sur l'écran d'accueil.**

Guide détaillé : **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** · Architecture et comparatif des coûts : **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

Sans configuration, l'application tourne en **mode aperçu** : l'interface est visible, et le Dashboard indique précisément ce qui manque. Aucune réponse n'est simulée.

## État des fonctionnalités

| Fonctionnalité | Statut | Détail |
|---|---|---|
| Interface iPhone + noyau animé (5 états) | ✅ Opérationnel | Attente, écoute, réflexion, exécution, parole |
| PWA installable + écran hors ligne | ✅ Opérationnel | Manifeste, icônes, service worker |
| Connexion sécurisée | ✅ Opérationnel* | Supabase Auth + liste blanche d'e-mails |
| Conversation écrite en streaming | ✅ Opérationnel* | Interruption possible, erreurs affichées telles quelles |
| Mémoire conversationnelle persistante | ✅ Opérationnel* | Historique, reprise des conversations |
| Personnalité réglable | ✅ Opérationnel* | Humour, sarcasme, tu/vous, longueur, initiative, préférences relationnelles |
| Fournisseurs IA interchangeables | ✅ Opérationnel* | Gemini (API native, clés « AQ. » et « AIza »), Groq, Mistral, OpenRouter, OpenAI, Claude |
| Test de connexion IA + logs serveur | ✅ Opérationnel* | Dashboard → « Tester la connexion IA » (clé, modèle et mini-génération gratuite) ; Vercel → Logs |
| Garde-fous de consommation | ✅ Opérationnel* | Fournisseurs payants bloqués sans budget, plafonds, alertes |
| Journal d'activité | ✅ Opérationnel* | Écran Historique |
| Suppression de toutes les données | ✅ Opérationnel* | Paramètres → Compte & données |
| Mémoire personnelle (ajout, correction, obsolète, suppression) | ✅ Opérationnel* | Confirmé ≠ hypothèse, JARVIS n'utilise que le confirmé |
| Détection du ton | 🧪 Expérimental | Heuristique transparente, affichée sous vos messages |
| Voix : synthèse masculine + dictée | 🧪 Expérimental | Voix natives iOS ; la dictée dépend de Safari/Siri |
| Suggestions de souvenirs, recherche sémantique, résumés | 🔜 Phase 2 | |
| Rappels et notifications push | 🔜 Phase 2 | |
| Gmail, Google Calendar, recherche Internet | 🔜 Phase 3 | |
| Automatisations, briefings, Raccourcis Apple | 🔜 Phase 3 | |
| Agents spécialisés, missions | 🔜 Phase 4 | |

\* Nécessite la configuration Supabase + clé IA. Vérifié par les tests automatisés ; pas encore testé avec un vrai compte Supabase et une vraie clé IA (voir « Vérifications » ci-dessous).

## Vérifications

| Vérification | Commande | Résultat |
|---|---|---|
| Lint | `npm run lint` | ✅ |
| Types | `npm run typecheck` | ✅ |
| Tests unitaires + intégration `/api/chat` et `/api/ai/check` | `npm test` | ✅ 118 tests |
| Build de production | `npm run build` | ✅ |
| Schéma SQL + 21 vérifications RLS (PostgreSQL 16) | CI `database` | ✅ |
| Rendu iPhone (Chromium, 390×844) | captures manuelles | ✅ sans erreur console |

La CI GitHub Actions (`.github/workflows/ci.yml`) rejoue tout à chaque push.

## Développement

Ces commandes sont exécutées par la CI et par Claude Code ; vous n'en avez pas besoin depuis l'iPhone.

```bash
npm ci
npm run dev        # http://localhost:3000
npm run check      # lint + types + tests + build
```

Variables d'environnement : voir [`.env.example`](.env.example).
