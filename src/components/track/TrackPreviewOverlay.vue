<script setup>
// Track preview dialog (docs/contracts/track-preview.md). It renders the
// preview owner's state and emits intents; it never touches the performance
// player. Its own overlay host keeps the nested menu above the dialog.
import { computed, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Ellipsis,
  ListEnd,
  Volume2,
  VolumeX,
} from '../../icons/index.js';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { loadArtworkTone } from '../../utils/artworkTone.js';
import { resolvePreviewKeyIntent } from '../../utils/trackPreviewKeys.js';
import AppSurfaceBoundary from '../layout/AppSurfaceBoundary.vue';
import PlaybackPrimaryButton from '../playback/PlaybackPrimaryButton.vue';
import TrackActionMenu from './TrackActionMenu.vue';
import TrackArtistCredits from './TrackArtistCredits.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiArtworkOverlay from '../ui/UiArtworkOverlay.vue';
import UiArtworkReveal from '../ui/UiArtworkReveal.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiTextButton from '../ui/UiTextButton.vue';
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
  // The row right-click options for this track, so both menus match.
  menuOptions: {
    type: Object,
    default: () => ({ removeFromPlaylistId: '', canGoToAlbum: false }),
  },
});

const emit = defineEmits([
  'close',
  'select',
  'mute',
  'playTrack',
  'addToQueue',
  'menuSelect',
  'navigate',
]);

const contentRef = useTemplateRef('content');
// The row right-click menu, anchored to the more button or to the pointer
// when the cover is right-clicked.
const menu = shallowRef(null);
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
// Title and artist credits open their pages like PlayerBar; the dialog is
// dismissed first so the page is not left behind it.
const { albumForTrack, jumpToAlbum } = useAlbumNavigation();
const trackAlbum = computed(() => albumForTrack(track.value));
const albumCtaLabel = computed(() =>
  trackAlbum.value
    ? `${track.value.title}，前往專輯：${trackAlbum.value.name || '未命名專輯'}`
    : '',
);

function openAlbum() {
  const selected = track.value;
  if (!selected || !trackAlbum.value) return;
  emit('navigate');
  jumpToAlbum(selected);
}

// The cover's material colour tints the dialog surface. The last tone stays
// until the next cover resolves, so a switch crossfades.
const tone = shallowRef(null);
let toneRequest = 0;
watch(
  () => track.value?.thumbnailUrl,
  async (url) => {
    const request = ++toneRequest;
    const next = await loadArtworkTone(url);
    if (request === toneRequest) tone.value = next;
  },
  { immediate: true },
);

const isQueued = computed(
  () =>
    Boolean(track.value) &&
    (props.currentTrackId === track.value.id ||
      props.queuedTrackIds.includes(track.value.id)),
);

function select(offset) {
  const target = props.index + offset;
  if (target >= 0 && target < props.tracks.length) emit('select', target);
}

function closeMenu() {
  menu.value = null;
}

// Stops the opening click so the menu's own window listener, attached as it
// mounts mid-dispatch, does not read it as an outside click and close.
function openMenu(event) {
  event.stopPropagation();
  menu.value = { kind: 'element', element: event.currentTarget };
}

function openMenuAtPointer(event) {
  event.preventDefault();
  event.stopPropagation();
  menu.value = { kind: 'point', x: event.clientX, y: event.clientY };
}

function selectMenuAction(value) {
  const selected = track.value;
  closeMenu();
  if (selected) emit('menuSelect', value, selected);
}

function handleWheel(event) {
  if (menu.value || Math.abs(event.deltaY) < 1) return;
  event.preventDefault();
  if (event.timeStamp - lastWheelAt < WHEEL_STEP_INTERVAL_MS) return;
  lastWheelAt = event.timeStamp;
  select(event.deltaY > 0 ? 1 : -1);
}

const KEY_ACTIONS = {
  next: () => select(1),
  previous: () => select(-1),
  mute: () => emit('mute', !props.muted),
};

// Window capture runs before the global shortcuts, so preview keys never
// reach the performance player. UiModal still owns Escape, Tab and focus.
function handleKeydown(event) {
  if (menu.value) return;
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
    :title="title"
    size="wide"
    :tint="tone"
    @close="emit('close')"
  >
    <!-- Session-wide preview tools live in the modal's header tool area. -->
    <template v-if="track" #header-actions>
      <UiIconButton
        :icon="muted ? VolumeX : Volume2"
        :label="muted ? '取消試聽靜音' : '試聽靜音'"
        :title="muted ? '取消試聽靜音' : '試聽靜音'"
        tooltip-suffix=" (M)"
        tooltip-placement="bottom"
        :aria-pressed="muted"
        @click="emit('mute', !muted)"
      />
    </template>
    <AppSurfaceBoundary
      surface-id="track-preview"
      tag="div"
      class="track-preview-surface"
    >
      <div v-if="track" ref="content" class="track-preview">
        <!-- Conventional feed order: now-playing, media, then one edge
             column; the free width splits into equal spaces between them. -->
        <div class="track-preview__content">
          <section class="track-preview__identity" aria-live="polite">
            <!-- Only the title slides; the artist line just updates. -->
            <div class="track-preview__identity-switch">
              <Transition :name="switchTransition">
                <h3 :key="track.id" class="track-preview__title">
                  <UiTextButton
                    v-if="trackAlbum"
                    class="track-preview__title-link"
                    :text="track.title"
                    overflow="clamp"
                    :aria-label="albumCtaLabel"
                    @click="openAlbum"
                  />
                  <span v-else class="track-preview__title-text">
                    {{ track.title }}
                  </span>
                </h3>
              </Transition>
            </div>
            <p v-if="track.artist" class="track-preview__meta">
              <TrackArtistCredits :track="track" @navigate="emit('navigate')" />
            </p>
          </section>

          <UiProgress
            v-if="segment"
            class="track-preview__progress"
            label="試聽進度"
            label-hidden
            :value="segmentElapsed"
            :max="segmentLength || 1"
          />

          <UiNotice
            v-if="statusNotice"
            :tone="statusNotice.tone"
            :message="statusNotice.message"
            compact
          />
        </div>

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
                <UiTrackThumb :track="previousTrack" size="100%" radius="0">
                  <template #overlay>
                    <span
                      class="track-preview__peek-shade track-preview__peek-shade--previous"
                      aria-hidden="true"
                    ></span>
                  </template>
                </UiTrackThumb>
              </button>
            </Transition>
          </span>
          <span
            class="track-preview__artwork"
            data-artwork-reveal-scope
            @contextmenu="openMenuAtPointer"
          >
            <!-- Switching covers and the scrim composite as one layer under
                 the frame's radius clip. -->
            <span class="track-preview__artwork-layers ui-artwork-composite">
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
              <!-- Leaving the preview for real playback sits on the cover like
                   a feed card, revealed on hover or keyboard focus; the
                   preview itself has no play／pause. -->
              <UiArtworkOverlay>
                <UiArtworkReveal>
                  <span
                    class="track-preview__play-scrim"
                    aria-hidden="true"
                  ></span>
                </UiArtworkReveal>
              </UiArtworkOverlay>
            </span>
            <UiArtworkReveal class="track-preview__play">
              <PlaybackPrimaryButton
                play-label="從這首開始播放"
                @click="emit('playTrack', track)"
              />
            </UiArtworkReveal>
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
                <UiTrackThumb :track="nextTrack" size="100%" radius="0">
                  <template #overlay>
                    <span
                      class="track-preview__peek-shade track-preview__peek-shade--next"
                      aria-hidden="true"
                    ></span>
                  </template>
                </UiTrackThumb>
              </button>
            </Transition>
          </span>
        </div>

        <!-- One edge column holds two units: track actions centred on the
             cover, and feed stepping at its foot. -->
        <div class="track-preview__edge">
          <!-- Track actions are the row right-click menu itself plus one
             shortcut taken from it, never a preview-only action. -->
          <div class="track-preview__rail" aria-label="曲目操作">
            <UiIconButton
              :icon="Ellipsis"
              label="更多操作"
              aria-haspopup="menu"
              :aria-expanded="menu?.kind === 'element' ? 'true' : 'false'"
              @click="openMenu"
            />
            <UiIconButton
              :icon="ListEnd"
              :label="isQueued ? '已在一般佇列' : '加入一般佇列'"
              :disabled="isQueued"
              @click="emit('addToQueue', track)"
            />
          </div>

          <!-- Feed stepping is the main preview control: its own outer corner
             at the live control size, apart from the track actions. -->
          <div class="track-preview__skips">
            <UiIconButton
              :icon="ChevronUp"
              label="上一首"
              size="lg"
              tooltip-suffix=" (↑)"
              tooltip-placement="start"
              :disabled="!previousTrack"
              @click="select(-1)"
            />
            <UiIconButton
              :icon="ChevronDown"
              label="下一首"
              size="lg"
              tooltip-suffix=" (↓)"
              tooltip-placement="start"
              :disabled="!nextTrack"
              @click="select(1)"
            />
          </div>
        </div>
      </div>

      <!-- Mounted only once open: its Teleport targets this dialog's own
           host, which is not in the document while the dialog mounts. -->
      <TrackActionMenu
        v-if="menu"
        :open="Boolean(menu)"
        :anchor="menu"
        :track="track"
        :playlists="playlists"
        :current-track-id="currentTrackId"
        :queued-track-ids="queuedTrackIds"
        :performance-queue-busy="menuOptions.performanceQueueBusy"
        :remove-from-playlist-id="menuOptions.removeFromPlaylistId"
        :can-go-to-album="menuOptions.canGoToAlbum"
        @select="selectMenuAction"
        @close="closeMenu"
      />
    </AppSurfaceBoundary>
  </UiModal>
</template>

<style scoped>
/* This boundary only hosts the nested menu; the modal owns the raised paint. */
.track-preview-surface {
  background: transparent;
}

/* Conventional feed order: now-playing, the media, then one edge column for
   track actions and feed stepping. */
.track-preview {
  --track-preview-artwork-size: var(--ui-artwork-size-hero);
  --track-preview-peek-size: var(--ui-artwork-size-xs);
  --track-preview-peek-scale: 0.7;
  --track-preview-info-size: 15rem;

  min-inline-size: 0;
  display: grid;
  /* Equal flexible spaces before the copy, between copy and cover, and
     between cover and edge, so the cover sits evenly between its
     neighbours; none shrinks below the section gap. */
  grid-template-columns:
    minmax(var(--ui-modal-section-gap), 1fr) var(--track-preview-info-size)
    minmax(var(--ui-modal-section-gap), 1fr) max-content
    minmax(var(--ui-modal-section-gap), 1fr) max-content;
  grid-template-areas: '. info . media . edge';
  align-items: center;
}

.track-preview__edge {
  grid-area: edge;
  align-self: stretch;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  justify-items: center;
}

.track-preview__rail,
.track-preview__skips {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

/* Spans the column so it centres on the cover, not on the space above the
   stepping unit. */
.track-preview__rail {
  grid-row: 1 / -1;
  align-self: center;
}

.track-preview__skips {
  grid-row: 2;
  align-self: end;
}

.track-preview__stage {
  grid-area: media;
  display: grid;
  grid-template-rows:
    var(--track-preview-peek-size) auto
    var(--track-preview-peek-size);
  justify-items: center;
  gap: var(--ui-space-2);
  /* Peeks only slide vertically, so only that axis clips; cover shadows
     stay whole at the sides. */
  overflow-x: visible;
  overflow-y: clip;
}

/* Covers lift off the tinted surface with the shared overlay shadow. Each
   frame isolates its own stack, so the overlay plane and corner control
   z-indexes never compete with the rest of the dialog. */
.track-preview__artwork,
.track-preview__peek {
  isolation: isolate;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  /* Border-coloured ground: the clipped cover's corner AA blends into the
     hairline instead of letting the dialog show through a seam. */
  background: var(--ui-color-border);
  box-shadow: var(--ui-shadow-overlay);
}

.track-preview__artwork {
  position: relative;
  grid-row: 2;
  display: grid;
  inline-size: var(--track-preview-artwork-size);
  max-inline-size: 100%;
  aspect-ratio: 1;
}

/* Real playback starts from the cover's corner, like a feed card; corner
   controls sit above the shared artwork overlay plane. */
.track-preview__play {
  position: absolute;
  z-index: var(--ui-layer-indicator);
  inset-block-end: var(--ui-space-2);
  inset-inline-end: var(--ui-space-2);
}

/* A tight corner vignette, not a full darken: the cover stays the focus
   while the button gets a calmer ground. */
.track-preview__play-scrim {
  background: radial-gradient(
    circle at 100% 100%,
    var(--ui-color-overlay-scrim),
    transparent 40%
  );
  pointer-events: none;
}

.track-preview__play-scrim:dir(rtl) {
  background: radial-gradient(
    circle at 0% 100%,
    var(--ui-color-overlay-scrim),
    transparent 40%
  );
}

.track-preview__artwork-layers {
  position: absolute;
  inset: 0;
  display: grid;
}

/* The artwork frame clips a full-height slide between covers. */
.track-preview__artwork-image {
  --track-preview-switch-offset: 100%;
}

/* Neighbours sit one clear tier below the current cover: smaller, shaded and
   clipped to an edge slice. */
.track-preview__peek {
  --track-preview-switch-offset: var(--track-preview-peek-size);

  inline-size: calc(
    var(--track-preview-artwork-size) * var(--track-preview-peek-scale)
  );
  position: relative;
  aspect-ratio: 1;
  padding: 0;
  cursor: pointer;
}

/* Neighbours recede behind a scrim that deepens toward their outer edge;
   it eases off on hover to show they can be picked. */
.track-preview__peek-shade {
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.track-preview__peek-shade--previous {
  background: linear-gradient(
    to bottom,
    var(--ui-color-overlay-scrim-active),
    var(--ui-color-overlay-scrim)
  );
}

.track-preview__peek-shade--next {
  background: linear-gradient(
    to top,
    var(--ui-color-overlay-scrim-active),
    var(--ui-color-overlay-scrim)
  );
}

.track-preview__peek:hover .track-preview__peek-shade {
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

/* Now-playing centres against the cover in its fixed info lane. */
.track-preview__content {
  grid-area: info;
  min-inline-size: 0;
  display: grid;
  justify-items: start;
  gap: var(--ui-modal-section-gap);
}

.track-preview__identity {
  min-inline-size: 0;
  justify-self: stretch;
  display: grid;
  gap: var(--ui-space-1);
}

/* Feed chrome: wheel, repeated clicks and drags never select the cover area
   or the switching title copy; the status notice stays selectable. */
.track-preview__stage,
.track-preview__identity {
  -webkit-user-select: none;
  user-select: none;
}

.track-preview__identity-switch {
  position: relative;
  min-inline-size: 0;
  display: grid;
}

.track-preview__meta {
  margin: 0;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Cover, then the title one step above the dialog's own title, then a small
   artist line: clear tiers. */
.track-preview__title {
  --track-preview-switch-offset: var(--ui-space-2);

  min-inline-size: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-display-size);
  font-weight: var(--ui-type-display-weight);
  /* Display leading is too tight: the clamp would clip the last line's
     hover underline. */
  line-height: var(--ui-type-title-line-height);
}

/* Plain titles clamp like UiTextButton's clamp overflow. */
.track-preview__title-text {
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* UiTextButton leaves font-weight to its caller. */
.track-preview__title-link {
  font-weight: inherit;
}

/* The bar spans the info lane, which is what bounds its length. */
.track-preview__progress {
  justify-self: stretch;
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

/* Spaces 3 × 1 + info 15 + cover 20 + edge 2.75 + modal insets 3
   = 43.75rem; below that the cover leads, the copy moves under it and the
   peeks drop. */
@container (max-width: 44rem) {
  .track-preview {
    grid-template-columns:
      minmax(0, var(--track-preview-artwork-size))
      max-content;
    grid-template-areas:
      'media edge'
      'info info';
    gap: var(--ui-modal-section-gap);
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
