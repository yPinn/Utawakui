<script setup>
import { computed, shallowRef, watch } from 'vue';
import { t } from '../../utils/i18n.js';
import {
  TRACK_LANGUAGE_OPTIONS,
  formatTrackLanguages,
  trackLanguageName,
} from '../../utils/trackLanguageNames.js';
import { useTrackLanguageIndex } from '../../composables/useTrackLanguageIndex.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiSelect from '../ui/UiSelect.vue';

const MAX_TRACKS = 1000;
const props = defineProps({
  open: Boolean,
  tracks: { type: Array, default: () => [] },
});
const emit = defineEmits(['close', 'applied']);
const index = useTrackLanguageIndex();
const language = shallowRef('');
const selected = shallowRef(new Set());
const busy = shallowRef(false);
const error = shallowRef('');

const rows = computed(() =>
  props.tracks.slice(0, MAX_TRACKS).map((track) => ({
    track,
    saved: index.languagesOf(track.id),
  })),
);
const count = computed(() => selected.value.size);
const languageOptions = computed(() =>
  TRACK_LANGUAGE_OPTIONS.map((code) => ({
    value: code,
    label: trackLanguageName(code),
  })),
);

// Unannotated tracks start ticked; tracks with saved languages stay opt-in.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    language.value = '';
    error.value = '';
    selected.value = new Set(
      rows.value
        .filter(({ saved }) => !saved.length)
        .map(({ track }) => track.id),
    );
  },
  { immediate: true },
);

function toggle(trackId, checked) {
  const next = new Set(selected.value);
  if (checked) next.add(trackId);
  else next.delete(trackId);
  selected.value = next;
}

function rowLabel({ track, saved }) {
  const title = track.artist
    ? t('trackLanguage.batch.track', {
        title: track.title,
        artist: track.artist,
      })
    : track.title;
  return saved.length
    ? t('trackLanguage.batch.saved', {
        track: title,
        languages: formatTrackLanguages(saved),
      })
    : title;
}

async function apply() {
  if (busy.value || !language.value || !count.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await window.Utawakui.applyTrackLanguageBatch(
      [...selected.value],
      language.value,
    );
    if (!result?.ok) throw new Error('Batch not applied');
    await index.refresh();
    emit('applied', result);
    emit('close');
  } catch {
    error.value = t('trackLanguage.failed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UiModal
    :open="open"
    :title="t('trackLanguage.batch.title')"
    size="wide"
    max-block-size="small"
    initial-focus="dialog"
    :close-disabled="busy"
    @close="$emit('close')"
  >
    <div class="language-batch">
      <UiSelect
        id="track-language-batch-language"
        :label="t('trackLanguage.heading')"
        :placeholder="t('trackLanguage.batch.choose')"
        :options="languageOptions"
        :model-value="language"
        :disabled="busy"
        @update:model-value="language = $event"
      />
      <UiHint v-if="error" tone="danger" role="alert">{{ error }}</UiHint>
      <ul class="language-batch__list">
        <li v-for="(row, rowIndex) in rows" :key="row.track.id">
          <UiCheckbox
            :id="`track-language-batch-${rowIndex}`"
            :label="rowLabel(row)"
            :model-value="selected.has(row.track.id)"
            :disabled="busy"
            @update:model-value="toggle(row.track.id, $event)"
          />
        </li>
      </ul>
    </div>
    <template #footer>
      <div class="language-batch__footer">
        <UiHint role="status">
          {{
            t(
              'trackLanguage.batch.selection',
              { count, total: rows.length },
              rows.length,
            )
          }}
        </UiHint>
        <div class="language-batch__actions">
          <UiButton
            variant="secondary"
            :disabled="busy"
            @click="$emit('close')"
            >{{ t('trackLanguage.batch.cancel') }}</UiButton
          >
          <UiButton
            variant="accent"
            :disabled="busy || !language || !count"
            @click="apply"
            >{{ t('trackLanguage.batch.apply', { count }, count) }}</UiButton
          >
        </div>
      </div>
    </template>
  </UiModal>
</template>

<style scoped>
.language-batch {
  display: grid;
  gap: var(--ui-space-3);
}

.language-batch__list {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.language-batch__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  inline-size: 100%;
}

.language-batch__actions {
  display: flex;
  gap: var(--ui-space-2);
}
</style>
