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
- **`/changelog/`** — release notes, linked from the version pill in the topbar.

## Design system

The UI is benchmarked against [App Blueprint](https://app-blueprint.farhan.app/)
(`farhanshares/app-blueprint`): shadcn-style neutral palette expressed as HSL
tokens, 52px topbar with logo mark + version pill, dot-grid canvas, slim
32px footer, Lucide-style stroke icons, `<dialog>` modals and a bottom
navigation bar at ≤640px. Light and dark themes are driven by
`data-theme` on `<html>` (set before paint by an inline script, persisted in
`localStorage` under `app-theme`) and fall back to `prefers-color-scheme`.

`assets/style.css` is organised as THEME → TOKENS → BASE → PRIMITIVES →
SHELL → PAGES → RESPONSIVE. To re-skin, edit the tokens at the top of `:root`.

The Geist and Geist Mono typefaces (OFL) are **self-hosted** under
`assets/fonts/` (latin + latin-ext subsets) so page loads make no
third-party requests.

## Accessibility & SEO

- Skip link, single `<h1>` per page, landmark roles with unique names, native
  `<dialog>` modals, visible focus rings, `prefers-reduced-motion` support,
  larger hit targets on coarse pointers, WCAG AA contrast in both themes.
- Editor toolbar follows the ARIA toolbar pattern (arrow keys move between
  buttons); reorder/remove actions in the merger and font choices in the
  editor are announced via a live region.
- Every page has a canonical URL, description, Open Graph + Twitter cards
  with a 1200×630 image, `theme-color`, a web manifest and JSON-LD
  (`WebSite`, `WebApplication`, `FAQPage`, `BreadcrumbList`).
- `sitemap.xml` and `robots.txt` at the root.

## Stack

Plain HTML/CSS/JS — no framework, no build step. The PDF libraries are
vendored under `assets/vendor/` (versioned filenames, immutable caching).

```
index.html            Landing page (hero, tools, features, FAQ)
merge/index.html      Merger UI
edit/index.html       Editor UI
changelog/index.html  Release notes
assets/style.css      Design system + page styles (light/dark)
assets/common.js      Shared helpers + app shell (theme, dialogs, toolbar keys, announcer, icons)
assets/merge.js       Merger logic
assets/edit.js        Editor logic
assets/google-fonts.json  Baked catalog of Google Font families + variants
assets/fonts/         Self-hosted Geist / Geist Mono (woff2)
assets/icon.svg       Favicon / manifest icon (+ icon-192/512.png, apple-touch-icon.png)
assets/og-*.png       Social preview images (1200×630)
assets/vendor/        pdf-lib + pdf.js + fontkit (vendored)
manifest.webmanifest  Web app manifest
_headers              Cloudflare Pages headers (security + caching)
```

To refresh the Google Fonts catalog, regenerate `assets/google-fonts.json`
from https://gwfh.mranftl.com/api/fonts: keep families with a `regular`
variant as `[family, flags]` where flags = 1 for `700`, 2 for `italic`,
4 for `700italic` (OR'd together).

## Adding a new tool

Create `newtool/index.html` (copy an existing tool page for the shell, SEO
tags and dialogs), add `assets/newtool.js`, reuse the helpers in
`assets/common.js`, and add the tool to the landing page grid, topbar nav,
mobile nav, `sitemap.xml` and the changelog. No other changes needed.

## Releasing

Bump the version pill in each page's topbar, add an entry to
`changelog/index.html` and update `lastmod` in `sitemap.xml`.

## Development

Any static file server works:

```sh
python3 -m http.server 8000
```

## Deployment (Cloudflare Pages)

- Build command: *none*
- Build output directory: `/` (repository root)
- Custom domain: `pdf.farhan.app`
