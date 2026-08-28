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

Generate the four reference screenshots through the cleanup-safe capture runner:

```powershell
node prototypes/studio-library-workspace/capture-app/run.js
```

The output stays under `prototypes/studio-library-workspace/screenshots/`. The
runner owns and removes its exact Electron process tree and temporary Chromium
profile after each run.
