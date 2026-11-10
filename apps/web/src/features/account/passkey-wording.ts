import { deviceKind } from "@annamour/protocol";

/** How a passkey is called on this device, so an Android phone is never asked about Face ID. */
export interface PasskeyWording {
  /** On its own, e.g. the sign-in button. */
  name: string;
  /** The button that turns it on. */
  enable: string;
  /** Said once it is on. */
  enabled: string;
  /** What it changes, on the first launch. */
  lede: string;
  icon: "face" | "fingerprint";
}

const KEY_STAYS = "Elle reste ta solution de secours.";

function apple(name: string, icon: PasskeyWording["icon"]): PasskeyWording {
  return {
    name,
    enable: `Activer ${name}`,
    enabled: `${name} activé`,
    lede: `Tu n'auras plus besoin de ta clé sur cet appareil. ${KEY_STAYS}`,
    icon,
  };
}

const FACE_ID = apple("Face ID", "face");
const TOUCH_ID = apple("Touch ID", "fingerprint");
// Android, Windows, Linux: a fingerprint, a face or the screen lock, whichever the device has.
const ANYWHERE_ELSE: PasskeyWording = {
  name: "Empreinte",
  enable: "Activer l'empreinte",
  enabled: "Empreinte activée",
  lede: `Ton empreinte ou le verrouillage de l'appareil remplace ta clé ici. ${KEY_STAYS}`,
  icon: "fingerprint",
};

export function passkeyWording(userAgent: string, maxTouchPoints = 0): PasskeyWording {
  const kind = deviceKind(userAgent, maxTouchPoints);
  if (kind === "iPhone" || kind === "iPad") return FACE_ID;
  if (kind === "Mac") return TOUCH_ID;
  return ANYWHERE_ELSE;
}

/** The wording for the device this page runs on. */
export function thisDevicePasskey(): PasskeyWording {
  return passkeyWording(navigator.userAgent, navigator.maxTouchPoints);
}
