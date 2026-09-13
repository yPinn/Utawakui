<script setup>
import trackThumbCropSquare from '../../assets/demo/track-thumb/track-thumb-crop-square.jpg';
import trackThumbCropWide from '../../assets/demo/track-thumb/track-thumb-crop-wide.jpg';
import {
  getTrackThumbFallbackArtwork,
  TRACK_THUMB_FALLBACK_ARTWORK,
} from './trackThumbFallback.js';

defineProps({
  layer: { type: Object, required: true },
});

const CROP_ARTWORK = [
  {
    id: 'crop-wide',
    url: trackThumbCropWide,
    title: '寬圖置中裁切',
    note: '寬幅來源保持人物可辨識，不拉伸變形',
  },
  {
    id: 'crop-square',
    url: trackThumbCropSquare,
    title: '方形構圖對照',
    note: '保留完整場景，只裁掉圓角外側',
  },
];

const CONTENT_ITEMS = [
  {
    id: 'long-cjk',
    title: '夏夜裡需要保留完整資料的繁體中文曲目名稱',
    label: '長 CJK',
  },
  {
    id: 'long-latin',
    title: 'Summer Live Session Extended Version',
    label: 'Long Latin',
    lang: 'en',
  },
  {
    id: 'multilingual',
    title: '夜空 日本語 한국어 and English',
    label: '多語內容',
  },
  {
    id: 'unbroken',
    title: 'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    label: '無斷點字串',
    lang: 'en',
  },
];

const FALLBACK_EXAMPLES = TRACK_THUMB_FALLBACK_ARTWORK.map((_, index) => {
  const track = {
    id: `fallback-example-${index}`,
    title: `預設封面 ${index + 1}`,
  };

  return {
    id: `fallback-${index + 1}`,
    artwork: getTrackThumbFallbackArtwork(track),
    track,
  };
});
</script>

<template>
  <div
    class="demo-track-thumb-primitive"
    :class="`demo-track-thumb-primitive--${layer.key}`"
  >
    <section class="demo-track-thumb-block demo-track-thumb-role">
      <header class="demo-track-thumb-subsection__header">
        <h5>使用時機</h5>
        <p v-if="layer.key === 'candidate'">
          有封面時顯示圖片；沒有可用封面時顯示預設圖片。封面本身不能操作。
        </p>
        <p v-else>
          有封面時顯示圖片；沒有封面時以曲名首字維持穩定位置。封面本身不能操作。
        </p>
      </header>

      <div class="demo-track-thumb-role__list">
        <article>
          <strong>單一曲目</strong>
          <span v-if="layer.key === 'candidate'">顯示歌曲封面或預設圖片</span>
          <span v-else>顯示歌曲封面或曲名首字</span>
        </article>
        <article>
          <strong>集合封面</strong>
          <span>集合封面與拼貼由 UiCollageThumb 負責</span>
        </article>
        <article>
          <strong>所在區域</strong>
          <span>操作、播放狀態與資料列排版由所在區域負責</span>
        </article>
      </div>
    </section>

    <section class="demo-track-thumb-block demo-track-thumb-geometry">
      <header class="demo-track-thumb-subsection__header">
        <h5>尺寸與裁切</h5>
        <p>所在區域指定方形尺寸；圖片填滿範圍並保持原比例，圓角固定為 4px。</p>
      </header>

      <div class="demo-track-thumb-density-list">
        <article
          v-for="density in layer.densities"
          :key="density.id"
          :data-track-thumb-density="density.id"
        >
          <span class="demo-track-thumb-item__label">{{ density.label }}</span>
          <component
            :is="layer.component"
            :track="{
              id: `density-${density.id}`,
              title: '密度封面',
            }"
            :size="density.size"
          />
        </article>
      </div>

      <div class="demo-track-thumb-crop-list">
        <article
          v-for="artwork in CROP_ARTWORK"
          :key="artwork.id"
          :data-track-thumb-artwork="artwork.id"
        >
          <component
            :is="layer.component"
            :track="{
              id: artwork.id,
              title: artwork.title,
              thumbnailUrl: artwork.url,
            }"
            :size="96"
          />
          <span class="demo-track-thumb-item__copy">
            <strong>{{ artwork.title }}</strong>
            <small>{{ artwork.note }}</small>
          </span>
        </article>
      </div>
    </section>

    <section class="demo-track-thumb-block demo-track-thumb-content">
      <header class="demo-track-thumb-subsection__header">
        <h5>內容與失敗回退</h5>
        <p v-if="layer.key === 'candidate'">
          封面無法顯示時改用預設圖片；若預設圖片也無法顯示，才保留曲名首字。
        </p>
        <p v-else>沒有封面時顯示首字；圖片來源失敗時仍會保留失敗的圖片位置。</p>
      </header>

      <div class="demo-track-thumb-fallback-copy">
        <strong v-if="layer.key === 'candidate'">預設封面組</strong>
        <strong v-else>相同缺圖曲目</strong>
        <span v-if="layer.key === 'candidate'">
          沒有可用封面時，系統會固定選用其中一張。
        </span>
        <span v-else>現行版仍顯示曲名首字，不使用預設封面。</span>
      </div>

      <div
        class="demo-track-thumb-series-list"
        :aria-label="layer.key === 'candidate' ? '預設封面組' : '相同缺圖曲目'"
      >
        <article
          v-for="example in FALLBACK_EXAMPLES"
          :key="example.id"
          :data-track-thumb-fallback="example.artwork.id"
        >
          <component :is="layer.component" :track="example.track" :size="48" />
          <span>{{ example.track.title }}</span>
        </article>
      </div>

      <div class="demo-track-thumb-state-list">
        <article data-track-thumb-state="image">
          <span class="demo-track-thumb-item__label">有效封面</span>
          <component
            :is="layer.component"
            :track="{
              id: 'image',
              title: '正常顯示',
              thumbnailUrl: trackThumbCropSquare,
            }"
            :size="48"
          />
        </article>
        <article data-track-thumb-state="missing">
          <span class="demo-track-thumb-item__label">沒有封面</span>
          <component
            :is="layer.component"
            :track="{ id: 'initial', title: '夏日練習曲' }"
            :size="48"
          />
        </article>
        <article data-track-thumb-state="broken">
          <span class="demo-track-thumb-item__label">封面無法顯示</span>
          <component
            :is="layer.component"
            :track="{
              id: 'broken',
              title: '失敗回退',
              thumbnailUrl: 'data:image/gif;base64,broken',
            }"
            :size="48"
          />
        </article>
        <article data-track-thumb-state="empty">
          <span class="demo-track-thumb-item__label">
            {{
              layer.key === 'candidate'
                ? '沒有曲目（共用空位置）'
                : '沒有曲目（型錄插槽範例）'
            }}
          </span>
          <component
            :is="layer.component"
            v-if="layer.key === 'candidate'"
            :size="48"
          />
          <component :is="layer.component" v-else :size="48">
            <span class="demo-track-thumb-empty">—</span>
          </component>
        </article>
      </div>

      <div class="demo-track-thumb-content-list">
        <article
          v-for="item in CONTENT_ITEMS"
          :key="item.id"
          :data-track-thumb-content="item.id"
        >
          <span class="demo-track-thumb-item__label">{{ item.label }}</span>
          <component
            :is="layer.component"
            :track="{ id: item.id, title: item.title }"
            :size="48"
            :lang="item.lang"
          />
          <small>{{ item.title }}</small>
        </article>
      </div>
    </section>

    <section class="demo-track-thumb-block demo-track-thumb-recipes">
      <header class="demo-track-thumb-subsection__header">
        <h5>實際使用情境</h5>
        <p>{{ layer.recipeSummary }}</p>
      </header>

      <div class="demo-track-thumb-recipe-list">
        <article
          v-for="recipe in layer.recipes"
          :key="recipe.id"
          :data-track-thumb-recipe="recipe.id"
        >
          <component
            :is="layer.component"
            :track="{
              id: recipe.id,
              title: recipe.label,
            }"
            :size="recipe.size"
          />
          <span class="demo-track-thumb-recipe-list__copy">
            <strong>{{ recipe.label }}</strong>
            <small>{{ recipe.note }}</small>
          </span>
        </article>
      </div>
    </section>

    <section class="demo-track-thumb-block demo-track-thumb-contract">
      <header class="demo-track-thumb-subsection__header">
        <h5>輔助技術與公開介面</h5>
        <p>
          曲名已在旁邊顯示時，封面不重複朗讀；封面獨立表意時才提供簡短名稱。
        </p>
      </header>

      <div class="demo-track-thumb-aria-list">
        <article data-track-thumb-aria="decorative">
          <component
            :is="layer.component"
            :track="{
              id: 'decorative',
              title: '相鄰曲名的封面',
              thumbnailUrl: trackThumbCropWide,
            }"
            :size="48"
          />
          <span>相鄰曲名已說明內容</span>
        </article>
        <article data-track-thumb-aria="named">
          <component
            :is="layer.component"
            :track="{
              id: 'named',
              title: '目前封面',
              thumbnailUrl: trackThumbCropSquare,
            }"
            :size="64"
            :decorative="false"
            aria-label="目前封面"
          />
          <span>獨立封面使用「目前封面」</span>
        </article>
      </div>

      <div
        class="demo-track-thumb-contracts"
        aria-label="UiTrackThumb public contract"
      >
        <span>track · optional single-track data</span>
        <span>size · required square length</span>
        <span>decorative · default true</span>
        <span>未使用的外觀覆寫與 overlay slot 保留相容</span>
        <span>互動操作應由外層控制項提供</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-track-thumb-primitive,
.demo-track-thumb-block,
.demo-track-thumb-fallback-copy,
.demo-track-thumb-role__list article,
.demo-track-thumb-density-list article,
.demo-track-thumb-crop-list article,
.demo-track-thumb-series-list article,
.demo-track-thumb-state-list article,
.demo-track-thumb-content-list article,
.demo-track-thumb-recipe-list article,
.demo-track-thumb-aria-list article {
  min-width: 0;
  display: grid;
}

.demo-track-thumb-primitive {
  gap: var(--ui-space-6);
}

.demo-track-thumb-block {
  gap: var(--ui-space-3);
}

.demo-track-thumb-block + .demo-track-thumb-block {
  padding-block-start: var(--ui-space-5);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-track-thumb-subsection__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(9rem, 0.3fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-track-thumb-subsection__header h5,
.demo-track-thumb-subsection__header p,
.demo-track-thumb-item__copy strong,
.demo-track-thumb-item__copy small {
  margin: 0;
}

.demo-track-thumb-subsection__header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-title);
}

.demo-track-thumb-subsection__header p,
.demo-track-thumb-role__list span,
.demo-track-thumb-item__label,
.demo-track-thumb-series-list span,
.demo-track-thumb-state-list span,
.demo-track-thumb-content-list small,
.demo-track-thumb-recipe-list small,
.demo-track-thumb-aria-list span,
.demo-track-thumb-item__copy small {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-track-thumb-role__list,
.demo-track-thumb-density-list,
.demo-track-thumb-crop-list,
.demo-track-thumb-series-list,
.demo-track-thumb-state-list,
.demo-track-thumb-content-list,
.demo-track-thumb-recipe-list,
.demo-track-thumb-aria-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(10.5rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-track-thumb-role__list article,
.demo-track-thumb-density-list article,
.demo-track-thumb-state-list article,
.demo-track-thumb-content-list article,
.demo-track-thumb-aria-list article {
  align-content: start;
  justify-items: start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}

.demo-track-thumb-role__list strong,
.demo-track-thumb-fallback-copy strong,
.demo-track-thumb-item__copy strong,
.demo-track-thumb-recipe-list strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-track-thumb-fallback-copy {
  grid-template-columns: minmax(8rem, auto) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-3);
}

.demo-track-thumb-fallback-copy span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-track-thumb-crop-list {
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
}

.demo-track-thumb-crop-list article {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  background: var(--ui-color-surface);
  border-radius: var(--ui-radius-md);
}

.demo-track-thumb-item__copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-track-thumb-series-list {
  grid-template-columns: repeat(auto-fit, minmax(min(8rem, 100%), 1fr));
}

.demo-track-thumb-series-list article {
  justify-items: center;
  align-content: start;
  gap: var(--ui-space-2);
  text-align: center;
}

.demo-track-thumb-recipe-list {
  grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
}

.demo-track-thumb-recipe-list article {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-3);
}

.demo-track-thumb-recipe-list__copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-track-thumb-content-list small {
  max-width: 100%;
}

.demo-track-thumb-contracts {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-track-thumb-contracts span {
  max-width: 100%;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-track-thumb-empty {
  font-size: var(--ui-font-size-md);
}

@container (max-width: 44rem) {
  .demo-track-thumb-subsection__header,
  .demo-track-thumb-fallback-copy {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>
