<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { Check, ChevronDown, ICON_SIZE } from '../../icons/index.js';
import { useContextMenuGate } from '../../composables/useContextMenuGate.js';
import { useUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import {
  anchoredFloatingPosition,
  customLengthPixels,
} from '../ui/floatingPosition.js';
import UiScrollRegion from '../ui/UiScrollRegion.vue';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, required: true },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const overlayHost = useUiOverlayHost();
const { claim, release } = useContextMenuGate();
const triggerRef = useTemplateRef('trigger');
const listboxRef = useTemplateRef('listbox');
const isOpen = shallowRef(false);
const activeIndex = shallowRef(-1);
const position = shallowRef({ left: '0px', top: '0px', width: '16rem' });
const listboxId = `${props.id}-listbox`;
let frameId = 0;

const selectedIndex = computed(() =>
  props.options.findIndex(
    (option) => option.id === props.modelValue && !option.disabled,
  ),
);
const selectedOption = computed(
  () =>
    props.options[selectedIndex.value] ??
    props.options.find((option) => !option.disabled) ??
    null,
);
const activeOption = computed(() => props.options[activeIndex.value] ?? null);
const activeOptionId = computed(() =>
  isOpen.value && activeOption.value ? optionId(activeOption.value) : undefined,
);

function optionId(option) {
  return `${props.id}-option-${option.id}`;
}

function listboxRoot() {
  return listboxRef.value?.root;
}

function listboxViewport() {
  return listboxRef.value?.viewport;
}

function firstEnabledIndex() {
  return props.options.findIndex((option) => !option.disabled);
}

function lastEnabledIndex() {
  for (let index = props.options.length - 1; index >= 0; index -= 1) {
    if (!props.options[index]?.disabled) return index;
  }
  return -1;
}

function scheduleFrame(callback) {
  if (typeof window === 'undefined') return;
  window.cancelAnimationFrame(frameId);
  frameId = window.requestAnimationFrame(callback);
}

function updatePosition() {
  if (!isOpen.value || typeof window === 'undefined') return;
  const anchor = triggerRef.value?.getBoundingClientRect();
  const surface = listboxRoot()?.getBoundingClientRect();
  if (!anchor || !surface) return;
  const width = anchor.width;
  const { left, top } = anchoredFloatingPosition({
    anchor,
    surface: { height: surface.height, width },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    placement: 'bottom-start',
    direction: window.getComputedStyle(triggerRef.value).direction,
    gap: customLengthPixels('--ui-floating-gap', 0.5),
    inset: customLengthPixels('--ui-floating-viewport-inset', 0.5),
  });
  position.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
  };
}

function closeFromGate() {
  closeList();
}

function openList() {
  if (props.disabled || isOpen.value) return;
  activeIndex.value =
    selectedIndex.value >= 0 ? selectedIndex.value : firstEnabledIndex();
  isOpen.value = true;
  claim(closeFromGate);
  nextTick(() => scheduleFrame(updatePosition));
}

function closeList({ returnFocus = false } = {}) {
  if (!isOpen.value) return;
  isOpen.value = false;
  activeIndex.value = -1;
  release(closeFromGate);
  if (returnFocus) nextTick(() => triggerRef.value?.focus());
}

function toggleList() {
  if (isOpen.value) closeList();
  else openList();
}

function selectOption(option) {
  if (!option || option.disabled) return;
  if (option.id !== props.modelValue) emit('update:modelValue', option.id);
  closeList({ returnFocus: true });
}

function activateOption(index, option) {
  if (!option.disabled) activeIndex.value = index;
}

function moveActive(delta) {
  if (props.options.length === 0) return;
  let index = activeIndex.value;
  for (let step = 0; step < props.options.length; step += 1) {
    index = (index + delta + props.options.length) % props.options.length;
    if (!props.options[index]?.disabled) {
      activeIndex.value = index;
      return;
    }
  }
}

function onKeydown(event) {
  if (props.disabled) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!isOpen.value) openList();
    else moveActive(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (event.key === 'Home' && isOpen.value) {
    event.preventDefault();
    activeIndex.value = firstEnabledIndex();
    return;
  }
  if (event.key === 'End' && isOpen.value) {
    event.preventDefault();
    activeIndex.value = lastEnabledIndex();
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (isOpen.value) selectOption(activeOption.value);
    else openList();
    return;
  }
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault();
    event.stopPropagation?.();
    closeList({ returnFocus: true });
    return;
  }
  if (event.key === 'Tab' && isOpen.value) closeList();
}

function onOutsidePointer(event) {
  if (
    !isOpen.value ||
    triggerRef.value?.contains(event.target) ||
    listboxRoot()?.contains(event.target)
  ) {
    return;
  }
  closeList();
}

function onOutsideScroll(event) {
  if (
    !isOpen.value ||
    event.target === listboxViewport() ||
    listboxRoot()?.contains(event.target)
  ) {
    return;
  }
  closeList();
}

watch(
  () => [props.modelValue, props.options],
  () => {
    if (!isOpen.value) activeIndex.value = -1;
  },
);

onMounted(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.addEventListener('pointerdown', onOutsidePointer, true);
  window.addEventListener('scroll', onOutsideScroll, true);
  window.addEventListener('resize', updatePosition);
});

onBeforeUnmount(() => {
  release(closeFromGate);
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.cancelAnimationFrame(frameId);
  document.removeEventListener('pointerdown', onOutsidePointer, true);
  window.removeEventListener('scroll', onOutsideScroll, true);
  window.removeEventListener('resize', updatePosition);
});
</script>

<template>
  <button
    :id="id"
    ref="trigger"
    type="button"
    class="obs-look-select__trigger"
    role="combobox"
    :disabled="disabled"
    :aria-label="label"
    aria-haspopup="listbox"
    :aria-expanded="isOpen"
    :aria-controls="listboxId"
    :aria-activedescendant="activeOptionId"
    @click="toggleList"
    @keydown="onKeydown"
  >
    <span
      v-if="selectedOption"
      class="obs-look-select__preview"
      :data-look="selectedOption.id"
      aria-hidden="true"
    >
      <span class="obs-look-select__swatch obs-look-select__swatch--ink" />
      <span class="obs-look-select__swatch obs-look-select__swatch--paper" />
      <span class="obs-look-select__swatch obs-look-select__swatch--accent" />
    </span>
    <span class="obs-look-select__label">
      {{ selectedOption?.label ?? '選擇 Look' }}
    </span>
    <ChevronDown
      class="obs-look-select__indicator"
      :class="{ 'obs-look-select__indicator--open': isOpen }"
      :size="ICON_SIZE"
      aria-hidden="true"
    />
  </button>

  <Teleport defer :to="overlayHost || undefined" :disabled="!overlayHost">
    <UiScrollRegion
      v-if="isOpen"
      :id="listboxId"
      ref="listbox"
      class="obs-look-select__listbox"
      axis="vertical"
      viewport-tag="ul"
      viewport-class="obs-look-select__options"
      role="listbox"
      :aria-label="label"
      :style="position"
    >
      <li
        v-for="(option, index) in options"
        :id="optionId(option)"
        :key="option.id"
        class="obs-look-select__option"
        :class="{
          'obs-look-select__option--active': index === activeIndex,
        }"
        role="option"
        :aria-selected="option.id === modelValue"
        :aria-disabled="option.disabled || undefined"
        @mousedown.prevent
        @pointermove="activateOption(index, option)"
        @click="selectOption(option)"
      >
        <span
          class="obs-look-select__preview"
          :data-look="option.id"
          aria-hidden="true"
        >
          <span class="obs-look-select__swatch obs-look-select__swatch--ink" />
          <span
            class="obs-look-select__swatch obs-look-select__swatch--paper"
          />
          <span
            class="obs-look-select__swatch obs-look-select__swatch--accent"
          />
        </span>
        <span class="obs-look-select__label">{{ option.label }}</span>
        <Check
          v-if="option.id === modelValue"
          class="obs-look-select__check"
          :size="ICON_SIZE"
          aria-hidden="true"
        />
      </li>
    </UiScrollRegion>
  </Teleport>
</template>

<style scoped>
.obs-look-select__trigger {
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: var(--ui-field-height);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  border: var(--ui-border-width) solid var(--ui-field-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
  color: var(--ui-field-fg);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  text-align: start;
  cursor: pointer;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.obs-look-select__trigger:hover:not(:disabled) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.obs-look-select__trigger:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-look-select__trigger:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.obs-look-select__indicator {
  color: var(--ui-color-text-muted);
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.obs-look-select__indicator--open {
  transform: rotate(180deg);
}

.obs-look-select__listbox {
  position: fixed;
  z-index: var(--ui-z-popover);
  box-sizing: border-box;
  max-inline-size: calc(100vw - (2 * var(--ui-floating-viewport-inset)));
  max-block-size: min(
    18rem,
    calc(100vh - (2 * var(--ui-floating-viewport-inset)))
  );
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-color-surface-raised);
  box-shadow: var(--ui-shadow-overlay);
}

.obs-look-select__listbox :deep(.obs-look-select__options) {
  block-size: auto;
  max-block-size: inherit;
  margin: 0;
  padding: var(--ui-space-1);
  overscroll-behavior: contain;
  list-style: none;
}

.obs-look-select__option {
  min-block-size: var(--ui-menu-item-height);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
}

.obs-look-select__option--active {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.obs-look-select__option[aria-selected='true'] {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.obs-look-select__option[aria-disabled='true'] {
  color: var(--ui-color-text-muted);
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.obs-look-select__preview {
  inline-size: 2.25rem;
  block-size: 0.75rem;
  overflow: hidden;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-xs);
}

.obs-look-select__swatch--ink {
  background: var(--ui-output-look-preview-ink);
}

.obs-look-select__swatch--paper {
  background: var(--ui-output-look-preview-paper);
}

.obs-look-select__swatch--accent {
  background: var(--ui-output-look-preview-accent);
}

.obs-look-select__preview[data-look='original'] {
  --ui-output-look-preview-ink: var(--ui-output-look-original-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-original-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-original-accent);
}

.obs-look-select__preview[data-look='warm'] {
  --ui-output-look-preview-ink: var(--ui-output-look-warm-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-warm-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-warm-accent);
}

.obs-look-select__preview[data-look='cool'] {
  --ui-output-look-preview-ink: var(--ui-output-look-cool-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-cool-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-cool-accent);
}

.obs-look-select__preview[data-look='monochrome'] {
  --ui-output-look-preview-ink: var(--ui-output-look-monochrome-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-monochrome-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-monochrome-accent);
}

.obs-look-select__preview[data-look='high-contrast'] {
  --ui-output-look-preview-ink: var(--ui-output-look-contrast-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-contrast-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-contrast-accent);
}

.obs-look-select__label {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-look-select__check {
  color: var(--ui-color-accent);
}
</style>
