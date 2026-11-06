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

| Dossier | Rôle |
|---|---|
| `packages/protocol` | Types et schémas zod partagés, maths de synchro (horloge, dérive, état de lecture) |
| `apps/server` | Node 26 + Hono + `ws` : API, WebSocket, import HLS, service de la PWA |
| `apps/web` | PWA React 19 + Vite + Tailwind 4 + Motion + glisse (Liquid Glass) |

## Développement

Prérequis : Node 26+, pnpm 10+.

```sh
pnpm install
pnpm dev        # serveur sur :8787, PWA Vite sur :5173 (proxy /api et /ws)
pnpm test       # tests du protocole et du serveur
pnpm typecheck
pnpm build
```

## Déploiement (Coolify)

1. Nouvelle ressource → depuis ce dépôt Git → **Build Pack : Dockerfile**.
2. Port exposé : `8787`.
3. Domaine : par ex. `https://annamour.mondomaine.fr` (HTTPS obligatoire pour la PWA ; Coolify gère le certificat et les WebSocket).
4. Variables d'environnement : aucune obligatoire (`PORT`, `WEB_DIST` ont des valeurs par défaut).

Le conteneur expose `/api/health` pour le healthcheck.
