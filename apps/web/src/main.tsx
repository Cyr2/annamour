import "@fontsource-variable/inter";
import "@fontsource-variable/nunito";
import "glisse/styles.css";
import "./styles/app.css";

import { registerSW } from "virtual:pwa-register";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { spring } from "./lib/motion.ts";

registerSW({ immediate: true });

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

createRoot(root).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={spring.ui}>
      <App />
    </MotionConfig>
  </StrictMode>,
);
