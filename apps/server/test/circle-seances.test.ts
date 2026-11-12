import { API, CIRCLES_API, type CircleList, type CreateAccountResponse, type SessionList } from "@annamour/protocol";
import { describe, expect, it } from "vitest";
import { jsonRequest, media, sessionCookieOf, testApp } from "./helpers.ts";

async function setup() {
  const { app, services } = testApp({ now: () => 1000 });
  async function account(name: string) {
    const response = await app.request(API.createAccount, jsonRequest("POST", { name, color: "peach" }));
    const { account } = (await response.json()) as CreateAccountResponse;
    return { id: account.id, cookie: sessionCookieOf(response) };
  }
  const sessions = async (cookie: string) =>
    ((await (await app.request(API.sessions, { headers: { cookie } })).json()) as SessionList).sessions;
  const circles = async (cookie: string) =>
    ((await (await app.request(CIRCLES_API.list, { headers: { cookie } })).json()) as CircleList).circles;

  const darius = await account("Darius");
  const annou = await account("Annou");
  const leo = await account("Léo");
  // Darius and Annou watched together once: that made their circle.
  const first = services.store.create("Verity", media, 1000);
  for (const id of [darius.id, annou.id]) services.history.recordParticipation(first.code, id);
  const circleId = (await circles(darius.cookie))[0]?.id ?? "";
  /** A séance Darius creates for their circle, that nobody else entered yet. */
  const forTheCircle = () => {
    const room = services.store.create("Anne", media, 2000);
    services.history.recordParticipation(room.code, darius.id);
    services.circles.assignRoom(darius.id, room.code, circleId);
    return room.code;
  };
  return { services, sessions, circles, darius, annou, leo, forTheCircle };
}

describe("a séance created for a circle", () => {
  it("shows at once to everyone in the circle, with no code to type, and to nobody else", async () => {
    const { sessions, circles, annou, leo, forTheCircle } = await setup();
    const code = forTheCircle();

    const seen = (await sessions(annou.cookie)).find((session) => session.code === code);
    expect(seen?.participants.map((person) => person.name)).toEqual(["Darius"]);
    expect((await circles(annou.cookie))[0]?.evenings).toBe(2);
    expect((await sessions(leo.cookie)).map((session) => session.code)).not.toContain(code);
  });

  it("can be removed by someone who never entered it, who then does not show as having left", async () => {
    const { services, sessions, darius, annou, forTheCircle } = await setup();
    const code = forTheCircle();
    services.history.leave(code, annou.id);

    expect((await sessions(annou.cookie)).map((session) => session.code)).not.toContain(code);
    const forDarius = (await sessions(darius.cookie)).find((session) => session.code === code);
    expect(forDarius?.participants).toEqual([]);
  });

  it("comes back to whoever removed it once they enter it", async () => {
    const { services, sessions, annou, forTheCircle } = await setup();
    const code = forTheCircle();
    services.history.leave(code, annou.id);
    services.history.recordParticipation(code, annou.id);
    expect((await sessions(annou.cookie)).map((session) => session.code)).toContain(code);
  });

  it("can be marked finished by anyone of the circle", async () => {
    const { services, annou, forTheCircle } = await setup();
    const code = forTheCircle();
    expect(() => services.history.finish(code, annou.id)).not.toThrow();
  });
});
