<script setup>
import { computed } from 'vue';
import { catalogKey, t } from '../../utils/i18n.js';
import { UI_LOCALE } from '../../utils/uiLocale.js';
import { TRACK_LANGUAGE_OPTIONS } from '../../composables/useTrackLanguageEditor.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';

const { editor } = defineProps({
  editor: { type: Object, required: true },
  disabled: Boolean,
});
defineEmits(['reload']);

// Codes outside the offered list fall back to the platform's language name.
function languageName(code) {
  if (TRACK_LANGUAGE_OPTIONS.includes(code))
    return t(`trackLanguage.names.${catalogKey(code)}`);
  try {
    return (
      new Intl.DisplayNames([UI_LOCALE], {
        type: 'language',
      }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

const primaryOptions = computed(() => [
  { value: '', label: t('trackLanguage.primaryNone') },
  ...editor.languages.value.map((code) => ({
    value: code,
    label: languageName(code),
  })),
]);
</script>

<template>
  <section class="track-language" aria-labelledby="track-language-heading">
    <h3 id="track-language-heading">{{ t('trackLanguage.heading') }}</h3>
    <UiNotice
      v-if="editor.error.value"
      tone="warning"
      :message="editor.error.value"
      :action-label="!editor.snapshot.value ? t('trackLanguage.retry') : ''"
      @action="$emit('reload')"
    />
    <p v-if="!editor.snapshot.value && editor.pending.value" role="status">
      {{ t('trackLanguage.loading') }}
    </p>
    <template v-if="editor.snapshot.value">
      <UiNotice
        v-if="editor.needsConfirmation.value"
        tone="warning"
        :message="t('trackLanguage.audioChanged')"
        :action-label="t('trackLanguage.confirm')"
        :action-disabled="disabled"
        @action="editor.confirm()"
      />
      <div
        class="track-language__options"
        role="group"
        aria-labelledby="track-language-heading"
      >
        <UiCheckbox
          v-for="code in editor.choices.value"
          :id="`track-language-${code}`"
          :key="code"
          :label="languageName(code)"
          :model-value="editor.languages.value.includes(code)"
          :disabled="disabled"
          @update:model-value="editor.toggle(code, $event)"
        />
      </div>
      <UiSelect
        v-if="editor.needsPrimary.value"
        id="track-language-primary"
        :label="t('trackLanguage.primary')"
        :options="primaryOptions"
        :model-value="editor.primary.value ?? ''"
        :disabled="disabled"
        @update:model-value="editor.setPrimary($event)"
      />
    </template>
  </section>
</template>

<style scoped>
.track-language {
  display: grid;
  gap: var(--ui-space-2);
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.track-language h3,
.track-language p {
  margin: 0;
}

.track-language h3 {
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
}

.track-language__options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1) var(--ui-space-4);
}
</style>
