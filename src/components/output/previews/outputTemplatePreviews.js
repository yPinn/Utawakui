// Shared canvas rules must precede every preview's own rules.
import '../ObsTemplateMockup.base.css';
import ArtCardPreview from './ArtCardPreview.vue';
import CoverPlayerPreview from './CoverPlayerPreview.vue';
import KaraokeStackPreview from './KaraokeStackPreview.vue';
import KineticPopPreview from './KineticPopPreview.vue';
import LiveStagePreview from './LiveStagePreview.vue';
import MangaFramePreview from './MangaFramePreview.vue';
import OrnateVerticalPreview from './OrnateVerticalPreview.vue';
import QueueBoardPreview from './QueueBoardPreview.vue';

// Each preview renders inside the shared ObsTemplateMockup canvas and takes
// the same props: { scene, size, animated }.
const TEMPLATE_PREVIEWS = Object.freeze({
  'queue-board': QueueBoardPreview,
  'karaoke-stack': KaraokeStackPreview,
  'kinetic-pop': KineticPopPreview,
  'ornate-vertical': OrnateVerticalPreview,
  'manga-frame': MangaFramePreview,
  'live-stage': LiveStagePreview,
  'art-card': ArtCardPreview,
  'cover-player': CoverPlayerPreview,
});

const KIND_FALLBACK_PREVIEWS = Object.freeze({
  setlist: QueueBoardPreview,
  lyrics: KaraokeStackPreview,
});

export function outputTemplatePreviewFor(preset) {
  return (
    TEMPLATE_PREVIEWS[preset?.id] ??
    KIND_FALLBACK_PREVIEWS[preset?.kind] ??
    ArtCardPreview
  );
}
