import { App } from "./core/App";

const canvas = document.getElementById("renderCanvas");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("renderCanvas missing");

const bootScreen = document.getElementById("bootScreen");
const startBtn = document.getElementById("bootStart");
const statusEl = document.getElementById("bootStatus");
if (!bootScreen || !(startBtn instanceof HTMLButtonElement) || !statusEl) {
  throw new Error("boot UI missing");
}

const app = new App(canvas);
let ready = false;
startBtn.disabled = true;

app
  .boot((s) => {
    statusEl.textContent = s;
  })
  .then(() => {
    ready = true;
    statusEl.textContent = "ready";
    startBtn.disabled = false;
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    statusEl.textContent = `failed to start: ${msg}`;
    console.error("[apex] boot failed", err);
  });

startBtn.addEventListener("click", () => {
  if (!ready) return;
  bootScreen.classList.add("hidden");
  app.mainMenu();
});
