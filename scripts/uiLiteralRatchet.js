'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'ui-literal-baseline.json');
const SOURCE_ROOTS = ['src', 'electron'];
const SOURCE_PATTERN = /\.(?:c?js|mjs|vue)$/u;
// Tests, fixtures and demo specimens are not shipped UI copy.
const EXCLUDED = /(?:\.test\.[cm]?js$|\/fixtures\/|^src\/components\/demo\/)/u;
// Dev-only workbenches (App.vue import.meta.env.DEV, main windowState.isDev)
// stay zh-TW by owner decision (2026-11-04); end users never see them.
const DEV_ONLY = [
  /^src\/components\/(?:analysis|microphone|lyrics-provider|internal-tools)\//u,
  /^src\/microphone\//u,
  /^src\/views\/(?:InternalTools|Demo|MusicAnalysis|MicrophoneResearch|DiagnosticsWorkbench|LyricsProviderReview|VisualSystem)View\.vue$/u,
  /^src\/components\/settings\/DiagnosticsWorkbench\.vue$/u,
  /^src\/constants\/(?:internalTools|uiDemoSections|uiDemoPalette)\.js$/u,
  /^src\/composables\/analysis\/useMusicAnalysisJob\.js$/u,
  /^src\/composables\/(?:useMusicAnalysis(?:Batch|BenchmarkReview|ReferenceAnnotation|Workbench)|useMicrophone(?:Measurement|Research)|useDiagnosticsWorkbench|useLyricsProvider(?:CorpusReview|LookupActions))\.js$/u,
  /^src\/utils\/(?:musicAnalysisBenchmark|musicAnalysisReferenceAnnotation|diagnosticIssues)\.js$/u,
  /^electron\/(?:main\/lyricsProviderCorpusReviewHandlers|lib\/lyricsProviderCorpusReview)\.js$/u,
];
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|<!--)/u;

function sourceFiles(directory, root = ROOT) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : sourceFiles(file, root);
    const relative = path.relative(root, file).replaceAll('\\', '/');
    return SOURCE_PATTERN.test(entry.name) &&
      !EXCLUDED.test(relative) &&
      !DEV_ONLY.some((pattern) => pattern.test(relative))
      ? [relative]
      : [];
  });
}

// Non-comment lines that still hold hardcoded CJK UI text.
function countLiteralLines(source) {
  return source
    .split('\n')
    .filter((line) => CJK.test(line) && !COMMENT_LINE.test(line)).length;
}

function measureUiLiterals(root = ROOT) {
  return Object.fromEntries(
    SOURCE_ROOTS.flatMap((directory) =>
      sourceFiles(path.join(root, directory), root),
    )
      .sort()
      .map((file) => [
        file,
        countLiteralLines(fs.readFileSync(path.join(root, file), 'utf8')),
      ])
      .filter(([, count]) => count > 0),
  );
}

function evaluateUiLiterals(current, baseline) {
  return Object.entries(current)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => ({ file, count, allowed: baseline[file] ?? 0 }));
}

if (require.main === module && process.argv.includes('--write')) {
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(measureUiLiterals(), null, 2)}\n`,
  );
}

module.exports = {
  BASELINE_PATH,
  countLiteralLines,
  evaluateUiLiterals,
  measureUiLiterals,
};
