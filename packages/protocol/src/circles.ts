import { z } from "zod/mini";
import { Participant } from "./api.ts";

/*
 * Circles: the groups of people someone watches with (« Annou et toi », « Les
 * potes du jeudi »). One forms by itself when a séance gathers a group; it can
 * be named, left, and grown with an invitation link. Titles and séances belong
 * to a circle, and the app shows one circle at a time (« Avec qui ce soir ? »).
 */

export const CircleName = z.string().check(z.trim(), z.minLength(1), z.maxLength(40));

export const Circle = z.object({
  id: z.string(),
  /** Absent until someone names it: it is then called after its people (see circleTitle). */
  name: z.optional(z.string()),
  /** Everyone in it, the requester included. */
  members: z.array(Participant),
  /** Séances watched in it. */
  evenings: z.number(),
  lastUsedAt: z.optional(z.number()),
});
export type Circle = z.infer<typeof Circle>;

export const CircleList = z.object({ circles: z.array(Circle) });
export type CircleList = z.infer<typeof CircleList>;

export const CreateCircleRequest = z.object({ name: CircleName });
export const RenameCircleRequest = z.object({ name: CircleName });
export const CreateCircleResponse = z.object({ id: z.string() });
export type CreateCircleResponse = z.infer<typeof CreateCircleResponse>;

/** A reusable invitation link, valid a week. */
export const CircleInvite = z.object({ token: z.string().check(z.minLength(16)), expiresAt: z.number() });
export type CircleInvite = z.infer<typeof CircleInvite>;
export const JoinCircleRequest = z.object({ token: z.string().check(z.minLength(16)) });
/** What an invitation shows before saying yes. */
export const CircleInvitePreview = z.object({
  id: z.string(),
  name: z.optional(z.string()),
  members: z.array(Participant),
});
export type CircleInvitePreview = z.infer<typeof CircleInvitePreview>;

export const CIRCLE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const CIRCLES_API = {
  list: "/api/me/circles",
  item: "/api/me/circles/:id",
  invite: "/api/me/circles/:id/invite",
  join: "/api/me/circles/join",
  preview: "/api/circles/invite/:token",
} as const;

/**
 * What a circle is called: its name, else its people seen from `me`:
 * « Annou et toi », « Léo, Inès et toi », « Juste toi ».
 */
export function circleTitle(circle: Pick<Circle, "name" | "members">, me: string): string {
  if (circle.name) return circle.name;
  const others = circle.members.filter((person) => person.accountId !== me).map((person) => person.name);
  if (others.length === 0) return "Juste toi";
  const names = [...others, "toi"];
  return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
}

/** The people of a circle other than `me`, in its order. */
export function othersIn(circle: Pick<Circle, "members">, me: string): Circle["members"] {
  return circle.members.filter((person) => person.accountId !== me);
}

/** The circles in the order they are offered: the most recently used first, never-used ones last. */
export function byRecentUse(circles: readonly Circle[]): Circle[] {
  return [...circles].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
}
