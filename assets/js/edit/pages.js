/* PDF loading, page layout, lazy rendering (pdf.js) and resize handling. */
import { isPdfFile, attachDropzone } from "../shared/files.js";
import { describePdfError } from "../shared/pdf-errors.js";
import { state } from "./state.js";
import { intro, dropzone, fileInput, introStatus, editor, stage, pagesEl, editStatus } from "./dom.js";
import { onOverlayPointerDown, setPlacing } from "./placement.js";
import { applyBoxStyle } from "./boxes.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdfjs-worker-3.11.174.min.js";

attachDropzone(dropzone, fileInput, (files) => openPdf(files[0]));

export async function openPdf(file) {
  if (!isPdfFile(file)) {
    introStatus.error(`“${file.name}” isn’t a PDF. Please choose a .pdf file.`);
    return;
  }
  introStatus.busy("Opening PDF…");
  try {
    state.pdfBytes = new Uint8Array(await file.arrayBuffer());
    // pdf.js takes ownership of the buffer it's given, so hand it a copy.
    state.pdfjsDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice() }).promise;
    // Confirm pdf-lib can also open it now, not at export time.
    await PDFLib.PDFDocument.load(state.pdfBytes);
  } catch (err) {
    state.pdfBytes = null;
    if (state.pdfjsDoc) { state.pdfjsDoc.destroy(); state.pdfjsDoc = null; }
    if (err && err.name === "PasswordException") {
      introStatus.error(`“${file.name}” is password-protected. Remove the password (e.g. by printing it to a new PDF) and try again.`);
    } else if (err && err.name === "InvalidPDFException") {
      introStatus.error(`“${file.name}” doesn’t appear to be a valid PDF, or it may be corrupt.`);
    } else {
      introStatus.error(describePdfError(err, file.name));
    }
    return;
  }

  introStatus.clear();
  intro.hidden = true;
  editor.hidden = false;
  await buildPages();
}

export function pageScale(wPt) {
  const cs = getComputedStyle(stage);
  const inner = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const available = Math.min(inner, 900);
  return Math.max(available / wPt, 0.1);
}

async function buildPages() {
  pagesEl.textContent = "";
  state.pages = [];
  if (state.observer) state.observer.disconnect();
  state.observer = new IntersectionObserver(onPageVisible, { rootMargin: "600px" });

  for (let i = 1; i <= state.pdfjsDoc.numPages; i++) {
    const page = await state.pdfjsDoc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const scale = pageScale(vp.width);

    const pageEl = document.createElement("div");
    pageEl.className = "pdf-page";
    pageEl.dataset.page = i - 1;
    pageEl.style.width = vp.width * scale + "px";
    pageEl.style.height = vp.height * scale + "px";

    const canvas = document.createElement("canvas");
    const overlay = document.createElement("div");
    overlay.className = "page-overlay";
    overlay.addEventListener("pointerdown", (e) => onOverlayPointerDown(e, i - 1));

    const label = document.createElement("div");
    label.className = "page-label";
    label.textContent = `Page ${i} of ${state.pdfjsDoc.numPages}`;

    pageEl.append(canvas, overlay, label);
    pagesEl.appendChild(pageEl);

    state.pages.push({ wPt: vp.width, hPt: vp.height, scale, pageEl, overlayEl: overlay, canvas, rendered: false, rendering: false });
    state.observer.observe(pageEl);
  }
}

function onPageVisible(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    renderPage(Number(entry.target.dataset.page));
  }
}

export async function renderPage(index) {
  const info = state.pages[index];
  if (!info || info.rendered || info.rendering) return;
  info.rendering = true;
  try {
    const page = await state.pdfjsDoc.getPage(index + 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: info.scale * dpr });
    info.canvas.width = Math.floor(vp.width);
    info.canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: info.canvas.getContext("2d"), viewport: vp }).promise;
    info.rendered = true;
  } catch (err) {
    editStatus.error("A page failed to render. " + String((err && err.message) || err));
  } finally {
    info.rendering = false;
  }
}

export function resetEditor() {
  if (state.observer) { state.observer.disconnect(); state.observer = null; }
  if (state.pdfjsDoc) { state.pdfjsDoc.destroy(); state.pdfjsDoc = null; }
  state.pdfBytes = null;
  state.pages = [];
  state.boxes = [];
  state.selected = null;
  setPlacing(null);
  pagesEl.textContent = "";
  editStatus.clear();
  editor.hidden = true;
  intro.hidden = false;
  introStatus.clear();
}

let resizeTimer = null;

let lastWidth = window.innerWidth;

window.addEventListener("resize", () => {
  if (!state.pdfjsDoc || window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    for (let i = 0; i < state.pages.length; i++) {
      const info = state.pages[i];
      const newScale = pageScale(info.wPt);
      if (Math.abs(newScale - info.scale) < 0.01) continue;
      info.scale = newScale;
      info.pageEl.style.width = info.wPt * newScale + "px";
      info.pageEl.style.height = info.hPt * newScale + "px";
      if (info.rendered) { info.rendered = false; renderPage(i); }
    }
    state.boxes.forEach(applyBoxStyle);
  }, 250);
});
