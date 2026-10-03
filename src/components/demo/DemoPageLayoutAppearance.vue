<script setup>
import { computed, shallowRef, useId } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

const previewMode = shallowRef('wide');
const contentMode = shallowRef('overflow');
const activeFolderId = shallowRef('setlist');
const instanceId = useId();
const folderTabShapeId = `demo-folder-tab-shape-${instanceId}`;
const specimenTitleId = `demo-page-layout-specimen-title-${instanceId}`;
const overviewTitleId = `demo-page-layout-overview-title-${instanceId}`;
const materialsTitleId = `demo-page-layout-materials-title-${instanceId}`;
const nextTitleId = `demo-page-layout-next-title-${instanceId}`;
const notesTitleId = `demo-page-layout-notes-title-${instanceId}`;
const folderTabShapeStyle = {
  '--demo-folder-tab-shape': `url("#${folderTabShapeId}")`,
};

const previewModes = [
  { id: 'wide', label: '寬版' },
  { id: 'narrow', label: '窄版' },
];
const contentModes = [
  { id: 'short', label: '短內容' },
  { id: 'overflow', label: '長內容' },
];
const folderDefinitions = [
  {
    id: 'setlist',
    label: 'Setlist',
    title: '夏季 Cover 工作集',
    description: '整理曲目、素材與輸出狀態。',
    action: '新增素材',
  },
  {
    id: 'lyrics',
    label: 'Lyrics',
    title: '同步歌詞工作區',
    description: '確認歌詞、時間軸與演出提示。',
    action: '匯入歌詞',
  },
  {
    id: 'output',
    label: 'Output',
    title: '直播輸出工作區',
    description: '檢查版型與公開輸出狀態。',
    action: '新增版型',
  },
  {
    id: 'import',
    label: 'Import',
    title: '素材匯入工作區',
    description: '加入本機素材並確認必要資訊。',
    action: '選擇檔案',
  },
];
const materialRows = [
  { name: '主唱錄音', detail: 'WAV · 48 kHz', state: '已整理' },
  { name: '伴奏版本', detail: 'Instrumental', state: '待確認' },
  { name: '同步歌詞', detail: 'LRC · 繁體中文', state: '已完成' },
  { name: '封面影像', detail: 'PNG · 3000 × 3000', state: '需補充' },
];

const previewClasses = computed(() => ({
  'demo-page-layout__preview--narrow': previewMode.value === 'narrow',
}));
const activeFolder = computed(
  () =>
    folderDefinitions.find((page) => page.id === activeFolderId.value) ??
    folderDefinitions[0],
);

function revealFolderTab(event) {
  event.currentTarget?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  });
}

function selectFolder(pageId, event) {
  activeFolderId.value = pageId;
  revealFolderTab(event);
}
</script>

<template>
  <div class="demo-page-layout">
    <header class="demo-page-layout__tools">
      <div class="demo-page-layout__tools-copy">
        <strong>Folder 外框</strong>
        <p>Folder 外觀色屬於元件，內容保持中性。</p>
      </div>
      <div class="demo-page-layout__controls">
        <div class="demo-page-layout__control">
          <span>寬度</span>
          <UiSegmentedControl
            v-model="previewMode"
            :items="previewModes"
            aria-label="頁面版型預覽寬度"
          />
        </div>
        <div class="demo-page-layout__control">
          <span>內容</span>
          <UiSegmentedControl
            v-model="contentMode"
            :items="contentModes"
            aria-label="頁面版型內容量"
          />
        </div>
      </div>
    </header>

    <div class="demo-page-layout__stage">
      <section
        class="demo-page-layout__preview"
        :class="previewClasses"
        :data-preview-width="previewMode"
        :data-content-mode="contentMode"
        :data-folder-view="activeFolder.id"
        :aria-labelledby="specimenTitleId"
        :style="folderTabShapeStyle"
      >
        <svg width="0" height="0" aria-hidden="true" focusable="false">
          <defs>
            <clipPath :id="folderTabShapeId" clipPathUnits="objectBoundingBox">
              <path
                d="M0.16,0 L0.84,0 C0.9,0 0.92,0.18 0.95,0.42 L1,1 L0,1 L0.05,0.42 C0.08,0.18 0.1,0 0.16,0 Z"
              />
            </clipPath>
          </defs>
        </svg>

        <UiScrollRegion
          class="demo-page-layout__folder-tabs"
          axis="horizontal"
          scrollbar-visibility="hidden"
          viewport-tag="nav"
          viewport-class="demo-page-layout__folder-tabs-viewport"
          aria-label="Folder 頁面"
        >
          <button
            v-for="page in folderDefinitions"
            :key="page.id"
            type="button"
            class="demo-page-layout__folder-tab"
            :class="{
              'demo-page-layout__folder-tab--active':
                page.id === activeFolder.id,
            }"
            :aria-current="page.id === activeFolder.id ? 'page' : undefined"
            @focus="revealFolderTab"
            @click="selectFolder(page.id, $event)"
          >
            <span class="demo-page-layout__folder-tab-label">
              {{ page.label }}
            </span>
          </button>
        </UiScrollRegion>

        <div class="demo-page-layout__folder-shell">
          <div class="demo-page-layout__document">
            <header class="demo-page-layout__header">
              <UiPageHeader
                :title="activeFolder.title"
                :title-id="specimenTitleId"
              >
                <template #description>
                  {{ activeFolder.description }}
                </template>
                <template #actions>
                  <UiButton variant="accent">
                    {{ activeFolder.action }}
                  </UiButton>
                </template>
              </UiPageHeader>
            </header>

            <UiScrollRegion
              class="demo-page-layout__body-scroll"
              axis="vertical"
              viewport-class="demo-page-layout__body"
              :aria-label="activeFolder.title + '內容'"
              role="region"
              tabindex="0"
            >
              <div class="demo-page-layout__sections">
                <section
                  class="demo-page-layout__section"
                  :aria-labelledby="overviewTitleId"
                >
                  <header class="demo-page-layout__section-heading">
                    <h3 :id="overviewTitleId">工作集摘要</h3>
                    <p>12 首曲目，3 項待確認。</p>
                  </header>
                  <dl class="demo-page-layout__facts">
                    <div>
                      <dt>曲目</dt>
                      <dd>12 首</dd>
                    </div>
                    <div>
                      <dt>待確認</dt>
                      <dd>3 項</dd>
                    </div>
                    <div>
                      <dt>已完成</dt>
                      <dd>9 項</dd>
                    </div>
                  </dl>
                  <aside class="demo-page-layout__summary-note">
                    先處理待確認素材，再檢查輸出。
                  </aside>
                </section>

                <section
                  v-if="contentMode === 'overflow'"
                  class="demo-page-layout__section"
                  :aria-labelledby="materialsTitleId"
                >
                  <header class="demo-page-layout__section-heading">
                    <h3 :id="materialsTitleId">素材狀態</h3>
                  </header>
                  <ul class="demo-page-layout__material-list">
                    <li v-for="material in materialRows" :key="material.name">
                      <span class="demo-page-layout__material-copy">
                        <strong>{{ material.name }}</strong>
                        <span>{{ material.detail }}</span>
                      </span>
                      <span class="demo-page-layout__material-state">
                        {{ material.state }}
                      </span>
                    </li>
                  </ul>
                </section>

                <section
                  v-if="contentMode === 'overflow'"
                  class="demo-page-layout__section"
                  :aria-labelledby="nextTitleId"
                >
                  <header class="demo-page-layout__section-heading">
                    <h3 :id="nextTitleId">接續工作</h3>
                  </header>
                  <ol class="demo-page-layout__steps">
                    <li>確認伴奏版本與主唱錄音採樣率。</li>
                    <li>校正歌詞時間軸並完成演出提示。</li>
                    <li>檢查直播版型與 Cover 輸出尺寸。</li>
                  </ol>
                </section>

                <section
                  v-if="contentMode === 'overflow'"
                  class="demo-page-layout__section"
                  :aria-labelledby="notesTitleId"
                >
                  <header class="demo-page-layout__section-heading">
                    <h3 :id="notesTitleId">版面檢查</h3>
                    <p>標題固定，內容獨立捲動。</p>
                  </header>
                </section>
              </div>
            </UiScrollRegion>
          </div>
        </div>
      </section>
    </div>

    <p class="demo-page-layout__caption">
      切換寬窄版與內容量，確認固定區與捲動範圍。
    </p>
  </div>
</template>

<style scoped>
.demo-page-layout {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-4);
}

.demo-page-layout__tools {
  min-width: 0;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--ui-space-4);
}

.demo-page-layout__tools-copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-page-layout__tools-copy strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-page-layout__tools-copy p,
.demo-page-layout__caption {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-page-layout__controls {
  flex: 0 0 auto;
  display: flex;
  align-items: end;
  gap: var(--ui-space-3);
}

.demo-page-layout__control {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-page-layout__stage {
  min-width: 0;
  display: flex;
  justify-content: center;
  padding: var(--ui-space-4);
  overflow: hidden;
  background: var(--ui-color-canvas);
}

.demo-page-layout__preview {
  --demo-folder-color: var(--ui-folder-bg);
  --demo-folder-ink: var(--ui-color-text);

  width: 100%;
  max-width: 64rem;
  min-width: 0;
  container-type: inline-size;
  container-name: demo-page-layout;
}

.demo-page-layout__preview--narrow {
  width: min(28rem, 100%);
}

.demo-page-layout__folder-tabs {
  position: relative;
  isolation: isolate;
  z-index: 2;
  min-width: 0;
  block-size: var(--ui-folder-tab-height-active);
  margin-bottom: calc(-1 * var(--ui-folder-tab-cover-size));
}

.demo-page-layout__folder-tabs::after {
  content: '';
  position: absolute;
  z-index: 2;
  inset-inline: 0;
  inset-block-end: 0;
  block-size: var(--ui-folder-tab-cover-size);
  background: var(--demo-folder-color);
  pointer-events: none;
}

.demo-page-layout__folder-tabs :deep(.demo-page-layout__folder-tabs-viewport) {
  box-sizing: border-box;
  block-size: 100%;
  display: flex;
  align-items: start;
  gap: var(--ui-space-2);
  padding-inline: var(--ui-folder-perimeter);
  scroll-padding-inline: var(--ui-folder-perimeter);
}

.demo-page-layout__folder-tab {
  position: relative;
  isolation: isolate;
  z-index: 1;
  min-width: var(--ui-folder-tab-min-inline-size);
  block-size: var(--ui-folder-tab-height-active);
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  margin: 0;
  padding: 0 var(--ui-space-4);
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
  transition: color var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.demo-page-layout__folder-tab::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 0;
  clip-path: var(--demo-folder-tab-shape);
  background: var(--ui-color-surface-raised);
  transform: translateY(var(--ui-folder-tab-rest-offset));
  transition: transform var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.demo-page-layout__folder-tab-label {
  position: relative;
  z-index: 1;
  min-width: 0;
  max-width: 100%;
  block-size: var(--ui-folder-tab-label-block-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: translateY(var(--ui-folder-tab-label-rest-offset));
  transition: transform var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.demo-page-layout__folder-tab:hover {
  color: var(--ui-color-text);
}

.demo-page-layout__folder-tab:hover::before {
  background: var(--ui-color-surface-hover);
}

.demo-page-layout__folder-tab--active {
  z-index: 3;
  color: var(--demo-folder-ink);
}

.demo-page-layout__folder-tab--active::before,
.demo-page-layout__folder-tab--active:hover::before {
  background: var(--demo-folder-color);
}

.demo-page-layout__folder-tab--active::before,
.demo-page-layout__folder-tab--active:hover::before {
  transform: translateY(0);
}

.demo-page-layout__folder-tab--active .demo-page-layout__folder-tab-label {
  transform: translateY(var(--ui-folder-tab-label-optical-offset));
}

.demo-page-layout__folder-tab:focus-visible {
  z-index: 4;
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-page-layout__folder-shell {
  position: relative;
  z-index: 1;
  min-width: 0;
  height: 34rem;
  padding: var(--ui-folder-perimeter);
  overflow: hidden;
  border-radius: 0 var(--ui-radius-sm) var(--ui-radius-sm);
  background: var(--demo-folder-color);
}

.demo-page-layout__document {
  min-width: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-surface);
}

.demo-page-layout__header {
  min-width: 0;
  padding: var(--ui-folder-document-inset);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-page-layout__header :deep(.ui-page-header) {
  margin-bottom: 0;
}

.demo-page-layout__header :deep(.ui-page-header__row) {
  min-width: 0;
  gap: var(--ui-space-4);
}

.demo-page-layout__body-scroll {
  min-height: 0;
  height: 100%;
}

.demo-page-layout__body-scroll :deep(.demo-page-layout__body) {
  min-height: 100%;
  padding: 0 var(--ui-folder-document-inset)
    var(--ui-folder-document-block-end-inset);
}

.demo-page-layout__sections {
  min-width: 0;
}

.demo-page-layout__section {
  min-width: 0;
  display: grid;
  gap: var(--ui-folder-section-gap);
  padding: var(--ui-folder-document-inset) 0;
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-page-layout__section:first-child {
  border-top: 0;
}

.demo-page-layout__section-heading {
  min-width: 0;
  display: grid;
  gap: var(--ui-folder-heading-gap);
}

.demo-page-layout__section-heading h3,
.demo-page-layout__section-heading p {
  margin: 0;
}

.demo-page-layout__section-heading h3 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-page-layout__section-heading p {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-body);
}

.demo-page-layout__facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-page-layout__summary-note {
  padding-inline-start: var(--ui-space-3);
  border-inline-start: calc(var(--ui-border-width) * 2) solid
    var(--ui-color-accent);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

.demo-page-layout__facts div {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3) 0;
}

.demo-page-layout__facts dt,
.demo-page-layout__facts dd {
  margin: 0;
}

.demo-page-layout__facts dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-page-layout__facts dd {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-page-layout__material-list,
.demo-page-layout__steps {
  margin: 0;
}

.demo-page-layout__material-list {
  padding: 0;
  list-style: none;
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-page-layout__material-list li {
  min-width: 0;
  min-height: var(--ui-track-row-min-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) 0;
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-page-layout__material-list li:first-child {
  border-top: 0;
}

.demo-page-layout__material-copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-page-layout__material-copy strong {
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-page-layout__material-copy span,
.demo-page-layout__material-state {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-page-layout__material-state {
  flex: 0 0 auto;
  font-weight: var(--ui-font-weight-semibold);
}

.demo-page-layout__steps {
  display: grid;
  gap: var(--ui-space-2);
  padding-inline-start: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-body);
}

@container demo-page-layout (max-width: 36rem) {
  .demo-page-layout__folder-tabs
    :deep(.demo-page-layout__folder-tabs-viewport) {
    gap: var(--ui-space-1);
  }

  .demo-page-layout__document {
    --ui-folder-document-inset: var(--ui-space-4);
    --ui-folder-document-block-end-inset: var(--ui-space-5);
    --ui-folder-section-gap: var(--ui-space-3);
  }

  .demo-page-layout__folder-tab {
    min-width: var(--ui-folder-tab-min-inline-size-narrow);
    flex: 1 1 var(--ui-folder-tab-min-inline-size-narrow);
    padding-inline: var(--ui-space-2);
  }

  .demo-page-layout__header :deep(.ui-page-header__row) {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--ui-space-3);
  }

  .demo-page-layout__facts {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-page-layout__facts div + div {
    border-top: var(--ui-border-width) solid var(--ui-color-border);
  }
}

@media (max-width: 48rem) {
  .demo-page-layout__tools {
    align-items: stretch;
    flex-direction: column;
  }

  .demo-page-layout__controls {
    flex-wrap: wrap;
  }

  .demo-page-layout__stage {
    padding: var(--ui-space-3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .demo-page-layout__folder-tab,
  .demo-page-layout__folder-tab::before,
  .demo-page-layout__folder-tab-label {
    transition: none;
  }
}

@media (forced-colors: active) {
  .demo-page-layout__folder-tab--active {
    color: HighlightText;
  }

  .demo-page-layout__folder-tab--active::before {
    border: var(--ui-border-width) solid Highlight;
    background: Highlight;
  }
}
</style>
