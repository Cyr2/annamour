import type { SessionSummary } from "@annamour/protocol";
import { create } from "zustand";
import * as accounts from "../../api/accounts.ts";
import { errorMessage } from "../../api/http.ts";
import { byMostRecent } from "./session-rules.ts";

/*
 * My sessions history (GET /api/me/sessions), shared by the profile and the
 * home « Reprendre » card. The list keeps its reference until it really
 * changes, so screens can derive from it with useMemo.
 */

export type SessionsStatus = "idle" | "loading" | "ready" | "error";

export interface SessionsState {
  status: SessionsStatus;
  sessions: SessionSummary[];
  error: string | null;
}

const initialState: SessionsState = { status: "idle", sessions: [], error: null };

export const useSessions = create<SessionsState>()(() => initialState);

let inFlight: Promise<void> | null = null;

async function fetchIntoStore(): Promise<void> {
  // A refresh keeps the list on screen; only a first load shows the loading state.
  if (useSessions.getState().status !== "ready") useSessions.setState({ status: "loading", error: null });
  try {
    const sessions = byMostRecent(await accounts.fetchSessions());
    useSessions.setState({ status: "ready", sessions, error: null });
  } catch (error) {
    if (useSessions.getState().status !== "ready")
      useSessions.setState({ status: "error", error: errorMessage(error) });
  }
}

/** Loads (or refreshes) the history; concurrent calls share one request. */
export function loadSessions(): Promise<void> {
  inFlight ??= fetchIntoStore().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Takes a séance out of the list at once, and puts it back if the server refuses (throwing the message to show). */
async function removeAtOnce(code: string, work: (code: string) => Promise<void>): Promise<void> {
  const removed = useSessions.getState().sessions.find((session) => session.code === code);
  if (!removed) return;
  useSessions.setState((state) => ({ sessions: state.sessions.filter((session) => session.code !== code) }));
  try {
    await work(code);
  } catch (error) {
    useSessions.setState((state) => ({ sessions: byMostRecent([...state.sessions, removed]) }));
    throw new Error(errorMessage(error));
  }
}

/** Leaves a séance: gone from my séances at once; the others keep it. */
export const leaveSession = (code: string) => removeAtOnce(code, accounts.leaveSession);

/** Deletes a séance for everyone (I created it): gone at once, for me and the others. */
export const deleteSession = (code: string) => removeAtOnce(code, accounts.deleteSessionForEveryone);

/** Another account signs in on this device: never show the previous one's history. */
export function resetSessions(): void {
  useSessions.setState(initialState);
}
