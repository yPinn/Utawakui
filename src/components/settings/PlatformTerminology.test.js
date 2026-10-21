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
    expect(sessionExportModal).toContain('label="YouTube 章節"');
    expect(sessionExportModal).toContain('複製章節');
    expect(sessionExportModal).toContain('確認開始演出的曲目與標記會自動記錄');
    expect(sessionExportModal).not.toContain('title="匯出 YouTube 章節"');
  });

  it('keeps Browser Source and virtual audio copy destination-neutral', () => {
    expect(outputWorkspace).toContain('aria-label="輸出畫面"');
    expect(outputWorkspace).not.toContain('aria-label="OBS');
    expect(outputRuntime).toContain('再啟動 Browser Source 輸出');
    expect(outputRuntime).not.toContain('建立 OBS Browser Source');
    expect(captureDeviceModal).toContain('選擇直播或錄影軟體要擷取的輸出裝置');
    expect(captureDeviceModal).toContain('如何選擇擷取裝置');
    expect(captureDeviceModal).toContain(
      '找不到可用裝置。請先安裝虛擬音效裝置。',
    );
    expect(captureDeviceModal).not.toContain('不知道要裝哪套');
    expect(captureDeviceModal).not.toContain('讓 OBS 擷取');
    expect(virtualCableGuide).toContain('直播或錄影軟體');
    expect(virtualCableGuide).not.toContain('送給 OBS 擷取');
  });

  it('uses OBS only for the coupled connection gate, not generic public output or rights wording', () => {
    const lyrics = feature('lyrics-flow');
    const publicOutput = feature('public-output-flow');
    const obs = feature('obs-integration');

    expect(lyrics.body.join('\n')).not.toMatch(/或 OBS/);
    expect(publicOutput.summary).not.toContain('向 OBS 提供');
    expect(publicOutput.summary).toContain('演出畫面');
    expect(publicOutput.summary).not.toContain('Browser Source');
    expect(publicOutput.summary).not.toContain('OBS');
    expect(obs.title).toContain('OBS');
    expect(obs.summary).toContain('OBS');
  });
});
