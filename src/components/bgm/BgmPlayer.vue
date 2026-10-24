<script setup>
import {
  computed,
  nextTick,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import { ChevronDown, ChevronUp } from '../../icons/index.js';
import { useBgmSession } from '../../composables/useBgmSession.js';
import { useBgmStandbyPlan } from '../../composables/useBgmStandbyPlan.js';
import { useLibrary } from '../../composables/useLibrary.js';
import {
  projectBgmOperationalStatus,
  projectBgmPrimaryAction,
} from './bgmPresentation.js';
import BgmCurrentSource from './BgmCurrentSource.vue';
import BgmPlayerTransport from './BgmPlayerTransport.vue';
import BgmTrackPicker from './BgmTrackPicker.vue';
import UiButton from '../ui/UiButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTooltip from '../ui/UiTooltip.vue';
const props = defineProps({
  active: { type: Boolean, default: true },
  variant: {
    type: String,
    default: 'session',
    validator: (value) => ['session', 'dock'].includes(value),
  },
});
const dockExpanded = shallowRef(false);
const compact = computed(() => props.variant === 'dock' && !dockExpanded.value);
const controlsId = useId();
function toggleDock() {
  pickerExpanded.value = false;
  dockExpanded.value = !dockExpanded.value;
}
const {
  state,
  handoffState,
  deckState,
  currentTrack,
  settings,
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
const { state: library } = useLibrary();
const sourcePlaybackAction = computed(() =>
  props.variant === 'dock'
    ? projectBgmPrimaryAction({
        phase: handoffState.phase,
        hasTrack: Boolean(currentTrack.value),
      })
    : null,
);
function activateSource() {
  const action = sourcePlaybackAction.value;
  if (!action || action.disabled) return;
  if (action.intent === 'pause') pauseBgm();
  else playBgm();
}
const pickerExpanded = shallowRef(false),
  searchQuery = shallowRef('');
watch(
  () => props.active,
  (active) => {
    if (!active) pickerExpanded.value = false;
  },
);
const pickerButton = shallowRef(null);
const picker = useTemplateRef('picker');
function setPickerButton(element, registerTrigger) {
  pickerButton.value = element;
  registerTrigger(element);
}
const error = computed(
  () => state.error || handoffState.error || deckState.error || '',
);
const operationalStatus = computed(() =>
  projectBgmOperationalStatus({
    phase: handoffState.phase,
    restorePending: handoffState.restorePending,
    error: error.value,
  }),
);
const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!query) return [];
  return library.tracks
    .filter(
      (track) =>
        track.id !== planState.plan.currentTrackId &&
        [track.title, track.artist].some((value) =>
          String(value ?? '')
            .toLocaleLowerCase()
            .includes(query),
        ),
    )
    .slice(0, 8);
});
async function changeTrack(trackId) {
  const active = globalThis.document?.activeElement;
  const restoreFocus = Boolean(picker.value?.$el?.contains(active));
  if (await setTrack(trackId)) {
    searchQuery.value = '';
    pickerExpanded.value = false;
    await nextTick();
    if (
      restoreFocus &&
      (document.activeElement === active ||
        document.activeElement === document.body)
    )
      pickerButton.value?.$el?.focus();
  }
}
</script>
<template>
  <section
    v-show="active"
    class="bgm-player"
    :class="{
      'bgm-player--dock': variant === 'dock',
      'bgm-player--compact': compact,
    }"
    :aria-label="variant === 'dock' ? '場間音樂快捷' : '場間音樂'"
  >
    <div :id="controlsId" class="bgm-player__main">
      <BgmCurrentSource
        :track="currentTrack"
        :playback-action="sourcePlaybackAction"
        @activate="activateSource"
      />
      <BgmPlayerTransport
        :compact="compact"
        :variant="variant"
        :phase="handoffState.phase"
        :audible-lane="handoffState.audibleLane"
        :current-track="currentTrack"
        :is-dimmed="deckState.isDimmed"
        :is-muted="settings.isMuted"
        :dim-db="settings.dimDb"
        :volume="settings.volume"
        :current-time="deckState.currentTime"
        :duration="deckState.duration"
        @play="playBgm"
        @pause="pauseBgm"
        @cut="emergencyCut"
        @set-dimmed="setDimmed"
        @set-muted="setMuted"
        @preview-volume="previewVolume"
        @commit-volume="setVolume"
        @seek="seekBgm"
        @commit-position="commitBgmPosition"
      >
        <template #context>
          <UiTooltip :text="operationalStatus.accessibleLabel">
            <template #trigger="{ triggerProps }">
              <span
                v-bind="triggerProps"
                class="bgm-player__status"
                :class="`bgm-player__status--${operationalStatus.tone}`"
                :aria-label="operationalStatus.accessibleLabel"
                role="status"
                aria-live="polite"
              >
                <component
                  :is="operationalStatus.icon"
                  v-if="operationalStatus.icon"
                  aria-hidden="true"
                />
                <span>{{ operationalStatus.label }}</span>
              </span>
            </template>
          </UiTooltip>
          <UiPopover
            v-model:open="pickerExpanded"
            aria-label="更換場間音樂"
            placement="top-end"
            focus-on-open
            :panel-style="{ inlineSize: 'var(--ui-bgm-player-inline-size)' }"
            scroll-axis="vertical"
          >
            <template #trigger="{ triggerProps }">
              <UiButton
                v-bind="triggerProps"
                :ref="(element) => setPickerButton(element, triggerProps.ref)"
                class="bgm-current-source__change"
                :active="pickerExpanded"
                @click="pickerExpanded = !pickerExpanded"
                >{{ currentTrack ? '更換' : '選擇' }}</UiButton
              >
            </template>
            <BgmTrackPicker
              ref="picker"
              class="bgm-player__picker"
              :search-query="searchQuery"
              :search-results="searchResults"
              :is-loading="library.isLoading"
              :is-saving="planState.isSaving"
              :error="
                planState.validationError?.message ?? planState.error ?? ''
              "
              @update:search-query="searchQuery = $event"
              @select="changeTrack"
            />
          </UiPopover>
        </template>
      </BgmPlayerTransport>
    </div>
    <UiIconButton
      v-if="variant === 'dock'"
      class="bgm-player__disclosure"
      :icon="compact ? ChevronUp : ChevronDown"
      :label="
        compact
          ? `展開場間音樂${error ? `：${operationalStatus.accessibleLabel}` : ''}`
          : '收合場間音樂'
      "
      :intent="error ? 'danger' : 'neutral'"
      :aria-expanded="!compact"
      :aria-controls="controlsId"
      @click="toggleDock"
    />
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
.bgm-player__picker {
  max-block-size: calc(var(--ui-track-row-min-height) * 3 + var(--ui-space-7));
}
.bgm-current-source__change {
  flex: 0 0 auto;
  min-height: 0;
  padding-block: var(--ui-space-1);
}
.bgm-player__main :deep(.bgm-transport__context > .ui-popover__anchor) {
  flex: 0 0 auto;
}
.bgm-player--dock .bgm-player__main {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-1);
  align-items: center;
}
.bgm-player--dock {
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: var(--ui-space-1);
  align-items: end;
}
.bgm-player--dock .bgm-player__main {
  grid-column: 1 / -1;
  grid-row: 1;
}
.bgm-player--dock :deep(.bgm-current-source) {
  margin-inline-end: calc(var(--ui-icon-button-size-md) + var(--ui-space-1));
}
.bgm-player__disclosure {
  grid-column: 2;
  grid-row: 1;
  align-self: start;
  justify-self: end;
  margin-block-start: calc(
    (var(--ui-track-row-min-height) - var(--ui-icon-button-size-md)) / 2
  );
}
@container performance-session-workspace (max-width:28rem) {
  .bgm-player:not(.bgm-player--dock) .bgm-player__main {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }
}
.bgm-player__status {
  block-size: var(--ui-space-4);
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: var(--ui-space-1);
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  white-space: nowrap;
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
