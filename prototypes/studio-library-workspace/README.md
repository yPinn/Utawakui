# Studio Library Workspace Prototype

This is a historical, isolated visual-system reference. It is not a production
renderer entry point and does not import production Vue components, composables,
or Electron preload APIs. It does load the shared `src/styles/tokens.css`, so it
remains covered by the token and viewport boundary tests.

For standalone inspection, start a Vite server without starting the desktop app:

```powershell
npm exec -- vite --host 127.0.0.1 --port 5174 --strictPort
```

Then open:

```text
http://127.0.0.1:5174/prototypes/studio-library-workspace/
```

The Workspace Lab switches theme, density, motion, and static content state. Press
`H` to hide or restore it. Clean review URLs use query parameters, for example:

```text
?clean=1&theme=dark&density=standard&scenario=populated
?clean=1&theme=light&density=compact&motion=reduced&scenario=warning
```

## Historical embed mode

The former Studio Library tab in the app's F8 view was removed after production
adoption. F8 now opens the component catalogue; it does not mount this prototype.
The standalone prototype retains its historical embed query for reference:

```text
?embed=dossier&clean=1&theme=dark&density=standard&scenario=populated
```

## Interaction contract

- A single track click selects; double-click or Enter starts a new playback
  context from the authored collection order.
- Search, readiness filtering, and display sorting do not replace that playback
  context.
- Manual queue entries have unique identities, may contain the same track more
  than once, and play before the source's next track. Starting a new collection
  context clears the previous manual queue.
- Repeat cycles through off, context, and track. Sequence playback stops at the
  source end; it does not autoplay or wrap without context repeat.
- Previous restarts the current track after three elapsed seconds; near the start,
  it returns through playback history.
- The Sidebar has an explicit persisted rail／expanded mode. Expanded width is
  adjustable without a hidden resistance zone.

Generate the four reference screenshots through the cleanup-safe capture runner:

```powershell
node prototypes/capture.cjs studio-library-workspace
```

The output stays under `prototypes/studio-library-workspace/screenshots/`. The
runner owns and removes its exact Electron process tree and temporary Chromium
profile after each run. It also produces a separate Ink-framed Paper review image
under `screenshots/review/`; the four root images are the original committed
reference set. Captures refresh reference images, not production acceptance.

The interactions above describe this prototype's simulated state only. Current
product behavior belongs to the [specification](../../docs/spec.md), not this
historical demo. See the [prototype index](../README.md) for the current component
lab and shared capture entry.
