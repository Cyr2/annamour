import { expect, test } from "@playwright/test";
import { createSession, onboard, person } from "./helpers.ts";

test("la liste « À regarder » est commune : un titre ajouté et une envie se voient chez l'autre", async ({
  browser,
}) => {
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

  // Léa finds it in her « À regarder » tab and says « J'ai envie ».
  await lea.goto("/a-regarder");
  await expect(lea.getByRole("button", { name: /^Interstellar/ })).toBeVisible();
  await lea.getByRole("button", { name: "J'ai envie de voir Interstellar" }).click();

  // Darius sees both wishes, on his home screen and in the tab.
  await darius.goto("/");
  await expect(darius.getByRole("heading", { name: "À regarder ensemble" })).toBeVisible();
  await darius.goto("/a-regarder");
  await expect(darius.getByText("2 envies")).toBeVisible();

  // Marked as watched by Léa, it moves to « Vus » for Darius too.
  await lea.getByRole("button", { name: /^Interstellar/ }).click();
  await lea.getByRole("button", { name: "C'est vu" }).click();
  await darius.reload();
  await expect(darius.getByRole("region", { name: /^Vus/ })).toContainText("Interstellar");
});
