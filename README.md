# Utawakui

An Electron desktop control panel for streamers/VTubers running karaoke ("歌回") streams on OBS. Import a playlist from Spotify or YT Music, download the matching audio, and play it back locally with per-track vocal separation for an adjustable guide vocal.

## Features (current)

- **Playlist import** — resolve a Spotify or YT Music playlist/video URL, download the matching audio via `yt-dlp`, with background metadata backfill (title/artist/duration)
- **Local playback** — play/pause, seek, volume, single-track repeat
- **Vocal separation & guide vocal** — per-track MDX-Net separation into a 4-channel instrumental+vocals mix; toggle the guide vocal on/off without re-decoding or drifting out of sync
- **Windows integration** — taskbar thumbar transport buttons, SMTC now-playing card (lock screen / volume flyout), window title reflects the current track
- **Keyboard shortcuts** — `M` mute, `G` guide vocal toggle, `↑`/`↓` volume

Pitch/tempo shifting and the OBS Browser Source overlay are planned but not yet built — see [docs/spec.md](docs/spec.md) for the full product spec and roadmap.

## Tech stack

Electron + Vite + Vue 3 (no vue-router/Pinia — four fixed tabs, one shared composable per concern). Audio downloading via `yt-dlp` (`youtube-dl-exec`), vocal separation via `onnxruntime-node` running an MDX-Net model in a worker thread.

## Getting started

Requires Node.js 18+.

```bash
npm install
npm run dev     # Vite dev server + Electron together
```

`npm install` also fetches the bundled `yt-dlp` binary (via `youtube-dl-exec`'s postinstall) — no separate install needed.

### Scripts

| Script               | What it does                                  |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Vite dev server + Electron, closes together   |
| `npm run build`      | Production build to `dist/`                   |
| `npm start`          | Build + run the packaged-style production app |
| `npm run lint`       | ESLint                                        |
| `npm run format`     | Prettier (write)                              |
| `npm run lint:md`    | markdownlint on all `.md` files               |
| `npm test`           | Vitest, single pass                           |
| `npm run test:watch` | Vitest, watch mode                            |

Committing runs `lint-staged` (ESLint/Prettier/markdownlint on staged files) via a pre-commit hook, and `commitlint` enforces [Conventional Commits](https://www.conventionalcommits.org/) on the commit message.

## Project structure

```text
electron/   Main process (window, IPC, protocol handler) + lib/ (pure, testable modules)
src/        Vue 3 renderer — views/, components/, composables/
public/     Vite static-passthrough (CSS tokens, icons) — copied byte-for-byte into dist/
docs/       Product spec and roadmap
```

See [CLAUDE.md](CLAUDE.md) for the full architecture writeup.
