/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

/** Injected by the Android TV app (apps/android-tv) around the PWA. */
interface AnnamourTvBridge {
  isTv?: () => boolean;
  /** Call when the page handled the Escape sent for the remote's Retour key. */
  backHandled?: () => void;
}

interface Window {
  AnnamourTV?: AnnamourTvBridge;
}
