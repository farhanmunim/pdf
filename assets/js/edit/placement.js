/* Click-to-place mode for new text and images. */
import { announce } from "../shared/status.js";
import { state } from "./state.js";
import { stage, hintEl, HINT_DEFAULT, addTextBtn, addImageBtn } from "./dom.js";
import { addTextBox, select } from "./boxes.js";
import { addImageBox } from "./images.js";

export function onOverlayPointerDown(e, pageIndex) {
  if (e.target !== e.currentTarget) return; // state.boxes handle their own events
  if (state.placing === "text") {
    e.preventDefault();
    const { xPt, yPt } = overlayPoint(e, pageIndex);
    addTextBox(pageIndex, xPt, yPt);
    setPlacing(null);
  } else if (state.placing === "image" && state.pendingImage) {
    e.preventDefault();
    const { xPt, yPt } = overlayPoint(e, pageIndex);
    addImageBox(pageIndex, xPt, yPt, state.pendingImage);
    state.pendingImage = null;
    setPlacing(null);
  } else {
    select(null);
  }
}

function overlayPoint(e, pageIndex) {
  const rect = e.currentTarget.getBoundingClientRect();
  const info = state.pages[pageIndex];
  return { xPt: (e.clientX - rect.left) / info.scale, yPt: (e.clientY - rect.top) / info.scale };
}

export function setPlacing(mode) {
  state.placing = mode;
  if (mode !== "image") state.pendingImage = null;
  stage.classList.toggle("placing", !!mode);
  addTextBtn.setAttribute("aria-pressed", String(mode === "text"));
  addImageBtn.setAttribute("aria-pressed", String(mode === "image"));
  if (mode === "text") hintEl.textContent = "Now click or tap the spot on the page where the text should go.";
  else if (mode === "image") hintEl.textContent = "Now click or tap the spot on the page where the signature should go.";
  else hintEl.innerHTML = HINT_DEFAULT;
  if (mode) announce(hintEl.textContent);
}
