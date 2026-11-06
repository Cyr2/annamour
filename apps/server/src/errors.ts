/**
 * Errors the person can do something about. Their message is shown as is,
 * so it is in French and says what to do next.
 */
export class UserFacingError extends Error {
  readonly status: 400 | 401 | 404 | 422 | 429;

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
  constructor() {
    super("Trop d'essais. Réessaie dans une heure, ou scanne le QR code d'un appareil déjà connecté.", 429);
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
