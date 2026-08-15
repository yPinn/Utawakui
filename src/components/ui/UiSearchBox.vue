<script setup>
// Track-search input — was duplicated once per SetlistView layout branch
// (playlist toolbar vs. all-tracks page header). v-model owns clearing too,
// so callers don't need a separate clear handler.
import { ICON_SIZE, Search, X } from '../../icons/index.js';

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '搜尋曲目' },
});

defineEmits(['update:modelValue']);
</script>

<template>
  <label class="ui-search-box" title="搜尋曲目">
    <Search class="ui-search-box__icon" :size="ICON_SIZE" aria-hidden="true" />
    <input
      :value="modelValue"
      class="ui-search-box__input"
      type="search"
      :placeholder="placeholder"
      aria-label="搜尋曲目"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <button
      v-if="modelValue"
      type="button"
      class="ui-search-box__clear"
      aria-label="清除搜尋"
      title="清除搜尋"
      @click="$emit('update:modelValue', '')"
    >
      <X :size="ICON_SIZE" aria-hidden="true" />
    </button>
  </label>
</template>

<style scoped>
.ui-search-box {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  min-width: 180px;
  padding: var(--ui-space-1) var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
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
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
}

.ui-search-box__input::placeholder {
  color: var(--ui-color-text-muted);
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

.ui-search-box:focus-within {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
