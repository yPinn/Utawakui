<script setup>
import { ref } from 'vue';

const props = defineProps({
  layer: { type: Object, required: true },
});

const actionOutcome = ref('');

const ANATOMY_ITEMS = [
  {
    id: 'title-message',
    title: '準備尚未完成',
    message: '準備完成後即可繼續。',
  },
  {
    id: 'title-only',
    title: '目前設定只保存在這次工作階段',
  },
  {
    id: 'message-only',
    message: '已使用裝置上的歌曲資訊。',
  },
  {
    id: 'optional-action',
    title: '來源檔案無法讀取',
    message: '請確認檔案仍存在，再重新嘗試。',
    actionLabel: '重試讀取',
    tone: 'danger',
  },
];

const CONTENT_ITEMS = [
  {
    id: 'long-cjk',
    title: '需要確認輸出內容',
    message:
      '這段較長的繁體中文說明用來確認窄欄中仍能自然換行，並保留明確的下一步。',
  },
  {
    id: 'long-latin',
    title: 'This feature is not ready',
    message:
      'This inline notice keeps its recovery guidance readable in a narrow operational panel.',
    lang: 'en',
  },
  {
    id: 'multilingual',
    title: '多語內容檢查',
    message: '繁體中文、日本語、한국어 and English 都應在窄內容中維持可讀。',
    dir: 'auto',
  },
  {
    id: 'unbroken',
    title: 'Long file name',
    message: 'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    lang: 'en',
  },
];

const TONE_ITEMS = [
  {
    id: 'neutral',
    title: '歌曲資訊',
    message: '使用裝置上的歌曲資料。',
  },
  {
    id: 'info',
    title: '正在檢查可用功能',
    message: '完成後會自動更新。',
  },
  {
    id: 'success',
    title: '處理完成',
    message: '分離音軌已保存並可供播放。',
  },
  {
    id: 'warning',
    title: '需確認公開輸出內容',
    message: '開始輸出前，請確認本次使用的內容。',
  },
  {
    id: 'danger',
    title: '來源檔案無法讀取',
    message: '請確認檔案仍存在，再重新嘗試。',
  },
];

function noticeTone(tone = 'neutral') {
  if (props.layer.key === 'current' && tone === 'neutral') return 'muted';
  return tone;
}

function densityProps(density) {
  return props.layer.key === 'candidate'
    ? { density: density.id }
    : { compact: density.compact };
}

function ariaProps(kind) {
  if (props.layer.key === 'current') return {};
  if (kind === 'polite') {
    return { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' };
  }
  if (kind === 'urgent') return { role: 'alert' };
  return {};
}

function contractProps() {
  const structured = {
    severity: 'warning',
    title: '匯入尚未完成',
    message: '請確認來源可用後再試一次。',
    actionLabel: '查看說明',
  };
  return props.layer.key === 'current'
    ? { notice: structured }
    : {
        tone: 'warning',
        title: structured.title,
        message: structured.message,
        actionLabel: structured.actionLabel,
      };
}

function recordAction(label) {
  actionOutcome.value = `已選擇「${label}」。`;
}
</script>

<template>
  <div
    class="demo-notice-primitive"
    :class="`demo-notice-primitive--${layer.key}`"
  >
    <section class="demo-notice-block demo-notice-role">
      <header class="demo-notice-subsection__header">
        <h5>使用時機</h5>
        <p>
          UiNotice
          用於靠近相關內容的結構化訊息；依訊息與內容的關係、組成與顯示時間選用，不以顏色或使用數量判斷。結構化內容支持共用元件的責任；欄位說明、一般輔助文字與固定通知容器各自負責。
        </p>
      </header>

      <div class="demo-notice-role__grid">
        <article data-notice-role="inline-notice">
          <strong>內嵌通知</strong>
          <span>圖示、標題或說明，以及選用操作</span>
        </article>
        <article data-notice-role="field-support">
          <strong>欄位說明列</strong>
          <span>欄位與說明／錯誤之間的關聯由 UiField 負責</span>
        </article>
        <article data-notice-role="supporting-text">
          <strong>一般輔助文字</strong>
          <span>UiHint 目前保留為相容元件</span>
        </article>
        <article data-notice-role="modal">
          <strong>對話框</strong>
          <span>Modal 負責焦點保護與中斷流程</span>
        </article>
        <article data-notice-role="toast-banner">
          <strong>固定通知容器</strong>
          <span>負責位置、尺寸、佇列、關閉與顯示時間</span>
        </article>
      </div>
    </section>

    <section class="demo-notice-block demo-notice-density">
      <header class="demo-notice-subsection__header">
        <h5>尺寸與內容結構</h5>
        <p>
          內容包含裝飾性狀態圖示，標題或說明至少顯示一項，也可加入選用的情境操作；密度只改內距與操作高度下限，不縮小
          14px 文字。Candidate 重用已審查的 Status Icon：20px 狀態圖示與 14px
          首行置中對齊，圖示與文字間距固定為 8px。
        </p>
      </header>

      <div class="demo-notice-density-list">
        <article
          v-for="density in layer.densities"
          :key="density.id"
          class="demo-notice-density__item"
          :data-notice-density="density.id"
        >
          <h6>{{ density.label }}</h6>
          <div class="demo-notice-frame demo-notice-frame--narrow">
            <component
              :is="layer.component"
              v-bind="densityProps(density)"
              :tone="noticeTone('info')"
              title="正在檢查可用功能"
              message="完成後會自動更新。"
              action-label="查看"
            />
          </div>
        </article>
      </div>

      <div class="demo-notice-anatomy-list">
        <article
          v-for="item in ANATOMY_ITEMS"
          :key="item.id"
          :data-notice-anatomy="item.id"
        >
          <span class="demo-notice-item__label">{{ item.id }}</span>
          <div class="demo-notice-frame demo-notice-frame--narrow">
            <component
              :is="layer.component"
              :tone="noticeTone(item.tone)"
              :title="item.title"
              :message="item.message"
              :action-label="item.actionLabel"
              @action="recordAction(item.actionLabel)"
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-notice-block demo-notice-content">
      <header class="demo-notice-subsection__header">
        <h5>長內容與換行</h5>
        <p>
          長
          CJK／Latin／多語內容自然換行；沒有自然斷點的長文字由外層檢查框承接，不讓整個
          F8 畫面水平溢出。
        </p>
      </header>

      <div class="demo-notice-content-list">
        <article v-for="item in CONTENT_ITEMS" :key="item.id">
          <span class="demo-notice-item__label">{{ item.id }}</span>
          <div class="demo-notice-frame demo-notice-frame--narrow">
            <component
              :is="layer.component"
              :tone="noticeTone()"
              :title="item.title"
              :message="item.message"
              :data-notice-content="item.id"
              :lang="item.lang"
              :dir="item.dir"
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-notice-block demo-notice-tones">
      <header class="demo-notice-subsection__header">
        <h5>訊息類型</h5>
        <p>
          內容類型、格式與來源說明預設使用
          Neutral；狀態色只加速掃描，文字與圖示形狀仍保留完整語意。
        </p>
      </header>

      <div class="demo-notice-tone-list">
        <article v-for="item in TONE_ITEMS" :key="item.id">
          <span class="demo-notice-item__label">{{ item.id }}</span>
          <div class="demo-notice-frame">
            <component
              :is="layer.component"
              :tone="noticeTone(item.id)"
              :title="item.title"
              :message="item.message"
              :data-notice-tone="item.id"
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-notice-block demo-notice-actions">
      <header class="demo-notice-subsection__header">
        <h5>操作行為</h5>
        <p>
          元件只回報使用者按下操作；重試、前往其他畫面與處理中狀態由整合畫面負責。內嵌位置由所在畫面決定；固定位置、堆疊、關閉與顯示時間由通知容器負責。
        </p>
      </header>

      <div class="demo-notice-action-list">
        <article>
          <div class="demo-notice-frame demo-notice-frame--narrow">
            <component
              :is="layer.component"
              :tone="noticeTone('danger')"
              title="來源檔案無法讀取"
              message="確認檔案仍存在後再重試。"
              action-label="重試讀取"
              data-notice-action="retry"
              @action="recordAction('重試讀取')"
            />
          </div>
        </article>
        <article>
          <div class="demo-notice-frame demo-notice-frame--narrow">
            <component
              :is="layer.component"
              v-bind="contractProps()"
              data-notice-action="details"
              @action="recordAction('查看說明')"
            />
          </div>
        </article>
      </div>
      <p
        v-if="actionOutcome"
        class="demo-notice-action__outcome"
        role="status"
        aria-live="polite"
      >
        {{ actionOutcome }}
      </p>
    </section>

    <section class="demo-notice-block demo-notice-contract">
      <header class="demo-notice-subsection__header">
        <h5>輔助技術與公開介面</h5>
        <p>
          候選版的訊息類型不決定宣告急迫性；現行版會自動將一般訊息設為
          status、失敗設為 alert，此處保留作比較。
        </p>
      </header>

      <div class="demo-notice-aria-list">
        <article data-notice-aria="static">
          <strong>靜態內容</strong>
          <div class="demo-notice-frame">
            <component
              :is="layer.component"
              :tone="noticeTone()"
              title="本機內容"
              message="靜態內容不需要重新宣告。"
            />
          </div>
        </article>
        <article data-notice-aria="polite">
          <strong>非緊急狀態更新</strong>
          <div class="demo-notice-frame">
            <component
              :is="layer.component"
              v-bind="ariaProps('polite')"
              :tone="noticeTone('info')"
              title="檢查完成"
              message="需要的功能已可使用。"
            />
          </div>
        </article>
        <article data-notice-aria="urgent">
          <strong>需立即處理的失敗</strong>
          <div class="demo-notice-frame">
            <component
              :is="layer.component"
              v-bind="ariaProps('urgent')"
              :tone="noticeTone('danger')"
              title="播放已中止"
              message="請重新選擇可讀取的檔案。"
            />
          </div>
        </article>
        <article data-notice-aria="language">
          <strong>語言與文字方向</strong>
          <div class="demo-notice-frame">
            <component
              :is="layer.component"
              :tone="noticeTone()"
              title="ローカル情報"
              message="この内容は端末内に保存されます。"
              lang="ja"
              dir="auto"
            />
          </div>
        </article>
      </div>

      <dl class="demo-notice-contract-list">
        <div>
          <dt>title／message</dt>
          <dd>由使用畫面提供的標題與說明</dd>
        </div>
        <div>
          <dt>actionLabel＋action</dt>
          <dd>選用的情境操作</dd>
        </div>
        <div>
          <dt>attrs</dt>
          <dd>原生屬性套用到外層</dd>
        </div>
        <div>
          <dt>notice object</dt>
          <dd>現行錯誤訊息相容格式</dd>
        </div>
        <div>
          <dt>不包含</dt>
          <dd>不加入驗證、權限或特定功能屬性</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.demo-notice-primitive,
.demo-notice-block,
.demo-notice-density-list,
.demo-notice-anatomy-list,
.demo-notice-content-list,
.demo-notice-tone-list,
.demo-notice-action-list,
.demo-notice-aria-list {
  min-width: 0;
  display: grid;
}

.demo-notice-primitive {
  gap: var(--ui-space-6);
}

.demo-notice-block {
  gap: var(--ui-space-3);
}

.demo-notice-subsection__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
  padding-block-end: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-notice-subsection__header h5,
.demo-notice-subsection__header p,
.demo-notice-density__item h6,
.demo-notice-action__outcome,
.demo-notice-contract-list,
.demo-notice-contract-list dt,
.demo-notice-contract-list dd {
  margin: 0;
}

.demo-notice-subsection__header h5,
.demo-notice-density__item h6,
.demo-notice-role__grid strong,
.demo-notice-aria-list strong,
.demo-notice-contract-list dt {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-notice-subsection__header p,
.demo-notice-role__grid span,
.demo-notice-action__outcome,
.demo-notice-contract-list dd {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-notice-role__grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
}

.demo-notice-role__grid article,
.demo-notice-density__item,
.demo-notice-anatomy-list article,
.demo-notice-content-list article,
.demo-notice-tone-list article,
.demo-notice-action-list article,
.demo-notice-aria-list article {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
}

.demo-notice-density-list,
.demo-notice-anatomy-list,
.demo-notice-content-list,
.demo-notice-tone-list,
.demo-notice-action-list,
.demo-notice-aria-list {
  grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
  gap: var(--ui-space-4);
}

.demo-notice-item__label {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-notice-frame {
  min-width: 0;
  max-width: 100%;
  container-type: inline-size;
  overflow-x: auto;
}

.demo-notice-frame--narrow {
  width: min(20rem, 100%);
}

.demo-notice-contract-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
}

.demo-notice-contract-list div {
  min-width: 0;
}

.demo-notice-contract-list dt,
.demo-notice-contract-list dd {
  display: inline;
}

.demo-notice-contract-list dt::after {
  content: ' · ';
  color: var(--ui-color-text-subtle);
}

@container (max-width: 48rem) {
  .demo-notice-subsection__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>
