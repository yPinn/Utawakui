<script setup>
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoMarqueeTextAppearance from './DemoMarqueeTextAppearance.vue';
import DemoTrackThumbAppearance from './DemoTrackThumbAppearance.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const DEMO_TRACKS = [
  { id: '1', title: '雨愛', artist: '楊丞琳', duration: 262 },
  { id: '2', title: 'アイドル', artist: 'YOASOBI', duration: 213 },
  { id: '3', title: '밤편지', artist: 'IU', duration: 253 },
  {
    id: '4',
    title: 'A Very Long Song Title for Multilingual Layout Review',
    artist: 'Demo Artist',
    duration: 318,
  },
];

const COMPARISON_SECTION_KEYS = new Set(['marquee-text', 'track-thumb']);
</script>

<template>
  <div class="demo-content">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
      :reviewed="COMPARISON_SECTION_KEYS.has(section.key)"
    >
      <DemoMarqueeTextAppearance v-if="section.key === 'marquee-text'" />
      <DemoTrackThumbAppearance v-else-if="section.key === 'track-thumb'" />

      <div v-else-if="section.key === 'collage-thumb'" class="demo-sample-row">
        <div class="demo-artwork-item">
          <UiCollageThumb :tracks="DEMO_TRACKS" :size="72" />
          <span>四曲拼貼</span>
        </div>
        <div class="demo-artwork-item">
          <UiCollageThumb
            :tracks="DEMO_TRACKS"
            :size="72"
            :can-collage="false"
          />
          <span>單一封面</span>
        </div>
        <div class="demo-artwork-item">
          <UiCollageThumb :tracks="[]" :size="72" />
          <span>空集合</span>
        </div>
      </div>

      <ul v-else-if="section.key === 'track-rows'" class="demo-track-list">
        <UiTrackRow :track="DEMO_TRACKS[0]" title="預設資料列" />
        <UiTrackRow
          :track="DEMO_TRACKS[1]"
          title="可互動資料列"
          artist="Hover／Focus"
          interactive
        />
        <UiTrackRow
          :track="DEMO_TRACKS[2]"
          title="已選取資料列"
          artist="Selected"
          interactive
          active
        />
        <UiTrackRow
          :track="DEMO_TRACKS[3]"
          title="正在播放的超長多語系曲目名稱 — 再生中 재생 중"
          artist="Current／Playing"
          interactive
          current
        />
        <UiTrackRow
          :track="DEMO_TRACKS[0]"
          title="已選取且正在播放"
          artist="Selected + Current"
          interactive
          active
          current
        />
      </ul>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-track-list {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
