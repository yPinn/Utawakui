# Output Preview Assets

Workbench-only static preview assets belong in this directory. They are
renderer references and must not be served by the Overlay Output Server or
added to an OBS URL.

Use semantic filenames such as `streamer.png`, `camera-frame.svg`, or
`stage-guide.webp`. Add category subdirectories only when several related
assets make the grouping useful.

For the initial streamer image, prefer a transparent PNG or WebP with
comfortable transparent padding around the figure. Its placement guide uses
the center column across the middle and bottom rows of a 3 x 3 grid on a
1920 x 1080 canvas:

- bounds: `x = 640`, `y = 360`, `width = 640`, `height = 720`
- normalized bounds: `left = 33.333%`, `top = 33.333%`, `width = 33.333%`,
  `height = 66.667%`
- fitting: contain the full figure, scale it to 135%, and keep its bottom-center
  anchor fixed
