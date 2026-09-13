<script setup>
import { computed } from 'vue';
import { formatDuration } from '../../utils/format.js';
import DemoCandidateMarqueeText from './DemoCandidateMarqueeText.vue';
import DemoCandidateTrackThumb from './DemoCandidateTrackThumb.vue';

const props = defineProps({
  track: { type: Object, default: null },
  title: { type: String, default: undefined },
  artist: { type: String, default: undefined },
  selected: { type: Boolean, default: false },
  current: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  hideDuration: { type: Boolean, default: false },
  artworkClickable: { type: Boolean, default: false },
  artworkAriaLabel: { type: String, default: undefined },
  actionAriaLabel: { type: String, default: undefined },
});

const emit = defineEmits(['activate', 'artworkClick']);

const displayTitle = computed(() => props.title ?? props.track?.title ?? '');
const displayArtist = computed(() => props.artist ?? props.track?.artist ?? '');
const displayDuration = computed(() => {
  const duration = props.track?.duration;
  return Number.isFinite(duration) && duration > 0
    ? formatDuration(duration)
    : '';
});
const thumbTrack = computed(() => ({
  id: props.track?.id,
  title: displayTitle.value,
  thumbnailUrl: props.track?.thumbnailUrl,
}));
const actionLabel = computed(
  () => props.actionAriaLabel || displayTitle.value || undefined,
);

function activateFromRowContent(event) {
  if (!props.interactive || props.disabled) return;

  const selection = event.view?.getSelection?.();
  if (selection && !selection.isCollapsed) return;

  emit('activate', event);
}
</script>

<template>
  <li
    class="demo-candidate-track-row"
    :class="{
      'is-selected': selected,
      'is-current': current,
      'is-interactive': interactive,
      'is-disabled': disabled,
    }"
    :aria-current="current ? 'true' : undefined"
    :data-marquee-focus-owner="interactive ? '' : undefined"
  >
    <button
      v-if="interactive"
      type="button"
      class="demo-candidate-track-row__action"
      :aria-label="actionLabel"
      :disabled="disabled"
      @click="emit('activate', $event)"
    ></button>

    <span
      v-if="$slots.lead"
      class="demo-candidate-track-row__lead"
      @click="activateFromRowContent"
    >
      <slot name="lead" />
    </span>

    <button
      v-if="artworkClickable"
      type="button"
      class="demo-candidate-track-row__artwork-action"
      :aria-label="artworkAriaLabel"
      :disabled="disabled"
      @click.stop="emit('artworkClick', $event)"
    >
      <DemoCandidateTrackThumb
        class="demo-candidate-track-row__thumb"
        :track="thumbTrack"
        :size="'var(--ui-track-row-thumb-size)'"
      />
    </button>
    <DemoCandidateTrackThumb
      v-else
      class="demo-candidate-track-row__thumb"
      :track="thumbTrack"
      :size="'var(--ui-track-row-thumb-size)'"
    />

    <span
      class="demo-candidate-track-row__info"
      @click="activateFromRowContent"
    >
      <DemoCandidateMarqueeText
        class="demo-candidate-track-row__title"
        :text="displayTitle"
      />
      <span v-if="displayArtist" class="demo-candidate-track-row__artist">
        {{ displayArtist }}
      </span>
    </span>

    <span
      v-if="$slots.trail"
      class="demo-candidate-track-row__trail"
      @click="activateFromRowContent"
    >
      <slot name="trail" />
    </span>

    <span
      v-if="displayDuration && !hideDuration"
      class="demo-candidate-track-row__duration"
    >
      {{ displayDuration }}
    </span>
  </li>
</template>

<style scoped>
.demo-candidate-track-row {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: var(--ui-track-row-min-height);
  display: flex;
  align-items: center;
  gap: var(--ui-track-row-gap);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  border-radius: var(--ui-radius-md);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-candidate-track-row.is-interactive {
  -webkit-user-select: none;
  user-select: none;
}

.demo-candidate-track-row.is-disabled {
  opacity: var(--ui-opacity-disabled);
}

.demo-candidate-track-row.is-selected {
  background: color-mix(in srgb, var(--ui-color-text) 8%, transparent);
}

.demo-candidate-track-row__action {
  position: absolute;
  z-index: 0;
  inset: 0;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

.demo-candidate-track-row:not(.is-selected)
  .demo-candidate-track-row__action:not(:disabled):hover {
  background: var(--ui-color-surface-hover);
}

.demo-candidate-track-row
  .demo-candidate-track-row__action:not(:disabled):active {
  background: var(--ui-color-surface-active);
}

.demo-candidate-track-row__action:disabled {
  cursor: default;
}

.demo-candidate-track-row__action:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-candidate-track-row__lead,
.demo-candidate-track-row__artwork-action,
.demo-candidate-track-row__thumb,
.demo-candidate-track-row__info,
.demo-candidate-track-row__duration,
.demo-candidate-track-row__trail {
  position: relative;
  z-index: 1;
}

.demo-candidate-track-row.is-interactive .demo-candidate-track-row__thumb,
.demo-candidate-track-row.is-interactive .demo-candidate-track-row__duration {
  pointer-events: none;
}

.demo-candidate-track-row__artwork-action {
  width: var(--ui-track-row-thumb-size);
  height: var(--ui-track-row-thumb-size);
  flex: 0 0 var(--ui-track-row-thumb-size);
  display: inline-flex;
  padding: 0;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.demo-candidate-track-row__artwork-action:disabled {
  cursor: default;
}

.demo-candidate-track-row__artwork-action:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-candidate-track-row__lead,
.demo-candidate-track-row__trail {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.demo-candidate-track-row__lead {
  flex: 0 0 auto;
  margin-inline-end: var(--ui-space-1);
}

.demo-candidate-track-row__trail {
  flex: 0 1 auto;
  margin-inline-start: var(--ui-space-1);
}

.demo-candidate-track-row__info {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  -webkit-user-select: text;
  user-select: text;
}

.demo-candidate-track-row__title {
  min-width: 0;
  color: inherit;
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-candidate-track-row.is-current .demo-candidate-track-row__title {
  color: var(--ui-color-current);
}

.demo-candidate-track-row__artist {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-candidate-track-row__duration {
  flex: 0 0 auto;
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
