<script setup>
import { UserRound } from '../../icons/index.js';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiTextButton from '../ui/UiTextButton.vue';

defineProps({
  entityKind: {
    type: String,
    required: true,
    validator: (value) => ['playlist', 'album', 'artist'].includes(value),
  },
  title: { type: String, required: true },
  titleId: { type: String, default: 'collection-title' },
  artist: { type: String, default: '' },
  artistLinkLabel: { type: String, default: '' },
  meta: { type: String, default: '' },
  coverTracks: { type: Array, default: () => [] },
  coverUrl: { type: String, default: '' },
  description: { type: String, default: '' },
});

const emit = defineEmits(['selectArtist']);

const MARKER_BY_KIND = Object.freeze({
  album: '專輯資料',
  artist: '藝人資料',
  playlist: '播放清單資料',
});
</script>

<template>
  <section class="library-entity-dossier" :aria-labelledby="titleId">
    <div class="library-entity-dossier__sheet">
      <div class="library-entity-dossier__body">
        <div
          class="library-entity-dossier__artwork"
          data-artwork-reveal-scope="focus-within"
          :class="{
            'library-entity-dossier__artwork--round': entityKind === 'artist',
          }"
        >
          <!-- The bordered frame is the single radius clip, so the thumb and
               its overlay plane composite inside it without their own radius.
               Full-cover content (scrims, cover actions) shares the overlay
               plane; corner controls use #artwork-action. -->
          <UiCollageThumb
            :cover-url="coverUrl"
            :tracks="coverTracks"
            :can-collage="entityKind === 'playlist'"
            :size="136"
            radius="0"
            :empty-icon="entityKind === 'artist' ? UserRound : null"
            :decorative="!$slots['artwork-overlay']"
          >
            <template v-if="$slots['artwork-overlay']" #overlay>
              <slot name="artwork-overlay" />
            </template>
          </UiCollageThumb>
          <slot name="artwork-action" />
        </div>

        <div class="library-entity-dossier__content">
          <span class="library-entity-dossier__marker">
            {{ MARKER_BY_KIND[entityKind] }}
          </span>
          <h1 :id="titleId" class="library-entity-dossier__title">
            {{ title }}
          </h1>

          <div
            v-if="artist || meta || description"
            class="library-entity-dossier__details"
          >
            <p v-if="artist" class="library-entity-dossier__artist">
              <UiTextButton
                v-if="artistLinkLabel"
                class="library-entity-dossier__artist-link"
                :text="artist"
                :aria-label="artistLinkLabel"
                @click="emit('selectArtist')"
              />
              <template v-else>{{ artist }}</template>
            </p>
            <p v-if="meta" class="library-entity-dossier__meta">{{ meta }}</p>
            <p v-if="description" class="library-entity-dossier__description">
              {{ description }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.library-entity-dossier {
  min-width: 0;
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
  background: var(--ui-folder-dossier-background, transparent);
  border: 0;
  border-radius: 0;
}

.library-entity-dossier__marker {
  display: block;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.library-entity-dossier__body {
  min-width: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: end;
  padding: var(--ui-space-5);
}

/* The hairline wraps the 136px artwork instead of eating into it, so the
   artwork (and a round artist avatar's glyph) stays exactly centered. */
.library-entity-dossier__artwork {
  position: relative;
  box-sizing: content-box;
  justify-self: start;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  /* Border-coloured ground keeps the clipped corner AA from opening a seam. */
  background: var(--ui-color-border);
}

.library-entity-dossier__artwork--round {
  border-radius: var(--ui-radius-pill);
}

/* UiTextButton leaves font-weight to its caller. */
.library-entity-dossier__artist-link {
  font-weight: inherit;
}

.library-entity-dossier__content {
  min-width: 0;
  display: grid;
  align-content: end;
  gap: var(--ui-space-2);
}

.library-entity-dossier__details {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
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
