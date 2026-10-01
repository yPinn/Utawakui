<script setup>
import { computed } from 'vue';
import storageValues from '../../../shared/libraryStorageValues.json';
import { ChevronRight, ICON_SIZE, Trash2 } from '../../icons/index.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';

const props = defineProps({
  storage: { type: Object, default: null },
  policy: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  cleaning: { type: Boolean, default: false },
  error: { type: String, default: '' },
  lastCleanup: { type: Object, default: null },
});

const emit = defineEmits(['set-policy', 'cleanup']);

const limitOptions = storageValues.separationLimitOptionsBytes.map((value) => ({
  value,
  label: value === null ? '不限量' : `${formatBytes(value, false)}`,
}));

const summary = computed(() => {
  if (!props.storage) return props.loading ? '計算中' : '尚無資料';
  return `${formatBytes(props.storage.totalBytes)} 已使用 · ${formatBytes(props.storage.driveFreeBytes)} 可用`;
});

const cleanupMessage = computed(() => {
  if (props.cleaning) return '清理中';
  if (!props.lastCleanup) return '';
  if (!props.lastCleanup.freedBytes) return '目前不需清理';
  return `已釋放 ${formatBytes(props.lastCleanup.freedBytes, false)}`;
});

function formatBytes(bytes, includeDecimal = true) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = [
    ['TB', 1024 ** 4],
    ['GB', 1024 ** 3],
    ['MB', 1024 ** 2],
    ['KB', 1024],
  ];
  const [unit, divisor] = units.find(([, size]) => bytes >= size) ?? ['B', 1];
  const value = bytes / divisor;
  const digits = includeDecimal && value < 100 && value % 1 !== 0 ? 1 : 0;
  return `${value.toFixed(digits)} ${unit}`;
}

function updatePolicy(fields) {
  emit('set-policy', { ...props.policy, ...fields });
}
</script>

<template>
  <details class="library-storage">
    <summary class="library-storage__disclosure">
      <ChevronRight
        class="library-storage__indicator"
        :size="ICON_SIZE"
        aria-hidden="true"
      />
      <span class="library-storage__summary-copy">
        <span class="library-storage__title">曲庫空間</span>
        <span class="library-storage__status">{{ summary }}</span>
        <span class="ui-visually-hidden">查看曲庫空間</span>
      </span>
    </summary>

    <div class="library-storage__body">
      <template v-if="storage">
        <dl class="library-storage__categories" aria-label="曲庫空間分類">
          <div class="library-storage__category">
            <dt>歌曲</dt>
            <dd>{{ formatBytes(storage.songBytes) }}</dd>
          </div>
          <div class="library-storage__category">
            <dt>去人聲</dt>
            <dd>{{ formatBytes(storage.separationBytes) }}</dd>
          </div>
          <div class="library-storage__category">
            <dt>其他</dt>
            <dd>{{ formatBytes(storage.otherBytes) }}</dd>
          </div>
        </dl>

        <div class="library-storage__controls">
          <UiCheckbox
            id="auto-manage-separation-storage"
            class="library-storage__auto-manage"
            label="自動管理去人聲"
            :model-value="policy.autoManageSeparation"
            :disabled="saving || cleaning"
            @update:model-value="updatePolicy({ autoManageSeparation: $event })"
          />
          <UiSelect
            id="separation-storage-limit"
            class="library-storage__limit"
            label="上限"
            :model-value="policy.separationLimitBytes"
            :options="limitOptions"
            :disabled="saving || cleaning"
            @update:model-value="updatePolicy({ separationLimitBytes: $event })"
          />
          <UiIconButton
            :icon="Trash2"
            label="清理去人聲空間"
            :disabled="saving || cleaning || storage.separationBytes === 0"
            @click="emit('cleanup')"
          />
        </div>

        <div class="library-storage__feedback">
          <UiHint>只清去人聲，歌曲保留。</UiHint>
          <UiHint
            v-if="cleanupMessage"
            :tone="cleaning ? 'muted' : 'success'"
            role="status"
          >
            {{ cleanupMessage }}
          </UiHint>
        </div>
      </template>

      <UiHint v-else-if="loading">計算中</UiHint>

      <UiNotice
        v-if="error"
        tone="danger"
        title="曲庫空間未更新"
        :message="error"
        compact
      />
    </div>
  </details>
</template>

<style scoped>
.library-storage {
  min-width: 0;
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.library-storage__disclosure {
  min-height: var(--ui-control-height);
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  list-style: none;
  -webkit-user-select: none;
  user-select: none;
}

.library-storage__disclosure::-webkit-details-marker {
  display: none;
}

.library-storage__disclosure:hover {
  background: var(--ui-color-surface-hover);
}

.library-storage__disclosure:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.library-storage__indicator {
  flex: 0 0 auto;
  color: var(--ui-color-text-muted);
  transition: transform var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.library-storage[open] .library-storage__indicator {
  transform: rotate(90deg);
}

.library-storage__summary-copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.library-storage__title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.library-storage__status {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  font-variant-numeric: tabular-nums;
}

.library-storage__body {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3) var(--ui-space-3);
}

.library-storage__categories {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-2);
  margin: 0;
}

.library-storage__category {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.library-storage__category dt,
.library-storage__category dd {
  margin: 0;
}

.library-storage__category dt {
  color: var(--ui-color-text-muted);
}

.library-storage__category dd {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.library-storage__controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(8rem, 0.45fr) auto;
  align-items: end;
  gap: var(--ui-space-2);
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.library-storage__feedback {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

@media (max-width: 35rem) {
  .library-storage__categories {
    grid-template-columns: 1fr;
  }

  .library-storage__controls {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .library-storage__auto-manage {
    grid-column: 1 / -1;
  }
}

:global(:root[data-ui-motion='reduced']) .library-storage__indicator {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .library-storage__indicator {
    transition: none;
  }
}
</style>
