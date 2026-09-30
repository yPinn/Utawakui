<script setup>
import { reactive } from 'vue';

const props = defineProps({
  layer: { type: Object, required: true },
});

const SIZE_ITEMS = [
  { id: 'library', label: '曲庫' },
  { id: 'queue', label: '佇列' },
  { id: 'history', label: '歷史' },
];

const BASE_ITEMS = [
  { id: 'workspace', label: '工作區', count: 12 },
  { id: 'appearance', label: '外觀', count: 4 },
  { id: 'history', label: '歷史' },
  { id: 'locked', label: '未開放', disabled: true },
];

const OVERFLOW_ITEMS = [
  { id: 'library', label: '曲庫' },
  { id: 'queue', label: '佇列' },
  { id: 'appearance', label: '外觀設定' },
  { id: 'lyrics', label: '歌詞校對' },
  { id: 'history', label: '處理歷史' },
  { id: 'settings', label: '輸出設定' },
];

const CONTENT_ITEMS = [
  { id: 'short-cjk', label: '曲庫' },
  {
    id: 'long-cjk',
    label: '東京事変／椎名林檎／非常に長い日本語の作業區段',
  },
  {
    id: 'long-latin',
    label:
      'A deliberately long Latin workspace section for overflow inspection',
  },
  { id: 'multilingual', label: '繁體中文／日本語／한국어／English' },
  { id: 'number', label: 12, count: 24 },
  { id: 'disabled', label: '尚未開放', disabled: true },
];

const WIDTH_CASES = [
  {
    key: 'intrinsic-panel',
    label: 'Panel · intrinsic／max 100%',
    variant: 'panel',
    items: SIZE_ITEMS,
  },
  {
    key: 'available-bar',
    label: 'Bar · available width／100%',
    variant: 'bar',
    items: SIZE_ITEMS,
  },
  {
    key: 'narrow-scroll',
    label: 'Narrow · overlay horizontal scroll',
    variant: 'bar',
    items: OVERFLOW_ITEMS,
  },
];

const VARIANTS = [
  {
    key: 'panel',
    label: 'Panel · tonal selected tile',
    note: '有 group shell，適合區域內的 enclosed panels。',
  },
  {
    key: 'bar',
    label: 'Bar · 2 CSS px selected indicator',
    note: '平面底線樣式；仍必須控制一組 tabpanels。',
  },
];

const STATES = [
  { key: 'default', label: 'Default', activeId: 'other' },
  { key: 'hover', label: 'Hover', activeId: 'other' },
  { key: 'pressed', label: 'Pressed', activeId: 'other' },
  { key: 'focus', label: 'Focus-visible', activeId: 'other' },
  { key: 'selected', label: 'Selected', activeId: 'target' },
  { key: 'selected-hover', label: 'Selected＋hover', activeId: 'target' },
  { key: 'disabled', label: 'Disabled', activeId: 'other', disabled: true },
];

const selection = reactive({
  sizes: Object.fromEntries(props.layer.sizes.map(([key]) => [key, 'library'])),
  widths: Object.fromEntries(WIDTH_CASES.map(({ key }) => [key, 'library'])),
  variants: { panel: 'workspace', bar: 'workspace' },
  anatomy: 'workspace',
  content: 'long-cjk',
  states: Object.fromEntries(
    STATES.map(({ key, activeId }) => [key, activeId]),
  ),
  keyboard: 'library',
});

const KEYBOARD_ITEMS = [
  { id: 'library', label: '曲庫' },
  { id: 'locked', label: '未開放', disabled: true },
  { id: 'queue', label: '佇列' },
  { id: 'history', label: '歷史' },
];

function prefix(scope) {
  return `demo-tabs-${props.layer.key}-${scope}`;
}

function stateItems(state) {
  return [
    { id: 'target', label: '檢查項目', disabled: state.disabled },
    { id: 'other', label: '目前項目' },
  ];
}

function layerText(candidate, current) {
  return props.layer.key === 'candidate' ? candidate : current;
}

function widthLabel(fixture) {
  if (props.layer.key === 'current' && fixture.key === 'intrinsic-panel') {
    return 'Panel · intrinsic／no explicit max';
  }
  return fixture.label;
}

function variantLabel(variant) {
  if (props.layer.key === 'current' && variant.key === 'bar') {
    return 'Bar · tonal selected tile／no indicator';
  }
  return variant.label;
}

function variantNote(variant) {
  if (props.layer.key === 'current' && variant.key === 'bar') {
    return 'Current Bar 沒有 indicator，仍沿用與 Panel 相同的 selected tile。';
  }
  return variant.note;
}
</script>

<template>
  <div class="demo-tabs-primitive" :class="`demo-tabs-primitive--${layer.key}`">
    <section class="demo-tabs-block demo-tabs-geometry">
      <header class="demo-tabs-subsection__header">
        <h5>尺寸與寬度</h5>
        <p>
          {{
            layerText(
              'Control height 來自 Candidate density scope；group 寬度由 parent layout 擁有。',
              'Control height 來自 active token；group 寬度維持現行實作。',
            )
          }}
        </p>
      </header>

      <div class="demo-tabs-contracts" aria-label="Tabs geometry contract">
        <span>{{
          layerText(
            'Tab · min-width 0／single-line ellipsis',
            'Tab · min-width auto／single line',
          )
        }}</span>
        <span>{{
          layerText(
            'Group · max-width 100%／no fixed max',
            'Group · min-width 0／no explicit max',
          )
        }}</span>
        <span>{{
          layerText(
            'Overflow · overlay horizontal scroll／no marquee',
            'Overflow · overlay horizontal scroll／no tab truncation',
          )
        }}</span>
      </div>

      <div class="demo-tabs-size-list">
        <article
          v-for="size in layer.sizes"
          :key="size[0]"
          class="demo-tabs-size"
          :class="`demo-tabs-size--${size[0]}`"
          :data-tabs-size="size[0]"
        >
          <h6>{{ size[1] }}</h6>
          <component
            :is="layer.component"
            v-model:active-id="selection.sizes[size[0]]"
            :items="SIZE_ITEMS"
            :aria-label="`${size[1]} tabs`"
            :tab-id-prefix="prefix(`size-${size[0]}`)"
            :panel-id-prefix="prefix(`size-${size[0]}`)"
          />
          <section
            v-for="item in SIZE_ITEMS"
            v-show="selection.sizes[size[0]] === item.id"
            :id="`${prefix(`size-${size[0]}`)}-${item.id}-panel`"
            :key="item.id"
            class="demo-tabs-panel"
            role="tabpanel"
            tabindex="0"
            :aria-labelledby="`${prefix(`size-${size[0]}`)}-${item.id}-tab`"
          >
            {{ item.label }} panel
          </section>
        </article>
      </div>

      <div class="demo-tabs-width-list">
        <article
          v-for="fixture in WIDTH_CASES"
          :key="fixture.key"
          class="demo-tabs-width"
          :class="`demo-tabs-width--${fixture.key}`"
          :data-tabs-width="fixture.key"
        >
          <h6>{{ widthLabel(fixture) }}</h6>
          <component
            :is="layer.component"
            v-model:active-id="selection.widths[fixture.key]"
            :items="fixture.items"
            :aria-label="`${widthLabel(fixture)} tabs`"
            :tab-id-prefix="prefix(`width-${fixture.key}`)"
            :panel-id-prefix="prefix(`width-${fixture.key}`)"
            :variant="fixture.variant"
          />
          <section
            v-for="item in fixture.items"
            v-show="selection.widths[fixture.key] === item.id"
            :id="`${prefix(`width-${fixture.key}`)}-${item.id}-panel`"
            :key="item.id"
            class="demo-tabs-panel"
            role="tabpanel"
            tabindex="0"
            :aria-labelledby="`${prefix(`width-${fixture.key}`)}-${item.id}-tab`"
          >
            {{ item.label }} panel
          </section>
        </article>
      </div>
    </section>

    <section class="demo-tabs-block demo-tabs-variants">
      <header class="demo-tabs-subsection__header">
        <h5>Panel／Bar</h5>
        <p>
          {{
            layerText(
              '同一 compound behavior；只用 shell／indicator 區分 presentation。',
              '同一 compound behavior；Panel 有 shell，Bar 仍使用相同 selected tile。',
            )
          }}
        </p>
      </header>
      <div class="demo-tabs-variant-list">
        <article
          v-for="variant in VARIANTS"
          :key="variant.key"
          class="demo-tabs-variant"
          :data-tabs-variant="variant.key"
        >
          <h6>{{ variantLabel(variant) }}</h6>
          <component
            :is="layer.component"
            v-model:active-id="selection.variants[variant.key]"
            :items="BASE_ITEMS"
            :aria-label="`${variantLabel(variant)} tabs`"
            :tab-id-prefix="prefix(`variant-${variant.key}`)"
            :panel-id-prefix="prefix(`variant-${variant.key}`)"
            :variant="variant.key"
          >
            <template #after="{ item }">
              <span v-if="item.count" class="demo-tabs-after">
                {{ item.count }}
              </span>
            </template>
          </component>
          <section
            v-for="item in BASE_ITEMS"
            v-show="selection.variants[variant.key] === item.id"
            :id="`${prefix(`variant-${variant.key}`)}-${item.id}-panel`"
            :key="item.id"
            class="demo-tabs-panel"
            role="tabpanel"
            tabindex="0"
            :aria-labelledby="`${prefix(`variant-${variant.key}`)}-${item.id}-tab`"
          >
            {{ item.label }} panel
          </section>
          <p>{{ variantNote(variant) }}</p>
        </article>
      </div>
    </section>

    <section class="demo-tabs-block demo-tabs-anatomy-block">
      <header class="demo-tabs-subsection__header">
        <h5>Owned anatomy</h5>
        <p>
          Tab list 負責選取與 focus；每個 tab 必須能追蹤到 parent-owned panel。
        </p>
      </header>
      <div class="demo-tabs-anatomy">
        <div class="demo-tabs-anatomy__specimen">
          <component
            :is="layer.component"
            v-model:active-id="selection.anatomy"
            :items="BASE_ITEMS"
            aria-label="Tabs anatomy"
            :tab-id-prefix="prefix('anatomy')"
            :panel-id-prefix="prefix('anatomy')"
          >
            <template #after="{ item }">
              <span v-if="item.count" class="demo-tabs-after">
                {{ item.count }}
              </span>
            </template>
          </component>
          <section
            v-for="item in BASE_ITEMS"
            v-show="selection.anatomy === item.id"
            :id="`${prefix('anatomy')}-${item.id}-panel`"
            :key="item.id"
            class="demo-tabs-panel"
            role="tabpanel"
            tabindex="0"
            :aria-labelledby="`${prefix('anatomy')}-${item.id}-tab`"
          >
            {{ item.label }} panel
          </section>
        </div>
        <ol class="demo-tabs-anatomy__map" aria-label="Tabs anatomy map">
          <li data-tabs-anatomy="tablist">
            <b>1</b><span>Tablist／group label</span>
          </li>
          <li data-tabs-anatomy="tab">
            <b>2</b><span>Native button／tab</span>
          </li>
          <li data-tabs-anatomy="label"><b>3</b><span>Visible label</span></li>
          <li data-tabs-anatomy="after">
            <b>4</b><span>Optional non-interactive metadata</span>
          </li>
          <li data-tabs-anatomy="indicator">
            <b>5</b
            ><span>{{
              layerText(
                'Selected tile／bar indicator',
                'Selected tile／no bar indicator',
              )
            }}</span>
          </li>
          <li data-tabs-anatomy="tabpanel">
            <b>6</b><span>Caller panel／aria-labelledby</span>
          </li>
        </ol>
      </div>
    </section>

    <section class="demo-tabs-block demo-tabs-content-review">
      <header class="demo-tabs-subsection__header">
        <h5>內容與 overflow</h5>
        <p>
          {{
            layerText(
              '單一 tab 靜態省略；多 tabs 超出 group 時使用水平 scroll，不跑馬燈。',
              '現行沒有 tab truncation；多 tabs 超出 group 時使用水平 scroll。',
            )
          }}
        </p>
      </header>
      <div class="demo-tabs-content-frame">
        <component
          :is="layer.component"
          v-model:active-id="selection.content"
          :items="CONTENT_ITEMS"
          aria-label="Tabs multilingual content"
          :tab-id-prefix="prefix('content')"
          :panel-id-prefix="prefix('content')"
          variant="bar"
        >
          <template #label="{ item }">
            <span :data-tabs-content="item.id">{{ item.label }}</span>
          </template>
          <template #after="{ item }">
            <span v-if="item.count" class="demo-tabs-after">
              {{ item.count }}
            </span>
          </template>
        </component>
        <section
          v-for="item in CONTENT_ITEMS"
          v-show="selection.content === item.id"
          :id="`${prefix('content')}-${item.id}-panel`"
          :key="item.id"
          class="demo-tabs-panel"
          role="tabpanel"
          tabindex="0"
          :aria-labelledby="`${prefix('content')}-${item.id}-tab`"
        >
          目前內容：{{ item.label }}
        </section>
      </div>
    </section>

    <section class="demo-tabs-block demo-tabs-state-review">
      <header class="demo-tabs-subsection__header">
        <h5>狀態外觀</h5>
        <p>比較 Default 至 Disabled；所有狀態不改變 control 幾何。</p>
      </header>
      <div class="demo-tabs-state-list">
        <article
          v-for="state in STATES"
          :key="state.key"
          class="demo-tabs-state"
          :data-tabs-state="state.key"
        >
          <h6>{{ state.label }}</h6>
          <component
            :is="layer.component"
            v-model:active-id="selection.states[state.key]"
            :items="stateItems(state)"
            :aria-label="`${state.label} tabs`"
            :tab-id-prefix="prefix(`state-${state.key}`)"
            :panel-id-prefix="prefix(`state-${state.key}`)"
          />
          <section
            v-for="item in stateItems(state)"
            v-show="selection.states[state.key] === item.id"
            :id="`${prefix(`state-${state.key}`)}-${item.id}-panel`"
            :key="item.id"
            class="demo-tabs-panel demo-tabs-panel--compact"
            role="tabpanel"
            tabindex="0"
            :aria-labelledby="`${prefix(`state-${state.key}`)}-${item.id}-tab`"
          >
            {{ item.label }} panel
          </section>
        </article>
      </div>
      <p class="demo-tabs-state-note">
        {{
          layer.key === 'candidate'
            ? 'Candidate：Pressed 使用 active surface；Focus 使用 2px inset ring。'
            : 'Current：無 authored pressed；Focus 保留外擴 ring，窄幅需實查裁切。'
        }}
      </p>
    </section>

    <section class="demo-tabs-block demo-tabs-keyboard">
      <header class="demo-tabs-subsection__header">
        <h5>Keyboard／ARIA</h5>
        <p>Automatic activation 適用即時 panels；方向鍵移動時同步顯示內容。</p>
      </header>
      <component
        :is="layer.component"
        v-model:active-id="selection.keyboard"
        :items="KEYBOARD_ITEMS"
        aria-label="鍵盤操作檢查"
        :tab-id-prefix="prefix('keyboard')"
        :panel-id-prefix="prefix('keyboard')"
        data-contract="native-forwarding"
      />
      <section
        v-for="item in KEYBOARD_ITEMS"
        v-show="selection.keyboard === item.id"
        :id="`${prefix('keyboard')}-${item.id}-panel`"
        :key="item.id"
        class="demo-tabs-panel"
        role="tabpanel"
        tabindex="0"
        :aria-labelledby="`${prefix('keyboard')}-${item.id}-tab`"
      >
        {{ item.label }} panel
      </section>
      <dl class="demo-tabs-keyboard__contract">
        <div>
          <dt>Tab</dt>
          <dd>進入唯一 active／fallback tab stop</dd>
        </div>
        <div>
          <dt>Left／Right</dt>
          <dd>循環、略過 disabled、automatic activation</dd>
        </div>
        <div>
          <dt>Home／End</dt>
          <dd>前往第一／最後 enabled tab</dd>
        </div>
        <div>
          <dt>Relationship</dt>
          <dd>aria-controls ↔ aria-labelledby</dd>
        </div>
      </dl>
    </section>

    <section class="demo-tabs-block demo-tabs-api">
      <h5>Public contract</h5>
      <dl>
        <div>
          <dt>Items</dt>
          <dd>items · { id, label, disabled? }</dd>
        </div>
        <div>
          <dt>Selection</dt>
          <dd>activeId · controlled selection</dd>
        </div>
        <div>
          <dt>Naming／IDs</dt>
          <dd>ariaLabel · tabIdPrefix · panelIdPrefix</dd>
        </div>
        <div>
          <dt>Appearance</dt>
          <dd>variant · panel／bar · presentation only</dd>
        </div>
        <div>
          <dt>Content</dt>
          <dd>label／after · non-interactive slots</dd>
        </div>
        <div>
          <dt>Panel boundary</dt>
          <dd>Parent owns panel content／visibility</dd>
        </div>
      </dl>
      <p>
        No route／href · No closeable · No vertical · No segmented semantics
      </p>
    </section>
  </div>
</template>

<style scoped>
.demo-tabs-primitive,
.demo-tabs-block {
  min-width: 0;
  display: grid;
}

.demo-tabs-primitive {
  gap: var(--ui-space-5);
}

.demo-tabs-block {
  gap: var(--ui-space-3);
}

.demo-tabs-subsection__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(12rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-tabs-subsection__header h5,
.demo-tabs-subsection__header p,
.demo-tabs-size h6,
.demo-tabs-width h6,
.demo-tabs-variant h6,
.demo-tabs-variant p,
.demo-tabs-state h6,
.demo-tabs-state-note,
.demo-tabs-api h5,
.demo-tabs-api p {
  margin: 0;
}

.demo-tabs-subsection__header h5,
.demo-tabs-size h6,
.demo-tabs-width h6,
.demo-tabs-variant h6,
.demo-tabs-state h6,
.demo-tabs-api h5 {
  color: var(--ui-color-text);
}

.demo-tabs-subsection__header p,
.demo-tabs-variant p,
.demo-tabs-state-note,
.demo-tabs-api p {
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-tabs-contracts,
.demo-tabs-size-list,
.demo-tabs-width-list,
.demo-tabs-variant-list,
.demo-tabs-state-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-tabs-contracts span,
.demo-tabs-size,
.demo-tabs-width,
.demo-tabs-variant,
.demo-tabs-state {
  min-width: 0;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}

.demo-tabs-size,
.demo-tabs-width,
.demo-tabs-variant,
.demo-tabs-state {
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
}

.demo-tabs-size--standard {
  --demo-tabs-height: 2.25rem;
}

.demo-tabs-size--compact {
  --demo-tabs-height: 2rem;
}

.demo-tabs-size--active {
  --demo-tabs-height: 1.875rem;
  --ui-control-height: 1.875rem;
}

.demo-tabs-width--available-bar,
.demo-tabs-width--available-bar :deep(.ui-tabs) {
  width: 100%;
}

.demo-tabs-width--narrow-scroll {
  width: min(16rem, 100%);
}

.demo-tabs-panel {
  min-width: 0;
  min-height: var(--ui-control-height);
  display: flex;
  align-items: center;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-tabs-panel:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-tabs-panel--compact {
  min-height: 0;
  padding-block: var(--ui-space-1);
}

.demo-tabs-after {
  flex: 0 0 auto;
  color: inherit;
  font-variant-numeric: tabular-nums;
  opacity: 0.78;
}

.demo-tabs-anatomy {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(14rem, 0.72fr) minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-4);
}

.demo-tabs-anatomy__specimen,
.demo-tabs-content-frame {
  min-width: 0;
  display: grid;
}

.demo-tabs-anatomy__map {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.demo-tabs-anatomy__map li {
  min-width: 0;
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-2);
}

.demo-tabs-anatomy__map b {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  place-items: center;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-text);
}

.demo-tabs-anatomy__map span {
  color: var(--ui-color-text-muted);
  overflow-wrap: anywhere;
}

.demo-tabs-content-frame {
  width: min(36rem, 100%);
}

.demo-tabs-primitive--candidate
  .demo-tabs-state[data-tabs-state='hover']
  :deep(.ui-tabs__tab:first-child:not(:disabled)),
.demo-tabs-primitive--current
  .demo-tabs-state[data-tabs-state='hover']
  :deep(.ui-tabs__tab:first-child:not(:disabled)) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-tabs-primitive--candidate
  .demo-tabs-state[data-tabs-state='pressed']
  :deep(.ui-tabs__tab:first-child:not(:disabled)) {
  background: var(--ui-color-surface-active);
  color: var(--ui-color-text);
}

.demo-tabs-primitive--candidate
  .demo-tabs-state[data-tabs-state='focus']
  :deep(.ui-tabs__tab:first-child:not(:disabled)),
.demo-tabs-primitive--current
  .demo-tabs-state[data-tabs-state='focus']
  :deep(.ui-tabs__tab:first-child:not(:disabled)) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
}

.demo-tabs-primitive--candidate
  .demo-tabs-state[data-tabs-state='focus']
  :deep(.ui-tabs__tab:first-child:not(:disabled)) {
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-tabs-primitive--current
  .demo-tabs-state[data-tabs-state='focus']
  :deep(.ui-tabs__tab:first-child:not(:disabled)) {
  outline-offset: var(--ui-focus-offset);
}

.demo-tabs-primitive--candidate
  .demo-tabs-state[data-tabs-state='selected-hover']
  :deep(.ui-tabs__tab:first-child:not(:disabled)) {
  background: color-mix(
    in srgb,
    var(--ui-color-surface-selected) 82%,
    var(--ui-color-surface-hover)
  );
  color: var(--ui-color-accent-hover);
}

.demo-tabs-primitive--current
  .demo-tabs-state[data-tabs-state='selected-hover']
  :deep(.ui-tabs__tab:first-child:not(:disabled)) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-tabs-keyboard__contract,
.demo-tabs-api dl {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
  margin: 0;
}

.demo-tabs-keyboard__contract > div,
.demo-tabs-api dl > div {
  min-width: 0;
}

.demo-tabs-keyboard__contract dt,
.demo-tabs-api dt {
  color: var(--ui-color-text-muted);
}

.demo-tabs-keyboard__contract dd,
.demo-tabs-api dd {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-tabs-subsection__header,
  .demo-tabs-anatomy {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-tabs-subsection__header {
    gap: var(--ui-space-1);
  }
}
</style>
