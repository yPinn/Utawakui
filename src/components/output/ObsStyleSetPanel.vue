<script setup>
import {
  ICON_SIZE,
  Palette,
  Plus,
  SlidersHorizontal,
  Type,
} from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

const iconByKind = {
  typography: Type,
  surface: Palette,
  layout: SlidersHorizontal,
};

defineProps({
  sets: { type: Array, default: () => [] },
});
</script>

<template>
  <section class="obs-style-set-panel" aria-label="樣式集工作區">
    <header class="obs-style-set-panel__header">
      <div>
        <h2 class="obs-style-set-panel__title">樣式集</h2>
      </div>
      <UiButton :icon="Plus" title="新增樣式集" disabled>新增樣式</UiButton>
    </header>

    <div class="obs-style-set-panel__rows">
      <article v-for="set in sets" :key="set.id" class="obs-style-set-row">
        <div class="obs-style-set-row__icon" aria-hidden="true">
          <component
            :is="iconByKind[set.kind] ?? SlidersHorizontal"
            :size="ICON_SIZE"
          />
        </div>

        <div class="obs-style-set-row__copy">
          <div class="obs-style-set-row__heading">
            <h3 class="obs-style-set-row__name">{{ set.name }}</h3>
            <UiChip :tone="set.tone ?? 'muted'">{{ set.status }}</UiChip>
          </div>
          <p class="obs-style-set-row__summary">{{ set.summary }}</p>
        </div>

        <dl class="obs-style-set-row__tokens">
          <div
            v-for="token in set.tokens"
            :key="token.label"
            class="obs-style-set-row__token"
          >
            <dt>{{ token.label }}</dt>
            <dd>{{ token.value }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>

<style scoped>
.obs-style-set-panel {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-3);
  min-width: 0;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
}

.obs-style-set-panel__header,
.obs-style-set-row,
.obs-style-set-row__heading,
.obs-style-set-row__tokens {
  display: flex;
  align-items: center;
}

.obs-style-set-panel__header {
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.obs-style-set-panel__title,
.obs-style-set-row__name {
  margin: 0;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.obs-style-set-panel__title,
.obs-style-set-row__name {
  font-size: var(--ui-font-size-md);
}

.obs-style-set-row__summary,
.obs-style-set-row__token dd {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.obs-style-set-panel__rows {
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
  min-height: 0;
  overflow: auto;
}

.obs-style-set-row {
  gap: var(--ui-space-2);
  min-width: 0;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
}

.obs-style-set-row__icon {
  display: inline-flex;
  flex: 0 0 var(--ui-icon-button-size-md);
  align-items: center;
  justify-content: center;
  width: var(--ui-icon-button-size-md);
  height: var(--ui-icon-button-size-md);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.obs-style-set-row__copy {
  flex: 1;
  display: grid;
  gap: var(--ui-space-1);
  min-width: 0;
}

.obs-style-set-row__heading {
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-style-set-row__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-style-set-row__tokens {
  gap: var(--ui-space-3);
  margin: 0;
}

.obs-style-set-row__token {
  display: grid;
  gap: calc(var(--ui-space-1) / 2);
}

.obs-style-set-row__token dt {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

@media (max-width: 900px) {
  .obs-style-set-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .obs-style-set-row__tokens {
    width: 100%;
  }
}

@media (max-width: 680px) {
  .obs-style-set-panel__header,
  .obs-style-set-row__heading,
  .obs-style-set-row__tokens {
    align-items: flex-start;
  }

  .obs-style-set-panel__header,
  .obs-style-set-row__heading {
    flex-direction: column;
  }
}
</style>
