# LRCLIB T2 Live Validation — 2026-08-24

## Scope

Validated real LRCLIB data through the existing acquisition and save flow. No
parser, alignment, Segment-Aware presentation, or application source files were
changed. The save target was an isolated validation track directory, not the
user's media library.

## Search result

- Selected query: `A Drowning Cry` / `acloudyskye`
- LRCLIB record id: `2304913`
- Identity result: `exact`
- Parser status: `ok`
- Capability: `T2`, `partial: false`
- Compatibility: `t0: true`, `t1: true`, `t2: true`
- Parser issues: none
- Warnings: none
- Validated content: 15 timed lines and 71 segments
- Preview/provider fingerprint:
  `876cab86c8c6abc9b49072d526aeeb788c53e767f607b6312dabb7d02d470b65`

The search used `createLyricsAcquisitionService().searchCandidates()`. Saving
used the same service's `saveCandidate()`, which re-fetched record `2304913`
and rejected publication if the preview fingerprint had changed.

## Important downgrade evidence

The discovery pass also proved why Lyricsfile presence is not T2 evidence:

- `Diffuse` / `acloudyskye`, record `36497565`, contains 34 non-empty lines
  with words and 190 raw word entries, but also three empty line cues. The
  current parser returns `semantic-error` with `invalid-line-text`; the normal
  candidate projection therefore safely reports T1 from `syncedLyrics`,
  `compatibility.t2: false`, `segmentCount: 0`, and
  `invalid-lyricsfile-fallback`.
- The other discovery queries returned only T0/T1 candidates. Their common
  downgrade was the same invalid Lyricsfile fallback or the absence of words;
  none was counted as T2 from `syncedLyrics` or ordinary line-timed LRC.
- Queries exercised before the accepted record included `Bad Apple!!`,
  `夜に駆ける`, `アイドル`, `Tell Your World`, `KING`, `うっせぇわ`,
  `神っぽいな`, `Rolling Girl`, `Die With A Smile`, `APT.`,
  `BIRDS OF A FEATHER`, `Espresso`, `Beautiful Things`, `Blinding Lights`,
  `Shape of You`, `Never Gonna Give You Up`, `Gurenge`, `KICK BACK`,
  `Kaikai Kitan`, `The Vampire`, `Rabbit Hole`, `Mesmerizer`, `Diffuse`,
  `Bloom`, `Surface`, `Thief!`, `Vanishing Point`, and `Safety!`.

## Saved artifacts and read-only verification

Validation used an isolated ignored task fixture, removed after this evidence was
recorded. No user library path or media file is retained in the repository.

- Provider artifact:
  `lyrics/providers/lrclib-2304913.json`
  - schema version 1, provider and record id matched;
  - stored record hash passed `loadStoredLrclibArtifactSummary()`;
  - a fresh provider search returned the same fingerprint;
  - artifact capability and compatibility remained full T2.
- Compatible source:
  `lyrics/lrclib-2304913.lrc`
  - 15 parsed LRC lines;
  - SHA-256
    `bb8b29da36ba4698e13b9c875b6e7a5267d01978556e9cf0e56013a29b992534`;
  - the hash matched the timing document's source fingerprint.
- Manifest:
  `lyrics/lyrics.json`
  - version 8, checked, no scan needed, state `available`;
  - one LRCLIB source linked to record `2304913` and artifact
    `lrclib-2304913.json`.
- Timing sidecar:
  `lyrics/timing/lrclib-2304913.lrc.json`
  - load status `current`, schema version 1, profile `lyrics-source-v1`;
  - document id `lrclib:2304913`, granularity `T2`;
  - 15 lines, 71 segments, 4–9 segments per line;
  - every line had segments and the source filename/hash matched.

## Diagnostics and tests

- Persistent diagnostics baseline: 12 recent events.
- After search, re-fetch, save, fresh search, and read-back: 12 events.
- New warning/error events: 0.
- Targeted Vitest verification: 10 files passed, 136 tests passed.

## Real Electron UI acceptance for the user

1. Import or select a legitimately held audio track matching
   `A Drowning Cry` by `acloudyskye`; do not attach this source to an unrelated
   track merely to exercise the UI.
2. Open Lyrics, open the source manager, then open LRCLIB search. Confirm the
   initial query or enter the title and artist above and search explicitly.
3. Choose the exact candidate for album `A Place Where Mountains Hide` and save
   it. Confirm the candidate reports word-level synchronization and the saved
   state without exposing internal T-level terminology in the default UI.
4. Return to the Lyrics reader, play and seek through several lines, and open a
   line's segment editor. Confirm word/phrase boundaries are present and that
   pause and seek preserve the correct active segment.
5. In Output Workbench, use the real Lyrics capture route. Verify wrapping,
   segment progress, pause, seek, reconnect, and reduced-motion behavior.
6. Add the copied clean URL to a real OBS Browser Source and repeat the same
   checks, including transparency. Record this as human visual acceptance only
   after observing the live Electron/OBS surfaces.
