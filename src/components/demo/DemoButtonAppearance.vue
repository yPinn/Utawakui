<script setup>
import { Download, Repeat } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiButtonGroup from '../ui/UiButtonGroup.vue';
import UiTextField from '../ui/UiTextField.vue';
import '../../styles/demoSpecimens.css';

const DENSITIES = [
  ['standard', 'Standard · 36 CSS px'],
  ['compact', 'Compact · 32 CSS px'],
];

const HIERARCHY = [
  ['accent', 'Primary · Accent fill', '主要動作'],
  ['secondary', 'Secondary · 靜止可辨識', '次要動作'],
  ['ghost', 'Ghost · 只供 toolbar／tertiary context', '第三層動作'],
];

const WIDTHS = [
  ['intrinsic', 'Intrinsic · content-sized'],
  ['constrained', 'Constrained parent · 12rem'],
  ['fluid', 'Parent-owned full width · 100%'],
];

const CONTENT = [
  ['short', 'Short CJK', '保存'],
  ['long-cjk', 'Long CJK', '匯出目前演出清單並保留所有導唱與輸出設定'],
  [
    'long-latin',
    'Long Latin',
    'Export the current performance set while preserving every guide-vocal and output setting',
  ],
  ['multilingual', 'Multilingual', '繁體中文／日本語／한국어／English'],
  ['number', 'Number', '套用 120 BPM'],
];

const STATES = [
  ['default', 'Default'],
  ['hover', 'Hover'],
  ['pressed', 'Pressed'],
  ['focus', 'Focus-visible'],
  ['active', 'Active toggle'],
  ['disabled', 'Disabled'],
  ['aria-disabled', 'ARIA-disabled · 可聚焦'],
  ['loading', 'Loading'],
];

const CONTRACT = [
  'type · button／submit／reset',
  'variant · secondary／ghost／accent；intent · neutral／danger',
  'active · visual state；toggle caller supplies aria-pressed',
  'loading · native disabled＋aria-busy＋loadingLabel',
  '文字單行 ellipsis，不用 marquee；純圖示操作 → UiIconButton',
  'No size prop · No readonly',
];

function stateProps(state, variant) {
  return {
    variant,
    icon: state === 'active' || state === 'loading' ? Repeat : null,
    active: state === 'active',
    disabled: state === 'disabled',
    loading: state === 'loading',
    loadingLabel: '正在保存',
    'aria-pressed': state === 'active' ? true : undefined,
    'aria-disabled': state === 'aria-disabled' ? true : undefined,
  };
}
</script>

<template>
  <div class="demo-specimens" data-button-source="production">
    <p class="demo-specimens__copy">
      文字按鈕維持單行，尺寸依密度切換、寬度隨內容；純圖示操作使用
      UiIconButton。
    </p>

    <section class="demo-specimens__section">
      <h4>階層與意圖</h4>
      <div class="demo-specimens__grid" data-button-hierarchy-group>
        <article
          v-for="[variant, label, text] in HIERARCHY"
          :key="variant"
          class="demo-specimens__case"
          :data-button-hierarchy="variant"
        >
          <h5>{{ label }}</h5>
          <div class="demo-specimens__row">
            <UiButton :variant="variant">{{ text }}</UiButton>
          </div>
        </article>
        <article class="demo-specimens__case" data-button-intent="danger">
          <h5>Destructive · Ghost／Secondary／Accent</h5>
          <div class="demo-specimens__row">
            <UiButton intent="danger">移除</UiButton>
            <UiButton variant="secondary" intent="danger">刪除</UiButton>
            <UiButton variant="accent" intent="danger">確認刪除</UiButton>
          </div>
        </article>
        <article class="demo-specimens__case" data-button-group>
          <h5>Button group · 共用外框與分隔</h5>
          <UiButtonGroup label="Button group anatomy">
            <UiButton aria-label="前一項">前一項</UiButton>
            <UiButton aria-label="下一項">下一項</UiButton>
          </UiButtonGroup>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>密度、寬度與欄位同列</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, label] in DENSITIES"
          :key="key"
          class="demo-specimens__case"
          :class="`demo-specimens__density--${key}`"
          :data-button-size="key"
        >
          <h5>{{ label }}</h5>
          <div class="demo-button__field-row" :data-button-field-row="key">
            <UiTextField
              :id="`demo-button-field-${key}`"
              label="曲目名稱"
              label-hidden
              model-value="雨愛"
            />
            <UiButton variant="secondary" :icon="Download">套用</UiButton>
          </div>
        </article>
        <article
          v-for="[key, label] in WIDTHS"
          :key="key"
          class="demo-specimens__case"
          :data-button-width="key"
        >
          <h5>{{ label }}</h5>
          <div :class="`demo-button__width--${key}`">
            <UiButton variant="secondary" :icon="Download">
              匯出目前演出清單與所有設定
            </UiButton>
          </div>
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
          :data-button-content="key"
        >
          <h5>{{ label }}</h5>
          <div class="demo-specimens__row">
            <UiButton variant="secondary">{{ text }}</UiButton>
          </div>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>狀態</h4>
      <p class="demo-specimens__copy">
        Secondary／Accent 同時檢查；hover、pressed 與 active toggle
        保持不同語意，Hover／Pressed／Focus 為固定預覽。
      </p>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, label] in STATES"
          :key="key"
          class="demo-specimens__case"
          :data-button-state="key"
        >
          <h5>{{ label }}</h5>
          <div class="demo-specimens__row">
            <UiButton v-bind="stateProps(key, 'secondary')">次要動作</UiButton>
            <UiButton v-bind="stateProps(key, 'accent')">主要動作</UiButton>
          </div>
        </article>
      </div>
    </section>

    <ul class="demo-specimens__contract" aria-label="UiButton public contract">
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-button__field-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--ui-space-2);
}

.demo-button__width--constrained {
  width: min(12rem, 100%);
}

.demo-button__width--fluid :deep(.ui-btn) {
  width: 100%;
}

/* Static previews of pointer and keyboard states. */
.demo-specimens__case[data-button-state='hover'] :deep(.ui-btn--secondary) {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-specimens__case[data-button-state='hover'] :deep(.ui-btn--accent) {
  background: var(--ui-color-accent-hover);
}

.demo-specimens__case[data-button-state='pressed'] :deep(.ui-btn--secondary) {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-active);
  color: var(--ui-color-text);
}

.demo-specimens__case[data-button-state='pressed'] :deep(.ui-btn--accent) {
  background: var(--ui-color-accent-active);
}

.demo-specimens__case[data-button-state='focus'] :deep(button) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
