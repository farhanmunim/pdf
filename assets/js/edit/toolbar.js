/* Toolbar: reflects and edits the style of the selected / next text box. */
import { state, current } from "./state.js";
import { addTextBtn, fontSelect, sizeInput, colorInput, boldBtn, italicBtn, alignBtns, deleteBtn, resetBtn } from "./dom.js";
import { ensureCssLoaded, isGoogleFont, familyOf } from "./fonts.js";
import { openFontBrowser } from "./font-browser.js";
import { setPlacing } from "./placement.js";
import { applyBoxStyle, removeBox } from "./boxes.js";
import { resetEditor } from "./pages.js";
import { clamp } from "./util.js";

export function syncToolbar() {
  fontSelect.value = current.font;
  state.lastFontValue = current.font;
  sizeInput.value = current.size;
  colorInput.value = current.color;
  boldBtn.setAttribute("aria-pressed", String(current.bold));
  italicBtn.setAttribute("aria-pressed", String(current.italic));
  alignBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.align === current.align)));
}

addTextBtn.addEventListener("click", () => setPlacing(state.placing === "text" ? null : "text"));

export function updateStyle(patch) {
  Object.assign(current, patch);
  syncToolbar();
  if (state.selected && state.selected.type === "text") {
    Object.assign(state.selected, patch);
    applyBoxStyle(state.selected);
  }
}

fontSelect.addEventListener("change", () => {
  if (fontSelect.value === "__browse") {
    fontSelect.value = state.lastFontValue; // keep the current font while browsing
    openFontBrowser();
    return;
  }
  if (isGoogleFont(fontSelect.value)) ensureCssLoaded(familyOf(fontSelect.value));
  updateStyle({ font: fontSelect.value });
});

sizeInput.addEventListener("change", () => {
  const size = clamp(Number(sizeInput.value) || 16, 6, 144);
  sizeInput.value = size;
  updateStyle({ size });
});

colorInput.addEventListener("input", () => updateStyle({ color: colorInput.value }));

boldBtn.addEventListener("click", () => updateStyle({ bold: !current.bold }));

italicBtn.addEventListener("click", () => updateStyle({ italic: !current.italic }));

alignBtns.forEach((b) => b.addEventListener("click", () => updateStyle({ align: b.dataset.align })));

deleteBtn.addEventListener("click", () => { if (state.selected) removeBox(state.selected); });

resetBtn.addEventListener("click", () => {
  if (state.boxes.length && !confirm("Close this PDF? Everything you added will be discarded.")) return;
  resetEditor();
});
