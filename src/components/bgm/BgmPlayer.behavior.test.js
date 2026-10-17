import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./BgmPlayerPanel.vue', import.meta.url),
  'utf8',
);

describe('BgmPlayer', () => {
  it('is the single BGM feature owner rather than a session or Right Dock panel', () => {
    expect(source).toContain(
      "import { useBgmSession } from '../../composables/useBgmSession.js'",
    );
    expect(source).toContain(
      "import { useBgmStandbyPlan } from '../../composables/useBgmStandbyPlan.js'",
    );
    expect(source).toContain(
      "import { useLibrary } from '../../composables/useLibrary.js'",
    );
    expect(source).toContain('<BgmPlayerTransport');
    expect(source).toContain('<BgmTrackPicker');
    expect(source).not.toContain('<BgmPlayerLibrary');
    expect(source).not.toContain('AppRightDockPanel');
    expect(source).not.toContain('PerformanceSessionPanel');
    expect(source).not.toContain('LiveSessionCard');
  });

  it('uses the same transport for explicit offline audition and active sessions', () => {
    expect(source).toContain(
      "['live', 'record', 'reconnecting'].includes(handoffState.sessionMode)",
    );
    expect(source).toContain('<BgmPlayerTransport');
    expect(source).not.toContain(
      '<BgmPlayerTransport\n      v-if="sessionActive"',
    );
    expect(source).not.toContain(':disabled="!sessionActive"');
    expect(source).not.toContain("inactive: 'OBS 未確認'");
    expect(source).toContain('v-if="sessionLabel"');
    expect(source).not.toContain('可試播本機監聽；OBS 收音仍需短錄影確認。');
    expect(source).not.toContain("inactive: '試播模式'");
    expect(source).toContain('v-if="pickerExpanded"');
    expect(source).not.toContain('<UiScrollLayout');
    expect(source).toContain('setTrack');
    expect(source).not.toContain('addTrack');
    expect(source).not.toContain('removeTrack');
    expect(source).not.toContain('selectTrack');
  });

  it('keeps the current BGM and its single operational status visible', () => {
    expect(source).toContain('<BgmCurrentSource');
    expect(source).toContain(':status="operationalStatus"');
    expect(source).toContain('@toggle-picker="togglePicker"');
    expect(source).toContain(':current-track="currentTrack"');
    expect(source).toContain('sessionIndicators.value.isRecording');
    expect(source).toContain("live: 'LIVE'");
    expect(source).not.toContain("liveRecording: 'LIVE + REC'");
    expect(source).toMatch(
      /if \(sessionIndicators\.value\.isLive\) return SESSION_LABELS\.live;[\s\S]*if \(sessionIndicators\.value\.isRecording\)/u,
    );
  });

  it('lets explicit shell disclosure hide the surface without changing audio state', () => {
    expect(source).toContain('open: { type: Boolean, default: false }');
    expect(source).toContain('v-if="open"');
    expect(source).not.toContain('const visible = computed');
    expect(source).not.toContain('bgmOperationActive');
    expect(source).not.toContain('props.open || sessionActive.value');
    expect(source).toContain('const pickerExpanded = shallowRef(false)');
    expect(source).toContain('pickerExpanded.value = !pickerExpanded.value');
    expect(source).not.toContain("emit('requestExpand')");
    expect(source).toContain("emit('requestClose')");
    expect(source).toContain('restorePending: handoffState.restorePending');
    expect(source).not.toContain(':bgm-requested=');
  });

  it('uses the photo-object pinning language without borrowing photo material', () => {
    expect(source).toMatch(
      /import\s+\{[^}]*\bPin\b[^}]*\}\s+from '\.\.\/\.\.\/icons\/index\.js'/su,
    );
    expect(source).toContain(
      "import { useBoundedMovableSurface } from '../../composables/useBoundedMovableSurface.js'",
    );
    expect(source).toContain(':aria-pressed="pinned"');
    expect(source).toContain(
      "pinned ? '取消固定 BGM 播放器' : '固定 BGM 播放器'",
    );
    expect(source).toContain('@pointerdown="beginDrag"');
    expect(source).toContain('@keydown="handleMoveKeydown"');
    expect(source).not.toContain('UiFolderArtifact');
    expect(source).not.toContain('--ui-folder-artifact-');
  });

  it('composes shared UI primitives instead of redrawing the design system', () => {
    expect(source).toContain('<UiSurface');
    expect(source).toContain('tag="aside"');
    expect(source).not.toContain('<UiHint');
    expect(source).toContain('<UiSeparator');
    expect(source).not.toContain('bgm-player__subtitle');
    expect(source).not.toContain('linear-gradient(');
    expect(source).not.toMatch(/\b(?:27|38|7)rem\b/u);
  });

  it('uses a plain feature identity and only shows real session activity', () => {
    expect(source).toContain('class="bgm-player__feature-identity"');
    expect(source).toContain('<Music2 aria-hidden="true" />');
    expect(source).toContain('<span>BGM</span>');
    expect(source).not.toContain('<UiChip class="bgm-player__feature-status"');
    expect(source).toContain('class="bgm-player__session-status"');
    expect(source).not.toContain('<UiChip');
    expect(source).not.toContain('ChevronDown');
    expect(source).not.toContain('ChevronUp');
    expect(source).not.toContain("'展開更換歌曲'");
    expect(source).not.toContain('class="bgm-player__mark"');
    expect(source).not.toContain('class="bgm-player__title"');
  });
});
