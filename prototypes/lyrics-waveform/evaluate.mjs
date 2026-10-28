import { LIMITS } from './policy.mjs';

export function evaluate(report) {
  const normal = report.main.filter((row) =>
    ['first-read', 'repeat-read'].includes(row.variant),
  );
  const required = [
    'mono',
    'wav',
    'mp3',
    'aac',
    'opus',
    'medium',
    'long',
    'quad',
    'eight',
  ];
  const cancellation = report.main.filter((row) =>
    ['cancel', 'source'].includes(row.variant),
  );
  const bounds = report.main.filter((row) =>
    ['deadline', 'output-limit'].includes(row.variant),
  );
  const main = {
    completeDenominator:
      required.every((id) => normal.some((row) => row.id === id)) &&
      normal.some((row) => row.id === 'long' && row.variant === 'repeat-read'),
    completeDecode:
      normal.length > 0 &&
      normal.every(
        (row) =>
          row.status === 'completed' &&
          row.installed === 1 &&
          row.producerClosed &&
          row.workerClosed,
      ),
    summaryAndChunk:
      normal.length > 0 &&
      normal.every(
        (row) =>
          row.payloadBytes <= LIMITS.summaryBytes &&
          row.workingSummaryBytes <= 98304 &&
          row.maxChunkBytes <= LIMITS.pcmChunkBytes,
      ),
    memory:
      normal.length > 0 &&
      normal.every(
        (row) =>
          row.observedPeakSumBytes !== null &&
          row.observedPeakSumBytes <= LIMITS.mainBudgetBytes,
      ),
    deadline:
      normal.length > 0 &&
      normal.every((row) => row.totalMs <= LIMITS.deadlineMs),
    hostResponsiveness:
      normal.length > 0 &&
      normal.every((row) => row.hostLoopMaxMs <= LIMITS.hostLoopMs),
    antiPhase: ['wav', 'medium', 'long', 'quad', 'eight'].every((id) =>
      normal.some((row) => row.id === id && row.min < -0.09 && row.max > 0.09),
    ),
    actualCancellation:
      cancellation.length === 2 &&
      cancellation.every(
        (row) =>
          row.producerAlive === false &&
          row.producerClosed &&
          row.workerClosed &&
          row.installed === 0 &&
          row.cancelToExitMs <= LIMITS.cancelMs,
      ),
    guardStopsProducer:
      bounds.length === 2 &&
      bounds.every(
        (row) =>
          row.producerAlive === false &&
          row.producerClosed &&
          row.workerClosed &&
          row.installed === 0,
      ) &&
      bounds.some((row) => row.status === 'DEADLINE') &&
      bounds.some((row) => row.status === 'PCM_DURATION'),
    failureStopsProducer: ['corrupt', 'worker-exit'].every((variant) =>
      report.main.some(
        (row) =>
          row.variant === variant &&
          row.producerClosed &&
          row.workerClosed &&
          row.producerAlive === false &&
          row.installed === 0,
      ),
    ),
  };
  const browser = {
    longRefused: report.browser.results.some(
      (row) => row.id === 'long' && row.status === 'budget-refused',
    ),
    cancellationObservation:
      report.browser.results.find((row) => row.id === 'medium-cancel') ?? null,
    incompleteProbes: report.browser.results.filter(
      (row) => row.status === 'probe-failed',
    ).length,
    sameRendererHardCancelSupported: false,
  };
  return {
    main,
    mainCandidate: Object.values(main).every(Boolean),
    browser,
    browserCandidate: false,
  };
}
