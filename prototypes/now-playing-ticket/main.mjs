/* global document, URLSearchParams, window */

import {
  collectArtworkElements,
  prepareArtworkSleeve,
} from '../../overlay/now-playing/artworkLayout.mjs';
import { createOutputPreviewSnapshot } from '../../shared/presentation/outputPreviewScene.mjs';
import { selectArtworkFrame } from '../../shared/presentation/state.mjs';

const params = new URLSearchParams(window.location.search);
const backdrop = params.get('backdrop');
if (['light', 'dark', 'checker'].includes(backdrop)) {
  document.documentElement.dataset.overlayBackdrop = backdrop;
}

const variant = params.get('sample');
const snapshot = createOutputPreviewSnapshot();
snapshot.playback.track = {
  id: variant === 'no-cover' ? 'ticket-sample-no-cover' : 'ticket-sample',
  title:
    variant === 'long'
      ? '把沒說完的話留在最後一班開往海邊的列車上'
      : '夜色落幕之前',
  artist: '紙月電台',
};

const elements = collectArtworkElements(document);
const frame = selectArtworkFrame(snapshot);
prepareArtworkSleeve(elements, frame);
elements.root.hidden = !frame.visible;
