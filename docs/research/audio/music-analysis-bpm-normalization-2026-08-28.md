# Music Analysis BPM Normalization Study

Date: 2026-08-28

## Outcome

Do not add automatic half／double-time normalization to the current Beat This!
profile. The available beat logits, downbeat logits, downbeat spacing, and a cheap
independent amplitude-onset signal do not separate reference half-time cases from
genuine slow-tempo matches. BPM-only thresholds can improve the observed corpus
only by encoding narrow, corpus-specific ranges and are rejected.

The supported estimator change is narrower: the global median window changes
from 32 beats to 4 beats, while the model and minimal postprocessor stay fixed
and the result is never multiplied or divided. After holdout review, the owner
approved production promotion on 2026-08-28 as
`beat-this-small0-cpu-v3`／`beat-this-final0-cpu-v3`.

## Method

The tuning evidence contains 36 previously reviewed local songs across Ado／IVE,
Yuuri, and Jay Chou blocks. Because these cases had already been inspected, they
were treated only as tuning evidence. Parameters and the no-octave-normalization
decision were frozen before evaluating the 13-track studio album `15` by tuki. as
an untouched holdout.

Reference BPM uses a four-percent direct tolerance. Half／double-time predictions
remain errors, while octave-equivalent rate is retained as a diagnostic. No
candidate uses title, artist, album, genre, local id, path, source metadata, or a
reference value.

The diagnostic probe reduced inference tensors to bounded aggregates:

- beat support at selected beats, interval dispersion, and alternating parity;
- beat-logit support at candidate midpoints versus off-grid flanks;
- downbeat parity, count, and spacing in detected-beat units; and
- audio amplitude-onset support at selected beats and midpoints.

## Metrical-level finding

Half-time reference cases did not contain missed midpoint peaks in Beat This!
logits. Their median midpoint probabilities were generally near zero, just like
correct slow songs. Downbeats occurred about every four detected beats in both
groups. Strong downbeat parity and audio midpoint onsets also appeared in both
groups.

Examples at nearly identical estimated tempos demonstrate the ambiguity:

- `88.97 BPM` is both a correct slow-song estimate and a half-time estimate for a
  different song;
- correct `72.51 BPM` and half-time `71.11 BPM` both have a stable four-beat
  downbeat grid; and
- correct `82.47 BPM` and half-time `80.88 BPM` both have strong midpoint audio
  activity.

The analyzer is therefore expressing a musically coherent pulse while reviewed
catalog sources sometimes choose the octave above. No deterministic rule from the
current evidence can choose that convention without false corrections.

## Estimator comparison

The current estimator takes the median of average intervals spanning 32 beats.
That reduces 20 ms frame-grid quantization but can smear tempo across missing or
extra beat regions. The candidate takes the same median over four-beat average
intervals. Four beats still bound frame quantization well while tracking the modal
local tempo.

| Evidence          | Estimator | Direct | Octave-equivalent | Unrelated | Failures |
| ----------------- | --------- | -----: | ----------------: | --------: | -------: |
| Tuning, 36 songs  | 32 beats  | 17／36 |            30／36 |     6／36 |        0 |
| Tuning, 36 songs  | 4 beats   | 20／36 |            36／36 |     0／36 |        0 |
| Holdout, 13 songs | 32 beats  | 10／13 |            12／13 |     1／13 |        0 |
| Holdout, 13 songs | 4 beats   | 11／13 |            13／13 |     0／13 |        0 |

All 17 existing tuning direct matches and all 10 existing holdout direct matches
remain direct. The tuning improvements convert six unrelated errors into three
direct and three octave-equivalent results. On holdout, `地獄恋文` moves from an
unrelated `173.91 BPM` estimate to a direct `184.62 BPM` estimate against the
locked `185 BPM` reference.

The estimator adds no inference stage and reduces each interval span, so its
runtime overhead is effectively zero. It does not solve the remaining metrical
convention errors: tuning direct rate improves by 8.34 percentage points, below
the predeclared 15-point automatic-normalization target.

## Holdout reference lock

Album identity and order were checked against Apple Music, Qobuz, and MusicBrainz.
Track-specific Japanese chord charts were preferred when SongData's album table
repeated an implausible `185 BPM` across unrelated tracks. Metrical disputes such
as `148／73`, `184／92`, and `92／184` were recorded before local sidecars were read.

Sources:

- <https://music.apple.com/us/album/15/1781833057>
- <https://www.qobuz.com/us-en/album/15-tuki/hjguew506t1ca>
- <https://musicbrainz.org/release/ea4f6a4d-9d39-4049-8e3f-2bc8274eb30e>
- <https://songdata.io/album/2KWmZgT2rfPaTHfr0QQKfD/15-by-tuki>
- <https://ja.chordwiki.org/>
- <https://songbpm.com/>
- <https://keytube.net/>

## Promotion decision

The approved production change:

1. change only Beat This! global estimation from 32 to 4 beat windows;
2. bump both small0 and dormant final0 estimator profile ids from `cpu-v2` to
   `cpu-v3`, preserving model identity and the minimal postprocessor;
3. keep half／double-time values untouched and continue reporting beat evidence as
   diagnostic confidence rather than tempo certainty;
4. update main-process allowlists, worker tests, benchmark profile catalogs,
   contracts, cache identity tests, and packaged smoke expectations; and
5. makes normal F10 batch analysis reanalyze v2 sidecars rather than silently
   treating them as v3; the force option is not required for this migration.

The model activation remains `beat-this-small0` version `1.1.0-small0`; the
estimator change is identified by the worker profile and does not alter model
weights, environment locks, or renderer-selectable capabilities.
