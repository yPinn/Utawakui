<script setup>
// This project's first aria-activedescendant / role="listbox" pattern — focus
// stays on the input the entire time; the listbox is display-only and never
// receives real DOM focus. Scope is intentionally narrow: pick one value from
// caller-provided flat items or semantic groups. Editable consumers can type
// to filter; select-only consumers use a real button trigger. No free-text
// (creatable) value and no async/server-side filtering — both are left for a
// real consumer to ask for.
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
import { Check, ChevronDown, ICON_SIZE } from '../../icons/index.js';
import { useFloatingSurfaceGate } from '../../composables/useFloatingSurfaceGate.js';
import { useUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import {
  anchoredFloatingPosition,
  customLengthPixels,
} from './floatingPosition.js';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';
import UiScrollRegion from './UiScrollRegion.vue';

const overlayHost = useUiOverlayHost();

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
  editable: { type: Boolean, default: true },
  noResultsText: { type: String, default: '沒有符合的結果' },
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const { claim, release } = useFloatingSurfaceGate();

const controlRef = useTemplateRef('control');
const listboxRef = useTemplateRef('listbox');
const query = shallowRef('');
const isFiltering = shallowRef(false);
const isOpen = shallowRef(false);
const highlightedIndex = shallowRef(-1);
const position = shallowRef({ left: '0px', top: '0px', width: '0px' });
const listboxRoot = () => listboxRef.value?.root;
const listboxViewport = () => listboxRef.value?.viewport;

let frameId = 0;

const listboxId = `${props.id}-listbox`;

function isItemGroup(entry) {
  return Array.isArray(entry?.options);
}

const itemGroups = computed(() =>
  props.items.map((entry, index) => {
    if (!isItemGroup(entry)) {
      return {
        key: `option:${String(entry.value)}:${index}`,
        label: '',
        items: [entry],
      };
    }

    return {
      key: `group:${entry.label}:${index}`,
      label: String(entry.label ?? ''),
      items: entry.options.map((item) => ({
        ...item,
        disabled: Boolean(entry.disabled || item.disabled),
      })),
    };
  }),
);
const flatItems = computed(() =>
  itemGroups.value.flatMap(({ items }) => items),
);
const selectedItem = computed(() =>
  flatItems.value.find(
    (item) => String(item.value) === String(props.modelValue),
  ),
);

function isSelected(item) {
  return (
    Boolean(selectedItem.value) &&
    String(item.value) === String(selectedItem.value.value)
  );
}
const filteredGroups = computed(() => {
  const needle = isFiltering.value ? query.value.trim().toLowerCase() : '';
  if (!needle) return itemGroups.value;
  return itemGroups.value
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        String(item.searchText ?? item.label)
          .toLowerCase()
          .includes(needle),
      ),
    }))
    .filter(({ items }) => items.length > 0);
});
const filteredItems = computed(() =>
  filteredGroups.value.flatMap(({ items }) => items),
);
const filteredItemIndexByValue = computed(
  () =>
    new Map(
      filteredItems.value.map((item, index) => [String(item.value), index]),
    ),
);

function optionId(item) {
  return `${props.id}-option-${String(item.value)}`;
}

function optionIndex(item) {
  return filteredItemIndexByValue.value.get(String(item.value)) ?? -1;
}

const activeOptionId = computed(() => {
  const item = filteredItems.value[highlightedIndex.value];
  return item ? optionId(item) : undefined;
});

watch(
  [isOpen, activeOptionId],
  ([open, optionIdValue]) => {
    if (
      !open ||
      !optionIdValue ||
      typeof document === 'undefined' ||
      typeof document.getElementById !== 'function'
    ) {
      return;
    }
    document.getElementById(optionIdValue)?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    });
  },
  { flush: 'post' },
);

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
  isFiltering.value = false;
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
  const anchor = controlRef.value?.getBoundingClientRect();
  const surface = listboxRoot()?.getBoundingClientRect();
  if (!anchor || !surface) return;

  const { left, top } = anchoredFloatingPosition({
    anchor,
    surface,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    placement: 'bottom-start',
    direction: window.getComputedStyle(controlRef.value).direction,
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
  isFiltering.value = false;
  query.value = String(item.label);
  closeList();
  controlRef.value?.focus();
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
  isFiltering.value = true;
  query.value = event.target.value;
  ensureOpen();
  highlightedIndex.value = firstEnabledIndex();
}

function onClick() {
  if (!isOpen.value) openWithSelection();
}

function onSelectOnlyClick() {
  if (isOpen.value) closeList({ revertQuery: true });
  else openWithSelection();
}

function highlightItem(item) {
  if (item.disabled) return;
  highlightedIndex.value = optionIndex(item);
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
  if (!props.editable && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    if (isOpen.value && highlightedIndex.value >= 0) commitHighlighted();
    else openWithSelection();
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
    controlRef.value?.contains(event.target) ||
    listboxRoot()?.contains(event.target)
  ) {
    return;
  }
  closeList({ revertQuery: true });
}

function onOutsideScroll(event) {
  if (!isOpen.value) return;
  if (
    event.target === listboxViewport() ||
    listboxRoot()?.contains(event.target)
  ) {
    return;
  }
  closeList({ revertQuery: true });
}

function onResize() {
  updatePosition();
}

function focus() {
  controlRef.value?.focus();
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
        <button
          v-if="!editable"
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="control"
          class="ui-combobox__native ui-combobox__select-trigger"
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          :disabled="disabled"
          :aria-required="required || undefined"
          :aria-expanded="isOpen"
          :aria-controls="listboxId"
          :aria-activedescendant="activeOptionId"
          :aria-describedby="describedBy"
          :aria-invalid="fieldInvalid || undefined"
          @click="onSelectOnlyClick"
          @keydown="onKeydown"
          @blur="onBlur"
        >
          <span
            class="ui-combobox__value"
            :class="{ 'ui-combobox__value--placeholder': !selectedItem }"
          >
            {{ query || placeholder }}
          </span>
        </button>
        <input
          v-else
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="control"
          class="ui-combobox__native"
          type="text"
          role="combobox"
          autocomplete="off"
          aria-haspopup="listbox"
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
          @click="onClick"
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

  <!-- Deferred: an always-mounted overlay can mount in the same pass as its
       surface host, before that host is in the document. -->
  <Teleport defer :to="overlayHost || undefined" :disabled="!overlayHost">
    <UiScrollRegion
      v-if="isOpen"
      :id="listboxId"
      ref="listbox"
      class="ui-combobox__listbox"
      axis="vertical"
      viewport-tag="ul"
      viewport-class="ui-combobox__listbox-viewport"
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
      <template v-for="group in filteredGroups" :key="group.key">
        <li class="ui-combobox__group-shell" role="presentation">
          <span
            v-if="group.label"
            class="ui-combobox__group-label"
            aria-hidden="true"
          >
            {{ group.label }}
          </span>
          <ul
            class="ui-combobox__group-options"
            :role="group.label ? 'group' : 'presentation'"
            :aria-label="group.label || undefined"
          >
            <li
              v-for="item in group.items"
              :id="optionId(item)"
              :key="String(item.value)"
              class="ui-combobox__option"
              :class="{
                'ui-combobox__option--grouped': group.label,
                'ui-combobox__option--active':
                  optionIndex(item) === highlightedIndex,
              }"
              role="option"
              :aria-selected="isSelected(item)"
              :aria-disabled="item.disabled || undefined"
              @pointerenter="highlightItem(item)"
              @mousedown.prevent
              @click="selectItem(item)"
            >
              <span class="ui-combobox__option-content">
                <slot name="option" :item="item" :selected="isSelected(item)">
                  {{ item.label }}
                </slot>
              </span>
              <span
                class="ui-combobox__option-indicator"
                :class="{
                  'ui-combobox__option-indicator--selected': isSelected(item),
                }"
                aria-hidden="true"
              >
                <Check v-if="isSelected(item)" :size="ICON_SIZE" />
              </span>
            </li>
          </ul>
        </li>
      </template>
    </UiScrollRegion>
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
  font-size: var(--ui-field-font-size);
  font-weight: var(--ui-field-font-weight);
  line-height: var(--ui-field-line-height);
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.ui-combobox__select-trigger {
  appearance: none;
  display: flex;
  align-items: center;
  text-align: start;
  cursor: pointer;
  user-select: none;
}

.ui-combobox__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-combobox__value--placeholder {
  color: var(--ui-field-placeholder);
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
  border: var(--ui-border-width) solid var(--ui-floating-list-border);
  border-radius: var(--ui-floating-list-radius);
  background: var(--ui-floating-list-bg);
  box-shadow: var(--ui-floating-list-shadow);
}

.ui-combobox__listbox :deep(.ui-combobox__listbox-viewport) {
  block-size: auto;
  max-block-size: inherit;
  margin: 0;
  padding: var(--ui-floating-list-padding);
  overscroll-behavior: contain;
  list-style: none;
}

.ui-combobox__option {
  min-block-size: var(--ui-floating-row-min-height);
  display: flex;
  align-items: center;
  padding: var(--ui-floating-row-padding-block)
    var(--ui-floating-row-padding-inline);
  overflow: hidden;
  border-radius: var(--ui-floating-row-radius);
  color: var(--ui-color-text);
  font-size: var(--ui-floating-row-font-size);
  font-weight: var(--ui-floating-row-font-weight);
  line-height: var(--ui-floating-row-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.ui-combobox__option-content {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.ui-combobox__option-indicator {
  inline-size: var(--ui-space-4);
  flex: 0 0 var(--ui-space-4);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-inline-start: var(--ui-space-2);
  color: var(--ui-color-accent);
}

.ui-combobox__group-shell,
.ui-combobox__group-options {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ui-combobox__group-label {
  display: block;
  padding: var(--ui-space-2) var(--ui-space-2) var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-caption-line-height);
}

.ui-combobox__option--grouped .ui-combobox__option-content {
  margin-inline-start: var(--ui-space-2);
}

.ui-combobox__option[aria-selected='true'] {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-text);
}

.ui-combobox__option--active,
.ui-combobox__option:hover:not([aria-disabled='true']) {
  background: var(--ui-color-surface-hover);
}

.ui-combobox__option[aria-disabled='true'] {
  color: var(--ui-color-text-muted);
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.ui-combobox__empty {
  min-block-size: var(--ui-floating-row-min-height);
  display: flex;
  align-items: center;
  padding: var(--ui-floating-row-padding-block)
    var(--ui-floating-row-padding-inline);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}
</style>
