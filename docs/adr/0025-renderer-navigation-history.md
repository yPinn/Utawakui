# ADR 0025: Renderer navigation history

## Status

Accepted and implemented (2026-10-16): the history model, Settings return, and the
mouse side-button, `Alt+←／→`, browser-key and Windows app-command inputs.

## Context

Utawakui is a single-window control panel that behaves like a browser: the operator
moves between destinations, library collections, albums and artists, and expects
the side mouse buttons and `Alt+←／→` to retrace those steps. The renderer has no
history today. [ADR 0023](0023-renderer-destination-and-workspace-model.md) defines
destinations and workspaces and rejects Vue Router, and `useAppView` only remembers
the single `returnView` that Settings needs. Album, artist and queue-source jumps
leave no way back.

## Decision

The renderer keeps a self-managed history stack in a module-scope composable. It
does not use `window.history` or Vue Router.

### What a location is

A history entry is a navigation **location**, never application state:

| Part                 | Recorded when                                   | Source         |
| -------------------- | ----------------------------------------------- | -------------- |
| Destination          | `library`, `performance`, `display`, `settings` | `useAppView`   |
| Library workspace    | destination is `library`                        | `useAppView`   |
| Library selection    | destination is `library`                        | `usePlaylists` |
| Settings return view | destination is `settings`                       | `useAppView`   |

The library selection is one of: a playlist or source-backed album id, a derived
artist id, a metadata-derived album reference, or the all／local library view.

Not recorded: playback, queue, Right Dock, modals and menus, row selection, search
text, sort, column preferences, the Performance tool (`session`／`live-lyrics`),
`settingsSection`, and the development-only internal workbenches. Switching a
Performance tool is an operator instrument change during a live session, so a
misplaced side-button press must not move the operator away from it.

### Recording rules

- A location that differs from the current entry is pushed and discards the forward
  stack. The same location is never pushed twice, so re-selecting the active
  destination does not add an entry.
- Changes made in the same task tick are one entry: a navigation that selects a
  collection and switches destination records the final location only.
- Moving through history restores the saved location without recording it.
- When the current entry's playlist no longer exists, the entry is replaced by the
  location the app fell back to rather than pushing a new one. Adjacent identical
  entries collapse.
- Entering an unrecorded destination leaves the stack untouched. Returning from it
  to the recorded location adds nothing.
- Capacity is 50 entries; the oldest is dropped first. History is not persisted
  across restarts.

### Traversal

`back()` and `forward()` skip entries whose playlist was deleted and report whether
a move happened. Artist and album-reference entries are not validated: a vanished
target renders the page's empty state. Settings' 「返回」 control traverses back
when the previous entry is not Settings, and otherwise falls back to
`returnFromSettings()`, so its public contract is unchanged.

### Inputs

Inputs are bound through the [input bindings contract](../contracts/input-bindings.md):
mouse side buttons (button 3／4, on release), `Alt+←／→`, the `BrowserBack`／
`BrowserForward` keys, and the Windows `browser-backward`／`browser-forward` app
commands that Main forwards to the renderer as fixed `back`／`forward` intents. The
app targets Windows only, so no `Cmd+[／]` binding exists.

All sources end in one `requestHistoryTraversal`. A transient overlay that is open
suppresses traversal; dismissing it stays Escape's job. Because Windows can deliver
one physical click or key both as a DOM event and as an app command, requests in the
same direction within 60 ms count once. Key auto-repeat does not traverse.

## Consequences

- Album, artist, playlist and Settings navigation become retraceable without a
  router, and the stack is pure logic that is cheap to test.
- A new ownership dependency exists: the history composable reads `useAppView` and
  `usePlaylists`, the same pair `useAlbumNavigation` already combines. `useAppView`
  gains a restore entry point that does not bump the root-entry revision or touch
  the Performance tool.
- Artist identity merges that change an artist id push a new entry; the old artist
  entry is kept and renders an empty page if visited.
- Scroll restoration, a visible back／forward control and cross-restart persistence
  are deferred; none changes the model above.

## Rejected alternatives

- `window.history` with `pushState`: the location has no meaningful URL, state
  would need serialization, and behavior would depend on how the packaged app is
  loaded.
- Vue Router: rejected by ADR 0023; the view-switching model remains adequate.
- Recording every state change: search text, sort and row selection are not places
  and would make a side button feel unpredictable.
- Recording Performance tool switches: risks navigating away from live lyrics in
  the middle of a performance.
