import { CIRCLE_INVITE_TTL_MS, type Circle, circleTitle } from "@annamour/protocol";
import { inviteToCircle, inviteUrl } from "../../api/circles.ts";
import { toast } from "../../ui/toast.ts";

/*
 * « Inviter » on a circle. The phone's share sheet only opens straight from a
 * tap: waiting for the server first lets the tap expire and the sheet is
 * refused. So a link, once asked for, is kept and shared at once the next times;
 * where sharing is refused or missing, the link is copied instead.
 */

/** A link is asked for again well before it expires, so a shared one still opens. */
const KEPT_MS = CIRCLE_INVITE_TTL_MS / 2;

const links = new Map<string, { url: string; until: number }>();

/** What the person invited reads: the circle's name, else its people, never a « toi » meant for someone else. */
export function invitationText(circle: Pick<Circle, "name" | "members">): string {
  return `Rejoins « ${circleTitle(circle, "")} » sur Annamour`;
}

function keptLink(circleId: string, now: number): string | null {
  const link = links.get(circleId);
  return link && link.until > now ? link.url : null;
}

async function newLink(circleId: string): Promise<string> {
  const { token } = await inviteToCircle(circleId);
  const url = inviteUrl(token);
  links.set(circleId, { url, until: Date.now() + KEPT_MS });
  return url;
}

/** The share sheet where there is one; refused or missing, the clipboard. Closing the sheet does nothing. */
async function shareLink(url: string, text: string): Promise<void> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Annamour", text, url });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast({ message: "Lien copié" });
  } catch {
    // The clipboard wants a fresh tap too: the link is kept, the next tap shares it at once.
    toast({ message: "Lien prêt : touche encore « Inviter » pour l'envoyer" });
  }
}

/** Shares an invitation to the circle; called right in the tap so the share sheet is allowed. */
export async function inviteToCircleNow(circle: Circle): Promise<void> {
  const url = keptLink(circle.id, Date.now()) ?? (await newLink(circle.id));
  await shareLink(url, invitationText(circle));
}
