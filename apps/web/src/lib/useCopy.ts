import { useState } from "react";

export type CopyState = "idle" | "done" | "failed";

/** Copies a text on demand and says how it went; the clipboard can be refused (http, old Safari). */
export function useCopy(text: string): [CopyState, () => Promise<void>] {
  const [state, setState] = useState<CopyState>("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("failed");
    }
  };
  return [state, copy];
}

/** The copy button's label for each outcome. */
export function copyLabel(state: CopyState): string {
  return state === "done" ? "Copiée" : state === "failed" ? "Sélectionne-la" : "Copier";
}
