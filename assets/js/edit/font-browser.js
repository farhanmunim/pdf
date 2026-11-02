/* Google Fonts browser panel (search + pick a family). */
import { announce } from "../shared/status.js";
import { fontSelect, googleFontGroup, fontBrowser, fontSearch, fontResults, fontResultsStatus, fontBrowserClose } from "./dom.js";
import { loadCatalog, getCatalog, ensureCssLoaded } from "./fonts.js";
import { updateStyle, syncToolbar } from "./toolbar.js";

function addFamilyToSelect(family) {
  const value = "g:" + family;
  if (fontSelect.querySelector(`option[value="${CSS.escape(value)}"]`)) return;
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = family;
  googleFontGroup.appendChild(opt);
  googleFontGroup.hidden = false;
}

function useGoogleFont(family) {
  ensureCssLoaded(family);
  addFamilyToSelect(family);
  updateStyle({ font: "g:" + family });
}

export function openFontBrowser() {
  fontBrowser.hidden = false;
  fontSearch.value = "";
  renderFontResults("");
  fontSearch.focus();
  loadCatalog().then(() => renderFontResults(fontSearch.value)).catch(() => {
    fontResults.textContent = "";
    fontResults.appendChild(fontNote("Couldn’t load the font list. Check your connection and try again."));
    fontResultsStatus.textContent = "Couldn’t load the font list.";
  });
}

export function closeFontBrowser() {
  if (fontBrowser.hidden) return;
  fontBrowser.hidden = true;
  syncToolbar();
  fontSelect.focus();
}

function fontNote(text) {
  const li = document.createElement("li");
  li.className = "fb-note";
  li.textContent = text;
  return li;
}

function renderFontResults(query) {
  fontResults.textContent = "";
  if (!getCatalog()) {
    fontResults.appendChild(fontNote("Loading font list…"));
    fontResultsStatus.textContent = "Loading font list…";
    return;
  }
  const q = query.trim().toLowerCase();
  let shown = 0;
  let total = 0;
  for (const family of getCatalog().keys()) {
    if (q && !family.toLowerCase().includes(q)) continue;
    total++;
    if (shown >= 60) continue;
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = family;
    b.addEventListener("click", () => {
      useGoogleFont(family);
      closeFontBrowser();
      announce(`Font set to ${family}.`);
    });
    li.appendChild(b);
    fontResults.appendChild(li);
    shown++;
  }
  if (!shown) {
    fontResults.appendChild(fontNote("No fonts match that search."));
    fontResultsStatus.textContent = "No fonts match that search.";
  } else {
    fontResultsStatus.textContent = shown < total
      ? `Showing the first ${shown} of ${total} matching fonts. Keep typing to narrow the list.`
      : `${shown} matching font${shown === 1 ? "" : "s"}.`;
  }
}

fontSearch.addEventListener("input", () => renderFontResults(fontSearch.value));

fontBrowser.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); closeFontBrowser(); }
});

fontBrowserClose.addEventListener("click", closeFontBrowser);
