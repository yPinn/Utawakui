<script setup>
import {
  computed,
  shallowRef,
  watch,
  onMounted,
  onBeforeUnmount,
  useId,
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
} from '../../icons/index.js';
import UiPopover from '../ui/UiPopover.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
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
const props = defineProps({
  trackId: { type: String, default: '' },
  sourceKey: { type: String, default: '' },
  document: { type: Object, default: null },
  focusLineId: { type: String, default: '' },
  draftLine: { type: Object, default: null },
  offsetMs: { type: Number, default: 0 },
  positionMs: { type: Number, default: null },
  isPlaying: { type: Boolean, default: false },
  samplePlaybackClock: { type: Function, default: null },
});
const waveform = useLyricsWaveform({
  trackId: () => props.trackId,
  sourceKey: () => props.sourceKey,
});
const { open, overview, detail, adjacentDetail, status, clearing } = waveform;
const { position: playbackPosition, active: referenceActive } =
  useLyricsWaveformClock({
    open,
    trackId: () => props.trackId,
    positionMs: () => props.positionMs,
    isPlaying: () => props.isPlaying,
    sample: () => props.samplePlaybackClock?.(),
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
const durationMs = computed(() => (overview.value?.durationSec ?? 0) * 1000);
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
    ? '未連結播放'
    : cursor.value === null
      ? '檢視範圍外'
      : props.isPlaying
        ? '播放中'
        : '已暫停',
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
    props.draftLine,
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
          label: '重新讀取波形',
          icon: RefreshCw,
          disabled: clearing.value,
        },
        {
          id: 'clear',
          kind: 'action',
          label: '清除波形快取',
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
          label: showsHelp.value ? '隱藏波形說明' : '波形說明',
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
        idle: '尚未建立波形',
        loading: '讀取波形…',
        'gate-disabled': '請先在設定啟用音訊處理功能。',
        'decoder-unavailable': '請先在設定準備 FFmpeg。',
        'source-stale': '曲庫或原媒體已更新，請重新讀取。',
        unsupported: '此媒體超出波形支援範圍。',
        busy: '音訊工作正在收尾，請稍後再試。',
        cancelled: '讀取已取消',
        unavailable: '波形目前無法使用',
        timeout: '讀取逾時，請重試。',
      }[status.value] ?? ''),
);
const noticeLabel = computed(
  () =>
    (previewPath.value
      ? status.value === 'loading'
        ? '概覽預覽，正在讀取細節…'
        : ['概覽預覽', statusLabel.value].filter(Boolean).join('；')
      : statusLabel.value) ||
    [
      markers.value.outside
        ? `${markers.value.outside} 個句首在原媒體範圍外，未移動或改寫。`
        : '',
      playbackPosition.value === null || cursor.value === null
        ? playbackStateLabel.value
        : '',
    ]
      .filter(Boolean)
      .join('；'),
);
</script>
<template>
  <UiPopover
    :open="open"
    aria-label="原音訊波形"
    placement="bottom-end"
    focus-on-open
    :close-on-scroll="false"
    :close-on-outside-pointer="false"
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
        label="原音訊波形"
        :active="open"
        :disabled="!trackId"
        @click="waveform.setOpen(!open)"
      />
    </template>
    <div class="lyrics-waveform" :aria-busy="status === 'loading'">
      <div class="lyrics-waveform__heading">
        <strong>原音訊波形</strong>
        <UiIconButton
          class="lyrics-waveform__move"
          :icon="GripVertical"
          label="移動波形面板"
          @pointerdown="beginPanelDrag"
          @pointermove="movePanel"
          @pointerup="endPanelDrag"
          @pointercancel="endPanelDrag"
          @lostpointercapture="endPanelDrag"
          @keydown="movePanelWithKey"
        />
        <UiIconButton
          :icon="X"
          label="關閉原音訊波形"
          @click="waveform.setOpen(false)"
        />
        <UiIconButton
          :icon="Ellipsis"
          label="更多波形操作"
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
        aria-label="全曲波形檢視區間"
        aria-description="左右拖曳移動檢視；方向鍵逐視窗，Home／End 到兩端，PageUp／Down 跨五個視窗。不更動播放位置。"
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
            label="前一段波形"
            :disabled="controlsUnavailable || fromMs === 0"
            @click="navigate(-1)"
          />
          <output
            role="timer"
            aria-live="off"
            aria-label="目前播放位置"
            :aria-description="playbackStateLabel"
            >{{ playbackLabel }}</output
          >
          <UiIconButton
            :icon="ChevronRight"
            label="下一段波形"
            :disabled="controlsUnavailable || toMs >= durationMs"
            @click="navigate(1)"
          />
        </div>
        <UiIconButton
          :icon="LocateFixed"
          label="跟隨播放"
          :title="
            following && cursor !== null
              ? '跟隨已啟用；按一下固定檢視'
              : '回到目前位置並跟隨播放'
          "
          :active="following && playbackPosition !== null"
          :aria-pressed="following"
          :disabled="playbackPosition === null"
          @click="toggleFollowing"
        />
        <UiIconButton
          :icon="Minus"
          label="縮小波形"
          :disabled="controlsUnavailable || zoomIndex === 0"
          @click="zoom(-1)"
        />
        <output aria-label="波形放大倍率"
          >{{ 10000 / zoomSpans[zoomIndex] }}×</output
        >
        <UiIconButton
          :icon="Plus"
          label="放大波形"
          :disabled="controlsUnavailable || zoomIndex === zoomSpans.length - 1"
          @click="zoom(1)"
        />
      </div>
      <div class="lyrics-waveform__plot">
        <div class="lyrics-waveform__sentence">
          <template v-if="lineFocus">
            <span v-if="lineFocus.changed" class="lyrics-waveform__draft-label"
              >草稿</span
            >
            <UiTooltip
              :text="lineFocus.text"
              :detail="focusedRange.inferredEnd ? '句尾由下一句起點推定。' : ''"
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
            <span v-if="focusedRange.unknownEnd">句尾未定</span>
            <span v-if="focusedRange.outside">超出原媒體</span>
          </template>
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
                ? `${rangeLabel} 原音訊峰值、能量與句級範圍`
                : '原音訊波形，尚無可用摘要'
            "
            aria-description="可左右拖移瀏覽，不修改播放位置或句級時間。"
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
            label="重新讀取波形"
            @click="waveform.reload"
          />
        </div>
      </div>
      <div v-if="showsHelp" class="lyrics-waveform__help">
        <UiHint
          >淺色為峰值，深色為 RMS
          能量；保留原音訊，不代表人聲或對時確認。</UiHint
        >
        <div class="lyrics-waveform__legend">
          <span class="lyrics-waveform__legend-marker">已存句界</span>
          <span class="lyrics-waveform__legend-draft">草稿句界</span>
          <span class="lyrics-waveform__legend-cursor">播放位置</span>
        </div>
      </div>
    </div>
  </UiPopover>
  <UiActionMenu
    :open="menuOpen"
    :anchor="{ kind: 'element', element: menuElement }"
    :content="menuContent"
    aria-label="波形操作"
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
  block-size: 1.5rem;
  display: flex;
  align-items: baseline;
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
  outline: 2px solid var(--ui-color-focus);
  outline-offset: 2px;
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
  border-block-start: 2px solid var(--ui-color-accent);
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
