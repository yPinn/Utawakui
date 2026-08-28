<script setup>
/* global URLSearchParams, document, window */

import { onBeforeUnmount, shallowRef, watchEffect } from 'vue';
import { Check, Ellipsis, Play } from '../../../src/icons/index.js';
import UiButton from '../../../src/components/ui/UiButton.vue';
import UiCheckbox from '../../../src/components/ui/UiCheckbox.vue';
import UiChip from '../../../src/components/ui/UiChip.vue';
import UiContextMenu from '../../../src/components/ui/UiContextMenu.vue';
import UiField from '../../../src/components/ui/UiField.vue';
import UiHint from '../../../src/components/ui/UiHint.vue';
import UiIconButton from '../../../src/components/ui/UiIconButton.vue';
import UiModal from '../../../src/components/ui/UiModal.vue';
import UiNotice from '../../../src/components/ui/UiNotice.vue';
import UiPageHeader from '../../../src/components/ui/UiPageHeader.vue';
import UiProgress from '../../../src/components/ui/UiProgress.vue';
import UiRange from '../../../src/components/ui/UiRange.vue';
import UiSearchBox from '../../../src/components/ui/UiSearchBox.vue';
import UiSelect from '../../../src/components/ui/UiSelect.vue';
import UiStatusIcon from '../../../src/components/ui/UiStatusIcon.vue';
import UiTabs from '../../../src/components/ui/UiTabs.vue';
import UiTextarea from '../../../src/components/ui/UiTextarea.vue';
import UiTextField from '../../../src/components/ui/UiTextField.vue';
import UiTrackRow from '../../../src/components/ui/UiTrackRow.vue';

const requestedTheme = new URLSearchParams(window.location.search).get('theme');
const requestedState = new URLSearchParams(window.location.search).get('state');
const requestedTab = new URLSearchParams(window.location.search).get('tab');
const requestedMotion = new URLSearchParams(window.location.search).get(
  'motion',
);
const theme = shallowRef(
  requestedTheme === 'light' || requestedTheme === 'dark'
    ? requestedTheme
    : 'dark',
);
const density = shallowRef('standard');
const motion = shallowRef(requestedMotion === 'reduced' ? 'reduced' : 'full');
const state = shallowRef(
  ['default', 'invalid', 'loading', 'disabled'].includes(requestedState)
    ? requestedState
    : 'default',
);
const title = shallowRef('Blue Archive Medley');
const note = shallowRef('Guide vocal at 42%; preserve the full intro.');
const mode = shallowRef('general');
const force = shallowRef(false);
const volume = shallowRef(0.42);
const query = shallowRef('');
const activeTab = shallowRef(
  requestedTab === 'feedback' ? 'feedback' : 'controls',
);
const modalOpen = shallowRef(false);
const menuOpen = shallowRef(false);

const originalDataset = {
  system: document.documentElement.dataset.uiSystem,
  theme: document.documentElement.dataset.uiTheme,
  density: document.documentElement.dataset.uiDensity,
  motion: document.documentElement.dataset.uiMotion,
};

watchEffect(() => {
  document.documentElement.dataset.uiSystem = 'v2';
  document.documentElement.dataset.uiTheme = theme.value;
  document.documentElement.dataset.uiDensity = density.value;
  document.documentElement.dataset.uiMotion = motion.value;
});

onBeforeUnmount(() => {
  for (const [key, value] of Object.entries(originalDataset)) {
    const dataKey = `ui${key[0].toUpperCase()}${key.slice(1)}`;
    if (value) document.documentElement.dataset[dataKey] = value;
    else delete document.documentElement.dataset[dataKey];
  }
});

const disabled = () => state.value === 'disabled';
const invalid = () => state.value === 'invalid';
const loading = () => state.value === 'loading';

const tabs = [
  { id: 'controls', label: 'Controls' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'disabled', label: 'Unavailable', disabled: true },
];

const modes = [
  { value: 'quick', label: 'Quick' },
  { value: 'general', label: 'General' },
  { value: 'refined', label: 'Refined', disabled: true },
];

const menuItems = [
  { key: 'queue', label: 'Add to queue', value: 'queue' },
  { key: 'details', label: 'Open details', value: 'details' },
  { separator: true },
  { key: 'remove', label: 'Remove', value: 'remove', danger: true },
];
</script>

<template>
  <main class="component-lab">
    <UiPageHeader title="UI Component Foundation" />
    <UiHint>Real shared Vue components under isolated candidate tokens.</UiHint>

    <section class="lab-toolbar" aria-label="Lab controls">
      <UiSelect
        id="lab-theme"
        v-model="theme"
        label="Theme"
        :options="[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
        ]"
      />
      <UiSelect
        id="lab-density"
        v-model="density"
        label="Density"
        :options="[
          { value: 'standard', label: 'Standard' },
          { value: 'compact', label: 'Compact' },
        ]"
      />
      <UiSelect
        id="lab-motion"
        v-model="motion"
        label="Motion"
        :options="[
          { value: 'full', label: 'Full' },
          { value: 'reduced', label: 'Reduced' },
        ]"
      />
      <UiSelect
        id="lab-state"
        v-model="state"
        label="State"
        :options="[
          { value: 'default', label: 'Default' },
          { value: 'invalid', label: 'Invalid' },
          { value: 'loading', label: 'Loading' },
          { value: 'disabled', label: 'Disabled' },
        ]"
      />
    </section>

    <UiTabs
      :items="tabs"
      :active-id="activeTab"
      aria-label="Component groups"
      tab-id-prefix="lab"
      panel-id-prefix="lab"
      @update:active-id="activeTab = $event"
    />

    <section
      v-if="activeTab === 'controls'"
      id="lab-controls-panel"
      class="lab-grid"
      role="tabpanel"
      aria-labelledby="lab-controls-tab"
    >
      <article class="lab-panel">
        <h2>Actions</h2>
        <div class="lab-row">
          <UiButton :disabled="disabled()">Ghost action</UiButton>
          <UiButton
            variant="accent"
            :loading="loading()"
            :disabled="disabled()"
          >
            Primary action
          </UiButton>
          <UiIconButton :icon="Play" label="Play" :disabled="disabled()" />
          <UiIconButton :icon="Ellipsis" label="More actions" />
        </div>
      </article>

      <article class="lab-panel">
        <h2>Fields</h2>
        <div class="lab-fields">
          <UiTextField
            id="lab-title"
            v-model="title"
            label="Track title"
            hint="Traditional Chinese, Japanese, Korean, and Latin text are supported."
            :error="invalid() ? 'Track title is required.' : ''"
            :disabled="disabled()"
            required
          />
          <UiTextarea
            id="lab-note"
            v-model="note"
            label="Operator note"
            :disabled="disabled()"
          />
          <UiSelect
            id="lab-mode"
            v-model="mode"
            label="Processing mode"
            :options="modes"
            :disabled="disabled()"
          />
          <UiCheckbox
            id="lab-force"
            v-model="force"
            label="Force refresh"
            hint="Ignore a valid local result for this run."
            :disabled="disabled()"
          />
          <UiRange
            id="lab-volume"
            v-model="volume"
            label="Guide vocal"
            :min="0"
            :max="1"
            :step="0.01"
            :value-text="`${Math.round(volume * 100)}%`"
            :disabled="disabled()"
          />
          <UiSearchBox
            id="lab-search"
            v-model="query"
            label="Search component catalog"
            :disabled="disabled()"
          />
          <UiField
            id="lab-native"
            label="Field slot contract"
            hint="A native control can consume scoped accessibility props."
          >
            <template #default="{ describedBy, invalid: fieldInvalid }">
              <input
                id="lab-native"
                class="lab-native-field"
                :aria-describedby="describedBy"
                :aria-invalid="fieldInvalid || undefined"
              />
            </template>
          </UiField>
        </div>
      </article>

      <article class="lab-panel">
        <h2>Data row</h2>
        <ul class="lab-track-list">
          <UiTrackRow
            :track="{
              id: 'fixture-track',
              title: '夜に駆ける — Component Fixture',
              artist: 'YOASOBI／測試歌手',
              duration: 261,
            }"
            active
            current
          >
            <template #trail>
              <UiStatusIcon :icon="Check" tone="success" label="Ready" />
            </template>
          </UiTrackRow>
        </ul>
      </article>
    </section>

    <section
      v-else
      id="lab-feedback-panel"
      class="lab-grid"
      role="tabpanel"
      aria-labelledby="lab-feedback-tab"
    >
      <article class="lab-panel">
        <h2>Feedback</h2>
        <div class="lab-row">
          <UiChip tone="muted">Neutral</UiChip>
          <UiChip tone="info">Info</UiChip>
          <UiChip tone="success">Ready</UiChip>
          <UiChip tone="warning">Review</UiChip>
          <UiChip tone="danger">Error</UiChip>
        </div>
        <UiNotice
          tone="warning"
          title="Recoverable warning"
          message="The fixture keeps product behavior disconnected."
          action-label="Review"
        />
        <UiHint padded
          >Empty and supporting copy uses the shared hint contract.</UiHint
        >
        <UiProgress
          label="Component verification"
          :value="loading() ? 0 : 72"
          :value-text="loading() ? '' : '72%'"
          :indeterminate="loading()"
        />
      </article>

      <article class="lab-panel">
        <h2>Overlays</h2>
        <div class="lab-row">
          <UiButton @click="modalOpen = true">Open modal</UiButton>
          <UiButton @click="menuOpen = true">Open menu</UiButton>
        </div>
      </article>
    </section>

    <UiModal
      :open="modalOpen"
      title="Component dialog"
      @close="modalOpen = false"
    >
      <UiTextField
        id="dialog-field"
        label="Dialog field"
        model-value="Fixture"
      />
    </UiModal>
    <UiContextMenu
      :open="menuOpen"
      :x="48"
      :y="160"
      :items="menuItems"
      @close="menuOpen = false"
      @select="menuOpen = false"
    />
  </main>
</template>
