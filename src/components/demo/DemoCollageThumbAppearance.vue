<script setup>
import trackThumbCropSquare from '../../assets/demo/track-thumb/track-thumb-crop-square.jpg';
import trackThumbCropWide from '../../assets/demo/track-thumb/track-thumb-crop-wide.jpg';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import DemoCandidateCollageThumb from './DemoCandidateCollageThumb.vue';
import DemoCollageThumbProduction from './DemoCollageThumbProduction.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const TRACKS = [
  { id: 'rain-love', title: '雨愛', thumbnailUrl: trackThumbCropWide },
  { id: 'idol', title: 'アイドル' },
  { id: 'night-letter', title: '밤편지', thumbnailUrl: trackThumbCropSquare },
  {
    id: 'summer-live',
    title: 'Summer Live Session Extended Version',
    thumbnailUrl: trackThumbCropSquare,
  },
];

const SIZES = [
  { size: 40, label: 'Sidebar · 40px' },
  { size: 88, label: 'Dossier · 88px' },
  { size: 120, label: 'Context panel · 120px' },
  { size: 136, label: 'Library collection header · 136px' },
  { size: 160, label: 'Details modal · 160px' },
  { size: 280, label: 'Context inspector · 280px' },
];

const CROPS = [
  {
    id: 'wide',
    label: '寬圖來源 · 置中裁成正方形',
    coverUrl: trackThumbCropWide,
  },
  {
    id: 'square',
    label: '方形來源 · 保持正方形構圖',
    coverUrl: trackThumbCropSquare,
  },
];

const PROPOSAL_COUNTS = [0, 1, 2, 4];

const CONTRACT = [
  'coverUrl 優先，其次依集合規則顯示單一圖片或四格',
  'canCollage=false · 發行只顯示單一封面',
  'size · artwork 尺寸階梯，不隨操作密度縮放',
  '選取、播放與導覽由所在區域負責',
];
</script>

<template>
  <div class="demo-specimens" data-collage-thumb-source="production">
    <p class="demo-specimens__copy">
      集合封面：自訂封面、單曲、四格拼貼與空集合；四個格位各自保持正方形。
    </p>

    <section class="demo-specimens__section">
      <h4>成員數、缺圖與恢復</h4>
      <DemoCollageThumbProduction />
    </section>

    <section class="demo-specimens__section">
      <h4>實際尺寸</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="recipe in SIZES"
          :key="recipe.size"
          class="demo-specimens__case"
          :data-collage-size="recipe.size"
        >
          <h5>{{ recipe.label }}</h5>
          <UiScrollRegion axis="horizontal">
            <UiCollageThumb :tracks="TRACKS" :size="recipe.size" />
          </UiScrollRegion>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>正方形輸出與裁切</h4>
      <p class="demo-specimens__copy">
        外部封面位置一律顯示正方形；目前固定使用置中裁切，不拉伸，也不保留空白邊。封面焦點／裁切區域選擇屬於獨立編輯流程，不屬於
        UiCollageThumb。
      </p>
      <div class="demo-specimens__grid">
        <article
          v-for="crop in CROPS"
          :key="crop.id"
          class="demo-specimens__case"
          :data-collage-crop-source="crop.id"
        >
          <h5>{{ crop.label }}</h5>
          <UiCollageThumb
            :cover-url="crop.coverUrl"
            :tracks="TRACKS"
            :size="88"
          />
        </article>
      </div>
    </section>

    <DemoProposalSpecimen
      note="零首與無曲目共用單一空位置、一首使用完整方形，二至三首才進入四格並保留安靜空格；缺圖與壞圖改用預設封面。owner 保留現行四格與壞圖位置。"
    >
      <figure
        v-for="count in PROPOSAL_COUNTS"
        :key="count"
        class="demo-collage__figure"
      >
        <DemoCandidateCollageThumb
          :tracks="TRACKS.slice(0, count)"
          :size="72"
        />
        <figcaption class="demo-specimens__copy">{{ count }} 首</figcaption>
      </figure>
    </DemoProposalSpecimen>

    <ul
      class="demo-specimens__contract"
      aria-label="UiCollageThumb public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-collage__figure {
  margin: 0;
  display: grid;
  justify-items: center;
  gap: var(--ui-space-1);
}
</style>
