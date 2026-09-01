import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const publicHtml = readFileSync(
  new URL('./index.html', import.meta.url),
  'utf8',
);
const publicStyles = readFileSync(
  new URL('./artwork.css', import.meta.url),
  'utf8',
);
const workbenchSource = readFileSync(
  new URL('../../src/components/output/ObsTemplateMockup.vue', import.meta.url),
  'utf8',
);

const CONTACT_TOLERANCE = 0.005;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssRule(source, selector, requiredProperty) {
  const matches = [
    ...source.matchAll(
      new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'gs'),
    ),
  ];
  const match = requiredProperty
    ? matches.find((candidate) =>
        new RegExp(`${requiredProperty}:\\s*[\\d.]+%`).test(candidate[1]),
      )
    : matches[0];
  expect(
    match,
    `missing CSS rule ${selector} with ${requiredProperty}`,
  ).toBeDefined();
  return match[1];
}

function percent(rule, ...properties) {
  for (const property of properties) {
    const match = rule.match(new RegExp(`${property}:\\s*([\\d.]+)%`));
    if (match) return Number(match[1]) / 100;
  }
  throw new Error(`missing percentage property: ${properties.join(' or ')}`);
}

function svgFragment(source, className) {
  const classIndex = source.indexOf(`class="${className}"`);
  expect(classIndex, `missing SVG class ${className}`).toBeGreaterThan(-1);
  const start = source.lastIndexOf('<svg', classIndex);
  const end = source.indexOf('</svg>', classIndex);
  return source.slice(start, end + '</svg>'.length);
}

function stylusTip(svg, stylusClass) {
  const viewBox = svg.match(
    /viewBox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/,
  );
  const head = svg.match(
    /transform="translate\(([\d.-]+)\s+([\d.-]+)\) rotate\(([\d.-]+)\)"/,
  );
  const stylus = svg.match(
    new RegExp(
      `class="${escapeRegExp(stylusClass)}"\\s+d="M([\\d.-]+) ([\\d.-]+)v([\\d.-]+)"`,
    ),
  );

  expect(viewBox).not.toBeNull();
  expect(head).not.toBeNull();
  expect(stylus).not.toBeNull();

  const angle = (Number(head[3]) * Math.PI) / 180;
  const localX = Number(stylus[1]);
  const localY = Number(stylus[2]) + Number(stylus[3]);

  return {
    viewBox: {
      width: Number(viewBox[3]),
      height: Number(viewBox[4]),
    },
    x: Number(head[1]) + localX * Math.cos(angle) - localY * Math.sin(angle),
    y: Number(head[2]) + localX * Math.sin(angle) + localY * Math.cos(angle),
  };
}

function contactError({
  source,
  html,
  prefix,
  sizeProperties = ['width', 'height'],
}) {
  const platter = cssRule(source, `.${prefix}platter`, sizeProperties[0]);
  const record = cssRule(source, `.${prefix}record`, sizeProperties[0]);
  const grooves = cssRule(source, `.${prefix}record-grooves`, 'inset');
  const tonearm = cssRule(source, `.${prefix}tonearm`, sizeProperties[0]);
  const tip = stylusTip(html, `${prefix}stylus`);

  const platterLeft = percent(platter, 'inset-inline-start');
  const platterTop = percent(platter, 'inset-block-start');
  const platterWidth = percent(platter, 'inline-size', 'width');
  const recordWidth = percent(record, 'inline-size', 'width');
  const grooveInset = percent(grooves, 'inset');
  const recordRadius = (platterWidth * recordWidth) / 2;
  const grooveRadius = recordRadius * (1 - 2 * grooveInset);
  const recordCentre = {
    x: platterLeft + platterWidth / 2,
    y: platterTop,
  };

  const tonearmRight = percent(tonearm, 'inset-inline-end');
  const tonearmTop = percent(tonearm, 'inset-block-start');
  const tonearmWidth = percent(tonearm, sizeProperties[0]);
  const tonearmHeight = percent(tonearm, sizeProperties[1]);
  const scale = Math.min(
    tonearmWidth / tip.viewBox.width,
    tonearmHeight / tip.viewBox.height,
  );
  const svgLeft = 1 - tonearmRight - tonearmWidth;
  const svgTop = tonearmTop;
  const svgInsetX = (tonearmWidth - tip.viewBox.width * scale) / 2;
  const svgInsetY = (tonearmHeight - tip.viewBox.height * scale) / 2;
  const renderedTip = {
    x: svgLeft + svgInsetX + tip.x * scale,
    y: svgTop + svgInsetY + tip.y * scale,
  };
  const tipRadius = Math.hypot(
    renderedTip.x - recordCentre.x,
    renderedTip.y - recordCentre.y,
  );

  return Math.abs(tipRadius - grooveRadius);
}

describe('vinyl tonearm geometry', () => {
  it('rests the public stylus on the outer black playable groove', () => {
    expect(
      contactError({
        source: publicStyles,
        html: svgFragment(publicHtml, 'artwork-overlay__tonearm'),
        prefix: 'artwork-overlay__',
        sizeProperties: ['inline-size', 'block-size'],
      }),
    ).toBeLessThanOrEqual(CONTACT_TOLERANCE);
  });

  it('mirrors the same groove contact in the Workbench preview', () => {
    expect(
      contactError({
        source: workbenchSource,
        html: svgFragment(
          workbenchSource,
          'obs-template-mockup__vinyl-tonearm',
        ),
        prefix: 'obs-template-mockup__vinyl-',
      }),
    ).toBeLessThanOrEqual(CONTACT_TOLERANCE);
  });
});
