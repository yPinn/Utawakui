import { computed, shallowRef } from 'vue';
import {
  constrainPortraitFrame,
  portraitImageBounds,
  portraitSubjectBounds,
  snapPortraitFrame,
  squarePortraitFrame,
  zoomPortraitFrame,
} from './phantomPortraitImage.js';

const MAX_ZOOM = 300;
const MIN_ZOOM = 50;
const ZOOM_STEP = 10;

export function usePortraitFraming({
  photo,
  getVisibleMask,
  guidesEnabled,
  enabled,
}) {
  const adjusted = shallowRef(null);
  const fittedMask = shallowRef(null);
  const panning = shallowRef(false);
  const activeGuides = shallowRef({});
  const imageBounds = computed(
    () => photo.value && portraitImageBounds(photo.value),
  );
  const subject = computed(() => {
    if (!photo.value) return null;
    const alpha = getVisibleMask();
    const { width, height } = photo.value;
    return (
      (alpha && portraitSubjectBounds(alpha, width, height)) ||
      imageBounds.value
    );
  });
  const home = computed(() => {
    if (!photo.value) return null;
    const { width, height } = photo.value;
    return squarePortraitFrame(fittedMask.value, width, height);
  });
  const frame = computed(() => adjusted.value ?? home.value);
  const zoom = computed(() =>
    frame.value
      ? Math.round((100 * home.value.width) / frame.value.width)
      : 100,
  );
  let gesture = null;

  function update(nextFrame) {
    const next = constrainPortraitFrame(nextFrame, photo.value);
    const initial = home.value;
    adjusted.value =
      next.left === initial.left &&
      next.top === initial.top &&
      next.width === initial.width
        ? null
        : next;
    return next;
  }

  function stop() {
    if (!gesture) return;
    const { canvas, pointer } = gesture;
    gesture = null;
    panning.value = false;
    activeGuides.value = {};
    if (canvas.hasPointerCapture(pointer))
      canvas.releasePointerCapture(pointer);
  }

  function reset() {
    stop();
    adjusted.value = null;
  }

  function fitCutout(alpha) {
    if (!adjusted.value && !gesture) fittedMask.value = alpha;
  }

  function changeZoom(direction, x = 0.5, y = 0.5) {
    if (!enabled() || !frame.value || panning.value) return;
    const nextZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, zoom.value + direction * ZOOM_STEP),
    );
    if (nextZoom === zoom.value) return;
    update(zoomPortraitFrame(frame.value, zoom.value / nextZoom, x, y));
  }

  function wheel(event) {
    if (!enabled() || !frame.value || !event.deltaY) return;
    const { left, top, width, height } =
      event.currentTarget.getBoundingClientRect();
    if (!width || !height) return;
    event.preventDefault();
    changeZoom(
      event.deltaY < 0 ? 1 : -1,
      (event.clientX - left) / width,
      (event.clientY - top) / height,
    );
  }

  function start(event) {
    if (!enabled() || !frame.value || event.button !== 0 || gesture) return;
    const canvas = event.currentTarget;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    gesture = {
      canvas,
      pointer: event.pointerId,
      frame: frame.value,
      x: event.clientX,
      y: event.clientY,
      width,
      height,
    };
    panning.value = true;
  }

  function move(event) {
    if (gesture?.pointer !== event.pointerId) return;
    const { frame: origin, x, y, width, height } = gesture;
    const nextFrame = {
      ...origin,
      left: origin.left - ((event.clientX - x) * origin.width) / width,
      top: origin.top - ((event.clientY - y) * origin.height) / height,
    };
    if (!guidesEnabled.value || event.altKey || !subject.value) {
      activeGuides.value = {};
      update(nextFrame);
      return;
    }
    const snap = snapPortraitFrame(
      nextFrame,
      subject.value,
      { width, height },
      activeGuides.value,
    );
    const actual = update(snap.frame);
    activeGuides.value = {
      vertical: actual.left === snap.frame.left ? snap.vertical : null,
      horizontal: actual.top === snap.frame.top ? snap.horizontal : null,
    };
  }

  function end(event) {
    if (gesture?.pointer === event.pointerId) stop();
  }

  function panWithKey(event) {
    if (!enabled() || !frame.value || panning.value) return;
    const offset = {
      ArrowLeft: [1, 0],
      ArrowRight: [-1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    }[event.key];
    if (!offset) return;
    event.preventDefault();
    const current = frame.value;
    update({
      ...current,
      left: current.left + offset[0] * current.width * 0.04,
      top: current.top + offset[1] * current.height * 0.04,
    });
  }

  return {
    frame,
    adjusted,
    zoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    panning,
    activeGuides,
    reset,
    fitCutout,
    changeZoom,
    wheel,
    start,
    move,
    end,
    panWithKey,
  };
}
