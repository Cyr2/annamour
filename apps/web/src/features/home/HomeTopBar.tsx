import { LogIn } from "lucide-react";
import { useIdentity } from "../../sync/identity.ts";
import { GlassLink } from "../../ui/GlassLink.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { Wordmark } from "../../ui/Wordmark.tsx";
import { useTv } from "../tv/tv-context.ts";

/**
 * The wordmark alone: the tab bar already leads to Rejoindre and Profil. A TV
 * has no tab bar, so its top right holds both, like a TV app's menu.
 */
export function HomeTopBar() {
  const tv = useTv();
  return (
    <header className="flex min-h-12 items-center justify-between gap-3">
      <Wordmark />
      {tv ? (
        <nav aria-label="Navigation" className="flex items-center gap-5">
          {/* Where the remote starts when there is nothing to resume (see features/tv/focus-engine.ts). */}
          <div data-tv-primary>
            <LinkButton href="/rejoindre" icon={<LogIn />}>
              Rejoindre avec un code
            </LinkButton>
          </div>
          <ProfileChip />
        </nav>
      ) : null}
    </header>
  );
}

function ProfileChip() {
  const name = useIdentity((s) => s.name);
  const color = useIdentity((s) => s.color);
  return (
    <GlassLink
      href="/profil"
      className="rounded-pill"
      linkClassName="flex min-h-11 items-center gap-2 py-[5px] pr-4 pl-[5px] text-sm font-semibold"
    >
      <span aria-hidden>
        <PresenceBubble name={name || "Toi"} color={color} size="xs" className="[&_[role=img]]:shadow-none" />
      </span>
      {/* The spoken name keeps the visible one: « Mon profil, Darius ». */}
      <span className="max-w-[12ch] truncate">
        <span className="sr-only">Mon profil, </span>
        {name || "Toi"}
      </span>
    </GlassLink>
  );
}
