import { minifySync, parseSync } from 'rolldown/utils';

export const RELEASE_SYMBOL_TARGETS = Object.freeze([
  Object.freeze({
    file: 'electron/lib/importRecordingPolicy.js',
    exports: Object.freeze([
      'buildImportObservedTrack',
      'compareImportRecordingIdentity',
      'importDurationScore',
      'importTextEvidence',
      'importTextScore',
      'scoreImportRecording',
    ]),
  }),
  Object.freeze({
    file: 'electron/lib/artwork/releasePolicy.js',
    exports: Object.freeze([
      'canonicalArtworkIdentity',
      'evaluateArtworkCandidate',
      'rankArtworkCandidates',
      'rankArtworkProposals',
    ]),
  }),
]);

function walk(node, visit, parent) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit, node));
    else if (value && typeof value === 'object') walk(value, visit, node);
  }
}

function inspect(code, target) {
  const parsed = parseSync(target.file, code, { lang: 'js' });
  if (parsed.errors.length) throw new Error('Invalid release symbol source');
  const functions = parsed.program.body
    .filter((node) => node.type === 'FunctionDeclaration')
    .map((node) => node.id.name);
  const exports = [];
  let assignments = 0;
  walk(parsed.program, (node, parent) => {
    if (
      node.type === 'Identifier' &&
      node.name === 'exports' &&
      !(
        parent?.type === 'MemberExpression' &&
        parent.object.name === 'module' &&
        !parent.computed &&
        parent.property === node
      )
    ) {
      throw new Error('Unsupported release export reference');
    }
    if (
      node.type === 'Identifier' &&
      node.name === 'module' &&
      !(
        parent?.type === 'MemberExpression' &&
        parent.object === node &&
        !parent.computed &&
        parent.property.name === 'exports'
      )
    ) {
      throw new Error('Unsupported release module reference');
    }
    if (node.type === 'MemberExpression' && node.object.name === 'module') {
      if (
        parent?.type !== 'AssignmentExpression' ||
        parent.left !== node ||
        parent.operator !== '=' ||
        parent.right.type !== 'ObjectExpression'
      ) {
        throw new Error('Unsupported release export assignment');
      }
      assignments++;
      for (const property of parent.right.properties) {
        if (
          property.type !== 'Property' ||
          property.computed ||
          property.method ||
          property.kind !== 'init' ||
          property.key.type !== 'Identifier' ||
          property.value.type !== 'Identifier' ||
          property.key.name !== property.value.name
        ) {
          throw new Error('Unsupported release export shape');
        }
        exports.push(property.key.name);
      }
    }
    if (
      (node.type === 'CallExpression' &&
        ['eval', 'setInterval', 'setTimeout'].includes(node.callee.name)) ||
      (node.type === 'NewExpression' && node.callee.name === 'Function') ||
      (node.type === 'MemberExpression' &&
        ['name', 'toString'].includes(
          node.property.name ?? node.property.value,
        ))
    ) {
      throw new Error('Release symbol source requires reflection review');
    }
  });
  if (
    assignments !== 1 ||
    JSON.stringify([...exports].sort()) !==
      JSON.stringify([...target.exports].sort()) ||
    exports.some((name) => !functions.includes(name))
  ) {
    throw new Error('Release symbol exports changed');
  }
  return functions.filter((name) => !target.exports.includes(name));
}

export function protectReleaseModule(code, file) {
  const target = RELEASE_SYMBOL_TARGETS.find((entry) => entry.file === file);
  if (!target) throw new Error('Unknown release symbol target');
  const privateFunctions = inspect(code, target);
  const result = minifySync(file, code, {
    module: false,
    compress: false,
    mangle: {
      toplevel: true,
      keepNames: false,
      reserved: [
        'exports',
        'module',
        'require',
        '__dirname',
        '__filename',
        ...target.exports,
      ],
    },
    sourcemap: false,
  });
  if (result.errors.length)
    throw new Error('Release symbol transformation failed');
  const transformedPrivateFunctions = inspect(result.code, target);
  if (
    transformedPrivateFunctions.length !== privateFunctions.length ||
    transformedPrivateFunctions.some((name) => privateFunctions.includes(name))
  ) {
    throw new Error('Release private symbols were not protected');
  }
  return { code: result.code, privateFunctions };
}

export function verifyReleaseSymbolBundle(code) {
  const parsed = parseSync('main.cjs', code, { lang: 'js' });
  if (parsed.errors.length) throw new Error('Invalid release symbol bundle');
  const names = new Set();
  walk(parsed.program, (node) => {
    if (node.type === 'FunctionDeclaration') names.add(node.id.name);
  });
  if (
    ['confidenceFields', 'compareEvaluatedCandidates'].some((name) =>
      names.has(name),
    )
  )
    throw new Error('Unprotected private release symbols');
  if (
    RELEASE_SYMBOL_TARGETS.some((target) =>
      target.exports.some((name) => !names.has(name)),
    )
  )
    throw new Error('Missing public release symbols');
}
