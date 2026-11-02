/* Small pure helpers. */

export function clamp(v, min, max) {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

export function hexToRgb(hex) {
  return PDFLib.rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  );
}
