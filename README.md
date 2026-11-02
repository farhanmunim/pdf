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

The CSS in `assets/css/` is organised as THEME → TOKENS → BASE → PRIMITIVES →
SHELL → PAGES → RESPONSIVE (one file or folder per layer). To re-skin, edit the
tokens in `assets/css/tokens.css`.

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

Plain HTML/CSS/JS (native ES modules) — no framework, no build step. The PDF libraries are
vendored under `assets/vendor/` (versioned filenames, immutable caching).

```
index.html                 Landing page (hero, tools, features, FAQ)
merge/index.html           Merger UI
edit/index.html            Editor UI
changelog/index.html       Release notes
404.html                   Not-found page
assets/css/                Design system, split in cascade order
  fonts.css                Self-hosted Geist @font-face
  tokens.css               THEME + TOKENS (colours, spacing, radii, type, shadows)
  base.css                 Reset, body, icons, focus, utilities
  primitives.css           Buttons, chips, inputs
  shell.css                Topbar, canvas, footer, mobile nav, dialogs
  pages/common.css         Shared headings, action row
  pages/landing.css | tool.css | merge.css | editor.css | changelog.css
  responsive.css           Breakpoints, motion, pointer, print (always last)
assets/js/                 Native ES modules (no bundler, no build)
  shell.js                 App shell entry (every page): theme, dialogs, toolbar keys
  shell/                   theme.js, dialogs.js, toolbars.js
  shared/                  files.js, status.js (+ announcer), icons.js, pdf-errors.js
  merge.js                 Merger logic
  edit/                    Editor (entry: main.js)
    constants.js dom.js state.js util.js
    pages.js               Load PDF, page layout, lazy rendering, resize
    placement.js           Click-to-place mode
    boxes.js               Text boxes: select, drag, keyboard, inline edit
    images.js              Signature/image upload, boxes, resize handle
    toolbar.js             Toolbar controls
    fonts.js               Google Fonts catalog, variants, font fetching
    font-browser.js        Google Fonts search panel
    export.js              Embed text/images into the PDF with pdf-lib
assets/data/google-fonts.json   Baked catalog of Google Font families + variants
assets/fonts/              Self-hosted Geist / Geist Mono (woff2)
assets/icon.svg            Favicon / manifest icon (+ icon-192/512.png, apple-touch-icon.png)
assets/og-*.png            Social preview images (1200×630)
assets/vendor/             pdf-lib + pdf.js + fontkit (vendored classic scripts)
manifest.webmanifest       Web app manifest
_headers                   Cloudflare Pages headers (security + caching)
```

Each page links only the stylesheets it needs, in the order above, with
`responsive.css` last. The only inline script is the tiny theme initialiser in
each `<head>` — it must run before first paint to avoid a theme flash.

To refresh the Google Fonts catalog, regenerate `assets/data/google-fonts.json`
from https://gwfh.mranftl.com/api/fonts: keep families with a `regular`
variant as `[family, flags]` where flags = 1 for `700`, 2 for `italic`,
4 for `700italic` (OR'd together).

## Adding a new tool

Create `newtool/index.html` (copy an existing tool page for the shell, SEO
tags and dialogs), add `assets/js/newtool.js` (a `<script type="module">`, plus `shell.js`), reuse
the helpers in `assets/js/shared/`, and add the tool to the landing page grid, topbar nav,
mobile nav, `sitemap.xml` and the changelog. No other changes needed.

## Releasing

Bump the version pill in each page's topbar **and the `?v=` query on the
stylesheet and entry-script references** (`assets/css/*.css`, `shell.js`, the
tool entry script — so browsers never pair new HTML with a cached old
stylesheet or script; modules they import are always revalidated by
`_headers`), add an entry to
`changelog/index.html` and update `lastmod` in `sitemap.xml`.

## Development

Any static file server works (ES modules need `http://`, not `file://`):

```sh
python3 -m http.server 8000
```

## Deployment (Cloudflare Pages)

- Build command: *none*
- Build output directory: `/` (repository root)
- Custom domain: `pdf.farhan.app`
