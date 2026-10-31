import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  buildKugouLineQueryPlan,
  evaluateKugouLineIdentity,
  evaluateKugouLineLyricsIdentity,
} from './lyrics-provider-kugou-query.mjs';
import {
  createKugouLineVariantEvaluationProbe,
  createKugouLineEvaluationProbe,
} from './lyrics-provider-kugou.mjs';

const reference = {
  title: 'Song (feat. Guest)',
  artist: '리드 (Lead), Guest',
  album: null,
  durationSeconds: 180,
  version: 'studio',
};
const input = { providerId: 'kugou', reference };
const song = { title: 'Song', artist: 'Lead、Guest', durationSeconds: 180 };
const json = (value) => new Response(JSON.stringify(value));
function transport() {
  return vi.fn(async (url) => {
    if (url.hostname === 'mobileservice.kugou.com') {
      const found = url.searchParams.get('keyword') === 'Lead Song';
      return json({
        data: {
          info: found
            ? [
                {
                  hash: 'a'.repeat(32),
                  songname: song.title,
                  singername: song.artist,
                  duration: 180,
                },
              ]
            : [],
        },
      });
    }
    if (url.pathname === '/search')
      return json({
        candidates: [{ id: '1', accesskey: 'private', duration: 180000 }],
      });
    return json({
      content: Buffer.from(
        '[ti:Song (feat. Guest)]\n[ar:Lead]\n[00:01]Synthetic first\n[00:03]Synthetic second',
      ).toString('base64'),
    });
  });
}
describe('isolated Kugou query identity', () => {
  it.each([
    '现场版',
    '現場版',
    'ライブ',
    '라이브',
    'カバー',
    '翻唱版',
    '리믹스',
    '伴奏版',
    'アコースティック',
    'リマスター',
    '合唱版',
  ])(
    'does not reinterpret version marker %s as a translated title alias',
    (label) => {
      const ref = {
        reference: { ...reference, title: 'Song', artist: 'Lead' },
      };
      expect(
        evaluateKugouLineLyricsIdentity(
          ref,
          { ti: `Song (${label})`, ar: 'Lead' },
          { title: 'Song', artist: 'Lead', durationSeconds: 180 },
        ),
      ).toBe(false);
    },
  );
  it.each([
    'zh-qingtian-canonical',
    'ja-yoru-canonical',
    'ko-spring-canonical',
    'en-closer-canonical',
  ])(
    'rejects wrong artist, artist prefixes, versions and sequels for %s',
    (id) => {
      const corpus = JSON.parse(
        fs.readFileSync(
          new URL(
            './fixtures/lyrics-provider-evaluation/kugou-multilingual.json',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      const { reference: ref, gold } = corpus.cases.find(
        (row) => row.id === id,
      );
      for (const candidate of [
        {
          title: gold.title,
          artist: 'Unrelated Performer',
          durationSeconds: ref.durationSeconds,
        },
        {
          title: gold.title,
          artist: `${gold.artist} Tribute`,
          durationSeconds: ref.durationSeconds,
        },
        {
          title: `${gold.title} (Live)`,
          artist: gold.artist,
          durationSeconds: ref.durationSeconds,
        },
        {
          title: `${gold.title} Part 2`,
          artist: gold.artist,
          durationSeconds: ref.durationSeconds,
        },
      ])
        expect(
          evaluateKugouLineIdentity({ reference: ref }, candidate).accepted,
        ).toBe(false);
    },
  );
  it('uses slash-separated lyric credits only when each belongs to the proved catalog', () => {
    expect(
      evaluateKugouLineLyricsIdentity(
        input,
        { ti: 'Song', ar: 'Lead/Guest' },
        song,
      ),
    ).toBe(true);
    expect(
      evaluateKugouLineLyricsIdentity(
        input,
        { ti: 'Song', ar: 'Lead/Other' },
        song,
      ),
    ).toBe(false);
    const band = {
      reference: { ...reference, title: 'Song', artist: 'AC/DC' },
    };
    expect(
      evaluateKugouLineLyricsIdentity(
        band,
        { ti: 'Song', ar: 'AC/DC' },
        { title: 'Song', artist: 'AC/DC', durationSeconds: 180 },
      ),
    ).toBe(true);
  });
  it('rejects real-world cross-script lyric labels that introduce Live after a studio catalog match', () => {
    const ref = {
      reference: {
        ...reference,
        title: 'DDU-DU DDU-DU (뚜두뚜두)',
        artist: 'BLACKPINK',
      },
    };
    expect(
      evaluateKugouLineLyricsIdentity(
        ref,
        { ti: 'DDU-DU DDU-DU(Live)', ar: 'BLACKPINK' },
        {
          title: '뚜두뚜두 (DDU-DU DDU-DU)',
          artist: 'BLACKPINK',
          durationSeconds: 180,
        },
      ),
    ).toBe(false);
  });
  it('keeps the frozen four-language corpus and review gold out of discovery input', () => {
    const corpus = JSON.parse(
      fs.readFileSync(
        new URL(
          './fixtures/lyrics-provider-evaluation/kugou-multilingual.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(corpus.cases).toHaveLength(26);
    expect(new Set(corpus.cases.map(({ id }) => id)).size).toBe(26);
    expect(new Set(corpus.cases.map(({ language }) => language))).toEqual(
      new Set(['zh', 'ja', 'ko', 'en']),
    );
    for (const row of corpus.cases) {
      const snapshot = structuredClone(row.reference);
      const plan = buildKugouLineQueryPlan({ reference: row.reference });
      expect(plan.length).toBeLessThanOrEqual(3);
      expect(plan[0]).toMatchObject({
        title: row.reference.title,
        artist: row.reference.artist,
      });
      expect(row.reference).toEqual(snapshot);
    }
  });
  it('derives at most three queries from declared aliases and full credits', () => {
    expect(buildKugouLineQueryPlan(input)).toEqual([
      { reason: 'original', title: reference.title, artist: reference.artist },
      { reason: 'canonical-credit', title: 'Song', artist: 'Lead, Guest' },
      { reason: 'lead-credit', title: 'Song', artist: 'Lead' },
    ]);
  });
  it('cannot invent a Japanese translation for a lone romanized name', () => {
    const original = { ...reference, title: 'Hana No Uta', artist: 'Aimer' };
    expect(buildKugouLineQueryPlan({ reference: original })).toHaveLength(1);
    expect(
      buildKugouLineQueryPlan({
        reference: { ...original, title: 'Hana No Uta (花の唄)' },
      }),
    ).toContainEqual({
      reason: 'canonical-credit',
      title: '花の唄',
      artist: 'Aimer',
    });
  });
  it('supports bounded explicit metadata aliases without turning them into a dictionary', () => {
    const query = {
      reference: { ...reference, title: 'Hana No Uta', artist: 'Aimer' },
      aliases: { title: ['花の唄'] },
    };
    expect(buildKugouLineQueryPlan(query)).toHaveLength(2);
    expect(
      evaluateKugouLineIdentity(query, {
        title: '花の唄',
        artist: 'Aimer',
        durationSeconds: 180,
      }).accepted,
    ).toBe(true);
    expect(() =>
      buildKugouLineQueryPlan({
        ...query,
        aliases: { title: Array(5).fill('alias') },
      }),
    ).toThrow();
  });
  it.each([
    { ...song, artist: 'Guest' },
    { ...song, artist: 'Other Lead、Guest' },
    { ...song, artist: 'Lead Tribute、Guest' },
    { ...song, artist: 'Lead、Different Guest' },
    { ...song, title: 'Song Part 2' },
    { ...song, title: 'Song (Live)' },
    { ...song, title: 'Song (Remix)' },
    { ...song, durationSeconds: 190 },
  ])('rejects weaker artist/recording evidence %j', (candidate) => {
    expect(evaluateKugouLineIdentity(input, candidate).accepted).toBe(false);
  });
  it('accepts complete reordered credits but rejects a collaborator-only request', () => {
    expect(
      evaluateKugouLineIdentity(input, { ...song, artist: 'Guest、Lead' })
        .accepted,
    ).toBe(true);
    expect(
      evaluateKugouLineIdentity(
        { reference: { ...reference, title: 'Song', artist: 'Guest' } },
        song,
      ).accepted,
    ).toBe(false);
  });
  it('matches Chinese script variants and cross-script artist aliases exactly', () => {
    expect(
      evaluateKugouLineIdentity(
        {
          reference: {
            ...reference,
            title: '晴天',
            artist: '周杰倫 (Jay Chou)',
          },
        },
        { title: '晴天', artist: '周杰伦', durationSeconds: 180 },
      ).accepted,
    ).toBe(true);
  });
  it('does not strip a version label as if it were a cross-script title alias', () => {
    const ref = {
      ...reference,
      title: '花の唄 (Live)',
      artist: 'Aimer',
      version: 'live',
    };
    expect(
      buildKugouLineQueryPlan({ reference: ref }).every(({ title }) =>
        title.includes('Live'),
      ),
    ).toBe(true);
    expect(
      evaluateKugouLineIdentity(
        { reference: ref },
        { title: '花の唄', artist: 'Aimer', durationSeconds: 180 },
      ).accepted,
    ).toBe(false);
  });
  it('checks an explicit version intent even when a title omits its label', () => {
    expect(
      evaluateKugouLineIdentity(
        {
          reference: {
            ...reference,
            title: 'Song',
            artist: 'Lead',
            version: 'live',
          },
        },
        { title: 'Song', artist: 'Lead', durationSeconds: 180 },
      ).accepted,
    ).toBe(false);
  });
  it('does not treat an alternate exploration query as identity evidence', async () => {
    const fetch = transport();
    const probe = createKugouLineEvaluationProbe({
      fetch,
      scheduler: { schedule: (task) => task() },
    });
    expect(
      await probe({
        ...input,
        reference: { ...reference, artist: 'Other Lead, Guest' },
        query: { title: 'Song', artist: 'Lead' },
      }),
    ).toMatchObject({ catalogStatus: 'miss' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not accept a collaborator-only catalog result through substring matching', async () => {
    const values = [
      {
        data: {
          info: [
            {
              hash: 'a'.repeat(32),
              songname: 'Song',
              singername: 'Guest',
              duration: 180,
            },
          ],
        },
      },
      { candidates: [{ id: '1', accesskey: 'private', duration: 180000 }] },
      {
        content: Buffer.from(
          '[ti:Song]\n[ar:Guest]\n[00:01]First\n[00:03]Second',
        ).toString('base64'),
      },
    ];
    const fetch = vi.fn(async () => json(values.shift()));
    const probe = createKugouLineEvaluationProbe({
      fetch,
      scheduler: { schedule: (task) => task() },
    });
    expect(await probe(input)).toMatchObject({ catalogStatus: 'miss' });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
describe('isolated adaptive Kugou discovery', () => {
  it('counts an original miss and a bounded automatic rescue against one shared budget', async () => {
    const fetch = transport();
    const evidence = vi.fn();
    const probe = createKugouLineVariantEvaluationProbe({
      fetch,
      scheduler: { schedule: (task) => task() },
      onEvidence: evidence,
    });
    const result = await probe(input);
    expect(result).toMatchObject({
      baseline: { catalogStatus: 'miss' },
      result: { capability: 'T1', catalogStatus: 'match' },
      autoRescued: true,
      httpAttempts: 5,
      queryCount: 3,
    });
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(evidence).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toMatch(/private|Synthetic first|리드/);
  });
  it('does not launch subsequent variants after exhausting the physical request budget', async () => {
    const fetch = transport();
    const probe = createKugouLineVariantEvaluationProbe({
      fetch,
      scheduler: { schedule: (task) => task() },
      maxAttempts: 3,
    });
    expect(await probe(input)).toMatchObject({
      autoRescued: false,
      httpAttempts: 3,
      result: { request: { failureCode: 'request-budget-exhausted' } },
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('stops on a provider failure rather than changing keywords to evade it', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, { status: 503, headers: { 'Retry-After': '60' } }),
    );
    const probe = createKugouLineVariantEvaluationProbe({
      fetch,
      scheduler: { schedule: (task) => task() },
    });
    expect(await probe(input)).toMatchObject({
      queryCount: 1,
      autoRescued: false,
      httpAttempts: 1,
      result: { request: { failureCode: 'service-unavailable' } },
    });
    expect(await probe(input)).toMatchObject({ httpAttempts: 0 });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('expires the whole variant operation and releases its timer', async () => {
    const fetch = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          }),
        ),
    );
    const probe = createKugouLineVariantEvaluationProbe({
      fetch,
      scheduler: { schedule: (task) => task() },
      deadlineMs: 5,
    });
    expect(await probe(input)).toMatchObject({
      result: { request: { failureCode: 'timeout' } },
      httpAttempts: 1,
    });
  });
});
