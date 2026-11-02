/* Signature / image upload, boxes and corner-handle resizing. */
import { state } from "./state.js";
import { addImageBtn, imageInput, editStatus } from "./dom.js";
import { setPlacing } from "./placement.js";
import { select, applyBoxStyle, onBoxPointerDown, onBoxKeyDown } from "./boxes.js";
import { clamp } from "./util.js";

addImageBtn.addEventListener("click", () => {
  if (state.placing === "image") { setPlacing(null); return; }
  imageInput.click();
});

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  imageInput.value = "";
  if (!file) return;
  editStatus.busy("Preparing image…");
  try {
    state.pendingImage = await prepareImage(file);
    editStatus.clear();
    setPlacing("image");
  } catch (err) {
    editStatus.error(`“${file.name}” couldn’t be read as an image. ${String((err && err.message) || err)}`);
  }
});

/* Normalise an uploaded image to bytes pdf-lib can embed.
   PNG/JPEG are kept byte-for-byte (lossless). SVG/WebP are rasterised to
   PNG at high resolution with transparency preserved. */
async function prepareImage(file) {
  const okTypes = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
  const type = file.type || (/\.svg$/i.test(file.name) ? "image/svg+xml" : "");
  if (!okTypes.includes(type)) throw new Error("Please use a PNG, JPEG, SVG or WebP file.");

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("The image could not be decoded."));
      im.src = url;
    });
    const natW = img.naturalWidth || 300;
    const natH = img.naturalHeight || 150;

    if (type === "image/png" || type === "image/jpeg") {
      return {
        kind: type === "image/png" ? "png" : "jpg",
        bytes: new Uint8Array(await file.arrayBuffer()),
        displayUrl: URL.createObjectURL(file),
        aspect: natW / natH,
      };
    }

    // Rasterise SVG/WebP to PNG on a transparent canvas.
    const targetW = Math.min(Math.max(natW, 600), 2000);
    const targetH = Math.round(targetW * (natH / natW));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.getContext("2d").drawImage(img, 0, 0, targetW, targetH);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Rasterising failed."))), "image/png"));
    return {
      kind: "png",
      bytes: new Uint8Array(await blob.arrayBuffer()),
      displayUrl: canvas.toDataURL("image/png"),
      aspect: targetW / targetH,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function addImageBox(pageIndex, xPt, yPt, asset) {
  const info = state.pages[pageIndex];
  const wPt = Math.min(info.wPt * 0.3, 250);
  const hPt = wPt / asset.aspect;
  const box = {
    type: "image",
    page: pageIndex,
    xPt: clamp(xPt - wPt / 2, 0, info.wPt - wPt),
    yPt: clamp(yPt - hPt / 2, 0, Math.max(0, info.hPt - hPt)),
    wPt,
    hPt,
    asset,
    el: null,
  };
  const el = document.createElement("div");
  el.className = "ibox";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Signature image — arrow keys to move, Delete to remove");
  el.tabIndex = 0;
  const img = document.createElement("img");
  img.src = asset.displayUrl;
  img.alt = "";
  const handle = document.createElement("div");
  handle.className = "resize-handle";
  handle.setAttribute("aria-hidden", "true");
  el.append(img, handle);
  box.el = el;
  el.addEventListener("pointerdown", (e) => {
    if (e.target === handle) return;
    onBoxPointerDown(e, box);
  });
  handle.addEventListener("pointerdown", (e) => startResize(e, box, handle));
  el.addEventListener("keydown", (e) => onBoxKeyDown(e, box));
  el.addEventListener("focus", () => { if (state.selected !== box) select(box); });
  info.overlayEl.appendChild(el);
  state.boxes.push(box);
  applyBoxStyle(box);
  select(box);
  el.focus({ preventScroll: true });
  return box;
}

/* Corner-handle resize, aspect ratio locked. */
function startResize(e, box, handle) {
  e.preventDefault();
  e.stopPropagation();
  select(box);
  const info = state.pages[box.page];
  const startX = e.clientX;
  const origW = box.wPt;
  handle.setPointerCapture(e.pointerId);

  const onMove = (ev) => {
    const dw = (ev.clientX - startX) / info.scale;
    const maxW = Math.min(info.wPt - box.xPt, (info.hPt - box.yPt) * box.asset.aspect);
    box.wPt = clamp(origW + dw, 12, Math.max(12, maxW));
    box.hPt = box.wPt / box.asset.aspect;
    applyBoxStyle(box);
  };
  const onUp = () => {
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);
  };
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
}
