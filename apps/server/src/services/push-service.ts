import type { PushPayload, PushSubscriptionRequest } from "@annamour/protocol";
import { z } from "zod";
import { PushUnavailableError } from "../errors.ts";
import type { Repositories } from "../storage/repositories.ts";

/** Delivers one notification to one device; throws the push service's refusal (web-push's WebPushError). */
export type PushSender = (subscription: PushSubscriptionRequest, payload: string) => Promise<unknown>;

/** A push service answers 404 or 410 for a device that unsubscribed or was reset: its subscription is dead. */
const GoneSubscription = z.object({ statusCode: z.union([z.literal(404), z.literal(410)]) });

export interface PushServiceOptions {
  repositories: Pick<Repositories, "push">;
  /** Absent without VAPID keys: nothing is sent, nobody can subscribe. */
  sender: PushSender | undefined;
  publicKey: string | undefined;
  now: () => number;
}

/** Web Push: devices subscribe per account; a message goes to every device of the accounts named. */
export class PushService {
  private readonly options: PushServiceOptions;

  constructor(options: PushServiceOptions) {
    this.options = options;
  }

  get enabled(): boolean {
    return this.options.sender !== undefined;
  }

  get publicKey(): string | undefined {
    return this.enabled ? this.options.publicKey : undefined;
  }

  subscribe(accountId: string, subscription: PushSubscriptionRequest): void {
    if (!this.enabled) throw new PushUnavailableError();
    this.options.repositories.push.save(accountId, subscription, this.options.now());
  }

  unsubscribe(accountId: string, endpoint: string): void {
    this.options.repositories.push.remove(endpoint, accountId);
  }

  /** Sends to every device of these accounts; `message` may differ per account. */
  async send(
    accountIds: readonly string[],
    message: PushPayload | ((accountId: string) => PushPayload),
  ): Promise<void> {
    const { sender, repositories } = this.options;
    if (!sender) return;
    const subscriptions = repositories.push.ofAccounts(accountIds);
    await Promise.all(
      subscriptions.map(async ({ accountId, ...subscription }) => {
        const payload = typeof message === "function" ? message(accountId) : message;
        try {
          await sender(subscription, JSON.stringify(payload));
        } catch (error) {
          if (GoneSubscription.safeParse(error).success) repositories.push.remove(subscription.endpoint);
          else console.warn("Push not delivered", error);
        }
      }),
    );
  }
}
