<script setup>
import DemoPageLayoutAppearance from './DemoPageLayoutAppearance.vue';

const decisions = [
  {
    key: 'good',
    title: '保留',
    body: '清楚、低疲勞，內容容易掃讀。',
  },
  {
    key: 'mixed',
    title: '收斂',
    body: 'Folder 外觀色屬於元件，作用於 tabs 與外框。',
  },
  {
    key: 'bad',
    title: '排除',
    body: '巢狀卡片、過度裝飾與高密度。',
  },
];
</script>

<template>
  <div
    class="demo-final-board__scroll"
    role="region"
    aria-label="Page／Layout 最終候選"
    tabindex="0"
  >
    <main class="demo-final-board">
      <header class="demo-final-board__header">
        <h1>Page／Layout 最終候選</h1>
        <p>請確認外框、文件層級與窄版呈現。</p>
      </header>

      <section
        class="demo-final-board__section"
        aria-labelledby="direction-title"
      >
        <header class="demo-final-board__section-heading">
          <h2 id="direction-title">設計取捨</h2>
        </header>
        <div class="demo-final-board__decision-grid">
          <article
            v-for="decision in decisions"
            :key="decision.key"
            class="demo-final-board__decision"
            :data-decision="decision.key"
          >
            <h3>{{ decision.title }}</h3>
            <p>{{ decision.body }}</p>
          </article>
        </div>
      </section>

      <section class="demo-final-board__section" aria-labelledby="layout-title">
        <header class="demo-final-board__section-heading">
          <h2 id="layout-title">版面預覽</h2>
        </header>
        <DemoPageLayoutAppearance />
      </section>
    </main>
  </div>
</template>

<style scoped>
.demo-final-board__scroll {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  outline: none;
}

.demo-final-board__scroll:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-final-board {
  width: min(76rem, 100%);
  min-width: 0;
  display: grid;
  gap: var(--ui-space-6);
  margin-inline: auto;
  padding: var(--ui-space-5);
}

.demo-final-board__header,
.demo-final-board__section-heading {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.demo-final-board__header h1,
.demo-final-board__header p,
.demo-final-board__section-heading h2,
.demo-final-board__decision h3,
.demo-final-board__decision p {
  margin: 0;
}

.demo-final-board__header h1 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-2xl);
  line-height: var(--ui-line-height-title);
}

.demo-final-board__header > p:last-child,
.demo-final-board__decision p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-body);
}

.demo-final-board__header > p:last-child {
  max-width: 72ch;
}

.demo-final-board__section {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-4);
  padding-block-start: var(--ui-space-5);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-final-board__section-heading h2 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  line-height: var(--ui-line-height-title);
}

.demo-final-board__decision-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-3);
}

.demo-final-board__decision {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-4);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
}

.demo-final-board__decision {
  border-block-start-width: calc(var(--ui-border-width) * 3);
}

.demo-final-board__decision[data-decision='good'] {
  border-block-start-color: var(--ui-color-success);
}

.demo-final-board__decision[data-decision='mixed'] {
  border-block-start-color: var(--ui-color-warning);
}

.demo-final-board__decision[data-decision='bad'] {
  border-block-start-color: var(--ui-color-danger);
}

.demo-final-board__decision h3 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-label);
}

@media (max-width: 64rem) {
  .demo-final-board {
    padding: var(--ui-space-4);
  }

  .demo-final-board__decision-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
