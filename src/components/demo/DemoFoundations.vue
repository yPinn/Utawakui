<script setup>
import { FOLDER_REFERENCE_SWATCHES } from '../../constants/uiDemoPalette';
import UiButton from '../ui/UiButton.vue';
import UiKbd from '../ui/UiKbd.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiStack from '../ui/UiStack.vue';
import UiSurface from '../ui/UiSurface.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoCoreMinimums from './DemoCoreMinimums.vue';
import DemoDensity from './DemoDensity.vue';
import DemoPageLayoutAppearance from './DemoPageLayoutAppearance.vue';
import DemoScrollbarAppearance from './DemoScrollbarAppearance.vue';
import DemoSpacingShape from './DemoSpacingShape.vue';
import DemoStatusPalette from './DemoStatusPalette.vue';
import DemoTypography from './DemoTypography.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const SURFACE_SAMPLES = [
  { label: 'canvas-md', tone: 'canvas', radius: 'md' },
  { label: 'surface-md', tone: 'surface', radius: 'md' },
  { label: 'raised-lg', tone: 'raised', radius: 'lg' },
];

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
</script>

<template>
  <div class="demo-foundations">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="section.reviewed !== false"
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

      <DemoStatusPalette v-else-if="section.key === 'status-palette'" />

      <DemoTypography v-else-if="section.key === 'typography'" />

      <DemoSpacingShape v-else-if="section.key === 'spacing-shape'" />

      <DemoCoreMinimums v-else-if="section.key === 'core-minimums'" />

      <DemoDensity v-else-if="section.key === 'density'" />

      <DemoScrollbarAppearance v-else-if="section.key === 'scrollbar'" />

      <DemoPageLayoutAppearance v-else-if="section.key === 'page-layout'" />

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

      <div
        v-else-if="section.key === 'separator'"
        class="demo-separator-samples"
      >
        <div class="demo-separator-samples__horizontal">
          <span>區段一</span>
          <UiSeparator />
          <span>區段二</span>
        </div>
        <div class="demo-separator-samples__vertical">
          <span>左側</span>
          <UiSeparator orientation="vertical" :decorative="false" />
          <span>右側</span>
        </div>
        <p class="demo-sample-caption">
          分隔線只擁有方向、邊界 token 與語意；外距由 caller layout 負責。
        </p>
      </div>

      <div v-else-if="section.key === 'stack'" class="demo-stack-samples">
        <UiStack class="demo-sample-surface" direction="column" :gap="2">
          <span>第一行</span>
          <span>第二行</span>
          <span>第三行</span>
        </UiStack>
        <UiStack class="demo-sample-surface" wrap :gap="2">
          <span>標籤一</span>
          <span>標籤二</span>
          <span>標籤三</span>
        </UiStack>
        <p class="demo-sample-caption">
          只擁有
          display:flex／direction／gap／align／justify／wrap；其餘版面責任（寬度、padding、捲動）由
          caller 擁有。
        </p>
      </div>

      <div v-else-if="section.key === 'surface'" class="demo-surface-samples">
        <UiSurface
          v-for="sample in SURFACE_SAMPLES"
          :key="sample.label"
          class="demo-surface-sample"
          :tone="sample.tone"
          :radius="sample.radius"
        >
          <code>tone="{{ sample.tone }}" radius="{{ sample.radius }}"</code>
        </UiSurface>
        <p class="demo-sample-caption">
          只擁有 border／border-radius／background；padding、display、gap
          等版面責任由 caller 擁有。
        </p>
      </div>

      <div v-else-if="section.key === 'kbd'" class="demo-kbd-samples">
        <span><UiKbd>F8</UiKbd> 開啟元件型錄</span>
        <span><UiKbd>Esc</UiKbd> 關閉目前浮層</span>
        <span><UiKbd>Ctrl</UiKbd> + <UiKbd>K</UiKbd> 快速操作範例</span>
        <p class="demo-sample-caption">
          只顯示caller提供的快捷鍵；command註冊、平台映射與可用狀態不屬於Kbd。
        </p>
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-foundations {
  display: grid;
  gap: var(--ui-space-4);
}

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
.demo-folder-swatch__copy code {
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

.demo-sample-surface :deep(.ui-page-header) {
  margin-bottom: var(--ui-space-3);
}

.demo-separator-samples,
.demo-separator-samples__horizontal {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.demo-separator-samples__vertical {
  min-height: calc(var(--ui-control-height) * 2);
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}

.demo-stack-samples {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.demo-surface-samples {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.demo-surface-sample {
  min-width: 0;
  padding: var(--ui-space-3);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.demo-kbd-samples {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
}
</style>
