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

  it('sources CPU/RAM from useSystemUsage and has no GPU field', () => {
    expect(source).toContain(
      "import { useSystemUsage } from '../../composables/useSystemUsage.js'",
    );
    expect(source).toContain(
      'formatResourcePercent(systemUsageState.cpuPercent)',
    );
    expect(source).toContain(
      'formatResourcePercent(systemUsageState.ramPercent)',
    );
    expect(source).not.toContain('gpuPercent');
    expect(source).not.toContain('<Gpu');
  });

  it('colors CPU/RAM values by threshold, well below "system is unusable"', () => {
    expect(source).toContain('RESOURCE_WARNING_PERCENT = 60');
    expect(source).toContain('RESOURCE_DANGER_PERCENT = 80');
    expect(source).toContain('resourceToneClass(systemUsageState.cpuPercent)');
    expect(source).toContain('resourceToneClass(systemUsageState.ramPercent)');
    expect(source).toContain(
      '.app-title-bar__resource-value--warning {\n  color: var(--ui-color-warning);',
    );
    expect(source).toContain(
      '.app-title-bar__resource-value--danger {\n  color: var(--ui-color-danger);',
    );
  });
});
