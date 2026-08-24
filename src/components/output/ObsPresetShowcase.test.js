import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  fileURLToPath(new URL('./ObsTemplateGallery.vue', import.meta.url)),
  'utf8',
);
const splitLayoutSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputSplitLayout.vue', import.meta.url)),
  'utf8',
);
const tabsSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputTabs.vue', import.meta.url)),
  'utf8',
);
const tokenSource = readFileSync(
  fileURLToPath(new URL('../../styles/tokens.css', import.meta.url)),
  'utf8',
);
const previewSource = readFileSync(
  fileURLToPath(new URL('./ObsOverlayPreview.vue', import.meta.url)),
  'utf8',
);
const widgetCapturePreviewSource = readFileSync(
  fileURLToPath(new URL('./ObsWidgetCapturePreview.vue', import.meta.url)),
  'utf8',
);
const mockupSource = readFileSync(
  fileURLToPath(new URL('./ObsTemplateMockup.vue', import.meta.url)),
  'utf8',
);
const previewStageSource = readFileSync(
  fileURLToPath(new URL('./ObsTemplatePreviewStage.vue', import.meta.url)),
  'utf8',
);
const workbenchSource = readFileSync(
  fileURLToPath(new URL('./ObsSlotWorkbench.vue', import.meta.url)),
  'utf8',
);
const briefSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputBrief.vue', import.meta.url)),
  'utf8',
);
const preloadSource = readFileSync(
  fileURLToPath(new URL('../../../electron/preload.js', import.meta.url)),
  'utf8',
);
const appearanceControlRowSource = readFileSync(
  fileURLToPath(new URL('./ObsAppearanceControlRow.vue', import.meta.url)),
  'utf8',
);
const settingsSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputSettings.vue', import.meta.url)),
  'utf8',
);
const settingsViewSource = readFileSync(
  fileURLToPath(new URL('../../views/SettingsView.vue', import.meta.url)),
  'utf8',
);
const workspaceSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputWorkspace.vue', import.meta.url)),
  'utf8',
);

function compactWhitespace(source) {
  return source.replace(/\s+/g, ' ');
}

describe('OBS output workspace layout contract', () => {
  it('keeps gallery sizing token-driven and responsive to its own column width', () => {
    const compactComponentSource = compactWhitespace(componentSource);
    const compactSplitLayoutSource = compactWhitespace(splitLayoutSource);

    expect(tokenSource).toContain('--ui-output-gallery-detail-width: clamp(');
    expect(tokenSource).toContain('--ui-output-gallery-detail-width-max');
    expect(tokenSource).toContain('--ui-output-gallery-preview-max-width');
    expect(tokenSource).toContain('--ui-output-workbench-inspector-width');
    expect(tokenSource).toContain('--ui-output-workbench-stage-max-width');
    expect(tokenSource).toContain('--ui-output-gallery-tile-min-width');
    expect(tokenSource).toContain('--ui-output-template-thumb-title-font-size');
    expect(tokenSource).toContain('22vw');
    expect(tokenSource).not.toContain('34cqi');
    expect(tokenSource).toContain('--ui-output-setting-label-width-min');
    expect(componentSource).not.toContain('--ui-font-size-xs');
    expect(componentSource).toContain('container-type: inline-size');
    expect(compactComponentSource).toContain(
      'repeat( auto-fill, minmax(var(--ui-output-gallery-tile-min-width), 1fr) )',
    );
    expect(compactSplitLayoutSource).toMatch(
      /minmax\(\s*var\(--ui-output-gallery-column-min\),\s*1fr\s*\)/,
    );
    expect(compactSplitLayoutSource).toContain(
      'var(--ui-output-gallery-detail-width)',
    );
    expect(compactSplitLayoutSource).not.toMatch(
      /minmax\(\s*var\(--ui-output-gallery-detail-width-min\),\s*var\(--ui-output-gallery-detail-width-max\)\s*\)/,
    );
    expect(mockupSource).toContain(
      'max-inline-size: var(--ui-output-gallery-preview-max-width)',
    );
    expect(tokenSource).toContain('--ui-output-preview-aspect-ratio: 16 / 9');
    expect(mockupSource).toContain(
      'aspect-ratio: var(--ui-output-preview-aspect-ratio)',
    );
    expect(mockupSource).toContain("[data-size='thumbnail']");
    expect(mockupSource).toContain('place-content: center');
    expect(mockupSource).toContain('justify-items: center');
    expect(mockupSource).toContain('text-align: center');
    expect(mockupSource).toContain(
      'width: var(--ui-output-template-thumb-content-width)',
    );
    expect(mockupSource).not.toContain('calc(var(--ui-space-1) / 2)');
    expect(componentSource).toContain('@container (width < 48rem)');
    expect(componentSource).toContain("emit('applyPreset'");
    expect(componentSource).toContain('@dblclick="applyPreset(preset)"');
    expect(componentSource).not.toContain('雙擊套用');
    expect(componentSource).toContain('內建模板');
    expect(componentSource).not.toContain('startOutput');
    expect(componentSource).toContain('ObsTemplateMockup');
    expect(componentSource).toContain('ObsTemplatePreviewStage');
    expect(componentSource).not.toContain('ObsOverlayPreview');
    expect(componentSource).not.toContain('previewUrl');
    expect(tabsSource).toContain('role="tablist"');
    expect(componentSource).toContain('ObsOutputTabs');
    expect(componentSource).toContain('activeGroup.templates');
    expect(componentSource).not.toContain('v-for="preset in group.templates"');
  });

  it('keeps thumbnails static and animates only the selected detail preview', () => {
    expect(componentSource).toContain(':scene="previewScene"');
    expect(componentSource).toContain(':animated="false"');
    expect(previewStageSource).toContain('<ObsTemplateMockup');
    expect(previewStageSource).toContain(':animated="isMotionPlaying"');
    expect(previewStageSource).toContain('暫停動態預覽');
    expect(previewStageSource).toContain('播放動態預覽');
    expect(previewStageSource).toContain('固定示例');
    expect(mockupSource).toContain(
      'animated: { type: Boolean, default: false }',
    );
    expect(mockupSource).toContain("animated ? 'playing' : 'paused'");
    expect(mockupSource).toContain("preset?.id ?? 'generic'");
    expect(mockupSource).toContain("preset?.id === 'quiet-caption'");
    expect(mockupSource).toContain("preset?.id === 'manga-frame'");
    expect(mockupSource).toContain("preset?.id === 'cover-player'");
    expect(mockupSource).toContain('obs-template-mockup__cover-player');
    expect(mockupSource).toContain('obs-template-mockup__cover-player-copy');
    expect(compactWhitespace(mockupSource)).toContain(
      '.obs-template-mockup__cover-player .obs-template-mockup__artwork',
    );
    expect(mockupSource).toContain('obs-template-mockup__transport');
    expect(mockupSource).toContain('obs-template-mockup__timeline');
    expect(mockupSource).not.toContain('obs-template-mockup__volume');
    expect(mockupSource).toContain('obs-template-mockup__manga-bubble');
    expect(mockupSource).toContain(
      "import MangaFrameSvg from './MangaFrameSvg.vue'",
    );
    expect(mockupSource).toContain('writing-mode: vertical-rl');
    const mangaBranch = mockupSource.slice(
      mockupSource.indexOf("preset?.id === 'manga-frame'"),
      mockupSource.indexOf("preset?.id === 'karaoke-stack'"),
    );
    expect(mangaBranch).toContain('mangaBubbles');
    expect(mangaBranch).toContain('bubble.text');
    expect(mangaBranch).not.toContain('lyrics.next');
    expect(mangaBranch).toContain(
      'obs-template-mockup__manga-bubbles obs-template-mockup__animated-bubble',
    );
    expect(mangaBranch).not.toContain(
      'obs-template-mockup__title--manga obs-template-mockup__animated-primary',
    );
    expect(mockupSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(mockupSource).toContain('@keyframes obs-preview-line-cycle');
    expect(mockupSource).toContain('@keyframes obs-preview-bubble-cycle');
  });

  it('reuses shared preview tokens instead of hard-coded component values', () => {
    expect(tokenSource).toContain('--ui-output-preview-canvas:');
    expect(tokenSource).toContain('--ui-output-preview-surface:');
    expect(tokenSource).toContain('--ui-output-preview-text:');
    expect(tokenSource).toContain('--ui-output-preview-text-muted:');
    expect(tokenSource).toContain('--ui-output-preview-accent:');
    expect(tokenSource).toContain('--ui-output-preview-cycle-duration:');
    expect(tokenSource).toContain('--ui-output-preview-cycle-ease:');
    expect(tokenSource).toContain('--ui-output-preview-player-track-size:');
    expect(tokenSource).toContain(
      '--ui-output-template-thumb-caption-font-size:',
    );
    expect(tokenSource).toContain('--ui-output-template-thumb-artwork-size:');
    expect(tokenSource).toContain('--ui-output-template-thumb-content-width:');
    expect(mockupSource).toContain('var(--ui-output-preview-canvas)');
    expect(mockupSource).toContain('var(--ui-output-preview-cycle-duration)');
    expect(mockupSource).toContain('var(--ui-output-preview-cycle-ease)');
    expect(mockupSource).toContain(
      'var(--ui-output-template-thumb-caption-font-size)',
    );
    expect(mockupSource).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(mockupSource).not.toContain('0.625rem');
    expect(mockupSource).not.toContain('0.7em');
    expect(mockupSource).not.toContain('4.8s');
  });

  it('keeps the real iframe in the workbench preview only', () => {
    expect(previewSource).toContain('<iframe');
    expect(previewSource).not.toContain('srcdoc');
    expect(previewSource).toContain(
      'aspect-ratio: var(--ui-output-preview-aspect-ratio)',
    );
    expect(previewSource).toContain(':src="inspectionUrl"');
    expect(previewSource).toContain(
      'sandbox="allow-scripts allow-same-origin"',
    );
    expect(workbenchSource).toContain('ObsOverlayPreview');
    expect(componentSource).not.toContain('<iframe');
    expect(previewSource).toContain(
      'inline-size: min(100%, var(--ui-output-workbench-stage-max-width))',
    );
    expect(previewSource).toContain(
      'const PREVIEW_CANVAS_WIDTH = OUTPUT_LYRICS_CAPTURE_SIZE.width',
    );
    expect(previewSource).toContain(
      'const PREVIEW_CANVAS_HEIGHT = OUTPUT_LYRICS_CAPTURE_SIZE.height',
    );
    expect(previewSource).toContain('ref="previewStage"');
    expect(previewSource).toContain('new ResizeObserver(measurePreview)');
    expect(previewSource).toContain(':style="previewCanvasStyle"');
    expect(previewSource).toContain('transform-origin: left top');
    expect(previewSource).toContain("id: 'checker'");
    expect(previewSource).toContain("id: 'dark'");
    expect(previewSource).toContain("id: 'light'");
    expect(previewSource).toContain(':data-backdrop="previewBackdrop"');
    expect(previewSource).toContain('aria-label="預覽背景"');
    expect(previewSource).toContain('UiIconButton');
    expect(previewSource).not.toContain("emit('save");
    expect(previewSource).toContain("searchParams.set('backdrop'");
    expect(previewSource).not.toContain("searchParams.set('preview'");
    expect(previewSource).toContain('gap: var(--ui-space-1)');
    expect(previewSource).toContain('var(--ui-color-surface)');
    expect(previewSource).toContain('var(--ui-color-canvas)');
    expect(previewSource).toContain('var(--ui-color-overlay-contrast)');
    expect(previewSource).toContain('ObsWidgetCapturePreview');
    expect(previewSource).toContain('v-if="isLyrics"');
    expect(previewSource).toContain(
      '<ObsStreamerPreview :src="streamerPreviewImage" />',
    );
    expect(widgetCapturePreviewSource).toContain('gridTemplateColumns');
    expect(widgetCapturePreviewSource).toContain('supportedCaptureSizes');
    expect(widgetCapturePreviewSource).toContain('align-items: end');
    expect(widgetCapturePreviewSource).toContain(
      "emit('selectSize', option.id)",
    );
    expect(tokenSource).toContain('--ui-output-gallery-detail-width: clamp(');
  });

  it('keeps inspector fields inset and replaceable without owning their data', () => {
    const compactSplitLayoutSource = compactWhitespace(splitLayoutSource);
    const compactAppearanceControlRowSource = compactWhitespace(
      appearanceControlRowSource,
    );

    expect(compactSplitLayoutSource).toContain(
      'padding-inline: var(--ui-space-4) var(--ui-space-3)',
    );
    expect(workbenchSource).toContain('ObsAppearanceControlRow');
    expect(workbenchSource).toContain(
      ':control-id="`output-appearance-${control.key}`"',
    );
    expect(workbenchSource).toContain('class="obs-slot-workbench__select"');
    expect(appearanceControlRowSource).toContain('<slot />');
    expect(compactAppearanceControlRowSource).toMatch(
      /grid-template-columns:\s*var\(--ui-output-setting-label-width-min\)\s*minmax\(\s*0,\s*1fr\s*\)/,
    );
    expect(appearanceControlRowSource).toContain(
      'border-block-start: var(--ui-border-width) solid var(--ui-color-border)',
    );
    expect(appearanceControlRowSource).not.toContain('v-model');
  });

  it('separates workbench preview and URL copy from runtime settings', () => {
    expect(workbenchSource).toContain('ObsOverlayPreview');
    expect(splitLayoutSource).toContain(
      'var(--ui-output-workbench-inspector-width)',
    );
    expect(workbenchSource.match(/<select/g)).toHaveLength(1);
    expect(workbenchSource).toContain("key: 'fontFamily'");
    expect(workbenchSource).toContain("key: 'fontScale'");
    expect(workbenchSource).toContain("key: 'fontWeight'");
    expect(workbenchSource).toContain("key: 'alignment'");
    expect(workbenchSource).toContain("key: 'surface'");
    expect(workbenchSource).toContain('captureSize: draft.captureSize');
    expect(workbenchSource).toContain(
      'class="obs-slot-workbench__capture-guide"',
    );
    expect(
      workbenchSource.indexOf('obs-slot-workbench__capture-guide'),
    ).toBeLessThan(workbenchSource.indexOf('<ObsOverlayPreview'));
    expect(workbenchSource).toContain(
      ':supported-capture-sizes="supportedCaptureSizes"',
    );
    expect(workbenchSource).toContain(
      '{{ capturePreset.width }} × {{ capturePreset.height }} px',
    );
    expect(settingsSource).toContain('type="text"');
    expect(settingsSource).toContain('inputmode="numeric"');
    expect(settingsSource).toContain('text-align: right');
    expect(settingsSource).toContain('@change="commitSettings()"');
    expect(settingsSource).toContain(
      '@keydown.enter.prevent="commitSettings()"',
    );
    expect(settingsSource).not.toContain('type="number"');
    expect(settingsSource).not.toContain('step="1"');
    expect(settingsSource).not.toContain(':icon="Check"');
    expect(settingsSource).toContain('type="checkbox"');
    expect(settingsSource).toContain('describeOutputRuntimeStatus');
    expect(previewSource).not.toContain('describeOutputRuntimeStatus');
    expect(settingsSource).toContain('runtimeStatus.value.detail');
    expect(previewSource).not.toContain('sourceDiagnostic');
    expect(previewSource).not.toContain('UiChip');
    expect(previewSource).not.toContain('UiNotice');
    expect(workbenchSource).toContain('ObsOutputBrief');
    expect(workbenchSource).toContain(':output-status="outputStatus"');
    expect(workbenchSource).toContain(':error="outputError"');
    expect(workbenchSource).not.toContain('preset.detail');
    expect(workbenchSource).not.toContain('preset.tags');
    expect(briefSource).toContain('preset?.summary');
    expect(briefSource).toContain('describeOutputSourceStatus');
    expect(briefSource).toContain('describeOutputClientStatus');
    expect(briefSource).toContain('aria-label="輸出摘要"');
    expect(briefSource).toContain('v-if="error"');
    expect(briefSource).toContain('title="輸出未更新"');
    expect(workspaceSource).toContain('await initializeOutput()');
    expect(workspaceSource).toContain('await refreshOutputStatus()');
    expect(settingsSource).not.toContain('OBS 已連線');
    expect(settingsSource).not.toContain('等待 OBS Browser Source 連線');
    expect(settingsSource).toContain('Port 被占用');
    expect(settingsSource).toContain('SettingsBlock');
    expect(settingsSource).toContain('SettingsActionRow');
    expect(settingsSource).toContain('UiNotice');
    expect(settingsSource).not.toContain('obs-output-settings__row');
    expect(settingsSource).toContain('var(--ui-settings-column-min-width)');
    expect(settingsViewSource).toContain('var(--ui-settings-column-min-width)');
    expect(settingsSource).toContain('var(--ui-settings-checkbox-size)');
    expect(tokenSource).toContain('--ui-settings-column-min-width: 22rem');
    expect(tokenSource).toContain('--ui-settings-checkbox-size:');
    expect(settingsSource).toContain('可用 Port');
    expect(tokenSource).toContain('--ui-output-port-input-width: 4.75rem');
    expect(tokenSource).toContain('--ui-output-settings-command-button-width:');
    expect(settingsSource).toContain('obs-output-settings__command');
    expect(settingsSource).not.toContain('v-model="copyKind"');
    expect(settingsSource).not.toContain('title="OBS URL"');
    expect(settingsSource).not.toContain('copyObsUrl');
    expect(settingsSource).not.toContain('目前模板 URL');
    expect(settingsSource).not.toContain('檢查 Port');
    expect(settingsSource).not.toContain("emit('suggestPorts')");
    expect(previewSource).toContain('Browser Source 即時預覽');
    expect(previewSource).toContain('Browser Source URL');
    expect(previewSource).toContain(
      'window.Utawakui.copyOutputUrl(props.activeKind)',
    );
    expect(previewSource).not.toContain('navigator.clipboard');
    expect(preloadSource).toContain(
      "ipcRenderer.invoke('output:copy-url', kind)",
    );
    expect(previewSource).not.toContain('OBS Overlay 即時預覽');
  });
});
