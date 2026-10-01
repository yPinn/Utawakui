<script setup>
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';

const LAYERS = Object.freeze([
  {
    key: 'candidate',
    title: 'Token v2 Scroll Region',
    note: '12px 透明 hit lane 與 6px neutral thumb 疊在內容邊緣；沒有溢位時不顯示，也不預留寬度。',
  },
  {
    key: 'current',
    title: '現行 Production Scroll Region',
    note: '與 Token v2 共用 overlay 行為契約，外觀由現行 semantic tokens 決定。',
  },
]);

const VERTICAL_ITEMS = Object.freeze([
  '待播清單',
  '最近播放',
  '歌曲資訊',
  '歌詞工作區',
  '輸出設定',
  '裝置設定',
  '處理紀錄',
  '診斷資訊',
]);

const HORIZONTAL_ITEMS = Object.freeze([
  '本機曲庫',
  '直播歌單',
  '練唱候選',
  '已完成 Cover',
  '待補歌詞',
]);

const STATE_SAMPLES = Object.freeze([
  { key: 'default', label: 'Default' },
  { key: 'hover', label: 'Hover' },
  { key: 'active', label: 'Active' },
]);

const regionClasses = (layer) => [
  'demo-scrollbar-region',
  `demo-scrollbar-region--${layer.key}`,
];
</script>

<template>
  <div class="demo-scrollbar-appearance">
    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-scrollbar-layer"
      :class="`demo-scrollbar-layer--${layer.key}`"
      :data-demo-review-layer="layer.key"
      :aria-labelledby="`demo-scrollbar-${layer.key}-title`"
    >
      <header class="demo-scrollbar-layer__header">
        <h4 :id="`demo-scrollbar-${layer.key}-title`">{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <div class="demo-scrollbar-grid">
        <figure class="demo-scrollbar-sample">
          <figcaption>垂直</figcaption>
          <UiScrollRegion
            axis="vertical"
            :class="regionClasses(layer)"
            data-scrollbar-axis="vertical"
            tabindex="0"
            aria-label="垂直捲動區域"
          >
            <ol class="demo-scrollbar-list">
              <li v-for="item in VERTICAL_ITEMS" :key="item">{{ item }}</li>
            </ol>
          </UiScrollRegion>
        </figure>

        <figure class="demo-scrollbar-sample">
          <figcaption>水平</figcaption>
          <UiScrollRegion
            axis="horizontal"
            :class="regionClasses(layer)"
            data-scrollbar-axis="horizontal"
            tabindex="0"
            aria-label="水平捲動區域"
          >
            <div class="demo-scrollbar-strip">
              <span v-for="item in HORIZONTAL_ITEMS" :key="item">
                {{ item }}
              </span>
            </div>
          </UiScrollRegion>
        </figure>

        <figure class="demo-scrollbar-sample">
          <figcaption>雙軸</figcaption>
          <UiScrollRegion
            axis="both"
            :class="regionClasses(layer)"
            data-scrollbar-axis="both"
            tabindex="0"
            aria-label="雙軸捲動區域"
          >
            <div class="demo-scrollbar-sheet">
              <span v-for="index in 35" :key="index">
                {{ String(index).padStart(2, '0') }}
              </span>
            </div>
          </UiScrollRegion>
        </figure>
      </div>

      <section
        v-if="layer.key === 'candidate'"
        class="demo-scrollbar-layout-proof"
        data-scrollbar-layout-proof="overlay"
        aria-labelledby="demo-scrollbar-overlay-proof-title"
      >
        <header class="demo-scrollbar-layout-proof__header">
          <h5 id="demo-scrollbar-overlay-proof-title">Layout reserve</h5>
          <p>
            無溢位時 rail 不顯示，但 layout 仍保留
            lane；有溢位時內容座標維持不變。
          </p>
        </header>

        <div class="demo-scrollbar-layout-proof__grid">
          <figure class="demo-scrollbar-sample">
            <figcaption>內容未溢位</figcaption>
            <UiScrollLayout
              class="demo-scrollbar-region demo-scrollbar-region--proof"
              axis="vertical"
              data-scrollbar-overflow="none"
              tabindex="0"
              aria-label="沒有溢位的捲動區域"
            >
              <ol class="demo-scrollbar-list demo-scrollbar-list--short">
                <li v-for="item in VERTICAL_ITEMS.slice(0, 2)" :key="item">
                  {{ item }}
                </li>
              </ol>
            </UiScrollLayout>
          </figure>

          <figure class="demo-scrollbar-sample">
            <figcaption>內容已溢位</figcaption>
            <UiScrollLayout
              class="demo-scrollbar-region demo-scrollbar-region--proof"
              axis="vertical"
              data-scrollbar-overflow="present"
              tabindex="0"
              aria-label="已有溢位的捲動區域"
            >
              <ol class="demo-scrollbar-list">
                <li v-for="item in VERTICAL_ITEMS" :key="item">
                  {{ item }}
                </li>
              </ol>
            </UiScrollLayout>
          </figure>
        </div>
      </section>

      <div
        v-if="layer.key === 'candidate'"
        class="demo-scrollbar-states"
        aria-label="捲動條互動狀態"
      >
        <figure
          v-for="state in STATE_SAMPLES"
          :key="state.key"
          class="demo-scrollbar-state"
        >
          <span
            class="demo-scrollbar-state__lane"
            :data-scrollbar-state="state.key"
            aria-hidden="true"
          >
            <span class="demo-scrollbar-state__thumb" />
          </span>
          <figcaption>{{ state.label }}</figcaption>
        </figure>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-scrollbar-appearance,
.demo-scrollbar-layer,
.demo-scrollbar-grid,
.demo-scrollbar-sample {
  min-inline-size: 0;
  display: grid;
}

.demo-scrollbar-appearance {
  gap: var(--ui-space-6);
}

.demo-scrollbar-layer {
  gap: var(--ui-space-5);
  padding: var(--ui-space-5);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
  container-type: inline-size;
}

.demo-scrollbar-layer__header {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-scrollbar-layer__header h4,
.demo-scrollbar-layer__header p,
.demo-scrollbar-sample,
.demo-scrollbar-sample figcaption,
.demo-scrollbar-state,
.demo-scrollbar-state figcaption {
  margin: 0;
}

.demo-scrollbar-layer__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-scrollbar-layer__header p,
.demo-scrollbar-sample figcaption,
.demo-scrollbar-state figcaption {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-scrollbar-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

.demo-scrollbar-sample {
  gap: var(--ui-space-2);
}

.demo-scrollbar-region {
  min-inline-size: 0;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
}

.demo-scrollbar-region:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-scrollbar-region:has(.ui-scroll-region__viewport:focus-visible) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-scrollbar-region[data-scrollbar-axis='vertical'],
.demo-scrollbar-region[data-scrollbar-axis='both'] {
  block-size: 11rem;
}

.demo-scrollbar-region--proof {
  block-size: 8rem;
}

.demo-scrollbar-list {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-2);
  list-style-position: inside;
}

.demo-scrollbar-list li,
.demo-scrollbar-strip span,
.demo-scrollbar-sheet span {
  min-block-size: var(--ui-control-height);
  display: flex;
  align-items: center;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-scrollbar-list li {
  padding-inline: var(--ui-space-2);
}

.demo-scrollbar-strip {
  inline-size: max-content;
  display: flex;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
}

.demo-scrollbar-strip span {
  inline-size: 8rem;
  justify-content: center;
  padding-inline: var(--ui-space-2);
  white-space: nowrap;
}

.demo-scrollbar-sheet {
  inline-size: 34rem;
  display: grid;
  grid-template-columns: repeat(5, 6rem);
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
}

.demo-scrollbar-sheet span {
  justify-content: center;
}

.demo-scrollbar-states {
  display: grid;
  grid-template-columns: repeat(3, minmax(5rem, 1fr));
  gap: var(--ui-space-3);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-scrollbar-layout-proof {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-scrollbar-layout-proof__header {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-scrollbar-layout-proof__header h5,
.demo-scrollbar-layout-proof__header p {
  margin: 0;
}

.demo-scrollbar-layout-proof__header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-scrollbar-layout-proof__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-scrollbar-layout-proof__grid {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

.demo-scrollbar-state {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: var(--ui-scrollbar-lane-size) minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-2);
}

.demo-scrollbar-state__lane {
  inline-size: var(--ui-scrollbar-lane-size);
  block-size: 4rem;
  display: grid;
  place-items: center;
  border-radius: var(--ui-scrollbar-radius);
  background: var(--ui-scrollbar-track);
}

.demo-scrollbar-state__thumb {
  inline-size: calc(
    var(--ui-scrollbar-lane-size) - var(--ui-scrollbar-thumb-inset) -
      var(--ui-scrollbar-thumb-inset)
  );
  block-size: 2.5rem;
  border-radius: var(--ui-scrollbar-radius);
  background: var(--ui-scrollbar-thumb);
}

.demo-scrollbar-state__lane[data-scrollbar-state='hover']
  .demo-scrollbar-state__thumb {
  background: var(--ui-scrollbar-thumb-hover);
}

.demo-scrollbar-state__lane[data-scrollbar-state='active']
  .demo-scrollbar-state__thumb {
  background: var(--ui-scrollbar-thumb-active);
}

.demo-scrollbar-layer--current {
  color-scheme: dark;
  --ui-color-surface: #292f35;
  --ui-color-surface-raised: #30383e;
  --ui-color-surface-hover: #344046;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-border: #3c4749;
  --ui-color-focus: #dd7a64;
}

:global(:root[data-ui-theme='light'] .demo-scrollbar-layer--current) {
  color-scheme: light;
  --ui-color-surface: #fffdfa;
  --ui-color-surface-raised: #fff;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-border: #d8ded9;
  --ui-color-focus: #d26a45;
}

@container (max-width: 48rem) {
  .demo-scrollbar-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@container (max-width: 32rem) {
  .demo-scrollbar-layer__header,
  .demo-scrollbar-states,
  .demo-scrollbar-layout-proof__header,
  .demo-scrollbar-layout-proof__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-scrollbar-layer__header {
    gap: var(--ui-space-1);
  }
}
</style>
