<script setup>
import { computed, onUnmounted, ref, shallowRef } from 'vue';
import {
  Check,
  Copy,
  Ellipsis,
  FolderOpen,
  ListEnd,
  ListPlus,
  Pencil,
  Trash2,
} from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import DemoCandidateActionMenu from './DemoCandidateActionMenu.vue';

const props = defineProps({
  layer: { type: Object, required: true },
});

const MENU_SETS = Object.freeze({
  general: {
    label: '曲目操作',
    width: 220,
    emptyText: '',
    items: [
      { key: 'rename', label: '重新命名', icon: Pencil, value: '重新命名' },
      {
        key: 'queue',
        label: '已在佇列',
        icon: Check,
        disabled: true,
      },
      {
        key: 'playlist',
        label: '新增至播放清單',
        icon: ListPlus,
        submenuWidth: 240,
        children: [
          { key: 'live', label: '歌回演出曲目', value: '加入歌回演出曲目' },
          { key: 'practice', label: '日文咬字練習', value: '加入日文咬字練習' },
          {
            key: 'multilingual',
            label: 'Midnight Session／深夜練唱清單',
            value: '加入 Midnight Session',
          },
          ...Array.from({ length: 8 }, (_, index) => ({
            key: `rehearsal-${index}`,
            label: `排練清單 ${String(index + 1).padStart(2, '0')}`,
            value: `加入排練清單 ${index + 1}`,
          })),
        ],
      },
      { key: 'manage-divider', separator: true },
      {
        key: 'duplicate',
        label: '建立副本',
        icon: Copy,
        value: '建立副本',
      },
      {
        key: 'remove',
        label: '從清單移除',
        icon: Trash2,
        danger: true,
        value: '從清單移除',
      },
    ],
  },
  settings: {
    label: '曲庫位置操作',
    width: 184,
    emptyText: '',
    items: [
      {
        key: 'open',
        label: '開啟資料夾',
        icon: FolderOpen,
        value: '開啟資料夾',
      },
      { key: 'rename', label: '重新命名', icon: Pencil, value: '重新命名' },
    ],
  },
  long: {
    label: '多語與捲動操作',
    width: 220,
    emptyText: '',
    items: [
      {
        key: 'cjk',
        label: '加入演出清單',
        icon: ListPlus,
        value: '加入演出清單',
      },
      {
        key: 'latin',
        label: 'Add to rehearsal list',
        icon: ListPlus,
        value: 'Add to rehearsal list',
      },
      {
        key: 'arabic',
        label: 'إضافة إلى قائمة',
        icon: ListPlus,
        value: 'إضافة إلى قائمة',
      },
      ...Array.from({ length: 9 }, (_, index) => ({
        key: `archive-${index}`,
        label: `封存版本 ${String(index + 1).padStart(2, '0')}`,
        icon: Copy,
        value: `封存版本 ${index + 1}`,
      })),
    ],
  },
  rtl: {
    label: 'إجراءات قائمة التشغيل',
    width: 220,
    dir: 'rtl',
    emptyText: '',
    items: [
      {
        key: 'playlist',
        label: 'إضافة إلى قائمة',
        icon: ListPlus,
        submenuWidth: 240,
        children: [
          { key: 'evening', label: 'قائمة التدريب المسائي' },
          { key: 'live', label: 'قائمة العرض المباشر' },
        ],
      },
      { key: 'copy', label: 'إنشاء نسخة', icon: Copy },
    ],
  },
  empty: {
    label: '空選單',
    width: 184,
    emptyText: '目前沒有可用操作',
    items: [],
  },
});

const menuComponent = computed(() =>
  props.layer.key === 'candidate' ? DemoCandidateActionMenu : UiContextMenu,
);
const menu = ref({
  open: false,
  x: 0,
  y: 0,
  width: 220,
  items: [],
  emptyText: '',
  label: '',
  dir: undefined,
  trigger: '',
});
const lastAction = shallowRef('尚未操作');
const triggerHeadingId = computed(
  () => `action-menu-${props.layer.key}-triggers`,
);
const coverageHeadingId = computed(
  () => `action-menu-${props.layer.key}-coverage`,
);
const boundaryNote = computed(() =>
  props.layer.key === 'candidate'
    ? '內部捲動保持展開；外部捲動關閉。子選單與父項目對齊，依文字方向選側並在 viewport 邊界翻面。'
    : 'Current 保留正式元件的捲動、子選單偏移與碰撞真值，供 Candidate 對照。',
);
const anatomyLines = computed(() =>
  props.layer.key === 'candidate'
    ? [
        'Item anatomy：optional 16px leading icon · concise action label · optional 16px submenu chevron',
        'Surface gap 4px · Menu inset 4px · Item inset 4px／8px · 只在實際存在的欄位之間 保留 8px · separator 4px／8px',
        '固定動作在支援寬度內完整顯示；使用者命名的目的地只在硬限制下防禦性截斷。',
        'Icon 只輔助可見動作文案；只有 opener 與 submenu chevron 可獨立使用。',
      ]
    : [
        'Current 保留固定 icon／label／status／submenu lanes 與現行截斷，只供 migration audit。',
        'Current 使用正式 UiContextMenu 與 active-token 快照，不套用 Candidate anatomy。',
      ],
);
const menuId = computed(() => `action-menu-${props.layer.key}-popup`);
const controlledMenuId = computed(() =>
  props.layer.key === 'candidate' ? menuId.value : undefined,
);
const menuRootAttributes = computed(() =>
  props.layer.key === 'candidate'
    ? {
        id: menuId.value,
        dir: menu.value.dir,
        'aria-label': menu.value.label,
      }
    : {},
);

function setCurrentMarker(isOpen) {
  if (typeof document === 'undefined' || props.layer.key !== 'current') return;
  if (isOpen) document.documentElement.dataset.demoActionMenuSource = 'current';
  else delete document.documentElement.dataset.demoActionMenuSource;
}

function itemsForLayer(specimen, items) {
  if (props.layer.key !== 'current' || specimen !== 'general') return items;
  return items.map((item) =>
    item.key === 'queue'
      ? {
          ...item,
          label: '新增至佇列',
          icon: ListEnd,
          status: '已在佇列',
        }
      : item,
  );
}

function openMenuAt(specimen, x, y, { dir, trigger = specimen } = {}) {
  const definition = MENU_SETS[specimen];
  setCurrentMarker(true);
  menu.value = {
    open: true,
    x: Math.round(x),
    y: Math.round(y),
    width: definition.width,
    items: itemsForLayer(specimen, definition.items),
    emptyText: definition.emptyText,
    label: definition.label,
    dir: dir ?? definition.dir,
    trigger,
  };
}

function openFromControl(event, specimen = 'general') {
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  openMenuAt(specimen, rect.left, rect.bottom + 4, {
    trigger: specimen === 'settings' ? 'more' : specimen,
  });
}

function openRowMenu(event) {
  event.currentTarget.focus();
  const rect = event.currentTarget.getBoundingClientRect();
  const x =
    Number.isFinite(event.clientX) && event.clientX > 0
      ? event.clientX
      : rect.left;
  const y =
    Number.isFinite(event.clientY) && event.clientY > 0
      ? event.clientY
      : rect.bottom + 4;
  openMenuAt('general', x, y, { trigger: 'row' });
}

function onRowKeydown(event) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) {
    return;
  }
  event.preventDefault();
  openRowMenu(event);
}

function openAtViewportEdge(event) {
  event.stopPropagation();
  const fallback = event.currentTarget.getBoundingClientRect();
  const x =
    typeof window === 'undefined' ? fallback.right : window.innerWidth - 8;
  const y =
    typeof window === 'undefined' ? fallback.bottom : window.innerHeight - 8;
  openMenuAt('general', x, y, { trigger: 'edge' });
}

function closeMenu() {
  setCurrentMarker(false);
  menu.value = { ...menu.value, open: false };
}

function handleSelect(value, item) {
  lastAction.value = `已執行：${item?.label ?? value}`;
  closeMenu();
}

onUnmounted(() => setCurrentMarker(false));
</script>

<template>
  <div class="demo-action-menu-specimen">
    <dl class="demo-action-menu-specimen__metrics" aria-label="尺寸責任">
      <div>
        <dt>Desired</dt>
        <dd>184px／220px</dd>
      </div>
      <div>
        <dt>Submenu</dt>
        <dd>240px</dd>
      </div>
      <div>
        <dt>Actual max</dt>
        <dd>Viewport − 16px／block max 320px</dd>
      </div>
      <div>
        <dt>Item floor</dt>
        <dd>Standard／Compact 32px，無 hard max</dd>
      </div>
    </dl>

    <section
      class="demo-action-menu-specimen__group"
      :aria-labelledby="triggerHeadingId"
    >
      <header>
        <h5 :id="triggerHeadingId">兩種 caller trigger</h5>
        <p>
          選單不擁有 opener；Ellipsis 與可聚焦 row 各自提供 anchor 與 ARIA。
        </p>
      </header>
      <div class="demo-action-menu-specimen__triggers">
        <div class="demo-action-menu-specimen__more">
          <span>Button menu</span>
          <UiIconButton
            :icon="Ellipsis"
            label="更多操作"
            aria-haspopup="menu"
            :aria-controls="controlledMenuId"
            :aria-expanded="menu.open && menu.trigger === 'more'"
            @click="openFromControl($event, 'settings')"
          />
        </div>
        <button
          type="button"
          class="demo-action-menu-specimen__row"
          aria-haspopup="menu"
          :aria-controls="controlledMenuId"
          :aria-expanded="menu.open && menu.trigger === 'row'"
          @contextmenu.prevent="openRowMenu"
          @keydown="onRowKeydown"
        >
          <span class="demo-action-menu-specimen__track">
            <strong>雨夜のリハーサル</strong>
            <small>右鍵／Menu key／Shift + F10</small>
          </span>
          <Ellipsis :size="16" aria-hidden="true" />
        </button>
      </div>
    </section>

    <section
      class="demo-action-menu-specimen__group"
      :aria-labelledby="coverageHeadingId"
    >
      <header>
        <h5 :id="coverageHeadingId">內容、捲動與定位</h5>
        <p>{{ boundaryNote }}</p>
      </header>
      <div class="demo-action-menu-specimen__controls">
        <UiButton
          variant="ghost"
          aria-haspopup="menu"
          :aria-controls="controlledMenuId"
          :aria-expanded="menu.open && menu.trigger === 'general'"
          @click="openFromControl($event, 'general')"
        >
          一般內容
        </UiButton>
        <UiButton
          variant="ghost"
          aria-haspopup="menu"
          :aria-controls="controlledMenuId"
          :aria-expanded="menu.open && menu.trigger === 'long'"
          @click="openFromControl($event, 'long')"
        >
          多語與捲動
        </UiButton>
        <UiButton
          variant="ghost"
          aria-haspopup="menu"
          :aria-controls="controlledMenuId"
          :aria-expanded="menu.open && menu.trigger === 'rtl'"
          @click="openFromControl($event, 'rtl')"
        >
          RTL 子選單
        </UiButton>
        <UiButton
          variant="ghost"
          aria-haspopup="menu"
          :aria-controls="controlledMenuId"
          :aria-expanded="menu.open && menu.trigger === 'empty'"
          @click="openFromControl($event, 'empty')"
        >
          空選單
        </UiButton>
        <UiButton
          variant="ghost"
          aria-haspopup="menu"
          :aria-controls="controlledMenuId"
          :aria-expanded="menu.open && menu.trigger === 'edge'"
          @click="openAtViewportEdge"
        >
          邊界定位
        </UiButton>
      </div>
    </section>

    <p class="demo-action-menu-specimen__anatomy">
      <span v-for="line in anatomyLines" :key="line">{{ line }}</span>
    </p>
    <p class="demo-action-menu-specimen__result" aria-live="polite">
      {{ lastAction }}
    </p>

    <component
      :is="menuComponent"
      v-bind="menuRootAttributes"
      :open="menu.open"
      :x="menu.x"
      :y="menu.y"
      :width="menu.width"
      :items="menu.items"
      :empty-text="menu.emptyText"
      @select="handleSelect"
      @close="closeMenu"
    />
  </div>
</template>

<style scoped>
.demo-action-menu-specimen,
.demo-action-menu-specimen__group {
  min-width: 0;
  display: grid;
}

.demo-action-menu-specimen {
  gap: var(--ui-space-5);
}

.demo-action-menu-specimen__metrics {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-3);
  margin: 0;
}

.demo-action-menu-specimen__metrics div {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-action-menu-specimen__metrics dt,
.demo-action-menu-specimen__group h5,
.demo-action-menu-specimen__group p,
.demo-action-menu-specimen__anatomy,
.demo-action-menu-specimen__result {
  margin: 0;
}

.demo-action-menu-specimen__metrics dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-action-menu-specimen__metrics dd {
  min-width: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-action-menu-specimen__group {
  gap: var(--ui-space-3);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-action-menu-specimen__group header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(9rem, 0.32fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-3);
}

.demo-action-menu-specimen__group h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-action-menu-specimen__group p,
.demo-action-menu-specimen__anatomy {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-action-menu-specimen__triggers {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(8rem, auto) minmax(14rem, 1fr);
  gap: var(--ui-space-3);
}

.demo-action-menu-specimen__more,
.demo-action-menu-specimen__row {
  min-width: 0;
  min-height: var(--ui-control-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.demo-action-menu-specimen__more {
  padding-inline-start: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.demo-action-menu-specimen__row {
  width: 100%;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font: inherit;
  text-align: start;
  cursor: context-menu;
}

.demo-action-menu-specimen__row:hover {
  background: var(--ui-color-surface-hover);
}

.demo-action-menu-specimen__row:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-action-menu-specimen__track {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-action-menu-specimen__track strong,
.demo-action-menu-specimen__track small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-action-menu-specimen__track strong {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-action-menu-specimen__track small {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.demo-action-menu-specimen__controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.demo-action-menu-specimen__anatomy {
  display: grid;
  gap: var(--ui-space-1);
  overflow-wrap: anywhere;
}

.demo-action-menu-specimen__result {
  min-height: calc(var(--ui-font-size-sm) * var(--ui-line-height-caption));
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-caption);
}

@container (max-width: 40rem) {
  .demo-action-menu-specimen__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .demo-action-menu-specimen__group header,
  .demo-action-menu-specimen__triggers {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
