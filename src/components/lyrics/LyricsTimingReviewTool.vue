<script setup>
import { computed, shallowRef, watch, useId } from 'vue';
import { BadgeCheck, Ellipsis } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButton from '../ui/UiButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiHint from '../ui/UiHint.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  review: { type: Object, required: true },
  contextKey: { type: String, default: '' },
  hasDraft: { type: Boolean, default: false },
  editRevision: { type: Object, default: null },
  canSave: { type: Boolean, default: false },
  blocked: { type: Boolean, default: false },
  estimated: { type: Boolean, default: false },
  offsetPending: { type: Boolean, default: false },
});
const emit = defineEmits(['confirm']);
const open = shallowRef(false),
  checked = shallowRef(false),
  acknowledgementId = useId();
const state = computed(() => props.review.state);
const menuOpen = shallowRef(false),
  menuElement = shallowRef(null);
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'review',
      items: [
        ...(['confirmed', 'expired'].includes(state.value.status)
          ? [
              {
                id: 'revoke',
                kind: 'action',
                label: t('lyricsEditor.review.revoke'),
                disabled:
                  state.value.isBusy ||
                  props.blocked ||
                  props.estimated ||
                  props.offsetPending ||
                  props.hasDraft,
              },
            ]
          : []),
        {
          id: 'refresh',
          kind: 'action',
          label:
            state.value.status === 'unavailable'
              ? t('lyricsEditor.review.reloadAll')
              : t('lyricsEditor.review.reloadStatus'),
          disabled:
            state.value.isBusy ||
            state.value.isLoading ||
            (state.value.status === 'unavailable' && props.hasDraft),
        },
      ],
    },
  ],
}));
function openMenu(event) {
  menuElement.value = event.currentTarget;
  menuOpen.value = true;
}
function selectAction(item) {
  const action = menuContent.value.groups[0].items.find(
    (entry) => entry.id === item.id,
  );
  if (!action || action.disabled) return;
  menuOpen.value = false;
  if (item.id === 'revoke') void props.review.revoke();
  else if (state.value.status === 'unavailable') void props.review.reload();
  else void props.review.refresh();
}
watch(open, (value) => {
  if (!value) menuOpen.value = false;
});
const statusText = computed(() => {
  if (props.estimated) return t('lyricsEditor.review.estimated');
  if (props.offsetPending) return t('lyricsEditor.review.offsetPending');
  if (props.hasDraft) return t('lyricsEditor.review.draft');
  return (
    {
      loading: t('lyricsEditor.review.status.loading'),
      unconfirmed: t('lyricsEditor.review.status.unconfirmed'),
      confirmed: t('lyricsEditor.review.status.confirmed'),
      expired: t('lyricsEditor.review.status.expired'),
      revoked: t('lyricsEditor.review.status.revoked'),
      'not-applicable': t('lyricsEditor.review.status.notApplicable'),
      unusable: t('lyricsEditor.review.status.unusable'),
      corrupt: t('lyricsEditor.review.status.corrupt'),
      unsupported: t('lyricsEditor.review.status.unsupported'),
      unavailable: t('lyricsEditor.review.status.unavailable'),
    }[state.value.status] ?? t('lyricsEditor.review.status.unconfirmed')
  );
});
const eligible = computed(
  () =>
    !props.blocked &&
    !props.estimated &&
    !state.value.isBusy &&
    !state.value.isLoading &&
    ['unconfirmed', 'expired', 'revoked', 'confirmed'].includes(
      state.value.status,
    ),
);
const canConfirm = computed(
  () =>
    eligible.value &&
    checked.value &&
    (!props.hasDraft || props.canSave) &&
    (props.hasDraft ||
      state.value.status !== 'confirmed' ||
      props.offsetPending),
);
watch(
  () => [
    props.contextKey,
    state.value.revision,
    props.hasDraft,
    props.editRevision,
    props.estimated,
  ],
  () => {
    checked.value = false;
  },
);
function toggle() {
  open.value = !open.value;
  if (open.value) {
    checked.value = false;
    void props.review.refresh();
  }
}
function confirm() {
  if (canConfirm.value) emit('confirm');
}
</script>

<template>
  <UiPopover
    v-model:open="open"
    :aria-label="t('lyricsEditor.review.label')"
    placement="bottom-end"
    :close-on-scroll="false"
    focus-on-open
  >
    <template #trigger="{ triggerProps }">
      <UiIconButton
        v-bind="triggerProps"
        :icon="BadgeCheck"
        :label="t('lyricsEditor.review.title')"
        :active="
          state.status === 'confirmed' &&
          !hasDraft &&
          !offsetPending &&
          !estimated
        "
        :disabled="!contextKey"
        @click="toggle"
      />
    </template>
    <div class="lyrics-review">
      <strong role="status">{{ statusText }}</strong>
      <UiHint v-if="state.coverage">
        {{
          t(
            state.coverage.segmented
              ? 'lyricsEditor.review.coverageSegmented'
              : 'lyricsEditor.review.coverage',
            {
              timed: state.coverage.timed,
              total: state.coverage.total,
              segmented: state.coverage.segmented,
            },
          )
        }}
      </UiHint>
      <UiCheckbox
        v-if="
          eligible &&
          (state.status !== 'confirmed' || hasDraft || offsetPending)
        "
        :id="acknowledgementId"
        v-model="checked"
        :label="t('lyricsEditor.review.checkedAll')"
      />
      <UiNotice
        v-if="state.error"
        tone="danger"
        :message="state.error"
        compact
      />
      <div class="lyrics-review__actions">
        <UiButton
          v-if="state.status !== 'confirmed' || hasDraft || offsetPending"
          :icon="BadgeCheck"
          variant="accent"
          :disabled="!canConfirm"
          :loading="state.isBusy"
          :loading-label="t('lyricsEditor.review.confirming')"
          @click="confirm"
          >{{
            t(
              hasDraft
                ? 'lyricsEditor.review.saveAndConfirm'
                : 'lyricsEditor.review.confirm',
            )
          }}</UiButton
        >
        <UiIconButton
          :icon="Ellipsis"
          :label="t('lyricsEditor.review.more')"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click="openMenu"
        />
      </div>
    </div>
  </UiPopover>
  <UiActionMenu
    :open="menuOpen"
    :anchor="{ kind: 'element', element: menuElement }"
    :content="menuContent"
    :aria-label="t('lyricsEditor.review.actions')"
    @select="selectAction"
    @close="menuOpen = false"
  />
</template>

<style scoped>
.lyrics-review {
  display: grid;
  gap: var(--ui-space-3);
  width: min(20rem, calc(100vw - 2rem));
  padding: var(--ui-space-3);
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
}
.lyrics-review__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-2);
}
</style>
