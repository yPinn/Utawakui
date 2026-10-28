<script setup>
import { shallowRef } from 'vue';
import {
  SHORTCUT_REFERENCE_SECTIONS,
  SHORTCUT_USAGE_NOTES,
} from '../../utils/keyboardShortcutSettingsPresentation.js';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import KeyboardShortcutKeys from './KeyboardShortcutKeys.vue';
const openSection = shallowRef('navigation');
const sections = SHORTCUT_REFERENCE_SECTIONS.map((section) => {
  const groups = new Map();
  for (const row of section.rows) {
    if (!groups.has(row.context)) groups.set(row.context, []);
    groups.get(row.context).push(row);
  }
  return {
    ...section,
    groups: [...groups].map(([context, rows]) => ({ context, rows })),
  };
});
function setSectionOpen(id, open) {
  if (open) openSection.value = id;
  else if (openSection.value === id) openSection.value = null;
}
</script>
<template>
  <div class="keyboard-shortcut-reference">
    <UiDisclosure
      label="設定方式"
      :open="openSection === 'usage'"
      @update:open="setSectionOpen('usage', $event)"
    >
      <UiHint v-for="note in SHORTCUT_USAGE_NOTES" :key="note">{{
        note
      }}</UiHint>
      <div class="keyboard-shortcut-reference__usage">
        <KeyboardShortcutKeys
          :chords="[['↑'], ['↓'], ['M']]"
          label="預設音量與靜音鍵"
        />
        <UiHint>使用預設鍵時，也可同時按住</UiHint
        ><KeyboardShortcutKeys :chords="[['Shift']]" />
      </div>
    </UiDisclosure>
    <UiHint>以下為固定操作；先點選對應面板或區域再使用。</UiHint>
    <UiDisclosure
      v-for="section in sections"
      :key="section.id"
      :label="section.title"
      :open="openSection === section.id"
      @update:open="setSectionOpen(section.id, $event)"
    >
      <UiHint v-if="section.guidance">{{ section.guidance }}</UiHint>
      <dl>
        <div
          v-for="group in section.groups"
          :key="group.context"
          class="keyboard-shortcut-reference__group"
        >
          <dt>{{ group.context }}</dt>
          <dd class="keyboard-shortcut-reference__bindings">
            <div
              v-for="(row, index) in group.rows"
              :key="index"
              class="keyboard-shortcut-reference__row"
            >
              <KeyboardShortcutKeys
                :chords="row.chords"
                :label="row.action + '快捷鍵'"
              />
              <div class="keyboard-shortcut-reference__action">
                <p>{{ row.action }}</p>
                <UiHint v-if="row.note">{{ row.note }}</UiHint>
              </div>
            </div>
          </dd>
        </div>
      </dl>
    </UiDisclosure>
  </div>
</template>
<style scoped>
.keyboard-shortcut-reference {
  display: grid;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-3);
  min-inline-size: 0;
}
dl,
dd,
p {
  margin: 0;
}
.keyboard-shortcut-reference__group {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 2.4fr);
  gap: var(--ui-space-3);
  align-items: start;
  padding-block: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.keyboard-shortcut-reference__group:first-child {
  border-block-start: 0;
}
.keyboard-shortcut-reference__bindings {
  display: grid;
  gap: var(--ui-space-3);
}
.keyboard-shortcut-reference__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-3);
  align-items: start;
}
dt,
dd {
  min-inline-size: 0;
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  overflow-wrap: break-word;
}
.keyboard-shortcut-reference__action {
  display: grid;
  gap: var(--ui-space-1);
}
.keyboard-shortcut-reference__usage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}
@container shortcut-settings (max-width:38rem) {
  .keyboard-shortcut-reference__group,
  .keyboard-shortcut-reference__row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }
}
</style>
