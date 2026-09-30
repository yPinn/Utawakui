<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useAttrs,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import { ChevronRight, ICON_SIZE } from '../../icons/index.js';
import { useContextMenuGate } from '../../composables/useContextMenuGate.js';
import UiScrollRegion from '../ui/UiScrollRegion.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  width: { type: Number, default: 220 },
  alignX: {
    type: String,
    default: 'left',
    validator: (value) => ['left', 'right'].includes(value),
  },
  emptyText: { type: String, default: '' },
  items: { type: Array, default: () => [] },
});

const emit = defineEmits(['select', 'close']);
const attrs = useAttrs();
const { claim, release } = useContextMenuGate();
const instanceId = useId().replaceAll(':', '');
const submenuId = `demo-action-menu-${instanceId}-submenu`;

const VIEWPORT_MARGIN_REM = 0.5;
const SUBMENU_GAP_REM = 0.25;
const TYPEAHEAD_RESET_MS = 500;

const menuRef = useTemplateRef('menu');
const submenuRef = useTemplateRef('submenu');
const menuRoot = () => menuRef.value?.root ?? menuRef.value;
const menuViewport = () => menuRef.value?.viewport ?? menuRef.value;
const submenuRoot = () => submenuRef.value?.root ?? submenuRef.value;
const position = shallowRef({ x: props.x, y: props.y });
const submenuPosition = shallowRef({ x: props.x, y: props.y });
const activeRootIndex = shallowRef(0);
const activeChildIndex = shallowRef(0);
const activeSubmenuKey = shallowRef(null);
const rootItemRefs = [];
const childItemRefs = [];

let focusOrigin = null;
let frameId = 0;
let typeaheadBuffer = '';
let typeaheadTimer = 0;

function itemKey(item, index) {
  return item.key ?? item.value ?? item.label ?? `separator-${index}`;
}

function entriesFor(items) {
  let focusIndex = 0;
  return items.map((item, sourceIndex) => ({
    item,
    sourceIndex,
    key: itemKey(item, sourceIndex),
    focusIndex: item.separator ? -1 : focusIndex++,
  }));
}

function layoutFor(items) {
  const contentItems = items.filter((item) => !item.separator);
  const hasIcon = contentItems.some((item) => item.icon);
  const hasSubmenu = contentItems.some((item) => item.children?.length);
  const columns = [
    hasIcon ? '1rem' : '',
    'minmax(0, 1fr)',
    hasSubmenu ? '1rem' : '',
  ].filter(Boolean);

  return {
    hasIcon,
    hasSubmenu,
    gridStyle: { gridTemplateColumns: columns.join(' ') },
  };
}

const rootEntries = computed(() => entriesFor(props.items));
const rootItems = computed(() =>
  rootEntries.value
    .filter((entry) => entry.focusIndex >= 0)
    .map((entry) => entry.item),
);
const rootLayout = computed(() => layoutFor(props.items));
const activeSubmenuEntry = computed(
  () =>
    rootEntries.value.find(
      (entry) =>
        entry.item.children?.length && entry.key === activeSubmenuKey.value,
    ) ?? null,
);
const childEntries = computed(() =>
  entriesFor(activeSubmenuEntry.value?.item.children ?? []),
);
const childItems = computed(() =>
  childEntries.value
    .filter((entry) => entry.focusIndex >= 0)
    .map((entry) => entry.item),
);
const childLayout = computed(() =>
  layoutFor(activeSubmenuEntry.value?.item.children ?? []),
);
const desiredMenuWidth = computed(() => Math.max(0, props.width));
const desiredSubmenuWidth = computed(() =>
  Math.max(
    0,
    activeSubmenuEntry.value?.item.submenuWidth ?? desiredMenuWidth.value,
  ),
);

const menuStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
  width: `${desiredMenuWidth.value}px`,
}));

const submenuStyle = computed(() => ({
  left: `${submenuPosition.value.x}px`,
  top: `${submenuPosition.value.y}px`,
  width: `${desiredSubmenuWidth.value}px`,
}));

function layoutClasses(layout) {
  return {
    'demo-action-menu--has-icon': layout.hasIcon,
    'demo-action-menu--has-submenu': layout.hasSubmenu,
  };
}

function setItemRef(element, index, scope) {
  const refs = scope === 'child' ? childItemRefs : rootItemRefs;
  if (element) refs[index] = element;
  else delete refs[index];
}

function remPixels(value) {
  if (typeof window === 'undefined') return value * 16;
  const rootSize = Number.parseFloat(
    window.getComputedStyle(document.documentElement).fontSize,
  );
  return value * (Number.isFinite(rootSize) ? rootSize : 16);
}

function preferredX(width) {
  return props.alignX === 'right' ? props.x - width : props.x;
}

function menuDirection() {
  return typeof window === 'undefined'
    ? 'ltr'
    : window.getComputedStyle(menuViewport()).direction;
}

function clampRootPosition() {
  if (!props.open || typeof window === 'undefined') return;
  const margin = remPixels(VIEWPORT_MARGIN_REM);
  const rect = menuRoot()?.getBoundingClientRect();
  const width = rect?.width ?? desiredMenuWidth.value;
  const height = rect?.height ?? 0;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);

  position.value = {
    x: Math.max(margin, Math.min(preferredX(width), maxX)),
    y: Math.max(margin, Math.min(props.y, maxY)),
  };
}

function clampSubmenuPosition() {
  const parent = rootItemRefs[activeSubmenuEntry.value?.focusIndex];
  if (!parent || typeof window === 'undefined') return;

  const margin = remPixels(VIEWPORT_MARGIN_REM);
  const gap = remPixels(SUBMENU_GAP_REM);
  const menuRect = menuRoot()?.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const submenuRect = submenuRoot()?.getBoundingClientRect();
  const width = submenuRect?.width ?? desiredSubmenuWidth.value;
  const height = submenuRect?.height ?? 0;
  const rightX = (menuRect?.right ?? parentRect.right) + gap;
  const leftX = (menuRect?.left ?? parentRect.left) - width - gap;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  const prefersRight = menuDirection() !== 'rtl';
  const preferredSideX = prefersRight ? rightX : leftX;
  const alternateSideX = prefersRight ? leftX : rightX;
  const fitsViewport = (x) => x >= margin && x <= maxX;
  const x = fitsViewport(preferredSideX)
    ? preferredSideX
    : fitsViewport(alternateSideX)
      ? alternateSideX
      : Math.max(margin, Math.min(preferredSideX, maxX));

  submenuPosition.value = {
    x,
    y: Math.max(margin, Math.min(parentRect.top, maxY)),
  };
}

function scheduleFrame(callback) {
  if (typeof window === 'undefined') return;
  window.cancelAnimationFrame(frameId);
  frameId = window.requestAnimationFrame(callback);
}

function focusAt(scope, index) {
  const refs = scope === 'child' ? childItemRefs : rootItemRefs;
  const items = scope === 'child' ? childItems.value : rootItems.value;
  if (!items.length) {
    menuViewport()?.focus();
    return;
  }

  const nextIndex = ((index % items.length) + items.length) % items.length;
  if (scope === 'child') activeChildIndex.value = nextIndex;
  else activeRootIndex.value = nextIndex;
  nextTick(() => refs[nextIndex]?.focus());
}

function focusFirstItem() {
  focusAt('root', 0);
}

function restoreFocusOrigin() {
  if (focusOrigin?.isConnected !== false) focusOrigin?.focus?.();
}

function requestClose({ restoreFocus = false } = {}) {
  activeSubmenuKey.value = null;
  if (restoreFocus) restoreFocusOrigin();
  emit('close');
}

function closeFromGate() {
  requestClose();
}

function openSubmenu(entry, focusChild = false) {
  if (entry.item.disabled || !entry.item.children?.length) return;
  activeRootIndex.value = entry.focusIndex;
  activeSubmenuKey.value = entry.key;
  activeChildIndex.value = 0;
  nextTick(() => {
    scheduleFrame(() => {
      clampSubmenuPosition();
      if (focusChild) focusAt('child', 0);
    });
  });
}

function closeSubmenu({ restoreParent = false } = {}) {
  const parentIndex =
    activeSubmenuEntry.value?.focusIndex ?? activeRootIndex.value;
  activeSubmenuKey.value = null;
  if (restoreParent) focusAt('root', parentIndex);
}

function selectItem(entry, event) {
  if (entry.item.disabled) {
    event?.preventDefault?.();
    return;
  }
  if (entry.item.children?.length) {
    openSubmenu(entry, event?.detail === 0);
    return;
  }
  emit('select', entry.item.value ?? entry.item, entry.item);
  requestClose({ restoreFocus: true });
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

function directionKeys() {
  return menuDirection() === 'rtl'
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
    entry.item.children?.length &&
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
    selectItem(entry, event);
    return;
  }
  useTypeahead(event, scope, currentIndex);
}

function showSubmenu(entry) {
  if (!entry.item.disabled && entry.item.children?.length) {
    openSubmenu(entry);
  } else {
    activeSubmenuKey.value = null;
  }
}

function onOutsidePointer(event) {
  if (!props.open || menuRoot()?.contains(event.target)) return;
  requestClose();
}

function onOutsideContextMenu(event) {
  if (!props.open || menuRoot()?.contains(event.target)) return;
  requestClose();
}

function onViewportScroll(event) {
  if (!props.open) return;
  const target = event?.target;
  if (target && menuRoot()?.contains(target)) {
    if (target === menuViewport() && activeSubmenuEntry.value) {
      scheduleFrame(clampSubmenuPosition);
    }
    return;
  }
  requestClose();
}

function onViewportResize() {
  if (props.open) requestClose();
}

watch(
  () => [props.open, props.x, props.y, props.width, props.alignX],
  ([isOpen]) => {
    position.value = {
      x: preferredX(desiredMenuWidth.value),
      y: props.y,
    };
    activeSubmenuKey.value = null;
    if (!isOpen) {
      release(closeFromGate);
      return;
    }

    focusOrigin =
      typeof document === 'undefined' ? null : document.activeElement;
    activeRootIndex.value = 0;
    claim(closeFromGate);
    nextTick(() => {
      scheduleFrame(() => {
        clampRootPosition();
        focusFirstItem();
      });
    });
  },
  { immediate: true },
);

watch(
  () => props.items,
  () => {
    activeRootIndex.value = 0;
    activeSubmenuKey.value = null;
    if (props.open) nextTick(focusFirstItem);
  },
  { deep: true },
);

onMounted(() => {
  if (typeof window === 'undefined') return;
  window.addEventListener('pointerdown', onOutsidePointer, true);
  window.addEventListener('contextmenu', onOutsideContextMenu, true);
  window.addEventListener('scroll', onViewportScroll, true);
  window.addEventListener('resize', onViewportResize);
});

onUnmounted(() => {
  release(closeFromGate);
  if (typeof window === 'undefined') return;
  window.cancelAnimationFrame(frameId);
  clearTimeout(typeaheadTimer);
  window.removeEventListener('pointerdown', onOutsidePointer, true);
  window.removeEventListener('contextmenu', onOutsideContextMenu, true);
  window.removeEventListener('scroll', onViewportScroll, true);
  window.removeEventListener('resize', onViewportResize);
});
</script>

<template>
  <Teleport to="body">
    <UiScrollRegion
      v-if="open"
      v-bind="attrs"
      ref="menu"
      class="demo-action-menu"
      axis="vertical"
      viewport-class="demo-action-menu__viewport"
      :class="layoutClasses(rootLayout)"
      :style="menuStyle"
      role="menu"
      aria-orientation="vertical"
      :tabindex="rootItems.length ? undefined : -1"
      data-demo-action-menu="candidate"
      @click.stop
      @contextmenu.prevent
      @keydown="onMenuKeydown"
    >
      <p v-if="rootItems.length === 0" class="demo-action-menu__empty">
        {{ emptyText }}
      </p>
      <template v-for="entry in rootEntries" :key="entry.key">
        <div
          v-if="entry.item.separator"
          class="demo-action-menu__separator"
          role="separator"
        />
        <button
          v-else
          :id="`demo-action-menu-${instanceId}-item-${entry.focusIndex}`"
          :ref="(element) => setItemRef(element, entry.focusIndex, 'root')"
          type="button"
          class="demo-action-menu__item"
          :class="{
            'demo-action-menu__item--danger': entry.item.danger,
            'demo-action-menu__item--active':
              entry.item.children?.length && entry.key === activeSubmenuKey,
          }"
          :style="rootLayout.gridStyle"
          role="menuitem"
          :tabindex="entry.focusIndex === activeRootIndex ? 0 : -1"
          :aria-disabled="entry.item.disabled ? 'true' : undefined"
          :aria-haspopup="entry.item.children?.length ? 'menu' : undefined"
          :aria-controls="entry.item.children?.length ? submenuId : undefined"
          :aria-expanded="
            entry.item.children?.length
              ? entry.key === activeSubmenuKey
              : undefined
          "
          @mouseenter="showSubmenu(entry)"
          @focus="activeRootIndex = entry.focusIndex"
          @keydown="onItemKeydown($event, 'root', entry)"
          @click="selectItem(entry, $event)"
        >
          <span
            v-if="rootLayout.hasIcon"
            class="demo-action-menu__icon-slot"
            aria-hidden="true"
          >
            <component
              :is="entry.item.icon"
              v-if="entry.item.icon"
              class="demo-action-menu__icon"
              :size="ICON_SIZE"
            />
          </span>
          <span class="demo-action-menu__label">{{ entry.item.label }}</span>
          <span
            v-if="rootLayout.hasSubmenu"
            class="demo-action-menu__chevron-slot"
            aria-hidden="true"
          >
            <ChevronRight
              v-if="entry.item.children?.length"
              class="demo-action-menu__chevron"
              :size="ICON_SIZE"
            />
          </span>
        </button>
      </template>

      <UiScrollRegion
        v-if="activeSubmenuEntry"
        :id="submenuId"
        ref="submenu"
        class="demo-action-menu demo-action-menu--submenu"
        axis="vertical"
        viewport-class="demo-action-menu__viewport"
        :class="layoutClasses(childLayout)"
        :style="submenuStyle"
        role="menu"
        aria-orientation="vertical"
        :aria-labelledby="`demo-action-menu-${instanceId}-item-${activeSubmenuEntry.focusIndex}`"
        @click.stop
        @contextmenu.prevent
      >
        <template v-for="entry in childEntries" :key="entry.key">
          <div
            v-if="entry.item.separator"
            class="demo-action-menu__separator"
            role="separator"
          />
          <button
            v-else
            :ref="(element) => setItemRef(element, entry.focusIndex, 'child')"
            type="button"
            class="demo-action-menu__item"
            :class="{
              'demo-action-menu__item--danger': entry.item.danger,
            }"
            :style="childLayout.gridStyle"
            role="menuitem"
            :tabindex="entry.focusIndex === activeChildIndex ? 0 : -1"
            :aria-disabled="entry.item.disabled ? 'true' : undefined"
            @focus="activeChildIndex = entry.focusIndex"
            @keydown="onItemKeydown($event, 'child', entry)"
            @click="selectItem(entry, $event)"
          >
            <span
              v-if="childLayout.hasIcon"
              class="demo-action-menu__icon-slot"
              aria-hidden="true"
            >
              <component
                :is="entry.item.icon"
                v-if="entry.item.icon"
                class="demo-action-menu__icon"
                :size="ICON_SIZE"
              />
            </span>
            <span class="demo-action-menu__label">{{ entry.item.label }}</span>
            <span
              v-if="childLayout.hasSubmenu"
              class="demo-action-menu__chevron-slot"
              aria-hidden="true"
            />
          </button>
        </template>
      </UiScrollRegion>
    </UiScrollRegion>
  </Teleport>
</template>

<style scoped>
.demo-action-menu {
  position: fixed;
  z-index: var(--ui-z-popover);
  box-sizing: border-box;
  min-inline-size: 0;
  max-inline-size: calc(100vw - 1rem);
  max-block-size: min(20rem, calc(100vh - 1rem));
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
  box-shadow: var(--ui-shadow-overlay);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  user-select: none;
}

.demo-action-menu :deep(.demo-action-menu__viewport) {
  padding: var(--ui-space-1);
  overscroll-behavior: contain;
}

.demo-action-menu--submenu {
  z-index: 1;
}

.demo-action-menu__item {
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: var(--ui-menu-item-height);
  display: grid;
  align-items: center;
  column-gap: var(--ui-space-2);
  padding: var(--ui-space-1) var(--ui-space-2);
  border: 0;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
  text-align: start;
  cursor: pointer;
}

.demo-action-menu__item:hover:not([aria-disabled='true']),
.demo-action-menu__item--active:not([aria-disabled='true']) {
  background: var(--ui-color-surface-hover);
}

.demo-action-menu__item:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  background: var(--ui-color-surface-active);
}

.demo-action-menu__item[aria-disabled='true'] {
  color: var(--ui-color-text-muted);
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.demo-action-menu__item--danger:not([aria-disabled='true']) {
  color: var(--ui-color-danger);
}

.demo-action-menu__item--danger:focus-visible {
  background: var(--ui-color-danger-soft);
}

.demo-action-menu__icon-slot,
.demo-action-menu__chevron-slot {
  inline-size: 1rem;
  block-size: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.demo-action-menu__icon,
.demo-action-menu__chevron {
  display: block;
}

.demo-action-menu:dir(rtl) .demo-action-menu__chevron {
  transform: scaleX(-1);
}

.demo-action-menu__label {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-action-menu__separator {
  block-size: var(--ui-border-width);
  margin: var(--ui-space-1) var(--ui-space-2);
  background: var(--ui-color-border);
}

.demo-action-menu__empty {
  min-block-size: var(--ui-menu-item-height);
  display: flex;
  align-items: center;
  margin: 0;
  padding: var(--ui-space-1) var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}
</style>
