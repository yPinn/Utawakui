<script setup>
import { ARTWORK_SIZE } from '../../constants/ui.js';
import trackThumbCropSquare from '../../assets/demo/track-thumb/track-thumb-crop-square.jpg';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const SAMPLE_TRACK = Object.freeze({
  title: '封面尺寸樣本',
  artist: 'Utawakui',
  thumbnailUrl: trackThumbCropSquare,
});

const STEP_ROLES = Object.freeze({
  '2xs': 'Compact 曲目列',
  xs: 'Standard 曲目列、Right Dock、側欄',
  sm: 'Prominent 曲目列、播放列、封面搜尋',
  md: '曲目預覽縮圖',
  lg: 'BGM 播放器、曲目編輯封面（窄版）',
  xl: '專輯卡片、Folder dossier',
  '2xl': '歌單詳情、Folder 編輯預覽',
  '3xl': '曲目編輯封面（寬版）',
  hero: '曲目預覽 overlay',
});

const RAMP = Object.entries(ARTWORK_SIZE).map(([step, dip]) => ({
  step,
  dip,
  rem: `${dip / 16}rem`,
  size: `var(--ui-artwork-size-${step})`,
  role: STEP_ROLES[step],
}));
</script>

<template>
  <div class="demo-artwork-ramp">
    <p class="demo-artwork-ramp__note">
      <strong>封面只取階層值。</strong>
      每個樣本由 <code>--ui-artwork-size-*</code> 直接渲染；DIP 為預設 16px
      根字級下的等值，對應 <code>ARTWORK_SIZE</code>。
    </p>

    <UiScrollRegion
      class="demo-artwork-ramp__scroll"
      axis="horizontal"
      aria-label="封面尺寸階層"
    >
      <ol class="demo-artwork-ramp__steps">
        <li
          v-for="entry in RAMP"
          :key="entry.step"
          class="demo-artwork-ramp__step"
          :data-artwork-step="entry.step"
        >
          <UiTrackThumb :track="SAMPLE_TRACK" :size="entry.size" />
          <code>{{ entry.step }}</code>
          <span>{{ entry.rem }} · {{ entry.dip }} DIP</span>
          <small>{{ entry.role }}</small>
        </li>
      </ol>
    </UiScrollRegion>
  </div>
</template>

<style scoped>
.demo-artwork-ramp {
  display: grid;
  gap: var(--ui-space-5);
}

.demo-artwork-ramp__note {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.demo-artwork-ramp__note strong {
  color: var(--ui-color-text);
}

.demo-artwork-ramp__steps {
  display: flex;
  align-items: flex-end;
  gap: var(--ui-space-5);
  margin: 0;
  padding: 0 0 var(--ui-space-3);
  list-style: none;
}

.demo-artwork-ramp__step {
  display: grid;
  justify-items: start;
  gap: var(--ui-space-1);
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.demo-artwork-ramp__step code {
  color: var(--ui-color-text);
  font-weight: var(--ui-type-label-weight);
}

.demo-artwork-ramp__step small {
  max-inline-size: 10rem;
  font-size: var(--ui-type-caption-size);
}
</style>
