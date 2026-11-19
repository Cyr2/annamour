import { youTubeVideoId } from "@annamour/protocol";

/** What a pasted link starts: a video by its .m3u8 playlist, or a YouTube video or live stream. */
export type LinkKind = "m3u8" | "youtube";

/** Why this link cannot start a séance of that kind, or null: said before anything is sent. */
export function linkProblem(kind: LinkKind, url: string): string | null {
  if (kind === "youtube" && !youTubeVideoId(url.trim())) return "Colle un lien de vidéo YouTube.";
  return null;
}
