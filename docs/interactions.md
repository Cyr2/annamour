# Interactions

Comportements de l'appli qui ne se voient pas sur la maquette.

## Mise à jour de l'appli installée

Chaque nouvelle version arrive sur le téléphone (PWA installée) dès sa mise en ligne, sans désinstaller l'app ni vider le cache.

- L'appli cherche une nouvelle version au démarrage, à chaque retour au premier plan (`visibilitychange` → `registration.update()`) et toutes les 30 minutes : une PWA reste en mémoire des jours sans recharger sa page.
- Quand une version est prête, elle n'est jamais chargée d'office. Un bandeau **« Nouvelle version prête · Recharger »** apparaît, et reste, au premier moment calme : hors séance, aucune feuille ouverte, aucune requête en cours (vérifié toutes les 2 s).
- **Recharger** active la nouvelle version (`updateSW(true)`) et recharge la page.
- Sur la TV, la télécommande n'atteint pas le bandeau : la nouvelle version s'y charge seule, au même moment calme.
- Le serveur dit au cache quoi garder : `/assets/*` (noms hashés) en `public, max-age=31536000, immutable` ; tout le reste (`/`, `sw.js`, `manifest.webmanifest`, `registerSW.js`, `workbox-*.js`, icônes) en `no-cache`, plus `CDN-Cache-Control: no-store` pour Cloudflare.

Vérifier depuis l'extérieur :

```sh
curl -sI "https://annamour.dpessin.fr/sw.js?v=$RANDOM" | grep -i cache-control   # no-cache
curl -sI "https://annamour.dpessin.fr/?v=$RANDOM" | grep -i cache-control        # no-cache
```

De bout en bout : déployer une version avec un petit changement visible, ouvrir la PWA installée, la mettre en arrière-plan puis revenir. Le bandeau apparaît en quelques secondes ; « Recharger » affiche la nouvelle version.
