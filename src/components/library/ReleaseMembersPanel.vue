<script setup>
import { computed, shallowRef, watch } from 'vue';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import { t } from '../../utils/i18n.js';
const props = defineProps({
  release: { type: Object, required: true },
  tracksById: { type: Map, required: true },
  disabled: Boolean,
  loadingMore: Boolean,
});
const emit = defineEmits(['repair', 'initialize', 'loadMore']);
const selected = shallowRef([]);
const statuses = {
  current: { label: t('release.members.status.current'), tone: 'success' },
  changed: { label: t('release.members.status.changed'), tone: 'warning' },
  unresolved: {
    label: t('release.members.status.unresolved'),
    tone: 'warning',
  },
  missing: { label: t('release.members.status.missing'), tone: 'danger' },
  unverified: { label: t('release.members.status.unverified'), tone: 'muted' },
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
        title:
          track?.title ||
          t('release.members.unavailableTrack', { index: index + 1 }),
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
      {{ t('release.members.title') }}
    </h3>
    <UiHint v-if="release.memberCount > 0">{{
      t(
        'release.members.count',
        { count: release.memberCount },
        release.memberCount,
      )
    }}</UiHint>
    <UiHint v-if="release.canInitializeBindings">
      {{ t('release.members.firstSaveHint') }}
    </UiHint>
    <UiHint v-if="!members.length && !release.hasMore">{{
      t('release.members.empty')
    }}</UiHint>
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
            :label="
              t('release.members.confirmTrack', { title: member.track.title })
            "
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
            :aria-label="
              t('release.members.statusLabel', { status: member.status.label })
            "
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
        :loading-label="t('release.members.loading')"
        @click="emit('loadMore')"
        >{{ t('release.members.loadMore') }}</UiButton
      >
      <UiButton
        v-if="!release.sourceBacked && release.canInitializeBindings"
        variant="secondary"
        :disabled="disabled"
        @click="emit('initialize')"
        >{{ t('release.members.confirmAndSave') }}</UiButton
      >
      <UiButton
        v-if="!release.sourceBacked && selected.length"
        variant="secondary"
        :disabled="disabled"
        @click="emit('repair', selected)"
        >{{ t('release.members.confirmSelectedAndSave') }}</UiButton
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
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
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
