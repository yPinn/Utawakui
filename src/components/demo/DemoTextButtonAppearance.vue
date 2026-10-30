<script setup>
import UiTextButton from '../ui/UiTextButton.vue';
import '../../styles/demoSpecimens.css';

const CONTENT = [
  ['short-cjk', 'Short CJK', '前往來源專輯'],
  ['long-cjk', 'Long CJK', '東京事変／椎名林檎／非常に長い日本語の選択肢'],
  [
    'long-latin',
    'Long Latin',
    'A deliberately long Latin destination title for overflow inspection',
  ],
  ['multilingual', 'Multilingual', '繁體中文／日本語／한국어／English'],
  ['number', 'Number', '前往第 12 首'],
];

const STATES = [
  ['default', 'Default'],
  ['hover', 'Hover'],
  ['pressed', 'Pressed'],
  ['focus', 'Focus-visible'],
  ['disabled', 'Disabled'],
];

const CONTRACT = [
  'native button · visible text 是預設 accessible name',
  'ariaLabel · 只在需要時補充目的地',
  'overflow · marquee（預設）／ellipsis／clamp',
  'click.stop 隔離所在列的主要操作',
  'Typography 沿用所在區域；獨立 32px 動作使用 UiButton',
];
</script>

<template>
  <div class="demo-specimens" data-text-button-source="production">
    <p class="demo-specimens__copy">
      顯示文字本身就是次要目的地；預設無底線，hover／focus-visible
      顯示底線，pressed 沿用 hover，disabled 50%。
    </p>

    <section class="demo-specimens__section">
      <h4>沿用所在區域的文字與寬度</h4>
      <div class="demo-specimens__grid">
        <article
          class="demo-specimens__case demo-text-button__label"
          data-text-button-geometry="label-context"
        >
          <h5>Label context · 14／600</h5>
          <UiTextButton text="前往來源專輯" />
        </article>
        <article
          class="demo-specimens__case demo-text-button__body"
          data-text-button-geometry="body-context"
        >
          <h5>Body context · 16／400</h5>
          <UiTextButton text="查看完整曲目資料" />
        </article>
        <article
          class="demo-specimens__case"
          data-text-button-width="constrained"
        >
          <h5>Constrained parent · 10rem</h5>
          <div class="demo-text-button__constrained">
            <UiTextButton
              text="很長的可點擊曲目名稱 — 長いタイトルと 한국어 제목"
            />
          </div>
        </article>
        <article class="demo-specimens__case">
          <h5>Destination override</h5>
          <UiTextButton
            text="海螺記"
            aria-label="前往專輯：海螺記"
            name="album-destination"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>內容與 overflow</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, label, text] in CONTENT"
          :key="key"
          class="demo-specimens__case"
          :data-text-button-content="key"
        >
          <h5>{{ label }}</h5>
          <UiTextButton :text="text" />
        </article>
        <article class="demo-specimens__case">
          <h5>overflow="ellipsis" · 大量列表</h5>
          <div class="demo-text-button__constrained">
            <UiTextButton
              text="A deliberately long queue title"
              overflow="ellipsis"
            />
          </div>
        </article>
        <article class="demo-specimens__case">
          <h5>overflow="clamp" · 標題兩行</h5>
          <div class="demo-text-button__constrained">
            <UiTextButton
              text="A deliberately long headline title for clamp inspection"
              overflow="clamp"
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>狀態</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, label] in STATES"
          :key="key"
          class="demo-specimens__case"
          :data-text-button-state="key"
        >
          <h5>{{ label }}</h5>
          <UiTextButton text="前往來源專輯" :disabled="key === 'disabled'" />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>使用情境</h4>
      <div class="demo-specimens__grid">
        <article
          class="demo-specimens__case"
          data-text-button-recipe="section-heading-destination"
        >
          <h5>前綴靜態、目的地可操作</h5>
          <div class="demo-text-button__heading">
            <span>下一首來自：</span>
            <UiTextButton
              text="海螺記 — 很長的來源集合名稱"
              aria-label="前往專輯：海螺記"
            />
          </div>
        </article>
        <article
          class="demo-specimens__case"
          data-text-button-recipe="table-cell-destination"
        >
          <h5>表格欄位擁有可用寬度</h5>
          <div class="demo-text-button__table-row">
            <span>12</span>
            <UiTextButton
              text="東京事変／椎名林檎／非常に長い曲目名稱"
              aria-label="前往專輯：東京事変／椎名林檎"
            />
            <span>4:22</span>
          </div>
        </article>
      </div>
    </section>

    <ul
      class="demo-specimens__contract"
      aria-label="UiTextButton public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-text-button__label {
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.demo-text-button__body {
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-body-weight);
  line-height: var(--ui-type-body-line-height);
}

.demo-text-button__constrained {
  min-width: 0;
  width: min(10rem, 100%);
}

.demo-text-button__heading,
.demo-text-button__table-row {
  min-width: 0;
  display: grid;
  align-items: center;
  gap: var(--ui-space-2);
}

.demo-text-button__heading {
  grid-template-columns: auto minmax(0, 1fr);
}

.demo-text-button__table-row {
  grid-template-columns: 2ch minmax(0, 1fr) auto;
  color: var(--ui-color-text-muted);
}

/* Static previews of pointer and keyboard states. */
.demo-specimens__case[data-text-button-state='hover']
  :deep(.ui-text-btn .ui-marquee__text),
.demo-specimens__case[data-text-button-state='focus']
  :deep(.ui-text-btn .ui-marquee__text),
.demo-specimens__case[data-text-button-state='pressed']
  :deep(.ui-text-btn .ui-marquee__text) {
  text-decoration: underline;
  text-decoration-color: currentcolor;
  text-underline-offset: 0.18em;
}

.demo-specimens__case[data-text-button-state='focus'] :deep(button) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  border-radius: var(--ui-focus-radius);
}
</style>
