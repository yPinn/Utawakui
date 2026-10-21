import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
describe('output capture composition', () => {
  it('cleans windows before stopping the service and keeps Tray hiding separate', () => {
    const main = read('../main.js');
    expect(main).toMatch(
      /beforeStop: async \(\) => \{\s*outputWindowManager\?\.closeAll\(\);\s*await spoutOutputRuntimeController\?\.stop\(\);/,
    );
    expect(main).toContain('outputWindowManager?.attachMainWindow(mainWindow)');
    expect(main).toContain(
      'onOverlaySlotsChange: () => outputWindowManager?.syncSlots()',
    );
    expect(main).toContain('registerOutputWindowHandlers({');
  });
  it('exposes only a kind intent in the main preload and keeps the Output entry out of Vite', () => {
    const preload = read('../preload.js');
    expect(preload).toContain(
      "openOutputWindow: (kind) => ipcRenderer.invoke('output-window:open', kind)",
    );
    expect(read('../performerPreload.js')).not.toContain('output-window:open');
    expect(
      JSON.parse(read('../../shared/rendererEntries.json')),
    ).not.toHaveProperty('output');
    const ui = read('../../src/components/output/ObsOutputWorkspace.vue');
    expect(ui).toContain('label="開啟輸出視窗"');
    expect(ui).toContain(
      ':disabled="!outputState.status.running || runtimeBusy"',
    );
    expect(ui).toMatch(
      /async function openCaptureWindow\(\) \{[\s\S]*?await appearanceAutosave.flush\(\)[\s\S]*?return openWindow\(kind\);/,
    );
  });
});
