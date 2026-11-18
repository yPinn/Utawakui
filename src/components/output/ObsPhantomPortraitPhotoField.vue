<script setup>
import { watch } from 'vue';
import { useOutputPhotoDraft } from '../../composables/output/useOutputPhotoDraft.js';
import { ImagePlus, RotateCcw } from '../../icons/index.js';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsPhantomPortraitImageModal from './ObsPhantomPortraitImageModal.vue';
import ObsPhantomPortraitThumb from './ObsPhantomPortraitThumb.vue';
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
const {
  draft: photoDraft,
  busy,
  choosing,
  error,
  choose: choosePhoto,
  close: closePhoto,
} = useOutputPhotoDraft();
watch(busy, (value) => emit('update:busy', value), { flush: 'sync' });

function applyPhoto(id) {
  emit('update:modelValue', id);
  photoDraft.value = null;
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
        <ObsPhantomPortraitThumb
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
              :loading="choosing"
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
        t(error)
      }}</UiHint>
    </UiStack>
  </ObsAppearanceControlRow>
  <ObsPhantomPortraitImageModal
    v-if="photoDraft"
    :photo="photoDraft"
    @close="closePhoto"
    @apply="applyPhoto"
  />
</template>
