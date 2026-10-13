<script setup>
import { computed, shallowRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import DemoCandidateCheckbox from './DemoCandidateCheckbox.vue';
import DemoCandidateHint from './DemoCandidateHint.vue';
import DemoCandidateModal from './DemoCandidateModal.vue';
import DemoCandidateSelect from './DemoCandidateSelect.vue';

defineProps({
  layer: { type: Object, required: true },
});

const SHELL_SIZES = Object.freeze([
  { key: 'small', label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
]);

const CONTENT_CASES = Object.freeze([
  { key: 'short', label: '短內容', title: '確認內容' },
  { key: 'fields', label: '欄位組合', title: '提供補充內容' },
  {
    key: 'reading',
    label: '長篇說明',
    title: '閱讀這段較長的多語說明／Long modal content／長い説明を確認',
  },
]);

const FIELD_CATEGORY_OPTIONS = Object.freeze([
  { value: 'display', label: '顯示與排版' },
  { value: 'interaction', label: '操作與鍵盤' },
  { value: 'content', label: '文字與資料' },
]);

const READING_SECTIONS = Object.freeze([
  {
    key: 'scope',
    title: '內容範圍',
    copy: '這份文字只用來檢查較長內容的閱讀順序、自然換行與捲動邊界；它不代表任何正式條款或產品流程。',
  },
  {
    key: 'structure',
    title: '結構與順序',
    copy: '標題、段落與列表依 DOM 順序排列。視窗高度不足時，內容區自行捲動，header 與 footer 仍留在可見範圍。',
  },
  {
    key: 'selection',
    title: '文字選取',
    copy: '使用者可能需要引用的說明、名稱與識別資料維持可選取；關閉按鈕與操作標籤仍屬介面 chrome。',
  },
  {
    key: 'language',
    title: '多語內容',
    copy: '繁體中文、日本語、한국어 and English 可以放在同一內容區，並在窄寬度中保持自然換行與清楚的閱讀次序。',
  },
  {
    key: 'identity',
    title: '長識別資料',
    copy: 'SummerLiveSessionFinalMixWithoutSpaces20260914.wav 需要留在容器內，不得撐出水平捲軸或遮住其他內容。',
  },
  {
    key: 'keyboard',
    title: '鍵盤閱讀',
    copy: '內容起點可以接收程式焦點，讓 Page Up、Page Down、Home 與 End 從正文開始操作，而不必先跳到最底部的按鈕。',
  },
  {
    key: 'position',
    title: '重新開啟',
    copy: '每次新開啟都回到內容頂端；同一次開啟期間若文字更新，元件不應擅自改變使用者目前的閱讀位置。',
  },
  {
    key: 'viewport',
    title: '視窗邊界',
    copy: 'Medium 以 45rem 為高度 ceiling，實際高度仍會扣除 Standard 或 Compact 的上下安全邊界。',
  },
  {
    key: 'overflow',
    title: 'Overflow',
    copy: '只有 body 可以垂直捲動；內容應重新排列或換行，不提供一般情境下的水平捲動路徑。',
  },
  {
    key: 'actions',
    title: '操作位置',
    copy: '底部操作由 caller 決定是否存在及其名稱。捲動不應改變按鈕順序，也不會把操作吸收進內容區。',
  },
  {
    key: 'density',
    title: '密度',
    copy: 'Standard 與 Compact 只映射安全邊界和間距，不改變內容案例的語意，也不把不同案例綁定到特定尺寸。',
  },
  {
    key: 'end',
    title: '內容結尾',
    copy: '到達最後一段後，正文、焦點與 footer 仍屬同一個 modal。這只是開發標本，用來檢查中性 shell 的行為。',
  },
]);

const activeSize = shallowRef('');
const showFooter = shallowRef(true);
const contentCase = shallowRef('short');
const fieldSummary = shallowRef('窄視窗中內容排列異常');
const fieldCategory = shallowRef('display');
const fieldDetails = shallowRef(
  '請描述看到的結果、預期結果，以及可以協助辨識問題的本機操作步驟。',
);
const result = shallowRef('');

const activeShell = computed(
  () => SHELL_SIZES.find((size) => size.key === activeSize.value) ?? null,
);
const activeContentCase = computed(
  () =>
    CONTENT_CASES.find((sample) => sample.key === contentCase.value) ??
    CONTENT_CASES[0],
);
const hasFooter = computed(
  () => Boolean(activeShell.value) && showFooter.value,
);
const modalProps = computed(() => ({
  size: activeShell.value?.key ?? 'medium',
}));

function openSize(size) {
  activeSize.value = size;
}

function closeModal() {
  activeSize.value = '';
}

function finishAction() {
  result.value = `已完成 ${activeShell.value?.label ?? 'Modal'}／${activeContentCase.value.label} 標本操作`;
  closeModal();
}
</script>

<template>
  <div class="demo-modal-specimen">
    <dl class="demo-modal-specimen__summary" aria-label="Modal shell 規格">
      <div>
        <dt>尺寸</dt>
        <dd>
          Small · 384px／max 560px · Medium · 512px／max 720px · Large ·
          768px／max 800px
        </dd>
      </div>
      <div>
        <dt>安全邊界</dt>
        <dd>Min 0 · Standard 24px／Compact 16px</dd>
      </div>
      <div>
        <dt>內容結構</dt>
        <dd>Header／Body／Footer · Body-only scroll</dd>
      </div>
      <div>
        <dt>捲動基準</dt>
        <dd>Medium scroll baseline · 45rem／720px ceiling</dd>
      </div>
    </dl>

    <section class="demo-modal-specimen__preview">
      <header class="demo-modal-specimen__intro">
        <h5>開啟尺寸標本</h5>
        <p>
          Neutral shell 只定義尺寸、間距與 overflow，不綁定 production
          情境；實際內容仍由 caller 組成。
        </p>
      </header>

      <div class="demo-modal-specimen__controls">
        <div class="demo-modal-specimen__axis">
          <span class="demo-modal-specimen__axis-label">尺寸</span>
          <div class="demo-modal-specimen__sizes" aria-label="開啟 Modal 尺寸">
            <UiButton
              v-for="size in SHELL_SIZES"
              :key="size.key"
              variant="secondary"
              :active="activeSize === size.key"
              aria-haspopup="dialog"
              :aria-expanded="activeSize === size.key"
              @click="openSize(size.key)"
            >
              {{ size.label }}
            </UiButton>
          </div>
        </div>

        <div class="demo-modal-specimen__axis">
          <span class="demo-modal-specimen__axis-label">內容</span>
          <div class="demo-modal-specimen__cases" aria-label="選擇內容案例">
            <UiButton
              v-for="sample in CONTENT_CASES"
              :key="sample.key"
              variant="secondary"
              :active="contentCase === sample.key"
              :aria-pressed="contentCase === sample.key"
              @click="contentCase = sample.key"
            >
              {{ sample.label }}
            </UiButton>
          </div>
        </div>

        <div class="demo-modal-specimen__axis">
          <span class="demo-modal-specimen__axis-label">結構</span>
          <div class="demo-modal-specimen__options" aria-label="Modal 標本選項">
            <DemoCandidateCheckbox
              :id="`demo-modal-${layer.key}-footer`"
              v-model="showFooter"
              label="顯示 Footer"
            />
          </div>
        </div>
      </div>

      <DemoCandidateHint class="demo-modal-specimen__caption">
        案例只改變 caller content，不會指定 Modal size；可檢查 body-only
        scroll、重新開啟回頂、文字選取與固定 header／footer。
      </DemoCandidateHint>
    </section>

    <p class="demo-modal-specimen__result" aria-live="polite">
      {{ result }}
    </p>

    <DemoCandidateModal
      :open="Boolean(activeShell)"
      :title="activeContentCase.title"
      v-bind="modalProps"
      @close="closeModal"
    >
      <div
        v-if="activeShell"
        class="demo-modal-sample"
        :data-modal-shell-size="activeShell.key"
      >
        <template v-if="activeContentCase.key === 'short'">
          <p class="demo-modal-sample__lead">
            選擇會套用到目前的本機顯示設定。請確認內容後再完成操作。
          </p>

          <DemoCandidateHint class="demo-modal-sample__hint">
            短內容不應為了對齊最大高度而留下固定空間。
          </DemoCandidateHint>
        </template>

        <div
          v-else-if="activeContentCase.key === 'fields'"
          class="demo-modal-case-fields"
        >
          <p class="demo-modal-sample__lead">
            以下是假資料欄位，只用來檢查表單形狀、focus 與內容 overflow。
          </p>
          <div class="demo-modal-case-fields__grid">
            <UiTextField
              :id="`demo-modal-${layer.key}-summary`"
              v-model="fieldSummary"
              label="摘要"
              autocomplete="off"
              autofocus
            />
            <DemoCandidateSelect
              :id="`demo-modal-${layer.key}-category`"
              v-model="fieldCategory"
              label="內容分類"
              :options="FIELD_CATEGORY_OPTIONS"
            />
            <UiTextarea
              :id="`demo-modal-${layer.key}-details`"
              v-model="fieldDetails"
              class="demo-modal-case-fields__details"
              label="補充內容"
              :rows="6"
            />
          </div>
          <DemoCandidateHint>
            這些控制項不會送出資料；操作結果只留在元件型錄。
          </DemoCandidateHint>
        </div>

        <article v-else class="demo-modal-case-reading">
          <p class="demo-modal-sample__lead">
            長篇案例可以代表說明、條款或其他結構化文字，但不會改變 UiModal 的
            public contract。
          </p>
          <div class="demo-modal-sample__reading">
            <section
              v-for="(section, index) in READING_SECTIONS"
              :key="section.key"
              class="demo-modal-case-reading__section"
            >
              <h3
                :autofocus="index === 0 || undefined"
                :tabindex="index === 0 ? -1 : undefined"
              >
                {{ section.title }}
              </h3>
              <p>{{ section.copy }}</p>
            </section>
          </div>
        </article>
      </div>

      <template v-if="hasFooter" #footer>
        <UiButton variant="secondary" @click="closeModal"> 取消 </UiButton>
        <UiButton variant="accent" @click="finishAction">完成</UiButton>
      </template>
    </DemoCandidateModal>
  </div>
</template>

<style scoped>
.demo-modal-specimen,
.demo-modal-specimen__preview,
.demo-modal-specimen__controls,
.demo-modal-specimen__axis,
.demo-modal-sample,
.demo-modal-sample__reading,
.demo-modal-case-fields,
.demo-modal-case-fields__grid,
.demo-modal-case-reading,
.demo-modal-case-reading__section {
  min-inline-size: 0;
  display: grid;
}

.demo-modal-specimen {
  gap: var(--ui-space-5);
}

.demo-modal-specimen__summary {
  min-inline-size: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-5);
  margin: 0;
}

.demo-modal-specimen__summary div {
  min-inline-size: min(100%, 12rem);
  display: flex;
  flex: 1 1 14rem;
  align-items: baseline;
  gap: var(--ui-space-2);
}

.demo-modal-specimen__summary dt,
.demo-modal-specimen__summary dd,
.demo-modal-specimen__intro h5,
.demo-modal-specimen__intro p,
.demo-modal-specimen__result,
.demo-modal-sample__lead,
.demo-modal-sample__reading h3,
.demo-modal-sample__reading p {
  margin: 0;
}

.demo-modal-specimen__summary dt,
.demo-modal-specimen__intro h5 {
  flex: 0 0 auto;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.demo-modal-specimen__summary dd,
.demo-modal-specimen__intro p {
  min-inline-size: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-modal-specimen__preview {
  gap: var(--ui-space-3);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-modal-specimen__intro {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(9rem, 0.32fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-3);
}

.demo-modal-specimen__sizes,
.demo-modal-specimen__cases,
.demo-modal-specimen__options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.demo-modal-specimen__controls {
  gap: var(--ui-space-2);
}

.demo-modal-specimen__axis {
  grid-template-columns: 3rem minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-3);
}

.demo-modal-specimen__axis-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
  -webkit-user-select: none;
  user-select: none;
}

.demo-modal-specimen__sizes,
.demo-modal-specimen__cases {
  gap: var(--ui-space-2);
}

.demo-modal-specimen__options {
  gap: var(--ui-space-4);
}

.demo-modal-specimen__caption {
  max-inline-size: 72ch;
}

.demo-modal-specimen__result {
  min-block-size: calc(var(--ui-font-size-sm) * var(--ui-line-height-caption));
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-caption);
}

.demo-modal-specimen__result:empty {
  display: none;
}

.demo-modal-sample {
  gap: var(--ui-space-3);
}

.demo-modal-sample__lead {
  max-inline-size: 68ch;
}

.demo-modal-sample__lead,
.demo-modal-sample__reading {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
  overflow-wrap: anywhere;
  -webkit-user-select: text;
  user-select: text;
}

.demo-modal-sample__reading {
  gap: var(--ui-space-3);
}

.demo-modal-case-fields {
  gap: var(--ui-space-4);
}

.demo-modal-case-fields__grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-3);
}

.demo-modal-case-fields__details {
  grid-column: 1 / -1;
}

.demo-modal-case-reading {
  gap: var(--ui-space-4);
  color: var(--ui-color-text);
  -webkit-user-select: text;
  user-select: text;
}

.demo-modal-case-reading__section {
  align-content: start;
  gap: var(--ui-space-1);
}

.demo-modal-case-reading__section h3 {
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.demo-modal-case-reading__section h3:focus-visible {
  border-radius: var(--ui-radius-xs);
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-modal-case-reading__section p {
  color: var(--ui-color-text-muted);
}

@container (min-width: 42rem) {
  .demo-modal-sample[data-modal-shell-size='large']
    .demo-modal-sample__reading {
    max-inline-size: none;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-3) var(--ui-space-5);
  }
}

@container (max-width: 28rem) {
  .demo-modal-case-fields__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-modal-case-fields__details {
    grid-column: auto;
  }
}

@media (max-width: 40rem) {
  .demo-modal-specimen__intro {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-modal-specimen__axis {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }

  .demo-modal-case-fields__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-modal-case-fields__details {
    grid-column: auto;
  }
}

@media (max-width: 24rem) {
  .demo-modal-specimen__summary {
    display: grid;
  }

  .demo-modal-specimen__summary div {
    display: grid;
    gap: var(--ui-space-1);
  }
}
</style>
