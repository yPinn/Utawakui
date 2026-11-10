<script setup>
import { computed, ref, shallowRef, useId } from 'vue';
import { t } from '../../utils/i18n.js';
import {
  pairTranslationText,
  translationImportLimit,
  translationTextLimit,
} from '../../utils/lyricsTranslationImport.js';
import UiButton from '../ui/UiButton.vue';
import UiFilePickerButton from '../ui/UiFilePickerButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const props = defineProps({
  context: { type: Object, required: true },
  saved: { type: Object, required: true },
  languages: { type: Array, required: true },
  initialLanguage: { type: String, required: true },
});
const emit = defineEmits(['close', 'saved']);
const id = useId();
const language = shallowRef(props.initialLanguage);
const importedText = ref({ 'zh-TW': '', en: '' });
const drafts = ref(
  Object.fromEntries(
    props.languages.map(({ id }) => [
      id,
      Object.assign(
        Object.create(null),
        Object.fromEntries(
          props.saved.rows[id].map((row) => [row.lineId, row.text]),
        ),
      ),
    ]),
  ),
);
const error = shallowRef('');
const saving = shallowRef(false);
const reading = shallowRef(false);
const busy = computed(() => saving.value || reading.value);

function preview() {
  const paired = pairTranslationText(
    importedText.value[language.value],
    props.context.lines,
  );
  error.value = paired ? '' : t('lyricsTranslation.invalidImport');
  if (paired)
    drafts.value[language.value] = Object.assign(Object.create(null), paired);
}

async function loadFile(file) {
  reading.value = true;
  try {
    if (
      !file.name.toLowerCase().endsWith('.txt') ||
      file.size > translationImportLimit
    )
      throw new Error('invalid TXT');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    importedText.value[language.value] = decoder.decode(
      await file.arrayBuffer(),
    );
    preview();
  } catch {
    error.value = t('lyricsTranslation.invalidFile');
  } finally {
    reading.value = false;
  }
}

async function save() {
  const { trackId, filename, session, documentId, lines } = props.context;
  const rows = Object.fromEntries(
    props.languages.map(({ id }) => [
      id,
      lines.flatMap(({ lineId, text: original }) => {
        const text = drafts.value[id][lineId]?.trim();
        return text ? [{ lineId, original, text }] : [];
      }),
    ]),
  );
  error.value = '';
  saving.value = true;
  try {
    const saved = await window.Utawakui.saveLyricsTranslations(
      trackId,
      filename,
      session,
      documentId,
      props.saved.revision,
      rows,
    );
    emit('saved', saved, language.value);
  } catch {
    error.value = t('lyricsTranslation.saveFailed');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UiModal
    open
    size="wide"
    :title="t('lyricsTranslation.manage')"
    @close="!busy && emit('close')"
  >
    <div class="lyrics-translation-editor">
      <UiSegmentedControl
        v-model="language"
        :items="languages"
        :aria-label="t('lyricsTranslation.language')"
        :disabled="busy"
        @update:model-value="error = ''"
      />
      <UiTextarea
        :id="`${id}-import`"
        v-model="importedText[language]"
        :label="t('lyricsTranslation.importText')"
        :hint="t('lyricsTranslation.importHint')"
        :maxlength="translationImportLimit"
        :disabled="busy"
        :rows="3"
      />
      <div class="lyrics-translation-editor__actions">
        <UiFilePickerButton
          accept=".txt,text/plain"
          :disabled="busy"
          @select="loadFile"
        >
          {{ t('lyricsTranslation.importFile') }}
        </UiFilePickerButton>
        <UiButton
          :disabled="busy || !importedText[language].trim()"
          @click="preview"
        >
          {{ t('lyricsTranslation.pair') }}
        </UiButton>
      </div>
      <UiNotice v-if="error" tone="danger" :message="error" compact />
      <UiHint>{{ t('lyricsTranslation.reviewHint') }}</UiHint>
      <ol class="lyrics-translation-editor__rows">
        <li v-for="(line, index) in context.lines" :key="line.lineId">
          <div class="lyrics-translation-editor__pair">
            <span dir="auto">{{ line.text }}</span>
            <UiTextarea
              :id="`${id}-${index}`"
              v-model="drafts[language][line.lineId]"
              :label="t('lyricsTranslation.row', { number: index + 1 })"
              :maxlength="translationTextLimit"
              :disabled="busy"
              :rows="1"
              label-hidden
            />
          </div>
        </li>
      </ol>
    </div>
    <template #footer>
      <UiButton :disabled="busy" @click="emit('close')">{{
        t('common.cancel')
      }}</UiButton>
      <UiButton
        variant="accent"
        :loading="saving"
        :disabled="reading"
        @click="save"
      >
        {{ t('common.save') }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.lyrics-translation-editor {
  display: grid;
  gap: var(--ui-space-3);
}
.lyrics-translation-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.lyrics-translation-editor__rows {
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
  padding-inline-start: var(--ui-space-5);
}
.lyrics-translation-editor__rows li {
  padding-block-start: var(--ui-space-2);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.lyrics-translation-editor__pair {
  display: grid;
  gap: var(--ui-space-2);
}
.lyrics-translation-editor__pair span {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (min-width: 700px) {
  .lyrics-translation-editor__pair {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
    gap: var(--ui-space-4);
  }
}
</style>
