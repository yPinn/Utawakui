<script setup>
import { nextTick, shallowRef, useTemplateRef } from 'vue';
import { Check, Pencil, X } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';

const { editor } = defineProps({
  editor: { type: Object, required: true },
  disabled: Boolean,
});
defineEmits(['reload']);
const panel = useTemplateRef('panel');
const editingId = shallowRef(null);

async function focusControl(selector) {
  await nextTick();
  panel.value?.querySelector(selector)?.focus();
}

function editTag(id) {
  editingId.value = id;
  void focusControl(`#track-style-${id}`);
}

function addTag(label) {
  const previous = editor.rows.value.length;
  editor.add(label);
  if (editor.rows.value.length > previous) {
    const id = editor.rows.value.at(-1).id;
    if (label) void focusControl(`#track-style-edit-${id}`);
    else editTag(id);
  }
}

function removeTag(row) {
  editor.remove(row);
  void focusControl('[data-style-add]');
}
</script>

<template>
  <section
    ref="panel"
    class="track-style"
    aria-labelledby="track-style-heading"
  >
    <h3 id="track-style-heading">{{ t('trackStyle.heading') }}</h3>
    <UiNotice
      v-if="editor.error.value"
      tone="warning"
      :message="editor.error.value"
      :action-label="!editor.snapshot.value ? t('trackStyle.retry') : ''"
      @action="$emit('reload')"
    />
    <p v-if="!editor.snapshot.value && editor.pending.value" role="status">
      {{ t('trackStyle.loading') }}
    </p>
    <template v-if="editor.snapshot.value">
      <UiNotice
        v-if="editor.snapshot.value.needsReview"
        tone="warning"
        :message="t('trackStyle.audioChanged')"
      />
      <section
        class="track-style__group"
        aria-labelledby="track-style-confirmed"
      >
        <div class="track-style__header">
          <h4 id="track-style-confirmed">{{ t('trackStyle.confirmed') }}</h4>
          <UiButton
            data-style-add
            variant="secondary"
            :disabled="disabled || editor.rows.value.length >= 24"
            @click="addTag()"
          >
            {{ t('trackStyle.add') }}
          </UiButton>
        </div>
        <p v-if="!editor.rows.value.length">{{ t('trackStyle.noTags') }}</p>
        <div v-else class="track-style__list">
          <div
            v-for="row in editor.rows.value"
            :key="row.id"
            class="track-style__row"
            :class="{
              'track-style__row--editing':
                editingId === row.id || !row.label.trim(),
            }"
          >
            <UiTextField
              v-if="editingId === row.id || !row.label.trim()"
              :id="`track-style-${row.id}`"
              :label="t('trackStyle.label')"
              label-hidden
              :model-value="row.label"
              :maxlength="64"
              :disabled="disabled"
              @update:model-value="editor.change(row.id, $event)"
            />
            <template v-else>
              <UiChip tone="accent" dir="auto">{{ row.label }}</UiChip>
              <UiIconButton
                :id="`track-style-edit-${row.id}`"
                :icon="Pencil"
                :disabled="disabled"
                :label="t('trackStyle.editNamed', { label: row.label })"
                @click="editTag(row.id)"
              />
            </template>
            <UiIconButton
              :icon="X"
              :disabled="disabled"
              :label="t('trackStyle.removeNamed', { label: row.label })"
              @click="removeTag(row)"
            />
          </div>
        </div>
      </section>
      <section
        class="track-style__group"
        aria-labelledby="track-style-candidates"
      >
        <h4 id="track-style-candidates">{{ t('trackStyle.candidates') }}</h4>
        <UiNotice
          v-if="editor.snapshot.value.candidatesUnavailable"
          tone="warning"
          :message="t('trackStyle.candidatesUnavailable')"
        />
        <p v-else-if="!editor.visibleCandidates.value.length">
          {{ t('trackStyle.noCandidates') }}
        </p>
        <div v-else class="track-style__list">
          <div
            v-for="{ label } in editor.visibleCandidates.value"
            :key="label"
            class="track-style__row track-style__row--candidate"
          >
            <UiChip dir="auto">{{ label }}</UiChip>
            <UiIconButton
              :icon="Check"
              :disabled="disabled || editor.rows.value.length >= 24"
              :label="t('trackStyle.acceptNamed', { label })"
              @click="addTag(label)"
            />
          </div>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.track-style,
.track-style__group {
  display: grid;
  gap: var(--ui-space-2);
}

.track-style {
  gap: var(--ui-space-3);
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.track-style h3,
.track-style h4,
.track-style p {
  margin: 0;
}

.track-style h3 {
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
}

.track-style h4 {
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-subtitle-weight);
}

.track-style__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.track-style__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1) var(--ui-space-3);
  min-inline-size: 0;
}

.track-style__row {
  display: flex;
  align-items: center;
  min-inline-size: 0;
  max-inline-size: 100%;
}

.track-style__row--editing {
  flex: 1 1 100%;
  gap: var(--ui-space-1);
}

.track-style__row--editing > :first-child {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.track-style__row :deep(.ui-chip__label) {
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
