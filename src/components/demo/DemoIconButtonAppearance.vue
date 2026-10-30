<script setup>
import {
  Download,
  Ellipsis,
  Moon,
  PanelRightOpen,
  Pause,
  Play,
  Repeat,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
} from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTextField from '../ui/UiTextField.vue';
import '../../styles/demoSpecimens.css';

const SIZES = [
  ['standard', 'md', 'Standard routine · 36 CSS px'],
  ['compact', 'md', 'Compact routine · 32 CSS px'],
  ['primary-transport', 'lg', 'Primary transport · 44 CSS px'],
];

const CONTENT = [
  ['cjk', 'Short CJK', '播放目前曲目', Play],
  [
    'latin',
    'Long Latin',
    'Open the detailed performance routing and monitoring settings',
    Settings,
  ],
  ['multilingual', 'Multilingual', '繁體中文／日本語／한국어／English', Moon],
  ['number', 'Number', '套用 120 BPM', Repeat],
];

const STATES = [
  ['default', 'Default'],
  ['hover', 'Hover'],
  ['pressed', 'Pressed'],
  ['active', 'Active toggle'],
  ['loading', 'Loading'],
  ['disabled', 'Disabled'],
  ['aria-disabled', 'ARIA-disabled · 可聚焦'],
];

const VARIANT_ICONS = {
  ghost: Repeat,
  accent: Play,
  command: Download,
  overlay: Ellipsis,
};

const CONTRACT = [
  'icon · required；fixed 16-unit decorative glyph',
  'label · required accessible name',
  'title · optional；defaults to label',
  'variant · ghost／accent／command／overlay',
  'intent · neutral／danger',
  'size · md／lg；density owns routine md',
  'shape · square／circle／inherit',
  'active · visual only；caller supplies aria-pressed',
  'stretch · parent-owned hit area；fill · glyph only',
  'native disabled · attrs／events fallthrough',
  'loading · shared async progress；loadingLabel · announced status',
  'aria-disabled 保留 focus／Tooltip，阻止滑鼠與 Enter／Space 啟用',
  'No readonly · No permission · No emergency prop',
];

function stateProps(state, variant) {
  return {
    icon: VARIANT_ICONS[variant],
    label: `${variant} ${state}`,
    variant,
    active: state === 'active',
    disabled: state === 'disabled',
    loading: state === 'loading',
    loadingLabel: `${variant} 處理中`,
    'aria-pressed': state === 'active' ? true : undefined,
    'aria-disabled': state === 'aria-disabled' ? true : undefined,
  };
}
</script>

<template>
  <div class="demo-specimens" data-icon-button-source="production">
    <p class="demo-specimens__copy">
      純圖示操作；routine target 隨密度為 36／32px，44px lg 只用於 Primary
      transport 等明確強調角色。glyph 固定 16 unit，不用圖示大小補償 target。
    </p>

    <section class="demo-specimens__section">
      <h4>尺寸</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, size, label] in SIZES"
          :key="key"
          class="demo-specimens__case"
          :class="`demo-icon-button__size--${key}`"
          :data-icon-button-size="key"
        >
          <h5>{{ label }}</h5>
          <UiIconButton
            :icon="Play"
            :label="label"
            :size="size"
            :shape="size === 'lg' ? 'circle' : 'square'"
            :variant="size === 'lg' ? 'accent' : 'ghost'"
            :fill="size === 'lg'"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>Accessible name</h4>
      <p class="demo-specimens__copy">
        label／title 與共用 tooltip 都不參與 target geometry。
      </p>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, label, name, icon] in CONTENT"
          :key="key"
          class="demo-specimens__case"
          :data-icon-button-content="key"
        >
          <h5>{{ label }}</h5>
          <div class="demo-specimens__row">
            <UiIconButton :icon="icon" :label="name" />
            <code>{{ name }}</code>
          </div>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>狀態 · Ghost／Accent／Command／Overlay</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, label] in STATES"
          :key="key"
          class="demo-specimens__case"
          :data-icon-button-state="key"
        >
          <h5>{{ label }}</h5>
          <div class="demo-specimens__row">
            <UiIconButton v-bind="stateProps(key, 'ghost')" />
            <UiIconButton v-bind="stateProps(key, 'accent')" />
            <UiIconButton v-bind="stateProps(key, 'command')" />
            <span class="demo-icon-button__scrim">
              <UiIconButton v-bind="stateProps(key, 'overlay')" />
            </span>
          </div>
        </article>
        <article class="demo-specimens__case" data-icon-button-intent="danger">
          <h5>Destructive Overlay</h5>
          <span class="demo-icon-button__scrim">
            <UiIconButton
              :icon="Trash2"
              label="刪除頁面照片"
              variant="overlay"
              intent="danger"
            />
          </span>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>使用情境</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="density in ['standard', 'compact']"
          :key="density"
          class="demo-specimens__case"
          :class="`demo-specimens__density--${density}`"
          data-icon-button-recipe="routine-control-row"
        >
          <h5>同列控制項 · {{ density }}</h5>
          <div class="demo-icon-button__field-row">
            <UiTextField
              :id="`demo-icon-field-${density}`"
              label="輸出裝置"
              label-hidden
              model-value="WASAPI Main"
            />
            <UiButton variant="secondary" :icon="Download">套用</UiButton>
            <UiIconButton :icon="Ellipsis" :label="`${density} 更多輸出設定`" />
          </div>
        </article>
        <article
          class="demo-specimens__case"
          data-icon-button-recipe="primary-transport"
        >
          <h5>Primary transport · lg＋circle＋accent</h5>
          <div class="demo-specimens__row">
            <UiIconButton :icon="SkipBack" label="上一首" />
            <UiIconButton
              :icon="Pause"
              label="暫停"
              shape="circle"
              size="lg"
              variant="accent"
              fill
            />
            <UiIconButton :icon="SkipForward" label="下一首" />
          </div>
        </article>
        <article
          class="demo-specimens__case"
          data-icon-button-recipe="artwork-overlay"
        >
          <h5>封面覆蓋 · overlay＋circle</h5>
          <div class="demo-icon-button__artwork">
            <UiIconButton
              :icon="Play"
              label="在封面上播放"
              shape="circle"
              variant="overlay"
              fill
            />
            <UiIconButton
              :icon="Shuffle"
              label="在封面上隨機播放"
              shape="circle"
              variant="overlay"
            />
          </div>
        </article>
        <article
          class="demo-specimens__case"
          data-icon-button-recipe="stretch-rail"
        >
          <h5>Stretch rail · 外層擁有尺寸</h5>
          <div class="demo-icon-button__rail">
            <UiIconButton
              :icon="PanelRightOpen"
              label="展開集合資料"
              shape="inherit"
              stretch
              aria-expanded="false"
              aria-controls="demo-icon-inspector"
            />
          </div>
        </article>
        <article
          class="demo-specimens__case"
          data-icon-button-recipe="titlebar"
        >
          <h5>Title bar · inset focus</h5>
          <div class="demo-icon-button__titlebar">
            <i>Utawakui</i>
            <UiIconButton :icon="Settings" label="開啟設定" variant="overlay" />
            <UiIconButton
              :icon="Moon"
              label="切換為深色主題"
              variant="overlay"
            />
          </div>
        </article>
        <article class="demo-specimens__case">
          <h5>Toggle 與 disabled</h5>
          <div class="demo-specimens__row">
            <UiIconButton
              :icon="Repeat"
              label="重複播放"
              title="重複播放 (R)"
              active
              :aria-pressed="true"
            />
            <UiIconButton :icon="Download" label="下載目前曲目" disabled />
          </div>
        </article>
      </div>
    </section>

    <ul
      class="demo-specimens__contract"
      aria-label="UiIconButton public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-icon-button__size--standard {
  --ui-icon-button-size-override: 2.25rem;
}

.demo-icon-button__size--compact {
  --ui-icon-button-size-override: 2rem;
}

.demo-icon-button__size--primary-transport {
  --ui-icon-button-size-override: 2.75rem;
}

.demo-icon-button__scrim {
  display: inline-flex;
  padding: var(--ui-space-1);
  background: var(--ui-palette-neutral-950);
}

.demo-icon-button__field-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: start;
  gap: var(--ui-space-2);
}

.demo-icon-button__artwork {
  min-height: 7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background:
    linear-gradient(145deg, rgb(31 35 40 / 18%), rgb(31 35 40 / 72%)),
    linear-gradient(
      35deg,
      var(--ui-color-folder-primary),
      var(--ui-color-paper)
    );
}

.demo-icon-button__rail {
  width: 3rem;
  height: 7rem;
  display: flex;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
}

.demo-icon-button__titlebar {
  --ui-icon-button-size-override: 2.25rem;

  min-width: 0;
  height: var(--ui-window-titlebar-block-size);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-inline: var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
}

.demo-icon-button__titlebar i {
  min-width: 0;
  margin-inline-end: auto;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-icon-button__titlebar :deep(button:last-child) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

/* Static previews of pointer states. */
.demo-specimens__case[data-icon-button-state='hover']
  :deep(.ui-icon-btn--ghost) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-specimens__case[data-icon-button-state='hover']
  :deep(.ui-icon-btn--accent) {
  background: var(--ui-color-accent-hover);
}

.demo-specimens__case[data-icon-button-state='hover']
  :deep(.ui-icon-btn--command) {
  background: var(--ui-color-command-surface-hover);
}

.demo-specimens__case[data-icon-button-state='hover']
  :deep(.ui-icon-btn--overlay) {
  background: var(--ui-color-overlay-scrim-hover);
}

.demo-specimens__case[data-icon-button-state='pressed']
  :deep(.ui-icon-btn--ghost) {
  background: var(--ui-color-surface-active);
  color: var(--ui-color-text);
}

.demo-specimens__case[data-icon-button-state='pressed']
  :deep(.ui-icon-btn--accent) {
  background: var(--ui-color-accent-active);
}

.demo-specimens__case[data-icon-button-state='pressed']
  :deep(.ui-icon-btn--command) {
  background: var(--ui-color-command-surface-active);
}

.demo-specimens__case[data-icon-button-state='pressed']
  :deep(.ui-icon-btn--overlay) {
  background: var(--ui-color-overlay-scrim-active);
}
</style>
