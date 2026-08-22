import fs from 'fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./ObsOutputSettings.vue', import.meta.url),
  'utf8',
);

describe('ObsOutputSettings', () => {
  it('presents service state as status, not as a refresh or checkbox control', () => {
    expect(source).toContain('const serviceStatusIcon = computed');
    expect(source).toContain(':icon="serviceStatusIcon"');
    expect(source).toContain(':value="serviceStatusValue"');
    expect(source).toContain(':status="statusLabel"');
    expect(source).not.toContain(':icon="RefreshCw" title="服務狀態"');
    expect(source).not.toContain(':icon="Square"');
  });

  it('keeps Browser Source URL copying out of runtime settings', () => {
    expect(source).not.toContain('outputUrls');
    expect(source).not.toContain('slotDefinitions');
    expect(source).not.toContain('copyObsUrl');
    expect(source).not.toContain('title="OBS URL"');
  });

  it('uses a plain numeric text field for port entry', () => {
    expect(source).toContain('class="obs-output-settings__port-input"');
    expect(source).toContain('type="text"');
    expect(source).toContain('inputmode="numeric"');
    expect(source).toContain('pattern="[0-9]*"');
    expect(source).toContain('@change="commitSettings()"');
    expect(source).toContain('@keydown.enter.prevent="commitSettings()"');
    expect(source).toContain(':aria-invalid="!isPortValid"');
    expect(source).toContain('width: var(--ui-output-port-input-width)');
    expect(source).toContain('font-variant-numeric: tabular-nums');
    expect(source).toContain('text-align: right');
    expect(source).not.toContain('type="number"');
    expect(source).not.toContain('step="1"');
  });

  it('keeps start and stop as explicit commands', () => {
    expect(source).toContain(':icon="Play"');
    expect(source).toContain(':icon="Power"');
    expect(source).toContain('class="obs-output-settings__command"');
    expect(source).toContain(
      'min-width: var(--ui-output-settings-command-button-width)',
    );
    expect(source).toContain('@click="emit(\'start\')"');
    expect(source).toContain('@click="emit(\'stop\')"');
  });

  it('edits display compensation as a distinct signed millisecond setting', () => {
    expect(source).toContain('title="顯示同步補償"');
    expect(source).toContain('id="output-display-delay"');
    expect(source).toContain('pattern="-?[0-9]*"');
    expect(source).toContain('OUTPUT_RUNTIME_VALUES.minDisplayDelayMs');
    expect(source).toContain('OUTPUT_RUNTIME_VALUES.maxDisplayDelayMs');
    expect(source).toContain('displayDelayMs');
    expect(source).toContain('毫秒');
  });

  it('commits setting controls on change without a block-level save button', () => {
    expect(source).toContain('function commitSettings(overrides = {})');
    expect(source).toContain('@change="commitSettings()"');
    expect(source).toContain('commitSettings({ port })');
    expect(source).not.toContain(':icon="Check"');
    expect(source).not.toContain('> 儲存');
  });

  it('orders rows by service workflow before playback calibration', () => {
    const serviceIndex = source.indexOf('title="服務狀態"');
    const startupIndex = source.indexOf('title="啟動方式"');
    const portIndex = source.indexOf('title="本機 Port"');
    const delayIndex = source.indexOf('title="顯示同步補償"');

    expect(serviceIndex).toBeGreaterThan(-1);
    expect(serviceIndex).toBeLessThan(startupIndex);
    expect(startupIndex).toBeLessThan(portIndex);
    expect(portIndex).toBeLessThan(delayIndex);
  });
});
