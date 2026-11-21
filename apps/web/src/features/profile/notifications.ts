import { PushSubscriptionRequest } from "@annamour/protocol";
import { fetchPushKey, subscribePush, unsubscribePush } from "../../api/push.ts";

/*
 * This device's notifications. On an iPhone or iPad, Safari only offers them
 * to the app installed on the home screen, and asks for the permission only
 * from a tap: `enableNotifications` asks first thing, before any wait.
 */

export type NotificationsAvailability = "ready" | "install-first" | "unsupported" | "blocked";

export interface DeviceTraits {
  pushSupported: boolean;
  apple: boolean;
  installed: boolean;
  permission: NotificationPermission | undefined;
}

/** What the « Notifications » switch can do on this device. */
export function notificationsAvailability(device: DeviceTraits): NotificationsAvailability {
  if (device.apple && !device.installed) return "install-first";
  if (!device.pushSupported) return "unsupported";
  return device.permission === "denied" ? "blocked" : "ready";
}

export const NOTIFICATIONS_HELP: Record<Exclude<NotificationsAvailability, "ready">, string> = {
  "install-first":
    "Sur iPhone et iPad, les notifications ne marchent que dans l'appli installée : dans Safari, touche Partager, puis « Sur l'écran d'accueil », et ouvre Annamour depuis son icône.",
  unsupported:
    "Ce navigateur ne reçoit pas de notifications : installe Annamour sur l'écran d'accueil, ou change de navigateur.",
  blocked:
    "Les notifications sont bloquées pour Annamour : autorise-les dans les réglages de l'appareil, puis reviens ici.",
};

export function deviceTraits(win: Window & typeof globalThis = window): DeviceTraits {
  const nav = win.navigator;
  const apple = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
  const installed =
    win.matchMedia("(display-mode: standalone)").matches || ("standalone" in nav && nav.standalone === true);
  return {
    pushSupported: "serviceWorker" in nav && "PushManager" in win && "Notification" in win,
    apple,
    installed,
    permission: "Notification" in win ? win.Notification.permission : undefined,
  };
}

/** The VAPID key as the push manager takes it (base64url to bytes). */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** This device receives notifications now. */
export async function notificationsOn(): Promise<boolean> {
  return Notification.permission === "granted" && (await currentSubscription()) !== null;
}

/** Call straight from a tap: Safari only asks for the permission then. */
export async function enableNotifications(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(NOTIFICATIONS_HELP.blocked);
  const key = await fetchPushKey();
  if (!key) throw new Error("Les notifications ne sont pas encore activées sur ce serveur.");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key),
  });
  await subscribePush(PushSubscriptionRequest.parse(subscription.toJSON()));
}

export async function disableNotifications(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await unsubscribePush(subscription.endpoint);
  await subscription.unsubscribe();
}
