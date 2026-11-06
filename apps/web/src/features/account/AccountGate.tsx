import { type ReactNode, useEffect } from "react";
import { Redirect, useLocation } from "wouter";
import { Wordmark } from "../../ui/Wordmark.tsx";
import { refreshAccount, useAccount } from "./account.ts";

/** Where a guest lands, remembering the page they wanted (e.g. a shared séance link). */
export function welcomePath(next: string): string {
  return next === "/" ? "/bienvenue" : `/bienvenue?suite=${encodeURIComponent(next)}`;
}

/** Only an internal path is accepted as a destination, never another site. */
export function safeNext(raw: string | null): string {
  return raw?.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

let checked = false;

/**
 * Screens behind this gate need an account: a device without one is sent to
 * the first-launch flow, then brought back where it was going.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const status = useAccount((s) => s.status);
  const [location] = useLocation();

  useEffect(() => {
    if (checked) return;
    checked = true;
    void refreshAccount();
  }, []);

  if (status === "member") return children;
  if (status === "guest") return <Redirect to={welcomePath(location)} replace />;
  return (
    <main className="grid min-h-dvh place-items-center" aria-busy="true">
      <Wordmark />
    </main>
  );
}
