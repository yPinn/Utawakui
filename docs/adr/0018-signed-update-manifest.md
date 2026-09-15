# ADR 0018: Signed update manifest as an independent integrity layer

## Status

Proposed (2026-09-15). The signing tool, verification module, and
`appUpdateService.js` wiring are implemented and unit-tested; wiring the real
signing step into `.github/workflows/release.yml` and deciding where the
production private key is custodied are deliberately not done in this round
(see Consequences).

## Context

`docs/spec.md` §7.1 recorded this as an open decision after competitor
research (`docs/research/competitive-research.md`) found that both EliteSand
Pro and 歌回救星 have an asymmetric-signed update manifest layered on top of
their own artifact hash verification, while `docs/architecture.md` described
Utawakui as an "unsigned updater runtime."

**That framing turned out to be imprecise once checked against
[ADR 0007](0007-public-release-app-updates.md), which already covers this
ground carefully.** Utawakui is not missing integrity verification —
`electron-updater` already checks the downloaded installer's SHA-512 against
`latest.yml`, a standard electron-builder mechanism ADR 0007 documents and
keeps. What ADR 0007 explicitly names as an **accepted residual risk** is
narrower:

> A compromised repository or publishing credential could still replace both
> payload and metadata; SHA-512 integrity does not authenticate the
> publisher.

`latest.yml` and the installer are produced by the same CI run under the same
publish credential (`Contents: write` on `yPinn/Utawakui-Releases`, per ADR
0007's repository boundary section). If that one credential is stolen, an
attacker can republish a malicious installer with a matching, self-consistent
`latest.yml` — SHA-512 alone can't tell the difference. This is exactly what
EliteSand Pro's independent manifest signature defends against: a signing key
held outside the publish credential's blast radius, so "can publish a
release" and "can produce a validly-signed update" become two different
capabilities.

This ADR is **not** re-litigating ADR 0007's other decisions:

- **Authenticode code signing** (`signExecutable`/`verifyUpdateCodeSignature`,
  a paid publisher certificate) was explicitly rejected in ADR 0007 for
  recurring-cost reasons unrelated to engineering effort. Not reopened here.
- **A custom downloader/installer** (what EliteSand Pro actually built,
  instead of using `electron-updater`) was explicitly rejected in ADR 0007 as
  unnecessary added privileged-installer surface. Not reopened here —
  `electron-updater` still owns the entire download/verify/install pipeline
  unmodified; this ADR only adds an independent check _around_ it.

The user confirmed the scope for this round: build the architecture with a
development self-signed key; do not decide where a production key would be
custodied or wire signing into the live release workflow yet.

## Decision

Add an independent, separately-signed manifest that `appUpdateService.js`
fetches and verifies before allowing a download to proceed — fully outside
`electron-updater`'s own black-box download/verify flow, which cannot be
hooked into or modified (ADR 0007's rejection of a custom installer pipeline
applies here too: this stays a check bolted on the outside, not a
replacement for anything `electron-updater` does internally).

### Manifest format and local signing tool

- `tools/update-signing/generate-keypair.mjs` — generates an Ed25519 keypair
  (Node's built-in `crypto`, no new dependency). The private key is written
  to `tools/update-signing/.local/` (gitignored, mode `0600`); refuses to
  overwrite an existing key. Only ever produces a key labeled `dev`.
- `tools/update-signing/sign-manifest.mjs` — given a version, release date,
  and one or more release asset paths, computes each file's SHA-512, builds
  `{ schemaVersion, version, releaseDate, files: [{ name, size, sha512 }] }`,
  canonicalizes it (sorted keys, no whitespace — same well-known technique
  EliteSand Pro's `update-signature.js` uses, not shared code), signs the
  canonical bytes with the loaded private key, and writes the manifest with
  an appended `signature` (hex) field.
- `shared/updateSigningPublicKey.json` — the public half only:
  `{ keyId, environment, algorithm, publicKeyHex, note }`. Currently holds a
  real generated `dev`-labeled key (`keyId: "dev-2026-09-15"`). Swapping to a
  production key later is a one-file change; no verification code changes.

### Main-process verification

- `electron/lib/updateManifestVerification.js` — pure, Electron-independent:
  `canonicalizeManifest()` (shared with the signing tool via `createRequire`,
  so signing and verification can never disagree about what bytes were
  signed) and `verifyManifest(manifest, publicKeyHex)`, which returns
  `{ ok, reason? }` and never throws — a malformed or forged input is exactly
  what this function exists to reject, not an operational error.
- `electron/lib/updateManifestClient.js` — fetches
  `https://github.com/yPinn/Utawakui-Releases/releases/download/v<version>/update-manifest.json`,
  mirroring `electron/lib/feedback/client.js`'s established conventions
  (injectable `fetch`, `AbortSignal.timeout`, bounded response read via the
  shared `readBoundedText` helper, classified error reasons instead of raw
  errors). `<version>` only ever comes from `electron-updater`'s own reported
  `info.version` — never a renderer- or caller-suppliable value, continuing
  ADR 0007's "renderer cannot supply a feed URL" principle. Unlike the
  feedback client, this one uses `redirect: 'follow'` rather than `'error'`:
  a GitHub Releases asset URL unconditionally 302s to
  `objects.githubusercontent.com`, and the redirect target isn't
  attacker-influenced (GitHub's own storage for a URL built from a fixed host
  plus electron-updater's own reported version).

### `appUpdateService.js` wiring

- `download()` now fetches and verifies the manifest for
  `status.availableVersion` before calling `updater.downloadUpdate()`.
  Verification also cross-checks the manifest's own `version` field against
  what `electron-updater` reported — a validly-signed manifest for the
  _wrong_ release must not be accepted just because some signature checks
  out.
- Any failure (fetch error, malformed JSON, signature mismatch, version
  mismatch) routes through the existing `fail()` helper into the existing
  `error` phase, now with a distinct bounded message
  (`更新驗證失敗，請稍後再試。` vs. the prior generic
  `無法完成更新操作，請稍後再試。`) so a user sees _some_ differentiation
  without any detail leaking, consistent with ADR 0007's bounded-error
  principle.
- **Fails closed**: any of the above blocks the download outright rather than
  falling back to relying on `electron-updater`'s own SHA-512 check alone.
- `manifestClient`, `verifyManifestFn`, and `publicKeyHex` are injectable
  factory parameters (production never passes them, so real runs always use
  the real client against the committed public key) — the same
  dependency-injection-over-`vi.mock` convention this codebase already uses
  for exactly this class of problem.
- `appUpdateHandlers.js`, `useAppUpdate.js`, and the renderer IPC surface are
  **unchanged** — `check()`/`download()`/`install()` keep their existing
  signatures; this stays entirely inside the boundary ADR 0007 already
  established ("Renderer IPC carries only fixed intents").

## Rejected for this phase

- **Wiring the signing step into `.github/workflows/release.yml`.** Doing so
  requires deciding where the production private key lives — a separate
  GitHub Actions secret from the existing `Contents: write` publish
  credential, a distinct protected `release` Environment, or something
  fully out-of-band from CI entirely. Each has different guarantees against
  different compromise scenarios (a stolen publish token alone vs. a fully
  compromised CI run), and picking one is an operational decision, not an
  engineering one. Left as an explicit open question below.
- **A production keypair.** Generating one before deciding its custody would
  create a key that has to be thrown away and regenerated once that decision
  is made, for no benefit now.
- **Changing `electron-updater`'s own behavior or replacing it.** ADR 0007
  already rejected a custom downloader/installer; this ADR's check runs
  strictly outside that boundary.

## Consequences

- The specific residual risk ADR 0007 named (a compromised publish credential
  forging both payload and metadata together) is now closed for any release
  that actually ships a correctly-signed manifest — but **no release has
  shipped one yet**, since signing isn't wired into the real release
  workflow. Until that follow-up work happens, this mechanism exists in code
  and tests only; it changes nothing about the actual security posture of a
  published release.
- Once wired in, a release that forgets to publish `update-manifest.json` (or
  publishes one signed with the wrong key) will have every user's `download()`
  fail with `更新驗證失敗，請稍後再試。` — the release checklist will need a
  step verifying the manifest was uploaded and verifies, or every user of
  that release is silently stuck unable to update. This is deliberate
  (fail closed), but is a new release-process failure mode to guard against
  operationally, not just a code correctness question.
- `docs/spec.md`'s Distribution status row should read "independent manifest
  signing mechanism built; key custody and CI wiring not yet decided" rather
  than implying this is finished end-to-end.

## Open questions (not decided by this ADR)

1. Where does the production private key live — a GitHub Actions secret
   scoped to the protected `release` Environment (same trust tier as the
   existing publish credential, but a distinct secret), or somewhere fully
   outside CI?
2. Does `.github/workflows/release.yml`'s existing "Publish only after an
   installed-package smoke test" human-review step (ADR 0007) become the
   place signing happens, or does it stay automated within the `package` job?
3. What is the actual release-process failure mode if a maintainer forgets to
   run `sign-manifest.mjs` before publishing — should the release workflow
   refuse to publish without a manifest once this is wired in?

## References

- [ADR 0007: Public app updates use a separate release repository](0007-public-release-app-updates.md)
- [ADR 0009: Tiered audio processing runtime](0009-tiered-audio-processing-runtime.md)
  (unrelated feature, same injectable-dependency testing convention reused here)
- `docs/research/competitive-research.md` §4.5, §9.3 (competitor update-signing
  architectures)
- `electron/lib/feedback/client.js` (the fetch-client convention this module
  mirrors)
