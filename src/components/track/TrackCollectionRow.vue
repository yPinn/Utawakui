<script setup>
import { computed } from 'vue';
import {
  AudioWaveform,
  BadgeCheck,
  CircleDashed,
  Ellipsis,
  Pause,
  Play,
} from '../../icons/index.js';
import { trackContentLang } from '../../utils/contentLanguage.js';
import { formatDuration } from '../../utils/format.js';
import TrackArtistCredits from './TrackArtistCredits.vue';
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
  density: {
    type: String,
    default: 'list',
    validator: (value) => ['list', 'compact'].includes(value),
  },
  albumJumpable: { type: Boolean, default: false },
  vsQueued: { type: Boolean, default: false },
  vsEnqueuePending: { type: Boolean, default: false },
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
  'queueSeparation',
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
const contentLang = computed(() => trackContentLang(props.entry.track));
const showArtwork = computed(
  () => props.profile.showArtwork && props.density !== 'compact',
);
const separationReady = computed(
  () =>
    Boolean(props.entry.track.hasSeparation) ||
    Object.values(props.entry.track.separation?.results ?? {}).some(Boolean),
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
</script>

<template>
  <li
    class="library-track-row"
    :class="{
      'library-track-row--compact': density === 'compact',
      'library-track-row--selected': selected,
      'library-track-row--current': current,
      'library-track-row--dragging': dragEnabled && dragging,
      'library-track-row--drop-before':
        dragEnabled && dropPosition === 'before',
      'library-track-row--drop-after': dragEnabled && dropPosition === 'after',
    }"
    :style="gridStyle"
    role="listitem"
    :aria-current="current ? 'true' : undefined"
    :draggable="dragEnabled"
    @contextmenu.prevent="emit('openMenu', entry.track, $event)"
    @dragstart="dragEnabled && emit('dragStart', entry.track, $event)"
    @dragover="dragEnabled && emit('dragOver', entry.track, $event)"
    @dragleave="dragEnabled && emit('dragLeave', entry.track, $event)"
    @drop="dragEnabled && emit('drop', entry.track, $event)"
    @dragend="dragEnabled && emit('dragEnd')"
  >
    <button
      type="button"
      class="library-track-row__action"
      :aria-label="`選取：${entry.track.title}`"
      :aria-description="rowActionDescription"
      :aria-pressed="selected"
      @click.stop="emit('selectTrack', entry.track)"
      @dblclick.stop="emit('activateTrack', entry.track)"
      @keydown="handleActionKeydown"
    ></button>

    <span
      v-if="hasColumn('ordinal')"
      class="library-track-row__ordinal"
      data-track-column="ordinal"
      :data-column-align="columnAlignment('ordinal')"
      :data-column-numeric="columnIsNumeric('ordinal') ? 'true' : undefined"
    >
      <span class="library-track-row__ordinal-text">
        {{ entry.ordinalText }}
      </span>
      <UiIconButton
        class="library-track-row__playback-control"
        :icon="playing ? Pause : Play"
        :label="`${playing ? '暫停' : '播放'}：${entry.track.title}`"
        :fill="!playing"
        @click.stop="emit('togglePlayback', entry.track)"
        @dblclick.stop
      />
    </span>

    <span
      v-if="hasColumn('identity')"
      class="library-track-row__identity"
      data-track-column="identity"
      data-column-align="start"
    >
      <UiTrackThumb
        v-if="showArtwork"
        class="library-track-row__thumb"
        :track="entry.track"
        size="var(--ui-track-row-thumb-size)"
        loading="lazy"
        decoding="async"
      />
      <span class="library-track-row__copy" :lang="contentLang">
        <span class="library-track-row__title">
          <UiMarqueeText :text="entry.track.title" />
        </span>
        <TrackArtistCredits
          v-if="entry.track.artist && profile.showArtist"
          class="library-track-row__subtitle"
          :track="entry.track"
        />
      </span>
    </span>

    <template v-for="column in semanticColumns" :key="column.role">
      <span
        v-if="column.role === 'usage'"
        class="library-track-row__semantic library-track-row__usage"
        :data-track-column="column.role"
        :data-column-priority="column.priority"
        :data-column-align="column.align"
        :data-column-numeric="column.numeric ? 'true' : undefined"
        :aria-label="
          entry.playCount === null
            ? '尚未提供應用內有效播放次數'
            : `${entry.usageText} 次應用內有效播放`
        "
      >
        {{ entry.usageText }}
      </span>
      <UiTextButton
        v-else-if="
          column.role === 'release' &&
          albumJumpable &&
          profile.albumNavigation &&
          entry.releaseText
        "
        class="library-track-row__semantic library-track-row__semantic--destination"
        :data-track-column="column.role"
        :data-column-priority="column.priority"
        :data-column-align="column.align"
        :data-column-numeric="column.numeric ? 'true' : undefined"
        :lang="contentLang"
        :text="entry.releaseText"
        :aria-label="`前往專輯：${entry.releaseText}`"
        overflow="ellipsis"
        @click="emit('navigateAlbum', entry.track)"
        @dblclick.stop
      />
      <UiOverflowTooltip
        v-else
        class="library-track-row__semantic"
        :data-track-column="column.role"
        :data-column-priority="column.priority"
        :data-column-align="column.align"
        :data-column-numeric="column.numeric ? 'true' : undefined"
        :lang="column.role === 'release' ? contentLang : undefined"
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
      class="library-track-row__duration"
      data-track-column="duration"
      data-column-priority="duration"
      data-column-align="end"
      data-column-numeric="true"
    >
      <span class="library-track-row__status">
        <UiStatusIcon
          v-if="separationReady"
          :icon="BadgeCheck"
          tone="success"
          :label="`已有伴奏：${entry.track.title}`"
        />
        <UiStatusIcon
          v-else-if="vsQueued"
          :icon="CircleDashed"
          tone="info"
          spinning
          :label="`伴奏處理中：${entry.track.title}`"
        />
        <UiIconButton
          v-else
          class="library-track-row__separation-action"
          :icon="AudioWaveform"
          :label="`加入伴奏處理佇列：${entry.track.title}`"
          :loading="vsEnqueuePending"
          :loading-label="`正在加入伴奏處理佇列：${entry.track.title}`"
          @click.stop="emit('queueSeparation', entry.track)"
          @dblclick.stop
        />
      </span>
      <span class="library-track-row__duration-text">
        {{ formatDuration(entry.track.duration) }}
      </span>
    </span>

    <span
      v-if="hasColumn('actions')"
      class="library-track-row__actions"
      data-track-column="actions"
      data-column-align="end"
    >
      <UiIconButton
        class="library-track-row__more-action"
        :icon="Ellipsis"
        :label="`更多：${entry.track.title}`"
        @click.stop="emit('openMenu', entry.track, $event)"
        @dblclick.stop
      />
    </span>
  </li>
</template>

<style scoped>
.library-track-row {
  position: relative;
  isolation: isolate;
  min-width: 0;
  min-height: var(--ui-track-row-min-height);
  display: grid;
  grid-template-columns: var(--library-track-table-grid);
  align-items: center;
  gap: var(--ui-track-row-gap);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  border-bottom: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
  border-radius: 0;
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
  -webkit-user-select: none;
  user-select: none;
}

.library-track-row:hover {
  background: var(--ui-color-surface-hover);
}

.library-track-row--selected {
  background: var(--ui-track-row-selected-surface);
}

.library-track-row--current .library-track-row__title {
  color: var(--ui-color-current);
}

.library-track-row--dragging {
  opacity: var(--ui-opacity-dragging);
}

.library-track-row--drop-before::before,
.library-track-row--drop-after::after {
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

.library-track-row--drop-before::before {
  top: calc(var(--ui-space-1) * -1);
}

.library-track-row--drop-after::after {
  bottom: calc(var(--ui-space-1) * -1);
}

.library-track-row__action {
  position: absolute;
  z-index: var(--ui-layer-base);
  inset: 0;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}

.library-track-row:has(.library-track-row__action:focus-visible) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.library-track-row__action:focus-visible {
  outline: none;
}

.library-track-row__ordinal,
.library-track-row__identity,
.library-track-row__semantic,
.library-track-row__duration,
.library-track-row__actions {
  position: relative;
  z-index: var(--ui-layer-raised);
}

.library-track-row__ordinal,
.library-track-row__ordinal-text,
.library-track-row__identity,
.library-track-row__semantic,
.library-track-row__duration {
  pointer-events: none;
}

.library-track-row__ordinal {
  display: grid;
  place-items: center;
}

.library-track-row__ordinal-text,
.library-track-row__playback-control {
  grid-area: 1 / 1;
}

.library-track-row__ordinal-text,
.library-track-row__playback-control,
.library-track-row__more-action {
  transition: opacity var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.library-track-row__playback-control,
.library-track-row__more-action {
  opacity: 0;
  pointer-events: none;
}

.library-track-row__playback-control {
  --ui-icon-button-size-override: var(--ui-space-5);
}

.library-track-row__separation-action,
.library-track-row__more-action {
  --ui-icon-button-size-override: var(--ui-space-5);
}

.library-track-row:hover .library-track-row__playback-control,
.library-track-row:focus-within .library-track-row__playback-control,
.library-track-row--current .library-track-row__playback-control,
.library-track-row:hover .library-track-row__more-action,
.library-track-row:focus-within .library-track-row__more-action {
  opacity: 1;
  pointer-events: auto;
}

.library-track-row:hover .library-track-row__ordinal-text,
.library-track-row:focus-within .library-track-row__ordinal-text,
.library-track-row--current .library-track-row__ordinal-text {
  opacity: 0;
}

.library-track-row__identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-track-row-gap);
}

.library-track-row__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.library-track-row__title {
  min-width: 0;
  font-weight: var(--ui-font-weight-semibold);
}

.library-track-row__semantic--destination,
.library-track-row__subtitle,
.library-track-row__separation-action {
  pointer-events: auto;
}

.library-track-row__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}

.library-track-row__duration {
  inline-size: 100%;
  display: grid;
  grid-template-columns: var(--ui-space-5) auto;
  align-items: center;
  gap: var(--ui-space-4);
  justify-content: end;
}

.library-track-row__status {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}

.library-track-row__duration-text {
  justify-self: end;
}

.library-track-row__subtitle,
.library-track-row__semantic,
.library-track-row__duration {
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-track-row--compact {
  min-height: var(--ui-track-row-compact-min-height);
}

.library-track-row--compact .library-track-row__copy {
  flex-direction: row;
  align-items: baseline;
  gap: var(--ui-space-2);
}

.library-track-row--compact .library-track-row__title {
  flex: 0 1 auto;
}

.library-track-row--compact .library-track-row__subtitle {
  flex: 1 1 0;
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
