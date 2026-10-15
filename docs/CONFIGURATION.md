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
2. **Get API key → Create API key**. Copie la clé (`AIza…`).
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
- **Dictée** : elle utilise la reconnaissance vocale de Safari ; Siri/Dictée doivent être activés (Réglages → Général → Clavier → Activer Dictée) et le micro autorisé pour le site. Si l'icône micro n'apparaît pas, le navigateur ne fournit pas cette fonction : JARVIS ne la simule pas.
- JARVIS n'écoute **que** lorsque tu touches le micro. Pas d'écoute permanente, ni téléphone verrouillé.

---

## Étape 5 — Vérifier

Dans JARVIS → **Dashboard** → *Diagnostic* : les trois lignes doivent être **OK**. Ensuite, écris « Bonjour » sur l'écran JARVIS.

### Dépannage

| Symptôme | Cause probable |
|---|---|
| « Mode aperçu » partout | Variables Supabase absentes ou ajoutées sans redéployer |
| « Identifiants incorrects » | Utilisateur non créé, ou *Auto Confirm* non coché |
| « Ce compte n'est pas autorisé » | `JARVIS_ALLOWED_EMAILS` ne contient pas ton e-mail exact |
| « Aucun fournisseur IA n'est configuré » | Clé IA absente ou nom de variable incorrect |
| « Le fournisseur IA refuse la clé API » | Clé invalide ou révoquée |
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
