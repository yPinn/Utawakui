import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transformWithOxc } from 'vite';
import runtimeEntries from '../electron/lib/runtimeEntries.js';

const { RUNTIME_ENTRIES } = runtimeEntries;
const projectRoot = path.resolve(import.meta.dirname, '..');
const ROOT_VARIABLE = '__utawakuiReleaseRoot';

function outputPath(root, directory) {
  const output = path.resolve(directory);
  const relative = path.relative(root, output);
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.startsWith('..') ||
    path.basename(output) !== 'runtime' ||
    !['runtime', 'tasks', '.tmp'].includes(relative.split(path.sep)[0])
  ) {
    throw new Error(
      'Release output must be an isolated build directory inside the project',
    );
  }
  return output;
}

function releaseModuleLocations(root, entry) {
  const probe = path.join(root, RUNTIME_ENTRIES.lyricsProbe.source);
  return {
    name: 'utawakui-release-module-locations',
    enforce: 'pre',
    resolveId(specifier, importer) {
      if (!importer || !specifier.startsWith('.')) return null;
      const resolved = path.resolve(path.dirname(importer), specifier);
      if (
        entry.file !== 'probe.cjs' &&
        [probe, probe.slice(0, -3)].includes(resolved)
      ) {
        return { id: './probe.cjs', external: true };
      }
      return null;
    },
    async transform(code, id) {
      if (id.startsWith('\0')) return null;
      const filename = path.resolve(id.split('?')[0]);
      const relative = path.relative(root, filename);
      if (
        relative.startsWith('..') ||
        path.isAbsolute(relative) ||
        relative.split(path.sep).includes('node_modules') ||
        !/\.(?:[cm]?js)$/u.test(filename)
      )
        return null;
      if (!/\b__(?:dirname|filename)\b/u.test(code)) return null;
      const logicalFile =
        filename === probe
          ? `runtime/${RUNTIME_ENTRIES.lyricsProbe.file}`
          : relative.replaceAll(path.sep, '/');
      return transformWithOxc(code, filename, {
        define: {
          __dirname: `require("node:path").join(${ROOT_VARIABLE},${JSON.stringify(path.dirname(relative).replaceAll(path.sep, '/'))})`,
          __filename: `require("node:path").join(${ROOT_VARIABLE},${JSON.stringify(logicalFile)})`,
        },
      });
    },
  };
}

export async function buildReleaseRuntime({
  rootDirectory = projectRoot,
  outputDirectory = path.join(rootDirectory, 'runtime'),
  entries = RUNTIME_ENTRIES,
} = {}) {
  const root = path.resolve(rootDirectory);
  const output = outputPath(root, outputDirectory);
  const existing = await fs.lstat(output).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing?.isSymbolicLink())
    throw new Error('Release output cannot be a link');
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  const staging = await fs.mkdtemp(path.join(root, '.tmp/release-runtime-'));
  const modules = new Set();
  try {
    for (const [key, entry] of Object.entries(entries)) {
      const preload = key === 'preload' || key === 'performerPreload';
      const result = await build({
        configFile: false,
        root,
        publicDir: false,
        logLevel: 'silent',
        plugins: [releaseModuleLocations(root, entry)],
        build: {
          ssr: true,
          write: false,
          sourcemap: false,
          minify: 'oxc',
          target: 'node24',
          rolldownOptions: {
            input: path.join(root, entry.source),
            platform: 'node',
            treeshake: false,
            external: (id) =>
              !id.startsWith('.') &&
              !path.isAbsolute(id) &&
              !id.startsWith('\0'),
            output: {
              format: 'cjs',
              codeSplitting: false,
              keepNames: true,
              banner: preload
                ? ''
                : `var ${ROOT_VARIABLE}=require("node:path").resolve(__dirname,"..");`,
            },
          },
        },
      });
      const chunks = result.output.filter((chunk) => chunk.type === 'chunk');
      if (chunks.length !== 1 || result.output.length !== 1)
        throw new Error('Unexpected release build output');
      const chunk = chunks[0];
      if (
        chunk.dynamicImports.length ||
        chunk.imports.some((id) => path.isAbsolute(id))
      ) {
        throw new Error('Release bundle contains an unresolved local module');
      }
      for (const id of Object.keys(chunk.modules))
        modules.add(path.relative(root, id).replaceAll(path.sep, '/'));
      await fs.writeFile(path.join(staging, entry.file), chunk.code);
    }
    await fs.mkdir(path.dirname(output), { recursive: true });
    if (existing) await fs.rm(output, { recursive: true, force: true });
    await fs.rename(staging, output);
    return {
      files: Object.values(entries).map((entry) => entry.file),
      modules: [...modules].sort(),
    };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await buildReleaseRuntime();
}
