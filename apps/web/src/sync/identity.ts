import { BUBBLE_COLORS, type BubbleColor } from "@annamour/protocol";
import { create } from "zustand";

/*
 * Who this device is. No accounts: a random id kept in localStorage, plus the
 * name and bubble colour the person picked. Storage can throw (Safari private
 * mode, quota, disabled storage), so every access is guarded and the app keeps
 * working with an in-memory identity.
 */

const STORAGE_KEY = "annamour:identity:v1";

export interface Identity {
  clientId: string;
  name: string;
  color: BubbleColor;
}

interface IdentityStore extends Identity {
  setName: (name: string) => void;
  setColor: (color: BubbleColor) => void;
}

/** crypto.randomUUID only exists in secure contexts; LAN testing over http needs a fallback. */
function newClientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomColor(): BubbleColor {
  return BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)] ?? "peach";
}

function isBubbleColor(value: unknown): value is BubbleColor {
  return typeof value === "string" && (BUBBLE_COLORS as readonly string[]).includes(value);
}

function load(): Identity {
  const fallback: Identity = { clientId: newClientId(), name: "", color: randomColor() };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<Record<keyof Identity, unknown>>;
    return {
      clientId:
        typeof data.clientId === "string" && data.clientId.length >= 8 && data.clientId.length <= 64
          ? data.clientId
          : fallback.clientId,
      name: typeof data.name === "string" ? data.name.slice(0, 24) : "",
      color: isBubbleColor(data.color) ? data.color : fallback.color,
    };
  } catch {
    return fallback;
  }
}

function save(identity: Identity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Not persisted this time; the in-memory identity still works.
  }
}

const initial = load();
save(initial);

export const useIdentity = create<IdentityStore>()((set, get) => ({
  ...initial,
  setName: (name) => {
    set({ name: name.slice(0, 24) });
    save(pick(get()));
  },
  setColor: (color) => {
    set({ color });
    save(pick(get()));
  },
}));

function pick({ clientId, name, color }: Identity): Identity {
  return { clientId, name, color };
}

/** Snapshot for the hello message. The name falls back so the server's min(1) holds. */
export function currentIdentity(): Identity {
  const { clientId, name, color } = useIdentity.getState();
  return { clientId, name: name.trim() || "Invité", color };
}
