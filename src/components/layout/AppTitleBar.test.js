import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./AppTitleBar.vue', import.meta.url),
  'utf8',
);

describe('AppTitleBar', () => {
  it('uses one controlled preparation disclosure before the other global tools', () => {
    expect(source).not.toContain('SeparationToolbarPopover');
    expect(source).toContain('Download,');
    expect(source).toContain("'togglePreparation'");
    expect(source).toContain("'togglePerformer'");
    expect(source).toContain("'toggleSettings'");

    const controlsStart = source.indexOf('class="app-title-bar__controls"');
    const controlsEnd = source.indexOf('</div>', controlsStart);
    const controlsSource = source.slice(controlsStart, controlsEnd);
    const preparationIndex = controlsSource.indexOf(':icon="Download"');
    const performerIndex = controlsSource.indexOf(':icon="PictureInPicture2"');
    const themeIndex = controlsSource.indexOf(':icon="isLight ? Moon : Sun"');
    const resourcesIndex = source.indexOf('class="app-title-bar__resources"');

    expect(controlsStart).toBeGreaterThan(-1);
    expect(preparationIndex).toBeGreaterThan(-1);
    expect(performerIndex).toBeGreaterThan(preparationIndex);
    expect(themeIndex).toBeGreaterThan(performerIndex);
    expect(resourcesIndex).toBeGreaterThan(-1);
    expect(source).not.toContain('class="app-title-bar__status-cluster"');
  });

  it('separates global utility actions with the shared control gap', () => {
    expect(source).toContain('gap: var(--ui-space-2)');
    expect(source).toContain('padding-right: var(--ui-space-2)');
  });

  it('keeps only live/global utilities in the titlebar', () => {
    const preparationIndex = source.indexOf(':icon="Download"');
    const performerIndex = source.indexOf(':icon="PictureInPicture2"');
    const themeIndex = source.indexOf(':icon="isLight ? Moon : Sun"');
    const settingsIndex = source.indexOf(':icon="Settings"');

    expect(source).not.toContain(':icon="ListOrdered"');
    expect(source).not.toContain('label="場次"');
    expect(source).not.toContain('sessionActive');
    expect(source).not.toContain('toggleSession');
    expect(preparationIndex).toBeGreaterThan(-1);
    expect(performerIndex).toBeGreaterThan(preparationIndex);
    expect(themeIndex).toBeGreaterThan(performerIndex);
    expect(settingsIndex).toBeGreaterThan(themeIndex);
    expect(source.match(/variant="ghost"/gu)).toHaveLength(4);
    expect(source).not.toContain('variant="overlay"');
  });

  it('leaves BGM ownership in the session workspace', () => {
    expect(source).not.toContain('Music2');
    expect(source).not.toContain('toggleBgm');
    expect(source).not.toContain('bgmActive');
  });

  it('opens Import and accompaniment work through one controlled preparation toggle', () => {
    expect(source).not.toContain('ArrowDownToLine,');
    expect(source).toContain('Download,');
    expect(source).toContain(
      'preparationActive: { type: Boolean, default: false }',
    );
    expect(source).toContain(
      "preparationControls: { type: String, default: '' }",
    );
    expect(source).toContain(
      "preparationStatus: { type: String, default: 'idle' }",
    );
    expect(source).toContain(
      "preparationStatusLabel: { type: String, default: '' }",
    );
    expect(source).toContain(
      "preparationActionLabel: { type: String, default: '展開匯入' }",
    );
    expect(source).toContain('const preparationTooltipSuffix = computed(');
    expect(source).toContain(':label="preparationActionLabel"');
    expect(source).not.toContain('title="曲目準備"');
    expect(source).toContain(':tooltip-suffix="preparationTooltipSuffix"');
    expect(source).not.toContain('`曲目準備；${props.preparationStatusLabel}`');
    expect(source).toContain(
      '`app-title-bar__preparation--${preparationTone}`',
    );
    expect(source).toContain(':active="preparationActive"');
    expect(source).toContain(':aria-expanded="preparationActive"');
    expect(source).toContain(
      ':aria-controls="preparationControls || undefined"',
    );
    expect(source).toContain('@click="emit(\'togglePreparation\')"');
  });

  it('keeps preparation status tone visible while the Dock toggle is selected', () => {
    expect(source).toContain("'pausing', 'paused'");
    expect(source).toMatch(
      /\.app-title-bar__controls\s+\.app-title-bar__preparation\.app-title-bar__preparation--paused/u,
    );
    expect(source).toMatch(
      /\.app-title-bar__controls\s+\.app-title-bar__preparation\.app-title-bar__preparation--attention/u,
    );
    expect(source).toContain('color: var(--ui-color-warning);');
    expect(source).toContain('color: var(--ui-color-danger);');
  });

  it('does not retain the superseded session disclosure', () => {
    expect(source).not.toContain('ListOrdered,');
    expect(source).not.toContain('sessionControls');
    expect(source).not.toContain('sessionActive');
    expect(source).not.toContain('toggleSession');
    expect(source).not.toContain('label="場次"');
  });

  it('keeps LIVE before REC and the operational control order stable', () => {
    const liveIndex = source.indexOf(
      '<span class="app-title-bar__obs-label">LIVE</span>',
    );
    const recordIndex = source.indexOf(
      '<span class="app-title-bar__obs-label">REC</span>',
    );
    const preparationIndex = source.indexOf(':icon="Download"');
    const performerIndex = source.indexOf(':icon="PictureInPicture2"');
    const themeIndex = source.indexOf(':icon="isLight ? Moon : Sun"');
    const settingsIndex = source.indexOf(':icon="Settings"');

    expect(recordIndex).toBeGreaterThan(liveIndex);
    expect(preparationIndex).toBeGreaterThan(recordIndex);
    expect(performerIndex).toBeGreaterThan(preparationIndex);
    expect(themeIndex).toBeGreaterThan(performerIndex);
    expect(settingsIndex).toBeGreaterThan(themeIndex);
  });

  it('exposes Performer and Settings as controlled toggles', () => {
    expect(source).toContain('PictureInPicture2,');
    expect(source).not.toContain('Captions,');
    expect(source).toContain("performerActive ? '關閉提詞器' : '開啟提詞器'");
    expect(source).not.toContain('提詞視窗');
    expect(source).not.toContain('MonitorUp,');
    expect(source).not.toContain('表演者畫面');
    expect(source).not.toContain('usePerformerSelfView');
    expect(source).toContain(
      'performerActive: { type: Boolean, default: false }',
    );
    expect(source).toContain(
      'performerBusy: { type: Boolean, default: false }',
    );
    expect(source).toContain(':active="performerActive"');
    expect(source).toContain(':aria-pressed="performerActive"');
    expect(source).toContain(':disabled="performerBusy"');
    expect(source).toContain('@click="emit(\'togglePerformer\')"');
    expect(source).toContain(':active="settingsActive"');
    expect(source).toContain(
      ':aria-current="settingsActive ? \'page\' : undefined"',
    );
  });

  it('exposes Settings as a current-page destination with the update marker attached', () => {
    expect(source).toContain('Settings,');
    expect(source).toContain(
      'settingsActive: { type: Boolean, default: false }',
    );
    expect(source).toContain(
      'updateAvailable: { type: Boolean, default: false }',
    );
    expect(source).toContain("'toggleSettings'");
    expect(source).toContain(':active="settingsActive"');
    expect(source).toContain(
      ':aria-current="settingsActive ? \'page\' : undefined"',
    );
    expect(source).toContain('data-app-settings-trigger');
    expect(source).toContain('@click="emit(\'toggleSettings\')"');
    expect(source).toContain('v-if="updateAvailable"');
    expect(source).toContain('class="app-title-bar__settings-marker"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('設定（有可用更新）');
    const settingsTriggerStart = source.indexOf('data-app-settings-trigger');
    const settingsTriggerEnd = source.indexOf('/>', settingsTriggerStart);
    expect(
      source.slice(settingsTriggerStart, settingsTriggerEnd),
    ).not.toContain('aria-expanded');
    expect(
      source.slice(settingsTriggerStart, settingsTriggerEnd),
    ).not.toContain('aria-pressed');
  });

  it('sources CPU/RAM from useAppUsage and has no GPU field', () => {
    expect(source).toContain(
      "import { useAppUsage } from '../../composables/useAppUsage.js'",
    );
    expect(source).toContain('formatResourcePercent(appUsageState.cpuPercent)');
    expect(source).toContain('formatResourcePercent(appUsageState.ramPercent)');
    expect(source).toContain('value.toFixed(1)');
    expect(source).not.toContain('gpuPercent');
    expect(source).not.toContain('<Gpu');
  });

  it('colors CPU/RAM values against app-scoped (not whole-machine) thresholds', () => {
    expect(source).toContain('CPU_WARNING_PERCENT = 25');
    expect(source).toContain('CPU_DANGER_PERCENT = 50');
    expect(source).toContain('RAM_WARNING_PERCENT = 8');
    expect(source).toContain('RAM_DANGER_PERCENT = 16');
    expect(source).toMatch(
      /resourceToneClass\(\s*appUsageState\.cpuPercent,\s*CPU_WARNING_PERCENT,\s*CPU_DANGER_PERCENT,/,
    );
    expect(source).toMatch(
      /resourceToneClass\(\s*appUsageState\.ramPercent,\s*RAM_WARNING_PERCENT,\s*RAM_DANGER_PERCENT,/,
    );
    expect(source).toContain(
      '.app-title-bar__resource-value--warning {\n  color: var(--ui-color-warning);',
    );
    expect(source).toContain(
      '.app-title-bar__resource-value--danger {\n  color: var(--ui-color-danger);',
    );
  });

  it('shows the OBS badge group once connected, independent of streaming／recording state', () => {
    expect(source).toContain(
      "import { useObsIntegration } from '../../composables/useObsIntegration.js'",
    );
    expect(source).toContain(
      "['ready', 'degraded'].includes(obsState.observed.lifecycle)",
    );
    expect(source).toContain(
      'isObsConnected.value && obsState.observed.streaming.active',
    );
    expect(source).toContain(
      'isObsConnected.value && obsState.observed.recording.active',
    );
    // Gated on connection only — LIVE／REC badges stay mounted (gray at
    // rest) rather than popping in/out with streaming／recording state.
    expect(source).toContain('v-if="isObsConnected"');
    expect(source).not.toContain('v-if="isObsLive"');
    expect(source).not.toContain('v-if="isObsRecording"');
  });

  it('extrapolates a local elapsed clock instead of polling OBS for it', () => {
    expect(source).toContain(
      "import { useElapsedClock } from '../../composables/useElapsedClock.js'",
    );
    expect(source).toContain(
      "import { formatElapsedClock } from '../../utils/format.js'",
    );
    expect(source).toContain(
      'isObsLive.value ? obsState.observed.streaming.durationMs : null',
    );
    expect(source).toContain(
      'isObsRecording.value ? obsState.observed.recording.durationMs : null',
    );
    // useElapsedClock (a composable with lifecycle hooks) is called once at
    // setup, never re-invoked from inside a computed getter.
    expect(source).not.toMatch(
      /computed\(\(\) =>\s*(?:formatElapsedClock\()?\s*useElapsedClock\(/,
    );
  });

  it('falls back to a resting 00:00:00 instead of a blank time while inactive', () => {
    expect(source).toContain(
      "formatElapsedClock(liveElapsedMs.value) || '00:00:00'",
    );
    expect(source).toContain(
      "formatElapsedClock(recordElapsedMs.value) || '00:00:00'",
    );
  });

  it('orders each badge dot → LIVE／REC label → time, right-anchored before the two buttons', () => {
    expect(source).toContain('class="app-title-bar__trailing"');
    const trailingIndex = source.indexOf('class="app-title-bar__trailing"');
    const obsIndex = source.indexOf('class="app-title-bar__obs"');
    const controlsIndex = source.indexOf('class="app-title-bar__controls"');
    expect(obsIndex).toBeGreaterThan(trailingIndex);
    expect(controlsIndex).toBeGreaterThan(obsIndex);

    const dotIndex = source.indexOf('app-title-bar__obs-dot');
    const labelIndex = source.indexOf('app-title-bar__obs-label');
    const timeIndex = source.indexOf('app-title-bar__obs-time');
    expect(labelIndex).toBeGreaterThan(dotIndex);
    expect(timeIndex).toBeGreaterThan(labelIndex);
  });

  it('fixes dot／label／time widths so ticking digits and label length never shift neighboring content', () => {
    expect(source).toContain(
      '.app-title-bar__obs-time {\n  /* Fixed width, right-aligned',
    );
    expect(source).toContain('width: 8ch; /* "00:00:00" */');
    expect(source).toContain(
      '.app-title-bar__obs-label {\n  /* Fixed width covers both "LIVE" and "REC"',
    );
    expect(source).toContain('width: 2.25rem;');
  });

  it('centers the LIVE／REC label text within its fixed-width box', () => {
    const obsLabelBlock = source.slice(
      source.indexOf('.app-title-bar__obs-label {'),
      source.indexOf('}', source.indexOf('.app-title-bar__obs-label {')) + 1,
    );
    expect(obsLabelBlock).toContain('text-align: center;');
  });

  it('right-aligns the numeric time like CPU/RAM, and rests gray (text-muted), never opacity-only', () => {
    const obsTimeBlock = source.slice(
      source.indexOf('.app-title-bar__obs-time {'),
      source.indexOf('}', source.indexOf('.app-title-bar__obs-time {')) + 1,
    );
    expect(obsTimeBlock).toContain('display: inline-block;');
    expect(obsTimeBlock).toContain('text-align: right;');
    expect(obsTimeBlock).toContain('color: var(--ui-color-text-muted);');

    expect(source).toContain(
      '.app-title-bar__obs-dot {\n  flex-shrink: 0;\n  width: var(--ui-status-dot-size);\n  height: var(--ui-status-dot-size);\n  border-radius: var(--ui-radius-pill);\n  background: var(--ui-color-text-muted);\n}',
    );
  });

  it("goes red (danger) for both LIVE and REC once active — the owner's explicit call, documented as a deliberate DESIGN.md departure", () => {
    expect(source).toContain(
      '.app-title-bar__obs-badge--live .app-title-bar__obs-time,\n.app-title-bar__obs-badge--live .app-title-bar__obs-label,\n.app-title-bar__obs-badge--rec .app-title-bar__obs-time,\n.app-title-bar__obs-badge--rec .app-title-bar__obs-label {\n  color: var(--ui-color-danger);\n}',
    );
    expect(source).toContain(
      '.app-title-bar__obs-badge--live .app-title-bar__obs-dot,\n.app-title-bar__obs-badge--rec .app-title-bar__obs-dot {\n  background: var(--ui-color-danger);\n}',
    );
    expect(source).toContain('knowingly departs from DESIGN.md');
  });

  it('separates the two badges with a UiSeparator, not hand-rolled divider CSS', () => {
    expect(source).toContain("import UiSeparator from '../ui/UiSeparator.vue'");
    expect(source).toContain('<UiSeparator orientation="vertical" />');
    const dividerIndex = source.indexOf(
      '<UiSeparator orientation="vertical" />',
    );
    const liveBadgeIndex = source.indexOf("'app-title-bar__obs-badge--live'");
    const recBadgeIndex = source.indexOf("'app-title-bar__obs-badge--rec'");
    expect(dividerIndex).toBeGreaterThan(liveBadgeIndex);
    expect(dividerIndex).toBeLessThan(recBadgeIndex);
  });
});
