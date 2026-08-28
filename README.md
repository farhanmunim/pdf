# pdf.farhan.app — PDF Tools

Simple, private, browser-based PDF tools. All processing happens client-side —
files never leave the user's device. No accounts, no backend, no database.

## Tools

- **`/merge/` — PDF Merger.** Combine multiple PDFs into one. Drag (or use
  arrow buttons) to reorder. Pages are copied object-for-object with
  [pdf-lib](https://pdf-lib.js.org/), so dimensions, vectors and quality are
  preserved — nothing is rasterised.
- **`/edit/` — PDF Editor.** Add text to any page: standard fonts (Helvetica /
  Times / Courier) or any of ~1,950 Google Fonts (searchable browser; the font
  file is fetched from Google, subset to the characters used, and embedded
  into the PDF via pdf-lib + fontkit). Size, colour, bold/italic, alignment.
  Also signature/image upload (PNG/JPEG/SVG/WebP, transparency preserved) —
  tap to place, drag to move, corner handle to scale. Pages are previewed
  with [pdf.js](https://mozilla.github.io/pdf.js/); on export text and images
  are embedded natively into the original PDF — the original pages are
  untouched. Google is only contacted when a Google font is actually used;
  the standard fonts stay fully offline.

## Stack

Plain HTML/CSS/JS — no framework, no build step. The PDF libraries are
vendored under `assets/vendor/` (versioned filenames, immutable caching) so
the site makes no third-party requests, except to Google Fonts when a user
picks a Google font in the editor.

```
index.html            Landing page
merge/index.html      Merger UI
edit/index.html       Editor UI
assets/style.css      Shared styles (light/dark via prefers-color-scheme)
assets/common.js      Shared helpers: dropzone, download, status, error text
assets/merge.js       Merger logic
assets/edit.js        Editor logic
assets/google-fonts.json  Baked catalog of Google Font families + variants
assets/vendor/        pdf-lib + pdf.js + fontkit (vendored)
_headers              Cloudflare Pages headers (security + caching)
```

To refresh the Google Fonts catalog, regenerate `assets/google-fonts.json`
from https://gwfh.mranftl.com/api/fonts: keep families with a `regular`
variant as `[family, flags]` where flags = 1 for `700`, 2 for `italic`,
4 for `700italic` (OR'd together).

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
