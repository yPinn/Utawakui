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
paired phones on one private network interface. It is unrelated to the Output
server and shares no port, route, channel or credential with it.

- **Off by default and gated.** A new `mobile-companion` feature gate guards
  enabling, pairing and every request. With the gate off the listener does not
  exist and adds no startup work.
- **One interface, private networks only.** The user picks one IPv4 interface.
  Main binds only that address and refuses to start when Windows reports the
  network as Public or unknown. Host and Origin must equal that address and
  port exactly. Plain HTTP is used; self-signed TLS was rejected because phone
  browsers show warnings users cannot meaningfully judge.
- **Pairing by QR with a one-time code.** The desktop shows a QR code for a URL
  whose fragment carries a single-use, short-lived code. Fragments are not sent
  in requests, logged or exported. The phone exchanges the code for a device
  credential.
- **Remembered devices.** Main stores only a hash of each device credential,
  with a label and timestamps, encrypted with `safeStorage`. Every paired device
  is listed in Settings and can be revoked individually or all at once.
  Revocation and turning the feature off close open connections at once.
- **Separate read and write channels.** The read channel streams the existing
  validated performer snapshot, server to client. Commands use a separate
  authenticated endpoint. Each device holds the capabilities `prompter.read`
  and `player.transport.write`.
- **Bounded commands.** The first release accepts the existing shortcut command
  set (play/pause, previous/next, transpose ±1, volume ±/mute, lyrics offset ±)
  and the performer reading variants. Each command is a fixed enum plus the
  context revision and track id it was issued against. Main validates gate,
  credential, capability, schema, rate and readiness, then hands the intent to
  the renderer's existing executor. Results distinguish rejected, accepted,
  applied and timed out. Nothing is queued while the renderer is unavailable,
  and stale or replayed commands are rejected. Queue editing, seeking and
  destructive actions are out of scope.
- **Own entry and assets.** The phone page is a dedicated renderer entry served
  from an exact asset allowlist with a strict CSP. It reuses `PerformerSurface`,
  `selectPerformerFrame` and the performer tokens through a companion transport
  adapter. The snapshot publisher no longer depends on the desktop prompter
  window being open.

## Threat model

| Threat                                        | Mitigation                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Another device on the LAN sends commands      | No command without a paired device credential; pairing needs the on-screen QR code within its validity window.          |
| Code or credential leaks through URLs or logs | Pairing code only in the URL fragment; credential only in headers or the first socket message; never logged.            |
| Passive sniffing on the LAN (plain HTTP)      | Accepted residual risk on private networks. Capabilities are limited to transport and display; revocation is one click. |
| DNS rebinding or cross-site requests          | Exact Host and Origin checks; no CORS; JSON only; strict CSP on the phone page.                                         |
| Replay or stale commands                      | Per-device monotonic sequence, context revision and track id checks, short admission window.                            |
| Flooding                                      | Per-device and per-command rate limits; bounded payload, fragment and connection counts.                                |
| Exposure on public Wi-Fi                      | Refuse to start on Public or unknown network profiles; off by default; status visible while on.                         |
| Data disclosure                               | Snapshot carries only what the desktop prompter already shows; no paths, URLs, library lists or provider data.          |

## Consequences

- Windows Defender Firewall prompts on first listen. The settings copy explains
  the prompt and recommends allowing private networks only.
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
- **Typed PIN or desktop approval prompt.** A PIN adds a typing step; an approval
  prompt interrupts the stream window.
- **Cloud relay or mDNS discovery.** Relays are a non-goal; mDNS widens the
  advertised surface without solving pairing.
