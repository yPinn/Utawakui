<script setup>
import { onBeforeUnmount, shallowRef } from 'vue';
import { ImagePlus, RotateCcw } from '../../icons/index.js';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsCutoutPortraitImageModal from './ObsCutoutPortraitImageModal.vue';
import ObsCutoutPortraitThumb from './ObsCutoutPortraitThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiStack from '../ui/UiStack.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, required: true },
  background: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue', 'update:busy']);
const busy = shallowRef(false);
const error = shallowRef('');
const photoDraft = shallowRef(null);
let mounted = true;
onBeforeUnmount(() => {
  mounted = false;
  if (photoDraft.value) discardDraft(photoDraft.value.id);
});

function discardDraft(id) {
  void window.Utawakui?.discardOutputPortrait?.(id)?.catch(() => undefined);
}

function finishPhoto() {
  photoDraft.value = null;
  busy.value = false;
  emit('update:busy', false);
}

function closePhoto() {
  discardDraft(photoDraft.value.id);
  finishPhoto();
}

function applyPhoto(id) {
  emit('update:modelValue', id);
  finishPhoto();
}

async function choosePhoto() {
  if (busy.value) return;
  busy.value = true;
  emit('update:busy', true);
  error.value = '';
  try {
    const result = await window.Utawakui?.chooseOutputPortrait?.();
    if (!mounted) {
      if (result?.status === 'ok') discardDraft(result.id);
      return;
    }
    if (result?.status === 'ok') photoDraft.value = result;
    else if (result?.status !== 'cancelled') {
      error.value = t(
        result?.status === 'invalid-image'
          ? 'outputPanel.portrait.invalidImage'
          : 'outputPanel.portrait.importFailed',
      );
    }
  } catch {
    if (mounted) error.value = t('outputPanel.portrait.importFailed');
  } finally {
    if (mounted && !photoDraft.value) finishPhoto();
  }
}

function resetPhoto() {
  error.value = '';
  emit('update:modelValue', '');
}
</script>

<template>
  <ObsAppearanceControlRow
    :control-id="id"
    :label="label"
    :labels-control="false"
    stacked
  >
    <UiStack
      :id="id"
      direction="column"
      :gap="1"
      role="group"
      :aria-label="label"
    >
      <UiStack align="center" :gap="3">
        <ObsCutoutPortraitThumb
          size="var(--ui-artwork-size-lg)"
          :photo-id="modelValue"
          :background="background"
        />
        <UiStack direction="column" align="start" :gap="1">
          <UiHint>
            {{
              t(
                modelValue
                  ? 'outputPanel.portrait.customSource'
                  : 'outputPanel.portrait.noCustomPhoto',
              )
            }}
          </UiHint>
          <UiStack align="center" :gap="1">
            <UiIconButton
              :icon="ImagePlus"
              :label="
                t(
                  modelValue
                    ? 'outputPanel.portrait.replacePhoto'
                    : 'outputPanel.portrait.choosePhoto',
                )
              "
              :tooltip-detail="t('outputPanel.portrait.photoHint')"
              :aria-describedby="error ? `${id}-error` : `${id}-format`"
              :loading="busy && !photoDraft"
              @click="choosePhoto"
            />
            <UiIconButton
              v-if="modelValue"
              :icon="RotateCcw"
              :label="t('outputPanel.portrait.useArtistPhoto')"
              :disabled="busy"
              @click="resetPhoto"
            />
          </UiStack>
        </UiStack>
      </UiStack>
      <span :id="`${id}-format`" class="ui-visually-hidden">
        {{ t('outputPanel.portrait.photoHint') }}
      </span>
      <UiHint v-if="error" :id="`${id}-error`" tone="danger" role="alert">{{
        error
      }}</UiHint>
    </UiStack>
  </ObsAppearanceControlRow>
  <ObsCutoutPortraitImageModal
    v-if="photoDraft"
    :photo="photoDraft"
    @close="closePhoto"
    @apply="applyPhoto"
  />
</template>
