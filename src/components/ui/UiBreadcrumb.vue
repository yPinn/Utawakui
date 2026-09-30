<script setup>
// A navigation trail, not a second Tabs. Overflow is intentionally left to
// the shared horizontal Scroll Region (matching UiTabs/UiSegmentedControl) — no
// ellipsis-collapse of middle items is implemented because no real consumer
// needs it yet; add that behavior only once one does.
import { ChevronRight, ICON_SIZE } from '../../icons/index.js';
import UiScrollRegion from './UiScrollRegion.vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  ariaLabel: { type: String, required: true },
});

const emit = defineEmits(['select']);

function isCurrent(index) {
  return index === props.items.length - 1;
}
</script>

<template>
  <nav class="ui-breadcrumb" :aria-label="ariaLabel">
    <UiScrollRegion
      class="ui-breadcrumb__scroll"
      axis="horizontal"
      viewport-tag="ol"
      viewport-class="ui-breadcrumb__list"
    >
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="ui-breadcrumb__item"
      >
        <ChevronRight
          v-if="index > 0"
          class="ui-breadcrumb__separator"
          :size="ICON_SIZE"
          aria-hidden="true"
        />
        <span
          v-if="isCurrent(index)"
          class="ui-breadcrumb__current"
          aria-current="page"
          >{{ item.label }}</span
        >
        <a
          v-else-if="item.href && !item.disabled"
          class="ui-breadcrumb__link"
          :href="item.href"
          @click="emit('select', item, index)"
          >{{ item.label }}</a
        >
        <button
          v-else
          type="button"
          class="ui-breadcrumb__link"
          :disabled="item.disabled"
          @click="emit('select', item, index)"
        >
          {{ item.label }}
        </button>
      </li>
    </UiScrollRegion>
  </nav>
</template>

<style scoped>
.ui-breadcrumb {
  min-width: 0;
  max-width: 100%;
}

.ui-breadcrumb__scroll {
  min-width: 0;
  max-width: 100%;
}

.ui-breadcrumb__scroll :deep(.ui-breadcrumb__list) {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0;
  list-style: none;
  overscroll-behavior-inline: contain;
}

.ui-breadcrumb__item {
  min-width: 0;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
}

.ui-breadcrumb__separator {
  flex: 0 0 auto;
  margin-inline: var(--ui-space-1);
  color: var(--ui-color-text-muted);
}

.ui-breadcrumb__link,
.ui-breadcrumb__current {
  min-width: 0;
  max-width: var(--ui-breadcrumb-segment-max-inline-size);
  overflow: hidden;
  font: inherit;
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-breadcrumb__current {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.ui-breadcrumb__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-color-text-muted);
  text-decoration: none;
  cursor: pointer;
}

.ui-breadcrumb__link:hover:not(:disabled) {
  color: var(--ui-color-text);
  text-decoration: underline;
}

.ui-breadcrumb__link:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  border-radius: var(--ui-radius-md);
  color: var(--ui-color-text);
  text-decoration: underline;
}

.ui-breadcrumb__link:disabled {
  color: var(--ui-color-text-muted);
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}
</style>
