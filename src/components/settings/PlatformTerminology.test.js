import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import gateRegistry from '../../../shared/featureGates.json';

function read(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

const sessionExportModal = read('./ObsSessionExportModal.vue');
const captureDeviceModal = read('./CaptureDeviceModal.vue');
const virtualCableGuide = read('./VirtualCableGuideModal.vue');
const outputWorkspace = read('../output/ObsOutputWorkspace.vue');
const outputRuntime = read('../../composables/useOutputRuntime.js');

function feature(id) {
  return gateRegistry.features.find((entry) => entry.id === id);
}

describe('platform terminology', () => {
  it('treats YouTube chapters as one format of the generic session timeline', () => {
    expect(sessionExportModal).toContain('title="匯出場次時間軸"');
    expect(sessionExportModal).toContain('label="YouTube 章節文字"');
    expect(sessionExportModal).toContain('複製章節文字');
    expect(sessionExportModal).toContain('曲目切換與手動標記才會記錄時間戳');
    expect(sessionExportModal).not.toContain('title="匯出 YouTube 章節"');
  });

  it('keeps Browser Source and virtual audio copy destination-neutral', () => {
    expect(outputWorkspace).toContain('aria-label="輸出頁面"');
    expect(outputWorkspace).not.toContain('aria-label="OBS 輸出頁面"');
    expect(outputRuntime).toContain('再啟動 Browser Source 輸出');
    expect(outputRuntime).not.toContain('建立 OBS Browser Source');
    expect(captureDeviceModal).toContain(
      '選擇要送到直播或錄影軟體的虛擬音效裝置',
    );
    expect(captureDeviceModal).toContain('如何選擇虛擬音效裝置？');
    expect(captureDeviceModal).toContain(
      '找不到輸出裝置。請先安裝虛擬音效裝置。',
    );
    expect(captureDeviceModal).not.toContain('不知道要裝哪套');
    expect(captureDeviceModal).not.toContain('讓 OBS 擷取');
    expect(virtualCableGuide).toContain('直播或錄影軟體擷取');
    expect(virtualCableGuide).not.toContain('送給 OBS 擷取');
  });

  it('uses OBS only for the coupled connection gate, not generic public output or rights wording', () => {
    const lyrics = feature('lyrics-flow');
    const publicOutput = feature('public-output-flow');
    const obs = feature('obs-integration');

    expect(lyrics.body.join('\n')).not.toMatch(/或 OBS/);
    expect(publicOutput.summary).not.toContain('向 OBS 提供');
    expect(publicOutput.summary).toContain('本機 Browser Source');
    expect(obs.title).toContain('OBS');
    expect(obs.summary).toContain('OBS WebSocket');
  });
});
