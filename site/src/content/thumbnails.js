// Explicit imports keep blocked style-reference images out of the bundle.
import centeredVertical from '@thumbnails/centered-vertical.jpg';
import chalkboardVertical from '@thumbnails/chalkboard-vertical.jpg';
import ornateVertical from '@thumbnails/ornate-vertical.jpg';
import queueBoard from '@thumbnails/queue-board.jpg';
import ticketStub from '@thumbnails/ticket-stub.jpg';

const desktopCaptures = {
  'centered-vertical': centeredVertical,
  'chalkboard-vertical': chalkboardVertical,
  'ornate-vertical': ornateVertical,
  'queue-board': queueBoard,
  'ticket-stub': ticketStub,
};

const siteCaptures = import.meta.glob('../assets/template-thumbnails/*.webp', {
  eager: true,
  import: 'default',
  query: '?url',
});

const motionCaptures = import.meta.glob(
  '../assets/template-thumbnails/motion/*.webp',
  {
    eager: true,
    import: 'default',
    query: '?url',
  },
);

export function getTemplateThumbnail(id) {
  return (
    desktopCaptures[id] ??
    siteCaptures[`../assets/template-thumbnails/${id}.webp`]
  );
}

export function getTemplateMotion(id) {
  return motionCaptures[`../assets/template-thumbnails/motion/${id}.webp`];
}
