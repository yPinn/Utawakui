import contractValues from '../../shared/musicStructureContractValues.json';

const ROLE_LABELS = Object.freeze({
  intro: '前奏',
  verse: '主歌',
  'pre-chorus': '預副歌',
  chorus: '副歌',
  bridge: '橋段',
  instrumental: '間奏',
  outro: '尾奏',
  unknown: '未分類',
});

const M2_PRESENTATION = Object.freeze({
  current: {
    level: 'M2',
    label: 'M2 可用',
    message: '所有候選段落已通過目前的完整性與信心門檻。',
    tone: 'success',
  },
  missing: {
    level: 'M1',
    label: 'M1 降級',
    message: '模型沒有產生段落。',
    tone: 'warning',
  },
  'low-confidence': {
    level: 'M1',
    label: 'M1 降級',
    message: '段落信心不足，正式 sidecar 會保留 BPM／節拍但不發布段落。',
    tone: 'warning',
  },
  incomplete: {
    level: 'M1',
    label: 'M1 降級',
    message: '段落沒有連續覆蓋完整曲長。',
    tone: 'warning',
  },
  unknown: {
    level: 'M1',
    label: 'M1 降級',
    message: '段落仍含未分類語意。',
    tone: 'warning',
  },
  'analysis-failed': {
    level: 'M1',
    label: '分析失敗',
    message: '此案例沒有可檢視的段落預測。',
    tone: 'danger',
  },
});

export function formatBenchmarkTime(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const totalSeconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function benchmarkRoleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}

export function benchmarkM2Presentation(status) {
  return M2_PRESENTATION[status] ?? M2_PRESENTATION['analysis-failed'];
}

export function projectBenchmarkSections(sections, durationMs) {
  if (
    !Array.isArray(sections) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return [];
  }
  return sections.map((section) => {
    const roleLabel = benchmarkRoleLabel(section.role);
    const confidencePercent = Number.isFinite(section.confidence)
      ? Math.round(section.confidence * 100)
      : null;
    const lowConfidence =
      confidencePercent !== null &&
      section.confidence < contractValues.minM2SectionConfidence;
    const startPercent = Math.max(
      0,
      Math.min(100, (section.startMs / durationMs) * 100),
    );
    const endPercent = Math.max(
      startPercent,
      Math.min(100, (section.endMs / durationMs) * 100),
    );
    const confidenceLabel =
      confidencePercent === null ? '信心未知' : `信心 ${confidencePercent}%`;
    return {
      ...section,
      key: `${section.startMs}-${section.endMs}-${section.role}`,
      roleLabel,
      confidencePercent,
      lowConfidence,
      startPercent,
      widthPercent: endPercent - startPercent,
      showInsideLabel: endPercent - startPercent >= 8,
      ariaLabel: `${roleLabel}，${formatBenchmarkTime(section.startMs)} 到 ${formatBenchmarkTime(section.endMs)}，${confidenceLabel}${lowConfidence ? '，低於 M2 門檻' : ''}`,
    };
  });
}

export function benchmarkPlayheadPercent(currentTimeMs, durationMs) {
  if (
    !Number.isFinite(currentTimeMs) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return 0;
  }
  return Math.max(0, Math.min(100, (currentTimeMs / durationMs) * 100));
}
