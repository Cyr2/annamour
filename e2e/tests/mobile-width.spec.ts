import { expect, type Page, test } from "@playwright/test";
import { createSession, onboard, person } from "./helpers.ts";

/** Nothing on screen runs past a small phone's width, and no bottom sheet scrolls sideways. */
async function expectFitsWidth(page: Page, where: string) {
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const sheet = document.querySelector<HTMLElement>(".am-sheet");
    return {
      page: document.documentElement.scrollWidth - width,
      sheet: sheet ? sheet.scrollWidth - sheet.clientWidth : 0,
    };
  });
  expect(overflow.page, `${where} : la page dépasse`).toBeLessThanOrEqual(1);
  expect(overflow.sheet, `${where} : la feuille défile sur le côté`).toBeLessThanOrEqual(1);
}

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

test("sur un petit téléphone, rien ne dépasse ni ne défile sur le côté", async ({ browser }) => {
  const darius = await person(browser, { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await onboard(darius, "Darius");
  await expectFitsWidth(darius, "accueil");

  await darius.getByRole("button", { name: "Créer une séance" }).click();
  await expectFitsWidth(darius, "créer une séance");
  await darius.keyboard.press("Escape");

  await darius.request.post("/api/me/watchlist", {
    data: {
      title: { id: 9, type: "tv", title: "Une série au titre vraiment très très long", seasons: 3 },
      shareWith: "everyone",
      want: true,
    },
  });
  await darius.goto("/a-regarder");
  await expectFitsWidth(darius, "à regarder");
  await darius.getByRole("button", { name: /^Une série/ }).click();
  await expectFitsWidth(darius, "fiche d'une série");
  await darius.keyboard.press("Escape");

  await darius.goto("/profil");
  await expectFitsWidth(darius, "profil");

  await darius.goto("/");
  const room = await createSession(darius, "Le Seigneur des Anneaux : La Communauté de l'Anneau");
  await darius.goto(room);
  await expectFitsWidth(darius, "salon");
});
