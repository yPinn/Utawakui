<script setup>
import { computed, shallowRef, useTemplateRef } from 'vue';
import { Maximize2, Pencil, Pin, PinOff, Trash2 } from '../../icons/index.js';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import { folderStationeryFor } from '../../utils/folderStationery.js';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiFolderArtifact from '../ui/UiFolderArtifact.vue';
import UiFolderArtifactCanvas from '../ui/UiFolderArtifactCanvas.vue';

const ARTIST_SUMMARY_KEY = 'derived:artist-summary';
const ARTIST_SUMMARY_PLACEMENT = Object.freeze({
  region: 'bottom',
  anchor: Object.freeze({ x: 0.9, y: 0.85 }),
});
const ARTIST_SUMMARY_ROTATION = -1.5;

// Notes are thin paper, so every note uses the translucent material.
const NOTE_MATERIAL = 'translucent';
const NOTE_TEXTURE_COUNT = 4;

function keyHash(key) {
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return hash;
}

// Stable per-key grain so a note keeps its texture across renders and restarts.
function noteTexture(key) {
  return keyHash(key) % NOTE_TEXTURE_COUNT;
}

// Rendering per object type; unknown types (e.g. pdf, embed) stay hidden.
const OBJECT_RENDERERS = Object.freeze({
  photo: (item) => ({
    kind: 'photo',
    label: '頁面照片',
    activatable: true,
    activationLabel: '展開照片',
    props: {
      src: item.imageUrl,
      alt: '頁面照片縮圖',
      frame: item.frame ?? 'print',
    },
  }),
  note: (item) =>
    item.content
      ? {
          kind: 'note',
          label: [item.content.eyebrow, item.content.title]
            .filter(Boolean)
            .join('：'),
          props: {
            ...item.content,
            material: NOTE_MATERIAL,
            texture: noteTexture(item.key),
          },
        }
      : {
          // Editing opens from the context menu only, so a click on an
          // overlapping note never starts an edit by accident.
          kind: 'note',
          label: item.title ? `頁面便條：${item.title}` : '頁面便條',
          props: {
            title: item.title ?? '',
            titleLang: contentLangAttribute(item.title ?? ''),
            body: item.text ?? '',
            paper: item.paper ?? 'tissue',
            material: NOTE_MATERIAL,
            texture: noteTexture(item.key),
          },
        },
});

const props = defineProps({
  objects: { type: Array, default: () => [] },
  summary: { type: Object, default: null },
  // Objects added this session; the canvas cascades them from the top object.
  freshKeys: { type: Array, default: () => [] },
});

const emit = defineEmits(['layoutChange', 'activate', 'editNote', 'remove']);
const canvas = useTemplateRef('canvas');
const menu = shallowRef(null);

// The artist summary is a data card: label／value rows instead of prose.
const summaryFields = computed(() => {
  if (!props.summary || typeof props.summary.text === 'string') return [];
  const { trackCount = 0, albumCount = 0, yearStart, yearEnd } = props.summary;
  const fields = [
    { label: '曲目', value: `${trackCount} 首` },
    { label: '專輯', value: `${albumCount} 張` },
  ];
  if (yearStart) {
    fields.push({
      label: '年份',
      value:
        yearEnd && yearEnd !== yearStart
          ? `${yearStart}–${yearEnd}`
          : String(yearStart),
    });
  }
  return fields;
});

const derivedItems = computed(() =>
  props.summary
    ? [
        {
          key: ARTIST_SUMMARY_KEY,
          type: 'note',
          source: 'derived',
          placement: ARTIST_SUMMARY_PLACEMENT,
          pinned: false,
          rotation: ARTIST_SUMMARY_ROTATION,
          order: 0,
          content: {
            eyebrow: '藝人資料',
            title: props.summary.artist,
            titleLang: contentLangAttribute(props.summary.artist),
            body:
              typeof props.summary.text === 'string' ? props.summary.text : '',
            fields: summaryFields.value,
          },
        },
      ]
    : [],
);

// Unsaved derived objects start behind every persisted object.
const items = computed(() => {
  const saved = new Map(props.objects.map((object) => [object.key, object]));
  const derived = derivedItems.value.map((item) =>
    saved.has(item.key)
      ? { ...item, ...saved.get(item.key), content: item.content }
      : item,
  );
  const user = props.objects.filter(
    (object) =>
      object.source === 'user' && Object.hasOwn(OBJECT_RENDERERS, object.type),
  );
  return [...derived, ...user].sort((left, right) => left.order - right.order);
});

const artifacts = computed(() =>
  items.value.map((item, index) => {
    const rendered = OBJECT_RENDERERS[item.type](item);
    return {
      id: item.key,
      ...rendered,
      props: { ...rendered.props, ...folderStationeryFor(item) },
      initialPlacement: item.placement,
      initialPinned: item.pinned === true,
      initialZ: index + 1,
      rotation: item.rotation ?? 0,
      autoPlace: props.freshKeys.includes(item.key),
    };
  }),
);

function findItem(key) {
  return items.value.find((item) => item.key === key) ?? null;
}

function layoutEntry(item, layout) {
  return {
    key: item.key,
    placement: layout.placement ?? item.placement,
    pinned: layout.pinned ?? item.pinned === true,
    order: layout.order ?? item.order,
    ...(item.source === 'derived'
      ? { type: item.type, rotation: item.rotation }
      : {}),
  };
}

function handleLayoutChange({ id, placement, order }) {
  const item = findItem(id);
  if (!item) return;
  emit('layoutChange', [layoutEntry(item, { placement, order })], {
    immediate: false,
  });
}

function handlePinChange({ id, pinned, placement, order }) {
  const item = findItem(id);
  if (!item) return;
  emit('layoutChange', [layoutEntry(item, { pinned, placement, order })], {
    immediate: true,
  });
}

function handleStackChange({ ids }) {
  const entries = ids
    .map((id, index) => {
      const item = findItem(id);
      return item ? layoutEntry(item, { order: index + 1 }) : null;
    })
    .filter(Boolean);
  emit('layoutChange', entries, { immediate: true });
}

function isUserNote(item) {
  return item?.type === 'note' && item.source === 'user';
}

function handleActivate(id) {
  if (findItem(id)?.type === 'photo') emit('activate', id);
}

const menuItems = computed(() => {
  const item = menu.value ? findItem(menu.value.id) : null;
  if (!item) return [];
  const pin = item.pinned
    ? { key: 'pin', label: '取消固定', value: 'pin', icon: PinOff }
    : { key: 'pin', label: '固定', value: 'pin', icon: Pin };
  if (item.type === 'photo') {
    return [
      { key: 'open', label: '展開照片', value: 'open', icon: Maximize2 },
      pin,
      { separator: true },
      {
        key: 'remove',
        label: '從頁面移除',
        value: 'remove',
        icon: Trash2,
        danger: true,
      },
    ];
  }
  if (isUserNote(item)) {
    return [
      { key: 'edit', label: '編輯便條', value: 'edit', icon: Pencil },
      pin,
      { separator: true },
      {
        key: 'remove',
        label: '刪除便條',
        value: 'remove',
        icon: Trash2,
        danger: true,
      },
    ];
  }
  return [pin];
});

function openMenu(payload) {
  menu.value = payload;
}

function closeMenu() {
  menu.value = null;
}

function selectMenuAction(action) {
  const id = menu.value?.id;
  closeMenu();
  if (!id) return;
  if (action === 'open') emit('activate', id);
  else if (action === 'edit') emit('editNote', id);
  else if (action === 'pin') canvas.value?.togglePinById(id);
  else if (action === 'remove') emit('remove', id);
}
</script>

<template>
  <UiFolderArtifactCanvas
    ref="canvas"
    :artifacts="artifacts"
    material="folder"
    label="Folder 頁面物件"
    @layout-change="handleLayoutChange"
    @pin-change="handlePinChange"
    @stack-change="handleStackChange"
    @activate="handleActivate"
    @contextmenu="openMenu"
  >
    <template #default="{ artifact }">
      <UiFolderArtifact :kind="artifact.kind" v-bind="artifact.props" />
    </template>
  </UiFolderArtifactCanvas>
  <UiContextMenu
    :open="Boolean(menu)"
    :x="menu?.x ?? 0"
    :y="menu?.y ?? 0"
    :anchor-el="menu?.anchorEl ?? null"
    :width="200"
    aria-label="頁面物件操作"
    :items="menuItems"
    @select="selectMenuAction"
    @close="closeMenu"
  />
</template>
