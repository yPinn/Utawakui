<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  AudioWaveform,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trash2,
} from '../../icons/index.js';
import UiPopover from '../ui/UiPopover.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';
import { useLyricsWaveform } from '../../composables/lyrics/useLyricsWaveform.js';
import {
  waveformMarkers,
  waveformPath,
} from '../../utils/waveformPresentation.js';
import { formatDuration } from '../../utils/format.js';
const props = defineProps({
  trackId: { type: String, default: '' },
  sourceKey: { type: String, default: '' },
  document: { type: Object, default: null },
  offsetMs: { type: Number, default: 0 },
  positionMs: { type: Number, default: null },
});
const waveform = useLyricsWaveform({
  trackId: () => props.trackId,
  sourceKey: () => props.sourceKey,
});
const { open, overview, detail, status, tileIndex, clearing } = waveform;
const tilePreview = shallowRef(0);
watch([tileIndex, open], () => {
  tilePreview.value = tileIndex.value;
});
const formatTile = (value) => formatDuration(value * 10);
const maxTile = computed(() =>
  Math.max(0, Math.ceil((overview.value?.durationSec ?? 0) / 10) - 1),
);
const fromMs = computed(() => tileIndex.value * 10000);
const toMs = computed(() =>
  Math.min(fromMs.value + 10000, (overview.value?.durationSec ?? 0) * 1000),
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
  Number.isFinite(props.positionMs) &&
  props.positionMs >= fromMs.value &&
  props.positionMs <= toMs.value
    ? ((props.positionMs - fromMs.value) / (toMs.value - fromMs.value)) * 640
    : null,
);
const overviewPath = computed(() =>
  overview.value ? waveformPath(overview.value) : '',
);
const detailPath = computed(() =>
  detail.value ? waveformPath(detail.value) : '',
);
const statusLabel = computed(
  () =>
    ({
      idle: '尚未建立波形',
      loading: '讀取波形…',
      'gate-disabled': '請先在設定啟用音訊處理功能。',
      'decoder-unavailable': '請先在設定準備 FFmpeg。',
      'source-stale': '原媒體已變更，請重新讀取。',
      unsupported: '此媒體超出波形支援範圍。',
      busy: '音訊工作正在收尾，請稍後再試。',
      cancelled: '讀取已取消',
      unavailable: '波形目前無法使用',
      timeout: '讀取逾時，請重試。',
    })[status.value] ?? '',
);
function selectTile(value) {
  const tile = Number(value);
  if (Number.isInteger(tile) && tile >= 0 && tile <= maxTile.value)
    void waveform.selectTile(tile);
}
</script>
<template>
  <UiPopover
    :open="open"
    aria-label="原音訊波形"
    placement="bottom-end"
    focus-on-open
    :close-on-scroll="false"
    :panel-style="{ width: 'min(32rem, calc(100vw - 2rem))' }"
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
    <div class="lyrics-waveform">
      <div class="lyrics-waveform__heading">
        <strong>原音訊波形</strong>
        <UiIconButton
          :icon="Trash2"
          label="清除波形快取"
          :aria-disabled="clearing"
          @click="waveform.clear"
        />
        <UiIconButton
          :icon="RefreshCw"
          label="重新讀取波形"
          :disabled="clearing"
          @click="waveform.reload"
        />
      </div>
      <UiHint>振幅參考 · 直線為已保存句首，不代表對時已確認</UiHint>
      <UiHint v-if="statusLabel" role="status">{{ statusLabel }}</UiHint>
      <template v-if="overview">
        <svg
          class="lyrics-waveform__overview"
          viewBox="0 0 640 64"
          preserveAspectRatio="none"
          role="img"
          aria-label="全曲原音訊振幅"
        >
          <path :d="overviewPath" />
          <rect
            :x="(fromMs / (overview.durationSec * 1000)) * 640"
            y="0"
            :width="((toMs - fromMs) / (overview.durationSec * 1000)) * 640"
            height="64"
            class="lyrics-waveform__window"
          />
        </svg>
        <div class="lyrics-waveform__range">
          <UiIconButton
            :icon="ChevronLeft"
            label="前一段波形"
            :disabled="tileIndex === 0"
            @click="selectTile(tileIndex - 1)"
          />
          <span>{{ rangeLabel }}</span>
          <UiRangeControl
            v-model="tilePreview"
            class="lyrics-waveform__slider"
            :min="0"
            :max="maxTile"
            :step="1"
            :format-value="formatTile"
            :disabled="clearing"
            aria-label="波形顯示區段"
            @change="selectTile(tilePreview)"
          />
          <UiIconButton
            :icon="ChevronRight"
            label="下一段波形"
            :disabled="tileIndex === maxTile"
            @click="selectTile(tileIndex + 1)"
          />
        </div>
        <svg
          v-if="detail"
          class="lyrics-waveform__detail"
          viewBox="0 0 640 64"
          preserveAspectRatio="none"
          role="img"
          :aria-label="`${rangeLabel} 原音訊振幅與句首`"
        >
          <path :d="detailPath" />
          <line
            v-for="marker in markers.markers"
            :key="marker.id"
            :x1="marker.x"
            :x2="marker.x"
            y1="0"
            y2="64"
            class="lyrics-waveform__marker"
          />
          <line
            v-if="cursor !== null"
            :x1="cursor"
            :x2="cursor"
            y1="0"
            y2="64"
            class="lyrics-waveform__cursor"
          />
        </svg>
        <UiHint v-if="markers.outside"
          >{{ markers.outside }} 個句首在原媒體範圍外，未移動或改寫。</UiHint
        >
        <UiHint v-if="positionMs === null">播放所選曲目時顯示游標。</UiHint>
      </template>
    </div>
  </UiPopover>
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
.lyrics-waveform__range {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-variant-numeric: tabular-nums;
}
.lyrics-waveform__slider {
  flex: 1;
  min-width: 0;
}
.lyrics-waveform__overview,
.lyrics-waveform__detail {
  width: 100%;
  height: 5rem;
  background: var(--ui-color-surface-raised);
}
.lyrics-waveform__overview {
  height: 2.5rem;
}
.lyrics-waveform path {
  stroke: var(--ui-color-text-muted);
  stroke-width: 1;
}
.lyrics-waveform__window {
  fill: var(--ui-color-accent-soft);
  stroke: var(--ui-color-accent);
}
.lyrics-waveform__marker {
  stroke: var(--ui-color-accent);
  stroke-width: 1;
}
.lyrics-waveform__cursor {
  stroke: var(--ui-color-text);
  stroke-width: 2;
}
</style>
