<script setup>
import {
  BadgeCheck,
  Captions,
  Check,
  CircleAlert,
  CircleDashed,
  CircleX,
  Info,
  Loader2,
  Power,
  Volume2,
} from '../../icons/index.js';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import DemoCandidateStatusIcon from './DemoCandidateStatusIcon.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const TONES = [
  { id: 'muted', label: '待命', icon: CircleDashed },
  { id: 'accent', label: '已選取', icon: Check },
  { id: 'info', label: '資訊', icon: Info },
  { id: 'success', label: '已完成', icon: BadgeCheck },
  { id: 'warning', label: '需注意', icon: CircleAlert },
  { id: 'danger', label: '失敗', icon: CircleX },
  { id: 'current', label: '目前播放', icon: Volume2 },
  { id: 'gated', label: '需確認', icon: Power },
  { id: 'text', label: '主要文字色', icon: Info, compatibility: true },
  { id: 'highlight', label: '未掃描歌詞', icon: Captions, compatibility: true },
];

const RECIPES = [
  {
    id: 'row-trail',
    text: '東京事変 — 群青日和',
    icon: BadgeCheck,
    tone: 'success',
    label: '下載完成',
  },
  {
    id: 'selection',
    text: '使用系統安裝的 FFmpeg',
    icon: Check,
    tone: 'accent',
    label: '已選取',
  },
  {
    id: 'adjacent-text',
    text: '目前播放',
    icon: Volume2,
    tone: 'current',
    label: '目前播放',
    decorative: true,
  },
];

const CONTRACT = [
  'Standalone icon · concise accessible label',
  'Decorative duplicate · adjacent text owns meaning',
  'spinning · glyph only／reduced-motion safe',
  'Parent owns role=status／aria-live',
  'No action／focus／disabled／size prop',
];
</script>

<template>
  <div class="demo-specimens" data-status-icon-source="production">
    <p class="demo-specimens__copy">
      非互動狀態圖示，固定 24px；圖示、形狀與 concise label
      共同傳達狀態。文字狀態用 UiChip，操作用按鈕。
    </p>

    <section class="demo-specimens__section">
      <h4>Semantic tones</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="tone in TONES"
          :key="tone.id"
          class="demo-specimens__case"
        >
          <h5>{{ tone.compatibility ? `${tone.id} · 相容` : tone.id }}</h5>
          <div class="demo-specimens__row">
            <UiStatusIcon
              :icon="tone.icon"
              :tone="tone.id"
              :label="tone.label"
              :data-status-icon-tone="tone.id"
              decorative
            />
            <span>{{ tone.label }}</span>
          </div>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>Motion 與使用情境</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="recipe in RECIPES"
          :key="recipe.id"
          class="demo-specimens__case"
          :data-status-icon-recipe="recipe.id"
        >
          <div class="demo-specimens__row">
            <span>{{ recipe.text }}</span>
            <UiStatusIcon
              :icon="recipe.icon"
              :tone="recipe.tone"
              :label="recipe.label"
              :decorative="recipe.decorative"
            />
          </div>
        </article>
        <article
          class="demo-specimens__case"
          data-status-icon-recipe="live-region"
        >
          <div class="demo-specimens__row" role="status" aria-live="polite">
            <span>音訊模型處理中</span>
            <UiStatusIcon
              :icon="Loader2"
              tone="info"
              label="處理中"
              spinning
              decorative
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>ARIA</h4>
      <div class="demo-specimens__grid">
        <article
          class="demo-specimens__case"
          data-status-icon-aria="standalone"
        >
          <h5>獨立承擔意義</h5>
          <UiStatusIcon :icon="BadgeCheck" tone="success" label="已完成" />
        </article>
        <article
          class="demo-specimens__case"
          data-status-icon-aria="decorative"
        >
          <h5>相鄰文字已命名</h5>
          <UiStatusIcon
            :icon="BadgeCheck"
            tone="success"
            label="已完成"
            decorative
          />
        </article>
      </div>
    </section>

    <DemoProposalSpecimen
      note="依語意色的淡色底與細邊界，另有 Compact 20px；owner 保留現行 24px 中性圓底，留待正式遷移時評估。"
    >
      <DemoCandidateStatusIcon
        v-for="tone in TONES.filter((item) => !item.compatibility)"
        :key="tone.id"
        :icon="tone.icon"
        :tone="tone.id"
        :label="tone.label"
      />
      <DemoCandidateStatusIcon
        :icon="Info"
        tone="info"
        label="資訊"
        size="compact"
      />
    </DemoProposalSpecimen>

    <ul
      class="demo-specimens__contract"
      aria-label="UiStatusIcon public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>
