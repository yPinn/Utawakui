<script setup>
import { reactive, shallowRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import '../../styles/demoInputStates.css';

const CASES = [
  { key: 'off', title: '關閉', value: false },
  { key: 'on', title: '開啟', value: true },
  { key: 'required-pristine', title: 'Required · pristine', required: true },
  {
    key: 'invalid-off',
    title: 'Invalid · 初始關閉',
    invalid: true,
    error: '設定需要重新確認。',
  },
  {
    key: 'invalid-on',
    title: 'Error only · 初始開啟',
    value: true,
    error: '設定需要重新確認。',
  },
  { key: 'explicit-invalid', title: 'Invalid · 無錯誤文案', invalid: true },
  { key: 'disabled-off', title: 'Disabled · 關閉', disabled: true },
  { key: 'disabled-on', title: 'Disabled · 開啟', value: true, disabled: true },
  {
    key: 'disabled-invalid-off',
    title: 'Disabled × Invalid · 關閉',
    disabled: true,
    error: '解除鎖定後確認設定。',
  },
  {
    key: 'disabled-invalid-on',
    title: 'Disabled × Invalid · 開啟',
    value: true,
    disabled: true,
    invalid: true,
    error: '解除鎖定後確認設定。',
  },
];
const values = reactive(
  Object.fromEntries(CASES.map(({ key, value }) => [key, Boolean(value)])),
);
const enabled = shallowRef(false);
const contentValues = reactive({ cjk: false, latin: true });
const locked = shallowRef(false);
function reset() {
  enabled.value = false;
  locked.value = false;
}
</script>

<template>
  <div
    class="demo-input-states"
    data-input-source="production"
    data-input-component="switch"
  >
    <section class="demo-input-states__section">
      <h4>選值與驗證狀態</h4>
      <p class="demo-input-states__copy">
        Hover／Focus
        不移除錯誤邊框。這組標本固定驗證條件，下方恢復範例才隨選值更新錯誤。
      </p>
      <div class="demo-input-states__grid">
        <article
          v-for="entry in CASES"
          :key="entry.key"
          class="demo-input-states__case"
          :data-switch-state="entry.key"
        >
          <h5>{{ entry.title }}</h5>
          <UiSwitch
            :id="`demo-switch-${entry.key}`"
            v-model="values[entry.key]"
            label="自動檢查更新"
            hint="關閉時可手動檢查更新。"
            :required="entry.required"
            :disabled="entry.disabled"
            :invalid="entry.invalid"
            :error="entry.error"
          />
        </article>
      </div>
    </section>
    <section class="demo-input-states__section">
      <h4>多行文字與首行對齊</h4>
      <div class="demo-input-states__grid">
        <UiSwitch
          id="demo-switch-long-cjk"
          v-model="contentValues.cjk"
          label="演出開始後自動切換到下一首，並保留目前的播放狀態、導唱聲道與輸出設定"
          hint="說明位於獨立行，不擴大切換範圍。"
        />
        <UiSwitch
          id="demo-switch-long-latin"
          v-model="contentValues.latin"
          lang="en"
          label="Automatically advance to the next performance item while preserving the current guide-vocal and output settings"
        />
      </div>
    </section>
    <section class="demo-input-states__section" data-switch-recovery>
      <h4>錯誤恢復與再次驗證</h4>
      <p class="demo-input-states__copy">
        此範例要求啟用更新檢查。開啟即清除錯誤；關閉會再次顯示錯誤，暫停修改不清除選值。
      </p>
      <UiSwitch id="demo-switch-lock" v-model="locked" label="暫停修改" />
      <UiSwitch
        id="demo-switch-recovery"
        v-model="enabled"
        label="啟用更新檢查"
        :disabled="locked"
        :error="enabled ? '' : '請啟用更新檢查。'"
        hint="目前設定已符合範例要求。"
      />
      <div class="demo-input-states__actions">
        <output data-switch-value
          >目前值：{{ enabled ? '開啟' : '關閉' }}</output
        >
        <UiButton data-switch-reset variant="secondary" @click="reset"
          >重設範例</UiButton
        >
      </div>
    </section>
  </div>
</template>
