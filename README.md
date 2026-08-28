# pdf.farhan.app — PDF Tools

Simple, private, browser-based PDF tools. All processing happens client-side —
files never leave the user's device. No accounts, no backend, no database.

## Tools

- **`/merge/` — PDF Merger.** Combine multiple PDFs into one. Drag (or use
  arrow buttons) to reorder. Pages are copied object-for-object with
  [pdf-lib](https://pdf-lib.js.org/), so dimensions, vectors and quality are
  preserved — nothing is rasterised.
- **`/edit/` — PDF Editor.** Add text to any page: font (Helvetica / Times /
  Courier), size, colour, bold/italic, alignment. Tap to place, drag to move,
  double-tap to edit, arrow keys to nudge. Pages are previewed with
  [pdf.js](https://mozilla.github.io/pdf.js/); on export the text is embedded
  as real text into the original PDF with pdf-lib — the original pages are
  untouched.

## Stack

Plain HTML/CSS/JS — no framework, no build step. The two PDF libraries are
vendored under `assets/vendor/` (versioned filenames, immutable caching) so
the site makes zero third-party requests.

```
index.html            Landing page
merge/index.html      Merger UI
edit/index.html       Editor UI
assets/style.css      Shared styles (light/dark via prefers-color-scheme)
assets/common.js      Shared helpers: dropzone, download, status, error text
assets/merge.js       Merger logic
assets/edit.js        Editor logic
assets/vendor/        pdf-lib + pdf.js (vendored)
_headers              Cloudflare Pages headers (security + caching)
```

## Adding a new tool

Create `newtool/index.html` (copy an existing tool page for the header/nav
and SEO tags), add `assets/newtool.js`, reuse the helpers in
`assets/common.js`, and add the tool to the landing page grid, nav and
`sitemap.xml`. No other changes needed.

## Development

Any static file server works:

```sh
python3 -m http.server 8000
```

## Deployment (Cloudflare Pages)

- Build command: *none*
- Build output directory: `/` (repository root)
- Custom domain: `pdf.farhan.app`
