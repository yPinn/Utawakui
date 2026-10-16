<script setup>
import { computed, shallowRef } from 'vue';
import {
  Check,
  Copy,
  Ellipsis,
  FolderOpen,
  ListPlus,
  Pencil,
  Trash2,
} from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';

const props = defineProps({
  layer: { type: Object, required: true },
});

const MENU_SETS = Object.freeze({
  general: {
    label: '曲目操作',
    size: 'md',
    content: {
      kind: 'actions',
      groups: [
        {
          id: 'primary',
          items: [
            {
              id: 'rename',
              kind: 'action',
              label: '重新命名',
              icon: Pencil,
              value: '重新命名',
            },
            {
              id: 'queue',
              kind: 'action',
              label: '加入佇列',
              icon: Check,
              disabled: true,
              disabledReason: '已在佇列',
            },
            {
              id: 'playlist',
              kind: 'submenu',
              label: '加入播放清單',
              icon: ListPlus,
              size: 'lg',
              content: {
                kind: 'filterable-actions',
                search: {
                  label: '搜尋播放清單',
                  placeholder: '搜尋播放清單',
                },
                groups: [
                  {
                    id: 'destinations',
                    items: [
                      {
                        id: 'live',
                        kind: 'action',
                        label: '歌回演出曲目',
                        value: '加入歌回演出曲目',
                      },
                      {
                        id: 'practice',
                        kind: 'action',
                        label: '日文咬字練習',
                        value: '加入日文咬字練習',
                      },
                      ...Array.from({ length: 9 }, (_, index) => ({
                        id: `rehearsal-${index}`,
                        kind: 'action',
                        label: `排練清單 ${String(index + 1).padStart(2, '0')}`,
                        value: `加入排練清單 ${index + 1}`,
                      })),
                    ],
                  },
                ],
                emptyText: '沒有播放清單',
                noResultsText: '找不到播放清單',
              },
            },
          ],
        },
        {
          id: 'manage',
          items: [
            {
              id: 'duplicate',
              kind: 'action',
              label: '建立副本',
              icon: Copy,
              value: '建立副本',
            },
            {
              id: 'remove',
              kind: 'action',
              label: '從清單移除',
              icon: Trash2,
              intent: 'danger',
              value: '從清單移除',
            },
          ],
        },
      ],
    },
  },
  settings: {
    label: '曲庫位置操作',
    size: 'sm',
    content: {
      kind: 'actions',
      groups: [
        {
          id: 'directory',
          items: [
            {
              id: 'open',
              kind: 'action',
              label: '開啟資料夾',
              icon: FolderOpen,
              value: '開啟資料夾',
            },
            {
              id: 'rename',
              kind: 'action',
              label: '重新命名',
              icon: Pencil,
              value: '重新命名',
            },
          ],
        },
      ],
    },
  },
  long: {
    label: '多語與捲動操作',
    size: 'md',
    content: {
      kind: 'filterable-actions',
      search: { label: '搜尋操作', placeholder: '搜尋操作' },
      groups: [
        {
          id: 'versions',
          items: [
            {
              id: 'cjk',
              kind: 'action',
              label: '加入演出清單',
              icon: ListPlus,
              value: '加入演出清單',
            },
            {
              id: 'latin',
              kind: 'action',
              label: 'Add to rehearsal list',
              icon: ListPlus,
              value: 'Add to rehearsal list',
            },
            {
              id: 'arabic',
              kind: 'action',
              label: 'إضافة إلى قائمة',
              icon: ListPlus,
              value: 'إضافة إلى قائمة',
            },
            ...Array.from({ length: 9 }, (_, index) => ({
              id: `archive-${index}`,
              kind: 'action',
              label: `封存版本 ${String(index + 1).padStart(2, '0')}`,
              icon: Copy,
              value: `封存版本 ${index + 1}`,
            })),
          ],
        },
      ],
      emptyText: '目前沒有可用操作',
      noResultsText: '找不到操作',
    },
  },
  rtl: {
    label: 'إجراءات قائمة التشغيل',
    size: 'md',
    dir: 'rtl',
    content: {
      kind: 'actions',
      groups: [
        {
          id: 'actions',
          items: [
            {
              id: 'playlist',
              kind: 'submenu',
              label: 'إضافة إلى قائمة',
              icon: ListPlus,
              size: 'lg',
              content: {
                kind: 'actions',
                groups: [
                  {
                    id: 'destinations',
                    items: [
                      {
                        id: 'evening',
                        kind: 'action',
                        label: 'قائمة التدريب المسائي',
                      },
                      {
                        id: 'live',
                        kind: 'action',
                        label: 'قائمة العرض المباشر',
                      },
                    ],
                  },
                ],
              },
            },
            {
              id: 'copy',
              kind: 'action',
              label: 'إنشاء نسخة',
              icon: Copy,
            },
          ],
        },
      ],
    },
  },
  empty: {
    label: '空選單',
    size: 'sm',
    content: {
      kind: 'actions',
      groups: [],
      emptyText: '目前沒有可用操作',
    },
  },
});

const menu = shallowRef({
  open: false,
  anchor: { kind: 'point', x: 0, y: 0 },
  size: 'md',
  content: { kind: 'actions', groups: [] },
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
const boundaryNote =
  '內部捲動保持展開；外部捲動關閉。子選單與父項目對齊，依文字方向選側並在 viewport 邊界翻面。';
const anatomyLines = Object.freeze([
  'Item anatomy：optional 16px leading icon · concise action label · optional 16px submenu chevron',
  'Surface gap 4px · Menu inset 4px · Item inset 4px／8px · 只在實際存在的欄位之間 保留 8px · separator 4px／8px',
  '固定動作在支援寬度內完整顯示；使用者命名的目的地只在硬限制下防禦性截斷。',
  'Icon 只輔助可見動作文案；只有 opener 與 submenu chevron 可獨立使用。',
]);
const menuId = computed(() => `action-menu-${props.layer.key}-popup`);
function openMenuAt(
  specimen,
  x,
  y,
  { anchorElement = null, dir, trigger = specimen } = {},
) {
  const definition = MENU_SETS[specimen];
  menu.value = {
    open: true,
    anchor: anchorElement
      ? { kind: 'element', element: anchorElement }
      : { kind: 'point', x: Math.round(x), y: Math.round(y) },
    size: definition.size,
    content: definition.content,
    label: definition.label,
    dir: dir ?? definition.dir,
    trigger,
  };
}

function openFromControl(event, specimen = 'general') {
  event.stopPropagation();
  openMenuAt(specimen, 0, 0, {
    anchorElement: event.currentTarget,
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
  menu.value = { ...menu.value, open: false };
}

function handleSelect(value, item) {
  lastAction.value = `已執行：${item?.label ?? value}`;
  closeMenu();
}
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
            :aria-controls="menuId"
            :aria-expanded="menu.open && menu.trigger === 'more'"
            @click="openFromControl($event, 'settings')"
          />
        </div>
        <button
          type="button"
          class="demo-action-menu-specimen__row"
          aria-haspopup="menu"
          :aria-controls="menuId"
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
          :aria-controls="menuId"
          :aria-expanded="menu.open && menu.trigger === 'general'"
          @click="openFromControl($event, 'general')"
        >
          一般內容
        </UiButton>
        <UiButton
          variant="ghost"
          aria-haspopup="menu"
          :aria-controls="menuId"
          :aria-expanded="menu.open && menu.trigger === 'long'"
          @click="openFromControl($event, 'long')"
        >
          多語與捲動
        </UiButton>
        <UiButton
          variant="ghost"
          aria-haspopup="menu"
          :aria-controls="menuId"
          :aria-expanded="menu.open && menu.trigger === 'rtl'"
          @click="openFromControl($event, 'rtl')"
        >
          RTL 子選單
        </UiButton>
        <UiButton
          variant="ghost"
          aria-haspopup="menu"
          :aria-controls="menuId"
          :aria-expanded="menu.open && menu.trigger === 'empty'"
          @click="openFromControl($event, 'empty')"
        >
          空選單
        </UiButton>
        <UiButton
          variant="ghost"
          aria-haspopup="menu"
          :aria-controls="menuId"
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

    <UiActionMenu
      :id="menuId"
      :open="menu.open"
      :anchor="menu.anchor"
      :size="menu.size"
      :content="menu.content"
      :dir="menu.dir"
      :aria-label="menu.label"
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
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
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
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
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
