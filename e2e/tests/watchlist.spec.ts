import { expect, test } from "@playwright/test";
import { createSession, onboard, person } from "./helpers.ts";

test("« Notre liste » est commune : un titre ajouté et une envie se voient chez l'autre", async ({ browser }) => {
  const darius = await person(browser);
  const lea = await person(browser);

  // They watch a séance together: they can now share titles.
  await onboard(darius, "Darius");
  const roomUrl = await createSession(darius, "Premier film");
  await onboard(lea, "Léa", roomUrl);
  await expect(darius.getByRole("heading", { name: "Léa est là" })).toBeVisible();

  // Darius adds a film for everyone he watches with (the catalog search is a separate service: the API stands in).
  const added = await darius.request.post("/api/me/watchlist", {
    data: {
      title: { id: 157336, type: "movie", title: "Interstellar", year: 2014 },
      shareWith: "everyone",
      want: true,
    },
  });
  expect(added.status()).toBe(201);

  // Léa finds it in « Notre liste » and says « J'ai envie ».
  await lea.goto("/liste");
  await expect(lea.getByRole("button", { name: /^Interstellar/ })).toBeVisible();
  await lea.getByRole("button", { name: "J'ai envie de voir Interstellar" }).click();

  // Darius sees it on « Ce soir » (their circle formed by the séance), and both wishes in the list.
  await darius.goto("/");
  await expect(darius.getByRole("heading", { name: "Notre liste" })).toBeVisible();
  await darius.goto("/liste");
  await expect(darius.getByText("2 envies")).toBeVisible();

  // Marked as watched by Léa, it moves to « Vus » for Darius too.
  await lea.getByRole("button", { name: /^Interstellar/ }).click();
  await lea.getByRole("button", { name: "C'est vu" }).click();
  await darius.reload();
  await darius.getByText("Vus", { exact: true }).click();
  await expect(darius.getByRole("list", { name: "Titres" })).toContainText("Interstellar");
});
