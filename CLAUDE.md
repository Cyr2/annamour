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
- **Maquette de référence (validée)** : `docs/maquette.html` (ouvrir dans un navigateur ; copie de https://claude.ai/artifact/AwKSht7CqP8Lr1kaznN86C). Écrans : 1er lancement, accueil, salon, rejoindre, lecteur, profil. Le logo y est provisoire.
- **Réactions** : 6 émojis seulement (`REACTIONS`), menu dans la barre du lecteur, l'émoji s'envole chez tout le monde avec le prénom.
- **Séances persistantes** : on regarde parfois un film en plusieurs soirs, à plusieurs jours d'intervalle.
  - Serveur : persister les salons (playlists en cache, sous-titres, titre, dernière position) dans SQLite (`node:sqlite`, intégré à Node) sur un volume Coolify ; garder un salon au moins 60 jours après sa dernière utilisation ; position sauvegardée à chaque pause et quand le salon se vide.
  - Carte « Reprendre » sur l'accueil ; reprise : rouvrir une séance remet tout le monde à la position enregistrée.
- **Compte sans inscription** (écran « 1er lancement » et section « Ton compte » du profil) :
  - Clé de 4 mots créée automatiquement au premier lancement (liste française de 2048 mots simples, ~44 bits). La clé est le compte : ni email ni mot de passe.
  - Serveur : ne stocke qu'une empreinte HMAC-SHA256 de la clé avec un secret serveur (`KEY_PEPPER`, variable d'env Coolify) ; essais limités (10/h/IP) ; session par cookie httpOnly.
  - Ajouter un appareil : QR code de connexion à usage unique valable 5 minutes, ou saisie des 4 mots.
  - Passkey (Face ID / Touch ID) en option, liée au domaine définitif (WebAuthn, rpID = domaine de prod) ; la clé reste le secours.
  - Rejoindre une séance avec un code reste possible sans compte.
- **Séances partagées (2 à 8 personnes)** : la séance est l'unité de partage, pas un duo. Elle apparaît chez chaque participant ayant un compte, avec la même position. Profil : carte « Avec qui je regarde » = **une simple rangée de bulles** (l'utilisateur a refusé une constellation, trop complexe) : « Tout le monde », puis chaque personne **une seule fois**, triée par nombre de séances communes. La première (au moins 2 séances) porte un petit cœur pêche qui bat et l'étiquette « Complice de canapé » à la place de son nombre de séances. Toucher une bulle filtre « Mes séances ».
- **Lecteur, volume** : bouton haut-parleur (couper/remettre) + curseur, touche M ; volume personnel, jamais synchronisé. Sur iPad, Safari ignore le volume programmé : n'y afficher que le bouton couper (les boutons physiques règlent le volume). Chaque séance affiche les bulles de tous ses participants (« avec Léo et Inès »). Les textes ne supposent jamais un duo.

## Conventions
- L'appli n'importe jamais `glisse` directement : passer par `apps/web/src/ui/`.
- Tout message réseau passe par les schémas zod de `@annamour/protocol`.
- Toujours les dernières versions des dépendances.
- Le serveur ne relaie pas la vidéo : seulement les playlists (en cache) et les sous-titres.

## Commandes (Windows : lancer pnpm via PowerShell, pas Git Bash)
`pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm build`
