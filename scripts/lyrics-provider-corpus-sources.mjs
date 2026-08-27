const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 60_000;
const USER_AGENT =
  'UtawakuiLyricsEvaluation/0.1 (local evaluation; https://github.com/llazyPilot/Utawakui)';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ENTITY_URI_RE = /^http:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/u;

const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>`;

function chineseWorkQuery(body) {
  return `${PREFIXES}
SELECT DISTINCT ?work ?workMbid WHERE {
  VALUES ?language { wd:Q7850 wd:Q9192 wd:Q9186 }
  ?work wdt:P435 ?workMbid;
        wdt:P407 ?language.
  ${body}
}
ORDER BY ?work ?workMbid
LIMIT 250`;
}

function languageWorkQuery(languageId) {
  return `${PREFIXES}
SELECT DISTINCT ?work ?workMbid WHERE {
  ?work wdt:P435 ?workMbid;
        wdt:P407 wd:${languageId}.
  FILTER NOT EXISTS {
    ?work wdt:P407 ?otherLanguage.
    FILTER (?otherLanguage != wd:${languageId})
  }
}
ORDER BY ?work ?workMbid
LIMIT 250`;
}

export const WIKIDATA_DISCOVERY_QUERIES = Object.freeze({
  'chinese-rap': Object.freeze({
    seedType: 'work',
    query: chineseWorkQuery('?work wdt:P136 wd:Q11401.'),
  }),
  'chinese-pop': Object.freeze({
    seedType: 'work',
    query: chineseWorkQuery(`?work wdt:P136 wd:Q37073.
  FILTER NOT EXISTS { ?work wdt:P136 wd:Q11401. }`),
  }),
  'english-catalog': Object.freeze({
    seedType: 'work',
    query: languageWorkQuery('Q1860'),
  }),
  'japanese-catalog': Object.freeze({
    seedType: 'work',
    query: languageWorkQuery('Q5287'),
  }),
  'korean-catalog': Object.freeze({
    seedType: 'work',
    query: languageWorkQuery('Q9176'),
  }),
});

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

function hasExactKeys(value, expectedKeys) {
  return (
    isPlainObject(value) &&
    Object.keys(value).length === expectedKeys.length &&
    Object.keys(value).every((key) => expectedKeys.includes(key))
  );
}

async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel();
  } catch {
    // Best-effort resource cleanup; the public failure remains categorical.
  }
}

function sourceFailure(message, options = {}) {
  const error = new TypeError(message, { cause: options.cause });
  Object.defineProperty(error, 'retryable', {
    value: options.retryable === true,
  });
  return error;
}

function parseRetryAfterMs(value) {
  if (typeof value !== 'string' || value.trim().length < 1) return null;
  const normalized = value.trim();
  if (/^\d+(?:\.\d+)?$/u.test(normalized)) {
    return Math.min(Math.ceil(Number(normalized) * 1_000), MAX_RETRY_AFTER_MS);
  }
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(Math.max(0, timestamp - Date.now()), MAX_RETRY_AFTER_MS);
}

function defaultWait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function readBoundedText(response) {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) ||
      Number(contentLength) > MAX_RESPONSE_BYTES)
  ) {
    await cancelResponseBody(response);
    throw new TypeError('Wikidata response is too large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      let result;
      try {
        result = await reader.read();
      } catch (error) {
        throw sourceFailure('Wikidata response stream failed', {
          cause: error,
          retryable: true,
        });
      }
      const { done, value } = result;
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new TypeError('Wikidata response is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function parseBinding(binding, definition, stratum) {
  const variable = definition.seedType;
  const mbidVariable = `${variable}Mbid`;
  if (!hasExactKeys(binding, [variable, mbidVariable])) {
    throw new TypeError('Wikidata binding has invalid fields');
  }
  const entity = binding[variable];
  const mbid = binding[mbidVariable];
  if (
    !hasExactKeys(entity, ['type', 'value']) ||
    entity.type !== 'uri' ||
    typeof entity.value !== 'string'
  ) {
    throw new TypeError('Wikidata entity binding is invalid');
  }
  const entityMatch = ENTITY_URI_RE.exec(entity.value);
  if (
    !entityMatch ||
    !hasExactKeys(mbid, ['type', 'value']) ||
    mbid.type !== 'literal' ||
    typeof mbid.value !== 'string' ||
    !UUID_RE.test(mbid.value)
  ) {
    throw new TypeError('Wikidata identifier binding is invalid');
  }
  return {
    stratum,
    seedType: definition.seedType,
    wikidataId: entityMatch[1],
    musicbrainzId: mbid.value.toLowerCase(),
  };
}

function parseSeedResponse(value, definition, stratum) {
  if (
    !hasExactKeys(value, ['head', 'results']) ||
    !isPlainObject(value.head) ||
    !Array.isArray(value.head.vars) ||
    !hasExactKeys(value.results, ['bindings']) ||
    !Array.isArray(value.results.bindings) ||
    value.results.bindings.length > 250
  ) {
    throw new TypeError('Wikidata response has invalid fields');
  }
  const deduplicated = new Map();
  for (const binding of value.results.bindings) {
    const seed = parseBinding(binding, definition, stratum);
    deduplicated.set(`${seed.wikidataId}\0${seed.musicbrainzId}`, seed);
  }
  return [...deduplicated.values()].sort(
    (left, right) =>
      left.wikidataId.localeCompare(right.wikidataId) ||
      left.musicbrainzId.localeCompare(right.musicbrainzId),
  );
}

export async function fetchWikidataCandidateSeeds(stratum, options = {}) {
  const definition = WIKIDATA_DISCOVERY_QUERIES[stratum];
  if (!definition) throw new TypeError('candidate stratum is invalid');
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  if (typeof fetchFn !== 'function')
    throw new TypeError('fetch is unavailable');
  const waitFn = options.waitFn ?? defaultWait;
  if (typeof waitFn !== 'function') {
    throw new TypeError('Wikidata retry wait is invalid');
  }
  const url = new URL(WIKIDATA_ENDPOINT);
  url.searchParams.set('format', 'json');
  url.searchParams.set('query', definition.query);
  let text;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let retryAfterMs = null;
    let retryDelayMs;
    try {
      let response;
      try {
        response = await fetchFn(url.toString(), {
          method: 'GET',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            accept: 'application/sparql-results+json',
            'user-agent': USER_AGENT,
          },
        });
      } catch (error) {
        throw sourceFailure(
          controller.signal.aborted
            ? 'Wikidata request timed out'
            : 'Wikidata request failed',
          { cause: error, retryable: !controller.signal.aborted },
        );
      }
      retryAfterMs = parseRetryAfterMs(response?.headers?.get('retry-after'));
      if (!response?.ok) {
        await cancelResponseBody(response);
        const retryable =
          response?.status === 429 ||
          [500, 502, 503, 504].includes(response?.status);
        throw sourceFailure('Wikidata request failed', { retryable });
      }
      try {
        text = await readBoundedText(response);
      } catch (error) {
        if (controller.signal.aborted) {
          throw sourceFailure('Wikidata request timed out', { cause: error });
        }
        throw error;
      }
      break;
    } catch (error) {
      if (error?.retryable !== true || attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }
      retryDelayMs = retryAfterMs ?? 1_000 * 2 ** attempt;
    } finally {
      clearTimeout(timeout);
    }
    await waitFn(retryDelayMs);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError('Wikidata returned invalid JSON');
  }
  return parseSeedResponse(value, definition, stratum);
}
