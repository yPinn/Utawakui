# ADR 0026: T1 acoustic estimates for lyric chunk presentation

## Status

Accepted for the model-independent first phase on 2026-10-19. Independent sidecar
validation/storage, a main-owned read boundary, source-local loading and a local
chunk preview are implemented. This phase accepts a synthetic fixture profile;
there is no product song-generation worker or Output extension. Manual optional
environment lifecycle was added on 2026-10-19; production preparation remains
blocked pending weight evidence. This does not accept the candidate for product use.
ADR 0010 remains the canonical T0/T1/T2 baseline. The new estimate does not change it.

## Context

The current research synthesis is maintained in the
[alignment conclusions](../research/lyrics-alignment-summary.md); dated reports
remain evidence for their own corpus and do not activate a production model.

The requested improvement starts with matching lyric text and timed lines. Audio
evidence may improve the start of a displayed word or phrase without establishing
its sung end, correcting the line's location, or verifying that the text exists.

The [research assessment](../research/lyrics-acoustic-segmentation-implementation-assessment-2026-10-19.md)
consolidates four evidence reports. HubertFA with existing Japanese reading tools
is the preferred Mandarin/Japanese research candidate for this task. Its measured
increment is approximately 0.466 GB when the tested Audio Python runtime exists.
The tested checkpoint does not cover Korean. Beat constraints, singing activity,
rest detection and wrong-version rejection have not shown sufficient evidence to
be defaults. Weight-specific use and redistribution evidence remains unresolved.

Current presentation treats valid canonical line segments as T2. Inserting model
estimates there would mislabel their provenance and conflate independent update
lifecycles. Current ephemeral T1 estimates are shared across templates; adding
audio estimates separately in each template would lose that consistency.

## Decision

Persist audio estimates in a separate, main-owned derived sidecar, bound to the
lyric document, effective T1 intervals, audio content, offset used for analysis,
and model/decoder/reading/chunking versions. Estimates never overwrite source
lyrics, canonical T2 or reading aids. Repeated text retains occurrence identity.
The draft field and acceptance boundary is the
[acoustic estimate contract](../contracts/lyrics-acoustic-estimate-contract.md).

Use one shared presentation selector with per-line precedence:

1. valid canonical T2;
2. an enabled, identity-matched acoustic estimate;
3. existing weighted T1 interpolation; and
4. plain line presentation where a finite interval cannot be resolved.

The first acoustic presentation mode switches chunk emphasis at supported starts
and holds it until the next chunk or line boundary. It does not claim sung ends or
rest detection. Missing internal boundaries merge text into adjacent chunks.
The first chunk retains the T1 start anchor. Estimates retain a distinct source
such as `acoustic-estimate`, while document timing remains T1 for those lines.

Use the original mix without requiring separation or M1. Reuse an existing guide
only through a fixed main-owned recipe. Keep unsupported languages and mixed lines
on the existing fallback. Do not enable unattended bulk application while content
and version matching remains an input assumption.

Reuse ADR 0014's immutable artifact, activation, lease and heavy-job infrastructure,
with a separately allowlisted capability and complete environment lock. The
candidate uses existing Node ONNX Runtime and Japanese reading tools plus a
two-package Python decoder environment. One job must own both subprocesses,
bounded audio windows, cancellation and cleanup. The current Python worker mapping
does not already provide this hybrid capability.

Load estimates with the canonical lyrics owner. Transport only validated immutable
display content through the existing Projection Hub, independently of playback
ticks. Explicitly extend the Output validator and negotiation/fallback behavior;
unknown fields currently do not become a supported protocol by being attached to
a renderer object. HTML audio and existing lyric offset remain clock authorities.

## Delivery and acceptance

First implement model-independent validation, lossless text mapping and preview
with synthetic fixtures. Then integrate a research worker and validate whole-song
windows against the frozen protocol. Model preparation follows only after artifact
use/redistribution evidence and lifecycle checks pass. Visible Lyrics, Self-View,
Workbench and OBS acceptance precedes a decision on product defaults.

Acceptance of this ADR does not approve weights or change the shipped model
registry. The implemented first phase is local to the authoring workspace; other
surfaces continue using canonical T2 or their existing T1 fallback. Model and
Output integration require the later acceptance gates above.

The second-phase private research CLI now connects the fixed candidate to this
sidecar and validates bounded whole-song processing and cancellation. It remains
outside the shipped application and has no activation or download entry. Its
[evaluation](../research/lyrics-acoustic-phase2-2026-10-19.md) supports continued
research, while wrong-content and accompaniment acceptance still block automatic
application. This does not accept a new product model profile.

The subsequent [lifecycle implementation](../research/lyrics-acoustic-lifecycle-2026-10-19.md)
adds separate manual preparation, actual load validation, repair, cancellation and
retryable removal to the application host/scheduler and Settings. Its shipped
catalog stays blocked; only isolated acceptance composition enables local pinned
assets for verification. It adds no automatic download, song producer, default
model acceptance or Output transport. Shared runtime references and all generation
leases are checked; failed repair keeps the previous activation, and removal does
not delete lyrics or estimates.

The fixed app-owned ONNX environment probe uses the packaged executable in
Electron-as-Node mode, alongside ADR 0005's existing provider EJS exception.
Keep `RunAsNode` enabled until both uses have replacements. The probe path and
model path are main-derived; renderer cannot request a script or executable.

## Alternatives and consequences

- Canonical T2 insertion would hide uncertainty and allow estimate refresh to
  affect authoring. A separate sidecar makes stale data and removal explicit.
- Template-local estimation would create conflicting starts across surfaces.
  Shared selection requires auditing phrase/page selectors and content revisions.
- A Torch-based multilingual bundle remains a separate research route; it adds
  cost without evidence that this T1 task requires it.
- Mandatory separation or beat analysis would add preparation dependencies not
  justified by the present comparison. Future drum/pitch evidence needs its own
  paired evaluation rather than inheriting the current model's status.

The separate sidecar increases validation, cache identity and protocol work. That
cost buys reversible estimates without changing authored timing. Whole-song
memory, cancellation, silent inputs, wrong versions and language coverage remain
explicit release tests rather than inferred from a successful model import.
