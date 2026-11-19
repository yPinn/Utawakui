<script setup>
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue';
import { Check, Pencil, Plus, Trash2 } from '../../icons/index.js';
import {
  canAddPhantomPortraitSet,
  PHANTOM_PORTRAIT_DEFAULTS,
  MAX_PHANTOM_PORTRAIT_SETS,
} from '../../../shared/outputAppearance.mjs';
import {
  contentLangAttribute,
  trackContentLang,
} from '../../utils/contentLanguage.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiStack from '../ui/UiStack.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import ObsPhantomPortraitThumb from './ObsPhantomPortraitThumb.vue';
import { phantomPortraitColorToken } from './phantomPortraitPalette.js';

const props = defineProps({
  items: { type: Array, required: true },
  activeId: { type: String, required: true },
  active: { type: Boolean, default: false },
  track: { type: Object, default: null },
  selectionOnly: { type: Boolean, default: false },
  stretch: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  thumbnailFor: { type: Function, default: null },
});
const emit = defineEmits(['select', 'add', 'edit', 'remove']);

const alphabet = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});
const grid = useTemplateRef('grid');
const search = useTemplateRef('search');
const query = shallowRef('');
const artistName = computed(() => props.track?.artist?.trim());

function portraitColor(name) {
  return `var(${phantomPortraitColorToken(name, props.track?.id)})`;
}

const defaultCard = computed(() => {
  const name = t('outputPanel.portrait.defaultSet');
  return {
    id: '',
    name,
    label: artistName.value
      ? t('outputPanel.portrait.defaultNamedSet', { name: artistName.value })
      : name,
    photoId: PHANTOM_PORTRAIT_DEFAULTS.phantomPortraitPhoto,
    color: portraitColor(artistName.value),
  };
});
const customCards = computed(() =>
  props.items
    .map((item) => {
      const customName = item.phantomArtistName?.trim();
      const name = customName || artistName.value;
      const label = name || t('outputPanel.portrait.unnamedSet');
      return {
        id: item.id,
        name: label,
        label,
        lang: customName
          ? contentLangAttribute(customName)
          : trackContentLang(props.track),
        photoId: item.phantomPortraitPhoto,
        color: item.phantomPortraitColor || portraitColor(name),
      };
    })
    .sort((left, right) => alphabet.compare(left.name, right.name)),
);
const visibleCards = computed(() => {
  const cards = [defaultCard.value, ...customCards.value];
  const term = query.value.trim().normalize('NFKC').toLowerCase();
  return cards.filter(({ label }) =>
    label.normalize('NFKC').toLowerCase().includes(term),
  );
});
const canAdd = computed(() => canAddPhantomPortraitSet(props.items));
const canEdit = computed(
  () =>
    Boolean(props.activeId) &&
    visibleCards.value.some(({ id }) => id === props.activeId),
);

let editorTrigger = null;

function openEditor(action, event) {
  editorTrigger = event.currentTarget;
  emit(action);
}

function focusSelectedCard() {
  const selected = grid.value?.querySelector('[aria-pressed="true"]');
  if (selected) selected.focus();
  else search.value?.focus();
}

async function focusAfterEdit(saved) {
  if (!saved) {
    editorTrigger?.focus();
  } else {
    if (!visibleCards.value.some(({ id }) => id === props.activeId)) {
      query.value = '';
      await nextTick();
    }
    focusSelectedCard();
  }
  editorTrigger = null;
}

async function removeSet() {
  emit('remove');
  await nextTick();
  focusSelectedCard();
}

defineExpose({ focusAfterEdit });
</script>

<template>
  <section
    class="obs-portrait-grid"
    :class="{ 'obs-portrait-grid--stretch': stretch }"
    :aria-label="t('outputPanel.portrait.set')"
  >
    <UiStack align="center" :gap="1">
      <UiSearchBox
        ref="search"
        v-model="query"
        class="obs-portrait-grid__search"
        :label="t('outputPanel.portrait.searchSets')"
        :placeholder="t('outputPanel.portrait.searchSets')"
      />
      <UiIconButton
        v-if="!selectionOnly"
        :icon="Pencil"
        :label="t('outputPanel.portrait.editSet')"
        :aria-disabled="!canEdit"
        @click="openEditor('edit', $event)"
      />
      <UiIconButton
        v-if="!selectionOnly"
        :icon="Trash2"
        :label="t('outputPanel.portrait.removeSet')"
        intent="danger"
        :aria-disabled="!canEdit"
        @click="removeSet"
      />
    </UiStack>
    <UiHint v-if="!visibleCards.length" role="status">
      {{ t('outputPanel.portrait.noMatchingSets') }}
    </UiHint>
    <div ref="grid" class="obs-portrait-grid__cells">
      <div
        v-for="card in visibleCards"
        :key="card.id"
        class="obs-portrait-grid__tile"
      >
        <div class="obs-portrait-grid__slot">
          <UiButton
            class="obs-portrait-grid__card"
            variant="secondary"
            stretch
            :active="card.id === activeId"
            :aria-pressed="card.id === activeId"
            :aria-label="card.label"
            :title="card.label"
            :disabled="disabled"
            @click="emit('select', card.id)"
          >
            <ObsPhantomPortraitThumb
              size="auto"
              class="obs-portrait-grid__photo"
              :background="card.color"
              :photo-id="thumbnailFor ? '' : card.photoId"
              :track-id="thumbnailFor ? '' : track?.id"
              :thumbnail="thumbnailFor?.(card.id)"
              :active="active"
            >
              <UiStatusIcon
                v-if="card.id === activeId"
                class="obs-portrait-grid__check"
                :icon="Check"
                label=""
                tone="text"
                decorative
              />
            </ObsPhantomPortraitThumb>
          </UiButton>
        </div>
        <span
          class="obs-portrait-grid__name"
          :lang="card.lang"
          dir="auto"
          aria-hidden="true"
          >{{ card.name }}</span
        >
      </div>
      <div
        v-if="!selectionOnly"
        class="obs-portrait-grid__slot obs-portrait-grid__slot--add"
      >
        <UiIconButton
          :icon="Plus"
          :label="t('outputPanel.portrait.addSet')"
          :title="
            canAdd
              ? undefined
              : t('outputPanel.portrait.setLimit', {
                  count: MAX_PHANTOM_PORTRAIT_SETS,
                })
          "
          :aria-disabled="!canAdd"
          shape="inherit"
          stretch
          @click="openEditor('add', $event)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.obs-portrait-grid {
  --obs-portrait-tile-size: calc(var(--ui-artwork-size-md) + var(--ui-space-2));
  display: grid;
  gap: var(--ui-space-2);
  max-inline-size: calc(
    3 * var(--obs-portrait-tile-size) + 2 * var(--ui-space-2)
  );
  margin-inline: auto;
  padding-block: var(--ui-space-2);
}

.obs-portrait-grid__search {
  flex: 1;
}

.obs-portrait-grid--stretch {
  max-inline-size: none;
  margin-inline: 0;
}

.obs-portrait-grid__cells {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-2);
}

.obs-portrait-grid__tile {
  display: grid;
  gap: var(--ui-space-1);
  min-inline-size: 0;
}

.obs-portrait-grid__card {
  position: relative;
}

.obs-portrait-grid__slot {
  align-self: start;
  inline-size: 100%;
  aspect-ratio: 1;
  box-sizing: border-box;
  border-radius: var(--ui-radius-md);
}

.obs-portrait-grid__slot .obs-portrait-grid__photo {
  position: absolute;
  inset: var(--ui-space-1);
}

.obs-portrait-grid__check {
  position: absolute;
  inset-block-start: var(--ui-space-1);
  inset-inline-end: var(--ui-space-1);
}

.obs-portrait-grid__name {
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-type-body-compact-size);
  font-weight: var(--ui-type-body-compact-weight);
  line-height: var(--ui-type-body-compact-line-height);
  white-space: nowrap;
  min-inline-size: 0;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
}

.obs-portrait-grid__slot--add {
  border: var(--ui-border-width) dashed var(--ui-color-border-strong);
}
</style>
