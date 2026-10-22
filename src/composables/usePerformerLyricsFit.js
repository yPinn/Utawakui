import { computed, onScopeDispose, shallowRef, toValue, watch } from 'vue';
import {
  planLyricsDisplay,
  selectLyricsDisplayPage,
  nextLyricsDisplayBoundaryMs,
  sliceLyricsReading,
} from '../../shared/presentation/lyricsDisplayLayout.mjs';

export function usePerformerLyricsFit(source, host, onBoundary, options = {}) {
  const plan = shallowRef(null);
  let observer,
    pending = 0,
    disposed = false;
  const fonts = globalThis.document?.fonts;
  function measure() {
    if (disposed) return;
    const frame = source.value,
      line = frame.currentLine;
    if (!line) {
      plan.value = null;
      return;
    }
    if (options.fits) {
      plan.value = planLyricsDisplay(line, {
        fits: options.fits,
        rate: frame.playbackRate,
      });
      return;
    }
    const root = host.value;
    const region = root?.closest?.('.performer-surface__cue-region');
    const target = root?.querySelector?.(
      '.performer-lyric-cue--current .performer-lyric-cue__text',
    );
    if (!target || !region || !region.clientHeight || !root.clientWidth) return;
    const style = window.getComputedStyle(target),
      size = parseFloat(style.fontSize);
    const ruby = frame.currentReading?.segments?.some((s) => s.reading);
    const width = root.clientWidth - size * 0.5;
    const readingNode = root.querySelector(
      '.performer-lyric-cue--current .performer-lyric-cue__reading',
    );
    const readingHeight = frame.currentReading?.romaji
      ? (readingNode?.getBoundingClientRect().height ?? 0)
      : 0;
    const height = region.clientHeight * 0.8 - readingHeight;
    const probe = document.createElement('p');
    Object.assign(probe.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      visibility: 'hidden',
      margin: '0',
      width: `${width}px`,
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: ruby
        ? String((parseFloat(style.lineHeight) || size * 1.3) / size + 0.6)
        : style.lineHeight,
    });
    document.body.append(probe);
    try {
      plan.value = planLyricsDisplay(line, {
        rate: frame.playbackRate,
        fits: (text) => {
          probe.textContent = text;
          return (
            probe.scrollWidth <= width + 1 &&
            probe.getBoundingClientRect().height <= height
          );
        },
      });
    } finally {
      probe.remove();
    }
  }
  function refresh() {
    if (disposed || pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      measure();
    });
  }
  watch(
    () =>
      JSON.stringify([
        source.value.currentLine,
        source.value.currentReading,
        source.value.playbackRate,
        toValue(options.version),
      ]),
    measure,
    { immediate: true, flush: 'post' },
  );
  watch(
    host,
    (root) => {
      observer?.disconnect();
      const region = root?.closest?.('.performer-surface__cue-region');
      if (region && typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(refresh);
        observer.observe(region);
      }
      measure();
    },
    { flush: 'post' },
  );
  fonts?.addEventListener?.('loadingdone', refresh);
  const frame = computed(() => {
    const original = source.value;
    const selected = selectLyricsDisplayPage(
      plan.value,
      original.lyricPositionMs,
    );
    if (
      !selected.page ||
      (plan.value?.pages.length ?? 0) < 2 ||
      plan.value.pages.map((p) => p.text).join('') !==
        original.currentLine?.text
    )
      return original;
    const page = selected.page;
    return {
      ...original,
      currentLine: { ...original.currentLine, text: page.text },
      currentReading: sliceLyricsReading(
        original.currentReading,
        page.sourceStart,
        page.sourceEnd,
      ),
      nextLine: null,
      nextReading: null,
      displayFit: {
        status: plan.value.status,
        page: selected.index,
        pages: plan.value.pages.length,
      },
    };
  });
  watch(
    () => [
      plan.value,
      source.value.lyricPositionMs,
      source.value.playbackStatus,
    ],
    () => {
      onBoundary(
        source.value.playbackStatus === 'playing'
          ? nextLyricsDisplayBoundaryMs(
              plan.value,
              source.value.lyricPositionMs,
              source.value.playbackRate ?? 1,
            )
          : null,
      );
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    disposed = true;
    observer?.disconnect();
    fonts?.removeEventListener?.('loadingdone', refresh);
    if (pending) cancelAnimationFrame(pending);
    onBoundary(null);
  });
  return { frame, plan, refresh };
}
