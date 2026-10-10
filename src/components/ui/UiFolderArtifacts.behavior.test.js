import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiFolderArtifact from './UiFolderArtifact.vue';
import UiFolderArtifactCanvas from './UiFolderArtifactCanvas.vue';

const canvasSource = readFileSync(
  new URL('./UiFolderArtifactCanvas.vue', import.meta.url),
  'utf8',
);
const artifactSource = readFileSync(
  new URL('./UiFolderArtifact.vue', import.meta.url),
  'utf8',
);
const photoFrameSource = readFileSync(
  new URL('./UiPhotoFrame.vue', import.meta.url),
  'utf8',
);
const activeTokensSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const v2TokensSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);

const artifacts = [
  {
    id: 'photo',
    kind: 'photo',
    label: '錄音現場照片',
    initialPlacement: { region: 'paper', anchor: { x: 0.08, y: 0.08 } },
    rotation: -2,
  },
  {
    id: 'note',
    kind: 'note',
    label: '錄製備忘',
    initialPlacement: { region: 'paper', anchor: { x: 0.52, y: 0.38 } },
    rotation: 1,
  },
  {
    id: 'stack',
    kind: 'stack',
    label: '重疊照片',
    activatable: true,
    activationLabel: '切換照片',
    initialPlacement: { region: 'paper', anchor: { x: 0.3, y: 0.1 } },
    rotation: 2,
  },
];

describe('UiFolderArtifactCanvas', () => {
  it('can reveal parent Folder material without painting a second sheet', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            UiFolderArtifactCanvas,
            { artifacts: [artifacts[1]], material: 'folder' },
            {
              default: ({ artifact }) =>
                h(UiFolderArtifact, {
                  kind: artifact.kind,
                  title: artifact.label,
                }),
            },
          ),
      }),
    );

    expect(html).toContain('ui-folder-artifact-canvas--folder');
    expect(canvasSource).toContain("['document', 'folder']");
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas--folder\s*\{[^}]*background:\s*transparent;/su,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas--folder\s+\.ui-folder-artifact-canvas__sheet\s*\{[^}]*display:\s*none;/su,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas--folder\s*\{[^}]*min-height:\s*0;[^}]*block-size:\s*100%;[^}]*overflow:\s*visible;[^}]*pointer-events:\s*none;/su,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas__item\s*\{[^}]*pointer-events:\s*auto;/su,
    );
  });

  it('renders one keyboard-focusable movable group per artifact with shared instructions', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            UiFolderArtifactCanvas,
            { artifacts, label: '工作集拼貼物件' },
            {
              default: ({ artifact }) =>
                h(UiFolderArtifact, {
                  kind: artifact.id === 'note' ? 'note' : 'photo',
                  title: artifact.label,
                }),
            },
          ),
      }),
    );

    expect(html).toContain('aria-label="工作集拼貼物件"');
    expect(html).toContain('ui-folder-artifact-canvas__bounds');
    expect(html).toContain('role="group"');
    expect(html.match(/tabindex="0"/gu)).toHaveLength(3);
    expect(html).toContain('方向鍵移動，Shift 加速，Home 回到預設位置');
    expect(html).toContain('錄音現場照片');
    expect(html).toContain('錄製備忘');
    expect(html).toContain('重疊照片，按 Enter 或空白鍵切換照片');
    expect(html).toContain('固定錄音現場照片');
    expect(html).toContain('固定錄製備忘');
    expect(canvasSource).toContain(
      ":title=\"isArtifactPinned(artifact.id) ? '取消固定' : '固定'\"",
    );
    expect(html.match(/aria-pressed="false"/gu)).toHaveLength(3);
  });

  it('pins artifacts to their page coordinates without conflating pinning and layer order', () => {
    expect(canvasSource).toContain('pinnedArtifactIds');
    expect(canvasSource).toContain("emit('pinChange'");
    expect(canvasSource).toContain('@pointerdown.stop');
    expect(canvasSource).toContain('@keydown.stop');
    expect(canvasSource).toMatch(
      /function handleKeydown\(artifact, event\) \{[\s\S]*?if \(isArtifactPinned\(artifact\.id\)\) return;/u,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas__item--pinned\s*\{[^}]*cursor:\s*default;/su,
    );
    expect(canvasSource).not.toContain('position: fixed');
  });

  it('hydrates one region placement, pin state, and finite layer order without saving mount or resize work', () => {
    expect(canvasSource).toContain('artifact.initialPinned === true');
    expect(canvasSource).toContain('artifact.initialZ ?? index + 1');
    expect(canvasSource).toContain('copyPlacement(artifact.initialPlacement)');
    expect(canvasSource).toContain('const placements = new Map()');
    expect(canvasSource).not.toContain('const anchors = new Map()');
    expect(canvasSource).not.toContain('pinPlacements');
    expect(canvasSource).toMatch(
      /function resetArtifact\(id\)[\s\S]*?applyPosition\(id, projectPlacedPosition\(id\), \{[\s\S]*?notify: false,[\s\S]*?updatePlacement: false,[\s\S]*?\}\);/u,
    );
    expect(canvasSource).toMatch(
      /function scheduleReclamp\(\)[\s\S]*?reprojectArtifacts\(\{ except: dragSession\?\.id \?\? null \}\)/u,
    );
    expect(canvasSource).toContain('projectFolderArtifactPlacement');
    expect(canvasSource).toContain('getFolderArtifactRegions');
    expect(canvasSource).not.toMatch(
      /function scheduleReclamp\(\)[\s\S]*?emit\('(?:layoutChange|pinChange)'/u,
    );
  });

  it('stores the visible pose as the placement when pinning or unpinning', () => {
    expect(canvasSource).toMatch(
      /function togglePin\(artifact\)[\s\S]*?getFolderArtifactPlacement\(current, artifactGeometry\(artifact\.id\)\)[\s\S]*?settleArtifact\(artifact\.id\)/u,
    );
    expect(canvasSource).toMatch(/emit\('pinChange',[\s\S]*?placement:/u);
  });

  it('snaps a released or keyboard-moved object to its placement and reprojects the rest', () => {
    expect(canvasSource).toMatch(
      /function settleArtifact\(id\)[\s\S]*?projectPlacedPosition\(id\)[\s\S]*?reprojectArtifacts\(\{ except: id \}\)/u,
    );
    expect(canvasSource).toMatch(
      /function finishDrag[\s\S]*?dragSession\.moved && dragSession\.draggable[\s\S]*?settleArtifact\(dragSession\.id\)/u,
    );
    expect(canvasSource).toMatch(
      /function handleKeydown[\s\S]*?applyPosition\(artifact\.id, nextPosition\);\s*settleArtifact\(artifact\.id\);/u,
    );
    expect(canvasSource).toMatch(
      /function sideProjectionContext\(id\)[\s\S]*?placements\.get\(candidateId\)\?\.region === 'side'/u,
    );
  });

  it('emits region placements and bounded stack order instead of persistence-hostile pixels', () => {
    expect(canvasSource).toContain("'stackChange'");
    expect(canvasSource).toMatch(
      /emit\('layoutChange',[\s\S]*?placement: copyPlacement\(placements\.get\(id\)\),[\s\S]*?order: current\.z/u,
    );
    expect(canvasSource).toMatch(
      /emit\('pinChange',[\s\S]*?placement:[\s\S]*?order: current\?\.z/u,
    );
    expect(canvasSource).toMatch(
      /function bringToFront\(id\)[\s\S]*?emit\('stackChange', \{ ids: orderedIds \}\)/u,
    );
  });

  it('separates click-like activation from drag and keeps photo switching available while pinned', () => {
    expect(canvasSource).toContain("'activate'");
    expect(canvasSource).toContain('DRAG_ACTIVATION_THRESHOLD');
    expect(canvasSource).toMatch(
      /function beginDrag\(artifact, event\) \{[\s\S]*?const draggable = !isArtifactPinned\(artifact\.id\);[\s\S]*?const activatable = artifact\.activatable === true;[\s\S]*?activationIntent,[\s\S]*?moved: false,/u,
    );
    expect(canvasSource).toMatch(
      /function moveDrag\(event\) \{[\s\S]*?Math\.hypot\([\s\S]*?DRAG_ACTIVATION_THRESHOLD[\s\S]*?dragSession\.moved = true;/u,
    );
    expect(canvasSource).toMatch(
      /function finishDrag\(event, shouldActivate\) \{[\s\S]*?shouldActivate &&[\s\S]*?!dragSession\.moved &&[\s\S]*?dragSession\.activatable[\s\S]*?emit\('activate',\s*dragSession\.id,\s*dragSession\.activationIntent\)/u,
    );
    expect(canvasSource).toMatch(
      /function endDrag\(event\) \{[\s\S]*?finishDrag\(event, true\);/u,
    );
    expect(canvasSource).toMatch(
      /function cancelDrag\(event\) \{[\s\S]*?finishDrag\(event, false\);/u,
    );
    expect(canvasSource).toContain('@pointercancel="cancelDrag"');
    expect(canvasSource).toMatch(
      /function handleKeydown\(artifact, event\) \{[\s\S]*?\['Enter', ' '\]\.includes\(event\.key\)[\s\S]*?emit\('activate',\s*artifact\.id\)[\s\S]*?if \(isArtifactPinned\(artifact\.id\)\) return;/u,
    );
    expect(canvasSource).toContain(
      "'ui-folder-artifact-canvas__item--activatable': artifact.activatable",
    );
  });

  it('uses one 32px UiIconButton surface with the artifact-appropriate public variant', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            UiFolderArtifactCanvas,
            { artifacts },
            {
              default: ({ artifact }) =>
                h(UiFolderArtifact, {
                  kind: artifact.kind,
                  title: artifact.label,
                }),
            },
          ),
      }),
    );

    expect(html).toContain('ui-icon-btn--overlay');
    expect(html).toContain('ui-icon-btn--ghost');
    expect(canvasSource).toContain(
      ":variant=\"artifact.kind === 'note' ? 'ghost' : 'overlay'\"",
    );
    expect(canvasSource).not.toContain(
      '.ui-folder-artifact-canvas__pin::before',
    );
    expect(canvasSource).not.toContain('--ui-folder-artifact-pin-background');
    expect(canvasSource).not.toContain('data-artifact-kind');
    expect(canvasSource).not.toContain('--ui-icon-button-size-override');
  });

  it('keeps Pin as the only artifact control instead of exposing material choices', () => {
    expect(canvasSource).not.toContain('UiFolderArtifactAppearanceMenu');
    expect(canvasSource).not.toContain('appearanceChange');
    expect(canvasSource).not.toContain('artifact.appearance');
    expect(canvasSource).not.toContain('更多操作');
  });

  it('uses pointer capture, bounded geometry, resize reclamping, and transform-only movement', () => {
    expect(canvasSource).toContain('setPointerCapture?.(event.pointerId)');
    expect(canvasSource).toContain('releasePointerCapture?.(event.pointerId)');
    expect(canvasSource).toContain('clampFolderArtifactPosition');
    expect(canvasSource).toContain('moveFolderArtifactFromKeyboard');
    expect(canvasSource).toContain('artifactRotation(id)');
    expect(canvasSource).toContain('rotation: artifact.rotation ?? 0');
    expect(canvasSource).toContain(
      'width: element?.offsetWidth ?? rect?.width ?? 0',
    );
    expect(canvasSource).toContain('elementSize(clampBounds.value)');
    expect(canvasSource).toContain('resizeObserver.observe(clampBounds.value)');
    expect(canvasSource).toContain('getFolderArtifactPlacement');
    expect(canvasSource).toMatch(
      /clampFolderArtifactPosition\([\s\S]*?props\.minimumVisibleSize,[\s\S]*?artifactRotation\(id\),[\s\S]*?\)/u,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas__bounds\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*var\(--ui-folder-artifact-safe-inset\);/su,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas--folder\s+\.ui-folder-artifact-canvas__bounds\s*\{[^}]*inset:\s*0;/su,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas\s*\{[^}]*overflow:\s*hidden;/su,
    );
    expect(activeTokensSource).toMatch(
      /--ui-folder-artifact-safe-inset:\s*calc\(\s*var\(--ui-focus-width\)\s*\+\s*var\(--ui-focus-offset\)\s*\+\s*var\(--ui-border-width\)\s*\);/u,
    );
    expect(activeTokensSource).toMatch(
      /--ui-folder-artifact-folder-min-height:\s*calc\([\s\S]*?--ui-folder-artifact-canvas-min-height[\s\S]*?--ui-folder-extension-block-inset[\s\S]*?--ui-folder-extension-block-inset[\s\S]*?\);/u,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas--folder\s*\{[^}]*min-height:\s*0;[^}]*block-size:\s*100%;/su,
    );
    expect(canvasSource).not.toMatch(
      /\.ui-folder-artifact-canvas--folder\s*\{[^}]*min-height:\s*var\(--ui-folder-artifact-folder-min-height\);/su,
    );
    expect(canvasSource).toContain('translate3d(');
    expect(canvasSource).toContain('transform-origin: center');
    expect(canvasSource).toContain('touch-action: none');
    expect(canvasSource).not.toContain('draggable="true"');
  });

  it('keeps artifacts below fixed chrome and removes lift motion when requested', () => {
    expect(canvasSource).toContain('function normalizeArtifactStack(frontId)');
    expect(canvasSource).not.toContain('highestZ += 1');
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas__item\s*\{[^}]*z-index:\s*var\(--ui-folder-artifact-z\);/su,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas__item--active\s*\{[^}]*z-index:\s*var\(--ui-folder-artifact-z-active\);/su,
    );
    expect(canvasSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none;/u,
    );
    // The whole selector sits inside :global(); `:global(x) .y` compiles to x.
    expect(canvasSource).toContain(
      ":global(:root[data-ui-motion='reduced'] .ui-folder-artifact-canvas__item)",
    );
  });

  it('keeps release positioning exact instead of animating positional inertia', () => {
    const itemRule =
      canvasSource.match(
        /\.ui-folder-artifact-canvas__item\s*\{[^}]*\}/su,
      )?.[0] ?? '';
    const transition = itemRule.match(/transition:\s*([\s\S]*?);/u)?.[1] ?? '';

    expect(transition).toContain('filter var(--ui-motion-duration-feedback)');
    expect(transition).toContain('scale var(--ui-motion-duration-feedback)');
    expect(transition).not.toContain('transform');
  });
});

describe('UiFolderArtifact', () => {
  it('cascades newly added objects from the topmost bottom object by the grab size', () => {
    expect(canvasSource).toContain(
      'if (artifact.autoPlace === true) pendingAutoPlacements.add(artifact.id);',
    );
    expect(canvasSource).toMatch(
      /function placeCascade\(id\)[\s\S]*?const step = props\.minimumVisibleSize;[\s\S]*?region === 'bottom'[\s\S]*?positions\[right\]\.z - positions\[left\]\.z[\s\S]*?x = positions\[previousId\]\.x \+ step;[\s\S]*?y = positions\[previousId\]\.y \+ step;[\s\S]*?applyPosition\(id, \{ x, y \}\);[\s\S]*?settleArtifact\(id\);/u,
    );
    expect(canvasSource).toMatch(
      /function reset\(\)[\s\S]*?for \(const id of pendingAutoPlacements\) placeCascade\(id\);[\s\S]*?pendingAutoPlacements\.clear\(\);/u,
    );
  });

  it('varies only the grain offset per note and paints no fold or crease lines', () => {
    expect(artifactSource).toContain(
      `:data-paper-texture="kind === 'note' ? texture : undefined"`,
    );
    const offsets = [1, 2, 3].map((index) => {
      const match = artifactSource.match(
        new RegExp(
          `\\[data-paper-texture='${index}'\\]\\s*\\{\\s*--ui-folder-artifact-note-grain-offset:\\s*([^;]+);\\s*\\}`,
          'u',
        ),
      );
      expect(match).not.toBeNull();
      return match[1];
    });
    expect(new Set(offsets).size).toBe(3);
    expect(artifactSource).not.toMatch(
      /fold-angle|crease-angle|linear-gradient\(\s*var/u,
    );
    expect(artifactSource).toMatch(
      /background-position:\s*0 0,\s*var\(--ui-folder-artifact-note-grain-offset, 0 0\);/u,
    );
  });

  it('edits notes through the shared UiTextarea field instead of a local control', () => {
    expect(artifactSource).toContain(
      "import UiTextarea from './UiTextarea.vue'",
    );
    expect(artifactSource).not.toContain('<textarea');
    expect(artifactSource).toMatch(
      /<UiTextarea[\s\S]*?v-if="editing"[\s\S]*?:label="editLabel"[\s\S]*?label-hidden[\s\S]*?variant="bare"[\s\S]*?@keydown="handleEditorKeydown"[\s\S]*?@blur="commitDraft"/u,
    );
  });

  it('supports opaque photos, controlled note materials, and stacked images', () => {
    expect(artifactSource).toContain("['photo', 'note', 'stack']");
    expect(artifactSource).toContain("['solid', 'translucent']");
    expect(artifactSource).toContain('ui-folder-artifact--photo');
    expect(artifactSource).toContain('ui-folder-artifact--note');
    expect(artifactSource).toContain('ui-folder-artifact--stack');
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact--note\.ui-folder-artifact--translucent\s*\{[^}]*background-color:/su,
    );
    expect(artifactSource).not.toContain('opacity: 0.');
    expect(artifactSource).not.toContain('backdrop-filter');
    expect(activeTokensSource).toMatch(
      /--ui-folder-artifact-note-bg:\s*color-mix\([\s\S]*?var\(--ui-color-accent-soft\)/u,
    );
    expect(activeTokensSource).toContain(
      '--ui-folder-artifact-note-opacity: 84%;',
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact--note\.ui-folder-artifact--translucent\s*\{[^}]*color-mix\([\s\S]*?var\(--ui-folder-artifact-note-paper, var\(--ui-folder-artifact-note-bg\)\)[\s\S]*?var\(--ui-folder-artifact-note-opacity\)/u,
    );
  });

  it('prints notes on bounded paper stocks with project-owned grain assets', () => {
    expect(artifactSource).toContain(
      `:data-paper="kind === 'note' ? paper : undefined"`,
    );
    for (const paper of ['periwinkle', 'rose', 'canary', 'kraft', 'ruled']) {
      expect(artifactSource).toMatch(
        new RegExp(
          `\\[data-paper='${paper}'\\]\\s*\\{[^}]*--ui-folder-artifact-note-paper:\\s*var\\(--ui-folder-artifact-paper-${paper}\\)`,
          'u',
        ),
      );
    }
    expect(artifactSource).not.toMatch(/\[data-paper='tissue'\]/u);
    expect(artifactSource).toContain(
      "url('../../assets/folder-paper/grain-fine.svg?no-inline')",
    );
    expect(artifactSource).toContain(
      "url('../../assets/folder-paper/grain-coarse.svg?no-inline')",
    );
    expect(artifactSource).not.toContain('data:image');
    expect(artifactSource).toContain(
      'background-blend-mode: normal, soft-light;',
    );
  });

  it('assigns vintage photo and paper-note materials from kind without appearance state', async () => {
    const noteHtml = await renderToString(
      createSSRApp({
        render: () =>
          h(UiFolderArtifact, {
            kind: 'note',
            title: '紙張便條',
          }),
      }),
    );
    const photoHtml = await renderToString(
      createSSRApp({
        render: () =>
          h(UiFolderArtifact, {
            kind: 'photo',
            src: '/photo.jpg',
            alt: '復古照片',
          }),
      }),
    );

    expect(noteHtml).toContain('ui-folder-artifact--note');
    expect(photoHtml).toContain('ui-folder-artifact--photo');
    expect(photoHtml).toContain('ui-photo-frame');
    expect(artifactSource).toContain(
      "import UiPhotoFrame from './UiPhotoFrame.vue'",
    );
    expect(artifactSource).toMatch(
      /<UiPhotoFrame[\s\S]*?:src="src"[\s\S]*?:alt="alt"[\s\S]*?fit="cover"[\s\S]*?filtered/u,
    );
    expect(artifactSource).not.toContain('appearance');
    expect(photoFrameSource).toMatch(
      /\.ui-photo-frame--filtered \.ui-photo-frame__image\s*\{[^}]*filter:\s*var\(--ui-photo-frame-filter\)/u,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact--note\s*\{[^}]*background-image:\s*var\(--ui-folder-artifact-note-print, none\),\s*var\(--ui-folder-artifact-note-grain, none\);/u,
    );
    expect(artifactSource).not.toContain('radial-gradient(');
    const photoFrameRule =
      photoFrameSource.match(/\.ui-photo-frame\s*\{[^}]*\}/su)?.[0] ?? '';
    const stackFrameRule =
      artifactSource.match(
        /\.ui-folder-artifact__stack-layer\s*\{[^}]*\}/su,
      )?.[0] ?? '';
    expect(photoFrameRule).not.toContain('background-image');
    expect(stackFrameRule).not.toContain('background-image');
    expect(artifactSource).not.toContain('backdrop-filter');
    // Stationery is the only place a clip-path or mask may appear.
    const styles = artifactSource.slice(artifactSource.indexOf('<style'));
    for (const match of styles.matchAll(/([^{}]+)\{[^}]*(clip-path|mask):/gu)) {
      const selector = match[1].trim();
      if (match[2] === 'mask') {
        expect(selector).toBe('.ui-folder-artifact__stationery--clip');
      } else {
        expect(selector).toContain("[data-stationery='torn']");
      }
    }
    expect(artifactSource).not.toContain('feTurbulence');
    expect(artifactSource).toMatch(
      /@media \(forced-colors: active\)[\s\S]*background-image:\s*none;[\s\S]*filter:\s*none;/u,
    );
  });

  it('renders a controlled two-layer photo stack with position feedback and bounded motion', async () => {
    const images = [
      { src: '/first.jpg', alt: '第一張參考照片' },
      { src: '/second.jpg', alt: '第二張參考照片' },
      { src: '/third.jpg', alt: '第三張參考照片' },
    ];
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(UiFolderArtifact, {
            kind: 'stack',
            images,
            activeIndex: 1,
          }),
      }),
    );

    expect(html.match(/<figure/gu)).toHaveLength(2);
    expect(html).not.toContain('<button');
    expect(html.match(/role="button"/gu)).toHaveLength(2);
    expect(html.match(/tabindex="0"/gu)).toHaveLength(2);
    expect(html).toContain('第二張參考照片');
    expect(html).toContain('2 / 3');
    expect(html).toContain('顯示上一張照片：第一張參考照片');
    expect(html).toContain('目前為第二張參考照片，顯示下一張照片');
    expect(html).toContain('data-artifact-activate="previous"');
    expect(html).toContain('data-artifact-activate="next"');
    expect(html).toContain('data-stack-layout="1"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toMatch(
      /ui-folder-artifact__stack-layer--back[\s\S]*ui-folder-artifact__stack-position[\s\S]*<\/figure>[\s\S]*ui-folder-artifact__stack-layer--front/u,
    );
    expect(html).toContain('ui-folder-artifact__stack-status');
    expect(artifactSource).toContain('getFolderArtifactStackLayers');
    expect(artifactSource).toContain('getFolderArtifactStackLayoutVariant');
    expect(artifactSource).toContain(
      "defineEmits(['previous', 'next', 'commit'])",
    );
    expect(artifactSource).toContain("emit('previous')");
    expect(artifactSource).toContain("emit('next')");
    expect(artifactSource).toContain('handleStackLayerKeydown');
    expect(artifactSource).not.toContain('UiIconButton');
    expect(artifactSource).not.toContain('ChevronLeft');
    expect(artifactSource).not.toContain('ChevronRight');
    expect(artifactSource).toContain('<TransitionGroup');
    expect(artifactSource).toContain('ui-folder-artifact__stack-layer--front');
    expect(artifactSource).toContain('ui-folder-artifact__stack-layer--back');
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact--stack\s*\{[^}]*block-size:\s*var\(--ui-folder-artifact-stack-block-size\);/su,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layers\s*\{[^}]*inset:\s*var\(--ui-space-2\);/su,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layers\[data-stack-layout='0'\]\s*\{[^}]*--ui-folder-artifact-stack-back-rotation:\s*-5deg;[^}]*--ui-folder-artifact-stack-front-x:\s*24%;[^}]*--ui-folder-artifact-stack-front-y:\s*27%;[^}]*--ui-folder-artifact-stack-front-rotation:\s*2\.75deg;/su,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layers\[data-stack-layout='1'\]\s*\{[^}]*--ui-folder-artifact-stack-back-rotation:\s*4deg;[^}]*--ui-folder-artifact-stack-front-x:\s*23%;[^}]*--ui-folder-artifact-stack-front-y:\s*25%;[^}]*--ui-folder-artifact-stack-front-rotation:\s*-3\.25deg;/su,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layers\[data-stack-layout='2'\]\s*\{[^}]*--ui-folder-artifact-stack-back-rotation:\s*-3\.25deg;[^}]*--ui-folder-artifact-stack-front-x:\s*26%;[^}]*--ui-folder-artifact-stack-front-y:\s*26%;[^}]*--ui-folder-artifact-stack-front-rotation:\s*4\.25deg;/su,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layers\[data-stack-layout='3'\]\s*\{[^}]*--ui-folder-artifact-stack-back-rotation:\s*5deg;[^}]*--ui-folder-artifact-stack-front-x:\s*25%;[^}]*--ui-folder-artifact-stack-front-y:\s*28%;[^}]*--ui-folder-artifact-stack-front-rotation:\s*-2\.5deg;/su,
    );
    for (const tokensSource of [activeTokensSource, v2TokensSource]) {
      expect(tokensSource).toMatch(
        /--ui-folder-artifact-photo-bg-back:\s*color-mix\(\s*in srgb,\s*var\(--ui-photo-frame-bg\) 90%,\s*var\(--ui-color-canvas\)\s*\);/u,
      );
    }
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layer--back\s*\{[^}]*background-color:\s*var\(--ui-folder-artifact-photo-bg-back\);/su,
    );
    // Rotated front layer must stay inside the measured artifact box.
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layer\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*78%;/su,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layer--back\s*\{[^}]*translate3d\(\s*var\(--ui-folder-artifact-stack-back-x\),\s*var\(--ui-folder-artifact-stack-back-y\),\s*0\s*\)[^}]*rotate\(var\(--ui-folder-artifact-stack-back-rotation\)\)/su,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layer--front\s*\{[^}]*translate3d\(\s*var\(--ui-folder-artifact-stack-front-x\),\s*var\(--ui-folder-artifact-stack-front-y\),\s*0\s*\)[^}]*rotate\(var\(--ui-folder-artifact-stack-front-rotation\)\)/su,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layer\s*\{[^}]*transition:[^}]*transform\s+var\(--ui-motion-duration-standard\)\s+var\(--ui-motion-easing-enter\)[^}]*opacity\s+var\(--ui-motion-duration-fast\)/su,
    );
    expect(artifactSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none;/u,
    );
    // The whole selector sits inside :global(); `:global(x) .y` compiles to x.
    expect(artifactSource).toContain(
      ":global(:root[data-ui-motion='reduced'] .ui-folder-artifact__stack-layer)",
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-position\s*\{[^}]*inset:\s*var\(--ui-space-2\) var\(--ui-space-2\) auto auto;/su,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layer:focus-visible\s*\{[^}]*outline:\s*var\(--ui-focus-width\) solid var\(--ui-color-focus\);/su,
    );
  });

  it('shrinks a short single-line note to the compact stock, never while editing', async () => {
    const render = (props) =>
      renderToString(
        createSSRApp({
          render: () => h(UiFolderArtifact, { kind: 'note', ...props }),
        }),
      );
    expect(await render({ body: 'BPM 92' })).toContain(
      'ui-folder-artifact--compact',
    );
    expect(await render({ body: 'BPM 92', editing: true })).not.toContain(
      'ui-folder-artifact--compact',
    );
    expect(await render({ body: '第一行\n第二行' })).not.toContain(
      'ui-folder-artifact--compact',
    );
    expect(
      await render({
        body: '副歌第二段降半音，最後一句拉長，結尾再慢一點收尾，換氣在第三拍',
      }),
    ).not.toContain('ui-folder-artifact--compact');
    expect(await render({ title: '直播備註', body: '短' })).not.toContain(
      'ui-folder-artifact--compact',
    );
  });

  it('prints archival photos by restating the shared photo-frame tokens', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(UiFolderArtifact, {
            kind: 'photo',
            src: '/photo.jpg',
            frame: 'archival',
          }),
      }),
    );
    expect(html).toContain('data-photo-frame="archival"');
    const rule = artifactSource.slice(
      artifactSource.indexOf(
        ".ui-folder-artifact--photo[data-photo-frame='archival'] {",
      ),
    );
    expect(rule).toMatch(
      /^[^}]*--ui-photo-frame-bg: var\(--ui-palette-neutral-950\);/u,
    );
    expect(rule).toMatch(
      /^[^}]*--ui-photo-frame-border-color: var\(--ui-palette-neutral-950\);/u,
    );
  });
});
