<script setup>
import UiScrollRegion from '../ui/UiScrollRegion.vue';

defineProps({
  layer: { type: Object, required: true },
});

const ANATOMY = [
  ['button', '1', 'native button[type="button"] · interaction boundary'],
  ['visible-text', '2', 'visible text 是預設 accessible name'],
  ['accessible-name', '3', 'ariaLabel · optional override'],
  ['overflow-lane', '4', 'UiMarqueeText · overflow owner'],
];

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

const COVERAGE = {
  candidate: [
    ['default', 'No underline', 'Inherit', 'Pointer'],
    ['hover', 'Underline', 'Inherit', ':hover'],
    ['pressed', 'Same as hover', 'Inherit', 'No authored :active'],
    ['focus-visible', 'Underline', '2px inset ring', 'Keyboard'],
    ['disabled', 'No underline／50%', 'None', 'Native disabled'],
  ],
  current: [
    ['default', 'No underline', 'Inherit', 'Pointer'],
    ['hover', 'Underline', 'Inherit', ':hover'],
    ['pressed', 'Same as hover', 'Inherit', 'No authored :active'],
    ['focus-visible', 'Underline', '2px inset ring', 'Keyboard'],
    ['disabled', 'No underline／50%', 'None', 'Native disabled'],
  ],
};
</script>

<template>
  <section
    class="demo-text-button-contract-group demo-text-button-contract-group--primitive"
    data-text-button-group="primitive"
  >
    <header class="demo-text-button-group-header">
      <h5>Primitive contract</h5>
      <p>可點擊文字；元件只擁有內容、互動語意與 overflow。</p>
    </header>

    <section class="demo-text-button-subsection">
      <header class="demo-text-button-subsection__header">
        <h6>Inherited geometry</h6>
        <p>
          Typography · inherit from caller；Text Action 不建立 density／size。
        </p>
      </header>
      <div class="demo-text-button-geometry-grid">
        <article
          class="demo-text-button-geometry demo-text-button-geometry--label"
          data-text-button-geometry="label-context"
        >
          <span>Label context · 14／600</span>
          <component :is="layer.component" text="前往來源專輯" />
        </article>
        <article
          class="demo-text-button-geometry demo-text-button-geometry--body"
          data-text-button-geometry="body-context"
        >
          <span>Body context · 16／400</span>
          <component :is="layer.component" text="查看完整曲目資料" />
        </article>
        <article data-text-button-width="intrinsic">
          <span>Intrinsic width · fit-content</span>
          <component :is="layer.component" text="海螺記" />
        </article>
        <article
          class="demo-text-button-width--constrained"
          data-text-button-width="constrained"
        >
          <span>Constrained parent · 10rem</span>
          <component
            :is="layer.component"
            text="很長的可點擊曲目名稱 — 長いタイトルと 한국어 제목"
          />
        </article>
      </div>
      <p class="demo-text-button-callout">獨立 32px 動作使用 UiButton。</p>
    </section>

    <section class="demo-text-button-subsection">
      <header class="demo-text-button-subsection__header">
        <h6>Anatomy＋accessibility</h6>
        <p>Visible text 預設命名；ariaLabel 只在需要時補充目的地。</p>
      </header>
      <div class="demo-text-button-anatomy">
        <component
          :is="layer.component"
          text="東京事変／椎名林檎"
          aria-label="前往專輯：東京事変／椎名林檎"
        />
        <ol>
          <li
            v-for="part in ANATOMY"
            :key="part[0]"
            :data-text-button-anatomy="part[0]"
          >
            <b>{{ part[1] }}</b>
            <span>{{ part[2] }}</span>
          </li>
        </ol>
      </div>
      <div class="demo-text-button-anatomy-examples">
        <article>
          <span>Visible-name fallback</span>
          <component :is="layer.component" text="海螺記" />
        </article>
        <article>
          <span>Destination override</span>
          <component
            :is="layer.component"
            text="海螺記"
            aria-label="前往專輯：海螺記"
            name="album-destination"
          />
        </article>
      </div>
      <p class="demo-text-button-callout">
        Native attrs fallthrough；click.stop 隔離 parent row action。
      </p>
    </section>

    <section class="demo-text-button-subsection">
      <header class="demo-text-button-subsection__header">
        <h6>Content＋overflow</h6>
        <p>{{ layer.overflowNote }}</p>
      </header>
      <div class="demo-text-button-content-grid">
        <article
          v-for="content in CONTENT"
          :key="content[0]"
          :data-text-button-content="content[0]"
        >
          <span>{{ content[1] }}</span>
          <component :is="layer.component" :text="content[2]" />
        </article>
      </div>
    </section>

    <section class="demo-text-button-subsection">
      <header class="demo-text-button-subsection__header">
        <h6>Affordance＋states</h6>
        <p>{{ layer.stateNote }}</p>
      </header>
      <div class="demo-text-button-state-grid">
        <article
          v-for="state in STATES"
          :key="state[0]"
          class="demo-text-button-state"
          :data-text-button-state="state[0]"
        >
          <span>{{ state[1] }}</span>
          <component
            :is="layer.component"
            text="前往來源專輯"
            :disabled="state[0] === 'disabled'"
          />
        </article>
      </div>
      <UiScrollRegion
        class="demo-text-button-coverage"
        axis="horizontal"
        data-text-button-coverage-matrix
        tabindex="0"
        aria-label="Text Action 狀態覆蓋表"
      >
        <table>
          <thead>
            <tr>
              <th>State</th>
              <th>Text cue</th>
              <th>Focus</th>
              <th>Native／ARIA</th>
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

    <section class="demo-text-button-subsection demo-text-button-api">
      <header class="demo-text-button-subsection__header">
        <h6>Public contract</h6>
        <p>字體、文字色與版面由 caller 擁有；底線由 primitive 擁有。</p>
      </header>
      <dl>
        <div>
          <dt>Content</dt>
          <dd>
            text · String／Number<br />ariaLabel · optional accessible-name
            override
          </dd>
        </div>
        <div>
          <dt>Native boundary</dt>
          <dd>
            type="button" · native attrs fallthrough<br />click event ·
            propagation stopped at root
          </dd>
        </div>
        <div>
          <dt>Overflow</dt>
          <dd>{{ layer.overflowContract }}</dd>
        </div>
        <div>
          <dt>Appearance</dt>
          <dd>{{ layer.appearanceContract }}</dd>
        </div>
        <div>
          <dt>Boundary</dt>
          <dd>
            No icon · No variant · No size · No full-width · No active · No
            loading · No readonly · No href
          </dd>
        </div>
      </dl>
    </section>
  </section>
</template>

<style scoped>
.demo-text-button-contract-group,
.demo-text-button-subsection {
  min-width: 0;
  display: grid;
}

.demo-text-button-contract-group {
  gap: var(--ui-space-4);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-text-button-group-header,
.demo-text-button-subsection__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(10rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-text-button-group-header h5,
.demo-text-button-group-header p,
.demo-text-button-subsection__header h6,
.demo-text-button-subsection__header p,
.demo-text-button-callout {
  margin: 0;
}

.demo-text-button-group-header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-text-button-group-header p,
.demo-text-button-subsection__header p,
.demo-text-button-callout {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-button-subsection {
  gap: var(--ui-space-3);
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-text-button-subsection__header h6 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-text-button-geometry-grid,
.demo-text-button-content-grid,
.demo-text-button-state-grid,
.demo-text-button-anatomy-examples {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-text-button-geometry-grid article,
.demo-text-button-content-grid article,
.demo-text-button-state,
.demo-text-button-anatomy-examples article {
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

.demo-text-button-geometry-grid article > span,
.demo-text-button-content-grid article > span,
.demo-text-button-state > span,
.demo-text-button-anatomy-examples article > span {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-text-button-geometry--label {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-text-button-geometry--body {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
}

.demo-text-button-width--constrained {
  width: 10rem;
}

.demo-text-button-anatomy {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.72fr) minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-4);
}

.demo-text-button-anatomy > ol {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo-text-button-anatomy li {
  min-width: 0;
  display: grid;
  grid-template-columns: var(--ui-space-5) minmax(0, 1fr);
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-button-anatomy b {
  color: var(--ui-color-accent);
}

.demo-text-button-state[data-text-button-state='hover']
  :deep(.ui-text-btn .ui-marquee__text),
.demo-text-button-state[data-text-button-state='focus']
  :deep(.ui-text-btn .ui-marquee__text),
.demo-text-button-state[data-text-button-state='pressed']
  :deep(.ui-text-btn .ui-marquee__text) {
  text-decoration: underline;
  text-decoration-color: currentcolor;
  text-underline-offset: 0.18em;
}

.demo-text-button-state[data-text-button-state='focus'] :deep(button) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  border-radius: var(--ui-radius-md);
}

.demo-text-button-coverage {
  min-width: 0;
  outline: none;
}

.demo-text-button-coverage:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-text-button-coverage table {
  width: 100%;
  min-width: 38rem;
  border-collapse: collapse;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-button-coverage th,
.demo-text-button-coverage td {
  padding: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
  text-align: start;
}

.demo-text-button-coverage th {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-text-button-api dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-3);
  margin: 0;
}

.demo-text-button-api dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-text-button-api dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

@container (max-width: 48rem) {
  .demo-text-button-group-header,
  .demo-text-button-subsection__header,
  .demo-text-button-anatomy {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-text-button-group-header,
  .demo-text-button-subsection__header {
    gap: var(--ui-space-1);
  }
}
</style>
