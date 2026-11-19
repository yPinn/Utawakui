# ADR 0033: Mobile companion on the local network

## Status

Accepted and implemented (2026-11-17); device acceptance pending. Behavior is
specified in the
[mobile companion contract](../contracts/mobile-companion.md).

## Context

Singers want lyrics and basic transport on a phone while the PC drives OBS.
Spec 6.2 accepted a phone remote and prompter that share the desktop prompter
presentation. Existing boundaries forbid the obvious shortcuts:

- The Output server binds `127.0.0.1`, checks Host and Origin, and its `/ws`
  channel is read-only by design (ADR 0006). Opening it to the LAN or adding
  commands to it would turn a public presentation plane into a control plane
  (ADR 0013, rejected option).
- The Performer preload and renderer IPC must never be reachable from the LAN
  (performer prompter contract).
- The integration adapter contract requires a separate threat model, pairing,
  origin policy and user-facing network scope before any LAN access.
- Cloud relays, accounts and multi-user collaboration are non-goals.

## Decision

Add a **companion plane**: a separate Main-owned HTTP and WebSocket listener for
paired phones on one network interface. It is unrelated to the Output
server and shares no port, route, channel or credential with it.

- **Off by default and gated.** A new `mobile-companion` feature gate guards
  enabling, pairing and every request. With the gate off the listener does not
  exist and adds no startup work.
- **One interface, private by default.** Main uses the only usable IPv4
  interface, or the one the user picks when there are several, and binds only
  that address. A public Windows network profile requires the user to choose
  "use anyway". Consent is remembered by profile name, so another public
  profile asks again (owner decision, 2026-11-18: some computers cannot change
  their network profile). Unidentified profiles stay blocked. Host and Origin
  must equal that address and port exactly. Plain HTTP is used; self-signed TLS was rejected because phone
  browsers show warnings users cannot meaningfully judge.
- **Pairing by QR with a one-time code, approved on the computer.** The
  QR shows in Settings as soon as the listener runs, so pairing needs no extra
  click (owner decision, 2026-11-18); a used or expired code is covered by a
  scrim offering a new one. A QR leaked on a stream can only open a request
  the user must approve. The QR URL's
  fragment carries a single-use, short-lived code; fragments are not sent in
  requests, logged or exported. A valid code only opens a pending request: the
  phone and the computer both show a four-digit match code, and the device
  credential is issued only after the user chooses Allow on the computer.
  Deny or a 60-second timeout voids the request, so a leaked QR code alone
  never pairs a phone. (Added 2026-11-18 after review of stream leakage.)
- **Remembered devices.** Main stores only a hash of each device credential,
  with a label and timestamps, encrypted with `safeStorage`. Every paired device
  is listed in Settings and can be revoked individually or all at once.
  Revocation and turning the feature off close open connections at once.
- **Separate read and write channels.** The read channel streams the existing
  validated performer snapshot, server to client. Commands use a separate
  authenticated endpoint. Each device holds the capabilities `prompter.read`
  and `player.transport.write`.
- **Bounded commands.** The first release accepts the existing shortcut command
  set (play/pause, previous/next, transpose ±1, volume ±/mute)
  and the performer reading variants. The mobile player also supports original
  key, fixed tempo presets and the monitor guide-vocal mix for separated audio.
  The phone follows whole lyric lines using the published playback clock. The companion command gate rejects desktop lyrics offset changes.
  Each command is a fixed enum plus the context revision and track id it was
  issued against. Seek also carries an integer position bounded by the
  current track duration. Queue playback carries a bounded index into the published upcoming queue. It resolves only while the target remains in its original group. Main validates gate,
  credential, capability, schema, rate and readiness, then hands the intent to
  the renderer's existing executor. Results distinguish rejected, accepted,
  applied and timed out. Nothing is queued while the renderer is unavailable,
  and stale or replayed commands are rejected. Manual queue edits use fixed intents. Library deletion and performance plan editing remain desktop operations.
- **Output template quick adjustments.** While the Output gate is open, the
  snapshot includes the applied template and bounded editable settings per slot.
  The paired phone can edit those fields, select an existing portrait, or reset the editable template settings.
  Main checks both feature gates and the desktop compares the published options
  with the current slot before persisting the change.
- **Own entry and assets.** The phone page is a dedicated renderer entry served
  from an exact asset allowlist with a strict CSP. It reuses `PerformerLyricCue`,
  `selectPerformerFrame` with its own surface tokens through a companion transport
  adapter. The snapshot publisher no longer depends on the desktop prompter
  window being open.

## Threat model

| Threat                                        | Mitigation                                                                                                                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another device on the LAN sends commands      | No command without a paired device credential; a credential is issued only after approval on the computer.                                                                                                                 |
| QR code shown on a stream or recording        | Short-lived single-use code; a scan only opens a request the user must approve after comparing match codes.                                                                                                                |
| Code or credential leaks through URLs or logs | Pairing code only in the URL fragment; credential only in headers or the first socket message; never logged.                                                                                                               |
| Passive sniffing on the LAN (plain HTTP)      | Accepted residual risk; higher on a public network the user chose to use, so that is per network and explicit. Capabilities are limited to transport and display; revocation is one click.                                 |
| DNS rebinding or cross-site requests          | Exact Host and Origin checks; no CORS; JSON only; strict CSP on the phone page.                                                                                                                                            |
| Replay or stale commands                      | Per-device monotonic sequence, context revision and track id checks, short admission window.                                                                                                                               |
| Flooding                                      | Per-device and per-command rate limits; bounded payload, fragment and connection counts.                                                                                                                                   |
| Exposure on public Wi-Fi                      | Off by default. A public profile requires explicit approval for that profile. An unidentified profile stays blocked until Windows reports a profile name.                                                                  |
| Data disclosure                               | Snapshot carries performer state and bounded settings and portrait choices for applied Output templates, never paths, URLs or provider data. Library search and artwork are served on request to the connected phone only. |

## Consequences

- Windows Defender Firewall prompts on first listen. The phone screen
  recommends allowing private networks only, or public networks too while on
  one the user chose. A computer whose firewall cannot be changed may still
  block phones; the app cannot work around that.
- A remembered credential on a lost phone stays valid until revoked; Settings
  shows the last-seen time to help spot that.
- A new feature gate means a new notice version and acceptance cases.
- Packaging adds the companion entry and its allowlisted assets to the release
  inventory.

## Rejected options

- **Reuse the Output server or `/ws`.** Mixes a public read-only plane with
  control and breaks ADR 0006.
- **Bind all interfaces.** Exposes the listener on every network, including
  VPN and public adapters.
- **Self-signed TLS.** Browser warnings train users to click through; the
  pairing secret model gives comparable protection for this scope.
- **Typed PIN.** It adds a typing step without protecting against a code seen
  on stream; the match-code approval covers that case.
- **Cloud relay or mDNS discovery.** Relays are a non-goal; mDNS widens the
  advertised surface without solving pairing.
