import { expect, type Page, test } from "@playwright/test";
import { createSession, onboard, person, videoTime } from "./helpers.ts";

const TV_SCREEN = { viewport: { width: 1920, height: 1080 } };
/** The on-screen keyboard: the room code alphabet, nine keys per row. */
const KEYBOARD = "ABCDEFGHJKMNPQRSTUVWXYZ";
const KEYS_PER_ROW = 9;

/** Types a room code on the TV's keyboard with the arrows and OK, from the « A » key. */
async function typeWithRemote(tv: Page, code: string) {
  let at = 0;
  for (const letter of code) {
    const target = KEYBOARD.indexOf(letter);
    const [fromRow, fromColumn] = [Math.floor(at / KEYS_PER_ROW), at % KEYS_PER_ROW];
    const [toRow, toColumn] = [Math.floor(target / KEYS_PER_ROW), target % KEYS_PER_ROW];
    const across = Array<string>(Math.abs(toColumn - fromColumn)).fill(
      toColumn > fromColumn ? "ArrowRight" : "ArrowLeft",
    );
    const along = Array<string>(Math.abs(toRow - fromRow)).fill(toRow > fromRow ? "ArrowDown" : "ArrowUp");
    // The last row is short: leave it vertically first, enter it vertically last.
    for (const key of fromRow === 2 ? [...along, ...across] : [...across, ...along]) await tv.keyboard.press(key);
    await expect(tv.getByRole("button", { name: letter, exact: true })).toBeFocused();
    await tv.keyboard.press("Enter");
    at = target;
  }
}

test("la TV dessine le fil rouge vers la place libre, même immobile", async ({ browser }) => {
  const tv = await person(browser, TV_SCREEN);
  await onboard(tv, "Darius");
  await tv.goto("/?tv=1");
  await expect(tv.getByRole("img", { name: "Une place libre" })).toBeVisible();
  // On a TV the thread holds still: its path is drawn once, and must stay drawn.
  const paths = () =>
    tv.locator("path.stroke-thread").evaluateAll((all) => all.map((path) => path.getAttribute("d") ?? ""));
  await expect.poll(async () => (await paths()).length).toBeGreaterThan(0);
  await expect.poll(async () => (await paths()).every((d) => /^M[\d.-]/.test(d)), { timeout: 5000 }).toBe(true);
});

test("une TV se relie au compte d'un téléphone et rejoint une séance à la télécommande", async ({ browser }) => {
  const phone = await person(browser);
  const tv = await person(browser, TV_SCREEN);
  await onboard(phone, "Darius");

  // The TV never asks for a name or a key: it shows a code to approve from the phone.
  await tv.goto("/?tv=1");
  await expect(tv).toHaveURL(/\/tv\/lier/);
  await expect(tv.getByRole("heading", { name: "Relie cette TV à ton compte" })).toBeVisible();
  const label = await tv.getByRole("img", { name: /^Code / }).getAttribute("aria-label");
  const code = (label ?? "").replace("Code ", "").replaceAll(" ", "");
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // The phone opens the QR code's link, checks the code and confirms.
  await phone.goto(`/tv#${code}`);
  await expect(phone.getByRole("heading", { name: "Lier la TV ?" })).toBeVisible();
  await phone.getByRole("button", { name: "Lier la TV" }).click();
  await expect(phone.getByRole("heading", { name: "La TV est liée" })).toBeVisible();

  // Within a poll, the TV is signed in to the phone's account, on its home screen.
  await expect(tv.getByRole("link", { name: "Mon profil, Darius" })).toBeVisible({ timeout: 10_000 });
  await expect(tv).toHaveURL(/\/$/);
  const join = tv.getByRole("link", { name: "Rejoindre avec un code" });
  await expect(join).toBeFocused();

  // Meanwhile the phone creates a séance.
  await phone.goto("/");
  const roomUrl = await createSession(phone, "Soirée télé");
  const roomCode = roomUrl.slice(-4);

  // The remote walks the top bar (Rejoindre, then the profile), then types the code on the on-screen keyboard.
  await tv.keyboard.press("ArrowRight");
  await expect(tv.getByRole("link", { name: "Mon profil, Darius" })).toBeFocused();
  await tv.keyboard.press("ArrowLeft");
  await expect(join).toBeFocused();
  await tv.keyboard.press("Enter");
  await expect(tv).toHaveURL(/\/rejoindre$/);
  await expect(tv.getByRole("button", { name: "A", exact: true })).toBeFocused();
  await typeWithRemote(tv, roomCode);

  // The fourth letter opens the salon, the remote on « Lancer le film ».
  await expect(tv).toHaveURL(new RegExp(`${roomUrl}$`));
  const start = tv.getByRole("button", { name: "Lancer le film" });
  await expect(start).toBeFocused();
  // The TV is Darius's second device in the séance: the phone sees it as « Darius (2) ».
  await expect(phone.getByRole("heading", { name: "Darius (2) est là" })).toBeVisible();

  // OK starts the film for everyone.
  await tv.keyboard.press("Enter");
  await expect.poll(() => videoTime(tv), { timeout: 30_000 }).toBeGreaterThan(1);
  await expect.poll(() => videoTime(phone), { timeout: 30_000 }).toBeGreaterThan(1);

  // ↓ brings the controls up on play/pause; Retour puts them away, then leaves the film.
  await tv.keyboard.press("ArrowDown");
  await expect(tv.getByRole("button", { name: "Pause", exact: true })).toBeFocused();
  await tv.keyboard.press("Escape");
  await expect(tv.getByRole("button", { name: "Pause", exact: true })).not.toBeFocused();
  await expect(tv).toHaveURL(new RegExp(`${roomUrl}$`));
  await tv.keyboard.press("Escape");
  await expect(tv).toHaveURL(/\/$/);
});
