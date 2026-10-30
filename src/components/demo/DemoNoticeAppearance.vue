<script setup>
import { ref } from 'vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import DemoCandidateNotice from './DemoCandidateNotice.vue';
import DemoNoticeNotificationRecipe from './DemoNoticeNotificationRecipe.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const TONES = [
  { id: 'muted', title: '歌曲資訊', message: '使用裝置上的歌曲資料。' },
  { id: 'info', title: '正在檢查可用功能', message: '完成後會自動更新。' },
  {
    id: 'success',
    title: '處理完成',
    message: '分離音軌已保存並可供播放。',
  },
  {
    id: 'warning',
    title: '需確認公開輸出內容',
    message: '開始輸出前，請確認本次使用的內容。',
  },
  {
    id: 'danger',
    title: '來源檔案無法讀取',
    message: '請確認檔案仍存在，再重新嘗試。',
  },
];

const CONTENT = [
  {
    id: 'title-message',
    title: '準備尚未完成',
    message: '準備完成後即可繼續。',
  },
  { id: 'title-only', title: '目前設定只保存在這次工作階段' },
  { id: 'message-only', message: '已使用裝置上的歌曲資訊。' },
  {
    id: 'long-cjk',
    title: '需要確認輸出內容',
    message:
      '這段較長的繁體中文說明用來確認窄欄中仍能自然換行，並保留明確的下一步。',
  },
  {
    id: 'long-latin',
    title: 'This feature is not ready',
    message:
      'This inline notice keeps its recovery guidance readable in a narrow operational panel.',
    lang: 'en',
  },
  {
    id: 'multilingual',
    title: '多語內容檢查',
    message: '繁體中文、日本語、한국어 and English 都應在窄內容中維持可讀。',
    dir: 'auto',
  },
  {
    id: 'unbroken',
    title: 'Long file name',
    message: 'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    lang: 'en',
  },
];

const STRUCTURED_NOTICE = {
  severity: 'warning',
  title: '匯入尚未完成',
  message: '請確認來源可用後再試一次。',
  actionLabel: '重試匯入',
};

const CONTRACT = [
  'title／message 至少一項，皆空時不顯示',
  'actionLabel＋action · 選用的情境操作',
  'danger 自動 role=alert，其餘 role=status',
  'notice 物件 · 現行錯誤訊息相容格式',
  'compact · 8px inset',
];

const actionOutcome = ref('');

function recordAction(label) {
  actionOutcome.value = `已選擇「${label}」。`;
}
</script>

<template>
  <div class="demo-specimens" data-notice-source="production">
    <p class="demo-specimens__copy">
      靠近相關內容顯示訊息與操作；欄位說明由 UiField、純文字由
      UiHint、中斷流程由 Modal 負責，固定通知另由通知容器管理。
    </p>

    <section class="demo-specimens__section">
      <h4>訊息類型</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="tone in TONES"
          :key="tone.id"
          class="demo-specimens__case"
        >
          <h5>{{ tone.id }}</h5>
          <UiNotice
            :tone="tone.id"
            :title="tone.title"
            :message="tone.message"
            :data-notice-tone="tone.id"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>內容結構與換行</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="item in CONTENT"
          :key="item.id"
          class="demo-specimens__case"
        >
          <h5>{{ item.id }}</h5>
          <UiScrollRegion axis="horizontal">
            <UiNotice
              tone="muted"
              :title="item.title"
              :message="item.message"
              :data-notice-content="item.id"
              :lang="item.lang"
              :dir="item.dir"
            />
          </UiScrollRegion>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>操作與密度</h4>
      <div class="demo-specimens__grid">
        <article class="demo-specimens__case">
          <h5>Standard · 12px inset</h5>
          <UiNotice
            tone="danger"
            title="來源檔案無法讀取"
            message="確認檔案仍存在後再重試。"
            action-label="重試讀取"
            data-notice-action="retry"
            @action="recordAction('重試讀取')"
          />
        </article>
        <article class="demo-specimens__case">
          <h5>Compact · 8px inset</h5>
          <UiNotice
            tone="warning"
            title="找不到輸出裝置"
            message="請改用其他音訊輸出。"
            action-label="選擇裝置"
            compact
            @action="recordAction('選擇裝置')"
          />
        </article>
        <article class="demo-specimens__case">
          <h5>notice 物件</h5>
          <UiNotice
            :notice="STRUCTURED_NOTICE"
            data-notice-action="retry-import"
            @action="recordAction('重試匯入')"
          />
        </article>
      </div>
      <p
        v-if="actionOutcome"
        class="demo-specimens__copy"
        role="status"
        aria-live="polite"
      >
        {{ actionOutcome }}
      </p>
    </section>

    <DemoNoticeNotificationRecipe />

    <DemoProposalSpecimen
      note="語意淡色底、36／32px 操作下限與窄框操作換行；宣告時機改由呼叫端決定。owner 保留現行外觀，留待正式遷移時評估。"
    >
      <UiScrollRegion axis="horizontal">
        <DemoCandidateNotice
          tone="warning"
          title="需確認公開輸出內容"
          message="開始輸出前，請確認本次使用的內容。"
          action-label="檢查內容"
        />
      </UiScrollRegion>
      <UiScrollRegion axis="horizontal">
        <DemoCandidateNotice
          tone="info"
          density="compact"
          title="正在檢查可用功能"
          message="完成後會自動更新。"
        />
      </UiScrollRegion>
    </DemoProposalSpecimen>

    <ul class="demo-specimens__contract" aria-label="UiNotice public contract">
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>
