<script setup>
import { computed, onBeforeUnmount, shallowRef, unref, watch } from 'vue';
import CompanionConnection from './CompanionConnection.vue';
import CompanionLyrics from './CompanionLyrics.vue';
import CompanionOutputTemplates from './CompanionOutputTemplates.vue';
import CompanionPlayerBar from './CompanionPlayerBar.vue';
import CompanionQueue from './CompanionQueue.vue';
import CompanionRemoteControls from './CompanionRemoteControls.vue';
import { createCompanionThumbnails } from './companionThumbnails.js';
import { createNowPlaying } from './companionNowPlaying.js';
import { playbackPositionMs } from '../../shared/presentation/state.mjs';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiNotice from '../components/ui/UiNotice.vue';
import UiPopover from '../components/ui/UiPopover.vue';
import UiTabs from '../components/ui/UiTabs.vue';
import PerformerDisplayControls from '../components/performer/PerformerDisplayControls.vue';
import { disableUiTooltips } from '../components/ui/useTooltip.js';
import {
  Captions,
  CircleAlert,
  ICON_SIZE,
  Link,
  ListMusic,
  LocateFixed,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from '../icons/index.js';
import { usePerformerViewState } from '../composables/usePerformerViewState.js';
import { provideUiOverlayHost } from '../composables/useUiOverlayHost.js';
import { registeredOverlayHostAttributes } from '../utils/rendererSurfaceRegistry.js';
import { t } from '../utils/i18n.js';

const props = defineProps({
  status: { type: [String, Object], required: true },
  remote: { type: Object, default: null },
  matchCode: { type: Object, default: null },
  embedded: { type: Boolean, default: false },
});

provideUiOverlayHost('performer');
disableUiTooltips();
const overlayHostAttributes = registeredOverlayHostAttributes('performer');
const { frame, snapshot, readingScale, setReadingScale } =
  usePerformerViewState({
    pauseWhenHidden: true,
    showWordCues: false,
    bridge: props.remote?.performerBridge,
  });
const activeTab = shallowRef('lyrics');
const followingLyrics = shallowRef(true);
const readingDisplayOpen = shallowRef(false);
const layout = shallowRef(props.remote?.getLyricsLayout?.() ?? 'list');
watch(layout, (value) => props.remote?.setLyricsLayout?.(value));
const tabs = [
  { id: 'queue', label: t('queue.panel.queue') },
  { id: 'lyrics', label: t('companion.tabs.lyrics') },
  { id: 'player', label: t('companion.tabs.player') },
  { id: 'templates', label: t('companion.tabs.templates') },
];
const activePageTitle = computed(
  () => tabs.find(({ id }) => id === activeTab.value)?.label,
);
const pageDirection = shallowRef(null);
watch(activeTab, (next, previous) => {
  readingDisplayOpen.value = false;
  if (next === 'lyrics') followingLyrics.value = true;
  pageDirection.value =
    tabs.findIndex(({ id }) => id === next) <
    tabs.findIndex(({ id }) => id === previous)
      ? 'back'
      : 'forward';
});
let swipeStart = null;

function beginSwipe(event) {
  swipeStart = null;
  if (
    event.touches.length !== 1 ||
    hasTextSelection() ||
    event.target.closest?.('button, a, input, select')
  )
    return;
  const touch = event.touches[0];
  // Leave the viewport edges available for browser back/forward gestures.
  if (touch.clientX < 20 || touch.clientX > window.innerWidth - 20) return;
  swipeStart = touch;
}

function hasTextSelection() {
  return globalThis.getSelection?.()?.isCollapsed === false;
}

function preventControlCallout(event) {
  if (event.target.closest?.('button, input[type="range"], img'))
    event.preventDefault();
}

function cancelSwipe() {
  swipeStart = null;
}

function endSwipe(event) {
  const start = swipeStart;
  swipeStart = null;
  if (!start || event.touches.length || hasTextSelection()) return;
  const end = [...event.changedTouches].find(
    (touch) => touch.identifier === start.identifier,
  );
  if (!end) return;
  const dx = end.clientX - start.clientX;
  const dy = end.clientY - start.clientY;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const index = tabs.findIndex(({ id }) => id === activeTab.value);
  const target = tabs[index + (dx < 0 ? 1 : -1)];
  if (target) activeTab.value = target.id;
}
const scales = ['near', 'desk', 'stage'];
const scaleIndex = computed(() => scales.indexOf(readingScale.value));

function stepReadingScale(delta) {
  const option = scales[scaleIndex.value + delta];
  if (option) void setReadingScale(option);
}

const state = computed(() => unref(props.status));
const ready = computed(
  () =>
    state.value === 'live' ||
    (state.value === 'reconnecting' && Boolean(snapshot.value)),
);
const pageStatus = computed(() =>
  state.value === 'reconnecting' ? 'connectFailed' : state.value,
);
// Current, queued and recent tracks preload in the background.
const artworkTrackIds = computed(
  () =>
    new Set(
      [
        frame.value.trackId,
        ...(snapshot.value?.state?.queue?.items ?? [])
          .filter(({ state }) => state === 'queued')
          .map(({ track }) => track.id),
        ...(snapshot.value?.queueView?.recent ?? []).map(({ id }) => id),
      ].filter(Boolean),
    ),
);
const thumbnails = createCompanionThumbnails({
  getArtwork: (id, signal) => props.remote.getTrackArtwork(id, signal),
  isLive: () =>
    Boolean(props.remote?.getTrackArtwork) && state.value === 'live',
  isPinned: (id) => artworkTrackIds.value.has(id),
});
const withThumbnail = props.remote?.withThumbnail ?? thumbnails.withThumbnail;

function loadThumbnail(id) {
  thumbnails.request(id, { urgent: true });
}

watch(
  [state, artworkTrackIds],
  ([connection, ids]) => {
    if (connection !== 'live') return thumbnails.pause();
    loadThumbnail(frame.value.trackId);
    thumbnails.preload(ids);
  },
  { immediate: true },
);
const sending = shallowRef(false);
const remoteUnavailable = computed(
  () => !props.remote || sending.value || state.value !== 'live',
);
const disabled = computed(
  () => remoteUnavailable.value || !frame.value.trackId,
);
const notice = shallowRef(null);
let noticeTimer = null;

function showNotice(message) {
  clearTimeout(noticeTimer);
  notice.value = message || null;
  if (message) noticeTimer = setTimeout(() => (notice.value = null), 3200);
}

watch(state, () => showNotice(''));

async function sendRemote(command, context = {}) {
  if (
    /^(queue|library|output)\./u.test(command)
      ? remoteUnavailable.value
      : disabled.value
  )
    return;
  sending.value = true;
  try {
    const result = await props.remote.sendCommand(command, {
      revision: frame.value.revision,
      trackId: frame.value.trackId,
      ...context,
    });
    const reason = [
      'stale',
      'unavailable',
      'busy',
      'rate-limited',
      'timed_out',
    ].includes(result)
      ? result
      : 'failed';
    if (state.value === 'live') {
      showNotice(
        result === 'applied' ? '' : t(`companion.remote.results.${reason}`),
      );
    }
  } catch {
    if (state.value === 'live')
      showNotice(t('companion.remote.results.failed'));
  } finally {
    sending.value = false;
  }
}
// Lock-screen controls. iOS needs a tap before audio, so a saved choice
// starts on the first tap anywhere.
const nowPlaying = createNowPlaying({ onCommand: sendRemote });
const nowPlayingEnabled = shallowRef(false);
const lockScreenWanted = shallowRef(
  nowPlaying.supported && Boolean(props.remote?.getLockScreen?.()),
);
const TAP_EVENTS = ['touchend', 'click'];

async function startNowPlaying() {
  const started = await nowPlaying.enable();
  if (!lockScreenWanted.value) {
    nowPlaying.disable();
    return false;
  }
  nowPlayingEnabled.value = started;
  return started;
}

function stopWaitingForTap() {
  for (const type of TAP_EVENTS)
    globalThis.document?.removeEventListener(type, startOnTap, true);
}

function waitForTap() {
  for (const type of TAP_EVENTS)
    globalThis.document?.addEventListener(type, startOnTap, {
      capture: true,
      passive: true,
    });
}

function startOnTap() {
  stopWaitingForTap();
  void startNowPlaying().then((started) => {
    if (!started && lockScreenWanted.value) waitForTap();
  });
}

if (!props.embedded && lockScreenWanted.value) waitForTap();

async function setNowPlaying(enabled) {
  lockScreenWanted.value = enabled;
  if (props.embedded) return;
  props.remote?.setLockScreen?.(enabled);
  stopWaitingForTap();
  if (!enabled) {
    nowPlaying.disable();
    nowPlayingEnabled.value = false;
    return;
  }
  if (await startNowPlaying()) return;
  lockScreenWanted.value = false;
  props.remote?.setLockScreen?.(false);
  showNotice(t('companion.remote.lockScreenFailed'));
}

watch(
  [
    nowPlayingEnabled,
    snapshot,
    () => withThumbnail(frame.value.track)?.thumbnailUrl,
  ],
  ([enabled, current, artworkUrl]) => {
    const playback = current?.state?.playback;
    if (!enabled) return;
    nowPlaying.update({
      title: frame.value.track?.title ?? '',
      artist: frame.value.track?.artist ?? '',
      artworkUrl: artworkUrl ?? '',
      playing: playback?.status === 'playing',
      durationSec: (playback?.durationMs ?? 0) / 1000,
      positionSec: current?.state
        ? playbackPositionMs(current.state, Date.now()) / 1000
        : 0,
    });
  },
);

onBeforeUnmount(() => {
  clearTimeout(noticeTimer);
  thumbnails.dispose();
  stopWaitingForTap();
  nowPlaying.disable();
});
</script>

<template>
  <div
    class="companion-app"
    :class="{ 'companion-app--embedded': embedded }"
    @contextmenu="preventControlCallout"
  >
    <div v-bind="overlayHostAttributes" class="ui-overlay-host" />
    <div v-if="ready" class="companion-app__shell">
      <header class="companion-app__header">
        <h1>{{ activePageTitle }}</h1>
        <span
          class="companion-app__connection"
          :class="{ 'companion-app__connection--live': state === 'live' }"
        >
          <component
            :is="state === 'live' ? Link : CircleAlert"
            :size="ICON_SIZE"
            aria-hidden="true"
          />
          {{
            t(
              state === 'live'
                ? 'companion.page.connectedShort'
                : 'companion.page.reconnectingShort',
            )
          }}
        </span>
      </header>
      <div class="companion-app__notice" role="status">
        <UiNotice
          v-if="notice"
          :message="notice"
          tone="warning"
          variant="banner"
          role="presentation"
          compact
        />
      </div>
      <main
        class="companion-app__content"
        :data-page-direction="pageDirection"
        @touchstart.passive="beginSwipe"
        @touchend.passive="endSwipe"
        @touchcancel.passive="cancelSwipe"
      >
        <section
          v-for="tab in tabs"
          v-show="activeTab === tab.id"
          :id="`companion-${tab.id}-panel`"
          :key="tab.id"
          class="companion-app__panel"
          :class="{
            'companion-app__panel--lyrics': tab.id === 'lyrics',
            'companion-app__panel--templates': tab.id === 'templates',
          }"
          role="tabpanel"
          :aria-labelledby="`companion-${tab.id}-tab`"
          :tabindex="tab.id === 'lyrics' ? undefined : 0"
        >
          <template v-if="activeTab === tab.id">
            <CompanionLyrics
              v-if="tab.id === 'lyrics'"
              v-model:following="followingLyrics"
              :frame="frame"
              :snapshot="snapshot"
              :layout="layout"
              :reading-scale="readingScale"
            />
            <CompanionQueue
              v-else-if="tab.id === 'queue'"
              :track="withThumbnail(frame.track)"
              :queue="snapshot?.state?.queue"
              :manual-queue-count="snapshot?.manualQueueCount"
              :queue-view="snapshot?.queueView"
              :remote="remote"
              :disabled="remoteUnavailable"
              :with-thumbnail="withThumbnail"
              :artwork-ready="state === 'live'"
              @load-thumbnail="loadThumbnail"
              @preload-thumbnails="thumbnails.preload"
              @play="sendRemote('queue.play', { queueIndex: $event })"
              @command="sendRemote"
            />
            <CompanionRemoteControls
              v-else-if="tab.id === 'player'"
              :disabled="disabled"
              :key-label="frame.keyLabel"
              :tempo-rate="snapshot?.adjustments?.tempoRate"
              :guide-vocal="snapshot?.controls?.guideVocal"
              :lock-screen-supported="nowPlaying.supported"
              :lock-screen-enabled="lockScreenWanted"
              @command="sendRemote"
              @update:lock-screen-enabled="setNowPlaying"
            />
            <CompanionOutputTemplates
              v-else
              :slots="snapshot?.outputSlots"
              :track="frame.track"
              :local-portraits="embedded"
              :get-portrait="
                state === 'live' ? remote?.getOutputPortrait : null
              "
              :disabled="remoteUnavailable"
              @change-option="
                sendRemote('output.set-option', { outputChange: $event })
              "
            />
          </template>
        </section>
        <div
          v-if="activeTab === 'lyrics' && frame.currentLine"
          class="companion-app__lyrics-tools"
          role="group"
          :aria-label="t('companion.templates.quickTools')"
        >
          <UiIconButton
            v-if="layout === 'list' && !followingLyrics"
            :icon="LocateFixed"
            :label="t('lyricsEditor.document.returnToCurrent')"
            variant="accent"
            size="lg"
            @click="followingLyrics = true"
          />
          <UiIconButton
            :icon="ZoomOut"
            :label="t('companion.templates.smaller')"
            tooltip-placement="left"
            size="lg"
            :disabled="scaleIndex <= 0"
            @click="stepReadingScale(-1)"
          />
          <UiIconButton
            :icon="ZoomIn"
            :label="t('companion.templates.larger')"
            tooltip-placement="left"
            size="lg"
            :disabled="scaleIndex >= scales.length - 1"
            @click="stepReadingScale(1)"
          />
          <UiIconButton
            :icon="layout === 'focus' ? ListMusic : Captions"
            :label="
              t(
                layout === 'focus'
                  ? 'companion.templates.list'
                  : 'companion.templates.focus',
              )
            "
            tooltip-placement="left"
            size="lg"
            @click="layout = layout === 'focus' ? 'list' : 'focus'"
          />
          <UiPopover
            v-if="frame.readingVariants?.length"
            v-model:open="readingDisplayOpen"
            :aria-label="t('performer.actionBar.displayLabel')"
            placement="top-end"
            focus-on-open
            :panel-style="{ padding: 'var(--ui-space-3)' }"
          >
            <template #trigger="{ triggerProps }">
              <UiIconButton
                v-bind="triggerProps"
                :icon="SlidersHorizontal"
                :label="t('performer.actionBar.display')"
                :active="readingDisplayOpen"
                size="lg"
                @click="readingDisplayOpen = !readingDisplayOpen"
              />
            </template>
            <PerformerDisplayControls
              :reading-scale="readingScale"
              :reading-variant="frame.readingVariant"
              :reading-variants="frame.readingVariants"
              :preparing="frame.readingPreparing"
              :error="frame.readingError"
              :disabled="disabled || frame.readingPreparing"
              @update:reading-scale="setReadingScale"
              @update:reading-variant="sendRemote(`reading.${$event}`)"
            />
          </UiPopover>
        </div>
      </main>
      <footer class="companion-app__footer">
        <UiTabs
          v-model:active-id="activeTab"
          class="companion-app__page-tabs"
          :items="tabs"
          :aria-label="t('companion.title')"
          tab-id-prefix="companion"
          panel-id-prefix="companion"
          variant="dots"
        />
        <div v-if="remote" class="companion-app__playback">
          <CompanionPlayerBar
            :snapshot="snapshot"
            :track="withThumbnail(frame.track)"
            :disabled="disabled"
            :send-command="sendRemote"
          />
        </div>
      </footer>
    </div>
    <CompanionConnection
      v-else
      :status="pageStatus"
      :match-code="matchCode?.value"
      :can-resume="Boolean(remote?.resume)"
      @resume="remote.resume()"
    />
  </div>
</template>

<style scoped>
:global(html[data-ui-entry='companion']),
:global(html[data-ui-entry='companion'] body) {
  overflow: hidden;
  overscroll-behavior-y: none;
}

:global(html[data-ui-entry='companion'] body) {
  background: inherit;
}

.companion-app {
  --ui-companion-canvas: var(--ui-color-canvas);
  --ui-companion-panel: var(--ui-color-surface);
  --ui-companion-raised: var(--ui-color-surface-raised);
  --ui-companion-track-artwork-size: var(--ui-track-artwork-size-prominent);
  /* Aliases resolve at #app under compact; restate them for 44px touch targets. */
  --ui-control-height: var(--ui-control-height-live);
  --ui-field-height: var(--ui-control-height-live);
  --ui-icon-button-size-md: var(--ui-control-height-live);
  --ui-search-clear-hit-size: var(--ui-control-height-live);
  /* iOS Safari zooms focused fields below 16px. */
  --ui-field-font-size: var(--ui-type-body-size);
  --ui-textarea-font-size: var(--ui-type-body-size);
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  block-size: 100vh;
  block-size: 100dvh;
  min-block-size: 0;
  overflow: hidden;
  padding-left: env(safe-area-inset-left, 0);
  padding-right: env(safe-area-inset-right, 0);
  background: var(--ui-companion-canvas);
  color: var(--ui-color-text);
  /* Stops iOS double-tap zoom on rapid button taps. */
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
}

.companion-app--embedded {
  inline-size: 100%;
  block-size: 100%;
}

.companion-app :deep(:is(button, input[type='range'], img)) {
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
}

.companion-app
  :deep(
    :is(
      .companion-lyrics [data-cue-priority],
      .companion-player__identity,
      .companion-queue .ui-track__info,
      .companion-connection__code dd
    )
  ) {
  -webkit-user-select: text;
  user-select: text;
}

.companion-app__shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-block-size: 0;
  inline-size: min(100%, var(--ui-companion-shell-max-inline-size));
  margin-inline: auto;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}

.companion-app__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding: var(--ui-space-1) var(--ui-space-3);
  padding-block-start: max(var(--ui-space-1), env(safe-area-inset-top, 0));
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-companion-panel);
}

.companion-app__header h1 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.companion-app__connection {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ui-space-1);
  color: var(--ui-color-warning);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.companion-app__connection--live {
  color: var(--ui-color-success);
}

.companion-app__content {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  min-block-size: 0;
  overflow: hidden;
  overflow: clip;
  touch-action: pan-y pinch-zoom;
}

.companion-app__panel {
  grid-row: 1;
  min-inline-size: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y pinch-zoom;
  padding: var(--ui-space-3);
}

.companion-app__panel:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.companion-app__panel--lyrics {
  padding: 0;
  overflow: hidden;
}

.companion-app__panel--templates {
  padding-inline: 0;
  padding-block-end: 0;
}

@media (prefers-reduced-motion: no-preference) {
  .companion-app__content {
    --ui-companion-page-enter-offset: var(--ui-space-4);
  }

  .companion-app__content[data-page-direction='back'] {
    --ui-companion-page-enter-offset: calc(-1 * var(--ui-space-4));
  }

  .companion-app__content[data-page-direction] .companion-app__panel {
    animation: companion-page-enter var(--ui-motion-duration-fast)
      var(--ui-motion-easing-standard) both;
  }
}

@keyframes companion-page-enter {
  from {
    opacity: var(--ui-companion-page-enter-opacity);
    transform: translateX(var(--ui-companion-page-enter-offset));
  }
}

.companion-app__footer {
  display: grid;
}

.companion-app__playback {
  background: var(--ui-companion-panel);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  padding: var(--ui-space-2);
  padding-block-start: calc(var(--ui-space-1) - var(--ui-border-width));
  padding-block-end: calc(var(--ui-space-2) + env(safe-area-inset-bottom, 0));
}

.companion-app__page-tabs {
  --ui-control-height: var(--ui-space-5);
  --ui-tabs-dot-target-width: var(--ui-control-height);
  --ui-tabs-dot-size: calc(var(--ui-space-1) + 2 * var(--ui-border-width));
  --ui-tabs-active-dot-width: var(--ui-tabs-dot-size);
  justify-self: center;
  margin-block: var(--ui-space-1);
  padding-inline: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-companion-raised);
}

.companion-app__page-tabs :deep(.ui-tabs__dot) {
  background: currentColor;
}

.companion-app__lyrics-tools {
  position: absolute;
  display: grid;
  inset-inline-end: var(--ui-space-2);
  inset-block-end: var(--ui-space-2);
  max-block-size: calc(100% - var(--ui-space-4));
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--ui-companion-raised);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  z-index: var(--ui-layer-raised);
}

.companion-app__notice {
  min-inline-size: 0;
  background: var(--ui-companion-panel);
}
</style>
