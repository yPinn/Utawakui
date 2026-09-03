<script setup>
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';

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
</script>

<template>
  <div class="demo-content">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
    >
      <div v-if="section.key === 'marquee-text'" class="demo-sample-stack">
        <div class="demo-marquee-sample">
          <UiMarqueeText
            text="這是一段超過容器寬度後才會啟動的多語系曲目名稱 — 長い曲名 테스트"
          />
        </div>
        <div class="demo-marquee-sample demo-marquee-sample--wide">
          <UiMarqueeText text="短曲名不移動" />
        </div>
        <p class="demo-sample-caption">
          只有實際溢位時才移動；滑鼠停留、鍵盤焦點與 reduced motion
          都可保持閱讀。
        </p>
      </div>

      <div v-else-if="section.key === 'track-thumb'" class="demo-sample-row">
        <div class="demo-artwork-item">
          <UiTrackThumb :track="DEMO_TRACKS[0]" :size="48" />
          <span>首字佔位</span>
        </div>
        <div class="demo-artwork-item">
          <UiTrackThumb :track="DEMO_TRACKS[1]" :size="64" />
          <span>不同尺寸</span>
        </div>
        <div class="demo-artwork-item">
          <UiTrackThumb :size="48">—</UiTrackThumb>
          <span>無資料</span>
        </div>
      </div>

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
.demo-marquee-sample {
  width: 14rem;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
}

.demo-marquee-sample--wide {
  width: min(24rem, 100%);
}

.demo-artwork-item {
  display: grid;
  justify-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.demo-track-list {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
