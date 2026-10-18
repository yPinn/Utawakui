<script setup>
import { computed, shallowRef } from 'vue';
import UiModal from '../ui/UiModal.vue';
import UiButton from '../ui/UiButton.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import mediaPreview from '../../assets/output-template-thumbnails/queue-board.jpg';

const CASES = Object.freeze([
  {
    key: 'dialog',
    title: 'Dialog・短表單',
    note: 'Default；首個欄位取得焦點，背景點擊保留草稿。',
  },
  {
    key: 'document',
    title: 'Document・長文',
    note: 'Wide／固定高度；只捲動內文，標題與操作列保持可見。',
  },
  {
    key: 'media',
    title: 'Media・圖片',
    note: '圖片保持比例；獨立關閉列，允許點擊背景關閉。',
  },
  {
    key: 'locked',
    title: '暫停關閉',
    note: 'Notice；closeDisabled 同時阻擋關閉鍵、Escape 與背景點擊。',
  },
  {
    key: 'stack',
    title: '堆疊對話框',
    note: 'Escape 逐層關閉，焦點依序回到上層開啟按鈕與型錄入口。',
  },
]);
const READING = Object.freeze([
  [
    '演出前確認',
    '先確認本機曲目、待唱順序與音量，再開啟需要的演出工具。此處為型錄閱讀範例，不會變更設定。',
  ],
  [
    '本機資料',
    '本機匯入與播放可以獨立使用。曲目資訊與播放清單由各自的設定保存，關閉閱讀視窗不影響目前播放。',
  ],
  [
    '長文字與路徑',
    'SummerLiveSessionFinalMixWithoutSpaces／演出準備／日本語の長い見出し。長文字應在內容區自然換行，不能推擠視窗的關閉按鈕。',
  ],
  [
    '鍵盤操作',
    'Tab 與 Shift＋Tab 會留在目前的對話框。Escape 關閉最上層，結束後回到原本的開啟位置。',
  ],
  [
    '捲動範圍',
    '閱讀時只有內文捲動，標題與底部操作保持可見。可選取文字，也可用鍵盤捲動內容。',
  ],
  [
    '多行閱讀',
    '中文、かな與 Latin 文字共用同一閱讀區。視窗縮小時，段落隨可用寬度換行，內容繼續向下延伸；操作列仍然保持在原本位置。',
  ],
  [
    '背景操作',
    '這份範例使用保護閱讀位置的對話框。點擊周圍背景時仍留在目前頁面，需要結束閱讀時使用明確的完成或關閉操作。',
  ],
  [
    '返回位置',
    '對話框關閉後，焦點回到型錄中開啟長文的按鈕。接著可以使用 Tab 前往下一個案例，也可以重新開啟此文件確認閱讀布局。',
  ],
  ['結束閱讀', '按下完成或關閉鍵即可返回型錄；背景點擊不會關閉這份文件。'],
]);
const activeCase = shallowRef('dialog');
const open = shallowRef(false);
const childOpen = shallowRef(false);
const locked = shallowRef(true);
const draft = shallowRef('週末演出');
const current = computed(() =>
  CASES.find((item) => item.key === activeCase.value),
);
const presentation = computed(() =>
  ['document', 'media'].includes(activeCase.value)
    ? activeCase.value
    : 'dialog',
);
const closeDisabled = computed(
  () => activeCase.value === 'locked' && locked.value,
);

function launch(key) {
  activeCase.value = key;
  locked.value = true;
  childOpen.value = false;
  open.value = true;
}
function close() {
  if (closeDisabled.value || childOpen.value) return;
  open.value = false;
}
</script>

<template>
  <div class="demo-modal-production">
    <div
      v-for="item in CASES"
      :key="item.key"
      class="demo-modal-production__case"
      :data-modal-case="item.key"
    >
      <UiButton :data-modal-launch="item.key" @click="launch(item.key)">{{
        item.title
      }}</UiButton>
      <p>{{ item.note }}</p>
    </div>
    <UiModal
      :open="open"
      :title="current.title"
      :presentation="presentation"
      :size="
        activeCase === 'document'
          ? 'wide'
          : activeCase === 'locked'
            ? 'notice'
            : 'default'
      "
      :fixed-height="activeCase === 'document'"
      :max-block-size="activeCase === 'document' ? 'large' : ''"
      :close-disabled="closeDisabled"
      :dismiss-on-backdrop="activeCase === 'media' || activeCase === 'locked'"
      @close="close"
    >
      <img
        v-if="activeCase === 'media'"
        class="demo-modal-production__media"
        :src="mediaPreview"
        alt="待唱看板模板的靜態預覽"
      />
      <article
        v-else-if="activeCase === 'document'"
        class="demo-modal-production__reading"
      >
        <section v-for="[title, text] in READING" :key="title">
          <h3>{{ title }}</h3>
          <p>{{ text }}</p>
        </section>
      </article>
      <div v-else class="demo-modal-production__body">
        <template v-if="activeCase === 'locked'">
          <p>
            這是關閉鎖定範例。關閉下方開關後，即可使用關閉鍵、完成、Escape
            或背景點擊返回。
          </p>
          <UiSwitch
            id="demo-modal-close-lock"
            v-model="locked"
            label="暫停關閉"
          />
          <p role="status">{{ locked ? '目前暫停關閉' : '已恢復關閉操作' }}</p>
        </template>
        <template v-else>
          <UiTextField
            id="demo-modal-draft"
            v-model="draft"
            label="演出名稱"
            hint="關閉後重新開啟，草稿仍會保留。"
          />
          <UiButton
            v-if="activeCase === 'stack'"
            data-modal-child-launch
            @click="childOpen = true"
            >開啟第二層</UiButton
          >
        </template>
      </div>
      <template v-if="activeCase !== 'media'" #footer>
        <UiButton
          :disabled="closeDisabled"
          data-modal-finish
          variant="accent"
          @click="close"
          >完成</UiButton
        >
      </template>
    </UiModal>
    <UiModal
      :open="childOpen"
      title="第二層對話框"
      size="notice"
      @close="childOpen = false"
    >
      <p class="demo-modal-production__child-copy">
        Escape 只關閉這一層，焦點會回到「開啟第二層」。
      </p>
      <template #footer>
        <UiButton data-modal-child-finish @click="childOpen = false"
          >返回第一層</UiButton
        >
      </template>
    </UiModal>
  </div>
</template>

<style scoped>
.demo-modal-production,
.demo-modal-production__body,
.demo-modal-production__reading {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-4);
}
.demo-modal-production__case {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ui-space-2) var(--ui-space-4);
}
.demo-modal-production__case p {
  flex: 1 1 24rem;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}
.demo-modal-production__body p,
.demo-modal-production__reading p,
.demo-modal-production__reading h3,
.demo-modal-production__child-copy {
  margin: 0;
  overflow-wrap: anywhere;
}
.demo-modal-production__reading {
  max-inline-size: 68ch;
  gap: var(--ui-space-6);
  line-height: var(--ui-line-height-body);
}
.demo-modal-production__reading h3 {
  margin-block-end: var(--ui-space-2);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}
.demo-modal-production__media {
  display: block;
  max-inline-size: var(--ui-media-max-inline-size);
  max-block-size: var(--ui-media-max-block-size);
  inline-size: auto;
  block-size: auto;
  object-fit: contain;
}
</style>
