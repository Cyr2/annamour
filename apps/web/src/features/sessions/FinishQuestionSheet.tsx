import { Check } from "lucide-react";
import { useRef } from "react";
import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { toast } from "../../ui/toast.ts";
import { dismissFinishQuestion, type FinishQuestion, useFinishQuestion } from "./finish-question.ts";
import { finishSession } from "./sessions.ts";

/** Asks, after leaving a salon in its last minutes, whether the video is over (see finish-question.ts). */
export function FinishQuestionSheet() {
  const question = useFinishQuestion((s) => s.question);
  // The sheet slides away with its words still on it.
  const shown = useRef<FinishQuestion | null>(null);
  if (question) shown.current = question;
  const asked = shown.current;

  const confirm = () => {
    if (!asked) return;
    dismissFinishQuestion();
    void finishSession(asked.code)
      .then(() =>
        toast({
          message: asked.next ? `La séance reprendra sur « ${asked.next} »` : `« ${asked.title} » est terminée`,
        }),
      )
      .catch((failure: Error) => toast({ message: failure.message }));
  };

  return (
    <Sheet open={question !== null} onClose={dismissFinishQuestion} title="C'est fini ?">
      {asked ? (
        <>
          <Sheet.Lede>
            Tu as quitté « {asked.title} » à {asked.minutesLeft} min de la fin.{" "}
            {asked.next
              ? `Si c'est fini, la séance reprendra sur « ${asked.next} ».`
              : "Si c'est fini, la séance compte comme terminée."}
          </Sheet.Lede>
          <Sheet.Actions>
            <Button onClick={dismissFinishQuestion}>Pas encore</Button>
            <Button tone="accent" icon={<Check />} onClick={confirm}>
              Oui, c'est fini
            </Button>
          </Sheet.Actions>
        </>
      ) : null}
    </Sheet>
  );
}
