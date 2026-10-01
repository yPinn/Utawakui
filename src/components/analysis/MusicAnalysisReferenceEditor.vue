<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { Plus } from '../../icons/index.js';
import {
  activeReferenceSectionIndex,
  formatReferenceTime,
  referenceRoleLabel,
  snapReferenceBoundary,
} from '../../utils/musicAnalysisReferenceAnnotation.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';

const props = defineProps({
  annotationCase: { type: Object, required: true },
  allowedRoles: { type: Array, required: true },
  currentTimeMs: { type: Number, default: 0 },
  isCurrentTrack: { type: Boolean, default: false },
  beats: { type: Array, default: () => [] },
  snapToDownbeats: { type: Boolean, default: true },
});

const emit = defineEmits([
  'add-boundary',
  'add-boundary-with-role',
  'move-boundary',
  'next-incomplete',
  'remove-boundary',
  'save',
  'seek',
  'update:snap-to-downbeats',
  'update-bpm',
  'update-role',
]);

const roundedCurrentTimeMs = computed(() => Math.round(props.currentTimeMs));
const candidateBoundaryMs = computed(() =>
  props.snapToDownbeats
    ? snapReferenceBoundary(roundedCurrentTimeMs.value, props.beats)
    : roundedCurrentTimeMs.value,
);
const activeSectionIndex = computed(() =>
  props.isCurrentTrack
    ? activeReferenceSectionIndex(
        props.annotationCase.referenceSections,
        props.currentTimeMs,
        props.annotationCase.durationMs,
      )
    : -1,
);
const boundaryAvailable = computed(
  () =>
    props.isCurrentTrack &&
    props.annotationCase.referenceSections.some(
      (section) =>
        section.startMs < candidateBoundaryMs.value &&
        candidateBoundaryMs.value < section.endMs,
    ),
);
const roleShortcuts = computed(() =>
  props.allowedRoles.slice(0, 7).map((role, index) => ({
    role,
    shortcut: index + 1,
    label: referenceRoleLabel(role),
  })),
);
const roleOptions = computed(() => [
  { value: '', label: '未標註' },
  ...props.allowedRoles.map((role) => ({
    value: role,
    label: referenceRoleLabel(role),
  })),
]);
const projectedSections = computed(() =>
  props.annotationCase.referenceSections.map((section, index) => ({
    ...section,
    index,
    label: referenceRoleLabel(section.role),
    widthPercent:
      ((section.endMs - section.startMs) / props.annotationCase.durationMs) *
      100,
  })),
);
const projectedBeats = computed(() =>
  props.beats
    .filter(
      (beat) =>
        Number.isFinite(beat?.timeMs) &&
        beat.timeMs >= 0 &&
        beat.timeMs <= props.annotationCase.durationMs,
    )
    .map((beat) => ({
      ...beat,
      leftPercent: (beat.timeMs / props.annotationCase.durationMs) * 100,
    })),
);
const downbeatCount = computed(
  () => props.beats.filter((beat) => beat?.downbeat === true).length,
);
const playheadPercent = computed(() =>
  Math.max(
    0,
    Math.min(
      100,
      (props.currentTimeMs / props.annotationCase.durationMs) * 100,
    ),
  ),
);

function handleBpm(value) {
  emit('update-bpm', value);
}

function handleRole(index, value) {
  emit('update-role', index, value || null);
}

function setActiveRole(role) {
  if (activeSectionIndex.value < 0) return;
  emit('update-role', activeSectionIndex.value, role);
}

function nudgeBoundary(index, deltaMs) {
  if (index <= 0) return;
  const boundaryMs = props.annotationCase.referenceSections[index]?.startMs;
  if (!Number.isFinite(boundaryMs)) return;
  emit('move-boundary', index, boundaryMs + deltaMs);
}

function handleShortcut(event) {
  if (event.defaultPrevented) return;
  const tagName = String(event.target?.tagName ?? '').toUpperCase();
  if (
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName) ||
    event.target?.isContentEditable
  ) {
    return;
  }
  const key = String(event.key ?? '').toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 's') {
    event.preventDefault();
    emit('save');
    return;
  }
  if (event.altKey && (key === 'arrowleft' || key === 'arrowright')) {
    if (activeSectionIndex.value > 0) {
      event.preventDefault();
      nudgeBoundary(activeSectionIndex.value, key === 'arrowleft' ? -100 : 100);
    }
    return;
  }
  if (key === 'b' && boundaryAvailable.value) {
    event.preventDefault();
    emit('add-boundary', candidateBoundaryMs.value);
    return;
  }
  if (key === 'n') {
    event.preventDefault();
    emit('next-incomplete');
    return;
  }
  const shortcut = Number(key);
  const item = roleShortcuts.value[shortcut - 1];
  if (!item || !Number.isInteger(shortcut)) return;
  if (event.shiftKey) {
    if (!boundaryAvailable.value) return;
    event.preventDefault();
    emit('add-boundary-with-role', candidateBoundaryMs.value, item.role);
    return;
  }
  if (activeSectionIndex.value >= 0) {
    event.preventDefault();
    setActiveRole(item.role);
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleShortcut);
  }
});
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleShortcut);
  }
});
</script>

<template>
  <div
    class="reference-editor"
    tabindex="0"
    aria-label="人工標註快捷編輯區"
    @keydown="handleShortcut"
  >
    <div class="reference-editor__controls">
      <UiTextField
        id="music-analysis-reference-bpm"
        class="reference-editor__bpm"
        label="BPM"
        type="number"
        min="20"
        max="400"
        step="0.1"
        inputmode="decimal"
        :model-value="annotationCase.referenceBpm ?? ''"
        @update:model-value="handleBpm"
      />
      <UiButton
        :icon="Plus"
        :disabled="!boundaryAvailable"
        @click="emit('add-boundary', candidateBoundaryMs)"
      >
        在 {{ formatReferenceTime(candidateBoundaryMs) }} 新增邊界 · B
      </UiButton>
      <UiCheckbox
        id="music-analysis-reference-snap"
        class="reference-editor__snap"
        label="強拍吸附"
        :model-value="snapToDownbeats"
        :disabled="downbeatCount === 0"
        @update:model-value="emit('update:snap-to-downbeats', $event)"
      />
      <UiChip tone="muted">M1 節拍 {{ beats.length }}</UiChip>
      <UiChip :tone="annotationCase.complete ? 'success' : 'warning'">
        {{ annotationCase.complete ? '已完成' : '待完成' }}
      </UiChip>
    </div>

    <div class="reference-editor__quick-roles" aria-label="目前段落角色">
      <span>目前段落</span>
      <UiButton
        v-for="item in roleShortcuts"
        :key="item.role"
        :variant="
          activeSectionIndex >= 0 &&
          annotationCase.referenceSections[activeSectionIndex]?.role ===
            item.role
            ? 'accent'
            : 'ghost'
        "
        :disabled="activeSectionIndex < 0"
        @click="setActiveRole(item.role)"
      >
        {{ item.shortcut }} {{ item.label }}
      </UiButton>
    </div>

    <div class="reference-editor__timeline" aria-label="人工標註時間軸">
      <span
        v-for="(beat, index) in projectedBeats"
        :key="beat.timeMs + '-' + index"
        class="reference-editor__beat"
        :class="{ 'reference-editor__beat--downbeat': beat.downbeat }"
        :style="{ left: beat.leftPercent + '%' }"
        aria-hidden="true"
      />
      <button
        v-for="section in projectedSections"
        :key="section.index"
        type="button"
        class="reference-editor__segment"
        :class="{
          'reference-editor__segment--empty': section.role === null,
          'reference-editor__segment--active':
            section.index === activeSectionIndex,
        }"
        :style="{ width: section.widthPercent + '%' }"
        :aria-label="
          section.label +
          '，' +
          formatReferenceTime(section.startMs) +
          ' 到 ' +
          formatReferenceTime(section.endMs)
        "
        @click="emit('seek', section.startMs)"
      >
        <span v-if="section.widthPercent >= 9">{{ section.label }}</span>
      </button>
      <span
        v-if="isCurrentTrack"
        class="reference-editor__playhead"
        :style="{ left: playheadPercent + '%' }"
        aria-hidden="true"
      />
    </div>

    <ol class="reference-editor__sections">
      <li
        v-for="section in projectedSections"
        :key="section.index"
        :class="{
          'reference-editor__section--active':
            section.index === activeSectionIndex,
        }"
      >
        <UiButton
          variant="ghost"
          class="reference-editor__time"
          @click="emit('seek', section.startMs)"
        >
          {{ formatReferenceTime(section.startMs) }}–{{
            formatReferenceTime(section.endMs)
          }}
        </UiButton>
        <UiSelect
          :id="`music-analysis-reference-role-${section.index}`"
          class="reference-editor__role"
          :label="`${formatReferenceTime(section.startMs)} 開始的段落角色`"
          label-hidden
          :model-value="section.role ?? ''"
          :options="roleOptions"
          @update:model-value="handleRole(section.index, $event)"
        />
        <div
          v-if="section.index > 0"
          class="reference-editor__boundary-actions"
        >
          <UiButton
            variant="ghost"
            :aria-label="
              formatReferenceTime(section.startMs) + ' 邊界提前 100 毫秒'
            "
            @click="nudgeBoundary(section.index, -100)"
          >
            −100
          </UiButton>
          <UiButton
            variant="ghost"
            :aria-label="
              formatReferenceTime(section.startMs) + ' 邊界延後 100 毫秒'
            "
            @click="nudgeBoundary(section.index, 100)"
          >
            +100
          </UiButton>
          <UiButton
            :aria-label="
              '移除 ' + formatReferenceTime(section.startMs) + ' 邊界'
            "
            @click="emit('remove-boundary', section.index)"
          >
            合併上段
          </UiButton>
        </div>
      </li>
    </ol>
    <UiHint>
      B 新增邊界 · Shift+1–7 新增並指定 · Alt+←/→ 微調 · N 下一首 · Ctrl+S 儲存
    </UiHint>
  </div>
</template>

<style scoped>
.reference-editor {
  display: grid;
  gap: var(--ui-space-4);
  outline: none;
}

.reference-editor__controls {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.reference-editor__bpm {
  width: 7rem;
}

.reference-editor__quick-roles,
.reference-editor__boundary-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.reference-editor__quick-roles {
  flex-wrap: wrap;
}

.reference-editor__quick-roles > span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
}

.reference-editor__timeline {
  position: relative;
  height: 3rem;
  display: flex;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
}

.reference-editor__beat {
  position: absolute;
  inset-block: 0;
  z-index: 2;
  width: var(--ui-border-width);
  background: color-mix(in srgb, var(--ui-color-text-muted) 38%, transparent);
  pointer-events: none;
}

.reference-editor__beat--downbeat {
  width: 2px;
  background: color-mix(in srgb, var(--ui-color-current) 72%, transparent);
}

.reference-editor__segment {
  position: relative;
  z-index: 1;
  min-width: 1px;
  overflow: hidden;
  border: 0;
  border-inline-end: var(--ui-border-width) solid var(--ui-color-surface);
  background: var(--ui-color-accent-soft);
  color: var(--ui-color-accent);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  white-space: nowrap;
  cursor: pointer;
}

.reference-editor__segment--active {
  box-shadow: inset 0 0 0 var(--ui-focus-width) var(--ui-color-current);
}

.reference-editor__segment--empty {
  background: var(--ui-color-warning-soft);
  color: var(--ui-color-warning);
}

.reference-editor__segment:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.reference-editor__playhead {
  position: absolute;
  inset-block: 0;
  width: var(--ui-focus-width);
  background: var(--ui-color-current);
  z-index: 3;
  pointer-events: none;
}

.reference-editor__sections {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.reference-editor__sections li {
  display: grid;
  grid-template-columns: 7rem minmax(9rem, 14rem) minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-2);
  min-height: var(--ui-control-height);
  padding-block: var(--ui-space-1);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}

.reference-editor__section--active {
  background: var(--ui-color-surface-selected);
}

.reference-editor__boundary-actions {
  flex-wrap: wrap;
}

.reference-editor__time {
  justify-content: flex-start;
  font-variant-numeric: tabular-nums;
}

.reference-editor__role {
  width: 100%;
}

@media (max-width: 720px) {
  .reference-editor__sections li {
    grid-template-columns: minmax(6rem, 1fr) minmax(8rem, 2fr);
  }

  .reference-editor__boundary-actions {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
