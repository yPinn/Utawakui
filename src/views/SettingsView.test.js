import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SettingsView.vue', import.meta.url),
  'utf8',
);
const maintenanceSource = source.slice(
  source.indexOf('<SettingsBlock title="維護">'),
);

describe('SettingsView maintenance section', () => {
  it('orders app updates before error diagnostics', () => {
    const appUpdateIndex = maintenanceSource.indexOf('<AppUpdateSettingsRow');
    const diagnosticsIndex = maintenanceSource.indexOf(
      '<DiagnosticsSettingsBlock',
    );

    expect(appUpdateIndex).toBeGreaterThan(-1);
    expect(diagnosticsIndex).toBeGreaterThan(-1);
    expect(appUpdateIndex).toBeLessThan(diagnosticsIndex);
  });

  it('describes the destructive confirmation as clearing error records', () => {
    expect(source).toContain("window.confirm('清除這台電腦上的錯誤紀錄？')");
  });
});
