<script setup>
import DemoModalLayer from './DemoModalLayer.vue';
import DemoModalProduction from './DemoModalProduction.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const PROPOSAL = Object.freeze({ key: 'candidate' });
</script>

<template>
  <div class="demo-specimens" data-modal-source="production">
    <p class="demo-specimens__copy">
      正式 UiModal：關閉限制與焦點恢復；內容由使用畫面組成。
    </p>

    <section class="demo-specimens__section">
      <h4>關閉、焦點與尺寸</h4>
      <DemoModalProduction />
    </section>

    <DemoProposalSpecimen
      note="Small／Medium／Large 中性 shell，固定標題與操作列，只有內容區捲動；內容案例不綁定尺寸。owner 保留現行 default／notice／wide 與整面捲動。"
    >
      <DemoModalLayer :layer="PROPOSAL" />
    </DemoProposalSpecimen>
  </div>
</template>
