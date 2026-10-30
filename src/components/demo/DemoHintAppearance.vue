<script setup>
import UiHint from '../ui/UiHint.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import DemoCandidateHint from './DemoCandidateHint.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const TONES = [
  { id: 'muted', label: '歌曲資料保存在這台裝置。' },
  { id: 'text', label: '可使用方向鍵切換選項。' },
  { id: 'info', label: '正在檢查可用功能。' },
  { id: 'success', label: '歌曲資料已儲存。' },
  { id: 'warning', label: '部分選用資訊尚未填寫。' },
  { id: 'danger', label: '來源 Magnitude.wav 目前無法讀取。' },
  { id: 'gated', label: '公開輸出尚未開啟。' },
];

const CONTENT = [
  { id: 'short-cjk', label: '這個設定只影響目前工作區。' },
  {
    id: 'long-cjk',
    label:
      '這段較長的繁體中文輔助文字用來確認窄欄時能自然換行，並維持清楚的閱讀順序。',
  },
  {
    id: 'long-latin',
    label:
      'This supporting sentence stays readable when the available panel width becomes narrow.',
    lang: 'en',
  },
  {
    id: 'multilingual',
    label: '繁體中文、日本語、한국어 and English 都應在窄內容中保持可讀。',
    dir: 'auto',
  },
  {
    id: 'unbroken',
    label: 'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    tone: 'text',
    lang: 'en',
  },
];

const CONTRACT = [
  '原生段落 · 可見文字同時是無障礙內容',
  '訊息來源決定更新時機與 role=status／aria-live',
  '訊息類型不自行建立 role=alert',
  'tone · 7 個相容值',
  '不包含圖示、操作、欄位關聯或即時宣告',
];
</script>

<template>
  <div class="demo-specimens" data-hint-source="production">
    <p class="demo-specimens__copy">
      獨立輔助文字；欄位說明由 UiField、圖示與操作訊息由 UiNotice 負責。
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
          <UiHint :tone="tone.id" :data-hint-tone="tone.id">
            {{ tone.label }}
          </UiHint>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>長內容與換行</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="item in CONTENT"
          :key="item.id"
          class="demo-specimens__case"
        >
          <h5>{{ item.id }}</h5>
          <UiScrollRegion axis="horizontal">
            <UiHint
              :tone="item.tone ?? 'muted'"
              :data-hint-content="item.id"
              :lang="item.lang"
              :dir="item.dir"
            >
              {{ item.label }}
            </UiHint>
          </UiScrollRegion>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>使用情境與宣告</h4>
      <p class="demo-specimens__copy">
        靜態文字不主動宣告；即時更新由所在畫面設定。
      </p>
      <div class="demo-specimens__grid">
        <article class="demo-specimens__case" data-hint-recipe="inline-support">
          <h5>音訊來源</h5>
          <UiHint data-hint-aria="static">
            僅顯示目前裝置可讀取的本機檔案。
          </UiHint>
        </article>
        <article class="demo-specimens__case" data-hint-recipe="empty-state">
          <h5>空狀態</h5>
          <UiHint>目前沒有符合條件的曲目。</UiHint>
        </article>
        <article class="demo-specimens__case" data-hint-recipe="live-status">
          <h5>非緊急狀態更新</h5>
          <UiHint
            tone="info"
            data-hint-aria="live"
            role="status"
            aria-live="polite"
          >
            需要的功能已可使用。
          </UiHint>
        </article>
        <article class="demo-specimens__case">
          <h5>語言與文字方向</h5>
          <UiHint data-hint-aria="language" lang="ja" dir="auto">
            日本語と繁體中文を同じ段落で確認します。
          </UiHint>
        </article>
        <article class="demo-specimens__case">
          <h5>狀態色不自動建立警示</h5>
          <UiHint tone="danger" data-hint-aria="tone-only">
            來源 Magnitude.wav 目前無法讀取。
          </UiHint>
        </article>
      </div>
    </section>

    <DemoProposalSpecimen
      note="長識別字自然換行與 Token v2 語意色；owner 保留現行 14px caption 與七個 tone，留待正式遷移時評估。"
    >
      <DemoCandidateHint v-for="tone in TONES" :key="tone.id" :tone="tone.id">
        {{ tone.label }}
      </DemoCandidateHint>
    </DemoProposalSpecimen>

    <ul class="demo-specimens__contract" aria-label="UiHint public contract">
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>
