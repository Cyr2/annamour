import type { BubbleColor } from "@annamour/protocol";
import type { ReactNode } from "react";
import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  /** A lucide icon element, e.g. <Pause />. */
  icon?: ReactNode;
  /** Ties the capsule to a person: shows a dot in their bubble colour. */
  color?: BubbleColor;
  /** ms before it leaves on its own. */
  duration: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

const MAX_VISIBLE = 3;
let nextId = 1;

export const useToasts = create<ToastStore>()((set, get) => ({
  toasts: [],
  push: ({ duration = 3200, ...rest }) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, duration, ...rest }].slice(-MAX_VISIBLE) }));
    setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Shows a capsule notification, e.g. toast({ message: "Anna a mis en pause", icon: <Pause /> }). */
export function toast(input: Parameters<ToastStore["push"]>[0]): number {
  return useToasts.getState().push(input);
}
