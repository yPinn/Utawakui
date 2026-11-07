<script setup>
import {
  computed,
  nextTick,
  onScopeDispose,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import { Search, SlidersHorizontal } from '../../icons/index.js';
import { useBgmSession } from '../../composables/useBgmSession.js';
import { useBgmStandbyPlan } from '../../composables/useBgmStandbyPlan.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { artistSearchTexts } from '../../utils/artistPage.js';
import { hasPlayableAccompaniment } from '../../utils/playableTrack.js';
import {
  projectBgmOperationalStatus,
  projectBgmPrimaryAction,
} from './bgmPresentation.js';
import BgmCurrentSource from './BgmCurrentSource.vue';
import BgmPlayerTransport from './BgmPlayerTransport.vue';
import BgmTrackPicker from './BgmTrackPicker.vue';
import UiButton from '../ui/UiButton.vue';
import UiFolderTabShape from '../ui/UiFolderTabShape.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import { t } from '../../utils/i18n.js';
const props = defineProps({
  active: { type: Boolean, default: true },
  variant: {
    type: String,
    default: 'session',
    validator: (value) => ['session', 'dock'].includes(value),
  },
});
const dockExpanded = shallowRef(false);
const controlsId = useId();
const tabShapeId = `bgm-search-tab-shape-${useId()}`;
const tabShapeStyle = { '--ui-folder-tab-shape': `url("#${tabShapeId}")` };
async function toggleDock() {
  const wasOpen = dockOpen.value;
  if (dockForcedOpen.value && wasOpen) return;
  pickerExpanded.value = false;
  if (!dockForcedOpen.value) dockExpanded.value = !wasOpen;
  if (!hasSearchTab.value) return;

  await nextTick();
  const target = dockOpen.value ? raisedAudioTab.value : disclosure.value;
  target?.$el?.focus({ preventScroll: true });
}
const {
  state,
  handoffState,
  deckState,
  currentTrack,
  isCurrentSourceLoaded,
  canToggleGuideVocal,
  settings,
  playBgm,
  pauseBgm,
  emergencyCut,
  seekBgm,
  commitBgmPosition,
  setDimmed,
  setGuideVocalOn,
  previewVolume,
  setVolume,
  setMuted,
} = useBgmSession();
const { state: planState, setTrack } = useBgmStandbyPlan();
const { state: library } = useLibrary();
const { state: artistIndexState } = useArtistIndex();
const sourceSwap = shallowRef(null);
const displayedTrack = computed(
  () => sourceSwap.value?.track ?? currentTrack.value,
);
const sourceHasChanged = computed(
  () => displayedTrack.value?.id !== currentTrack.value?.id,
);
const sourcePlaybackAction = computed(() => {
  if (props.variant !== 'dock') return null;
  const action = projectBgmPrimaryAction({
    phase: handoffState.phase,
    hasTrack: Boolean(currentTrack.value),
  });
  return sourceHasChanged.value && action.intent === 'play'
    ? { ...action, disabled: true }
    : action;
});
function activateSource() {
  const action = sourcePlaybackAction.value;
  if (!action || action.disabled) return;
  if (action.intent === 'pause') pauseBgm();
  else playBgm();
}
const pickerExpanded = shallowRef(false),
  searchQuery = shallowRef('');
const pickerOpenedInSource = shallowRef(false);
const pickerButton = useTemplateRef('pickerButton');
const picker = useTemplateRef('picker');
const sourcePickerHost = shallowRef(null);
const searchTabHost = shallowRef(null);
const disclosure = useTemplateRef('disclosure');
const raisedAudioTab = useTemplateRef('raisedAudioTab');
const raisedSearchTab = useTemplateRef('raisedSearchTab');
const toolsHost = useTemplateRef('toolsHost');
const cutHost = useTemplateRef('cutHost');
const playerRoot = useTemplateRef('playerRoot');
const error = computed(
  () => state.error || handoffState.error || deckState.error || '',
);
const handoffBusy = computed(
  () =>
    handoffState.phase !== 'idle' ||
    Boolean(handoffState.restorePending || handoffState.audibleLane),
);
const dockStandby = computed(
  () =>
    props.variant === 'dock' &&
    !planState.isLoading &&
    !error.value &&
    !handoffBusy.value,
);
const emptyStandby = computed(
  () =>
    dockStandby.value &&
    compact.value &&
    !currentTrack.value &&
    !planState.plan.currentTrackId,
);
const selectedStandby = computed(
  () => dockStandby.value && Boolean(currentTrack.value),
);
const dockForcedOpen = computed(
  () => props.variant === 'dock' && !currentTrack.value && Boolean(error.value),
);
const canFoldSelectedTrack = computed(
  () =>
    props.variant === 'dock' &&
    Boolean(currentTrack.value) &&
    !dockForcedOpen.value,
);
const dockOpen = computed(
  () =>
    (dockExpanded.value || dockForcedOpen.value) &&
    !(currentTrack.value && pickerExpanded.value),
);
const audioTabLabel = computed(() =>
  t(
    dockForcedOpen.value && dockOpen.value
      ? 'bgm.controlsPinned'
      : dockOpen.value
        ? 'player.bgm.collapse'
        : 'player.bgm.expand',
  ),
);
const compact = computed(
  () => props.variant === 'dock' && !dockOpen.value && !currentTrack.value,
);
const sourceNoticeKey = shallowRef('');
let sourceNoticeTimer;
function clearSourceNotice() {
  clearTimeout(sourceNoticeTimer);
  sourceNoticeKey.value = '';
}
function showSourceNotice(key) {
  if (
    !props.active ||
    props.variant !== 'dock' ||
    !currentTrack.value ||
    error.value
  )
    return;
  clearSourceNotice();
  sourceNoticeKey.value = key;
  sourceNoticeTimer = setTimeout(clearSourceNotice, 2500);
}
watch(selectedStandby, (standby) => {
  if (!standby) clearSourceNotice();
});
watch(error, (message) => {
  if (message) clearSourceNotice();
});
watch(
  () => props.active,
  (active) => {
    if (!active) {
      pickerExpanded.value = false;
      dockExpanded.value = false;
      clearSourceNotice();
    }
  },
);
onScopeDispose(() => {
  sourceSwap.value = null;
  clearSourceNotice();
});
// Keep the open picker anchored while a save resolves or the source changes.
const sourceRowPicker = computed(() =>
  pickerExpanded.value ? pickerOpenedInSource.value : emptyStandby.value,
);
const hasSearchTab = computed(
  () =>
    props.variant === 'dock' &&
    Boolean(currentTrack.value) &&
    !sourceRowPicker.value,
);
const drawerOpen = computed(
  () =>
    pickerExpanded.value ||
    (props.active && hasSearchTab.value && dockOpen.value),
);
const drawerSection = shallowRef('search');
let drawerResize;
watch(
  [
    () => hasSearchTab.value && dockOpen.value,
    () => hasSearchTab.value && pickerExpanded.value,
  ],
  async ([audio, search], [hadAudio, hadSearch] = []) => {
    // Keep the last section mounted at its height for the downward exit.
    if (!audio && !search) return;
    const section = audio ? 'audio' : 'search';
    if (section === drawerSection.value) return;

    const panel = toolsHost.value?.closest?.('.ui-popover');
    const before =
      hadAudio || hadSearch ? panel?.getBoundingClientRect().height : null;
    drawerSection.value = section;
    if (before == null || !panel?.animate) return;

    await nextTick();
    if (!drawerOpen.value || drawerSection.value !== section) return;

    // Sample the rendered height above before cancelling a previous resize.
    drawerResize?.cancel();
    const after = panel.getBoundingClientRect().height;
    const style = getComputedStyle(panel);
    const time = style.getPropertyValue('--ui-motion-duration-standard').trim();
    const duration = Number.parseFloat(time) * (time.endsWith('ms') ? 1 : 1000);
    if (before === after || !(duration > 0)) return;

    drawerResize = panel.animate(
      [{ blockSize: `${before}px` }, { blockSize: `${after}px` }],
      {
        duration,
        easing: style.getPropertyValue('--ui-motion-easing-reversible').trim(),
        fill: 'backwards',
      },
    );
  },
  { immediate: true },
);
watch(drawerOpen, async (open) => {
  if (open) return;
  // The popover records its current height before running the downward exit.
  await nextTick();
  if (!drawerOpen.value) drawerResize?.cancel();
});
onScopeDispose(() => drawerResize?.cancel());
const pickerHost = computed(() =>
  sourceRowPicker.value
    ? sourcePickerHost.value
    : hasSearchTab.value
      ? searchTabHost.value
      : null,
);
async function togglePicker(registerTrigger) {
  if (pickerExpanded.value) {
    pickerExpanded.value = false;
    return;
  }
  if (sourceSwap.value?.saved) finishSourceSwap(sourceSwap.value);
  pickerOpenedInSource.value = sourceRowPicker.value;
  if (!hasSearchTab.value) registerTrigger?.(pickerButton.value);
  else dockExpanded.value = false;
  pickerExpanded.value = true;
  if (hasSearchTab.value) {
    await nextTick();
    picker.value?.$el?.querySelector?.('input')?.focus({ preventScroll: true });
  }
}
async function closeSearchTab() {
  pickerExpanded.value = false;
  await nextTick();
  restorePickerFocus();
}
const operationalStatus = computed(() =>
  projectBgmOperationalStatus({
    phase: handoffState.phase,
    restorePending: handoffState.restorePending,
    error: error.value,
    exceptionsOnly: props.variant === 'dock',
  }),
);
const sourceModeLabel = computed(() => {
  if (
    !currentTrack.value ||
    !isCurrentSourceLoaded.value ||
    sourceHasChanged.value
  ) {
    return '';
  }
  if (!deckState.usesSeparatedAudio) return t('bgm.originalSourceHint');
  return deckState.guideVocalOn && canToggleGuideVocal.value
    ? t('bgm.vocalsHint')
    : '';
});
const statusLabel = computed(() =>
  [operationalStatus.value?.label, sourceModeLabel.value]
    .filter(Boolean)
    .join(t('common.metaSeparator')),
);
const inlineStatus = computed(() => props.variant === 'dock' && !error.value);
const inlineStatusLabel = computed(() =>
  handoffState.restorePending
    ? t('bgm.restorePending')
    : (operationalStatus.value?.label ?? sourceModeLabel.value),
);
const statusAccessibleLabel = computed(() =>
  [operationalStatus.value?.accessibleLabel, sourceModeLabel.value]
    .filter(Boolean)
    .join('，'),
);
const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!query) return [];
  return library.tracks
    .filter(
      (track) =>
        track.id !== planState.plan.currentTrackId &&
        [track.title, ...artistSearchTexts(track, artistIndexState.index)].some(
          (value) =>
            String(value ?? '')
              .toLocaleLowerCase()
              .includes(query),
        ),
    )
    .slice(0, 8);
});
function restorePickerFocus() {
  if (!props.active) return;
  const target =
    hasSearchTab.value && drawerOpen.value
      ? raisedSearchTab.value
      : compact.value && !emptyStandby.value
        ? disclosure.value
        : pickerButton.value;
  target?.$el?.focus({ preventScroll: true });
}
function handlePickerClose(reason) {
  const searchWasOpen = pickerExpanded.value;
  pickerExpanded.value = false;
  if (hasSearchTab.value) dockExpanded.value = false;
  if (reason !== 'escape') return;
  if (searchWasOpen || !hasSearchTab.value) {
    nextTick(restorePickerFocus);
  } else {
    nextTick(() => {
      const target = drawerOpen.value ? raisedAudioTab.value : disclosure.value;
      target?.$el?.focus({ preventScroll: true });
    });
  }
}
function finishSourceSwap(swap) {
  if (sourceSwap.value !== swap) return;
  sourceSwap.value = null;
  searchQuery.value = '';
  showSourceNotice(
    hasPlayableAccompaniment(currentTrack.value)
      ? 'bgm.sourceChanged'
      : 'bgm.originalSourceHint',
  );
}
async function changeTrack(trackId) {
  if (sourceSwap.value) return;
  const active = globalThis.document?.activeElement;
  const restoreFocus = Boolean(picker.value?.$el?.contains(active));
  const panel = picker.value?.$el?.closest?.('.ui-popover');
  const swap =
    hasSearchTab.value && pickerExpanded.value
      ? {
          track: currentTrack.value,
          currentTime: deckState.currentTime,
          duration: deckState.duration,
          results: searchResults.value,
          saved: false,
        }
      : null;
  sourceSwap.value = swap;
  if (!(await setTrack(trackId))) {
    sourceSwap.value = null;
    return;
  }
  if (sourceSwap.value !== swap) return;
  if (swap) {
    swap.saved = true;
    clearSourceNotice();
  }
  pickerExpanded.value = false;
  if (!swap) finishSourceSwap(null);
  await nextTick();
  if (
    restoreFocus &&
    (document.activeElement === active ||
      document.activeElement === document.body)
  )
    restorePickerFocus();
  if (swap) {
    const animations = panel?.getAnimations?.() ?? [];
    await Promise.allSettled(animations.map((animation) => animation.finished));
    finishSourceSwap(swap);
  }
}
</script>
<template>
  <section
    v-show="active"
    ref="playerRoot"
    class="bgm-player"
    :data-ui-popover-peer-group="
      variant === 'dock' ? 'playback-tools' : undefined
    "
    :class="{
      'bgm-player--dock': variant === 'dock',
      'bgm-player--compact': compact,
    }"
    :aria-label="
      t(variant === 'dock' ? 'player.bgm.shortcutLabel' : 'player.bgm.label')
    "
  >
    <div class="bgm-player__main">
      <div class="bgm-player__source-row">
        <BgmCurrentSource
          :track="displayedTrack"
          :playback-action="sourcePlaybackAction"
          :compact-empty="compact && sourceRowPicker"
          @activate="activateSource"
        />
        <div
          v-show="sourceRowPicker"
          ref="sourcePickerHost"
          class="bgm-player__source-picker"
        ></div>
        <div
          v-if="variant === 'dock'"
          ref="cutHost"
          class="bgm-player__source-cut"
        ></div>
      </div>
      <div
        v-if="variant === 'dock'"
        class="bgm-player__audio-tab"
        :class="{ 'bgm-player__audio-tab--paired': hasSearchTab }"
      >
        <UiFolderTabShape :shape-id="tabShapeId" />
        <UiIconButton
          ref="disclosure"
          class="bgm-player__disclosure bgm-player__tab-button"
          :class="{
            'bgm-player__tab-button--lifted': hasSearchTab && drawerOpen,
            'bgm-player__tab-button--neutral': !dockOpen,
          }"
          :style="tabShapeStyle"
          :icon="SlidersHorizontal"
          :label="audioTabLabel"
          :aria-expanded="dockOpen"
          :aria-controls="controlsId"
          :aria-disabled="(dockForcedOpen && dockOpen) || undefined"
          :aria-hidden="(hasSearchTab && drawerOpen) || undefined"
          :tabindex="hasSearchTab && drawerOpen ? -1 : undefined"
          @click="toggleDock"
        />
      </div>
      <div
        v-if="variant === 'dock'"
        class="bgm-player__source-notice bgm-player__source-notice--resting"
        :class="{
          'bgm-player__source-notice--lifted': hasSearchTab && drawerOpen,
        }"
        role="status"
        aria-atomic="true"
      >
        <span v-if="sourceNoticeKey">{{ t(sourceNoticeKey) }}</span>
      </div>
      <div
        v-if="hasSearchTab"
        ref="searchTabHost"
        class="bgm-player__search-tab"
      ></div>
      <BgmPlayerTransport
        v-show="!emptyStandby"
        :compact="compact"
        :standby="selectedStandby"
        :status-visible="Boolean(statusLabel)"
        :inline-status="inlineStatus"
        :animate-fold="canFoldSelectedTrack && !hasSearchTab"
        :lift-tools="hasSearchTab"
        :tools-host="toolsHost"
        :cut-host="cutHost"
        :folded="canFoldSelectedTrack && !dockOpen"
        :combined-tools="variant === 'dock' && Boolean(currentTrack || error)"
        :footer-id="controlsId"
        :variant="variant"
        :phase="handoffState.phase"
        :audible-lane="handoffState.audibleLane"
        :current-track="currentTrack"
        :is-dimmed="deckState.isDimmed"
        :is-muted="settings.isMuted"
        :has-guide-vocal="canToggleGuideVocal"
        :guide-vocal-on="deckState.guideVocalOn"
        :dim-db="settings.dimDb"
        :volume="settings.volume"
        :seek-disabled="sourceHasChanged"
        :current-time="
          sourceHasChanged ? sourceSwap.currentTime : deckState.currentTime
        "
        :duration="sourceHasChanged ? sourceSwap.duration : deckState.duration"
        @play="playBgm"
        @pause="pauseBgm"
        @cut="emergencyCut"
        @set-dimmed="setDimmed"
        @set-guide-vocal-on="setGuideVocalOn"
        @set-muted="setMuted"
        @preview-volume="previewVolume"
        @commit-volume="setVolume"
        @seek="seekBgm"
        @commit-position="commitBgmPosition"
        @expand-audio="dockExpanded = true"
      >
        <template #status>
          <span
            v-if="inlineStatus"
            class="bgm-player__status"
            :class="`bgm-player__status--${operationalStatus?.tone ?? 'muted'}`"
            :aria-label="statusAccessibleLabel"
            role="status"
            aria-live="polite"
          >
            <span>{{ inlineStatusLabel }}</span>
          </span>
          <UiTooltip v-else :text="statusAccessibleLabel">
            <template #trigger="{ triggerProps }">
              <span
                v-bind="triggerProps"
                class="bgm-player__status"
                :class="`bgm-player__status--${operationalStatus?.tone ?? 'muted'}`"
                :aria-label="statusAccessibleLabel"
                role="status"
                aria-live="polite"
              >
                <component
                  :is="operationalStatus.icon"
                  v-if="operationalStatus?.icon"
                  aria-hidden="true"
                />
                <span>{{ statusLabel }}</span>
              </span>
            </template>
          </UiTooltip>
        </template>
        <template #context>
          <Teleport :to="pickerHost" :disabled="!pickerHost">
            <UiPopover
              :open="drawerOpen"
              :peer-group="variant === 'dock' ? 'playback-tools' : undefined"
              :aria-label="
                t(
                  hasSearchTab && drawerSection === 'audio'
                    ? 'player.bgm.controls'
                    : 'player.bgm.change',
                )
              "
              placement="top-end"
              :focus-on-open="!hasSearchTab"
              :anchor-gap="hasSearchTab ? 0 : undefined"
              :viewport-inset="hasSearchTab ? 0 : undefined"
              :fit-anchor="hasSearchTab"
              :position-layout-element="hasSearchTab ? playerRoot : null"
              :related-pointer-region="hasSearchTab ? disclosure?.$el : null"
              :close-on-scroll="!hasSearchTab"
              :keep-mounted="hasSearchTab"
              :panel-style="{ inlineSize: 'var(--ui-bgm-player-inline-size)' }"
              scroll-axis="vertical"
              @close="handlePickerClose"
            >
              <template #trigger="{ triggerProps }">
                <UiIconButton
                  v-if="hasSearchTab"
                  ref="pickerButton"
                  class="bgm-player__search-tab-button bgm-player__tab-button"
                  :class="{
                    'bgm-player__tab-button--lifted': drawerOpen,
                  }"
                  :style="tabShapeStyle"
                  :icon="Search"
                  :label="t('bgm.search')"
                  :title="drawerOpen ? '' : undefined"
                  :aria-controls="triggerProps['aria-controls']"
                  :aria-haspopup="triggerProps['aria-haspopup']"
                  :aria-expanded="pickerExpanded"
                  :aria-hidden="drawerOpen || undefined"
                  :tabindex="drawerOpen ? -1 : undefined"
                  :active="pickerExpanded"
                  @click="togglePicker(triggerProps.ref)"
                />
                <UiButton
                  v-else
                  ref="pickerButton"
                  class="bgm-current-source__change"
                  :aria-controls="triggerProps['aria-controls']"
                  :aria-haspopup="triggerProps['aria-haspopup']"
                  :aria-expanded="pickerExpanded"
                  :active="pickerExpanded"
                  @click="togglePicker(triggerProps.ref)"
                  >{{
                    t(
                      currentTrack
                        ? 'player.bgm.changeShort'
                        : 'player.bgm.choose',
                    )
                  }}</UiButton
                >
              </template>
              <template v-if="hasSearchTab" #header>
                <div
                  v-if="sourceNoticeKey"
                  class="bgm-player__source-notice bgm-player__source-notice--drawer"
                  aria-hidden="true"
                >
                  <span>{{ t(sourceNoticeKey) }}</span>
                </div>
                <UiIconButton
                  ref="raisedAudioTab"
                  class="bgm-player__disclosure bgm-player__tab-button"
                  :class="{ 'bgm-player__tab-button--neutral': !dockOpen }"
                  :style="tabShapeStyle"
                  :icon="SlidersHorizontal"
                  :label="audioTabLabel"
                  title=""
                  :aria-expanded="dockOpen"
                  :aria-controls="controlsId"
                  :aria-disabled="(dockForcedOpen && dockOpen) || undefined"
                  @click="toggleDock"
                />
                <UiIconButton
                  ref="raisedSearchTab"
                  class="bgm-player__search-tab-button bgm-player__tab-button"
                  :class="{
                    'bgm-player__tab-button--neutral': !pickerExpanded,
                  }"
                  :style="tabShapeStyle"
                  :icon="Search"
                  :label="t(pickerExpanded ? 'bgm.closeSearch' : 'bgm.search')"
                  title=""
                  :aria-expanded="pickerExpanded"
                  @click="pickerExpanded ? closeSearchTab() : togglePicker()"
                />
              </template>
              <div
                v-if="hasSearchTab"
                v-show="drawerSection === 'audio'"
                ref="toolsHost"
                class="bgm-player__drawer-tools"
              ></div>
              <BgmTrackPicker
                v-show="!hasSearchTab || drawerSection === 'search'"
                ref="picker"
                class="bgm-player__picker"
                :class="{ 'bgm-player__picker--tab': hasSearchTab }"
                :search-query="searchQuery"
                :search-results="sourceSwap?.results ?? searchResults"
                :is-loading="library.isLoading"
                :is-saving="planState.isSaving"
                :error="
                  planState.validationError?.message ?? planState.error ?? ''
                "
                @update:search-query="searchQuery = $event"
                @select="changeTrack"
              />
            </UiPopover>
          </Teleport>
        </template>
      </BgmPlayerTransport>
    </div>
  </section>
</template>
<style scoped>
.bgm-player {
  container-type: inline-size;
  container-name: bgm-player;
  display: grid;
  gap: var(--ui-space-2);
  min-inline-size: 0;
  min-block-size: 0;
}
.bgm-player__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-3);
  min-inline-size: 0;
}
.bgm-player__source-row {
  display: flex;
  align-items: center;
  min-inline-size: 0;
}
.bgm-player__source-row :deep(.bgm-current-source) {
  flex: 1;
}
.bgm-player__source-cut {
  flex: none;
}
.bgm-player__source-cut :deep(.bgm-transport__cut) {
  margin-inline-start: var(--ui-space-1);
}
.bgm-player__source-picker {
  flex: none;
  margin-inline-end: var(--ui-space-1);
}
.bgm-current-source__change {
  flex: 0 0 auto;
  min-height: 0;
  padding-block: var(--ui-space-1);
}
.bgm-player--dock .bgm-player__main {
  --bgm-tab-width: calc(var(--ui-control-height) + var(--ui-space-3));
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-1);
  align-items: center;
}
.bgm-player--dock .bgm-player__source-row {
  grid-column: 1;
  grid-row: 1;
}
.bgm-player__source-notice {
  display: flex;
  align-items: center;
  block-size: var(--ui-control-height);
  min-inline-size: 0;
  pointer-events: none;
}
.bgm-player__source-notice--resting {
  grid-column: 1;
  grid-row: 1;
  z-index: var(--ui-layer-raised);
  align-self: start;
  justify-self: start;
  max-inline-size: calc(
    100% - var(--bgm-tab-width) * 2 - var(--ui-space-2) * 2
  );
  transform: translateY(
    calc(-100% - var(--ui-space-2) - var(--ui-border-width))
  );
}
.bgm-player__source-notice--drawer {
  margin-inline-end: auto;
}
.bgm-player__search-tab {
  grid-area: 1 / 1;
  align-self: start;
  justify-self: stretch;
  z-index: var(--ui-layer-raised);
  block-size: 0;
  margin-inline: calc(-1 * var(--ui-right-dock-content-inset));
  transform: translateY(
    calc(-1 * (var(--ui-space-2) + var(--ui-border-width)))
  );
}
.bgm-player__audio-tab {
  grid-area: 1 / 1;
  align-self: start;
  justify-self: end;
  z-index: var(--ui-layer-raised);
  display: flex;
  align-items: flex-end;
  block-size: 0;
  transform: translateY(
    calc(-1 * (var(--ui-space-2) + var(--ui-border-width)))
  );
}
.bgm-player__audio-tab--paired {
  margin-inline-end: calc(var(--bgm-tab-width) + var(--ui-space-2));
}
.bgm-player__search-tab :deep(.ui-popover__anchor) {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  block-size: 0;
  padding-inline: var(--ui-right-dock-content-inset);
}
.bgm-player__tab-button {
  --ui-color-surface-hover: transparent;
  --ui-color-surface-active: transparent;
  --ui-color-text: var(--ui-color-folder-primary-foreground);
  display: grid;
  min-inline-size: calc(var(--ui-control-height) + var(--ui-space-3));
  block-size: var(--ui-control-height);
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  place-items: center;
  color: var(--ui-color-folder-primary-foreground);
}
.bgm-player__tab-button::before {
  content: '';
  grid-area: 1 / 1;
  inline-size: 100%;
  block-size: 100%;
  background: var(--ui-color-folder-primary);
  clip-path: var(--ui-folder-tab-shape);
}
.bgm-player__tab-button :deep(.ui-icon-btn__icon) {
  grid-area: 1 / 1;
  z-index: var(--ui-layer-raised);
}
.bgm-player__tab-button,
.bgm-player__source-notice--resting {
  transition: opacity 0s linear var(--ui-motion-duration-standard);
}
.bgm-player__tab-button--lifted,
.bgm-player__source-notice--lifted {
  opacity: 0;
  pointer-events: none;
  transition-delay: 0s;
}
:global(.ui-popover:has(.bgm-player__picker--tab)) {
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform: translateY(0);
  clip-path: inset(0);
  transition:
    transform var(--ui-motion-duration-standard)
      var(--ui-motion-easing-reversible),
    clip-path var(--ui-motion-duration-standard)
      var(--ui-motion-easing-reversible),
    visibility 0s;
}
:global(.ui-popover:has(.bgm-player__picker--tab) > .ui-popover__header) {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding: 0 var(--ui-right-dock-content-inset);
}
:global(.ui-popover:has(.bgm-player__picker--tab) > .ui-popover__scroll) {
  border-inline: var(--ui-border-width) solid var(--ui-color-folder-primary);
  border-block-start: var(--ui-border-width) solid
    var(--ui-color-folder-primary);
  background: var(--ui-folder-sheet-background);
}
:global(.ui-popover:has(.bgm-player__picker--tab) .ui-popover__body) {
  display: flex;
  flex-direction: column;
  max-block-size: 100%;
  padding-block: var(--ui-space-2);
  padding-inline: calc(var(--ui-space-3) - var(--ui-border-width));
}
:global(.ui-popover[data-open='false']:has(.bgm-player__picker--tab)) {
  transform: translateY(calc(100% - var(--ui-control-height)));
  clip-path: inset(0 0 calc(100% - var(--ui-control-height)));
  transition-delay: 0s, 0s, var(--ui-motion-duration-standard);
}
:global(
  .ui-popover[data-open='false']:has(.bgm-player__picker--tab) .ui-popover__body
) {
  min-block-size: 100%;
}
@starting-style {
  :global(.ui-popover[data-open='true']:has(.bgm-player__picker--tab)) {
    transform: translateY(calc(100% - var(--ui-control-height)));
    clip-path: inset(0 0 calc(100% - var(--ui-control-height)));
  }
}
.bgm-player__source-notice > span {
  display: block;
  min-inline-size: 0;
  padding: var(--ui-space-1) var(--ui-space-2);
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bgm-player__tab-button--neutral {
  --ui-color-text: var(--ui-color-text-muted);
  color: var(--ui-color-text-muted);
}

.bgm-player__tab-button--neutral::before {
  background: var(--ui-color-border);
}

@container performance-session-workspace (max-width:28rem) {
  .bgm-player:not(.bgm-player--dock) .bgm-player__main {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }
}
.bgm-player__status {
  min-block-size: var(--ui-space-4);
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: var(--ui-space-1);
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  white-space: nowrap;
  -webkit-user-select: none;
  user-select: none;
}

.bgm-player__status > span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.bgm-player__status :deep(svg) {
  width: var(--ui-space-4);
  height: var(--ui-space-4);
  flex: 0 0 auto;
}

.bgm-player__status--current,
.bgm-player__status--accent {
  color: var(--ui-color-accent);
}

.bgm-player__status--warning {
  color: var(--ui-color-warning);
}

.bgm-player__status--danger {
  color: var(--ui-color-danger);
}
</style>
