/* Editor state. Modules import `state` and mutate its fields. */

/* Style applied to newly added text (updated as the user changes controls). */
export const current = { font: "Helvetica", size: 16, color: "#111111", bold: false, italic: false, align: "left" };

export const state = {
  pdfBytes: null, // original file bytes, used for export
  pdfjsDoc: null,
  /* Per page: { wPt, hPt, scale, pageEl, overlayEl, canvas, rendered, rendering } */
  pages: [],
  /* Elements placed on pages. Text: { type:"text", page, xPt, yPt, text, font,
     bold, italic, size, color, align, el }. Image: { type:"image", page, xPt,
     yPt, wPt, hPt, asset, el }. Font is "Helvetica"/"Times"/"Courier" or
     "g:Family Name" for a Google font. */
  boxes: [],
  selected: null,
  placing: null, // null | "text" | "image"
  pendingImage: null, // asset waiting to be placed
  observer: null, // IntersectionObserver for lazy page rendering
  lastFontValue: current.font, // font-select value to restore after browsing
};
