import type { ReactNode } from "react";
import { GuestWelcome } from "../../routes.ts";
import { AccountChecking, useAccountCheck } from "./AccountGate.tsx";
import { useAccount } from "./account.ts";
import { useGuest } from "./guest.ts";

/**
 * A séance (its link, or « Rejoindre » with a code) opens without an account.
 * A device without one first picks how to come in: its account (4 words, a QR
 * code), or just a prénom. A guest who already chose comes straight in.
 */
export function SeanceGate({ children }: { children: ReactNode }) {
  const status = useAccount((s) => s.status);
  const entered = useGuest((s) => s.entered);
  useAccountCheck();

  if (status === "member" || (status === "guest" && entered)) return children;
  if (status === "guest") return <GuestWelcome />;
  return <AccountChecking />;
}
