<script setup>
import { computed, provide, shallowRef, useId } from 'vue';
import { UI_OVERLAY_HOST_KEY } from '../../composables/useUiOverlayHost.js';
import {
  RIGHT_DOCK_WIDTH_MAX,
  RIGHT_DOCK_WIDTH_MIN,
} from '../../composables/useAppRightDockWidth.js';
import UiButton from '../ui/UiButton.vue';
import UiNotificationHost from '../ui/UiNotificationHost.vue';

const previewId = `notice-preview-${useId()}`;
provide(UI_OVERLAY_HOST_KEY, `#${previewId}`);
const width = shallowRef(RIGHT_DOCK_WIDTH_MAX);
const items = shallowRef([]);
const outcome = shallowRef('');
let sequence = 0;
const stageStyle = computed(() => ({
  '--demo-notification-width': `${width.value}px`,
}));
const examples = [
  {
    lifecycle: 'transient',
    variant: 'result',
    label: '短暫通知',
    tone: 'success',
    title: '設定已儲存',
    message: '下次開啟時會套用目前的設定。',
  },
  {
    lifecycle: 'persistent',
    variant: 'recovery',
    label: '持續通知',
    tone: 'danger',
    title: '部分內容未能載入',
    message: '可在錯誤紀錄中查看詳細資訊。',
    actionLabel: '查看錯誤紀錄',
  },
  {
    lifecycle: 'progress',
    variant: 'progress',
    label: '進度通知',
    tone: 'info',
    title: '正在準備輸出',
    message: '隱藏通知不會取消準備工作。',
    progress: 45,
  },
  {
    lifecycle: 'persistent',
    variant: 'confirmation',
    label: '確認通知',
    tone: 'warning',
    title: '這次變更只保留於目前工作階段',
    message: '重新開啟後會恢復原本設定。',
  },
];

function show(example) {
  items.value = [
    {
      ...example,
      id: `notice-example-${++sequence}`,
      dismissible: true,
      announcement: 'polite',
    },
  ];
  outcome.value = '';
}
function dismiss({ id, reason }) {
  const item = items.value.find((entry) => entry.id === id);
  items.value = items.value.filter((entry) => entry.id !== id);
  outcome.value =
    reason === 'timeout'
      ? '短暫通知已自動關閉。'
      : item?.lifecycle === 'progress'
        ? '通知已隱藏；準備工作繼續。'
        : '通知已關閉。';
}
function act() {
  outcome.value = '這是展示操作；正式通知會開啟錯誤紀錄。';
}
</script>

<template>
  <section class="demo-notification-recipe" data-notification-recipe="fixed">
    <h5>正式固定通知</h5>
    <p>與右側區塊共用寬度，右側及播放器上方保留相同邊距。</p>
    <div class="demo-notification-recipe__controls" aria-label="固定通知寬度">
      <UiButton
        v-for="size in [RIGHT_DOCK_WIDTH_MIN, RIGHT_DOCK_WIDTH_MAX]"
        :key="size"
        variant="secondary"
        :active="width === size"
        :aria-pressed="width === size"
        @click="width = size"
        >{{ size }}px</UiButton
      >
    </div>
    <div class="demo-notification-recipe__controls" aria-label="通知範例">
      <UiButton
        v-for="example in examples"
        :key="example.variant"
        variant="secondary"
        @click="show(example)"
        >{{ example.label }}</UiButton
      >
    </div>
    <p>
      短暫結果在 6
      秒後關閉；游標停留、鍵盤焦點或視窗隱藏時暫停。持續與進度通知不倒數。
    </p>
    <p>
      操作依通知用途顯示；純結果與進度不預設按鈕，需要處理時提供對應操作，確認通知才顯示「知道了」。可用滑鼠、觸控或筆左右滑動；通知取得焦點後也可按
      Escape
      關閉。可以立即再試時，唯一操作優先使用「重試」；沒有更直接的處理方式時，才提供「查看錯誤紀錄」。
    </p>
    <p>
      按住內容先移動 12px 才開始拖曳；之後移動通知寬度的 35%
      並放開才關閉，途中可拉回取消。通知只在原框內移動，不會甩入其他操作區。
    </p>
    <div class="demo-notification-recipe__viewport" :style="stageStyle">
      <div class="demo-notification-recipe__dock" aria-hidden="true">
        右側區塊對齊範圍
      </div>
      <div class="demo-notification-recipe__player" aria-hidden="true">
        播放器範圍
      </div>
      <div :id="previewId" class="demo-notification-recipe__overlay" />
      <UiNotificationHost
        :items="items"
        :inline-size="width"
        @dismiss="dismiss"
        @action="act"
      />
    </div>
    <p class="demo-notification-recipe__outcome" role="status">{{ outcome }}</p>
  </section>
</template>

<style scoped>
.demo-notification-recipe {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
}
.demo-notification-recipe h5,
.demo-notification-recipe p {
  margin: 0;
}
.demo-notification-recipe h5 {
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
}
.demo-notification-recipe p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
.demo-notification-recipe__controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.demo-notification-recipe__viewport {
  position: relative;
  contain: layout;
  min-inline-size: 0;
  block-size: 26rem;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-canvas);
}
.demo-notification-recipe__dock {
  position: absolute;
  inset-inline-end: var(--ui-shell-edge-inset-inline);
  inset-block-start: var(--ui-shell-content-inset-block);
  inset-block-end: var(--ui-notification-block-end-offset);
  inline-size: min(
    var(--demo-notification-width),
    calc(100% - 2 * var(--ui-shell-edge-inset-inline))
  );
  padding: var(--ui-space-2);
  border: var(--ui-border-width) dashed var(--ui-color-border-strong);
  border-radius: var(--ui-radius-lg);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}
.demo-notification-recipe__player {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  block-size: var(--ui-player-bar-height);
  display: grid;
  place-items: center;
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}
.demo-notification-recipe__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.demo-notification-recipe__overlay :deep(.ui-notification-host) {
  max-inline-size: calc(100% - 2 * var(--ui-notification-safe-inset));
  min-inline-size: 0;
}
.demo-notification-recipe__outcome {
  min-block-size: 1lh;
}
</style>
