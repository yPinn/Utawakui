import {
  projectKtvDisplayTimeline,
  selectKtvTimelineFrame,
  ktvFrameForUnit,
  nextKtvBoundaryDelayMs,
} from '../../shared/presentation/state.mjs';
import { planLyricsDisplay } from '../../shared/presentation/lyricsDisplayLayout.mjs';
import { sliceLyricsVocalParts } from '../../shared/presentation/lyricsTextProcessing.mjs';

function sliceSegments(segments, from, to) {
  let cursor = 0;
  return segments?.flatMap((segment) => {
    const start = cursor;
    cursor += segment.text.length;
    const a = Math.max(start, from),
      b = Math.min(cursor, to);
    return a < b
      ? [
          {
            ...segment,
            text: segment.text.slice(a - start, b - start),
            ...(a !== start || b !== cursor ? { partialText: true } : {}),
          },
        ]
      : [];
  });
}

// This cache owns local geometry only. Both preview and active select from the
// same flattened timeline; seeking does not depend on the previous render.
export function createKtvDisplayFit(measure, onTrace) {
  let identity = null,
    source = [],
    entries = new Map(),
    timeline = null;
  function invalidate() {
    identity = null;
    source = [];
    entries.clear();
    timeline = null;
  }
  function prepare(snapshot, frame, settings) {
    const base = frame.ktv ?? frame;
    if (!base.visible || !Number.isSafeInteger(base.currentVisibleLineIndex))
      return { frame, delayMs: null };
    const lyrics = snapshot.lyrics;
    const key = JSON.stringify([
      lyrics.trackId,
      lyrics.documentId,
      lyrics.lines,
      lyrics.source?.language,
      lyrics.reading,
      lyrics.offsetMs,
      snapshot.playback?.track?.id,
      snapshot.playback?.durationMs,
      snapshot.playback?.rate,
      snapshot.musicStructure,
      settings.lyricsPresentationPolicyId,
    ]);
    if (key !== identity) {
      invalidate();
      identity = key;
      source = projectKtvDisplayTimeline(
        snapshot,
        snapshot.lyrics.lines,
        settings.presentationDocument,
      );
    }
    const nowMs = settings.nowMs ?? Date.now();
    onTrace?.('fit-hit', {
      ...settings.traceContext,
      cacheHit: Number(entries.has(base.currentVisibleLineIndex)),
      lineIndex: base.lineIndex,
    });
    // Measure the prefix needed for deterministic lane parity, plus the future
    // source unit before it can appear. A genuine section gap resets parity.
    const end = Math.min(source.length - 1, base.currentVisibleLineIndex + 1);
    let start = base.currentVisibleLineIndex;
    while (start > 0 && source[start]?.laneIndex !== 0) start--;
    // The preceding section's held tail may also be visible during count-in.
    start = Math.min(start, Math.max(0, base.currentVisibleLineIndex - 1));
    while (start > 0 && source[start]?.laneIndex !== 0) start--;
    for (let index = start; index <= end; index++) {
      if (entries.has(index)) continue;
      const unit = source[index];
      const canonical = snapshot.lyrics.lines[unit.sourceLineIndex];
      const line = {
        ...canonical,
        text: unit.text,
        startMs: unit.startMs,
        endMs: unit.endMs,
        ...(canonical.vocalParts ? { vocalParts: unit.vocalParts } : {}),
      };
      // Keep canonical intervals on paint segments. Only complete source chunks
      // can anchor a derived capacity page; partial chunks are not new evidence.
      const native = sliceSegments(
        canonical.segments,
        unit.sourceStart,
        unit.sourceEnd,
      );
      const estimated = sliceSegments(
        canonical.estimatedStarts?.segments,
        unit.sourceStart,
        unit.sourceEnd,
      );
      if (native) line.segments = native;
      if (estimated) line.estimatedStarts = { version: 1, segments: estimated };
      delete line.estimatedFineTiming;
      const unitFrame = ktvFrameForUnit(snapshot, source, unit, unit.startMs, {
        nowMs,
      });
      const measurement = measure(line, unitFrame, settings);
      if (!measurement) return { frame, delayMs: null };
      try {
        const plan = planLyricsDisplay(line, {
          fits: measurement.fits,
          sequentialRows: true,
          phraseRows: true,
          language: base.language,
          rate: snapshot.playback?.rate ?? 1,
        });
        const pages =
          plan.status === 'ready'
            ? plan.pages.map((page, pageIndex) => ({
                ...unit,
                text: page.text,
                sourceStart: unit.sourceStart + page.sourceStart,
                sourceEnd: unit.sourceStart + page.sourceEnd,
                startMs: page.startMs ?? unit.startMs,
                endMs: page.endMs ?? unit.endMs,
                handoffEndMs:
                  pageIndex === plan.pages.length - 1
                    ? unit.handoffEndMs
                    : page.endMs,
                segments: sliceSegments(
                  unit.segments,
                  page.sourceStart,
                  page.sourceEnd,
                ),
                vocalParts: sliceLyricsVocalParts(
                  unit.vocalParts,
                  page.sourceStart,
                  page.sourceEnd,
                ),
                displayBatchId: JSON.stringify([
                  canonical.lineId ?? unit.sourceLineIndex,
                  unit.sourceStart + page.sourceStart,
                  unit.sourceStart + page.sourceEnd,
                ]),
                displayFit: {
                  status: plan.status,
                  pageIndex,
                  pageCount: plan.pages.length,
                  sourceTiming: plan.sourceTiming,
                  pageTiming: plan.pageTiming,
                },
              }))
            : [];
        // Impossible size/dwell is surfaced, never silently treated as a proof.
        entries.set(index, {
          plan,
          pages: pages.length
            ? pages
            : [
                {
                  ...unit,
                  displayFit: {
                    status: plan.status,
                    pageIndex: 0,
                    pageCount: 1,
                    sourceTiming: unit.timingSource,
                    pageTiming: plan.pageTiming,
                  },
                },
              ],
        });
        timeline = null;
      } finally {
        measurement.dispose?.();
      }
    }
    if (!timeline) {
      let lane = -1;
      timeline = [];
      for (const unit of source) {
        if (unit.laneIndex === 0) lane = -1;
        for (const page of entries.get(unit.displayUnitIndex)?.pages ?? [unit])
          timeline.push({
            ...page,
            displayUnitIndex: timeline.length,
            laneIndex: ++lane,
          });
      }
    }
    const projected = selectKtvTimelineFrame(snapshot, timeline, nowMs);
    return {
      frame: { ...frame, ktv: projected, displayFit: projected.displayFit },
      delayMs: nextKtvBoundaryDelayMs(
        snapshot,
        snapshot.lyrics.lines,
        nowMs,
        null,
        timeline,
      ),
    };
  }
  return { prepare, invalidate };
}
