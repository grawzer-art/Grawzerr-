# Sécurité

## ⚠️ Le dépôt GitHub est PUBLIC

Vérifié le 15/10/2026 : `grawzer-art/Grawzerr-` est **public**. Tout son contenu est visible par n'importe qui.

Ce que cela implique :
- **Aucune clé ni mot de passe dans le dépôt.** Les secrets vont uniquement dans les variables d'environnement Vercel. `.gitignore` exclut tous les fichiers `.env*` sauf `.env.example`, qui ne contient que des valeurs factices.
- **Aucune donnée personnelle dans le dépôt.** Conversations, souvenirs et paramètres vivent dans Supabase, jamais dans Git.
- Le code est lisible par tous : la sécurité ne repose pas sur le secret du code, mais sur l'authentification, RLS et les clés côté serveur.
- Si une clé est un jour committée par erreur : **révoque-la immédiatement** chez le fournisseur (la supprimer de Git ne suffit pas, l'historique reste public).

**Recommandation : rendre le dépôt privé.** Depuis l'iPhone : github.com → dépôt → *Settings* → *Danger Zone* → *Change visibility* → *Private*. Vercel continue de fonctionner avec un dépôt privé. Contrepartie : GitHub Actions passe à un quota gratuit de minutes (largement suffisant pour ce projet). Je ne change pas la visibilité moi-même : c'est ta décision.

## Mesures en place

| Exigence | Mise en œuvre |
|---|---|
| Authentification sécurisée | Supabase Auth (mot de passe), inscriptions publiques à désactiver, session en cookies vérifiée côté serveur (`getUser()` / `getClaims()`) |
| Accès limité | `JARVIS_ALLOWED_EMAILS` : liste blanche ; vide = personne |
| Isolation des données | RLS sur toutes les tables + `GRANT` explicites ; rôle anonyme sans accès. 21 vérifications automatisées (`supabase/tests`) |
| Clés API côté serveur | Lues uniquement dans `src/lib/config.ts` (`server-only`) ; jamais renvoyées au client, jamais dans les messages d'erreur |
| Logs serveur | Lignes JSON (`src/lib/server/logger.ts`) : toute valeur passe par un masquage des formats de clés connus (`AIza…`, `AQ.…`, `sk-…`, `gsk_…`, `Bearer …`, `?key=`) et de la clé configurée ; seuls le format et la longueur de la clé sont journalisés |
| Journal des actions | Table `action_log` en ajout seul (non modifiable, non supprimable individuellement) |
| Consommation | `usage_events` en ajout seul ; garde-fous budgétaires qui échouent fermés |
| Injections de prompt | Les données (souvenirs, préférences, futurs emails/documents) sont encadrées par des balises et désignées comme données ; les chevrons sont neutralisés pour empêcher de fermer une balise |
| Souvenirs proposés par l'IA | Toujours enregistrés comme hypothèses (`suggested`, source `assistant`), jamais utilisés comme faits avant votre validation : une injection de prompt peut au pire créer une proposition, que vous ignorez |
| Audio | Le micro ne s'ouvre que sur un geste (micro ou noyau) et se ferme dès la fin de la phrase ; l'enregistrement part uniquement vers `/api/transcribe` puis Groq, n'est jamais stocké, et `JARVIS_TRANSCRIPTION=off` le garde sur l'appareil |
| Aucun faux résultat | Le prompt interdit d'inventer des actions ; l'interface affiche les échecs et les interruptions tels quels ; les fonctions non disponibles sont marquées « à venir » |
| Confirmations | Suppressions avec confirmation ; suppression totale avec saisie de « SUPPRIMER » |
| Suppression des données | Fonction SQL `jarvis_delete_my_data()` : efface toutes les lignes de l'utilisateur connecté, uniquement les siennes |
| En-têtes HTTP | CSP stricte (le navigateur ne contacte que l'app et Supabase), `X-Frame-Options: DENY`, `nosniff`, HSTS, `Permissions-Policy` (micro limité à l'app) |
| Requêtes inter-sites | Cookies `SameSite=Lax` + contrôle de l'en-tête `Origin` sur `/api/chat` |
| Rendu des réponses | Mini-moteur Markdown qui produit des éléments React, jamais de HTML brut |
| Cache hors ligne | Le service worker ne met jamais en cache les routes `/api/` |
| Indexation | `robots.txt` et balise `noindex` |

## Limites connues

- La CSP autorise `'unsafe-inline'` pour les scripts, requis par Next.js sans nonce. Durcissement possible plus tard via un nonce dans `proxy.ts`.
- `npm audit` signale une vulnérabilité de déni de service dans `braces`, utilisée uniquement par l'outillage ESLint (développement), pas par l'application déployée.
- Les adresses e-mail de la liste blanche sont stockées dans Vercel, pas dans le dépôt.
