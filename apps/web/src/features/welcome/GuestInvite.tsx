import { House } from "lucide-react";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { PresenceBubble } from "../../ui/PresenceBubble.tsx";
import { type Invite, inviteLine, invitePeople } from "./invite.ts";

const HOW_TO_COME_IN = "Comment veux-tu entrer ?";

/** Who waits in the séance, in bubbles, then for what: « Léo et Inès t'attendent pour « Dune ». ». */
export function InviteLede({ invite }: { invite: Invite }) {
  if (invite.status !== "found") {
    return <p className="type-lede">On t'attend dans la séance. {HOW_TO_COME_IN}</p>;
  }
  const { members, media } = invite.room;
  const people = invitePeople(members);
  return (
    <>
      {/* The names are in the sentence below: the bubbles only show them. */}
      {people.length ? (
        <div aria-hidden className="flex flex-wrap justify-center gap-3">
          {people.map((person) => (
            <PresenceBubble key={person.id} name={person.name} color={person.color} size="md" />
          ))}
        </div>
      ) : null}
      <p className="type-lede text-pretty">
        {inviteLine(media.title, members)} {HOW_TO_COME_IN}
      </p>
    </>
  );
}

/** The link leads to a séance the server no longer has: say so, and what to do. */
export function SeanceGone() {
  return (
    <div className="grid w-full justify-items-center gap-5">
      <h1 className="type-title">Cette séance n'existe plus</h1>
      <p role="alert" className="type-lede text-pretty">
        Demande un nouveau lien à la personne qui te l'a envoyé, ou crée ta propre séance.
      </p>
      <LinkButton href="/" variant="filled" icon={<House />}>
        Aller à l'accueil
      </LinkButton>
    </div>
  );
}
