<script setup>
// This project's first aria-activedescendant / role="listbox" pattern — focus
// stays on the input the entire time; the listbox is display-only and never
// receives real DOM focus. Scope is intentionally narrow: pick one value from
// a caller-provided list by typing to filter. No free-text (creatable) value
// and no async/server-side filtering — both are left for a real consumer to
// ask for.
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useAttrs,
  useTemplateRef,
  watch,
} from 'vue';
import { ChevronDown, ICON_SIZE } from '../../icons/index.js';
import { useContextMenuGate } from '../../composables/useContextMenuGate.js';
import {
  anchoredFloatingPosition,
  customLengthPixels,
} from './floatingPosition.js';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: [String, Number], default: '' },
  items: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  labelHidden: { type: Boolean, default: false },
  noResultsText: { type: String, default: '沒有符合的結果' },
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const { claim, release } = useContextMenuGate();

const inputRef = useTemplateRef('input');
const listboxRef = useTemplateRef('listbox');
const query = shallowRef('');
const isOpen = shallowRef(false);
const highlightedIndex = shallowRef(-1);
const position = shallowRef({ left: '0px', top: '0px', width: '0px' });

let frameId = 0;

const listboxId = `${props.id}-listbox`;
const selectedItem = computed(() =>
  props.items.find((item) => String(item.value) === String(props.modelValue)),
);
const filteredItems = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return props.items;
  return props.items.filter((item) =>
    String(item.label).toLowerCase().includes(needle),
  );
});
function optionId(item) {
  return `${props.id}-option-${String(item.value)}`;
}

const activeOptionId = computed(() => {
  const item = filteredItems.value[highlightedIndex.value];
  return item ? optionId(item) : undefined;
});

function firstEnabledIndex() {
  return filteredItems.value.findIndex((item) => !item.disabled);
}

function lastEnabledIndex() {
  for (let index = filteredItems.value.length - 1; index >= 0; index -= 1) {
    if (!filteredItems.value[index]?.disabled) return index;
  }
  return -1;
}

function syncQueryFromModel() {
  query.value = selectedItem.value ? String(selectedItem.value.label) : '';
}

watch(
  () => [props.modelValue, props.items],
  () => {
    if (!isOpen.value) syncQueryFromModel();
  },
  { immediate: true },
);

function scheduleFrame(callback) {
  if (typeof window === 'undefined') return;
  window.cancelAnimationFrame(frameId);
  frameId = window.requestAnimationFrame(callback);
}

function updatePosition() {
  if (!isOpen.value || typeof window === 'undefined') return;
  const anchor = inputRef.value?.getBoundingClientRect();
  const surface = listboxRef.value?.getBoundingClientRect();
  if (!anchor || !surface) return;

  const { left, top } = anchoredFloatingPosition({
    anchor,
    surface,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    placement: 'bottom-start',
    direction: window.getComputedStyle(inputRef.value).direction,
    gap: customLengthPixels('--ui-floating-gap', 0.5),
    inset: customLengthPixels('--ui-floating-viewport-inset', 0.5),
  });
  position.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${anchor.width}px`,
  };
}

function closeFromGate() {
  closeList({ revertQuery: true });
}

function ensureOpen() {
  if (props.disabled || isOpen.value) return;
  isOpen.value = true;
  claim(closeFromGate);
  nextTick(() => scheduleFrame(updatePosition));
}

function openWithSelection() {
  ensureOpen();
  const selectedIndex = selectedItem.value
    ? filteredItems.value.findIndex(
        (item) => String(item.value) === String(selectedItem.value.value),
      )
    : -1;
  highlightedIndex.value =
    selectedIndex >= 0 ? selectedIndex : firstEnabledIndex();
}

function closeList({ revertQuery = false } = {}) {
  if (!isOpen.value) return;
  isOpen.value = false;
  highlightedIndex.value = -1;
  release(closeFromGate);
  if (revertQuery) syncQueryFromModel();
}

function selectItem(item) {
  if (item.disabled) return;
  emit('update:modelValue', item.value);
  query.value = String(item.label);
  closeList();
  inputRef.value?.focus();
}

function moveHighlight(delta) {
  const items = filteredItems.value;
  if (!items.length) {
    highlightedIndex.value = -1;
    return;
  }
  let index = highlightedIndex.value;
  for (let step = 0; step < items.length; step += 1) {
    index = (index + delta + items.length) % items.length;
    if (!items[index]?.disabled) {
      highlightedIndex.value = index;
      return;
    }
  }
}

function commitHighlighted() {
  const item = filteredItems.value[highlightedIndex.value];
  if (item && !item.disabled) selectItem(item);
}

function onInput(event) {
  query.value = event.target.value;
  ensureOpen();
  highlightedIndex.value = firstEnabledIndex();
}

function onKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!isOpen.value) openWithSelection();
    else moveHighlight(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!isOpen.value) openWithSelection();
    else moveHighlight(-1);
    return;
  }
  if (event.key === 'Home' && isOpen.value) {
    event.preventDefault();
    highlightedIndex.value = firstEnabledIndex();
    return;
  }
  if (event.key === 'End' && isOpen.value) {
    event.preventDefault();
    highlightedIndex.value = lastEnabledIndex();
    return;
  }
  if (event.key === 'Enter' && isOpen.value && highlightedIndex.value >= 0) {
    event.preventDefault();
    commitHighlighted();
    return;
  }
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault();
    event.stopPropagation();
    closeList({ revertQuery: true });
  }
}

function onBlur() {
  closeList({ revertQuery: true });
}

function onOutsidePointer(event) {
  if (!isOpen.value) return;
  if (
    inputRef.value?.contains(event.target) ||
    listboxRef.value?.contains(event.target)
  ) {
    return;
  }
  closeList({ revertQuery: true });
}

function onOutsideScroll(event) {
  if (!isOpen.value) return;
  if (
    event.target === listboxRef.value ||
    listboxRef.value?.contains(event.target)
  ) {
    return;
  }
  closeList({ revertQuery: true });
}

function onResize() {
  updatePosition();
}

function focus() {
  inputRef.value?.focus();
}

defineExpose({ focus });

onMounted(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.addEventListener('pointerdown', onOutsidePointer, true);
  window.addEventListener('scroll', onOutsideScroll, true);
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  release(closeFromGate);
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.cancelAnimationFrame(frameId);
  document.removeEventListener('pointerdown', onOutsidePointer, true);
  window.removeEventListener('scroll', onOutsideScroll, true);
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <UiField
    :id="id"
    :class="attrs.class"
    :style="attrs.style"
    :label="label"
    :hint="hint"
    :error="error"
    :described-by="attrs['aria-describedby']"
    :required="required"
    :invalid="invalid"
    :label-hidden="labelHidden"
  >
    <template #default="{ describedBy, invalid: fieldInvalid }">
      <span class="ui-combobox__control">
        <input
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="input"
          class="ui-combobox__native"
          type="text"
          role="combobox"
          autocomplete="off"
          :value="query"
          :placeholder="placeholder"
          :required="required"
          :disabled="disabled"
          aria-autocomplete="list"
          :aria-expanded="isOpen"
          :aria-controls="listboxId"
          :aria-activedescendant="activeOptionId"
          :aria-describedby="describedBy"
          :aria-invalid="fieldInvalid || undefined"
          @input="onInput"
          @keydown="onKeydown"
          @blur="onBlur"
        />
        <ChevronDown
          class="ui-combobox__indicator"
          :size="ICON_SIZE"
          aria-hidden="true"
        />
      </span>
    </template>
  </UiField>

  <Teleport to="body">
    <ul
      v-if="isOpen"
      :id="listboxId"
      ref="listbox"
      class="ui-combobox__listbox"
      role="listbox"
      :aria-label="label"
      :style="position"
    >
      <li
        v-if="!filteredItems.length"
        class="ui-combobox__empty"
        role="presentation"
      >
        {{ noResultsText }}
      </li>
      <li
        v-for="(item, index) in filteredItems"
        :id="optionId(item)"
        :key="String(item.value)"
        class="ui-combobox__option"
        :class="{
          'ui-combobox__option--active': index === highlightedIndex,
        }"
        role="option"
        :aria-selected="
          Boolean(selectedItem) &&
          String(item.value) === String(selectedItem.value)
        "
        :aria-disabled="item.disabled || undefined"
        @mousedown.prevent
        @click="selectItem(item)"
      >
        {{ item.label }}
      </li>
    </ul>
  </Teleport>
</template>

<style scoped>
.ui-combobox__control {
  position: relative;
  min-width: 0;
  display: block;
}

.ui-combobox__native {
  width: 100%;
  min-width: 0;
  min-height: var(--ui-field-height);
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  padding-inline-end: calc(var(--ui-field-padding-inline) + var(--ui-space-4));
  border: var(--ui-border-width) solid var(--ui-field-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
  color: var(--ui-field-fg);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.ui-combobox__native::placeholder {
  color: var(--ui-field-placeholder);
}

.ui-combobox__native:hover:not(:disabled) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.ui-combobox__native:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-combobox__native[aria-invalid='true'] {
  border-color: var(--ui-field-border-invalid);
}

.ui-combobox__native:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.ui-combobox__indicator {
  position: absolute;
  top: 50%;
  inset-inline-end: var(--ui-field-padding-inline);
  color: var(--ui-field-fg);
  pointer-events: none;
  transform: translateY(-50%);
}

.ui-combobox__listbox {
  position: fixed;
  z-index: var(--ui-z-popover);
  box-sizing: border-box;
  max-block-size: min(
    16rem,
    calc(100vh - (2 * var(--ui-floating-viewport-inset)))
  );
  margin: 0;
  padding: var(--ui-space-1);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-color-surface-raised);
  box-shadow: var(--ui-shadow-overlay);
  scrollbar-color: var(--ui-color-border-strong) transparent;
  scrollbar-width: thin;
}

.ui-combobox__option {
  min-block-size: var(--ui-menu-item-height);
  display: flex;
  align-items: center;
  padding: var(--ui-space-1) var(--ui-space-2);
  overflow: hidden;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.ui-combobox__option--active {
  background: var(--ui-color-surface-hover);
}

.ui-combobox__option[aria-selected='true'] {
  color: var(--ui-color-accent);
  font-weight: var(--ui-font-weight-semibold);
}

.ui-combobox__option[aria-disabled='true'] {
  color: var(--ui-color-text-muted);
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.ui-combobox__empty {
  min-block-size: var(--ui-menu-item-height);
  display: flex;
  align-items: center;
  padding: var(--ui-space-1) var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}
</style>
