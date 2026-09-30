import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./AppTitleBar.vue', import.meta.url),
  'utf8',
);

describe('AppTitleBar', () => {
  it('separates global utility actions with the shared control gap', () => {
    expect(source).toContain('gap: var(--ui-space-2)');
    expect(source).toContain('padding-right: var(--ui-space-2)');
  });

  it('exposes Settings as a current-page destination with the update marker attached', () => {
    expect(source).toContain('Settings,');
    expect(source).toContain(
      'settingsActive: { type: Boolean, default: false }',
    );
    expect(source).toContain(
      'updateAvailable: { type: Boolean, default: false }',
    );
    expect(source).toContain("const emit = defineEmits(['openSettings'])");
    expect(source).toContain(':active="settingsActive"');
    expect(source).toContain(
      ':aria-current="settingsActive ? \'page\' : undefined"',
    );
    expect(source).toContain('data-app-settings-trigger');
    expect(source).toContain('@click="emit(\'openSettings\')"');
    expect(source).toContain('v-if="updateAvailable"');
    expect(source).toContain('class="app-title-bar__settings-marker"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('設定（有可用更新）');
    expect(source).not.toContain('aria-pressed');
    expect(source).not.toContain('aria-expanded');
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
      '.app-title-bar__obs-dot {\n  flex-shrink: 0;\n  width: var(--ui-space-2);\n  height: var(--ui-space-2);\n  border-radius: var(--ui-radius-pill);\n  background: var(--ui-color-text-muted);\n}',
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
