'use strict';

// Proposes broad sung-language groups from title, lyrics and same-artist
// evidence. Pure: callers supply lyrics text and any manual languages.

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/gu;
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾝ]/gu;
const HAN = /[㐀-䶿一-鿿]/gu;
const LATIN = /[a-zà-ÿ]/giu;

const CREDIT =
  /^(作[词詞曲]|[词詞曲]|编曲|編曲|制作|製作|监制|監製|混音|母带|吉他|贝斯|鼓|和声|和聲|演唱|原唱|歌手|出品|发行|發行|OP|SP|Lyric(s|ist)?|Compos(er|ed)|Arrange(r|d)?|Produc(er|ed)|Written|Vocals?)\s*(by)?\s*[:：]/iu;
// Bilingual credit labels, e.g. "母带工程师 Mastering Engineer: Name".
const CREDIT_LABEL =
  /^[^:：]{0,48}(lyricist|composer|arranger|producer|engineer|studio|vocals?|guitar|bass|drums?|chorus|programming|piano|strings|keyboard|录音|錄音|混音|母带|母帶|和声|和聲|合声|人声|人聲|配唱|吉他|贝斯|貝斯|鼓|编程|編程|制作|製作|统筹|統籌|企划|企劃)[^:：]{0,24}[:：]/iu;
const NOISE = /(著作权|著作權|未经许可|版权|版權|QQ音乐|网易云|TME|酷狗)/u;
const INSTRUMENTAL_LYRICS =
  /纯音乐，?请欣赏|純音樂，?請欣賞|此歌曲为没有填词的纯音乐/u;
const EN_WORDS = new Set(
  "the you i me my your and to a is it in of that on be for we all love baby oh yeah just like what don't can't i'm it's know never want feel when so this with now no ever heart night say go get got let are was do but not up down need make take only one time way".split(
    ' ',
  ),
);
const ROMANIZED_WORDS = new Set(
  'wa ga wo ni de kimi boku watashi anata desu mo yo ne kara made kokoro ai sora hikari yume naku sekai saranghae naega neoui neon nan geu uri hana jigeum'.split(
    ' ',
  ),
);
const OTHER_LATIN =
  /[ñ¿¡àâçèéêëîïôûùüÿœæáíóú]|\b(que|el|los|las|mi|amor|corazón|yo|je|nous|vous|und|ich|nicht|eu|você)\b/iu;

const INSTRUMENTAL =
  /((?<!with )instrumental\b(?! by)|off\s*vocal|\binst\.?(?=$|[\s)\]】])|伴奏|カラオケ|karaoke|純音樂|纯音乐)/iu;
const VERSION_HINTS = [
  ['en', /\b(english|eng)\b[\s.-]*(ver(sion)?\b|ver\.)|英文版|英語版/iu],
  [
    'ja',
    /\b(japanese|jpn?)\b[\s.-]*(ver(sion)?\b|ver\.)|日本語\s*ver|日文版|日語版/iu,
  ],
  ['ko', /\b(korean|kor)\b[\s.-]*(ver(sion)?\b|ver\.)|韓文版|韓語版|한국어/iu],
  [
    'zh',
    /\b(chinese|mandarin|cantonese)\b[\s.-]*(ver(sion)?\b|ver\.)|中文版|國語版|国语版|粵語版|粤语版|華語版/iu,
  ],
];
// Covers, guest features and language versions say little about the artist.
const NOT_ARTIST_TYPICAL = /\b(cover|feat\.?|ft\.)\b|翻唱|ver(sion)?\b|ver\./iu;

const ORDER = ['zh', 'ja', 'ko', 'en', 'other', 'zxx'];
const MIN_LINES = 6;
const SECONDARY_MIN_LINES = 4;
// CJK verses in a Latin song are deliberate; English in CJK songs is often a hook.
const SECONDARY_MIN_SHARE = {
  zh: 0.15,
  ja: 0.15,
  ko: 0.15,
  en: 0.2,
  other: 0.2,
};
const ARTIST_MIN_TRACKS = 5;
const ARTIST_MIN_SHARE = 0.8;

const count = (text, pattern) => text.match(pattern)?.length ?? 0;

// Unique sung lines: timestamps, tags, credits and repeats removed.
function lyricLines(text) {
  const seen = new Set();
  const lines = [];
  for (const raw of String(text ?? '').split(/\r?\n/u)) {
    // NetEase JSON rows ({"t":0,"c":[...]}) only carry credits.
    if (raw.trim().startsWith('{')) continue;
    const line = raw
      .replace(/\[[^\]]*\]|<[^>]*>/gu, '')
      .replace(/^[\d:.,\s\->]+$/u, '')
      .trim();
    if (
      !line ||
      /^WEBVTT/u.test(line) ||
      CREDIT.test(line) ||
      CREDIT_LABEL.test(line) ||
      NOISE.test(line)
    )
      continue;
    const key = line.toLowerCase().replace(/[\p{P}\s]+/gu, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

// One script per line; CJK characters outweigh Latin letters.
function lineScript(line) {
  const ko = count(line, HANGUL) * 2.5;
  const kana = count(line, KANA);
  const han = count(line, HAN);
  const latin = count(line, LATIN);
  const cjk = Math.max(ko, (kana + han) * 2);
  if (!cjk && !latin) return null;
  if (cjk >= latin) {
    if (ko >= (kana + han) * 2) return 'ko';
    return kana ? 'ja' : 'han';
  }
  const words = line.toLowerCase().match(/[a-z']+/gu) ?? [];
  const en = words.filter((word) => EN_WORDS.has(word)).length;
  const romanized = words.filter((word) => ROMANIZED_WORDS.has(word)).length;
  if (romanized > en) return 'romanized';
  return OTHER_LATIN.test(line) && !en ? 'other' : 'en';
}

function lyricsLanguages(text) {
  if (INSTRUMENTAL_LYRICS.test(String(text ?? '')))
    return {
      languages: ['zxx'],
      confidence: 'high',
      evidence: { source: 'lyrics-instrumental' },
    };
  const counts = { zh: 0, ja: 0, ko: 0, en: 0, other: 0, han: 0, romanized: 0 };
  for (const line of lyricLines(text)) {
    const script = lineScript(line);
    if (script) counts[script] += 1;
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total < MIN_LINES) return null;
  const groups = {
    zh: 0,
    ja: counts.ja,
    ko: counts.ko,
    en: counts.en,
    other: counts.other,
  };
  // Han-only lines follow the kana; romanized lines follow a CJK song.
  if (counts.ja >= 3) groups.ja += counts.han;
  else groups.zh += counts.han;
  if (groups.ja) groups.ja += counts.romanized;
  else if (groups.ko) groups.ko += counts.romanized;
  else if (counts.romanized / total >= 0.5) groups.ja += counts.romanized;
  const top = ORDER.reduce((best, code) =>
    (groups[code] ?? 0) > (groups[best] ?? 0) ? code : best,
  );
  if (!groups[top]) return null;
  const languages = ORDER.filter(
    (code) =>
      code === top ||
      (groups[code] >= SECONDARY_MIN_LINES &&
        groups[code] / total >= SECONDARY_MIN_SHARE[code]),
  );
  const confident = groups[top] / total >= 0.6 || languages.length > 1;
  return {
    languages,
    confidence: confident ? 'high' : 'low',
    evidence: { source: 'lyrics', total, counts },
  };
}

function titleHint(title) {
  const text = String(title ?? '');
  if (INSTRUMENTAL.test(text))
    return { languages: ['zxx'], evidence: { source: 'title-instrumental' } };
  for (const [code, pattern] of VERSION_HINTS)
    if (pattern.test(text))
      return { languages: [code], evidence: { source: 'title-version' } };
  return null;
}

function titleScript(title) {
  const text = String(title ?? '');
  if (count(text, HANGUL)) return 'ko';
  if (count(text, KANA)) return 'ja';
  if (count(text, HAN)) return 'zh';
  return null;
}

function artistKey(artist) {
  return String(artist ?? '')
    .split(/,|&|、| feat\.| ft\.| x /iu)[0]
    .replace(/\s*[(（].*?[)）]\s*/gu, '')
    .trim()
    .toLowerCase();
}

// tracks: [{ id, title, artist, lyricsText?, manual? }] → Map id → candidate.
// Order: manual > title version/instrumental > lyrics > artist > title text.
function inferTrackLanguages(tracks) {
  const results = new Map();
  for (const track of tracks) {
    if (track.manual?.length) {
      results.set(track.id, {
        languages: [...track.manual],
        confidence: 'manual',
        evidence: { source: 'manual' },
      });
      continue;
    }
    const hint = titleHint(track.title);
    if (hint) {
      results.set(track.id, { ...hint, confidence: 'high' });
      continue;
    }
    const lyrics = lyricsLanguages(track.lyricsText);
    if (lyrics) results.set(track.id, lyrics);
  }

  const artists = new Map();
  for (const track of tracks) {
    const result = results.get(track.id);
    const key = artistKey(track.artist);
    if (
      !key ||
      NOT_ARTIST_TYPICAL.test(track.title ?? '') ||
      !result ||
      !(
        result.confidence === 'manual' || result.evidence.source === 'lyrics'
      ) ||
      result.confidence === 'low' ||
      result.languages.includes('zxx')
    )
      continue;
    const entry = artists.get(key) ?? { tracks: 0, languages: {} };
    entry.tracks += 1;
    for (const code of result.languages)
      entry.languages[code] = (entry.languages[code] ?? 0) + 1;
    artists.set(key, entry);
  }

  for (const track of tracks) {
    const current = results.get(track.id);
    if (current && current.confidence !== 'low') continue;
    const entry = NOT_ARTIST_TYPICAL.test(track.title ?? '')
      ? null
      : artists.get(artistKey(track.artist));
    if (entry && entry.tracks >= ARTIST_MIN_TRACKS) {
      const [code, n] = Object.entries(entry.languages).sort(
        (a, b) => b[1] - a[1],
      )[0];
      if (n / entry.tracks >= ARTIST_MIN_SHARE) {
        results.set(track.id, {
          languages: [code],
          confidence: 'low',
          evidence: { source: 'artist', tracks: entry.tracks, matching: n },
        });
        continue;
      }
    }
    if (current) continue;
    const script = titleScript(track.title);
    if (script)
      results.set(track.id, {
        languages: [script],
        confidence: 'low',
        evidence: { source: 'title-script' },
      });
  }
  return results;
}

// Blind precision per evidence source against manually confirmed tracks.
function candidatePrecision(tracks) {
  const labelled = tracks.filter((track) => track.manual?.length);
  const blind = inferTrackLanguages(
    tracks.map((track) => ({ ...track, manual: undefined })),
  );
  const bySource = {};
  for (const track of labelled) {
    const candidate = blind.get(track.id);
    const source = candidate?.evidence.source ?? 'none';
    const entry = (bySource[source] ??= { checked: 0, exact: 0 });
    entry.checked += 1;
    const expected = [...track.manual].sort().join(',');
    if (candidate && [...candidate.languages].sort().join(',') === expected)
      entry.exact += 1;
  }
  return bySource;
}

module.exports = {
  artistKey,
  candidatePrecision,
  inferTrackLanguages,
  lyricLines,
  lyricsLanguages,
  titleHint,
};
