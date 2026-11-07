import { type Account, type BubbleColor, Name } from "@annamour/protocol";
import { Check } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { ColorPicker } from "../../ui/ColorPicker.tsx";
import { Input } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { toast } from "../../ui/toast.ts";
import { updateProfile } from "../account/account.ts";
import { useTv } from "../tv/tv-context.ts";

/** My bubble, prénom and colour, saved on the account (the prénom when the field is left). */
export function MeCard({ account }: { account: Account }) {
  const [name, setName] = useState(account.name);
  const [color, setColor] = useState<BubbleColor>(account.color);
  const tv = useTv();

  const saveName = async () => {
    const parsed = Name.safeParse(name);
    if (!parsed.success) {
      setName(account.name);
      toast({ message: "Ton prénom ne peut pas être vide." });
      return;
    }
    if (parsed.data === account.name) return;
    try {
      await updateProfile({ name: parsed.data });
      toast({ message: "Prénom enregistré", icon: <Check /> });
    } catch (failure) {
      setName(account.name);
      toast({ message: errorMessage(failure) });
    }
  };

  const saveColor = async (next: BubbleColor) => {
    const previous = color;
    setColor(next);
    try {
      await updateProfile({ color: next });
    } catch (failure) {
      setColor(previous);
      toast({ message: errorMessage(failure) });
    }
  };

  const nameField = (
    <Field label="Ton prénom" htmlFor="profile-name" className="w-full">
      <Input
        id="profile-name"
        value={name}
        onValueChange={setName}
        onBlur={() => void saveName()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        maxLength={24}
        autoComplete="given-name"
        enterKeyHint="done"
      />
    </Field>
  );
  const colorField = (
    <Field label="Couleur de ta bulle" className="w-full">
      <ColorPicker value={color} onValueChange={(next) => void saveColor(next)} label="Couleur de ta bulle" />
    </Field>
  );

  // A TV fits the whole profile on one screen: the bubble beside the prénom, no footnote.
  if (tv) {
    return (
      <Surface className="surface-panel grid gap-4 p-5">
        <div className="flex items-end gap-4">
          <PresenceBubble name={name.trim() || "?"} color={color} size="lg" />
          {nameField}
        </div>
        {colorField}
      </Surface>
    );
  }

  return (
    <Surface className="surface-panel grid justify-items-center gap-5 p-4 text-center sm:p-6">
      <PresenceBubble name={name.trim() || "?"} color={color} size="xl" />
      {nameField}
      {colorField}
      <p className="text-xs text-fg-subtle">Enregistré sur ton compte, sans mot de passe.</p>
    </Surface>
  );
}
