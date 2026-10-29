<script setup>
import { computed } from 'vue';
import { BadgeCheck, Ellipsis, Heart, Pause, Play } from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  entry: { type: Object, required: true },
  profile: { type: Object, required: true },
  columns: { type: Array, default: () => [] },
  gridStyle: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false },
  current: { type: Boolean, default: false },
  playing: { type: Boolean, default: false },
  dragEnabled: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
  dropPosition: {
    type: String,
    default: '',
    validator: (value) => ['', 'before', 'after'].includes(value),
  },
});

const emit = defineEmits([
  'selectTrack',
  'activateTrack',
  'togglePlayback',
  'navigateAlbum',
  'navigateArtist',
  'openMenu',
  'moveTrack',
  'dragStart',
  'dragOver',
  'dragLeave',
  'drop',
  'dragEnd',
]);

const visibleRoles = computed(
  () => new Set(props.columns.map((column) => column.role)),
);
const semanticColumns = computed(() =>
  props.columns.filter((column) => Boolean(column.textField)),
);
const rowActionDescription = computed(() =>
  props.dragEnabled
    ? '單擊或空白鍵選取；雙擊或 Enter 播放；方向鍵調整順序'
    : '單擊或空白鍵選取；雙擊或 Enter 播放',
);

function hasColumn(role) {
  return visibleRoles.value.has(role);
}

function columnAlignment(role) {
  return props.columns.find((column) => column.role === role)?.align ?? 'start';
}

function columnIsNumeric(role) {
  return Boolean(props.columns.find((column) => column.role === role)?.numeric);
}

function handleActionKeydown(event) {
  if (
    props.dragEnabled &&
    (event.key === 'ArrowUp' || event.key === 'ArrowDown')
  ) {
    event.preventDefault();
    event.stopPropagation();
    emit('moveTrack', props.entry.track.id, event.key === 'ArrowUp' ? -1 : 1);
  } else if (event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    emit('selectTrack', props.entry.track);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    emit('activateTrack', props.entry.track);
  } else if (
    event.key === 'ContextMenu' ||
    (event.shiftKey && event.key === 'F10')
  ) {
    event.preventDefault();
    event.stopPropagation();
    emit('openMenu', props.entry.track, event);
  }
}

function handleDragOver(event) {
  if (!props.dragEnabled) return;
  emit('dragOver', props.entry.track, event);
}

function handleDragLeave(event) {
  if (!props.dragEnabled) return;
  emit('dragLeave', props.entry.track, event);
}

function handleDrop(event) {
  if (!props.dragEnabled) return;
  emit('drop', props.entry.track, event);
}
</script>

<template>
  <li
    class="demo-track-collection-row"
    :class="{
      'demo-track-collection-row--selected': selected,
      'demo-track-collection-row--current': current,
      'demo-track-collection-row--dragging': dragEnabled && dragging,
      'demo-track-collection-row--drop-before':
        dragEnabled && dropPosition === 'before',
      'demo-track-collection-row--drop-after':
        dragEnabled && dropPosition === 'after',
    }"
    :style="gridStyle"
    :aria-current="current ? 'true' : undefined"
    :draggable="dragEnabled"
    @contextmenu.prevent="emit('openMenu', entry.track, $event)"
    @dragstart="dragEnabled && emit('dragStart', entry.track, $event)"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @dragend="dragEnabled && emit('dragEnd')"
  >
    <button
      type="button"
      class="demo-track-collection-row__action"
      :aria-label="`選取：${entry.track.title}`"
      :aria-description="rowActionDescription"
      :aria-pressed="selected"
      @click.stop="emit('selectTrack', entry.track)"
      @dblclick.stop="emit('activateTrack', entry.track)"
      @keydown="handleActionKeydown"
    ></button>

    <span
      v-if="hasColumn('ordinal')"
      class="demo-track-collection-row__ordinal"
      data-track-column="ordinal"
      :data-column-align="columnAlignment('ordinal')"
      :data-column-numeric="columnIsNumeric('ordinal') ? 'true' : undefined"
    >
      <span class="demo-track-collection-row__ordinal-text">
        {{ entry.ordinalText }}
      </span>
      <UiIconButton
        class="demo-track-collection-row__playback-control"
        :icon="playing ? Pause : Play"
        :label="`${playing ? '暫停' : '播放'}：${entry.track.title}`"
        :fill="!playing"
        @click.stop="emit('togglePlayback', entry.track)"
        @dblclick.stop
      />
    </span>

    <span
      v-if="hasColumn('identity')"
      class="demo-track-collection-row__identity"
      data-track-column="identity"
      data-column-align="start"
    >
      <UiTrackThumb
        v-if="profile.showArtwork"
        class="demo-track-collection-row__thumb"
        :track="entry.track"
        size="var(--ui-track-row-thumb-size)"
      />
      <span class="demo-track-collection-row__copy">
        <UiMarqueeText
          class="demo-track-collection-row__title"
          :text="entry.track.title"
        />
        <UiTextButton
          v-if="profile.showArtist && entry.track.artist"
          class="demo-track-collection-row__artist demo-track-collection-row__artist--destination"
          :text="entry.track.artist"
          :aria-label="`前往藝人：${entry.track.artist}`"
          overflow="ellipsis"
          @click="emit('navigateArtist', entry.track)"
          @dblclick.stop
        />
      </span>
    </span>

    <template v-for="column in semanticColumns" :key="column.role">
      <span
        v-if="column.role === 'usage'"
        class="demo-track-collection-row__usage"
        :data-track-column="column.role"
        :data-column-priority="column.priority"
        :data-column-align="column.align"
        :data-column-numeric="column.numeric ? 'true' : undefined"
        :title="`${entry.usageText} 次應用內有效播放`"
      >
        {{ entry.usageText }}
      </span>
      <UiTextButton
        v-else-if="
          column.role === 'release' &&
          profile.albumNavigation &&
          entry.releaseText
        "
        class="demo-track-collection-row__semantic demo-track-collection-row__semantic--destination"
        :data-track-column="column.role"
        :data-column-priority="column.priority"
        :data-column-align="column.align"
        :data-column-numeric="column.numeric ? 'true' : undefined"
        :text="entry.releaseText"
        :aria-label="`前往專輯：${entry.releaseText}`"
        overflow="ellipsis"
        @click="emit('navigateAlbum', entry.track)"
        @dblclick.stop
      />
      <UiOverflowTooltip
        v-else
        class="demo-track-collection-row__semantic"
        :data-track-column="column.role"
        :data-column-priority="column.priority"
        :data-column-align="column.align"
        :data-column-numeric="column.numeric ? 'true' : undefined"
        :text="entry[column.textField]"
        @click.stop="emit('selectTrack', entry.track)"
        @dblclick.stop="emit('activateTrack', entry.track)"
      >
        {{ entry[column.textField] || '—' }}
      </UiOverflowTooltip>
    </template>

    <span
      v-if="hasColumn('spacer')"
      data-track-column="spacer"
      data-column-align="start"
      aria-hidden="true"
    ></span>

    <span
      v-if="hasColumn('duration')"
      class="demo-track-collection-row__duration"
      data-track-column="duration"
      data-column-priority="duration"
      data-column-align="end"
      data-column-numeric="true"
    >
      <span class="demo-track-collection-row__status">
        <span
          v-if="entry.favorite"
          class="demo-track-collection-row__status-icon--favorite"
        >
          <UiStatusIcon :icon="Heart" tone="current" label="已加入最愛" />
        </span>
        <UiStatusIcon
          v-if="entry.separationReady"
          :icon="BadgeCheck"
          tone="success"
          label="已有伴奏"
        />
      </span>
      <span class="demo-track-collection-row__duration-text">
        {{ formatDuration(entry.track.duration) }}
      </span>
    </span>

    <span
      v-if="hasColumn('actions')"
      class="demo-track-collection-row__actions"
      data-track-column="actions"
      data-column-align="end"
    >
      <UiIconButton
        :icon="Ellipsis"
        :label="`更多：${entry.track.title}`"
        @click.stop="emit('openMenu', entry.track, $event)"
        @dblclick.stop
      />
    </span>
  </li>
</template>

<style scoped>
.demo-track-collection-row {
  --demo-track-collection-status-slot: calc(
    (var(--ui-track-row-utility-size) * 2) + var(--ui-space-1)
  );

  position: relative;
  isolation: isolate;
  min-width: 0;
  min-height: var(--ui-track-row-min-height);
  display: grid;
  grid-template-columns: var(--demo-track-collection-grid);
  align-items: center;
  gap: var(--ui-track-row-gap);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  border-bottom: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
  -webkit-user-select: none;
  user-select: none;
}

.demo-track-collection-row:hover {
  background: var(--ui-color-surface-hover);
}

.demo-track-collection-row--selected {
  background: var(--ui-track-row-selected-background);
}

.demo-track-collection-row--current .demo-track-collection-row__title {
  color: var(--ui-color-current);
}

.demo-track-collection-row--dragging {
  opacity: var(--ui-opacity-dragging);
}

.demo-track-collection-row--drop-before::before,
.demo-track-collection-row--drop-after::after {
  position: absolute;
  z-index: var(--ui-layer-overlay);
  right: var(--ui-track-row-padding-inline);
  left: var(--ui-track-row-padding-inline);
  height: var(--ui-drag-indicator-width);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
  content: '';
  pointer-events: none;
}

.demo-track-collection-row--drop-before::before {
  top: calc(var(--ui-space-1) * -1);
}

.demo-track-collection-row--drop-after::after {
  bottom: calc(var(--ui-space-1) * -1);
}

.demo-track-collection-row__action {
  position: absolute;
  z-index: var(--ui-layer-base);
  inset: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.demo-track-collection-row:has(
  .demo-track-collection-row__action:focus-visible
) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-track-collection-row__action:focus-visible {
  outline: none;
}

.demo-track-collection-row__ordinal,
.demo-track-collection-row__identity,
.demo-track-collection-row__semantic,
.demo-track-collection-row__usage,
.demo-track-collection-row__duration,
.demo-track-collection-row__actions {
  position: relative;
  z-index: var(--ui-layer-raised);
}

.demo-track-collection-row__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}

.demo-track-collection-row__identity,
.demo-track-collection-row__usage,
.demo-track-collection-row__duration {
  pointer-events: none;
}

.demo-track-collection-row__ordinal {
  display: grid;
  place-items: center;
}

.demo-track-collection-row__ordinal-text,
.demo-track-collection-row__playback-control {
  grid-area: 1 / 1;
}

.demo-track-collection-row__ordinal-text {
  pointer-events: none;
  transition: opacity var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.demo-track-collection-row__playback-control {
  --ui-icon-button-size-override: var(--ui-track-row-utility-size);

  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.demo-track-collection-row:hover .demo-track-collection-row__playback-control,
.demo-track-collection-row:focus-within
  .demo-track-collection-row__playback-control,
.demo-track-collection-row--current
  .demo-track-collection-row__playback-control {
  opacity: 1;
  pointer-events: auto;
}

.demo-track-collection-row:hover .demo-track-collection-row__ordinal-text,
.demo-track-collection-row:focus-within
  .demo-track-collection-row__ordinal-text,
.demo-track-collection-row--current .demo-track-collection-row__ordinal-text {
  opacity: 0;
}

.demo-track-collection-row__identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-track-row-gap);
}

.demo-track-collection-row__semantic--destination,
.demo-track-collection-row__artist--destination {
  pointer-events: auto;
}

.demo-track-collection-row__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.demo-track-collection-row__title {
  min-width: 0;
  font-weight: var(--ui-font-weight-semibold);
}

.demo-track-collection-row__actions {
  opacity: 0;
  transition: opacity var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.demo-track-collection-row__status {
  inline-size: var(--demo-track-collection-status-slot);
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-1);
  pointer-events: none;
}

.demo-track-collection-row__status-icon--favorite {
  opacity: 0;
  transition: opacity var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.demo-track-collection-row__status-icon--favorite {
  flex: 0 0 auto;
  display: inline-flex;
}

.demo-track-collection-row__duration {
  inline-size: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns:
    var(--demo-track-collection-status-slot)
    auto;
  align-items: center;
  gap: var(--ui-space-4);
  justify-content: end;
}

.demo-track-collection-row__duration-text {
  justify-self: end;
}

.demo-track-collection-row--selected
  .demo-track-collection-row__status-icon--favorite,
.demo-track-collection-row:hover
  .demo-track-collection-row__status-icon--favorite,
.demo-track-collection-row:focus-within
  .demo-track-collection-row__status-icon--favorite {
  opacity: 1;
}

.demo-track-collection-row:hover .demo-track-collection-row__actions,
.demo-track-collection-row:focus-within .demo-track-collection-row__actions {
  opacity: 1;
}

.demo-track-collection-row__artist,
.demo-track-collection-row__semantic,
.demo-track-collection-row__usage,
.demo-track-collection-row__duration {
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-column-align='center'] {
  justify-self: center;
  text-align: center;
}

[data-column-align='start'] {
  justify-self: stretch;
  text-align: start;
}

[data-column-align='end'] {
  justify-self: end;
  text-align: end;
}

[data-column-numeric='true'] {
  font-variant-numeric: tabular-nums;
}
</style>
