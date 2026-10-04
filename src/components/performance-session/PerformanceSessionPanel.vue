<script setup>
import { computed, onMounted } from 'vue';
import { ListOrdered, ListPlus, Plus } from '../../icons/index.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { playlistDisplayName } from '../../utils/playlistMenu.js';
import AppRightDockPanel from '../layout/AppRightDockPanel.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';

const emit = defineEmits(['close', 'openPreparation']);
const {
  state,
  initialize,
  replaceFromCollection: replacePerformanceSessionPlanFromCollection,
} = usePerformanceSessionPlan();
const { selectedPlaylist } = usePlaylists();

const hasDraft = computed(() => state.plan.summary.total > 0);
const sourceLabel = computed(
  () => state.plan.source?.name ?? '臨時場次（手動建立）',
);
const selectedCollectionLabel = computed(() =>
  playlistDisplayName(selectedPlaylist.value),
);
const selectedCollectionKindLabel = computed(() =>
  selectedPlaylist.value?.kind === 'album' ? '專輯' : '清單',
);
const collectionActionLabel = computed(() => {
  if (hasDraft.value) {
    return `以此${selectedCollectionKindLabel.value}取代目前草稿`;
  }
  return selectedPlaylist.value?.kind === 'album'
    ? '用此專輯建立場次'
    : '用此清單建立場次';
});

onMounted(initialize);

function openPreparation() {
  emit('openPreparation');
}

async function prepareSelectedCollection() {
  const collection = selectedPlaylist.value;
  if (!collection) return;

  await initialize();
  let replaceCurrent = hasDraft.value;
  if (replaceCurrent) {
    const confirmed = window.confirm(
      `確定要用「${selectedCollectionLabel.value}」取代「${sourceLabel.value}」嗎？`,
    );
    if (!confirmed) return;
  }

  let prepared = await replacePerformanceSessionPlanFromCollection(
    collection.id,
    replaceCurrent,
  );

  // Main owns the replacement guard. If another intent created a draft after
  // the local check, ask at the explicit source action instead of replacing
  // silently or surfacing a second entry flow.
  if (
    !prepared &&
    !replaceCurrent &&
    state.validationError?.code === 'SESSION_PLAN_REPLACE_REQUIRED'
  ) {
    replaceCurrent = window.confirm(
      '目前已有另一份場次草稿。要用目前選取的來源取代嗎？',
    );
    if (replaceCurrent) {
      prepared = await replacePerformanceSessionPlanFromCollection(
        collection.id,
        true,
      );
    }
  }

  if (prepared) openPreparation();
}
</script>

<template>
  <AppRightDockPanel
    title="場次"
    subtitle="錄製／直播待唱"
    close-label="關閉場次"
    @close="emit('close')"
  >
    <UiNotice
      v-if="state.error"
      tone="danger"
      title="場次草稿無法讀取"
      :message="state.error"
      compact
    />
    <UiNotice
      v-else-if="state.validationError"
      tone="warning"
      title="場次操作尚未完成"
      :message="state.validationError.message"
      compact
    />

    <AppRightDockSection
      class="performance-session-panel__current"
      heading="待唱安排"
    >
      <template v-if="hasDraft">
        <div class="performance-session-panel__heading">
          <h3 class="performance-session-panel__title">{{ sourceLabel }}</h3>
          <p class="performance-session-panel__meta">
            {{ state.plan.summary.total }} 首待唱
          </p>
        </div>
        <div class="performance-session-panel__summary" aria-label="草稿狀態">
          <UiChip
            :tone="state.plan.summary.needsAttention ? 'warning' : 'success'"
          >
            {{
              state.plan.summary.needsAttention
                ? `${state.plan.summary.needsAttention} 首需處理`
                : '全部可演出'
            }}
          </UiChip>
        </div>
        <UiButton
          class="performance-session-panel__primary"
          :icon="ListOrdered"
          variant="accent"
          @click="openPreparation"
        >
          編輯待唱安排
        </UiButton>
      </template>

      <template v-else>
        <UiHint>尚未建立待唱安排。</UiHint>
        <UiButton
          v-if="!selectedPlaylist"
          class="performance-session-panel__primary"
          :icon="Plus"
          variant="accent"
          @click="openPreparation"
        >
          建立臨時場次
        </UiButton>
      </template>
    </AppRightDockSection>

    <AppRightDockSection
      v-if="selectedPlaylist"
      class="performance-session-panel__source"
      :heading="`目前選取的${selectedCollectionKindLabel}`"
      divided
    >
      <div class="performance-session-panel__heading">
        <p class="performance-session-panel__source-name">
          {{ selectedCollectionLabel }}
        </p>
        <p class="performance-session-panel__meta">
          {{ selectedPlaylist.trackIds.length }} 首曲目
        </p>
      </div>
      <UiButton
        class="performance-session-panel__primary"
        :icon="ListPlus"
        :variant="hasDraft ? 'secondary' : 'accent'"
        :loading="state.isSaving"
        loading-label="建立中"
        @click="prepareSelectedCollection"
      >
        {{ collectionActionLabel }}
      </UiButton>
      <UiButton
        v-if="!hasDraft"
        class="performance-session-panel__primary"
        :icon="Plus"
        @click="openPreparation"
      >
        建立臨時場次
      </UiButton>
    </AppRightDockSection>
  </AppRightDockPanel>
</template>

<style scoped>
.performance-session-panel__heading {
  min-width: 0;
}

.performance-session-panel__title,
.performance-session-panel__source-name,
.performance-session-panel__meta {
  margin: 0;
}

.performance-session-panel__title,
.performance-session-panel__source-name {
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-body);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.performance-session-panel__meta {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.performance-session-panel__summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

.performance-session-panel__primary {
  width: 100%;
}
</style>
