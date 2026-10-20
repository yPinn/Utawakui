'use strict';
const {
  isBoundedTrackId,
  isLyricsSubtitleFilename,
} = require('../library/paths');
const { isAnalysisLanguage } = require('./language');
const DOWNLOAD_BYTES = 778532833;
function validateIntent(intent) {
  if (
    !intent ||
    Object.getPrototypeOf(intent) !== Object.prototype ||
    Object.keys(intent).sort().join(',') !== 'language,lineIndex,trackId' ||
    !isBoundedTrackId(intent.trackId) ||
    !['zh', 'ja', 'en'].includes(intent.language) ||
    !Number.isSafeInteger(intent.lineIndex) ||
    intent.lineIndex < 0 ||
    intent.lineIndex > 9999
  )
    throw Error('invalid research intent');
}
function createResearchService({
  environment,
  loadInput,
  runPreview,
  scheduler,
  isSetupBusy = () => false,
  loadAutomaticInput,
  publishEstimate,
  isAnalysisAllowed = () => false,
  isInputCurrent = () => true,
}) {
  let active = null,
    verified = false,
    damaged = false,
    stage = '',
    progress = null;
  function status() {
    return {
      researchOnly: true,
      status: damaged
        ? 'damaged'
        : verified
          ? 'ready'
          : environment.exists()
            ? 'unverified'
            : 'missing',
      busy: Boolean(active),
      operation: active?.name ?? '',
      stage,
      progress: progress ? { ...progress } : null,
      downloadBytes: DOWNLOAD_BYTES,
      installedBytesEstimate: 997022752,
      timingAcceptance: 'pending',
    };
  }
  async function execute(name, task, invalidateOnError = () => true) {
    if (active || isSetupBusy()) throw Error('research environment busy');
    const controller = new AbortController();
    const entry = { name, controller, result: null };
    active = entry;
    stage = name;
    const run = async () => {
      controller.signal.throwIfAborted();
      return task({
        signal: controller.signal,
        onProgress: (next) => {
          if (active !== entry || controller.signal.aborted) return;
          if (typeof next === 'string') {
            stage = next;
            progress = null;
            return;
          }
          if (
            !next ||
            Object.keys(next).sort().join(',') !== 'completed,stage,total' ||
            !['alignment', 'content'].includes(next.stage) ||
            !Number.isSafeInteger(next.total) ||
            next.total < 1 ||
            next.total > 1000 ||
            !Number.isSafeInteger(next.completed) ||
            next.completed < 0 ||
            next.completed > next.total
          )
            return;
          stage = next.stage;
          progress = { stage, completed: next.completed, total: next.total };
        },
      });
    };
    entry.result = (async () => {
      try {
        const value = scheduler
          ? await scheduler.schedule({
              jobId: 'lyrics-research',
              start: () => ({
                result: run(),
                cancel: async () => {
                  controller.abort();
                },
              }),
            })
          : await run();
        controller.signal.throwIfAborted();
        damaged = false;
        return value ?? { ...status(), busy: false, operation: '', stage: '' };
      } catch (error) {
        if (controller.signal.aborted)
          return {
            ...status(),
            busy: false,
            cancelled: true,
            operation: '',
            stage: '',
          };
        if (invalidateOnError()) {
          verified = false;
          damaged = true;
        }
        throw error;
      } finally {
        active = null;
        stage = '';
        progress = null;
      }
    })();
    return entry.result;
  }
  async function verify(options) {
    verified = false;
    await environment.verify(options);
    options.signal.throwIfAborted();
    verified = true;
  }
  return {
    status,
    isAnalysisBusy: () => Boolean(active) || isSetupBusy(),
    prepare: () =>
      execute('prepare', async (options) => {
        verified = false;
        await environment.prepare(options);
        await verify(options);
      }),
    verify: () => execute('verify', verify),
    remove: () =>
      execute('remove', async (options) => {
        verified = false;
        await environment.remove(options);
      }),
    async inspect(intent) {
      validateIntent(intent);
      const input = await loadInput(intent);
      return {
        sourceLabel: input.sourceLabel,
        lines: input.canonical.lines.map((line, index) => ({
          index,
          text: line.text,
          startMs: line.startMs,
          endMs: line.endMs,
        })),
      };
    },
    async preview(intent) {
      validateIntent(intent);
      if (!verified) throw Error('research load verification required');
      return execute('preview', async (options) => {
        const input = await loadInput(intent);
        const value = await runPreview(input, {
          ...options,
          language: intent.language,
          lineIndex: intent.lineIndex,
        });
        options.signal.throwIfAborted();
        if ((await loadInput(intent)).identity !== input.identity)
          throw Error('research source changed');
        return value;
      });
    },
    async analyze(trackId, language = 'auto', sourceFilename) {
      if (
        !isBoundedTrackId(trackId) ||
        !isAnalysisLanguage(language) ||
        (sourceFilename !== undefined &&
          (!isLyricsSubtitleFilename(sourceFilename) ||
            sourceFilename.length > 240)) ||
        !isAnalysisAllowed()
      )
        throw Error('experimental analysis unavailable');
      let environmentFailure = false;
      return execute(
        'analyze',
        async (options) => {
          if (!isAnalysisAllowed())
            throw Error('experimental analysis disabled');
          const input = await loadAutomaticInput(trackId, language);
          if (!input) return { status: 'skipped' };
          if (input.status === 'skipped') return input;
          if (
            sourceFilename !== undefined &&
            input.source?.filename !== sourceFilename
          )
            return { status: 'skipped', reason: 'source-changed' };
          if (!verified) {
            environmentFailure = true;
            await verify(options);
            environmentFailure = false;
          }
          if (!isAnalysisAllowed())
            throw Error('experimental analysis disabled');
          environmentFailure = true;
          const value = await runPreview(input, {
            ...options,
            language: input.language,
            lineIndex: 0,
            wholeSong: true,
          });
          environmentFailure = false;
          options.signal.throwIfAborted();
          const current = await loadAutomaticInput(trackId, language);
          if (
            current?.identity !== input.identity ||
            (sourceFilename !== undefined &&
              current?.source?.filename !== sourceFilename) ||
            current?.language !== input.language
          )
            throw Error('experimental source changed');
          return publishEstimate(
            input,
            value,
            () =>
              !options.signal.aborted &&
              isAnalysisAllowed() &&
              isInputCurrent(input),
          );
        },
        () => environmentFailure,
      );
    },
    async cancel() {
      const entry = active;
      if (entry) {
        entry.controller.abort();
        // Queued work must be removed too; active work owns asynchronous cleanup.
        if (scheduler) await scheduler.cancel('lyrics-research');
        await entry.result.catch(() => {});
      }
      return status();
    },
  };
}
module.exports = { createResearchService, validateIntent };
