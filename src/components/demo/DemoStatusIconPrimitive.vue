<script setup>
import { computed } from 'vue';

import {
  BadgeCheck,
  Captions,
  Check,
  CircleAlert,
  CircleDashed,
  CircleX,
  Info,
  Loader2,
  Power,
  Volume2,
} from '../../icons/index.js';

const props = defineProps({
  layer: { type: Object, required: true },
});

const SEMANTIC_TONES = [
  { id: 'muted', label: '待命', icon: CircleDashed },
  { id: 'accent', label: '已選取', icon: Check },
  { id: 'info', label: '資訊', icon: Info },
  { id: 'success', label: '已完成', icon: BadgeCheck },
  { id: 'warning', label: '需注意', icon: CircleAlert },
  { id: 'danger', label: '失敗', icon: CircleX },
  { id: 'current', label: '目前播放', icon: Volume2 },
  {
    id: 'gated',
    label: '需確認',
    currentLabel: '需啟用',
    icon: Power,
  },
];

const CURRENT_COMPATIBILITY_TONES = [
  { id: 'text', label: '主要文字色', icon: Info, compatibility: true },
  {
    id: 'highlight',
    label: '未掃描歌詞',
    icon: Captions,
    compatibility: true,
  },
];

const toneItems = computed(() =>
  props.layer.includeCompatibilityTones
    ? [...SEMANTIC_TONES, ...CURRENT_COMPATIBILITY_TONES]
    : SEMANTIC_TONES,
);

function sizeProps(size) {
  return props.layer.key === 'candidate' ? { size } : {};
}

function toneLabel(item) {
  return props.layer.key === 'current' && item.currentLabel
    ? item.currentLabel
    : item.label;
}
</script>

<template>
  <div
    class="demo-status-icon-primitive"
    :class="`demo-status-icon-primitive--${layer.key}`"
  >
    <section class="demo-status-icon-block demo-status-icon-role">
      <header class="demo-status-icon-subsection__header">
        <h5>Role boundary</h5>
        <p>
          純圖示狀態用 UiStatusIcon；有可見短文字／數量用
          UiChip，可點擊則交給原生互動元件。
        </p>
      </header>

      <div class="demo-status-icon-role__grid">
        <article data-status-icon-role="icon-status">
          <strong>Status icon</strong>
          <span>glyph · tone · concise accessible label</span>
        </article>
        <article data-status-icon-role="not-status-icon">
          <strong>Not UiStatusIcon</strong>
          <span>text badge · count · action · control overlay</span>
        </article>
      </div>
    </section>

    <section class="demo-status-icon-block demo-status-icon-geometry">
      <header class="demo-status-icon-subsection__header">
        <h5>尺寸與 anatomy</h5>
        <p>
          {{
            layer.key === 'candidate'
              ? 'Standard／Compact 與 UiChip inline box 對齊；glyph 固定 16 unit。'
              : '現行 width／height 由 24px spacing token 擁有，glyph 為 16 unit。'
          }}
        </p>
      </header>

      <div class="demo-status-icon-size-list">
        <article
          v-for="size in layer.sizes"
          :key="size[0]"
          class="demo-status-icon-size"
          :data-status-icon-size="size[0]"
        >
          <h6>{{ size[1] }}</h6>
          <component
            :is="layer.component"
            v-bind="sizeProps(size[0])"
            :icon="Info"
            tone="info"
            label="資訊"
          />
        </article>
      </div>

      <div class="demo-status-icon-anatomy-list">
        <article data-status-icon-anatomy="container">
          <span class="demo-status-icon-anatomy__label">Circle container</span>
          <component
            :is="layer.component"
            :icon="CircleAlert"
            tone="warning"
            label="需注意"
          />
        </article>
        <article data-status-icon-anatomy="glyph">
          <span class="demo-status-icon-anatomy__label">16-unit glyph</span>
          <component
            :is="layer.component"
            :icon="BadgeCheck"
            tone="success"
            label="已完成"
          />
        </article>
      </div>
    </section>

    <section class="demo-status-icon-block demo-status-icon-tones">
      <header class="demo-status-icon-subsection__header">
        <h5>Semantic tones</h5>
        <p>
          內容類型、格式與來源預設維持 Neutral；只有需要操作員判斷的狀態才使用
          semantic tone。圖示、形狀與 concise label
          共同傳達狀態；顏色只加速掃描。gated
          表示進入流程前需確認，不表示權限不足。
        </p>
      </header>

      <div class="demo-status-icon-tone-list">
        <article
          v-for="item in toneItems"
          :key="item.id"
          class="demo-status-icon-tone"
          :data-status-icon-compatibility="
            item.compatibility ? 'current-only' : undefined
          "
        >
          <component
            :is="layer.component"
            :icon="item.icon"
            :tone="item.id"
            :label="toneLabel(item)"
            :data-status-icon-tone="item.id"
            decorative
          />
          <span class="demo-status-icon-tone__label">{{
            toneLabel(item)
          }}</span>
          <small v-if="item.compatibility">Current compatibility only</small>
        </article>
      </div>
    </section>

    <section class="demo-status-icon-block demo-status-icon-motion">
      <header class="demo-status-icon-subsection__header">
        <h5>Motion</h5>
        <p>
          Static container／spinning glyph；旋轉只表示正在處理，reduced motion
          回到靜態 glyph。
        </p>
      </header>

      <div class="demo-status-icon-motion-list">
        <article data-status-icon-motion="static">
          <component
            :is="layer.component"
            :icon="Info"
            tone="info"
            label="資訊"
            decorative
          />
          <span class="demo-status-icon-motion__label">靜態資訊</span>
        </article>
        <article data-status-icon-motion="spinning">
          <component
            :is="layer.component"
            :icon="Loader2"
            tone="info"
            label="處理中"
            spinning
            decorative
          />
          <span class="demo-status-icon-motion__label">處理中</span>
        </article>
      </div>
    </section>

    <section class="demo-status-icon-block demo-status-icon-recipes">
      <header class="demo-status-icon-subsection__header">
        <h5>Context recipes</h5>
        <p>
          元件只擁有 inline icon box；row、selection、可見狀態句與 announcement
          由 parent 組合。
        </p>
      </header>

      <div class="demo-status-icon-recipe-list">
        <article data-status-icon-recipe="row-trail">
          <div class="demo-status-icon-recipe__row">
            <span class="demo-status-icon-recipe__label"
              >東京事変 — 群青日和</span
            >
            <component
              :is="layer.component"
              :icon="BadgeCheck"
              tone="success"
              label="下載完成"
            />
          </div>
          <small>Row trail · icon owns the status name</small>
        </article>

        <article data-status-icon-recipe="selection">
          <div class="demo-status-icon-recipe__row">
            <span class="demo-status-icon-recipe__label"
              >使用系統安裝的 FFmpeg</span
            >
            <component
              :is="layer.component"
              :icon="Check"
              tone="accent"
              label="已選取"
            />
          </div>
          <small>Selection row · option and status form one sentence</small>
        </article>

        <article data-status-icon-recipe="adjacent-text">
          <div class="demo-status-icon-recipe__row">
            <span class="demo-status-icon-recipe__label">目前播放</span>
            <component
              :is="layer.component"
              :icon="Volume2"
              tone="current"
              label="目前播放"
              decorative
            />
          </div>
          <small>Visible text owns meaning · icon is decorative</small>
        </article>

        <article data-status-icon-recipe="live-region">
          <div
            class="demo-status-icon-recipe__row"
            role="status"
            aria-live="polite"
          >
            <span class="demo-status-icon-recipe__label">音訊模型處理中</span>
            <component
              :is="layer.component"
              :icon="Loader2"
              tone="info"
              label="處理中"
              spinning
              decorative
            />
          </div>
          <small>Parent owns role=status／aria-live and full sentence</small>
        </article>
      </div>
    </section>

    <section class="demo-status-icon-block demo-status-icon-contract">
      <header class="demo-status-icon-subsection__header">
        <h5>ARIA／Public contract</h5>
        <p>
          意義獨立時是 named image；可見文字已完整重複時從 accessibility tree
          隱藏。更新宣告不屬於 primitive。
        </p>
      </header>

      <div class="demo-status-icon-aria-list">
        <article data-status-icon-aria="standalone">
          <component
            :is="layer.component"
            :icon="BadgeCheck"
            tone="success"
            label="已完成"
          />
          <span class="demo-status-icon-aria__label"
            >Standalone icon · concise accessible label</span
          >
        </article>
        <article data-status-icon-aria="decorative">
          <component
            :is="layer.component"
            :icon="BadgeCheck"
            tone="success"
            label="已完成"
            decorative
          />
          <span class="demo-status-icon-aria__label"
            >Decorative duplicate · adjacent text owns meaning</span
          >
        </article>
      </div>

      <div
        class="demo-status-icon-contracts"
        aria-label="UiStatusIcon public contract"
      >
        <span>Native span · non-interactive inline status</span>
        <span>icon · required project-owned component</span>
        <span>label · required concise status name</span>
        <span>decorative · hides duplicated meaning</span>
        <span>spinning · glyph only／reduced-motion safe</span>
        <span>tone · Current 10／Candidate 8 semantic names</span>
        <span>attrs · native span fallthrough</span>
        <span>No action／focus／disabled／separate tooltip prop</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-status-icon-primitive,
.demo-status-icon-block,
.demo-status-icon-subsection__header,
.demo-status-icon-size,
.demo-status-icon-role__grid article,
.demo-status-icon-recipe-list article {
  min-width: 0;
  display: grid;
}

.demo-status-icon-primitive {
  gap: var(--ui-space-6);
}

.demo-status-icon-block {
  gap: var(--ui-space-3);
}

.demo-status-icon-block + .demo-status-icon-block {
  padding-block-start: var(--ui-space-5);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-status-icon-subsection__header {
  grid-template-columns: minmax(9rem, 0.3fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-status-icon-subsection__header h5,
.demo-status-icon-subsection__header p,
.demo-status-icon-size h6,
.demo-status-icon-recipe-list small {
  margin: 0;
}

.demo-status-icon-subsection__header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-title);
}

.demo-status-icon-subsection__header p,
.demo-status-icon-role__grid span,
.demo-status-icon-size h6,
.demo-status-icon-recipe-list small,
.demo-status-icon-tone small {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-status-icon-role__grid,
.demo-status-icon-size-list,
.demo-status-icon-anatomy-list,
.demo-status-icon-tone-list,
.demo-status-icon-motion-list,
.demo-status-icon-recipe-list,
.demo-status-icon-aria-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-status-icon-role__grid article,
.demo-status-icon-size,
.demo-status-icon-anatomy-list article,
.demo-status-icon-tone,
.demo-status-icon-motion-list article,
.demo-status-icon-recipe-list article,
.demo-status-icon-aria-list article {
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

.demo-status-icon-role__grid strong,
.demo-status-icon-tone__label,
.demo-status-icon-motion__label,
.demo-status-icon-anatomy__label,
.demo-status-icon-recipe__label,
.demo-status-icon-aria__label {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-status-icon-size :deep(.ui-status-icon) {
  justify-self: start;
}

.demo-status-icon-anatomy-list article,
.demo-status-icon-tone,
.demo-status-icon-motion-list article,
.demo-status-icon-aria-list article,
.demo-status-icon-recipe__row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.demo-status-icon-anatomy-list article,
.demo-status-icon-recipe__row {
  justify-content: space-between;
}

.demo-status-icon-tone {
  flex-wrap: wrap;
}

.demo-status-icon-tone small {
  flex-basis: 100%;
}

.demo-status-icon-recipe__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-status-icon-contracts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-status-icon-contracts span {
  padding: var(--ui-space-1) var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

@container (max-width: 44rem) {
  .demo-status-icon-subsection__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>
