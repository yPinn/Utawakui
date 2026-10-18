<script setup>
import { computed, reactive, shallowRef } from 'vue';
import { Check } from '../../icons/index.js';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import UiArtworkLoading from '../ui/UiArtworkLoading.vue';
import UiArtworkReveal from '../ui/UiArtworkReveal.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiHint from '../ui/UiHint.vue';
import artwork from '../../assets/demo/track-thumb/track-thumb-crop-square.jpg';
import { BROKEN_IMAGE_FIXTURE_URL } from './demoImageFixtures.js';

const MODES = Object.freeze([
  {
    key: 'self',
    title: '自身 hover／鍵盤焦點',
    scope: undefined,
    note: '滑鼠移到封面，或 Tab 到封面操作。聚焦備註不揭露操作。',
  },
  {
    key: 'hover',
    title: '祖先 hover',
    scope: '',
    note: '滑鼠移到這一列任意位置即揭露。聚焦備註不揭露操作。',
  },
  {
    key: 'focus-within',
    title: '祖先 hover／focus-within',
    scope: 'focus-within',
    note: '滑鼠移到這一列，或鍵盤聚焦備註，都會揭露操作。',
  },
]);
const phase = shallowRef('loading');
const selected = shallowRef(false);
const scopeSelection = shallowRef('');
const notes = reactive(Object.fromEntries(MODES.map((item) => [item.key, ''])));
const readyTrack = Object.freeze({
  id: 'formal-artwork-ready',
  title: '封面示例',
  thumbnailUrl: artwork,
});
const flowTrack = computed(() =>
  phase.value === 'loading'
    ? undefined
    : {
        ...readyTrack,
        thumbnailUrl:
          phase.value === 'error' ? BROKEN_IMAGE_FIXTURE_URL : artwork,
      },
);
const message = computed(() =>
  phase.value === 'loading'
    ? '等待封面資料'
    : phase.value === 'error'
      ? '封面資料載入失敗，請重試。'
      : selected.value
        ? '已選取封面'
        : '封面資料已載入，可選取封面。',
);
function setPhase(value) {
  selected.value = false;
  phase.value = value;
}
</script>

<template>
  <div class="demo-artwork-states">
    <p class="demo-artwork-states__copy">
      下方按鈕模擬封面資料載入結果，不會變更曲目或播放。圖片無法顯示時會使用預設封面。
    </p>
    <section class="demo-artwork-states__flow" data-artwork-flow>
      <h5>載入、完成與重試</h5>
      <div class="demo-artwork-states__row">
        <div data-artwork-reveal-scope="focus-within">
          <UiTrackThumb
            :track="flowTrack"
            size="var(--ui-artwork-size-xl)"
            :decorative="false"
            :aria-busy="phase === 'loading'"
          >
            <template v-if="phase !== 'error'" #overlay>
              <UiArtworkLoading
                v-if="phase === 'loading'"
                label="封面資料載入中"
              />
              <UiArtworkReveal v-else class="demo-artwork-states__reveal">
                <UiIconButton
                  :icon="Check"
                  label="選取封面"
                  variant="overlay"
                  :aria-pressed="selected"
                  data-artwork-select
                  @click="selected = !selected"
                />
              </UiArtworkReveal>
            </template>
          </UiTrackThumb>
        </div>
        <div class="demo-artwork-states__controls">
          <UiHint
            :tone="phase === 'error' ? 'danger' : 'muted'"
            :role="phase === 'error' ? 'alert' : 'status'"
            data-artwork-flow-status
            >{{ message }}</UiHint
          >
          <div class="demo-artwork-states__actions">
            <UiButton
              :disabled="phase === 'ready'"
              data-artwork-complete
              @click="setPhase('ready')"
              >完成資料載入</UiButton
            >
            <UiButton
              :disabled="phase === 'error'"
              data-artwork-fail
              @click="setPhase('error')"
              >模擬載入失敗</UiButton
            >
            <UiButton
              :disabled="phase === 'loading'"
              data-artwork-retry
              @click="setPhase('loading')"
              >重新載入</UiButton
            >
          </div>
        </div>
      </div>
    </section>

    <section
      v-for="mode in MODES"
      :key="mode.key"
      class="demo-artwork-states__scope"
      :data-artwork-reveal-case="mode.key"
      :data-artwork-reveal-scope="mode.scope"
    >
      <h5>{{ mode.title }}</h5>
      <p class="demo-artwork-states__copy">{{ mode.note }}</p>
      <div class="demo-artwork-states__row">
        <UiTrackThumb
          :track="readyTrack"
          size="var(--ui-artwork-size-lg)"
          :decorative="false"
        >
          <template #overlay>
            <UiArtworkReveal class="demo-artwork-states__reveal">
              <UiIconButton
                :icon="Check"
                :label="`選取封面：${mode.title}`"
                variant="overlay"
                :aria-pressed="scopeSelection === mode.key"
                data-artwork-scope-select
                @click="
                  scopeSelection = scopeSelection === mode.key ? '' : mode.key
                "
              />
            </UiArtworkReveal>
          </template>
        </UiTrackThumb>
        <UiTextField
          :id="`demo-artwork-note-${mode.key}`"
          v-model="notes[mode.key]"
          label="封面備註（型錄示範）"
          class="demo-artwork-states__note"
        />
      </div>
    </section>
    <UiHint
      >減少動態效果沿用 App
      手動設定與系統偏好：載入提示停止閃動，揭露立即完成，滑鼠與鍵盤操作仍可使用。</UiHint
    >
  </div>
</template>

<style scoped>
.demo-artwork-states,
.demo-artwork-states__flow,
.demo-artwork-states__scope,
.demo-artwork-states__controls {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
}
.demo-artwork-states {
  gap: var(--ui-space-5);
}
.demo-artwork-states__scope {
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.demo-artwork-states h5 {
  margin: 0;
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}
.demo-artwork-states__copy {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}
.demo-artwork-states__row,
.demo-artwork-states__actions {
  min-inline-size: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--ui-space-3);
}
.demo-artwork-states__controls,
.demo-artwork-states__note {
  flex: 1 1 18rem;
}
.demo-artwork-states__reveal {
  place-items: center;
}
</style>
