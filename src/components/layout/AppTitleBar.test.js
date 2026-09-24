import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./AppTitleBar.vue', import.meta.url),
  'utf8',
);

describe('AppTitleBar', () => {
  it('separates performer and theme actions with the shared control gap', () => {
    expect(source).toContain('gap: var(--ui-space-2)');
    expect(source).toContain('padding-right: var(--ui-space-2)');
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
});
