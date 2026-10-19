'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { sha, fileHash } = require('../lyricsAlignmentCandidates/assets.cjs');
const { textCuts } = require('../lyricsAcoustic/protocol.cjs');
const {
  validateFrozenCases,
} = require('../lyricsAlignmentCandidates/qualityRun.cjs');
const {
  acousticEstimatePath,
  loadTrackAcousticEstimate,
} = require('../../../electron/lib/library/lyricsAcousticEstimates');
const decisions = [
  'exact',
  'missing-displayed-lyrics',
  'unperformed-lyrics',
  'different-content',
  'uncertain',
];
function validateLabels(document, manifest) {
  if (
    document.schemaVersion !== 1 ||
    document.corpusSha256 !== manifest.corpusSha256 ||
    !Array.isArray(document.entries) ||
    document.entries.length !== manifest.samples.length
  )
    throw Error('review corpus identity');
  const seen = new Set();
  for (const entry of document.entries) {
    const sample = manifest.samples.find((s) => s.sampleId === entry.sampleId);
    if (
      !sample ||
      seen.has(entry.sampleId) ||
      !['pending', 'reviewed'].includes(entry.status) ||
      !Array.isArray(entry.onsets) ||
      entry.onsets.length !== sample.cuts.length ||
      typeof entry.notes !== 'string' ||
      entry.notes.length > 4000
    )
      throw Error('review row');
    seen.add(entry.sampleId);
    let previous = -1;
    for (let i = 0; i < entry.onsets.length; i++) {
      const onset = entry.onsets[i];
      if (
        onset.from !== sample.cuts[i] ||
        (onset.timeMs !== null &&
          (!Number.isSafeInteger(onset.timeMs) ||
            onset.timeMs < 0 ||
            onset.timeMs > sample.durationMs ||
            onset.timeMs < previous))
      )
        throw Error('review onset');
      if (onset.timeMs !== null) previous = onset.timeMs;
    }
    if (entry.status === 'pending') {
      if (
        entry.reviewerId !== null ||
        entry.content !== null ||
        entry.confidence !== null ||
        entry.onsets.some((o) => o.timeMs !== null)
      )
        throw Error('pending human annotation');
    } else if (
      typeof entry.reviewerId !== 'string' ||
      !/^[\p{L}\p{N}_.-]{1,80}$/u.test(entry.reviewerId) ||
      !decisions.includes(entry.content) ||
      !['low', 'medium', 'high'].includes(entry.confidence)
    )
      throw Error('reviewed identity and judgment required');
  }
  return document.entries;
}
function reviewLineIndices(item, canonical) {
  // Normal lines all enter review, including non-target rejection and tails.
  return item.variant === 'normal'
    ? canonical.lines.map((_, i) => i)
    : [...new Set([item.targetIndex, 0])];
}
function summarizeHuman(entries) {
  const reviewed = entries.filter((e) => e.status === 'reviewed');
  return {
    total: entries.length,
    reviewed: reviewed.length,
    uncertain: reviewed.filter((e) => e.content === 'uncertain').length,
    manualOnsets: reviewed
      .filter((e) => e.content !== 'uncertain')
      .flatMap((e) => e.onsets)
      .filter((o) => o.timeMs !== null).length,
  };
}
function validateKey(manifest, key) {
  if (
    !Array.isArray(key.rows) ||
    key.rows.length !== manifest.samples.length ||
    sha(JSON.stringify(key.rows)) !== manifest.keyRowsSha256
  )
    throw Error('review key identity');
  const ids = new Set();
  for (const row of key.rows) {
    if (
      !manifest.samples.some((s) => s.sampleId === row.sampleId) ||
      ids.has(row.sampleId) ||
      !Array.isArray(row.methods) ||
      row.methods.length !== 2 ||
      [...row.methods].sort().join(',') !== 'qwen,qwen-small'
    )
      throw Error('review key rows');
    ids.add(row.sampleId);
  }
}
async function validateCandidate(root, item, prior) {
  const filename = prior.canonical.source.filename,
    source = { filename, kind: 'manual', offsetMs: item.offsetMs ?? 0 };
  if (filename !== 'main.vtt' || !/^[a-z0-9-]{1,100}$/i.test(item.id))
    throw Error('review source identity');
  const side = JSON.parse(
    fs.readFileSync(acousticEstimatePath(root, filename)),
  );
  if (
    JSON.stringify(
      await loadTrackAcousticEstimate(root, source, { method: side.method }),
    ) !== JSON.stringify(prior.estimate) ||
    (await fileHash(path.join(root, 'audio.wav'))) !== side.audio.sha256 ||
    (await fileHash(path.join(root, 'lyrics', filename))) !==
      prior.canonical.source.sha256 ||
    prior.canonical.lines.some((l, i) =>
      ['lineId', 'text', 'startMs', 'endMs'].some(
        (k) => l[k] !== side.lines[i]?.[k],
      ),
    )
  )
    throw Error('review frozen audio/source');
  return side;
}
async function exportPacket(root) {
  const packet = path.join(root, 'human-review');
  if (fs.existsSync(packet)) throw Error('new review packet required');
  const input = fs.readFileSync(path.join(root, 'cases.json')),
    items = JSON.parse(input),
    qbytes = fs.readFileSync(path.join(root, 'qwen/results.json')),
    sbytes = fs.readFileSync(path.join(root, 'qwen-small/results.json')),
    q = JSON.parse(qbytes),
    s = JSON.parse(sbytes);
  if (
    q.inputSha256 !== sha(input) ||
    s.inputSha256 !== sha(input) ||
    q.cases.length !== items.length ||
    s.cases.length !== items.length
  )
    throw Error('review input binding');
  validateFrozenCases(items, q, { 'qwen-small': s });
  const audioHashes = new Map();
  for (let i = 0; i < items.length; i++) {
    const a = await validateCandidate(
      path.join(root, 'qwen', items[i].id),
      items[i],
      q.cases[i],
    );
    const b = await validateCandidate(
      path.join(root, 'qwen-small', items[i].id),
      items[i],
      s.cases[i],
    );
    if (a.audio.sha256 !== b.audio.sha256) throw Error('review paired audio');
    audioHashes.set(items[i].id, a.audio.sha256);
  }
  fs.mkdirSync(path.join(packet, 'audio'), { recursive: true });
  fs.mkdirSync(path.join(packet, 'proposals-after-annotation'), {
    recursive: true,
  });
  const rows = items
    .flatMap((item, index) =>
      reviewLineIndices(item, q.cases[index].canonical).map((lineIndex) => ({
        item,
        index,
        lineIndex,
        order: sha(`${item.id}:${lineIndex}:blind-v1`),
      })),
    )
    .sort((a, b) => a.order.localeCompare(b.order));
  const samples = [],
    key = [],
    entries = [],
    body = [];
  for (let i = 0; i < rows.length; i++) {
    const { item, index, lineIndex } = rows[i],
      sampleId = `r-${String(i + 1).padStart(3, '0')}`,
      line = q.cases[index].canonical.lines[lineIndex],
      cuts = textCuts(line.text, item.language).filter(
        (from) => from > 0 && from < line.text.length,
      ),
      reverse = parseInt(rows[i].order[0], 16) % 2 === 1;
    const audioPath = path.join(packet, 'audio', `${sampleId}.wav`);
    fs.copyFileSync(path.join(root, 'qwen', item.id, 'audio.wav'), audioPath);
    if ((await fileHash(audioPath)) !== audioHashes.get(item.id))
      throw Error('review copied audio changed');
    const methods = reverse ? ['qwen-small', 'qwen'] : ['qwen', 'qwen-small'];
    const proposals = {};
    for (let m = 0; m < 2; m++) {
      const result = methods[m] === 'qwen' ? q : s,
        preview = result.cases[index].estimate.preview.lines[lineIndex],
        label = m === 0 ? 'A' : 'B';
      proposals[label] = {
        ready: preview.status === 'ready',
        chunks: preview.chunks.map((c) => ({
          from: c.from,
          to: c.to,
          startMs: c.startMs,
        })),
      };
      const tsv = preview.chunks
        .map(
          (c, j, a) =>
            `${(c.startMs / 1000).toFixed(3)}\t${((a[j + 1]?.startMs ?? line.endMs) / 1000).toFixed(3)}\t${line.text.slice(c.from, c.to).replace(/[\t\r\n]/gu, ' ')}`,
        )
        .join('\n');
      fs.writeFileSync(
        path.join(
          packet,
          'proposals-after-annotation',
          `${sampleId}-${label}.txt`,
        ),
        tsv,
      );
    }
    samples.push({
      sampleId,
      language: item.language,
      text: line.text,
      startMs: line.startMs,
      endMs: line.endMs,
      durationMs: item.durationMs,
      cuts,
      audio: `audio/${sampleId}.wav`,
      audioSha256: await fileHash(audioPath),
      proposals,
    });
    key.push({
      sampleId,
      caseId: item.id,
      songId: item.songId,
      variant: item.variant,
      lineIndex,
      isTarget: lineIndex === item.targetIndex,
      methods,
    });
    entries.push({
      sampleId,
      status: 'pending',
      reviewerId: null,
      content: null,
      onsets: cuts.map((from) => ({ from, timeMs: null })),
      confidence: null,
      notes: '',
    });
    body.push(
      `## ${sampleId}\n\n[播放音訊](audio/${sampleId}.wav)；句子區間 ${(line.startMs / 1000).toFixed(3)}–${(line.endMs / 1000).toFixed(3)} 秒。\n\n${line.text}\n\n待標內部詞塊索引：${cuts.join(', ')}（UTF-16，索引與文字詳見 manifest.json）。\n`,
    );
  }
  const manifest = {
    schemaVersion: 1,
    corpusSha256: sha(input),
    resultSha256: {
      qwen: sha(qbytes),
      small: sha(sbytes),
    },
    keyRowsSha256: sha(JSON.stringify(key)),
    samples,
  };
  fs.writeFileSync(
    path.join(packet, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  fs.writeFileSync(
    path.join(packet, 'labels.json'),
    JSON.stringify(
      { schemaVersion: 1, corpusSha256: manifest.corpusSha256, entries },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(root, 'review-key.json'),
    JSON.stringify(
      { manifestSha256: sha(JSON.stringify(manifest, null, 2)), rows: key },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(packet, 'README.md'),
    `# 歌詞盲查\n\n目前全部 pending；本工具沒有代替人工聽查。${samples.length} 列來自 4 首歌的 16 個成對衍生情境，不是 ${samples.length} 首獨立歌曲。正常案例全句納入，覆蓋非目標誤拒與長尾；衍生案例納入目標與控制句。音訊、歌詞僅在本機研究目錄，請勿隨產品或公開報告分發。\n\n1. 先聽音訊，再判斷指定句的內容；不要先看 proposals-after-annotation，避免模型時間造成錨定。\n2. 編輯 labels.json：status 改 reviewed，填 reviewerId、confidence（low／medium／high）。content 選 exact（文字與唱詞一致）、missing-displayed-lyrics（唱了但文字缺詞）、unperformed-lyrics（有文字卻沒唱）、different-content（唱詞不同）、uncertain（無法確認）。同音、簡繁、假名異寫請記 notes，無法確定時選 uncertain。\n3. 使用波形／循環播放，為可辨認的內部詞塊填 onsets.timeMs（音檔起點起算毫秒）。from 是原始 UTF-16 索引，不可改動；拖音的母音延續不算新詞起音。聽不清填 null，不猜測，不抄模型時間。可填 0–30000，超出原 T1 句界也能記錄。\n4. 完成獨立標記後，再把 proposals-after-annotation 的 A／B TSV 匯入 Audacity 比較。A／B 按列盲排，方法與構造情境對照表在包外 review-key.json，先勿查看。沒有 TSV 標籤代表該候選回退 T1。\n5. 執行 node scripts/research/lyricsFreshEvaluation/review.cjs import <研究根目錄> <labels.json> <全新輸出.json>。輸入與音檔雜湊、列 ID、詞塊索引、時間範圍、完整性均驗證；pending／uncertain 不進準確率分母。先抽查所有目標列及同情境控制列，再揭盲。\n\n人工誤接受：文字未唱／內容不同卻仍出詞塊；誤拒：人工確認相符且原 Qwen 已出詞塊，內容檢查後回退。文字少詞另算完整性缺漏，不把正確的剩餘詞塊全部算錯。時間以固定人工可標索引為分母，另報未輸出及 >500／>1000ms 長尾。重複片語的不同出現位置須分開標，無法區別時留 null。\n\n${body.join('\n')}`,
  );
  console.log(
    JSON.stringify({
      samples: samples.length,
      pending: entries.length,
      manualOnsets: 0,
    }),
  );
}
async function importLabels(root, labelsFile, outputFile) {
  if (!path.isAbsolute(outputFile) || fs.existsSync(outputFile))
    throw Error('new absolute review receipt required');
  const packet = path.join(root, 'human-review'),
    mb = fs.readFileSync(path.join(packet, 'manifest.json')),
    manifest = JSON.parse(mb),
    key = JSON.parse(fs.readFileSync(path.join(root, 'review-key.json')));
  if (sha(mb) !== key.manifestSha256) throw Error('review manifest changed');
  validateKey(manifest, key);
  for (const [kind, name] of [
    ['qwen', 'qwen'],
    ['small', 'qwen-small'],
  ])
    if (
      (await fileHash(path.join(root, name, 'results.json'))) !==
      manifest.resultSha256[kind]
    )
      throw Error('review candidate changed');
  for (const sample of manifest.samples) {
    if (
      !/^audio\/r-\d{3}\.wav$/.test(sample.audio) ||
      (await fileHash(path.join(packet, sample.audio))) !== sample.audioSha256
    )
      throw Error('review audio changed');
  }
  if (fs.statSync(labelsFile).size > 2097152)
    throw Error('review labels budget');
  const bytes = fs.readFileSync(labelsFile),
    entries = validateLabels(JSON.parse(bytes), manifest),
    human = summarizeHuman(entries),
    methods = {};
  for (const method of ['qwen', 'qwen-small']) {
    let mismatch = 0,
      falseAccept = 0,
      exactEligible = 0,
      falseReject = 0,
      requested = 0,
      missing = 0;
    const errors = [];
    for (const entry of entries.filter(
      (e) => e.status === 'reviewed' && e.content !== 'uncertain',
    )) {
      const sample = manifest.samples.find(
          (s) => s.sampleId === entry.sampleId,
        ),
        mapping = key.rows.find((r) => r.sampleId === entry.sampleId),
        label = mapping.methods.indexOf(method) === 0 ? 'A' : 'B',
        proposal = sample.proposals[label];
      if (['unperformed-lyrics', 'different-content'].includes(entry.content)) {
        mismatch++;
        if (proposal.ready) falseAccept++;
        continue;
      }
      if (entry.content === 'exact') {
        const base =
          sample.proposals[mapping.methods.indexOf('qwen') === 0 ? 'A' : 'B'];
        if (base.ready) {
          exactEligible++;
          if (!proposal.ready) falseReject++;
        }
      }
      for (const onset of entry.onsets.filter((o) => o.timeMs !== null)) {
        requested++;
        const start = proposal.chunks.find(
          (c) => c.from === onset.from,
        )?.startMs;
        if (start === undefined) missing++;
        else errors.push(Math.abs(start - onset.timeMs));
      }
    }
    methods[method] = {
      mismatch,
      falseAccept,
      exactEligible,
      falseReject,
      requested,
      missing,
      measured: errors.length,
      within100: errors.filter((e) => e <= 100).length,
      over500: errors.filter((e) => e > 500).length,
      over1000: errors.filter((e) => e > 1000).length,
    };
  }
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      {
        schemaVersion: 1,
        human,
        methods,
        labelsSha256: sha(bytes),
        manifestSha256: sha(mb),
        validatorSha256: await fileHash(__filename),
        identityNote: 'submitted reviewer IDs; not independently authenticated',
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  console.log(JSON.stringify(human));
}
if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  (command === 'export'
    ? exportPacket(...args)
    : command === 'import'
      ? importLabels(...args)
      : Promise.reject(Error('export or import required'))
  ).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
module.exports = {
  reviewLineIndices,
  validateLabels,
  summarizeHuman,
  validateKey,
  validateCandidate,
  exportPacket,
  importLabels,
};
