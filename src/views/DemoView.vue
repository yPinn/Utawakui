<script setup>
import { ref, shallowRef } from 'vue';
import {
  Download,
  Music,
  Pause,
  Pencil,
  Play,
  Repeat,
  Trash2,
} from '../icons/index.js';
import UiButton from '../components/ui/UiButton.vue';
import UiChip from '../components/ui/UiChip.vue';
import UiCollageThumb from '../components/ui/UiCollageThumb.vue';
import UiContextMenu from '../components/ui/UiContextMenu.vue';
import UiHint from '../components/ui/UiHint.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiMarqueeText from '../components/ui/UiMarqueeText.vue';
import UiModal from '../components/ui/UiModal.vue';
import UiNotice from '../components/ui/UiNotice.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import UiSearchBox from '../components/ui/UiSearchBox.vue';
import UiStatusIcon from '../components/ui/UiStatusIcon.vue';
import UiTextButton from '../components/ui/UiTextButton.vue';
import UiTextField from '../components/ui/UiTextField.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';
import UiTrackThumb from '../components/ui/UiTrackThumb.vue';
import { UI_DEMO_GROUPS } from '../constants/uiDemoSections.js';

// Every tone each primitive actually has CSS for — kept here instead of
// hardcoded markup per tone so a future tone addition to the component
// shows up here for free.
const CHIP_TONES = [
  'muted',
  'accent',
  'current',
  'info',
  'success',
  'warning',
  'danger',
  'gated',
];
const HINT_TONES = [
  'muted',
  'text',
  'info',
  'success',
  'warning',
  'danger',
  'gated',
];
const STATUS_ICON_TONES = [
  'muted',
  'accent',
  'info',
  'success',
  'warning',
  'danger',
  'current',
  'gated',
  'text',
  'highlight',
];

const searchQuery = shallowRef('');
const textFieldValue = shallowRef('I AM');

// No real library data on this page — just enough shape (id + optional
// thumbnailUrl) for UiCollageThumb's initial-letter fallback per cell.
const demoTracks = [
  { id: '1', title: 'Alpha' },
  { id: '2', title: 'Beta' },
  { id: '3', title: 'Gamma' },
  { id: '4', title: 'Delta' },
];

const contextMenu = ref({ open: false, x: 0, y: 0 });
const contextMenuItems = [
  { key: 'rename', label: '重新命名', icon: Pencil },
  {
    key: 'more',
    label: '更多選項',
    children: [{ key: 'sub', label: '子項目' }],
  },
  { key: 'sep', separator: true },
  { key: 'delete', label: '刪除', icon: Trash2, danger: true },
  { key: 'disabled', label: '無法使用的項目', disabled: true },
];

function openContextMenu(event) {
  contextMenu.value = { open: true, x: event.clientX, y: event.clientY };
}

function closeContextMenu() {
  contextMenu.value.open = false;
}

const showModal = shallowRef(false);
</script>

<template>
  <div class="demo-view">
    <UiPageHeader title="UI Demo" />
    <UiHint>
      內部設計系統檢視頁——不出現在主導覽，僅供 F9 進入。元件依 Foundations、
      Inputs、Actions、Feedback、Content、Overlays 排列；用滑鼠與 Tab 鍵檢查真實
      hover／focus-visible 狀態。
    </UiHint>

    <template v-for="(group, groupIndex) in UI_DEMO_GROUPS" :key="group.key">
      <hr v-if="groupIndex > 0" class="demo-divider" />
      <section class="demo-group" :aria-labelledby="`demo-group-${group.key}`">
        <header class="demo-group__header">
          <h2 :id="`demo-group-${group.key}`" class="demo-group__title">
            {{ group.title }}
          </h2>
          <p class="demo-group__description">{{ group.description }}</p>
        </header>

        <section
          v-for="section in group.sections"
          :key="section.key"
          class="demo-section"
        >
          <h3 class="demo-section__title">{{ section.title }}</h3>

          <div v-if="section.key === 'typography'" class="demo-col">
            <p class="demo-type demo-type--display">
              Display · 32px / 650 / 1.15
            </p>
            <p class="demo-type demo-type--headline">
              Headline · 24px / 650 / 1.2
            </p>
            <p class="demo-type demo-type--title">Title · 18px / 600 / 1.3</p>
            <p class="demo-type demo-type--body">Body · 16px / 400 / 1.5</p>
            <p class="demo-type demo-type--label">Label · 14px / 600 / 1.25</p>
            <p class="demo-type demo-type--caption">
              Caption · 14px / 400 / 1.4
            </p>
          </div>

          <div v-else-if="section.key === 'page-header'" class="demo-surface">
            <UiPageHeader title="歌曲資料">
              <template #actions>
                <UiButton variant="accent">主要動作</UiButton>
              </template>
            </UiPageHeader>
          </div>

          <div v-else-if="section.key === 'text-field'" class="demo-fields">
            <UiTextField
              id="demo-title"
              v-model="textFieldValue"
              label="曲目名稱"
            />
            <UiTextField
              id="demo-invalid"
              label="錯誤狀態"
              model-value=""
              invalid
            />
            <UiTextField
              id="demo-disabled"
              label="停用狀態"
              model-value="不可編輯"
              disabled
            />
          </div>

          <div v-else-if="section.key === 'search-box'" class="demo-row">
            <UiSearchBox v-model="searchQuery" />
          </div>

          <div v-else-if="section.key === 'buttons'" class="demo-row">
            <UiButton variant="ghost">Ghost</UiButton>
            <UiButton variant="accent">Accent</UiButton>
            <UiButton variant="ghost" :icon="Repeat" active
              >Ghost active</UiButton
            >
            <UiButton variant="accent" disabled>Accent disabled</UiButton>
          </div>

          <div v-else-if="section.key === 'icon-buttons'" class="demo-row">
            <UiIconButton :icon="Play" label="播放（sm）" size="sm" />
            <UiIconButton :icon="Play" label="播放（md）" size="md" />
            <UiIconButton :icon="Play" label="播放（lg）" size="lg" />
            <UiIconButton
              :icon="Pause"
              label="暫停（accent）"
              variant="accent"
            />
            <UiIconButton :icon="Repeat" label="重複播放（active）" active />
            <UiIconButton
              :icon="Play"
              label="播放（overlay）"
              shape="circle"
              variant="overlay"
              fill
            />
            <UiIconButton :icon="Download" label="下載（disabled）" disabled />
          </div>

          <div v-else-if="section.key === 'text-button'" class="demo-row">
            <UiTextButton text="可點擊的跑馬燈文字" aria-label="示範文字按鈕" />
          </div>

          <div v-else-if="section.key === 'chips'" class="demo-row">
            <UiChip v-for="tone in CHIP_TONES" :key="tone" :tone="tone">
              {{ tone }}
            </UiChip>
          </div>

          <div v-else-if="section.key === 'status-icons'" class="demo-row">
            <UiStatusIcon
              v-for="tone in STATUS_ICON_TONES"
              :key="tone"
              :icon="Music"
              :tone="tone"
              :label="tone"
            />
          </div>

          <div v-else-if="section.key === 'hints'" class="demo-col">
            <UiHint v-for="tone in HINT_TONES" :key="tone" :tone="tone">
              {{ tone }} — 範例提示文字
            </UiHint>
          </div>

          <div v-else-if="section.key === 'notices'" class="demo-col">
            <UiNotice
              tone="info"
              title="同步中"
              message="正在確認本機 runtime 狀態。"
              compact
            />
            <UiNotice
              tone="success"
              title="已完成"
              message="Sidecar 已保存並通過驗證。"
              compact
            />
            <UiNotice
              tone="warning"
              title="需要確認"
              message="此能力尚未通過產品 activation gate。"
              compact
            />
            <UiNotice
              tone="danger"
              title="操作失敗"
              message="目前無法讀取來源檔案。"
              action-label="重試"
              compact
            />
          </div>

          <div v-else-if="section.key === 'marquee-text'" class="demo-marquee">
            <UiMarqueeText
              text="這是一段超過容器寬度後才會啟動的多語系曲目名稱 — 長い曲名 테스트"
            />
          </div>

          <div v-else-if="section.key === 'track-thumb'" class="demo-row">
            <UiTrackThumb :track="demoTracks[0]" :size="48" />
            <UiTrackThumb
              :track="{ ...demoTracks[1], thumbnailUrl: '' }"
              :size="48"
            />
            <UiTrackThumb :size="48">—</UiTrackThumb>
          </div>

          <template v-else-if="section.key === 'collage-thumb'">
            <div class="demo-row">
              <UiCollageThumb :tracks="demoTracks" :size="64" />
              <UiCollageThumb
                :tracks="demoTracks"
                :size="64"
                :can-collage="false"
              />
              <UiCollageThumb :tracks="[]" :size="64" />
            </div>
            <UiHint>左到右：四首歌曲拼貼、單一封面、無資料佔位。</UiHint>
          </template>

          <ul v-else-if="section.key === 'track-rows'" class="demo-track-list">
            <UiTrackRow title="Default" artist="沒有互動" />
            <UiTrackRow
              title="Interactive"
              artist="hover／focus 試試看"
              interactive
            />
            <UiTrackRow
              title="Selected"
              artist="active = 選取狀態"
              interactive
              active
            />
            <UiTrackRow
              title="Current"
              artist="current = 正在播放"
              interactive
              current
            />
          </ul>

          <template v-else-if="section.key === 'context-menu'">
            <div class="demo-row">
              <UiButton variant="ghost" @click="openContextMenu"
                >點擊開啟選單</UiButton
              >
            </div>
            <UiHint>展示分隔線、子選單、danger 與 disabled 項目。</UiHint>
            <UiContextMenu
              :open="contextMenu.open"
              :x="contextMenu.x"
              :y="contextMenu.y"
              :items="contextMenuItems"
              @select="closeContextMenu"
              @close="closeContextMenu"
            />
          </template>

          <template v-else-if="section.key === 'modal'">
            <div class="demo-row">
              <UiButton variant="accent" @click="showModal = true"
                >開啟 Modal</UiButton
              >
            </div>
            <UiModal
              :open="showModal"
              title="示範 Modal"
              @close="showModal = false"
            >
              <p class="demo-type demo-type--body">
                內容放在預設 slot；遮罩、Escape 與 focus trap 由 UiModal 負責。
              </p>
            </UiModal>
          </template>
        </section>
      </section>
    </template>
  </div>
</template>

<style scoped>
.demo-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

.demo-divider {
  margin: 0;
  border: none;
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-group {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.demo-group__header {
  display: grid;
  gap: var(--ui-space-1);
}

.demo-group__title,
.demo-group__description {
  margin: 0;
}

.demo-group__title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-headline);
}

.demo-group__description {
  max-width: 70ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

.demo-section__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.demo-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-3);
}

.demo-col {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

.demo-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--ui-space-3);
}

.demo-surface {
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
}

.demo-surface :deep(.ui-page-header) {
  margin-bottom: 0;
}

.demo-marquee {
  width: 14rem;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
}

.demo-type {
  margin: 0;
  color: var(--ui-color-text);
}

.demo-type--display {
  font-size: var(--ui-font-size-2xl);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-display);
}

.demo-type--headline {
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-headline);
}

.demo-type--title {
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.demo-type--body {
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
}

.demo-type--label {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.demo-type--caption {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.demo-track-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-track-list-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
