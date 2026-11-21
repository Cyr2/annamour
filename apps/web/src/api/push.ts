import { apiPath, PUSH_API, PushKeyResponse, type PushSubscriptionRequest } from "@annamour/protocol";
import { z } from "zod/mini";
import { request } from "./http.ts";

/* Notifications: this device's push subscription, and the evening planned on a séance. */

const Ignored = z.unknown();

/** The server's VAPID public key, or undefined when it sends no notifications. */
export async function fetchPushKey(): Promise<string | undefined> {
  return (await request(PushKeyResponse, PUSH_API.key)).publicKey;
}

export async function subscribePush(subscription: PushSubscriptionRequest): Promise<void> {
  await request(Ignored, PUSH_API.subscription, { body: subscription });
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await request(Ignored, PUSH_API.subscription, { method: "DELETE", body: { endpoint } });
}

export async function planSeance(code: string, at: number): Promise<void> {
  await request(Ignored, apiPath(PUSH_API.plan, { code }), { method: "PUT", body: { at } });
}

export async function cancelPlan(code: string): Promise<void> {
  await request(Ignored, apiPath(PUSH_API.plan, { code }), { method: "DELETE" });
}
