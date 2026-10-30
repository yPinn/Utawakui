import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';

const readSource = (path) => readCatalogSource(new URL(path, import.meta.url));

const settingsPageSource = readSource('../../pages/SettingsPage.vue');
const librarySource = readSource('./SettingsLibrarySection.vue');
const audioOutputSource = readSource('./AudioOutputSettingsBlock.vue');
const updateSource = readSource('./AppUpdateSettingsRow.vue');
const metadataSource = readSource('./LibraryMetadataSettingsRow.vue');
const historySource = readSource('./PlaybackHistorySettingsRow.vue');
const windowsSource = readSource('./WindowsBackgroundSettingsRow.vue');
const capabilitiesSource = readSource('./SettingsCapabilitiesSection.vue');
const outputSource = readSource('./OutputRuntimeSettingsBlock.vue');
const obsSource = readSource('./ObsIntegrationSettingsBlock.vue');
const feedbackSource = readSource('./FeedbackReportSettingsRow.vue');
const supportSource = readSource('./SettingsSupportSection.vue');

describe('Settings copy density', () => {
  it('uses compact page and section framing without repeating the visible hierarchy', () => {
    expect(settingsPageSource).toContain(
      '管理曲庫、音訊、應用程式與選用功能。',
    );
    expect(settingsPageSource).not.toContain(
      '管理曲庫、音訊、進階功能與應用程式行為。',
    );
    expect(capabilitiesSource).not.toContain(
      '使用前請閱讀各功能說明，再選擇是否啟用。',
    );
    expect(capabilitiesSource).not.toContain(
      'settings-capabilities-section__copy',
    );
    expect(capabilitiesSource).not.toContain('label="重新讀取功能狀態"');
    expect(capabilitiesSource).toContain('@action="refreshConfirmations"');
    expect(supportSource).not.toContain('announcement.summary');
  });

  it('removes row copy that only restates its title, value, or control', () => {
    expect(librarySource).not.toContain('下載與匯入的曲目會存放在這裡。');
    expect(audioOutputSource).not.toContain('將伴奏送到直播或錄影軟體。');
    expect(updateSource).not.toContain('下載與安裝由你決定。');
    expect(updateSource).toContain('可自動檢查更新；下載與安裝需手動確認。');
    expect(updateSource).not.toContain('查看目前版本與更新狀態。');
  });

  it('keeps decision-changing consequences while shortening routine guidance', () => {
    expect(librarySource).toContain('切換位置不會搬移既有曲目。');
    expect(metadataSource).toContain(
      '可從網路補齊專輯與曲序，不會覆蓋手動編輯。',
    );
    expect(metadataSource).not.toContain('value="啟動時補齊曲目與發行資訊"');
    expect(metadataSource).not.toContain('<UiHint>從來源更新會連線');
    expect(historySource).toContain('自動保存；清除不影響佇列或歌單。');
    expect(windowsSource).toContain('背景執行時，播放、OBS 與輸出會繼續。');
    expect(obsSource).toContain('讀取直播／錄影與時間標記，不變更場景。');
  });

  it('uses concise supporting copy for integrations and support actions', () => {
    expect(audioOutputSource).toContain(
      '供直播或錄影擷取；與本機聆聽分開設定。',
    );
    expect(outputSource).toContain(
      '透過直播或錄影軟體的瀏覽器來源顯示歌詞與曲目。',
    );
    expect(outputSource).toContain(
      '實驗性透明歌詞輸出，需接收軟體支援 Spout2。',
    );
    expect(feedbackSource).toContain('回報問題或提出建議。');
    expect(supportSource).toContain('公告、交流與開發者聯絡。');
  });
});
