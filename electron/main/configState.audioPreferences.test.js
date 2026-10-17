import fs from 'node:fs';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalModuleLoad = Module._load;

describe('configState audio-preference initialization', () => {
  let userDataDir;

  beforeEach(() => {
    vi.resetModules();
    userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-config-state-audio-'),
    );
  });

  afterEach(() => {
    Module._load = originalModuleLoad;
    fs.rmSync(userDataDir, { recursive: true, force: true });
    vi.resetModules();
  });

  async function loadConfigState() {
    Module._load = function load(request, parent, isMain) {
      if (request === 'electron') {
        return {
          app: {
            getPath: vi.fn((name) =>
              name === 'userData' ? userDataDir : path.join(userDataDir, name),
            ),
          },
        };
      }
      if (request === './libraryPathSidecar') {
        return { writeLibraryPathSidecar: vi.fn(() => true) };
      }
      return originalModuleLoad.call(this, request, parent, isMain);
    };
    try {
      const imported = await import('./configState.js');
      return imported.default ?? imported;
    } finally {
      Module._load = originalModuleLoad;
    }
  }

  it('migrates legacy resume volume only when config has no stored preferences', async () => {
    const configState = await loadConfigState();
    configState.loadInitialConfig();

    expect(
      configState.initializeAudioPreferences({
        performanceVolume: 0.72,
        performanceMuted: true,
      }),
    ).toEqual({
      performanceVolume: 0.72,
      performanceMuted: true,
      monitorGuideVocalLevel: 0.5,
      captureGuideVocalLevel: 0,
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(userDataDir, 'config.json'), 'utf8'))
        .audioPreferences,
    ).toEqual(configState.getConfig().audioPreferences);
  });

  it('keeps explicit config preferences ahead of a stale legacy snapshot', async () => {
    const explicitPreferences = {
      performanceVolume: 0.2,
      performanceMuted: false,
      monitorGuideVocalLevel: 0.3,
      captureGuideVocalLevel: 0.1,
    };
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      JSON.stringify({ audioPreferences: explicitPreferences }),
    );
    const configState = await loadConfigState();
    configState.loadInitialConfig();

    expect(
      configState.initializeAudioPreferences({
        performanceVolume: 0.9,
        performanceMuted: true,
      }),
    ).toEqual(explicitPreferences);
  });

  it('reads initial settings and audio preference provenance from one snapshot', async () => {
    const configPath = path.join(userDataDir, 'config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ uiTheme: 'dark', audioPreferences: null }),
    );
    const configState = await loadConfigState();
    const read = vi.spyOn(fs, 'readFileSync');
    try {
      configState.loadInitialConfig();
      expect(
        read.mock.calls.filter(([file]) => String(file) === configPath),
      ).toHaveLength(1);
      expect(configState.getConfig().uiTheme).toBe('dark');
      // Presence is a migration decision; an invalid stored value still must
      // not let stale transport settings overwrite the normalized defaults.
      expect(
        configState.initializeAudioPreferences({ performanceVolume: 0.9 })
          .performanceVolume,
      ).toBe(0.5);
    } finally {
      read.mockRestore();
    }
  });
});
