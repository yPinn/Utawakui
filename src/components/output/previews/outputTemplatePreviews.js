// Each preview renders inside the shared ObsTemplateMockup canvas and takes
// the same props: { scene, size, animated }.
const TEMPLATE_PREVIEWS = Object.freeze({
  'queue-board': () => import('./QueueBoardPreview.vue'),
  'receipt-setlist': () => import('./ReceiptSetlistPreview.vue'),
  'ribbon-setlist': () => import('./RibbonSetlistPreview.vue'),
  'karaoke-stack': () => import('./KaraokeStackPreview.vue'),
  'kinetic-pop': () => import('./KineticPopPreview.vue'),
  'ornate-vertical': () => import('./OrnateVerticalPreview.vue'),
  'chalkboard-vertical': () => import('./ChalkboardVerticalPreview.vue'),
  'centered-vertical': () => import('./CenteredVerticalPreview.vue'),
  'fisheye-lens': () => import('./FisheyeLensPreview.vue'),
  'phantom-thieves': () => import('./PhantomThievesPreview.vue'),
  'textured-credits': () => import('./TexturedCreditsPreview.vue'),
  'cinema-frame': () => import('./ScreenMaskPreview.vue'),
  'manga-frame': () => import('./MangaFramePreview.vue'),
  'live-stage': () => import('./LiveStagePreview.vue'),
  'art-card': () => import('./ArtCardPreview.vue'),
  'ticket-stub': () => import('./TicketStubPreview.vue'),
  'cover-player': () => import('./CoverPlayerPreview.vue'),
});

const KIND_FALLBACK_PREVIEWS = Object.freeze({
  setlist: TEMPLATE_PREVIEWS['queue-board'],
  lyrics: TEMPLATE_PREVIEWS['karaoke-stack'],
});

export function outputTemplatePreviewFor(preset) {
  return (
    TEMPLATE_PREVIEWS[preset?.id] ??
    KIND_FALLBACK_PREVIEWS[preset?.kind] ??
    TEMPLATE_PREVIEWS['art-card']
  );
}
