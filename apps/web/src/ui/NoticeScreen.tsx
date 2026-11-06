import type { ReactNode } from "react";
import { Glass } from "./controls.tsx";
import { Wordmark } from "./Wordmark.tsx";

/**
 * A screen with one thing to say and one way on: a wrong link, a séance that
 * is gone, a page that does not exist, or a short wait. The wordmark over a
 * single glass panel.
 */
export function NoticeScreen({ children }: { children: ReactNode }) {
  return (
    <main className="safe-area grid min-h-dvh place-items-center text-center">
      <div className="grid w-[min(420px,100%)] justify-items-center gap-6">
        <Wordmark size="lg" />
        <Glass className="surface-panel grid w-full justify-items-center gap-5 p-6 text-pretty sm:p-8">
          {children}
        </Glass>
      </div>
    </main>
  );
}
