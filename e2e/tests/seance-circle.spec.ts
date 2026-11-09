import { expect, test } from "@playwright/test";
import { createSession, onboard, person } from "./helpers.ts";

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

test("le salon dit de quel cercle est la séance, chez un invité aussi", async ({ browser }) => {
  const darius = await person(browser, phone);
  const annou = await person(browser, phone);
  const leo = await person(browser, phone);
  await onboard(darius, "Darius");
  const room = await createSession(darius, "Premier film");
  await onboard(annou, "Annou", room);
  await expect(darius.getByRole("heading", { name: "Annou est là" })).toBeVisible();

  await expect(darius.getByText("avec Annou", { exact: true })).toBeVisible();

  const { circles } = (await (await darius.request.get("/api/me/circles")).json()) as { circles: { id: string }[] };
  await darius.request.patch(`/api/me/circles/${circles[0]?.id}`, { data: { name: "Les potes du jeudi" } });

  await onboard(leo, "Léo", room);
  await expect(leo.getByText("Cercle · Les potes du jeudi")).toBeVisible();

  await expect(darius.getByText("Cercle · Les potes du jeudi")).toBeVisible();
  const after = (await (await darius.request.get("/api/me/circles")).json()) as {
    circles: { members: unknown[] }[];
  };
  expect(after.circles.map((circle) => circle.members.length)).toEqual([2]);
});
