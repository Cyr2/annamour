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

## Exigences produit validées sur la maquette
- **Maquette de référence** : https://claude.ai/artifact/AwKSht7CqP8Lr1kaznN86C (écrans accueil, salon, rejoindre, lecteur, profil).
- **Réactions** : 6 émojis seulement (`REACTIONS`), menu dans la barre du lecteur, l'émoji s'envole chez tout le monde avec le prénom.
- **Séances persistantes** : on regarde parfois un film en plusieurs soirs, à plusieurs jours d'intervalle.
  - Serveur : persister les salons (playlists en cache, sous-titres, titre, dernière position) dans SQLite (`node:sqlite`, intégré à Node) sur un volume Coolify ; garder un salon au moins 60 jours après sa dernière utilisation ; position sauvegardée à chaque pause et quand le salon se vide.
  - Appareil : profil (prénom, couleur) et « Mes séances » en localStorage, sans compte : code, titre, dernière position, date, avec qui. Carte « Reprendre » sur l'accueil.
  - Reprise : rouvrir une séance remet tout le monde à la position enregistrée.

## Conventions
- L'appli n'importe jamais `glisse` directement : passer par `apps/web/src/ui/`.
- Tout message réseau passe par les schémas zod de `@annamour/protocol`.
- Toujours les dernières versions des dépendances.
- Le serveur ne relaie pas la vidéo : seulement les playlists (en cache) et les sous-titres.

## Commandes (Windows : lancer pnpm via PowerShell, pas Git Bash)
`pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm build`
