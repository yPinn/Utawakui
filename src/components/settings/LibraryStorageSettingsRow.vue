<script setup>
import { computed, shallowRef, watch } from 'vue';
import storageValues from '../../../shared/libraryStorageValues.json';
import { formatBytes } from '../../utils/format.js';
import { Trash2 } from '../../icons/index.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  storage: { type: Object, default: null },
  policy: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  cleaning: { type: Boolean, default: false },
  cleaningVideos: { type: Boolean, default: false },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
});

const emit = defineEmits([
  'set-policy',
  'cleanup',
  'cleanup-videos',
  'refresh',
]);

const limitOptions = storageValues.separationLimitOptionsBytes.map((value) => ({
  value: value ?? '',
  label:
    value === null
      ? t('librarySettings.storage.unlimited')
      : formatBytes(value, false),
}));

const isOpen = shallowRef(false);
watch(
  () => Boolean(props.error || props.readError),
  (hasError) => {
    if (hasError) isOpen.value = true;
  },
  { immediate: true },
);

const storageCategories = [
  { key: 'songs', field: 'songBytes', label: 'librarySettings.storage.songs' },
  {
    key: 'instrumental',
    field: 'separationBytes',
    label: 'librarySettings.storage.instrumental',
  },
  { key: 'videos', field: 'videoBytes', label: 'trackVideo.tab' },
  { key: 'other', field: 'otherBytes', label: 'librarySettings.storage.other' },
];

const categories = computed(() =>
  storageCategories.map(({ key, field, label }) => {
    const bytes = props.storage?.[field] ?? 0;
    const totalBytes = props.storage?.totalBytes ?? 0;
    return {
      key,
      label: t(label),
      size: formatBytes(bytes),
      share: totalBytes > 0 ? bytes / totalBytes : 0,
    };
  }),
);
const controlsDisabled = computed(
  () =>
    props.saving || props.cleaning || props.loading || Boolean(props.readError),
);

const summary = computed(() => {
  if (props.readError) return t('librarySettings.storage.readFailedValue');
  if (props.error) return t('librarySettings.storage.unsaved');
  if (!props.storage)
    return t(
      props.loading
        ? 'librarySettings.storage.calculating'
        : 'librarySettings.storage.noData',
    );
  const { driveFreeBytes } = props.storage;
  return t(
    Number.isFinite(driveFreeBytes)
      ? 'librarySettings.storage.usage'
      : 'librarySettings.storage.usedOnly',
    {
      used: formatBytes(props.storage.totalBytes),
      free: formatBytes(driveFreeBytes),
    },
  );
});

function updatePolicy(fields) {
  emit('set-policy', { ...props.policy, ...fields });
}
</script>

<template>
  <div class="library-storage-settings-row">
    <UiDisclosure
      v-model:open="isOpen"
      class="library-storage settings-section__disclosure"
      :label="t('librarySettings.storage.title')"
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
        </span>
      </template>

      <div v-if="storage || error || readError" class="library-storage__body">
        <template v-if="storage">
          <div class="library-storage__breakdown">
            <div class="library-storage__bar" aria-hidden="true">
              <span
                v-for="category in categories"
                :key="category.key"
                class="library-storage__segment"
                :data-category="category.key"
                :style="{ inlineSize: `${category.share * 100}%` }"
              ></span>
            </div>
            <dl
              class="library-storage__categories"
              :aria-label="t('librarySettings.storage.categories')"
            >
              <div
                v-for="category in categories"
                :key="category.key"
                class="library-storage__category"
                :data-category="category.key"
              >
                <dt>{{ category.label }}</dt>
                <dd>{{ category.size }}</dd>
              </div>
            </dl>
          </div>

          <div class="library-storage__controls">
            <UiCheckbox
              id="auto-manage-separation-storage"
              :label="t('librarySettings.storage.autoCleanup')"
              :hint="t('librarySettings.storage.cleanupHint')"
              :model-value="policy.autoManageSeparation"
              :disabled="controlsDisabled"
              @update:model-value="
                updatePolicy({ autoManageSeparation: $event })
              "
            />
            <UiSelect
              id="separation-storage-limit"
              class="library-storage__limit"
              :label="t('librarySettings.storage.limit')"
              :model-value="policy.separationLimitBytes ?? ''"
              :options="limitOptions"
              :disabled="controlsDisabled"
              label-inline
              @update:model-value="
                updatePolicy({
                  separationLimitBytes: $event === '' ? null : $event,
                })
              "
            />
          </div>

          <div class="library-storage__cleanup">
            <UiButton
              :icon="Trash2"
              variant="secondary"
              intent="danger"
              :loading="cleaning && !cleaningVideos"
              :loading-label="t('librarySettings.storage.cleaning')"
              :disabled="controlsDisabled || !storage.separationBytes"
              @click="emit('cleanup')"
              >{{ t('librarySettings.storage.cleanup') }}</UiButton
            >
            <UiButton
              :icon="Trash2"
              variant="secondary"
              intent="danger"
              :loading="cleaningVideos"
              :loading-label="t('librarySettings.storage.cleaning')"
              :disabled="controlsDisabled || !storage.videoBytes"
              @click="emit('cleanup-videos')"
              >{{ t('librarySettings.storage.videos.cleanup') }}</UiButton
            >
          </div>
        </template>

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
          >{{ t('librarySettings.reload') }}</UiButton
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
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ui-space-1) var(--ui-space-3);
  padding-inline-end: var(--ui-space-2);
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
  padding-block-start: var(--settings-child-padding-block, var(--ui-space-3));
  padding-block-end: var(--settings-row-padding-block, var(--ui-space-4));
}

.library-storage__read-retry {
  justify-self: end;
}

.library-storage__breakdown {
  display: grid;
  gap: var(--ui-space-2);
}

.library-storage__bar {
  display: flex;
  min-block-size: var(--ui-progress-track-size);
  overflow: hidden;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-surface-hover);
}

.library-storage__segment {
  background: var(--library-storage-color);
}

[data-category='songs'] {
  --library-storage-color: var(--ui-color-accent);
}

[data-category='instrumental'] {
  --library-storage-color: var(--ui-color-info);
}

[data-category='videos'] {
  --library-storage-color: var(--ui-color-success);
}

[data-category='other'] {
  --library-storage-color: var(--ui-color-text-muted);
}

.library-storage__categories {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-2) var(--ui-space-3);
  margin: 0;
}

.library-storage__category {
  min-width: 0;
  display: grid;
  align-content: start;
}

.library-storage__category dt,
.library-storage__category dd {
  margin: 0;
}

.library-storage__category dt {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
}

.library-storage__category dt::before {
  content: '';
  flex: 0 0 var(--ui-progress-track-size);
  block-size: var(--ui-progress-track-size);
  border-radius: var(--ui-radius-xs);
  background: var(--library-storage-color);
}

.library-storage__category dd {
  margin-inline-start: calc(var(--ui-progress-track-size) + var(--ui-space-1));
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.library-storage__controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, max-content);
  align-items: start;
  gap: var(--ui-space-3);
  padding-block-start: var(--settings-child-padding-block, var(--ui-space-3));
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.library-storage__limit {
  min-inline-size: min(100%, var(--settings-select-inline-size));
}

.library-storage__cleanup {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}

@container settings-section (max-width: 35rem) {
  .library-storage__categories {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .library-storage__controls {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }

  .library-storage__limit {
    justify-self: start;
    max-inline-size: 100%;
  }
}
</style>
