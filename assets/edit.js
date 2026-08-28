/* PDF Editor — render with pdf.js; add text (standard or Google fonts) and
   signature images; export with pdf-lib (text and images embedded natively). */
"use strict";

(() => {
  const { isPdfFile, attachDropzone, downloadBlob, makeStatus, describePdfError } = PDFTools;

  pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdfjs-worker-3.11.174.min.js";

  /* Screen font stacks and pdf-lib standard fonts for each family/style. */
  const STD_FONTS = {
    Helvetica: {
      css: "Helvetica, Arial, sans-serif",
      std: { regular: "Helvetica", bold: "HelveticaBold", italic: "HelveticaOblique", boldItalic: "HelveticaBoldOblique" },
    },
    Times: {
      css: "'Times New Roman', Times, serif",
      std: { regular: "TimesRoman", bold: "TimesRomanBold", italic: "TimesRomanItalic", boldItalic: "TimesRomanBoldItalic" },
    },
    Courier: {
      css: "'Courier New', Courier, monospace",
      std: { regular: "Courier", bold: "CourierBold", italic: "CourierOblique", boldItalic: "CourierBoldOblique" },
    },
  };

  const LINE_HEIGHT = 1.2; // must match .tbox line-height in CSS

  // Upload state
  const intro = document.getElementById("intro");
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const introStatus = makeStatus(document.getElementById("introStatus"));

  // Editor state
  const editor = document.getElementById("editor");
  const stage = document.getElementById("stage");
  const pagesEl = document.getElementById("pages");
  const hintEl = document.getElementById("hint");
  const editStatus = makeStatus(document.getElementById("editStatus"));

  // Toolbar
  const addTextBtn = document.getElementById("addTextBtn");
  const addImageBtn = document.getElementById("addImageBtn");
  const imageInput = document.getElementById("imageInput");
  const fontSelect = document.getElementById("fontSelect");
  const googleFontGroup = document.getElementById("googleFontGroup");
  const sizeInput = document.getElementById("sizeInput");
  const colorInput = document.getElementById("colorInput");
  const boldBtn = document.getElementById("boldBtn");
  const italicBtn = document.getElementById("italicBtn");
  const alignBtns = Array.from(document.querySelectorAll("[data-align]"));
  const deleteBtn = document.getElementById("deleteBtn");
  const resetBtn = document.getElementById("resetBtn");
  const exportBtn = document.getElementById("exportBtn");

  // Font browser
  const fontBrowser = document.getElementById("fontBrowser");
  const fontSearch = document.getElementById("fontSearch");
  const fontResults = document.getElementById("fontResults");
  const fontBrowserClose = document.getElementById("fontBrowserClose");

  let pdfBytes = null; // original file bytes, used for export
  let pdfjsDoc = null;
  let pages = []; // per page: { wPt, hPt, scale, pageEl, overlayEl, canvas, rendered }
  /* Elements placed on pages. Text: { type:"text", page, xPt, yPt, text, font,
     bold, italic, size, color, align, el }. Image: { type:"image", page, xPt,
     yPt, wPt, hPt, asset, el }. Font is "Helvetica"/"Times"/"Courier" or
     "g:Family Name" for a Google font. */
  let boxes = [];
  let selected = null;
  let placing = null; // null | "text" | "image"
  let pendingImage = null; // asset waiting to be placed
  let observer = null;

  /* Google fonts: family -> variant availability flags (1=bold, 2=italic,
     4=bold-italic; regular always present). Catalog loaded on demand. */
  let fontCatalog = null; // Map(family -> flags)
  let catalogPromise = null;
  const loadedCss = new Set(); // families whose stylesheet is on the page

  /* Style applied to newly added text (updated as the user changes controls). */
  const current = { font: "Helvetica", size: 16, color: "#111111", bold: false, italic: false, align: "left" };

  attachDropzone(dropzone, fileInput, (files) => openPdf(files[0]));

  async function openPdf(file) {
    if (!isPdfFile(file)) {
      introStatus.error(`“${file.name}” isn’t a PDF. Please choose a .pdf file.`);
      return;
    }
    introStatus.busy("Opening PDF…");
    try {
      pdfBytes = new Uint8Array(await file.arrayBuffer());
      // pdf.js takes ownership of the buffer it's given, so hand it a copy.
      pdfjsDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
      // Confirm pdf-lib can also open it now, not at export time.
      await PDFLib.PDFDocument.load(pdfBytes);
    } catch (err) {
      pdfBytes = null;
      if (pdfjsDoc) { pdfjsDoc.destroy(); pdfjsDoc = null; }
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

  function pageScale(wPt) {
    const available = Math.min(stage.clientWidth - 16, 900);
    return Math.max(available / wPt, 0.1);
  }

  async function buildPages() {
    pagesEl.textContent = "";
    pages = [];
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(onPageVisible, { rootMargin: "600px" });

    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      const page = await pdfjsDoc.getPage(i);
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
      label.textContent = `Page ${i} of ${pdfjsDoc.numPages}`;

      pageEl.append(canvas, overlay, label);
      pagesEl.appendChild(pageEl);

      pages.push({ wPt: vp.width, hPt: vp.height, scale, pageEl, overlayEl: overlay, canvas, rendered: false, rendering: false });
      observer.observe(pageEl);
    }
  }

  function onPageVisible(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      renderPage(Number(entry.target.dataset.page));
    }
  }

  async function renderPage(index) {
    const info = pages[index];
    if (!info || info.rendered || info.rendering) return;
    info.rendering = true;
    try {
      const page = await pdfjsDoc.getPage(index + 1);
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

  /* ---------- Google fonts ---------- */

  function isGoogleFont(name) { return name.startsWith("g:"); }
  function familyOf(name) { return name.slice(2); }

  async function loadCatalog() {
    if (fontCatalog) return fontCatalog;
    if (!catalogPromise) {
      catalogPromise = fetch("/assets/google-fonts.json")
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then((list) => { fontCatalog = new Map(list); return fontCatalog; });
    }
    return catalogPromise;
  }

  /* Which of the four variants this box can actually use (regular always exists). */
  function effectiveStyle(box) {
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
  function ensureCssLoaded(family) {
    if (loadedCss.has(family)) return;
    loadedCss.add(family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = css2Url(family, { withVariants: true });
    document.head.appendChild(link);
  }

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

  /* ---------- Font browser panel ---------- */

  let lastFontValue = current.font;

  function openFontBrowser() {
    fontBrowser.hidden = false;
    fontSearch.value = "";
    renderFontResults("");
    fontSearch.focus();
    loadCatalog().then(() => renderFontResults(fontSearch.value)).catch(() => {
      fontResults.innerHTML = "";
      const p = document.createElement("p");
      p.className = "fb-note";
      p.textContent = "Couldn’t load the font list. Check your connection and try again.";
      fontResults.appendChild(p);
    });
  }

  function closeFontBrowser() {
    fontBrowser.hidden = true;
    syncToolbar();
  }

  function renderFontResults(query) {
    fontResults.textContent = "";
    if (!fontCatalog) {
      const p = document.createElement("p");
      p.className = "fb-note";
      p.textContent = "Loading font list…";
      fontResults.appendChild(p);
      return;
    }
    const q = query.trim().toLowerCase();
    let shown = 0;
    for (const family of fontCatalog.keys()) {
      if (q && !family.toLowerCase().includes(q)) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "option");
      b.textContent = family;
      b.addEventListener("click", () => {
        useGoogleFont(family);
        closeFontBrowser();
      });
      fontResults.appendChild(b);
      if (++shown >= 60) break;
    }
    if (!shown) {
      const p = document.createElement("p");
      p.className = "fb-note";
      p.textContent = "No fonts match that search.";
      fontResults.appendChild(p);
    }
  }

  fontSearch.addEventListener("input", () => renderFontResults(fontSearch.value));
  fontSearch.addEventListener("keydown", (e) => { if (e.key === "Escape") closeFontBrowser(); });
  fontBrowserClose.addEventListener("click", closeFontBrowser);

  /* ---------- Placement ---------- */

  function onOverlayPointerDown(e, pageIndex) {
    if (e.target !== e.currentTarget) return; // boxes handle their own events
    if (placing === "text") {
      e.preventDefault();
      const { xPt, yPt } = overlayPoint(e, pageIndex);
      addTextBox(pageIndex, xPt, yPt);
      setPlacing(null);
    } else if (placing === "image" && pendingImage) {
      e.preventDefault();
      const { xPt, yPt } = overlayPoint(e, pageIndex);
      addImageBox(pageIndex, xPt, yPt, pendingImage);
      pendingImage = null;
      setPlacing(null);
    } else {
      select(null);
    }
  }

  function overlayPoint(e, pageIndex) {
    const rect = e.currentTarget.getBoundingClientRect();
    const info = pages[pageIndex];
    return { xPt: (e.clientX - rect.left) / info.scale, yPt: (e.clientY - rect.top) / info.scale };
  }

  function setPlacing(mode) {
    placing = mode;
    if (mode !== "image") pendingImage = null;
    stage.classList.toggle("placing", !!mode);
    addTextBtn.classList.toggle("toggled", mode === "text");
    addTextBtn.setAttribute("aria-pressed", String(mode === "text"));
    addImageBtn.classList.toggle("toggled", mode === "image");
    addImageBtn.setAttribute("aria-pressed", String(mode === "image"));
    hintEl.textContent =
      mode === "text" ? "Now tap or click the spot on the page where the text should go."
      : mode === "image" ? "Now tap or click the spot on the page where the signature should go."
      : "Tap “＋ Text”, then tap the page where the text should go. Drag to move; double-tap to edit.";
  }

  /* ---------- Text boxes ---------- */

  function addTextBox(pageIndex, xPt, yPt) {
    const info = pages[pageIndex];
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
    el.setAttribute("aria-label", "Text element — Enter to edit, arrow keys to move, Delete to remove");
    el.tabIndex = 0;
    el.textContent = box.text;
    box.el = el;
    el.addEventListener("pointerdown", (e) => onBoxPointerDown(e, box));
    el.addEventListener("dblclick", (e) => { e.preventDefault(); startEditing(box); });
    el.addEventListener("keydown", (e) => onBoxKeyDown(e, box));
    el.addEventListener("blur", () => stopEditing(box));
    el.addEventListener("focus", () => { if (selected !== box) select(box); });
    info.overlayEl.appendChild(el);
    boxes.push(box);
    applyBoxStyle(box);
    select(box);
    startEditing(box);
    return box;
  }

  function applyBoxStyle(box) {
    const info = pages[box.page];
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

  function select(box) {
    if (selected && selected.el) selected.el.classList.remove("selected");
    selected = box;
    deleteBtn.disabled = !box;
    if (!box) return;
    box.el.classList.add("selected");
    if (box.type === "text") {
      // Reflect the selected box's style in the toolbar.
      current.font = box.font; current.size = box.size; current.color = box.color;
      current.bold = box.bold; current.italic = box.italic; current.align = box.align;
      syncToolbar();
    }
  }

  function syncToolbar() {
    fontSelect.value = current.font;
    lastFontValue = current.font;
    sizeInput.value = current.size;
    colorInput.value = current.color;
    boldBtn.classList.toggle("toggled", current.bold);
    boldBtn.setAttribute("aria-pressed", String(current.bold));
    italicBtn.classList.toggle("toggled", current.italic);
    italicBtn.setAttribute("aria-pressed", String(current.italic));
    alignBtns.forEach((b) => {
      const on = b.dataset.align === current.align;
      b.classList.toggle("toggled", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  function removeBox(box) {
    box.el.remove();
    boxes = boxes.filter((b) => b !== box);
    if (selected === box) select(null);
  }

  /* Dragging: pointer capture on the box; a small threshold distinguishes tap from drag. */
  function onBoxPointerDown(e, box) {
    if (box.type === "text" && box.el.classList.contains("editing")) return;
    e.preventDefault();
    e.stopPropagation();
    select(box);
    box.el.focus({ preventScroll: true });

    const info = pages[box.page];
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

  function onBoxKeyDown(e, box) {
    if (box.type === "text" && box.el.classList.contains("editing")) {
      if (e.key === "Escape") { e.preventDefault(); box.el.blur(); }
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const info = pages[box.page];
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

  function startEditing(box) {
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

  function stopEditing(box) {
    const el = box.el;
    if (!el.classList.contains("editing")) return;
    el.classList.remove("editing");
    el.contentEditable = "false";
    box.text = el.innerText.replace(/\n$/, "");
    el.textContent = box.text; // normalise any pasted markup
    if (!box.text.trim()) removeBox(box);
  }

  /* ---------- Signature / image boxes ---------- */

  addImageBtn.addEventListener("click", () => {
    if (placing === "image") { setPlacing(null); return; }
    imageInput.click();
  });

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    imageInput.value = "";
    if (!file) return;
    editStatus.busy("Preparing image…");
    try {
      pendingImage = await prepareImage(file);
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

  function addImageBox(pageIndex, xPt, yPt, asset) {
    const info = pages[pageIndex];
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
    el.addEventListener("focus", () => { if (selected !== box) select(box); });
    info.overlayEl.appendChild(el);
    boxes.push(box);
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
    const info = pages[box.page];
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

  /* ---------- Toolbar events ---------- */

  addTextBtn.addEventListener("click", () => setPlacing(placing === "text" ? null : "text"));

  function updateStyle(patch) {
    Object.assign(current, patch);
    syncToolbar();
    if (selected && selected.type === "text") {
      Object.assign(selected, patch);
      applyBoxStyle(selected);
    }
  }

  fontSelect.addEventListener("change", () => {
    if (fontSelect.value === "__browse") {
      fontSelect.value = lastFontValue; // keep the current font while browsing
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
  deleteBtn.addEventListener("click", () => { if (selected) removeBox(selected); });

  resetBtn.addEventListener("click", () => {
    if (boxes.length && !confirm("Close this PDF? Everything you added will be discarded.")) return;
    resetEditor();
  });

  function resetEditor() {
    if (observer) { observer.disconnect(); observer = null; }
    if (pdfjsDoc) { pdfjsDoc.destroy(); pdfjsDoc = null; }
    pdfBytes = null;
    pages = [];
    boxes = [];
    selected = null;
    setPlacing(null);
    pagesEl.textContent = "";
    editStatus.clear();
    editor.hidden = true;
    intro.hidden = false;
    introStatus.clear();
  }

  /* ---------- Export ---------- */

  function hexToRgb(hex) {
    return PDFLib.rgb(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    );
  }

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

  /* Download the exact glyphs needed for one Google font variant.
     Google's css2 endpoint with `text=` returns a single @font-face whose
     file covers exactly those characters. */
  async function fetchGoogleFontBytes(family, eff, text) {
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

  exportBtn.addEventListener("click", async () => {
    if (!pdfBytes) return;
    // Commit any in-progress edit first.
    if (selected && selected.type === "text" && selected.el.classList.contains("editing")) selected.el.blur();

    exportBtn.disabled = true;
    editStatus.busy("Exporting PDF…");
    try {
      const textBoxes = boxes.filter((b) => b.type === "text" && b.text.trim());
      const imageBoxes = boxes.filter((b) => b.type === "image");
      const needsCatalog = textBoxes.some((b) => isGoogleFont(b.font));
      if (needsCatalog) await loadCatalog();

      const doc = await PDFLib.PDFDocument.load(pdfBytes);
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
        const info = pages[box.page];
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
        const info = pages[box.page];
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

  /* ---------- Resize: re-scale pages and reposition boxes ---------- */

  let resizeTimer = null;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (!pdfjsDoc || window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      for (let i = 0; i < pages.length; i++) {
        const info = pages[i];
        const newScale = pageScale(info.wPt);
        if (Math.abs(newScale - info.scale) < 0.01) continue;
        info.scale = newScale;
        info.pageEl.style.width = info.wPt * newScale + "px";
        info.pageEl.style.height = info.hPt * newScale + "px";
        if (info.rendered) { info.rendered = false; renderPage(i); }
      }
      boxes.forEach(applyBoxStyle);
    }, 250);
  });

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), Math.max(min, max));
  }
})();
