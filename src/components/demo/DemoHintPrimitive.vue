<script setup>
import UiScrollRegion from '../ui/UiScrollRegion.vue';

defineProps({
  layer: { type: Object, required: true },
});

const CONTENT_ITEMS = [
  {
    id: 'short-cjk',
    label: '這個設定只影響目前工作區。',
    tone: 'muted',
  },
  {
    id: 'long-cjk',
    label:
      '這段較長的繁體中文輔助文字用來確認窄欄時能自然換行，並維持清楚的閱讀順序。',
    tone: 'muted',
  },
  {
    id: 'long-latin',
    label:
      'This supporting sentence stays readable when the available panel width becomes narrow.',
    tone: 'muted',
    lang: 'en',
  },
  {
    id: 'multilingual',
    label: '繁體中文、日本語、한국어 and English 都應在窄內容中保持可讀。',
    tone: 'muted',
    dir: 'auto',
  },
  {
    id: 'unbroken',
    label: 'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    tone: 'text',
    lang: 'en',
  },
];

const TONE_ITEMS = [
  { id: 'muted', label: '歌曲資料保存在這台裝置。' },
  { id: 'text', label: '可使用方向鍵切換選項。' },
  { id: 'info', label: '正在檢查可用功能。' },
  { id: 'success', label: '歌曲資料已儲存。' },
  { id: 'warning', label: '部分選用資訊尚未填寫。' },
  { id: 'danger', label: '來源 Magnitude.wav 目前無法讀取。' },
  { id: 'gated', label: '公開輸出尚未開啟。' },
];
</script>

<template>
  <div class="demo-hint-primitive" :class="`demo-hint-primitive--${layer.key}`">
    <section class="demo-hint-block demo-hint-role">
      <header class="demo-hint-subsection__header">
        <h5>使用時機</h5>
        <p>
          UiHint
          目前保留為相容元件。跨功能使用只證明輔助文字樣式可共用，不能單獨證明未來仍需要獨立
          Vue 元件；正式遷移前仍要比較共用文字樣式與各功能自行組合。
        </p>
      </header>

      <div class="demo-hint-role__grid">
        <article data-hint-role="standalone">
          <strong>獨立輔助文字</strong>
          <component :is="layer.component" tone="muted">
            此段落僅供預覽，不會變更歌曲資料。
          </component>
          <span>只呈現補充說明；是否保留獨立元件仍待後續審查</span>
        </article>
        <article data-hint-role="field">
          <strong>欄位驗證訊息</strong>
          <span>
            Zod／validator issue 先由表單轉成可顯示的在地化訊息；invalid／error
            與欄位關聯由 UiField 負責
          </span>
        </article>
        <article data-hint-role="notice">
          <strong>結構化通知</strong>
          <span>圖示、標題與操作訊息由 UiNotice 負責</span>
        </article>
        <article data-hint-role="excluded">
          <strong>責任範圍</strong>
          <span>不負責欄位說明、結構化通知或空狀態版面</span>
        </article>
      </div>
    </section>

    <section class="demo-hint-block demo-hint-density">
      <header class="demo-hint-subsection__header">
        <h5>文字尺寸</h5>
        <p>
          Caption 維持 14px／1.4；Standard 與 Compact 不改文字尺寸，也不建立
          control height。密度只影響外層排版。
        </p>
      </header>

      <div class="demo-hint-density-list">
        <article
          v-for="density in layer.densities"
          :key="density[0]"
          class="demo-hint-density__item"
          :data-hint-density="density[0]"
        >
          <h6>{{ density[1] }}</h6>
          <component :is="layer.component" tone="muted">
            可自然換行的非互動輔助文字。
          </component>
        </article>
      </div>
    </section>

    <section class="demo-hint-block demo-hint-anatomy">
      <header class="demo-hint-subsection__header">
        <h5>內容結構</h5>
        <p>
          只包含原生段落與可見文字；圖示、操作、標題組合、背景與位置不屬於輔助文字本身。
        </p>
      </header>

      <div class="demo-hint-anatomy-list">
        <article data-hint-anatomy="paragraph">
          <span>原生段落</span>
          <component :is="layer.component" tone="muted">
            本機資料會保留在目前裝置。
          </component>
        </article>
        <article data-hint-anatomy="slot">
          <span>可見內容</span>
          <component :is="layer.component" tone="text">
            可使用方向鍵切換選項。
          </component>
        </article>
      </div>
    </section>

    <section class="demo-hint-block demo-hint-content">
      <header class="demo-hint-subsection__header">
        <h5>長內容與換行</h5>
        <p>
          一般
          CJK／Latin／多語句子自然換行；沒有自然斷點的長文字仍應留在外層檢查框內。
        </p>
      </header>

      <div class="demo-hint-content-list">
        <article
          v-for="item in CONTENT_ITEMS"
          :key="item.id"
          class="demo-hint-content__item"
        >
          <span class="demo-hint-item__label">{{ item.id }}</span>
          <UiScrollRegion class="demo-hint-content__frame" axis="horizontal">
            <component
              :is="layer.component"
              :tone="item.tone"
              :data-hint-content="item.id"
              :lang="item.lang"
              :dir="item.dir"
            >
              {{ item.label }}
            </component>
          </UiScrollRegion>
        </article>
      </div>
    </section>

    <section class="demo-hint-block demo-hint-tones">
      <header class="demo-hint-subsection__header">
        <h5>訊息類型</h5>
        <p>
          UiHint 不加入固定的「類型：」前綴。內容類型、格式與來源說明預設使用
          Neutral；若 Current
          相容色仍被使用，句子本身說明狀態，顏色只輔助掃描。需要標題、圖示或操作時使用
          UiNotice。
        </p>
      </header>

      <div class="demo-hint-tone-list">
        <article v-for="item in TONE_ITEMS" :key="item.id">
          <span class="demo-hint-item__label">{{ item.id }}</span>
          <component
            :is="layer.component"
            :tone="item.id"
            :data-hint-tone="item.id"
          >
            {{ item.label }}
          </component>
        </article>
      </div>
    </section>

    <section class="demo-hint-block demo-hint-recipes">
      <header class="demo-hint-subsection__header">
        <h5>使用情境</h5>
        <p>
          元件只負責文字。內距、對齊、可用寬度、空狀態位置與即時宣告時機由使用畫面決定。
        </p>
      </header>

      <div class="demo-hint-recipe-list">
        <article data-hint-recipe="inline-support">
          <strong>音訊來源</strong>
          <component :is="layer.component" tone="muted">
            僅顯示目前裝置可讀取的本機檔案。
          </component>
          <span>外層畫面決定內距、對齊與可用寬度</span>
        </article>
        <article data-hint-recipe="selection-prompt">
          <strong>歌詞文件</strong>
          <component :is="layer.component" tone="text">
            請先選擇一首曲目。
          </component>
          <span>外層畫面決定選取狀態與位置</span>
        </article>
        <article
          :class="{
            'demo-hint-recipe--empty-state': layer.key === 'candidate',
          }"
          data-hint-recipe="empty-state"
        >
          <component
            :is="layer.component"
            v-bind="
              layer.key === 'current' ? { padded: true, center: true } : {}
            "
            tone="muted"
          >
            目前沒有符合條件的曲目。
          </component>
          <span>外層畫面決定空狀態的位置</span>
        </article>
        <article data-hint-recipe="live-status">
          <component
            :is="layer.component"
            tone="info"
            role="status"
            aria-live="polite"
          >
            正在檢查可用功能。
          </component>
          <span>訊息來源決定更新與宣告時機</span>
        </article>
      </div>
    </section>

    <section class="demo-hint-block demo-hint-contract">
      <header class="demo-hint-subsection__header">
        <h5>輔助技術與公開介面</h5>
        <p>
          靜態文字保留段落語意；只有掌握更新時機的畫面才加入即時宣告。訊息顏色不自行建立警示，語言與文字方向沿用原生屬性。
        </p>
      </header>

      <div class="demo-hint-aria-list">
        <article>
          <span>靜態段落</span>
          <component :is="layer.component" data-hint-aria="static" tone="muted">
            此設定只影響目前工作區。
          </component>
        </article>
        <article>
          <span>非緊急狀態更新</span>
          <component
            :is="layer.component"
            data-hint-aria="live"
            tone="info"
            role="status"
            aria-live="polite"
          >
            需要的功能已可使用。
          </component>
        </article>
        <article>
          <span>語言與文字方向</span>
          <component
            :is="layer.component"
            data-hint-aria="language"
            tone="muted"
            lang="ja"
            dir="auto"
          >
            日本語と繁體中文を同じ段落で確認します。
          </component>
        </article>
        <article>
          <span>狀態色不自動建立警示</span>
          <component
            :is="layer.component"
            data-hint-aria="tone-only"
            tone="danger"
          >
            來源 Magnitude.wav 目前無法讀取。
          </component>
        </article>
      </div>

      <div class="demo-hint-contracts" aria-label="UiHint public contract">
        <span>原生段落 · 可見文字同時是無障礙內容</span>
        <span>訊息來源決定更新時機與 role=status／aria-live</span>
        <span>訊息類型不自行建立 role=alert</span>
        <span>tone · 7 個相容值</span>
        <span>預設插槽 · 可見的輔助文字</span>
        <span>原生屬性會套用到段落</span>
        <span>padded／center · 僅保留現行版面相容性</span>
        <span>不包含圖示、操作、欄位關聯或即時宣告</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-hint-primitive,
.demo-hint-block,
.demo-hint-subsection__header,
.demo-hint-role__grid article,
.demo-hint-density__item,
.demo-hint-anatomy-list article,
.demo-hint-content__item,
.demo-hint-tone-list article,
.demo-hint-recipe-list article,
.demo-hint-aria-list article {
  min-width: 0;
  display: grid;
}

.demo-hint-primitive {
  gap: var(--ui-space-6);
}

.demo-hint-block {
  gap: var(--ui-space-3);
}

.demo-hint-block + .demo-hint-block {
  padding-block-start: var(--ui-space-5);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-hint-subsection__header {
  grid-template-columns: minmax(9rem, 0.3fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-hint-subsection__header h5,
.demo-hint-subsection__header p,
.demo-hint-density__item h6,
.demo-hint-role__grid span,
.demo-hint-recipe-list article > span,
.demo-hint-aria-list article > span {
  margin: 0;
}

.demo-hint-subsection__header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-title);
}

.demo-hint-subsection__header p,
.demo-hint-density__item h6,
.demo-hint-role__grid span,
.demo-hint-item__label,
.demo-hint-anatomy-list article > span,
.demo-hint-recipe-list article > span,
.demo-hint-aria-list article > span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-hint-role__grid,
.demo-hint-density-list,
.demo-hint-anatomy-list,
.demo-hint-content-list,
.demo-hint-tone-list,
.demo-hint-recipe-list,
.demo-hint-aria-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-hint-role__grid article,
.demo-hint-density__item,
.demo-hint-anatomy-list article,
.demo-hint-content__item,
.demo-hint-tone-list article,
.demo-hint-recipe-list article,
.demo-hint-aria-list article {
  align-content: start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: color-mix(
    in srgb,
    var(--ui-color-surface-raised) 76%,
    transparent
  );
}

.demo-hint-role__grid strong,
.demo-hint-recipe-list strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-hint-content__frame {
  min-width: 0;
  width: min(18rem, 100%);
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
}

.demo-hint-recipe--empty-state {
  padding: var(--ui-space-4);
  text-align: center;
}

.demo-hint-contracts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-hint-contracts span {
  padding: var(--ui-space-1) var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

@container (max-width: 44rem) {
  .demo-hint-subsection__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>
