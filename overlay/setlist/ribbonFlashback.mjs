const REVIEW_HOLD_MS = 3000;
export const RIBBON_PREVIEW_REVIEW_INTERVAL_MS = 1800;

export function createRibbonFlashback({ root, latest, archive, prepare }) {
  const wash = root.ownerDocument.createElement('div');
  wash.className = 'ribbon-flashback';
  wash.setAttribute('aria-hidden', 'true');
  const panels = [0, 1].map((index) => {
    const half = root.ownerDocument.createElement('div');
    const panel = root.ownerDocument.createElement('div');
    half.className = 'ribbon-flashback__half';
    panel.className = 'ribbon-flashback__brush';
    panel.style.clipPath = brushContour(index);
    half.append(panel);
    wash.append(half);
    return panel;
  });
  root.append(wash);

  let generation = 0;
  let timer;
  let before;
  let reducedMotion = false;

  function show(page) {
    root.dataset.flashbackPage = page;
    latest.inert = page === 'archive';
    archive.inert = page !== 'archive';
  }

  function later(callback, ms) {
    const expected = generation;
    timer = setTimeout(() => {
      if (expected === generation) callback();
    }, ms);
  }

  function clearBrush() {
    delete wash.dataset.step;
    delete wash.dataset.direction;
  }

  async function sweep(returning, expected) {
    const destination = returning ? 'latest' : 'archive';
    if (reducedMotion) {
      show(destination);
      return true;
    }

    const play = (step, onFinish = () => {}) => {
      wash.dataset.step = step;
      return Promise.all(
        panels.map(async (panel, index) => {
          const animation = panel.getAnimations?.()[0];
          if (animation) await animation.finished;
          if (expected === generation) onFinish(index);
        }),
      );
    };

    wash.dataset.direction = returning ? 'return' : 'enter';
    try {
      await play('cover', (index) => {
        show(index === 0 ? `top-${destination}` : destination);
      });
      if (expected !== generation) return false;
      await play('reveal');
    } catch (error) {
      if (expected !== generation) return false;
      if (error?.name !== 'AbortError') throw error;
      show(destination);
    }
    if (expected !== generation) return false;
    clearBrush();
    return true;
  }

  function scheduleReview(interval) {
    later(() => review(interval), interval);
  }

  async function review(interval) {
    const first = prepare(before) ?? (before === undefined ? null : prepare());
    if (first == null) return;
    const expected = generation;
    if (!(await sweep(false, expected)) || expected !== generation) return;
    later(async () => {
      if (!(await sweep(true, expected)) || expected !== generation) return;
      before = first;
      scheduleReview(interval);
    }, REVIEW_HOLD_MS);
  }

  show('latest');
  return {
    reset({ enabled = false, reduced = false, interval } = {}) {
      generation += 1;
      clearTimeout(timer);
      clearBrush();
      before = undefined;
      reducedMotion = reduced;
      show('latest');
      if (enabled) scheduleReview(interval);
    },
  };
}

const brushEdges = [
  [
    [0, 0.39],
    [1.2, 0.38],
    [1.7, 0.18],
    [2.3, 0.42],
    [3.1, 0.41],
    [3.6, 0.12],
    [4.4, 0.44],
    [5.6, 0.43],
    [7.8, 0.59],
    [8.3, 0.24],
    [9.2, 0.51],
    [11, 0.49],
    [12.7, 0.66],
    [14, 0.47],
    [14.5, 0.29],
    [15.8, 0.57],
    [17.6, 0.58],
    [18.3, 0.1],
    [19.2, 0.43],
    [21.5, 0.4],
    [24.1, 0.56],
    [25, 0.37],
    [26.3, 0.56],
    [28.8, 0.52],
    [30.2, 0.64],
    [31, 0.19],
    [32.2, 0.55],
    [34.1, 0.54],
    [36.1, 0.8],
    [38.4, 0.61],
    [40.2, 0.6],
    [41, 0.48],
    [41.8, 0.68],
    [43.5, 0.67],
    [44.4, 0.22],
    [45.6, 0.69],
    [46.8, 0.47],
    [47.8, 0.71],
    [51.7, 0.74],
    [52.2, 0.55],
    [53.4, 0.73],
    [55.2, 0.71],
    [58.4, 0.9],
    [59.2, 0.38],
    [60.4, 0.8],
    [64.5, 0.82],
    [66.7, 0.63],
    [68.2, 0.8],
    [70.4, 0.76],
    [71.1, 0.05],
    [72.4, 0.76],
    [73.1, 0.54],
    [74, 0.74],
    [77.1, 0.69],
    [79.2, 0.82],
    [80.1, 0.58],
    [81.5, 0.74],
    [84.7, 0.69],
    [85.4, 0.31],
    [86.4, 0.68],
    [89.4, 0.67],
    [92, 0.77],
    [93.2, 0.58],
    [94.6, 0.71],
    [96.1, 0.5],
    [97.8, 0.67],
    [100, 0.63],
  ],
  [
    [0, 0.31],
    [1.6, 0.3],
    [2, 0.14],
    [2.7, 0.38],
    [3.4, 0.12],
    [4, 0.42],
    [5.3, 0.35],
    [6.5, 0.05],
    [7.4, 0.48],
    [8, 0.39],
    [8.7, 0.08],
    [9.8, 0.5],
    [10.9, 0.49],
    [12.3, 0.31],
    [14.3, 0.58],
    [15.2, 0.55],
    [16.8, 0.75],
    [18.1, 0.41],
    [18.7, 0.19],
    [19.5, 0.61],
    [21.3, 0.63],
    [22.1, 0.84],
    [23.6, 0.64],
    [25.1, 0.51],
    [26.8, 0.68],
    [28.2, 0.54],
    [29.1, 0.82],
    [30.6, 0.64],
    [31.3, 0.49],
    [32.2, 0.71],
    [34, 0.62],
    [35.2, 0.85],
    [36.1, 0.74],
    [37.5, 0.9],
    [38.6, 0.61],
    [40.1, 0.55],
    [41.9, 0.7],
    [43.1, 0.53],
    [43.8, 0.75],
    [45, 0.54],
    [47, 0.79],
    [48.1, 0.66],
    [49.9, 0.76],
    [51.4, 0.93],
    [52.1, 0.73],
    [54.2, 0.65],
    [56.3, 0.61],
    [58.1, 0.49],
    [60.5, 0.69],
    [61.4, 0.92],
    [62.7, 0.65],
    [64, 0.59],
    [65.4, 0.83],
    [67.2, 0.69],
    [69.5, 0.45],
    [70.4, 0.67],
    [71.7, 0.62],
    [73.2, 0.78],
    [74.6, 0.6],
    [76.9, 0.64],
    [79.2, 0.89],
    [80.4, 0.5],
    [82.2, 0.52],
    [84.5, 0.64],
    [85.4, 0.81],
    [86.8, 0.43],
    [89.1, 0.67],
    [89.9, 0.39],
    [91.3, 0.62],
    [93.7, 0.55],
    [95.4, 0.79],
    [96.5, 0.35],
    [100, 0.62],
  ],
];
const brushContour = (index) => {
  const depth = 'var(--ribbon-flashback-brush-depth)';
  const right = brushEdges[1 - index].map(
    ([y, x]) => `calc(100% - ${depth} * ${x}) ${y}%`,
  );
  const left = brushEdges[index]
    .slice()
    .reverse()
    .map(([y, x]) => `calc(${depth} * ${x}) ${y}%`);
  return `polygon(${[...right, ...left].join(', ')})`;
};
