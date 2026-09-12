<script setup>
defineProps({
  layer: { type: Object, required: true },
});

const CONTENT_ITEMS = [
  { id: 'short-cjk', text: '短曲名不移動' },
  {
    id: 'long-cjk',
    text: '這是一段需要在狹窄列中查看的完整繁體中文曲目名稱',
  },
  {
    id: 'long-latin',
    text: 'A Very Long Song Title for the Summer Live Session Review',
    lang: 'en',
  },
  {
    id: 'multilingual',
    text: '繁體中文、日本語、한국어 and English 曲目名稱',
  },
  {
    id: 'unbroken',
    text: 'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    lang: 'en',
  },
  {
    id: 'rtl',
    text: 'هذا عنوان طويل لمقطع موسيقي لمراجعة اتجاه القراءة',
    lang: 'ar',
    dir: 'rtl',
  },
];
</script>

<template>
  <div
    class="demo-marquee-primitive"
    :class="`demo-marquee-primitive--${layer.key}`"
  >
    <section class="demo-marquee-block demo-marquee-role">
      <header class="demo-marquee-subsection__header">
        <h5>使用時機</h5>
        <p v-if="layer.key === 'candidate'">
          只有過長的單行文字才需要移動；指向文字或聚焦所在操作時顯示完整內容。
        </p>
        <p v-else>
          過長的單行文字會自動往返移動；短文字保持靜態，兩者都保留完整內容提示。
        </p>
      </header>

      <div class="demo-marquee-role__grid">
        <article data-marquee-role="single-line">
          <strong>單行曲目名稱</strong>
          <span>可用寬度不足時才啟動，短文字保持靜態</span>
        </article>
        <article data-marquee-role="wrapping-copy">
          <strong>多行說明</strong>
          <span>應自然換行，不用跑馬燈取代閱讀</span>
        </article>
        <article data-marquee-role="controls">
          <strong>一般操作標籤</strong>
          <span>使用簡潔且穩定的文字，過長時應先修改文案</span>
        </article>
        <article data-marquee-role="updates">
          <strong>狀態更新</strong>
          <span>由所在畫面決定如何告知，不靠移動表示變化</span>
        </article>
      </div>
      <p class="demo-marquee-role__boundary">
        不用於段落、一般操作標籤或持續狀態更新。
      </p>
    </section>

    <section class="demo-marquee-block demo-marquee-geometry">
      <header class="demo-marquee-subsection__header">
        <h5>容器與文字</h5>
        <p>
          所在區域決定可用寬度與文字樣式；Standard／Compact
          不改變跑馬燈本身的高度或字級。
        </p>
      </header>

      <div class="demo-marquee-density-list">
        <article
          v-for="density in layer.densities"
          :key="density[0]"
          class="demo-marquee-density__item"
          :class="`demo-marquee-density__item--${density[0]}`"
          :data-marquee-density="density[0]"
        >
          <span class="demo-marquee-item__label">{{ density[1] }}</span>
          <div class="demo-marquee-frame">
            <component
              :is="layer.component"
              text="這是一段放在有限欄寬內的曲目名稱 — Long title"
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-marquee-block demo-marquee-content">
      <header class="demo-marquee-subsection__header">
        <h5>內容與方向</h5>
        <p>
          短內容保持靜態；長
          CJK／Latin／多語、無斷點檔名與由右至左文字都留在同一列內。
        </p>
      </header>

      <div class="demo-marquee-content-list">
        <article v-for="item in CONTENT_ITEMS" :key="item.id">
          <span class="demo-marquee-item__label">{{ item.id }}</span>
          <div class="demo-marquee-frame">
            <component
              :is="layer.component"
              :data-marquee-content="item.id"
              :text="item.text"
              :lang="item.lang"
              :dir="item.dir"
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-marquee-block demo-marquee-reading">
      <header class="demo-marquee-subsection__header">
        <h5>閱讀與操作</h5>
        <p v-if="layer.key === 'candidate'">
          Candidate
          只在指向或聚焦所在操作時移動一次；到達末端後停留，離開後回到開頭，再次進入會重新播放。按住文字時暫停，方便選取。
        </p>
        <p v-else>
          Current
          會持續往返；指向文字或聚焦所在操作不會暫停，減少動態時回到靜態省略。
        </p>
      </header>

      <div class="demo-marquee-recipe-list">
        <article data-marquee-recipe="motion-preview">
          <span class="demo-marquee-item__label">動畫預覽</span>
          <span
            v-if="layer.key === 'candidate'"
            class="demo-marquee-preview__cue"
          >
            將游標移到曲名上即可預覽
          </span>
          <span v-else class="demo-marquee-preview__cue">
            過長曲名會自動往返
          </span>
          <div class="demo-marquee-frame demo-marquee-frame--motion-preview">
            <component
              :is="layer.component"
              data-marquee-motion-preview
              text="今晚演出的完整曲目名稱 — Summer Live Extended Version"
            />
          </div>
        </article>
        <article data-marquee-recipe="selectable">
          <span class="demo-marquee-item__label">可選取的資料</span>
          <div class="demo-marquee-frame" data-marquee-copy="selectable">
            <component
              :is="layer.component"
              text="使用者的完整歌曲標題可以選取與複製"
            />
          </div>
        </article>
        <article data-marquee-recipe="focus-owner">
          <span class="demo-marquee-item__label">可聚焦的文字操作</span>
          <button type="button" data-marquee-focus-owner>
            <component
              :is="layer.component"
              text="查看曲目：這是一段長曲名操作標籤"
            />
          </button>
        </article>
        <article data-marquee-recipe="rtl-focus-owner">
          <span class="demo-marquee-item__label">由右至左的文字操作</span>
          <button type="button" data-marquee-focus-owner dir="rtl" lang="ar">
            <component
              :is="layer.component"
              dir="rtl"
              lang="ar"
              text="فتح المقطع الموسيقي ذي العنوان الطويل للمراجعة"
            />
          </button>
        </article>
        <article data-marquee-recipe="motion-preference">
          <span class="demo-marquee-item__label">減少動態</span>
          <div class="demo-marquee-frame">
            <component
              :is="layer.component"
              text="保留單行省略與完整內容提示，不強制移動"
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-marquee-block demo-marquee-contract">
      <header class="demo-marquee-subsection__header">
        <h5>輔助技術與公開介面</h5>
        <p>
          可見文字本身就是完整內容；過長時再加入完整值提示。所在畫面負責按鈕、焦點與狀態宣告。
        </p>
      </header>

      <div
        class="demo-marquee-contracts"
        aria-label="UiMarqueeText public contract"
      >
        <span>text · String 或 Number</span>
        <span>原生屬性套用到外層</span>
        <span v-if="layer.key === 'candidate'">溢位時提供完整內容</span>
        <span v-else>所有文字保留完整內容提示</span>
        <span>所在區域擁有寬度與操作語意</span>
        <span>不新增速度、狀態、字級或宣告屬性</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-marquee-primitive,
.demo-marquee-block,
.demo-marquee-role__grid article,
.demo-marquee-density__item,
.demo-marquee-content-list article,
.demo-marquee-recipe-list article {
  min-width: 0;
  display: grid;
}

.demo-marquee-primitive {
  gap: var(--ui-space-6);
}

.demo-marquee-block {
  gap: var(--ui-space-3);
}

.demo-marquee-block + .demo-marquee-block {
  padding-block-start: var(--ui-space-5);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-marquee-subsection__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(9rem, 0.3fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-marquee-subsection__header h5,
.demo-marquee-subsection__header p,
.demo-marquee-role__boundary {
  margin: 0;
}

.demo-marquee-subsection__header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-title);
}

.demo-marquee-subsection__header p,
.demo-marquee-role__grid span,
.demo-marquee-role__boundary,
.demo-marquee-item__label,
.demo-marquee-preview__cue {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-marquee-role__grid,
.demo-marquee-density-list,
.demo-marquee-content-list,
.demo-marquee-recipe-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--ui-space-3);
}

.demo-marquee-role__grid article,
.demo-marquee-density__item,
.demo-marquee-content-list article,
.demo-marquee-recipe-list article {
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

.demo-marquee-role__grid strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-marquee-density__item--standard .demo-marquee-frame {
  padding: var(--ui-space-3);
}

.demo-marquee-density__item--compact .demo-marquee-frame,
.demo-marquee-density__item--active .demo-marquee-frame {
  padding: var(--ui-space-2);
}

.demo-marquee-frame,
[data-marquee-focus-owner] {
  box-sizing: border-box;
  min-width: 0;
  width: min(14rem, 100%);
  overflow: hidden;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-marquee-content-list .demo-marquee-frame {
  overflow-x: auto;
  padding: var(--ui-space-2);
}

.demo-marquee-frame--motion-preview {
  width: min(11rem, 100%);
  padding: var(--ui-space-2);
}

[data-marquee-focus-owner] {
  min-height: var(--ui-control-height-compact, 2rem);
  display: block;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  text-align: start;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

[data-marquee-focus-owner]:hover {
  background: var(--ui-color-surface-hover);
}

[data-marquee-focus-owner]:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-marquee-contracts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-marquee-contracts span {
  padding: var(--ui-space-1) var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

@container (max-width: 44rem) {
  .demo-marquee-subsection__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}
</style>
