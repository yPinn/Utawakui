import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./ObsSpoutOutputSettings.vue', import.meta.url),
  'utf8',
);

describe('ObsSpoutOutputSettings', () => {
  it('keeps the Spout2 sender explicit, concise, and receiver-neutral', () => {
    expect(source).toContain('title="Spout2 輸出"');
    expect(source).toContain('Utawakui.Lyrics');
    expect(source).toContain('width: 1920');
    expect(source).toContain('height: 1080');
    expect(source).toContain(
      '`${surface.value.width} × ${surface.value.height} · Premultiplied Alpha`',
    );
    expect(source).toContain('Premultiplied Alpha');
    expect(source).toContain('實驗性');
    expect(source).toContain('啟動輸出');
    expect(source).toContain('停止輸出');
    expect(source).not.toContain('Shoost');
    expect(source).not.toContain('OBS');
  });

  it('uses bounded frame-rate buttons and explicit lifecycle commands', () => {
    expect(source).toContain('title="幀率"');
    expect(source).toContain('30 FPS');
    expect(source).toContain('60 FPS');
    expect(source).toContain(':active="frameRateProfile === \'reduced\'"');
    expect(source).toContain(':active="frameRateProfile === \'standard\'"');
    expect(source).toContain("emit('set-frame-rate-profile', 'reduced')");
    expect(source).toContain("emit('set-frame-rate-profile', 'standard')");
    expect(source).toContain("emit('start')");
    expect(source).toContain("emit('stop')");
    expect(source).not.toContain('<input');
    expect(source).not.toContain('outputUrl');
    expect(source).not.toContain('executablePath');
  });
});
