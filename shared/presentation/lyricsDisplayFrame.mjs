import {
  adaptKineticPopLyricsPresentation,
  analyzeLyricsSource,
} from './lyricsPresentation.mjs';
import { adaptOrnateVerticalLyricsPresentation } from './ornateVerticalPresentation.mjs';
import {
  selectLyricsDisplayPage,
  sliceLyricsReading,
} from './lyricsDisplayLayout.mjs';

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
    currentText: page.text,
    nextText: '',
    nextSegments: undefined,
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
            ...base.currentFineTiming,
            units: base.currentFineTiming.units
              .filter(
                (unit) =>
                  unit.from >= page.sourceStart && unit.to <= page.sourceEnd,
              )
              .map((unit) => ({
                ...unit,
                from: unit.from - page.sourceStart,
                to: unit.to - page.sourceStart,
              })),
          },
        }
      : {}),
    lyricsSourceAnalysis: analyzeLyricsSource(page.text),
    displayFit: {
      status: plan.status,
      pageIndex: index,
      pageCount: plan.pages.length,
      sourceTiming: plan.sourceTiming,
      pageTiming: plan.pageTiming,
    },
  };
  if (options.templateId === 'manga-frame') projected.mangaFit = true;
  const rows = options.rows ?? [{ text: page.text }];
  if (options.templateId === 'kinetic-pop') {
    const presentation = adaptKineticPopLyricsPresentation(page.text, {
      lineIndex: base.lineIndex,
      kineticMaterial: options.kineticMaterial,
      phraseRanges: [{ sourceStart: 0, sourceEnd: page.text.length }],
    });
    projected.kineticPop = {
      ...presentation,
      rows: rows.map((row) => ({
        text: row.text,
        units: adaptKineticPopLyricsPresentation(row.text).units,
      })),
    };
  }
  if (options.templateId === 'ornate-vertical') {
    const presentation = adaptOrnateVerticalLyricsPresentation(page.text);
    projected.ornateVertical = {
      ...presentation,
      segments: rows.flatMap(
        (row) => adaptOrnateVerticalLyricsPresentation(row.text).segments,
      ),
    };
  }
  if (options.templateId === 'live-stage') {
    projected.liveStageDisplayLines = rows.map((row) => row.text);
    projected.liveStagePageIndex = 0;
  }
  return options.templateId === 'karaoke-stack'
    ? { ...frame, ktv: projected, displayFit: projected.displayFit }
    : projected;
}
