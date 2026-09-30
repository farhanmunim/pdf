/* PDF Merger — client-side merging with pdf-lib. */
"use strict";

(() => {
  const { formatBytes, isPdfFile, attachDropzone, downloadBlob, makeStatus, describePdfError, announce, icon } = PDFTools;

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const listEl = document.getElementById("fileList");
  const mergeBtn = document.getElementById("mergeBtn");
  const clearBtn = document.getElementById("clearBtn");
  const status = makeStatus(document.getElementById("status"));
  const summaryEl = document.getElementById("listSummary");

  /* Each entry: { id, name, size, pageCount, bytes } */
  let files = [];
  let nextId = 1;
  let busy = false;

  attachDropzone(dropzone, fileInput, addFiles);

  async function addFiles(picked) {
    const pdfs = picked.filter(isPdfFile);
    const skipped = picked.length - pdfs.length;
    if (skipped > 0) {
      status.error(skipped === 1 ? "One file was skipped because it isn’t a PDF." : `${skipped} files were skipped because they aren’t PDFs.`);
    }
    if (!pdfs.length) {
      if (!skipped) status.error("No files were selected.");
      return;
    }

    status.busy("Reading files…");
    for (const file of pdfs) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const doc = await PDFLib.PDFDocument.load(bytes);
        files.push({ id: nextId++, name: file.name, size: file.size, pageCount: doc.getPageCount(), bytes });
      } catch (err) {
        status.error(describePdfError(err, file.name));
        render();
        return;
      }
    }
    status.clear();
    render();
  }

  function render() {
    listEl.textContent = "";
    files.forEach((f, i) => listEl.appendChild(renderItem(f, i)));
    mergeBtn.disabled = busy || files.length < 2;
    clearBtn.disabled = busy || files.length === 0;
    if (files.length === 0) summaryEl.textContent = "";
    else if (files.length === 1) summaryEl.textContent = "Add at least one more PDF to merge.";
    else summaryEl.textContent = `${files.length} files · ${files.reduce((n, f) => n + f.pageCount, 0)} pages total. Drag the handle or use the arrows to reorder.`;
  }

  function renderItem(f, index) {
    const li = document.createElement("li");
    li.className = "file-item";
    li.dataset.id = f.id;

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.appendChild(icon("grip", "icon icon-sm"));
    handle.addEventListener("pointerdown", (e) => startDrag(e, li));

    const num = document.createElement("span");
    num.className = "file-item__index";
    num.setAttribute("aria-hidden", "true");
    num.textContent = String(index + 1);

    const info = document.createElement("div");
    info.className = "file-item__info";
    const name = document.createElement("span");
    name.className = "file-item__name";
    name.textContent = f.name;
    name.title = f.name;
    const meta = document.createElement("span");
    meta.className = "file-item__meta";
    meta.textContent = `${formatBytes(f.size)} · ${f.pageCount} page${f.pageCount === 1 ? "" : "s"}`;
    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "file-item__actions";
    actions.append(
      iconBtn("chevron-up", `Move ${f.name} up`, () => move(index, -1), index === 0),
      iconBtn("chevron-down", `Move ${f.name} down`, () => move(index, 1), index === files.length - 1),
      iconBtn("x", `Remove ${f.name}`, () => remove(index))
    );

    li.append(handle, num, info, actions);
    return li;
  }

  function iconBtn(iconName, ariaLabel, onClick, disabled = false) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-ghost btn-icon btn-sm";
    b.appendChild(icon(iconName));
    b.setAttribute("aria-label", ariaLabel);
    b.disabled = disabled;
    b.addEventListener("click", onClick);
    return b;
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= files.length) return;
    [files[index], files[target]] = [files[target], files[index]];
    render();
    const moved = files[target];
    announce(`Moved ${moved.name} to position ${target + 1} of ${files.length}.`);
    // Keep keyboard focus on the same file's controls after re-render.
    const [up, down] = listEl.children[target].querySelectorAll("button");
    const preferred = delta < 0 ? up : down;
    (preferred.disabled ? (delta < 0 ? down : up) : preferred).focus();
  }

  function remove(index) {
    const [removed] = files.splice(index, 1);
    if (!files.length) status.clear();
    render();
    announce(`Removed ${removed.name}. ${files.length} file${files.length === 1 ? "" : "s"} remaining.`);
    const next = listEl.children[Math.min(index, files.length - 1)];
    if (next) next.querySelector('[aria-label^="Remove"]').focus();
    else dropzone.focus();
  }

  /* Pointer-based drag reordering — works with both mouse and touch. */
  function startDrag(e, li) {
    if (busy) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    li.classList.add("dragging");

    const onMove = (ev) => {
      const items = Array.from(listEl.children);
      const over = items.find((item) => {
        const r = item.getBoundingClientRect();
        return ev.clientY >= r.top && ev.clientY <= r.bottom;
      });
      if (!over || over === li) return;
      const fromIdx = items.indexOf(li);
      const toIdx = items.indexOf(over);
      const [moved] = files.splice(fromIdx, 1);
      files.splice(toIdx, 0, moved);
      if (toIdx < fromIdx) listEl.insertBefore(li, over);
      else listEl.insertBefore(li, over.nextSibling);
    };

    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      li.classList.remove("dragging");
      render(); // refresh arrow-button disabled states
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  mergeBtn.addEventListener("click", async () => {
    if (files.length < 2 || busy) return;
    busy = true;
    render();
    status.busy("Merging PDFs…");
    try {
      const out = await PDFLib.PDFDocument.create();
      for (const f of files) {
        const src = await PDFLib.PDFDocument.load(f.bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save();
      downloadBlob(bytes, "merged.pdf");
      status.info("Done — merged.pdf has been downloaded. You can reorder and merge again, or clear the list.");
    } catch (err) {
      status.error("Merging failed. " + describePdfError(err));
    } finally {
      busy = false;
      mergeBtn.disabled = files.length < 2;
      clearBtn.disabled = files.length === 0;
    }
  });

  clearBtn.addEventListener("click", () => {
    files = []; // drops references so the browser can free the file data
    status.clear();
    render();
  });
})();
