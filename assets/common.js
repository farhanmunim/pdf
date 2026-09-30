/* Shared helpers + app shell for pdf.farhan.app. */
"use strict";

const PDFTools = (() => {
  /* ---------- Icons (Lucide-style, 24×24 stroke paths) ---------- */
  const ICONS = {
    "chevron-up": '<path d="m18 15-6-6-6 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  };

  /* Build an inline <svg class="icon"> element. Decorative by default. */
  function icon(name, cls = "icon icon-sm") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", cls);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.innerHTML = ICONS[name] || "";
    return svg;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function isPdfFile(file) {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  }

  /* Wire up a click/drop/keyboard file picker.
     zoneEl: the visible dropzone (a <button>), inputEl: hidden <input type=file>,
     onFiles: called with an array of File objects. */
  function attachDropzone(zoneEl, inputEl, onFiles) {
    zoneEl.addEventListener("click", () => inputEl.click());
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
      busy(msg) {
        el.classList.remove("error");
        el.textContent = "";
        const s = document.createElement("span");
        s.className = "spinner";
        s.setAttribute("aria-hidden", "true");
        el.append(s, msg);
      },
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

  /* Screen-reader announcements that don't need to be visible. */
  let announcer = null;
  function announce(msg) {
    if (!announcer) {
      announcer = document.createElement("div");
      announcer.className = "visually-hidden";
      announcer.setAttribute("role", "status");
      announcer.setAttribute("aria-live", "polite");
      document.body.appendChild(announcer);
    }
    announcer.textContent = "";
    // Re-insert on the next frame so identical messages are re-announced.
    requestAnimationFrame(() => { announcer.textContent = msg; });
  }

  /* ---------- App shell ---------- */

  const Theme = {
    KEY: "app-theme",
    current() {
      const set = document.documentElement.getAttribute("data-theme");
      if (set === "dark" || set === "light") return set;
      return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    },
    set(theme) {
      const next = theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem(Theme.KEY, next); } catch (_) {}
      Theme.sync();
    },
    toggle() { Theme.set(Theme.current() === "dark" ? "light" : "dark"); },
    sync() {
      const dark = Theme.current() === "dark";
      document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
        btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
        btn.title = dark ? "Switch to light theme" : "Switch to dark theme";
      });
      document.querySelectorAll('meta[name="theme-color"]:not([media])').forEach((m) => {
        m.setAttribute("content", dark ? "#09090b" : "#ffffff");
      });
    },
    init() {
      document.querySelectorAll("[data-theme-toggle]").forEach((btn) => btn.addEventListener("click", Theme.toggle));
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", Theme.sync);
      Theme.sync();
    },
  };

  /* <button data-dialog-open="id"> opens <dialog id>; [data-dialog-close] closes
     the nearest dialog; clicking the backdrop closes too. Focus returns to the
     opener automatically via the native <dialog> behaviour. */
  const Dialogs = {
    init() {
      document.querySelectorAll("[data-dialog-open]").forEach((btn) => {
        const dialog = document.getElementById(btn.dataset.dialogOpen);
        if (!dialog) return;
        btn.addEventListener("click", () => {
          if (typeof dialog.showModal === "function") dialog.showModal();
          else dialog.setAttribute("open", "");
        });
      });
      document.querySelectorAll("dialog").forEach((dialog) => {
        dialog.querySelectorAll("[data-dialog-close]").forEach((b) => b.addEventListener("click", () => dialog.close()));
        dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
      });
    },
  };

  /* Arrow-key navigation between buttons inside role="toolbar" (WAI-ARIA
     toolbar pattern). Inputs and selects keep their own arrow behaviour. */
  const Toolbars = {
    init() {
      document.querySelectorAll('[role="toolbar"]').forEach((tb) => {
        tb.addEventListener("keydown", (e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          if (!(e.target instanceof HTMLButtonElement)) return;
          const items = Array.from(tb.querySelectorAll("button, select, input")).filter(
            (el) => !el.disabled && !el.hidden && el.offsetParent !== null && el.tabIndex >= 0
          );
          const i = items.indexOf(e.target);
          if (i === -1) return;
          e.preventDefault();
          const next = items[(i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
          next.focus();
        });
      });
    },
  };

  function boot() {
    Theme.init();
    Dialogs.init();
    Toolbars.init();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  return { icon, formatBytes, isPdfFile, attachDropzone, downloadBlob, makeStatus, describePdfError, announce, Theme };
})();
