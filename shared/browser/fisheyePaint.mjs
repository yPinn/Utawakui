import { fisheyeLetterScale } from '../presentation/fisheyeLyrics.mjs';
import { fisheyeDecorationStrength } from '../outputAppearance.mjs';

export const FISHEYE_WIDTH = 960;
export const FISHEYE_HEIGHT = 540;
export const FISHEYE_CENTER = { x: 480.4, y: 272.8 };
export const FISHEYE_APERTURE = { x: 322.9, y: 241.3 };
export const FISHEYE_RIDGE = { x: 479.6, y: 282.2, r: 323.6 };
const CLOSE_LENS_SCALE = 1.28;
const CLOSE_LYRIC_RADIUS = 352;
const mix = (from, to, progress) => from + (to - from) * progress;
const DEFAULT_TEXT_COLOR = '#a3f39e';
const FONT_SCALE = { small: 0.83, medium: 1, large: 1.18 };
const REFLECTION_PERIOD_MS = 4000;
const REFLECTION_LIGHTS = [
  { width: 16, drift: 0.46, cool: '#78e5ff', tint: '#5641df', warm: '#aa58f6' },
  { width: 24, drift: 0.52, cool: '#b6aeff', tint: '#703cce', warm: '#f588df' },
  { width: 13, drift: 0.39, cool: '#8de3ff', tint: '#3544cb', warm: '#aa72f5' },
  { width: 21, drift: 0.48, cool: '#a8daff', tint: '#5932b6', warm: '#dc7bd4' },
];
const REFLECTION_CONTOURS = REFLECTION_LIGHTS.map((_, ring) => {
  const phase = ring * 1.57;
  return Array.from({ length: 96 }, (_, index) => {
    const angle = (index * Math.PI) / 48;
    const radius =
      1 +
      Math.sin(3 * angle + phase) * 0.056 +
      Math.sin(5 * angle - phase) * 0.042 +
      Math.sin(8 * angle + phase) * 0.013;
    const width =
      0.83 +
      0.34 * Math.sin(2 * angle + phase) +
      0.25 * Math.sin(3 * angle - phase) +
      0.12 * Math.cos(7 * angle);
    return { x: Math.cos(angle), y: Math.sin(angle), radius, width };
  });
});

export function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

export function columnGeometry(side, y) {
  const [a, b, c] =
    side < 0 ? [17.85, -0.268, 194.859] : [-19.035, 1.642, 761.319];
  const u = (y - 270) / 100;
  return { x: (a * u + b) * u + c, tangent: (2 * a * u + b) / 100 };
}

export function fisheyeCloseColumnGeometry(side, y) {
  const dy = y - FISHEYE_RIDGE.y;
  const dx = Math.sqrt(Math.max(1, CLOSE_LYRIC_RADIUS ** 2 - dy ** 2));
  return { x: FISHEYE_RIDGE.x + side * dx, tangent: (-side * dy) / dx };
}

export function createFisheyePainter(canvas) {
  const glass = canvas.getContext('2d');
  const { ownerDocument: document } = canvas;
  const width = FISHEYE_WIDTH;
  const height = FISHEYE_HEIGHT;
  const center = FISHEYE_CENTER;
  const aperture = FISHEYE_APERTURE;
  const ridge = FISHEYE_RIDGE;

  function clipView(scale = 1) {
    ellipse(glass, ridge.x, ridge.y, ridge.r * scale, ridge.r * scale);
    glass.clip();
  }

  function scaleAtLens(scale) {
    if (scale === 1) return;
    glass.translate(ridge.x, ridge.y);
    glass.scale(scale, scale);
    glass.translate(-ridge.x, -ridge.y);
  }

  function reflectionFill(contour, outer, inner, color) {
    glass.beginPath();
    for (const [offset, reverse] of [
      [outer, false],
      [inner, true],
    ]) {
      for (let step = 0; step < contour.length; step++) {
        const index = reverse ? contour.length - step - 1 : step;
        const { x, y, radius, halfWidth } = contour[index];
        const edge = radius + offset * halfWidth;
        const px = ridge.x + x * edge;
        const py = ridge.y + y * edge;
        if (step === 0) glass.moveTo(px, py);
        else glass.lineTo(px, py);
      }
      glass.closePath();
    }
    glass.fillStyle = color;
    glass.fill('evenodd');
  }

  function paintReflection(positionMs = 720) {
    if (glass.globalAlpha === 0) return;
    glass.save();
    const opacity = glass.globalAlpha;
    for (const [ring, light] of REFLECTION_LIGHTS.entries()) {
      const phase =
        (Math.max(0, positionMs) / REFLECTION_PERIOD_MS + ring / 4) % 1;
      const radius = 0.23 + 0.99 * phase;
      // Keep the wave visible at the rim before its trailing edge fades out.
      const fade = opacity * Math.min(1, phase / 0.14, (1.22 - radius) / 0.26);
      if (fade <= 0) continue;
      const turn = light.drift * phase;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const contour = REFLECTION_CONTOURS[ring].map((point) => ({
        x: point.x * cos - point.y * sin,
        y: point.x * sin + point.y * cos,
        radius: ridge.r * radius * point.radius,
        halfWidth: (light.width / 2) * point.width * (0.75 + 0.35 * phase),
      }));
      const span = ridge.r * radius;
      const gradient = glass.createLinearGradient(
        ridge.x - span * 0.82,
        ridge.y - span * 0.67,
        ridge.x + span * 0.83,
        ridge.y + span * 0.61,
      );
      gradient.addColorStop(0, `${light.cool}b8`);
      gradient.addColorStop(0.28, `${light.tint}b0`);
      gradient.addColorStop(0.56, `${light.tint}48`);
      gradient.addColorStop(0.8, `${light.warm}aa`);
      gradient.addColorStop(1, `${light.warm}25`);
      const glint = glass.createLinearGradient(
        ridge.x - span * 0.77,
        ridge.y - span * 0.58,
        ridge.x + span * 0.77,
        ridge.y + span * 0.58,
      );
      glint.addColorStop(0, `${light.cool}b8`);
      glint.addColorStop(0.22, `${light.cool}78`);
      glint.addColorStop(0.44, `${light.cool}00`);
      glint.addColorStop(0.7, `${light.warm}00`);
      glint.addColorStop(0.88, `${light.warm}85`);
      glint.addColorStop(1, `${light.warm}30`);
      glass.globalAlpha = fade * 0.11;
      reflectionFill(contour, 1.66, -1.48, gradient);
      glass.globalAlpha = fade * 0.39;
      reflectionFill(contour, 1, -1, gradient);
      glass.globalAlpha = fade * 0.51;
      reflectionFill(contour, 0.93, 0.59, glint);
    }
    glass.restore();
  }

  const lens = document.createElement('canvas');
  lens.width = width;
  lens.height = height;
  const rim = lens.getContext('2d');
  rim.save();
  rim.translate(ridge.x, ridge.y);
  rim.scale(ridge.r, ridge.r);
  const shade = rim.createRadialGradient(0, 0, 0, 0, 0, 1.8);
  for (const [at, color] of [
    [0, '#100d1e00'],
    [0.72, '#0e0b1a00'],
    [0.88, '#18132d16'],
    [0.96, '#17152961'],
    [1.02, '#181626dc'],
    [1.12, '#141322ff'],
    [1.3, '#100f20ef'],
    [1.8, '#080910ff'],
  ]) {
    shade.addColorStop(at / 1.8, color);
  }
  rim.fillStyle = shade;
  rim.fillRect(-1.8, -1.8, 3.6, 3.6);
  rim.restore();
  const ridgeGlow = rim.createRadialGradient(
    ridge.x,
    ridge.y,
    ridge.r - 31,
    ridge.x,
    ridge.y,
    ridge.r + 142,
  );
  for (const [at, color] of [
    [0, '#667ca300'],
    [0.1, '#657ea125'],
    [0.179, '#8196b574'],
    [0.25, '#566a897c'],
    [0.35, '#20283fc6'],
    [0.52, '#131625e8'],
    [1, '#080910ff'],
  ]) {
    ridgeGlow.addColorStop(at, color);
  }
  rim.fillStyle = ridgeGlow;
  rim.fillRect(0, 0, width, height);

  function paintForeground(strength = 100, lensScale = 1) {
    if (strength === 0) return;
    glass.save();
    glass.globalAlpha = strength / 100;
    scaleAtLens(lensScale);
    glass.drawImage(lens, 0, 0);
    glass.restore();
  }

  const pulseFrames = 12;

  function columnPulse(age, index, side, reducedMotion, amount) {
    if (reducedMotion) return 1;
    const phase = (age + index * 2.5 + (side < 0 ? 3 : 0)) / pulseFrames;
    return 1 + 0.072 * amount * Math.sin(2 * Math.PI * phase);
  }

  function paintColumn(
    tokens,
    side,
    scales,
    orbit,
    age,
    reducedMotion = false,
    {
      fontScale = 'medium',
      textColor = DEFAULT_TEXT_COLOR,
      pulse = 1,
      scaleTransition,
      layoutMix = 0,
    } = {},
    ctx = glass,
  ) {
    const steps = Math.max(1, tokens.length - 1);
    const closeSpacing = Math.min(63, 402 / steps);
    const spacing = mix(
      Math.min(tokens.length > 6 ? 34 : 41, 230 / steps),
      closeSpacing,
      layoutMix,
    );
    const halfSpan = (closeSpacing * (tokens.length - 1)) / 2;
    const closeMiddle = Math.min(
      490 - halfSpan,
      Math.max(48 + halfSpan, side < 0 ? 309 : 228),
    );
    const middle = mix(side < 0 ? 278 : 271, closeMiddle, layoutMix);
    [...tokens].forEach((token, index) => {
      const scale =
        (scales?.[index % scales.length] ??
          fisheyeLetterScale(index, side, scaleTransition)) *
        columnPulse(age, index, side, reducedMotion, pulse);
      if (scale < 0.02) return;
      let y = middle + (index - (tokens.length - 1) / 2) * spacing;
      const normal = columnGeometry(side, y);
      const close = fisheyeCloseColumnGeometry(side, y);
      let x = mix(normal.x, close.x, layoutMix);
      let tangent = mix(normal.tangent, close.tangent, layoutMix);
      const tilt = ((index % 3) - 1) * 0.12 - side * 0.11;
      if (orbit) {
        const vertical = mix(aperture.y - 10, CLOSE_LYRIC_RADIUS, layoutMix);
        const horizontal = mix(282, CLOSE_LYRIC_RADIUS, layoutMix);
        const cy = mix(center.y, ridge.y, layoutMix);
        const origin = Math.asin(
          Math.max(-1, Math.min(1, (y - cy) / vertical)),
        );
        const angle = origin + orbit.turn * side;
        if (Math.abs(angle) > mix(1.28, 1.18, layoutMix)) return;
        x += side * horizontal * (Math.cos(angle) - Math.cos(origin));
        y = cy + vertical * Math.sin(angle);
        tangent = ((-side * horizontal) / vertical) * Math.tan(angle);
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.atan(tangent) + tilt);
      ctx.scale(scale, scale * (orbit?.face ?? 1));
      const compact = tokens.length > 5;
      const fontSize = Math.min(
        (27 + (index % 3) * 2.6) *
          mix(1, 1.42, layoutMix) *
          (compact ? 0.9 : 1) *
          FONT_SCALE[fontScale],
        spacing * (fontScale === 'large' ? 0.94 : 0.8),
      );
      ctx.font =
        '900 ' +
        fontSize +
        'px "Microsoft JhengHei", "Yu Gothic", "Noto Sans CJK TC", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      const maxWidth = 115;
      const border =
        (compact ? 9 : 11) *
        mix(1, 1.18, layoutMix) *
        Math.min(1, FONT_SCALE[fontScale]);
      ctx.strokeStyle = '#9de1fa85';
      ctx.lineWidth = border + 4;
      ctx.strokeText(token, -1.4, 1, maxWidth);
      ctx.strokeStyle = '#ffb24d95';
      ctx.lineWidth = border + 2;
      ctx.strokeText(token, 1.8, -0.6, maxWidth);
      ctx.strokeStyle = '#090916';
      ctx.lineWidth = border;
      ctx.strokeText(token, 0, 0, maxWidth);
      ctx.fillStyle = '#31dfff';
      ctx.fillText(token, -1.3, 0.4, maxWidth);
      ctx.fillStyle = '#ffb947';
      ctx.fillText(token, 1.2, -0.3, maxWidth);
      const neon = ctx.createLinearGradient(0, -fontSize / 2, 0, fontSize / 2);
      neon.addColorStop(0, '#a8fff4');
      neon.addColorStop(0.45, '#a3f39e');
      neon.addColorStop(0.72, '#e6f86e');
      neon.addColorStop(1, '#fbd268');
      ctx.fillStyle = textColor === DEFAULT_TEXT_COLOR ? neon : textColor;
      ctx.fillText(token, 0, 0, maxWidth);
      ctx.restore();
    });
  }

  let swirlLayer;
  function paintSwirl(tokens, side, shape, options) {
    // Keep the rotation local to a single column so the actor's space stays open.
    const layer = (swirlLayer ??= document.createElement('canvas'));
    const progress = options.layoutMix;
    const x = mix(
      Math.round(columnGeometry(side, 270).x) - 76,
      side < 0 ? 46 : 644,
      progress,
    );
    const y = mix(126, 16, progress);
    layer.width = Math.ceil(mix(152, 270, progress));
    layer.height = Math.ceil(mix(288, 514, progress));
    const ctx = layer.getContext('2d', { willReadFrequently: true });
    ctx.translate(-x, -y);
    paintColumn(tokens, side, null, null, 0, true, options, ctx);
    const source = ctx.getImageData(0, 0, layer.width, layer.height);
    const warped = ctx.createImageData(layer.width, layer.height);
    warpFisheyeInk(source, warped, shape, side);
    ctx.putImageData(warped, 0, 0);
    const w = layer.width * shape.width;
    const h = layer.height * shape.height;
    glass.save();
    glass.globalAlpha *= shape.opacity ?? 1;
    glass.drawImage(
      layer,
      x + (layer.width - w) / 2,
      y + (layer.height - h) / 2,
      w,
      h,
    );
    glass.restore();
  }

  function paintSmoke(side, cloud, particles, layoutMix) {
    const y = side < 0 ? 299 : 277;
    const x = mix(
      columnGeometry(side, y).x,
      fisheyeCloseColumnGeometry(side, y).x,
      layoutMix,
    );
    glass.save();
    glass.translate(x, y);
    if (cloud) {
      glass.save();
      glass.globalAlpha = Number(cloud);
      glass.scale(0.72 + 0.28 * Number(cloud), 0.72 + 0.28 * Number(cloud));
      glass.fillStyle = '#bdfa9f';
      glass.strokeStyle = '#131625';
      glass.lineWidth = 3;
      const puff = new document.defaultView.Path2D(
        'M-49-13C-69-30-51-49-31-42C-22-62 3-59 11-43C29-58 53-42 50-23C70-19 70 7 53 16C63 37 38 53 22 43C8 62-18 57-25 40C-52 51-68 25-51 12C-72 5-65-10-49-13Z',
      );
      glass.fill(puff);
      glass.stroke(puff);
      glass.restore();
    }
    if (particles > 0) {
      glass.globalAlpha = Math.min(1, particles * 1.7);
      for (let i = 0; i < 22; i++) {
        const angle = i * 2.399963 + side * 0.45;
        const distance = (20 + ((i * 17) % 51)) * (1 + (1 - particles) * 0.65);
        const size = (1.7 + (i % 4) * 1.65) * particles;
        glass.fillStyle = i % 3 === 0 ? '#dafa65' : '#91f7a5';
        ellipse(
          glass,
          Math.cos(angle) * distance,
          Math.sin(angle) * distance * 1.15,
          size,
          size * 0.78,
        );
        glass.fill();
      }
    }
    glass.restore();
  }

  function render(columns, pose = {}, appearance = {}) {
    const {
      visible = true,
      scaleTransition,
      smoke,
      reflectionPositionMs,
      lensLayout,
      layoutMix = lensLayout === 'close' ? 1 : 0,
    } = pose;
    const {
      fisheyeRim,
      fisheyeReflection,
      fisheyePulse = 100,
      fontScale = 'medium',
      textColor = DEFAULT_TEXT_COLOR,
    } = appearance;
    glass.setTransform(
      canvas.width / width,
      0,
      0,
      canvas.height / height,
      0,
      0,
    );
    glass.clearRect(0, 0, width, height);
    const lensScale = mix(1, CLOSE_LENS_SCALE, layoutMix);
    glass.save();
    clipView(lensScale);
    glass.save();
    scaleAtLens(lensScale);
    glass.globalAlpha = fisheyeDecorationStrength(fisheyeReflection) / 100;
    paintReflection(reflectionPositionMs);
    glass.restore();
    if (visible || smoke)
      paintEffects(columns, pose, {
        fontScale,
        textColor,
        pulse: fisheyePulse / 100,
        scaleTransition,
        layoutMix,
      });
    glass.restore();
    paintForeground(fisheyeDecorationStrength(fisheyeRim), lensScale);
  }

  function paintEffects(columns, pose, options) {
    const {
      age = 0,
      orbit,
      visible = true,
      reducedMotion = false,
      swirl,
      smoke,
      particles = 0,
      letterScales,
    } = pose;
    for (const [tokens, side, scales] of [
      [columns.right, 1, letterScales?.right],
      [columns.left, -1, letterScales?.left],
    ]) {
      if (!tokens.length) continue;
      if (swirl) paintSwirl(tokens, side, swirl, options);
      else if (visible) {
        if (orbit?.trail) {
          for (const [distance, opacity] of [
            [1, 0.055],
            [0.67, 0.085],
            [0.32, 0.12],
          ]) {
            glass.globalAlpha = opacity;
            paintColumn(
              tokens,
              side,
              scales,
              { ...orbit, turn: orbit.turn - distance * orbit.trail },
              age,
              reducedMotion,
              options,
            );
          }
          glass.globalAlpha = 1;
        }
        paintColumn(tokens, side, scales, orbit, age, reducedMotion, options);
      }
      if (smoke || particles > 0)
        paintSmoke(side, smoke, particles, options.layoutMix);
    }
  }

  return { clipView, paintColumn, paintReflection, paintForeground, render };
}

export function warpFisheyeInk(source, target, shape, direction = 1) {
  const { width, height, data } = source;
  const output = target.data;
  const stride = width * 4;
  const centerX = width / 2;
  const centerY = height / 2;
  const twistRadius = 125;
  const baseAngle = -direction * shape.turn;
  const baseCos = Math.cos(baseAngle);
  const baseSin = Math.sin(baseAngle);
  const bend = -direction * shape.bend * 4.35;
  for (let y = 0; y < height; y++) {
    const dy = y - centerY;
    for (let x = 0; x < width; x++) {
      const dx = (x - centerX) / 1.13;
      const distanceSquared = dx * dx + dy * dy;
      let cos = baseCos;
      let sin = baseSin;
      if (bend && distanceSquared < twistRadius * twistRadius) {
        const falloff = 1 - Math.sqrt(distanceSquared) / twistRadius;
        const angle = baseAngle + bend * falloff ** 1.36;
        cos = Math.cos(angle);
        sin = Math.sin(angle);
      }
      const sx = centerX + 1.13 * (dx * cos - dy * sin);
      const sy = centerY + dx * sin + dy * cos;
      const sx0 = Math.floor(sx);
      const sy0 = Math.floor(sy);
      if (sx0 < 0 || sx0 >= width - 1 || sy0 < 0 || sy0 >= height - 1) continue;
      const topLeft = sy0 * stride + sx0 * 4;
      const topRight = topLeft + 4;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 4;
      const alphaTL = data[topLeft + 3];
      const alphaTR = data[topRight + 3];
      const alphaBL = data[bottomLeft + 3];
      const alphaBR = data[bottomRight + 3];
      // Most of the column is transparent. Skip the color reads and blending
      // when none of the four bilinear samples contains ink.
      if (!(alphaTL || alphaTR || alphaBL || alphaBR)) continue;

      const fx = sx - sx0;
      const fy = sy - sy0;
      const weightTL = (1 - fy) * (1 - fx) * alphaTL;
      const weightTR = (1 - fy) * fx * alphaTR;
      const weightBL = fy * (1 - fx) * alphaBL;
      const weightBR = fy * fx * alphaBR;
      const alpha = weightTL + weightTR + weightBL + weightBR;
      if (!alpha) continue;
      const to = y * stride + x * 4;
      // Accumulate in source order to preserve rounding at byte boundaries.
      for (let channel = 0; channel < 3; channel++) {
        output[to + channel] =
          (data[topLeft + channel] * weightTL +
            data[topRight + channel] * weightTR +
            data[bottomLeft + channel] * weightBL +
            data[bottomRight + channel] * weightBR) /
          alpha;
      }
      output[to + 3] = alpha;
    }
  }
}
