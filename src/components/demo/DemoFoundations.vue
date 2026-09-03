<script setup>
import {
  FOLDER_REFERENCE_SWATCHES,
  STATUS_COLOR_SWATCHES,
  STATUS_ROLE_SAMPLES,
} from '../../constants/uiDemoPalette';
import { CircleX, Play } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoDensity from './DemoDensity.vue';
import DemoTypography from './DemoTypography.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const SYSTEM_COLOR_SWATCHES = [
  {
    label: '畫布',
    token: '--ui-color-canvas',
    dark: '#191A1E',
    light: '#E8E4DD',
  },
  {
    label: '基底',
    token: '--ui-color-surface',
    dark: '#272928',
    light: '#F3F1EC',
  },
  {
    label: '浮起',
    token: '--ui-color-surface-raised',
    dark: '#2D2F35',
    light: '#FBFAF7',
  },
  {
    label: 'Hover',
    token: '--ui-color-surface-hover',
    dark: '#3C3E46',
    light: '#E2E2E4',
  },
  {
    label: 'Active',
    token: '--ui-color-surface-active',
    dark: '#50535B',
    light: '#C7C8CC',
  },
  {
    label: 'Selected',
    token: '--ui-color-surface-selected',
    dark: '#293A5B',
    light: '#E0E5F3',
  },
  {
    label: '主要文字',
    token: '--ui-color-text',
    dark: '#F3F1EC',
    light: '#272928',
  },
  {
    label: '次要文字',
    token: '--ui-color-text-muted',
    dark: '#A7A9AF',
    light: '#50535B',
  },
  {
    label: '邊界',
    token: '--ui-color-border',
    dark: '#3C3E46',
    light: '#C7C8CC',
  },
  {
    label: '主題色',
    token: '--ui-color-accent',
    dark: '#8296D0',
    light: '#3D578E',
  },
  {
    label: '主題 Hover',
    token: '--ui-color-accent-hover',
    dark: '#A5B3D8',
    light: '#334873',
  },
  {
    label: '鍵盤焦點',
    token: '--ui-color-focus',
    dark: '#A5B3D8',
    light: '#50679F',
  },
];

const SPACING_STEPS = [
  { value: '0.25rem', dip: 4, token: '--ui-space-1' },
  { value: '0.5rem', dip: 8, token: '--ui-space-2' },
  { value: '0.75rem', dip: 12, token: '--ui-space-3' },
  { value: '1rem', dip: 16, token: '--ui-space-4' },
  { value: '1.5rem', dip: 24, token: '--ui-space-5' },
  { value: '2rem', dip: 32, token: '--ui-space-6' },
];

const RADIUS_STEPS = [
  { value: '0.125rem', dip: 2, token: '--ui-radius-xs' },
  { value: '0.25rem', dip: 4, token: '--ui-radius-sm' },
  { value: '0.375rem', dip: 6, token: '--ui-radius-md' },
  { value: '0.5rem', dip: 8, token: '--ui-radius-lg' },
];

const UNIT_RESPONSIBILITIES = [
  {
    unit: 'rem',
    title: '可縮放 UI 幾何',
    usage: '字體、間距、圓角、元件尺寸與 CSS breakpoint。',
  },
  {
    unit: 'px',
    title: '精準光學邊界',
    usage: '1px 邊框，以及 2px focus／drag／state indicator。',
  },
  {
    unit: 'DIP',
    title: 'Electron 視窗幾何',
    usage: 'BrowserWindow 尺寸與座標；不加 CSS 單位。',
  },
  {
    unit: 'physical px',
    title: 'Raster／canvas backing',
    usage: '圖片來源尺寸與 backing buffer；不作 CSS layout。',
  },
];
</script>

<template>
  <div class="demo-foundations">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
    >
      <div v-if="section.key === 'system-palette'" class="demo-review-block">
        <p class="demo-review-note">
          <strong>中性系統介面。</strong>
          Canvas、Surface 與一般控制保持低干擾；Indigo
          暫時只負責主題、選取與焦點。
        </p>
        <div class="demo-swatches">
          <figure
            v-for="swatch in SYSTEM_COLOR_SWATCHES"
            :key="swatch.token"
            class="demo-swatch"
          >
            <span
              class="demo-swatch__color"
              :style="{ backgroundColor: `var(${swatch.token})` }"
            />
            <figcaption class="demo-swatch__copy">
              <strong>{{ swatch.label }}</strong>
              <code>{{ swatch.token }}</code>
              <span class="demo-swatch__values">
                <span>D {{ swatch.dark }}</span>
                <span>L {{ swatch.light }}</span>
              </span>
            </figcaption>
          </figure>
        </div>
      </div>

      <div
        v-else-if="section.key === 'folder-palette'"
        class="demo-review-block"
      >
        <p class="demo-review-note">
          <strong>高彩度只屬於 Folder。</strong>
          下列為 Mosby Files 的視覺參考樣本，尚未寫入
          token；用來確認分類物件需要的色彩強度。
        </p>
        <div class="demo-folder-swatches" aria-label="Folder 高彩度參考樣本">
          <figure
            v-for="folder in FOLDER_REFERENCE_SWATCHES"
            :key="folder.label"
            class="demo-folder-swatch"
            :style="{
              '--demo-folder-color': folder.value,
              '--demo-folder-ink': folder.ink,
            }"
          >
            <span class="demo-folder-swatch__tab">{{ folder.label }}</span>
            <figcaption class="demo-folder-swatch__copy">
              <code>{{ folder.value }}</code>
              <span>參考樣本，尚未寫入 token</span>
            </figcaption>
          </figure>
        </div>
      </div>

      <div
        v-else-if="section.key === 'status-palette'"
        class="demo-review-block"
      >
        <p class="demo-review-note">
          <strong>Mildliner 狀態色。</strong>
          色票來源，不是筆觸外觀。主要訊號直接使用原色 100%；Soft
          只作訊息區塊的選用背景。
        </p>
        <div class="demo-status-swatches">
          <figure
            v-for="status in STATUS_COLOR_SWATCHES"
            :key="status.token"
            class="demo-status-swatch"
            :style="{
              '--demo-status-color': `var(${status.token})`,
              '--demo-status-soft': `var(${status.softToken})`,
            }"
          >
            <div class="demo-status-swatch__heading">
              <span class="demo-status-swatch__color" aria-hidden="true" />
              <span class="demo-status-swatch__identity">
                <strong>{{ status.label }}</strong>
                <span>原色 100%</span>
              </span>
            </div>
            <figcaption class="demo-status-swatch__copy">
              <code>{{ status.token }}</code>
              <span>D {{ status.dark }} · L {{ status.light }}</span>
              <span class="demo-status-swatch__soft">Soft 背景（選用）</span>
            </figcaption>
          </figure>
        </div>
        <div class="demo-status-role-review">
          <div class="demo-status-role-review__intro">
            <strong>同色可以，語意不能混用。</strong>
            <span>
              Current 使用 Indigo；Live 與 Danger 保留不同
              token，並以固定形狀與標籤區分。
            </span>
          </div>
          <div
            class="demo-status-roles"
            aria-label="Current、Live 與 Danger 語意界線"
          >
            <article
              v-for="role in STATUS_ROLE_SAMPLES"
              :key="role.key"
              class="demo-status-role"
              :data-signal-role="role.key"
              :style="{ '--demo-signal-color': `var(${role.token})` }"
            >
              <div class="demo-status-role__signal">
                <span
                  v-if="role.key === 'current'"
                  class="demo-status-role__current"
                >
                  <span class="demo-status-role__rail" aria-hidden="true" />
                  <Play :size="16" :stroke-width="2" aria-hidden="true" />
                  <strong>{{ role.label }}</strong>
                </span>
                <span
                  v-else-if="role.key === 'live'"
                  class="demo-status-role__live"
                >
                  <span class="demo-status-role__dot" aria-hidden="true" />
                  <strong>LIVE</strong>
                  <span>{{ role.label }}</span>
                </span>
                <span v-else class="demo-status-role__danger">
                  <CircleX :size="17" :stroke-width="2" aria-hidden="true" />
                  <strong>{{ role.label }}</strong>
                </span>
              </div>
              <code>{{ role.token }}</code>
              <span class="demo-status-role__cue">{{ role.cue }}</span>
            </article>
          </div>
        </div>
      </div>

      <DemoTypography v-else-if="section.key === 'typography'" />

      <div
        v-else-if="section.key === 'spacing-shape'"
        class="demo-review-block"
      >
        <p class="demo-review-note">
          <strong>尺寸以 rem 為契約。</strong>
          DIP 只表示預設 16px 根字級下的視覺等值；它不是 CSS token
          的單位，也不代表實體顯示像素。
        </p>
        <div class="demo-unit-responsibilities" aria-label="UI 單位責任">
          <article
            v-for="responsibility in UNIT_RESPONSIBILITIES"
            :key="responsibility.unit"
            class="demo-unit-responsibility"
          >
            <code>{{ responsibility.unit }}</code>
            <strong>{{ responsibility.title }}</strong>
            <span>{{ responsibility.usage }}</span>
          </article>
        </div>
        <div class="demo-foundation-pair">
          <section
            class="demo-scale-group"
            aria-labelledby="demo-spacing-title"
          >
            <h4 id="demo-spacing-title" class="demo-scale-group__title">
              Spacing
            </h4>
            <div
              class="demo-scale-preview demo-scale-preview--spacing"
              data-demo-preview="spacing"
              aria-label="Spacing 視覺尺度"
            >
              <span
                v-for="step in SPACING_STEPS"
                :key="step.token"
                class="demo-spacing-specimen"
                :style="{ width: `var(${step.token})` }"
                :aria-label="`${step.value} spacing`"
              />
            </div>
            <div
              class="demo-scale-reference-wrap"
              data-demo-reference="spacing"
            >
              <table class="demo-scale-reference">
                <caption>
                  Spacing token 參考值
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Token</th>
                    <th scope="col">rem</th>
                    <th scope="col">DIP 等值</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="step in SPACING_STEPS"
                    :key="step.token"
                    :data-scale-token="step.token"
                  >
                    <th scope="row">
                      <code>{{ step.token }}</code>
                    </th>
                    <td>
                      <code>{{ step.value }}</code>
                    </td>
                    <td>{{ step.dip }} DIP</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section class="demo-scale-group" aria-labelledby="demo-radius-title">
            <h4 id="demo-radius-title" class="demo-scale-group__title">
              Radius
            </h4>
            <div
              class="demo-scale-preview demo-scale-preview--radius"
              data-demo-preview="radius"
              aria-label="Radius 視覺尺度"
            >
              <span
                v-for="radius in RADIUS_STEPS"
                :key="radius.token"
                class="demo-radius-specimen"
                :style="{ borderRadius: `var(${radius.token})` }"
                :aria-label="`${radius.value} radius`"
              />
            </div>
            <div class="demo-scale-reference-wrap" data-demo-reference="radius">
              <table class="demo-scale-reference">
                <caption>
                  Radius token 參考值
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Token</th>
                    <th scope="col">rem</th>
                    <th scope="col">DIP 等值</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="radius in RADIUS_STEPS"
                    :key="radius.token"
                    :data-scale-token="radius.token"
                  >
                    <th scope="row">
                      <code>{{ radius.token }}</code>
                    </th>
                    <td>
                      <code>{{ radius.value }}</code>
                    </td>
                    <td>{{ radius.dip }} DIP</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <DemoDensity v-else-if="section.key === 'density'" />

      <div
        v-else-if="section.key === 'page-header'"
        class="demo-sample-surface"
      >
        <UiPageHeader title="歌曲資料">
          <template #actions>
            <UiButton variant="accent">儲存變更</UiButton>
          </template>
        </UiPageHeader>
        <p class="demo-sample-caption">
          標題與動作保持同一基線；窄幅時仍保留清楚的操作名稱。
        </p>
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-review-block {
  display: grid;
  gap: var(--ui-space-4);
}

.demo-review-note {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-review-note strong {
  color: var(--ui-color-text);
}

.demo-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: var(--ui-space-3);
}

.demo-swatch {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
}

.demo-swatch__color {
  display: block;
  height: 3.25rem;
}

.demo-swatch__copy {
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-2);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
}

.demo-swatch__copy code,
.demo-folder-swatch__copy code,
.demo-status-swatch__copy code {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  overflow-wrap: anywhere;
}

.demo-swatch__values {
  display: grid;
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
}

.demo-folder-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--ui-space-3);
}

.demo-folder-swatch {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border-radius: var(--ui-radius-sm);
  background: var(--demo-folder-color);
  color: var(--demo-folder-ink);
}

.demo-folder-swatch__tab {
  min-height: var(--ui-control-height);
  display: flex;
  align-items: center;
  width: min(75%, 8rem);
  padding: 0 var(--ui-space-3);
  border-radius: 0 0 var(--ui-radius-lg) 0;
  background: color-mix(
    in srgb,
    var(--ui-palette-neutral-950) 12%,
    transparent
  );
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-folder-swatch__copy {
  min-height: 5rem;
  display: grid;
  align-content: end;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3);
  font-size: var(--ui-font-size-sm);
}

.demo-folder-swatch__copy code {
  color: inherit;
}

.demo-status-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--ui-space-3);
}

.demo-status-swatch {
  min-width: 0;
  margin: 0;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
}

.demo-status-swatch__heading {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}

.demo-status-swatch__color {
  flex: 0 0 auto;
  width: var(--ui-control-height);
  height: var(--ui-control-height);
  border-radius: var(--ui-radius-sm);
  background: var(--demo-status-color);
}

.demo-status-swatch__identity {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
}

.demo-status-swatch__identity > span {
  color: var(--ui-color-text-muted);
}

.demo-status-swatch__copy {
  display: grid;
  gap: var(--ui-space-1);
  margin-top: var(--ui-space-3);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.demo-status-swatch__soft {
  width: fit-content;
  margin-top: var(--ui-space-1);
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--demo-status-soft);
  color: var(--ui-color-text);
}

.demo-status-role-review {
  display: grid;
  gap: var(--ui-space-3);
  padding-top: var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-status-role-review__intro {
  max-width: 72ch;
  display: grid;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-status-role-review__intro strong {
  color: var(--ui-color-text);
}

.demo-status-roles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--ui-space-3);
}

.demo-status-role {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.demo-status-role code,
.demo-status-role__cue {
  overflow-wrap: anywhere;
}

.demo-status-role__signal {
  min-height: var(--ui-control-height);
  display: flex;
  align-items: center;
}

.demo-status-role__current,
.demo-status-role__live,
.demo-status-role__danger {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-color-text);
}

.demo-status-role__current {
  color: var(--demo-signal-color);
}

.demo-status-role__rail {
  width: var(--ui-border-width);
  height: calc(var(--ui-control-height) - var(--ui-space-2));
  background: var(--demo-signal-color);
}

.demo-status-role__dot {
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: 50%;
  background: var(--demo-signal-color);
}

.demo-status-role__live strong,
.demo-status-role__danger {
  color: var(--demo-signal-color);
}

.demo-foundation-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-6);
}

.demo-unit-responsibilities {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: var(--ui-space-3);
}

.demo-unit-responsibility {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-unit-responsibility code {
  width: fit-content;
  color: var(--ui-color-accent);
  font-family: var(--ui-font-family-base);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-unit-responsibility strong {
  color: var(--ui-color-text);
}

.demo-scale-group {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
}

.demo-scale-group__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-scale-preview {
  display: grid;
  min-height: 12rem;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
}

.demo-scale-preview--spacing {
  grid-template-rows: repeat(6, minmax(var(--ui-space-3), 1fr));
  align-items: center;
}

.demo-scale-preview--radius {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.demo-spacing-specimen {
  display: block;
  height: var(--ui-space-2);
  min-width: var(--ui-border-width);
  background: var(--ui-color-accent);
}

.demo-radius-specimen {
  min-height: 4rem;
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  background: var(--ui-color-surface-raised);
}

.demo-scale-reference-wrap {
  min-width: 0;
  overflow-x: auto;
}

.demo-scale-reference {
  width: 100%;
  min-width: 20rem;
  border-collapse: collapse;
  table-layout: fixed;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.demo-scale-reference caption {
  margin-bottom: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  text-align: left;
}

.demo-scale-reference th,
.demo-scale-reference td {
  padding: var(--ui-space-2);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
  text-align: left;
  vertical-align: top;
}

.demo-scale-reference th:first-child {
  width: 52%;
}

.demo-scale-reference code {
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-weight: var(--ui-font-weight-regular);
  overflow-wrap: anywhere;
}

.demo-sample-surface :deep(.ui-page-header) {
  margin-bottom: var(--ui-space-3);
}

@media (max-width: 42rem) {
  .demo-foundation-pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
