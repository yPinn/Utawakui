<script setup>
import {
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  useSlots,
  useTemplateRef,
  watch,
} from 'vue';
import { ChevronRight, ICON_SIZE } from '../../icons/index.js';
import { useContextMenuGate } from '../../composables/useContextMenuGate.js';
import { useUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import {
  anchoredFloatingLayout,
  customLengthPixels,
  pointFloatingPosition,
} from './floatingPosition.js';
import UiScrollRegion from './UiScrollRegion.vue';

const overlayHost = useUiOverlayHost();

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  width: { type: Number, default: 220 },
  anchorEl: { type: Object, default: null },
  dir: {
    type: String,
    default: 'auto',
    validator: (value) => ['auto', 'ltr', 'rtl'].includes(value),
  },
  emptyText: { type: String, default: '' },
  ariaLabel: { type: String, default: '操作選單' },
  // Item shape: { key?, label, value?, icon?, status?, danger?, disabled?,
  // separator?, children? }. `separator` renders a divider (ignores every
  // other field); `children` nests a submenu instead of emitting 'select'.
  items: { type: Array, default: () => [] },
});

const emit = defineEmits(['select', 'close']);
const slots = useSlots();
const { claim, release } = useContextMenuGate();

const MAX_MENU_HEIGHT_REM = 20;
const MENU_PADDING_BLOCK_REM = 1;
const MENU_INSET_REM = 0.5;
const SEPARATOR_INSET_REM = 0.25;
const VIEWPORT_MARGIN_REM = 0.5;
const SUBMENU_GAP_REM = 0.5;

const menuRef = useTemplateRef('menu');
const submenuRef = useTemplateRef('submenu');
const position = shallowRef({ x: props.x, y: props.y, side: 'pointer' });
const activeSubmenuKey = shallowRef(null);
const menuScrollTop = shallowRef(0);
const menuWidth = computed(() => props.width);
const rootItemRefs = new Map();
let focusOrigin = null;

const menuRoot = () => menuRef.value?.root;
const menuViewport = () => menuRef.value?.viewport;
const submenuRoot = () => submenuRef.value?.root;

const menuStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
  width: `${menuWidth.value}px`,
}));

const rootPlacement = computed(() =>
  props.anchorEl && position.value.side !== 'pointer'
    ? `${position.value.side}-${position.value.alignment}`
    : 'pointer',
);

function menuRowHeightPixels() {
  return customLengthPixels('--ui-floating-row-min-height', 2);
}

const activeSubmenuItem = computed(
  () =>
    props.items.find(
      (item) =>
        item.children?.length && itemKey(item) === activeSubmenuKey.value,
    ) ?? null,
);

const activeSubmenuWidth = computed(
  () => activeSubmenuItem.value?.submenuWidth ?? menuWidth.value,
);

function measuredRect(element) {
  const rect = element?.getBoundingClientRect?.();
  return rect && (rect.width > 0 || rect.height > 0) ? rect : null;
}

function submenuFallbackTop(scrollTop) {
  const menuInset = customLengthPixels('--ui-space-2', MENU_INSET_REM);
  const separatorInset = customLengthPixels(
    '--ui-space-1',
    SEPARATOR_INSET_REM,
  );
  const separatorHeight =
    customLengthPixels('--ui-border-width', 0.0625) + separatorInset * 2;
  let offset = menuInset;

  for (const item of props.items) {
    if (itemKey(item) === activeSubmenuKey.value) break;
    offset += item.separator ? separatorHeight : menuRowHeightPixels();
  }
  return position.value.y + offset - scrollTop;
}

function resolvedDirection() {
  if (props.dir !== 'auto') return props.dir;
  if (typeof window === 'undefined') return 'ltr';
  const target = props.anchorEl ?? menuViewport() ?? menuRoot();
  return window.getComputedStyle(target).direction === 'rtl' ? 'rtl' : 'ltr';
}

const submenuPlacement = computed(() => {
  if (!activeSubmenuItem.value) return null;
  const direction = resolvedDirection();
  if (typeof window === 'undefined') {
    return {
      left:
        direction === 'rtl'
          ? position.value.x - activeSubmenuWidth.value
          : position.value.x + menuWidth.value,
      top: position.value.y,
      side: direction === 'rtl' ? 'left' : 'right',
      width: activeSubmenuWidth.value,
    };
  }

  const margin = customLengthPixels(
    '--ui-floating-viewport-inset',
    VIEWPORT_MARGIN_REM,
  );
  const gap = customLengthPixels('--ui-space-2', SUBMENU_GAP_REM);
  const scrollTop = menuScrollTop.value;
  const rootRect = measuredRect(menuRoot());
  const parentRect = measuredRect(
    rootItemRefs.get(itemKey(activeSubmenuItem.value)),
  );
  const submenuRect = measuredRect(submenuRoot());
  const submenuHeight =
    submenuRect?.height ?? estimateSubmenuHeight(activeSubmenuItem.value);
  const rootLeft = rootRect?.left ?? position.value.x;
  const rootRight = rootRect?.right ?? position.value.x + menuWidth.value;
  const anchorTop = parentRect?.top ?? submenuFallbackTop(scrollTop);
  const anchorHeight = parentRect?.height ?? menuRowHeightPixels();

  return anchoredFloatingLayout({
    anchor: {
      left: rootLeft,
      right: rootRight,
      top: anchorTop,
      bottom: anchorTop + anchorHeight,
      width: rootRight - rootLeft,
      height: anchorHeight,
    },
    surface: {
      width: activeSubmenuWidth.value,
      height: submenuHeight,
    },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    placement: 'end-start',
    direction,
    gap,
    inset: margin,
  });
});

const submenuStyle = computed(() => {
  const placement = submenuPlacement.value;
  if (!placement) return {};
  return {
    left: `${placement.left}px`,
    top: `${placement.top}px`,
    width: `${placement.width}px`,
  };
});

const submenuOpensLeft = computed(
  () => submenuPlacement.value?.side === 'left',
);

function itemKey(item) {
  return item.key ?? item.label ?? item.value;
}

function setRootItemRef(item, element) {
  const key = itemKey(item);
  if (element) rootItemRefs.set(key, element);
  else rootItemRefs.delete(key);
}

function estimateMenuHeight() {
  const itemCount = Math.max(1, props.items.length);
  return Math.min(
    customLengthPixels('--ui-menu-max-block-size', MAX_MENU_HEIGHT_REM),
    customLengthPixels('--ui-menu-padding-block', MENU_PADDING_BLOCK_REM) +
      itemCount * menuRowHeightPixels(),
  );
}

function estimateSubmenuHeight(item) {
  const slotRows =
    Number(Boolean(slots['submenu-leading'])) +
    Number(Boolean(slots['submenu-trailing']));
  return Math.min(
    customLengthPixels('--ui-menu-max-block-size', MAX_MENU_HEIGHT_REM),
    customLengthPixels('--ui-menu-padding-block', MENU_PADDING_BLOCK_REM) +
      Math.max(1, (item.children?.length ?? 0) + slotRows) *
        menuRowHeightPixels(),
  );
}

function clampPosition() {
  if (typeof window === 'undefined') {
    position.value = { x: props.x, y: props.y, side: 'pointer' };
    return;
  }

  const rect = menuRoot()?.getBoundingClientRect();
  const width = rect?.width ?? menuWidth.value;
  const menuHeight = rect?.height ?? estimateMenuHeight();
  const margin = customLengthPixels(
    '--ui-floating-viewport-inset',
    VIEWPORT_MARGIN_REM,
  );
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const surface = { width, height: menuHeight };
  const anchor = props.anchorEl?.getBoundingClientRect?.();

  // Like submenus, root menus open toward logical inline-end and mirror only
  // when that side cannot fit: a button menu aligns to the trigger's start edge.
  if (anchor) {
    const layout = anchoredFloatingLayout({
      anchor,
      surface,
      viewport,
      placement: 'bottom-start',
      direction: resolvedDirection(),
      gap: customLengthPixels('--ui-space-2', SUBMENU_GAP_REM),
      inset: margin,
      flipAlignment: true,
    });
    position.value = {
      x: layout.left,
      y: layout.top,
      side: layout.side,
      alignment: layout.alignment,
    };
    return;
  }

  const pointer = pointFloatingPosition({
    point: { x: props.x, y: props.y },
    surface,
    viewport,
    direction: resolvedDirection(),
    inset: margin,
    flipInline: true,
  });
  position.value = { x: pointer.left, y: pointer.top, side: 'pointer' };
}

function scheduleClamp() {
  activeSubmenuKey.value = null;
  menuScrollTop.value = 0;
  position.value = { x: props.x, y: props.y, side: 'pointer' };
  if (!props.open) return;

  if (typeof window === 'undefined') {
    clampPosition();
    return;
  }

  window.requestAnimationFrame(clampPosition);
}

function onWindowResize() {
  if (!props.open || typeof window === 'undefined') return;
  window.requestAnimationFrame(clampPosition);
}

function close() {
  emit('close');
}

function restoreFocusOrigin() {
  if (focusOrigin?.isConnected !== false) focusOrigin?.focus?.();
}

function requestClose({ restoreFocus = false } = {}) {
  activeSubmenuKey.value = null;
  if (restoreFocus) restoreFocusOrigin();
  close();
}

// Keeps at most one UiContextMenu open app-wide (see useContextMenuGate.js).
// Right-click doesn't fire 'click', so onWindowClick below never sees a
// right-click elsewhere as a reason to close.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      focusOrigin =
        typeof document === 'undefined' ? null : document.activeElement;
      claim(close);
    } else {
      release(close);
    }
  },
  { immediate: true },
);

function onWindowClick(event) {
  if (!props.open) return;
  if (menuRoot()?.contains(event.target)) return;
  close();
}

function onWindowKeydown(event) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault?.();
    event.stopPropagation?.();
    requestClose({ restoreFocus: true });
  }
}

function onWindowScroll(event) {
  if (!props.open) return;
  const target = event?.target;
  const targetClasses = String(
    target?.className ?? target?.props?.class ?? '',
  ).split(/\s+/);
  const targetIsMenu = targetClasses.includes('ui-context-menu');
  const targetIsRootMenu =
    targetIsMenu && !targetClasses.includes('ui-context-menu--submenu');
  const targetIsMenuViewport =
    target?.getAttribute?.('role') === 'menu' || target?.props?.role === 'menu';
  if (
    target &&
    (menuRoot()?.contains(target) ||
      submenuRoot()?.contains(target) ||
      target?.closest?.('.ui-context-menu') ||
      targetIsMenu ||
      targetIsMenuViewport)
  ) {
    if (
      target === menuViewport() ||
      target === menuRoot() ||
      targetIsRootMenu ||
      (targetIsMenuViewport &&
        (target?.getAttribute?.('aria-label') ??
          target?.props?.['aria-label']) === props.ariaLabel)
    ) {
      menuScrollTop.value = Number(target.scrollTop) || 0;
    }
    return;
  }
  close();
}

function selectItem(item) {
  if (item.separator) return;
  if (item.children?.length) {
    activeSubmenuKey.value = itemKey(item);
    return;
  }
  if (item.disabled) return;
  emit('select', item.value ?? item, item);
  requestClose({ restoreFocus: true });
}

function showSubmenu(item) {
  activeSubmenuKey.value =
    !item.separator && item.children?.length ? itemKey(item) : null;
}

watch(
  [
    () => props.open,
    () => props.x,
    () => props.y,
    () => props.width,
    () => props.anchorEl,
    () => props.dir,
    () => props.items.length,
  ],
  scheduleClamp,
  { immediate: true },
);

onMounted(() => {
  if (typeof window === 'undefined') return;
  window.addEventListener('click', onWindowClick);
  window.addEventListener('keydown', onWindowKeydown);
  window.addEventListener('scroll', onWindowScroll, true);
  window.addEventListener('resize', onWindowResize);
});

onUnmounted(() => {
  release(close);
  if (typeof window === 'undefined') return;
  window.removeEventListener('click', onWindowClick);
  window.removeEventListener('keydown', onWindowKeydown);
  window.removeEventListener('scroll', onWindowScroll, true);
  window.removeEventListener('resize', onWindowResize);
});
</script>

<template>
  <!-- Deferred: an always-mounted overlay can mount in the same pass as its
       surface host, before that host is in the document. -->
  <Teleport defer :to="overlayHost || undefined" :disabled="!overlayHost">
    <UiScrollRegion
      v-if="open"
      ref="menu"
      class="ui-context-menu"
      axis="vertical"
      viewport-class="ui-context-menu__viewport"
      :style="menuStyle"
      :dir="props.dir === 'auto' ? undefined : props.dir"
      :data-placement="rootPlacement"
      role="menu"
      :aria-label="ariaLabel"
      @click.stop
      @contextmenu.prevent
    >
      <p v-if="items.length === 0" class="ui-context-menu__empty">
        {{ emptyText }}
      </p>
      <template v-for="item in items" :key="itemKey(item)">
        <div
          v-if="item.separator"
          class="ui-context-menu__separator"
          role="separator"
        />
        <button
          v-else
          :ref="(element) => setRootItemRef(item, element)"
          type="button"
          class="ui-context-menu__item"
          :class="{
            'ui-context-menu__item--danger': item.danger,
            'ui-context-menu__item--active':
              item.children?.length && itemKey(item) === activeSubmenuKey,
          }"
          :disabled="item.disabled"
          role="menuitem"
          :aria-haspopup="item.children?.length ? 'menu' : undefined"
          :aria-expanded="
            item.children?.length
              ? itemKey(item) === activeSubmenuKey
              : undefined
          "
          @mouseenter="showSubmenu(item)"
          @focus="showSubmenu(item)"
          @click="selectItem(item)"
        >
          <span class="ui-context-menu__icon-slot" aria-hidden="true">
            <component
              :is="item.icon"
              v-if="item.icon"
              class="ui-context-menu__icon"
              :size="ICON_SIZE"
            />
          </span>
          <span class="ui-context-menu__text">
            <span class="ui-context-menu__label">{{ item.label }}</span>
          </span>
          <span class="ui-context-menu__status">
            {{ item.status || '' }}
          </span>
          <span class="ui-context-menu__chevron-slot" aria-hidden="true">
            <ChevronRight
              v-if="item.children?.length"
              class="ui-context-menu__chevron"
              :class="{
                'ui-context-menu__chevron--reverse':
                  itemKey(item) === activeSubmenuKey && submenuOpensLeft,
              }"
              :size="ICON_SIZE"
            />
          </span>
        </button>
      </template>

      <UiScrollRegion
        v-if="activeSubmenuItem"
        ref="submenu"
        class="ui-context-menu ui-context-menu--submenu"
        axis="vertical"
        viewport-class="ui-context-menu__viewport"
        :style="submenuStyle"
        :dir="props.dir === 'auto' ? undefined : props.dir"
        :data-side="submenuPlacement?.side"
        role="menu"
        :aria-label="`${activeSubmenuItem.label}目的地`"
        @click.stop
        @contextmenu.prevent
      >
        <slot name="submenu-leading" :item="activeSubmenuItem" />
        <template
          v-for="child in activeSubmenuItem.children"
          :key="itemKey(child)"
        >
          <div
            v-if="child.separator"
            class="ui-context-menu__separator"
            role="separator"
          />
          <button
            v-else
            type="button"
            class="ui-context-menu__item"
            :class="{ 'ui-context-menu__item--danger': child.danger }"
            :disabled="child.disabled"
            role="menuitem"
            @click="selectItem(child)"
          >
            <span class="ui-context-menu__icon-slot" aria-hidden="true">
              <component
                :is="child.icon"
                v-if="child.icon"
                class="ui-context-menu__icon"
                :size="ICON_SIZE"
              />
            </span>
            <span class="ui-context-menu__text">
              <span class="ui-context-menu__label">{{ child.label }}</span>
            </span>
            <span class="ui-context-menu__status">
              {{ child.status || '' }}
            </span>
            <span class="ui-context-menu__chevron-slot" aria-hidden="true" />
          </button>
        </template>
        <slot name="submenu-trailing" :item="activeSubmenuItem" />
      </UiScrollRegion>
    </UiScrollRegion>
  </Teleport>
</template>

<style scoped>
.ui-context-menu {
  position: fixed;
  z-index: var(--ui-z-popover);
  box-sizing: border-box;
  min-inline-size: 0;
  max-inline-size: calc(100vw - (2 * var(--ui-floating-viewport-inset)));
  /* Keep 20rem aligned with MAX_MENU_HEIGHT_REM in the script block. */
  max-block-size: min(
    20rem,
    calc(100vh - (2 * var(--ui-floating-viewport-inset)))
  );
  background: var(--ui-floating-list-bg);
  border: var(--ui-border-width) solid var(--ui-floating-list-border);
  border-radius: var(--ui-floating-list-radius);
  box-shadow: var(--ui-floating-list-shadow);
}

.ui-context-menu :deep(.ui-context-menu__viewport) {
  block-size: auto;
  max-block-size: inherit;
  padding: var(--ui-floating-list-padding);
}

.ui-context-menu--submenu {
  z-index: var(--ui-layer-raised);
}

.ui-context-menu__empty {
  margin: 0;
  padding: var(--ui-floating-row-padding-block)
    var(--ui-floating-row-padding-inline);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.ui-context-menu__item {
  display: grid;
  grid-template-columns: var(--ui-space-4) minmax(0, 1fr) max-content var(
      --ui-space-4
    );
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
  /* Regular, not Label's usual strong — matches macOS context-menu
     convention (native menu items aren't bold), a deliberate deviation
     from the Label tier's default weight. */
  font-weight: var(--ui-floating-row-font-weight);
  line-height: var(--ui-floating-row-line-height);
  text-align: left;
  cursor: pointer;
}

.ui-context-menu__item--active:not(:disabled),
.ui-context-menu__item:hover:not(:disabled) {
  background: var(--ui-color-surface-hover);
}

.ui-context-menu__item:active:not(:disabled) {
  background: var(--ui-color-surface-active);
}

.ui-context-menu__item:focus-visible {
  background: var(--ui-color-surface-active);
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-context-menu__item:disabled {
  color: var(--ui-color-text-muted);
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.ui-context-menu__item--danger:not(:disabled) {
  color: var(--ui-color-danger);
}

.ui-context-menu__item--danger:hover:not(:disabled),
.ui-context-menu__item--danger:active:not(:disabled),
.ui-context-menu__item--danger:focus-visible {
  background: var(--ui-color-danger-soft);
}

.ui-context-menu__separator {
  height: var(--ui-border-width);
  margin: var(--ui-space-1) var(--ui-space-2);
  background: var(--ui-color-border);
}

.ui-context-menu__icon-slot,
.ui-context-menu__chevron-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-4);
  height: var(--ui-space-4);
  color: currentColor;
}

.ui-context-menu__icon,
.ui-context-menu__chevron {
  display: block;
}

.ui-context-menu__chevron--reverse {
  transform: scaleX(-1);
}

.ui-context-menu__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.ui-context-menu__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-context-menu__status {
  justify-self: end;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  white-space: nowrap;
}
</style>
