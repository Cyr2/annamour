import type { Account } from "@annamour/protocol";
import { ArrowRight, Repeat } from "lucide-react";
import { Button } from "../../ui/controls.tsx";
import { KeyWords } from "../../ui/KeyWords.tsx";
import { NoticeScreen } from "../../ui/NoticeScreen.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { useAccount } from "../account/account.ts";

interface ReplaceAccountScreenProps {
  current: Account;
  target: Account;
  onReplace: () => void;
  onCancel: () => void;
}

/**
 * A QR code for another account, scanned on a device that has its own: nothing
 * changes until the person says so, and the words of the account leaving this
 * device are shown first (when this device knows them) so it is not lost.
 */
export function ReplaceAccountScreen({ current, target, onReplace, onCancel }: ReplaceAccountScreenProps) {
  const key = useAccount((s) => (s.account?.id === current.id ? s.key : null));

  return (
    <NoticeScreen>
      <div className="flex items-center gap-4" aria-hidden>
        <PresenceBubble name={current.name} color={current.color} size="md" />
        <ArrowRight className="size-5 text-fg-subtle" />
        <PresenceBubble name={target.name} color={target.color} size="md" />
      </div>
      <h1 className="type-title text-balance">
        Remplacer le compte de {current.name} par celui de {target.name} sur cet appareil ?
      </h1>
      <p className="text-sm text-pretty text-fg-muted">
        Note d'abord les 4 mots du compte de {current.name} : sans eux, il ne reviendra pas sur cet appareil.
      </p>
      {key ? <KeyWords words={key} label={`Les 4 mots du compte de ${current.name}`} /> : null}
      <div className="flex w-full flex-col gap-3">
        <Button variant="filled" size="large" icon={<Repeat />} onClick={onReplace}>
          Remplacer par {target.name}
        </Button>
        <Button size="large" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </NoticeScreen>
  );
}
