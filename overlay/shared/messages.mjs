// Output text follows the Output language, not the control panel's UI
// language. Template headings (SETLIST, NOW PLAYING) are design and stay.
export const OVERLAY_MESSAGES = Object.freeze({
  'zh-TW': Object.freeze({
    currentEmpty: '目前無演唱曲目',
    currentLabel: '目前演唱曲目',
    setlistLabel: '歌單',
    historyCaption: '已唱紀錄',
    historyEmpty: '尚無已唱歌曲',
    waitingNext: '等待下一首',
    lineUnfit: '目前尺寸無法完整顯示此句，請放大來源範圍或調整字級。',
  }),
  'en-US': Object.freeze({
    currentEmpty: 'No song playing',
    currentLabel: 'Now singing',
    setlistLabel: 'Setlist',
    historyCaption: 'Sung so far',
    historyEmpty: 'No songs sung yet',
    waitingNext: 'Waiting for the next song',
    lineUnfit:
      "This line doesn't fit at the current size. Enlarge the source area or adjust the font size.",
  }),
});

const FALLBACK_LANGUAGE = 'zh-TW';
let currentLanguage = FALLBACK_LANGUAGE;

export function overlayText(key) {
  return (
    OVERLAY_MESSAGES[currentLanguage][key] ??
    OVERLAY_MESSAGES[FALLBACK_LANGUAGE][key] ??
    ''
  );
}

// Fills [data-ovl-text] content and [data-ovl-label] aria-labels.
export function setOverlayLanguage(document, language) {
  currentLanguage = Object.hasOwn(OVERLAY_MESSAGES, language)
    ? language
    : FALLBACK_LANGUAGE;
  for (const element of document?.querySelectorAll?.('[data-ovl-text]') ?? []) {
    element.textContent = overlayText(element.dataset.ovlText);
  }
  for (const element of document?.querySelectorAll?.('[data-ovl-label]') ??
    []) {
    element.setAttribute('aria-label', overlayText(element.dataset.ovlLabel));
  }
  return currentLanguage;
}
