import { type BubbleColor, Name } from "@annamour/protocol";
import { LogIn } from "lucide-react";
import { m } from "motion/react";
import { type FormEvent, useState } from "react";
import { spring } from "../../lib/motion.ts";
import { useIdentity } from "../../sync/identity.ts";
import { ColorPicker } from "../../ui/ColorPicker.tsx";
import { Button, Input } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { enterAsGuest } from "../account/guest.ts";

/** « Entrer avec un prénom »: a name and a colour for the bubble, and in. No account is made. */
export function GuestNameStep() {
  const [name, setName] = useState(useIdentity.getState().name);
  const [color, setColor] = useState<BubbleColor>(useIdentity.getState().color);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Name.safeParse(name.trim());
    if (!parsed.success) return setError("Écris ton prénom (24 lettres au plus).");
    const identity = useIdentity.getState();
    identity.setName(parsed.data);
    identity.setColor(color);
    enterAsGuest();
  };

  return (
    <form onSubmit={submit} className="grid w-full justify-items-center gap-5" noValidate>
      <m.div key={color} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring.bubble}>
        <PresenceBubble name={name.trim() || "?"} color={color} size="xl" status="alone" />
      </m.div>
      <h1 className="type-title">Ton prénom</h1>
      <p className="type-lede">C'est ce que les autres verront sur ta bulle pendant la séance.</p>
      <Field label="Ton prénom" htmlFor="guest-name" className="w-full text-left">
        <Input
          id="guest-name"
          value={name}
          onValueChange={setName}
          maxLength={24}
          autoComplete="given-name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "guest-error" : undefined}
        />
      </Field>
      <ColorPicker value={color} onValueChange={setColor} label="Couleur de ta bulle" className="justify-center" />
      <p id="guest-error" role="alert" className="min-h-6 text-sm text-danger">
        {error}
      </p>
      <Button type="submit" variant="filled" size="large" icon={<LogIn />}>
        Entrer dans la séance
      </Button>
    </form>
  );
}
