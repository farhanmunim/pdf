/* Export: embed text and images into the original PDF with pdf-lib. */
import { downloadBlob } from "../shared/files.js";
import { describePdfError } from "../shared/pdf-errors.js";
import { LINE_HEIGHT, STD_FONTS } from "./constants.js";
import { state } from "./state.js";
import { exportBtn, editStatus } from "./dom.js";
import { isGoogleFont, familyOf, effectiveStyle, loadCatalog, fetchGoogleFontBytes } from "./fonts.js";
import { hexToRgb } from "./util.js";

/* Drop characters the chosen font cannot encode. */
function encodableText(font, text) {
  let out = "";
  let dropped = false;
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      dropped = true;
    }
  }
  return { text: out, dropped };
}

exportBtn.addEventListener("click", async () => {
  if (!state.pdfBytes) return;
  // Commit any in-progress edit first.
  if (state.selected && state.selected.type === "text" && state.selected.el.classList.contains("editing")) state.selected.el.blur();

  exportBtn.disabled = true;
  editStatus.busy("Exporting PDF…");
  try {
    const textBoxes = state.boxes.filter((b) => b.type === "text" && b.text.trim());
    const imageBoxes = state.boxes.filter((b) => b.type === "image");
    const needsCatalog = textBoxes.some((b) => isGoogleFont(b.font));
    if (needsCatalog) await loadCatalog();

    const doc = await PDFLib.PDFDocument.load(state.pdfBytes);
    if (needsCatalog) doc.registerFontkit(fontkit);
    const pdfPages = doc.getPages();

    /* Embed each needed font once. Standard fonts key on the pdf-lib name;
       Google fonts key on family+variant and are fetched subset to the
       exact characters used, then embedded. */
    const fontCache = new Map();
    const fontFor = async (box) => {
      const eff = effectiveStyle(box);
      if (!isGoogleFont(box.font)) {
        const variants = STD_FONTS[box.font].std;
        const name = variants[eff.bold && eff.italic ? "boldItalic" : eff.bold ? "bold" : eff.italic ? "italic" : "regular"];
        if (!fontCache.has(name)) fontCache.set(name, doc.embedFont(PDFLib.StandardFonts[name]));
        return fontCache.get(name);
      }
      const family = familyOf(box.font);
      const key = `g|${family}|${eff.bold ? 1 : 0}${eff.italic ? 1 : 0}`;
      if (!fontCache.has(key)) {
        const chars = textBoxes
          .filter((b) => isGoogleFont(b.font) && familyOf(b.font) === family &&
            effectiveStyle(b).bold === eff.bold && effectiveStyle(b).italic === eff.italic)
          .map((b) => b.text).join("");
        const uniq = Array.from(new Set(chars.replace(/\n/g, ""))).join("");
        fontCache.set(key, fetchGoogleFontBytes(family, eff, uniq)
          .then((bytes) => doc.embedFont(bytes, { subset: true })));
      }
      return fontCache.get(key);
    };

    let droppedChars = false;
    for (const box of textBoxes) {
      const page = pdfPages[box.page];
      const info = state.pages[box.page];
      const font = await fontFor(box);
      const size = box.size;
      const color = hexToRgb(box.color);
      const leading = size * LINE_HEIGHT;

      const lines = box.text.split("\n").map((l) => {
        const r = encodableText(font, l);
        if (r.dropped) droppedChars = true;
        return r.text;
      });

      // Vertical: match the CSS line box — baseline sits centred within the leading.
      const fullHeight = font.heightAtSize(size);
      const ascent = font.heightAtSize(size, { descender: false });
      const baselineFromTop = (leading - fullHeight) / 2 + ascent;

      // Horizontal: the on-screen div is as wide as its widest line;
      // text-align offsets shorter lines within that width.
      const widths = lines.map((l) => font.widthOfTextAtSize(l, size));
      const maxWidth = Math.max(...widths, 0);

      lines.forEach((line, i) => {
        if (!line) return;
        let dx = 0;
        if (box.align === "center") dx = (maxWidth - widths[i]) / 2;
        else if (box.align === "right") dx = maxWidth - widths[i];
        page.drawText(line, {
          x: box.xPt + dx,
          y: info.hPt - box.yPt - baselineFromTop - i * leading,
          size,
          font,
          color,
        });
      });
    }

    /* Embed each distinct image asset once, then place it per box. */
    const imageCache = new Map();
    for (const box of imageBoxes) {
      if (!imageCache.has(box.asset)) {
        imageCache.set(box.asset, box.asset.kind === "png"
          ? doc.embedPng(box.asset.bytes)
          : doc.embedJpg(box.asset.bytes));
      }
      const image = await imageCache.get(box.asset);
      const info = state.pages[box.page];
      pdfPages[box.page].drawImage(image, {
        x: box.xPt,
        y: info.hPt - box.yPt - box.hPt,
        width: box.wPt,
        height: box.hPt,
      });
    }

    const bytes = await doc.save();
    downloadBlob(bytes, "edited.pdf");
    editStatus.info(droppedChars
      ? "Done — edited.pdf downloaded. Note: some characters aren’t available in the chosen font and were left out."
      : "Done — edited.pdf has been downloaded.");
  } catch (err) {
    editStatus.error("Export failed. " + describePdfError(err));
  } finally {
    exportBtn.disabled = false;
  }
});
