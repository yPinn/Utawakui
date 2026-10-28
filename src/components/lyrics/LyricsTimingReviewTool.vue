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
                label: '撤銷確認',
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
              ? '重新載入歌詞與確認狀態'
              : '重新讀取確認狀態',
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
  if (props.estimated) return '分析顯示不適用，請先切回原歌詞。';
  if (props.offsetPending) return '同步調整尚未儲存';
  if (props.hasDraft) return '有未儲存的時間修改';
  return (
    {
      loading: '讀取確認狀態…',
      unconfirmed: '尚未確認',
      confirmed: '對時已確認',
      expired: '版本已變更，需重新確認',
      revoked: '已撤銷確認',
      'not-applicable': '沒有可確認的計時內容',
      unusable: '時間資料無法使用，請檢查來源',
      corrupt: '確認資料損壞，已保留原檔',
      unsupported: '確認資料版本不支援',
      unavailable: '確認狀態無法讀取',
    }[state.value.status] ?? '尚未確認'
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
    aria-label="歌詞對時確認"
    placement="bottom-end"
    :close-on-scroll="false"
    focus-on-open
  >
    <template #trigger="{ triggerProps }">
      <UiIconButton
        v-bind="triggerProps"
        :icon="BadgeCheck"
        label="對時確認"
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
        確認範圍：已計時 {{ state.coverage.timed }} /
        {{ state.coverage.total }} 行<span v-if="state.coverage.segmented">
          · 逐字 {{ state.coverage.segmented }} 行</span
        >
      </UiHint>
      <UiCheckbox
        v-if="
          eligible &&
          (state.status !== 'confirmed' || hasDraft || offsetPending)
        "
        :id="acknowledgementId"
        v-model="checked"
        label="已檢查全部已計時內容"
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
          loading-label="確認中"
          @click="confirm"
          >{{ hasDraft ? '儲存並確認' : '確認對時' }}</UiButton
        >
        <UiIconButton
          :icon="Ellipsis"
          label="更多對時操作"
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
    aria-label="對時確認操作"
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
