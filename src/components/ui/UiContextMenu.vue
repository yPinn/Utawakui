<script setup>
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  useSlots,
  useTemplateRef,
  watch,
} from 'vue';
import { ChevronRight, ICON_SIZE } from '../../icons/index.js';
import { useContextMenuGate } from '../../composables/useContextMenuGate.js';

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
const MENU_PADDING_BLOCK_REM = 0.5;
const VIEWPORT_MARGIN_REM = 0.5;
const SUBMENU_GAP_REM = 0.25;

const menuRef = useTemplateRef('menu');
const submenuRef = useTemplateRef('submenu');
const position = ref({ x: props.x, y: props.y });
const activeSubmenuKey = ref(null);
const menuScrollTop = ref(0);
const menuWidth = computed(() => props.width);
const rootItemRefs = new Map();
let focusOrigin = null;

const menuStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
  width: `${menuWidth.value}px`,
}));

function remPixels(value) {
  if (typeof window === 'undefined') return value * 16;
  const rootSize = Number.parseFloat(
    window.getComputedStyle(document.documentElement).fontSize,
  );
  return value * (Number.isFinite(rootSize) ? rootSize : 16);
}

function customLengthPixels(name, fallbackRem, seen = new Set()) {
  if (typeof window === 'undefined' || seen.has(name)) {
    return remPixels(fallbackRem);
  }
  seen.add(name);
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const reference = value.match(/^var\((--ui-[\w-]+)\)$/)?.[1];
  if (reference) return customLengthPixels(reference, fallbackRem, seen);

  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return remPixels(fallbackRem);
  if (value.endsWith('rem')) return remPixels(amount);
  if (value.endsWith('px')) return amount;
  return remPixels(fallbackRem);
}

function menuRowHeightPixels() {
  return customLengthPixels('--ui-menu-item-height', 2);
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
  const menuInset = customLengthPixels('--ui-space-1', 0.25);
  const separatorHeight =
    customLengthPixels('--ui-border-width', 0.0625) + menuInset * 2;
  let offset = menuInset;

  for (const item of props.items) {
    if (itemKey(item) === activeSubmenuKey.value) break;
    offset += item.separator ? separatorHeight : menuRowHeightPixels();
  }
  return position.value.y + offset - scrollTop;
}

const submenuStyle = computed(() => {
  if (!activeSubmenuItem.value) return {};
  if (typeof window === 'undefined') {
    return {
      left: `${position.value.x + menuWidth.value + remPixels(SUBMENU_GAP_REM)}px`,
      top: `${position.value.y}px`,
      width: `${activeSubmenuWidth.value}px`,
    };
  }

  const margin = remPixels(VIEWPORT_MARGIN_REM);
  const gap = remPixels(SUBMENU_GAP_REM);
  const scrollTop = menuScrollTop.value;
  const rootRect = measuredRect(menuRef.value);
  const parentRect = measuredRect(
    rootItemRefs.get(itemKey(activeSubmenuItem.value)),
  );
  const submenuRect = measuredRect(submenuRef.value);
  const submenuHeight =
    submenuRect?.height ?? estimateSubmenuHeight(activeSubmenuItem.value);
  const rootLeft = rootRect?.left ?? position.value.x;
  const rootRight = rootRect?.right ?? position.value.x + menuWidth.value;
  const desiredWidth = activeSubmenuWidth.value;
  const rightAvailable = Math.max(
    0,
    window.innerWidth - margin - rootRight - gap,
  );
  const leftAvailable = Math.max(0, rootLeft - margin - gap);
  let width = desiredWidth;
  let x = rootRight + gap;

  if (desiredWidth <= rightAvailable) {
    x = rootRight + gap;
  } else if (desiredWidth <= leftAvailable) {
    x = rootLeft - gap - desiredWidth;
  } else if (leftAvailable >= rightAvailable) {
    width = Math.min(desiredWidth, leftAvailable);
    x = rootLeft - gap - width;
  } else {
    width = Math.min(desiredWidth, rightAvailable);
  }
  const maxY = window.innerHeight - submenuHeight - margin;
  const anchorY = parentRect?.top ?? submenuFallbackTop(scrollTop);

  return {
    left: `${x}px`,
    top: `${Math.max(margin, Math.min(anchorY, maxY))}px`,
    width: `${width}px`,
  };
});

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
    remPixels(MAX_MENU_HEIGHT_REM),
    remPixels(MENU_PADDING_BLOCK_REM) + itemCount * menuRowHeightPixels(),
  );
}

function estimateSubmenuHeight(item) {
  const slotRows =
    Number(Boolean(slots['submenu-leading'])) +
    Number(Boolean(slots['submenu-trailing']));
  return Math.min(
    remPixels(MAX_MENU_HEIGHT_REM),
    remPixels(MENU_PADDING_BLOCK_REM) +
      Math.max(1, (item.children?.length ?? 0) + slotRows) *
        menuRowHeightPixels(),
  );
}

function preferredX(width) {
  return props.alignX === 'right' ? props.x - width : props.x;
}

function clampPosition() {
  if (typeof window === 'undefined') {
    position.value = { x: preferredX(menuWidth.value), y: props.y };
    return;
  }

  const rect = menuRef.value?.getBoundingClientRect();
  const width = rect?.width ?? menuWidth.value;
  const menuHeight = rect?.height ?? estimateMenuHeight();
  const margin = remPixels(VIEWPORT_MARGIN_REM);
  const maxX = window.innerWidth - width - margin;
  const maxY = window.innerHeight - menuHeight - margin;
  const x = preferredX(width);

  position.value = {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(props.y, maxY)),
  };
}

function scheduleClamp() {
  activeSubmenuKey.value = null;
  menuScrollTop.value = 0;
  position.value = { x: preferredX(menuWidth.value), y: props.y };
  if (!props.open) return;

  if (typeof window === 'undefined') {
    clampPosition();
    return;
  }

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
  if (menuRef.value?.contains(event.target)) return;
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
  if (
    target &&
    (menuRef.value?.contains(target) ||
      target?.closest?.('.ui-context-menu') ||
      targetIsMenu)
  ) {
    if (target === menuRef.value || targetIsRootMenu) {
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
    () => props.alignX,
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
});

onUnmounted(() => {
  release(close);
  if (typeof window === 'undefined') return;
  window.removeEventListener('click', onWindowClick);
  window.removeEventListener('keydown', onWindowKeydown);
  window.removeEventListener('scroll', onWindowScroll, true);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menu"
      class="ui-context-menu"
      :style="menuStyle"
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
              :size="ICON_SIZE"
            />
          </span>
        </button>
      </template>

      <div
        v-if="activeSubmenuItem"
        ref="submenu"
        class="ui-context-menu ui-context-menu--submenu"
        :style="submenuStyle"
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
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-context-menu {
  position: fixed;
  z-index: var(--ui-z-popover);
  /* Keep 20rem aligned with MAX_MENU_HEIGHT_REM in the script block. */
  max-height: min(20rem, calc(100vh - 1rem));
  overflow-y: auto;
  padding: var(--ui-space-1);
  background: var(--ui-color-surface);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-overlay);
}

.ui-context-menu--submenu {
  z-index: 1;
}

.ui-context-menu__empty {
  margin: 0;
  padding: var(--ui-space-1) var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.ui-context-menu__item {
  display: grid;
  grid-template-columns: 1rem minmax(0, 1fr) max-content 1rem;
  align-items: center;
  column-gap: var(--ui-space-2);
  width: 100%;
  min-height: var(--ui-menu-item-height);
  padding: var(--ui-space-1) var(--ui-space-2);
  border: 0;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  /* Regular, not Label's usual strong — matches macOS context-menu
     convention (native menu items aren't bold), a deliberate deviation
     from the Label tier's default weight. */
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
  text-align: left;
  cursor: pointer;
}

.ui-context-menu__item--active:not(:disabled),
.ui-context-menu__item:hover:not(:disabled),
.ui-context-menu__item:focus-visible {
  background: var(--ui-color-surface-hover);
  outline: none;
}

.ui-context-menu__item:focus-visible {
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
  width: 1rem;
  height: 1rem;
  color: currentColor;
}

.ui-context-menu__icon,
.ui-context-menu__chevron {
  display: block;
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
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  white-space: nowrap;
}
</style>
