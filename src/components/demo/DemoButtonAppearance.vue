<script setup>
import { Download, Repeat } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiTextField from '../ui/UiTextField.vue';
import DemoCandidateButton from './DemoCandidateButton.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 候選 Button',
    note: '一般文字動作使用穩定單行與 36／32px target；純圖示操作仍由 UiIconButton 擁有。',
    overflowNote: '受限寬度採靜態單行 ellipsis；按鈕文案不使用 marquee。',
    secondaryVariant: 'secondary',
    secondaryLabel: 'Secondary',
    statePair: 'Secondary／Accent',
    appearanceContract: 'variant · secondary／ghost／accent',
    publicNote:
      'Candidate 將可辨識的 Secondary 與 contextual Ghost 分責，但仍不加入產品領域語意。',
    iconBoundary: '純圖示操作 → UiIconButton',
    contractBoundary: 'No size prop · No readonly · No destructive variant',
    component: DemoCandidateButton,
    sizes: [
      ['standard', 'Standard · 36 CSS px'],
      ['compact', 'Compact · 32 CSS px'],
    ],
  },
  {
    key: 'current',
    title: '現行 UiButton',
    note: '以 active token 快照顯示 30px control；不繼承 Candidate 的尺寸與色彩。',
    overflowNote:
      '沒有元件級 truncation；受限標本只裁掉溢出區域，保留 Current 真值。',
    secondaryVariant: 'ghost',
    secondaryLabel: 'Ghost',
    statePair: 'Current Ghost／Accent',
    appearanceContract: 'variant · ghost／accent',
    publicNote:
      '記錄現行 bounded API；Current 尚未提供靜止可辨識的 Secondary。',
    iconBoundary:
      '現行仍含 icon-only compatibility branch；新用法 → UiIconButton',
    contractBoundary:
      'No size prop · Legacy icon-only branch · No destructive variant',
    component: UiButton,
    sizes: [['active', 'Current · 30 CSS px']],
  },
];

const HIERARCHY = {
  candidate: [
    ['accent', 'Primary · Accent fill', '主要動作'],
    ['secondary', 'Secondary · 靜止可辨識', '次要動作'],
    ['ghost', 'Ghost · 只供 toolbar／tertiary context', '第三層動作'],
  ],
  current: [
    ['accent', 'Primary · Accent fill', '主要動作'],
    ['ghost', 'Current 沒有獨立 Secondary', '次要動作（現行 Ghost）'],
  ],
};

const WIDTH_CASES = [
  ['intrinsic', 'Intrinsic · content-sized', '按鈕本身只包住必要內容'],
  ['constrained', 'Constrained parent · 12rem', '長標籤由可用寬度裁切'],
  ['fluid', 'Parent-owned full width · 100%', '只有父層明確配置時才填滿'],
];

const CONTENT_CASES = [
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
  ['loading', 'Loading'],
];

const COVERAGE = {
  candidate: [
    ['default', 'Raised＋subtle border', 'Accent fill', 'Native button'],
    ['hover', 'Hover＋strong border', 'Accent hover', 'Pointer'],
    ['pressed', 'Active＋strong border', 'Accent active', ':active'],
    ['focus-visible', 'Indigo ring', 'Indigo ring', 'Keyboard'],
    [
      'active toggle',
      'Selected＋accent',
      'Accent fill',
      'aria-pressed caller-owned',
    ],
    ['disabled', '50%', '50% contrast-safe fill', 'disabled'],
    ['loading', 'Spinner＋label', 'Spinner＋label', 'disabled＋aria-busy'],
  ],
  current: [
    ['default', 'Transparent／muted', 'Accent fill', 'Native button'],
    ['hover', 'Hover surface／text', 'Accent hover', 'Pointer'],
    ['pressed', 'Same as hover', 'Same as hover', 'No authored :active'],
    ['focus-visible', 'Coral ring', 'Coral ring', 'Keyboard'],
    [
      'active toggle',
      'Selected＋accent',
      'Accent fill',
      'aria-pressed caller-owned',
    ],
    ['disabled', '50%', '50% contrast-safe fill', 'disabled'],
    ['loading', 'Spinner＋label', 'Spinner＋label', 'disabled＋aria-busy'],
  ],
};

function stateProps(state, variant) {
  return {
    variant,
    icon: state === 'active' || state === 'loading' ? Repeat : null,
    active: state === 'active',
    disabled: state === 'disabled',
    loading: state === 'loading',
    loadingLabel: '正在保存',
    'aria-pressed': state === 'active' ? true : undefined,
  };
}
</script>

<template>
  <div class="demo-button-appearance">
    <section
      v-for="layer in LAYERS"
      :key="layer.key"
      class="demo-button-layer"
      :class="`demo-button-layer--${layer.key}`"
      :data-button-source="layer.key"
      :data-demo-review-layer="layer.key"
    >
      <header class="demo-button-layer__header">
        <h4>{{ layer.title }}</h4>
        <p>{{ layer.note }}</p>
      </header>

      <section class="demo-button-subsection">
        <header class="demo-button-subsection__header">
          <h5>尺寸與寬度</h5>
          <p>
            Standard／Compact 是離散 Candidate；按鈕預設維持 intrinsic inline
            size。
          </p>
        </header>
        <div class="demo-button-size-grid">
          <article
            v-for="size in layer.sizes"
            :key="size[0]"
            class="demo-button-size"
            :class="`demo-button-size--${size[0]}`"
            :data-button-size="size[0]"
          >
            <span>{{ size[1] }}</span>
            <component :is="layer.component" variant="accent"
              >保存變更</component
            >
          </article>
        </div>
        <div class="demo-button-width-grid">
          <article
            v-for="widthCase in WIDTH_CASES"
            :key="widthCase[0]"
            class="demo-button-width"
            :class="`demo-button-width--${widthCase[0]}`"
            :data-button-width="widthCase[0]"
          >
            <span>{{ widthCase[1] }}</span>
            <component
              :is="layer.component"
              :variant="layer.secondaryVariant"
              :icon="Download"
            >
              匯出目前演出清單與所有設定
            </component>
            <small>{{ widthCase[2] }}</small>
          </article>
        </div>
        <div class="demo-button-hierarchy" data-button-hierarchy-group>
          <article
            v-for="action in HIERARCHY[layer.key]"
            :key="action[0]"
            :data-button-hierarchy="action[0]"
          >
            <span>{{ action[1] }}</span>
            <component :is="layer.component" :variant="action[0]">
              {{ action[2] }}
            </component>
          </article>
        </div>
      </section>

      <section class="demo-button-subsection">
        <header class="demo-button-subsection__header">
          <h5>Field composition</h5>
          <p>
            同列先對齊 control box，而非不同字重的文字 baseline；隱藏 label
            保留可存取名稱，不用空白 label 墊高。
          </p>
        </header>
        <div class="demo-button-field-grid">
          <article
            v-for="size in layer.sizes"
            :key="size[0]"
            class="demo-button-field-composition"
          >
            <span>{{ size[1] }}</span>
            <div
              class="demo-button-field-row"
              :class="`demo-button-field-row--${size[0]}`"
              :data-button-field-row="size[0]"
            >
              <UiTextField
                :id="`demo-button-field-${layer.key}-${size[0]}`"
                label="曲目名稱"
                label-hidden
                model-value="雨愛"
              />
              <component
                :is="layer.component"
                :variant="layer.secondaryVariant"
                :icon="Download"
              >
                套用
              </component>
            </div>
            <small>同一 density scope · control boxes 同高</small>
            <small>Row gap · 8 CSS px</small>
            <small>Icon／label gap · 4 CSS px</small>
          </article>
        </div>
      </section>

      <section class="demo-button-subsection">
        <header class="demo-button-subsection__header">
          <h5>Owned anatomy</h5>
          <p>
            一般按鈕只擁有 optional leading icon、label 與 loading replacement。
          </p>
        </header>
        <div class="demo-button-anatomy">
          <div class="demo-button-anatomy__specimens">
            <component
              :is="layer.component"
              :variant="layer.secondaryVariant"
              :icon="Download"
              data-button-anatomy="leading-icon"
            >
              匯出
            </component>
            <component
              :is="layer.component"
              data-button-anatomy="label"
              variant="accent"
            >
              保存
            </component>
            <component
              :is="layer.component"
              data-button-anatomy="loading"
              :variant="layer.secondaryVariant"
              loading
              loading-label="正在保存"
            >
              保存
            </component>
          </div>
          <ol class="demo-button-anatomy__map">
            <li><b>1</b><span>16-unit leading icon · optional</span></li>
            <li>
              <b>2</b><span>4px icon／label gap · stable single line</span>
            </li>
            <li>
              <b>3</b><span>Spinner＋loadingLabel replace idle content</span>
            </li>
            <li>
              <b>→</b><span>{{ layer.iconBoundary }}</span>
            </li>
          </ol>
        </div>
      </section>

      <section class="demo-button-subsection">
        <header class="demo-button-subsection__header">
          <h5>內容與 overflow</h5>
          <p>{{ layer.overflowNote }}</p>
        </header>
        <div class="demo-button-content-grid">
          <article
            v-for="contentCase in CONTENT_CASES"
            :key="contentCase[0]"
            :data-button-content="contentCase[0]"
          >
            <span>{{ contentCase[1] }}</span>
            <component
              :is="layer.component"
              :variant="layer.secondaryVariant"
              >{{ contentCase[2] }}</component
            >
          </article>
        </div>
      </section>

      <section class="demo-button-subsection">
        <header class="demo-button-subsection__header">
          <h5>狀態外觀與覆蓋</h5>
          <p>
            {{ layer.statePair }} 同時檢查；hover、pressed 與 active toggle
            保持不同語意。
          </p>
        </header>
        <div class="demo-button-state-grid">
          <article
            v-for="state in STATES"
            :key="state[0]"
            class="demo-button-state"
            :data-button-state="state[0]"
          >
            <span>{{ state[1] }}</span>
            <div>
              <component
                :is="layer.component"
                v-bind="stateProps(state[0], layer.secondaryVariant)"
              >
                次要動作
              </component>
              <component
                :is="layer.component"
                v-bind="stateProps(state[0], 'accent')"
              >
                主要動作
              </component>
            </div>
          </article>
        </div>
        <div
          class="demo-button-coverage"
          data-button-coverage-matrix
          tabindex="0"
          aria-label="Button 狀態覆蓋矩陣"
        >
          <table>
            <thead>
              <tr>
                <th>State</th>
                <th>{{ layer.secondaryLabel }}</th>
                <th>Accent</th>
                <th>Native／ARIA</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in COVERAGE[layer.key]" :key="row[0]">
                <th scope="row">{{ row[0] }}</th>
                <td>{{ row[1] }}</td>
                <td>{{ row[2] }}</td>
                <td>{{ row[3] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="demo-button-subsection">
        <header class="demo-button-subsection__header">
          <h5>Async 與 ARIA</h5>
          <p>
            Loading 阻止重複觸發；active 只供視覺，toggle 語意由 caller 明示。
          </p>
        </header>
        <div class="demo-button-async-grid">
          <article>
            <span>Async action</span>
            <component
              :is="layer.component"
              type="submit"
              variant="accent"
              :icon="Download"
              loading
              loading-label="正在保存"
            >
              保存
            </component>
            <small>native disabled · aria-busy="true" · loadingLabel</small>
          </article>
          <article>
            <span>Toggle action</span>
            <component
              :is="layer.component"
              :icon="Repeat"
              active
              :aria-pressed="true"
            >
              自動重複
            </component>
            <small>active visual state · caller-owned aria-pressed</small>
          </article>
        </div>
      </section>

      <section class="demo-button-subsection demo-button-api">
        <header class="demo-button-subsection__header">
          <h5>Public contract</h5>
          <p>{{ layer.publicNote }}</p>
        </header>
        <dl>
          <div>
            <dt>Native</dt>
            <dd>type · button／submit／reset</dd>
          </div>
          <div>
            <dt>Appearance</dt>
            <dd>{{ layer.appearanceContract }}</dd>
          </div>
          <div>
            <dt>Toggle</dt>
            <dd>active · visual state；toggle caller supplies aria-pressed</dd>
          </div>
          <div>
            <dt>Async</dt>
            <dd>disabled · loading · loadingLabel</dd>
          </div>
          <div>
            <dt>Content</dt>
            <dd>icon · default slot · native attrs／events</dd>
          </div>
          <div>
            <dt>Boundary</dt>
            <dd>{{ layer.contractBoundary }}</dd>
          </div>
        </dl>
      </section>
    </section>
  </div>
</template>

<style scoped>
.demo-button-appearance {
  container-type: inline-size;
  display: grid;
  gap: var(--ui-space-6);
}

.demo-button-layer {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-5);
}

.demo-button-layer__header,
.demo-button-subsection__header {
  display: grid;
  grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: baseline;
}

.demo-button-layer__header h4,
.demo-button-layer__header p,
.demo-button-subsection__header h5,
.demo-button-subsection__header p {
  margin: 0;
}

.demo-button-layer__header p,
.demo-button-subsection__header p,
.demo-button-width small,
.demo-button-field-composition small,
.demo-button-async-grid small {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-button-subsection {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.demo-button-size-grid,
.demo-button-width-grid,
.demo-button-hierarchy,
.demo-button-content-grid,
.demo-button-state-grid,
.demo-button-async-grid,
.demo-button-field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-button-size,
.demo-button-width,
.demo-button-field-composition,
.demo-button-content-grid article,
.demo-button-state,
.demo-button-async-grid article {
  min-width: 0;
  display: grid;
  align-content: start;
  justify-items: start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) dashed var(--ui-color-border-strong);
  border-radius: var(--ui-radius-md);
  overflow: hidden;
}

.demo-button-size > span,
.demo-button-width > span,
.demo-button-field-composition > span,
.demo-button-content-grid article > span,
.demo-button-state > span,
.demo-button-async-grid article > span {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-button-hierarchy {
  padding-block-start: var(--ui-space-1);
}

.demo-button-hierarchy article {
  min-width: 0;
  display: grid;
  align-content: start;
  justify-items: start;
  gap: var(--ui-space-2);
}

.demo-button-hierarchy span {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-button-size--standard {
  --demo-button-height: 2.25rem;
}

.demo-button-size--compact {
  --demo-button-height: 2rem;
}

.demo-button-size--active {
  --demo-button-height: 1.875rem;
}

.demo-button-field-row {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--ui-space-2);
}

.demo-button-field-row--standard {
  --demo-button-height: 2.25rem;
  --ui-field-height: 2.25rem;
  --ui-control-height: 2.25rem;
}

.demo-button-field-row--compact {
  --demo-button-height: 2rem;
  --ui-field-height: 2rem;
  --ui-control-height: 2rem;
}

.demo-button-field-row--active {
  --demo-button-height: 1.875rem;
  --ui-field-height: 1.875rem;
  --ui-control-height: 1.875rem;
}

.demo-button-width--constrained {
  width: min(12rem, 100%);
}

.demo-button-width--fluid {
  width: 100%;
}

.demo-button-width--fluid :deep(.ui-btn),
.demo-button-width--fluid :deep(.demo-candidate-btn) {
  width: 100%;
}

.demo-button-anatomy {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(14rem, 0.75fr);
  gap: var(--ui-space-4);
}

.demo-button-anatomy__specimens,
.demo-button-anatomy__map {
  min-width: 0;
  display: grid;
  align-content: start;
  justify-items: start;
  gap: var(--ui-space-3);
}

.demo-button-anatomy__map {
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo-button-anatomy__map li {
  min-width: 0;
  display: grid;
  grid-template-columns: var(--ui-space-5) minmax(0, 1fr);
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-button-anatomy__map b {
  color: var(--ui-color-accent);
}

.demo-button-content-grid article :deep(button) {
  max-width: 100%;
}

.demo-button-state > div {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-button-state[data-button-state='hover']
  :deep(.demo-candidate-btn--secondary) {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-button-state[data-button-state='hover'] :deep(.ui-btn--ghost) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-button-state[data-button-state='hover']
  :deep(.demo-candidate-btn--accent),
.demo-button-state[data-button-state='hover'] :deep(.ui-btn--accent) {
  background: var(--ui-color-accent-hover);
}

.demo-button-state[data-button-state='pressed']
  :deep(.demo-candidate-btn--secondary) {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-active);
  color: var(--ui-color-text);
}

.demo-button-state[data-button-state='pressed']
  :deep(.demo-candidate-btn--accent) {
  background: var(--ui-color-accent-active);
}

.demo-button-layer--current
  .demo-button-state[data-button-state='pressed']
  :deep(.ui-btn--ghost) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-button-layer--current
  .demo-button-state[data-button-state='pressed']
  :deep(.ui-btn--accent) {
  background: var(--ui-color-accent-hover);
}

.demo-button-state[data-button-state='focus'] :deep(button) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-button-coverage {
  min-width: 0;
  overflow-x: auto;
  outline: none;
}

.demo-button-coverage:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-button-coverage table {
  width: 100%;
  min-width: 42rem;
  border-collapse: collapse;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-button-coverage th,
.demo-button-coverage td {
  padding: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
  text-align: start;
}

.demo-button-coverage th {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-button-api dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-2);
  margin: 0;
}

.demo-button-api dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-button-api dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-button-layer--candidate {
  --demo-button-height: var(--ui-control-height);
}

.demo-button-layer--current {
  --ui-control-height: 1.875rem;
  --ui-field-height: 1.875rem;
  --ui-field-padding-block: 0.25rem;
  --ui-field-padding-inline: 0.5rem;
  --ui-field-radius: 0.375rem;
  --ui-field-bg: #344046;
  --ui-field-bg-hover: #3a464c;
  --ui-field-fg: #f7f1e7;
  --ui-field-placeholder: #aeb8b6;
  --ui-field-border: #3c4749;
  --ui-field-border-hover: #536165;
  --ui-field-border-invalid: #dd7078;
  --ui-color-surface-hover: #344046;
  --ui-color-surface-active: #3a464c;
  --ui-color-surface-selected: #25474a;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
  --ui-color-accent: #55a2a7;
  --ui-color-accent-hover: #6ab4b8;
  --ui-color-accent-contrast: #102326;
  --ui-color-accent-contrast-muted: color-mix(
    in srgb,
    var(--ui-color-accent-contrast) 75%,
    var(--ui-color-accent)
  );
  --ui-color-focus: #dd7a64;
  --ui-motion-duration-feedback: 100ms;
  --ui-motion-duration-slow: 280ms;
  --ui-motion-easing-standard: ease-out;
}

:global(:root[data-ui-theme='light'] .demo-button-layer--current) {
  --ui-field-bg: #edf2ef;
  --ui-field-bg-hover: #e4ece8;
  --ui-field-fg: #1f2328;
  --ui-field-placeholder: #69747a;
  --ui-field-border: #d8ded9;
  --ui-field-border-hover: #b9c4c0;
  --ui-field-border-invalid: #bd5961;
  --ui-color-surface-hover: #edf2ef;
  --ui-color-surface-active: #e4ece8;
  --ui-color-surface-selected: #dceee9;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
  --ui-color-accent: #327a7f;
  --ui-color-accent-hover: #286a6e;
  --ui-color-accent-contrast: #fffdfa;
  --ui-color-focus: #d26a45;
}

@container (max-width: 48rem) {
  .demo-button-layer__header,
  .demo-button-subsection__header,
  .demo-button-anatomy {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-button-layer__header,
  .demo-button-subsection__header {
    gap: var(--ui-space-1);
  }
}

@container (max-width: 32rem) {
  .demo-button-field-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-button-field-row :deep(.ui-btn),
  .demo-button-field-row :deep(.demo-candidate-btn) {
    width: 100%;
  }
}
</style>
