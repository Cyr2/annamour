import { ArrowRight } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { Button, Input } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { formatTyping, readTypedCode } from "./tv-link.ts";

interface TvCodeFormProps {
  /** Called with the normalized code (« K7P2QX »). */
  onCode: (code: string) => void;
  /** Buttons next to « Continuer » (e.g. « Annuler » in a sheet). */
  children?: ReactNode;
}

/** The 6 characters shown on the TV, typed on the phone; the dash and spaces are optional. */
export function TvCodeForm({ onCode, children }: TvCodeFormProps) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const typed = readTypedCode(value);
    if ("error" in typed) return setError(typed.error);
    onCode(typed.code);
  };

  return (
    <form onSubmit={submit} className="grid w-full gap-4" noValidate>
      <Field label="Code affiché sur la TV" htmlFor={id}>
        <Input
          id={id}
          value={value}
          onValueChange={(next) => {
            setValue(formatTyping(next));
            setError(null);
          }}
          placeholder="K7P-2QX"
          maxLength={9}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="font-rounded-tight text-lg font-extrabold tracking-[0.18em]"
        />
      </Field>
      <p id={`${id}-error`} role="alert" className="min-h-5 text-sm text-danger">
        {error}
      </p>
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        {children}
        <Button type="submit" variant="filled" icon={<ArrowRight />}>
          Continuer
        </Button>
      </div>
    </form>
  );
}
