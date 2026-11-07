import { type ReactNode, useEffect } from "react";
import { Redirect, useLocation } from "wouter";
import { Wordmark } from "../../ui/Wordmark.tsx";
import { useTv } from "../tv/tv-context.ts";
import { refreshAccount, useAccount } from "./account.ts";

/**
 * Where a guest lands, remembering the page they wanted (e.g. a shared séance
 * link, or a TV's pairing link with its code after the #). A TV is linked
 * from a phone instead of going through the first launch.
 */
export function welcomePath(next: string, tv = false): string {
  const start = tv ? "/tv/lier" : "/bienvenue";
  return next === "/" ? start : `${start}?suite=${encodeURIComponent(next)}`;
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
  const tv = useTv();

  useEffect(() => {
    if (checked) return;
    checked = true;
    void refreshAccount();
  }, []);

  if (status === "member") return children;
  if (status === "guest") return <Redirect to={welcomePath(location + window.location.hash, tv)} replace />;
  return (
    <main className="grid min-h-dvh place-items-center" aria-busy="true">
      <Wordmark />
    </main>
  );
}
