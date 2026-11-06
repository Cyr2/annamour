import { type AccountKey, type BubbleColor, Name } from "@annamour/protocol";
import { motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { spring } from "../../lib/motion.ts";
import { useIdentity } from "../../sync/identity.ts";
import { ColorPicker } from "../../ui/ColorPicker.tsx";
import { Button, Input } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { createAccount } from "../account/account.ts";

/** Step 1: what the others will see on your bubble. Submitting creates the account. */
export function NameStep({ onCreated }: { onCreated: (key: AccountKey) => void }) {
  const [name, setName] = useState(useIdentity.getState().name);
  const [color, setColor] = useState<BubbleColor>(useIdentity.getState().color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = Name.safeParse(name);
    if (!parsed.success) return setError("Écris ton prénom (24 lettres au plus).");
    setBusy(true);
    setError(null);
    try {
      onCreated(await createAccount(parsed.data, color));
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid w-full justify-items-center gap-5" noValidate>
      <motion.div key={color} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring.bubble}>
        <PresenceBubble name={name.trim() || "?"} color={color} size="xl" status="alone" />
      </motion.div>
      <h1 className="font-rounded-tight text-[clamp(32px,4.4vw,50px)] leading-[1.05] font-extrabold text-fg">
        Une soirée ensemble
      </h1>
      <p className="text-md text-fg-muted">Dis-nous comment t'appeler. C'est ce que les autres verront sur ta bulle.</p>
      <Field label="Ton prénom" htmlFor="welcome-name" className="w-full text-left">
        <Input
          id="welcome-name"
          value={name}
          onValueChange={setName}
          maxLength={24}
          autoComplete="given-name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "welcome-error" : undefined}
        />
      </Field>
      <ColorPicker value={color} onValueChange={setColor} label="Couleur de ta bulle" className="justify-center" />
      <p id="welcome-error" role="alert" className="min-h-6 text-sm text-danger">
        {error}
      </p>
      <Button type="submit" variant="filled" size="large" disabled={busy}>
        {busy ? "Création…" : "Continuer"}
      </Button>
    </form>
  );
}
