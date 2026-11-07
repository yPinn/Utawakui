<script setup>
import { computed, shallowRef } from 'vue';
import {
  Ellipsis,
  GalleryVerticalEnd,
  ListEnd,
  Shuffle,
} from '../../icons/index.js';
import PlaybackPrimaryButton from '../playback/PlaybackPrimaryButton.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import TrackListDensityMenu from '../track/TrackListDensityMenu.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  entityLabel: { type: String, required: true },
  playing: { type: Boolean, default: false },
  shuffleActive: { type: Boolean, default: false },
  canPlay: { type: Boolean, default: false },
  canShuffle: { type: Boolean, default: false },
  canAddToQueue: { type: Boolean, default: false },
  canPreview: { type: Boolean, default: false },
  // Set while recording／live: the preview would be silent, so it backs off.
  previewBlockedReason: { type: String, default: '' },
  entityAction: { type: Object, default: null },
  moreContent: {
    type: Object,
    default: () => ({ kind: 'actions', groups: [] }),
  },
  showSearch: { type: Boolean, default: true },
  showDensity: { type: Boolean, default: true },
  showShuffle: { type: Boolean, default: true },
  searchQuery: { type: String, default: '' },
  density: {
    type: String,
    default: 'list',
    validator: (value) => ['list', 'compact'].includes(value),
  },
});

const emit = defineEmits([
  'togglePlayback',
  'toggleShuffle',
  'addToQueue',
  'preview',
  'entityAction',
  'menuAction',
  'update:searchQuery',
  'updateDensity',
]);

const activeMenu = shallowRef(null);
const menuAnchorEl = shallowRef(null);
const menuAnchor = computed(() => ({
  kind: 'element',
  element: menuAnchorEl.value,
}));

function openMenu(event, kind) {
  event.stopPropagation();
  menuAnchorEl.value = event.currentTarget;
  activeMenu.value = kind;
}

function closeMenu() {
  activeMenu.value = null;
  menuAnchorEl.value = null;
}

function activateEntityAction(event) {
  if (props.entityAction?.menuContent) {
    openMenu(event, 'entity');
    return;
  }
  emit('entityAction');
}

const activeContent = computed(() =>
  activeMenu.value === 'entity'
    ? (props.entityAction?.menuContent ?? { kind: 'actions', groups: [] })
    : props.moreContent,
);

const hasMoreActions = computed(() =>
  props.moreContent.groups?.some((group) => group.items?.length),
);

function selectMenuAction(value) {
  closeMenu();
  emit('menuAction', value);
}
</script>

<template>
  <section
    class="collection-action-rail"
    :aria-label="t('library.rail.actions', { entity: entityLabel })"
  >
    <div class="collection-action-rail__actions">
      <slot name="actions">
        <PlaybackPrimaryButton
          :playing="playing"
          :disabled="!canPlay"
          :play-label="t('library.rail.play', { entity: entityLabel })"
          :pause-label="t('library.rail.pause', { entity: entityLabel })"
          @click="emit('togglePlayback')"
        />
        <UiIconButton
          :icon="GalleryVerticalEnd"
          :disabled="!canPreview || Boolean(previewBlockedReason)"
          :label="
            previewBlockedReason
              ? t('library.rail.previewBlocked', {
                  entity: entityLabel,
                  reason: previewBlockedReason,
                })
              : t('library.rail.preview', { entity: entityLabel })
          "
          @click="emit('preview')"
        />
        <UiIconButton
          v-if="showShuffle"
          :icon="Shuffle"
          :active="shuffleActive"
          :disabled="!canShuffle"
          :label="t('library.rail.shuffle', { entity: entityLabel })"
          :aria-pressed="shuffleActive"
          @click="emit('toggleShuffle')"
        />
        <UiIconButton
          :icon="ListEnd"
          :disabled="!canAddToQueue"
          :label="t('library.rail.queue', { entity: entityLabel })"
          @click="emit('addToQueue')"
        />
        <UiIconButton
          v-if="entityAction"
          class="collection-action-rail__extension"
          :icon="entityAction.icon"
          :disabled="entityAction.disabled"
          :label="entityAction.label"
          :aria-haspopup="entityAction.menuContent ? 'menu' : undefined"
          :aria-expanded="
            entityAction.menuContent
              ? activeMenu === 'entity'
                ? 'true'
                : 'false'
              : undefined
          "
          @click="activateEntityAction"
        />
        <slot name="additional-actions" />
        <UiIconButton
          v-if="hasMoreActions"
          :icon="Ellipsis"
          :label="t('library.rail.more', { entity: entityLabel })"
          aria-haspopup="menu"
          :aria-expanded="activeMenu === 'more' ? 'true' : 'false'"
          @click="openMenu($event, 'more')"
        />
      </slot>
    </div>

    <div
      v-if="showSearch || showDensity || $slots.tools"
      class="collection-action-rail__tools"
    >
      <UiSearchBox
        v-if="showSearch"
        :model-value="searchQuery"
        class="collection-action-rail__search"
        :label="t('library.rail.search')"
        :placeholder="t('library.rail.search')"
        @update:model-value="emit('update:searchQuery', $event)"
      />
      <TrackListDensityMenu
        v-if="showDensity"
        class="collection-action-rail__density"
        :density="density"
        @update-density="emit('updateDensity', $event)"
      />
      <slot name="tools" />
    </div>

    <UiActionMenu
      :open="Boolean(activeMenu)"
      :anchor="menuAnchor"
      size="md"
      :aria-label="t('library.rail.actions', { entity: entityLabel })"
      :content="activeContent"
      @select="selectMenuAction"
      @close="closeMenu"
    />
  </section>
</template>

<style scoped>
.collection-action-rail {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-block-end: var(--ui-space-4);
}

.collection-action-rail__actions,
.collection-action-rail__tools {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.collection-action-rail__actions {
  flex-wrap: wrap;
}

.collection-action-rail__density {
  margin-inline-start: auto;
}

@container app-folder-layout (max-width: 36rem) {
  .collection-action-rail {
    align-items: stretch;
    flex-direction: column;
  }

  .collection-action-rail__actions {
    flex-wrap: wrap;
  }

  .collection-action-rail__tools,
  .collection-action-rail__search {
    width: 100%;
  }
}
</style>
