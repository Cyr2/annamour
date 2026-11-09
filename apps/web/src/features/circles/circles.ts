import type { Circle } from "@annamour/protocol";
import { z } from "zod/mini";
import { create } from "zustand";
import * as api from "../../api/circles.ts";
import { errorMessage } from "../../api/http.ts";
import { readStored, removeStored, writeStored } from "../../lib/storage.ts";
import { pairKey, reunionKey, untoldReunions } from "./circle-rules.ts";

/*
 * My circles (GET /api/me/circles) and the one the app shows (« Avec qui ce
 * soir ? »), remembered on this device. null means « Tout ».
 */

export type CirclesStatus = "idle" | "loading" | "ready" | "error";

export interface CirclesState {
  status: CirclesStatus;
  circles: Circle[];
  error: string | null;
  /** The circle on screen; null for all of them. */
  selected: string | null;
  /** Pairs of circles of the same people I chose to keep apart (« Garder les deux »), see pairKey. */
  keptApart: string[];
}

const SELECTED_KEY = "annamour.cercle";
const KEPT_APART_KEY = "annamour.cercles-separes";
const TOLD_KEY = "annamour.reunions-annoncees";
const Ids = z.array(z.string());

export const useCircles = create<CirclesState>()(() => ({
  status: "idle",
  circles: [],
  error: null,
  selected: readStored(SELECTED_KEY, z.string()),
  keptApart: readStored(KEPT_APART_KEY, Ids) ?? [],
}));

/** The circle shown: the one picked if it still exists, else the only one, else « Tout ». */
export function shownCircle(state: Pick<CirclesState, "circles" | "selected">): string | null {
  if (state.circles.length === 1) return state.circles[0]?.id ?? null;
  return state.circles.some((circle) => circle.id === state.selected) ? state.selected : null;
}

/** The circle a séance started now belongs to: the one on screen. */
export function circleForNewSeance(): string | null {
  return shownCircle(useCircles.getState());
}

/** The circle on screen as a whole, members included; null for « Tout ». */
export function useShownCircle(): Circle | null {
  return useCircles((s) => s.circles.find((circle) => circle.id === shownCircle(s)) ?? null);
}

export function selectCircle(id: string | null): void {
  useCircles.setState({ selected: id });
  if (id) writeStored(SELECTED_KEY, id);
  else removeStored(SELECTED_KEY);
}

let inFlight: Promise<void> | null = null;

async function fetchIntoStore(): Promise<void> {
  if (useCircles.getState().status !== "ready") useCircles.setState({ status: "loading", error: null });
  try {
    useCircles.setState({ status: "ready", circles: await api.fetchCircles(), error: null });
  } catch (error) {
    if (useCircles.getState().status !== "ready") useCircles.setState({ status: "error", error: errorMessage(error) });
  }
}

/** Loads (or refreshes) my circles; concurrent calls share one request. */
export function loadCircles(): Promise<void> {
  inFlight ??= fetchIntoStore().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function resetCircles(): void {
  useCircles.setState({ status: "idle", circles: [], error: null });
}

/** Runs a change on the server, then refreshes; throws the message to show if it fails. */
async function change(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    throw new Error(errorMessage(error));
  }
  await loadCircles();
}

/** Shows an order at once, everywhere (« Ce soir », « Notre liste »), while a circle is being dragged; saved apart. */
export function previewCircleOrder(circles: Circle[]): void {
  useCircles.setState({ circles });
}

/** Shows the new order at once (« Ce soir » and « Notre liste » follow), then saves it; on failure the saved one comes back. */
export async function reorderCircles(ids: readonly string[]): Promise<void> {
  const byId = new Map(useCircles.getState().circles.map((circle) => [circle.id, circle]));
  useCircles.setState({ circles: ids.flatMap((id) => byId.get(id) ?? []) });
  try {
    await api.reorderCircles([...ids]);
  } catch (error) {
    await loadCircles();
    throw new Error(errorMessage(error));
  }
}

export const renameCircle = (id: string, name: string) => change(() => api.renameCircle(id, name));
export const leaveCircle = async (id: string) => {
  await change(() => api.leaveCircle(id));
  if (useCircles.getState().selected === id) selectCircle(null);
};
export const createCircle = async (name: string): Promise<string> => {
  let id = "";
  await change(async () => {
    id = await api.createCircle(name);
  });
  selectCircle(id);
  return id;
};

/** Reunites two circles of the same people under the name of `intoId`: the other one joins it. */
export const reuniteCircles = async (fromId: string, intoId: string) => {
  await change(() => api.mergeCircles(fromId, intoId, intoId));
  if (useCircles.getState().selected === fromId) selectCircle(intoId);
};

/**
 * « Garder les deux »: « Nous » stops offering to reunite this pair. Kept on this device: it is a
 * choice about what « Nous » offers me, not about the circles, and nobody else needs to know it.
 */
export function keepApart(a: string, b: string): void {
  const keptApart = [...useCircles.getState().keptApart, pairKey(a, b)];
  useCircles.setState({ keptApart });
  writeStored(KEPT_APART_KEY, keptApart);
}

/** Recent reunions made by someone else, each returned once per device: they are told as they are taken. */
export function takeUntoldReunions(me: string, now: number): Circle[] {
  const told = readStored(TOLD_KEY, Ids) ?? [];
  const untold = untoldReunions(useCircles.getState().circles, me, told, now);
  // Only recent news is ever told, so the last few keys are enough to remember.
  if (untold.length) writeStored(TOLD_KEY, [...told, ...untold.map(reunionKey)].slice(-50));
  return untold;
}
