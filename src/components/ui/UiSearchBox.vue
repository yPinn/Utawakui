<script setup>
// Track-search input — was duplicated once per SetlistView layout branch
// (playlist toolbar vs. all-tracks page header). v-model owns clearing too,
// so callers don't need a separate clear handler.
import { computed, useAttrs, useId } from 'vue';
import { ICON_SIZE, Search, X } from '../../icons/index.js';
import { nativeControlAttrs } from './fieldAttrs.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  id: { type: String, default: '' },
  label: { type: String, default: '搜尋曲目' },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '搜尋曲目' },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const generatedId = useId();
const controlId = computed(() => props.id || `ui-search-${generatedId}`);

function clear() {
  if (!props.disabled) emit('update:modelValue', '');
}
</script>

<template>
  <div class="ui-search-box" :class="attrs.class" :style="attrs.style">
    <label class="ui-search-box__label" :for="controlId">{{ label }}</label>
    <div class="ui-search-box__control">
      <Search
        class="ui-search-box__icon"
        :size="ICON_SIZE"
        aria-hidden="true"
      />
      <input
        v-bind="nativeControlAttrs(attrs)"
        :id="controlId"
        :value="modelValue"
        class="ui-search-box__input"
        type="search"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="emit('update:modelValue', $event.target.value)"
      />
      <button
        v-if="modelValue"
        type="button"
        class="ui-search-box__clear"
        aria-label="清除搜尋"
        title="清除搜尋"
        :disabled="disabled"
        @click="clear"
      >
        <X :size="ICON_SIZE" aria-hidden="true" />
      </button>
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
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  width: 100%;
  min-width: 0;
  min-height: var(--ui-field-height);
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  border: var(--ui-border-width) solid var(--ui-field-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
  color: var(--ui-color-text-muted);
}

.ui-search-box__icon {
  flex: 0 0 auto;
}

.ui-search-box__input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  color: var(--ui-field-fg);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
}

.ui-search-box__input::placeholder {
  color: var(--ui-field-placeholder);
}

.ui-search-box__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-color-text-muted);
  cursor: pointer;
}

.ui-search-box__clear:hover {
  color: var(--ui-color-text);
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
