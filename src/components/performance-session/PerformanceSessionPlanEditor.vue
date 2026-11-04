<script setup>
import { computed, shallowRef, watch } from 'vue';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { artistSearchTexts, trackArtistText } from '../../utils/artistPage.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import PerformanceSessionReviewPane from './PerformanceSessionReviewPane.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  item: { type: Object, default: null },
  tracks: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  validationError: { type: Object, default: null },
});

const emit = defineEmits(['saveDisplay', 'relink', 'close']);
const { state: artistIndexState } = useArtistIndex();
const linkedArtist = computed(() =>
  trackArtistText(props.item?.linkedTrack, artistIndexState.index),
);

const displayTitle = shallowRef('');
const displayArtist = shallowRef('');
const trackId = shallowRef('');
const trackFilter = shallowRef('');
const editing = shallowRef(false);

watch(
  () => props.item,
  (item) => {
    displayTitle.value = item?.displayTitle ?? '';
    displayArtist.value = item?.displayArtist ?? '';
    trackId.value = item?.trackId ?? '';
    trackFilter.value = '';
    editing.value = false;
  },
  { immediate: true },
);

const needsTrackRecovery = computed(
  () =>
    props.item?.mode === 'placeholder' || props.item?.status === 'unavailable',
);
const showForm = computed(
  () =>
    editing.value || props.item?.mode === 'manual' || needsTrackRecovery.value,
);

const trackOptions = computed(() => {
  const query = trackFilter.value.trim().toLocaleLowerCase();
  const options = props.tracks
    .filter(
      (track) =>
        !query ||
        track.id === trackId.value ||
        [
          track.title,
          ...artistSearchTexts(track, artistIndexState.index),
          track.id,
        ].some((value) =>
          String(value ?? '')
            .toLocaleLowerCase()
            .includes(query),
        ),
    )
    .map((track) => {
      const artist = trackArtistText(track, artistIndexState.index);
      return {
        value: track.id,
        label: artist ? `${track.title} — ${artist}` : track.title,
      };
    });
  if (
    props.item?.trackId &&
    !props.tracks.some((track) => track.id === props.item.trackId)
  ) {
    options.unshift({
      value: props.item.trackId,
      label: t('session.editor.missingLink', { id: props.item.trackId }),
      disabled: true,
    });
  }
  options.unshift({ value: '', label: t('session.editor.chooseTrack') });
  return options;
});

const canSave = computed(
  () =>
    Boolean(displayTitle.value.trim()) &&
    (!needsTrackRecovery.value || Boolean(trackId.value)),
);

function displayFields() {
  return {
    displayTitle: displayTitle.value,
    displayArtist: displayArtist.value,
  };
}

function submit() {
  if (needsTrackRecovery.value) {
    emit('relink', {
      ...displayFields(),
      trackId: trackId.value || null,
    });
    return;
  }
  emit('saveDisplay', displayFields());
}

function startEditing() {
  editing.value = true;
}

function cancelEditing() {
  displayTitle.value = props.item?.displayTitle ?? '';
  displayArtist.value = props.item?.displayArtist ?? '';
  trackId.value = props.item?.trackId ?? '';
  trackFilter.value = '';
  editing.value = false;
}
</script>

<template>
  <PerformanceSessionReviewPane
    class="performance-session-editor"
    :title="t('session.editor.title')"
    :saving="saving"
    aria-labelledby="performance-session-editor-title"
    :body-label="t('session.editor.bodyLabel')"
    @close="emit('close')"
  >
    <div v-if="item" class="performance-session-editor__body">
      <header class="performance-session-editor__header">
        <p class="performance-session-editor__eyebrow">
          {{
            t(
              item.mode === 'manual'
                ? 'session.editor.manualItem'
                : 'session.editor.queuedTrack',
            )
          }}
        </p>
        <h2
          id="performance-session-editor-title"
          class="performance-session-editor__title"
          dir="auto"
        >
          {{ item.displayTitle }}
        </h2>
        <p
          v-if="item.displayArtist"
          class="performance-session-editor__artist"
          dir="auto"
        >
          {{ item.displayArtist }}
        </p>
      </header>

      <UiNotice
        v-if="item.status === 'unavailable'"
        tone="danger"
        :title="t('session.editor.audioMissingTitle')"
        :message="t('session.editor.audioMissingMessage')"
        compact
      />
      <UiNotice
        v-else-if="item.status === 'needs-link'"
        tone="warning"
        :title="t('session.editor.needsLinkTitle')"
        :message="t('session.editor.needsLinkMessage')"
        compact
      />
      <UiNotice
        v-else-if="item.status === 'source-changed'"
        tone="warning"
        :title="t('session.editor.libraryChangedTitle')"
        :message="t('session.editor.libraryChangedMessage')"
        compact
      />
      <UiNotice
        v-if="validationError"
        tone="warning"
        :title="t('session.editor.unsaved')"
        :message="validationError.message"
        compact
      />

      <div
        v-if="item.linkedTrack && !showForm"
        class="performance-session-editor__source"
      >
        <span class="performance-session-editor__source-label">{{
          t('session.editor.libraryReadOnly')
        }}</span>
        <dl class="performance-session-editor__source-details">
          <div class="performance-session-editor__source-row">
            <dt>{{ t('session.editor.libraryTitle') }}</dt>
            <dd dir="auto">{{ item.linkedTrack.title }}</dd>
          </div>
          <div
            v-if="linkedArtist"
            class="performance-session-editor__source-row"
          >
            <dt>{{ t('session.editor.libraryArtist') }}</dt>
            <dd dir="auto">{{ linkedArtist }}</dd>
          </div>
        </dl>
      </div>

      <form
        v-if="showForm"
        class="performance-session-editor__form"
        @submit.prevent
      >
        <UiTextField
          id="performance-session-display-title"
          v-model="displayTitle"
          :label="t('session.editor.displayTitle')"
          :hint="t('session.editor.displayTitleHint')"
          :maxlength="200"
          required
        />
        <UiTextField
          id="performance-session-display-artist"
          v-model="displayArtist"
          :label="t('session.editor.secondLine')"
          :hint="t('session.editor.secondLineHint')"
          :maxlength="200"
        />
        <template v-if="needsTrackRecovery">
          <UiTextField
            id="performance-session-track-filter"
            v-model="trackFilter"
            :label="t('session.editor.searchLabel')"
            :placeholder="t('session.editor.searchPlaceholder')"
          />
          <UiSelect
            id="performance-session-track-link"
            v-model="trackId"
            :label="t('session.editor.trackLabel')"
            :options="trackOptions"
          />
          <UiHint v-if="trackOptions.length === 1 && trackFilter.trim()">
            {{ t('session.editor.noMatch') }}
          </UiHint>
        </template>
      </form>
    </div>

    <UiHint v-else id="performance-session-editor-title" padded center>
      {{ t('session.editor.chooseHint') }}
    </UiHint>
    <template v-if="item" #actions>
      <template v-if="showForm">
        <UiButton
          v-if="!needsTrackRecovery && item.mode !== 'manual'"
          :disabled="saving"
          @click="cancelEditing"
        >
          {{ t('session.editor.cancel') }}
        </UiButton>
        <UiButton
          variant="accent"
          :disabled="saving || !canSave"
          @click="submit"
        >
          {{
            t(
              needsTrackRecovery
                ? 'session.editor.linkExisting'
                : 'session.editor.saveDisplay',
            )
          }}
        </UiButton>
      </template>
      <template v-else>
        <UiButton variant="secondary" :disabled="saving" @click="startEditing">
          {{ t('session.editor.editDisplay') }}
        </UiButton>
      </template>
    </template>
  </PerformanceSessionReviewPane>
</template>

<style scoped>
.performance-session-editor__body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.performance-session-editor__header {
  min-width: 0;
}

.performance-session-editor__eyebrow,
.performance-session-editor__title,
.performance-session-editor__artist {
  margin: 0;
}

.performance-session-editor__eyebrow {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.performance-session-editor__title {
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
  overflow-wrap: anywhere;
}

.performance-session-editor__artist {
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  overflow-wrap: anywhere;
}

.performance-session-editor__source {
  display: grid;
  gap: var(--ui-space-1);
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
}

.performance-session-editor__source-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.performance-session-editor__source-details {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
}

.performance-session-editor__source-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--ui-space-2);
  align-items: baseline;
}

.performance-session-editor__source-row dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.performance-session-editor__source-row dd {
  min-width: 0;
  margin: 0;
  font-size: var(--ui-type-body-compact-size);
  font-weight: var(--ui-type-body-compact-weight);
  line-height: var(--ui-type-body-compact-line-height);
  overflow-wrap: anywhere;
}

.performance-session-editor__form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
</style>
