<script setup>
import { computed } from 'vue';
import storageValues from '../../../shared/libraryStorageValues.json';
import { formatBytes } from '../../utils/format.js';
import { Trash2 } from '../../icons/index.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButton from '../ui/UiButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  storage: { type: Object, default: null },
  policy: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  cleaning: { type: Boolean, default: false },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
});

const emit = defineEmits(['set-policy', 'cleanup', 'refresh']);

const limitOptions = storageValues.separationLimitOptionsBytes.map((value) => ({
  value,
  label:
    value === null
      ? t('librarySettings.storage.unlimited')
      : formatBytes(value, false),
}));

const summary = computed(() => {
  if (props.readError) return t('librarySettings.storage.readFailedValue');
  if (props.error) return t('librarySettings.storage.unsaved');
  if (!props.storage)
    return t(
      props.loading
        ? 'librarySettings.storage.calculating'
        : 'librarySettings.storage.noData',
    );
  return t('librarySettings.storage.usage', {
    used: formatBytes(props.storage.totalBytes),
    free: formatBytes(props.storage.driveFreeBytes),
  });
});

function updatePolicy(fields) {
  emit('set-policy', { ...props.policy, ...fields });
}
</script>

<template>
  <div class="library-storage-settings-row">
    <UiDisclosure
      class="library-storage settings-section__disclosure"
      :label="t('librarySettings.storage.view')"
      :open="Boolean(error || readError)"
    >
      <template #summary>
        <span class="library-storage__summary-copy">
          <span class="library-storage__title">{{
            t('librarySettings.storage.title')
          }}</span>
          <span
            class="library-storage__status"
            :class="{ 'library-storage__status--error': error || readError }"
            >{{ summary }}</span
          >
          <span class="ui-visually-hidden">{{
            t('librarySettings.storage.view')
          }}</span>
        </span>
      </template>

      <div class="library-storage__body">
        <template v-if="storage">
          <dl
            class="library-storage__categories"
            :aria-label="t('librarySettings.storage.categories')"
          >
            <div class="library-storage__category">
              <dt>{{ t('librarySettings.storage.songs') }}</dt>
              <dd>{{ formatBytes(storage.songBytes) }}</dd>
            </div>
            <div class="library-storage__category">
              <dt>{{ t('librarySettings.storage.instrumental') }}</dt>
              <dd>{{ formatBytes(storage.separationBytes) }}</dd>
            </div>
            <div class="library-storage__category">
              <dt>{{ t('librarySettings.storage.other') }}</dt>
              <dd>{{ formatBytes(storage.otherBytes) }}</dd>
            </div>
          </dl>

          <div class="library-storage__controls">
            <UiCheckbox
              id="auto-manage-separation-storage"
              class="library-storage__auto-manage"
              :label="t('librarySettings.storage.autoCleanup')"
              :model-value="policy.autoManageSeparation"
              :disabled="saving || cleaning || loading || Boolean(readError)"
              @update:model-value="
                updatePolicy({ autoManageSeparation: $event })
              "
            />
            <UiSelect
              id="separation-storage-limit"
              class="library-storage__limit"
              :label="t('librarySettings.storage.limit')"
              :model-value="policy.separationLimitBytes"
              :options="limitOptions"
              :disabled="saving || cleaning || loading || Boolean(readError)"
              @update:model-value="
                updatePolicy({ separationLimitBytes: $event })
              "
            />
            <UiIconButton
              :icon="Trash2"
              :label="t('librarySettings.storage.cleanup')"
              intent="danger"
              :loading="cleaning"
              :loading-label="t('librarySettings.storage.cleaning')"
              :disabled="saving || cleaning || storage.separationBytes === 0"
              @click="emit('cleanup')"
            />
          </div>

          <div class="library-storage__feedback">
            <UiHint>{{ t('librarySettings.storage.cleanupHint') }}</UiHint>
          </div>
        </template>

        <UiHint v-else-if="loading">{{
          t('librarySettings.storage.calculating')
        }}</UiHint>
        <UiHint v-if="error" tone="danger" role="alert">{{ error }}</UiHint>
        <UiHint v-if="readError" tone="danger" role="alert">{{
          readError
        }}</UiHint>
        <UiButton
          v-if="readError"
          class="library-storage__read-retry"
          variant="ghost"
          :loading="loading"
          @click="emit('refresh')"
          >{{ t('librarySettings.storage.reload') }}</UiButton
        >
      </div>
    </UiDisclosure>
  </div>
</template>

<style scoped>
.library-storage-settings-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.library-storage {
  border-block: 0;
}

.library-storage__summary-copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.library-storage__title {
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.library-storage__status {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}

.library-storage__status--error {
  color: var(--ui-color-danger);
}

.library-storage__body {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
  padding-inline-start: var(--settings-copy-inset, 0);
}

.library-storage__read-retry {
  justify-self: end;
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
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--ui-space-2);
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.library-storage__limit {
  inline-size: min(100%, var(--settings-select-inline-size));
  min-inline-size: min(100%, 8ic);
  max-inline-size: var(--settings-select-inline-size);
}

.library-storage__feedback {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

@container app-folder-layout (max-width: 35rem) {
  .library-storage__categories {
    grid-template-columns: 1fr;
  }

  .library-storage__auto-manage {
    flex-basis: 100%;
  }
}
</style>
