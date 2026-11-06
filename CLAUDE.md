# Annamour — instructions du projet

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

- **Maquette de référence (validée)** : `docs/maquette.html` (ouvrir dans un navigateur). Écrans : 1er lancement, accueil, salon, rejoindre, lecteur, profil. Le logo y est provisoire.
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
- **Séances partagées (2 à 8 personnes)** : la séance est l'unité de partage, pas un duo. Elle apparaît chez chaque participant ayant un compte, avec la même position. Profil : carte « Avec qui je regarde » = **une simple rangée de bulles** (l'utilisateur a refusé une constellation, trop complexe) : « Tout le monde », puis chaque personne **une seule fois**, triée par nombre de séances communes. La première (au moins 2 séances) porte un petit cœur pêche qui bat sur sa bulle (pas d'étiquette « complice » : retirée à la demande de l'utilisateur). Toucher une bulle filtre « Mes séances ».
- **Lecteur, volume** : bouton haut-parleur (couper/remettre) + curseur, touche M ; volume personnel, jamais synchronisé. Sur iPad, Safari ignore le volume programmé : n'y afficher que le bouton couper (les boutons physiques règlent le volume). Chaque séance affiche les bulles de tous ses participants (« avec Léo et Inès »). Les textes ne supposent jamais un duo.

## Conventions

- L'appli n'importe jamais `glisse` directement : passer par `apps/web/src/ui/`.
- Tout message réseau passe par les schémas zod de `@annamour/protocol`.
- Toujours les dernières versions des dépendances.
- Le serveur ne relaie pas la vidéo : seulement les playlists (en cache) et les sous-titres.

## Règles de développement (strictes, non négociables)

Ces règles sont vérifiées par la CI (`pnpm verify`) : une PR qui ne les respecte pas ne peut pas être fusionnée.

### Principes

- **SOLID, KISS, DRY, YAGNI.** Une fonction ou un module = une responsabilité. On factorise à la troisième répétition, pas avant. On ne code pas « au cas où ».
- **Fonctions courtes et lisibles** : complexité cognitive ≤ 15 (Biome), viser < 40 lignes ; composants React < 150 lignes, sinon on découpe.
- **Logique pure d'abord** : les règles métier (synchro, horloge, état de lecture, codes) vivent dans `@annamour/protocol` en fonctions pures, sans E/S, testées à fond. Le serveur et le client ne font qu'appliquer.
- **Couches du serveur** : routes HTTP/WebSocket (transport, validation zod) → services (règles) → stockage. Une route ne touche jamais SQLite directement.
- **Couches du client** : `ui/` (présentation pure, aucune logique réseau) → `features/<écran>/` (écrans et leur état) → `sync/` (réseau et lecteur). Un store zustand par domaine.
- **Nommage explicite** en anglais dans le code, textes d'interface en français. Pas d'abréviations obscures.
- **Commentaires** : expliquer le _pourquoi_, jamais le _quoi_.

### TypeScript

- `strict`, `noUncheckedIndexedAccess` : pas de `any`, pas d'assertion non nulle `!`, pas de `as` sauf juste après une validation zod ou dans un test.
- Toute donnée venant de l'extérieur (réseau, localStorage, URL, base) est validée par un schéma zod avant usage.
- Erreurs : classes d'erreur nommées côté serveur ; messages utilisateur en français, qui disent quoi faire, sans s'excuser.
- Pas de `console.log` (seuls `info`, `warn`, `error` sont permis, côté serveur).

### Tests

- Toute règle métier a ses tests. **Un bug corrigé = d'abord un test qui le reproduit.**
- Couverture minimale imposée : `@annamour/protocol` 90 % (lignes, fonctions, instructions) et 85 % des branches ; `@annamour/server` 80 % et 75 % des branches. On ne baisse jamais un seuil : on ajoute des tests.
- Les tests décrivent un comportement (« attend la personne qui charge, puis reprend seule »), pas une implémentation.

### Qualité de l'interface

- Accessibilité : cibles ≥ 44 px, contraste ≥ 4.5:1, focus visible, `prefers-reduced-motion` respecté, libellés sur les boutons-icônes.
- Pas de valeur de couleur, d'espacement ou de durée en dur : tout passe par les tokens.
- Avant chaque livraison d'écran : comparer à `docs/maquette.html`, puis audit `web-design-guidelines`.

### Git et PR

- Jamais de commit direct sur `main`. Une branche et une PR par sujet, petite et cohérente.
- Messages de commit et titres de PR en français, au présent, qui disent ce que ça change pour l'utilisateur ou le code.
- La CI (lint, types, tests + couverture, build, image Docker + test de démarrage) doit être verte. **Les PR sont fusionnées automatiquement une fois la CI verte** (squash) ; jamais une PR en brouillon ni celle d'une autre session.
- **Aucune signature d'outil ou d'assistant** nulle part : pas de trailer `Co-Authored-By`, pas de mention « Generated with … » dans les commits, les PR, le code ou la documentation. Les commits sont signés par l'auteur du dépôt uniquement.
- `biome-ignore` seulement en dernier recours, toujours avec la raison précise.

### Définition de « terminé »

1. `pnpm verify` passe en local (lint, types, tests + couverture, build).
2. Écran comparé à la maquette ; audit `web-design-guidelines` sans point bloquant.
3. CI verte, PR fusionnée, `main` déployable.

## Commandes (Windows : lancer pnpm via PowerShell, pas Git Bash)

`pnpm dev` · `pnpm verify` (tout vérifier) · `pnpm lint` · `pnpm format` · `pnpm test` · `pnpm typecheck` · `pnpm build`
