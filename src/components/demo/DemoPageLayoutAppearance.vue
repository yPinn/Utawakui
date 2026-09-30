<script setup>
import { computed, shallowRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

const previewMode = shallowRef('wide');
const contentMode = shallowRef('overflow');
const activeFolderId = shallowRef('setlist');

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
    description: '整理曲目、錄音素材與輸出狀態，讓下一次錄製能立即繼續。',
    action: '新增素材',
  },
  {
    id: 'lyrics',
    label: 'Lyrics',
    title: '同步歌詞工作區',
    description: '集中確認歌詞來源、時間軸與演出時需要的提示內容。',
    action: '匯入歌詞',
  },
  {
    id: 'output',
    label: 'Output',
    title: '直播輸出工作區',
    description: '檢查場景內容、版型與對外輸出的目前狀態。',
    action: '新增版型',
  },
  {
    id: 'import',
    label: 'Import',
    title: '素材匯入工作區',
    description: '將本機素材加入曲庫，並在處理前確認來源與必要資訊。',
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
        <strong>主要區塊 Folder layout</strong>
        <p>
          整個主要區塊就是資料夾：所有 workflow 共用低彩度 Indigo
          material，色彩只出現在水平 tab 與 perimeter；中性文件面仍是內容主體。
          這裡仍是外觀候選，不代表 production adoption。
        </p>
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
        aria-labelledby="demo-page-layout-specimen-title"
      >
        <svg width="0" height="0" aria-hidden="true" focusable="false">
          <defs>
            <clipPath
              id="demo-folder-tab-shape"
              clipPathUnits="objectBoundingBox"
            >
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
                title-id="demo-page-layout-specimen-title"
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
            >
              <div class="demo-page-layout__sections">
                <section
                  class="demo-page-layout__section"
                  aria-labelledby="demo-page-layout-overview-title"
                >
                  <header class="demo-page-layout__section-heading">
                    <h3 id="demo-page-layout-overview-title">工作集概覽</h3>
                    <p>
                      Folder shell
                      負責識別與邊界，文件內容維持中性且可快速掃描。
                    </p>
                  </header>
                  <dl class="demo-page-layout__facts">
                    <div>
                      <dt>目前階段</dt>
                      <dd>素材整理</dd>
                    </div>
                    <div>
                      <dt>更新時間</dt>
                      <dd>今天 18:40</dd>
                    </div>
                    <div>
                      <dt>輸出目標</dt>
                      <dd>直播＋Cover</dd>
                    </div>
                  </dl>
                </section>

                <section
                  v-if="contentMode === 'overflow'"
                  class="demo-page-layout__section"
                  aria-labelledby="demo-page-layout-materials-title"
                >
                  <header class="demo-page-layout__section-heading">
                    <h3 id="demo-page-layout-materials-title">素材狀態</h3>
                    <p>以列表與分隔線呈現，不在文件裡再堆疊卡片。</p>
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
                  aria-labelledby="demo-page-layout-next-title"
                >
                  <header class="demo-page-layout__section-heading">
                    <h3 id="demo-page-layout-next-title">接續工作</h3>
                    <p>保留下一次操作需要的明確狀態與順序。</p>
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
                  aria-labelledby="demo-page-layout-notes-title"
                >
                  <header class="demo-page-layout__section-heading">
                    <h3 id="demo-page-layout-notes-title">備註</h3>
                    <p>
                      長內容只在文件 body 內捲動；Folder tabs、彩色
                      perimeter、頁面標題與主要操作都維持固定。
                    </p>
                  </header>
                </section>
              </div>
            </UiScrollRegion>
          </div>
        </div>
      </section>
    </div>

    <p class="demo-page-layout__caption">
      Tab row 永久保留 active 最大高度，選取切換只在固定 envelope
      內移動；不會把文件起點往上或往下推。寬度切換模擬一般視窗與較窄
      workspace，內容量切換確認 scrollbar 只在真正 overflow 時出現。
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
  clip-path: url(#demo-folder-tab-shape);
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
.demo-page-layout__folder-tab--active:hover::before,
.demo-page-layout__folder-tab--active .demo-page-layout__folder-tab-label {
  transform: translateY(0);
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
</style>
