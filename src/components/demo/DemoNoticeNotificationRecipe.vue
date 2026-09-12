<script setup>
import { computed, shallowRef } from 'vue';
import DemoCandidateButton from './DemoCandidateButton.vue';
import DemoCandidateNotificationHost from './DemoCandidateNotificationHost.vue';

const props = defineProps({
  layer: {
    type: Object,
    required: true,
  },
});

const lifecycleOptions = [
  {
    key: 'transient',
    label: '短暫通知',
    description:
      '無操作的簡短結果可在 6 秒後自動關閉；游標停留、鍵盤焦點或視窗暫停時停止計時。',
    tone: 'success',
    title: '設定已儲存',
    message: '下次開啟時會套用目前的設定。',
    actionLabel: '',
    dismissible: true,
    announcement: 'polite',
  },
  {
    key: 'progress',
    label: '進度通知',
    description: '以同一項目更新，完成後再換成短暫通知。',
    tone: 'info',
    title: '正在準備輸出',
    message: '完成後即可開始使用。',
    actionLabel: '',
    dismissible: false,
    announcement: 'polite',
  },
  {
    key: 'persistent',
    label: '持續通知',
    description: '需要處理或保留操作時不會自動關閉。',
    tone: 'danger',
    title: '部分內容未能載入',
    message: '可在錯誤紀錄中查看詳細資訊。',
    actionLabel: '查看錯誤紀錄',
    dismissible: false,
    announcement: 'urgent',
  },
];

const selectedLifecycle = shallowRef('persistent');
const notificationVisible = shallowRef(true);
const notificationSequence = shallowRef(1);
const actionOutcome = shallowRef('');
const activeOption = computed(() =>
  lifecycleOptions.find((option) => option.key === selectedLifecycle.value),
);

function notificationProps() {
  return props.layer.key === 'candidate'
    ? { density: 'standard', tone: 'success' }
    : { compact: false, tone: 'success' };
}

function showLifecycle(key) {
  selectedLifecycle.value = key;
  notificationSequence.value += 1;
  notificationVisible.value = true;
  actionOutcome.value = '';
}

function handleDismiss(reason) {
  notificationVisible.value = false;
  actionOutcome.value =
    reason === 'timeout' ? '短暫通知已自動關閉。' : '通知已關閉。';
}

function handleAction() {
  actionOutcome.value = `已選擇「${activeOption.value.actionLabel}」。`;
}
</script>

<template>
  <section class="demo-notification-recipe" data-notification-recipe="fixed">
    <header class="demo-notification-recipe__header">
      <div>
        <h5>固定通知尺寸</h5>
      </div>
      <p>
        {{
          layer.key === 'candidate'
            ? '候選內容放在建議的通知範圍內。'
            : '正式產品目前沒有固定通知容器；此框僅用來比較現行通知內容。'
        }}
      </p>
    </header>

    <div class="demo-notification-recipe__metrics" aria-label="固定通知寬度">
      <span>桌面下限 · 20rem／320 CSS px</span>
      <span>建議寬度 · 22rem／352 CSS px</span>
      <span>最大寬度 · 26rem／416 CSS px</span>
      <span>視窗邊距 · 兩側各 1rem</span>
    </div>

    <div
      v-if="layer.key === 'candidate'"
      class="demo-notification-recipe__policies"
    >
      <article v-for="option in lifecycleOptions" :key="option.key">
        <strong>{{ option.label }}</strong>
        <span>{{ option.description }}</span>
      </article>
    </div>

    <p v-if="layer.key === 'candidate'" class="demo-notification-recipe__note">
      通知類型不由顏色決定。可以立即再試時，唯一操作優先使用「重試」；沒有更直接的處理方式時，才提供「查看錯誤紀錄」。
    </p>

    <div
      v-if="layer.key === 'candidate'"
      class="demo-notification-recipe__controls"
      aria-label="切換通知類型"
    >
      <DemoCandidateButton
        v-for="option in lifecycleOptions"
        :key="option.key"
        variant="secondary"
        :active="selectedLifecycle === option.key"
        :aria-pressed="selectedLifecycle === option.key"
        @click="showLifecycle(option.key)"
      >
        {{ option.label }}
      </DemoCandidateButton>
    </div>

    <div class="demo-notification-recipe__viewport">
      <span class="demo-notification-recipe__viewport-label"
        >模擬應用程式視窗</span
      >
      <aside
        class="demo-notification-recipe__host"
        aria-label="固定通知尺寸範例"
      >
        <DemoCandidateNotificationHost
          v-if="layer.key === 'candidate' && notificationVisible"
          :notification-key="`${selectedLifecycle}-${notificationSequence}`"
          :lifecycle="activeOption.key"
          :duration-ms="6000"
          :dismissible="activeOption.dismissible"
          :announcement="activeOption.announcement"
          :tone="activeOption.tone"
          density="standard"
          :title="activeOption.title"
          :message="activeOption.message"
          :action-label="activeOption.actionLabel"
          data-notification-card="preferred"
          @dismiss="handleDismiss"
          @action="handleAction"
        />
        <component
          :is="layer.component"
          v-else-if="layer.key === 'current'"
          v-bind="notificationProps()"
          title="輸出設定已儲存"
          message="下次開啟輸出時會套用目前的版面與字幕設定。"
          data-notification-card="preferred"
        />
        <DemoCandidateButton
          v-else
          variant="secondary"
          @click="showLifecycle(selectedLifecycle)"
        >
          再次顯示通知
        </DemoCandidateButton>
      </aside>
    </div>

    <p
      v-if="layer.key === 'candidate' && actionOutcome"
      class="demo-notification-recipe__outcome"
      role="status"
    >
      {{ actionOutcome }}
    </p>

    <p class="demo-notification-recipe__note">
      {{
        layer.key === 'candidate'
          ? '位置、視窗邊距、堆疊、關閉與顯示時間由通知容器負責；高度隨內容增加，只有新出現或更新的訊息依事件急迫性宣告。'
          : '正式產品目前沒有固定通知容器；現行通知內容仍保留既有的自動 status 語意。'
      }}
    </p>
  </section>
</template>

<style scoped>
.demo-notification-recipe {
  --demo-notification-min-inline-size: 20rem;
  --demo-notification-preferred-inline-size: 22rem;
  --demo-notification-inline-size: var(
    --demo-notification-preferred-inline-size
  );
  --demo-notification-max-inline-size: 26rem;
  --demo-notification-safe-inset: var(--ui-space-4);

  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-4);
}

.demo-notification-recipe__header {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 0.72fr) minmax(15rem, 1fr);
  align-items: end;
  gap: var(--ui-space-4);
}

.demo-notification-recipe__header > div {
  display: grid;
  gap: var(--ui-space-1);
}

.demo-notification-recipe__viewport-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-notification-recipe h5,
.demo-notification-recipe p {
  margin: 0;
}

.demo-notification-recipe h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-title);
}

.demo-notification-recipe__header p,
.demo-notification-recipe__note,
.demo-notification-recipe__outcome,
.demo-notification-recipe__metrics {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-notification-recipe__policies {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-3);
}

.demo-notification-recipe__policies article {
  min-inline-size: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
}

.demo-notification-recipe__policies strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-notification-recipe__policies span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-notification-recipe__controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-notification-recipe__metrics {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-notification-recipe__metrics span {
  min-inline-size: 0;
  padding: var(--ui-space-3);
  overflow-wrap: anywhere;
}

.demo-notification-recipe__metrics span + span {
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-notification-recipe__viewport {
  position: relative;
  min-block-size: 12rem;
  min-inline-size: 0;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
}

.demo-notification-recipe__viewport-label {
  position: absolute;
  inset-block-end: var(--ui-space-3);
  inset-inline-start: var(--ui-space-3);
}

.demo-notification-recipe__host {
  position: absolute;
  inset-block-start: var(--demo-notification-safe-inset);
  inset-inline-end: var(--demo-notification-safe-inset);
  inline-size: clamp(
    min(
      var(--demo-notification-min-inline-size),
      calc(100% - (2 * var(--demo-notification-safe-inset)))
    ),
    var(--demo-notification-inline-size),
    min(
      var(--demo-notification-max-inline-size),
      calc(100% - (2 * var(--demo-notification-safe-inset)))
    )
  );
  min-inline-size: 0;
  max-inline-size: calc(100% - (2 * var(--demo-notification-safe-inset)));
}

.demo-notification-recipe__host > * {
  inline-size: 100%;
}

@container (max-width: 45rem) {
  .demo-notification-recipe__header {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .demo-notification-recipe__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .demo-notification-recipe__metrics span:nth-child(3) {
    border-inline-start: 0;
  }

  .demo-notification-recipe__metrics span:nth-child(n + 3) {
    border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  }

  .demo-notification-recipe__policies {
    grid-template-columns: minmax(0, 1fr);
  }
}

@container (max-width: 26.25rem) {
  .demo-notification-recipe__metrics {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-notification-recipe__metrics span + span {
    border-block-start: var(--ui-border-width) solid var(--ui-color-border);
    border-inline-start: 0;
  }
}
</style>
