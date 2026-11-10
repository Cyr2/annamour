import { Fingerprint, type LucideProps, ScanFace } from "lucide-react";
import type { PasskeyWording } from "./passkey-wording.ts";

/** A face for Face ID, a fingerprint everywhere else. */
export function PasskeyIcon({ kind, ...props }: { kind: PasskeyWording["icon"] } & LucideProps) {
  const Icon = kind === "face" ? ScanFace : Fingerprint;
  return <Icon aria-hidden {...props} />;
}
