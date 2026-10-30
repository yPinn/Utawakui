<script setup>
import trackThumbCropSquare from '../../assets/demo/track-thumb/track-thumb-crop-square.jpg';
import trackThumbCropWide from '../../assets/demo/track-thumb/track-thumb-crop-wide.jpg';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import {
  getTrackThumbFallbackArtwork,
  TRACK_THUMB_FALLBACK_ARTWORK,
} from '../ui/trackThumbFallback.js';
import { BROKEN_IMAGE_FIXTURE_URL } from './demoImageFixtures.js';
import DemoArtworkStates from './DemoArtworkStates.vue';
import DemoCandidateTrackThumb from './DemoCandidateTrackThumb.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const SIZES = [
  {
    id: 'dense-selection-36',
    label: '密集選擇 · 36px',
    size: 'var(--ui-track-artwork-size-dense)',
  },
  {
    id: 'track-row-40',
    label: '標準曲目列 · 40px',
    size: 'var(--ui-track-artwork-size-standard)',
  },
  {
    id: 'playback-48',
    label: 'PlayerBar · 48px',
    size: 'var(--ui-track-artwork-size-prominent)',
  },
  {
    id: 'metadata-64',
    label: '封面檢查 · 64px',
    size: 'var(--ui-track-artwork-size-preview)',
  },
];

const STATES = [
  {
    id: 'image',
    label: '有效封面',
    track: {
      id: 'image',
      title: '正常顯示',
      thumbnailUrl: trackThumbCropSquare,
    },
  },
  {
    id: 'crop-wide',
    label: '寬圖置中裁切',
    track: { id: 'crop-wide', title: '寬圖', thumbnailUrl: trackThumbCropWide },
  },
  {
    id: 'missing',
    label: '沒有封面 · 曲名首字',
    track: { id: 'initial', title: '夏日練習曲' },
  },
  {
    id: 'latin',
    label: 'Latin 首字',
    track: { id: 'latin', title: 'Summer Live Session' },
  },
  {
    id: 'broken',
    label: '封面無法顯示',
    track: {
      id: 'broken',
      title: '失敗回退',
      thumbnailUrl: BROKEN_IMAGE_FIXTURE_URL,
    },
  },
];

const FALLBACKS = TRACK_THUMB_FALLBACK_ARTWORK.map((_, index) => {
  const track = {
    id: `fallback-example-${index}`,
    title: `預設封面 ${index + 1}`,
  };
  return { id: getTrackThumbFallbackArtwork(track).id, track };
});

const CONTRACT = [
  'track · optional single-track data',
  'size · required square length',
  'decorative · default true；獨立表意時改 false 並提供名稱',
  '集合封面由 UiCollageThumb 負責',
  '互動操作應由外層控制項提供',
];
</script>

<template>
  <div class="demo-specimens" data-track-thumb-source="production">
    <p class="demo-specimens__copy">
      單曲封面：有封面時顯示圖片，沒有時以曲名首字維持位置；封面本身不能操作。
    </p>

    <section class="demo-specimens__section">
      <h4>尺寸與使用情境</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="item in SIZES"
          :key="item.id"
          class="demo-specimens__case"
          :data-track-thumb-recipe="item.id"
        >
          <h5>{{ item.label }}</h5>
          <UiTrackThumb
            :track="{ id: item.id, title: item.label }"
            :size="item.size"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>裁切與失敗狀態</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="state in STATES"
          :key="state.id"
          class="demo-specimens__case"
          :data-track-thumb-state="state.id"
        >
          <h5>{{ state.label }}</h5>
          <UiTrackThumb :track="state.track" :size="48" />
        </article>
        <article class="demo-specimens__case" data-track-thumb-aria="named">
          <h5>獨立封面 · 有名稱</h5>
          <UiTrackThumb
            :track="{
              id: 'named',
              title: '目前封面',
              thumbnailUrl: trackThumbCropSquare,
            }"
            :size="64"
            :decorative="false"
            aria-label="目前封面"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section" data-artwork-source="production">
      <h4>載入與操作揭露 · UiArtworkLoading／UiArtworkReveal</h4>
      <DemoArtworkStates />
    </section>

    <DemoProposalSpecimen
      note="缺圖或載入失敗時改用固定的預設封面組，最後才回到曲名首字；owner 保留現行首字與失敗圖片位置。"
    >
      <DemoCandidateTrackThumb
        v-for="item in FALLBACKS"
        :key="item.id"
        :track="item.track"
        :size="48"
        :data-track-thumb-fallback="item.id"
      />
      <DemoCandidateTrackThumb
        :track="{
          id: 'broken',
          title: '失敗回退',
          thumbnailUrl: BROKEN_IMAGE_FIXTURE_URL,
        }"
        :size="48"
      />
    </DemoProposalSpecimen>

    <ul
      class="demo-specimens__contract"
      aria-label="UiTrackThumb public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>
