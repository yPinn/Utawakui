# Music Analysis Contract

## Status and scope

Draft planning contract, 2026-08-23. It defines the optional local analysis
boundary needed for Lyrics presentations that react to rhythm and structural
sections. No analyzer package, environment, model, sidecar, or Output projection
described here is implemented today.

The accepted product endpoint is:

- T2 word/phrase lyrics can display progressive text;
- M1 beat/downbeat timing can drive bounded rhythmic presentation changes; and
- M2 section intervals can select reusable verse, chorus, bridge, intro, outro,
  or unknown visual variants.

T2 remains the first implementation milestone and works through imported or
manual timing without Music Analysis. Automatic music analysis is an optional,
removable capability and failure never blocks Lyrics editing or playback.

## Signal boundaries

The contract keeps these values distinct:

- estimated source BPM;
- beat timestamps;
- downbeat timestamps and inferred bar position;
- section intervals and canonical section role;
- confidence and analyzer provenance;
- user-authored BPM, beat anchor, meter, or section overrides; and
- player tempo/playback rate.

Changing player tempo does not rewrite analyzed source BPM. Runtime presentation
maps source-time cues through the canonical playback clock and rate.

Music structure analysis does not create word timing. T2 word/phrase alignment
continues to come from imported timing, manual authoring, or a separately
approved alignment provider. A future alignment job may reuse already-authorized
vocals, but Lyrics does not silently start source separation.

## Storage and identity

The target derived sidecar is:

```text
tracks/<trackId>/analysis/music-structure.json
```

It is atomically written, versioned, and linked to a SHA-256 fingerprint of the
source audio. Analyzer id, profile id, environment lock, model ids, completion
time, and confidence are provenance rather than executable input. A changed or
missing source preserves the sidecar but marks it stale or unavailable; stale
cues are never silently applied to different audio.

Illustrative planning shape:

```json
{
  "schemaVersion": 1,
  "source": {
    "sha256": "<lowercase hex digest>"
  },
  "analyzer": {
    "id": "all-in-one-structure",
    "profileId": "all-in-one-cpu-v1",
    "environmentLock": "<sha256>",
    "modelIds": ["<model id>"],
    "completedAt": "2026-08-23T00:00:00.000Z"
  },
  "tempo": {
    "bpm": 128.0,
    "confidence": 0.82
  },
  "beats": [{ "timeMs": 500, "positionInBar": 1, "confidence": 0.9 }],
  "sections": [
    {
      "sectionId": "section_01",
      "startMs": 0,
      "endMs": 15400,
      "role": "intro",
      "rawLabel": "<bounded analyzer label>",
      "confidence": 0.76
    }
  ]
}
```

Field names remain planning examples until an executable schema and fixtures are
accepted.

## Canonical section roles

Templates consume an app-owned allowlist such as `intro`, `verse`, `pre-chorus`,
`chorus`, `bridge`, `instrumental`, `outro`, and `unknown`. Raw analyzer labels
remain bounded provenance and never become CSS classes, template ids, commands,
or trusted selectors.

Low-confidence or unknown sections use the template's normal fallback. The
application must support user correction without overwriting the analyzer result;
manual overrides are a separate authored layer so analysis can be regenerated.

## Analyzer and runtime selection

All-In-One Infer is the first full structure-analysis candidate because one
pipeline can provide BPM, beat/downbeat, and section evidence needed by M1/M2.
It is not yet a released dependency. Acceptance requires the immutable
`analysis-structure` and `combined-ml` paths from
[ADR 0014](adr/0014-audio-python-runtime-family.md), real packaged Windows CPU
smokes, fixed fixtures, cancellation, offline model loading, capacity disclosure,
and license approval. The current package code is MIT, while the upstream
Harmonix checkpoint manifest declares CC-BY-NC-SA-4.0; those terms are reviewed
as separate artifacts before any distribution or product enablement.

Lightweight libraries may still be used for tap/manual assistance or a bounded
fallback, but the product does not install multiple analyzers merely because the
Python environment already exists. Every added dependency needs a consumer,
measured benefit, replaceable analyzer interface, and removal path.

All-In-One's internal four-stem Demucs output is analysis intermediate data. It
does not replace ADR 0009's Refined RoFormer route and is deleted with the job.

## Decode and execution

Main derives one source fingerprint and requests a versioned FFmpeg decode
profile through the shared Audio Python runtime family. The heavy-job scheduler
owns queueing and defaults ML concurrency to one. The analysis worker receives
only app-derived absolute paths, selected profile/model ids, and bounded
operation input; renderer and templates cannot start downloads or select Python
arguments.

Analysis progress, cancellation, error normalization, app shutdown, job cleanup,
repair, and rollback follow ADR 0014. Successful analysis publishes the sidecar
only after validation and atomic replacement. Failure leaves any previous valid
sidecar intact.

## Validation invariants

- Times are finite non-negative integer milliseconds and remain within source
  duration subject to one documented tolerance.
- Beats and sections are monotonic; section intervals do not overlap unless a
  later schema explicitly models hierarchy.
- BPM and confidence have bounded numeric ranges; missing confidence is not
  interpreted as certainty.
- Section roles come only from the canonical allowlist; unknown raw labels map to
  `unknown`.
- Array counts and document size are bounded in main before renderer or Output
  projection.
- Unknown schema or analyzer profile versions fail closed and are not rewritten
  by older applications.
- Provenance, raw labels, and model metadata never grant code execution or path
  access.

## Lyrics and Output consumption

Lyrics owns the user's timing and correction workflow. Music Analysis supplies
optional cues through an app-owned interface. Presentation packs declare which
signals they can consume and always provide M0/T2 fallbacks.

The future Output document may project a bounded immutable cue document keyed by
source revision. Dynamic snapshots continue to carry only canonical playback
state and references; they do not resend the complete beat grid or section list
on every tick. Templates interpolate against the canonical clock and stop during
pause, buffering, seek, end, unavailable, or disconnect states.

## Rollout order

1. Implement and verify T0/T1 normalization plus T2 import/manual editing.
2. Accept the executable music-analysis schema, fixtures, and one segment-aware
   visual recipe with an M0 fallback.
3. Generalize Stage A into `AudioPythonRuntimeHost`; do not install into the
   provisional community environment.
4. Resolve and package-smoke `analysis-structure`; resolve `combined-ml` only
   when Refined and analysis are both requested.
5. Benchmark BPM, beat/downbeat, and section utility against fixed songs and
   record false/low-confidence behavior.
6. Enable the optional analysis capability only after model license, capacity,
   offline, repair/removal, and real presentation acceptance gates pass.
7. Evaluate automatic word/syllable alignment separately; do not treat music
   structure inference as lyric alignment.

## Deferred decisions

- automatic word/syllable alignment provider and confidence UX;
- exact canonical section-role set and manual correction UI;
- meter changes and hierarchical or overlapping song sections;
- compatibility window and message name for Output cue documents;
- whether decoded-audio cache reuse justifies retained disk space; and
- GPU acceleration, which remains separate from the CPU-completable product
  path.

## Related decisions

- [ADR 0009: Tiered audio-processing recipes](adr/0009-tiered-audio-processing-runtime.md)
- [ADR 0010: Lyrics timing granularity](adr/0010-lyrics-timing-granularity-and-output-content-split.md)
- [ADR 0014: Audio Python Runtime Family](adr/0014-audio-python-runtime-family.md)
- [Lyrics timing contract](lyrics-timing-contract.md)
