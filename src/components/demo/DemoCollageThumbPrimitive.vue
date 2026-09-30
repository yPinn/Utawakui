<script setup>
import { Play } from '../../icons/index.js';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import trackThumbCropSquare from '../../assets/demo/track-thumb/track-thumb-crop-square.jpg';
import trackThumbCropWide from '../../assets/demo/track-thumb/track-thumb-crop-wide.jpg';
import { BROKEN_IMAGE_FIXTURE_URL } from './demoImageFixtures.js';

defineProps({
  layer: { type: Object, required: true },
});

const BASE_TRACKS = [
  {
    id: 'rain-love',
    title: '雨愛',
    artist: '楊丞琳',
    thumbnailUrl: trackThumbCropWide,
  },
  { id: 'idol', title: 'アイドル', artist: 'YOASOBI' },
  {
    id: 'night-letter',
    title: '밤편지',
    artist: 'IU',
    thumbnailUrl: trackThumbCropSquare,
  },
  {
    id: 'summer-live',
    title: 'Summer Live Session Extended Version',
    artist: 'Demo Artist',
    thumbnailUrl: trackThumbCropSquare,
  },
  {
    id: 'fifth-track',
    title: '第五首只用來確認前四首規則',
    artist: '測試歌手',
    thumbnailUrl: trackThumbCropWide,
  },
];

const COUNT_CASES = Array.from({ length: 6 }, (_, count) => ({
  count,
  tracks: BASE_TRACKS.slice(0, count),
}));

const IMAGE_CASES = [
  {
    id: 'custom',
    label: '集合自訂封面',
    coverUrl: trackThumbCropWide,
    tracks: BASE_TRACKS,
  },
  {
    id: 'single',
    label: '單一發行封面',
    canCollage: false,
    tracks: [BASE_TRACKS[2]],
  },
  {
    id: 'repeated',
    label: '重複圖片仍保留位置',
    tracks: [
      { ...BASE_TRACKS[2], id: 'repeat-a' },
      { ...BASE_TRACKS[3], id: 'repeat-b' },
      BASE_TRACKS[0],
      BASE_TRACKS[1],
    ],
  },
  {
    id: 'missing',
    candidateLabel: '缺圖使用預設封面',
    currentLabel: '現行缺圖使用曲名首字',
    tracks: BASE_TRACKS.map(({ id, title, artist }) => ({ id, title, artist })),
  },
  {
    id: 'broken',
    candidateLabel: '成員圖片失敗使用預設封面',
    currentLabel: '現行成員壞圖維持壞圖位置',
    tracks: BASE_TRACKS.map((track, index) =>
      index === 0
        ? { ...track, thumbnailUrl: BROKEN_IMAGE_FIXTURE_URL }
        : track,
    ),
  },
];

const CROP_CASES = [
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

const DENSITY_CONTEXTS = [
  { id: 'standard', label: 'Standard context · 72px', size: 72 },
  { id: 'compact', label: 'Compact context · 72px', size: 72 },
];

const CONSUMER_SIZES = [
  { size: 40, label: 'Sidebar · 40px' },
  { size: 88, label: 'Dossier · 88px' },
  { size: 120, label: 'Details modal · 120px' },
  { size: 136, label: 'Setlist header · 136px' },
  { size: 280, label: 'Context inspector · 280px' },
];

const LANGUAGE_TRACKS = [
  { id: 'cjk', title: '夏夜裡需要保留完整資料的繁體中文曲目名稱' },
  { id: 'latin', title: 'Summer Live Session Extended Version', lang: 'en' },
  { id: 'japanese', title: '夜空を見上げながら歌う曲' },
  { id: 'korean', title: '별빛 아래에서 부르는 노래' },
];
</script>

<template>
  <div
    class="demo-collage-thumb-primitive"
    :class="`demo-collage-thumb-primitive--${layer.key}`"
  >
    <section class="demo-collage-thumb-block demo-collage-thumb-role">
      <header class="demo-collage-thumb-subsection__header">
        <h5>集合責任</h5>
        <p>
          自訂集合封面優先；沒有自訂封面時，集合規則決定顯示單一圖片或四格拼貼。
        </p>
      </header>

      <div class="demo-collage-thumb-role__list">
        <article>
          <strong>集合識別</strong>
          <span>顯示集合封面、成員拼貼或空集合位置</span>
        </article>
        <article>
          <strong>曲目成員封面</strong>
          <span v-if="layer.key === 'candidate'">
            缺圖與壞圖共用相同的預設封面選擇，也和單曲縮圖共用圖像內容層
          </span>
          <span v-else>現行缺圖顯示字首，壞圖保留原位置</span>
        </article>
        <article>
          <strong>所在區域</strong>
          <span>選取、播放與導覽由所在區域負責</span>
        </article>
      </div>
    </section>

    <section class="demo-collage-thumb-block">
      <header class="demo-collage-thumb-subsection__header">
        <h5>集合數量</h5>
        <p v-if="layer.key === 'candidate'">
          零首與無曲目縮圖共用單一空位置；一首使用完整方形；二至三首進入四格並保留安靜空格，空格不重複顯示音符；四首以上只取收到順序的前四首。四格模式的四個格位各自保持正方形。
        </p>
        <p v-else>
          現行版零首會顯示四個空格圖示；其餘狀態維持前四首拼貼，但目前未固定兩列高度，仍可能依來源圖片比例形成不等高格位。
        </p>
      </header>

      <div class="demo-collage-thumb-count-list">
        <article
          v-for="example in COUNT_CASES"
          :key="example.count"
          :data-collage-count="example.count"
        >
          <component
            :is="layer.component"
            :tracks="example.tracks"
            :size="72"
          />
          <span class="demo-collage-thumb-count-meta">
            <strong>{{ example.count }} 首</strong>
            <small v-if="example.count === 5">第五首不進拼貼</small>
            <small v-else-if="example.count === 0">
              {{
                layer.key === 'candidate'
                  ? '與無曲目縮圖共用空位置'
                  : '現行四個空格圖示'
              }}
            </small>
            <small v-else-if="example.count === 1">
              {{
                layer.key === 'candidate'
                  ? '單曲封面填滿集合位置'
                  : '現行一格圖片與三格空位置'
              }}
            </small>
            <small v-else-if="example.count < 4">
              {{
                layer.key === 'candidate'
                  ? '空格不重複顯示音符'
                  : '現行空格仍重複顯示音符'
              }}
            </small>
            <small v-else>保留收到的曲目順序</small>
          </span>
        </article>
      </div>
    </section>

    <section class="demo-collage-thumb-block">
      <header class="demo-collage-thumb-subsection__header">
        <h5>圖片與回退</h5>
        <p v-if="layer.key === 'candidate'">
          成員缺圖或圖片無法顯示時使用既有預設封面，不重試、不去重，也不改變順序。
        </p>
        <p v-else>
          現行版保留壞圖位置，第二與第三格的圖片會連同背景一起降低不透明度。
        </p>
      </header>

      <div class="demo-collage-thumb-image-list">
        <article
          v-for="example in IMAGE_CASES"
          :key="example.id"
          :data-collage-image-state="example.id"
        >
          <component
            :is="layer.component"
            :cover-url="example.coverUrl"
            :tracks="example.tracks"
            :can-collage="example.canCollage ?? true"
            :size="88"
          />
          <span>
            {{
              layer.key === 'candidate'
                ? (example.candidateLabel ?? example.label)
                : (example.currentLabel ?? example.label)
            }}
          </span>
        </article>
      </div>
    </section>

    <section class="demo-collage-thumb-block">
      <header class="demo-collage-thumb-subsection__header">
        <h5>正方形輸出與裁切</h5>
        <p>
          外部封面位置一律顯示正方形；寬圖、直圖與方圖都不改變元件外框。目前固定使用置中裁切，不拉伸，也不保留空白邊。
        </p>
      </header>

      <div class="demo-collage-thumb-image-list demo-collage-thumb-crop-list">
        <article
          v-for="example in CROP_CASES"
          :key="example.id"
          :data-collage-crop-source="example.id"
        >
          <component
            :is="layer.component"
            :cover-url="example.coverUrl"
            :tracks="BASE_TRACKS"
            :size="88"
          />
          <span>{{ example.label }}</span>
        </article>
      </div>

      <p class="demo-collage-thumb-crop-note">
        日後若要選擇保留人物或構圖的哪一部分，應新增封面焦點／裁切區域選擇流程；這項編輯能力不屬於
        UiCollageThumb。
      </p>
    </section>

    <section class="demo-collage-thumb-block">
      <header class="demo-collage-thumb-subsection__header">
        <h5>密度與實際尺寸</h5>
        <p>
          Standard／Compact
          只改周邊排版；外框由所在區域指定，四格由外框均分，空位置圖示保持有限的視覺尺寸。
        </p>
      </header>

      <div class="demo-collage-thumb-density-list">
        <article
          v-for="density in DENSITY_CONTEXTS"
          :key="density.id"
          :data-collage-density="density.id"
          :data-ui-density="density.id"
        >
          <component
            :is="layer.component"
            :tracks="BASE_TRACKS"
            :size="density.size"
          />
          <span>{{ density.label }}</span>
        </article>
      </div>

      <div class="demo-collage-thumb-size-list">
        <article
          v-for="recipe in CONSUMER_SIZES"
          :key="recipe.size"
          :data-collage-size="recipe.size"
        >
          <UiScrollRegion
            class="demo-collage-thumb-size-list__frame"
            axis="horizontal"
          >
            <component
              :is="layer.component"
              :tracks="BASE_TRACKS"
              :size="recipe.size"
            />
          </UiScrollRegion>
          <span>{{ recipe.label }}</span>
        </article>
      </div>
    </section>

    <section class="demo-collage-thumb-block">
      <header class="demo-collage-thumb-subsection__header">
        <h5>多語與窄內容</h5>
        <p>
          繁體中文、Latin、日本語與 한국어
          的資料文字保持可選取，封面只顯示集合識別。
        </p>
      </header>

      <div class="demo-collage-thumb-language-list">
        <article v-for="track in LANGUAGE_TRACKS" :key="track.id">
          <component
            :is="layer.component"
            :tracks="[track]"
            :size="64"
            :lang="track.lang"
          />
          <span>{{ track.title }}</span>
        </article>
      </div>
    </section>

    <section class="demo-collage-thumb-block">
      <header class="demo-collage-thumb-subsection__header">
        <h5>輔助技術與 overlay</h5>
        <p>
          相鄰已有名稱時封面不重複朗讀；獨立表意或包含控制項時，由所在區域提供名稱。
        </p>
      </header>

      <div class="demo-collage-thumb-aria-list">
        <article data-collage-aria="decorative">
          <component :is="layer.component" :tracks="BASE_TRACKS" :size="64" />
          <span>裝飾封面：相鄰已有集合名稱</span>
        </article>
        <article data-collage-aria="named">
          <component
            :is="layer.component"
            :tracks="BASE_TRACKS"
            :size="64"
            :decorative="false"
            role="img"
            aria-label="夏夜歌單封面"
          />
          <span>獨立封面：「夏夜歌單封面」</span>
        </article>
        <article data-collage-aria="overlay">
          <component
            :is="layer.component"
            :tracks="BASE_TRACKS"
            :size="64"
            :decorative="false"
          >
            <template #overlay>
              <button
                type="button"
                class="demo-collage-thumb-overlay-button"
                aria-label="播放夏夜歌單"
              >
                <Play :size="16" aria-hidden="true" />
              </button>
            </template>
          </component>
          <span>overlay 控制項自行提供名稱與焦點</span>
        </article>
      </div>

      <div
        class="demo-collage-thumb-contracts"
        aria-label="UiCollageThumb public contract"
      >
        <span>coverUrl · optional collection image</span>
        <span>tracks · ordered collection members</span>
        <span>canCollage · single or 2×2 representation</span>
        <span>size · required caller-owned square length</span>
        <span>decorative · default true</span>
        <span>外觀覆寫與 overlay slot 保留相容</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-collage-thumb-primitive,
.demo-collage-thumb-block,
.demo-collage-thumb-role__list article,
.demo-collage-thumb-count-list article,
.demo-collage-thumb-image-list article,
.demo-collage-thumb-density-list article,
.demo-collage-thumb-size-list article,
.demo-collage-thumb-language-list article,
.demo-collage-thumb-aria-list article {
  min-width: 0;
  display: grid;
}

.demo-collage-thumb-primitive {
  gap: var(--ui-space-6);
}

.demo-collage-thumb-block {
  gap: var(--ui-space-3);
}

.demo-collage-thumb-block + .demo-collage-thumb-block {
  padding-block-start: var(--ui-space-5);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-collage-thumb-subsection__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(9rem, 0.3fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-collage-thumb-subsection__header h5,
.demo-collage-thumb-subsection__header p {
  margin: 0;
}

.demo-collage-thumb-subsection__header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-title);
}

.demo-collage-thumb-subsection__header p,
.demo-collage-thumb-role__list span,
.demo-collage-thumb-count-list small,
.demo-collage-thumb-image-list span,
.demo-collage-thumb-density-list span,
.demo-collage-thumb-size-list span,
.demo-collage-thumb-language-list span,
.demo-collage-thumb-aria-list span,
.demo-collage-thumb-contracts {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-collage-thumb-role__list,
.demo-collage-thumb-count-list,
.demo-collage-thumb-image-list,
.demo-collage-thumb-density-list,
.demo-collage-thumb-size-list,
.demo-collage-thumb-language-list,
.demo-collage-thumb-aria-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(10.5rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-collage-thumb-role__list article,
.demo-collage-thumb-count-list article,
.demo-collage-thumb-image-list article,
.demo-collage-thumb-density-list article,
.demo-collage-thumb-size-list article,
.demo-collage-thumb-language-list article,
.demo-collage-thumb-aria-list article {
  align-content: start;
  justify-items: start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}

.demo-collage-thumb-role__list strong,
.demo-collage-thumb-count-list strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-collage-thumb-count-meta {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-collage-thumb-count-list,
.demo-collage-thumb-image-list {
  grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
}

.demo-collage-thumb-size-list {
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
}

.demo-collage-thumb-size-list__frame {
  max-width: 100%;
}

.demo-collage-thumb-language-list article {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}

.demo-collage-thumb-language-list span,
.demo-collage-thumb-aria-list span {
  user-select: text;
}

.demo-collage-thumb-overlay-button {
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--ui-color-canvas) 58%, transparent);
  color: var(--ui-color-text);
  cursor: pointer;
}

.demo-collage-thumb-overlay-button:hover {
  background: color-mix(in srgb, var(--ui-color-canvas) 68%, transparent);
}

.demo-collage-thumb-overlay-button:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-collage-thumb-contracts {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-4);
  padding-block-start: var(--ui-space-2);
}

.demo-collage-thumb-crop-note {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

@container (max-width: 48rem) {
  .demo-collage-thumb-subsection__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>
