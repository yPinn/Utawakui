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
import { t } from '../../utils/i18n.js';

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
  { id: 'app', label: t('shortcuts.block.scopeApp') },
  { id: 'global', label: t('shortcuts.block.scopeGlobal') },
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
                label: t('shortcuts.block.removeGlobal', {
                  command: menuRow.value.label,
                }),
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
                  label: t('shortcuts.block.disableCommand', {
                    command: menuRow.value.label,
                  }),
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
                  label: t('shortcuts.block.restoreCommand', {
                    command: menuRow.value.label,
                  }),
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
    ? { status: t('shortcuts.status.loading'), tone: 'muted' }
    : settings.state.runtimeError
      ? { status: t('shortcuts.status.unreadable'), tone: 'warning' }
      : (settings.runtimePresentation.value ?? {
          status: t('shortcuts.status.notLoaded'),
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
      :title="t('shortcuts.block.title')"
      :guidance="t('shortcuts.block.guidance')"
    >
      <template #actions>
        <UiButton
          :aria-label="
            t(expanded ? 'shortcuts.block.collapse' : 'shortcuts.block.expand')
          "
          :aria-expanded="expanded"
          :aria-controls="panelId"
          :disabled="settings.state.busy && !settings.state.testing"
          @click="expanded = !expanded"
          >{{
            t(
              expanded
                ? 'shortcuts.block.collapseShort'
                : 'shortcuts.block.expandShort',
            )
          }}</UiButton
        >
      </template>
      <template v-if="feedback || !settings.state.loaded" #feedback>
        <UiHint :tone="feedback ? 'danger' : 'muted'" role="status">{{
          feedback || t('shortcuts.block.loading')
        }}</UiHint>
        <UiButton
          v-if="feedback"
          :aria-label="t('shortcuts.block.reload')"
          :loading="settings.state.reading"
          :disabled="settings.isRecording.value || settings.state.busy"
          @click="settings.refresh"
          >{{ t('shortcuts.block.reloadShort') }}</UiButton
        >
      </template>
    </SettingsDocumentItem>
    <div
      v-if="expanded"
      :id="panelId"
      ref="surface"
      class="keyboard-shortcut-settings__panel"
      role="region"
      :aria-label="t('shortcuts.block.settingsLabel')"
    >
      <UiTabs
        v-model:active-id="activeTab"
        :items="tabs"
        :aria-label="t('shortcuts.block.categoriesLabel')"
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
            :aria-label="t('shortcuts.block.scopeLabel')"
            :disabled="settings.state.busy && !settings.state.testing"
          />
          <UiHint
            v-if="scope === 'global' && activeTab !== 'reference'"
            class="keyboard-shortcut-settings__intro"
            >{{ t('shortcuts.block.globalHint') }}</UiHint
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
                :label="
                  t('shortcuts.block.currentKeys', { command: row.label })
                "
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
                :aria-label="
                  t('shortcuts.block.configure', { command: row.label })
                "
                :disabled="
                  !settings.canConfigure(row.id, scope) ||
                  settings.isRecording.value
                "
                @click="begin(row.id)"
                >{{ t('shortcuts.block.configureShort') }}</UiButton
              >
              <UiIconButton
                :icon="Ellipsis"
                :label="t('shortcuts.block.options', { command: row.label })"
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
              :aria-label="
                t('shortcuts.block.configure', { command: row.label })
              "
              @focusout="leaveEditor"
            >
              <UiButton
                :ref="setRecordButton"
                class="keyboard-shortcut-settings__record"
                variant="secondary"
                :aria-label="
                  t('shortcuts.block.record', { command: row.label })
                "
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
                <span v-else>{{ t('shortcuts.block.pressKeys') }}</span>
              </UiButton>
              <UiButton
                v-if="scope === 'global'"
                :aria-label="t('shortcuts.block.test', { command: row.label })"
                :disabled="!recorder.state.candidate || !settings.canEdit.value"
                :loading="recorder.state.testing"
                @click="testCandidate"
                >{{ t('shortcuts.block.testShort') }}</UiButton
              >
              <UiButton
                variant="accent"
                :aria-label="t('shortcuts.block.apply', { command: row.label })"
                :disabled="
                  !recorder.state.candidate ||
                  !settings.canEdit.value ||
                  (scope === 'global' && !recorder.state.tested)
                "
                :loading="recorder.state.saving"
                @click="recorder.apply"
                >{{ t('shortcuts.block.applyShort') }}</UiButton
              >
              <UiButton
                :ref="setCancelButton"
                :aria-label="
                  t('shortcuts.block.cancel', { command: row.label })
                "
                :disabled="recorder.state.saving"
                @click="recorder.cancel()"
                >{{ t('shortcuts.block.cancelShort') }}</UiButton
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
                  >{{ t('shortcuts.block.cancelThenReload') }}</span
                ></template
              >
              <template v-else>
                {{
                  recorder.state.capturing
                    ? t('shortcuts.block.recordingPrompt')
                    : scope === 'global'
                      ? recorder.state.testing
                        ? t('shortcuts.block.testing')
                        : recorder.state.tested
                          ? t('shortcuts.block.testPassed')
                          : t('shortcuts.block.testFirst')
                      : t('shortcuts.block.applyToSave')
                }}
                <KeyboardShortcutKeys :chords="[['Esc']]" />
                {{ t('shortcuts.block.keyCancel')
                }}<span v-if="recorder.state.capturing"
                  >{{ t('shortcuts.block.keySeparator')
                  }}<KeyboardShortcutKeys :chords="[['Tab']]" />
                  {{ t('shortcuts.block.keyLeave') }}</span
                >{{ t('shortcuts.block.keyEnd') }}
              </template>
            </UiHint>
            <UiButton
              v-if="
                lastAction === row.id && settings.state.saveError && !feedback
              "
              class="keyboard-shortcut-settings__retry"
              :aria-label="t('shortcuts.block.reload')"
              :loading="settings.state.reading"
              :disabled="settings.isRecording.value || settings.state.busy"
              @click="settings.refresh"
              >{{ t('shortcuts.block.reloadShort') }}</UiButton
            >
          </section>
        </template>
      </div>
      <UiActionMenu
        :open="Boolean(menuRow)"
        :anchor="menuAnchor"
        :content="menuContent"
        :aria-label="t('shortcuts.block.actionsLabel')"
        size="sm"
        @select="selectMenu"
        @close="closeMenu"
      />
      <SettingsDocumentItem
        :title="t('shortcuts.block.globalTitle')"
        :description="
          settings.hasGlobalSettings.value && !hasBackgroundBindings
            ? t('shortcuts.block.globalNeedsKeys')
            : t('shortcuts.block.globalGuidance')
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
              t(
                backgroundEnabled
                  ? 'shortcuts.block.globalDisable'
                  : 'shortcuts.block.globalEnable',
              )
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
            >{{
              t(
                backgroundEnabled
                  ? 'shortcuts.block.disableShort'
                  : 'shortcuts.block.enableShort',
              )
            }}</UiButton
          >
          <UiButton
            :aria-label="t('shortcuts.block.reloadGlobal')"
            :loading="settings.state.runtimeReading"
            :disabled="settings.isRecording.value || settings.state.busy"
            @click="settings.refreshRuntime"
            >{{ t('shortcuts.block.reloadShort') }}</UiButton
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
          ><UiHint tone="warning">{{ t('shortcuts.block.sessionOnly') }}</UiHint
          ><UiButton
            :disabled="!settings.canEdit.value || settings.isRecording.value"
            @click="
              lastAction = null;
              settings.setGlobalEnabled(false);
            "
            >{{ t('shortcuts.block.retryDisable') }}</UiButton
          ></template
        >
      </SettingsDocumentItem>
      <div class="keyboard-shortcut-settings__footer">
        <UiButton
          v-if="activeTab !== 'reference'"
          :aria-label="t('shortcuts.block.restoreAll')"
          :disabled="
            !settings.canEdit.value ||
            settings.isRecording.value ||
            settings.isDefault.value
          "
          @click="
            lastAction = null;
            settings.restoreAll();
          "
          >{{ t('shortcuts.block.restoreAllShort') }}</UiButton
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
