# Annamour TV (Android TV / Google TV)

Petite appli Android TV qui ouvre la PWA en plein écran, en mode TV : `https://annamour.dpessin.fr/?tv=1`. Elle apparaît dans le lanceur Google TV (bannière Leanback) et transmet les touches de la télécommande à la page. Toute l'interface reste dans l'appli web (`apps/web`) : ici, rien que l'enveloppe.

- Paquet `fr.dpessin.annamour.tv`, nom « Annamour », version 1.0.0 (`versionCode` 1).
- Kotlin, une seule activité avec une WebView, aucune dépendance en plus.
- `minSdk` 24 (Android 7), `targetSdk`/`compileSdk` 37. Gradle 9.9 (wrapper), Android Gradle Plugin 9.5.1 (Kotlin intégré).

## Contrat avec la page (mode TV de `apps/web`)

### Détecter l'appli

- L'URL contient `?tv=1`.
- `window.AnnamourTV` existe et `window.AnnamourTV.isTv()` renvoie `true`.
- Le user agent se termine par `AnnamourTV/<version>` (ex. `AnnamourTV/1.0.0`).

### Touches de la télécommande

La page reçoit de vrais événements clavier (`keydown` puis `keyup`, `isTrusted` vrai) :

| Télécommande                                                 | `event.key` reçu par la page                      |
| ------------------------------------------------------------ | ------------------------------------------------- |
| Flèches du pavé                                              | `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` |
| OK (centre du pavé), Entrée, bouton A / Select d'une manette | `Enter`                                           |
| Lecture/pause, Lecture, Pause (touches média)                | `" "` (espace, `code` = `Space`)                  |
| Retour rapide / avance rapide                                | `ArrowLeft` / `ArrowRight`                        |
| Retour                                                       | `Escape`, puis voir ci-dessous                    |

Les autres touches (chiffres, volume, accueil…) gardent leur comportement Android habituel.

### Touche Retour

1. L'appli envoie `Escape` (`keydown` puis `keyup`) à la page.
2. Si la page a traité ce Retour (fermer la barre du lecteur, revenir à l'écran précédent…), elle appelle **`window.AnnamourTV.backHandled()`** dans les **200 ms**. L'appli ne fait alors rien de plus.
3. Sinon, après 200 ms, l'appli quitte le plein écran vidéo s'il est actif, sinon revient en arrière dans l'historique de la WebView (`goBack`) si c'est possible, sinon ferme l'appli.

Un appui sur Retour pendant ces 200 ms est ignoré. Sur l'écran « Impossible de joindre Annamour », Retour ferme l'appli.

Exemple côté page :

```ts
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (closeTopmostLayer()) window.AnnamourTV?.backHandled();
});
```

### Le reste

- JavaScript, stockage DOM et cookies persistants activés ; la lecture démarre sans geste de l'utilisateur (`mediaPlaybackRequiresUserGesture = false`).
- Plein écran : `element.requestFullscreen()` fonctionne (vidéo ou lecteur entier).
- Taille du texte fixée à 100 % : la page gère elle-même l'échelle « 10 pieds ».
- Écran toujours allumé, barres système masquées, fond nuit pendant le chargement.
- Liens vers un autre site : ouverts hors de l'appli si la TV sait les ouvrir, sinon ignorés.
- Sans réseau ou si le serveur répond en 5xx : écran « Impossible de joindre Annamour » avec un bouton « Réessayer » ; la page se recharge aussi d'elle-même au retour du réseau.

## Construire l'APK (Windows)

Prérequis : un JDK 17+ (ex. Microsoft OpenJDK 21) et le SDK Android (`platforms;android-37.0`, `build-tools;37.0.0`). Le SDK reste hors du dépôt : `local.properties` (`sdk.dir=…`) ou la variable `ANDROID_HOME`.

```powershell
$env:JAVA_HOME = "C:\Users\Darius\.jdks\jdk-21.0.13.0.2+1"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd apps\android-tv
.\gradlew.bat assembleRelease
# -> app\build\outputs\apk\release\app-release.apk
```

### Clé de signature

L'APK de release est signé avec une clé locale, **hors du dépôt** :

- `C:\Users\Darius\.android-keys\annamour-tv.jks` (clé RSA 4096, alias `annamour-tv`) ;
- `C:\Users\Darius\.android-keys\annamour-tv.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) et `annamour-tv.password.txt`.

Autre emplacement : `.\gradlew.bat assembleRelease -Pannamour.keystore=C:\chemin\annamour-tv.properties`. Sans ce fichier, Gradle produit un APK non signé (`app-release-unsigned.apk`), inutilisable tel quel.

**Sauvegarder ces fichiers.** Android n'accepte une mise à jour que si elle est signée par la même clé : si la clé est perdue, il faudra désinstaller l'appli puis installer la nouvelle version (les cookies, donc la liaison de la TV au compte, seront perdus).

Pour une nouvelle version : augmenter `versionCode` et `versionName` dans `app/build.gradle.kts`.

## Installer sur le projecteur (Formovie, Google TV, Android 11)

Le débogage ADB par le réseau doit être activé sur le projecteur. Depuis le PC :

```powershell
adb connect 192.168.1.20:5555
adb -s 192.168.1.20:5555 install -r C:\Users\Darius\Desktop\annamour-tv.apk
adb disconnect 192.168.1.20:5555
```

- `-r` met à jour l'appli si elle est déjà installée (même clé obligatoire).
- **Ne toucher à aucun autre paquet du projecteur** : ne rien désinstaller ni désactiver. Lire d'abord `work\README.md` du dépôt cleanyourtv.
- **Refermer l'ADB à la fin** : `adb disconnect`, puis désactiver le débogage réseau dans les options pour les développeurs du projecteur.

Annamour apparaît ensuite dans la rangée des applis de Google TV (à ajouter aux favoris si besoin).
