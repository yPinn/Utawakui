<script setup>
import {
  computed,
  shallowRef,
  watch,
  onMounted,
  onBeforeUnmount,
  useId,
  useTemplateRef,
} from 'vue';
import {
  AudioWaveform,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trash2,
  Minus,
  Plus,
  X,
  GripVertical,
  LocateFixed,
  Ellipsis,
  Info,
  Play,
} from '../../icons/index.js';
import UiPopover from '../ui/UiPopover.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiKbd from '../ui/UiKbd.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiButton from '../ui/UiButton.vue';
import PanelViewButton from '../layout/PanelViewButton.vue';
import { usePanelViewTarget } from '../../composables/usePanelView.js';
import { useLyricsWaveformBoundaryDrag } from '../../composables/lyrics/useLyricsWaveformBoundaryDrag.js';
import { useLyricsWaveform } from '../../composables/lyrics/useLyricsWaveform.js';
import { useLyricsWaveformViewport } from '../../composables/lyrics/useLyricsWaveformViewport.js';
import { useLyricsWaveformClock } from '../../composables/lyrics/useLyricsWaveformClock.js';
import {
  waveformMarkers,
  waveformPath,
  waveformLineFocus,
  waveformGaps,
} from '../../utils/waveformPresentation.js';
import { formatDuration } from '../../utils/format.js';
import { isEditableTarget } from '../../utils/dom.js';
import { t } from '../../utils/i18n.js';
const props = defineProps({
  trackId: { type: String, default: '' },
  sourceKey: { type: String, default: '' },
  document: { type: Object, default: null },
  focusLineId: { type: String, default: '' },
  draftLine: { type: Object, default: null },
  timingDisabled: { type: Boolean, default: true },
  editContext: { type: Object, default: null },
  previewTiming: { type: Function, default: null },
  playbackTarget: { type: Object, default: null },
  offsetMs: { type: Number, default: 0 },
  positionMs: { type: Number, default: null },
  isPlaying: { type: Boolean, default: false },
  samplePlaybackClock: { type: Function, default: null },
});
const emit = defineEmits(['set-boundary', 'seek-line', 'play-line']);
const waveform = useLyricsWaveform({
  trackId: () => props.trackId,
  sourceKey: () => props.sourceKey,
});
const { open, overview, detail, adjacentDetail, status, clearing } = waveform;
const waveformPanel = useTemplateRef('waveformPanel');
const { position: playbackPosition, active: referenceActive } =
  useLyricsWaveformClock({
    open,
    trackId: () => props.trackId,
    positionMs: () => props.positionMs,
    isPlaying: () => props.isPlaying,
    sample: () => props.samplePlaybackClock?.(),
  });
const { maximized: panelMaximized } = usePanelViewTarget({
  id: 'waveform',
  element: () => waveformPanel.value?.closest('.ui-popover'),
  label: t('lyricsEditor.waveform.title'),
  overlay: true,
  enabled: () => open.value && referenceActive.value,
  context: () => props.sourceKey,
});
const {
  viewport,
  zoomIndex,
  zoomSpans,
  dragKind,
  startDrag,
  moveDrag,
  finishDrag,
  cancelDrag,
  zoom,
  navigate,
  moveOverviewWithKey,
  following,
  setFollowing,
} = useLyricsWaveformViewport({
  waveform,
  positionMs: playbackPosition,
  isPlaying: () => props.isPlaying,
  active: referenceActive,
});
const panelOffset = shallowRef({ x: 0, y: 0 });
const menuOpen = shallowRef(false),
  menuElement = shallowRef(null),
  showsHelp = shallowRef(false);
const clipId = `waveform-${useId().replaceAll(':', '')}`;
let panelDrag = null;
function resetPanelPosition() {
  boundaryDrag.cancel();
  panelDrag = null;
  panelOffset.value = { x: 0, y: 0 };
}
function movePanelBy(element, dx, dy) {
  const bounds = element.closest('.ui-popover')?.getBoundingClientRect();
  if (!bounds) return;
  panelOffset.value = {
    x:
      panelOffset.value.x +
      Math.max(
        8 - bounds.left,
        Math.min(dx, window.innerWidth - 8 - bounds.right),
      ),
    y:
      panelOffset.value.y +
      Math.max(
        8 - bounds.top,
        Math.min(dy, window.innerHeight - 8 - bounds.bottom),
      ),
  };
}
function beginPanelDrag(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  panelDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
}
function movePanel(event) {
  if (panelDrag?.id !== event.pointerId) return;
  movePanelBy(
    event.currentTarget,
    event.clientX - panelDrag.x,
    event.clientY - panelDrag.y,
  );
  panelDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
}
function endPanelDrag(event) {
  if (panelDrag?.id !== event.pointerId) return;
  panelDrag = null;
  if (event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId);
}
function movePanelWithKey(event) {
  const delta = {
    ArrowLeft: [-10, 0],
    ArrowRight: [10, 0],
    ArrowUp: [0, -10],
    ArrowDown: [0, 10],
  }[event.key];
  if (!delta) return;
  event.preventDefault();
  movePanelBy(event.currentTarget, ...delta);
}
onMounted(() =>
  globalThis.window?.addEventListener('resize', resetPanelPosition),
);
onBeforeUnmount(() =>
  globalThis.window?.removeEventListener('resize', resetPanelPosition),
);
watch(open, (value) => {
  if (!value) {
    resetPanelPosition();
    menuOpen.value = showsHelp.value = false;
  }
});
const fromMs = computed(() => viewport.value.fromMs);
const toMs = computed(() => viewport.value.toMs);
const controlsUnavailable = computed(() => clearing.value || !overview.value);
function zoomWithKey(event) {
  const direction = event.key === '=' ? 1 : event.key === '-' ? -1 : 0;
  if (
    !direction ||
    !open.value ||
    !referenceActive.value ||
    controlsUnavailable.value ||
    menuOpen.value ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.getModifierState?.('AltGraph') ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    isEditableTarget(event.target)
  )
    return false;
  event.preventDefault();
  event.stopPropagation();
  return zoom(direction);
}
const durationMs = computed(() => (overview.value?.durationSec ?? 0) * 1000);
const boundaryEditing = computed(() =>
  Boolean(
    open.value &&
    referenceActive.value &&
    overview.value &&
    !clearing.value &&
    !props.timingDisabled &&
    props.draftLine &&
    props.previewTiming,
  ),
);
const boundaryDrag = useLyricsWaveformBoundaryDrag({
  enabled: boundaryEditing,
  context: computed(() => [
    props.trackId,
    props.sourceKey,
    props.document,
    props.editContext,
    overview.value,
  ]),
  draft: () => props.draftLine,
  viewport,
  durationMs,
  offsetMs: () => props.offsetMs,
  preview: (kind, value) => props.previewTiming?.(kind, value),
  commit: (kind, value) => emit('set-boundary', { kind, value }),
  freeze: () => setFollowing(false),
});
const {
  previewLine: boundaryPreview,
  invalid: boundaryInvalid,
  active: boundaryDragging,
} = boundaryDrag;
watch(
  panelMaximized,
  () => {
    boundaryDrag.cancel();
    cancelDrag();
    if (panelDrag) {
      const target = waveformPanel.value?.querySelector(
        '.lyrics-waveform__move',
      );
      if (target)
        endPanelDrag({ pointerId: panelDrag.id, currentTarget: target });
    }
  },
  { flush: 'sync' },
);
const canNavigateLine = computed(() =>
  Boolean(
    open.value &&
    referenceActive.value &&
    overview.value &&
    !clearing.value &&
    !boundaryDragging.value &&
    props.playbackTarget,
  ),
);
function navigateLine(mode) {
  if (!canNavigateLine.value || !['seek', 'play'].includes(mode)) return false;
  emit(mode === 'seek' ? 'seek-line' : 'play-line');
  return true;
}
const overviewBox = computed(() =>
  durationMs.value > 0
    ? {
        x: (fromMs.value / durationMs.value) * 640,
        width: ((toMs.value - fromMs.value) / durationMs.value) * 640,
      }
    : { x: 0, width: 0 },
);
const tickStep = computed(() =>
  toMs.value - fromMs.value > 5000 ? 2000 : 1000,
);
const ticks = computed(() =>
  toMs.value > fromMs.value
    ? Array.from(
        {
          length: Math.max(
            0,
            Math.floor(toMs.value / tickStep.value) -
              Math.ceil(fromMs.value / tickStep.value) +
              1,
          ),
        },
        (_, index) => {
          const ms =
            (Math.ceil(fromMs.value / tickStep.value) + index) * tickStep.value;
          return {
            ms,
            x: ((ms - fromMs.value) / (toMs.value - fromMs.value)) * 640,
          };
        },
      )
    : [],
);
const rangeLabel = computed(
  () =>
    `${formatDuration(fromMs.value / 1000)}–${formatDuration(toMs.value / 1000)}`,
);
const markers = computed(() =>
  waveformMarkers(
    props.document,
    props.offsetMs,
    (overview.value?.durationSec ?? 0) * 1000,
    fromMs.value,
    toMs.value,
  ),
);
const cursor = computed(() =>
  Number.isFinite(playbackPosition.value) &&
  playbackPosition.value >= fromMs.value &&
  playbackPosition.value <= toMs.value &&
  toMs.value > fromMs.value
    ? ((playbackPosition.value - fromMs.value) / (toMs.value - fromMs.value)) *
      640
    : null,
);
const overviewCursor = computed(() =>
  durationMs.value > 0 &&
  Number.isFinite(playbackPosition.value) &&
  playbackPosition.value <= durationMs.value
    ? (playbackPosition.value / durationMs.value) * 640
    : null,
);
const playbackLabel = computed(() =>
  Number.isFinite(playbackPosition.value)
    ? formatDuration(playbackPosition.value / 1000)
    : '—',
);
const playbackStateLabel = computed(() =>
  playbackPosition.value === null
    ? t('lyricsEditor.waveform.unlinked')
    : cursor.value === null
      ? t('lyricsEditor.waveform.outOfView')
      : props.isPlaying
        ? t('lyricsEditor.waveform.playing')
        : t('lyricsEditor.waveform.paused'),
);
function playheadHead(x) {
  const left = Math.max(0, Math.min(616, x - 12));
  return `M${left},0H${left + 24}V4L${x},7L${left},4Z`;
}
function toggleFollowing() {
  return setFollowing(!following.value || cursor.value === null);
}
const overviewPath = computed(() =>
  overview.value ? waveformPath(overview.value) : '',
);
const summaries = computed(() =>
  [detail.value, adjacentDetail.value].filter(Boolean),
);
const hasDetail = computed(() => summaries.value.length > 0);
const detailPath = computed(() =>
  waveformPath(summaries.value, viewport.value),
);
const overviewEnergy = computed(() =>
  overview.value ? waveformPath(overview.value, null, 'rms') : '',
);
const detailEnergy = computed(() =>
  waveformPath(summaries.value, viewport.value, 'rms'),
);
const previewGaps = computed(() =>
  overview.value?.peaks ? waveformGaps(summaries.value, viewport.value) : [],
);
const previewPath = computed(() =>
  overview.value?.peaks && previewGaps.value.length
    ? waveformPath(overview.value, viewport.value)
    : '',
);
const previewEnergy = computed(() =>
  overview.value?.peaks && previewGaps.value.length
    ? waveformPath(overview.value, viewport.value, 'rms')
    : '',
);
const lineFocus = computed(() =>
  waveformLineFocus(
    props.document,
    props.focusLineId,
    boundaryPreview.value ?? props.draftLine,
    props.offsetMs,
    (overview.value?.durationSec ?? 0) * 1000,
    viewport.value,
  ),
);
const focusRegions = computed(() => {
  const focus = lineFocus.value;
  if (!focus) return [];
  const regions = [{ ...focus.saved, kind: 'saved' }];
  if (focus.changed) regions.push({ ...focus.draft, kind: 'draft' });
  return regions;
});
const focusedRange = computed(
  () => lineFocus.value?.draft ?? lineFocus.value?.saved,
);
const boundaryHandles = computed(() =>
  boundaryEditing.value
    ? ['start', 'end', 'move'].flatMap((kind) => {
        // Keep hit targets at the unchanged draft endpoints during a preview:
        // pointer capture owns the gesture; the solid range shows its candidate.
        const line = props.draftLine;
        const value =
          kind === 'move'
            ? line.endMs === null
              ? line.startMs
              : (line.startMs + line.endMs) / 2
            : line[kind === 'start' ? 'startMs' : 'endMs'];
        const media = value - props.offsetMs;
        const position =
          kind === 'move' && line.endMs !== null
            ? Math.max(fromMs.value, Math.min(toMs.value, media))
            : media;
        if (
          !boundaryDrag.available(kind) ||
          !Number.isFinite(value) ||
          (kind === 'move' && line.endMs !== null
            ? line.endMs - props.offsetMs < fromMs.value ||
              line.startMs - props.offsetMs > toMs.value
            : media < fromMs.value || media > toMs.value) ||
          media < 0 ||
          media > durationMs.value ||
          toMs.value <= fromMs.value
        )
          return [];
        return [
          {
            kind,
            label:
              kind === 'move'
                ? t('lyricsEditor.waveform.moveLine')
                : kind === 'start'
                  ? t('lyricsEditor.waveform.lineStart')
                  : t('lyricsEditor.waveform.lineEnd'),
            left: `clamp(0px, calc(${((position - fromMs.value) / (toMs.value - fromMs.value)) * 100}% - 12px), calc(100% - 24px))`,
          },
        ];
      })
    : [],
);
const hasFocusedRegion = computed(
  () => focusedRange.value?.x !== null && (focusedRange.value?.width ?? 0) > 0,
);
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'maintenance',
      items: [
        {
          id: 'reload',
          kind: 'action',
          label: t('lyricsEditor.waveform.reload'),
          icon: RefreshCw,
          disabled: clearing.value,
        },
        {
          id: 'clear',
          kind: 'action',
          label: t('lyricsEditor.waveform.clearCache'),
          icon: Trash2,
          disabled: clearing.value,
        },
      ],
    },
    {
      id: 'help',
      items: [
        {
          id: 'help',
          kind: 'action',
          label: showsHelp.value
            ? t('lyricsEditor.waveform.hideHelp')
            : t('lyricsEditor.waveform.help'),
          icon: Info,
        },
      ],
    },
  ],
}));
function openMenu(event) {
  menuElement.value = event.currentTarget;
  menuOpen.value = true;
}
function selectAction(item) {
  const action = menuContent.value.groups
    .flatMap((group) => group.items)
    .find((entry) => entry.id === item.id);
  if (!action || action.disabled) return;
  menuOpen.value = false;
  if (item.id === 'reload') void waveform.reload();
  else if (item.id === 'clear') void waveform.clear();
  else showsHelp.value = !showsHelp.value;
}
const canRetry = computed(
  () =>
    !clearing.value &&
    ['source-stale', 'busy', 'cancelled', 'unavailable', 'timeout'].includes(
      status.value,
    ),
);
const statusLabel = computed(() =>
  status.value === 'loading' && hasDetail.value
    ? ''
    : ({
        idle: t('lyricsEditor.waveform.status.idle'),
        loading: t('lyricsEditor.waveform.status.loading'),
        'gate-disabled': t('lyricsEditor.waveform.status.gateDisabled'),
        'decoder-unavailable': t(
          'lyricsEditor.waveform.status.decoderUnavailable',
        ),
        'source-stale': t('lyricsEditor.waveform.status.sourceStale'),
        unsupported: t('lyricsEditor.waveform.status.unsupported'),
        busy: t('lyricsEditor.waveform.status.busy'),
        cancelled: t('lyricsEditor.waveform.status.cancelled'),
        unavailable: t('lyricsEditor.waveform.status.unavailable'),
        timeout: t('lyricsEditor.waveform.status.timeout'),
      }[status.value] ?? ''),
);
const noticeLabel = computed(
  () =>
    (boundaryInvalid.value ? t('lyricsEditor.waveform.boundaryInvalid') : '') ||
    (previewPath.value
      ? status.value === 'loading'
        ? t('lyricsEditor.waveform.previewLoading')
        : statusLabel.value
          ? t('lyricsEditor.waveform.previewWithStatus', {
              status: statusLabel.value,
            })
          : t('lyricsEditor.waveform.preview')
      : statusLabel.value) ||
    [
      markers.value.outside
        ? t(
            'lyricsEditor.waveform.outsideCount',
            { count: markers.value.outside },
            markers.value.outside,
          )
        : '',
      playbackPosition.value === null || cursor.value === null
        ? playbackStateLabel.value
        : '',
    ]
      .filter(Boolean)
      .join(t('common.clauseSeparator')),
);
</script>
<template>
  <UiPopover
    :open="open"
    :aria-label="t('lyricsEditor.waveform.title')"
    placement="bottom-end"
    focus-on-open
    :close-on-scroll="false"
    :close-on-outside-pointer="false"
    :close-on-escape="!boundaryDragging && !panelMaximized"
    :maximized="panelMaximized"
    :panel-style="{
      width: 'min(32rem, calc(100vw - 2rem))',
      translate: `${panelOffset.x}px ${panelOffset.y}px`,
    }"
    @update:open="waveform.setOpen"
  >
    <template #trigger="{ triggerProps }">
      <UiIconButton
        v-bind="triggerProps"
        :icon="AudioWaveform"
        :label="t('lyricsEditor.waveform.title')"
        :active="open"
        :disabled="!trackId"
        @click="waveform.setOpen(!open)"
      />
    </template>
    <div
      ref="waveformPanel"
      class="lyrics-waveform"
      :class="{ 'lyrics-waveform--maximized': panelMaximized }"
      :aria-busy="status === 'loading'"
      @keydown="zoomWithKey"
    >
      <div class="lyrics-waveform__heading">
        <strong>{{ t('lyricsEditor.waveform.title') }}</strong>
        <UiIconButton
          class="lyrics-waveform__move"
          :icon="GripVertical"
          :label="t('lyricsEditor.waveform.move')"
          :disabled="panelMaximized"
          @pointerdown="beginPanelDrag"
          @pointermove="movePanel"
          @pointerup="endPanelDrag"
          @pointercancel="endPanelDrag"
          @lostpointercapture="endPanelDrag"
          @keydown="movePanelWithKey"
        />
        <PanelViewButton panel-id="waveform" />
        <UiIconButton
          :icon="X"
          :label="t('lyricsEditor.waveform.close')"
          @click="waveform.setOpen(false)"
        />
        <UiIconButton
          :icon="Ellipsis"
          :label="t('lyricsEditor.waveform.more')"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click="openMenu"
        />
      </div>
      <svg
        class="lyrics-waveform__overview"
        viewBox="0 0 640 64"
        preserveAspectRatio="none"
        role="slider"
        :tabindex="controlsUnavailable ? -1 : 0"
        :aria-label="t('lyricsEditor.waveform.overviewRange')"
        :aria-description="t('lyricsEditor.waveform.overviewHint')"
        :aria-valuemin="0"
        :aria-valuemax="Math.max(0, durationMs - (toMs - fromMs))"
        :aria-valuenow="fromMs"
        :aria-valuetext="rangeLabel"
        :aria-disabled="controlsUnavailable"
        :class="{ 'lyrics-waveform__dragging': dragKind === 'overview' }"
        @keydown="moveOverviewWithKey"
        @pointerdown="startDrag($event, 'overview')"
        @pointermove="moveDrag"
        @pointerup="finishDrag"
        @pointercancel="cancelDrag"
        @lostpointercapture="cancelDrag"
      >
        <defs>
          <clipPath :id="`${clipId}-overview`" clipPathUnits="userSpaceOnUse">
            <rect
              :x="overviewBox.x"
              y="0"
              :width="overviewBox.width"
              height="64"
            />
          </clipPath>
        </defs>
        <line
          x1="0"
          x2="640"
          y1="32"
          y2="32"
          class="lyrics-waveform__baseline"
        />
        <g class="lyrics-waveform__signal lyrics-waveform__signal--muted">
          <path :d="overviewPath" class="lyrics-waveform__peaks" />
          <path :d="overviewEnergy" class="lyrics-waveform__energy" />
        </g>
        <g
          class="lyrics-waveform__signal"
          :clip-path="`url(#${clipId}-overview)`"
        >
          <path :d="overviewPath" class="lyrics-waveform__peaks" />
          <path :d="overviewEnergy" class="lyrics-waveform__energy" />
        </g>
        <rect
          v-if="overview"
          :x="overviewBox.x"
          y="0"
          :width="overviewBox.width"
          height="64"
          class="lyrics-waveform__window"
        />
        <line
          v-if="overviewCursor !== null"
          :x1="overviewCursor"
          :x2="overviewCursor"
          y1="0"
          y2="64"
          class="lyrics-waveform__cursor"
        />
        <path
          v-if="overviewCursor !== null"
          :d="playheadHead(overviewCursor)"
          class="lyrics-waveform__cursor-head"
        />
      </svg>
      <div class="lyrics-waveform__zoom">
        <div class="lyrics-waveform__playback">
          <UiIconButton
            :icon="ChevronLeft"
            :label="t('lyricsEditor.waveform.previous')"
            :disabled="controlsUnavailable || fromMs === 0"
            @click="navigate(-1)"
          />
          <output
            role="timer"
            aria-live="off"
            :aria-label="t('lyricsEditor.waveform.position')"
            :aria-description="playbackStateLabel"
            >{{ playbackLabel }}</output
          >
          <UiIconButton
            :icon="ChevronRight"
            :label="t('lyricsEditor.waveform.next')"
            :disabled="controlsUnavailable || toMs >= durationMs"
            @click="navigate(1)"
          />
        </div>
        <UiIconButton
          :icon="LocateFixed"
          :label="t('lyricsEditor.waveform.follow')"
          :title="
            following && cursor !== null
              ? t('lyricsEditor.waveform.followOn')
              : t('lyricsEditor.waveform.followOff')
          "
          :active="following && playbackPosition !== null"
          :aria-pressed="following"
          :disabled="playbackPosition === null"
          @click="toggleFollowing"
        />
        <UiIconButton
          :icon="Minus"
          :label="t('lyricsEditor.waveform.zoomOut')"
          aria-keyshortcuts="-"
          :disabled="controlsUnavailable || zoomIndex === 0"
          @click="zoom(-1)"
        />
        <output :aria-label="t('lyricsEditor.waveform.zoom')"
          >{{ 10000 / zoomSpans[zoomIndex] }}×</output
        >
        <UiIconButton
          :icon="Plus"
          :label="t('lyricsEditor.waveform.zoomIn')"
          aria-keyshortcuts="="
          :disabled="controlsUnavailable || zoomIndex === zoomSpans.length - 1"
          @click="zoom(1)"
        />
      </div>
      <div class="lyrics-waveform__plot">
        <div class="lyrics-waveform__sentence">
          <template v-if="lineFocus">
            <span
              v-if="lineFocus.changed"
              class="lyrics-waveform__draft-label"
              >{{ t('lyricsEditor.waveform.draft') }}</span
            >
            <UiTooltip
              :text="lineFocus.text"
              :detail="
                focusedRange.inferredEnd
                  ? t('lyricsEditor.waveform.inferredEnd')
                  : ''
              "
            >
              <template #trigger="{ triggerProps }">
                <span
                  v-bind="triggerProps"
                  tabindex="0"
                  class="lyrics-waveform__sentence-text"
                  >{{ lineFocus.text }}</span
                >
              </template>
            </UiTooltip>
            <span v-if="focusedRange.unknownEnd">{{
              t('lyricsEditor.waveform.unknownEnd')
            }}</span>
            <span v-if="focusedRange.outside">{{
              t('lyricsEditor.waveform.outside')
            }}</span>
          </template>
          <span v-if="playbackTarget?.usesSeparatedAudio">{{
            t('lyricsEditor.waveform.mixed')
          }}</span>
          <UiIconButton
            :icon="LocateFixed"
            :label="t('lyricsEditor.waveform.seekStart')"
            :title="
              t(
                draftLine
                  ? 'lyricsEditor.waveform.seekDraftTitle'
                  : 'lyricsEditor.waveform.seekSavedTitle',
              )
            "
            :disabled="!canNavigateLine"
            @click="navigateLine('seek')"
          />
          <UiIconButton
            :icon="Play"
            :label="t('lyricsEditor.waveform.playFromStart')"
            :title="
              t(
                draftLine
                  ? playbackTarget?.usesSeparatedAudio
                    ? 'lyricsEditor.waveform.playDraftMix'
                    : 'lyricsEditor.waveform.playDraftOriginal'
                  : playbackTarget?.usesSeparatedAudio
                    ? 'lyricsEditor.waveform.playSavedMix'
                    : 'lyricsEditor.waveform.playSavedOriginal',
              )
            "
            :disabled="!canNavigateLine"
            @click="navigateLine('play')"
          />
        </div>
        <div class="lyrics-waveform__axis" aria-hidden="true">
          <span
            v-for="tick in ticks"
            :key="tick.ms"
            :style="{
              left: `${tick.x / 6.4}%`,
              transform:
                tick.x === 0
                  ? 'none'
                  : tick.x === 640
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }"
            >{{ formatDuration(tick.ms / 1000) }}</span
          >
        </div>
        <div class="lyrics-waveform__canvas">
          <svg
            class="lyrics-waveform__detail"
            viewBox="0 0 640 64"
            preserveAspectRatio="none"
            role="img"
            :aria-label="
              overview
                ? t('lyricsEditor.waveform.detailNamed', { range: rangeLabel })
                : t('lyricsEditor.waveform.detailEmpty')
            "
            :aria-description="t('lyricsEditor.waveform.detailHint')"
            :class="{ 'lyrics-waveform__dragging': dragKind === 'detail' }"
            @pointerdown="startDrag($event, 'detail')"
            @pointermove="moveDrag"
            @pointerup="finishDrag"
            @pointercancel="cancelDrag"
            @lostpointercapture="cancelDrag"
          >
            <defs v-if="previewGaps.length">
              <clipPath
                :id="`${clipId}-preview`"
                clipPathUnits="userSpaceOnUse"
              >
                <rect
                  v-for="gap in previewGaps"
                  :key="gap.x"
                  :x="gap.x"
                  :width="gap.width"
                  y="0"
                  height="64"
                />
              </clipPath>
            </defs>
            <defs v-if="hasFocusedRegion">
              <clipPath
                :id="`${clipId}-sentence`"
                clipPathUnits="userSpaceOnUse"
              >
                <rect
                  :x="focusedRange.x"
                  y="0"
                  :width="focusedRange.width"
                  height="64"
                />
              </clipPath>
            </defs>
            <rect
              v-if="hasFocusedRegion"
              :x="focusedRange.x"
              :width="focusedRange.width"
              y="0"
              height="64"
              class="lyrics-waveform__sentence-fill"
            />
            <line
              v-for="tick in ticks"
              :key="tick.ms"
              :x1="tick.x"
              :x2="tick.x"
              y1="0"
              y2="64"
              class="lyrics-waveform__grid"
            />
            <line
              x1="0"
              x2="640"
              y1="32"
              y2="32"
              class="lyrics-waveform__baseline"
            />
            <g
              v-if="previewGaps.length"
              class="lyrics-waveform__signal lyrics-waveform__signal--muted lyrics-waveform__preview"
              :clip-path="`url(#${clipId}-preview)`"
            >
              <path :d="previewPath" class="lyrics-waveform__peaks" />
              <path :d="previewEnergy" class="lyrics-waveform__energy" />
            </g>
            <g
              class="lyrics-waveform__signal"
              :class="{ 'lyrics-waveform__signal--muted': hasFocusedRegion }"
            >
              <path :d="detailPath" class="lyrics-waveform__peaks" />
              <path :d="detailEnergy" class="lyrics-waveform__energy" />
            </g>
            <g
              v-if="hasFocusedRegion"
              class="lyrics-waveform__signal lyrics-waveform__signal--selected"
              :clip-path="`url(#${clipId}-sentence)`"
            >
              <path :d="detailPath" class="lyrics-waveform__peaks" />
              <path :d="detailEnergy" class="lyrics-waveform__energy" />
            </g>
            <line
              v-for="marker in markers.markers"
              :key="marker.id"
              :x1="marker.x"
              :x2="marker.x"
              y1="0"
              y2="64"
              class="lyrics-waveform__marker"
            />
            <g
              v-for="region in focusRegions"
              :key="region.kind"
              class="lyrics-waveform__sentence-range"
              :class="`lyrics-waveform__sentence-range--${region.kind}`"
            >
              <path
                v-if="region.x !== null"
                :d="`M${region.x},1H${region.x + region.width}M${region.x},63H${region.x + region.width}`"
              />
              <line
                v-if="region.startX !== null"
                :x1="region.startX"
                :x2="region.startX"
                y1="0"
                y2="64"
              />
              <line
                v-if="region.endX !== null"
                :x1="region.endX"
                :x2="region.endX"
                y1="0"
                y2="64"
              />
            </g>
            <line
              v-if="cursor !== null"
              :x1="cursor"
              :x2="cursor"
              y1="0"
              y2="64"
              class="lyrics-waveform__cursor"
            />
            <path
              v-if="cursor !== null"
              :d="playheadHead(cursor)"
              class="lyrics-waveform__cursor-head"
            />
          </svg>
          <UiButton
            v-for="handle in boundaryHandles"
            :key="handle.kind"
            variant="accent"
            class="lyrics-waveform__boundary"
            :class="`lyrics-waveform__boundary--${handle.kind}`"
            :style="{ left: handle.left }"
            :aria-label="
              t('lyricsEditor.waveform.dragNamed', { label: handle.label })
            "
            :title="
              boundaryDragging
                ? ''
                : t('lyricsEditor.waveform.handleHint', { label: handle.label })
            "
            @pointerdown.stop="boundaryDrag.begin($event, handle.kind)"
            @pointermove.stop="boundaryDrag.move"
            @pointerup.stop="boundaryDrag.finish"
            @pointercancel.stop="boundaryDrag.cancel"
            @lostpointercapture.stop="boundaryDrag.cancel"
            @keydown="boundaryDrag.key($event, handle.kind)"
            >{{
              t(
                handle.kind === 'move'
                  ? 'lyricsEditor.waveform.handleMove'
                  : handle.kind === 'start'
                    ? 'lyricsEditor.waveform.handleStart'
                    : 'lyricsEditor.waveform.handleEnd',
              )
            }}</UiButton
          >
        </div>
        <div class="lyrics-waveform__notice">
          <UiTooltip :text="noticeLabel" :disabled="!noticeLabel">
            <template #trigger="{ triggerProps }">
              <span
                v-bind="triggerProps"
                :tabindex="noticeLabel ? 0 : -1"
                class="lyrics-waveform__notice-text"
                role="status"
                >{{ noticeLabel }}</span
              >
            </template>
          </UiTooltip>
          <UiIconButton
            v-if="canRetry"
            :icon="RefreshCw"
            :label="t('lyricsEditor.waveform.reload')"
            @click="waveform.reload"
          />
        </div>
      </div>
      <div v-if="showsHelp" class="lyrics-waveform__help">
        <UiHint class="lyrics-waveform__shortcuts">
          <span>{{ t('lyricsEditor.waveform.panelKeys') }}</span
          ><UiKbd>=</UiKbd
          ><span>{{ t('lyricsEditor.waveform.zoomInKey') }}</span>
          <UiKbd>-</UiKbd
          ><span>{{ t('lyricsEditor.waveform.zoomOutKey') }}</span>
          <UiKbd :aria-label="t('lyricsEditor.waveform.backquote')">`</UiKbd
          ><span>{{ t('lyricsEditor.waveform.maximize') }}</span>
        </UiHint>
        <UiHint>{{ t('lyricsEditor.waveform.referenceOnly') }}</UiHint>
        <div class="lyrics-waveform__legend">
          <span class="lyrics-waveform__legend-marker">{{
            t('lyricsEditor.waveform.savedBoundary')
          }}</span>
          <span class="lyrics-waveform__legend-draft">{{
            t('lyricsEditor.waveform.draftBoundary')
          }}</span>
          <span class="lyrics-waveform__legend-cursor">{{
            t('lyricsEditor.waveform.cursor')
          }}</span>
        </div>
      </div>
    </div>
  </UiPopover>
  <UiActionMenu
    :open="menuOpen"
    :anchor="{ kind: 'element', element: menuElement }"
    :content="menuContent"
    :aria-label="t('lyricsEditor.waveform.actions')"
    @select="selectAction"
    @close="menuOpen = false"
  />
</template>
<style scoped>
.lyrics-waveform {
  display: grid;
  gap: var(--ui-space-2);
  min-width: 0;
}
.lyrics-waveform__heading {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}
.lyrics-waveform__heading strong {
  flex: 1;
}
.lyrics-waveform__zoom {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}
.lyrics-waveform__zoom output {
  min-inline-size: 3ch;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--ui-color-text);
}
.lyrics-waveform__playback {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  margin-inline-end: auto;
  min-width: 0;
  white-space: nowrap;
}
.lyrics-waveform__playback output {
  inline-size: 7ch;
  flex: none;
  color: var(--ui-color-warning);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-font-weight-semibold);
}
.lyrics-waveform__overview,
.lyrics-waveform__detail {
  width: 100%;
  display: block;
  height: 7rem;
  background: var(--ui-color-surface-raised);
}
.lyrics-waveform__overview {
  height: 2.5rem;
}
.lyrics-waveform__peaks {
  stroke: var(--ui-color-accent);
  stroke-opacity: 0.4;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.lyrics-waveform__energy {
  stroke: var(--ui-color-accent);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.lyrics-waveform__signal {
  pointer-events: none;
}
.lyrics-waveform__signal--muted .lyrics-waveform__peaks {
  stroke: var(--ui-color-text-muted);
  stroke-opacity: 0.22;
}
.lyrics-waveform__signal--muted .lyrics-waveform__energy {
  stroke: var(--ui-color-text-muted);
  stroke-opacity: 0.4;
}
.lyrics-waveform__sentence-fill {
  fill: var(--ui-color-accent-soft);
  pointer-events: none;
}
.lyrics-waveform__sentence {
  block-size: var(--ui-control-height);
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin-block-end: var(--ui-space-2);
  font-size: var(--ui-type-caption-size);
  color: var(--ui-color-text-muted);
  white-space: nowrap;
}
.lyrics-waveform__sentence-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ui-color-text);
}
.lyrics-waveform__sentence-range {
  fill: none;
  stroke: var(--ui-color-accent);
  stroke-width: 2;
  stroke-dasharray: 4 3;
  pointer-events: none;
}
.lyrics-waveform__sentence-range path,
.lyrics-waveform__sentence-range line {
  vector-effect: non-scaling-stroke;
}
.lyrics-waveform__sentence-range--draft {
  stroke-dasharray: none;
}
.lyrics-waveform__draft-label {
  color: var(--ui-color-accent);
  font-weight: var(--ui-font-weight-semibold);
}
.lyrics-waveform__canvas {
  position: relative;
  block-size: 7rem;
}
.lyrics-waveform--maximized .lyrics-waveform__canvas {
  block-size: clamp(7rem, 35vh, 24rem);
}
.lyrics-waveform--maximized .lyrics-waveform__detail {
  height: 100%;
}
.lyrics-waveform__canvas .lyrics-waveform__boundary {
  position: absolute;
  inline-size: 24px;
  min-block-size: 24px;
  block-size: 24px;
  padding: 0;
  justify-content: center;
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
  font-size: var(--ui-type-caption-size);
}
.lyrics-waveform__boundary--start {
  top: 0;
}
.lyrics-waveform__boundary--end {
  bottom: 0;
}
.lyrics-waveform__boundary--move {
  top: calc(50% - 12px);
}
.lyrics-waveform__notice {
  block-size: 2rem;
  margin-block-start: var(--ui-space-2);
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}
.lyrics-waveform__notice-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lyrics-waveform__help {
  display: grid;
  gap: var(--ui-space-2);
  padding-block-start: var(--ui-space-2);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.lyrics-waveform__shortcuts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}
.lyrics-waveform__grid,
.lyrics-waveform__baseline {
  stroke: var(--ui-color-border);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.lyrics-waveform__window {
  fill: var(--ui-color-accent-soft);
  fill-opacity: 0.15;
  stroke: var(--ui-color-accent);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.lyrics-waveform__overview:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
.lyrics-waveform__marker {
  stroke: var(--ui-color-text-muted);
  stroke-opacity: 0.5;
  stroke-width: 1;
  stroke-dasharray: 4 3;
  vector-effect: non-scaling-stroke;
}
.lyrics-waveform__cursor {
  stroke: var(--ui-color-warning);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
.lyrics-waveform__cursor-head {
  fill: var(--ui-color-warning);
  stroke: var(--ui-color-surface-raised);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
.lyrics-waveform__axis {
  position: relative;
  block-size: 1.5rem;
  margin-block-end: var(--ui-space-1);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  font-size: var(--ui-type-caption-size);
  font-variant-numeric: tabular-nums;
  color: var(--ui-color-text-muted);
}
.lyrics-waveform__axis span {
  position: absolute;
  white-space: nowrap;
}
.lyrics-waveform__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}
.lyrics-waveform__legend span {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
}
.lyrics-waveform__legend span::before {
  content: '';
  inline-size: 1rem;
  border-block-start: var(--ui-border-width) dashed var(--ui-color-text);
}
.lyrics-waveform__legend .lyrics-waveform__legend-cursor::before {
  border-block-start: var(--ui-border-width) solid var(--ui-color-warning);
}
.lyrics-waveform__legend .lyrics-waveform__legend-draft::before {
  border-block-start: var(--ui-border-width-strong) solid var(--ui-color-accent);
}
.lyrics-waveform__move {
  cursor: move;
  touch-action: none;
}
.lyrics-waveform__overview,
.lyrics-waveform__detail {
  cursor: grab;
  touch-action: none;
}
.lyrics-waveform__dragging {
  cursor: grabbing;
}
</style>
