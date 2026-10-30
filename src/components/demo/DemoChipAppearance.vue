<script setup>
import { BadgeCheck, ICON_SIZE } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import DemoCandidateChip from './DemoCandidateChip.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const TONES = [
  { id: 'muted', label: '一般資料' },
  { id: 'accent', label: '已選取' },
  { id: 'current', label: '播放中' },
  { id: 'info', label: '處理中' },
  { id: 'success', label: '已完成' },
  { id: 'warning', label: '需注意' },
  { id: 'danger', label: '失敗' },
  { id: 'gated', label: '需確認' },
];

const CONTENT = [
  { id: 'short-cjk', label: '本機', tone: 'muted' },
  { id: 'number', label: '24', tone: 'muted' },
  {
    id: 'long-cjk',
    label: '東京事変／椎名林檎／非常に長い資料分類標籤',
    tone: 'accent',
    bounded: true,
  },
  {
    id: 'long-latin',
    label: 'A deliberately long system-generated category label for inspection',
    tone: 'info',
    bounded: true,
  },
  {
    id: 'multilingual',
    label: '繁體中文／日本語／한국어／English',
    tone: 'success',
    bounded: true,
  },
];

const GROUP = [
  { id: 'built-in', label: '內建模板', tone: 'accent' },
  { id: 'lyrics', label: '逐字歌詞', tone: 'muted' },
  { id: 'vertical', label: '直書', tone: 'muted' },
  { id: 'motion', label: '動態預覽', tone: 'info' },
];

const CONTRACT = [
  'Native span · visible text is the accessible content',
  'Parent owns role=status／aria-live when the value changes',
  'tone · 8 semantic labels',
  'No hover／pressed／focus／selected／remove／disabled contract',
];
</script>

<template>
  <div class="demo-specimens" data-chip-source="production">
    <p class="demo-specimens__copy">
      系統產生的短狀態、屬性或數量；可點擊、可選或可移除的內容改用互動元件。
    </p>

    <section class="demo-specimens__section">
      <h4>Semantic tones</h4>
      <div class="demo-specimens__grid">
        <div v-for="tone in TONES" :key="tone.id" class="demo-specimens__case">
          <h5>{{ tone.id }}</h5>
          <div class="demo-specimens__row">
            <UiChip :tone="tone.id" :data-chip-tone="tone.id">
              {{ tone.label }}
            </UiChip>
          </div>
        </div>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>內容與 overflow</h4>
      <div class="demo-specimens__grid">
        <div
          v-for="item in CONTENT"
          :key="item.id"
          class="demo-specimens__case"
          :data-chip-content="item.id"
        >
          <h5>{{ item.id }}</h5>
          <div
            class="demo-specimens__row"
            :class="{ 'demo-chip__bounded': item.bounded }"
          >
            <UiChip
              :tone="item.tone"
              :title="item.bounded ? item.label : undefined"
            >
              {{ item.label }}
            </UiChip>
          </div>
        </div>
        <div class="demo-specimens__case" data-chip-content="icon-label">
          <h5>icon-label</h5>
          <div class="demo-specimens__row">
            <UiChip tone="success">
              <BadgeCheck :size="ICON_SIZE" aria-hidden="true" />
              已驗證
            </UiChip>
          </div>
        </div>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>Context recipes</h4>
      <div class="demo-specimens__grid">
        <div class="demo-specimens__case" data-chip-recipe="heading-status">
          <div class="demo-specimens__row">
            <strong>歌詞文件</strong>
            <UiChip tone="success">已完成</UiChip>
          </div>
        </div>
        <div class="demo-specimens__case" data-chip-recipe="metadata">
          <div class="demo-specimens__row">
            <span>本機音訊</span>
            <UiChip>FLAC</UiChip>
          </div>
        </div>
        <div class="demo-specimens__case" data-chip-recipe="group-wrap">
          <div class="demo-specimens__row" aria-label="模板特性">
            <UiChip v-for="item in GROUP" :key="item.id" :tone="item.tone">
              {{ item.label }}
            </UiChip>
          </div>
        </div>
        <div
          class="demo-specimens__case"
          data-chip-recipe="announcement"
          role="status"
          aria-live="polite"
        >
          <div class="demo-specimens__row">
            <span>分析狀態</span>
            <UiChip tone="info">處理中</UiChip>
          </div>
        </div>
      </div>
    </section>

    <DemoProposalSpecimen
      note="語意前景＋淡色底＋細邊界，current／accent 統一 Indigo；owner 保留現行外觀，留待正式遷移時評估。"
    >
      <DemoCandidateChip v-for="tone in TONES" :key="tone.id" :tone="tone.id">
        {{ tone.label }}
      </DemoCandidateChip>
    </DemoProposalSpecimen>

    <ul class="demo-specimens__contract" aria-label="UiChip public contract">
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-chip__bounded {
  width: min(13rem, 100%);
  flex-wrap: nowrap;
  overflow: hidden;
}
</style>
