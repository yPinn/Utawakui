<script setup>
import { computed, nextTick, onMounted, shallowRef, useId, watch } from 'vue';
import { Ellipsis, Keyboard } from '../../icons/index.js';
import {
  SHORTCUT_CATEGORIES,
  shortcutSettingsRows,
} from '../../utils/keyboardShortcutSettingsPresentation.js';
import { useKeyboardShortcutSettings } from '../../composables/useKeyboardShortcutSettings.js';
import { useKeyboardShortcutRecorder } from '../../composables/useKeyboardShortcutRecorder.js';
import { formatShortcutChord } from '../../utils/keyboardShortcutPresentation.js';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiTabs from '../ui/UiTabs.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import KeyboardShortcutKeys from './KeyboardShortcutKeys.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import KeyboardShortcutReference from './KeyboardShortcutReference.vue';

const settings = useKeyboardShortcutSettings();
const expanded = shallowRef(false),
  surface = shallowRef(null),
  recordButton = shallowRef(null),
  cancelButton = shallowRef(null);
const panelId = `keyboard-shortcuts-${useId()}`;
const activeTab = shallowRef('playback');
const scope = shallowRef('app');
const backgroundEnabled = computed(
  () =>
    settings.configuration.value.globalEnabled &&
    !settings.runtime.value?.sessionDisabled,
);
const hasBackgroundBindings = computed(() =>
  settings.configuration.value.bindings.some((binding) => binding.global),
);
const scopes = [
  { id: 'app', label: 'App 內' },
  { id: 'global', label: '背景' },
];
const categoryGuidance = computed(
  () =>
    SHORTCUT_CATEGORIES.find((category) => category.id === activeTab.value)
      ?.guidance ?? '',
);
const menuRow = shallowRef(null),
  menuAnchorEl = shallowRef(null),
  lastAction = shallowRef(null);
const tabs = computed(() =>
  SHORTCUT_CATEGORIES.map(({ id, label }) => ({
    id,
    label,
    disabled: settings.state.busy && !settings.state.testing,
  })),
);
const menuAnchor = computed(() => ({
  kind: 'element',
  element: menuAnchorEl.value,
}));
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'shortcut',
      items:
        menuRow.value && scope.value === 'global'
          ? [
              {
                id: 'remove',
                kind: 'action',
                value: 'remove',
                label: `移除${menuRow.value.label}背景快捷鍵`,
                disabled:
                  !settings.canConfigure(menuRow.value.id, 'global') ||
                  settings.isRecording.value ||
                  !menuRow.value.global,
              },
            ]
          : menuRow.value
            ? [
                {
                  id: 'disable',
                  kind: 'action',
                  value: 'disabled',
                  label: `停用${menuRow.value.label}快捷鍵`,
                  disabled:
                    !settings.canEdit.value ||
                    settings.isRecording.value ||
                    menuRow.value.app.mode === 'disabled' ||
                    (menuRow.value.app.mode === 'default' &&
                      !menuRow.value.defaultApp),
                },
                {
                  id: 'default',
                  kind: 'action',
                  value: 'default',
                  label: `恢復${menuRow.value.label}預設快捷鍵`,
                  disabled:
                    !settings.canEdit.value ||
                    settings.isRecording.value ||
                    menuRow.value.app.mode === 'default',
                },
              ]
            : [],
    },
  ],
}));
function closeMenu() {
  menuRow.value = null;
  menuAnchorEl.value = null;
}
function openMenu(row, event) {
  menuRow.value = row;
  menuAnchorEl.value = event.currentTarget;
}
function selectMenu(mode) {
  const row = menuRow.value;
  closeMenu();
  if (
    !row ||
    !['disabled', 'default', 'remove'].includes(mode) ||
    !settings.canEdit.value ||
    settings.isRecording.value
  )
    return;
  lastAction.value = row.id;
  if (scope.value === 'global') {
    if (mode === 'remove') void settings.saveBinding(row.id, null, 'global');
  } else if (mode !== 'remove') void settings.saveBinding(row.id, { mode });
}
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
  shortcutSettingsRows(
    settings.configuration.value,
    activeTab.value,
    settings.state.loaded,
    scope.value,
    settings.runtime.value,
  ),
);
const feedback = computed(
  () =>
    settings.state.readError || (!lastAction.value && settings.state.saveError),
);
const backgroundStatus = computed(() =>
  settings.state.runtimeReading
    ? { status: '讀取中', tone: 'muted' }
    : settings.state.runtimeError
      ? { status: '無法讀取', tone: 'warning' }
      : (settings.runtimePresentation.value ?? {
          status: '尚未讀取',
          tone: 'muted',
        }),
);
onMounted(() => {
  void settings.initialize();
});
watch(expanded, (open) => {
  if (open) void settings.refreshRuntime();
  else {
    recorder.cancel({ focus: false });
    closeMenu();
  }
});
watch(
  [activeTab, scope],
  () => {
    recorder.cancel({ focus: false });
    closeMenu();
  },
  { flush: 'sync' },
);
watch(settings.canEdit, (value) => {
  if (!value) closeMenu();
});
async function begin(command) {
  closeMenu();
  if (!recorder.begin(command, scope.value)) return;
  lastAction.value = command;
  await nextTick();
  if (recorder.state.command === command) recordButton.value?.focus?.();
}
function setRecordButton(value) {
  recordButton.value = value?.$el ?? value;
}
function setCancelButton(value) {
  cancelButton.value = value?.$el ?? value;
}
function testCandidate() {
  // Keep focus inside the editor before loading disables the trial button.
  // Native blur/hidden and genuine focus departure still cancel the candidate.
  cancelButton.value?.focus?.();
  void recorder.test();
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
      title="快捷鍵"
      guidance="按「設定」更改按鍵；其他操作見「操作說明」。"
    >
      <template #actions>
        <UiButton
          :aria-label="expanded ? '收合快捷鍵設定' : '展開快捷鍵設定'"
          :aria-expanded="expanded"
          :aria-controls="panelId"
          :disabled="settings.state.busy && !settings.state.testing"
          @click="expanded = !expanded"
          >{{ expanded ? '收合' : '設定' }}</UiButton
        >
      </template>
      <template v-if="feedback || !settings.state.loaded" #feedback>
        <UiHint :tone="feedback ? 'danger' : 'muted'" role="status">{{
          feedback || '正在載入快捷鍵…'
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
      aria-label="快捷鍵設定"
    >
      <UiTabs
        v-model:active-id="activeTab"
        :items="tabs"
        aria-label="快捷鍵分類"
        :tab-id-prefix="panelId"
        :panel-id-prefix="panelId"
        variant="bar"
      />
      <div
        v-for="category in SHORTCUT_CATEGORIES"
        :id="`${panelId}-${category.id}-panel`"
        :key="category.id"
        role="tabpanel"
        :aria-labelledby="`${panelId}-${category.id}-tab`"
        :hidden="activeTab !== category.id"
        :tabindex="activeTab === category.id ? 0 : -1"
      >
        <template v-if="activeTab === category.id">
          <UiHint
            v-if="categoryGuidance"
            class="keyboard-shortcut-settings__intro"
            >{{ categoryGuidance }}</UiHint
          >
          <UiSegmentedControl
            v-if="settings.hasGlobalSettings.value && activeTab !== 'reference'"
            v-model="scope"
            :items="scopes"
            aria-label="快捷鍵作用範圍"
            :disabled="settings.state.busy && !settings.state.testing"
          />
          <UiHint
            v-if="scope === 'global' && activeTab !== 'reference'"
            class="keyboard-shortcut-settings__intro"
            >背景按鍵需含 Ctrl 或 Alt。先試用，再套用；不會執行功能。</UiHint
          >
          <KeyboardShortcutReference v-if="activeTab === 'reference'" />

          <section
            v-for="row in rows"
            :key="row.id"
            :data-shortcut-command="row.id"
            class="keyboard-shortcut-settings__row"
            :aria-labelledby="panelId + '-' + row.id + '-title'"
          >
            <div class="keyboard-shortcut-settings__copy">
              <h4 :id="panelId + '-' + row.id + '-title'">{{ row.title }}</h4>
              <UiHint v-if="row.guidance">{{ row.guidance }}</UiHint>
            </div>
            <div class="keyboard-shortcut-settings__binding">
              <KeyboardShortcutKeys
                v-if="row.keys.length"
                :chords="[row.keys]"
                :label="row.label + '目前快捷鍵'"
                :aria-description="row.scope"
              />
              <UiHint class="keyboard-shortcut-settings__status">{{
                row.status
              }}</UiHint>
            </div>
            <div
              v-if="recorder.state.command !== row.id"
              class="keyboard-shortcut-settings__actions"
            >
              <UiButton
                class="keyboard-shortcut-settings__configure"
                :aria-label="'設定' + row.label + '快捷鍵'"
                :disabled="
                  !settings.canConfigure(row.id, scope) ||
                  settings.isRecording.value
                "
                @click="begin(row.id)"
                >設定</UiButton
              >
              <UiIconButton
                :icon="Ellipsis"
                :label="row.label + '選項'"
                aria-haspopup="menu"
                :aria-expanded="menuRow?.id === row.id"
                :disabled="
                  !settings.canConfigure(row.id, scope) ||
                  settings.isRecording.value
                "
                @click="openMenu(row, $event)"
              />
            </div>
            <div
              v-else
              class="keyboard-shortcut-settings__editor"
              :class="{
                'keyboard-shortcut-settings__editor--background':
                  scope === 'global',
              }"
              role="group"
              :aria-label="'設定' + row.label + '快捷鍵'"
              @focusout="leaveEditor"
            >
              <UiButton
                :ref="setRecordButton"
                class="keyboard-shortcut-settings__record"
                variant="secondary"
                :aria-label="'錄製' + row.label + '快捷鍵'"
                :aria-describedby="panelId + '-' + row.id + '-hint'"
                :disabled="recorder.state.saving || recorder.state.testing"
                @click="begin(row.id)"
                @keydown="recorder.capture"
                @keyup.stop.prevent
              >
                <KeyboardShortcutKeys
                  v-if="recorder.state.candidate"
                  :chords="[
                    formatShortcutChord(recorder.state.candidate).split(' + '),
                  ]"
                />
                <span v-else>按下按鍵組合…</span>
              </UiButton>
              <UiButton
                v-if="scope === 'global'"
                :aria-label="'試用' + row.label + '背景按鍵'"
                :disabled="!recorder.state.candidate || !settings.canEdit.value"
                :loading="recorder.state.testing"
                @click="testCandidate"
                >試用按鍵</UiButton
              >
              <UiButton
                variant="accent"
                :aria-label="'套用' + row.label + '快捷鍵'"
                :disabled="
                  !recorder.state.candidate ||
                  !settings.canEdit.value ||
                  (scope === 'global' && !recorder.state.tested)
                "
                :loading="recorder.state.saving"
                @click="recorder.apply"
                >套用</UiButton
              >
              <UiButton
                :ref="setCancelButton"
                :aria-label="'取消' + row.label + '快捷鍵'"
                :disabled="recorder.state.saving"
                @click="recorder.cancel()"
                >取消</UiButton
              >
            </div>
            <UiHint
              v-if="
                recorder.state.command === row.id ||
                (lastAction === row.id && settings.state.saveError)
              "
              :id="panelId + '-' + row.id + '-hint'"
              class="keyboard-shortcut-settings__feedback"
              :tone="
                recorder.state.error || settings.state.saveError
                  ? 'danger'
                  : 'muted'
              "
              :role="
                recorder.state.error || settings.state.saveError
                  ? 'alert'
                  : 'status'
              "
            >
              <template v-if="recorder.state.error || settings.state.saveError"
                >{{ recorder.state.error || settings.state.saveError
                }}<span
                  v-if="settings.state.saveError && settings.isRecording.value"
                  >先按「取消」，再重新讀取。</span
                ></template
              >
              <template v-else>
                {{
                  recorder.state.capturing
                    ? '按下想用的按鍵；此時不會執行功能。'
                    : scope === 'global'
                      ? recorder.state.testing
                        ? '正在確認按鍵…'
                        : recorder.state.tested
                          ? '目前可用；按「套用」儲存。'
                          : '先試用按鍵，再按「套用」儲存。'
                      : '按「套用」儲存並生效。'
                }}
                <KeyboardShortcutKeys :chords="[['Esc']]" /> 取消<span
                  v-if="recorder.state.capturing"
                  >，<KeyboardShortcutKeys :chords="[['Tab']]" /> 離開</span
                >。
              </template>
            </UiHint>
            <UiButton
              v-if="
                lastAction === row.id && settings.state.saveError && !feedback
              "
              class="keyboard-shortcut-settings__retry"
              aria-label="重新讀取快捷鍵"
              :loading="settings.state.reading"
              :disabled="settings.isRecording.value || settings.state.busy"
              @click="settings.refresh"
              >重新讀取</UiButton
            >
          </section>
        </template>
      </div>
      <UiActionMenu
        :open="Boolean(menuRow)"
        :anchor="menuAnchor"
        :content="menuContent"
        aria-label="快捷鍵操作"
        size="sm"
        @select="selectMenu"
        @close="closeMenu"
      />
      <SettingsDocumentItem
        title="背景快捷鍵"
        :description="
          settings.hasGlobalSettings.value && !hasBackgroundBindings
            ? '先在「背景」設定按鍵，再啟用。'
            : '切到其他程式時使用的快捷鍵。'
        "
        variant="nested"
        :status="backgroundStatus.status"
        :status-tone="backgroundStatus.tone"
        status-live
      >
        <template #actions>
          <UiButton
            v-if="
              settings.hasGlobalSettings.value || settings.canStopGlobal.value
            "
            :aria-label="
              backgroundEnabled ? '停用背景快捷鍵' : '啟用背景快捷鍵'
            "
            :disabled="
              !settings.canEdit.value ||
              settings.isRecording.value ||
              (!backgroundEnabled &&
                (Boolean(settings.state.runtimeError) ||
                  settings.state.runtimeReading ||
                  !hasBackgroundBindings))
            "
            @click="
              lastAction = null;
              settings.setGlobalEnabled(!backgroundEnabled);
            "
            >{{ backgroundEnabled ? '停用' : '啟用' }}</UiButton
          >
          <UiButton
            aria-label="重新讀取背景快捷鍵狀態"
            :loading="settings.state.runtimeReading"
            :disabled="settings.isRecording.value || settings.state.busy"
            @click="settings.refreshRuntime"
            >重新讀取</UiButton
          >
        </template>
        <template v-if="settings.state.runtimeError" #feedback>
          <UiHint tone="danger">{{ settings.state.runtimeError }}</UiHint>
        </template>
        <template
          v-else-if="
            settings.runtime.value?.sessionDisabled &&
            settings.configuration.value.globalEnabled
          "
          #feedback
          ><UiHint tone="warning"
            >本次已停用；下次啟動的設定尚未儲存。請重試停用或重新讀取。</UiHint
          ><UiButton
            :disabled="!settings.canEdit.value || settings.isRecording.value"
            @click="
              lastAction = null;
              settings.setGlobalEnabled(false);
            "
            >重試停用</UiButton
          ></template
        >
      </SettingsDocumentItem>
      <div class="keyboard-shortcut-settings__footer">
        <UiButton
          v-if="activeTab !== 'reference'"
          aria-label="恢復全部快捷鍵預設"
          :disabled="
            !settings.canEdit.value ||
            settings.isRecording.value ||
            settings.isDefault.value
          "
          @click="
            lastAction = null;
            settings.restoreAll();
          "
          >恢復全部預設</UiButton
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.keyboard-shortcut-settings {
  container: shortcut-settings / inline-size;
}
.keyboard-shortcut-settings,
.keyboard-shortcut-settings__panel {
  min-inline-size: 0;
}
.keyboard-shortcut-settings__intro {
  margin-block: var(--ui-space-3);
}
.keyboard-shortcut-settings__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, max-content) max-content;
  align-items: center;
  gap: var(--ui-space-2) var(--ui-space-4);
  padding: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.keyboard-shortcut-settings__row > * {
  min-inline-size: 0;
}
.keyboard-shortcut-settings__copy {
  display: grid;
  gap: var(--ui-space-1);
  overflow-wrap: break-word;
}
h4 {
  margin: 0;
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}
.keyboard-shortcut-settings__binding,
.keyboard-shortcut-settings__actions,
.keyboard-shortcut-settings__footer {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}
.keyboard-shortcut-settings__binding {
  flex-wrap: wrap;
  justify-content: flex-end;
}
.keyboard-shortcut-settings__status {
  white-space: nowrap;
}
.keyboard-shortcut-settings__actions {
  justify-self: end;
  flex-wrap: nowrap;
}
.keyboard-shortcut-settings__editor {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}
.keyboard-shortcut-settings__editor--background {
  grid-template-columns: minmax(0, 1fr) auto auto auto;
}
.keyboard-shortcut-settings__record {
  min-inline-size: 0;
  max-inline-size: 100%;
  white-space: normal;
  justify-content: flex-start;
  padding-inline: var(--ui-space-2);
}
.keyboard-shortcut-settings__feedback {
  grid-column: 1 / -1;
  overflow-wrap: break-word;
}
.keyboard-shortcut-settings__retry {
  grid-column: 1 / -1;
  justify-self: start;
}
.keyboard-shortcut-settings__footer {
  flex-wrap: wrap;
  justify-content: space-between;
  padding-block: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
@container shortcut-settings (max-width:38rem) {
  .keyboard-shortcut-settings__row {
    grid-template-columns: minmax(0, 1fr) max-content;
  }
  .keyboard-shortcut-settings__copy {
    grid-column: 1 / -1;
  }
  .keyboard-shortcut-settings__binding {
    justify-content: flex-start;
  }
}
@container shortcut-settings (max-width:28rem) {
  .keyboard-shortcut-settings__row {
    padding-inline: var(--ui-space-2);
  }
  .keyboard-shortcut-settings__editor {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .keyboard-shortcut-settings__editor--background {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .keyboard-shortcut-settings__record {
    grid-column: 1 / -1;
  }
}
</style>
