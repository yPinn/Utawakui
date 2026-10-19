/* global LISTENING_PACKET, validateListeningLabels, document */
'use strict';
function formDraft(sample, fields) {
  if (
    typeof fields.notes !== 'string' ||
    fields.notes.length > 4000 ||
    ![
      '',
      'exact',
      'missing-displayed-lyrics',
      'unperformed-lyrics',
      'different-content',
      'uncertain',
    ].includes(fields.content ?? '') ||
    !['', 'low', 'medium', 'high'].includes(fields.confidence ?? '')
  )
    throw Error('草稿欄位無效。');
  const onsets = sample.cuts.map((from, i) => {
    const value = String(fields.onsets?.[i] ?? '').trim();
    if (value && !/^\d+(?:\.\d{1,3})?$/.test(value))
      throw Error('起音請填非負秒數，最多三位小數。');
    const timeMs = value ? Math.round(Number(value) * 1000) : null;
    if (
      timeMs !== null &&
      (!Number.isSafeInteger(timeMs) || timeMs > sample.durationMs)
    )
      throw Error('起音超出音訊範圍。');
    return { from, timeMs };
  });
  let previous = -1;
  for (const o of onsets)
    if (o.timeMs !== null) {
      if (o.timeMs < previous) throw Error('起音必須依文字順序遞增或相同。');
      previous = o.timeMs;
    }
  return {
    status: fields.reviewed ? 'reviewed' : 'pending',
    content: fields.content ?? '',
    confidence: fields.confidence ?? '',
    notes: fields.notes ?? '',
    onsets,
  };
}
function makeBackup(packet, drafts, reviewer, validate) {
  validate(packet.labels, packet.manifest);
  const clean = {};
  if (
    !drafts ||
    Array.isArray(drafts) ||
    typeof drafts !== 'object' ||
    typeof reviewer !== 'string' ||
    reviewer.length > 80
  )
    throw Error('invalid listening backup');
  for (const [id, draft] of Object.entries(drafts)) {
    const s = packet.samples.find((s) => s.sampleId === id);
    if (
      !s ||
      !['pending', 'reviewed'].includes(draft.status) ||
      !Array.isArray(draft.onsets) ||
      draft.onsets.length !== s.cuts.length ||
      draft.onsets.some(
        (o, i) =>
          o.from !== s.cuts[i] ||
          (o.timeMs !== null && !Number.isSafeInteger(o.timeMs)),
      )
    )
      throw Error('invalid draft sample');
    clean[id] = formDraft(s, {
      reviewed: draft.status === 'reviewed',
      content: draft.content ?? '',
      confidence: draft.confidence ?? '',
      notes: draft.notes,
      onsets: draft.onsets.map((o) =>
        o.timeMs === null ? '' : String(o.timeMs / 1000),
      ),
    });
  }
  return {
    schemaVersion: 1,
    kind: 'utawakui-lyrics-listening-draft',
    packetId: packet.packetId,
    reviewer,
    labels: structuredClone(packet.labels),
    drafts: clean,
  };
}
function readBackup(packet, document, validate) {
  if (
    document?.schemaVersion !== 1 ||
    document.kind !== 'utawakui-lyrics-listening-draft' ||
    document.packetId !== packet.packetId
  )
    throw Error('different listening packet');
  return makeBackup(
    { ...packet, labels: document.labels },
    document.drafts,
    document.reviewer,
    validate,
  );
}
function collectLabels(packet, drafts, reviewer, validate) {
  const labels = structuredClone(packet.labels);
  for (const sample of packet.samples) {
    const draft = drafts[sample.sampleId];
    if (!draft) continue;
    const entry = labels.entries.find((e) => e.sampleId === sample.sampleId);
    if (draft.status === 'reviewed')
      Object.assign(entry, draft, { reviewerId: reviewer });
    else
      Object.assign(entry, {
        status: 'pending',
        reviewerId: null,
        content: null,
        confidence: null,
        notes: draft.notes,
        onsets: sample.cuts.map((from) => ({ from, timeMs: null })),
      });
  }
  validate(labels, packet.manifest);
  return labels;
}
if (typeof module !== 'undefined')
  module.exports = { formDraft, collectLabels, makeBackup, readBackup };
if (typeof document !== 'undefined') {
  const packet = LISTENING_PACKET,
    $ = (id) => document.getElementById(id),
    audio = $('audio');
  const names = {
    qwen: 'Qwen',
    hubertfa: 'HubertFA',
    'qwen-small-fold': 'Qwen＋small',
    'hubertfa-small-fold': 'HubertFA＋small',
  };
  const storageKey = `utawakui-listening-${packet.packetId}`;
  let current = 0,
    drafts = {},
    baseLabels = structuredClone(packet.labels),
    stopAt = null,
    playStart = 0;
  const message = (text) => {
    $('feedback').textContent = text;
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) {
      const valid = readBackup(
        packet,
        {
          schemaVersion: 1,
          kind: 'utawakui-lyrics-listening-draft',
          packetId: packet.packetId,
          ...saved,
        },
        validateListeningLabels,
      );
      baseLabels = valid.labels;
      drafts = valid.drafts;
      $('reviewer').value = valid.reviewer;
    }
  } catch {
    message('無法讀取舊草稿，請載入已匯出的標記。');
  }
  const persist = () => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          drafts,
          labels: baseLabels,
          reviewer: $('reviewer').value,
        }),
      );
      return true;
    } catch {
      message('瀏覽器無法保存草稿，請立即按「備份草稿」。');
      return false;
    }
  };
  function save() {
    const sample = packet.samples[current];
    try {
      drafts[sample.sampleId] = formDraft(sample, {
        content: $('content').value,
        confidence: $('confidence').value,
        notes: $('notes').value,
        reviewed: $('reviewed').checked,
        onsets: [...document.querySelectorAll('[data-onset]')].map(
          (e) => e.value,
        ),
      });
      if (persist()) message('草稿已保存在此瀏覽器；尚未寫入原始標記。');
      updateProgress();
      return true;
    } catch (e) {
      message(e.message);
      return false;
    }
  }
  function updateProgress() {
    let reviewed = 0;
    for (const sample of packet.samples) {
      const e =
        drafts[sample.sampleId] ??
        baseLabels.entries.find((e) => e.sampleId === sample.sampleId);
      const complete = e.status === 'reviewed' && e.content && e.confidence;
      if (complete) reviewed++;
      const b = document.querySelector(`[data-sample="${sample.sampleId}"]`);
      if (b)
        b.textContent = `${sample.sampleId} · ${sample.language === 'zh' ? '中' : '日'}${complete ? ' · 已標記' : ''}`;
    }
    $('progress').textContent = `${reviewed}／${packet.samples.length} 已標記`;
  }
  async function play(start, end) {
    playStart = Math.max(0, start);
    stopAt = Math.min(packet.samples[current].durationMs / 1000, end);
    audio.currentTime = playStart;
    try {
      await audio.play();
    } catch {
      stopAt = null;
      message('音訊無法播放，請確認本機服務仍在執行，或按播放器重試。');
    }
  }
  function render(index) {
    audio.pause();
    stopAt = null;
    current = index;
    const s = packet.samples[index],
      entry =
        drafts[s.sampleId] ??
        baseLabels.entries.find((e) => e.sampleId === s.sampleId);
    $('sample-title').textContent =
      `${s.sampleId} · ${s.group === 'priority' ? '優先聽查' : '漏詞對照'}`;
    $('lyric').textContent = s.text;
    audio.src = s.audio;
    audio.playbackRate = Number($('speed').value);
    audio.onloadedmetadata = () => {
      audio.currentTime = Math.max(0, s.startMs / 1000 - 0.5);
    };
    $('content').value = entry.content ?? '';
    $('confidence').value = entry.confidence ?? '';
    $('notes').value = entry.notes ?? '';
    $('reviewed').checked = entry.status === 'reviewed';
    $('previous').disabled = index === 0;
    $('next').disabled = index === packet.samples.length - 1;
    document
      .querySelectorAll('[data-sample]')
      .forEach((b) =>
        b.setAttribute('aria-current', String(b.dataset.sample === s.sampleId)),
      );
    $('onsets').replaceChildren();
    for (let i = 0; i < s.cuts.length; i++) {
      const tr = document.createElement('tr'),
        word = document.createElement('td'),
        cell = document.createElement('td'),
        action = document.createElement('td'),
        input = document.createElement('input'),
        button = document.createElement('button');
      word.textContent = s.text.slice(
        s.cuts[i],
        s.cuts[i + 1] ?? s.text.length,
      );
      input.type = 'number';
      input.min = '0';
      input.max = String(s.durationMs / 1000);
      input.step = '.001';
      input.dataset.onset = String(s.cuts[i]);
      input.setAttribute('aria-label', `${word.textContent} 起音秒數`);
      input.value =
        entry.onsets[i].timeMs === null
          ? ''
          : (entry.onsets[i].timeMs / 1000).toFixed(3);
      input.addEventListener('change', save);
      button.type = 'button';
      button.textContent = '取目前時間';
      button.addEventListener('click', () => {
        input.value = audio.currentTime.toFixed(3);
        save();
      });
      cell.append(input);
      action.append(button);
      tr.append(word, cell, action);
      $('onsets').append(tr);
    }
    $('comparison').open = false;
    $('reason').textContent = `抽查原因：${s.reason}`;
    $('completeness').textContent =
      s.completeness === 'possible-missing-text'
        ? '低成本檢查：可能漏詞（警示，未更改時間）。'
        : '低成本檢查：未形成漏詞警示；不代表已確認完整。';
    $('proposals').replaceChildren();
    for (const [method, p] of Object.entries(s.proposals)) {
      const section = document.createElement('section'),
        heading = document.createElement('h3'),
        chunks = document.createElement('div');
      section.className = 'proposal';
      heading.textContent = names[method];
      chunks.className = 'chunks';
      if (!p.ready) chunks.textContent = '回退原 T1 顯示；此方法沒有模型詞塊。';
      for (let i = 0; i < p.chunks.length; i++) {
        const c = p.chunks[i],
          b = document.createElement('button'),
          clock = document.createElement('small');
        b.type = 'button';
        b.textContent = s.text.slice(c.from, c.to);
        clock.textContent = `${(c.startMs / 1000).toFixed(3)} s`;
        b.append(clock);
        b.dataset.start = String(c.startMs);
        b.dataset.end = String(p.chunks[i + 1]?.startMs ?? s.endMs);
        b.addEventListener('click', () => {
          audio.currentTime = c.startMs / 1000;
        });
        chunks.append(b);
      }
      section.append(heading, chunks);
      $('proposals').append(section);
    }
    updateProgress();
  }
  for (let i = 0; i < packet.samples.length; i++) {
    const li = document.createElement('li'),
      b = document.createElement('button');
    b.type = 'button';
    b.dataset.sample = packet.samples[i].sampleId;
    b.addEventListener('click', () => {
      if (save()) render(i);
    });
    li.append(b);
    $('samples').append(li);
  }
  for (const id of ['content', 'confidence', 'notes', 'reviewed'])
    $(id).addEventListener('change', save);
  $('reviewer').addEventListener('change', persist);
  $('previous').addEventListener('click', () => {
    if (save()) render(current - 1);
  });
  $('next').addEventListener('click', () => {
    if (save()) render(current + 1);
  });
  $('play-line').addEventListener('click', () => {
    const s = packet.samples[current];
    play(s.startMs / 1000 - 0.5, s.endMs / 1000 + 0.5);
  });
  $('play-context').addEventListener('click', () => {
    const s = packet.samples[current];
    play(s.startMs / 1000 - 2, s.endMs / 1000 + 2);
  });
  $('speed').addEventListener('change', () => {
    audio.playbackRate = Number($('speed').value);
  });
  audio.addEventListener('timeupdate', () => {
    const time = audio.currentTime;
    $('clock').textContent = `${time.toFixed(3)} s`;
    document.querySelectorAll('[data-start]').forEach((b) => {
      b.dataset.active = String(
        time * 1000 >= Number(b.dataset.start) &&
          time * 1000 < Number(b.dataset.end),
      );
    });
    if (stopAt !== null && time >= stopAt) {
      if ($('loop').checked) {
        audio.currentTime = playStart;
        audio.play().catch(() => message('重播未成功，請按播放重試。'));
      } else {
        audio.pause();
        stopAt = null;
      }
    }
  });
  audio.addEventListener('error', () =>
    message('無法載入音訊，請確認聽查服務仍在執行。'),
  );
  $('export').addEventListener('click', () => {
    if (!save()) return;
    try {
      const labels = collectLabels(
          { ...packet, labels: baseLabels },
          drafts,
          $('reviewer').value,
          validateListeningLabels,
        ),
        blob = new Blob([JSON.stringify(labels, null, 2)], {
          type: 'application/json',
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'lyrics-human-labels.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('已匯出標記；原始 labels 與 App 歌詞未改動。');
    } catch {
      message(
        '匯出未完成：已完成的案例需填審查者代號、內容與把握程度；請確認起音範圍與順序。',
      );
    }
  });
  $('draft-export').addEventListener('click', () => {
    if (!save()) return;
    try {
      const backup = makeBackup(
          { ...packet, labels: baseLabels },
          drafts,
          $('reviewer').value,
          validateListeningLabels,
        ),
        blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: 'application/json',
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'lyrics-listening-draft.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('已備份全部草稿，包含未完成的內容與起音；不計入人工結果。');
    } catch {
      message('草稿無法備份，請確認輸入欄位。');
    }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2097152) throw Error('檔案太大');
      const labels = JSON.parse(await file.text());
      if (labels.kind === 'utawakui-lyrics-listening-draft') {
        const backup = readBackup(packet, labels, validateListeningLabels);
        baseLabels = backup.labels;
        drafts = backup.drafts;
        $('reviewer').value = backup.reviewer;
      } else {
        validateListeningLabels(labels, packet.manifest);
        baseLabels = labels;
        drafts = {};
      }
      persist();
      render(current);
      message('已載入相同語料的標記，尚未修改原始檔案。');
    } catch {
      message('標記無法載入：請使用此批語料匯出的有效 JSON。');
    }
    event.target.value = '';
  });
  render(0);
  message('已載入本機音訊。先聽此句，再填內容與獨立起音；完成後匯出 JSON。');
}
