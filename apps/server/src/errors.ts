/**
 * Errors the person can do something about. Their message is shown as is,
 * so it is in French and says what to do next.
 */
export class UserFacingError extends Error {
  readonly status: 400 | 401 | 404 | 409 | 410 | 422 | 429 | 502 | 503;

  constructor(message: string, status: UserFacingError["status"]) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}

export class BadRequestError extends UserFacingError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotSignedInError extends UserFacingError {
  constructor() {
    super("Connecte-toi d'abord avec ta clé de 4 mots.", 401);
  }
}

export class InvalidKeyError extends UserFacingError {
  constructor() {
    super("Ces 4 mots ne correspondent à aucun compte. Vérifie chaque mot et réessaie.", 401);
  }
}

export class TooManyAttemptsError extends UserFacingError {
  constructor(message = "Trop d'essais. Réessaie dans une heure, ou scanne le QR code d'un appareil déjà connecté.") {
    super(message, 429);
  }
}

export class InvalidLinkTokenError extends UserFacingError {
  constructor() {
    super("Ce QR code a expiré ou a déjà servi. Affiches-en un nouveau sur ton autre appareil.", 401);
  }
}

export class PasskeyError extends UserFacingError {
  constructor() {
    super("Cette passkey n'a pas été reconnue. Réessaie, ou connecte-toi avec tes 4 mots.", 401);
  }
}

export class NotFoundError extends UserFacingError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class TooManyEpisodesError extends UserFacingError {
  constructor() {
    super("Cette séance a déjà son lot d'épisodes : crée une nouvelle séance pour la suite.", 409);
  }
}

export class UnknownTvCodeError extends UserFacingError {
  constructor() {
    super("Ce code ne correspond à aucune TV. Vérifie les 6 caractères affichés sur l'écran.", 404);
  }
}

export class ExpiredTvCodeError extends UserFacingError {
  constructor() {
    super("Ce code a expiré. Affiche un nouveau code sur la TV, puis réessaie.", 410);
  }
}

export class CatalogUnavailableError extends UserFacingError {
  constructor() {
    super("La recherche n'est pas branchée sur ce serveur : colle le lien de la vidéo à la place.", 503);
  }
}

export class CatalogUnreachableError extends UserFacingError {
  constructor() {
    super("Naka ne répond pas. Réessaie dans un instant, ou colle le lien de la vidéo.", 502);
  }
}

export class CatalogAccountError extends UserFacingError {
  constructor() {
    super("Le compte Naka du serveur est déconnecté : mets à jour NAKA_TOKEN dans Coolify.", 502);
  }
}

export class CatalogBusyError extends UserFacingError {
  constructor() {
    super("Beaucoup de recherches d'un coup : réessaie dans une minute.", 429);
  }
}

export class NoVideoError extends UserFacingError {
  constructor() {
    super("Ce titre n'a pas encore de vidéo sur Naka. Choisis-en un autre.", 404);
  }
}

export class UsedTvCodeError extends UserFacingError {
  constructor() {
    super("Ce code a déjà servi. Si la TV n'est pas connectée, affiches-en un nouveau.", 409);
  }
}
