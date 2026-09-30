<script setup>
import {
  Download,
  Ellipsis,
  Moon,
  Play,
  Repeat,
  Settings,
} from '../../icons/index.js';
import UiScrollRegion from '../ui/UiScrollRegion.vue';

defineProps({
  layer: { type: Object, required: true },
});

const ANATOMY = [
  ['glyph', '1', '固定 16-unit decorative glyph；不隨 target 放大。'],
  ['target', '2', 'md／lg target 尺寸與 glyph 分責。'],
  ['appearance', '3', 'ghost／accent／overlay 只處理視覺層級。'],
  ['shape', '4', 'square · routine toolbar；circle · primary transport。'],
  [
    'stretch',
    '5',
    'inherit＋stretch · parent-owned hit area；不提供一般 full-width。',
  ],
  ['fill', '6', 'fill 只控制 glyph rendering，不代表 selected。'],
];

const CONTENT = [
  ['cjk', 'Short CJK', '播放目前曲目', Play],
  [
    'latin',
    'Long Latin',
    'Open the detailed performance routing and monitoring settings',
    Settings,
  ],
  [
    'long-cjk',
    'Long CJK',
    '播放目前選取的東京事変演出清單並切換至主舞台輸出',
    Play,
  ],
  ['multilingual', 'Multilingual', '繁體中文／日本語／한국어／English', Moon],
  ['number', 'Number', '套用 120 BPM', Repeat],
];

const STATES = [
  ['default', 'Default'],
  ['hover', 'Hover'],
  ['pressed', 'Pressed'],
  ['focus', 'Focus-visible'],
  ['active', 'Active toggle'],
  ['disabled', 'Disabled'],
];

const COVERAGE = {
  candidate: [
    ['default', 'Transparent／muted', 'Accent fill', '55% scrim'],
    ['hover', 'Hover surface', 'Accent hover', '68% scrim'],
    ['pressed', 'Active surface', 'Accent active', '78% scrim'],
    ['focus-visible', 'Indigo ring', 'Indigo ring', 'Indigo ring'],
    ['active toggle', 'Selected＋accent', 'Accent fill', 'Caller-defined'],
    [
      'disabled',
      'Native disabled＋50%',
      'Native disabled＋50%',
      'Native disabled＋50%',
    ],
  ],
  current: [
    ['default', 'Transparent／muted', 'Accent fill', '55% scrim'],
    ['hover', 'Hover surface', 'Accent hover', 'Same as default'],
    ['pressed', 'Active surface', 'Same as hover', 'Same as default'],
    ['focus-visible', 'Coral ring', 'Coral ring', 'Coral ring'],
    ['active toggle', 'Selected＋accent', 'Accent fill', 'Caller-defined'],
    [
      'disabled',
      'Native disabled＋50%',
      'Native disabled＋50%',
      'Native disabled＋50%',
    ],
  ],
};

function stateProps(state, variant) {
  return {
    icon: variant === 'ghost' ? Repeat : variant === 'accent' ? Play : Ellipsis,
    label: `${variant} ${state}`,
    variant,
    active: state === 'active',
    disabled: state === 'disabled',
    'aria-pressed': state === 'active' ? true : undefined,
  };
}
</script>

<template>
  <section
    class="demo-icon-button-contract-group demo-icon-button-contract-group--primitive"
    data-icon-button-group="primitive"
  >
    <header class="demo-icon-button-group-header">
      <h5>Primitive 提供內容</h5>
      <p>只列 context-neutral 的尺寸、外觀、狀態與 native contract。</p>
    </header>

    <section class="demo-icon-button-subsection">
      <header class="demo-icon-button-subsection__header">
        <h6>尺寸與 glyph</h6>
        <p>
          Routine、Primary transport 與 glyph 分責，不用圖示大小補償 target。
        </p>
      </header>
      <div class="demo-icon-button-size-grid">
        <article
          v-for="sizeCase in layer.sizes"
          :key="sizeCase[0]"
          class="demo-icon-button-size"
          :class="`demo-icon-button-size--${sizeCase[1]}`"
          :data-icon-button-size="sizeCase[0]"
        >
          <span>{{ sizeCase[3] }}</span>
          <component
            :is="layer.component"
            :icon="Play"
            :label="sizeCase[3]"
            :size="sizeCase[2]"
            :shape="sizeCase[2] === 'lg' ? 'circle' : 'square'"
            :variant="sizeCase[2] === 'lg' ? 'accent' : 'ghost'"
            :fill="sizeCase[2] === 'lg'"
          />
        </article>
      </div>
      <p class="demo-icon-button-callout">
        Glyph · fixed 16 units。48px emergency · 尚未映射；沒有實際 consumer
        前不新增 size prop。
      </p>
    </section>

    <section class="demo-icon-button-subsection">
      <header class="demo-icon-button-subsection__header">
        <h6>Owned anatomy</h6>
        <p>元件只擁有 target、glyph、appearance 與 native button boundary。</p>
      </header>
      <div class="demo-icon-button-anatomy">
        <div class="demo-icon-button-anatomy__specimens">
          <component
            :is="layer.component"
            :icon="Settings"
            label="一般工具列設定"
          />
          <component
            :is="layer.component"
            :icon="Play"
            label="lg target 範例"
            size="lg"
          />
        </div>
        <ol class="demo-icon-button-anatomy__map">
          <li
            v-for="part in ANATOMY"
            :key="part[0]"
            :data-icon-button-anatomy="part[0]"
          >
            <b>{{ part[1] }}</b>
            <span>{{ part[2] }}</span>
          </li>
        </ol>
      </div>
    </section>

    <section class="demo-icon-button-subsection">
      <header class="demo-icon-button-subsection__header">
        <h6>內容與 accessible name</h6>
        <p>label／title 與共用 tooltip 都不參與 target geometry。</p>
      </header>
      <div class="demo-icon-button-content-grid">
        <article
          v-for="content in CONTENT"
          :key="content[0]"
          :data-icon-button-content="content[0]"
        >
          <span>{{ content[1] }}</span>
          <component
            :is="layer.component"
            :icon="content[3]"
            :label="content[2]"
          />
          <code>{{ content[2] }}</code>
        </article>
      </div>
    </section>

    <section class="demo-icon-button-subsection">
      <header class="demo-icon-button-subsection__header">
        <h6>狀態外觀與覆蓋</h6>
        <p>{{ layer.stateNote }}</p>
      </header>
      <div class="demo-icon-button-state-grid">
        <article
          v-for="state in STATES"
          :key="state[0]"
          class="demo-icon-button-state"
          :data-icon-button-state="state[0]"
        >
          <span>{{ state[1] }}</span>
          <div class="demo-icon-button-state__specimens">
            <component
              :is="layer.component"
              v-bind="stateProps(state[0], 'ghost')"
            />
            <component
              :is="layer.component"
              v-bind="stateProps(state[0], 'accent')"
            />
            <span class="demo-icon-button-state__overlay">
              <component
                :is="layer.component"
                v-bind="stateProps(state[0], 'overlay')"
              />
            </span>
          </div>
        </article>
      </div>
      <UiScrollRegion
        class="demo-icon-button-coverage"
        axis="horizontal"
        data-icon-button-coverage-matrix
        tabindex="0"
        aria-label="Icon Button 狀態覆蓋表"
      >
        <table>
          <thead>
            <tr>
              <th>State</th>
              <th>Ghost</th>
              <th>Accent</th>
              <th>Overlay</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in COVERAGE[layer.key]" :key="row[0]">
              <th>{{ row[0] }}</th>
              <td>{{ row[1] }}</td>
              <td>{{ row[2] }}</td>
              <td>{{ row[3] }}</td>
            </tr>
          </tbody>
        </table>
      </UiScrollRegion>
    </section>

    <section class="demo-icon-button-subsection">
      <header class="demo-icon-button-subsection__header">
        <h6>ARIA 與行為</h6>
        <p>
          視覺 active 不推導 toggle semantics；native disabled 才會阻止互動。
        </p>
      </header>
      <div class="demo-icon-button-aria">
        <component
          :is="layer.component"
          :icon="Repeat"
          label="重複播放"
          title="重複播放 (R)"
          active
          :aria-pressed="true"
        />
        <component
          :is="layer.component"
          :icon="Download"
          label="下載目前曲目"
          disabled
        />
        <ul>
          <li>label 是 required accessible name；SVG 固定 aria-hidden。</li>
          <li>title optional，未提供時 defaults to label。</li>
          <li>aria-pressed／expanded／controls 由 caller 擁有。</li>
          <li>aria-disabled 只有樣式不等於 native disabled 行為。</li>
        </ul>
      </div>
    </section>

    <section class="demo-icon-button-subsection demo-icon-button-api">
      <header class="demo-icon-button-subsection__header">
        <h6>Public contract</h6>
        <p>保持 icon primitive bounded，不承接產品領域狀態。</p>
      </header>
      <dl>
        <div>
          <dt>Content</dt>
          <dd>
            icon · required；fixed 16-unit decorative glyph<br />label ·
            required accessible name<br />title · optional；defaults to label
          </dd>
        </div>
        <div>
          <dt>Appearance</dt>
          <dd>
            variant · ghost／accent／overlay<br />size · md／lg；density owns
            routine md<br />shape · square／circle／inherit
          </dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>
            active · visual only；caller supplies aria-pressed<br />stretch ·
            parent-owned hit area；fill · glyph only
          </dd>
        </div>
        <div>
          <dt>Native boundary</dt>
          <dd>
            native disabled · attrs／events fallthrough<br />No readonly · No
            loading · No permission · No emergency prop
          </dd>
        </div>
      </dl>
    </section>
  </section>
</template>

<style scoped>
.demo-icon-button-contract-group,
.demo-icon-button-subsection {
  min-width: 0;
  display: grid;
}

.demo-icon-button-contract-group {
  gap: var(--ui-space-4);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-icon-button-group-header,
.demo-icon-button-subsection__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(10rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-icon-button-group-header h5,
.demo-icon-button-group-header p,
.demo-icon-button-subsection__header h6,
.demo-icon-button-subsection__header p,
.demo-icon-button-callout {
  margin: 0;
}

.demo-icon-button-group-header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-icon-button-group-header p,
.demo-icon-button-subsection__header p,
.demo-icon-button-callout {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-icon-button-subsection {
  gap: var(--ui-space-3);
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-icon-button-subsection__header h6 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-icon-button-size-grid,
.demo-icon-button-content-grid,
.demo-icon-button-state-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-icon-button-size,
.demo-icon-button-content-grid article,
.demo-icon-button-state {
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

.demo-icon-button-size > span,
.demo-icon-button-content-grid article > span,
.demo-icon-button-state > span {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-icon-button-size--standard {
  --ui-icon-button-size-override: 2.25rem;
}

.demo-icon-button-size--compact {
  --ui-icon-button-size-override: 2rem;
}

.demo-icon-button-size--primary-transport,
.demo-icon-button-size--current-lg {
  --ui-icon-button-size-override: 2.75rem;
}

.demo-icon-button-size--current-md {
  --ui-icon-button-size-override: 2rem;
}

.demo-icon-button-anatomy {
  display: grid;
  grid-template-columns: minmax(12rem, 0.72fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
}

.demo-icon-button-anatomy__specimens {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}

.demo-icon-button-anatomy__map {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo-icon-button-anatomy__map li {
  min-width: 0;
  display: grid;
  grid-template-columns: var(--ui-space-5) minmax(0, 1fr);
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-icon-button-anatomy__map b {
  color: var(--ui-color-accent);
}

.demo-icon-button-content-grid code {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-xs);
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-icon-button-state__specimens,
.demo-icon-button-aria {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-icon-button-state__overlay {
  display: inline-flex;
  padding: var(--ui-space-1);
  background: var(--ui-palette-neutral-950);
}

.demo-icon-button-state[data-icon-button-state='hover']
  :deep(.ui-icon-btn--ghost) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-icon-button-state[data-icon-button-state='hover']
  :deep(.ui-icon-btn--accent) {
  background: var(--ui-color-accent-hover);
}

.demo-icon-button-state[data-icon-button-state='hover']
  :deep(.ui-icon-btn--overlay) {
  background: var(--ui-color-overlay-scrim-hover);
}

.demo-icon-button-state[data-icon-button-state='hover']
  :deep(.ui-icon-btn--ghost) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-icon-button-state[data-icon-button-state='pressed']
  :deep(.ui-icon-btn--ghost) {
  background: var(--ui-color-surface-active);
  color: var(--ui-color-text);
}

.demo-icon-button-state[data-icon-button-state='pressed']
  :deep(.ui-icon-btn--accent) {
  background: var(--ui-color-accent-active);
}

.demo-icon-button-state[data-icon-button-state='pressed']
  :deep(.ui-icon-btn--overlay) {
  background: var(--ui-color-overlay-scrim-active);
}

:global(.demo-icon-button-layer--current)
  .demo-icon-button-state[data-icon-button-state='pressed']
  :deep(.ui-icon-btn--accent) {
  background: var(--ui-color-accent-hover);
}

.demo-icon-button-state[data-icon-button-state='focus'] :deep(button) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-icon-button-coverage {
  min-width: 0;
  outline: none;
}

.demo-icon-button-coverage:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-icon-button-coverage table {
  width: 100%;
  min-width: 42rem;
  border-collapse: collapse;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-icon-button-coverage th,
.demo-icon-button-coverage td {
  padding: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
  text-align: start;
}

.demo-icon-button-coverage th {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-icon-button-aria ul {
  min-width: min(20rem, 100%);
  flex: 1 1 20rem;
  margin: 0;
  padding-inline-start: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-icon-button-api dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-3);
  margin: 0;
}

.demo-icon-button-api dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-icon-button-api dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

@container (max-width: 48rem) {
  .demo-icon-button-group-header,
  .demo-icon-button-subsection__header,
  .demo-icon-button-anatomy {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-icon-button-group-header,
  .demo-icon-button-subsection__header {
    gap: var(--ui-space-1);
  }
}
</style>
