<script setup>
import UiProgress from '../ui/UiProgress.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import '../../styles/demoSpecimens.css';

const STATES = [
  {
    id: 'zero',
    label: '等待整理曲目',
    value: 0,
    max: 100,
    valueText: '尚未開始',
  },
  {
    id: 'partial',
    label: '正在整理曲目',
    value: 46,
    max: 100,
    valueText: '46%',
  },
  {
    id: 'complete',
    label: '曲目整理完成',
    value: 100,
    max: 100,
    valueText: '全部完成',
  },
  {
    id: 'bounded-total',
    label: '正在分析曲目',
    value: 5,
    max: 12,
    valueText: '5／12',
  },
  { id: 'indeterminate', label: '正在準備音訊', indeterminate: true },
  { id: 'no-value-text', label: '正在整理曲目', value: 64 },
  {
    id: 'label-hidden',
    label: '背景整理進度',
    labelHidden: true,
    value: 64,
    valueText: '64%',
  },
];

const CONTENT = [
  {
    id: 'rtl',
    label: 'جارٍ تحضير الملفات المحلية',
    value: 46,
    valueText: '46%',
    lang: 'ar',
    dir: 'rtl',
  },
  {
    id: 'long-cjk',
    label: '正在整理匯入的曲目與歌詞內容，完成後即可繼續編排播放順序。',
    value: 64,
    valueText: '64%',
  },
  {
    id: 'long-latin',
    label: 'Preparing locally selected audio for the next review step',
    value: 7,
    max: 12,
    valueText: '7／12',
    lang: 'en',
  },
  {
    id: 'multilingual',
    label: '繁體中文、日本語、한국어 and English 正在整理中',
    value: 72,
    valueText: '72%',
    dir: 'auto',
  },
  {
    id: 'unbroken',
    label: 'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    value: 3,
    max: 8,
    valueText: '3／8',
    lang: 'en',
  },
];

const CONTRACT = [
  '標籤 · 必填的工作名稱',
  '目前值／總值 · 有數值時使用；不確定進度不顯示數值',
  '8px 進度軌，兩種密度相同',
  '所在區域決定 aria-busy 與重要階段宣告',
  '不負責取消、重試、關閉或通知佇列',
];
</script>

<template>
  <div class="demo-specimens" data-progress-source="production">
    <p class="demo-specimens__copy">
      顯示有標籤的進度；結果與操作另行呈現，完成或失敗不靠進度條顏色單獨表達。
    </p>

    <section class="demo-specimens__section">
      <h4>進度狀態</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="state in STATES"
          :key="state.id"
          class="demo-specimens__case"
        >
          <h5>{{ state.id }}</h5>
          <UiProgress
            :data-progress-state="state.id"
            :label="state.label"
            :label-hidden="state.labelHidden"
            :value="state.value"
            :max="state.max"
            :value-text="state.valueText"
            :indeterminate="state.indeterminate"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>窄內容與多語</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="item in CONTENT"
          :key="item.id"
          class="demo-specimens__case"
        >
          <h5>{{ item.id }}</h5>
          <UiScrollRegion axis="horizontal">
            <UiProgress
              :data-progress-content="item.id"
              :label="item.label"
              :value="item.value"
              :max="item.max ?? 100"
              :value-text="item.valueText"
              :lang="item.lang"
              :dir="item.dir"
            />
          </UiScrollRegion>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>任務情境</h4>
      <div class="demo-specimens__grid">
        <article
          class="demo-specimens__case"
          data-progress-recipe="busy-region"
          aria-busy="true"
        >
          <h5>所在區域忙碌中</h5>
          <UiProgress label="正在準備音訊" indeterminate />
        </article>
        <article class="demo-specimens__case" data-progress-recipe="milestone">
          <h5>重要階段宣告</h5>
          <UiProgress
            label="正在匯入曲目"
            :value="100"
            :max="100"
            value-text="全部完成"
          />
          <p class="demo-specimens__copy" role="status" aria-live="polite">
            匯入完成，可以繼續整理曲目。
          </p>
        </article>
        <article class="demo-specimens__case" data-progress-aria="language">
          <h5>語言與文字方向</h5>
          <UiProgress
            label="音声を準備しています"
            :value="32"
            :max="100"
            value-text="32%"
            lang="ja"
            dir="auto"
          />
        </article>
      </div>
    </section>

    <ul
      class="demo-specimens__contract"
      aria-label="UiProgress public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>
