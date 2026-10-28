import {
  computed,
  onScopeDispose,
  readonly,
  shallowRef,
  toValue,
  watch,
} from 'vue';
import { isEditableTarget } from '../utils/dom.js';

// Temporary renderer view state only; never writes layout preferences or remounts content.
export function createPanelViewState() {
  const targets = new Map();
  const currentId = shallowRef(null),
    maximizedId = shallowRef(null),
    revision = shallowRef(0);
  const target = () => {
    revision.value;
    const value = targets.get(maximizedId.value ?? currentId.value);
    return value?.element?.isConnected === false ? null : value;
  };
  function blocked(value) {
    return [
      ...(globalThis.document?.querySelectorAll?.(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
      ) ?? []),
    ].some((node) => !value?.overlay || node !== value.element);
  }
  function restore({ focus = true } = {}) {
    if (!maximizedId.value) return false;
    const value = target();
    maximizedId.value = null;
    const focused =
      value?.lastFocus?.isConnected !== false &&
      value?.element?.contains?.(value.lastFocus)
        ? value.lastFocus
        : value?.element;
    if (focus) focused?.focus?.({ preventScroll: true });
    return true;
  }
  function select(id, focused) {
    if (maximizedId.value && maximizedId.value !== id) return;
    const value = targets.get(id);
    if (!value || value.element?.isConnected === false) return;
    currentId.value = id;
    if (focused && value.element.contains?.(focused)) value.lastFocus = focused;
  }
  function toggle(id = currentId.value) {
    const value = targets.get(id);
    if (!value || value.element?.isConnected === false || blocked(value))
      return false;
    if (maximizedId.value === id) return restore();
    if (maximizedId.value) restore({ focus: false });
    currentId.value = id;
    maximizedId.value = id;
    return true;
  }
  function register(id, value) {
    targets.set(id, value);
    revision.value++;
    if (!currentId.value) currentId.value = id;
    return () => {
      if (targets.get(id) !== value) return;
      if (maximizedId.value === id) restore({ focus: false });
      targets.delete(id);
      revision.value++;
      if (currentId.value === id)
        currentId.value = targets.has('workspace')
          ? 'workspace'
          : (targets.keys().next().value ?? null);
    };
  }
  function handleKeydown(event, { recording = false } = {}) {
    const path = event.composedPath?.() ?? [];
    if (path.length > 128 || path.some(isEditableTarget)) return false;
    if (
      !['`', 'Escape'].includes(event.key) ||
      recording ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.getModifierState?.('AltGraph') ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey ||
      isEditableTarget(event.target)
    )
      return false;
    if (event.key === 'Escape' && !maximizedId.value) return false;
    if (!toggle()) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  return {
    currentId: readonly(currentId),
    maximizedId: readonly(maximizedId),
    currentLabel: computed(() => toValue(target()?.label) ?? '面板'),
    actionLabel: computed(() => (maximizedId.value ? '還原面板' : '放大面板')),
    select,
    hasTarget: (id = currentId.value) => {
      revision.value;
      return Boolean(
        targets.get(id)?.element?.isConnected !== false && targets.has(id),
      );
    },
    register,
    toggle,
    restore,
    handleKeydown,
    reset: () => {
      restore({ focus: false });
      targets.clear();
      currentId.value = null;
      revision.value++;
    },
  };
}
const panelView = createPanelViewState();
export const usePanelView = () => panelView;

export function usePanelViewTarget({
  id,
  element,
  label,
  enabled = true,
  context = null,
  overlay = false,
  owner = panelView,
}) {
  let release;
  const stop = watch(
    () => [toValue(element), toValue(enabled), toValue(context)],
    ([node, active]) => {
      release?.();
      release = null;
      if (!node || !active) return;
      const unregister = owner.register(id, { element: node, label, overlay });
      const select = (event) => owner.select(id, event.target);
      node.addEventListener('focusin', select, true);
      node.addEventListener('pointerdown', select, true);
      release = () => {
        node.removeEventListener('focusin', select, true);
        node.removeEventListener('pointerdown', select, true);
        unregister();
      };
    },
    { immediate: true, flush: 'post' },
  );
  onScopeDispose(() => {
    stop();
    release?.();
  });
  return { maximized: computed(() => owner.maximizedId.value === id) };
}
if (import.meta.hot) import.meta.hot.dispose(() => panelView.reset());
