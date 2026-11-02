/* DOM references and status helpers for the editor page. */
import { makeStatus } from "../shared/status.js";

// Upload state
export const intro = document.getElementById("intro");
export const dropzone = document.getElementById("dropzone");
export const fileInput = document.getElementById("fileInput");
export const introStatus = makeStatus(document.getElementById("introStatus"));

// Editor state
export const editor = document.getElementById("editor");
export const stage = document.getElementById("stage");
export const pagesEl = document.getElementById("pages");
export const hintEl = document.getElementById("hint");
export const editStatus = makeStatus(document.getElementById("editStatus"));

// Toolbar
export const addTextBtn = document.getElementById("addTextBtn");
export const addImageBtn = document.getElementById("addImageBtn");
export const imageInput = document.getElementById("imageInput");
export const fontSelect = document.getElementById("fontSelect");
export const googleFontGroup = document.getElementById("googleFontGroup");
export const sizeInput = document.getElementById("sizeInput");
export const colorInput = document.getElementById("colorInput");
export const boldBtn = document.getElementById("boldBtn");
export const italicBtn = document.getElementById("italicBtn");
export const alignBtns = Array.from(document.querySelectorAll("[data-align]"));
export const deleteBtn = document.getElementById("deleteBtn");
export const resetBtn = document.getElementById("resetBtn");
export const exportBtn = document.getElementById("exportBtn");

// Font browser
export const fontBrowser = document.getElementById("fontBrowser");
export const fontSearch = document.getElementById("fontSearch");
export const fontResults = document.getElementById("fontResults");
export const fontResultsStatus = document.getElementById("fontResultsStatus");
export const fontBrowserClose = document.getElementById("fontBrowserClose");
export const HINT_DEFAULT = hintEl.innerHTML;