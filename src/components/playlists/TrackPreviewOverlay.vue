<script setup>
// Track preview dialog (docs/contracts/track-preview.md). It renders the
// preview owner's state and emits intents; it never touches the performance
// player. Its own overlay host keeps the nested menu above the dialog.
import { computed, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue';
import {
  Ellipsis,
  ListOrdered,
  ListEnd,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from '../../icons/index.js';
import { resolvePreviewKeyIntent } from '../../utils/trackPreviewKeys.js';
import AppSurfaceBoundary from '../layout/AppSurfaceBoundary.vue';
import PlaybackPrimaryButton from '../playback/PlaybackPrimaryButton.vue';
import TrackActionMenu from '../track/TrackActionMenu.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  tracks: { type: Array, default: () => [] },
  index: { type: Number, default: 0 },
  status: { type: String, default: 'idle' },
  blockedReason: { type: String, default: null },
  segment: { type: Object, default: null },
  currentTime: { type: Number, default: 0 },
  muted: { type: Boolean, default: false },
  playlists: { type: Array, default: () => [] },
  currentTrackId: { type: String, default: '' },
  queuedTrackIds: { type: Array, default: () => [] },
  sessionTrackIds: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'close',
  'select',
  'toggle',
  'mute',
  'playTrack',
  'addToQueue',
  'addToSession',
  'menuSelect',
]);

const contentRef = useTemplateRef('content');
const menuAnchorEl = shallowRef(null);
let lastWheelAt = 0;

const WHEEL_STEP_INTERVAL_MS = 450;
// A blocked preview is expected operator context, not an alarm.
const BLOCKED_NOTICES = Object.freeze({
  'session-active': {
    tone: 'info',
    message: '錄影或直播中無法試聽，避免試聽聲音進入節目。',
  },
  preempted: { tone: 'muted', message: '其他播放器開始播放，試聽已暫停。' },
  unavailable: { tone: 'muted', message: '目前無法開始試聽。' },
});

const track = computed(() => props.tracks[props.index] ?? null);
const previousTrack = computed(() => props.tracks[props.index - 1] ?? null);
const nextTrack = computed(() => props.tracks[props.index + 1] ?? null);
const isPlaying = computed(() => props.status === 'playing');
const statusNotice = computed(() => {
  if (props.status === 'error') {
    return { tone: 'danger', message: '這些曲目目前都無法試聽。' };
  }
  return BLOCKED_NOTICES[props.blockedReason] ?? null;
});
const segmentLength = computed(() =>
  props.segment ? Math.max(0, props.segment.end - props.segment.start) : 0,
);
const segmentElapsed = computed(() =>
  props.segment
    ? Math.min(
        segmentLength.value,
        Math.max(0, props.currentTime - props.segment.start),
      )
    : 0,
);
const segmentLabel = computed(() =>
  props.segment?.source === 'chorus' ? '副歌片段' : '預估片段',
);
const isQueued = computed(
  () =>
    Boolean(track.value) &&
    (props.currentTrackId === track.value.id ||
      props.queuedTrackIds.includes(track.value.id)),
);
const isInSession = computed(
  () => Boolean(track.value) && props.sessionTrackIds.includes(track.value.id),
);

function formatSeconds(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function select(offset) {
  const target = props.index + offset;
  if (target >= 0 && target < props.tracks.length) emit('select', target);
}

function closeMenu() {
  menuAnchorEl.value = null;
}

function openMenu(event) {
  menuAnchorEl.value = event.currentTarget;
}

function selectMenuAction(value) {
  const selected = track.value;
  closeMenu();
  if (selected) emit('menuSelect', value, selected);
}

function handleWheel(event) {
  if (menuAnchorEl.value || Math.abs(event.deltaY) < 1) return;
  event.preventDefault();
  if (event.timeStamp - lastWheelAt < WHEEL_STEP_INTERVAL_MS) return;
  lastWheelAt = event.timeStamp;
  select(event.deltaY > 0 ? 1 : -1);
}

const KEY_ACTIONS = {
  next: () => select(1),
  previous: () => select(-1),
  toggle: () => emit('toggle'),
  mute: () => emit('mute', !props.muted),
};

// Window capture runs before the global shortcuts, so preview keys never
// reach the performance player. UiModal still owns Escape, Tab and focus.
function handleKeydown(event) {
  if (menuAnchorEl.value) return;
  const dialog = contentRef.value?.closest?.('[role="dialog"]');
  if (!dialog?.contains(event.target)) return;
  const { intent, isolate } = resolvePreviewKeyIntent(event);
  if (isolate) event.stopPropagation();
  if (!intent) return;
  if (intent !== 'mute') event.preventDefault();
  KEY_ACTIONS[intent]();
}

function setKeyboardListener(active) {
  if (typeof window === 'undefined') return;
  if (active) window.addEventListener('keydown', handleKeydown, true);
  else window.removeEventListener('keydown', handleKeydown, true);
}

// Next slides the outgoing track up and the incoming one in from below, like
// the vertical feed; previous mirrors it. Set before the re-render it drives.
const switchDirection = shallowRef('next');
const switchTransition = computed(
  () => `track-preview-${switchDirection.value}`,
);
watch(
  () => props.index,
  (current, previous) => {
    switchDirection.value = current < previous ? 'previous' : 'next';
  },
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) closeMenu();
    setKeyboardListener(isOpen);
  },
  { immediate: true },
);
onUnmounted(() => setKeyboardListener(false));
</script>

<template>
  <UiModal
    :open="open"
    :title="`試聽：${title}`"
    size="wide"
    @close="emit('close')"
  >
    <AppSurfaceBoundary
      surface-id="track-preview"
      tag="div"
      class="track-preview-surface"
    >
      <div v-if="track" ref="content" class="track-preview">
        <!-- Neighbours peek as fixed slices; the wheel steps through them. -->
        <div
          class="track-preview__stage"
          aria-label="試聽曲目"
          @wheel="handleWheel"
        >
          <span
            class="track-preview__peek-slot track-preview__peek-slot--previous"
          >
            <Transition :name="switchTransition">
              <button
                v-if="previousTrack"
                :key="previousTrack.id"
                type="button"
                class="track-preview__peek"
                :aria-label="`上一首：${previousTrack.title}`"
                tabindex="-1"
                @click="select(-1)"
              >
                <UiTrackThumb :track="previousTrack" size="100%" />
              </button>
            </Transition>
          </span>
          <span class="track-preview__artwork">
            <Transition :name="switchTransition">
              <UiTrackThumb
                :key="track.id"
                class="track-preview__artwork-image"
                :track="track"
                size="100%"
                radius="0"
                font-size="var(--ui-font-size-xl)"
              />
            </Transition>
          </span>
          <span class="track-preview__peek-slot track-preview__peek-slot--next">
            <Transition :name="switchTransition">
              <button
                v-if="nextTrack"
                :key="nextTrack.id"
                type="button"
                class="track-preview__peek"
                :aria-label="`下一首：${nextTrack.title}`"
                tabindex="-1"
                @click="select(1)"
              >
                <UiTrackThumb :track="nextTrack" size="100%" />
              </button>
            </Transition>
          </span>
        </div>

        <div class="track-preview__content">
          <section class="track-preview__identity" aria-live="polite">
            <p class="track-preview__meta">
              {{ index + 1 }} / {{ tracks.length }}
            </p>
            <div class="track-preview__identity-switch">
              <Transition :name="switchTransition">
                <div :key="track.id" class="track-preview__identity-text">
                  <h3 class="track-preview__title">{{ track.title }}</h3>
                  <p v-if="track.artist" class="track-preview__meta">
                    {{ track.artist }}
                  </p>
                </div>
              </Transition>
            </div>
          </section>

          <UiProgress
            v-if="segment"
            :label="segmentLabel"
            :value="segmentElapsed"
            :max="segmentLength || 1"
            :value-text="`${formatSeconds(segmentElapsed)} / ${formatSeconds(segmentLength)}`"
          />

          <div class="track-preview__transport">
            <UiIconButton
              :icon="SkipBack"
              label="上一首"
              tooltip-suffix=" (↑)"
              :disabled="!previousTrack"
              @click="select(-1)"
            />
            <PlaybackPrimaryButton
              :playing="isPlaying"
              :play-label="`試聽：${track.title}`"
              :pause-label="`暫停試聽：${track.title}`"
              @click="emit('toggle')"
            />
            <UiIconButton
              :icon="SkipForward"
              label="下一首"
              tooltip-suffix=" (↓)"
              :disabled="!nextTrack"
              @click="select(1)"
            />
            <UiIconButton
              class="track-preview__mute"
              :icon="muted ? VolumeX : Volume2"
              :label="muted ? '取消試聽靜音' : '試聽靜音'"
              :title="muted ? '取消試聽靜音' : '試聽靜音'"
              tooltip-suffix=" (M)"
              :aria-pressed="muted"
              @click="emit('mute', !muted)"
            />
          </div>

          <UiNotice
            v-if="statusNotice"
            :tone="statusNotice.tone"
            :message="statusNotice.message"
            compact
          />
        </div>
      </div>

      <!-- Mounted only once open: its Teleport targets this dialog's own
           host, which is not in the document while the dialog mounts. -->
      <TrackActionMenu
        v-if="menuAnchorEl"
        :open="Boolean(menuAnchorEl)"
        :anchor-el="menuAnchorEl"
        :track="track"
        :playlists="playlists"
        :current-track-id="currentTrackId"
        :queued-track-ids="queuedTrackIds"
        @select="selectMenuAction"
        @close="closeMenu"
      />
    </AppSurfaceBoundary>

    <template v-if="track" #footer>
      <div class="track-preview__actions" aria-label="曲目操作">
        <UiIconButton
          :icon="ListEnd"
          :label="isQueued ? '已在佇列' : '加入佇列'"
          :disabled="isQueued"
          @click="emit('addToQueue', track)"
        />
        <UiIconButton
          :icon="ListOrdered"
          :label="isInSession ? '已在場次草稿' : '加入場次草稿'"
          :disabled="isInSession"
          @click="emit('addToSession', track)"
        />
        <UiIconButton
          :icon="Ellipsis"
          label="更多操作"
          aria-haspopup="menu"
          :aria-expanded="menuAnchorEl ? 'true' : 'false'"
          @click="openMenu"
        />
      </div>
      <UiButton variant="accent" @click="emit('playTrack', track)">
        從這首開始播放
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
/* This boundary only hosts the nested menu; the modal owns the raised paint. */
.track-preview-surface {
  background: transparent;
}

/* Mirrors LibraryEntityDossier: artwork first, metadata beside it. */
.track-preview {
  --track-preview-artwork-size: 15rem;
  --track-preview-peek-size: 2.5rem;
  --track-preview-peek-opacity: 0.4;

  min-inline-size: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: center;
}

.track-preview__stage {
  display: grid;
  grid-template-rows:
    var(--track-preview-peek-size) auto
    var(--track-preview-peek-size);
  justify-items: center;
  gap: var(--ui-space-2);
  overflow: hidden;
}

.track-preview__artwork,
.track-preview__peek {
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
}

.track-preview__artwork {
  position: relative;
  grid-row: 2;
  display: grid;
  inline-size: var(--track-preview-artwork-size);
  aspect-ratio: 1;
}

/* The artwork frame clips a full-height slide between covers. */
.track-preview__artwork-image {
  --track-preview-switch-offset: 100%;
}

.track-preview__peek {
  --track-preview-switch-offset: var(--track-preview-peek-size);

  inline-size: calc(var(--track-preview-artwork-size) * 0.8);
  aspect-ratio: 1;
  padding: 0;
  background: none;
  opacity: var(--track-preview-peek-opacity);
  cursor: pointer;
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.track-preview__peek:hover {
  opacity: var(--ui-opacity-muted);
}

/* Each slot keeps its row while neighbours swap; the stage clips the rest. */
.track-preview__peek-slot {
  position: relative;
  display: grid;
  justify-items: center;
}

.track-preview__peek-slot--previous {
  grid-row: 1;
  align-items: end;
}

.track-preview__peek-slot--next {
  grid-row: 3;
  align-items: start;
}

/* Tight identity group, then progress and transport as separate beats. */
.track-preview__content {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-4);
}

.track-preview__identity {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.track-preview__identity-switch {
  position: relative;
  min-inline-size: 0;
  display: grid;
}

.track-preview__identity-text {
  --track-preview-switch-offset: var(--ui-space-2);

  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.track-preview__meta {
  margin: 0;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-preview__title {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.track-preview__transport {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.track-preview__mute {
  margin-inline-start: auto;
}

/* Secondary actions start the footer; the primary action stays at its end. */
.track-preview__actions {
  display: flex;
  gap: var(--ui-space-1);
  margin-inline-end: auto;
}

/* Track switches share the standard timing token, which reduced motion
   already zeroes; the outgoing copy leaves without taking layout space. */
.track-preview-next-enter-active,
.track-preview-next-leave-active,
.track-preview-previous-enter-active,
.track-preview-previous-leave-active {
  transition:
    opacity var(--ui-motion-duration-standard) var(--ui-motion-easing-standard),
    transform var(--ui-motion-duration-standard)
      var(--ui-motion-easing-standard);
}

.track-preview-next-leave-active,
.track-preview-previous-leave-active {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  pointer-events: none;
}

/* An outgoing neighbour stays centred on the slot edge it rests against. */
.track-preview__peek.track-preview-next-leave-active,
.track-preview__peek.track-preview-previous-leave-active {
  margin-inline: auto;
}

.track-preview__peek-slot--previous > .track-preview-next-leave-active,
.track-preview__peek-slot--previous > .track-preview-previous-leave-active {
  inset-block: auto 0;
}

.track-preview-next-enter-from,
.track-preview-previous-leave-to {
  opacity: 0;
  transform: translateY(var(--track-preview-switch-offset));
}

.track-preview-next-leave-to,
.track-preview-previous-enter-from {
  opacity: 0;
  transform: translateY(calc(-1 * var(--track-preview-switch-offset)));
}

/* Narrow dialogs stack the artwork above the metadata and drop the peeks. */
@container (max-width: 34rem) {
  .track-preview {
    grid-template-columns: minmax(0, 1fr);
  }

  .track-preview__stage {
    grid-template-rows: auto;
    justify-items: start;
  }

  .track-preview__artwork {
    grid-row: 1;
  }

  .track-preview__peek-slot {
    display: none;
  }
}
</style>
