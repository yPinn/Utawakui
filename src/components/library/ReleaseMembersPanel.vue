<script setup>
import { computed, shallowRef, watch } from 'vue';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
const props = defineProps({
  release: { type: Object, required: true },
  tracksById: { type: Map, required: true },
  disabled: Boolean,
  loadingMore: Boolean,
});
const emit = defineEmits(['repair', 'initialize', 'loadMore']);
const selected = shallowRef([]);
const statuses = {
  current: { label: '已確認', tone: 'success' },
  changed: { label: '音源已變更', tone: 'warning' },
  unresolved: { label: '待確認音源', tone: 'warning' },
  missing: { label: '音源不存在', tone: 'danger' },
  unverified: { label: '尚未確認', tone: 'muted' },
};
const members = computed(() =>
  (props.release.members ?? []).map((member, index) => {
    const track = props.tracksById.get(member.trackId);
    return {
      ...member,
      status: statuses[member.bindingStatus] || statuses.unverified,
      canReconfirm:
        !props.release.sourceBacked &&
        !props.release.canInitializeBindings &&
        ['changed', 'unresolved', 'unverified'].includes(member.bindingStatus),
      track: {
        ...track,
        id: member.trackId,
        title: track?.title || `無法使用的曲目 ${index + 1}`,
      },
    };
  }),
);
function updateSelected(id, checked) {
  if (
    props.disabled ||
    !members.value.some(
      (member) => member.trackId === id && member.canReconfirm,
    )
  )
    return;
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
    <UiHint v-if="release.memberCount > 0">{{ release.memberCount }} 首</UiHint>
    <UiHint v-if="release.canInitializeBindings">
      首次儲存需確認本地音源。
    </UiHint>
    <UiHint v-if="!members.length && !release.hasMore">尚無收錄曲目。</UiHint>
    <ul v-else class="release-members-panel__list">
      <TrackIdentityRow
        v-for="member in members"
        :key="member.trackId"
        :track="member.track"
        overflow="ellipsis"
        hide-duration
      >
        <template v-if="member.canReconfirm" #lead>
          <UiCheckbox
            :id="`release-reconfirm-${member.trackId}`"
            :label="`確認 ${member.track.title} 的目前音源`"
            label-hidden
            :model-value="selected.includes(member.trackId)"
            :disabled="
              disabled ||
              (!selected.includes(member.trackId) && selected.length >= 100)
            "
            @update:model-value="updateSelected(member.trackId, $event)"
          />
        </template>
        <template #trail>
          <UiChip
            :tone="member.status.tone"
            :aria-label="`音源狀態：${member.status.label}`"
            >{{ member.status.label }}</UiChip
          >
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
        >載入更多</UiButton
      >
      <UiButton
        v-if="!release.sourceBacked && release.canInitializeBindings"
        variant="secondary"
        :disabled="disabled"
        @click="emit('initialize')"
        >確認音源並儲存</UiButton
      >
      <UiButton
        v-if="!release.sourceBacked && selected.length"
        variant="secondary"
        :disabled="disabled"
        @click="emit('repair', selected)"
        >確認選取並儲存</UiButton
      >
    </div>
  </section>
</template>
<style scoped>
.release-members-panel {
  min-inline-size: 0;
  min-block-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-3);
}
.release-members-panel__title {
  margin: 0;
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}
.release-members-panel__list {
  min-inline-size: 0;
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
