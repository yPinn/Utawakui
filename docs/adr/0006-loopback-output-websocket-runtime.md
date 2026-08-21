# ADR 0006: Loopback output runtime uses Node HTTP plus ws

## Status

Accepted and implemented for Phase 1B (2026-08-22). Phase 1C subsequently added
the exact static overlay routes described below, and Phase 1D connected gated
renderer IPC plus the real Workbench iframe. This ADR covers the main-process
runtime and its wire boundary.

## Context

OBS Browser Source is a CEF browser that can load an HTTP URL and can unload or
reload that page as scenes change. Utawakui therefore needs a small local server
that can provide a current state snapshot after every fresh connection and push
later changes without coupling the overlay to Electron IPC.

The runtime needs an HTTP server, an RFC 6455 WebSocket server, predictable
packaging, and a narrow attack surface. Node provides the HTTP server and a
browser-compatible WebSocket **client**, but not a built-in WebSocket server.

Package state was checked from official project/npm sources on 2026-08-22:

| Option                              | Current evidence                                                                                         | Fit                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ws`                                | 8.21.3, MIT, zero dependencies, about 219M weekly npm downloads and 36K dependents; active 2026 releases | Direct RFC 6455 server that can attach to Node HTTP; browser clients use native `WebSocket`.                                |
| Socket.IO                           | 4.8.3, MIT, about 11.6M weekly npm downloads                                                             | Maintained and mainstream, but adds Engine.IO, long-polling fallback, its own event protocol, and a browser client package. |
| Hand-written upgrade/frame handling | Node built-ins only                                                                                      | Avoids a package but would make protocol parsing, fragmentation, close handling, and security maintenance application code. |

The `ws` project published a 2026 memory-exhaustion advisory for retained tiny
fragments; 8.21.0 and later are patched. This is a reason to depend directly on
a current release and configure limits, not to rely on an old transitive copy.

Sources:

- [`ws` npm package](https://www.npmjs.com/package/ws)
- [`ws` server documentation](https://github.com/websockets/ws/blob/master/doc/ws.md)
- [`ws` 2026 memory-exhaustion advisory](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p)
- [Socket.IO npm package](https://www.npmjs.com/package/socket.io)
- [Node HTTP/WebSocket documentation](https://nodejs.org/api/http.html)
- [OBS Browser Source documentation](https://obsproject.com/kb/browser-source)

## Decision

Use Node `http` plus `ws` 8.21.3 as a direct production dependency. Keep `ws`
in the Electron main process only; overlay pages use the browser's native
`WebSocket` implementation.

`electron/lib/outputServer.js` is a pure Node module with
`start()`/`stop()`/`getStatus()`/`publish()` methods. The main-process singleton
is owned by `electron/main/outputRuntime.js`; it closes before Electron quits.
Phase 1D will inject that singleton into output IPC handlers instead of creating
another server.

Runtime boundary:

- Bind only to `127.0.0.1`; never bind all interfaces.
- Use stable default port `17404`; allow an injected/configured port, with `0`
  reserved for tests.
- Allow only `GET /health`, `GET /api/v1/state`, WebSocket upgrade `/ws`, and
  the explicit `/overlay/{lyrics,now-playing,setlist}` HTML/CSS/JS asset map.
  There is no generic URL-to-filesystem static handler.
- Return no CORS opt-in headers and accept WebSocket upgrades only when `Origin`
  matches the runtime's exact `http://127.0.0.1:<port>` origin.
- Treat the channel as server-to-client only. Any client data closes the socket
  with policy code 1008.
- Disable per-message compression. Cap inbound messages at 4 KiB and cap both
  fragments and buffered chunks at 16.
- Ping every 30 seconds and terminate clients that miss a pong.
- Re-parse every published snapshot through the shared output contract and
  ignore duplicate or stale revisions.

Wire messages are deliberately small and versioned by their enclosed state:

```json
{ "type": "state.snapshot", "snapshot": {} }
```

```json
{ "type": "state.changed", "revision": 1, "snapshot": {} }
```

A full snapshot is sent after every connection. This makes OBS scene reloads
and later reconnect logic independent of missed incremental events.

## Consequences

The runtime remains easy to integration-test with real HTTP and WebSocket
clients and does not require Electron to test its protocol behavior. `ws` is
pure JavaScript in this use and resolves through normal Electron asar support,
so no `asarUnpack` rule or optional native `bufferutil`/`utf-8-validate` addon is
needed.

Socket.IO remains a valid future choice for a different product needing rooms,
acknowledgements, fallback transports, or heterogeneous SDKs. Those needs are
absent from the local read-only OBS state stream, so adopting its custom
protocol now would increase bundle and compatibility surface without solving a
current requirement.
