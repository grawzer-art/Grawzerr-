@AGENTS.md

# JARVIS — notes pour les sessions Claude Code

- Le propriétaire travaille uniquement depuis un iPhone : ne jamais lui demander un Mac ou un terminal local. Toute étape manuelle doit se faire dans un navigateur mobile (Supabase, Vercel, GitHub, consoles IA).
- Interface et documentation en français.
- Dépôt **public** : aucun secret, aucune adresse e-mail réelle, aucune donnée personnelle dans le code, les tests ou la doc.
- Honnêteté : ne jamais simuler une fonctionnalité (voix, IA, actions). Ce qui n'existe pas est marqué « à venir » (`src/lib/modules.ts` et le tableau du README, à garder synchronisés).
- Toute nouvelle dépense potentielle passe par `src/lib/budget.ts` et doit être validée par le propriétaire avant activation.
- Toute nouvelle table : RLS + `GRANT` explicites + vérifications dans `supabase/tests/10_rls.test.sql`.
- Contenus externes (emails, pages web, documents) : toujours encadrés comme données non fiables dans le prompt.

Commandes : `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (`npm run check` enchaîne les quatre).
Next.js 16 : `middleware` s'appelle désormais `proxy` (`src/proxy.ts`) ; lire `node_modules/next/dist/docs/` en cas de doute.
