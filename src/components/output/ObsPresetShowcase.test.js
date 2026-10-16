import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readObsTemplateMockupSource } from './obsTemplateMockupSource.mjs';

const componentSource = readFileSync(
  fileURLToPath(new URL('./ObsTemplateGallery.vue', import.meta.url)),
  'utf8',
);
const splitLayoutSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputSplitLayout.vue', import.meta.url)),
  'utf8',
);
const tokenSource = readFileSync(
  fileURLToPath(new URL('../../styles/tokens.css', import.meta.url)),
  'utf8',
);
const previewTokenSource = readFileSync(
  fileURLToPath(new URL('../../styles/features/output.css', import.meta.url)),
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
const mockupSource = readObsTemplateMockupSource();
const thumbnailSource = readFileSync(
  fileURLToPath(new URL('./ObsTemplateThumbnail.vue', import.meta.url)),
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
const runtimeStatusSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputRuntimeStatus.vue', import.meta.url)),
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
const appearanceFieldSource = readFileSync(
  fileURLToPath(new URL('./ObsAppearanceField.vue', import.meta.url)),
  'utf8',
);
const outputColorFieldSource = readFileSync(
  fileURLToPath(new URL('./ObsOutputColorField.vue', import.meta.url)),
  'utf8',
);
const settingsSource = readFileSync(
  fileURLToPath(
    new URL('../settings/OutputRuntimeSettingsBlock.vue', import.meta.url),
  ),
  'utf8',
);
const settingsViewSource = readFileSync(
  fileURLToPath(new URL('../../views/SettingsView.vue', import.meta.url)),
  'utf8',
);
const settingsCapabilitiesSource = readFileSync(
  fileURLToPath(
    new URL('../settings/SettingsCapabilitiesSection.vue', import.meta.url),
  ),
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
  it('keeps custom-first gallery browsing independent from the applied slot', () => {
    expect(workspaceSource).toContain('group.templates[0]?.id ?? null');
    expect(workspaceSource).toContain(':applied-preset-ids="appliedPresetIds"');
    expect(workspaceSource).not.toContain(
      'if (templateId) browsedPresetIds[definition.id] = templateId;',
    );
  });

  it('routes page and kind selections through the session navigation owner', () => {
    expect(workspaceSource).not.toMatch(/activePage\.value\s*=(?!=)/u);
    expect(workspaceSource).not.toMatch(/activeKind\.value\s*=(?!=)/u);
    expect(workspaceSource).toContain(
      'rememberKind(preset.kind, availableKindIds.value)',
    );
    expect(workspaceSource).toContain(
      'rememberKind(kind, availableKindIds.value);',
    );
  });

  it('remounts the live Workbench subtree when its page becomes active again', () => {
    expect(workspaceSource).toMatch(
      /<section\s+v-if="activePage === 'workbench'"\s+id="obs-output-workbench-panel"/u,
    );
    expect(workspaceSource).toMatch(
      /<section\s+v-show="activePage === 'gallery'"\s+id="obs-output-gallery-panel"/u,
    );
    expect(workspaceSource).not.toContain('obs-output-settings-panel');
  });

  it('keeps gallery sizing token-driven and responsive to its own column width', () => {
    const compactComponentSource = compactWhitespace(componentSource);
    const compactSplitLayoutSource = compactWhitespace(splitLayoutSource);

    expect(previewTokenSource).toContain(
      '--ui-output-gallery-detail-width: clamp(',
    );
    expect(previewTokenSource).toContain(
      '--ui-output-gallery-detail-width-max',
    );
    expect(previewTokenSource).toContain(
      '--ui-output-gallery-preview-max-width',
    );
    expect(previewTokenSource).toContain(
      '--ui-output-workbench-inspector-width',
    );
    expect(previewTokenSource).toContain(
      '--ui-output-workbench-stage-max-width',
    );
    expect(previewTokenSource).toContain('--ui-output-gallery-tile-min-width');
    expect(previewTokenSource).toContain(
      '--ui-output-template-thumb-title-font-size',
    );
    expect(previewTokenSource).toContain('22vw');
    expect(previewTokenSource).not.toContain('34cqi');
    expect(previewTokenSource).toContain('--ui-output-setting-label-width-min');
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
    expect(previewTokenSource).toContain(
      '--ui-output-preview-aspect-ratio: 16 / 9',
    );
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
    expect(componentSource).toContain(
      'preset.availability?.available === false',
    );
    expect(componentSource).toContain(
      ':disabled="isApplying || isApplied || !isSelectedPresetAvailable"',
    );
    expect(componentSource).toContain("'尚未提供'");
    expect(workspaceSource).toContain(
      'preset.availability?.available === false',
    );
    expect(componentSource).not.toContain('雙擊套用');
    expect(componentSource).not.toContain('內建模板');
    expect(componentSource).toContain('selectedAvailabilitySummary');
    expect(componentSource).not.toContain('startOutput');
    expect(componentSource).toContain('ObsTemplateThumbnail');
    expect(componentSource).toContain('ObsTemplatePreviewStage');
    expect(componentSource).not.toContain('ObsOverlayPreview');
    expect(componentSource).not.toContain('previewUrl');
    expect(componentSource).not.toContain('<UiTabs');
    expect(componentSource).not.toContain('ObsOutputTabs');
    expect(workbenchSource).not.toContain('<UiSegmentedControl');
    expect(componentSource).toContain('activeGroup.templates');
    expect(componentSource).not.toContain('v-for="preset in group.templates"');
    expect(compactSplitLayoutSource).toMatch(
      /@container app-folder-layout \(width < 40rem\) \{ \.obs-output-split-layout \{ grid-template-columns: 1fr; grid-template-rows: minmax\(0, 2fr\) minmax\(0, 1fr\);/,
    );
    expect(compactSplitLayoutSource).toMatch(
      /\.obs-output-split-layout--main-gallery \{ grid-template-rows: minmax\(0, 1fr\) minmax\(0, 1fr\);/,
    );
    expect(splitLayoutSource).not.toContain('container-type: inline-size');
  });

  it('keeps thumbnails static and animates only the selected detail preview', () => {
    expect(componentSource).toContain(':scene="previewScene"');
    expect(thumbnailSource).toContain(':animated="false"');
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
    expect(mangaBranch).not.toContain(
      'obs-template-mockup__manga-bubbles obs-template-mockup__animated-bubble',
    );
    expect(mangaBranch).not.toContain(
      'obs-template-mockup__title--manga obs-template-mockup__animated-primary',
    );
    expect(mockupSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(mockupSource).toContain('@keyframes obs-preview-line-cycle');
    expect(mockupSource).not.toContain('@keyframes obs-preview-bubble-cycle');
  });

  it('reuses shared preview tokens instead of hard-coded component values', () => {
    expect(previewTokenSource).toContain('--ui-output-preview-canvas:');
    expect(previewTokenSource).toContain('--ui-output-preview-surface:');
    expect(previewTokenSource).toContain('--ui-output-preview-text:');
    expect(previewTokenSource).toContain('--ui-output-preview-text-muted:');
    expect(previewTokenSource).toContain('--ui-output-preview-accent:');
    expect(previewTokenSource).toContain('--ui-output-preview-cycle-duration:');
    expect(previewTokenSource).toContain('--ui-output-preview-cycle-ease:');
    expect(previewTokenSource).toContain(
      '--ui-output-preview-player-track-size:',
    );
    expect(previewTokenSource).toContain('--ui-output-preview-ktv-canvas:');
    expect(previewTokenSource).toContain(
      '--ui-output-preview-ktv-fill-unsung:',
    );
    expect(previewTokenSource).toContain('--ui-output-preview-ktv-fill-solo:');
    expect(previewTokenSource).toContain('--ui-output-preview-ktv-fill-male:');
    expect(previewTokenSource).toContain(
      '--ui-output-preview-ktv-fill-female:',
    );
    expect(previewTokenSource).toContain('--ui-output-preview-ktv-fill-group:');
    expect(previewTokenSource).toContain(
      '--ui-output-preview-ktv-stroke-unsung:',
    );
    expect(previewTokenSource).toContain(
      '--ui-output-preview-ktv-stroke-sung:',
    );
    expect(previewTokenSource).not.toContain('--ui-output-preview-ktv-shadow:');
    expect(previewTokenSource).toContain(
      '--ui-output-template-thumb-caption-font-size:',
    );
    expect(previewTokenSource).toContain(
      '--ui-output-template-thumb-artwork-size:',
    );
    expect(previewTokenSource).toContain(
      '--ui-output-template-thumb-content-width:',
    );
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
    expect(previewSource).toContain(':style="previewFrameStyle"');
    expect(previewSource).toContain('calculateCapturePreviewScale');
    expect(previewSource).toContain('transform-origin: left top');
    expect(previewSource).toContain("id: 'checker'");
    expect(previewSource).toContain("id: 'dark'");
    expect(previewSource).toContain("id: 'light'");
    expect(previewSource).toContain(':data-backdrop="previewBackdrop"');
    expect(previewSource).toContain('aria-label="預覽背景"');
    expect(previewSource).toContain('UiIconButton');
    expect(previewSource).not.toContain("emit('save");
    expect(previewSource).toContain("url.pathname = '/overlay/lyrics'");
    expect(previewSource).not.toContain('/workbench/lyrics');
    expect(previewSource).toContain("url.searchParams.set('workbench', '1')");
    expect(previewSource).toContain("url.searchParams.set('backdrop'");
    expect(previewSource).not.toContain("searchParams.set('preview'");
    expect(previewSource).toContain('gap: var(--ui-space-1)');
    expect(previewSource).toContain('var(--ui-color-surface)');
    expect(previewSource).toContain('var(--ui-color-canvas)');
    expect(previewSource).toContain('var(--ui-color-overlay-contrast)');
    expect(previewSource).toContain('ObsWidgetCapturePreview');
    expect(previewSource).toContain('v-if="isLyrics"');
    expect(previewSource).toContain(
      'v-if="isLyrics && showLyricsGuide && !hasRuntimeTemplate"',
    );
    expect(previewSource).toContain("'隱藏人物參考' : '顯示人物參考'");
    expect(previewSource).toContain(':src="streamerPreviewImage"');
    expect(widgetCapturePreviewSource).toContain('gridTemplateColumns');
    expect(widgetCapturePreviewSource).toContain('supportedCaptureSizes');
    expect(widgetCapturePreviewSource).toContain('align-items: end');
    expect(widgetCapturePreviewSource).toContain(
      "emit('selectSize', option.id)",
    );
    expect(previewTokenSource).toContain(
      '--ui-output-gallery-detail-width: clamp(',
    );
  });

  it('keeps inspector fields inset and replaceable without owning their data', () => {
    const compactSplitLayoutSource = compactWhitespace(splitLayoutSource);
    const compactAppearanceControlRowSource = compactWhitespace(
      appearanceControlRowSource,
    );

    expect(compactSplitLayoutSource).toContain(
      '--ui-output-side-visual-inset-start: var(--ui-space-4)',
    );
    expect(compactSplitLayoutSource).toContain(
      '--ui-output-side-visual-inset-end: var(--ui-space-3)',
    );
    expect(compactSplitLayoutSource).toContain(
      'padding-inline: var(--ui-output-side-content-inset-start) var(--ui-output-side-content-inset-end)',
    );
    expect(workbenchSource).toContain('ObsAppearanceField');
    expect(workbenchSource).toContain(':field="field"');
    expect(appearanceFieldSource).toContain(
      'const controlId = computed(() => `output-appearance-${props.field.key}`)',
    );
    expect(appearanceFieldSource).toContain('<UiSelect');
    expect(appearanceFieldSource).toContain('<ObsOutputColorField');
    expect(outputColorFieldSource).toContain('<UiColorField');
    expect(outputColorFieldSource).toContain('label-hidden');
    expect(workbenchSource).toContain(':saved-colors="savedColors"');
    expect(workspaceSource).toContain(
      ':saved-colors="outputState.preferences.savedColors"',
    );
    expect(workspaceSource).toContain('@toggle-saved-color="toggleSavedColor"');
    expect(appearanceFieldSource).not.toContain('<select');
    expect(appearanceFieldSource).not.toContain('type="color"');
    expect(appearanceControlRowSource).toContain('<slot />');
    expect(compactAppearanceControlRowSource).toMatch(
      /grid-template-columns:\s*var\(--ui-output-setting-label-width-min\)\s*minmax\(\s*0,\s*1fr\s*\)/,
    );
    expect(appearanceControlRowSource).not.toContain('border-block-start:');
    expect(appearanceControlRowSource).not.toContain('v-model');
  });

  it('autosaves Appearance changes while keeping explicit template application', () => {
    expect(workbenchSource).toContain("'changeSettings'");
    expect(workbenchSource).toContain("'retrySave'");
    expect(workbenchSource).toContain('updateAppearanceField(field, $event)');
    expect(workbenchSource).toContain('updateCaptureSize');
    expect(workbenchSource).toContain('role="status"');
    expect(workbenchSource).not.toContain('@click="saveSettings"');
    expect(workbenchSource).toContain("if (saveStatus !== 'saved') return;");
    expect(workbenchSource).toContain('() => props.saveStatus');
    expect(workspaceSource).toContain('useOutputAppearanceAutosave');
    expect(workspaceSource).toContain('appearanceAutosave.schedule');
    expect(workspaceSource).toContain('await appearanceAutosave.flush()');
    expect(workspaceSource).toContain('@change-settings="queueAppearanceSave"');
    expect(workspaceSource).toContain('@retry-save="appearanceAutosave.retry"');
    expect(workspaceSource).toContain('@apply-preset="applyPreset"');
  });

  it('separates workbench preview and URL copy from runtime settings', () => {
    expect(workbenchSource).toContain('ObsOverlayPreview');
    expect(splitLayoutSource).toContain(
      'var(--ui-output-workbench-inspector-width)',
    );
    expect(workbenchSource).not.toContain('<select');
    expect(workbenchSource).toContain('appearanceFields');
    expect(workbenchSource).toContain('presentationFields');
    expect(workbenchSource).toContain('sanitizeOutputAppearanceSetting');
    expect(workbenchSource).toContain('configurationFieldGroups');
    expect(workbenchSource).toContain('captureSize: draft.captureSize');
    expect(workbenchSource).not.toContain('obs-slot-workbench__capture-guide');
    expect(workbenchSource).toContain(
      ':supported-capture-sizes="supportedCaptureSizes"',
    );
    expect(previewSource).toContain('obs-overlay-preview__capture-meta');
    expect(previewSource).toContain('固定');
    expect(previewSource).toContain(
      '{{ PREVIEW_CANVAS_WIDTH }} × {{ PREVIEW_CANVAS_HEIGHT }}',
    );
    expect(settingsSource).toContain('<UiTextField');
    expect(settingsSource).toContain('inputmode="numeric"');
    expect(settingsSource).toContain('@change="commitSettings()"');
    expect(settingsSource).toContain(
      '@keydown.enter.prevent="commitSettings()"',
    );
    expect(settingsSource).not.toContain('type="number"');
    expect(settingsSource).not.toContain('step="1"');
    expect(settingsSource).not.toContain(':icon="Check"');
    expect(settingsSource).toContain('<UiCheckbox');
    expect(settingsSource).toContain('describeOutputRuntimeStatus');
    expect(previewSource).not.toContain('describeOutputRuntimeStatus');
    expect(settingsSource).toContain('serviceStatus.detail');
    expect(previewSource).not.toContain('sourceDiagnostic');
    expect(previewSource).not.toContain('UiChip');
    expect(previewSource).not.toContain('UiNotice');
    expect(workbenchSource).not.toContain('ObsOutputRuntimeStatus');
    expect(workbenchSource).toContain(':message="outputError"');
    expect(workbenchSource).toContain('title="輸出未更新"');
    expect(workbenchSource).not.toContain('preset.detail');
    expect(workbenchSource).not.toContain('preset.tags');
    expect(runtimeStatusSource).not.toContain('preset?.summary');
    expect(runtimeStatusSource).toContain('describeOutputRuntimeStatus');
    expect(runtimeStatusSource).toContain('aria-label="輸出狀態"');
    expect(workspaceSource).toContain('await initializeOutput()');
    expect(workspaceSource).toContain('await refreshOutputStatus()');
    expect(settingsSource).not.toContain('OBS 已連線');
    expect(settingsSource).not.toContain('等待 OBS Browser Source 連線');
    expect(settingsSource).toContain('連接埠被占用');
    expect(settingsSource).toContain('SettingsDocumentItem');
    expect(settingsSource).toContain('variant="nested"');
    expect(settingsSource).toContain('UiNotice');
    expect(settingsViewSource).toContain('<SettingsCapabilitiesSection');
    expect(settingsCapabilitiesSource).toContain('<OutputRuntimeSettingsBlock');
    expect(settingsViewSource).not.toContain(
      '--settings-view-column-min-width',
    );
    expect(settingsCapabilitiesSource).toContain(
      'class="settings-capabilities-section"',
    );
    expect(tokenSource).not.toContain('--ui-settings-column-min-width:');
    expect(tokenSource).not.toContain('--ui-settings-checkbox-size:');
    expect(settingsSource).toContain('可用連接埠');
    expect(previewTokenSource).not.toContain('--ui-output-port-input-width');
    expect(previewTokenSource).toContain(
      '--ui-output-settings-command-button-width:',
    );
    expect(runtimeStatusSource).toContain('obs-output-runtime-status__command');
    expect(settingsSource).toContain('output.start()');
    expect(settingsSource).not.toContain('v-model="copyKind"');
    expect(settingsSource).not.toContain('title="OBS URL"');
    expect(settingsSource).not.toContain('copyObsUrl');
    expect(settingsSource).not.toContain('目前模板 URL');
    expect(settingsSource).not.toContain('檢查連接埠');
    expect(settingsSource).not.toContain("emit('suggestPorts')");
    expect(previewSource).toContain('Browser Source 即時預覽');
    expect(previewSource).toContain('label="複製網址"');
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
