import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

describe('Windows tray main-process composition', () => {
  it('creates the controller from persisted close behavior and attaches each main window', () => {
    expect(source).toContain('createWindowCloseDecisionBridge');
    expect(source).toContain('createWindowsTrayController');
    expect(source).toContain('Tray,');
    expect(source).toContain('iconPath: windowState.getAppIconPath()');
    expect(source).toContain(
      'initialBehavior: configState.getConfig().windowCloseBehavior,',
    );
    expect(source).toContain(
      'windowsTrayController?.attachWindow(mainWindow);',
    );
    expect(source).toContain(
      'windowCloseDecisionBridge.requestDecision(mainWindow)',
    );
  });

  it('restores a hidden window for a second launch and applies live behavior changes', () => {
    expect(source).toContain('windowsTrayController?.showWindow()');
    expect(source).toContain('applyWindowCloseBehavior: (behavior) =>');
    expect(source).toContain(
      'windowsTrayController.setCloseBehavior(behavior)',
    );
  });

  it('marks update installation as a real quit before electron-updater closes windows', () => {
    expect(source).toContain(
      'beforeInstall: () => windowsTrayController.beginQuit()',
    );
  });
});
