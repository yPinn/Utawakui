<script setup>
import { computed, shallowRef } from 'vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiArtworkLoading from '../ui/UiArtworkLoading.vue';
import UiButton from '../ui/UiButton.vue';
import { ARTWORK_SIZE } from '../../constants/ui.js';
import square from '../../assets/demo/track-thumb/track-thumb-crop-square.jpg';
import wide from '../../assets/demo/track-thumb/track-thumb-crop-wide.jpg';
import { BROKEN_IMAGE_FIXTURE_URL } from './demoImageFixtures.js';

const TRACKS = Object.freeze([
  { id: 'formal-collage-中文', title: '雨愛', thumbnailUrl: wide },
  { id: 'formal-collage-日本語', title: 'アイドル', thumbnailUrl: square },
  { id: 'formal-collage-3', title: '밤편지', thumbnailUrl: wide },
  { id: 'formal-collage-4', title: 'Summer Live', thumbnailUrl: square },
  { id: 'formal-collage-5', title: '第五首', thumbnailUrl: square },
]);
const COUNTS = Object.freeze([0, 1, 2, 3, 4, 5]);
const MISSING = TRACKS.slice(0, 2).map(({ id, title }) => ({ id, title }));
const pending = shallowRef(true);
const memberSource = shallowRef('broken');
const memberRevision = shallowRef(0);
const memberTrack = computed(() => ({
  id: 'formal-collage-recovery',
  title: '恢復示例',
  thumbnailUrl:
    memberSource.value === 'broken'
      ? BROKEN_IMAGE_FIXTURE_URL
      : memberSource.value === 'valid'
        ? square
        : '',
}));
const cover = shallowRef(BROKEN_IMAGE_FIXTURE_URL);
const coverFailed = shallowRef(false);
function setCover(url) {
  coverFailed.value = false;
  cover.value = url;
}
function retryMember() {
  memberSource.value = 'broken';
  memberRevision.value++;
}
function recordCoverError(event) {
  if (event.target.classList?.contains('ui-collage-thumb__custom-image'))
    coverFailed.value = true;
}
</script>

<template>
  <div class="demo-collage-production">
    <p>
      以下使用正式
      UiCollageThumb。零至一首仍為四格；缺圖成員使用預設封面，空格保留音符。圖片尺寸沿用
      artwork size 階梯，不隨操作密度縮放。
    </p>
    <div class="demo-collage-production__inventory">
      <figure v-for="count in COUNTS" :key="count" :data-collage-count="count">
        <UiCollageThumb
          :size="ARTWORK_SIZE.md"
          :tracks="TRACKS.slice(0, count)"
        />
        <figcaption>
          {{ count }} 首{{ count === 5 ? '（只取前四首）' : '' }}
        </figcaption>
      </figure>
      <figure data-collage-case="single">
        <UiCollageThumb
          :size="ARTWORK_SIZE.md"
          :tracks="TRACKS"
          :can-collage="false"
        />
        <figcaption>單一發行封面</figcaption>
      </figure>
      <figure data-collage-case="empty-single">
        <UiCollageThumb :size="ARTWORK_SIZE.md" :can-collage="false" />
        <figcaption>單一空封面</figcaption>
      </figure>
      <figure data-collage-case="missing">
        <UiCollageThumb :size="ARTWORK_SIZE.md" :tracks="MISSING" />
        <figcaption>兩首缺圖／兩格空位</figcaption>
      </figure>
      <figure data-collage-case="row-size">
        <UiCollageThumb :size="ARTWORK_SIZE.xs" :tracks="TRACKS" />
        <figcaption>Sidebar 尺寸</figcaption>
      </figure>
    </div>

    <section
      class="demo-collage-production__recovery"
      data-collage-case="loading"
    >
      <h5>資料載入與完成</h5>
      <div class="demo-collage-production__preview">
        <UiCollageThumb
          :size="ARTWORK_SIZE.xl"
          :tracks="pending ? [] : TRACKS"
          :decorative="false"
          :aria-busy="pending"
        >
          <template v-if="pending" #overlay
            ><UiArtworkLoading label="集合封面資料載入中"
          /></template>
        </UiCollageThumb>
        <div class="demo-collage-production__controls">
          <p>
            載入由 caller 管理；使用下方操作模擬資料回傳，不代表圖片網路進度。
          </p>
          <p role="status" data-collage-loading-status>
            {{ pending ? '等待集合資料' : '集合資料已載入' }}
          </p>
          <div class="demo-collage-production__actions">
            <UiButton
              data-collage-complete
              :disabled="!pending"
              @click="pending = false"
              >完成資料載入</UiButton
            >
            <UiButton
              data-collage-reload
              :disabled="pending"
              @click="pending = true"
              >重新載入資料</UiButton
            >
          </div>
        </div>
      </div>
    </section>

    <section
      class="demo-collage-production__recovery"
      data-collage-case="member-recovery"
    >
      <h5>成員圖片失敗與恢復</h5>
      <div class="demo-collage-production__preview">
        <UiCollageThumb
          :key="memberRevision"
          :size="ARTWORK_SIZE.xl"
          :tracks="[memberTrack, TRACKS[1]]"
        />
        <div class="demo-collage-production__controls">
          <p>
            壞圖自動改用預設封面；預設封面也失敗時顯示曲名首字。換成有效圖片後恢復；重新載入會重建此標本以重試相同來源。
          </p>
          <div class="demo-collage-production__actions">
            <UiButton data-collage-member-valid @click="memberSource = 'valid'"
              >換成有效圖片</UiButton
            >
            <UiButton
              data-collage-member-missing
              @click="memberSource = 'missing'"
              >移除成員圖片</UiButton
            >
            <UiButton data-collage-member-retry @click="retryMember"
              >重新載入壞圖</UiButton
            >
          </div>
        </div>
      </div>
    </section>

    <section
      class="demo-collage-production__recovery"
      data-collage-case="cover-recovery"
      @error.capture="recordCoverError"
    >
      <h5>集合自訂封面失敗與恢復</h5>
      <div class="demo-collage-production__preview">
        <UiCollageThumb
          :size="ARTWORK_SIZE.xl"
          :cover-url="cover"
          :tracks="TRACKS"
        />
        <div class="demo-collage-production__controls">
          <p>
            正式元件的集合封面失敗不會自動退回成員。更換有效來源可恢復，移除集合封面才顯示成員拼貼。
          </p>
          <p role="status" data-collage-cover-status>
            {{
              coverFailed
                ? '集合封面載入失敗，請更換或移除'
                : cover
                  ? '已指定集合封面'
                  : '使用成員拼貼'
            }}
          </p>
          <div class="demo-collage-production__actions">
            <UiButton data-collage-cover-valid @click="setCover(wide)"
              >換成有效封面</UiButton
            >
            <UiButton data-collage-cover-remove @click="setCover('')"
              >移除集合封面</UiButton
            >
            <UiButton
              data-collage-cover-broken
              @click="setCover(BROKEN_IMAGE_FIXTURE_URL)"
              >重現集合壞圖</UiButton
            >
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-collage-production,
.demo-collage-production__controls {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
}
.demo-collage-production {
  gap: var(--ui-space-5);
}
.demo-collage-production p,
.demo-collage-production figure,
.demo-collage-production h5 {
  margin: 0;
}
.demo-collage-production p,
.demo-collage-production figcaption {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}
.demo-collage-production h5 {
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}
.demo-collage-production__inventory {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-4);
}
.demo-collage-production figure {
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
}
.demo-collage-production__recovery {
  display: grid;
  gap: var(--ui-space-3);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.demo-collage-production__preview,
.demo-collage-production__actions {
  min-inline-size: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
  align-items: flex-start;
}
.demo-collage-production__controls {
  flex: 1 1 18rem;
}
</style>
