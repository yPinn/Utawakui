import { createRequire } from 'node:module';
import path from 'node:path';
import { createNeteaseEvaluationProbe } from './lyrics-provider-netease.mjs';
import {
  NETEASE_RUNTIME_PROFILE,
  validateNeteaseWorkerRequest,
  validateNeteaseWorkerResult,
} from './lyrics-provider-netease-runtime-contract.mjs';

function failureObservation(failureCode) {
  return {
    providerId: 'netease',
    request: { status: 'failed', durationMs: 0, failureCode },
    catalogStatus: 'not-evaluated',
    matchBand: null,
    reviewVerdict: null,
    capability: null,
    timingValidation: 'not-applicable',
  };
}

function sendResult(observation, reviewCandidate = null) {
  let result;
  try {
    result = validateNeteaseWorkerResult({
      schemaVersion: 1,
      type: 'result',
      observation,
      reviewCandidate,
    });
  } catch {
    result = {
      schemaVersion: 1,
      type: 'result',
      observation: failureObservation('worker-crash'),
      reviewCandidate: null,
    };
  }
  if (typeof process.send !== 'function') {
    process.exitCode = 1;
    return;
  }
  process.send(result, () => {
    if (process.connected) process.disconnect();
  });
}

let received = false;
process.on('message', async (value) => {
  if (received) {
    process.exitCode = 1;
    if (process.connected) process.disconnect();
    return;
  }
  received = true;
  try {
    const request = validateNeteaseWorkerRequest(value);
    const runtimeRoot = process.env.UTAWAKUI_NETEASE_RUNTIME_ROOT;
    if (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot)) {
      throw new Error('runtime unavailable');
    }
    const runtimeRequire = createRequire(
      path.join(runtimeRoot, 'package.json'),
    );
    const api = runtimeRequire(NETEASE_RUNTIME_PROFILE.packageId);
    let reviewCandidate = null;
    const probe = createNeteaseEvaluationProbe({
      api,
      onCandidateSelected: (value) => {
        reviewCandidate = value;
      },
    });
    const observation = await probe({
      providerId: 'netease',
      reference: request.reference,
    });
    sendResult(observation, reviewCandidate);
  } catch {
    sendResult(failureObservation('worker-crash'));
  }
});
