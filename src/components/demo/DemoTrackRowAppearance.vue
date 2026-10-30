<script setup>
import { shallowRef } from 'vue';
import { BadgeCheck, Trash2 } from '../../icons/index.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import DemoCandidateTrackRow from './DemoCandidateTrackRow.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const STATES = [
  {
    id: 'selected',
    label: '選取',
    track: {
      id: 'state-selected',
      title: 'アイドル',
      artist: 'YOASOBI',
      duration: 213,
    },
    active: true,
  },
  {
    id: 'current',
    label: '播放中',
    track: {
      id: 'state-current',
      title: '밤편지',
      artist: 'IU',
      duration: 253,
    },
    current: true,
  },
  {
    id: 'selected-current',
    label: '選取＋播放中',
    track: {
      id: 'state-selected-current',
      title: '群青日和',
      artist: '東京事変',
      duration: 213,
    },
    active: true,
    current: true,
  },
  {
    id: 'disabled',
    label: '停用',
    track: {
      id: 'state-disabled',
      title: '尚未可分析的曲目',
      artist: '等待分析功能',
      duration: 198,
    },
    disabled: true,
  },
];

const CONTENT = [
  {
    id: 'long-multilingual',
    label: '多語長內容',
    track: {
      id: 'content-long-multilingual',
      title:
        '夏夜裡的多語版本／SummerLiveSessionFinalMixWithoutConvenientBreaks20260913.wav',
      artist: '本機演出者／アーティスト／아티스트',
      duration: 245,
    },
  },
  {
    id: 'rtl-narrow',
    label: '窄欄 RTL',
    narrow: true,
    dir: 'rtl',
    lang: 'ar',
    track: {
      id: 'content-rtl-narrow',
      title: 'ليلة هادئة — النسخة الطويلة',
      artist: 'فرقة محلية',
      duration: 221,
    },
  },
];

const CONTRACT = [
  'Standard 52px row／40px artwork；填滿外層寬度',
  'active · 選取用中性 surface；current · 只強調曲名',
  'lead／trail slots · 選取與尾端操作為獨立目標',
  '文字可選取；排序與拖曳不在 Row',
];

const selectionChecked = shallowRef(true);
const proposalChecked = shallowRef(true);
const operationFeedback = shallowRef('尚未操作');

function reportOperation(action) {
  operationFeedback.value = action;
}
</script>

<template>
  <div class="demo-specimens" data-track-row-source="production">
    <p class="demo-specimens__copy">
      顯示封面、曲名、演出者、時長與前後操作；不管理排序。
    </p>

    <section class="demo-specimens__section">
      <h4>狀態</h4>
      <div class="demo-specimens__grid demo-track-row__grid">
        <article
          v-for="sample in STATES"
          :key="sample.id"
          class="demo-specimens__case"
          :data-track-row-state="sample.id"
        >
          <h5>{{ sample.label }}</h5>
          <ul class="demo-track-row__list">
            <UiTrackRow
              :track="sample.track"
              :active="sample.active"
              :current="sample.current"
              :disabled="sample.disabled"
              :aria-current="sample.current ? 'true' : undefined"
            />
          </ul>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>可操作範例</h4>
      <output aria-live="polite">
        {{ selectionChecked ? '已選取' : '未選取' }} · 最近操作：{{
          operationFeedback
        }}
      </output>
      <ul
        class="demo-track-row__list"
        data-track-row-recipe="playback-selection-navigation"
      >
        <UiTrackRow
          :track="{
            id: 'recipe-playback-selection-navigation',
            title: '可前往專輯的曲目',
            artist: '本機演出者',
            duration: 229,
          }"
          :active="selectionChecked"
          interactive
          title-clickable
          title-aria-label="前往專輯：可前往專輯的曲目"
          action-label="播放可前往專輯的曲目"
          @activate="reportOperation('整列播放')"
          @title-click="reportOperation('曲名前往專輯')"
        >
          <template #lead>
            <span @click.stop>
              <UiCheckbox
                id="demo-track-row-selection"
                v-model="selectionChecked"
                label="選取"
                label-hidden
              />
            </span>
          </template>
          <template #trail>
            <UiChip>WAV</UiChip>
            <UiChip tone="danger">分析失敗</UiChip>
            <UiStatusIcon :icon="BadgeCheck" tone="success" label="已可用" />
            <UiIconButton
              :icon="Trash2"
              label="刪除曲目"
              @click.stop="reportOperation('尾端刪除')"
            />
          </template>
        </UiTrackRow>
      </ul>
    </section>

    <section class="demo-specimens__section">
      <h4>內容壓力</h4>
      <div class="demo-specimens__grid demo-track-row__grid">
        <article
          v-for="sample in CONTENT"
          :key="sample.id"
          class="demo-specimens__case"
          :class="{ 'demo-track-row__narrow': sample.narrow }"
          :data-track-row-content="sample.id"
        >
          <h5>{{ sample.label }}</h5>
          <ul class="demo-track-row__list">
            <UiTrackRow
              :track="sample.track"
              :lang="sample.lang"
              :dir="sample.dir"
            />
          </ul>
        </article>
      </div>
    </section>

    <DemoProposalSpecimen
      note="Compact 44／36px、選取欄位於 icon 寬度的光學軌道、縮圖可前往專輯，文字層位於整列操作上方。owner 保留現行 52px 列與 root button-role 行為。"
    >
      <ul class="demo-track-row__list demo-track-row__proposal">
        <DemoCandidateTrackRow
          :track="{
            id: 'proposal-row',
            title: '可前往專輯的曲目',
            artist: '本機演出者',
            duration: 229,
          }"
          :selected="proposalChecked"
          interactive
          artwork-clickable
          artwork-aria-label="前往專輯：可前往專輯的曲目"
          action-aria-label="播放可前往專輯的曲目"
        >
          <template #lead>
            <span class="demo-track-row-selection-lane" @click.stop>
              <UiCheckbox
                id="demo-track-row-proposal-selection"
                v-model="proposalChecked"
                class="demo-track-row-selection-lane__control"
                label="選取音樂分析候選"
                label-hidden
              />
            </span>
          </template>
        </DemoCandidateTrackRow>
      </ul>
    </DemoProposalSpecimen>

    <ul
      class="demo-specimens__contract"
      aria-label="UiTrackRow public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-track-row__grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
}

.demo-track-row__list {
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo-track-row__proposal {
  width: 100%;
}

.demo-track-row__narrow {
  max-width: 16rem;
}

/* Proposal: icon-width optical lane without shrinking the checkbox hit target. */
.demo-track-row-selection-lane {
  position: relative;
  width: var(--ui-checkbox-size);
  height: var(--ui-control-height);
  flex: 0 0 var(--ui-checkbox-size);
}

.demo-track-row-selection-lane__control {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  transform: translate(-50%, -50%);
}
</style>
