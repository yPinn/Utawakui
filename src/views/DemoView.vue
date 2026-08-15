<script setup>
import { ref } from 'vue';
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
import UiModal from '../components/ui/UiModal.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import UiSearchBox from '../components/ui/UiSearchBox.vue';
import UiStatusIcon from '../components/ui/UiStatusIcon.vue';
import UiTextButton from '../components/ui/UiTextButton.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';

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

// [key, title] pairs — drives both the v-for below and the divider-between-
// sections logic (no divider before the first section).
const SECTIONS = [
  ['typography', 'Typography'],
  ['buttons', 'Buttons'],
  ['icon-buttons', 'Icon buttons'],
  ['text-button', 'Text button'],
  ['chips', 'Chips'],
  ['hints', 'Hints'],
  ['status-icons', 'Status icons'],
  ['track-rows', 'Track rows'],
  ['search-box', 'Search box'],
  ['collage-thumb', 'Collage thumb'],
  ['context-menu', 'Context menu'],
  ['modal', 'Modal'],
];

const searchQuery = ref('');

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

const showModal = ref(false);
</script>

<template>
  <div class="demo-view">
    <UiPageHeader title="UI Demo" />
    <UiHint>
      內部設計系統檢視頁——不出現在主導覽,僅供 F9 進入。滑鼠移過去、Tab
      鍵切過去就能看到真實的 hover / focus-visible 狀態,這裡不用假狀態模擬。
    </UiHint>

    <template v-for="([key, title], index) in SECTIONS" :key="key">
      <hr v-if="index > 0" class="demo-divider" />

      <section v-if="key === 'typography'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-col">
          <p class="demo-type demo-type--display">
            Display · 32px / 650 / 1.15
          </p>
          <p class="demo-type demo-type--headline">
            Headline · 24px / 650 / 1.2
          </p>
          <p class="demo-type demo-type--title">Title · 18px / 600 / 1.3</p>
          <p class="demo-type demo-type--body">Body · 16px / 400 / 1.5</p>
          <p class="demo-type demo-type--label">LABEL · 14px / 600 / 1.25</p>
          <p class="demo-type demo-type--caption">Caption · 14px / 400 / 1.4</p>
        </div>
      </section>

      <section v-else-if="key === 'buttons'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-row">
          <UiButton variant="ghost">Ghost</UiButton>
          <UiButton variant="accent">Accent</UiButton>
          <UiButton variant="ghost" :icon="Repeat" active
            >Ghost active</UiButton
          >
          <UiButton variant="accent" disabled>Accent disabled</UiButton>
        </div>
      </section>

      <section v-else-if="key === 'icon-buttons'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-row">
          <UiIconButton :icon="Play" label="播放（sm）" size="sm" />
          <UiIconButton :icon="Play" label="播放（md）" size="md" />
          <UiIconButton :icon="Play" label="播放（lg）" size="lg" />
          <UiIconButton :icon="Pause" label="暫停（accent）" variant="accent" />
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
      </section>

      <section v-else-if="key === 'text-button'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-row">
          <UiTextButton text="可點擊的跑馬燈文字" aria-label="示範文字按鈕" />
        </div>
      </section>

      <section v-else-if="key === 'chips'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-row">
          <UiChip v-for="tone in CHIP_TONES" :key="tone" :tone="tone">
            {{ tone }}
          </UiChip>
        </div>
      </section>

      <section v-else-if="key === 'hints'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-col">
          <UiHint v-for="tone in HINT_TONES" :key="tone" :tone="tone">
            {{ tone }} — 範例提示文字
          </UiHint>
        </div>
      </section>

      <section v-else-if="key === 'status-icons'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-row">
          <UiStatusIcon
            v-for="tone in STATUS_ICON_TONES"
            :key="tone"
            :icon="Music"
            :tone="tone"
            :label="tone"
          />
        </div>
      </section>

      <section v-else-if="key === 'track-rows'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <ul class="demo-track-list">
          <UiTrackRow title="Default" artist="沒有互動" />
          <UiTrackRow
            title="Interactive"
            artist="hover / focus 試試看"
            interactive
          />
          <UiTrackRow
            title="Selected"
            artist="active prop = 選取狀態"
            interactive
            active
          />
          <UiTrackRow
            title="Current"
            artist="current prop = 正在播放"
            interactive
            current
          />
        </ul>
      </section>

      <section v-else-if="key === 'search-box'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-row">
          <UiSearchBox v-model="searchQuery" />
        </div>
      </section>

      <section v-else-if="key === 'collage-thumb'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-row">
          <UiCollageThumb :tracks="demoTracks" :size="64" />
          <UiCollageThumb
            :tracks="demoTracks"
            :size="64"
            :can-collage="false"
          />
          <UiCollageThumb :tracks="[]" :size="64" />
        </div>
        <UiHint
          >左到右:4 首歌曲拼貼、單一封面(專輯模式)、無資料的空白佔位。</UiHint
        >
      </section>

      <section v-else-if="key === 'context-menu'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-row">
          <UiButton variant="ghost" @click="openContextMenu">
            點擊開啟選單
          </UiButton>
        </div>
        <UiHint>展示分隔線、子選單、danger、disabled 這幾種項目型態。</UiHint>
        <UiContextMenu
          :open="contextMenu.open"
          :x="contextMenu.x"
          :y="contextMenu.y"
          :items="contextMenuItems"
          @select="closeContextMenu"
          @close="closeContextMenu"
        />
      </section>

      <section v-else-if="key === 'modal'" class="demo-section">
        <h2 class="demo-section__title">{{ title }}</h2>
        <div class="demo-row">
          <UiButton variant="accent" @click="showModal = true">
            開啟 Modal
          </UiButton>
        </div>
        <UiModal
          :open="showModal"
          title="示範 Modal"
          @close="showModal = false"
        >
          <p class="demo-type demo-type--body">
            內容放在預設 slot 裡,外殼(遮罩、Escape、focus trap)由 UiModal
            自己負責。
          </p>
        </UiModal>
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
