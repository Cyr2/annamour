# Annamour

**Une soirée ensemble.**

Annamour permet de regarder un film ou une série à deux, chacun chez soi, parfaitement synchronisés : lecture, pause et avance sont partagées en temps réel. Pas de compte : un pseudo, un code à 4 lettres, et c'est parti.

Le symbole de l'appli est le **fil rouge** : selon la légende, un fil invisible relie deux personnes, quelle que soit la distance. Dans l'interface, il relie vos bulles de présence et montre l'état de la synchro.

## Comment ça marche

```
Serveur Annamour (Coolify)
 ├─ salons + état de lecture (fait autorité), horloge commune via WebSocket
 ├─ cache des playlists HLS (le lien d'origine peut expirer pendant le film)
 └─ sert la PWA
Chaque appareil lit la vidéo directement depuis le CDN d'origine.
```

- **Synchro** : le serveur garde `{status, position, at}`. Chaque client estime le décalage de son horloge (méthode NTP, meilleurs aller-retours), calcule où la vidéo devrait être, et corrige : rien sous 60 ms, vitesse ±5 % sous 1 s, saut au-delà.
- **Mise en attente** : si quelqu'un charge, tout le monde attend, puis la lecture reprend seule.
- **Playlists** : à la création du salon, le serveur récupère une fois la playlist maître et ses sous-playlists, les réécrit (playlists → serveur, segments → CDN d'origine en absolu) et retrouve les sous-titres WebVTT voisins.

## Structure

| Dossier             | Rôle                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- |
| `packages/protocol` | Types et schémas zod partagés, maths de synchro (horloge, dérive, état de lecture) |
| `apps/server`       | Node 26 + Hono + `ws` : API, WebSocket, import HLS, service de la PWA              |
| `apps/web`          | PWA React 19 + Vite + Tailwind 4 + Motion + glisse (Liquid Glass)                  |
| `apps/android-tv`   | Appli Android TV / Google TV (Kotlin) : la PWA en mode TV dans une WebView         |

### Appli Android TV

`apps/android-tv` ouvre `https://annamour.dpessin.fr/?tv=1` en plein écran, apparaît dans le lanceur Google TV et transmet la télécommande à la page (flèches, OK = `Enter`, Retour = `Escape` + `window.AnnamourTV.backHandled()`). Elle se construit à part avec Gradle (hors de `pnpm`) ; construction, clé de signature, contrat avec la page et installation par ADB : voir [`apps/android-tv/README.md`](apps/android-tv/README.md).

## Développement

Prérequis : Node 26+, pnpm 10+.

```sh
pnpm install
pnpm dev        # serveur sur :8787, PWA Vite sur :5173 (proxy /api et /ws)
pnpm test       # tests du protocole et du serveur
pnpm typecheck
pnpm build
pnpm e2e        # deux navigateurs Chrome, serveur local lancé automatiquement
```

Pour lancer le test de bout en bout contre une instance déployée, sans serveur local : `E2E_BASE_URL=https://annamour.mondomaine.fr pnpm e2e`. Il y crée deux comptes de test et une séance.

## Déploiement (Coolify)

1. Nouvelle ressource → depuis ce dépôt Git → **Build Pack : Dockerfile**.
2. Port exposé : `8787`.
3. Domaine : par ex. `https://annamour.mondomaine.fr` (HTTPS obligatoire pour la PWA ; Coolify gère le certificat et les WebSocket).
4. **Stockage persistant** : ajouter un volume monté sur `/app/data`. Les séances (playlists en cache, sous-titres, dernière position) et les comptes y vivent dans SQLite (`annamour.db`) ; sans volume, tout est perdu à chaque redéploiement.
5. Variables d'environnement :

| Variable                                | Obligatoire       | Rôle                                                                                                                                                                                                        |
| --------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KEY_PEPPER`                            | oui               | Secret mêlé à l'empreinte des clés de 4 mots. Le serveur refuse de démarrer sans lui en production. Ne jamais le changer : toutes les clés deviendraient invalides. Générer avec `openssl rand -base64 32`. |
| `RP_ID`                                 | pour les passkeys | Domaine définitif, sans protocole (ex. `annamour.mondomaine.fr`). Les passkeys y sont liées. Défaut : `localhost`.                                                                                          |
| `ORIGIN`                                | pour les passkeys | Adresse(s) de la PWA, séparées par des virgules (ex. `https://annamour.mondomaine.fr`). Défaut : `http://localhost:5173`.                                                                                   |
| `DATA_DIR`                              | non               | Dossier de la base SQLite. Défaut dans l'image : `/app/data`.                                                                                                                                               |
| `PORT`, `WEB_DIST`                      | non               | Port d'écoute (`8787`) et dossier de la PWA construite : valeurs par défaut adaptées.                                                                                                                       |
| `NAKA_BRIDGE_URL`, `NAKA_BRIDGE_SECRET` | pour la recherche | Adresse de `naka-bridge` sur le réseau Docker (`http://naka-bridge:3000`) et son secret partagé. Sans elles, « Nouvelle séance » demande un lien.                                                           |

Le conteneur expose `/api/health` pour le healthcheck. Un salon est gardé 60 jours après sa dernière utilisation.

### Recherche par titre (`apps/naka-bridge`)

Pour taper le nom d'un film au lieu de coller un lien `.m3u8`, le serveur interroge Naka (accord de leur équipe, à condition de ne jamais surcharger leur site). Leur API est derrière Cloudflare, qui ne laisse passer qu'un vrai navigateur : `naka-bridge` garde un Chromium avec fenêtre (sous Xvfb) ouvert sur naka.cx et n'accepte que trois appels (recherche, saison, sources de lecture), au plus 20 par minute.

1. Nouvelle ressource → ce dépôt → **Dockerfile** `apps/naka-bridge/Dockerfile`, port `3000`, **sans domaine**, alias réseau `naka-bridge`.
2. Variables : `NAKA_TOKEN` (le `oat_…` de `nakastream-auth` dans le Local Storage de naka.cx), `NAKA_PROFILE` (l'id de `nakastream-profile`), `BRIDGE_SECRET` (`openssl rand -base64 32`). Changer de compte Naka = changer ces deux valeurs et redémarrer.
3. Sur l'appli Annamour : `NAKA_BRIDGE_URL=http://naka-bridge:3000` et `NAKA_BRIDGE_SECRET` = le même secret.
