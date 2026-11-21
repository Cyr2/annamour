import { PLAN_MAX_AHEAD_MS, REMINDER_LEADS_MS, reminderMessage, reminderStep } from "@annamour/protocol";
import { BadRequestError, NotFoundError } from "../errors.ts";
import type { StoredPlan } from "../storage/plan-repository.ts";
import type { Repositories } from "../storage/repositories.ts";
import type { PushService } from "./push-service.ts";

export interface PlanServiceOptions {
  repositories: Pick<Repositories, "plans" | "participations">;
  push: PushService;
  now: () => number;
}

const EARLIEST_REMINDER_MS = Math.max(...REMINDER_LEADS_MS);

/** « Prévoir la soirée »: a time on a séance, seen by all its people, who are reminded of it. */
export class PlanService {
  private readonly options: PlanServiceOptions;

  constructor(options: PlanServiceOptions) {
    this.options = options;
  }

  plan(code: string, accountId: string, at: number): void {
    this.mustSee(code, accountId);
    const now = this.options.now();
    if (at <= now || at > now + PLAN_MAX_AHEAD_MS)
      throw new BadRequestError("Choisis une heure à venir, dans les 60 prochains jours.");
    this.options.repositories.plans.plan(code, at);
  }

  cancel(code: string, accountId: string): void {
    this.mustSee(code, accountId);
    this.options.repositories.plans.cancel(code);
  }

  /** Sends the reminders now due, read from the database: a restart loses none. */
  async remind(): Promise<void> {
    const now = this.options.now();
    for (const plan of this.options.repositories.plans.until(now + EARLIEST_REMINDER_MS)) {
      await this.step(plan, now);
    }
  }

  private async step(plan: StoredPlan, now: number): Promise<void> {
    const { plans } = this.options.repositories;
    const step = reminderStep(plan.plannedAt, plan.remindersSent, now);
    if (step.expired) {
      plans.cancel(plan.code);
      return;
    }
    if (step.sent === plan.remindersSent) return;
    // Marked first: a failing push service never repeats a reminder every minute.
    plans.markSent(plan.code, step.sent);
    if (step.lead === undefined) return;
    const { lead } = step;
    const people = plans.recipients(plan.code);
    await this.options.push.send(
      people.map((person) => person.id),
      (accountId) => ({
        ...reminderMessage({
          title: plan.title,
          plannedAt: plan.plannedAt,
          lead,
          others: people.filter((person) => person.id !== accountId).map((person) => person.name),
          now,
        }),
        url: `/s/${plan.code}`,
        // One notification per séance: the one at the time replaces the one before.
        tag: `plan-${plan.code}`,
      }),
    );
  }

  private mustSee(code: string, accountId: string): void {
    if (!this.options.repositories.participations.includes(code, accountId))
      throw new NotFoundError("Cette séance n'est pas dans tes séances.");
  }
}
