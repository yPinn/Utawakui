import { playbackPositionMs } from '../../shared/presentation/state.mjs';
import {
  adaptLiveStageLyricsPresentation,
  analyzeLyricsSource,
} from '../../shared/presentation/lyricsPresentation.mjs';
import {
  planLyricsDisplay,
  splitLyricsDisplayRows,
  nextLyricsDisplayBoundaryMs,
  selectLyricsDisplayPage,
} from '../../shared/presentation/lyricsDisplayLayout.mjs';
import { projectLyricsDisplayFrame } from '../../shared/presentation/lyricsDisplayFrame.mjs';
import { fineTextParts } from '../../shared/presentation/lyricsFineFrame.mjs';

function fineMeasurementSource(line, frame, templateId) {
  const units = frame.currentFineTiming?.units;
  const segments = frame.currentSegments;
  if (
    templateId !== 'focus-line' ||
    !units?.length ||
    !Array.isArray(segments) ||
    frame.currentText !== line.text ||
    segments.map((segment) => segment.text).join('') !== line.text
  )
    return null;
  let cursor = 0;
  const ranges = segments.map((segment) => {
    const from = cursor;
    cursor += segment.text.length;
    return { from, to: cursor };
  });
  let index = 0;
  return {
    text: line.text,
    units: units.filter((unit) => {
      while (index < ranges.length && ranges[index].to <= unit.from) index++;
      const range = ranges[index];
      return range && unit.from >= range.from && unit.to <= range.to;
    }),
  };
}

// DOM measurement is local to this Browser Source. It is never sent over IPC.
function createMeasurement(
  elements,
  templateId,
  document,
  window,
  reading,
  counters,
  measureNow,
  fineSource,
) {
  const vertical = ['manga-frame', 'ornate-vertical'].includes(templateId);
  const target =
    templateId === 'manga-frame'
      ? elements.mangaBubbles?.querySelector('.lyrics-overlay__manga-text')
      : (elements.current.querySelector?.(
          '.lyrics-overlay__kinetic-layer--fill',
        ) ?? elements.current);
  if (!target || !window.innerWidth || !window.innerHeight) return null;
  let phaseAt = counters ? measureNow() : 0;
  const style = window.getComputedStyle(target);
  const size = parseFloat(style.fontSize);
  if (!Number.isFinite(size) || size <= 0) return null;
  if (counters) {
    counters.fitStyleMs += measureNow() - phaseAt;
    phaseAt = counters.fitRootAtMs = measureNow();
  }
  const rootRect = elements.root.getBoundingClientRect();
  if (counters) {
    counters.fitRootMs += measureNow() - phaseAt;
    phaseAt = counters.fitTargetAtMs = measureNow();
  }
  if (rootRect.width <= 0 || rootRect.height <= 0) return null;
  const targetRect = target.getBoundingClientRect();
  if (counters) {
    counters.fitTargetMs += measureNow() - phaseAt;
    phaseAt = measureNow();
  }
  const lineHeight = parseFloat(style.lineHeight) || size * 1.2;
  const padding = size * (templateId === 'kinetic-pop' ? 0.8 : 0.3);
  let width =
    Math.min(
      rootRect.width || window.innerWidth * 0.9,
      window.innerWidth * 0.9,
    ) -
    padding * 2;
  let height = Math.min(
    window.innerHeight * 0.65,
    window.innerHeight - padding * 2,
  );
  let rows = Math.max(1, Math.min(3, Math.floor(height / lineHeight)));
  if (templateId === 'live-stage') {
    width =
      Math.min(targetRect.width || width, window.innerWidth * 0.55) -
      padding * 2;
    rows = 2;
  } else if (templateId === 'kinetic-pop') rows = 2;
  else if (templateId === 'manga-frame') {
    const bubble = target.parentElement.getBoundingClientRect();
    width = bubble.width * 0.65;
    height = bubble.height * 0.65;
    const ruby = reading?.segments?.some((segment) => segment.reading);
    rows = Math.max(
      1,
      Math.floor(width / (lineHeight + (ruby ? size * 0.45 : 0))),
    );
  } else if (templateId === 'ornate-vertical') {
    rows = Math.max(1, Math.min(3, Math.floor(width / (size * 1.7))));
  }
  if (width <= 0 || height <= 0) return null;
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  Object.assign(probe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    visibility: 'hidden',
    display: 'block',
    whiteSpace: 'pre',
    inlineSize: 'max-content',
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
  });
  document.body.append(probe);
  const wrapped = probe.cloneNode();
  Object.assign(wrapped.style, {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    inlineSize: vertical ? `${height}px` : `${width}px`,
    blockSize: 'max-content',
  });
  document.body.append(wrapped);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext?.('2d');
  if (context) {
    context.font = `${style.fontStyle || 'normal'} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.letterSpacing = style.letterSpacing;
  }
  if (counters) counters.fitProbeSetupMs += measureNow() - phaseAt;
  const measured = new Map(),
    layouts = new Map(),
    wrappedPages = new Map();
  const fitsLine = (text) => {
    if (measured.has(text)) return measured.get(text);
    probe.textContent = text;
    if (counters) counters.probeCount++;
    const rect = probe.getBoundingClientRect();
    const fits =
      rect.width <= width &&
      rect.height <= (vertical ? height : lineHeight * 1.2);
    measured.set(text, fits);
    return fits;
  };
  const layout = (text) => {
    if (!layouts.has(text)) {
      const at = counters ? measureNow() : 0;
      layouts.set(text, splitLyricsDisplayRows(text, fitsLine, rows));
      if (counters) counters.fitRowsMs += measureNow() - at;
    }
    return layouts.get(text);
  };
  const pageKey = (text, range) =>
    `${range?.sourceStart ?? 0}:${range?.sourceEnd ?? text.length}`;
  return {
    fits: (text, range) => {
      // A generous advance budget cheaply rejects obviously excessive text.
      // The actual DOM measurement remains authoritative for every accepted page.
      if (
        context &&
        !/\s/u.test(text) &&
        context.measureText(text).width >
          (vertical ? height : width) * rows * 1.25
      )
        return false;
      // Reject oversized probes with one browser layout before tokenizing rows.
      // This avoids recursively laying out every row of a 2,000-glyph candidate.
      const at = counters ? measureNow() : 0;
      if (counters && counters.fitWrappedAtMs === null)
        counters.fitWrappedAtMs = at;
      const from = range?.sourceStart ?? 0;
      const to = range?.sourceEnd ?? text.length;
      if (fineSource?.units.length) {
        const parts = fineTextParts(
          fineSource.text,
          fineSource.units,
          from,
          to,
        );
        wrapped.replaceChildren(
          ...parts.map((part) => {
            if (!part.unitId) return document.createTextNode(part.text);
            const cell = document.createElement('span');
            cell.textContent = part.text;
            // Match only the live ink cell's layout. No pseudo copy or animation.
            Object.assign(cell.style, {
              display: 'inline-block',
              maxInlineSize: '100%',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            });
            return cell;
          }),
        );
      } else wrapped.textContent = text;
      if (counters) counters.probeCount++;
      const rect = wrapped.getBoundingClientRect();
      const overflow = vertical
        ? rect.width > width || wrapped.scrollHeight > height + 1
        : rect.height > lineHeight * rows * 1.2 ||
          wrapped.scrollWidth > width + 1;
      if (counters) counters.fitWrappedMs += measureNow() - at;
      if (overflow) return false;
      // Focus wraps the complete page itself; it never consumes row fragments.
      // A strict DOM proof can skip prefix probes, while whitespace-sensitive
      // candidates and the other templates retain the existing row planner.
      if (
        templateId === 'focus-line' &&
        !/[\r\n\t]/u.test(text) &&
        text.trim() === text &&
        rect.height <= lineHeight * rows + 1
      ) {
        wrappedPages.set(pageKey(text, range), rect.height > lineHeight + 1);
        return true;
      }
      const result = layout(text);
      return result !== null && result.length <= rows;
    },
    rows: layout,
    wrappedMultiline: (text, range) => wrappedPages.get(pageKey(text, range)),
    dispose: () => {
      probe.remove();
      wrapped.remove();
    },
  };
}

export function createLyricsFitController(options = {}) {
  const elements = options.elements;
  const document = options.document ?? globalThis.document;
  const window = options.window ?? globalThis.window;
  const cache = new Map();
  const notice =
    options.inspection && document?.createElement
      ? document.createElement('p')
      : null;
  if (notice) {
    notice.className = 'lyrics-fit-status';
    notice.hidden = true;
    notice.setAttribute('role', 'status');
    document.body.append(notice);
  }
  let stopped = false,
    resizeFrame = null;
  let styleTask = null;
  let styleGeneration = 0;
  let stylesPrepared = false;
  function cancelStylePreparation() {
    styleGeneration++;
    if (styleTask !== null) window.clearTimeout(styleTask);
    styleTask = null;
  }
  function prepareStyles() {
    if (
      stopped ||
      stylesPrepared ||
      styleTask !== null ||
      !elements ||
      !window?.getComputedStyle
    )
      return;
    const generation = styleGeneration;
    styleTask = window.setTimeout(() => {
      if (stopped || generation !== styleGeneration) return;
      styleTask = null;
      const at = options.onTrace ? performance.now() : 0;
      // Resolve existing template/font metrics outside the onset callback.
      // No future lyrics are inserted, no fit is accepted, and render never waits.
      const style = window.getComputedStyle(elements.current);
      void style.fontFamily;
      void style.fontSize;
      void style.lineHeight;
      elements.root.getBoundingClientRect();
      elements.current.getBoundingClientRect();
      stylesPrepared = true;
      options.onTrace?.('style-prepare', {
        durationMs: performance.now() - at,
      });
    }, 0);
  }
  function invalidate(reasonCode = 0) {
    options.onTrace?.('invalidate', { reasonCode });
    cancelStylePreparation();
    stylesPrepared = false;
    cache.clear();
  }
  function resized() {
    if (stopped || resizeFrame !== null) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      invalidate(1);
      options.refresh?.();
    });
  }
  window?.addEventListener?.('resize', resized);
  function prepare(snapshot, frame, settings = {}) {
    if (stopped || !frame.visible) {
      if (notice) notice.hidden = true;
      if (elements) elements.root.dataset.fitActive = 'false';
      return { frame, delayMs: null };
    }
    const base =
      settings.templateId === 'karaoke-stack' ? (frame.ktv ?? frame) : frame;
    const canonical = snapshot?.lyrics?.lines?.[base.lineIndex];
    if (!canonical) return { frame, delayMs: null };
    const line = {
      ...canonical,
      endMs:
        canonical.endMs ??
        snapshot.lyrics.lines[base.lineIndex + 1]?.startMs ??
        (Number.isFinite(snapshot.playback?.durationMs)
          ? snapshot.playback.durationMs + (snapshot.lyrics.offsetMs ?? 0)
          : null),
    };
    // Apply the existing content policy once, before paging. Punctuation/whitespace
    // changes mean exact source offsets are unavailable, so retain layout provenance.
    if (settings.templateId === 'live-stage') {
      const display = adaptLiveStageLyricsPresentation(
        analyzeLyricsSource(line.text),
        settings,
      );
      const text = display.pages.flatMap((p) => p.lines).join(' ');
      if (text !== line.text) {
        line.text = text;
        delete line.segments;
        delete line.estimatedStarts;
      }
    }
    const rate = snapshot.playback?.rate ?? 1;
    const key = JSON.stringify([
      settings.templateId,
      settings.kineticMaterial,
      settings.lyricsPresentationPolicyId,
      line,
      rate,
      base.currentReading,
    ]);
    let entry = cache.get(key);
    const trace = options.onTrace
      ? (event, fields) =>
          options.onTrace(event, { ...settings.traceContext, ...fields })
      : undefined;
    trace?.('fit-hit', {
      cacheHit: entry ? 1 : 0,
      lineIndex: base.lineIndex,
    });
    if (!entry) {
      const measureNow = options.measureNow ?? (() => performance.now());
      const startedAt = options.onTrace ? measureNow() : 0;
      const counters = options.onTrace
        ? {
            probeCount: 0,
            fitStyleMs: 0,
            fitRootMs: 0,
            fitTargetMs: 0,
            fitProbeSetupMs: 0,
            fitWrappedMs: 0,
            fitRowsMs: 0,
            fitPlanMs: 0,
            fitWrappedAtMs: null,
          }
        : null;
      if (elements) elements.root.dataset.fitActive = 'false';
      options.renderForMeasurement?.(
        settings.templateId === 'manga-frame'
          ? { ...frame, mangaFit: true }
          : frame,
        settings,
      );
      trace?.('fit-render', { durationMs: measureNow() - startedAt });
      const measurement =
        options.measure?.(line, settings) ??
        (elements &&
          createMeasurement(
            elements,
            settings.templateId,
            document,
            window,
            base.currentReading,
            counters,
            measureNow,
            fineMeasurementSource(line, base, settings.templateId),
          ));
      if (!measurement) return { frame, delayMs: null };
      try {
        const planAt = counters ? measureNow() : 0;
        const plan = planLyricsDisplay(line, {
          fits: measurement.fits,
          rate,
        });
        const multiline = [];
        entry = {
          plan,
          rows: plan.pages.map((p) => {
            const wrapped =
              settings.templateId === 'focus-line'
                ? measurement.wrappedMultiline?.(p.text, {
                    sourceStart: p.sourceStart,
                    sourceEnd: p.sourceEnd,
                  })
                : undefined;
            const rows =
              typeof wrapped === 'boolean'
                ? [{ text: p.text }]
                : (measurement.rows(p.text) ?? [{ text: p.text }]);
            multiline.push(wrapped ?? rows.length > 1);
            return rows;
          }),
          multiline,
        };
        if (counters) counters.fitPlanMs += measureNow() - planAt;
        if (cache.size >= 8) cache.delete(cache.keys().next().value);
        cache.set(key, entry);
      } finally {
        measurement.dispose?.();
        trace?.('fit-measure', {
          ...counters,
          durationMs: measureNow() - startedAt,
          lineIndex: base.lineIndex,
        });
      }
    }
    const at =
      playbackPositionMs(snapshot, settings.nowMs) +
      (snapshot.lyrics.offsetMs ?? 0);
    const selected = selectLyricsDisplayPage(entry.plan, at);
    if (notice) {
      notice.hidden = entry.plan.status !== 'unfit';
      notice.textContent = notice.hidden
        ? ''
        : '目前尺寸無法完整顯示此句，請放大來源範圍或調整字級。';
    }
    const rows = entry.rows[selected.index];
    const active =
      entry.plan.pages.length > 1 || entry.multiline[selected.index] === true;
    const projected = projectLyricsDisplayFrame(frame, line, entry.plan, at, {
      ...settings,
      rows,
      force: active,
    });
    if (elements) {
      const data = elements.root.dataset;
      data.fitStatus = entry.plan.status;
      data.fitPage = String(selected.index);
      data.fitPages = String(entry.plan.pages.length);
      data.fitSourceStart = String(selected.page?.sourceStart ?? 0);
      data.fitSourceEnd = String(selected.page?.sourceEnd ?? 0);
      data.fitPageStartMs = String(selected.page?.startMs ?? '');
      data.fitPageEndMs = String(selected.page?.endMs ?? '');
      data.fitPageTiming = entry.plan.pageTiming ?? '';
      data.fitActive = String(active);
    }
    return {
      frame: projected,
      delayMs:
        snapshot.playback?.status === 'playing'
          ? nextLyricsDisplayBoundaryMs(entry.plan, at, rate)
          : null,
    };
  }
  return {
    prepare,
    prepareStyles,
    suspend: cancelStylePreparation,
    invalidate,
    stop() {
      stopped = true;
      cancelStylePreparation();
      notice?.remove();
      cache.clear();
      window?.removeEventListener?.('resize', resized);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    },
  };
}
