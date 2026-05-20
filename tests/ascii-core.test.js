import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_CUSTOM_COLOR,
  DEFAULT_SETTINGS,
  alphaFromSegmentationScore,
  applyBackgroundRemovalPixel,
  calculateCoverRect,
  extractCleanAppHtml,
  getBackgroundRemovalStageProgress,
  hexToRgb,
  isSupportedBackgroundRemovalBitmap,
  resolveDrawColor,
  shouldSkipParticle
} from "../src/ascii-core.js";

test("custom color mode uses the default green before a user picks a color", () => {
  const color = resolveDrawColor(
    { r: 200, g: 120, b: 40, brightness: 128 },
    { colorMode: "custom" }
  );

  assert.equal(DEFAULT_CUSTOM_COLOR.r, 0);
  assert.equal(DEFAULT_CUSTOM_COLOR.g, 255);
  assert.equal(DEFAULT_CUSTOM_COLOR.b, 0);
  assert.deepEqual(color, { r: 0, g: 128, b: 0 });
});

test("hexToRgb parses six-digit colors and rejects invalid values", () => {
  assert.deepEqual(hexToRgb("#12abEF"), { r: 18, g: 171, b: 239 });
  assert.equal(hexToRgb("not-a-color"), null);
});

test("isSupportedBackgroundRemovalBitmap accepts common bitmap formats only", () => {
  assert.equal(isSupportedBackgroundRemovalBitmap("image/png"), true);
  assert.equal(isSupportedBackgroundRemovalBitmap("image/jpeg"), true);
  assert.equal(isSupportedBackgroundRemovalBitmap("image/webp"), true);
  assert.equal(isSupportedBackgroundRemovalBitmap("image/svg+xml"), false);
});

test("extractCleanAppHtml removes generated host wrappers and keeps the ASCII app", () => {
  const legacy = [
    "<!DOCTYPE html>",
    "<html><head>",
    "<script>window.__firebase_config = 'secret';</script>",
    "<script>console.log('host wrapper');</script>",
    "<meta charset=\"UTF-8\">",
    "<title>ASCII 视觉矩阵 (支持 GIF)</title>",
    "<script src=\"https://unpkg.com/libgif@0.0.3/libgif.js\"></script>",
    "</head><body>",
    "<div id=\"controls\"></div>",
    "<canvas id=\"asciiCanvas\"></canvas>",
    "<script>const canvas = document.getElementById('asciiCanvas');</script>",
    "</body></html>"
  ].join("\n");

  const clean = extractCleanAppHtml(legacy);

  assert.match(clean, /<title>ASCII 视觉矩阵/);
  assert.match(clean, /id="asciiCanvas"/);
  assert.doesNotMatch(clean, /firebase_config/);
  assert.doesNotMatch(clean, /host wrapper/);
});

test("alphaFromSegmentationScore creates a soft edge around the threshold", () => {
  assert.equal(alphaFromSegmentationScore(0.2, 0.5, 0.1), 0);
  assert.equal(alphaFromSegmentationScore(0.8, 0.5, 0.1), 255);
  assert.equal(alphaFromSegmentationScore(0.5, 0.5, 0.1), 128);
});

test("background removal skips transparent particles without hiding foreground", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    backgroundRemoval: {
      ...DEFAULT_SETTINGS.backgroundRemoval,
      enabled: true,
      output: "transparent"
    }
  };

  assert.equal(shouldSkipParticle({ brightness: 120, alpha: 0 }, settings, false), true);
  assert.equal(shouldSkipParticle({ brightness: 120, alpha: 255 }, settings, false), false);
});

test("applyBackgroundRemovalPixel blends masked video pixels into the replacement background", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    backgroundRemoval: {
      ...DEFAULT_SETTINGS.backgroundRemoval,
      enabled: true,
      output: "color",
      replacementColor: "#102030"
    }
  };

  assert.deepEqual(
    applyBackgroundRemovalPixel({ r: 200, g: 100, b: 50, alpha: 0 }, settings),
    { r: 16, g: 32, b: 48 }
  );
  assert.deepEqual(
    applyBackgroundRemovalPixel({ r: 200, g: 100, b: 50, alpha: 255 }, settings),
    { r: 200, g: 100, b: 50 }
  );
});

test("calculateCoverRect matches object-fit cover geometry", () => {
  assert.deepEqual(
    calculateCoverRect({ sourceWidth: 1920, sourceHeight: 1080, targetWidth: 100, targetHeight: 100 }),
    { x: -38.888888888888886, y: 0, width: 177.77777777777777, height: 100 }
  );
  assert.deepEqual(
    calculateCoverRect({ sourceWidth: 800, sourceHeight: 1200, targetWidth: 100, targetHeight: 100 }),
    { x: 0, y: -25, width: 100, height: 150 }
  );
});

test("getBackgroundRemovalStageProgress maps stages to stable progress", () => {
  assert.equal(getBackgroundRemovalStageProgress("idle"), 0);
  assert.equal(getBackgroundRemovalStageProgress("loading-model"), 18);
  assert.equal(getBackgroundRemovalStageProgress("converting"), 35);
  assert.equal(getBackgroundRemovalStageProgress("processing"), 72);
  assert.equal(getBackgroundRemovalStageProgress("complete"), 100);
  assert.equal(getBackgroundRemovalStageProgress("failed"), 100);
});
