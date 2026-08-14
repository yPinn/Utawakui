<script setup>
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue';
import { ChevronRight, ICON_SIZE } from '../../icons/index.js';
import { useContextMenuGate } from '../../composables/useContextMenuGate.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  emptyText: { type: String, default: '' },
  items: { type: Array, default: () => [] },
});

const emit = defineEmits(['select', 'close']);
const { claim, release } = useContextMenuGate();

// Fixed menu width — no caller has ever needed a different one, so this
// isn't a prop (see the removed `width` prop in code review history).
const MENU_WIDTH = 220;
const ROW_HEIGHT = 34;
const MAX_MENU_HEIGHT = 320; // must match the CSS `max-height` below

const menuRef = useTemplateRef('menu');
const position = ref({ x: props.x, y: props.y });
const activeSubmenuKey = ref(null);

const menuStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
  width: `${MENU_WIDTH}px`,
}));

const activeSubmenuItem = computed(
  () =>
    props.items.find(
      (item) =>
        item.children?.length && itemKey(item) === activeSubmenuKey.value,
    ) ?? null,
);

const activeSubmenuIndex = computed(() =>
  activeSubmenuItem.value ? props.items.indexOf(activeSubmenuItem.value) : -1,
);

const activeSubmenuWidth = computed(
  () => activeSubmenuItem.value?.submenuWidth ?? MENU_WIDTH,
);

const submenuStyle = computed(() => {
  if (!activeSubmenuItem.value) return {};
  if (typeof window === 'undefined') {
    return {
      left: `${position.value.x + MENU_WIDTH + 4}px`,
      top: `${position.value.y}px`,
      width: `${activeSubmenuWidth.value}px`,
    };
  }

  const margin = 8;
  const gap = 4;
  const rowOffset = 4 + Math.max(0, activeSubmenuIndex.value) * ROW_HEIGHT;
  const submenuHeight = estimateSubmenuHeight(activeSubmenuItem.value);
  const rightX = position.value.x + MENU_WIDTH + gap;
  const leftX = position.value.x - activeSubmenuWidth.value - gap;
  const x =
    rightX + activeSubmenuWidth.value + margin <= window.innerWidth
      ? rightX
      : Math.max(margin, leftX);
  const maxY = window.innerHeight - submenuHeight - margin;

  return {
    left: `${x}px`,
    top: `${Math.max(margin, Math.min(position.value.y + rowOffset, maxY))}px`,
    width: `${activeSubmenuWidth.value}px`,
  };
});

function itemKey(item) {
  return item.key ?? item.label ?? item.value;
}

function estimateMenuHeight() {
  const itemCount = Math.max(1, props.items.length);
  return Math.min(MAX_MENU_HEIGHT, 8 + itemCount * ROW_HEIGHT);
}

function estimateSubmenuHeight(item) {
  return Math.min(
    MAX_MENU_HEIGHT,
    8 + Math.max(1, item.children?.length ?? 0) * ROW_HEIGHT,
  );
}

function clampPosition() {
  if (typeof window === 'undefined') {
    position.value = { x: props.x, y: props.y };
    return;
  }

  const rect = menuRef.value?.getBoundingClientRect();
  const menuWidth = rect?.width ?? MENU_WIDTH;
  const menuHeight = rect?.height ?? estimateMenuHeight();
  const margin = 8;
  const maxX = window.innerWidth - menuWidth - margin;
  const maxY = window.innerHeight - menuHeight - margin;

  position.value = {
    x: Math.max(margin, Math.min(props.x, maxX)),
    y: Math.max(margin, Math.min(props.y, maxY)),
  };
}

function scheduleClamp() {
  activeSubmenuKey.value = null;
  position.value = { x: props.x, y: props.y };
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

// Keeps at most one UiContextMenu open app-wide (see useContextMenuGate.js).
// Right-click doesn't fire 'click', so onWindowClick below never sees a
// right-click elsewhere as a reason to close.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      claim(close);
    } else {
      release(close);
    }
  },
);

function onWindowClick(event) {
  if (!props.open) return;
  if (menuRef.value?.contains(event.target)) return;
  close();
}

function onWindowKeydown(event) {
  if (props.open && event.key === 'Escape') close();
}

function onWindowScroll() {
  if (props.open) close();
}

function selectItem(item) {
  if (item.separator) return;
  if (item.children?.length) {
    activeSubmenuKey.value = itemKey(item);
    return;
  }
  if (item.disabled) return;
  emit('select', item.value ?? item, item);
}

function showSubmenu(item) {
  activeSubmenuKey.value =
    !item.separator && item.children?.length ? itemKey(item) : null;
}

watch(() => [props.open, props.x, props.y, props.items.length], scheduleClamp, {
  immediate: true,
});

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
        class="ui-context-menu ui-context-menu--submenu"
        :style="submenuStyle"
        role="menu"
        @click.stop
        @contextmenu.prevent
      >
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
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-context-menu {
  position: fixed;
  z-index: var(--ui-z-context-menu);
  box-sizing: border-box;
  /* 320px must match MAX_MENU_HEIGHT in the script block — CSS can't read
     a JS constant, so keep the two in sync by hand if this changes. */
  max-height: min(320px, calc(100vh - 16px));
  overflow-y: auto;
  padding: var(--ui-space-1);
  background: var(--ui-color-surface);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  box-shadow: var(--ui-shadow-overlay);
}

.ui-context-menu--submenu {
  z-index: var(--ui-z-context-menu-submenu);
}

.ui-context-menu__empty {
  margin: 0;
  padding: var(--ui-space-1) var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.ui-context-menu__item {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) max-content 16px;
  align-items: center;
  column-gap: var(--ui-space-2);
  width: 100%;
  min-height: 32px;
  padding: var(--ui-space-1) var(--ui-space-2);
  border: 0;
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  line-height: 1.35;
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
  width: 16px;
  height: 16px;
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
  white-space: nowrap;
}
</style>
