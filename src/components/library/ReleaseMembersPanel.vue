<script setup>
import { computed, shallowRef, watch } from 'vue';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
const props = defineProps({
  release: { type: Object, required: true },
  tracksById: { type: Map, required: true },
  disabled: Boolean,
  loadingMore: Boolean,
});
const emit = defineEmits(['repair', 'initialize', 'loadMore']);
const selected = shallowRef([]);
const statusLabels = {
  current: '已確認',
  changed: '音源已變更',
  unresolved: '待確認音源',
  missing: '音源不存在',
  unverified: '尚未確認',
};
const members = computed(() =>
  (props.release.members ?? []).map((member, index) => ({
    ...member,
    track: props.tracksById.get(member.trackId) || {
      id: member.trackId,
      title: `無法使用的曲目 ${index + 1}`,
    },
  })),
);
function updateSelected(id, checked) {
  selected.value = checked
    ? [...new Set([...selected.value, id])].slice(0, 100)
    : selected.value.filter((entry) => entry !== id);
}
watch([() => props.release.id, () => props.release.revision], () => {
  selected.value = [];
});
</script>
<template>
  <section
    class="release-members-panel"
    aria-labelledby="release-members-heading"
  >
    <h3 id="release-members-heading" class="release-members-panel__title">
      收錄曲目
    </h3>
    <p class="release-members-panel__hint">
      {{ release.memberCount }} 首成員。音源變更不會自動重新綁定。
    </p>
    <p v-if="release.canInitializeBindings" class="release-members-panel__hint">
      這份本機發行尚未確認音源。請先按「確認本機發行音源」，再使用一般儲存。
    </p>
    <ul class="release-members-panel__list">
      <TrackIdentityRow
        v-for="member in members"
        :key="member.trackId"
        :track="member.track"
        overflow="ellipsis"
        hide-duration
      >
        <template #trail>
          <span class="release-members-panel__hint">{{
            statusLabels[member.bindingStatus] || '尚未確認'
          }}</span>
          <UiCheckbox
            v-if="
              !release.sourceBacked &&
              !release.canInitializeBindings &&
              ['changed', 'unresolved', 'unverified'].includes(
                member.bindingStatus,
              )
            "
            :id="`release-reconfirm-${member.trackId}`"
            label="確認目前音源"
            :model-value="selected.includes(member.trackId)"
            :disabled="
              disabled ||
              (!selected.includes(member.trackId) && selected.length >= 100)
            "
            :aria-label="`確認 ${member.track.title} 的目前音源`"
            @update:model-value="updateSelected(member.trackId, $event)"
          />
        </template>
      </TrackIdentityRow>
    </ul>
    <div class="release-members-panel__actions">
      <UiButton
        v-if="release.hasMore"
        variant="secondary"
        :disabled="disabled"
        :loading="loadingMore"
        loading-label="載入中"
        @click="emit('loadMore')"
        >載入更多成員</UiButton
      >
      <UiButton
        v-if="!release.sourceBacked && release.canInitializeBindings"
        variant="secondary"
        :disabled="disabled"
        @click="emit('initialize')"
        >確認本機發行音源</UiButton
      >
      <UiButton
        v-if="!release.sourceBacked && selected.length"
        variant="secondary"
        :disabled="disabled"
        @click="emit('repair', selected)"
        >確認選取音源並儲存</UiButton
      >
    </div>
  </section>
</template>
<style scoped>
.release-members-panel {
  display: grid;
  gap: var(--ui-space-3);
}
.release-members-panel__title {
  margin: 0;
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}
.release-members-panel__hint {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
.release-members-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.release-members-panel__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: var(--ui-space-2);
}
</style>
