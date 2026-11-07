import { z } from "zod/mini";
import { create } from "zustand";
import { readStored, writeStored } from "../../lib/storage.ts";

/*
 * Which interface this device shows while both are tried side by side:
 * « classic » (Accueil, Rejoindre, À regarder, Profil) or « circles » (Ce soir,
 * Notre liste, Nous). Same account, same séances, same data: only the screens
 * change. A TV keeps its own screens either way.
 */

export const UiVersion = z.enum(["classic", "circles"]);
export type UiVersion = z.infer<typeof UiVersion>;

const KEY = "annamour.interface";

export const useUiVersion = create<{ version: UiVersion }>()(() => ({
  version: readStored(KEY, UiVersion) ?? "classic",
}));

export function setUiVersion(version: UiVersion): void {
  writeStored(KEY, version);
  useUiVersion.setState({ version });
}

/** Whether this device shows the circles interface. */
export const useCircleUi = () => useUiVersion((s) => s.version === "circles");

/** The same, outside React (in a hook's callback, at the moment it runs). */
export const circleUiNow = () => useUiVersion.getState().version === "circles";

/** The home page of each interface's list of titles. */
export const listPath = (circles: boolean) => (circles ? "/liste" : "/a-regarder");
