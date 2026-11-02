/* Text boxes and the behaviour shared by all boxes: select, drag, keyboard, delete. */
import { announce } from "../shared/status.js";
import { STD_FONTS } from "./constants.js";
import { state, current } from "./state.js";
import { deleteBtn, addTextBtn } from "./dom.js";
import { isGoogleFont, familyOf, effectiveStyle } from "./fonts.js";
import { clamp } from "./util.js";
import { syncToolbar } from "./toolbar.js";

export function addTextBox(pageIndex, xPt, yPt) {
  const info = state.pages[pageIndex];
  const box = {
    type: "text",
    page: pageIndex,
    xPt: clamp(xPt, 0, info.wPt - 10),
    yPt: clamp(yPt, 0, info.hPt - current.size),
    text: "Text",
    font: current.font,
    size: current.size,
    color: current.color,
    bold: current.bold,
    italic: current.italic,
    align: current.align,
    el: null,
  };
  const el = document.createElement("div");
  el.className = "tbox";
  el.setAttribute("role", "textbox");
  el.setAttribute("aria-multiline", "true");
  el.setAttribute("aria-label", "Text element — Enter to edit, arrow keys to move, Delete to remove");
  el.tabIndex = 0;
  el.textContent = box.text;
  box.el = el;
  el.addEventListener("pointerdown", (e) => onBoxPointerDown(e, box));
  el.addEventListener("dblclick", (e) => { e.preventDefault(); startEditing(box); });
  el.addEventListener("keydown", (e) => onBoxKeyDown(e, box));
  el.addEventListener("blur", () => stopEditing(box));
  el.addEventListener("focus", () => { if (state.selected !== box) select(box); });
  info.overlayEl.appendChild(el);
  state.boxes.push(box);
  applyBoxStyle(box);
  select(box);
  startEditing(box);
  return box;
}

export function applyBoxStyle(box) {
  const info = state.pages[box.page];
  const s = box.el.style;
  s.left = box.xPt * info.scale + "px";
  s.top = box.yPt * info.scale + "px";
  if (box.type === "image") {
    s.width = box.wPt * info.scale + "px";
    s.height = box.hPt * info.scale + "px";
    return;
  }
  const eff = effectiveStyle(box);
  s.fontSize = box.size * info.scale + "px";
  s.fontFamily = isGoogleFont(box.font) ? `"${familyOf(box.font)}", sans-serif` : STD_FONTS[box.font].css;
  s.fontWeight = eff.bold ? "700" : "400";
  s.fontStyle = eff.italic ? "italic" : "normal";
  s.color = box.color;
  s.textAlign = box.align;
}

export function select(box) {
  if (state.selected && state.selected.el) state.selected.el.classList.remove("selected");
  state.selected = box;
  deleteBtn.disabled = !box;
  if (!box) return;
  box.el.classList.add("selected");
  if (box.type === "text") {
    // Reflect the state.selected box's style in the toolbar.
    current.font = box.font; current.size = box.size; current.color = box.color;
    current.bold = box.bold; current.italic = box.italic; current.align = box.align;
    syncToolbar();
  }
}

export function removeBox(box) {
  const hadFocus = box.el.contains(document.activeElement);
  box.el.remove();
  state.boxes = state.boxes.filter((b) => b !== box);
  if (state.selected === box) select(null);
  announce(box.type === "text" ? "Text removed." : "Signature removed.");
  if (hadFocus) addTextBtn.focus();
}

/* Dragging: pointer capture on the box; a small threshold distinguishes tap from drag. */
export function onBoxPointerDown(e, box) {
  if (box.type === "text" && box.el.classList.contains("editing")) return;
  e.preventDefault();
  e.stopPropagation();
  select(box);
  box.el.focus({ preventScroll: true });

  const info = state.pages[box.page];
  const startX = e.clientX, startY = e.clientY;
  const origX = box.xPt, origY = box.yPt;
  let moved = false;
  box.el.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    const dx = (ev.clientX - startX) / info.scale;
    const dy = (ev.clientY - startY) / info.scale;
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
    moved = true;
    box.xPt = clamp(origX + dx, 0, info.wPt - 4);
    box.yPt = clamp(origY + dy, 0, info.hPt - 4);
    box.el.style.left = box.xPt * info.scale + "px";
    box.el.style.top = box.yPt * info.scale + "px";
  };
  const onUp = () => {
    box.el.removeEventListener("pointermove", onMove);
    box.el.removeEventListener("pointerup", onUp);
    box.el.removeEventListener("pointercancel", onUp);
  };
  box.el.addEventListener("pointermove", onMove);
  box.el.addEventListener("pointerup", onUp);
  box.el.addEventListener("pointercancel", onUp);
}

export function onBoxKeyDown(e, box) {
  if (box.type === "text" && box.el.classList.contains("editing")) {
    if (e.key === "Escape") { e.preventDefault(); box.el.blur(); }
    return;
  }
  const step = e.shiftKey ? 10 : 1;
  const info = state.pages[box.page];
  switch (e.key) {
    case "ArrowLeft": box.xPt = clamp(box.xPt - step, 0, info.wPt - 4); break;
    case "ArrowRight": box.xPt = clamp(box.xPt + step, 0, info.wPt - 4); break;
    case "ArrowUp": box.yPt = clamp(box.yPt - step, 0, info.hPt - 4); break;
    case "ArrowDown": box.yPt = clamp(box.yPt + step, 0, info.hPt - 4); break;
    case "Enter": if (box.type === "text") { e.preventDefault(); startEditing(box); } return;
    case "Delete":
    case "Backspace": e.preventDefault(); removeBox(box); return;
    default: return;
  }
  e.preventDefault();
  applyBoxStyle(box);
}

export function startEditing(box) {
  const el = box.el;
  if (el.classList.contains("editing")) return;
  el.classList.add("editing");
  el.contentEditable = "plaintext-only";
  if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
  el.focus();
  // Select all so placeholder text is replaced by typing.
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

export function stopEditing(box) {
  const el = box.el;
  if (!el.classList.contains("editing")) return;
  el.classList.remove("editing");
  el.contentEditable = "false";
  box.text = el.innerText.replace(/\n$/, "");
  el.textContent = box.text; // normalise any pasted markup
  if (!box.text.trim()) removeBox(box);
}
