<script setup>
import { PanelRightClose, PanelRightOpen, Volume2 } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';

defineProps({
  open: { type: Boolean, required: true },
  collectionTitle: { type: String, required: true },
  coverUrl: { type: String, default: '' },
  tracks: { type: Array, default: () => [] },
  canCollage: { type: Boolean, default: true },
  facts: {
    type: Array,
    default: () => [],
    validator: (facts) =>
      facts.every(
        (fact) =>
          fact &&
          typeof fact.id === 'string' &&
          fact.id.trim() !== '' &&
          typeof fact.label === 'string' &&
          fact.label.trim() !== '' &&
          typeof fact.value === 'string',
      ),
  },
  currentTrackTitle: { type: String, default: '' },
});

const emit = defineEmits(['toggle']);
</script>

<template>
  <aside
    class="studio-context-inspector"
    :class="{
      'studio-context-inspector--open': open,
      'studio-context-inspector--collapsed': !open,
    }"
    :aria-label="open ? '集合資料' : '集合資料（已摺疊）'"
  >
    <div
      id="studio-library-inspector-content"
      class="studio-context-inspector__content"
      :hidden="!open"
      :aria-hidden="!open"
    >
      <header class="studio-context-inspector__header">
        <div class="studio-context-inspector__identity">
          <h2>集合資料</h2>
          <p>{{ collectionTitle }}</p>
        </div>
        <UiIconButton
          class="studio-context-inspector__collapse"
          :icon="PanelRightClose"
          label="摺疊集合資料"
          size="md"
          :aria-expanded="true"
          aria-controls="studio-library-inspector-content"
          @click="emit('toggle')"
        />
      </header>

      <div class="studio-context-inspector__scroll">
        <div class="studio-context-inspector__artwork-frame">
          <UiCollageThumb
            class="studio-context-inspector__artwork"
            :cover-url="coverUrl"
            :tracks="tracks"
            :can-collage="canCollage"
            :size="280"
          />
        </div>

        <section class="studio-context-inspector__section">
          <div class="studio-context-inspector__section-heading">
            <h3>檔案摘要</h3>
            <UiChip>Local</UiChip>
          </div>
          <dl>
            <div v-for="fact in facts" :key="fact.id">
              <dt>{{ fact.label }}</dt>
              <dd>{{ fact.value }}</dd>
            </div>
          </dl>
        </section>

        <section
          v-if="currentTrackTitle"
          class="studio-context-inspector__section studio-context-inspector__current"
        >
          <UiStatusIcon
            :icon="Volume2"
            tone="current"
            :label="`目前播放：${currentTrackTitle}`"
            decorative
          />
          <div class="studio-context-inspector__current-copy">
            <h3>目前播放</h3>
            <p>{{ currentTrackTitle }}</p>
          </div>
        </section>

        <p class="studio-context-inspector__caption">
          資料來自目前的本機曲庫，不代表公開 Output 狀態。
        </p>
      </div>
    </div>

    <UiIconButton
      v-if="!open"
      class="studio-context-inspector__expand"
      :icon="PanelRightOpen"
      label="展開集合資料"
      :aria-expanded="false"
      aria-controls="studio-library-inspector-content"
      shape="inherit"
      stretch
      @click="emit('toggle')"
    />
  </aside>
</template>

<style scoped>
.studio-context-inspector {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  background: var(--ui-color-surface-raised);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
}

.studio-context-inspector--open {
  display: flex;
  flex-direction: column;
  width: var(--ui-inspector-width);
  height: 100%;
}

.studio-context-inspector--collapsed {
  display: grid;
  width: var(--ui-inspector-rail-width);
  height: 100%;
}

.studio-context-inspector__content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.studio-context-inspector__content[hidden] {
  display: none;
}

.studio-context-inspector__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.studio-context-inspector__identity {
  min-width: 0;
}

.studio-context-inspector__identity h2,
.studio-context-inspector__identity p,
.studio-context-inspector__section h3,
.studio-context-inspector__section dl,
.studio-context-inspector__section dt,
.studio-context-inspector__section dd,
.studio-context-inspector__current p,
.studio-context-inspector__caption {
  margin: 0;
}

.studio-context-inspector__identity h2 {
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.studio-context-inspector__identity p {
  overflow: hidden;
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__scroll {
  min-height: 0;
  overflow-y: auto;
}

.studio-context-inspector__artwork-frame {
  display: flex;
  justify-content: center;
  padding: var(--ui-space-4) var(--ui-space-4) 0;
}

.studio-context-inspector__artwork {
  box-shadow: var(--ui-shadow-contact);
}

.studio-context-inspector__section {
  padding: var(--ui-space-4);
}

.studio-context-inspector__section + .studio-context-inspector__section {
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.studio-context-inspector__section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-4);
}

.studio-context-inspector__section h3 {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.studio-context-inspector__section dl {
  display: grid;
  gap: var(--ui-space-3);
}

.studio-context-inspector__section dl div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--ui-space-3);
}

.studio-context-inspector__section dt,
.studio-context-inspector__section dd,
.studio-context-inspector__current p,
.studio-context-inspector__caption {
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.studio-context-inspector__section dt,
.studio-context-inspector__caption {
  color: var(--ui-color-text-muted);
}

.studio-context-inspector__section dd {
  overflow: hidden;
  max-width: 10rem;
  font-weight: var(--ui-font-weight-semibold);
  text-align: end;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__current {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-2);
}

.studio-context-inspector__current-copy {
  min-width: 0;
}

.studio-context-inspector__current p {
  overflow: hidden;
  margin-top: var(--ui-space-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__caption {
  padding: var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

/* Paired with AppArchiveFrame's temporary context plane. Keep the literal in
   sync through AppArchiveFrame.behavior.test.js rather than inventing a token
   that CSS media queries cannot consume. */
@media (max-width: 70rem) {
  .studio-context-inspector--open {
    width: min(
      var(--ui-inspector-width),
      calc(100vw - var(--ui-inspector-rail-width))
    );
    box-shadow: var(--ui-shadow-overlay);
  }
}
</style>
