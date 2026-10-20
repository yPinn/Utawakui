# Output F1 Fixtures

These files are development and test inputs, not runtime configuration or a
Presentation Pack. The application must not import or serve this directory.

- `appearance-baseline.json` pins the eight active templates, exposed fields,
  defaults, bounds, timing capabilities, source limitations and invariant reasons.
  It records current behavior; it does not enable controls or become a second
  implementation of `shared/outputAppearance.mjs`.
- `scenarios.json` contains self-authored synthetic text, track/queue state and
  fixed clocks. The short and long Chinese, Japanese, Korean and English samples
  are test prose, not copied lyrics or evidence of font coverage.
- `cover.png` is an original 8×8 RGB checker, authored for this repository using
  alternating RGB `(40, 120, 160)` and `(230, 190, 90)` pixels. It contains no
  personal images, metadata or external artwork. It uses the repository's own
  fixture permissions; it is not a third-party asset or a user image import.

Run `npm run output:baseline` for the read-only structural check, and
`npm exec -- vitest run scripts/outputAppearanceBaseline.test.mjs` for contract
tests across the existing consumers. Never regenerate the pinned expectations
automatically merely to make a changed implementation pass.

The scenario builder returns a snapshot, a fixed observation time, environment
stimuli and optional steps. Its projector calls the existing canonical functions;
it does not simulate the DOM, execute steps, connect a WebSocket, decode images or
load fonts. Source identity, permission failure, reduced motion and asset-failure
cases therefore retain pending runtime/manual evidence.

Baseline values are per slot/template, not a global user project or theme sync.
`not-exposed` differs from a template invariant and from an unimplemented file
import. The distinction and the eight-template manual checklist are documented in
[the appearance contract](../../../docs/contracts/output-appearance.md).
