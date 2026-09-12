<script setup>
import { BadgeCheck, ICON_SIZE } from '../../icons/index.js';

const props = defineProps({
  layer: { type: Object, required: true },
});

const CONTENT_ITEMS = [
  { id: 'short-cjk', label: '本機', tone: 'muted' },
  { id: 'number', label: 24, tone: 'muted' },
  {
    id: 'long-cjk',
    label: '東京事変／椎名林檎／非常に長い資料分類標籤',
    tone: 'accent',
    bounded: true,
  },
  {
    id: 'long-latin',
    label: 'A deliberately long system-generated category label for inspection',
    tone: 'info',
    bounded: true,
  },
  {
    id: 'multilingual',
    label: '繁體中文／日本語／한국어／English',
    tone: 'success',
    bounded: true,
  },
];

const TONE_ITEMS = [
  { id: 'muted', label: '一般資料' },
  { id: 'accent', label: '已選取' },
  { id: 'current', label: '播放中' },
  { id: 'info', label: '處理中' },
  { id: 'success', label: '已完成' },
  { id: 'warning', label: '需注意' },
  { id: 'danger', label: '失敗' },
  { id: 'gated', label: '需確認', currentLabel: '需啟用' },
];

const GROUP_ITEMS = [
  { id: 'built-in', label: '內建模板', tone: 'accent' },
  { id: 'lyrics', label: '逐字歌詞', tone: 'muted' },
  { id: 'vertical', label: '直書', tone: 'muted' },
  { id: 'motion', label: '動態預覽', tone: 'info' },
];

function layerText(candidate, current) {
  return props.layer.key === 'candidate' ? candidate : current;
}

function toneLabel(item) {
  return props.layer.key === 'current' && item.currentLabel
    ? item.currentLabel
    : item.label;
}
</script>

<template>
  <div class="demo-chip-primitive" :class="`demo-chip-primitive--${layer.key}`">
    <section class="demo-chip-block demo-chip-role">
      <header class="demo-chip-subsection__header">
        <h5>Role boundary</h5>
        <p>
          系統產生的短狀態、屬性與數量使用 UiChip；任何可點擊、可選或可移除
          的內容都改用相符的互動元件。
        </p>
      </header>

      <div class="demo-chip-role__grid">
        <article class="demo-chip-role__item" data-chip-role="static">
          <strong>Static badge／label</strong>
          <span>status · attribute · count</span>
        </article>
        <article class="demo-chip-role__item" data-chip-role="interactive">
          <strong>Not UiChip</strong>
          <span>filter · dismiss · action · navigation</span>
        </article>
      </div>
    </section>

    <section class="demo-chip-block demo-chip-geometry">
      <header class="demo-chip-subsection__header">
        <h5>尺寸與寬度</h5>
        <p>
          {{
            layerText(
              '靜態 label 不套用 32／36px action floor；density 只調整 compact box。',
              '現行高度由 14px label line-height、padding 與全域 border-box 共同決定。',
            )
          }}
        </p>
      </header>

      <div class="demo-chip-size-list">
        <article
          v-for="size in layer.sizes"
          :key="size[0]"
          class="demo-chip-size"
          :class="`demo-chip-size--${size[0]}`"
          :data-chip-size="size[0]"
        >
          <h6>{{ size[1] }}</h6>
          <component :is="layer.component" tone="muted">本機資料</component>
        </article>
      </div>

      <div class="demo-chip-width-list">
        <article class="demo-chip-width" data-chip-width="intrinsic">
          <h6>Intrinsic · fit content／no fixed max</h6>
          <component :is="layer.component" tone="muted">FLAC</component>
        </article>
        <article class="demo-chip-width" data-chip-width="bounded">
          <h6>
            {{
              layerText(
                'Bounded · parent width／ellipsis when necessary',
                'Bounded parent · no authored truncation',
              )
            }}
          </h6>
          <div class="demo-chip-bounded">
            <component
              :is="layer.component"
              tone="accent"
              title="東京事変／椎名林檎／非常に長い資料分類標籤"
            >
              東京事変／椎名林檎／非常に長い資料分類標籤
            </component>
          </div>
        </article>
      </div>
    </section>

    <section class="demo-chip-block demo-chip-anatomy">
      <header class="demo-chip-subsection__header">
        <h5>Owned anatomy</h5>
        <p>
          Container 包住 concise label；leading icon
          只作可選裝飾，不能取代文字。
        </p>
      </header>

      <div class="demo-chip-anatomy-list">
        <article data-chip-anatomy="container">
          <span class="demo-chip-anatomy__marker">Container</span>
          <component :is="layer.component" tone="muted">資料來源</component>
        </article>
        <article data-chip-anatomy="leading-icon">
          <span class="demo-chip-anatomy__marker">Optional leading icon</span>
          <component :is="layer.component" tone="success">
            <template v-if="layer.key === 'candidate'" #leading>
              <BadgeCheck :size="ICON_SIZE" aria-hidden="true" />
            </template>
            <BadgeCheck
              v-if="layer.key === 'current'"
              :size="ICON_SIZE"
              aria-hidden="true"
            />
            真實資料
          </component>
        </article>
        <article data-chip-anatomy="label">
          <span class="demo-chip-anatomy__marker">Visible label</span>
          <component :is="layer.component" tone="info">處理中</component>
        </article>
      </div>
    </section>

    <section class="demo-chip-block demo-chip-content">
      <header class="demo-chip-subsection__header">
        <h5>內容與 overflow</h5>
        <p>
          短而明確是預設；無法避免的系統／使用者長值由 parent 限寬，並以 native
          title 補回完整內容。Group 應 wrap，不使用 marquee。
        </p>
      </header>

      <div class="demo-chip-content-list">
        <div
          v-for="item in CONTENT_ITEMS"
          :key="item.id"
          class="demo-chip-content__item"
          :class="{ 'demo-chip-content__item--bounded': item.bounded }"
          :data-chip-content="item.id"
        >
          <span class="demo-chip-item__label">{{ item.id }}</span>
          <div :class="{ 'demo-chip-bounded': item.bounded }">
            <component
              :is="layer.component"
              :tone="item.tone"
              :title="item.bounded ? String(item.label) : undefined"
            >
              {{ item.label }}
            </component>
          </div>
        </div>

        <div class="demo-chip-content__item" data-chip-content="icon-label">
          <span class="demo-chip-item__label">icon-label</span>
          <component :is="layer.component" tone="success">
            <template v-if="layer.key === 'candidate'" #leading>
              <BadgeCheck :size="ICON_SIZE" aria-hidden="true" />
            </template>
            <BadgeCheck
              v-if="layer.key === 'current'"
              :size="ICON_SIZE"
              aria-hidden="true"
            />
            已驗證
          </component>
        </div>
      </div>
    </section>

    <section class="demo-chip-block demo-chip-tones">
      <header class="demo-chip-subsection__header">
        <h5>Semantic tones</h5>
        <p>
          內容類型、格式與來源預設維持 Neutral；只有需要操作員判斷的狀態才使用
          semantic tone。顏色只加速掃描；文字仍完整命名狀態。`gated`
          表示需確認功能邊界，不表示付費、權限不足或安全判定。
        </p>
      </header>

      <div class="demo-chip-tone-list">
        <article
          v-for="item in TONE_ITEMS"
          :key="item.id"
          class="demo-chip-tone"
        >
          <span class="demo-chip-item__label">{{ item.id }}</span>
          <component
            :is="layer.component"
            :tone="item.id"
            :data-chip-tone="item.id"
          >
            {{ toneLabel(item) }}
          </component>
        </article>
      </div>
    </section>

    <section class="demo-chip-block demo-chip-recipes">
      <header class="demo-chip-subsection__header">
        <h5>Context recipes</h5>
        <p>
          Chip 只擁有自己的 inline box；基線、可用寬度、群組順序與 reflow 由
          parent 擁有。
        </p>
      </header>

      <div class="demo-chip-recipe-list">
        <article class="demo-chip-recipe" data-chip-recipe="heading-status">
          <div class="demo-chip-recipe__heading">
            <strong>歌詞文件</strong>
            <component :is="layer.component" tone="success">已完成</component>
          </div>
          <span>Heading owns baseline／available width</span>
        </article>

        <article class="demo-chip-recipe" data-chip-recipe="metadata">
          <div class="demo-chip-recipe__line">
            <span>本機音訊</span>
            <component :is="layer.component" tone="muted">FLAC</component>
          </div>
          <span>Row owns order／alignment</span>
        </article>

        <article class="demo-chip-recipe" data-chip-recipe="count">
          <div class="demo-chip-recipe__line">
            <span>候選版本</span>
            <component :is="layer.component" tone="muted">24</component>
          </div>
          <span>Count meaning stays in adjacent copy</span>
        </article>

        <article class="demo-chip-recipe" data-chip-recipe="group-wrap">
          <div class="demo-chip-group" aria-label="模板特性">
            <component
              :is="layer.component"
              v-for="item in GROUP_ITEMS"
              :key="item.id"
              :tone="item.tone"
            >
              {{ item.label }}
            </component>
          </div>
          <span>Group owns 8px gap／wrap</span>
        </article>
      </div>
    </section>

    <section class="demo-chip-block demo-chip-contract">
      <header class="demo-chip-subsection__header">
        <h5>ARIA／Public contract</h5>
        <p>
          Plain text 不需要額外 role；狀態更新的 announcement 放在擁有更新時機的
          parent。
        </p>
      </header>

      <div class="demo-chip-announcement" role="status" aria-live="polite">
        <span>分析狀態</span>
        <component :is="layer.component" tone="info">處理中</component>
      </div>

      <div class="demo-chip-contracts" aria-label="UiChip public contract">
        <span>Native span · visible text is the accessible content</span>
        <span>Parent owns role=status／aria-live when the value changes</span>
        <span>tone · 8 semantic labels</span>
        <span>default slot · concise visible label</span>
        <span>attrs · native span fallthrough</span>
        <span>background／color · Current compatibility escape hatch</span>
        <span>No action／filter／dismiss／navigation behavior</span>
        <span
          >No hover／pressed／focus／selected／remove／disabled contract</span
        >
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-chip-primitive,
.demo-chip-block,
.demo-chip-subsection__header,
.demo-chip-size,
.demo-chip-width,
.demo-chip-role__item,
.demo-chip-tone,
.demo-chip-recipe {
  min-width: 0;
  display: grid;
}

.demo-chip-primitive {
  gap: var(--ui-space-6);
}

.demo-chip-block {
  gap: var(--ui-space-3);
}

.demo-chip-block + .demo-chip-block {
  padding-block-start: var(--ui-space-5);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-chip-subsection__header {
  grid-template-columns: minmax(9rem, 0.3fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-chip-subsection__header h5,
.demo-chip-subsection__header p,
.demo-chip-size h6,
.demo-chip-width h6,
.demo-chip-recipe > span {
  margin: 0;
}

.demo-chip-subsection__header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-title);
}

.demo-chip-subsection__header p,
.demo-chip-role__item span,
.demo-chip-size h6,
.demo-chip-width h6,
.demo-chip-item__label,
.demo-chip-recipe > span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-chip-role__grid,
.demo-chip-size-list,
.demo-chip-width-list,
.demo-chip-anatomy-list,
.demo-chip-content-list,
.demo-chip-tone-list,
.demo-chip-recipe-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-chip-role__item,
.demo-chip-size,
.demo-chip-width,
.demo-chip-content__item,
.demo-chip-tone,
.demo-chip-recipe,
.demo-chip-anatomy-list article {
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

.demo-chip-role__item strong,
.demo-chip-recipe__heading strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-chip-size--standard {
  --demo-chip-height: 1.5rem;
}

.demo-chip-size--compact {
  --demo-chip-height: 1.25rem;
}

.demo-chip-size :deep(.ui-chip) {
  justify-self: start;
}

.demo-chip-width > :deep(.ui-chip) {
  justify-self: start;
}

.demo-chip-bounded {
  min-width: 0;
  width: min(13rem, 100%);
  overflow: hidden;
}

.demo-chip-anatomy-list article,
.demo-chip-content__item,
.demo-chip-tone {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.demo-chip-anatomy-list article {
  justify-content: space-between;
}

.demo-chip-anatomy__marker {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.demo-chip-content__item,
.demo-chip-tone {
  justify-content: space-between;
}

.demo-chip-content__item--bounded {
  display: grid;
  grid-template-columns: minmax(5rem, auto) minmax(0, 1fr);
}

.demo-chip-recipe__heading,
.demo-chip-recipe__line,
.demo-chip-announcement,
.demo-chip-group {
  min-width: 0;
  display: flex;
  align-items: center;
}

.demo-chip-recipe__heading,
.demo-chip-recipe__line,
.demo-chip-announcement {
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.demo-chip-group {
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-chip-announcement {
  width: min(18rem, 100%);
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
}

.demo-chip-contracts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-chip-contracts span {
  padding: var(--ui-space-1) var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

@container (max-width: 44rem) {
  .demo-chip-subsection__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}

@container (max-width: 24rem) {
  .demo-chip-content__item--bounded {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
