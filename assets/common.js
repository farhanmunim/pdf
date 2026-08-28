/* Shared helpers for pdf.farhan.app tools. */
"use strict";

const PDFTools = (() => {
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function isPdfFile(file) {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  }

  /* Wire up a click/drop/keyboard file picker.
     zoneEl: the visible dropzone, inputEl: hidden <input type=file>,
     onFiles: called with an array of File objects. */
  function attachDropzone(zoneEl, inputEl, onFiles) {
    zoneEl.addEventListener("click", () => inputEl.click());
    zoneEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        inputEl.click();
      }
    });
    inputEl.addEventListener("change", () => {
      if (inputEl.files.length) onFiles(Array.from(inputEl.files));
      inputEl.value = "";
    });
    zoneEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      zoneEl.classList.add("dragover");
    });
    zoneEl.addEventListener("dragleave", () => zoneEl.classList.remove("dragover"));
    zoneEl.addEventListener("drop", (e) => {
      e.preventDefault();
      zoneEl.classList.remove("dragover");
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length) onFiles(files);
    });
  }

  function downloadBlob(data, filename) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function makeStatus(el) {
    return {
      info(msg) { el.classList.remove("error"); el.textContent = msg; },
      busy(msg) { el.classList.remove("error"); el.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + msg; },
      error(msg) { el.classList.add("error"); el.textContent = msg; },
      clear() { el.classList.remove("error"); el.textContent = ""; },
    };
  }

  /* Map a pdf-lib load failure to a plain-English message. */
  function describePdfError(err, filename) {
    const name = filename ? `“${filename}”` : "This file";
    const msg = String((err && err.message) || err);
    if (/encrypt/i.test(msg)) {
      return `${name} is password-protected. Remove the password (e.g. by printing it to a new PDF) and try again.`;
    }
    if (/Failed to parse|No PDF header|Expected instance of PDFDict|Invalid object/i.test(msg)) {
      return `${name} doesn’t appear to be a valid PDF, or it may be corrupt.`;
    }
    if (/memory|allocation/i.test(msg)) {
      return `${name} is too large for your browser’s memory. Try a smaller file or a desktop browser.`;
    }
    return `${name} couldn’t be processed. ${msg}`;
  }

  return { formatBytes, isPdfFile, attachDropzone, downloadBlob, makeStatus, describePdfError };
})();
