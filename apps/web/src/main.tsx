import "./styles/fonts.css";
import "glisse/styles.css";
import "./styles/app.css";

import { registerSW } from "virtual:pwa-register";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { TvContext } from "./features/tv/tv-context.ts";
import { detectTvMode } from "./features/tv/tv-mode.ts";
import { spring } from "./lib/motion.ts";

registerSW({ immediate: true });

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

// Before the first render: the TV's 10-foot tokens (and glisse, which never bends glass on a TV) read this attribute.
const tv = detectTvMode();
if (tv) document.documentElement.setAttribute("data-tv", "");

createRoot(root).render(
  <StrictMode>
    <TvContext value={tv}>
      <MotionConfig reducedMotion="user" transition={spring.ui}>
        <App />
      </MotionConfig>
    </TvContext>
  </StrictMode>,
);
