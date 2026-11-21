import { type CatalogHealth, healthAlert, healthCheckDue } from "@annamour/protocol";
import { CatalogAccountError, CatalogCaptchaError } from "../errors.ts";
import type { Repositories } from "../storage/repositories.ts";
import type { PushService } from "./push-service.ts";

/** A title Naka has had for years: finding nothing for it means the search broke. */
export const PROBE_QUERY = "Inception";

export interface HealthServiceOptions {
  repositories: Pick<Repositories, "health">;
  push: PushService;
  /** The catalog's search (one real Naka call per check); absent without naka-bridge. */
  search: ((query: string) => Promise<readonly unknown[]>) | undefined;
  /** naka-bridge's own /health: true when it can serve calls. */
  bridgeHealthy: () => Promise<boolean>;
  /** Accounts told when it breaks (ALERT_ACCOUNTS); none, no check at all. */
  alertAccounts: readonly string[];
  /** Paris hour the daily check runs from. */
  checkHour: number;
  now: () => number;
}

/**
 * Every evening before the séances, checks that films can still be found:
 * naka-bridge answers, then one real search goes through Naka (its budget
 * allows one a day). Who keeps the server hears once per failure, with what
 * to do, then once when it works again.
 */
export class HealthService {
  private readonly options: HealthServiceOptions;
  private running = false;

  constructor(options: HealthServiceOptions) {
    this.options = options;
  }

  async checkIfDue(): Promise<void> {
    const { repositories, push, alertAccounts, checkHour, now, search } = this.options;
    if (this.running || !search || !push.enabled || alertAccounts.length === 0) return;
    const last = repositories.health.last();
    if (!healthCheckDue(last?.checkedAt, now(), checkHour)) return;
    // A search may take a minute and a half: the next tick must not start a second one.
    this.running = true;
    try {
      const health = await this.probe(search);
      repositories.health.save(health, now());
      const alert = healthAlert(last?.health ?? "ok", health);
      if (alert) await push.send(alertAccounts, { title: "Annamour · serveur", body: alert, url: "/", tag: "health" });
    } finally {
      this.running = false;
    }
  }

  private async probe(search: (query: string) => Promise<readonly unknown[]>): Promise<CatalogHealth> {
    if (!(await this.options.bridgeHealthy().catch(() => false))) return "bridge-down";
    try {
      return (await search(PROBE_QUERY)).length > 0 ? "ok" : "naka-down";
    } catch (error) {
      if (error instanceof CatalogAccountError) return "token-expired";
      if (error instanceof CatalogCaptchaError) return "captcha";
      return "naka-down";
    }
  }
}
