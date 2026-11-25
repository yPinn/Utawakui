# Utawakui product site

Promotional site with a separate website privacy page, built with Vue, Vite and GSAP
([ADR 0035](../docs/adr/0035-product-site-and-download-entry.md)). It never enters
the app package.

## Run

From the repository root (Node 24+):

```bash
npm run site:install   # once, or after site/package-lock.json changes
npm run site:dev       # http://localhost:5180
npm run site:build     # writes site/dist
npm run site:preview   # serves site/dist on http://localhost:5181
```

Lint and formatting use the root `npm run check`.
Run the site route tests with `npm exec -- vitest run --config site/vite.config.js`.

## Rules

- Colours, spacing, radii, shadows, motion and body type come from the app's
  `src/styles/tokens.css` through `src/styles/tokens.css` here. Only the marketing
  display tier is site-specific; do not hard-code values in components.
- Pages share the app's `UiScrollRegion`. ScrollTrigger observes that component's
  native viewport. Keep moving demonstrations readable in reduced-motion mode.
- Public destinations are listed in `src/content/links.js`. During development and
  preview, `/download` redirects to the latest public release page on GitHub. The
  build emits the same fallback in `dist/_redirects`; deployment can replace its
  destination with the installer URL from published release data as specified in
  ADR 0035.
- Template thumbnails use the explicit desktop allowlist or the matching WebP
  capture in [the site's asset directory](src/assets/template-thumbnails/README.md).
  Animated previews use the corresponding animated WebP captures of the synthetic
  Output Gallery scene. The page plays visible clips and uses still posters
  when reduced motion is enabled.
  Images marked `blocked-G01` must not be published.
- The site is promotional: prefer illustrations over app screens. The
  before／after scene is the one intentional product view.
- Design for Windows desktop visitors first. Keep text and links usable at
  narrower widths.
- Link to Utawakui's license and site privacy notice. Legal research and
  platform-policy analysis belong in the private governance documentation.
