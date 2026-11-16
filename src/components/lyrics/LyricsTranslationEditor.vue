<script setup>
import { computed, ref, shallowRef, useId, useTemplateRef, watch } from 'vue';
import { t } from '../../utils/i18n.js';
import { UI_LOCALE } from '../../utils/uiLocale.js';
import {
  pairTranslationText,
  translationImportLimit,
  translationTextLimit,
} from '../../utils/lyricsTranslationImport.js';
import UiButton from '../ui/UiButton.vue';
import UiFilePickerButton from '../ui/UiFilePickerButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const props = defineProps({
  context: { type: Object, required: true },
  saved: { type: Object, required: true },
  languages: { type: Array, required: true },
  initialLanguage: { type: String, required: true },
});
const emit = defineEmits(['busy', 'saved']);
const id = useId();
const reviewScroll = useTemplateRef('reviewScroll');
const language = shallowRef(props.initialLanguage);
const importedText = ref({ 'zh-TW': '', en: '' });
const savedDrafts = computed(() =>
  Object.fromEntries(
    props.languages.map(({ id }) => [
      id,
      Object.fromEntries(
        props.saved.rows[id].map((row) => [row.lineId, row.text]),
      ),
    ]),
  ),
);
const drafts = ref(
  Object.fromEntries(props.languages.map(({ id }) => [id, savedDraft(id)])),
);
const error = shallowRef('');
const skippedRanges = shallowRef([]);
const saving = shallowRef(false);
const reading = shallowRef(false);
const savedFeedback = shallowRef(false);
const busy = computed(() => saving.value || reading.value);
watch(busy, (value) => emit('busy', value));
const hasDraftEdits = computed(() =>
  props.languages.some(({ id }) =>
    props.context.lines.some(
      ({ lineId }) =>
        (drafts.value[id][lineId] ?? '').trim() !==
        (savedDrafts.value[id][lineId] ?? ''),
    ),
  ),
);
const canReset = computed(() => {
  const id = language.value;
  return (
    Boolean(
      importedText.value[id] || error.value || skippedRanges.value.length,
    ) ||
    props.context.lines.some(
      ({ lineId }) =>
        (drafts.value[id][lineId] ?? '') !==
        (savedDrafts.value[id][lineId] ?? ''),
    )
  );
});
const skippedNotice = computed(() =>
  t('lyricsTranslation.skippedBlocks', {
    ranges: new Intl.ListFormat(UI_LOCALE).format(
      skippedRanges.value.map(([start, end]) =>
        start === end ? String(start) : `${start}–${end}`,
      ),
    ),
  }),
);

function clearNotice() {
  error.value = '';
  skippedRanges.value = [];
}

function savedDraft(id) {
  return Object.assign(Object.create(null), savedDrafts.value[id]);
}

function resetDraft() {
  const id = language.value;
  importedText.value[id] = '';
  drafts.value[id] = savedDraft(id);
  clearNotice();
  reviewScroll.value?.scrollTo({ top: 0 });
}

function preview() {
  clearNotice();
  const paired = pairTranslationText(
    importedText.value[language.value],
    props.context.lines,
  );
  if (!paired || paired.error) {
    switch (paired?.error) {
      case 'sourceMismatch':
        error.value = t('lyricsTranslation.sourceMismatch');
        break;
      case 'tooManyRows':
        error.value = t('lyricsTranslation.tooManyRows', {
          pasted: paired.count,
          original: props.context.lines.length,
        });
        break;
      case 'lineTooLong':
        error.value = t('lyricsTranslation.lineTooLong');
        break;
      default:
        error.value = t('lyricsTranslation.invalidImport');
    }
    return;
  }
  const draft = drafts.value[language.value];
  drafts.value[language.value] = Object.assign(
    Object.create(null),
    paired.mode === 'blocks' ? draft : null,
    paired.rows,
  );
  skippedRanges.value = paired.skipped ?? [];
  reviewScroll.value?.scrollTo({ top: 0 });
}

async function loadFile(file) {
  clearNotice();
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
  const context = props.context;
  const { trackId, filename, session, documentId, lines } = context;
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
  savedFeedback.value = false;
  try {
    const saved = await window.Utawakui.saveLyricsTranslations(
      trackId,
      filename,
      session,
      documentId,
      props.saved.revision,
      rows,
    );
    savedFeedback.value = true;
    emit('saved', saved, context);
  } catch {
    error.value = t('lyricsTranslation.saveFailed');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="lyrics-translation-workspace">
    <UiScrollLayout
      class="lyrics-translation-editor"
      content-class="lyrics-translation-editor__panes"
      scrollbar-reserve="overflow"
    >
      <div class="lyrics-translation-editor__import">
        <UiSegmentedControl
          v-model="language"
          :items="languages"
          :aria-label="t('lyricsTranslation.language')"
          :disabled="busy"
          @update:model-value="clearNotice"
        />
        <UiTextarea
          :id="`${id}-import`"
          v-model="importedText[language]"
          class="lyrics-translation-editor__paste"
          :label="t('lyricsTranslation.importText')"
          :hint="t('lyricsTranslation.importHint')"
          :maxlength="translationImportLimit"
          :disabled="busy"
          :rows="8"
          fill
          resize="none"
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
            variant="secondary"
            :disabled="busy || !importedText[language].trim()"
            @click="preview"
          >
            {{ t('lyricsTranslation.pair') }}
          </UiButton>
          <UiButton
            :disabled="busy || !canReset"
            :title="t('lyricsTranslation.resetHint')"
            @click="resetDraft"
          >
            {{ t('lyricsTranslation.reset') }}
          </UiButton>
        </div>
        <UiNotice v-if="error" tone="danger" :message="error" compact />
        <UiNotice
          v-else-if="skippedRanges.length"
          tone="warning"
          :message="skippedNotice"
          compact
        />
      </div>
      <section
        class="lyrics-translation-editor__review"
        :aria-labelledby="`${id}-review`"
      >
        <h3 :id="`${id}-review`" class="lyrics-translation-editor__heading">
          {{ t('lyricsTranslation.review') }}
        </h3>
        <UiHint>{{ t('lyricsTranslation.reviewHint') }}</UiHint>
        <UiScrollLayout
          ref="reviewScroll"
          class="lyrics-translation-editor__review-scroll"
          viewport-class="lyrics-translation-editor__review-viewport"
          scrollbar-reserve="overflow"
        >
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
                  resize="content"
                  label-hidden
                />
              </div>
            </li>
          </ol>
        </UiScrollLayout>
      </section>
    </UiScrollLayout>
    <div class="lyrics-translation-workspace__footer">
      <UiHint v-if="savedFeedback && !hasDraftEdits" role="status">
        {{ t('lyricsTranslation.saved') }}
      </UiHint>
      <UiButton
        variant="accent"
        :loading="saving"
        :disabled="reading || !hasDraftEdits"
        @click="save"
      >
        {{ t('common.save') }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.lyrics-translation-workspace {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-block-size: 0;
  padding: var(--ui-space-3) var(--ui-space-4) 0;
}
.lyrics-translation-workspace__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-2);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.lyrics-translation-editor {
  --ui-scroll-layout-padding-inline-start: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-inline-end: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-block-start: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-block-end: var(--ui-focus-safe-inset);

  color: var(--ui-color-text);
}
.lyrics-translation-editor :deep(.lyrics-translation-editor__panes),
.lyrics-translation-editor__import,
.lyrics-translation-editor__review {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-block-size: 0;
  align-content: start;
}
.lyrics-translation-editor :deep(.lyrics-translation-editor__panes) {
  gap: var(--ui-space-4);
}
.lyrics-translation-editor__import {
  gap: var(--ui-space-3);
}
.lyrics-translation-editor__review {
  gap: var(--ui-space-1);
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.lyrics-translation-editor__heading {
  margin: 0;
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}
.lyrics-translation-editor__review-scroll {
  --ui-scroll-layout-padding-inline-start: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-inline-end: var(--ui-focus-safe-inset);
}
.lyrics-translation-editor__review-scroll
  :deep(.lyrics-translation-editor__review-viewport) {
  block-size: auto;
  overflow: visible;
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
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-2);
}
.lyrics-translation-editor__pair span {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.lyrics-translation-editor__paste {
  --ui-textarea-fill-block-size: auto;
}
@media (height >= 36rem) {
  @container (width >= 42rem) {
    .lyrics-translation-editor :deep(.lyrics-translation-editor__panes) {
      block-size: 100%;
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      grid-template-rows: minmax(0, 1fr);
      align-content: stretch;
    }
    .lyrics-translation-editor__import {
      grid-template-rows: auto minmax(0, 1fr) auto;
      align-content: stretch;
    }
    .lyrics-translation-editor__paste {
      --ui-textarea-fill-block-size: 100%;
      --ui-textarea-fill-main-rows: auto minmax(0, 1fr);

      grid-template-rows: minmax(0, 1fr) auto;
    }
    .lyrics-translation-editor__review {
      grid-template-rows: auto auto minmax(0, 1fr);
      padding-block-start: 0;
      padding-inline-start: var(--ui-space-4);
      border-block-start: 0;
      border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
    }
    .lyrics-translation-editor__review-scroll
      :deep(.lyrics-translation-editor__review-viewport) {
      block-size: 100%;
      overflow: hidden auto;
    }
  }
}
</style>
