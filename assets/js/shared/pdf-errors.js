/* Plain-English messages for PDF load/save failures. */

/* Map a pdf-lib load failure to a plain-English message. */
export function describePdfError(err, filename) {
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
