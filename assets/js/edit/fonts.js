

/* Google Fonts catalog, variant logic and font-file fetching. */

/* Google fonts: family -> variant availability flags (1=bold, 2=italic,
   4=bold-italic; regular always present). Catalog loaded on demand. */
let fontCatalog = null; // Map(family -> flags)
let catalogPromise = null;
const loadedCss = new Set(); // families whose stylesheet is on the page

export function getCatalog() { return fontCatalog; }

export function isGoogleFont(name) { return name.startsWith("g:"); }

export function familyOf(name) { return name.slice(2); }

export async function loadCatalog() {
  if (fontCatalog) return fontCatalog;
  if (!catalogPromise) {
    catalogPromise = fetch("/assets/data/google-fonts.json")
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((list) => { fontCatalog = new Map(list); return fontCatalog; });
  }
  return catalogPromise;
}

/* Which of the four variants this box can actually use (regular always exists). */
export function effectiveStyle(box) {
  if (!isGoogleFont(box.font)) return { bold: box.bold, italic: box.italic };
  const flags = fontCatalog ? fontCatalog.get(familyOf(box.font)) : 0;
  let bold = box.bold, italic = box.italic;
  if (bold && italic && !(flags & 4)) {
    if (flags & 1) italic = false;
    else if (flags & 2) bold = false;
    else { bold = false; italic = false; }
  } else if (bold && !italic && !(flags & 1)) bold = false;
  else if (italic && !bold && !(flags & 2)) italic = false;
  return { bold, italic };
}

function css2Url(family, { withVariants = false, bold = false, italic = false, text = "" } = {}) {
  const fam = family.replace(/ /g, "+");
  let spec = fam;
  if (withVariants) {
    const flags = fontCatalog.get(family) || 0;
    const tuples = ["0,400"];
    if (flags & 1) tuples.push("0,700");
    if (flags & 2) tuples.push("1,400");
    if (flags & 4) tuples.push("1,700");
    if (tuples.length > 1) spec += ":ital,wght@" + tuples.join(";");
  } else if (bold && italic) spec += ":ital,wght@1,700";
  else if (bold) spec += ":wght@700";
  else if (italic) spec += ":ital@1";
  let url = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  if (text) url += `&text=${encodeURIComponent(text)}`;
  return url;
}

/* Put the family's stylesheet on the page so previews render in the real font. */
export function ensureCssLoaded(family) {
  if (loadedCss.has(family)) return;
  loadedCss.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = css2Url(family, { withVariants: true });
  document.head.appendChild(link);
}

/* Download the exact glyphs needed for one Google font variant.
   Google's css2 endpoint with `text=` returns a single @font-face whose
   file covers exactly those characters. */
export async function fetchGoogleFontBytes(family, eff, text) {
  const cssUrl = css2Url(family, { bold: eff.bold, italic: eff.italic, text });
  const cssRes = await fetch(cssUrl);
  if (!cssRes.ok) throw new Error(`Google Fonts request for “${family}” failed (HTTP ${cssRes.status}).`);
  const css = await cssRes.text();
  const m = css.match(/src:\s*url\((https:[^)]+)\)/);
  if (!m) throw new Error(`No downloadable file found for “${family}”.`);
  const fontRes = await fetch(m[1]);
  if (!fontRes.ok) throw new Error(`Downloading “${family}” failed (HTTP ${fontRes.status}).`);
  return new Uint8Array(await fontRes.arrayBuffer());
}
