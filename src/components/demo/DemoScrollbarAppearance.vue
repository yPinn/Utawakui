<script setup>
import UiScrollLayout from '../ui/UiScrollLayout.vue';

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
</script>

<template>
  <div class="demo-scrollbar-appearance">
    <p class="demo-scrollbar-appearance__note">
      以下直接使用 production `UiScrollLayout`；捲動由 native viewport
      負責，overlay rail 不改變內容座標。
    </p>

    <div class="demo-scrollbar-grid">
      <figure class="demo-scrollbar-sample">
        <figcaption>垂直</figcaption>
        <UiScrollLayout
          class="demo-scrollbar-region"
          axis="vertical"
          data-scrollbar-axis="vertical"
          tabindex="0"
          aria-label="垂直捲動區域"
        >
          <ol class="demo-scrollbar-list">
            <li v-for="item in VERTICAL_ITEMS" :key="item">{{ item }}</li>
          </ol>
        </UiScrollLayout>
      </figure>

      <figure class="demo-scrollbar-sample">
        <figcaption>水平</figcaption>
        <UiScrollLayout
          class="demo-scrollbar-region"
          axis="horizontal"
          data-scrollbar-axis="horizontal"
          tabindex="0"
          aria-label="水平捲動區域"
        >
          <div class="demo-scrollbar-strip">
            <span v-for="item in HORIZONTAL_ITEMS" :key="item">
              {{ item }}
            </span>
          </div>
        </UiScrollLayout>
      </figure>

      <figure class="demo-scrollbar-sample">
        <figcaption>雙軸</figcaption>
        <UiScrollLayout
          class="demo-scrollbar-region"
          axis="both"
          data-scrollbar-axis="both"
          tabindex="0"
          aria-label="雙軸捲動區域"
        >
          <div class="demo-scrollbar-sheet">
            <span v-for="index in 35" :key="index">
              {{ String(index).padStart(2, '0') }}
            </span>
          </div>
        </UiScrollLayout>
      </figure>
    </div>

    <section
      class="demo-scrollbar-layout-proof"
      data-scrollbar-layout-proof="overlay"
      aria-labelledby="demo-scrollbar-overlay-proof-title"
    >
      <header class="demo-scrollbar-layout-proof__header">
        <h4 id="demo-scrollbar-overlay-proof-title">Layout reserve</h4>
        <p>
          無溢位時 rail 不顯示；有溢位時由 layout wrapper
          保留安全邊界，內容座標維持不變。
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
  </div>
</template>

<style scoped>
.demo-scrollbar-appearance,
.demo-scrollbar-grid,
.demo-scrollbar-sample,
.demo-scrollbar-layout-proof,
.demo-scrollbar-layout-proof__grid {
  min-inline-size: 0;
  display: grid;
}

.demo-scrollbar-appearance {
  gap: var(--ui-space-5);
  container-type: inline-size;
}

.demo-scrollbar-appearance__note,
.demo-scrollbar-sample,
.demo-scrollbar-sample figcaption,
.demo-scrollbar-layout-proof__header h4,
.demo-scrollbar-layout-proof__header p {
  margin: 0;
}

.demo-scrollbar-appearance__note,
.demo-scrollbar-sample figcaption,
.demo-scrollbar-layout-proof__header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-scrollbar-appearance__note {
  max-width: 72ch;
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

.demo-scrollbar-layout-proof {
  gap: var(--ui-space-3);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-scrollbar-layout-proof__header {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(10rem, 0.35fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-scrollbar-layout-proof__header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-scrollbar-layout-proof__grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

@container (max-width: 48rem) {
  .demo-scrollbar-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@container (max-width: 32rem) {
  .demo-scrollbar-layout-proof__header,
  .demo-scrollbar-layout-proof__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
