import {
  apiPath,
  CIRCLES_API,
  type Circle,
  CircleInvite,
  CircleInvitePreview,
  CircleList,
  CreateCircleResponse,
  type MergeCirclesRequest,
} from "@annamour/protocol";
import { z } from "zod/mini";
import { request } from "./http.ts";

/* Circles: the groups one watches with (see @annamour/protocol circles.ts). */

/** Writes answer 204: nothing to read back. */
const Ignored = z.unknown();
const GONE = { 404: "Ce cercle n'existe plus, ou tu n'en fais plus partie." };

export async function fetchCircles(): Promise<Circle[]> {
  const { circles } = await request(CircleList, CIRCLES_API.list);
  return circles;
}

export async function createCircle(name: string): Promise<string> {
  const { id } = await request(CreateCircleResponse, CIRCLES_API.list, { body: { name: name.trim() } });
  return id;
}

export async function renameCircle(id: string, name: string): Promise<void> {
  await request(Ignored, apiPath(CIRCLES_API.item, { id }), {
    method: "PATCH",
    body: { name: name.trim() },
    messages: GONE,
  });
}

/** Saves the order I put my circles in; the others keep theirs. */
export async function reorderCircles(ids: string[]): Promise<void> {
  await request(Ignored, CIRCLES_API.order, { method: "PUT", body: { ids } });
}

export async function leaveCircle(id: string): Promise<void> {
  await request(Ignored, apiPath(CIRCLES_API.item, { id }), { method: "DELETE", messages: GONE });
}

/** Reunites `fromId` into `intoId`, two circles of the same people, keeping the name of `keepNameOf`. */
export async function mergeCircles(fromId: string, intoId: string, keepNameOf: string): Promise<void> {
  await request(Ignored, apiPath(CIRCLES_API.merge, { id: fromId }), {
    body: { into: intoId, keepNameOf } satisfies MergeCirclesRequest,
    messages: GONE,
  });
}

export async function inviteToCircle(id: string): Promise<CircleInvite> {
  return request(CircleInvite, apiPath(CIRCLES_API.invite, { id }), { method: "POST", messages: GONE });
}

const EXPIRED = { 410: "Ce lien d'invitation a expiré. Demande-en un nouveau à quelqu'un du cercle." };

export async function previewInvite(token: string): Promise<CircleInvitePreview> {
  return request(CircleInvitePreview, apiPath(CIRCLES_API.preview, { token }), { messages: EXPIRED });
}

export async function joinCircle(token: string): Promise<string> {
  const { id } = await request(CreateCircleResponse, CIRCLES_API.join, { body: { token }, messages: EXPIRED });
  return id;
}

/** Where an invitation link leads in the app. */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/cercle/${encodeURIComponent(token)}`;
}
