import { analyzeLyricsSource } from './lyricsPresentation.mjs';
import { adaptOrnateVerticalLyricsPresentation } from './ornateVerticalPresentation.mjs';
import { sliceLyricsVocalParts } from './lyricsTextProcessing.mjs';
import {
  lyricsDisplayColumnStarts,
  selectLyricsDisplayPage,
  sliceLyricsReading,
} from './lyricsDisplayLayout.mjs';

// Batch identity is stable during progress ticks and distinct for equal text at
// different source ranges. It never changes canonical line identity or time.
export function lyricsDisplayBatchKey(frame) {
  if (frame?.displayBatchId) return frame.displayBatchId;
  const key = `${frame?.currentVisibleLineIndex ?? frame?.lineIndex ?? ''}\0${frame?.currentText ?? ''}`;
  return Number.isFinite(frame?.repeatCueStartMs)
    ? `${key}\0${frame.repeatCueStartMs}`
    : key;
}

function batchId(base, line, page) {
  return JSON.stringify([
    line.lineId ?? base.lineIndex ?? null,
    base.currentSourceRange?.from ?? 0,
    page.sourceStart,
    page.sourceEnd,
    ...(Number.isFinite(base.repeatCueStartMs) ? [base.repeatCueStartMs] : []),
  ]);
}

function pageFineTiming(fine, page) {
  return fine
    ? {
        ...fine,
        units: fine.units
          .filter(
            (unit) =>
              unit.from >= page.sourceStart && unit.to <= page.sourceEnd,
          )
          .map((unit) => ({
            ...unit,
            from: unit.from - page.sourceStart,
            to: unit.to - page.sourceStart,
          })),
      }
    : undefined;
}

function pageSegments(segments, line, page, timing) {
  if (
    !Array.isArray(segments) ||
    segments.map((s) => s.text).join('') !== line.text
  )
    return undefined;
  let cursor = 0;
  return segments.flatMap((segment) => {
    const from = cursor;
    cursor += segment.text.length;
    const start = Math.max(from, page.sourceStart),
      end = Math.min(cursor, page.sourceEnd);
    if (end <= start) return [];
    const partial = start !== from || end !== cursor;
    return [
      {
        ...segment,
        text: segment.text.slice(start - from, end - from),
        ...(partial && timing !== 'line-estimate'
          ? { progress: null, remainingMs: null }
          : {}),
      },
    ];
  });
}

export function projectLyricsDisplayFrame(
  frame,
  line,
  plan,
  positionMs,
  options = {},
) {
  const { page, index } = selectLyricsDisplayPage(plan, positionMs);
  if (!page || (plan.pages.length < 2 && options.force !== true)) return frame;
  const base =
    options.templateId === 'karaoke-stack' ? (frame.ktv ?? frame) : frame;
  const reading = sliceLyricsReading(
    base.currentReading,
    page.sourceStart,
    page.sourceEnd,
  );
  const projected = {
    ...base,
    displayBatchId: batchId(base, line, page),
    ...(Number.isFinite(page.startMs) &&
    Number.isFinite(page.endMs) &&
    page.endMs > page.startMs
      ? {
          lineProgress: Math.max(
            0,
            Math.min(
              1,
              (positionMs - page.startMs) / (page.endMs - page.startMs),
            ),
          ),
          lineRemainingMs:
            options.playing === true && !base.currentSegments?.length
              ? Math.max(
                  0,
                  (page.endMs - positionMs) /
                    (options.rate > 0 ? options.rate : 1),
                )
              : null,
        }
      : { lineProgress: null, lineRemainingMs: null }),
    currentText: page.text,
    ...(line.vocalParts
      ? {
          currentVocalParts: sliceLyricsVocalParts(
            line.vocalParts,
            page.sourceStart,
            page.sourceEnd,
          ),
        }
      : {}),
    ...(base.nextVocalParts ? { nextVocalParts: [] } : {}),
    nextText: '',
    nextSegments: undefined,
    nextFineTiming: undefined,
    nextReading: null,
    currentReading: reading,
    currentSegments: pageSegments(
      base.currentSegments,
      line,
      page,
      base.currentTimingSource,
    ),
    ...(base.currentFineTiming
      ? {
          currentFineTiming: {
            ...pageFineTiming(base.currentFineTiming, page),
          },
        }
      : {}),
    lyricsSourceAnalysis: analyzeLyricsSource(page.text, {
      speaker: line.vocalParts === undefined,
    }),
    displayFit: {
      status: plan.status,
      pageIndex: index,
      pageCount: plan.pages.length,
      sourceTiming: plan.sourceTiming,
      pageTiming: plan.pageTiming,
    },
  };
  if (options.templateId === 'karaoke-stack') {
    projected.currentRole =
      projected.currentVocalParts?.[0]?.role ?? base.currentRole;
    const next = plan.pages[index + 1];
    const lane =
      (base.currentLaneIndex ??
        base.currentVisibleLineIndex ??
        base.lineIndex ??
        0) + index;
    projected.currentLaneIndex = lane;
    projected.nextLaneIndex = lane + 1;
    if (next) {
      if (line.vocalParts)
        projected.nextVocalParts = sliceLyricsVocalParts(
          line.vocalParts,
          next.sourceStart,
          next.sourceEnd,
        );
      projected.nextDisplayBatchId = batchId(base, line, next);
      projected.nextText = next.text;
      projected.nextReading = sliceLyricsReading(
        base.currentReading,
        next.sourceStart,
        next.sourceEnd,
      );
      projected.nextSegments = pageSegments(
        base.currentSegments,
        line,
        next,
        base.currentTimingSource,
      )?.map((segment) => ({
        ...segment,
        state: 'future',
        progress: 0,
        remainingMs: null,
      }));
      projected.nextFineTiming = pageFineTiming(base.currentFineTiming, next);
      projected.nextRole =
        projected.nextVocalParts?.[0]?.role ?? projected.currentRole;
      projected.nextVisibleLineIndex = base.currentVisibleLineIndex;
      projected.nextHeld = false;
    } else {
      const preview = options.nextPreview;
      const nextText =
        preview === null ? '' : (preview?.text ?? base.nextText ?? '');
      projected.nextText = nextText;
      if (base.nextVocalParts)
        projected.nextVocalParts = sliceLyricsVocalParts(
          base.nextVocalParts,
          preview?.sourceStart ?? 0,
          preview?.sourceEnd ?? nextText.length,
        );
      projected.nextSegments = nextText
        ? preview
          ? pageSegments(
              base.nextSegments,
              { text: base.nextText },
              preview,
              base.nextTimingSource,
            )
          : base.nextSegments
        : undefined;
      projected.nextReading = preview
        ? sliceLyricsReading(
            base.nextReading,
            preview.sourceStart,
            preview.sourceEnd,
          )
        : nextText
          ? base.nextReading
          : null;
      projected.nextFineTiming = preview
        ? pageFineTiming(base.nextFineTiming, preview)
        : nextText
          ? base.nextFineTiming
          : undefined;
    }
    // A source-line count-in belongs to its first batch only.
    if (index > 0) projected.countIn = null;
  }
  if (options.templateId === 'manga-frame') projected.mangaFit = true;
  const rows = options.rows ?? [{ text: page.text }];
  if (options.templateId === 'chalkboard-vertical') {
    projected.chalkboardColumns = rows.map((row) => row.text);
    if (Number.isFinite(page.endMs)) {
      const rate = options.rate || 1;
      const starts = lyricsDisplayColumnStarts(line, page, rows, 120);
      if (starts)
        projected.chalkboardColumnDelaysMs = starts.map(
          (start) => (start - positionMs) / rate,
        );
      projected.chalkboardRate = rate;
      projected.chalkboardRemainingMs =
        Math.max(0, page.endMs - positionMs) / rate;
      if (Number.isFinite(page.startMs))
        projected.chalkboardDurationMs =
          (page.endMs - (starts?.[0] ?? page.startMs)) / rate;
    }
  }
  if (options.templateId === 'ornate-vertical') {
    const continuation = line.continuation;
    const accentRanges = continuation
      ? [0, 1].flatMap((part) => {
          const offset = part === 0 ? 0 : continuation.offset;
          const original =
            options.presentationDocument?.lines?.[continuation.index + part]
              ?.presentation;
          return (original?.sectionAccentRanges ?? []).map(({ from, to }) => ({
            from: from + offset,
            to: to + offset,
          }));
        })
      : (base.ornateVertical?.sectionAccentRanges ?? []);
    const sectionAccentRanges = accentRanges
      .filter(
        ({ from, to }) => from >= page.sourceStart && to <= page.sourceEnd,
      )
      .map(({ from, to }) => ({
        from: from - page.sourceStart,
        to: to - page.sourceStart,
      }));
    const presentation = adaptOrnateVerticalLyricsPresentation(page.text, {
      sectionAccentRanges,
      segments: options.ornateSegments,
    });
    projected.ornateVertical = presentation;
    if (continuation) {
      const before = positionMs < continuation.startMs;
      const right = presentation.segments.filter(
        ({ sourceStart }) =>
          sourceStart + page.sourceStart < continuation.offset,
      );
      const rate = options.rate > 0 ? options.rate : 1;
      if (before)
        projected.ornateVertical = {
          ...presentation,
          text: page.text
            .slice(0, continuation.offset - page.sourceStart)
            .trimEnd(),
          segments: right,
          units: right.flatMap(({ units }) => units),
        };
      projected.ornateColumnTiming = {
        index: before ? 0 : 1,
        playing: options.playing === true,
        settledUnits: before
          ? 0
          : right.reduce((total, column) => total + column.units.length, 0),
        remainingMs: Math.max(
          0,
          ((before ? continuation.startMs : page.endMs) - positionMs) / rate,
        ),
        nextDelayMs: before ? (continuation.startMs - positionMs) / rate : null,
      };
    } else if (
      options.ornateColumnMode === 'replace' &&
      presentation.segments.length > 1
    ) {
      const starts = lyricsDisplayColumnStarts(
        line,
        page,
        presentation.segments,
      );
      const rate = options.rate > 0 ? options.rate : 1;
      // A very short column cue would interrupt reading before the next one.
      if (
        starts?.every(
          (start, i) => ((starts[i + 1] ?? page.endMs) - start) / rate >= 380,
        )
      ) {
        const columnIndex = Math.max(
          0,
          starts.findLastIndex((start) => start <= positionMs),
        );
        const column = presentation.segments[columnIndex];
        const end = columnIndex + 1;
        const next = starts[end];
        projected.ornateVertical = {
          ...presentation,
          text: column.text,
          segments: [
            { ...column, index: 0, regionIndex: 0, regionColumnIndex: 0 },
          ],
          units: column.units,
        };
        projected.ornateColumnTiming = {
          index: columnIndex,
          playing: options.playing === true,
          settledUnits: 0,
          remainingMs: Math.max(0, ((next ?? page.endMs) - positionMs) / rate),
          nextDelayMs: Number.isFinite(next)
            ? (next - positionMs) / rate
            : null,
        };
      }
    }
  }
  if (options.templateId === 'live-stage') {
    projected.liveStageDisplayLines = rows.map((row) => row.text);
    projected.liveStagePageIndex = 0;
  }
  return options.templateId === 'karaoke-stack'
    ? { ...frame, ktv: projected, displayFit: projected.displayFit }
    : projected;
}
