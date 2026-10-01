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
const activeTokensSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const v2TokensSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

const artifacts = [
  {
    id: 'photo',
    kind: 'photo',
    label: '錄音現場照片',
    initialX: 0.08,
    initialY: 0.08,
    rotation: -2,
  },
  {
    id: 'note',
    kind: 'note',
    label: '錄製備忘',
    initialX: 0.52,
    initialY: 0.38,
    rotation: 1,
  },
  {
    id: 'stack',
    kind: 'stack',
    label: '重疊照片',
    activatable: true,
    activationLabel: '切換照片',
    initialX: 0.3,
    initialY: 0.1,
    rotation: 2,
  },
];

describe('UiFolderArtifactCanvas', () => {
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
    expect(canvasSource).toMatch(
      /clampFolderArtifactPosition\([\s\S]*?props\.minimumVisibleSize,[\s\S]*?artifactRotation\(id\),[\s\S]*?\)/u,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas__bounds\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*var\(--ui-folder-artifact-safe-inset\);/su,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas\s*\{[^}]*overflow:\s*hidden;/su,
    );
    expect(activeTokensSource).toMatch(
      /--ui-folder-artifact-safe-inset:\s*calc\(\s*var\(--ui-focus-width\)\s*\+\s*var\(--ui-focus-offset\)\s*\+\s*var\(--ui-border-width\)\s*\);/u,
    );
    expect(canvasSource).toContain('translate3d(');
    expect(canvasSource).toContain('transform-origin: center');
    expect(canvasSource).toContain('touch-action: none');
    expect(canvasSource).not.toContain('draggable="true"');
  });

  it('keeps artifacts below fixed chrome and removes lift motion when requested', () => {
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas__item\s*\{[^}]*z-index:\s*var\(--ui-folder-artifact-z\);/su,
    );
    expect(canvasSource).toMatch(
      /\.ui-folder-artifact-canvas__item--active\s*\{[^}]*z-index:\s*var\(--ui-folder-artifact-z-active\);/su,
    );
    expect(canvasSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none;/u,
    );
    expect(canvasSource).toContain(":global(:root[data-ui-motion='reduced'])");
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
    expect(activeTokensSource).toMatch(
      /--ui-folder-artifact-note-bg-translucent:\s*color-mix\([\s\S]*?var\(--ui-folder-artifact-note-bg\) 84%[\s\S]*?transparent/u,
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
    expect(artifactSource).not.toContain('appearance');
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact--photo img,[\s\S]*filter:\s*saturate\(/u,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact--note\s*\{[\s\S]*background-image:\s*linear-gradient\(/u,
    );
    expect(artifactSource).not.toContain('radial-gradient(');
    const photoFrameRule =
      artifactSource.match(/\.ui-folder-artifact--photo\s*\{[^}]*\}/su)?.[0] ??
      '';
    const stackFrameRule =
      artifactSource.match(
        /\.ui-folder-artifact__stack-layer\s*\{[^}]*\}/su,
      )?.[0] ?? '';
    expect(photoFrameRule).not.toContain('background-image');
    expect(stackFrameRule).not.toContain('background-image');
    expect(artifactSource).not.toContain('backdrop-filter');
    expect(artifactSource).not.toContain('clip-path');
    expect(artifactSource).not.toContain('mask');
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
    expect(artifactSource).toContain("defineEmits(['previous', 'next'])");
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
        /--ui-folder-artifact-photo-bg-back:\s*color-mix\(\s*in srgb,\s*var\(--ui-folder-artifact-photo-bg\) 90%,\s*var\(--ui-color-canvas\)\s*\);/u,
      );
    }
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layer--back\s*\{[^}]*background-color:\s*var\(--ui-folder-artifact-photo-bg-back\);/su,
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
    expect(artifactSource).toContain(
      ":global(:root[data-ui-motion='reduced'])",
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-position\s*\{[^}]*inset:\s*var\(--ui-space-2\) var\(--ui-space-2\) auto auto;/su,
    );
    expect(artifactSource).toMatch(
      /\.ui-folder-artifact__stack-layer:focus-visible\s*\{[^}]*outline:\s*var\(--ui-focus-width\) solid var\(--ui-color-focus\);/su,
    );
  });
});
