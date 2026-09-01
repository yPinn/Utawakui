<script setup>
import { BadgeCheck, ICON_SIZE } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';

defineProps({
  kindLabel: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  description: { type: String, default: '' },
  tracks: { type: Array, default: () => [] },
  coverUrl: { type: String, default: '' },
  canCollage: { type: Boolean, default: true },
});
</script>

<template>
  <header class="studio-dossier-header">
    <div class="studio-dossier-header__identity">
      <UiCollageThumb
        class="studio-dossier-header__cover"
        :cover-url="coverUrl"
        :tracks="tracks"
        :can-collage="canCollage"
        :size="88"
      />
      <div class="studio-dossier-header__copy">
        <h1 id="studio-library-title" class="studio-dossier-header__title">
          {{ title }}
        </h1>
        <p v-if="summary" class="studio-dossier-header__summary">
          {{ summary }}
        </p>
        <p v-if="description" class="studio-dossier-header__description">
          {{ description }}
        </p>
      </div>
    </div>

    <div class="studio-dossier-header__context" aria-label="資料狀態">
      <UiChip
        class="studio-dossier-header__kind"
        background="var(--ui-color-surface-raised)"
      >
        {{ kindLabel }}
      </UiChip>
      <UiChip class="studio-dossier-header__status" tone="success">
        <BadgeCheck :size="ICON_SIZE" aria-hidden="true" />
        真實資料
      </UiChip>
    </div>
  </header>
</template>

<style scoped>
.studio-dossier-header {
  display: flex;
  min-width: 0;
  min-height: 6.75rem;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-5);
  padding: var(--ui-space-4) var(--ui-panel-inset);
  background: transparent;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.studio-dossier-header__identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--ui-space-3);
}

.studio-dossier-header__cover {
  box-shadow: var(--ui-shadow-contact);
}

.studio-dossier-header__copy {
  min-width: 0;
}

.studio-dossier-header__title {
  margin: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-line-height-heading);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-dossier-header__summary,
.studio-dossier-header__description {
  margin: var(--ui-space-1) 0 0;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-dossier-header__description {
  max-width: 65ch;
  color: var(--ui-color-text-subtle);
}

.studio-dossier-header__context {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.studio-dossier-header__kind {
  border: var(--ui-border-width) solid var(--ui-color-border);
}

@container dossier (max-width: 45rem) {
  .studio-dossier-header {
    min-height: 5.5rem;
    gap: var(--ui-space-3);
    padding-block: var(--ui-space-3);
  }

  .studio-dossier-header__cover,
  .studio-dossier-header__kind {
    display: none;
  }
}

@container dossier (max-width: 34rem) {
  .studio-dossier-header__status,
  .studio-dossier-header__description {
    display: none;
  }
}
</style>
