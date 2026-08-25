# Manual Acceptance Checklist

Automated tests prove contracts but not the visible Electron／OBS experience. Use
this checklist before treating a release candidate as visually and operationally
accepted. Record version-specific outcomes in the release note or release review,
not by adding completed history here.

## Control Panel And Workbenches

- [ ] At normal and minimum window sizes, verify F9 component states and F10
      single／batch Music Analysis modes, independent pane scrolling, dependency
      preparation, progress, cancellation, recovery, and reconnect behavior.
- [ ] With a trusted M2 fixture, verify section order, localized roles, time ranges,
      confidence, timeline seeking, and correct M1 downgrade copy for incomplete or
      low-confidence partitions.
- [ ] Verify Output distinguishes renderer source syncing／unavailable／ready from
      Browser Source client connectivity.
- [ ] Verify each template exposes only its supported capture sizes and that the
      Workbench dimensions match the copied OBS guidance.
- [ ] Verify Settings capture geometry, dependency actions, diagnostics controls,
      version, and update status at normal and minimum sizes.

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
      including Now／Next, Art Card, Queue Board, and Cover Player fallbacks.
- [ ] When M1／M2 analysis is available, verify Lyrics cues without regressing M0,
      pause, seek, reconnect, or reduced-motion fallback.

## Packaged Windows

- [ ] Verify cold and warm installed launch, Self-View／Output lifecycle, and no
      orphan Electron or loopback process after closing.
- [ ] Verify updater current／available／download／offline／retry／restart states and
      explicit download/install actions.
- [ ] Verify installer paths, Start Menu and optional desktop shortcuts, AUMID／SMTC
      identity, launch, uninstall retention, cleanup opt-in, locked files, and UAC.
- [ ] Verify a dependency-free install still supports local import, library, and
      playback; then prepare, repair, and remove Provider, FFmpeg, and model units
      independently.

The release-level artifact and update matrix remains in the
[Windows release runbook](release-runbook.md).
