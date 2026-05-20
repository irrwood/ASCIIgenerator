# ASCIIgenerator

A browser-based ASCII visual generator for images, GIFs, and videos.

It converts uploaded media into an animated ASCII matrix, supports interactive ripple effects, video recording, standalone HTML export, and AI-assisted background removal.

## Features

- Image, GIF, and video upload
- Real-time ASCII rendering on canvas
- Multiple character sets: standard, geometric, binary
- Color modes: original, matrix green, black and white, cyan, fire, custom color
- Invert and ignore-white modes
- Adjustable output resolution, character size, and character spacing
- Click/touch ripple effect
- WebM canvas recording
- Standalone HTML player export
- AI background removal:
  - Images: general background removal via `@imgly/background-removal`
  - Videos: real-time person segmentation via MediaPipe Selfie Segmentation
  - Transparent or solid-color background output
  - Threshold and edge-softness controls
  - Progress indicator for image background removal

## Run Locally

This app uses ES modules and remote model/CDN assets, so serve it over local HTTP instead of opening `index.html` directly.

```bash
npm start
```

Then open:

```text
http://127.0.0.1:8765/
```

## Test

```bash
npm test
node --check src/app.js
node --check src/ascii-core.js
```

## Notes

- First AI background-removal use may be slow because the browser downloads model assets.
- Image background removal works best for clear foreground subjects.
- Video background removal is optimized for people/selfie-style footage, not arbitrary objects.
- ONNX Runtime may warn about single-threaded WASM when the page is not `crossOriginIsolated`; this affects speed, not basic functionality.

## Project Structure

```text
index.html              Main HTML shell
src/app.js              Browser app, media handling, rendering, recording
src/ascii-core.js       Testable rendering and background-removal helpers
src/styles.css          UI styling
tests/                  Node test suite and fixtures
```

## License

MIT
