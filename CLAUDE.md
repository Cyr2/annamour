# Annamour — instructions pour Claude

Watch-together PWA : deux personnes à distance regardent la même vidéo HLS, synchronisée. Pas de compte. Interface en français.

## Marque
- Nom : **Annamour**. Slogan : **« Une soirée ensemble »** (exactement).
- Symbole : le **fil rouge** (relie les bulles de présence ; tendu = synchro, ondule = quelqu'un charge).
- Direction : vibe Apple, épurée, sombre par défaut, micro-animations premium (ressorts Motion), mignon.
- Palette « Nuit douce » : nuit `#12101A`, encre `#1D1828`, lait `#F6F2FA`, rose pêche `#FF8C9E` (accent, le fil), lilas `#A99CFF`, menthe `#7FE3C1`. Les valeurs vivent dans `apps/web/src/styles/tokens.css` : jamais de hex en dur dans les composants.

## Skills du projet (`.claude/skills/`)
- `frontend-design` : avant tout nouvel écran ou changement visuel.
- `composition-patterns` : architecture des composants React.
- `react-best-practices` : perf React (ignorer les règles Next.js/RSC).
- `web-design-guidelines` : audit avant chaque livraison.
- (global) `ui-ux-pro-max` : règles UX/accessibilité (cibles ≥ 44 px, contraste 4.5:1, reduced motion).

## Conventions
- L'appli n'importe jamais `glisse` directement : passer par `apps/web/src/ui/`.
- Tout message réseau passe par les schémas zod de `@annamour/protocol`.
- Toujours les dernières versions des dépendances.
- Le serveur ne relaie pas la vidéo : seulement les playlists (en cache) et les sous-titres.

## Commandes (Windows : lancer pnpm via PowerShell, pas Git Bash)
`pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm build`
