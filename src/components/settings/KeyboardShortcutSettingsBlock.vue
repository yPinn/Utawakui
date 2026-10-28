<script setup>
import { computed, nextTick, onMounted, shallowRef, useId, watch } from 'vue';
import { Keyboard } from '../../icons/index.js';
import { SHORTCUT_COMMANDS } from '../../../shared/keyboardShortcutContract.mjs';
import { useKeyboardShortcutSettings } from '../../composables/useKeyboardShortcutSettings.js';
import { useKeyboardShortcutRecorder } from '../../composables/useKeyboardShortcutRecorder.js';
import { formatShortcutChord } from '../../utils/keyboardShortcutPresentation.js';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';

const settings = useKeyboardShortcutSettings();
const expanded = shallowRef(false),
  surface = shallowRef(null),
  recordButton = shallowRef(null);
const panelId = `keyboard-shortcuts-${useId()}`;
const recorder = useKeyboardShortcutRecorder({
  settings,
  focusCommand: (command) =>
    surface.value
      ?.querySelector?.(
        `[data-shortcut-command="${command}"] .keyboard-shortcut-settings__configure`,
      )
      ?.focus(),
});
const rows = computed(() =>
  SHORTCUT_COMMANDS.map((command, index) => {
    const app = settings.configuration.value.bindings[index].app;
    return {
      ...command,
      app,
      value: !settings.state.loaded
        ? '尚未讀取'
        : app.mode === 'disabled'
          ? '已停用'
          : formatShortcutChord(
              app.mode === 'custom' ? app.chord : command.defaultApp,
            ) +
            (app.mode === 'default' && command.defaultApp ? '（預設）' : ''),
    };
  }),
);
const feedback = computed(
  () => settings.state.readError || settings.state.saveError,
);
onMounted(() => {
  void settings.initialize();
});
watch(expanded, (open) => {
  if (!open) recorder.cancel({ focus: false });
});
async function begin(command) {
  if (!recorder.begin(command)) return;
  await nextTick();
  recordButton.value?.focus?.();
}
function setRecordButton(value) {
  recordButton.value = value?.$el ?? value;
}
function leaveEditor(event) {
  if (!event.currentTarget.contains(event.relatedTarget))
    recorder.cancel({ focus: false });
}
</script>

<template>
  <div class="keyboard-shortcut-settings">
    <SettingsDocumentItem
      :icon="Keyboard"
      title="App 快捷鍵"
      guidance="在 Utawakui 主視窗內使用。"
    >
      <template #actions>
        <UiButton
          :aria-label="expanded ? '收合 App 快捷鍵' : '展開 App 快捷鍵'"
          :aria-expanded="expanded"
          :aria-controls="panelId"
          :disabled="settings.state.busy"
          @click="expanded = !expanded"
          >{{ expanded ? '收合' : '設定' }}</UiButton
        >
      </template>
      <template v-if="feedback || !settings.state.loaded" #feedback>
        <UiHint :tone="feedback ? 'danger' : 'muted'" role="status">{{
          feedback || '讀取中；尚未確認已儲存設定。'
        }}</UiHint>
        <UiButton
          v-if="feedback"
          aria-label="重新讀取快捷鍵"
          :loading="settings.state.reading"
          :disabled="settings.isRecording.value || settings.state.busy"
          @click="settings.refresh"
          >重新讀取</UiButton
        >
      </template>
    </SettingsDocumentItem>
    <div
      v-if="expanded"
      :id="panelId"
      ref="surface"
      class="keyboard-shortcut-settings__panel"
      role="region"
      aria-label="App 快捷鍵設定"
    >
      <div
        v-for="row in rows"
        :key="row.id"
        :data-shortcut-command="row.id"
        class="keyboard-shortcut-settings__row"
      >
        <SettingsDocumentItem
          variant="nested"
          :title="row.label"
          :value="row.value"
        >
          <template #actions>
            <div
              v-if="recorder.state.command === row.id"
              class="keyboard-shortcut-settings__editor"
              role="group"
              :aria-label="`設定${row.label}快捷鍵`"
              @focusout="leaveEditor"
            >
              <UiButton
                :ref="setRecordButton"
                variant="secondary"
                :aria-label="`錄製${row.label}快捷鍵`"
                :aria-describedby="`${panelId}-${row.id}-hint`"
                :disabled="recorder.state.saving"
                @click="begin(row.id)"
                @keydown="recorder.capture"
                @keyup.stop.prevent
                >{{
                  recorder.state.candidate
                    ? formatShortcutChord(recorder.state.candidate)
                    : '請按下快捷鍵…'
                }}</UiButton
              >
              <UiButton
                variant="accent"
                :aria-label="`套用${row.label}快捷鍵`"
                :disabled="!recorder.state.candidate || !settings.canEdit.value"
                :loading="recorder.state.saving"
                @click="recorder.apply"
                >套用</UiButton
              >
              <UiButton
                :aria-label="`取消${row.label}快捷鍵`"
                :disabled="recorder.state.saving"
                @click="recorder.cancel()"
                >取消</UiButton
              >
            </div>
            <template v-else>
              <UiButton
                class="keyboard-shortcut-settings__configure"
                :aria-label="`設定${row.label}快捷鍵`"
                :disabled="
                  !settings.canEdit.value || settings.isRecording.value
                "
                @click="begin(row.id)"
                >設定</UiButton
              >
              <UiButton
                :aria-label="`停用${row.label}快捷鍵`"
                :disabled="
                  !settings.canEdit.value ||
                  settings.isRecording.value ||
                  row.app.mode === 'disabled' ||
                  (row.app.mode === 'default' && !row.defaultApp)
                "
                @click="settings.saveBinding(row.id, { mode: 'disabled' })"
                >停用</UiButton
              >
              <UiButton
                :aria-label="`恢復${row.label}預設快捷鍵`"
                :disabled="
                  !settings.canEdit.value ||
                  settings.isRecording.value ||
                  row.app.mode === 'default'
                "
                @click="settings.saveBinding(row.id, { mode: 'default' })"
                >預設</UiButton
              >
            </template>
          </template>
          <template v-if="recorder.state.command === row.id" #feedback>
            <UiHint
              :id="`${panelId}-${row.id}-hint`"
              :tone="recorder.state.error ? 'danger' : 'muted'"
              :role="recorder.state.error ? 'alert' : 'status'"
              >{{
                recorder.state.error ||
                (recorder.state.capturing
                  ? '按下按鍵組合；Esc 取消，Tab 離開。App 快捷鍵暫停。'
                  : '按「套用」保存；App 快捷鍵暫停至套用或取消。')
              }}</UiHint
            >
          </template>
        </SettingsDocumentItem>
      </div>
      <div class="keyboard-shortcut-settings__footer">
        <UiHint>全域快捷鍵尚未開放。</UiHint>
        <UiButton
          aria-label="恢復全部快捷鍵預設"
          :disabled="
            !settings.canEdit.value ||
            settings.isRecording.value ||
            settings.isDefault.value
          "
          @click="settings.restoreAll"
          >恢復全部預設</UiButton
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.keyboard-shortcut-settings,
.keyboard-shortcut-settings__panel {
  min-inline-size: 0;
}
.keyboard-shortcut-settings__row {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.keyboard-shortcut-settings__editor,
.keyboard-shortcut-settings__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}
.keyboard-shortcut-settings__footer {
  justify-content: space-between;
  padding-block: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
</style>
