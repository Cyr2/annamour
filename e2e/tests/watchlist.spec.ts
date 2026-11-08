import { expect, test } from "@playwright/test";
import { createSession, onboard, person } from "./helpers.ts";

test("« Notre liste » est commune : un titre ajouté et une envie se voient chez l'autre", async ({ browser }) => {
  const darius = await person(browser);
  const lea = await person(browser);

  // They watch a séance together: it forms their circle, where titles are shared.
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

  // Léa finds it in « Notre liste » and puts her heart on it.
  await lea.goto("/liste");
  await expect(lea.getByRole("button", { name: /^Interstellar/ })).toBeVisible();
  await lea.getByRole("button", { name: /^J'ai envie de voir Interstellar/ }).click();

  // Darius sees it on « Ce soir », and both hearts in the list.
  await darius.goto("/");
  await expect(darius.getByRole("heading", { name: "Notre liste" })).toBeVisible();
  await darius.goto("/liste");
  await expect(darius.getByRole("button", { name: /2 en ont envie/ })).toBeVisible();

  // Marked as watched by Léa, it moves to « Déjà vus ensemble » for Darius too.
  await lea.getByRole("button", { name: /^Interstellar/ }).click();
  await lea.getByRole("button", { name: "C'est vu" }).click();
  await darius.goto("/liste?vus");
  await expect(darius.getByRole("list", { name: "Titres vus" })).toContainText("Interstellar");
});
