# Manual Acceptance Checklist

Automated tests prove contracts but not the visible Electron／OBS experience. Use
this checklist before treating a release candidate as visually and operationally
accepted. Record version-specific outcomes in the release note or release review,
not by adding completed history here.

## Control Panel And Workbenches

- [ ] At normal and minimum window sizes, verify the Visual System workbench's
      (F8, Demo sub-mode) component states and F5 single／batch Music Analysis
      modes, independent pane scrolling, dependency preparation, progress,
      cancellation, recovery, and reconnect behavior.
- [ ] With a trusted M2 fixture, verify section order, localized roles, time ranges,
      confidence, timeline seeking, and correct M1 downgrade copy for incomplete or
      low-confidence partitions.
- [ ] Verify Output distinguishes renderer source syncing／unavailable／ready from
      Browser Source client connectivity.
- [ ] Verify each template exposes only its supported capture sizes and that the
      Workbench dimensions match the copied OBS guidance.
- [ ] Verify Settings capture geometry, dependency actions, diagnostics controls,
      version, and update status at normal and minimum sizes.
- [ ] Run the audible metronome against an independent metronome for 2–3 minutes;
      verify the accented downbeat, no drift, no glitch on BPM change, standalone
      use without a loaded track, confident track-BPM application, and manual
      override until reset.
- [ ] Verify titlebar CPU／RAM reflects Utawakui rather than whole-system usage,
      remains inexpensive while idle, and includes separation descendants during
      a heavy job without leaving a PowerShell process behind.

The 30-song M2 corpus, independent annotation, privacy fields, and activation
thresholds belong to the
[Music Analysis M2 quality gate](../contracts/music-analysis-m2-quality-gate.md),
not this UI checklist.

## Lyrics And Presentation

- [ ] Repeat the accepted LRCLIB flow with a legitimately held matching track:
      search, save, reload, segment edit, playback, pause, and seek. The prior live
      evidence is recorded in
      [LRCLIB T2 validation](../research/lrclib-t2-live-validation-2026-08-24.md).
- [ ] Verify Lyrics Overlay T0／T1／T2 wrapping and progress through pause, seek,
      track change, reconnect, reduced motion, and missing-content fallback.
- [ ] Verify Live Stage preserves the fixed lower-left typography and title-card
      window while long CJK／Latin／Korean captions page deterministically.
- [ ] Verify Manga one-, two-, and three-bubble ordering, side lanes, center
      performer exclusion, frame/text separation, tails, parenthetical aside styling,
      sequential transitions, and cross-bubble T2 timing.
- [ ] Confirm checker／dark／light inspection backdrops and the performer guide stay
      Workbench-only; copied OBS routes remain transparent and contain neither query.

## Output And OBS

- [ ] Verify gated auto-start, the four compatibility URLs, initial snapshot,
      reconnect, client count, port conflict recovery, artwork fallback, and URL
      updates in a real OBS Browser Source.
- [ ] Verify widget surfaces fill their Small／Medium／Large canvas as authored,
      including Now／Next, Art Card, Simple Black B, and Cover Player fallbacks.
- [ ] When M1／M2 analysis is available, verify Lyrics cues without regressing M0,
      pause, seek, reconnect, or reduced-motion fallback.
- [ ] Enable the OBS integration against an authenticated OBS WebSocket 5 instance;
      verify disabled／connecting／ready／degraded states, strict host／port／
      threshold validation, live／recording clocks, prevent-sleep start／stop, and
      that no scene or source is changed.
- [ ] Point the OBS integration at an unreachable or deliberately stalled endpoint;
      verify connecting settles within the 10-second handshake deadline, a stalled
      status read settles within 5 seconds, the failed socket is closed, and bounded
      reconnect continues without a stale status overwrite.
- [ ] Save an authenticated OBS password, restart the packaged app, disable the
      connection and feature gate, then use the still-available explicit removal
      action. Confirm the stored-password indicator clears only after success and
      that an empty password is not treated as implicit deletion.
- [ ] During an active stream or recording, change tracks, add a manual marker,
      exercise the short-play skip threshold, then export YouTube chapters. Confirm
      the local session survives OBS stop, contains no credential, and uses the
      correct stream／record timecode.

## Spout2

- [ ] On Windows x64, explicitly start the experimental sender and confirm a
      compatible receiver lists exactly `Utawakui.Lyrics` at 1920×1080 and the
      selected 30／60 FPS profile.
- [ ] Verify the full sender／receiver／downstream chain with real Lyrics playback,
      pause, seek, track change, and Output restart.
- [ ] Inspect checker／dark／light backgrounds for transparent edges, premultiplied
      alpha halos, channel order, color shift, vertical orientation, and frame size.
- [ ] Exercise same-GPU and available cross-GPU paths, receiver restart, helper crash,
      display/GPU reset, sender-name collision, and repeated start／stop recovery.
- [ ] Compare idle and active CPU／GPU／memory against the Browser Source baseline;
      confirm closing Utawakui leaves no helper process or named sender.

## Packaged Windows

- [ ] Verify cold and warm installed launch, Self-View／Output lifecycle, and no
      orphan Electron or loopback process after closing.
- [ ] With the default `ask` behavior, press X repeatedly and verify only one app-
      styled modal appears with background, full exit, cancel, and an unchecked
      remember choice. If another app modal is already open, Escape must dismiss only
      the close modal. Cancel must keep the same window visible. Choosing background without
      remembering must hide the existing window while playback, SMTC, OBS status,
      Browser Source／Spout Output and heavy jobs continue; restoring it must make the
      next X ask again. Verify minimize still uses the taskbar.
- [ ] Repeat the prompt with remember enabled for both background and full exit.
      Restart after each choice and verify it no longer asks. In Settings, switch
      among ask／tray／quit, verify each takes effect immediately, and return to ask.
      Restore the same hidden window through tray open, tray double-click, and a
      second app launch. Use the tray Settings action and verify it restores the
      existing window directly on Settings.
- [ ] During early startup and with a deliberately unresponsive Renderer, press X and
      verify the bounded Windows native fallback still offers background, full exit,
      cancel, and remember without accepting a stale app-modal response afterward.
- [ ] Inspect the tray icon at 100%／125%／150%／200% DPI in light and dark Windows
      themes. From a hidden window, verify tray exit releases Output ports,
      sockets, helpers and sleep blockers; also verify update installation and
      Windows shutdown／logoff are not intercepted as background hiding.
- [ ] Verify updater current／available／download／offline／retry／restart states and
      explicit download/install actions, that the download row shows rate and
      remaining time, and that the Settings navigation tab shows the update dot
      from `available` until install.
- [ ] Verify the "自動檢查更新" toggle: off stops the startup check and the
      background recheck while the manual check still works; on resumes both.
- [ ] Verify installer paths, Start Menu and optional desktop shortcuts, AUMID／SMTC
      identity, launch, uninstall retention, cleanup opt-in, locked files, and UAC.
- [ ] Verify a dependency-free install still supports local import, library, and
      playback; then prepare, repair, and remove Provider, FFmpeg, and model units
      independently.

The release-level artifact and update matrix remains in the
[Windows release runbook](release-runbook.md). Record consecutive-version results
with the [update acceptance evidence template](update-acceptance-template.md).
