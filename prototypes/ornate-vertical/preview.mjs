import gsap from 'gsap';
import {
  clearOrnateVerticalPresentation,
  renderOrnateVerticalPresentation,
} from '../../overlay/lyrics/ornateVertical.mjs';
import { applyOverlayAppearance } from '../../overlay/shared/appearance.mjs';
import { projectLyricsDisplayFrame } from '../../shared/presentation/lyricsDisplayFrame.mjs';
import {
  ORNATE_VERTICAL_ENTER_DURATION_SECONDS,
  ornateVerticalRevealDelaySeconds,
} from '../../shared/presentation/ornateVerticalMotion.mjs';
import {
  adaptOrnateVerticalLyricsPresentation,
  createOrnateVerticalDocumentContext,
  ornateVerticalGlyphGapEm,
} from '../../shared/presentation/ornateVerticalPresentation.mjs';
import { sampleGraphemes } from './typography.mjs';

const samples = {
  short: { text: '窓辺の灯が揺れる', focus: '灯', lang: 'ja' },
  long: {
    text: '窓の向こうで小さな灯が揺れて、夜明けまで帰り道を照らす',
    focus: '灯',
    lang: 'ja',
  },
  mixed: {
    text: '夜の灯をたどって、Midnight Echo と 별빛 在風裡相遇',
    focus: '灯',
    lang: 'ja',
  },
  zh: {
    text: '長街的燈在雨裡輕晃，照見一路的回聲',
    focus: '燈',
    lang: 'zh-Hant',
  },
};
const documentContext = createOrnateVerticalDocumentContext(
  Object.values(samples).map(({ text }) => text),
);
const motionSample = {
  text: '夜が明けるまで、帰り道を照らす灯',
  lang: 'ja',
};
const motionCaptions = {
  a: ['逐字淡入', '完整字形逐字出現，漢字陰影向右滑出'],
  b: ['整字拉長', '「灯」的整個字面向下延展'],
  c: ['單筆延伸', '「灯」的右側豎鉤向下延伸'],
};
const phraseSample = {
  text: 'きらめく星を見送ったって空は巡る',
  lang: 'ja',
  startMs: 0,
  endMs: 4200,
};
const punctuatedSample = {
  ...phraseSample,
  text: '星が瞬く、「ここだよ？」空が光る。',
};
const phraseCaptions = {
  a: ['保留前欄', '續欄到點後在左側加入'],
  b: ['一次一欄', '新欄出現時，前一欄會消失'],
  c: ['重點漢字先入', '先顯示重點漢字，其餘字依序出現'],
};
const entranceVariants = {
  a: ['sequential', '逐字淡入', '文字依閱讀順序出現'],
  b: ['focus-first', '重點漢字先入', '先顯示重點漢字，其餘字依序出現'],
  c: ['random-slide', '左右滑入', '文字從左右不同位置滑回字位'],
};
const document = globalThis.document;
const stageCss = document.querySelector('#overlay-style').textContent;
const cards = document.querySelector('.cards');
const comparison = document.querySelector('#comparison');
const comparisonNote = document.querySelector('#comparison-note');
const sampleSelect = document.querySelector('#sample');
const backdrop = document.querySelector('#backdrop');
const spacing = document.querySelector('#spacing');
const compare = document.querySelector('#compare');
const replay = document.querySelector('#replay');
const sampleText = document.querySelector('#sample-text');
const motionPreference = globalThis.matchMedia(
  '(prefers-reduced-motion: reduce)',
);
const stageVariants = `
  body {
    background: radial-gradient(ellipse at 29% 84%, #584753 0%, transparent 57%),
      linear-gradient(148deg, #292e43, #191625 60%, #242031);
  }
  [data-sample-backdrop='dark'] body { background: #121218; }
  [data-sample-backdrop='light'] body { background: #e7ddd1; }
  :root[data-variant='b'] .lyrics-overlay__ornate-unit[data-ornate-kind='han'],
  :root[data-variant='c'] .lyrics-overlay__ornate-unit[data-ornate-kind='han'] {
    --sample-font-ratio: 1.25;
    font-size: calc(var(--sample-font-ratio) * 1em);
  }
  :root[data-variant='b'] .lyrics-overlay__ornate-unit[data-ornate-kind='kana'],
  :root[data-variant='c'] .lyrics-overlay__ornate-unit[data-ornate-kind='kana'] {
    --sample-font-ratio: .8;
    font-size: calc(var(--sample-font-ratio) * 1em);
  }
  .focus-glyph {
    display: inline-block;
    transform: scaleY(1.18);
    transform-origin: center top;
    margin-inline-end: .18em;
  }
  .motion-stretch-glyph {
    display: inline-block;
    transform-origin: center top;
  }
  .lyrics-overlay__ornate-unit[data-echo-split]::before {
    content: none;
  }
  .sample-glyph[data-echo] {
    position: relative;
    isolation: isolate;
  }
  .sample-glyph[data-echo]::before {
    position: absolute;
    z-index: -1;
    inset: 0;
    content: attr(data-echo);
    color: var(--ovl-user-accent-color);
    opacity: .18;
    text-shadow: none;
    transform: translate(.055em, .035em);
  }
`;
const stageMarkup = `<!doctype html>
<html lang="ja"><meta charset="utf-8">
<style>${stageCss}\n${stageVariants}</style>
<body><main class="lyrics-overlay">
  <p class="lyrics-overlay__current"></p>
  <p class="lyrics-overlay__next" hidden></p>
</main></body></html>`;

function applySampleTypography(current, { focusedGlyph, spaced }) {
  const stage = current.ownerDocument;
  let focusPending = Boolean(focusedGlyph);

  for (const column of current.querySelectorAll(
    '.lyrics-overlay__ornate-segment',
  )) {
    const units = Array.from(column.children, (element) => ({
      element,
      glyphs: sampleGraphemes(element.textContent),
    }));
    const columnGlyphs = units.flatMap(({ glyphs }) => glyphs);
    let position = 0;

    for (const { element, glyphs } of units) {
      const positions = glyphs.map((glyph) => {
        const gap = spaced
          ? ornateVerticalGlyphGapEm(glyph, columnGlyphs[position + 1])
          : 0;
        position += 1;
        const focused =
          focusPending &&
          glyph === focusedGlyph &&
          element.dataset.ornateKind === 'han';
        if (focused) focusPending = false;
        return { glyph, gap, focused };
      });
      if (!positions.some(({ gap, focused }) => gap || focused)) {
        if (element.hasAttribute('data-sample-glyphs')) {
          element.textContent = glyphs.join('');
          delete element.dataset.sampleGlyphs;
          delete element.dataset.echoSplit;
        }
        continue;
      }

      const echo = element.dataset.ornateEmphasis === 'keyword';
      const nodes = positions.map(({ glyph, gap, focused }) => {
        if (!focused && !gap && !echo) return glyph;

        const box = stage.createElement('span');
        const ink = stage.createElement('span');
        ink.className = focused ? 'sample-glyph focus-glyph' : 'sample-glyph';
        ink.textContent = glyph;
        if (echo) ink.dataset.echo = glyph;
        if (gap) {
          box.style.marginInlineEnd = `calc(${gap}em / var(--sample-font-ratio, 1))`;
        }
        box.append(ink);
        return box;
      });
      element.dataset.sampleGlyphs = '';
      if (echo) element.dataset.echoSplit = '';
      element.replaceChildren(...nodes);
    }
  }
}

function makeStage(card) {
  const frame = card.querySelector('iframe');
  const viewport = card.querySelector('.stage');
  const scale = new globalThis.ResizeObserver(([entry]) => {
    frame.style.setProperty('--stage-scale', entry.contentRect.width / 1920);
  });
  scale.observe(viewport);
  const ready = new Promise((resolve) => {
    frame.addEventListener(
      'load',
      () => {
        const stage = frame.contentDocument;
        resolve(stage);
      },
      { once: true },
    );
  });
  frame.srcdoc = stageMarkup;
  const title = card.querySelector('h2');
  const description = card.querySelector('.caption p');
  return {
    card,
    frame,
    ready,
    title,
    description,
    typographyTitle: title.textContent,
    typographyDescription: description.textContent,
    stretch: null,
    columnTimer: null,
  };
}

const stages = Array.from(cards.querySelectorAll('article'), makeStage);
let revision = 0;

async function renderStages() {
  const renderId = ++revision;
  const isMotion = comparison.value === 'motion';
  const isPhrases = comparison.value === 'phrases';
  const isEntrances = comparison.value === 'entrances';
  const isTimed = isPhrases || isEntrances;
  const isAnimatedSample = isMotion || isTimed;
  const animate = isAnimatedSample && !motionPreference.matches;
  const sample = isTimed
    ? isEntrances
      ? punctuatedSample
      : phraseSample
    : isMotion
      ? motionSample
      : samples[sampleSelect.value];
  const appearance = backdrop.value;
  const spaced = spacing.checked;
  sampleSelect.disabled = isAnimatedSample;
  spacing.disabled = isAnimatedSample;
  replay.hidden = !isAnimatedSample;
  replay.disabled = !animate && !isTimed;
  comparisonNote.textContent = isTimed
    ? isEntrances
      ? '同一句歌詞、同一種欄位切換，比較三種進場。'
      : '同一句歌詞比較保留前欄、一次一欄與重點漢字先入。'
    : isMotion
      ? '同一句、同字型、同錨點，比較文字動態。'
      : '同一句、同字型、同錨點，比較字形比例。';
  sampleText.textContent = sample.text;
  sampleText.lang = sample.lang;
  const presentation = adaptOrnateVerticalLyricsPresentation(sample.text, {
    documentContext,
  });
  await Promise.all(
    stages.map(async (preview) => {
      const stage = await preview.ready;
      if (renderId !== revision) return;
      const { card, frame, title, description } = preview;
      const variant = card.dataset.variant;
      const [name, detail] = isTimed
        ? isEntrances
          ? entranceVariants[variant].slice(1)
          : phraseCaptions[variant]
        : isMotion
          ? motionCaptions[variant]
          : [
              preview.typographyTitle,
              variant === 'c'
                ? `沿用 B ·「${sample.focus}」縱向 +18%`
                : preview.typographyDescription,
            ];
      title.textContent = name;
      description.textContent = detail;
      frame.title = name;
      card.querySelector('button').setAttribute('aria-label', `放大${name}`);
      preview.stretch?.kill();
      preview.stretch = null;
      globalThis.clearTimeout(preview.columnTimer);
      if (card.hidden) return;
      applyOverlayAppearance(stage, {
        templateId: 'ornate-vertical',
        settings: {
          ornateArrangement: isAnimatedSample ? 'mixed-sizes' : 'uniform',
          ornateEntrance: isEntrances
            ? entranceVariants[variant][0]
            : isPhrases && variant === 'c'
              ? 'focus-first'
              : 'sequential',
        },
      });
      stage.documentElement.lang = sample.lang;
      stage.documentElement.dataset.variant = isAnimatedSample
        ? 'motion'
        : variant;
      stage.documentElement.dataset.sampleBackdrop = appearance;
      const current = stage.querySelector('.lyrics-overlay__current');
      const elements = {
        root: stage.querySelector('.lyrics-overlay'),
        current,
        next: stage.querySelector('.lyrics-overlay__next'),
      };
      clearOrnateVerticalPresentation(elements, { gsap });
      const frameData = {
        visible: true,
        displayBatchId: sample.text,
        currentText: sample.text,
        ornateVertical: presentation,
        ...(isMotion && animate && variant === 'c'
          ? {
              ornateStrokeClock: {
                elapsedMs: 0,
                durationMs: 4000,
                playing: true,
                rate: 1,
              },
            }
          : {}),
      };
      const render = (value) =>
        renderOrnateVerticalPresentation(elements, value, {
          gsap,
          reducedMotion: !animate,
        });
      if (isTimed) {
        const startedAt = globalThis.performance.now();
        const plan = {
          status: 'ready',
          pages: [
            {
              text: sample.text,
              sourceStart: 0,
              sourceEnd: sample.text.length,
              startMs: sample.startMs,
              endMs: sample.endMs,
            },
          ],
        };
        const paintColumn = () => {
          if (renderId !== revision) return;
          const projected = projectLyricsDisplayFrame(
            frameData,
            sample,
            plan,
            globalThis.performance.now() - startedAt,
            {
              templateId: 'ornate-vertical',
              force: true,
              playing: true,
              ornateColumnMode:
                isPhrases && variant === 'b' ? 'replace' : 'retain',
            },
          );
          render(projected);
          const delay = projected.ornateColumnTiming?.nextDelayMs;
          if (Number.isFinite(delay))
            preview.columnTimer = globalThis.setTimeout(paintColumn, delay);
        };
        paintColumn();
        return;
      }
      render(frameData);
      if (isMotion && animate && variant === 'b') {
        const glyph = current.querySelector(
          '.lyrics-overlay__ornate-segment:last-child .lyrics-overlay__ornate-unit:last-child > span',
        );
        if (glyph?.textContent === '灯') {
          const { length } = presentation.units;
          glyph.classList.add('motion-stretch-glyph');
          preview.stretch = gsap.to(glyph, {
            scaleY: 1.18,
            delay:
              ornateVerticalRevealDelaySeconds(length - 1, length) +
              ORNATE_VERTICAL_ENTER_DURATION_SECONDS +
              0.12,
            duration: 0.42,
            ease: 'power3.out',
          });
        }
      }
      if (!isMotion && variant !== 'a') {
        applySampleTypography(current, {
          focusedGlyph: variant === 'c' ? sample.focus : null,
          spaced,
        });
      }
    }),
  );
}

function showOnly(selected) {
  cards.dataset.enlarged = String(Boolean(selected));
  compare.hidden = !selected;
  for (const { card } of stages) {
    card.hidden = Boolean(selected && selected !== card);
    card.querySelector('button').hidden = Boolean(selected);
  }
  void renderStages();
  if (selected) compare.focus();
}

const params = new globalThis.URLSearchParams(globalThis.location.search);
const requestedSample = params.get('sample');
if (Object.hasOwn(samples, requestedSample))
  sampleSelect.value = requestedSample;
if (
  params.get('comparison') === 'type' ||
  Object.hasOwn(samples, requestedSample)
)
  comparison.value = 'type';
if (params.get('comparison') === 'phrases') comparison.value = 'phrases';
if (params.get('comparison') === 'entrances') comparison.value = 'entrances';
comparison.addEventListener('change', renderStages);
replay.addEventListener('click', renderStages);
motionPreference.addEventListener('change', renderStages);
sampleSelect.addEventListener('change', renderStages);
backdrop.addEventListener('change', renderStages);
spacing.addEventListener('change', renderStages);
for (const { card } of stages) {
  card.querySelector('button').addEventListener('click', () => showOnly(card));
}
compare.addEventListener('click', () => {
  const selected = stages.find(({ card }) => !card.hidden)?.card;
  showOnly(null);
  selected?.querySelector('button').focus();
});
void renderStages();
