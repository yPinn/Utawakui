<script setup>
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from '../../icons/index.js';
import {
  canAddPhantomPortraitSet,
  PHANTOM_PORTRAIT_DEFAULTS,
  MAX_PHANTOM_PORTRAIT_SETS,
} from '../../../shared/outputAppearance.mjs';
import { usePlayer } from '../../composables/usePlayer.js';
import {
  contentLangAttribute,
  trackContentLang,
} from '../../utils/contentLanguage.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStack from '../ui/UiStack.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import ObsPhantomPortraitThumb from './ObsPhantomPortraitThumb.vue';
import { phantomPortraitColorToken } from './phantomPortraitPalette.js';

const props = defineProps({
  items: { type: Array, required: true },
  activeId: { type: String, required: true },
  active: { type: Boolean, default: false },
});
const emit = defineEmits(['select', 'add', 'edit', 'remove']);

const PAGE_SIZE = 6;
const { state: player } = usePlayer();
const grid = useTemplateRef('grid');
const page = shallowRef(0);

const cards = computed(() =>
  [PHANTOM_PORTRAIT_DEFAULTS, ...props.items].map((item, number) => {
    const customName = item.phantomArtistName?.trim();
    const name = customName || player.track?.artist?.trim();
    const fallback = number
      ? t('outputPanel.portrait.numberedSet', { number })
      : t('outputPanel.portrait.defaultSet');
    return {
      id: number ? item.id : '',
      name: (number && name) || fallback,
      lang:
        number && name
          ? customName
            ? contentLangAttribute(customName)
            : trackContentLang(player.track)
          : undefined,
      label: name
        ? t(
            number
              ? 'outputPanel.portrait.namedSet'
              : 'outputPanel.portrait.defaultNamedSet',
            { number, name },
          )
        : fallback,
      photoId: item.phantomPortraitPhoto,
      color:
        item.phantomPortraitColor ||
        `var(${phantomPortraitColorToken(name, player.track?.id)})`,
    };
  }),
);
const canAdd = computed(() => canAddPhantomPortraitSet(props.items));
const pageCount = computed(() => Math.ceil(cards.value.length / PAGE_SIZE));
const pageCards = computed(() =>
  cards.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE),
);
const showAddTile = computed(
  () => canAdd.value && pageCards.value.length < PAGE_SIZE,
);
const canEdit = computed(
  () =>
    Boolean(props.activeId) &&
    pageCards.value.some(({ id }) => id === props.activeId),
);
const emptySlots = computed(
  () => PAGE_SIZE - pageCards.value.length - Number(showAddTile.value),
);

watch(
  () => props.activeId,
  (id) => {
    const index = cards.value.findIndex((card) => card.id === id);
    page.value = Math.floor(Math.max(0, index) / PAGE_SIZE);
  },
  { immediate: true },
);
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count - 1);
});

function changePage(offset) {
  page.value = Math.max(0, Math.min(page.value + offset, pageCount.value - 1));
}

let editorTrigger = null;

function openEditor(action, event) {
  editorTrigger = event.currentTarget;
  emit(action);
}

function focusAfterEdit(saved) {
  const target = saved
    ? grid.value?.querySelector('[aria-pressed="true"]')
    : editorTrigger;
  target?.focus();
  editorTrigger = null;
}

async function removeSet() {
  emit('remove');
  await nextTick();
  focusAfterEdit(true);
}

defineExpose({ focusAfterEdit });
</script>

<template>
  <section
    class="obs-portrait-grid"
    :aria-label="t('outputPanel.portrait.set')"
  >
    <div ref="grid" class="obs-portrait-grid__cells">
      <div
        v-for="card in pageCards"
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
            @click="emit('select', card.id)"
          >
            <ObsPhantomPortraitThumb
              size="auto"
              class="obs-portrait-grid__photo"
              :background="card.color"
              :photo-id="card.photoId"
              :track-id="player.track?.id"
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
        v-if="showAddTile"
        class="obs-portrait-grid__slot obs-portrait-grid__slot--add"
      >
        <UiIconButton
          :icon="Plus"
          :label="t('outputPanel.portrait.addSet')"
          shape="inherit"
          stretch
          @click="openEditor('add', $event)"
        />
      </div>
      <span
        v-for="space in emptySlots"
        :key="space"
        class="obs-portrait-grid__slot obs-portrait-grid__slot--empty"
        aria-hidden="true"
      />
    </div>

    <div class="obs-portrait-grid__toolbar">
      <UiIconButton
        v-if="!showAddTile"
        class="obs-portrait-grid__toolbar-add"
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
        @click="openEditor('add', $event)"
      />
      <UiStack
        class="obs-portrait-grid__pagination"
        align="center"
        justify="center"
      >
        <UiIconButton
          :icon="ChevronLeft"
          :label="t('common.previousPage')"
          :aria-disabled="page === 0"
          @click="changePage(-1)"
        />
        <UiHint class="obs-portrait-grid__page" role="status">
          <span aria-hidden="true">{{ page + 1 }} / {{ pageCount }}</span>
          <span class="ui-visually-hidden">{{
            t('outputPanel.portrait.setPage', {
              page: page + 1,
              total: pageCount,
            })
          }}</span>
        </UiHint>
        <UiIconButton
          :icon="ChevronRight"
          :label="t('common.nextPage')"
          :aria-disabled="page + 1 === pageCount"
          @click="changePage(1)"
        />
      </UiStack>
      <UiStack class="obs-portrait-grid__actions">
        <UiIconButton
          :icon="Pencil"
          :label="t('outputPanel.portrait.editSet')"
          :aria-disabled="!canEdit"
          @click="openEditor('edit', $event)"
        />
        <UiIconButton
          :icon="Trash2"
          :label="t('outputPanel.portrait.removeSet')"
          intent="danger"
          :aria-disabled="!canEdit"
          @click="removeSet"
        />
      </UiStack>
    </div>
  </section>
</template>

<style scoped>
.obs-portrait-grid {
  display: grid;
  gap: var(--ui-space-1);
  padding-block: var(--ui-space-2);
}

.obs-portrait-grid__cells {
  --obs-portrait-tile-size: calc(var(--ui-artwork-size-md) + var(--ui-space-2));
  display: grid;
  grid-template-columns: repeat(3, minmax(0, var(--obs-portrait-tile-size)));
  justify-content: center;
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

.obs-portrait-grid__slot--empty,
.obs-portrait-grid__slot--add {
  border: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-portrait-grid__slot--add {
  border-style: dashed;
  border-color: var(--ui-color-border-strong);
}

.obs-portrait-grid__toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
}

.obs-portrait-grid__toolbar-add {
  justify-self: start;
}

.obs-portrait-grid__pagination {
  grid-column: 2;
}

.obs-portrait-grid__page {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.obs-portrait-grid__actions {
  grid-column: 3;
  justify-self: end;
}
</style>
