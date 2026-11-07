/** What a long press would open a browser menu on (« Copier l'adresse du lien », « Enregistrer l'image »…). */
const MENU_TARGETS = "a, img, button, [role='button']";

/**
 * Whether a context menu comes from a long press on a touch screen, on
 * something that should feel like an app control. A mouse's right click is
 * left alone, and so is a field (its menu pastes). Older browsers don't say
 * which pointer opened the menu: a screen without hover is then a touch screen.
 */
export function isTouchLinkMenu(event: Event, touchScreen: boolean): boolean {
  const pointer = "pointerType" in event ? event.pointerType : "";
  const byTouch = pointer === "touch" || (pointer === "" && touchScreen);
  return byTouch && event.target instanceof Element && event.target.closest(MENU_TARGETS) !== null;
}

/**
 * Android shows its link menu on a long press; iOS's callout is turned off in
 * CSS (app.css). Without either, the PWA feels like a page, not an app.
 */
export function suppressTouchLinkMenus(): void {
  const touchScreen = window.matchMedia("(hover: none)");
  document.addEventListener("contextmenu", (event) => {
    if (isTouchLinkMenu(event, touchScreen.matches)) event.preventDefault();
  });
}
