# Studio Library Workspace Prototype

This is an isolated visual-system prototype. It is not a renderer entry point and
does not import production Vue components, composables, Electron preload APIs, or
the active `tokens.css` contract.

Run the existing Vite development server:

```powershell
npm run dev
```

Then open:

```text
http://localhost:5173/prototypes/studio-library-workspace/
```

The Workspace Lab switches theme, density, motion, and static content state. Press
`H` to hide or restore it. Clean review URLs use query parameters, for example:

```text
?clean=1&theme=dark&density=standard&scenario=populated
?clean=1&theme=light&density=compact&motion=reduced&scenario=warning
```

## In-app development view

During `npm run dev`, press `F8` in the Utawakui window to open the merged
Visual System development view, then switch to its Studio Library tab. The real
Vue shell continues to own the titlebar, Sidebar, Setlist folder tab, and
PlayerBar; an isolated iframe supplies only the candidate dossier interior and
follows the active dark／light app theme. Production builds exclude this view
and its shortcut.

The iframe mode is also directly inspectable at:

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
node prototypes/studio-library-workspace/capture-app/run.js
```

The output stays under `prototypes/studio-library-workspace/screenshots/`. The
runner owns and removes its exact Electron process tree and temporary Chromium
profile after each run.
