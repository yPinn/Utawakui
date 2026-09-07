<script setup>
import UiSelect from '../ui/UiSelect.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiTextField from '../ui/UiTextField.vue';

const FLOW_STEPS = [
  {
    eyebrow: 'Source',
    title: 'Required／Schema／main response',
    note: '只產生可判斷的 issue。',
  },
  {
    eyebrow: 'Owner',
    title: 'Form controller',
    note: '決定 blur、submit 與顯示時機。',
  },
  {
    eyebrow: 'Mapping',
    title: 'invalid＋localized error',
    note: '移除 path 與技術細節。',
  },
  {
    eyebrow: 'Render',
    title: 'UiField support region',
    note: '統一邊界、訊息與 ARIA。',
  },
];

const SELECT_OPTIONS = [
  { value: '', label: '請選擇輸出裝置', disabled: true },
  { value: 'obs', label: 'OBS Browser Source' },
  { value: 'local', label: '本機預覽' },
];
</script>

<template>
  <article
    class="demo-field-validation"
    data-field-validation-review="true"
    aria-labelledby="demo-field-validation-title"
  >
    <header class="demo-field-validation__header">
      <div>
        <p class="demo-field-validation__phase">Field · validation feedback</p>
        <h4 id="demo-field-validation-title">驗證訊息與版面空間</h4>
      </div>
      <p>
        Zod 僅是可能的上游來源；UI 不認
        schema。先核定顯示責任、觸發時機與支援區空間，再決定是否納入正式元件
        API。
      </p>
    </header>

    <section
      class="demo-validation-layer demo-validation-layer--candidate"
      data-validation-source="candidate"
      aria-labelledby="demo-validation-candidate-title"
    >
      <header class="demo-validation-layer__header">
        <div>
          <span>Token v2 candidate</span>
          <h5 id="demo-validation-candidate-title">候選驗證契約</h5>
        </div>
        <p>
          Auto 為預設；Reserved 是父層候選策略。兩者只改版面節奏，不改驗證語意。
        </p>
      </header>

      <section class="demo-validation-block">
        <header class="demo-validation-block__header">
          <h6>責任流</h6>
          <p>驗證引擎輸出 issue；controller 決定何時、用什麼人話呈現。</p>
        </header>
        <ol class="demo-validation-flow" aria-label="驗證責任流">
          <li
            v-for="(step, index) in FLOW_STEPS"
            :key="step.eyebrow"
            class="demo-validation-flow__step"
          >
            <span>{{ step.eyebrow }}</span>
            <strong>{{ step.title }}</strong>
            <small>{{ step.note }}</small>
            <b v-if="index < FLOW_STEPS.length - 1" aria-hidden="true">→</b>
          </li>
        </ol>
      </section>

      <section class="demo-validation-block">
        <header class="demo-validation-block__header">
          <h6>必填欄位的顯示時機</h6>
          <p>初次看到空欄位不報錯；blur 或 submit 後才顯示，修正後立即移除。</p>
        </header>
        <div class="demo-validation-timing">
          <article data-validation-timing="pristine">
            <div class="demo-validation-state-label">
              <span>01</span>
              <strong>Pristine required</strong>
              <small>尚未互動</small>
            </div>
            <UiTextField
              id="demo-validation-pristine"
              label="曲目名稱"
              placeholder="輸入曲目名稱"
              required
            />
          </article>
          <article data-validation-timing="invalid">
            <div class="demo-validation-state-label">
              <span>02</span>
              <strong>Blur／Submit</strong>
              <small>顯示第一個可行動問題</small>
            </div>
            <UiTextField
              id="demo-validation-invalid"
              label="曲目名稱"
              placeholder="輸入曲目名稱"
              error="請輸入曲目名稱。"
              required
            />
          </article>
          <article data-validation-timing="corrected">
            <div class="demo-validation-state-label">
              <span>03</span>
              <strong>Corrected</strong>
              <small>恢復一般狀態，不常駐成功訊息</small>
            </div>
            <UiTextField
              id="demo-validation-corrected"
              label="曲目名稱"
              model-value="雨愛"
              required
            />
          </article>
        </div>
      </section>

      <section class="demo-validation-block">
        <header class="demo-validation-block__header">
          <h6>Hint → Error 單一訊息槽</h6>
          <p>Error 出現時取代 Hint，不同時堆疊；控制項只連到目前可見的訊息。</p>
        </header>
        <div
          class="demo-validation-replacement"
          aria-label="Hint 被 Error 取代"
        >
          <article>
            <span>Before validation</span>
            <UiTextField
              id="demo-validation-replace-hint"
              label="曲目名稱"
              model-value="雨愛"
              hint="使用本機曲目的顯示名稱。"
            />
          </article>
          <div class="demo-validation-replacement__arrow" aria-hidden="true">
            <span>validate</span>
            <b>→</b>
          </div>
          <article>
            <span>After validation</span>
            <UiTextField
              id="demo-validation-replace-error"
              label="曲目名稱"
              model-value="   "
              hint="使用本機曲目的顯示名稱。"
              error="名稱不可只包含空白。"
            />
          </article>
        </div>
      </section>

      <section class="demo-validation-block">
        <header class="demo-validation-block__header">
          <h6>訊息空間策略</h6>
          <p>
            Reserved
            只預留一行；訊息更長時仍由內容撐高，不截斷、不鎖定整體欄位高度。
          </p>
        </header>
        <div class="demo-validation-space-grid">
          <article class="demo-validation-space" data-validation-space="auto">
            <header>
              <strong>Auto</strong>
              <span>Default · DOM-driven</span>
            </header>
            <p>密集表單預設；無訊息時不留下空白。</p>
            <div class="demo-validation-space__samples">
              <div class="demo-validation-auto-frame">
                <UiTextField
                  id="demo-validation-auto-idle"
                  label="未驗證"
                  model-value="雨愛"
                />
              </div>
              <div class="demo-validation-auto-frame">
                <UiTextField
                  id="demo-validation-auto-error"
                  label="驗證失敗"
                  error="請輸入曲目名稱。"
                />
              </div>
            </div>
          </article>

          <article
            class="demo-validation-space"
            data-validation-space="reserved"
          >
            <header>
              <strong>Reserved</strong>
              <span>Layout candidate · 1 line minimum</span>
            </header>
            <p>同列欄位需要對齊時，由父層預留支援列。</p>
            <div class="demo-validation-space__samples">
              <div class="demo-validation-reserved-frame">
                <UiTextField
                  id="demo-validation-reserved-idle"
                  label="未驗證"
                  model-value="雨愛"
                />
              </div>
              <div class="demo-validation-reserved-frame has-message">
                <UiTextField
                  id="demo-validation-reserved-error"
                  label="驗證失敗"
                  error="請輸入曲目名稱。"
                />
              </div>
            </div>
          </article>
        </div>
        <div class="demo-validation-long-message">
          <span>Long message · grows beyond reserved line</span>
          <UiTextField
            id="demo-validation-long-error"
            label="曲目顯示名稱"
            model-value="C:\Users\operator\Music\release\song.wav"
            error="請縮短曲目顯示名稱，並移除檔案路徑、網址或其他不應直接顯示給操作員的技術資訊。"
          />
        </div>
      </section>

      <section class="demo-validation-block">
        <header class="demo-validation-block__header">
          <h6>Field family 覆蓋</h6>
          <p>
            Text Field、Textarea、Select 共用 Danger 邊界、Error
            字色、訊息位置與 ARIA 關係。
          </p>
        </header>
        <div class="demo-validation-family">
          <UiTextField
            id="demo-validation-family-text"
            label="曲目名稱"
            error="請輸入曲目名稱。"
            required
          />
          <UiTextarea
            id="demo-validation-family-textarea"
            label="備註"
            model-value="舞台左側"
            error="備註不可超過可安全顯示的長度，請保留操作員真正需要的內容。"
            :rows="2"
          />
          <UiSelect
            id="demo-validation-family-select"
            label="輸出裝置"
            model-value=""
            :options="SELECT_OPTIONS"
            error="請選擇輸出裝置。"
            required
          />
        </div>
      </section>
    </section>

    <section
      class="demo-validation-layer demo-validation-layer--current"
      data-validation-source="current"
      aria-labelledby="demo-validation-current-title"
    >
      <header class="demo-validation-layer__header">
        <div>
          <span>Current implementation</span>
          <h5 id="demo-validation-current-title">現行行為邊界</h5>
        </div>
        <p>
          現行僅有 Auto；元件已處理 Error 優先、Danger
          邊界與描述關聯，但不擁有驗證時機或訊息轉譯。
        </p>
      </header>
      <div class="demo-validation-current-flow" aria-label="現行欄位回饋行為">
        <div>
          <span>Caller props</span>
          <strong>hint／error／invalid</strong>
          <small>任何字串會原樣進入元件</small>
        </div>
        <b aria-hidden="true">→</b>
        <div>
          <span>UiField rule</span>
          <strong>Error wins</strong>
          <small>有 error 就不渲染 hint</small>
        </div>
        <b aria-hidden="true">→</b>
        <div>
          <span>DOM result</span>
          <strong>0 or 1 support row</strong>
          <small>訊息出現才參與版面流</small>
        </div>
      </div>
      <p class="demo-validation-current__boundary">
        尚未制定：blur／submit 觸發策略、Zod issue 對本地化文案的映射，以及父層
        Reserved 版面 helper。
      </p>
    </section>
  </article>
</template>

<style scoped>
.demo-field-validation {
  display: grid;
  gap: var(--ui-space-5);
  min-width: 0;
  padding-top: var(--ui-space-5);
  border-top: var(--ui-border-width) solid var(--ui-color-border-strong);
  container-type: inline-size;
}

.demo-field-validation__header,
.demo-validation-layer__header,
.demo-validation-block__header {
  display: grid;
  grid-template-columns: minmax(11rem, 16rem) minmax(0, 1fr);
  gap: var(--ui-space-4);
}

.demo-field-validation__header {
  align-items: end;
}

.demo-field-validation__header h4,
.demo-field-validation__header p,
.demo-field-validation__phase,
.demo-validation-layer__header h5,
.demo-validation-layer__header p,
.demo-validation-block__header h6,
.demo-validation-block__header p,
.demo-validation-space > p,
.demo-validation-current__boundary {
  margin: 0;
}

.demo-field-validation__phase,
.demo-validation-layer__header span,
.demo-validation-flow__step > span,
.demo-validation-space > header span,
.demo-validation-long-message > span,
.demo-validation-current-flow span {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-xs);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-caption);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.demo-field-validation__header h4 {
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-heading);
}

.demo-field-validation__header > p,
.demo-validation-layer__header p,
.demo-validation-block__header p,
.demo-validation-space > p,
.demo-validation-current__boundary {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-validation-layer {
  min-width: 0;
  padding: var(--ui-space-4);
  border: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-surface);
}

.demo-validation-layer--candidate {
  border-top: 2px solid var(--ui-color-accent);
}

.demo-validation-layer--current {
  background: color-mix(
    in srgb,
    var(--ui-color-surface) 76%,
    var(--ui-color-surface-raised)
  );
}

.demo-validation-layer__header {
  align-items: end;
}

.demo-validation-layer__header h5 {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-heading);
}

.demo-validation-block {
  min-width: 0;
  margin-top: var(--ui-space-5);
  padding-top: var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-validation-block__header {
  align-items: baseline;
  margin-bottom: var(--ui-space-3);
}

.demo-validation-block__header h6 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-validation-flow {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo-validation-flow__step {
  position: relative;
  display: grid;
  align-content: start;
  gap: var(--ui-space-1);
  min-width: 0;
  min-height: 7rem;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
}

.demo-validation-flow__step strong,
.demo-validation-space > header strong,
.demo-validation-current-flow strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-validation-flow__step small,
.demo-validation-state-label small,
.demo-validation-current-flow small {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-validation-flow__step > b {
  position: absolute;
  z-index: 1;
  inset-block-start: 50%;
  inset-inline-end: calc(var(--ui-space-3) * -1);
  width: var(--ui-space-3);
  color: var(--ui-color-accent);
  font-size: var(--ui-font-size-md);
  line-height: 1;
  text-align: center;
  transform: translate(50%, -50%);
}

.demo-validation-timing,
.demo-validation-family {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

.demo-validation-timing > article,
.demo-validation-space,
.demo-validation-long-message {
  min-width: 0;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-validation-state-label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0 var(--ui-space-2);
  margin-bottom: var(--ui-space-3);
}

.demo-validation-state-label > span {
  grid-row: 1 / 3;
  color: var(--ui-color-accent);
  font-size: var(--ui-font-size-lg);
  font-variant-numeric: tabular-nums;
  font-weight: var(--ui-font-weight-semibold);
  line-height: 1;
}

.demo-validation-state-label strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-validation-replacement {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-3);
}

.demo-validation-replacement > article {
  min-width: 0;
}

.demo-validation-replacement > article > span {
  display: block;
  margin-bottom: var(--ui-space-2);
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-validation-replacement__arrow {
  display: grid;
  justify-items: center;
  align-self: center;
  gap: var(--ui-space-1);
  color: var(--ui-color-accent);
}

.demo-validation-replacement__arrow span {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-xs);
  line-height: var(--ui-line-height-caption);
}

.demo-validation-replacement__arrow b {
  font-size: var(--ui-font-size-lg);
  line-height: 1;
}

.demo-validation-space-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

.demo-validation-space > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.demo-validation-space > p {
  margin-top: var(--ui-space-1);
}

.demo-validation-space__samples {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-3);
}

.demo-validation-auto-frame,
.demo-validation-reserved-frame {
  min-width: 0;
  padding: var(--ui-space-2);
  border: var(--ui-border-width) dashed var(--ui-color-border-strong);
}

.demo-validation-reserved-frame:not(.has-message)::after {
  display: block;
  min-block-size: 1.225rem;
  margin-block-start: var(--ui-space-1);
  content: '';
}

.demo-validation-long-message {
  width: min(32rem, 100%);
  margin-top: var(--ui-space-4);
}

.demo-validation-long-message > span {
  display: block;
  margin-bottom: var(--ui-space-2);
}

.demo-validation-family > * {
  min-width: 0;
}

.demo-validation-current-flow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-4);
}

.demo-validation-current-flow > div {
  display: grid;
  gap: var(--ui-space-1);
  min-width: 0;
  padding: var(--ui-space-3);
  border-inline-start: 2px solid var(--ui-color-border-strong);
}

.demo-validation-current-flow > b {
  color: var(--ui-color-text-subtle);
}

.demo-validation-current__boundary {
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

@container (max-width: 48rem) {
  .demo-field-validation__header,
  .demo-validation-layer__header,
  .demo-validation-block__header,
  .demo-validation-timing,
  .demo-validation-family,
  .demo-validation-space-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-field-validation__header,
  .demo-validation-layer__header,
  .demo-validation-block__header {
    gap: var(--ui-space-1);
  }

  .demo-validation-flow {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .demo-validation-flow__step > b {
    display: none;
  }
}

@container (max-width: 32rem) {
  .demo-validation-layer {
    padding-inline: var(--ui-space-3);
  }

  .demo-validation-flow,
  .demo-validation-replacement,
  .demo-validation-space__samples,
  .demo-validation-current-flow {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-validation-replacement__arrow {
    justify-self: start;
    grid-template-columns: auto auto;
  }

  .demo-validation-replacement__arrow b {
    transform: rotate(90deg);
  }

  .demo-validation-current-flow > b {
    transform: rotate(90deg);
  }
}
</style>
