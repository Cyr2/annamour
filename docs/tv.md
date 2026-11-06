# Annamour TV — chantier

Version TV d'Annamour pour Android TV / Google TV (cible de test : vidéoprojecteur Formovie, Google TV, Android 11). Maquette fil de fer interactive : [`docs/maquette-tv.html`](maquette-tv.html) (flèches, OK = Entrée, Retour = Échap).

## Principe

**La TV est l'écran, le téléphone la télécommande et le clavier.** La TV ne demande jamais de taper un prénom, une clé ou un lien.

## Décisions validées

| Sujet | Décision |
|---|---|
| Lier la TV | Par QR code : la TV affiche un QR et un code court, le téléphone (déjà connecté) confirme. Aucune saisie sur la TV. |
| Créer une séance | Sur le téléphone (coller le lien). Elle apparaît dans « Mes séances » sur la TV, qui partage le même compte. |
| Rejoindre une séance | Sur la TV, code de 4 lettres saisi avec un clavier à l'écran piloté aux flèches. |
| Réactions | Depuis le téléphone (au toucher) ; aussi accessibles dans la barre du lecteur TV. |
| Lecteur | OK = pause / lecture ; ◀ ▶ = −10 s / +10 s sans ouvrir de menu ; ▲ ou ▼ = affiche la barre de commandes, dans laquelle on se déplace aux flèches comme sur Netflix ; Retour = ferme la barre, puis quitte le film. La barre s'efface après 5 s sans action pendant la lecture. |

## Parcours

1. **Liaison** : 1er lancement de l'appli TV → écran « Relie cette TV à ton compte » (QR + code court `K7P-2QX`, valable 10 min). Sur le téléphone : scanner le QR (ouvre `/tv#code`) ou Profil → « Lier une TV » et taper le code → « Lier la TV du salon ? » → Confirmer. La TV reçoit sa session et affiche l'accueil.
2. **Accueil TV** : « Mes séances » (cartes avec progression, « Reprendre à … · avec … »), puis « Rejoindre avec un code » et « Changer de compte ».
3. **Rejoindre** : 4 cases + clavier de 23 lettres (sans I, L, O) + Effacer ; la séance s'ouvre à la 4e lettre ; code inconnu = cases qui tremblent et message.
4. **Salon** : identique au téléphone, en grand ; « Lancer / Reprendre le film » lance le compte à rebours pour tous.
5. **Lecteur** : voir le tableau ci-dessus. Pistes audio et sous-titres dans la barre (menu aux flèches).

## Technique

### Serveur (contrat dans `packages/protocol`)
- `POST /api/tv/pairing` (sans compte) → `{ code, pollToken, expiresAt }` : demande de liaison créée par la TV ; code court lisible (6 caractères, alphabet sans ambiguïtés), valable 10 min.
- `GET /api/tv/pairing/:pollToken` (TV, interrogé toutes les 2 s, ou WebSocket) → `pending` | `approved` (pose le cookie de session de la TV) | `expired`.
- `POST /api/tv/pairing/approve { code }` (téléphone connecté) → lie la TV au compte ; usage unique ; limité en essais par IP.
- Jetons stockés hachés comme les autres ; tests et couverture selon les règles du dépôt.

### Interface TV (même appli web, mode TV)
- Mode TV activé par l'appli Android TV (paramètre `?tv=1` mémorisé) ou par détection (`navigator.userAgent` Android TV / Google TV) ; routes dédiées sous `/tv`.
- **Navigation spatiale** au pavé directionnel : bibliothèque éprouvée (ex. `@noriginmedia/norigin-spatial-navigation`) ; focus très visible (anneau + légère mise à l'échelle) ; Retour (`Escape`/`Backspace`/`GoBack`) géré partout.
- « 10 pieds » : texte plus grand, marges de sécurité de 5 % sur les bords, cibles larges ; effets de verre allégés (pas de réfraction SVG : les puces de TV sont lentes), animations courtes.
- Le lecteur réutilise `PlayerSync` et la synchro existante ; seule la couche de contrôle change.

### Appli Android TV
- Petite appli Android TV (WebView plein écran ou Trusted Web Activity) qui ouvre l'URL de prod en mode TV, avec bannière Leanback pour apparaître dans le lanceur Google TV, et transmet les touches de la télécommande.
- Installée sur le Formovie par ADB réseau (`adb -s 192.168.1.20:5555`), en respectant les règles du projecteur : lire d'abord `work\README.md` du dépôt cleanyourtv, ne désinstaller ni désactiver aucun paquet système, vérifier chaque étape par capture d'écran, refermer l'ADB à la fin.

## Lots

1. **TV-1 — Liaison et écrans TV** : API de liaison (serveur + protocole + tests) ; page « Lier une TV » côté téléphone ; écrans TV liaison, accueil « Mes séances », rejoindre au clavier, salon ; navigation spatiale.
2. **TV-2 — Lecteur TV et appli Android TV** : lecteur façon Netflix (OK, ◀ ▶, barre ▲ ▼, Retour, pistes, réactions) ; appli Android TV ; installation et vérification sur le Formovie ; test de bout en bout TV + téléphone (Playwright, touches simulées).

Chaque lot : `pnpm verify` et `pnpm e2e` verts, une PR. **Rien n'est fusionné sans accord explicite de l'utilisateur.**
