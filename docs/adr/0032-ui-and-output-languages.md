# ADR 0032: UI and Output languages

## Status

Accepted (2026-11-05).

## Context

The control panel was Traditional Chinese only, and its text was spread across
components, composables and Main. An English UI needs one source of text per
language. OBS viewers may also need a language other than the one the operator
reads, and feature notices must stay legally equivalent in every language.

## Decision

UI text lives in `shared/locales/<locale>/<namespace>.json`. The renderer reads
it through vue-i18n and Main reads it through `@intlify/core-base`. Both use the
same catalogs and message syntax. zh-TW is the source catalog. Every key must
also exist in en-US, and a test enforces this. Data rules, user content,
dev-only workbenches and the fixed-language report summary stay outside the
catalogs. The UI literal ratchet records them.

The UI language is `system`, `zh-TW` or `en-US`. Main resolves it once before
the app is ready and pins Chromium with `--lang`. Changing the language saves
the preference for the next launch. When that launch would use a different
language, the app offers Restart now or Later. Restarting always asks first. It
says that unsaved changes are lost, and adds a sentence when vocal separation or
Output is running. Switching in place was rejected. Collation, formatting,
Chromium strings and Main dialogs are all fixed per launch, and a partial live
switch would mix languages.

Output has its own language: `ui`, `zh-TW` or `en-US`. Main resolves it into
`overlayConfig.language` and pushes a change to connected overlays at once.
Overlay status text lives in `overlay/shared/messages.mjs`. Template headings
such as SETLIST and NOW PLAYING are part of the design and are not translated.

Feature notices keep their structure in `shared/featureGates.json` and their
text in each locale's `featureGates.notices`. All languages share one
`noticeVersion`, so switching language never asks again. A material change in
any language raises the version for all of them. Every locale must have the same
notice sections.

The release announcement carries the zh-TW and en-US introductions from the
versioned release notes. The dialog shows the one for the UI language.

## Verification and consequences

Tests cover catalog key parity, every `t()` reference, notice sections per
locale, release summary agreement with both introductions, the restart flow and
the live Output language push. `npm run dev:pseudo` starts an `en-XA` pseudo
locale for development checks. It accents, pads and brackets every translated
string, so the developer can spot hard-coded text, concatenated fragments and
truncation. Packaged builds ignore it.

Adding a language means adding a full catalog, notice text, overlay messages
and a release-note introduction. All of these are checked for parity. In `npm
run dev`, restarting also ends the Vite server through `concurrently -k`.
Packaged builds are not affected.
