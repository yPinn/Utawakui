import { onScopeDispose, readonly, shallowRef, toValue, watch } from 'vue';

// Owns only an ephemeral pointer preview. The existing editor validates the
// whole document and receives one canonical intent on release; no transport I/O.
export function useLyricsWaveformBoundaryDrag({
  enabled,
  context,
  draft,
  viewport,
  offsetMs,
  durationMs,
  preview,
  commit,
  freeze,
}) {
  const previewLine = shallowRef(null),
    invalid = shallowRef(false),
    active = shallowRef(false);
  let gesture = null;
  const endpoint = (kind) =>
    toValue(draft)?.[kind === 'start' ? 'startMs' : 'endMs'];
  function available(kind) {
    const value = endpoint(kind),
      offset = toValue(offsetMs),
      duration = toValue(durationMs);
    return (
      toValue(enabled) &&
      ['start', 'end'].includes(kind) &&
      Number.isSafeInteger(value) &&
      Number.isSafeInteger(offset) &&
      value - offset >= 0 &&
      value - offset <= duration
    );
  }
  function release() {
    const previous = gesture;
    gesture = null;
    active.value = false;
    previewLine.value = null;
    if (previous?.target.hasPointerCapture?.(previous.id))
      previous.target.releasePointerCapture(previous.id);
  }
  function cancel(event) {
    if (event && gesture?.id !== event.pointerId) return;
    release();
    invalid.value = false;
  }
  function begin(event, kind) {
    if (
      gesture ||
      event.button !== 0 ||
      event.isPrimary === false ||
      !available(kind)
    )
      return false;
    const bounds = event.currentTarget
      .closest('.lyrics-waveform__canvas')
      ?.getBoundingClientRect();
    const range = toValue(viewport);
    if (!(bounds?.width > 0) || !(range.toMs > range.fromMs)) return false;
    event.preventDefault();
    event.currentTarget.focus?.({ preventScroll: true });
    freeze();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture = {
      id: event.pointerId,
      target: event.currentTarget,
      kind,
      x: event.clientX,
      width: bounds.width,
      value: endpoint(kind),
      span: range.toMs - range.fromMs,
      offset: toValue(offsetMs),
      duration: toValue(durationMs),
      moved: false,
      next: endpoint(kind),
    };
    active.value = true;
    invalid.value = false;
    return true;
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    if (!gesture.moved && Math.abs(dx) < 3) return;
    gesture.moved = true;
    // Delta mapping avoids a jump when grabbing either edge of the hit target.
    const value = Math.round(
      gesture.value + (dx / gesture.width) * gesture.span,
    );
    gesture.next = value;
    const line =
      value - gesture.offset >= 0 && value - gesture.offset <= gesture.duration
        ? preview(gesture.kind, value)
        : null;
    invalid.value = !line;
    previewLine.value = line;
  }
  function finish(event) {
    if (!gesture || event.pointerId !== gesture.id) return false;
    move(event);
    const { kind, next, value, moved } = gesture;
    const apply =
      moved && next !== value && !invalid.value && previewLine.value;
    release();
    if (apply) {
      commit(kind, next);
      return true;
    }
    return false;
  }
  function key(event, kind) {
    if (event.key === 'Escape' && gesture) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return true;
    }
    const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!direction || gesture || !available(kind)) return false;
    event.preventDefault();
    event.stopPropagation();
    freeze();
    const value = endpoint(kind) + direction * 100;
    const line =
      value - toValue(offsetMs) >= 0 &&
      value - toValue(offsetMs) <= toValue(durationMs)
        ? preview(kind, value)
        : null;
    invalid.value = !line;
    if (line) commit(kind, value);
    return Boolean(line);
  }
  watch(
    () => [
      toValue(enabled),
      toValue(context),
      toValue(draft),
      toValue(offsetMs),
      toValue(durationMs),
      toValue(viewport).fromMs,
      toValue(viewport).toMs,
    ],
    () => cancel(),
    { flush: 'sync' },
  );
  onScopeDispose(() => cancel());
  return {
    active: readonly(active),
    previewLine: readonly(previewLine),
    invalid: readonly(invalid),
    begin,
    move,
    finish,
    cancel,
    key,
  };
}
