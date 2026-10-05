<script setup>
import { shallowRef } from 'vue';
import { Ellipsis, ListEnd, Shuffle } from '../../icons/index.js';
import PlaybackPrimaryButton from '../playback/PlaybackPrimaryButton.vue';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';

const props = defineProps({
  entityLabel: { type: String, required: true },
  playing: { type: Boolean, default: false },
  shuffleActive: { type: Boolean, default: false },
  canPlay: { type: Boolean, default: false },
  canShuffle: { type: Boolean, default: false },
  canAddToQueue: { type: Boolean, default: false },
  entityAction: { type: Object, default: null },
  moreItems: { type: Array, default: () => [] },
  searchQuery: { type: String, default: '' },
});

const emit = defineEmits([
  'togglePlayback',
  'toggleShuffle',
  'addToQueue',
  'entityAction',
  'menuAction',
  'update:searchQuery',
]);

const activeMenu = shallowRef(null);
const menuAnchorEl = shallowRef(null);

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
  if (props.entityAction?.menuItems?.length) {
    openMenu(event, 'entity');
    return;
  }
  emit('entityAction');
}

function selectMenuAction(value) {
  closeMenu();
  emit('menuAction', value);
}
</script>

<template>
  <section class="collection-action-rail" :aria-label="`${entityLabel}操作`">
    <div class="collection-action-rail__actions">
      <PlaybackPrimaryButton
        :playing="playing"
        :disabled="!canPlay"
        :play-label="`播放${entityLabel}`"
        :pause-label="`暫停${entityLabel}`"
        @click="emit('togglePlayback')"
      />
      <UiIconButton
        :icon="Shuffle"
        :active="shuffleActive"
        :disabled="!canShuffle"
        :label="`隨機播放${entityLabel}`"
        :aria-pressed="shuffleActive"
        @click="emit('toggleShuffle')"
      />
      <UiIconButton
        :icon="ListEnd"
        :disabled="!canAddToQueue"
        :label="`將${entityLabel}新增至佇列`"
        @click="emit('addToQueue')"
      />
      <UiIconButton
        v-if="entityAction"
        class="collection-action-rail__extension"
        :icon="entityAction.icon"
        :disabled="entityAction.disabled"
        :label="entityAction.label"
        :aria-haspopup="entityAction.menuItems?.length ? 'menu' : undefined"
        :aria-expanded="
          entityAction.menuItems?.length
            ? activeMenu === 'entity'
              ? 'true'
              : 'false'
            : undefined
        "
        @click="activateEntityAction"
      />
      <UiIconButton
        v-if="moreItems.length"
        :icon="Ellipsis"
        :label="`${entityLabel}的更多操作`"
        aria-haspopup="menu"
        :aria-expanded="activeMenu === 'more' ? 'true' : 'false'"
        @click="openMenu($event, 'more')"
      />
    </div>

    <div class="collection-action-rail__tools">
      <UiSearchBox
        :model-value="searchQuery"
        @update:model-value="emit('update:searchQuery', $event)"
      />
    </div>

    <UiContextMenu
      :open="Boolean(activeMenu)"
      :anchor-el="menuAnchorEl"
      :width="224"
      :aria-label="`${entityLabel}操作`"
      :items="
        activeMenu === 'entity' ? (entityAction?.menuItems ?? []) : moreItems
      "
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

@container app-folder-layout (max-width: 36rem) {
  .collection-action-rail {
    align-items: stretch;
    flex-direction: column;
  }

  .collection-action-rail__actions {
    flex-wrap: wrap;
  }

  .collection-action-rail__tools,
  .collection-action-rail__tools :deep(.ui-search-box) {
    width: 100%;
  }
}
</style>
