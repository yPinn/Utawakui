<script setup>
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import { Star } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';
import {
  filterOutputTemplates,
  outputTemplateSearchKey,
} from '../../utils/outputTemplateSearch.js';
import ObsOutputSplitLayout from './ObsOutputSplitLayout.vue';
import ObsTemplatePreviewStage from './ObsTemplatePreviewStage.vue';
import ObsTemplateTile from './ObsTemplateTile.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';

const props = defineProps({
  active: { type: Boolean, default: true },
  sideWidth: { type: Number, default: null },
  sideCollapsed: { type: Boolean, default: false },
  compactSideOpen: { type: Boolean, default: false },
  templateGroups: { type: Array, default: () => [] },
  previewScene: { type: Object, default: () => ({}) },
  activeKind: { type: String, default: null },
  selectedPresetId: { type: String, default: null },
  appliedPresetIds: { type: Object, default: () => ({}) },
  favoriteIds: { type: Set, default: () => new Set() },
  isApplying: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:selectedPresetId',
  'applyPreset',
  'toggleFavorite',
  'update:sideWidth',
  'update:sideCollapsed',
  'update:compactSideOpen',
]);
const search = shallowRef('');
const catalog = useTemplateRef('catalog');

const query = computed(() => outputTemplateSearchKey(search.value));
const activeGroup = computed(() =>
  props.activeKind == null
    ? props.templateGroups.find((group) => group.templates.length)
    : props.templateGroups.find((group) => group.kind === props.activeKind),
);
const activeTemplates = computed(() => activeGroup.value?.templates ?? []);
const filteredTemplates = computed(() =>
  filterOutputTemplates(activeTemplates.value, query.value),
);
const sections = computed(() => {
  const saved = [];
  const other = [];
  for (const preset of filteredTemplates.value) {
    (props.favoriteIds.has(preset.id) ? saved : other).push(preset);
  }
  if (!saved.length) return [{ id: 'other', templates: other }];
  return [
    {
      id: 'favorites',
      title: t('outputPanel.gallery.favorites'),
      templates: saved,
    },
    {
      id: 'other',
      title: t('outputPanel.gallery.otherTemplates'),
      templates: other,
    },
  ].filter(({ templates }) => templates.length);
});
const selectedPreset = computed(() => {
  const selection =
    activeTemplates.value.find(
      (preset) => preset.id === props.selectedPresetId,
    ) ?? activeTemplates.value[0];
  return filteredTemplates.value.includes(selection) ? selection : null;
});
const selectedPreviewScene = computed(() =>
  selectedPreset.value?.id === 'ribbon-setlist'
    ? undefined
    : props.previewScene,
);
const isApplied = computed(
  () =>
    selectedPreset.value?.id ===
    props.appliedPresetIds[selectedPreset.value?.kind],
);
const isSelectedPresetAvailable = computed(
  () => selectedPreset.value?.availability?.available !== false,
);
const isFavorite = computed(() =>
  props.favoriteIds.has(selectedPreset.value?.id),
);

watch(query, () => catalog.value?.scrollTo({ top: 0 }));

function selectPreset(id) {
  emit('update:selectedPresetId', id);
}

function applyPreset(preset) {
  if (
    !preset?.id ||
    preset.availability?.available === false ||
    props.isApplying ||
    preset.id === props.appliedPresetIds[preset.kind]
  ) {
    return;
  }
  emit('applyPreset', preset.id);
}
</script>

<template>
  <section
    class="obs-template-gallery"
    :aria-label="t('outputPanel.gallery.label')"
  >
    <ObsOutputSplitLayout
      :aria-label="t('outputPanel.gallery.label')"
      main-variant="gallery"
      :side-label="t('outputPanel.gallery.side')"
      side-variant="detail"
      :side-width="sideWidth"
      :side-collapsed="sideCollapsed"
      :compact-side-open="compactSideOpen"
      @update:side-width="emit('update:sideWidth', $event)"
      @update:side-collapsed="emit('update:sideCollapsed', $event)"
      @update:compact-side-open="emit('update:compactSideOpen', $event)"
    >
      <template #tools>
        <UiSearchBox
          v-model="search"
          class="obs-template-gallery__search"
          :label="t('outputPanel.gallery.search')"
          :placeholder="t('outputPanel.gallery.searchPlaceholder')"
        />
      </template>
      <template #main>
        <div
          class="obs-template-gallery__catalog"
          :aria-label="t('outputPanel.gallery.thumbnails')"
        >
          <UiScrollLayout
            v-if="activeTemplates.length"
            :key="activeGroup.kind"
            ref="catalog"
            class="obs-template-gallery__group"
            axis="vertical"
            viewport-tag="section"
            viewport-class="obs-template-gallery__group-viewport"
            content-class="obs-template-gallery__grid"
            tabindex="0"
            :aria-label="t('outputPanel.gallery.thumbnails')"
          >
            <template v-for="section in sections" :key="section.id">
              <h3
                v-if="section.title"
                class="obs-template-gallery__section-title"
              >
                {{ section.title }}
              </h3>
              <ObsTemplateTile
                v-for="preset in section.templates"
                :key="preset.id"
                :preset="preset"
                :selected="preset.id === selectedPreset?.id"
                :applied="preset.id === appliedPresetIds[preset.kind]"
                :tooltip="t('outputPanel.gallery.viewPreview')"
                @select="selectPreset(preset.id)"
                @activate="applyPreset(preset)"
              />
            </template>
            <UiHint
              v-if="!filteredTemplates.length"
              class="obs-template-gallery__empty"
              role="status"
            >
              {{ t('outputPanel.gallery.noMatch') }}
            </UiHint>
          </UiScrollLayout>
          <UiHint v-else class="obs-template-gallery__empty" role="status">
            {{ t('outputPanel.gallery.none') }}
          </UiHint>
        </div>
      </template>

      <template #side-header>
        <div v-if="selectedPreset" class="obs-template-gallery__detail-header">
          <h2 class="obs-template-gallery__detail-title">
            {{ selectedPreset.name }}
          </h2>
          <UiIconButton
            :icon="Star"
            variant="ghost"
            :label="t('outputPanel.gallery.favorite')"
            :title="
              t(
                isFavorite
                  ? 'outputPanel.gallery.unfavorite'
                  : 'outputPanel.gallery.favorite',
              )
            "
            :active="isFavorite"
            :fill="isFavorite"
            :aria-pressed="isFavorite"
            @click="emit('toggleFavorite', selectedPreset.id)"
          />
        </div>
        <UiHint v-else class="obs-template-gallery__empty">{{
          t('outputPanel.gallery.choose')
        }}</UiHint>
      </template>

      <template #side="{ open }">
        <ObsTemplatePreviewStage
          v-if="selectedPreset"
          :active="active && open"
          :preset="selectedPreset"
          :scene="selectedPreviewScene"
        />
        <dl
          v-if="selectedPreset?.facts?.length"
          class="obs-template-gallery__facts"
        >
          <div
            v-for="fact in selectedPreset.facts"
            :key="fact.key"
            class="obs-template-gallery__fact"
          >
            <dt class="obs-template-gallery__fact-label">{{ fact.label }}</dt>
            <dd class="obs-template-gallery__fact-value">{{ fact.value }}</dd>
          </div>
        </dl>
      </template>

      <template #side-footer>
        <div v-if="selectedPreset" class="obs-template-gallery__actions">
          <UiButton
            variant="secondary"
            :disabled="isApplying || isApplied || !isSelectedPresetAvailable"
            @click="applyPreset(selectedPreset)"
          >
            {{
              t(
                !isSelectedPresetAvailable
                  ? 'outputPanel.gallery.unavailable'
                  : isApplied
                    ? 'outputPanel.gallery.applied'
                    : 'outputPanel.gallery.apply',
              )
            }}
          </UiButton>
        </div>
      </template>
    </ObsOutputSplitLayout>
  </section>
</template>

<style scoped>
.obs-template-gallery {
  --obs-template-gallery-content-inset: var(--ui-focus-safe-inset);

  height: 100%;
  min-height: 0;
  min-width: 0;
}

.obs-template-gallery__search {
  min-width: 0;
  flex: 0 1 var(--ui-output-gallery-search-width);
  margin-inline-start: var(--obs-template-gallery-content-inset);
  margin-inline-end: auto;
}

.obs-template-gallery__catalog {
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}

.obs-template-gallery__group {
  --ui-scroll-layout-padding-block-start: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-block-end: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-inline-start: var(
    --obs-template-gallery-content-inset
  );
  --ui-scroll-layout-padding-inline-end: var(
    --obs-template-gallery-content-inset
  );
  min-height: 0;
  min-width: 0;
}

.obs-template-gallery__group :deep(.obs-template-gallery__grid) {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(100%, var(--ui-output-gallery-tile-min-width)), 1fr)
  );
  align-content: start;
  gap: var(--ui-space-2);
  min-width: 0;
}

.obs-template-gallery__detail-header,
.obs-template-gallery__actions {
  display: flex;
  align-items: center;
}

.obs-template-gallery__section-title,
.obs-template-gallery__grid .obs-template-gallery__empty {
  grid-column: 1 / -1;
}

.obs-template-gallery__section-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.obs-template-gallery__section-title:not(:first-child) {
  margin-block-start: var(--ui-space-2);
}

/* Label / value rows: short facts the preview cannot show. */
/* Two-column label / value list. Rows use `display: contents` so every
   label shares one column and every value starts at the same edge. */
.obs-template-gallery__facts {
  min-width: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: var(--ui-space-3);
  row-gap: var(--ui-space-2);
  align-items: baseline;
  margin: 0;
}

.obs-template-gallery__fact {
  display: contents;
}

/* Label role, muted: names the field and never wraps. */
.obs-template-gallery__fact-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
  white-space: nowrap;
}

/* Compact body role: the value is the content and wraps inside its column. */
.obs-template-gallery__fact-value {
  min-width: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  font-weight: var(--ui-type-body-compact-weight);
  line-height: var(--ui-type-body-compact-line-height);
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

.obs-template-gallery__detail-header {
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-1);
}

.obs-template-gallery__detail-title {
  min-inline-size: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.obs-template-gallery__actions {
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-block-start: var(--ui-space-3);
}
</style>
