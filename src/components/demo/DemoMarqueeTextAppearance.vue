<script setup>
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import DemoCandidateMarqueeText from './DemoCandidateMarqueeText.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const CONTENT = [
  { id: 'short-cjk', text: '短曲名不移動' },
  { id: 'long-cjk', text: '這是一段需要在狹窄列中查看的完整繁體中文曲目名稱' },
  {
    id: 'long-latin',
    text: 'A Very Long Song Title for the Summer Live Session Review',
    lang: 'en',
  },
  { id: 'multilingual', text: '繁體中文、日本語、한국어 and English 曲目名稱' },
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

const CONTRACT = [
  'text · String 或 Number',
  'tooltipEnabled · 預設顯示完整內容提示',
  '原生屬性套用到外層',
  '所在區域擁有寬度與操作語意',
  '不新增速度、狀態、字級或宣告屬性',
];
</script>

<template>
  <div class="demo-specimens" data-marquee-source="production">
    <p class="demo-specimens__copy">
      只用於單行曲目名稱：溢位時自動往返移動，短文字保持靜態；段落與操作標籤應換行或修改文案。
    </p>

    <section class="demo-specimens__section">
      <h4>內容與方向</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="item in CONTENT"
          :key="item.id"
          class="demo-specimens__case"
        >
          <h5>{{ item.id }}</h5>
          <div class="demo-marquee__frame">
            <UiMarqueeText
              :text="item.text"
              :lang="item.lang"
              :dir="item.dir"
              :data-marquee-content="item.id"
            />
          </div>
        </article>
      </div>
    </section>

    <DemoProposalSpecimen
      note="只在指向或聚焦時揭露一次、停在末端，離開後回到開頭；按住時暫停以便選取，並支援由右至左。owner 保留現行自動往返。"
    >
      <div class="demo-marquee__frame" data-marquee-copy="selectable">
        <DemoCandidateMarqueeText
          text="今晚演出的完整曲目名稱 — Summer Live Extended Version"
        />
      </div>
      <button
        type="button"
        class="demo-marquee__focus-owner"
        data-marquee-focus-owner
        data-marquee-recipe="focus-owner"
      >
        <DemoCandidateMarqueeText text="查看曲目：這是一段長曲名操作標籤" />
      </button>
      <button
        type="button"
        class="demo-marquee__focus-owner"
        data-marquee-focus-owner
        data-marquee-recipe="rtl-focus-owner"
        dir="rtl"
        lang="ar"
      >
        <DemoCandidateMarqueeText
          dir="rtl"
          lang="ar"
          text="فتح المقطع الموسيقي ذي العنوان الطويل للمراجعة"
        />
      </button>
    </DemoProposalSpecimen>

    <ul
      class="demo-specimens__contract"
      aria-label="UiMarqueeText public contract"
    >
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-marquee__frame {
  min-width: 0;
  width: min(11rem, 100%);
}

/* Focus owner fixture for the proposal's focus-triggered reveal. */
[data-marquee-focus-owner] {
  box-sizing: border-box;
  min-width: 0;
  width: min(14rem, 100%);
  min-height: var(--ui-control-height);
  display: block;
  overflow: hidden;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
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
</style>
