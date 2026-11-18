/* global document, FontFace, window */

import gsap from 'gsap';
import {
  clearCutoutDialogue,
  renderCutoutDialogue,
} from '../../overlay/lyrics/cutoutDialogue.mjs';
import '../../overlay/lyrics/cutoutDialogue.css';
import './preview.css';

const samples = {
  ja: [
    'ja',
    '星野あかり',
    'まだ間に合う、Turn it up and sing with me、夜が明けるまで声を響かせて',
  ],
  tc: [
    'zh-TW',
    '張小星',
    '穿過漆黑夜色，把沒唱完的歌繼續唱給你聽，Stay with me until the morning comes',
  ],
  sc: ['zh-Hans', '林小语', '穿过夜色，把没唱完的歌继续唱给你听。'],
  en: [
    'en',
    'Aster',
    'Stay with me until the morning comes.\nWe still have a song to sing.',
  ],
  ko: ['ko', '별빛', '밤이 밝아 올 때까지\nStay with me, 함께 노래해.'],
  ar: ['ar', 'أمل', 'لنغنِّ معًا حتى يطلع الفجر.'],
  short: ['ja', '星野あかり', '夜を越えて、もう一度。'],
  compact: ['ja', '星野あかり', '笑って 手を振った。'],
  nameplate: ['en', '9Lana feat. Aster', 'I'],
  paragraph: [
    'zh-TW',
    '張小星',
    '當城市慢慢安靜下來，\n我們把沒唱完的旋律接著唱。 Keep singing with me until the morning comes.',
  ],
  phraseWrap: [
    'zh-TW',
    '李浩瑋',
    '最深的黑夜 是否難以入眠 輾轉來到 某個起點 又想起了明天',
  ],
};

const sample = document.querySelector('#sample');
const backdrop = document.querySelector('#backdrop');
const dialogueCorner = document.querySelector('#dialogue-corner');
const dialogueHide = document.querySelector('#dialogue-hide');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let dialogueVisible = true;
const baseline = document.querySelector('section .cutout-dialogue');
const loadedFonts = new Map();
const fontPreviews = [
  { stage: baseline, font: 'none' },
  ...[...document.querySelectorAll('[data-font]')].map((section) => ({
    stage: section.querySelector('.cutout-dialogue'),
    font: section.dataset.font,
  })),
];
const layoutPreviews = [...document.querySelectorAll('[data-layout]')].map(
  (section) => ({
    stage: section.querySelector('.cutout-dialogue'),
    layout: section.dataset.layout,
  }),
);

function renderSamples(replay = false) {
  const [language, artist, currentText] = samples[sample.value];
  for (const { stage, font } of fontPreviews) {
    renderCutoutDialogue(
      stage,
      { visible: true, currentText, lineIndex: 0 },
      {
        appearance: { cutoutMode: 'ransom', cutoutRansomFont: font },
        reducedMotion: true,
      },
    );
  }
  for (const { stage, layout } of layoutPreviews) {
    const cutoutMode =
      { phone: 'chat', radial: 'radial', 'choice-stack': 'choice-stack' }[
        layout
      ] ?? 'side-card';
    const sideCard = cutoutMode === 'side-card';
    const animate = sideCard && replay && !reducedMotion.matches;
    if (animate) clearCutoutDialogue(stage);
    renderCutoutDialogue(
      stage,
      {
        visible: !sideCard || dialogueVisible,
        currentText,
        nextText: '次の声が聞こえる。',
        language,
        lineIndex: 0,
        cutoutDialogue: {
          artist,
          previousText: '声を重ねて、ここから。',
          ageMs: 0,
          playing: animate,
          rate: 1,
        },
      },
      {
        appearance: {
          cutoutMode,
          cutoutChatShape: 'phone',
          cutoutCardStyle: layout,
          cutoutCorner: sideCard ? dialogueCorner.value : 'auto',
        },
        gsap,
        reducedMotion: !animate,
      },
    );
  }
}

sample.addEventListener('change', () => renderSamples());
dialogueCorner.addEventListener('change', () => renderSamples());
reducedMotion.addEventListener('change', () => renderSamples());
document.querySelector('#dialogue-replay').addEventListener('click', () => {
  dialogueVisible = true;
  dialogueHide.disabled = false;
  renderSamples(true);
});
dialogueHide.addEventListener('click', () => {
  dialogueVisible = false;
  dialogueHide.disabled = true;
  renderSamples();
});
function updateBackdrop() {
  document.querySelector('.font-comparison').dataset.backdrop = backdrop.value;
}
backdrop.addEventListener('change', updateBackdrop);
updateBackdrop();
for (const section of document.querySelectorAll('[data-font]')) {
  const input = section.querySelector('input[type="file"]');
  const ink = section.querySelector('[data-ink]');
  const stage = section.querySelector('.cutout-dialogue');
  const status = section.querySelector('[data-status]');
  ink.addEventListener('input', () => {
    stage.style.setProperty('--ransom-accent-ink', ink.value);
  });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const family = `ransom-${section.dataset.font}`;
    input.disabled = true;
    try {
      const face = await new FontFace(family, await file.arrayBuffer()).load();
      if (loadedFonts.has(stage)) document.fonts.delete(loadedFonts.get(stage));
      document.fonts.add(face);
      loadedFonts.set(stage, face);
      stage.style.setProperty('--ransom-accent-font', `"${family}"`);
      status.textContent = file.name;
      clearCutoutDialogue(stage);
      renderSamples();
    } catch {
      status.textContent = '無法載入這個字型檔。';
    } finally {
      input.disabled = false;
      input.value = '';
    }
  });
}
renderSamples();
