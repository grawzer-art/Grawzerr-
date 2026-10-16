# Configuration de JARVIS — 100 % depuis l'iPhone

Durée : environ 20 minutes. Coût : 0 €. Aucun Mac ni terminal requis.
Tout se fait dans Safari. Ouvre chaque site dans un nouvel onglet.

> Les menus des services évoluent. Si un libellé a changé, cherche l'option la plus proche ;
> l'ordre des étapes reste le même.

---

## Étape 1 — Supabase (mémoire + connexion)

1. Va sur **supabase.com** → *Start your project* → connecte-toi avec GitHub.
2. *New project* : nom `jarvis`, mot de passe de base de données **fort** (garde-le dans le trousseau iCloud), région **Europe (Paris ou Francfort)**, plan **Free**.
3. Attends la fin de la création (1 à 2 minutes).

### 1.a Créer les tables

1. Menu de gauche → **SQL Editor** → *New query*.
2. Sur GitHub (app ou site), ouvre `supabase/migrations/0001_jarvis_init.sql`, touche *Raw*, sélectionne tout et copie.
3. Colle dans l'éditeur SQL de Supabase → **Run**. Tu dois voir `Success. No rows returned`.

Le script est rejouable sans danger. Il crée les tables, active la sécurité RLS (chaque utilisateur ne voit que ses données) et ajoute les autorisations explicites qu'exigent les projets créés après le 30 mai 2026.

### 1.b Créer ton compte (et fermer la porte)

1. **Authentication → Users → Add user → Create new user** : ton e-mail, un mot de passe d'au moins 12 caractères, coche **Auto Confirm User**.
2. **Authentication → Sign In / Providers** (ou *Settings*) : **désactive « Allow new users to sign up »**. Personne d'autre ne pourra créer de compte.

### 1.c Récupérer les deux valeurs publiques

**Project Settings → API Keys** (ou *Data API*) :
- `Project URL` → ce sera `NEXT_PUBLIC_SUPABASE_URL`
- la clé **publishable** (`sb_publishable_…`, ou l'ancienne clé *anon*) → ce sera `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

⚠️ Ne copie **jamais** la clé `secret` / `service_role` : JARVIS n'en a pas besoin.

> Le plan gratuit met le projet **en pause après 7 jours sans activité**. Les données sont conservées ; il suffit de cliquer sur *Restore project* dans le tableau de bord Supabase.

---

## Étape 2 — Une clé IA gratuite (Google Gemini)

1. Va sur **aistudio.google.com** → connecte-toi avec un compte Google.
2. **Get API key → Create API key**. Copie la clé : depuis 2026, elle commence par **`AQ.`** (les anciennes commençaient par `AIza` ; les deux formats fonctionnent avec JARVIS).
3. **Ne clique pas** sur les options de facturation (« Set up billing », « Upgrade »). Sans facturation, Google ne peut rien te facturer : au-delà du quota gratuit, les requêtes sont simplement refusées.

À savoir : les données envoyées au niveau gratuit de Gemini peuvent être utilisées par Google pour améliorer ses produits. Évite d'y confier des informations très sensibles, ou choisis un autre fournisseur (voir `docs/ARCHITECTURE.md`).

Alternatives gratuites : **Groq** (`console.groq.com`, sans carte bancaire) ou **Mistral** (`console.mistral.ai`, offre *Experiment*). Il suffit de changer `JARVIS_AI_PROVIDER` et de fournir la clé correspondante.

> Ton abonnement Claude / Claude Code **n'inclut pas** l'API Anthropic. L'API Claude est facturée séparément, sur crédits prépayés.

---

## Étape 3 — Vercel (hébergement gratuit)

1. Va sur **vercel.com** → *Sign Up* → **Continue with GitHub** → plan **Hobby** (gratuit, usage personnel).
2. **Add New… → Project** → importe `grawzer-art/Grawzerr-` (autorise l'accès au dépôt si demandé).
3. Framework : **Next.js** (détecté automatiquement). Ne change rien d'autre.
4. Déplie **Environment Variables** et ajoute :

| Nom | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL de l'étape 1.c |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé publishable de l'étape 1.c |
| `JARVIS_ALLOWED_EMAILS` | ton e-mail (celui du compte Supabase) |
| `JARVIS_AI_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | clé de l'étape 2 |
| `JARVIS_MONTHLY_BUDGET_USD` | `0` (bloque tout fournisseur payant) |

5. **Deploy**. Au bout de 1 à 2 minutes, Vercel affiche l'adresse : `https://grawzerr-xxxx.vercel.app`.

### Prévisualiser une branche (comme celle-ci)

Chaque branche poussée sur GitHub obtient sa propre adresse de **Preview**. Dans Vercel : *Project → Deployments* → choisis le déploiement de la branche `claude/…` → *Visit*.
Les variables d'environnement doivent être cochées pour **Preview** autant que pour **Production** (c'est le cas par défaut).
Si un déploiement Preview demande une connexion Vercel, c'est la protection des déploiements : connecte-toi avec ton compte Vercel dans Safari.

> Une variable `NEXT_PUBLIC_*` modifiée nécessite un **redéploiement** (*Deployments → … → Redeploy*), car elle est intégrée au moment du build.

---

## Étape 4 — Installer JARVIS sur l'iPhone

1. Ouvre l'adresse Vercel dans **Safari** (pas Chrome : l'installation PWA sur iOS passe par Safari).
2. Bouton **Partager** → **Sur l'écran d'accueil** → *Ajouter*.
3. Lance JARVIS depuis l'icône : il s'ouvre en plein écran, sans barre Safari.
4. Connecte-toi **dans l'app installée** : iOS sépare les données de l'app installée et celles de Safari.

### Voix

- **Voix masculine française** : Réglages → Accessibilité → Contenu énoncé → Voix → Français → télécharge **Thomas** (version *améliorée* si proposée). Puis dans JARVIS : Paramètres → Voix → choisis-la → *Tester la voix*.
- **Écoute** : avec `GROQ_API_KEY` dans Vercel, JARVIS enregistre ta phrase, s'arrête seul après une courte pause et la fait transcrire par **Whisper chez Groq** (niveau gratuit, aucune variable en plus). L'audio n'est pas conservé : seul le texte devient un message. Pour garder l'audio sur l'iPhone, ajoute `JARVIS_TRANSCRIPTION=off` : JARVIS repasse alors sur la dictée de Safari (Réglages → Général → Clavier → Activer Dictée), moins fiable dans l'app installée.
- **Micro** : à la première écoute, iOS demande l'autorisation. Si tu as refusé : Safari → « aA » → Réglages du site web → Micro → Autoriser (ou Réglages → Safari → Micro).
- **Conversation mains libres** : touche le **noyau**. JARVIS écoute, répond à voix haute, puis réécoute. Touche le noyau à nouveau pour arrêter ; il s'arrête aussi seul après quelques secondes de silence. Il ne t'entend pas pendant qu'il parle : attends la fin de sa phrase, ou touche ■ pour l'interrompre.
- JARVIS n'écoute **que** lorsque tu touches le micro ou le noyau. Pas d'écoute permanente, ni téléphone verrouillé.
- Chaque transcription compte comme une requête dans les garde-fous (`JARVIS_PER_MINUTE_LIMIT`, `JARVIS_DAILY_REQUEST_LIMIT`) : un échange vocal = 2 requêtes.

---

## Étape 5 — Vérifier

1. Dans JARVIS → **Dashboard** → *Diagnostic* : les trois lignes doivent être **OK**.
2. Touche **« Tester la connexion IA »**. JARVIS vérifie la clé et le modèle, puis envoie **une mini-génération** (quelques jetons du quota gratuit, 0 €). Une clé peut en effet être reconnue tout en étant interdite de génération. Pour un fournisseur payant, seule la clé est vérifiée, sans aucune génération. Le résultat affiche le format de la clé (jamais sa valeur), le code HTTP, le motif et le message exacts donnés par Google.
3. Écris « Bonjour » sur l'écran JARVIS.

### Lire les logs serveur depuis l'iPhone

Vercel → projet → **Logs** (ou *Deployments* → le déploiement → *Logs*). Chaque événement est une ligne JSON : `ai.reply` (réponse réussie), `ai.error` (échec avec `kind`, `httpStatus`, `reason`), `ai.check` (test du Dashboard), `chat.blocked` (garde-fou). Les clés n'y figurent jamais : seuls leur format et leur longueur sont journalisés.

### Motifs d'erreur Gemini

| Ce que montre JARVIS (code HTTP · motif) | Signification | Que faire |
|---|---|---|
| `401 · ACCESS_TOKEN_TYPE_UNSUPPORTED` ou `400 · API_KEY_INVALID` | Google ne reconnaît pas la clé | Créer une nouvelle clé dans AI Studio, la recoller dans Vercel, redéployer |
| `403 · PERMISSION_DENIED` + « Your project has been denied access » | La clé est reconnue, mais Google refuse la **génération** pour ce projet/compte | Voir la section « 403 PERMISSION_DENIED » ci-dessous |
| `403 · SERVICE_DISABLED` | API Gemini non activée sur le projet de la clé | Créer la clé depuis AI Studio (qui active l'API automatiquement) |
| `403 · API_KEY_…_BLOCKED` | Restrictions de clé (site, IP, API) | Retirer les restrictions de la clé |
| `403` + « … are blocked » | Restrictions de la clé (API ou méthode non autorisée) | Retirer les restrictions de la clé ou en créer une nouvelle |
| `404` | Modèle inconnu | Supprimer `JARVIS_AI_MODEL` ou mettre un modèle existant (ex. `gemini-3.5-flash`) |
| `429` « quota » | Quota gratuit épuisé | Attendre la réinitialisation (quotidienne). Ne pas activer la facturation |
| `429` sans quota | Trop de requêtes par minute | Patienter une minute |

### 403 PERMISSION_DENIED : clé reconnue, génération refusée

Le test du Dashboard le montre ainsi : « Connexion IA en échec », `HTTP 403 · PERMISSION_DENIED`, avec le message de Google. Le plus fréquent est « Your project has been denied access ». Google accepte la clé (lecture du modèle) mais bloque la génération pour le projet ou le compte. Le code de JARVIS ne peut pas le contourner. À essayer dans l'ordre, sans jamais activer la facturation :

1. **Autre modèle** : dans Vercel, ajoute `JARVIS_AI_MODEL=gemini-2.5-flash`, redéploie, puis relance le test du Dashboard.
2. **Compte Google** : sur myaccount.google.com → *Sécurité*, active la **validation en deux étapes** et vérifie ton **numéro de téléphone**. Puis, dans AI Studio, crée une clé dans un **nouveau projet**, remplace `GEMINI_API_KEY` dans Vercel et redéploie.
3. **Solution immédiate et gratuite : Groq.** Sur console.groq.com, crée un compte (sans carte bancaire) → *API Keys* → *Create API Key* (la clé commence par `gsk_`). Dans Vercel : `JARVIS_AI_PROVIDER=groq` et `GROQ_API_KEY=<la clé>`, puis redéploie. Tu pourras revenir à Gemini plus tard en remettant `JARVIS_AI_PROVIDER=gemini`.

Certains conseils en ligne recommandent d'activer la facturation Google pour lever le blocage. **Ne le fais pas** : cela rendrait possible une dépense.

### Dépannage

| Symptôme | Cause probable |
|---|---|
| « Mode aperçu » partout | Variables Supabase absentes ou ajoutées sans redéployer |
| « Identifiants incorrects » | Utilisateur non créé, ou *Auto Confirm* non coché |
| « Ce compte n'est pas autorisé » | `JARVIS_ALLOWED_EMAILS` ne contient pas ton e-mail exact |
| « Aucun fournisseur IA n'est configuré » | Clé IA absente ou nom de variable incorrect |
| « Google indique que cette clé n'est pas valide » | Clé tronquée, supprimée, ou variable modifiée sans redéploiement (voir « Motifs d'erreur Gemini ») |
| Clé ajoutée mais rien ne change | Variable cochée pour *Production* alors que tu testes une adresse *Preview* (ou l'inverse), ou pas de redéploiement |
| « limite temporairement les requêtes » | Quota gratuit par minute/jour atteint : réessaie plus tard |
| Erreur `42501` / `permission denied` | Script SQL non exécuté (étape 1.a) |
| Le site ne répond plus après quelques jours | Projet Supabase en pause : *Restore project* |

---

## Option — Passer à Claude (payant, plafonné)

1. **console.anthropic.com** → crée un compte → *Billing* : achète un petit crédit (ex. 5 $) et **laisse le rechargement automatique désactivé**. Définis aussi une limite de dépense mensuelle dans la console.
2. *API Keys* → crée une clé.
3. Dans Vercel : `JARVIS_AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=…`, et **`JARVIS_MONTHLY_BUDGET_USD=5`** (sans ce budget, JARVIS refuse tout appel payant).
4. Modèle : par défaut `claude-opus-5-5`. Pour réduire fortement le coût, `JARVIS_AI_MODEL=claude-haiku-5-5`.

Triple protection : crédit prépayé sans rechargement + limite dans la console Anthropic + budget mensuel vérifié par JARVIS avant **chaque** requête.
