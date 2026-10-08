<script setup>
import { computed } from 'vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  track: { type: Object, required: true },
  sourceName: { type: String, default: '目前佇列' },
  sourceLinkLabel: { type: String, default: '' },
  sourceNavigable: { type: Boolean, default: false },
});

const emit = defineEmits(['navigateSource']);

const artistName = computed(() => props.track?.artist || '未知演唱者');
const accessibleLabel = computed(
  () => `目前歌曲：${props.track?.title || '未命名曲目'}，${artistName.value}`,
);
</script>

<template>
  <article class="track-context-hero" :aria-label="accessibleLabel">
    <UiTrackThumb
      class="track-context-hero__artwork"
      :track="track"
      size="100%"
      radius="var(--ui-radius-lg)"
      font-size="var(--ui-font-size-2xl)"
      :decorative="false"
      decoding="async"
    >
      <template #overlay>
        <div class="track-context-hero__overlay">
          <div class="track-context-hero__source">
            <UiTextButton
              v-if="sourceNavigable"
              class="track-context-hero__source-link"
              :text="sourceName"
              :aria-label="sourceLinkLabel"
              overflow="ellipsis"
              @click="emit('navigateSource')"
            />
            <span v-else class="track-context-hero__source-label">
              {{ sourceName }}
            </span>
          </div>

          <div class="track-context-hero__identity">
            <div class="track-context-hero__copy">
              <p class="track-context-hero__title" :title="track.title">
                {{ track.title || '未命名曲目' }}
              </p>
              <p class="track-context-hero__artist" :title="artistName">
                {{ artistName }}
              </p>
            </div>
            <div v-if="$slots.actions" class="track-context-hero__actions">
              <slot name="actions" />
            </div>
          </div>
        </div>
      </template>
    </UiTrackThumb>
  </article>
</template>

<style scoped>
.track-context-hero {
  min-inline-size: 0;
  aspect-ratio: 1;
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-contact);
  overflow: hidden;
}

.track-context-hero__artwork {
  display: flex;
}

.track-context-hero__overlay {
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--ui-space-4);
  background: linear-gradient(
    to bottom,
    var(--ui-color-overlay-scrim),
    transparent 38%,
    transparent 46%,
    var(--ui-color-overlay-scrim-active)
  );
  color: var(--ui-color-overlay-contrast);
}

.track-context-hero__source {
  min-inline-size: 0;
  align-self: flex-start;
  max-inline-size: 100%;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.track-context-hero__source-link,
.track-context-hero__source-label {
  min-block-size: var(--ui-control-height);
  display: flex;
  align-items: center;
  color: inherit;
}

.track-context-hero__identity {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--ui-space-2);
}

.track-context-hero__copy {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.track-context-hero__title,
.track-context-hero__artist {
  margin: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.track-context-hero__title {
  display: -webkit-box;
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.track-context-hero__artist {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-context-hero__actions {
  align-self: end;
}

.track-context-hero__source,
.track-context-hero__identity {
  -webkit-user-select: none;
  user-select: none;
}
</style>
