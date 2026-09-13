<script setup>
import { computed, shallowRef } from 'vue';
import { BadgeCheck, Trash2 } from '../../icons/index.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import DemoCandidateCheckbox from './DemoCandidateCheckbox.vue';
import DemoCandidateChip from './DemoCandidateChip.vue';
import DemoCandidateStatusIcon from './DemoCandidateStatusIcon.vue';
import DemoCandidateTrackRow from './DemoCandidateTrackRow.vue';

const props = defineProps({
  layer: { type: Object, required: true },
});

const COMPONENT_LAYERS = {
  candidate: {
    row: DemoCandidateTrackRow,
    checkbox: DemoCandidateCheckbox,
    chip: DemoCandidateChip,
    statusIcon: DemoCandidateStatusIcon,
  },
  current: {
    row: UiTrackRow,
    checkbox: UiCheckbox,
    chip: UiChip,
    statusIcon: UiStatusIcon,
    iconButton: UiIconButton,
  },
};

const components = computed(() => COMPONENT_LAYERS[props.layer.key]);
const selectionChecked = shallowRef(true);
const operationFeedback = shallowRef('尚未操作');

const STATE_ROWS = [
  {
    id: 'selected',
    label: '選取',
    track: {
      id: 'state-selected',
      title: 'アイドル',
      artist: 'YOASOBI',
      duration: 213,
    },
    selected: true,
  },
  {
    id: 'current',
    label: '播放中',
    track: {
      id: 'state-current',
      title: '밤편지',
      artist: 'IU',
      duration: 253,
    },
    current: true,
  },
  {
    id: 'selected-current',
    label: '選取＋播放中',
    track: {
      id: 'state-selected-current',
      title: '群青日和',
      artist: '東京事変',
      duration: 213,
    },
    selected: true,
    current: true,
  },
  {
    id: 'disabled',
    label: '停用',
    track: {
      id: 'state-disabled',
      title: '尚未可分析的曲目',
      artist: '等待分析功能',
      duration: 198,
    },
    disabled: true,
  },
];

const CONTENT_ROWS = [
  {
    id: 'long-multilingual',
    label: '多語長內容',
    track: {
      id: 'content-long-multilingual',
      title:
        '夏夜裡的多語版本／SummerLiveSessionFinalMixWithoutConvenientBreaks20260913.wav',
      artist: '本機演出者／アーティスト／아티스트',
      duration: 245,
    },
  },
  {
    id: 'rtl-narrow',
    label: '窄欄 RTL',
    narrow: true,
    dir: 'rtl',
    lang: 'ar',
    track: {
      id: 'content-rtl-narrow',
      title: 'ليلة هادئة — النسخة الطويلة',
      artist: 'فرقة محلية',
      duration: 221,
    },
  },
];

function handleSelectionChange(value) {
  selectionChecked.value = value;
  reportOperation(value ? 'Checkbox 選取' : 'Checkbox 取消選取');
}

function reportOperation(action) {
  operationFeedback.value = action;
}

function rowProps(layer, sample) {
  const common = {
    track: sample.track,
    title: sample.title,
    artist: sample.artist,
    current: Boolean(sample.current),
    interactive:
      layer.key === 'current' && sample.disabled
        ? false
        : Boolean(sample.interactive),
    hideDuration: Boolean(sample.hideDuration),
    lang: sample.lang,
    dir: sample.dir,
  };

  if (layer.key === 'candidate') {
    return {
      ...common,
      selected: Boolean(sample.selected),
      disabled: Boolean(sample.disabled),
      actionAriaLabel: sample.interactive
        ? sample.actionLabel || `播放${sample.track.title}`
        : undefined,
      artworkClickable: Boolean(sample.albumDestination),
      artworkAriaLabel: sample.albumDestination
        ? `前往專輯：${sample.track.title}`
        : undefined,
      onActivate: sample.onActivate,
      onArtworkClick: sample.onAlbumNavigate,
    };
  }

  return {
    ...common,
    active: Boolean(sample.selected),
    titleClickable: Boolean(sample.albumDestination),
    titleAriaLabel: sample.albumDestination
      ? `前往專輯：${sample.track.title}`
      : undefined,
    'aria-label': sample.interactive
      ? sample.actionLabel || `播放${sample.track.title}`
      : undefined,
    'aria-current': sample.current ? 'true' : undefined,
    'aria-disabled': sample.disabled || undefined,
    onClick: sample.onActivate,
    onTitleClick: sample.onAlbumNavigate,
  };
}

function controlProps(layer, kind, sampleId, modelValue = true) {
  if (kind === 'checkbox') {
    return {
      id: `${layer.key}-${sampleId}-checkbox`,
      label: layer.key === 'candidate' ? '選取音樂分析候選' : '選取',
      labelHidden: layer.key === 'candidate' || undefined,
      modelValue,
    };
  }
  if (kind === 'status') {
    return {
      icon: BadgeCheck,
      tone: 'success',
      label: '已可用',
      size: layer.key === 'candidate' ? 'compact' : undefined,
    };
  }
  return {};
}
</script>

<template>
  <div
    class="demo-track-row-primitive"
    :class="`demo-track-row-primitive--${layer.key}`"
  >
    <section class="demo-track-row-block demo-track-row-role">
      <header class="demo-track-row-subsection__header">
        <h5>邊界</h5>
        <p>封面、曲名、演出者、時長與前後 slots。</p>
      </header>

      <p class="demo-track-row-role__note">
        文字可選；排序與拖曳不在 Row。<template v-if="layer.key === 'candidate'"
          >文字層位於整列 action 上方；一般點擊轉送
          Row，拖選文字則不觸發。</template
        ><template v-else
          >整列由 li 的 button role 承接；標題與尾端按鈕仍巢狀其中。</template
        >
      </p>

      <ul class="demo-track-row-list">
        <component
          :is="components.row"
          v-bind="
            rowProps(layer, {
              track: {
                id: 'anatomy',
                title: '海螺記',
                artist: '本機演出者',
                duration: 214,
              },
            })
          "
        >
          <template #trail>
            <component
              :is="components.statusIcon"
              v-bind="controlProps(layer, 'status', 'anatomy')"
            />
          </template>
        </component>
      </ul>
    </section>

    <section class="demo-track-row-block demo-track-row-density">
      <header class="demo-track-row-subsection__header">
        <h5>尺寸</h5>
        <p>填滿 caller；52／44px 是高度 floor，不設硬 max-height。</p>
      </header>

      <div v-if="layer.key === 'candidate'" class="demo-track-row-density-list">
        <article
          class="demo-track-row-density--standard"
          data-track-row-density="standard"
        >
          <span class="demo-track-row-item__label">Standard · 52／40px</span>
          <ul class="demo-track-row-list">
            <component
              :is="components.row"
              v-bind="
                rowProps(layer, {
                  track: {
                    id: 'density-standard',
                    title: 'Standard 曲目列',
                    artist: '52px row · 40px artwork',
                    duration: 224,
                  },
                })
              "
            />
          </ul>
        </article>

        <article
          class="demo-track-row-density--compact"
          data-track-row-density="compact"
        >
          <span class="demo-track-row-item__label">Compact · 44／36px</span>
          <ul class="demo-track-row-list">
            <component
              :is="components.row"
              v-bind="
                rowProps(layer, {
                  track: {
                    id: 'density-compact',
                    title: 'Compact 曲目列',
                    artist: '44px row · 36px artwork',
                    duration: 224,
                  },
                })
              "
            />
          </ul>
        </article>
      </div>

      <div v-else class="demo-track-row-density-list">
        <article data-track-row-density="current">
          <span class="demo-track-row-item__label">Current · 52／40px</span>
          <ul class="demo-track-row-list">
            <component
              :is="components.row"
              v-bind="
                rowProps(layer, {
                  track: {
                    id: 'density-current',
                    title: '現行曲目列',
                    artist: '52px row · 40px artwork',
                    duration: 224,
                  },
                })
              "
            />
          </ul>
        </article>
      </div>
    </section>

    <section class="demo-track-row-block demo-track-row-states">
      <header class="demo-track-row-subsection__header">
        <h5>狀態</h5>
        <p v-if="layer.key === 'candidate'">
          選取用中性 surface；播放中只強調曲名並保留 current 語意。
        </p>
        <p v-else>
          選取與目前播放可以同時存在；目前播放僅以曲名顏色提示，停用列改為非互動。
        </p>
      </header>

      <div class="demo-track-row-state-list">
        <article
          v-for="sample in STATE_ROWS"
          :key="sample.id"
          :data-track-row-state="sample.id"
        >
          <span class="demo-track-row-item__label">{{ sample.label }}</span>
          <ul class="demo-track-row-list">
            <component :is="components.row" v-bind="rowProps(layer, sample)" />
          </ul>
        </article>
      </div>
    </section>

    <section class="demo-track-row-block demo-track-row-recipes">
      <header class="demo-track-row-subsection__header">
        <h5>可操作範例</h5>
        <p v-if="layer.key === 'candidate'">
          整列播放；Checkbox 選取；縮圖前往專輯。操作只留型錄。
        </p>
        <p v-else>正式 primitives 與現行尾端操作；各 action 維持獨立。</p>
      </header>

      <div class="demo-track-row-recipe-list">
        <article data-track-row-recipe="playback-selection-navigation">
          <header class="demo-track-row-operation__header">
            <span class="demo-track-row-item__label">
              {{
                layer.key === 'candidate'
                  ? '播放、選取與縮圖導覽'
                  : '播放、選取、導覽與尾端（現行）'
              }}
            </span>
            <span class="demo-track-row-operation__feedback" aria-live="polite">
              {{ selectionChecked ? '已選取' : '未選取' }} · 最近操作：{{
                operationFeedback
              }}
            </span>
          </header>
          <ul class="demo-track-row-list">
            <component
              :is="components.row"
              v-bind="
                rowProps(layer, {
                  track: {
                    id: 'recipe-playback-selection-navigation',
                    title: '可前往專輯的曲目',
                    artist: '本機演出者',
                    duration: 229,
                  },
                  selected: selectionChecked,
                  interactive: true,
                  albumDestination: true,
                  actionLabel: '播放可前往專輯的曲目',
                  onActivate: () => reportOperation('整列播放'),
                  onAlbumNavigate: () => reportOperation('縮圖前往專輯'),
                })
              "
            >
              <template #lead>
                <span
                  class="demo-track-row-selection-control"
                  :class="{
                    'demo-track-row-selection-lane': layer.key === 'candidate',
                  }"
                  @click.stop
                >
                  <component
                    :is="components.checkbox"
                    v-if="layer.key === 'candidate'"
                    v-bind="
                      controlProps(
                        layer,
                        'checkbox',
                        'playback-selection-navigation',
                        selectionChecked,
                      )
                    "
                    class="demo-track-row-selection-lane__control"
                    @update:model-value="handleSelectionChange"
                  />
                  <component
                    :is="components.checkbox"
                    v-else
                    v-bind="
                      controlProps(
                        layer,
                        'checkbox',
                        'playback-selection-navigation',
                        selectionChecked,
                      )
                    "
                    @update:model-value="handleSelectionChange"
                  />
                </span>
              </template>
              <template #trail>
                <component :is="components.chip">WAV</component>
                <component :is="components.chip" tone="danger"
                  >分析失敗</component
                >
                <component
                  :is="components.iconButton"
                  v-if="layer.key === 'current'"
                  :icon="Trash2"
                  label="刪除曲目"
                  @click.stop="reportOperation('尾端刪除')"
                />
              </template>
            </component>
          </ul>
        </article>
      </div>
    </section>

    <section class="demo-track-row-block demo-track-row-content">
      <header class="demo-track-row-subsection__header">
        <h5>內容壓力</h5>
        <p>多語與窄 RTL；metadata 可選取。</p>
      </header>

      <div class="demo-track-row-content-list">
        <article
          v-for="sample in CONTENT_ROWS"
          :key="sample.id"
          :class="{ 'demo-track-row-content--narrow': sample.narrow }"
          :data-track-row-content="sample.id"
        >
          <span class="demo-track-row-item__label">{{ sample.label }}</span>
          <ul class="demo-track-row-list">
            <component :is="components.row" v-bind="rowProps(layer, sample)" />
          </ul>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-track-row-primitive,
.demo-track-row-block,
.demo-track-row-list,
.demo-track-row-state-list,
.demo-track-row-recipe-list,
.demo-track-row-density-list,
.demo-track-row-content-list {
  min-width: 0;
  display: grid;
}

.demo-track-row-primitive,
.demo-track-row-block {
  gap: var(--ui-space-4);
}

.demo-track-row-primitive {
  gap: var(--ui-space-6);
}

.demo-track-row-subsection__header,
.demo-track-row-subsection__header h5,
.demo-track-row-subsection__header p,
.demo-track-row-role__note,
.demo-track-row-item__label {
  margin: 0;
}

.demo-track-row-subsection__header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(10rem, 0.32fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-track-row-subsection__header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-track-row-subsection__header p,
.demo-track-row-role__note,
.demo-track-row-item__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-track-row-state-list article,
.demo-track-row-recipe-list article,
.demo-track-row-density-list article,
.demo-track-row-content-list article {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
}

.demo-track-row-list {
  gap: var(--ui-track-list-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo-track-row-state-list,
.demo-track-row-density-list {
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
  gap: var(--ui-space-4);
}

.demo-track-row-recipe-list {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-3);
}

.demo-track-row-density--standard {
  --ui-track-row-min-height: 3.25rem;
  --ui-track-row-thumb-size: 2.5rem;
}

.demo-track-row-density--compact {
  --ui-track-row-min-height: 2.75rem;
  --ui-track-row-thumb-size: 2.25rem;
}

.demo-track-row-content-list {
  gap: var(--ui-space-3);
}

.demo-track-row-content--narrow {
  width: min(100%, 18rem);
}

.demo-track-row-item__label {
  font-weight: var(--ui-font-weight-semibold);
}

.demo-track-row-operation__header {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.demo-track-row-operation__feedback {
  min-width: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  text-align: end;
  overflow-wrap: anywhere;
}

.demo-track-row-selection-lane {
  position: relative;
  width: var(--ui-checkbox-size);
  height: var(--ui-control-height);
  flex: 0 0 var(--ui-checkbox-size);
}

.demo-track-row-selection-lane__control {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  transform: translate(-50%, -50%);
}

@container (max-width: 42rem) {
  .demo-track-row-subsection__header {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
