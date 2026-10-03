<script setup>
import {
  computed,
  nextTick,
  onMounted,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import { ChevronDown, ChevronUp, Music2, Pin } from '../../icons/index.js';
import { useBoundedMovableSurface } from '../../composables/useBoundedMovableSurface.js';
import { useBgmSession } from '../../composables/useBgmSession.js';
import { useBgmStandbyPlan } from '../../composables/useBgmStandbyPlan.js';
import { useLibrary } from '../../composables/useLibrary.js';
import BgmTrackPicker from './BgmTrackPicker.vue';
import BgmPlayerTransport from './BgmPlayerTransport.vue';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiSurface from '../ui/UiSurface.vue';

const props = defineProps({
  expanded: { type: Boolean, default: false },
});
const emit = defineEmits(['requestExpand', 'requestClose']);

const {
  state: sessionState,
  handoffState,
  deckState,
  currentTrack,
  settings,
  sessionIndicators,
  initialize: initializeSession,
  playBgm,
  pauseBgm,
  emergencyCut,
  seekBgm,
  commitBgmPosition,
  setDimmed,
  previewVolume,
  setVolume,
  setMuted,
} = useBgmSession();
const { state: planState, setTrack } = useBgmStandbyPlan();
const { state: libraryState } = useLibrary();
const searchQuery = shallowRef('');
const pinned = shallowRef(false);
const player = useTemplateRef('player');
const BGM_PICKER_ID = 'bgm-track-picker';
const moveInstructionId = `bgm-player-move-${useId()}`;
const {
  surfaceStyle,
  isDragging,
  beginDrag,
  moveDrag,
  endDrag,
  cancelDrag,
  handleMoveKeydown,
  reclamp,
} = useBoundedMovableSurface({ elementRef: player, pinned });

const sessionActive = computed(() =>
  ['live', 'record', 'reconnecting'].includes(handoffState.sessionMode),
);
const bgmOperationActive = computed(
  () =>
    handoffState.bgmRequested ||
    handoffState.restorePending ||
    handoffState.audibleLane === 'bgm' ||
    ['stopping-bgm', 'error'].includes(handoffState.phase),
);
const visible = computed(
  () => props.expanded || sessionActive.value || bgmOperationActive.value,
);
const SESSION_LABELS = Object.freeze({
  live: 'LIVE',
  record: 'REC',
  reconnecting: 'OBS 重連中',
  inactive: 'OBS 未確認',
});
const sessionLabel = computed(() => {
  if (sessionIndicators.value.isReconnecting) {
    return SESSION_LABELS.reconnecting;
  }
  if (sessionIndicators.value.isLive) return SESSION_LABELS.live;
  if (sessionIndicators.value.isRecording) return SESSION_LABELS.record;
  return SESSION_LABELS.inactive;
});
const sessionTone = computed(() => {
  if (handoffState.sessionMode === 'reconnecting') return 'warning';
  return sessionActive.value ? 'current' : 'muted';
});
const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!query) return [];
  return libraryState.tracks
    .filter(
      (track) =>
        track.id !== planState.plan.currentTrackId &&
        `${track.title ?? ''} ${track.artist ?? ''}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .slice(0, 8);
});
const transportError = computed(
  () => sessionState.error ?? handoffState.error ?? deckState.error ?? '',
);
const libraryError = computed(
  () => planState.validationError?.message ?? planState.error ?? '',
);

onMounted(initializeSession);

watch(visible, (isVisible, wasVisible) => {
  if (isVisible || !wasVisible) return;
  const playerElement = player.value?.$el ?? player.value;
  const focusedInside = playerElement?.contains?.(document.activeElement);
  if (!focusedInside) return;
  nextTick(() => document.querySelector('[data-app-bgm-trigger]')?.focus?.());
});

watch(
  () => props.expanded,
  async () => {
    await nextTick();
    reclamp();
  },
);

async function changeBgmTrack(trackId) {
  if (await setTrack(trackId)) searchQuery.value = '';
}

function toggleExpanded() {
  if (props.expanded) emit('requestClose');
  else emit('requestExpand');
}

function togglePinned() {
  pinned.value = !pinned.value;
}

function handleEscape(event) {
  if (!props.expanded) return;
  event.preventDefault();
  emit('requestClose');
}
</script>

<template>
  <UiSurface
    v-if="visible"
    ref="player"
    tag="aside"
    tone="raised"
    radius="lg"
    stroke="inset"
    class="bgm-player"
    :class="{
      'bgm-player--expanded': expanded,
      'bgm-player--pinned': pinned,
      'bgm-player--dragging': isDragging,
    }"
    :style="surfaceStyle"
    :data-expanded="expanded ? 'true' : 'false'"
    aria-label="BGM 播放器"
    @keydown.esc.stop="handleEscape"
  >
    <p :id="moveInstructionId" class="ui-visually-hidden">
      未固定時可拖曳標題移動，或使用方向鍵移動；Shift 加速，Home
      回到右側預設位置。
    </p>
    <header
      class="bgm-player__header"
      tabindex="0"
      :aria-label="pinned ? 'BGM 播放器位置已固定' : '移動 BGM 播放器'"
      :aria-describedby="moveInstructionId"
      @keydown="handleMoveKeydown"
      @pointerdown="beginDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="cancelDrag"
    >
      <h2 class="ui-visually-hidden">BGM 播放器</h2>
      <div class="bgm-player__identity">
        <UiChip class="bgm-player__feature-status" tone="accent">
          <Music2 aria-hidden="true" />
          <span>BGM</span>
        </UiChip>
        <UiChip class="bgm-player__session-status" :tone="sessionTone">
          {{ sessionLabel }}
        </UiChip>
      </div>
      <div class="bgm-player__header-actions">
        <UiIconButton
          :icon="Pin"
          :label="pinned ? '取消固定 BGM 播放器' : '固定 BGM 播放器'"
          :title="pinned ? '取消固定' : '固定位置'"
          :active="pinned"
          :fill="pinned"
          :aria-pressed="pinned"
          @pointerdown.stop
          @click="togglePinned"
        />
        <UiIconButton
          :icon="expanded ? ChevronUp : ChevronDown"
          :label="expanded ? '收合更換歌曲' : '展開更換歌曲'"
          :active="expanded"
          :aria-expanded="expanded"
          :aria-controls="BGM_PICKER_ID"
          @pointerdown.stop
          @click="toggleExpanded"
        />
      </div>
    </header>

    <BgmPlayerTransport
      class="bgm-player__transport"
      :phase="handoffState.phase"
      :audible-lane="handoffState.audibleLane"
      :restore-pending="handoffState.restorePending"
      :current-track="currentTrack"
      :is-dimmed="deckState.isDimmed"
      :is-muted="settings.isMuted"
      :dim-db="settings.dimDb"
      :volume="settings.volume"
      :current-time="deckState.currentTime"
      :duration="deckState.duration"
      :error="transportError"
      @play="playBgm"
      @pause="pauseBgm"
      @cut="emergencyCut"
      @set-dimmed="setDimmed"
      @set-muted="setMuted"
      @preview-volume="previewVolume"
      @commit-volume="setVolume"
      @seek="seekBgm"
      @commit-position="commitBgmPosition"
    />

    <UiSeparator v-if="expanded" class="bgm-player__separator" />
    <BgmTrackPicker
      v-if="expanded"
      :id="BGM_PICKER_ID"
      class="bgm-player__picker"
      :search-results="searchResults"
      :search-query="searchQuery"
      :is-loading="libraryState.isLoading"
      :is-saving="planState.isSaving"
      :error="libraryError"
      @update:search-query="searchQuery = $event"
      @select="changeBgmTrack"
    />
  </UiSurface>
</template>

<style scoped>
.bgm-player {
  display: flex;
  inline-size: min(var(--ui-bgm-player-inline-size), 100%);
  min-inline-size: min(var(--ui-bgm-player-min-inline-size), 100%);
  max-inline-size: min(var(--ui-bgm-player-max-inline-size), 100%);
  min-block-size: 0;
  max-block-size: min(var(--ui-bgm-player-max-block-size), 100%);
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  overflow: hidden;
  color: var(--ui-color-text);
  isolation: isolate;
  container-type: inline-size;
  container-name: bgm-player;
  transform: translate3d(
    var(--ui-bounded-surface-x),
    var(--ui-bounded-surface-y),
    0
  );
}

.bgm-player__header,
.bgm-player__identity,
.bgm-player__header-actions {
  display: flex;
  align-items: center;
}

.bgm-player__header {
  justify-content: space-between;
  gap: var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  cursor: grab;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.bgm-player__header,
.bgm-player__transport,
.bgm-player__separator {
  flex: 0 0 auto;
}

.bgm-player__header:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.bgm-player--pinned .bgm-player__header {
  cursor: default;
  touch-action: auto;
}

.bgm-player--dragging .bgm-player__header {
  cursor: grabbing;
}

.bgm-player--dragging {
  will-change: transform;
}

.bgm-player__identity {
  min-width: 0;
  gap: var(--ui-space-2);
}

.bgm-player__header-actions {
  flex: 0 0 auto;
  gap: var(--ui-space-1);
}

.bgm-player__feature-status :deep(svg) {
  width: var(--ui-icon-size-sm);
  height: var(--ui-icon-size-sm);
}

.bgm-player__session-status {
  inline-size: var(--ui-bgm-player-session-status-inline-size);
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
}

.bgm-player__picker {
  min-block-size: 0;
  flex: 1 1 auto;
}

@media (forced-colors: active) {
  .bgm-player__header:focus-visible {
    outline-color: Highlight;
  }
}
</style>
