import { shallowRef, watch } from 'vue';
import { maskEdge } from '../../../shared/outputPortraitImage.json';
import { editPortraitLasso } from './phantomPortraitImage.js';

const MAX_UNDO_SELECTIONS = 10;
const MAX_LASSO_POINTS = 512;
const LASSO_PREVIEW_SIZE = 1000;

export function usePortraitRetouch({ photo, frame, alpha, enabled }) {
  const mode = shallowRef('');
  const edits = shallowRef(null);
  const history = shallowRef([]);
  const selection = shallowRef(null);
  let gesture = null;

  function appendPoint(event) {
    const { bounds, points, previewStyle } = gesture;
    const x = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
    const y = Math.min(bounds.height, Math.max(0, event.clientY - bounds.top));
    const previous = points.at(-1);
    if (previous && Math.hypot(x - previous.x, y - previous.y) < 2) return;
    if (points.length === MAX_LASSO_POINTS) {
      gesture.points = points.filter((_, index) => index % 2 === 0);
    }
    gesture.points.push({ x, y });
    selection.value = {
      style: previewStyle,
      points: gesture.points
        .map(
          (point) =>
            `${Math.round((point.x / bounds.width) * LASSO_PREVIEW_SIZE)},${Math.round((point.y / bounds.height) * LASSO_PREVIEW_SIZE)}`,
        )
        .join(' '),
    };
  }

  function cancel() {
    const previous = gesture;
    gesture = null;
    selection.value = null;
    if (previous?.canvas.hasPointerCapture(previous.pointer)) {
      previous.canvas.releasePointerCapture(previous.pointer);
    }
  }

  watch(enabled, (value) => {
    if (!value) cancel();
  });

  function start(event) {
    if (!enabled() || !mode.value || event.button !== 0 || gesture) return;
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const area = canvas.parentElement.getBoundingClientRect();
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    gesture = {
      canvas,
      bounds,
      pointer: event.pointerId,
      points: [],
      crop: frame(),
      previewStyle: {
        left: `${bounds.left - area.left - canvas.parentElement.clientLeft}px`,
        top: `${bounds.top - area.top - canvas.parentElement.clientTop}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      },
    };
    appendPoint(event);
  }

  function move(event) {
    if (gesture?.pointer === event.pointerId) appendPoint(event);
  }

  function finish(event) {
    if (gesture?.pointer !== event.pointerId) return;
    appendPoint(event);
    const {
      bounds,
      crop: { left, top, width, height },
      points,
    } = gesture;
    const source = photo();
    const mapped = points.map(({ x, y }) => ({
      x: ((left + (width * x) / bounds.width) * maskEdge) / source.width,
      y: ((top + (height * y) / bounds.height) * maskEdge) / source.height,
    }));
    cancel();
    const next = editPortraitLasso(edits.value, alpha(), mapped, mode.value);
    if (!next) return;
    history.value = [
      ...history.value.slice(1 - MAX_UNDO_SELECTIONS),
      edits.value,
    ];
    edits.value = next;
  }

  function cancelPointer(event) {
    if (gesture?.pointer === event.pointerId) cancel();
  }

  function cancelFromKeyboard(event) {
    if (!gesture) return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }

  function selectMode(value) {
    cancel();
    mode.value = mode.value === value ? '' : value;
  }

  function undo() {
    if (gesture || !history.value.length) return;
    edits.value = history.value.at(-1);
    history.value = history.value.slice(0, -1);
  }

  return {
    mode,
    edits,
    history,
    selection,
    start,
    move,
    finish,
    cancelPointer,
    cancelFromKeyboard,
    selectMode,
    undo,
    previewSize: LASSO_PREVIEW_SIZE,
  };
}
