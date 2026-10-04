<script setup>
import UiCollageThumb from '../ui/UiCollageThumb.vue';

defineProps({
  entityKind: {
    type: String,
    required: true,
    validator: (value) => ['playlist', 'album'].includes(value),
  },
  title: { type: String, required: true },
  titleId: { type: String, default: 'collection-title' },
  artist: { type: String, default: '' },
  meta: { type: String, default: '' },
  coverTracks: { type: Array, default: () => [] },
  coverUrl: { type: String, default: '' },
  description: { type: String, default: '' },
});
</script>

<template>
  <section class="library-entity-dossier" :aria-labelledby="titleId">
    <header class="library-entity-dossier__heading">
      <h1 :id="titleId" class="library-entity-dossier__title">
        {{ title }}
      </h1>
    </header>

    <div class="library-entity-dossier__sheet">
      <span class="library-entity-dossier__marker">
        {{ entityKind === 'album' ? '專輯資料' : '播放清單資料' }}
      </span>

      <div class="library-entity-dossier__body">
        <div class="library-entity-dossier__artwork">
          <UiCollageThumb
            :cover-url="coverUrl"
            :tracks="coverTracks"
            :can-collage="entityKind === 'playlist'"
            :size="136"
          />
          <slot name="artwork-action" />
        </div>

        <div class="library-entity-dossier__content">
          <p v-if="artist" class="library-entity-dossier__artist">
            {{ artist }}
          </p>
          <p v-if="meta" class="library-entity-dossier__meta">{{ meta }}</p>
          <p v-if="description" class="library-entity-dossier__description">
            {{ description }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.library-entity-dossier {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-4);
}

.library-entity-dossier__heading {
  min-width: 0;
  padding-block-start: var(--ui-space-2);
}

.library-entity-dossier__title {
  max-width: 24ch;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-2xl);
  line-height: var(--ui-line-height-display);
  font-weight: var(--ui-font-weight-bold);
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.library-entity-dossier__sheet {
  min-width: 0;
  overflow: hidden;
  background: var(--ui-color-surface-raised);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}

.library-entity-dossier__marker {
  display: inline-flex;
  min-height: var(--ui-space-6);
  align-items: center;
  padding-inline: var(--ui-space-3);
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  border-end-end-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.library-entity-dossier__body {
  min-width: 0;
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: end;
  padding: var(--ui-space-5);
}

.library-entity-dossier__artwork {
  position: relative;
  width: 136px;
  aspect-ratio: 1;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
}

.library-entity-dossier__content {
  min-width: 0;
  display: grid;
  align-content: end;
  gap: var(--ui-space-2);
}

.library-entity-dossier__artist,
.library-entity-dossier__meta,
.library-entity-dossier__description {
  margin: 0;
}

.library-entity-dossier__artist {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  overflow-wrap: anywhere;
}

.library-entity-dossier__meta,
.library-entity-dossier__description {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.library-entity-dossier__description {
  max-width: 72ch;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@container app-folder-layout (max-width: 36rem) {
  .library-entity-dossier__body {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }
}
</style>
