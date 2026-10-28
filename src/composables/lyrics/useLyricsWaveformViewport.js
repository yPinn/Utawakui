import { computed, onScopeDispose, shallowRef, toValue, watch } from 'vue';
import { waveformRange } from '../../utils/waveformPresentation.js';

export const WAVEFORM_ZOOM_SPANS = Object.freeze([10000, 5000, 2000, 1000]);

// This owner changes the reference viewport only. Tile I/O stays in the existing
// waveform owner; neither owner has a player or timing mutation capability.
export function useLyricsWaveformViewport({
  waveform,
  positionMs,
  isPlaying = false,
  active = true,
}) {
  const zoomIndex = shallowRef(0),
    startMs = shallowRef(0),
    dragKind = shallowRef(null),
    following = shallowRef(true);
  let gesture = null,
    requested = null,
    initialPosition = true;
  const durationMs = computed(
    () => (waveform.overview.value?.durationSec ?? 0) * 1000,
  );
  const viewport = computed(() =>
    waveformRange(
      durationMs.value,
      startMs.value,
      WAVEFORM_ZOOM_SPANS[zoomIndex.value],
    ),
  );
  const isDragging = computed(() => dragKind.value !== null);

  function release() {
    const previous = gesture;
    gesture = null;
    dragKind.value = null;
    if (previous?.target.hasPointerCapture?.(previous.id))
      previous.target.releasePointerCapture(previous.id);
  }
  function cancelDrag(event) {
    if (!gesture || (event && event.pointerId !== gesture.id)) return;
    startMs.value = gesture.start;
    following.value = gesture.wasFollowing;
    release();
  }
  async function show(start, force = true) {
    if (
      !waveform.open.value ||
      !waveform.overview.value ||
      waveform.clearing.value ||
      !toValue(active)
    )
      return false;
    startMs.value = waveformRange(
      durationMs.value,
      start,
      WAVEFORM_ZOOM_SPANS[zoomIndex.value],
    ).fromMs;
    const { fromMs, toMs } = viewport.value;
    const first = Math.floor(fromMs / 10000),
      last = Math.max(0, Math.ceil(toMs / 10000) - 1),
      prefetchNext = Boolean(
        following.value &&
        toValue(isPlaying) &&
        last === first &&
        (first + 1) * 10000 < durationMs.value,
      ),
      key = `${first}/${last}/${prefetchNext}`;
    if (
      !force &&
      requested?.key === key &&
      requested.overview === waveform.overview.value
    )
      return requested.promise;
    const request = { key, overview: waveform.overview.value, promise: null };
    requested = request;
    request.promise = prefetchNext
      ? waveform.selectWindow(first, last, { prefetchNext: true })
      : waveform.selectWindow(first, last);
    return request.promise;
  }
  function startDrag(event, kind) {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      gesture ||
      !['overview', 'detail'].includes(kind) ||
      !waveform.open.value ||
      !waveform.overview.value ||
      waveform.clearing.value
    )
      return false;
    const target = event.currentTarget,
      bounds = (target.ownerSVGElement ?? target).getBoundingClientRect();
    if (!(bounds.width > 0)) return false;
    event.preventDefault();
    target.setPointerCapture(event.pointerId);
    gesture = {
      id: event.pointerId,
      target,
      width: bounds.width,
      x: event.clientX,
      start: viewport.value.fromMs,
      span: viewport.value.toMs - viewport.value.fromMs,
      duration: durationMs.value,
      moved: false,
      wasFollowing: following.value,
    };
    dragKind.value = kind;
    return true;
  }
  function moveDrag(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    if (!gesture.moved && Math.abs(dx) < 3) return;
    gesture.moved = true;
    following.value = false;
    const delta =
      (dx / gesture.width) *
      (dragKind.value === 'overview' ? gesture.duration : -gesture.span);
    startMs.value = waveformRange(
      gesture.duration,
      gesture.start + delta,
      gesture.span,
    ).fromMs;
  }
  function finishDrag(event) {
    if (!gesture || event.pointerId !== gesture.id) return false;
    moveDrag(event);
    const changed = gesture.moved && viewport.value.fromMs !== gesture.start;
    release();
    return changed ? show(viewport.value.fromMs) : false;
  }
  function zoom(direction) {
    const next = zoomIndex.value + direction;
    if (
      next < 0 ||
      next >= WAVEFORM_ZOOM_SPANS.length ||
      !waveform.overview.value ||
      waveform.clearing.value
    )
      return false;
    cancelDrag();
    const { fromMs, toMs } = viewport.value,
      position = toValue(positionMs);
    const focus =
      Number.isFinite(position) && position >= fromMs && position <= toMs
        ? position
        : (fromMs + toMs) / 2;
    zoomIndex.value = next;
    return show(focus - WAVEFORM_ZOOM_SPANS[next] / 2);
  }
  function navigate(direction) {
    cancelDrag();
    following.value = false;
    return show(
      viewport.value.fromMs + direction * WAVEFORM_ZOOM_SPANS[zoomIndex.value],
    );
  }
  function moveOverviewWithKey(event) {
    const span = WAVEFORM_ZOOM_SPANS[zoomIndex.value];
    const target = {
      ArrowLeft: viewport.value.fromMs - span,
      ArrowDown: viewport.value.fromMs - span,
      ArrowRight: viewport.value.fromMs + span,
      ArrowUp: viewport.value.fromMs + span,
      PageDown: viewport.value.fromMs - span * 5,
      PageUp: viewport.value.fromMs + span * 5,
      Home: 0,
      End: durationMs.value - span,
    }[event.key];
    if (
      !Number.isFinite(target) ||
      !waveform.open.value ||
      !waveform.overview.value ||
      waveform.clearing.value
    )
      return false;
    event.preventDefault();
    event.stopPropagation();
    cancelDrag();
    following.value = false;
    return show(target);
  }
  watch(
    [waveform.open, waveform.overview, waveform.clearing],
    ([open, overview, clearing]) => {
      if (!open || !overview || clearing) cancelDrag();
      if (!open) {
        startMs.value = 0;
        zoomIndex.value = 0;
        following.value = true;
        initialPosition = true;
      }
      requested = null;
    },
    { flush: 'sync' },
  );
  function setFollowing(value) {
    cancelDrag();
    following.value = Boolean(value);
    const position = toValue(positionMs);
    if (following.value && Number.isFinite(position))
      return show(position - WAVEFORM_ZOOM_SPANS[zoomIndex.value] / 2);
    return false;
  }
  watch(
    [following, () => toValue(isPlaying), () => toValue(active)],
    (values) => {
      if (values.some((value) => !value)) {
        requested = null;
        void waveform.cancelPrefetch?.();
      }
    },
    { flush: 'sync' },
  );
  watch(
    [
      () => toValue(positionMs),
      () => toValue(isPlaying),
      following,
      zoomIndex,
      dragKind,
      waveform.overview,
      waveform.open,
      () => toValue(active),
    ],
    () => {
      const position = toValue(positionMs);
      if (
        !waveform.open.value ||
        !waveform.overview.value ||
        !Number.isFinite(position) ||
        gesture ||
        !following.value ||
        !toValue(active)
      )
        return;
      const outside =
        position < viewport.value.fromMs || position > viewport.value.toMs;
      if (toValue(isPlaying) || (initialPosition && outside))
        void show(position - WAVEFORM_ZOOM_SPANS[zoomIndex.value] / 2, false);
      initialPosition = false;
    },
    { immediate: true },
  );
  onScopeDispose(() => cancelDrag());
  return {
    viewport,
    zoomIndex,
    zoomSpans: WAVEFORM_ZOOM_SPANS,
    isDragging,
    dragKind,
    following,
    setFollowing,
    startDrag,
    moveDrag,
    finishDrag,
    cancelDrag,
    zoom,
    navigate,
    moveOverviewWithKey,
  };
}
