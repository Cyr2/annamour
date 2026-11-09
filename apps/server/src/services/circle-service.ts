import { randomUUID } from "node:crypto";
import {
  CIRCLE_INVITE_TTL_MS,
  type Circle,
  type CircleInvite,
  type CircleInvitePreview,
  sameMembers,
} from "@annamour/protocol";
import { InvalidCircleInviteError, NameNotFromCirclesError, NotFoundError, NotTwinCirclesError } from "../errors.ts";
import type { Repositories } from "../storage/repositories.ts";
import { hashToken, randomToken } from "./secrets.ts";

export interface CircleServiceOptions {
  repositories: Pick<Repositories, "circles">;
  now: () => number;
  newId?: () => string;
}

const NOT_IN_CIRCLE = "Ce cercle n'existe plus, ou tu n'en fais plus partie.";

/**
 * Circles form by themselves: a séance of several people belongs to the circle
 * made of exactly them (created when needed). A séance started from a circle
 * stays in it as long as only its members join. Leaving a séance's history
 * never takes anyone out of a circle. Two circles of the same people (after
 * someone leaves, or joins by invitation) stay two until someone in them
 * chooses to reunite them.
 */
export class CircleService {
  private readonly repositories: CircleServiceOptions["repositories"];
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor({ repositories, now, newId = randomUUID }: CircleServiceOptions) {
    this.repositories = repositories;
    this.now = now;
    this.newId = newId;
  }

  list(accountId: string): Circle[] {
    // In the order this person set, then the most recently used: the storage sorts them.
    return this.repositories.circles.listFor(accountId);
  }

  create(accountId: string, name: string): string {
    const id = this.newId();
    this.repositories.circles.create(id, name, this.now(), [accountId]);
    return id;
  }

  /** Someone's own order of their circles (« Nous »); the other members keep theirs. */
  reorder(accountId: string, circleIds: readonly string[]): void {
    this.repositories.circles.setOrder(accountId, circleIds);
  }

  rename(accountId: string, circleId: string, name: string): void {
    this.requireMember(accountId, circleId);
    this.repositories.circles.rename(circleId, name);
  }

  leave(accountId: string, circleId: string): void {
    this.requireMember(accountId, circleId);
    this.repositories.circles.removeMember(circleId, accountId);
  }

  invite(accountId: string, circleId: string): CircleInvite {
    this.requireMember(accountId, circleId);
    const token = randomToken();
    const expiresAt = this.now() + CIRCLE_INVITE_TTL_MS;
    this.repositories.circles.insertInvite(hashToken(token), circleId, expiresAt);
    return { token, expiresAt };
  }

  preview(token: string): CircleInvitePreview {
    const circle = this.repositories.circles.find(this.circleOf(token));
    if (!circle) throw new InvalidCircleInviteError();
    return { id: circle.id, ...(circle.name ? { name: circle.name } : {}), members: circle.members };
  }

  join(accountId: string, token: string): string {
    const circleId = this.circleOf(token);
    this.repositories.circles.addMember(circleId, accountId, this.now());
    return circleId;
  }

  /**
   * Reunites two circles of exactly the same people, by the choice of one of them: everything of
   * `fromId` goes into `intoId` (séances keep who was there), under the name of `keepNameOf`.
   */
  merge(accountId: string, fromId: string, intoId: string, keepNameOf: string): void {
    const { circles } = this.repositories;
    this.requireMember(accountId, fromId);
    this.requireMember(accountId, intoId);
    if (fromId === intoId || !sameMembers(circles.memberIds(fromId), circles.memberIds(intoId))) {
      throw new NotTwinCirclesError();
    }
    if (keepNameOf !== fromId && keepNameOf !== intoId) throw new NameNotFromCirclesError();
    const name = circles.name(keepNameOf);
    circles.merge(fromId, intoId);
    circles.rename(intoId, name);
    circles.markReunited(intoId, accountId, this.now());
  }

  /** Puts a séance just created from a circle in it. */
  assignRoom(accountId: string, code: string, circleId: string): void {
    this.requireMember(accountId, circleId);
    this.repositories.circles.setRoomCircle(code, circleId);
  }

  /** After someone joins a séance: the séance belongs to the circle of exactly its people. */
  syncRoom(code: string): void {
    const { circles } = this.repositories;
    const people = circles.roomAccounts(code);
    const current = circles.roomCircle(code);
    if (current && people.every((id) => circles.isMember(current, id))) return;
    if (people.length < 2) return;
    const existing = circles.findByMembers(people);
    // People join a séance seconds apart: the circle the first ones formed grows instead of staying behind.
    const forming = current && circles.isForming(current, code) ? current : undefined;
    if (forming && !existing) {
      this.grow(forming, people);
      return;
    }
    circles.setRoomCircle(code, existing ?? this.newCircle(people));
    if (forming) circles.remove(forming);
  }

  private grow(circleId: string, people: readonly string[]): void {
    for (const accountId of people) this.repositories.circles.addMember(circleId, accountId, this.now());
  }

  /** Séances made before circles existed find theirs (run once at start, harmless after). */
  backfill(): void {
    for (const code of this.repositories.circles.roomsWithoutCircle()) this.syncRoom(code);
  }

  private newCircle(people: readonly string[]): string {
    const id = this.newId();
    this.repositories.circles.create(id, null, this.now(), people);
    return id;
  }

  private circleOf(token: string): string {
    const circleId = this.repositories.circles.circleForInvite(hashToken(token), this.now());
    if (!circleId) throw new InvalidCircleInviteError();
    return circleId;
  }

  private requireMember(accountId: string, circleId: string): void {
    if (!this.repositories.circles.isMember(circleId, accountId)) throw new NotFoundError(NOT_IN_CIRCLE);
  }
}
