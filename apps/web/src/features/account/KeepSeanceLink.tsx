import { Bookmark } from "lucide-react";
import { useLocation } from "wouter";
import { cx } from "../../ui/cx.ts";
import { welcomePath } from "./AccountGate.tsx";
import { useAccount } from "./account.ts";
import { keepSeanceLater } from "./guest.ts";

/**
 * For a guest only, quietly: make an account and keep this séance in it. The
 * first launch brings them back here, and the séance joins their séances.
 */
export function KeepSeanceLink({ code, className }: { code: string; className?: string }) {
  const guest = useAccount((s) => s.status === "guest");
  const [, navigate] = useLocation();
  if (!guest) return null;

  const keep = () => {
    keepSeanceLater(code);
    navigate(welcomePath(`/s/${code}`));
  };

  return (
    <button
      type="button"
      onClick={keep}
      className={cx(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline",
        className,
      )}
    >
      <Bookmark aria-hidden className="size-4" />
      Garder cette séance : créer mon compte
    </button>
  );
}
