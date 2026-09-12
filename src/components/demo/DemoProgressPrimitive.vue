<script setup>
defineProps({
  layer: { type: Object, required: true },
});

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
  {
    id: 'indeterminate',
    label: '正在準備音訊',
    indeterminate: true,
  },
];

const CONTENT_ITEMS = [
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

function densityProps(layer, density) {
  return layer.key === 'candidate' ? { density } : {};
}
</script>

<template>
  <div
    class="demo-progress-primitive"
    :class="`demo-progress-primitive--${layer.key}`"
  >
    <section class="demo-progress-block demo-progress-role">
      <header class="demo-progress-subsection__header">
        <h5>使用時機</h5>
        <p>
          有可量測進度或暫時無法估算時間的工作可使用
          UiProgress；工作結果與後續操作由所在畫面顯示。
        </p>
      </header>

      <div class="demo-progress-role__grid">
        <article data-progress-role="indicator">
          <strong>進度指示</strong>
          <component
            :is="layer.component"
            label="正在整理曲目"
            :value="46"
            :max="100"
            value-text="46%"
          />
          <span>標籤、可選數值與進度軌形成一個閱讀單位</span>
        </article>
        <article data-progress-role="result">
          <strong>工作結果</strong>
          <span>完成或失敗不靠進度條顏色單獨表達</span>
        </article>
        <article data-progress-role="actions">
          <strong>後續操作</strong>
          <span>不負責取消、重試、關閉或通知佇列</span>
        </article>
        <article data-progress-role="layout">
          <strong>可用寬度</strong>
          <span>所在畫面決定寬度、位置與周圍留白</span>
        </article>
      </div>
    </section>

    <section class="demo-progress-block demo-progress-geometry">
      <header class="demo-progress-subsection__header">
        <h5>尺寸與內容結構</h5>
        <p>
          Standard／Compact 都使用既有 8px 進度軌；候選版採 2px
          細圓角。標籤可換行，數值保持對齊。
        </p>
      </header>

      <div class="demo-progress-density-list">
        <article
          v-for="density in layer.densities"
          :key="density[0]"
          class="demo-progress-density__item"
          :data-progress-density="density[0]"
        >
          <h6>{{ density[1] }}</h6>
          <component
            :is="layer.component"
            v-bind="densityProps(layer, density[0])"
            label="正在整理曲目"
            :value="46"
            :max="100"
            value-text="46%"
          />
        </article>
      </div>

      <div class="demo-progress-anatomy-list">
        <article data-progress-anatomy="label-value">
          <strong>標籤與數值</strong>
          <span>標籤說明工作；數值只在有可靠內容時顯示</span>
        </article>
        <article data-progress-anatomy="track">
          <strong>進度軌</strong>
          <span>寬度填滿可用空間，高度由共用 token 決定</span>
        </article>
      </div>
    </section>

    <section class="demo-progress-block demo-progress-states">
      <header class="demo-progress-subsection__header">
        <h5>進度狀態</h5>
        <p>
          0、部分、完成與自訂總數都顯示可靠數值；無法估算時只顯示不確定進度，不假裝為
          0%。
        </p>
      </header>

      <div class="demo-progress-state-list">
        <article v-for="state in STATES" :key="state.id">
          <span class="demo-progress-item__label">{{ state.id }}</span>
          <component
            :is="layer.component"
            :data-progress-state="state.id"
            :label="state.label"
            :value="state.value"
            :max="state.max"
            :value-text="state.valueText"
            :indeterminate="state.indeterminate"
          />
        </article>
      </div>
    </section>

    <section class="demo-progress-block demo-progress-content">
      <header class="demo-progress-subsection__header">
        <h5>窄內容與多語</h5>
        <p>
          長
          CJK／Latin／多語標籤與沒有自然斷點的檔名都留在窄框內；數值不與標籤重疊。
        </p>
      </header>

      <div class="demo-progress-content-list">
        <article v-for="item in CONTENT_ITEMS" :key="item.id">
          <span class="demo-progress-item__label">{{ item.id }}</span>
          <div class="demo-progress-content__frame">
            <component
              :is="layer.component"
              :data-progress-content="item.id"
              :label="item.label"
              :value="item.value"
              :max="item.max ?? 100"
              :value-text="item.valueText"
              :lang="item.lang"
              :dir="item.dir"
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-progress-block demo-progress-recipes">
      <header class="demo-progress-subsection__header">
        <h5>任務情境</h5>
        <p>
          進度元件呈現目前進展；所在區域決定是否忙碌，重要階段與最後結果另以完整句子說明。
        </p>
      </header>

      <div class="demo-progress-recipe-list">
        <article data-progress-recipe="busy-region" aria-busy="true">
          <component :is="layer.component" label="正在準備音訊" indeterminate />
          <span>所在區域決定 aria-busy</span>
        </article>
        <article data-progress-recipe="milestone">
          <component
            :is="layer.component"
            label="正在匯入曲目"
            :value="100"
            :max="100"
            value-text="全部完成"
          />
          <p role="status" aria-live="polite">匯入完成，可以繼續整理曲目。</p>
          <span>只在重要階段更新狀態文字</span>
        </article>
        <article data-progress-recipe="result-message">
          <component
            :is="layer.component"
            label="正在分析曲目"
            :value="5"
            :max="12"
            value-text="5／12"
          />
          <span>完成或失敗由清楚文字與相應通知承接</span>
        </article>
        <article data-progress-recipe="parent-width">
          <div class="demo-progress-recipe__bounded">
            <component
              :is="layer.component"
              label="正在整理曲目"
              :value="46"
              :max="100"
              value-text="46%"
            />
          </div>
          <span>所在畫面決定固定欄寬或流動寬度</span>
        </article>
      </div>
    </section>

    <section class="demo-progress-block demo-progress-contract">
      <header class="demo-progress-subsection__header">
        <h5>輔助技術與公開介面</h5>
        <p>
          進度軌使用原生語意與可見標籤；不確定進度不帶數值。頻繁更新不逐次朗讀，重要階段由所在畫面另行說明。
        </p>
      </header>

      <div class="demo-progress-aria-list">
        <article data-progress-aria="determinate">
          <component
            :is="layer.component"
            label="正在整理曲目"
            :value="46"
            :max="100"
            value-text="46%"
          />
          <span>有數值進度 · 標籤與 46%</span>
        </article>
        <article data-progress-aria="indeterminate">
          <component :is="layer.component" label="正在準備音訊" indeterminate />
          <span>不確定進度 · 不帶假數值</span>
        </article>
        <article data-progress-aria="value-text">
          <component
            :is="layer.component"
            label="正在分析曲目"
            :value="5"
            :max="12"
            value-text="5／12"
          />
          <span>可讀數值 · 5／12</span>
        </article>
        <article data-progress-aria="language">
          <component
            :is="layer.component"
            label="音声を準備しています"
            :value="32"
            :max="100"
            value-text="32%"
            lang="ja"
            dir="auto"
          />
          <span>語言與文字方向沿用原生屬性</span>
        </article>
      </div>

      <div
        class="demo-progress-contracts"
        aria-label="UiProgress public contract"
      >
        <span>標籤 · 必填的工作名稱</span>
        <span>目前值／總值 · 有數值時使用</span>
        <span>可讀數值 · 有需要時補充</span>
        <span>不確定進度 · 不顯示數值</span>
        <span>原生屬性會套用到外層</span>
        <span>所在區域決定 aria-busy</span>
        <span>重要階段由所在畫面宣告</span>
        <span>不包含結果、操作、色彩狀態或版面寬度</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-progress-primitive,
.demo-progress-block,
.demo-progress-subsection__header,
.demo-progress-role__grid article,
.demo-progress-density__item,
.demo-progress-anatomy-list article,
.demo-progress-state-list article,
.demo-progress-content-list article,
.demo-progress-recipe-list article,
.demo-progress-aria-list article {
  min-width: 0;
  display: grid;
}

.demo-progress-primitive {
  gap: var(--ui-space-6);
}

.demo-progress-block {
  gap: var(--ui-space-3);
}

.demo-progress-block + .demo-progress-block {
  padding-block-start: var(--ui-space-5);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-progress-subsection__header {
  grid-template-columns: minmax(9rem, 0.3fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-progress-subsection__header h5,
.demo-progress-subsection__header p,
.demo-progress-density__item h6,
.demo-progress-recipe-list p {
  margin: 0;
}

.demo-progress-subsection__header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-title);
}

.demo-progress-subsection__header p,
.demo-progress-role__grid span,
.demo-progress-density__item h6,
.demo-progress-anatomy-list span,
.demo-progress-item__label,
.demo-progress-recipe-list article > span,
.demo-progress-aria-list article > span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-progress-role__grid,
.demo-progress-density-list,
.demo-progress-anatomy-list,
.demo-progress-state-list,
.demo-progress-content-list,
.demo-progress-recipe-list,
.demo-progress-aria-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-progress-role__grid article,
.demo-progress-density__item,
.demo-progress-anatomy-list article,
.demo-progress-state-list article,
.demo-progress-content-list article,
.demo-progress-recipe-list article,
.demo-progress-aria-list article {
  align-content: start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: color-mix(
    in srgb,
    var(--ui-color-surface-raised) 76%,
    transparent
  );
}

.demo-progress-role__grid strong,
.demo-progress-anatomy-list strong,
.demo-progress-recipe-list p {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-progress-content__frame {
  min-width: 0;
  width: min(18rem, 100%);
  overflow-x: auto;
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
}

.demo-progress-recipe__bounded {
  min-width: 0;
  width: min(16rem, 100%);
}

.demo-progress-contracts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-progress-contracts span {
  padding: var(--ui-space-1) var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

@container (max-width: 44rem) {
  .demo-progress-subsection__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>
