<script setup>
import TrackArtistCredits from '../../track/TrackArtistCredits.vue';
import UiOverflowTooltip from '../../ui/UiOverflowTooltip.vue';
import UiTextButton from '../../ui/UiTextButton.vue';

// Title, artist and actions for TrackContextHero, over artwork or under video.
defineProps({
  track: { type: Object, required: true },
  title: { type: String, required: true },
  artistName: { type: String, required: true },
  albumCtaLabel: { type: String, default: '' },
});
const emit = defineEmits(['open-album']);
</script>

<template>
  <div class="track-context-hero__identity">
    <div class="track-context-hero__copy">
      <UiTextButton
        v-if="albumCtaLabel"
        class="track-context-hero__title"
        :text="title"
        :aria-label="albumCtaLabel"
        overflow="clamp"
        @click="emit('open-album')"
      />
      <UiOverflowTooltip
        v-else
        as="p"
        class="track-context-hero__title track-context-hero__title-text"
        :text="title"
      >
        {{ title }}
      </UiOverflowTooltip>
      <TrackArtistCredits
        v-if="track.artist || track.artistCredits?.length"
        class="track-context-hero__artist"
        :track="track"
        :title="artistName"
      />
      <UiOverflowTooltip
        v-else
        as="p"
        class="track-context-hero__artist"
        :text="artistName"
      >
        {{ artistName }}
      </UiOverflowTooltip>
    </div>
    <div v-if="$slots.actions" class="track-context-hero__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.track-context-hero__identity {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--ui-space-2);
  -webkit-user-select: none;
  user-select: none;
}

.track-context-hero__copy {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.track-context-hero__title,
.track-context-hero__artist {
  margin: 0;
  max-inline-size: 100%;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.track-context-hero__title {
  color: inherit;
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.track-context-hero__title-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.track-context-hero__artist {
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-context-hero__actions {
  align-self: end;
}
</style>
