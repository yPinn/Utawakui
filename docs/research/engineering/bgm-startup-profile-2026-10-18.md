# BGM startup dependency measurement — 2026-10-18

## Scope and decision

Keep the module-scope `useBgmSession` controller and its startup initialization,
audio arbitration and live shell-status projection eager. Library browse and track
preview also consume this controller. Delaying it with the menu could postpone
restoration or the performance-player safety gate.

Defer the complete visual `BgmPlayerPanel.vue`, including current source, transport,
picker and bounded movement. The picker alone is approximately 2.1 KB of raw source;
a second lazy boundary inside the deferred panel would add an opening waterfall for
little benefit. Shared UI primitives remain reused. The lightweight `BgmPlayer.vue`
owns initialization and status while closed, and retains the panel instance after
first use to preserve search, pin and position. It never disposes the audio owner.

## Measurement

Before editing, built a production sourcemap baseline. Compared it with the final
sourcemap build and actual local asset requests from the real Electron entry point.
Both runs use current source, a visible main window and isolated fresh user-data
profiles containing two silent local WAV tracks. Each plan restores the first track
at 2 seconds with zero volume and mute enabled. Output auto-start and optional
update/analysis work are disabled equally. These are development-machine production
build measurements, not packaged, OS-cold or OBS audio-quality acceptance.

The scratch fixture and raw results are under ignored `tasks/bgm-matrix.mjs`,
`tasks/bgm-probe.cjs`, `tasks/bgm-before-final/` and `tasks/bgm-after-initial/`.
Each measurement includes three independent profiles. First-open timing measures
trigger activation through panel appearance and two animation frames. Picker timing
measures trigger activation through search input appearance. Renderer readiness plus
150 ms precedes opening; these timings do not measure whole-App startup.

| Metric                               | Before            | After             |
| ------------------------------------ | ----------------- | ----------------- |
| Initial requested JS bytes           | 748,981           | 735,860           |
| Initial requested CSS bytes          | 253,337           | 247,364           |
| First panel open, three runs (ms)    | 214 / 327 / 311   | 249 / 223 / 169   |
| Picker open, three runs (ms)         | 5.1 / 7.1 / 6.4   | 2.5 / 2.8 / 2.5   |
| Startup BGM plan reads per run       | 1                 | 1                 |
| Total BGM plan reads after reopening | 1                 | 1                 |
| Restored track / position            | Quiet Room / 0:02 | Quiet Room / 0:02 |

Total initial local JS/CSS decreases by 19,094 bytes (about 1.9%). Chunk ownership
changes, so the main chunk alone grows; adding every initially requested chunk is
necessary for this comparison. Source maps confirm controller code stays eager,
while BGM source/picker/transport and movement leave the entry graph. The final
panel chunk is about 13.9 KB JS plus 6.0 KB CSS, with a small shared icon chunk.
All three are requested only after the first BGM opening. Assets, sourcemap content
and compression are not included in these JS/CSS byte totals. No full startup-time
speedup is established by this small, sequential sample.

## Behavior verification

The same real-App flow verifies startup restoration before opening, pin and search
preservation across closing, track replacement, silent playback, closed-panel
Titlebar playing status, reopening and pause. A further three-profile run adds
keyboard movement/position preservation and focus return to the Titlebar trigger;
all pass with one BGM plan read each. Playback is checked through the real controller
and UI state using silent PCM, without a listening-quality claim.

The component lifecycle regression separately holds the asynchronous panel import
pending, closes before resolution, and checks that no surface appears afterward.
It also verifies initialization before any panel load, live/error status while
closed, one retained panel instance, root id/class forwarding and close events.
Existing visual, transport, standby-plan and handoff tests remain in force.
No configuration schema, main/preload behavior or packaging input changes.

Final verification: 803 test files pass, with 7,782 passing tests and one existing
skip. ESLint, Markdown lint (121 files), formatting and production build pass.
The existing large-chunk build warning remains. Read-only code review found no
actionable issue.
