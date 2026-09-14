// A same-origin, non-image response lets the development catalogue exercise an
// image decode failure without a blocked request, remote dependency, or CSP
// exception. Both Vite dev and the packaged renderer resolve this next to the
// document that hosts the catalogue.
export const BROKEN_IMAGE_FIXTURE_URL = './index.html';
