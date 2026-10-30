<script setup>
import { reactive } from 'vue';
import UiRange from '../ui/UiRange.vue';
import '../../styles/demoSpecimens.css';

function formatPercent(value) {
  return `${value}%`;
}

function speedInvalid(value) {
  return value > 120;
}

function formatSpeed(value) {
  return speedInvalid(value) ? `超過建議值：${value}%` : formatPercent(value);
}

function formatSignedDecibels(value) {
  const sign = value < 0 ? '−' : value > 0 ? '+' : '';
  return `${sign}${Math.abs(value)} dB`;
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const DENSITIES = [
  ['standard', 'Standard target · 36 CSS px'],
  ['compact', 'Compact target · 32 CSS px'],
];

const WIDTHS = [
  ['narrow', 'Narrow parent · 12rem', 32],
  ['reference', 'Reference parent · 20rem', 64],
  ['fluid', 'Fluid parent · 100%', 72],
];

const CONTENT = [
  {
    key: 'minimum',
    label: 'Minimum',
    value: 0,
    min: 0,
    max: 100,
    step: 1,
    formatValue: formatPercent,
  },
  {
    key: 'maximum',
    label: 'Maximum',
    value: 100,
    min: 0,
    max: 100,
    step: 1,
    formatValue: formatPercent,
  },
  {
    key: 'negative',
    label: 'Negative range',
    value: -12,
    min: -24,
    max: 12,
    step: 1,
    formatValue: formatSignedDecibels,
  },
  {
    key: 'fractional',
    label: 'Fractional step',
    value: 0.65,
    min: 0.5,
    max: 1.5,
    step: 0.05,
    formatValue: (value) => `${Number(value).toFixed(2)}×`,
  },
  {
    key: 'time',
    label: 'Time value · 指向預覽以時間格式顯示',
    value: 59,
    min: 0,
    max: 173,
    step: 1,
    formatValue: formatDuration,
  },
  {
    key: 'long-value-text',
    label: 'Long valueText',
    value: 100,
    min: 50,
    max: 150,
    step: 0.1,
    formatValue: (value) =>
      `${value === 100 ? '標準速度' : '速度'}／${Number(value).toFixed(1)} percent`,
  },
  {
    key: 'native-value',
    label: 'Native value · 無 valueText',
    value: 48,
    min: 0,
    max: 100,
    step: 1,
    formatValue: () => '',
  },
];

const STOP_VALUES = [0, 25, 50, 75, 100];

const STATES = [
  { key: 'default', label: 'Default', value: 50, formatValue: formatPercent },
  { key: 'minimum', label: 'Minimum', value: 0, formatValue: formatPercent },
  { key: 'maximum', label: 'Maximum', value: 100, formatValue: formatPercent },
  { key: 'hover', label: 'Hover', value: 60, formatValue: formatPercent },
  {
    key: 'focus',
    label: 'Focus-visible',
    value: 45,
    formatValue: formatPercent,
  },
  {
    key: 'invalid',
    label: 'Invalid',
    value: 140,
    min: 50,
    max: 150,
    formatValue: formatSpeed,
    error: '速度超過這個處理流程的建議值。',
  },
  {
    key: 'disabled',
    label: 'Disabled',
    value: 0,
    min: -12,
    max: 12,
    formatValue: (value) => `${value} semitone`,
    disabled: true,
  },
];

const CONTRACT = [
  'Number modelValue → update:modelValue',
  'min · max · step · disabled · invalid',
  'valueText → output／aria-valuetext · formatValue → 指向預覽',
  'marks · 軌道內離散刻度',
  'Track 6 CSS px · Thumb 16 CSS px 只在互動時顯示 · 寬度 100% parent',
  'No required／readonly／size prop',
];

const values = reactive({
  sizes: Object.fromEntries(DENSITIES.map(([key]) => [key, 50])),
  widths: Object.fromEntries(WIDTHS.map(([key, , value]) => [key, value])),
  stops: 50,
  content: Object.fromEntries(CONTENT.map((c) => [c.key, c.value])),
  states: Object.fromEntries(STATES.map((s) => [s.key, s.value])),
  validationHint: 72,
  validationError: 140,
});

function stateInvalid(state) {
  return state.key === 'invalid' && speedInvalid(values.states[state.key]);
}
</script>

<template>
  <div class="demo-specimens" data-range-source="production">
    <p class="demo-specimens__copy">
      連續或離散數值調整；拖曳或方向鍵調整，指向軌道可預覽。無空值、必填或唯讀狀態。
    </p>

    <section class="demo-specimens__section">
      <h4>密度與寬度</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="[key, label] in DENSITIES"
          :key="key"
          class="demo-specimens__case"
          :class="`demo-range__size--${key}`"
          :data-range-size="key"
        >
          <h5>{{ label }}</h5>
          <UiRange
            :id="`demo-range-size-${key}`"
            v-model="values.sizes[key]"
            :label="`${label} 音量`"
            :value-text="`${values.sizes[key]}%`"
            :format-value="formatPercent"
          />
        </article>
        <article
          v-for="[key, label] in WIDTHS"
          :key="key"
          class="demo-specimens__case"
          :data-range-width="key"
        >
          <h5>{{ label }}</h5>
          <div :class="`demo-range__width--${key}`">
            <UiRange
              :id="`demo-range-width-${key}`"
              v-model="values.widths[key]"
              :label="`${label} output level`"
              :value-text="`${values.widths[key]}%`"
              :format-value="formatPercent"
            />
          </div>
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>數值與格式</h4>
      <p class="demo-specimens__copy">
        modelValue 為數字；valueText 描述目前值，formatValue 格式化指向預覽。
      </p>
      <div class="demo-specimens__grid">
        <article
          v-for="content in CONTENT"
          :key="content.key"
          class="demo-specimens__case"
          :data-range-content="content.key"
        >
          <h5>{{ content.label }}</h5>
          <UiRange
            :id="`demo-range-content-${content.key}`"
            v-model="values.content[content.key]"
            :label="content.label"
            :min="content.min"
            :max="content.max"
            :step="content.step"
            :value-text="content.formatValue(values.content[content.key])"
            :format-value="content.formatValue"
          />
        </article>
        <article class="demo-specimens__case" data-range-stops>
          <h5>離散 stops · 每格 25</h5>
          <UiRange
            id="demo-range-stops-equal"
            v-model="values.stops"
            label="輸出段位"
            :min="0"
            :max="100"
            :step="25"
            :value-text="`${values.stops}%`"
            :marks="STOP_VALUES"
            :format-value="formatPercent"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>狀態</h4>
      <div class="demo-specimens__grid">
        <article
          v-for="state in STATES"
          :key="state.key"
          class="demo-specimens__case"
          :data-range-state="state.key"
        >
          <h5>{{ state.label }}</h5>
          <UiRange
            :id="`demo-range-state-${state.key}`"
            v-model="values.states[state.key]"
            :label="state.label"
            :min="state.min ?? 0"
            :max="state.max ?? 100"
            :value-text="state.formatValue(values.states[state.key])"
            :invalid="stateInvalid(state)"
            :error="stateInvalid(state) ? state.error : ''"
            :disabled="state.disabled"
            :format-value="state.formatValue"
          />
        </article>
      </div>
    </section>

    <section class="demo-specimens__section">
      <h4>Hint → Error 與 ARIA</h4>
      <div class="demo-specimens__grid">
        <article class="demo-specimens__case">
          <h5>Hint／valid</h5>
          <UiRange
            id="demo-range-validation-hint"
            v-model="values.validationHint"
            label="導唱音量"
            :value-text="`${values.validationHint}%`"
            hint="建議演出前以耳機確認。"
            aria-describedby="range-external-note"
            name="demo-range-level"
            data-contract="native-forwarding"
            :format-value="formatPercent"
          />
        </article>
        <article class="demo-specimens__case">
          <h5>Error／invalid</h5>
          <UiRange
            id="demo-range-validation-error"
            v-model="values.validationError"
            label="處理速度"
            :min="50"
            :max="150"
            :value-text="formatSpeed(values.validationError)"
            hint="建議維持在 50% 至 120%。"
            :error="
              speedInvalid(values.validationError)
                ? '速度超過這個處理流程的建議值。'
                : ''
            "
            aria-describedby="range-external-note"
            :format-value="formatSpeed"
          />
        </article>
      </div>
    </section>

    <ul class="demo-specimens__contract" aria-label="UiRange public contract">
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-range__size--standard {
  --ui-range-target-size: 2.25rem;
}

.demo-range__size--compact {
  --ui-range-target-size: 2rem;
}

.demo-range__width--narrow {
  width: min(12rem, 100%);
}

.demo-range__width--reference {
  width: min(20rem, 100%);
}

/* Static previews of pointer and keyboard states. */
.demo-specimens__case[data-range-state='hover']
  :deep(.ui-range-control__native::-webkit-slider-thumb) {
  opacity: 1;
}

.demo-specimens__case[data-range-state='hover'] :deep(.ui-range-control__fill),
.demo-specimens__case[data-range-state='focus'] :deep(.ui-range-control__fill) {
  background: var(--ui-range-fill-hover);
}

.demo-specimens__case[data-range-state='focus']
  :deep(.ui-range-control__native::-webkit-slider-thumb) {
  opacity: 1;
  box-shadow:
    0 0 0 var(--ui-focus-offset) var(--ui-range-thumb-border),
    0 0 0 calc(var(--ui-focus-offset) + var(--ui-focus-width))
      var(--ui-range-focus);
}
</style>
