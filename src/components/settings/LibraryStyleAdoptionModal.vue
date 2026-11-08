<script setup>
import { computed, shallowRef, watch } from 'vue';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';

const props = defineProps({ open: Boolean });
const emit = defineEmits(['close', 'adopted']);
const busy = shallowRef(false);
const preview = shallowRef(null);
const selected = shallowRef(new Set());
const error = shallowRef('');
const blocked = shallowRef(false);
const count = computed(() => selected.value.size);

function toggle(trackId, checked) {
  const next = new Set(selected.value);
  if (checked) next.add(trackId);
  else next.delete(trackId);
  selected.value = next;
}

async function load() {
  busy.value = true;
  preview.value = null;
  selected.value = new Set();
  error.value = '';
  blocked.value = false;
  try {
    const result = await window.Utawakui.previewTrackStyleAdoption();
    if (!result?.ok) throw new Error('Preview unavailable');
    preview.value = result;
    selected.value = new Set(result.rows.map(({ trackId }) => trackId));
  } catch {
    error.value = t('trackStyle.adoptionFailed');
  } finally {
    busy.value = false;
  }
}

async function apply() {
  if (busy.value || blocked.value || !preview.value || !count.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await window.Utawakui.applyTrackStyleAdoption(
      preview.value.previewId,
      [...selected.value],
    );
    if (result?.ok) {
      emit('adopted', result);
      emit('close');
      return;
    }
    blocked.value = true;
    error.value = t(
      result?.status === 'stale'
        ? 'trackStyle.adoptionStale'
        : 'trackStyle.adoptionFailed',
    );
  } catch {
    blocked.value = true;
    error.value = t('trackStyle.adoptionFailed');
  } finally {
    busy.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void load();
  },
);
</script>

<template>
  <UiModal
    :open="open"
    :title="t('trackStyle.adoptionTitle')"
    size="wide"
    max-block-size="small"
    initial-focus="dialog"
    :close-disabled="busy"
    @close="$emit('close')"
  >
    <div class="style-adoption">
      <p class="style-adoption__intro">{{ t('trackStyle.adoptionRule') }}</p>
      <UiHint v-if="error" tone="danger" role="alert">{{ error }}</UiHint>
      <UiHint v-else-if="!preview && busy" role="status">{{
        t('trackStyle.adoptionLoading')
      }}</UiHint>
      <UiHint v-else-if="preview?.rows.length === 0">{{
        t('trackStyle.adoptionEmpty')
      }}</UiHint>
      <ul v-if="preview?.rows.length" class="style-adoption__list">
        <li
          v-for="(row, index) in preview.rows"
          :key="row.trackId"
          class="style-adoption__row"
        >
          <UiCheckbox
            :id="`style-adoption-${index}`"
            :label="row.artist ? t('trackStyle.adoptionTrack', row) : row.title"
            :model-value="selected.has(row.trackId)"
            :disabled="busy || blocked"
            @update:model-value="toggle(row.trackId, $event)"
          />
          <UiChip dir="auto">{{ row.label }}</UiChip>
        </li>
      </ul>
    </div>
    <template #footer>
      <div class="style-adoption__footer">
        <UiHint v-if="preview" role="status">
          {{
            t('trackStyle.adoptionSelection', {
              count,
              total: preview.rows.length,
            })
          }}
        </UiHint>
        <div class="style-adoption__actions">
          <UiButton
            variant="secondary"
            :disabled="busy"
            @click="$emit('close')"
            >{{ t('trackStyle.adoptionCancel') }}</UiButton
          >
          <UiButton
            v-if="error"
            variant="accent"
            :disabled="busy"
            @click="load"
            >{{ t('trackStyle.adoptionReload') }}</UiButton
          >
          <UiButton
            v-else
            variant="accent"
            :disabled="busy || !count"
            @click="apply"
            >{{ t('trackStyle.adoptionApply', { count }) }}</UiButton
          >
        </div>
      </div>
    </template>
  </UiModal>
</template>

<style scoped>
.style-adoption,
.style-adoption__list {
  display: grid;
  gap: var(--ui-space-2);
}

.style-adoption__intro,
.style-adoption__list {
  margin: 0;
}

.style-adoption__list {
  padding: 0;
  list-style: none;
}

.style-adoption__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, max-content);
  align-items: center;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-1);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.style-adoption__footer,
.style-adoption__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.style-adoption__footer {
  inline-size: 100%;
  justify-content: space-between;
}

.style-adoption__actions {
  margin-inline-start: auto;
}
</style>
