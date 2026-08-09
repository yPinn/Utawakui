---
name: run-electron
description: Launch and verify the Utawakui Electron app in this repo's dev sandbox. Use when asked to run, start, or verify the desktop app in an agent/CI sandbox environment.
---

Utawakui's control panel is Vite + Vue 3, loaded by Electron. The normal
human dev loop is `npm run dev` (runs Vite and Electron concurrently via
`concurrently -k`, so closing the Electron window also kills the Vite dev
server — no orphaned dev server left running).

## Sandbox gotchas (hit and fixed in this repo, not hypothetical)

**`ELECTRON_RUN_AS_NODE=1` is set by default in this agent sandbox.** With it
set, `require('electron')` inside `electron/main.js` returns only the path
to `electron.exe` (a string) instead of the Electron API — `app` comes back
`undefined` and `main.js` throws on the first Electron API call. This is a
real, documented Electron behavior (it's how apps detect they're running
under plain Node vs. the Electron binary), not a bug in this repo's code.

Workaround: unset it for the launch command only —

```bash
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe . --dev
```

**Electron spawns a process tree (main + renderer + GPU + network), and a
`timeout`-wrapped launch often only kills the direct child**, leaving
orphaned `electron.exe` processes running after the test ends. Check and
clean up:

```bash
tasklist //FI "IMAGENAME eq electron.exe"
taskkill //F //IM electron.exe //T
```

Launching via `bash -c '... &'` and killing `$!` is **not equivalent** to
the above — `$!` is the PID of a wrapper/shell process, not `electron.exe`
itself, so `kill $!` can report success while the real `electron.exe` tree
keeps running. Always verify with `tasklist` after, not just trust that the
kill command didn't error.

**Leftover `electron.exe` processes break `npm test` on this repo, not just
"waste resources."** They hold a lock on `node_modules/.vite`, and a stale
lock there makes the next `vitest run` fail every test file identically
with `TypeError: Cannot read properties of undefined (reading 'config')` —
a cryptic error that looks like a real test-infra bug but isn't one. If you
hit this: `taskkill //F //IM electron.exe //T`, confirm the `tasklist` is
empty, then `rm -rf node_modules/.vite` and retry. Don't chase this as an
app bug or a "flaky test" — check for orphaned `electron.exe` first.

**This sandbox has no way to see the actual GUI window** (no screenshot/driver
tooling wired up here, unlike the bundled `run` skill's xvfb+Playwright
pattern for headless Linux — this is Windows with a real desktop, so xvfb
doesn't apply, and a Playwright `_electron` driver hasn't been built for this
repo). The practical verification ceiling from an agent session is:

1. `node --check <file>` — syntax only.
2. Launch with `ELECTRON_RUN_AS_NODE` unset per above, confirm no JS stack
   trace before the process is killed (a clean launch produces only Chromium
   noise like `GPU process exited unexpectedly` / network service restarts —
   that's sandbox-related, not an app bug).
3. Clean up any orphaned `electron.exe` afterward.

**Actual visual verification (no white flash, correct window icon, DevTools
opening, HMR updating the window) requires the user to run `npm run dev`
themselves in a real terminal and look at it.** Say so explicitly rather than
claiming a launch-without-crash result proves the UI is correct.

## Dev server details

- Vite dev server is pinned to port 5173 (`strictPort: true` in
  `vite.config.js`) — if something else is already on 5173, Vite fails
  loudly instead of silently picking another port that `electron/main.js`'s
  hardcoded `loadURL('http://localhost:5173')` wouldn't know about.
- Production path: `npm run build && npm start` — builds to `dist/` (already
  gitignored) and loads `dist/index.html` via `loadFile`, not the dev server.
