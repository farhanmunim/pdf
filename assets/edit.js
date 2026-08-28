/* PDF Editor — render with pdf.js, add/position text, export with pdf-lib. */
"use strict";

(() => {
  const { isPdfFile, attachDropzone, downloadBlob, makeStatus, describePdfError } = PDFTools;

  pdfjsLib.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdfjs-worker-3.11.174.min.js";

  /* Screen font stacks and pdf-lib standard fonts for each family/style. */
  const FONTS = {
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
  const fontSelect = document.getElementById("fontSelect");
  const sizeInput = document.getElementById("sizeInput");
  const colorInput = document.getElementById("colorInput");
  const boldBtn = document.getElementById("boldBtn");
  const italicBtn = document.getElementById("italicBtn");
  const alignBtns = Array.from(document.querySelectorAll("[data-align]"));
  const deleteBtn = document.getElementById("deleteBtn");
  const resetBtn = document.getElementById("resetBtn");
  const exportBtn = document.getElementById("exportBtn");

  let pdfBytes = null; // original file bytes, used for export
  let pdfjsDoc = null;
  let pages = []; // per page: { wPt, hPt, scale, pageEl, overlayEl, canvas, rendered }
  let boxes = []; // text elements: { id, page, xPt, yPt, text, font, bold, italic, size, color, align, el }
  let nextBoxId = 1;
  let selected = null; // box object or null
  let placing = false;
  let observer = null;

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

  /* ---------- Text boxes ---------- */

  function onOverlayPointerDown(e, pageIndex) {
    if (e.target !== e.currentTarget) return; // a text box handles its own events
    if (placing) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const info = pages[pageIndex];
      const xPt = (e.clientX - rect.left) / info.scale;
      const yPt = (e.clientY - rect.top) / info.scale;
      addBox(pageIndex, xPt, yPt);
      setPlacing(false);
    } else {
      select(null);
    }
  }

  function addBox(pageIndex, xPt, yPt) {
    const info = pages[pageIndex];
    const box = {
      id: nextBoxId++,
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
    s.fontSize = box.size * info.scale + "px";
    s.fontFamily = FONTS[box.font].css;
    s.fontWeight = box.bold ? "bold" : "normal";
    s.fontStyle = box.italic ? "italic" : "normal";
    s.color = box.color;
    s.textAlign = box.align;
  }

  function select(box) {
    if (selected && selected.el) selected.el.classList.remove("selected");
    selected = box;
    deleteBtn.disabled = !box;
    if (!box) return;
    box.el.classList.add("selected");
    // Reflect the selected box's style in the toolbar.
    current.font = box.font; current.size = box.size; current.color = box.color;
    current.bold = box.bold; current.italic = box.italic; current.align = box.align;
    syncToolbar();
  }

  function syncToolbar() {
    fontSelect.value = current.font;
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
    if (box.el.classList.contains("editing")) return;
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
    if (box.el.classList.contains("editing")) {
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
      case "Enter": e.preventDefault(); startEditing(box); return;
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

  function setPlacing(on) {
    placing = on;
    stage.classList.toggle("placing", on);
    addTextBtn.classList.toggle("toggled", on);
    addTextBtn.setAttribute("aria-pressed", String(on));
    hintEl.textContent = on
      ? "Now tap or click the spot on the page where the text should go."
      : "Tap “＋ Add text”, then tap the page where the text should go. Drag text to move it; double-tap to edit it.";
  }

  /* ---------- Toolbar events ---------- */

  addTextBtn.addEventListener("click", () => setPlacing(!placing));

  function updateStyle(patch) {
    Object.assign(current, patch);
    syncToolbar();
    if (selected) {
      Object.assign(selected, patch);
      applyBoxStyle(selected);
    }
  }

  fontSelect.addEventListener("change", () => updateStyle({ font: fontSelect.value }));
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
    if (boxes.length && !confirm("Close this PDF? Text you added will be discarded.")) return;
    resetEditor();
  });

  function resetEditor() {
    if (observer) { observer.disconnect(); observer = null; }
    if (pdfjsDoc) { pdfjsDoc.destroy(); pdfjsDoc = null; }
    pdfBytes = null;
    pages = [];
    boxes = [];
    selected = null;
    setPlacing(false);
    pagesEl.textContent = "";
    editStatus.clear();
    editor.hidden = true;
    intro.hidden = false;
    introStatus.clear();
  }

  /* ---------- Export ---------- */

  function stdFontFor(box) {
    const variants = FONTS[box.font].std;
    const key = box.bold && box.italic ? "boldItalic" : box.bold ? "bold" : box.italic ? "italic" : "regular";
    return PDFLib.StandardFonts[variants[key]];
  }

  function hexToRgb(hex) {
    return PDFLib.rgb(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    );
  }

  /* Standard PDF fonts can only encode WinAnsi characters; drop anything else. */
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
    if (!pdfBytes) return;
    // Commit any in-progress edit first.
    if (selected && selected.el.classList.contains("editing")) selected.el.blur();

    exportBtn.disabled = true;
    editStatus.busy("Exporting PDF…");
    try {
      const doc = await PDFLib.PDFDocument.load(pdfBytes);
      const fontCache = new Map();
      const embed = async (name) => {
        if (!fontCache.has(name)) fontCache.set(name, await doc.embedFont(name));
        return fontCache.get(name);
      };

      let droppedChars = false;
      const pdfPages = doc.getPages();

      for (const box of boxes) {
        if (!box.text.trim()) continue;
        const page = pdfPages[box.page];
        const info = pages[box.page];
        const font = await embed(stdFontFor(box));
        const size = box.size;
        const color = hexToRgb(box.color);
        const leading = size * LINE_HEIGHT;

        const rawLines = box.text.split("\n");
        const lines = rawLines.map((l) => {
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

      const bytes = await doc.save();
      downloadBlob(bytes, "edited.pdf");
      editStatus.info(droppedChars
        ? "Done — edited.pdf downloaded. Note: some special characters aren’t supported by the built-in PDF fonts and were left out."
        : "Done — edited.pdf has been downloaded.");
    } catch (err) {
      editStatus.error("Export failed. " + describePdfError(err));
    } finally {
      exportBtn.disabled = false;
    }
  });

  /* ---------- Resize: re-scale pages and reposition text ---------- */

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
