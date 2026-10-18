<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import { ChevronRight, ICON_SIZE } from '../../icons/index.js';
import { useFloatingSurfaceGate } from '../../composables/useFloatingSurfaceGate.js';
import { useUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import {
  anchoredFloatingLayout,
  customLengthPixels,
  pointFloatingPosition,
} from './floatingPosition.js';
import { actionMenuPresentation, actionMenuWidth } from './actionMenuModel.js';
import UiScrollRegion from './UiScrollRegion.vue';
import UiSearchBox from './UiSearchBox.vue';

const overlayHost = useUiOverlayHost();

const props = defineProps({
  id: { type: String, default: '' },
  open: { type: Boolean, default: false },
  anchor: {
    type: Object,
    default: () => ({ kind: 'point', x: 0, y: 0 }),
    validator: (value) => ['element', 'point'].includes(value?.kind),
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  dir: {
    type: String,
    default: 'auto',
    validator: (value) => ['auto', 'ltr', 'rtl'].includes(value),
  },
  ariaLabel: { type: String, default: '操作選單' },
  content: {
    type: Object,
    default: () => ({ kind: 'actions', groups: [] }),
  },
});

const emit = defineEmits(['select', 'close']);
const { claim, release } = useFloatingSurfaceGate();
const instanceId = useId().replaceAll(':', '');
const rootItemsId = `ui-action-menu-${instanceId}-root-items`;
const childItemsId = `ui-action-menu-${instanceId}-child-items`;

const MAX_MENU_HEIGHT_REM = 20;
const VIEWPORT_MARGIN_REM = 0.5;
const FLOATING_GAP_REM = 0.5;
const TYPEAHEAD_RESET_MS = 500;

const menuRef = useTemplateRef('menu');
const menuFilterRef = useTemplateRef('menuFilter');
const submenuRef = useTemplateRef('submenu');
const submenuFilterRef = useTemplateRef('submenuFilter');

const position = shallowRef({ left: 0, top: 0, side: 'pointer' });
const activeSubmenuId = shallowRef(null);
const submenuRevision = shallowRef(0);
const activeRootIndex = shallowRef(0);
const activeChildIndex = shallowRef(0);
const rootQuery = shallowRef('');
const submenuQuery = shallowRef('');
const rootItemRefs = [];
const childItemRefs = [];

let focusOrigin = null;
let frameId = 0;
let typeaheadBuffer = '';
let typeaheadTimer = 0;

const menuRoot = () => menuRef.value;
const submenuRoot = () => submenuRef.value;
const anchorElement = computed(() =>
  props.anchor?.kind === 'element' ? (props.anchor.element ?? null) : null,
);
const desiredMenuWidth = computed(() => actionMenuWidth(props.size));
const rootPresentation = computed(() =>
  actionMenuPresentation(props.content, rootQuery.value),
);

function indexedEntries(entries) {
  let focusIndex = 0;
  return entries.map((item) => ({
    item,
    focusIndex: item.kind === 'separator' ? -1 : focusIndex++,
  }));
}

function splitEntries(content, presentation) {
  const entries = indexedEntries(presentation.entries);
  if (content.kind !== 'filterable-actions') {
    return { all: entries, pinned: [], body: entries };
  }

  const pinnedCount = content.pinnedItems?.length ?? 0;
  const pinned = entries.slice(0, pinnedCount);
  const afterPinned = entries.slice(pinnedCount);
  const body =
    afterPinned[0]?.item.kind === 'separator'
      ? afterPinned.slice(1)
      : afterPinned;
  return { all: entries, pinned, body };
}

const rootEntrySet = computed(() =>
  splitEntries(props.content, rootPresentation.value),
);
const rootItems = computed(() =>
  rootEntrySet.value.all
    .filter((entry) => entry.focusIndex >= 0)
    .map((entry) => entry.item),
);
const activeSubmenuEntry = computed(
  () =>
    rootEntrySet.value.all.find(
      (entry) =>
        entry.item.kind === 'submenu' &&
        entry.item.id === activeSubmenuId.value,
    ) ?? null,
);
const submenuContent = computed(
  () => activeSubmenuEntry.value?.item.content ?? null,
);
const submenuPresentation = computed(() =>
  submenuContent.value
    ? actionMenuPresentation(submenuContent.value, submenuQuery.value)
    : { entries: [], focusableItems: [], emptyText: '' },
);
const submenuEntrySet = computed(() =>
  submenuContent.value
    ? splitEntries(submenuContent.value, submenuPresentation.value)
    : { all: [], pinned: [], body: [] },
);
const childItems = computed(() =>
  submenuEntrySet.value.all
    .filter((entry) => entry.focusIndex >= 0)
    .map((entry) => entry.item),
);

function layoutFor(items) {
  const hasIcon = items.some((item) => item.icon);
  const hasTrailing = items.some(
    (item) => item.shortcut || item.disabledReason,
  );
  const hasSubmenu = items.some((item) => item.kind === 'submenu');
  const columns = [
    hasIcon ? 'var(--ui-space-4)' : '',
    'minmax(0, 1fr)',
    hasTrailing ? 'fit-content(50%)' : '',
    hasSubmenu ? 'var(--ui-space-4)' : '',
  ].filter(Boolean);
  return {
    hasIcon,
    hasTrailing,
    hasSubmenu,
    gridStyle: { gridTemplateColumns: columns.join(' ') },
  };
}

const rootLayout = computed(() => layoutFor(rootItems.value));
const childLayout = computed(() => layoutFor(childItems.value));
const desiredSubmenuWidth = computed(() =>
  actionMenuWidth(activeSubmenuEntry.value?.item.size ?? props.size),
);

const menuStyle = computed(() => ({
  left: `${position.value.left}px`,
  top: `${position.value.top}px`,
  width: `${desiredMenuWidth.value}px`,
}));

function resolvedDirection() {
  if (props.dir !== 'auto') return props.dir;
  if (typeof window === 'undefined') return 'ltr';
  const target = anchorElement.value ?? menuRoot();
  return window.getComputedStyle(target).direction === 'rtl' ? 'rtl' : 'ltr';
}

function measuredRect(element) {
  const rect = element?.getBoundingClientRect?.();
  return rect && (rect.width > 0 || rect.height > 0) ? rect : null;
}

function estimatedHeight(content, itemCount) {
  const rowHeight = customLengthPixels('--ui-floating-row-min-height', 2);
  const rowGap = customLengthPixels('--ui-space-1', 0.25);
  const filterHeight =
    content?.kind === 'filterable-actions'
      ? customLengthPixels('--ui-field-height', 2.25) +
        customLengthPixels('--ui-floating-list-padding', 0.5) * 2
      : 0;
  return Math.min(
    customLengthPixels('--ui-action-menu-max-block-size', MAX_MENU_HEIGHT_REM),
    filterHeight +
      Math.max(1, itemCount) * rowHeight +
      Math.max(0, itemCount - 1) * rowGap,
  );
}

const rootPlacement = computed(() =>
  props.anchor?.kind === 'element' && position.value.side !== 'pointer'
    ? `${position.value.side}-${position.value.alignment}`
    : 'pointer',
);

function clampRootPosition() {
  if (!props.open || typeof window === 'undefined') return;
  const rect = measuredRect(menuRoot());
  const surface = {
    width: rect?.width ?? desiredMenuWidth.value,
    height:
      rect?.height ?? estimatedHeight(props.content, rootItems.value.length),
  };
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const inset = customLengthPixels(
    '--ui-floating-viewport-inset',
    VIEWPORT_MARGIN_REM,
  );
  const elementRect = anchorElement.value?.getBoundingClientRect?.();

  if (elementRect) {
    const layout = anchoredFloatingLayout({
      anchor: elementRect,
      surface,
      viewport,
      placement: 'bottom-start',
      direction: resolvedDirection(),
      gap: customLengthPixels('--ui-floating-gap', FLOATING_GAP_REM),
      inset,
      flipAlignment: true,
    });
    position.value = layout;
    return;
  }

  const point = pointFloatingPosition({
    point: {
      x: Number(props.anchor?.x) || 0,
      y: Number(props.anchor?.y) || 0,
    },
    surface,
    viewport,
    direction: resolvedDirection(),
    inset,
    flipInline: true,
  });
  position.value = {
    left: point.left,
    top: point.top,
    side: 'pointer',
  };
}

const submenuPlacement = computed(() => {
  submenuRevision.value;
  if (!activeSubmenuEntry.value || typeof window === 'undefined') return null;
  const rootRect = measuredRect(menuRoot());
  const parentRect = measuredRect(
    rootItemRefs[activeSubmenuEntry.value.focusIndex],
  );
  if (!rootRect || !parentRect) return null;
  const submenuRect = measuredRect(submenuRoot());
  const anchor = {
    left: rootRect.left,
    right: rootRect.right,
    top: parentRect.top,
    bottom: parentRect.bottom,
    width: rootRect.width,
    height: parentRect.height,
  };
  return anchoredFloatingLayout({
    anchor,
    surface: {
      width: submenuRect?.width ?? desiredSubmenuWidth.value,
      height:
        submenuRect?.height ??
        estimatedHeight(submenuContent.value, childItems.value.length),
    },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    placement: 'end-start',
    direction: resolvedDirection(),
    gap: customLengthPixels('--ui-floating-gap', FLOATING_GAP_REM),
    inset: customLengthPixels(
      '--ui-floating-viewport-inset',
      VIEWPORT_MARGIN_REM,
    ),
  });
});

const submenuStyle = computed(() => ({
  left: `${submenuPlacement.value?.left ?? position.value.left}px`,
  top: `${submenuPlacement.value?.top ?? position.value.top}px`,
  width: `${submenuPlacement.value?.width ?? desiredSubmenuWidth.value}px`,
}));
const submenuOpensLeft = computed(
  () => submenuPlacement.value?.side === 'left',
);

function scheduleFrame(callback) {
  if (typeof window === 'undefined') return;
  if (frameId && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
  }
  if (typeof window.requestAnimationFrame === 'function') {
    frameId = window.requestAnimationFrame(callback);
    return;
  }
  callback();
}

function itemDomId(scope, entry) {
  const safeId = String(entry.item.id).replace(/[^a-zA-Z0-9_-]/gu, '-');
  return `ui-action-menu-${instanceId}-${scope}-${safeId}`;
}

function activeDescendant(scope) {
  const entries =
    scope === 'child' ? submenuEntrySet.value.all : rootEntrySet.value.all;
  const activeIndex =
    scope === 'child' ? activeChildIndex.value : activeRootIndex.value;
  const entry = entries.find(
    (candidate) => candidate.focusIndex === activeIndex,
  );
  return entry ? itemDomId(scope, entry) : undefined;
}

const rootActiveDescendant = computed(() => activeDescendant('root'));
const childActiveDescendant = computed(() => activeDescendant('child'));

function setItemRef(element, focusIndex, scope) {
  const refs = scope === 'child' ? childItemRefs : rootItemRefs;
  if (element) refs[focusIndex] = element;
  else delete refs[focusIndex];
}

function focusAt(scope, index) {
  const refs = scope === 'child' ? childItemRefs : rootItemRefs;
  const items = scope === 'child' ? childItems.value : rootItems.value;
  if (!items.length) {
    (scope === 'child' ? submenuRoot() : menuRoot())?.focus?.();
    return;
  }
  const nextIndex = ((index % items.length) + items.length) % items.length;
  if (scope === 'child') activeChildIndex.value = nextIndex;
  else activeRootIndex.value = nextIndex;
  nextTick(() => refs[nextIndex]?.focus?.());
}

function focusContent(scope) {
  const content = scope === 'child' ? submenuContent.value : props.content;
  if (content?.kind === 'filterable-actions') {
    nextTick(() =>
      (scope === 'child'
        ? submenuFilterRef.value
        : menuFilterRef.value
      )?.focus?.(),
    );
    return;
  }
  focusAt(scope, 0);
}

function restoreFocusOrigin() {
  if (focusOrigin?.isConnected !== false) focusOrigin?.focus?.();
}

function requestClose({ restoreFocus = false } = {}) {
  activeSubmenuId.value = null;
  if (restoreFocus) restoreFocusOrigin();
  emit('close');
}

function closeFromGate() {
  requestClose();
}

function openSubmenu(entry, focusChild = false) {
  if (entry.item.disabled || entry.item.kind !== 'submenu') return;
  activeRootIndex.value = entry.focusIndex;
  activeSubmenuId.value = entry.item.id;
  activeChildIndex.value = 0;
  submenuQuery.value = '';
  nextTick(() => {
    scheduleFrame(() => {
      submenuRevision.value += 1;
      if (focusChild) focusContent('child');
    });
  });
}

function closeSubmenu({ restoreParent = false } = {}) {
  const parentIndex =
    activeSubmenuEntry.value?.focusIndex ?? activeRootIndex.value;
  activeSubmenuId.value = null;
  submenuQuery.value = '';
  if (restoreParent) focusAt('root', parentIndex);
}

function selectEntry(entry, event) {
  if (entry.item.disabled) {
    event?.preventDefault?.();
    return;
  }
  if (entry.item.kind === 'submenu') {
    openSubmenu(entry, event?.detail === 0);
    return;
  }
  emit('select', entry.item.value ?? entry.item, entry.item);
  requestClose({ restoreFocus: true });
}

function directionKeys() {
  return resolvedDirection() === 'rtl'
    ? { forward: 'ArrowLeft', back: 'ArrowRight' }
    : { forward: 'ArrowRight', back: 'ArrowLeft' };
}

function useTypeahead(event, scope, currentIndex) {
  if (
    event.key.length !== 1 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.key === ' '
  ) {
    return false;
  }
  const items = scope === 'child' ? childItems.value : rootItems.value;
  if (!items.length) return false;
  typeaheadBuffer += event.key.toLocaleLowerCase();
  clearTimeout(typeaheadTimer);
  typeaheadTimer = setTimeout(() => {
    typeaheadBuffer = '';
  }, TYPEAHEAD_RESET_MS);
  const start = (currentIndex + 1) % items.length;
  const ordered = [...items.slice(start), ...items.slice(0, start)];
  let matched = ordered.find((item) =>
    String(item.label ?? '')
      .toLocaleLowerCase()
      .startsWith(typeaheadBuffer),
  );
  if (!matched && typeaheadBuffer.length > 1) {
    typeaheadBuffer = event.key.toLocaleLowerCase();
    matched = ordered.find((item) =>
      String(item.label ?? '')
        .toLocaleLowerCase()
        .startsWith(typeaheadBuffer),
    );
  }
  if (!matched) return false;
  event.preventDefault();
  event.stopPropagation();
  focusAt(scope, items.indexOf(matched));
  return true;
}

function onItemKeydown(event, scope, entry) {
  const currentIndex =
    scope === 'child' ? activeChildIndex.value : activeRootIndex.value;
  const items = scope === 'child' ? childItems.value : rootItems.value;
  const { forward, back } = directionKeys();

  if (event.key === 'Tab') {
    restoreFocusOrigin();
    requestClose();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    requestClose({ restoreFocus: true });
    return;
  }
  if (scope === 'child' && event.key === back) {
    event.preventDefault();
    event.stopPropagation();
    closeSubmenu({ restoreParent: true });
    return;
  }
  if (
    scope === 'root' &&
    event.key === forward &&
    entry.item.kind === 'submenu' &&
    !entry.item.disabled
  ) {
    event.preventDefault();
    event.stopPropagation();
    openSubmenu(entry, true);
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    focusAt(scope, currentIndex + (event.key === 'ArrowDown' ? 1 : -1));
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    event.stopPropagation();
    focusAt(scope, event.key === 'Home' ? 0 : items.length - 1);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    selectEntry(entry, event);
    return;
  }
  useTypeahead(event, scope, currentIndex);
}

function onFilterKeydown(event, scope) {
  const items = scope === 'child' ? childItems.value : rootItems.value;
  const currentIndex =
    scope === 'child' ? activeChildIndex.value : activeRootIndex.value;
  const query = scope === 'child' ? submenuQuery : rootQuery;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (query.value) {
      query.value = '';
      return;
    }
    requestClose({ restoreFocus: true });
    return;
  }
  if (event.key === 'Tab') {
    restoreFocusOrigin();
    requestClose();
    return;
  }
  if (!items.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    const nextIndex =
      (((currentIndex + (event.key === 'ArrowDown' ? 1 : -1)) % items.length) +
        items.length) %
      items.length;
    if (scope === 'child') activeChildIndex.value = nextIndex;
    else activeRootIndex.value = nextIndex;
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = event.key === 'Home' ? 0 : items.length - 1;
    if (scope === 'child') activeChildIndex.value = nextIndex;
    else activeRootIndex.value = nextIndex;
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    const entrySet =
      scope === 'child' ? submenuEntrySet.value.all : rootEntrySet.value.all;
    const entry = entrySet.find(
      (candidate) => candidate.focusIndex === currentIndex,
    );
    if (entry) selectEntry(entry, event);
  }
}

function showSubmenu(entry) {
  if (entry.item.kind === 'submenu' && !entry.item.disabled) {
    openSubmenu(entry);
  } else {
    activeSubmenuId.value = null;
  }
}

function onMenuKeydown(event) {
  if (event.target !== event.currentTarget) return;
  if (event.key === 'Tab') {
    restoreFocusOrigin();
    requestClose();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    requestClose({ restoreFocus: true });
  }
}

function isInsideMenu(target, event) {
  if (!target) return false;
  const roots = [menuRoot(), submenuRoot()].filter(Boolean);
  const eventPath = event?.composedPath?.() ?? [];
  const isMenuSurface = (node) =>
    node?.matches?.('.ui-action-menu') ||
    node?.classList?.contains?.('ui-action-menu') ||
    String(node?.props?.class ?? '')
      .split(/\s+/u)
      .includes('ui-action-menu');
  if (eventPath.some((node) => roots.includes(node) || isMenuSurface(node))) {
    return true;
  }
  if (roots.some((root) => root === target || root.contains?.(target))) {
    return true;
  }
  let current = target;
  while (current) {
    if (roots.includes(current)) return true;
    current = current.parentElement ?? current.parentNode ?? current.parent;
  }
  return false;
}

function onOutsidePointer(event) {
  if (!props.open || isInsideMenu(event.target, event)) return;
  requestClose();
}

function onOutsideContextMenu(event) {
  if (!props.open || isInsideMenu(event.target, event)) return;
  requestClose();
}

function onWindowScroll(event) {
  if (!props.open) return;
  if (isInsideMenu(event.target, event)) {
    if (activeSubmenuEntry.value) {
      scheduleFrame(() => {
        submenuRevision.value += 1;
      });
    }
    return;
  }
  requestClose();
}

function onWindowResize() {
  if (props.open) requestClose();
}

watch(
  () => [props.open, props.anchor, props.size, props.dir],
  ([isOpen]) => {
    activeSubmenuId.value = null;
    activeRootIndex.value = 0;
    rootQuery.value = '';
    submenuQuery.value = '';
    if (!isOpen) {
      release(closeFromGate);
      return;
    }
    focusOrigin =
      typeof document === 'undefined' ? null : document.activeElement;
    claim(closeFromGate);
    nextTick(() => {
      scheduleFrame(() => {
        clampRootPosition();
        focusContent('root');
      });
    });
  },
  { immediate: true },
);

watch(
  () => rootPresentation.value.focusableItems.map((item) => item.id),
  () => {
    activeRootIndex.value = 0;
  },
);

watch(
  () => submenuPresentation.value.focusableItems.map((item) => item.id),
  () => {
    activeChildIndex.value = 0;
  },
);

onMounted(() => {
  if (typeof window === 'undefined') return;
  window.addEventListener('pointerdown', onOutsidePointer, true);
  window.addEventListener('contextmenu', onOutsideContextMenu, true);
  window.addEventListener('scroll', onWindowScroll, true);
  window.addEventListener('resize', onWindowResize);
});

onUnmounted(() => {
  release(closeFromGate);
  if (typeof window === 'undefined') return;
  if (frameId && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
  }
  clearTimeout(typeaheadTimer);
  window.removeEventListener('pointerdown', onOutsidePointer, true);
  window.removeEventListener('contextmenu', onOutsideContextMenu, true);
  window.removeEventListener('scroll', onWindowScroll, true);
  window.removeEventListener('resize', onWindowResize);
});
</script>

<template>
  <Teleport defer :to="overlayHost || undefined" :disabled="!overlayHost">
    <div
      v-if="open"
      :id="id || undefined"
      ref="menu"
      class="ui-action-menu"
      :style="menuStyle"
      :dir="props.dir === 'auto' ? undefined : props.dir"
      :data-placement="rootPlacement"
      :data-content-kind="content.kind"
      role="menu"
      aria-orientation="vertical"
      :aria-label="ariaLabel"
      :tabindex="
        rootItems.length || content.kind === 'filterable-actions'
          ? undefined
          : -1
      "
      @click.stop
      @contextmenu.prevent
      @keydown="onMenuKeydown"
    >
      <UiSearchBox
        v-if="content.kind === 'filterable-actions'"
        ref="menuFilter"
        v-model="rootQuery"
        class="ui-action-menu__filter"
        :label="content.search.label"
        :placeholder="content.search.placeholder"
        autocomplete="off"
        :aria-controls="rootItemsId"
        :aria-activedescendant="rootActiveDescendant"
        @keydown="onFilterKeydown($event, 'root')"
      />

      <div :id="rootItemsId" class="ui-action-menu__items" role="group">
        <div v-if="rootEntrySet.pinned.length" class="ui-action-menu__pinned">
          <button
            v-for="entry in rootEntrySet.pinned"
            :id="itemDomId('root', entry)"
            :key="entry.item.id"
            :ref="(element) => setItemRef(element, entry.focusIndex, 'root')"
            type="button"
            class="ui-action-menu__item"
            :class="{
              'ui-action-menu__item--danger': entry.item.intent === 'danger',
              'ui-action-menu__item--active':
                entry.item.kind === 'submenu' &&
                entry.item.id === activeSubmenuId,
            }"
            :style="rootLayout.gridStyle"
            role="menuitem"
            :tabindex="entry.focusIndex === activeRootIndex ? 0 : -1"
            :aria-disabled="entry.item.disabled ? 'true' : undefined"
            :aria-haspopup="entry.item.kind === 'submenu' ? 'menu' : undefined"
            :aria-expanded="
              entry.item.kind === 'submenu'
                ? entry.item.id === activeSubmenuId
                : undefined
            "
            @mouseenter="showSubmenu(entry)"
            @focus="activeRootIndex = entry.focusIndex"
            @keydown="onItemKeydown($event, 'root', entry)"
            @click="selectEntry(entry, $event)"
          >
            <span
              v-if="rootLayout.hasIcon"
              class="ui-action-menu__icon-slot"
              aria-hidden="true"
            >
              <component
                :is="entry.item.icon"
                v-if="entry.item.icon"
                class="ui-action-menu__icon"
                :size="ICON_SIZE"
              />
            </span>
            <span class="ui-action-menu__label">{{ entry.item.label }}</span>
            <span
              v-if="rootLayout.hasTrailing"
              class="ui-action-menu__trailing"
            >
              {{ entry.item.shortcut || entry.item.disabledReason || '' }}
            </span>
            <span
              v-if="rootLayout.hasSubmenu"
              class="ui-action-menu__chevron-slot"
              aria-hidden="true"
            >
              <ChevronRight
                v-if="entry.item.kind === 'submenu'"
                class="ui-action-menu__chevron"
                :class="{
                  'ui-action-menu__chevron--reverse':
                    entry.item.id === activeSubmenuId && submenuOpensLeft,
                }"
                :size="ICON_SIZE"
              />
            </span>
          </button>
        </div>
        <div
          v-if="rootEntrySet.pinned.length && rootEntrySet.body.length"
          class="ui-action-menu__separator"
          role="separator"
        />

        <UiScrollRegion
          class="ui-action-menu__body"
          axis="vertical"
          viewport-class="ui-action-menu__viewport"
        >
          <p v-if="rootPresentation.emptyText" class="ui-action-menu__empty">
            {{ rootPresentation.emptyText }}
          </p>
          <template v-for="entry in rootEntrySet.body" :key="entry.item.id">
            <div
              v-if="entry.item.kind === 'separator'"
              class="ui-action-menu__separator"
              role="separator"
            />
            <button
              v-else
              :id="itemDomId('root', entry)"
              :ref="(element) => setItemRef(element, entry.focusIndex, 'root')"
              type="button"
              class="ui-action-menu__item"
              :class="{
                'ui-action-menu__item--danger': entry.item.intent === 'danger',
                'ui-action-menu__item--active':
                  entry.item.kind === 'submenu' &&
                  entry.item.id === activeSubmenuId,
              }"
              :style="rootLayout.gridStyle"
              role="menuitem"
              :tabindex="entry.focusIndex === activeRootIndex ? 0 : -1"
              :aria-disabled="entry.item.disabled ? 'true' : undefined"
              :aria-haspopup="
                entry.item.kind === 'submenu' ? 'menu' : undefined
              "
              :aria-expanded="
                entry.item.kind === 'submenu'
                  ? entry.item.id === activeSubmenuId
                  : undefined
              "
              @mouseenter="showSubmenu(entry)"
              @focus="activeRootIndex = entry.focusIndex"
              @keydown="onItemKeydown($event, 'root', entry)"
              @click="selectEntry(entry, $event)"
            >
              <span
                v-if="rootLayout.hasIcon"
                class="ui-action-menu__icon-slot"
                aria-hidden="true"
              >
                <component
                  :is="entry.item.icon"
                  v-if="entry.item.icon"
                  class="ui-action-menu__icon"
                  :size="ICON_SIZE"
                />
              </span>
              <span class="ui-action-menu__label">{{ entry.item.label }}</span>
              <span
                v-if="rootLayout.hasTrailing"
                class="ui-action-menu__trailing"
              >
                {{ entry.item.shortcut || entry.item.disabledReason || '' }}
              </span>
              <span
                v-if="rootLayout.hasSubmenu"
                class="ui-action-menu__chevron-slot"
                aria-hidden="true"
              >
                <ChevronRight
                  v-if="entry.item.kind === 'submenu'"
                  class="ui-action-menu__chevron"
                  :class="{
                    'ui-action-menu__chevron--reverse':
                      entry.item.id === activeSubmenuId && submenuOpensLeft,
                  }"
                  :size="ICON_SIZE"
                />
              </span>
            </button>
          </template>
        </UiScrollRegion>
      </div>

      <div
        v-if="activeSubmenuEntry"
        ref="submenu"
        class="ui-action-menu ui-action-menu--submenu"
        :style="submenuStyle"
        :dir="props.dir === 'auto' ? undefined : props.dir"
        :data-side="submenuPlacement?.side"
        :data-content-kind="submenuContent.kind"
        role="menu"
        aria-orientation="vertical"
        :aria-labelledby="itemDomId('root', activeSubmenuEntry)"
        :tabindex="
          childItems.length || submenuContent.kind === 'filterable-actions'
            ? undefined
            : -1
        "
        @click.stop
        @contextmenu.prevent
        @keydown="onMenuKeydown"
      >
        <UiSearchBox
          v-if="submenuContent.kind === 'filterable-actions'"
          ref="submenuFilter"
          v-model="submenuQuery"
          class="ui-action-menu__filter"
          :label="submenuContent.search.label"
          :placeholder="submenuContent.search.placeholder"
          autocomplete="off"
          :aria-controls="childItemsId"
          :aria-activedescendant="childActiveDescendant"
          @keydown="onFilterKeydown($event, 'child')"
        />

        <div :id="childItemsId" class="ui-action-menu__items" role="group">
          <div
            v-if="submenuEntrySet.pinned.length"
            class="ui-action-menu__pinned"
          >
            <button
              v-for="entry in submenuEntrySet.pinned"
              :id="itemDomId('child', entry)"
              :key="entry.item.id"
              :ref="(element) => setItemRef(element, entry.focusIndex, 'child')"
              type="button"
              class="ui-action-menu__item"
              :class="{
                'ui-action-menu__item--danger': entry.item.intent === 'danger',
              }"
              :style="childLayout.gridStyle"
              role="menuitem"
              :tabindex="entry.focusIndex === activeChildIndex ? 0 : -1"
              :aria-disabled="entry.item.disabled ? 'true' : undefined"
              @focus="activeChildIndex = entry.focusIndex"
              @keydown="onItemKeydown($event, 'child', entry)"
              @click="selectEntry(entry, $event)"
            >
              <span
                v-if="childLayout.hasIcon"
                class="ui-action-menu__icon-slot"
                aria-hidden="true"
              >
                <component
                  :is="entry.item.icon"
                  v-if="entry.item.icon"
                  class="ui-action-menu__icon"
                  :size="ICON_SIZE"
                />
              </span>
              <span class="ui-action-menu__label">{{ entry.item.label }}</span>
              <span
                v-if="childLayout.hasTrailing"
                class="ui-action-menu__trailing"
              >
                {{ entry.item.shortcut || entry.item.disabledReason || '' }}
              </span>
            </button>
          </div>
          <div
            v-if="submenuEntrySet.pinned.length && submenuEntrySet.body.length"
            class="ui-action-menu__separator"
            role="separator"
          />

          <UiScrollRegion
            class="ui-action-menu__body"
            axis="vertical"
            viewport-class="ui-action-menu__viewport"
          >
            <p
              v-if="submenuPresentation.emptyText"
              class="ui-action-menu__empty"
            >
              {{ submenuPresentation.emptyText }}
            </p>
            <template
              v-for="entry in submenuEntrySet.body"
              :key="entry.item.id"
            >
              <div
                v-if="entry.item.kind === 'separator'"
                class="ui-action-menu__separator"
                role="separator"
              />
              <button
                v-else
                :id="itemDomId('child', entry)"
                :ref="
                  (element) => setItemRef(element, entry.focusIndex, 'child')
                "
                type="button"
                class="ui-action-menu__item"
                :class="{
                  'ui-action-menu__item--danger':
                    entry.item.intent === 'danger',
                }"
                :style="childLayout.gridStyle"
                role="menuitem"
                :tabindex="entry.focusIndex === activeChildIndex ? 0 : -1"
                :aria-disabled="entry.item.disabled ? 'true' : undefined"
                @focus="activeChildIndex = entry.focusIndex"
                @keydown="onItemKeydown($event, 'child', entry)"
                @click="selectEntry(entry, $event)"
              >
                <span
                  v-if="childLayout.hasIcon"
                  class="ui-action-menu__icon-slot"
                  aria-hidden="true"
                >
                  <component
                    :is="entry.item.icon"
                    v-if="entry.item.icon"
                    class="ui-action-menu__icon"
                    :size="ICON_SIZE"
                  />
                </span>
                <span class="ui-action-menu__label">{{
                  entry.item.label
                }}</span>
                <span
                  v-if="childLayout.hasTrailing"
                  class="ui-action-menu__trailing"
                >
                  {{ entry.item.shortcut || entry.item.disabledReason || '' }}
                </span>
              </button>
            </template>
          </UiScrollRegion>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-action-menu {
  position: fixed;
  z-index: var(--ui-z-popover);
  box-sizing: border-box;
  min-inline-size: 0;
  max-inline-size: calc(100vw - (2 * var(--ui-floating-viewport-inset)));
  max-block-size: min(
    var(--ui-action-menu-max-block-size),
    calc(100vh - (2 * var(--ui-floating-viewport-inset)))
  );
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--ui-floating-list-bg);
  border: var(--ui-border-width) solid var(--ui-floating-list-border);
  border-radius: var(--ui-floating-list-radius);
  box-shadow: var(--ui-floating-list-shadow);
  user-select: none;
}

.ui-action-menu--submenu {
  z-index: var(--ui-layer-raised);
}

.ui-action-menu__filter {
  flex: 0 0 auto;
  margin: var(--ui-floating-list-padding);
  margin-block-end: 0;
}

.ui-action-menu__pinned {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  flex: 0 0 auto;
  padding: var(--ui-floating-list-padding);
  padding-block-end: 0;
}

.ui-action-menu__items {
  min-block-size: 0;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
}

.ui-action-menu__body {
  min-block-size: 0;
  flex: 1 1 auto;
}

.ui-action-menu :deep(.ui-action-menu__viewport) {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  padding: var(--ui-floating-list-padding);
}

.ui-action-menu__separator
  + .ui-action-menu__body
  :deep(.ui-action-menu__viewport) {
  padding-block-start: 0;
}

.ui-action-menu__body[data-overflow-y='true'] :deep(.ui-action-menu__viewport) {
  padding-inline-end: max(
    var(--ui-floating-list-padding),
    calc(var(--ui-scrollbar-visual-reserve) + var(--ui-space-1))
  );
}

.ui-action-menu__empty {
  margin: 0;
  padding: var(--ui-floating-row-padding-block)
    var(--ui-floating-row-padding-inline);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.ui-action-menu__item {
  display: grid;
  align-items: center;
  column-gap: var(--ui-space-2);
  width: 100%;
  min-height: var(--ui-floating-row-min-height);
  padding: var(--ui-floating-row-padding-block)
    var(--ui-floating-row-padding-inline);
  border: 0;
  border-radius: var(--ui-floating-row-radius);
  background: transparent;
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-floating-row-font-size);
  font-weight: var(--ui-floating-row-font-weight);
  line-height: var(--ui-floating-row-line-height);
  text-align: start;
  cursor: pointer;
}

.ui-action-menu__item--active,
.ui-action-menu__item:hover:not([aria-disabled='true']) {
  background: var(--ui-color-surface-hover);
}

.ui-action-menu__item:active:not([aria-disabled='true']) {
  background: var(--ui-color-surface-active);
}

.ui-action-menu__item:focus-visible {
  background: var(--ui-color-surface-active);
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-action-menu__item[aria-disabled='true'] {
  color: var(--ui-color-text-muted);
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.ui-action-menu__item--danger:not([aria-disabled='true']) {
  color: var(--ui-color-danger);
}

.ui-action-menu__item--danger:hover:not([aria-disabled='true']),
.ui-action-menu__item--danger:active:not([aria-disabled='true']),
.ui-action-menu__item--danger:focus-visible {
  background: var(--ui-color-danger-soft);
}

.ui-action-menu__separator {
  flex: 0 0 auto;
  height: var(--ui-border-width);
  margin: var(--ui-space-1) var(--ui-space-2);
  background: var(--ui-color-border);
}

.ui-action-menu :deep(.ui-action-menu__viewport) > .ui-action-menu__separator {
  margin-block: 0;
}

.ui-action-menu__icon-slot,
.ui-action-menu__chevron-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-4);
  height: var(--ui-space-4);
  color: currentColor;
}

.ui-action-menu__icon,
.ui-action-menu__chevron {
  display: block;
}

.ui-action-menu__chevron--reverse {
  transform: scaleX(-1);
}

.ui-action-menu__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-action-menu__trailing {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  justify-self: end;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  white-space: nowrap;
}
</style>
