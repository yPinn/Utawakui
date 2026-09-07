<script setup>
import UiTextField from '../ui/UiTextField.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const LAYERS = [
  {
    key: 'candidate',
    title: 'Token v2 Candidate',
    note: 'Readonly 使用 quiet surface；文字、選取與 keyboard focus 保持完整。',
  },
  {
    key: 'current',
    title: 'Current',
    note: 'Readonly 與 Editable 同表面且仍有 Hover，保留現行真值供比較。',
  },
];

const STATES = [
  {
    key: 'editable',
    label: 'Editable',
    note: 'Raised · Hover · 可編輯',
  },
  {
    key: 'readonly',
    label: 'Readonly',
    note: 'Quiet · 可選取／複製',
    readonly: true,
  },
  {
    key: 'disabled',
    label: 'Disabled',
    note: '50% · 不可操作',
    disabled: true,
  },
];

function stateNote(layer, state) {
  if (layer.key === 'current' && state.key === 'readonly') {
    return '同 Editable · 可選取／複製';
  }

  return state.note;
}
</script>

<template>
  <section class="demo-field-readonly" data-field-readonly-review>
    <header class="demo-field-readonly__header">
      <div>
        <h5>Field family 狀態語法</h5>
        <p>
          Editable 接受輸入；Readonly 是有效內容且可閱讀、選取與複製；Disabled
          表示目前不可操作。
        </p>
      </div>
      <p class="demo-field-readonly__boundary">
        Feature Gate 是獨立 gated flow，不是 readonly／disabled。
      </p>
    </header>

    <dl class="demo-field-readonly__rules">
      <div>
        <dt>Readonly surface</dt>
        <dd>較平的 quiet surface · 一般邊界 · 完整文字對比</dd>
      </div>
      <div>
        <dt>Interaction</dt>
        <dd>無 Hover 提升 · Focus-visible 保留 · 可選取／複製</dd>
      </div>
      <div>
        <dt>Visible label</dt>
        <dd>預設不加鎖頭或 badge；只有產品語意需要時才標示「唯讀」</dd>
      </div>
    </dl>

    <div class="demo-field-readonly__layers">
      <section
        v-for="layer in LAYERS"
        :key="layer.key"
        class="demo-field-readonly-layer"
        :class="`demo-field-readonly-layer--${layer.key}`"
        :data-field-readonly-layer="layer.key"
        :data-demo-review-layer="layer.key"
      >
        <header class="demo-field-readonly-layer__header">
          <h6>{{ layer.title }}</h6>
          <p>{{ layer.note }}</p>
        </header>

        <div class="demo-field-readonly-family">
          <h6>Text Field</h6>
          <div class="demo-field-readonly-state-grid">
            <article
              v-for="state in STATES"
              :key="state.key"
              class="demo-field-readonly-state"
              :data-field-readonly-control="`${layer.key}-text-field-${state.key}`"
            >
              <div class="demo-field-readonly-state__heading">
                <strong>{{ state.label }}</strong>
                <span>{{ stateNote(layer, state) }}</span>
              </div>
              <UiTextField
                :id="`demo-field-readonly-${layer.key}-text-field-${state.key}`"
                label="同步來源"
                :model-value="
                  state.key === 'disabled' ? '目前不可用' : '本機曲庫掃描'
                "
                :readonly="state.readonly || undefined"
                :disabled="state.disabled || undefined"
              />
            </article>
          </div>
        </div>

        <div class="demo-field-readonly-family">
          <h6>Textarea</h6>
          <div class="demo-field-readonly-state-grid">
            <article
              v-for="state in STATES"
              :key="state.key"
              class="demo-field-readonly-state"
              :data-field-readonly-control="`${layer.key}-textarea-${state.key}`"
            >
              <div class="demo-field-readonly-state__heading">
                <strong>{{ state.label }}</strong>
                <span>{{ stateNote(layer, state) }}</span>
              </div>
              <UiTextarea
                :id="`demo-field-readonly-${layer.key}-textarea-${state.key}`"
                label="來源摘要"
                :model-value="
                  state.key === 'disabled'
                    ? '依賴尚未就緒\n目前不可操作'
                    : '由來源同步的內容\n保留閱讀與複製能力'
                "
                :readonly="state.readonly || undefined"
                :disabled="state.disabled || undefined"
                :rows="2"
              />
            </article>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.demo-field-readonly {
  container-type: inline-size;
  padding-top: var(--ui-space-5);
  border-top: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-field-readonly__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(min(18rem, 100%), 0.6fr);
  gap: var(--ui-space-3) var(--ui-space-6);
  align-items: end;
}

.demo-field-readonly__header h5,
.demo-field-readonly-layer__header h6,
.demo-field-readonly-family h6,
.demo-field-readonly-state__heading strong,
.demo-field-readonly__rules dt {
  color: var(--ui-color-text);
}

.demo-field-readonly__header h5 {
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-title);
}

.demo-field-readonly__header p,
.demo-field-readonly-layer__header p,
.demo-field-readonly__rules dd,
.demo-field-readonly-state__heading span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-field-readonly__boundary {
  max-width: 28rem;
  justify-self: end;
}

.demo-field-readonly__rules {
  display: grid;
  grid-template-columns: repeat(3, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
  margin-top: var(--ui-space-4);
  padding-block: var(--ui-space-3);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-field-readonly__rules div {
  min-width: 0;
}

.demo-field-readonly__rules dt,
.demo-field-readonly-state__heading strong {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-field-readonly__rules dd {
  margin: var(--ui-space-1) 0 0;
}

.demo-field-readonly__layers {
  display: grid;
  gap: var(--ui-space-6);
  margin-top: var(--ui-space-5);
}

.demo-field-readonly-layer {
  min-width: 0;
}

.demo-field-readonly-layer__header {
  display: grid;
  grid-template-columns: minmax(8rem, auto) minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: baseline;
  padding-bottom: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-field-readonly-layer__header h6,
.demo-field-readonly-family h6 {
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-title);
}

.demo-field-readonly-family {
  margin-top: var(--ui-space-4);
}

.demo-field-readonly-state-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(min(12rem, 100%), 1fr));
  gap: var(--ui-space-4);
  margin-top: var(--ui-space-2);
}

.demo-field-readonly-state {
  min-width: 0;
}

.demo-field-readonly-state__heading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1) var(--ui-space-2);
  align-items: baseline;
  margin-bottom: var(--ui-space-2);
}

.demo-field-readonly-layer--candidate :deep(.ui-text-field:read-only),
.demo-field-readonly-layer--candidate :deep(.ui-textarea:read-only) {
  background: var(--ui-field-bg-readonly);
  border-color: var(--ui-field-border);
}

.demo-field-readonly-layer--candidate :deep(.ui-text-field:read-only:hover),
.demo-field-readonly-layer--candidate :deep(.ui-textarea:read-only:hover) {
  background: var(--ui-field-bg-readonly);
  border-color: var(--ui-field-border);
}

.demo-field-readonly-layer--candidate :deep(.ui-text-field:disabled),
.demo-field-readonly-layer--candidate :deep(.ui-textarea:disabled),
.demo-field-readonly-layer--candidate :deep(.ui-field__label) {
  -webkit-user-select: none;
  user-select: none;
}

.demo-field-readonly-layer--current {
  --ui-field-height: 1.875rem;
  --ui-field-padding-block: 0.25rem;
  --ui-field-padding-inline: 0.5rem;
  --ui-field-radius: 0.375rem;
  --ui-field-bg: #344046;
  --ui-field-bg-hover: #3a464c;
  --ui-field-fg: #f7f1e7;
  --ui-field-placeholder: #aeb8b6;
  --ui-field-border: #3c4749;
  --ui-field-border-hover: #536165;
  --ui-field-border-invalid: #dd7078;
  --ui-color-focus: #dd8267;
  --ui-color-danger: #dd7078;
  --ui-color-text: #f7f1e7;
  --ui-color-text-muted: #aeb8b6;
}

:global(:root[data-ui-theme='light'] .demo-field-readonly-layer--current) {
  --ui-field-bg: #edf2ef;
  --ui-field-bg-hover: #e4ece8;
  --ui-field-fg: #1f2328;
  --ui-field-placeholder: #69747a;
  --ui-field-border: #d8ded9;
  --ui-field-border-hover: #b9c4c0;
  --ui-field-border-invalid: #bd5961;
  --ui-color-focus: #d26a45;
  --ui-color-danger: #bd5961;
  --ui-color-text: #1f2328;
  --ui-color-text-muted: #69747a;
}

@container (max-width: 42rem) {
  .demo-field-readonly__header,
  .demo-field-readonly__rules,
  .demo-field-readonly-layer__header,
  .demo-field-readonly-state-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-field-readonly__boundary {
    justify-self: start;
  }
}
</style>
