/*
 * Notifications, loaded into the generated service worker (vite.config.ts,
 * workbox.importScripts): its updates and caches stay Workbox's. The server
 * sends { title, body, url, tag } (PushPayload in @annamour/protocol).
 */

/** The payload, or a plain one: iOS revokes a subscription whose push shows nothing. */
function readPayload(event) {
  let data;
  try {
    data = event.data ? event.data.json() : undefined;
  } catch {
    data = undefined;
  }
  const valid =
    data &&
    typeof data.title === "string" &&
    typeof data.body === "string" &&
    typeof data.url === "string" &&
    data.url.startsWith("/") &&
    typeof data.tag === "string";
  return valid ? data : { title: "Annamour", body: "", url: "/", tag: "annamour" };
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

/** Brings the app forward on the notification's page, or opens it there. */
async function openPage(path) {
  const url = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const open = windows[0];
  if (!open) return self.clients.openWindow(url);
  await open.focus();
  return open.navigate(url).catch(() => self.clients.openWindow(url));
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  event.waitUntil(openPage(typeof path === "string" && path.startsWith("/") ? path : "/"));
});
