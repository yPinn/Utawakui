<script setup>
// Track-search input — was duplicated once per Library browse layout branch
// (playlist toolbar vs. all-tracks page header). v-model owns clearing too,
// so callers don't need a separate clear handler.
import { computed, useAttrs, useId, useTemplateRef } from 'vue';
import { ICON_SIZE, Search, X } from '../../icons/index.js';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiTooltip from './UiTooltip.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  id: { type: String, default: '' },
  label: { type: String, default: '搜尋' },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '搜尋' },
  disabled: { type: Boolean, default: false },
  // Square divided icon cell, so the glyph can share a caller's artwork column.
  iconCell: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const generatedId = useId();
const controlId = computed(() => props.id || `ui-search-${generatedId}`);
const inputRef = useTemplateRef('input');

function clear() {
  if (props.disabled) return;
  emit('update:modelValue', '');
  focus();
}

function focus() {
  inputRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <div class="ui-search-box" :class="attrs.class" :style="attrs.style">
    <label class="ui-search-box__label" :for="controlId">{{ label }}</label>
    <div
      class="ui-search-box__control"
      :class="{
        'ui-search-box__control--clearable': modelValue,
        'ui-search-box__control--icon-cell': iconCell,
      }"
    >
      <span v-if="iconCell" class="ui-search-box__icon-cell" aria-hidden="true">
        <Search class="ui-search-box__icon" :size="ICON_SIZE" />
      </span>
      <Search
        v-else
        class="ui-search-box__icon"
        :size="ICON_SIZE"
        aria-hidden="true"
      />
      <input
        :id="controlId"
        ref="input"
        v-bind="nativeControlAttrs(attrs)"
        :value="modelValue"
        class="ui-search-box__input"
        type="search"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="emit('update:modelValue', $event.target.value)"
      />
      <UiTooltip v-if="modelValue" text="清除搜尋">
        <template #trigger="{ triggerProps }">
          <button
            v-bind="triggerProps"
            type="button"
            class="ui-search-box__clear"
            aria-label="清除搜尋"
            :disabled="disabled"
            @click="clear"
          >
            <X :size="ICON_SIZE" aria-hidden="true" />
          </button>
        </template>
      </UiTooltip>
    </div>
  </div>
</template>

<style scoped>
.ui-search-box {
  min-width: 0;
}

.ui-search-box__label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.ui-search-box__control {
  --ui-search-box-height: var(
    --ui-search-box-height-override,
    var(--ui-field-height)
  );

  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  width: 100%;
  min-width: 0;
  min-height: var(--ui-search-box-height);
  padding-block: var(--ui-field-padding-block);
  padding-inline-start: var(--ui-field-padding-inline);
  padding-inline-end: var(--ui-field-padding-inline);
  border: var(--ui-border-width) solid var(--ui-field-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-background);
  color: var(--ui-color-text-muted);
}

.ui-search-box__control--clearable {
  padding-inline-end: calc(var(--ui-search-clear-hit-size) + var(--ui-space-2));
}

.ui-search-box__icon {
  flex: 0 0 auto;
}

.ui-search-box__control--icon-cell {
  gap: var(--ui-space-2);
  padding-block: 0;
  padding-inline-start: 0;
}

.ui-search-box__icon-cell {
  position: relative;
  display: flex;
  flex: 0 0 var(--ui-search-box-height);
  align-items: center;
  justify-content: center;
  align-self: stretch;
  user-select: none;
}

.ui-search-box__icon-cell::after {
  content: '';
  position: absolute;
  inset-block: var(--ui-search-box-divider-inset-block);
  inset-inline-end: 0;
  width: var(--ui-border-width);
  background: var(--ui-field-border);
}

.ui-search-box__input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  color: var(--ui-field-foreground);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-field-font-size);
  font-weight: var(--ui-field-font-weight);
  line-height: var(--ui-field-line-height);
}

.ui-search-box__input::placeholder {
  color: var(--ui-field-placeholder);
}

.ui-search-box__input::-webkit-search-cancel-button,
.ui-search-box__input::-webkit-search-decoration {
  appearance: none;
  -webkit-appearance: none;
}

.ui-search-box__clear {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-inline-size: var(--ui-search-clear-hit-size);
  min-block-size: var(--ui-search-clear-hit-size);
  padding: 0;
  border: 0;
  border-radius: calc(var(--ui-field-radius) - var(--ui-border-width));
  background: transparent;
  color: var(--ui-color-text-muted);
  cursor: pointer;
}

.ui-search-box__clear:hover:not(:disabled) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.ui-search-box__clear:active:not(:disabled) {
  background: var(--ui-color-surface-active);
}

.ui-search-box__clear:focus-visible:not(:disabled) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-search-box__clear:disabled,
.ui-search-box__input:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.ui-search-box__control:focus-within {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
