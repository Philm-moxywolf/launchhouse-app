/** @jsxRuntime automatic */
/**
 * src/web/main.tsx
 *
 * WHAT IT IS
 * The entry point. It finds the one element in index.html and renders the app into it.
 *
 * WHY IT EXISTS
 * Vite needs one module to start from, and it is worth keeping that module this small: a
 * file that mounts and does nothing else cannot be the reason a screen is wrong.
 *
 * The missing root is checked rather than asserted away. If index.html and this file ever
 * disagree about the id, the failure is a blank white page with nothing in the console that
 * says why, and a blank page on the morning of the event is indistinguishable from an
 * outage. A thrown error names it.
 *
 * WHAT CALLS IT
 * index.html, and nothing else.
 *
 * WHAT IT READS AND WRITES
 * Reads one element from the document. Writes the app into it.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import "./styles.css";

const root = document.getElementById("app");
if (root === null) throw new Error("index.html has no element with id 'app', so there is nowhere to render.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
