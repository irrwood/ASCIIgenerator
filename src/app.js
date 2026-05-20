import {
  alphaFromSegmentationScore,
  applyBackgroundRemovalPixel,
  buildStandalonePlayerHtml,
  calculateCoverRect,
  characterForBrightness,
  CHAR_SETS,
  DEFAULT_SETTINGS,
  getBackgroundRemovalStageProgress,
  hexToRgb,
  isSupportedBackgroundRemovalBitmap,
  resolveDrawColor,
  shouldSkipParticle
} from "./ascii-core.js";

const canvas = document.getElementById("asciiCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const uiLayer = document.getElementById("ui-layer");
const fileInput = document.getElementById("fileInput");
const controls = document.getElementById("controls");
const canvasContainer = document.getElementById("canvas-container");
const hiddenAssets = document.getElementById("hidden-assets");

const resolutionSelect = document.getElementById("resolutionMode");
const colorModeSelect = document.getElementById("colorMode");
const charSetSelect = document.getElementById("charSetMode");
const bgColorPicker = document.getElementById("bgColorPicker");
const invertToggle = document.getElementById("invertToggle");
const ignoreWhiteToggle = document.getElementById("ignoreWhiteToggle");
const customColorGroup = document.getElementById("customColorGroup");
const customColorPicker = document.getElementById("customColorPicker");
const backgroundRemovalToggle = document.getElementById("backgroundRemovalToggle");
const backgroundRemovalControls = document.getElementById("backgroundRemovalControls");
const backgroundRemovalOutput = document.getElementById("backgroundRemovalOutput");
const backgroundRetryBtn = document.getElementById("backgroundRetryBtn");
const backgroundUseOriginalBtn = document.getElementById("backgroundUseOriginalBtn");
const backgroundReplacementGroup = document.getElementById("backgroundReplacementGroup");
const backgroundReplacementColor = document.getElementById("backgroundReplacementColor");
const backgroundThresholdRange = document.getElementById("backgroundThresholdRange");
const backgroundThresholdValue = document.getElementById("backgroundThresholdValue");
const backgroundSoftnessRange = document.getElementById("backgroundSoftnessRange");
const backgroundSoftnessValue = document.getElementById("backgroundSoftnessValue");
const backgroundRemovalStatus = document.getElementById("backgroundRemovalStatus");
const backgroundProgress = document.getElementById("backgroundProgress");
const backgroundProgressBar = document.getElementById("backgroundProgressBar");
const backgroundProgressText = document.getElementById("backgroundProgressText");
const resolutionRange = document.getElementById("resolutionRange");
const resValue = document.getElementById("resValue");
const spacingRange = document.getElementById("spacingRange");
const spacingValue = document.getElementById("spacingValue");
const rippleToggle = document.getElementById("rippleToggle");
const rippleRange = document.getElementById("rippleRange");
const recordBtn = document.getElementById("recordBtn");
const recordStatus = document.getElementById("recordStatus");
const autoLoopRecord = document.getElementById("autoLoopRecord");
const recordingIndicator = document.getElementById("recording-indicator");
const exportAppBtn = document.getElementById("exportAppBtn");
const exportLoopToggle = document.getElementById("exportLoopToggle");
const exportPlayerBtn = document.getElementById("exportPlayerBtn");

const settings = {
  ...DEFAULT_SETTINGS,
  customColor: { ...DEFAULT_SETTINGS.customColor },
  backgroundRemoval: { ...DEFAULT_SETTINGS.backgroundRemoval }
};
const charSets = { ...CHAR_SETS };

let currentFile = null;
let videoElement = null;
let imageElement = null;
let processedImageUrl = null;
let originalImageUrl = null;
let gifElement = null;
let isVideo = false;
let isGif = false;
let particles = [];
let ripples = [];
let cols = 0;
let rows = 0;
let effectInitialized = false;
let animationFrameId = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let autoStopRecording = false;
let videoEndedCallback = null;
let lastGifFrame = -1;
let autoStopTimer = null;
let imageBackgroundRemovalModule = null;
let selfieSegmentation = null;
let segmentationReady = false;
let segmentationInFlight = false;
let rawSegmentationMaskCanvas = document.createElement("canvas");
let rawSegmentationMaskCtx = rawSegmentationMaskCanvas.getContext("2d", { willReadFrequently: true });
let segmentationMaskCanvas = document.createElement("canvas");
let segmentationMaskCtx = segmentationMaskCanvas.getContext("2d", { willReadFrequently: true });
let segmentationMaskData = null;
let backgroundProgressTimer = null;
let backgroundProgressValue = 0;

const offCanvas = document.createElement("canvas");
const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });

syncControlsFromSettings();
resizeCanvas();

window.addEventListener("resize", resizeCanvas);
fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => {
  event.preventDefault();
  handleFile(event.dataTransfer.files[0]);
});

invertToggle.addEventListener("change", (event) => {
  settings.invert = event.target.checked;
});

ignoreWhiteToggle.addEventListener("change", (event) => {
  settings.ignoreWhite = event.target.checked;
});

bgColorPicker.addEventListener("input", (event) => {
  settings.backgroundColor = event.target.value;
  canvasContainer.style.backgroundColor = settings.backgroundColor;
  document.body.style.backgroundColor = settings.backgroundColor;
});

resolutionSelect.addEventListener("change", (event) => {
  settings.resolution = event.target.value;
  resizeCanvas();
});

colorModeSelect.addEventListener("change", (event) => {
  settings.colorMode = event.target.value;
  customColorGroup.classList.toggle("hidden", settings.colorMode !== "custom");
});

charSetSelect.addEventListener("change", (event) => {
  settings.charSet = event.target.value;
});

customColorPicker.addEventListener("input", (event) => {
  settings.customColor = hexToRgb(event.target.value) || { ...DEFAULT_SETTINGS.customColor };
});

backgroundRemovalToggle.addEventListener("change", (event) => {
  settings.backgroundRemoval.enabled = event.target.checked;
  backgroundRemovalControls.classList.toggle("hidden", !settings.backgroundRemoval.enabled);
  if (currentFile) {
    handleFile(currentFile);
  } else {
    setBackgroundRemovalStatus();
  }
});

backgroundRemovalOutput.addEventListener("change", (event) => {
  settings.backgroundRemoval.output = event.target.value;
  backgroundReplacementGroup.classList.toggle("hidden", settings.backgroundRemoval.output !== "color");
});

backgroundRetryBtn.addEventListener("click", () => {
  if (currentFile) handleFile(currentFile);
});

backgroundUseOriginalBtn.addEventListener("click", () => {
  if (!currentFile) return;
  const wasEnabled = settings.backgroundRemoval.enabled;
  settings.backgroundRemoval.enabled = false;
  backgroundRemovalToggle.checked = false;
  backgroundRemovalControls.classList.add("hidden");
  handleFile(currentFile);
  settings.backgroundRemoval.enabled = wasEnabled;
  backgroundRemovalToggle.checked = wasEnabled;
  backgroundRemovalControls.classList.toggle("hidden", !wasEnabled);
  setBackgroundRemovalStatus("已临时使用原图渲染。");
});

backgroundReplacementColor.addEventListener("input", (event) => {
  settings.backgroundRemoval.replacementColor = event.target.value;
});

backgroundThresholdRange.addEventListener("input", (event) => {
  settings.backgroundRemoval.threshold = Number.parseFloat(event.target.value);
  backgroundThresholdValue.textContent = settings.backgroundRemoval.threshold.toFixed(2);
});

backgroundSoftnessRange.addEventListener("input", (event) => {
  settings.backgroundRemoval.softness = Number.parseFloat(event.target.value);
  backgroundSoftnessValue.textContent = settings.backgroundRemoval.softness.toFixed(2);
});

resolutionRange.addEventListener("input", (event) => {
  settings.fontSize = Number.parseInt(event.target.value, 10);
  resValue.textContent = settings.fontSize;
  resizeCanvas();
});

spacingRange.addEventListener("input", (event) => {
  settings.charSpacing = Number.parseFloat(event.target.value);
  spacingValue.textContent = settings.charSpacing.toFixed(1);
  resizeCanvas();
});

rippleToggle.addEventListener("change", (event) => {
  settings.enableRipple = event.target.checked;
  if (!settings.enableRipple) ripples = [];
});

rippleRange.addEventListener("input", (event) => {
  settings.rippleStrength = Number.parseInt(event.target.value, 10);
});

recordBtn.addEventListener("click", toggleRecording);
exportAppBtn.addEventListener("click", exportCleanApp);
exportPlayerBtn.addEventListener("click", exportStandalonePlayer);

canvas.addEventListener("click", (event) => {
  if (!effectInitialized || !settings.enableRipple) return;
  addRipple(event.clientX, event.clientY);
});

canvas.addEventListener("touchstart", (event) => {
  if (!effectInitialized || !settings.enableRipple) return;
  for (const touch of event.touches) addRipple(touch.clientX, touch.clientY);
});

function syncControlsFromSettings() {
  resolutionSelect.value = settings.resolution;
  colorModeSelect.value = settings.colorMode;
  charSetSelect.value = settings.charSet;
  bgColorPicker.value = settings.backgroundColor;
  invertToggle.checked = settings.invert;
  ignoreWhiteToggle.checked = settings.ignoreWhite;
  resolutionRange.value = settings.fontSize;
  resValue.textContent = settings.fontSize;
  spacingRange.value = settings.charSpacing;
  spacingValue.textContent = settings.charSpacing.toFixed(1);
  rippleToggle.checked = settings.enableRipple;
  rippleRange.value = settings.rippleStrength;
  backgroundRemovalToggle.checked = settings.backgroundRemoval.enabled;
  backgroundRemovalControls.classList.toggle("hidden", !settings.backgroundRemoval.enabled);
  backgroundRemovalOutput.value = settings.backgroundRemoval.output;
  backgroundReplacementGroup.classList.toggle("hidden", settings.backgroundRemoval.output !== "color");
  backgroundReplacementColor.value = settings.backgroundRemoval.replacementColor;
  backgroundThresholdRange.value = settings.backgroundRemoval.threshold;
  backgroundThresholdValue.textContent = settings.backgroundRemoval.threshold.toFixed(2);
  backgroundSoftnessRange.value = settings.backgroundRemoval.softness;
  backgroundSoftnessValue.textContent = settings.backgroundRemoval.softness.toFixed(2);
}

function resizeCanvas() {
  const { width: targetWidth, height: targetHeight } = getTargetCanvasSize();
  const stride = settings.fontSize * settings.charSpacing;
  const targetCols = Math.ceil(targetWidth / stride);
  const targetRows = Math.ceil(targetHeight / stride);

  fitCanvasToViewport(targetWidth, targetHeight);

  if (
    canvas.width !== targetWidth ||
    canvas.height !== targetHeight ||
    cols !== targetCols ||
    rows !== targetRows
  ) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    cols = targetCols;
    rows = targetRows;
    offCanvas.width = cols;
    offCanvas.height = rows;
    initParticles();
  }
}

function getTargetCanvasSize() {
  if (settings.resolution === "original") {
    const originalSize = getSourceSize();
    if (originalSize) return originalSize;
  }

  if (settings.resolution === "screen") {
    const dpr = window.devicePixelRatio || 1;
    return {
      width: Math.max(1, Math.round(window.innerWidth * dpr)),
      height: Math.max(1, Math.round(window.innerHeight * dpr))
    };
  }

  const [width, height] = settings.resolution.split("x").map(Number);
  return { width, height };
}

function getSourceSize() {
  if (isGif && gifElement?.get_canvas()) {
    const gifCanvas = gifElement.get_canvas();
    return { width: gifCanvas.width, height: gifCanvas.height };
  }
  if (isVideo && videoElement?.videoWidth) {
    return { width: videoElement.videoWidth, height: videoElement.videoHeight };
  }
  if (imageElement?.width) {
    return { width: imageElement.width, height: imageElement.height };
  }
  return null;
}

function fitCanvasToViewport(width, height) {
  const windowRatio = window.innerWidth / window.innerHeight;
  const targetRatio = width / height;
  if (settings.resolution === "screen") {
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    return;
  }
  if (windowRatio > targetRatio) {
    canvas.style.height = "100%";
    canvas.style.width = "auto";
  } else {
    canvas.style.width = "100%";
    canvas.style.height = "auto";
  }
}

function initParticles() {
  const stride = settings.fontSize * settings.charSpacing;
  particles = new Array(cols * rows);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      particles[y * cols + x] = {
        x: x * stride,
        y: y * stride,
        char: " ",
        r: 0,
        g: 0,
        b: 0,
        brightness: 0
      };
    }
  }
}

function resetSources() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (videoElement) {
    videoElement.pause();
    videoElement.removeAttribute("src");
    videoElement.load();
    videoElement = null;
  }
  if (processedImageUrl) {
    URL.revokeObjectURL(processedImageUrl);
    processedImageUrl = null;
  }
  if (originalImageUrl) {
    URL.revokeObjectURL(originalImageUrl);
    originalImageUrl = null;
  }
  gifElement = null;
  hiddenAssets.innerHTML = "";
  imageElement = null;
  isVideo = false;
  isGif = false;
  ripples = [];
  effectInitialized = false;
  segmentationMaskData = null;
  segmentationInFlight = false;
}

function handleFile(file) {
  if (!file) return;
  currentFile = file;
  resetSources();

  const url = URL.createObjectURL(file);
  if (file.type === "image/gif") {
    loadGif(url);
  } else if (file.type.startsWith("video/")) {
    loadVideo(url);
  } else if (file.type.startsWith("image/")) {
    loadImage(url);
  } else {
    URL.revokeObjectURL(url);
    alert("暂不支持这个文件类型。");
  }
}

function loadGif(url) {
  isGif = true;
  setBackgroundRemovalStatus("GIF 暂不支持 AI 去背景，会按原素材渲染。");
  if (typeof window.SuperGif === "undefined") {
    alert("GIF 解析组件加载失败。请检查网络连接后刷新页面。");
    URL.revokeObjectURL(url);
    return;
  }

  const gifImg = document.createElement("img");
  gifImg.src = url;
  hiddenAssets.appendChild(gifImg);

  try {
    const loader = new window.SuperGif({ gif: gifImg, auto_play: true });
    loader.load(() => {
      gifElement = loader;
      URL.revokeObjectURL(url);
      startEffect();
    });
  } catch (error) {
    console.error("GIF 解析失败", error);
    URL.revokeObjectURL(url);
    alert("GIF 解析失败，请尝试其他文件。");
  }
}

function loadVideo(url) {
  isVideo = true;
  if (settings.backgroundRemoval.enabled) {
    initVideoSegmentation();
  }
  videoElement = document.createElement("video");
  videoElement.src = url;
  videoElement.muted = true;
  videoElement.loop = true;
  videoElement.playsInline = true;
  videoElement.onloadeddata = () => {
    videoElement.play().catch(() => {});
    startEffect();
  };
  videoElement.onerror = () => {
    URL.revokeObjectURL(url);
    alert("视频加载失败，请尝试其他文件。");
  };
}

function loadImage(url) {
  originalImageUrl = url;
  if (settings.backgroundRemoval.enabled) {
    removeImageBackground(url);
    return;
  }
  loadImageSource(url);
}

async function removeImageBackground(url) {
  setBackgroundRemovalStage("loading-model", "正在加载图片去背景模型...首次使用会稍慢。");
  try {
    const removeBackground = await loadImageBackgroundRemoval();
    setBackgroundRemovalStage("processing", "正在 AI 去背景...");
    const removalInput = await getBackgroundRemovalInput(url);
    const resultBlob = await removeBackground(removalInput);
    if (url !== originalImageUrl) URL.revokeObjectURL(url);
    processedImageUrl = URL.createObjectURL(resultBlob);
    setBackgroundRemovalStage("complete", "图片去背景完成。");
    window.setTimeout(hideBackgroundProgress, 900);
    loadImageSource(processedImageUrl, { revokeOnLoad: false });
  } catch (error) {
    console.error("图片去背景失败", error);
    setBackgroundRemovalStage("failed", "图片去背景失败，已回退到原图。");
    window.setTimeout(hideBackgroundProgress, 1200);
    loadImageSource(url, { revokeOnLoad: false });
  }
}

async function getBackgroundRemovalInput(url) {
  if (isSupportedBackgroundRemovalBitmap(currentFile?.type || "")) return url;
  setBackgroundRemovalStage("converting", "正在转换为 PNG 后去背景...");
  return convertImageUrlToPngBlob(url);
}

function convertImageUrlToPngBlob(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const conversionCanvas = document.createElement("canvas");
      conversionCanvas.width = image.naturalWidth || image.width;
      conversionCanvas.height = image.naturalHeight || image.height;
      const conversionCtx = conversionCanvas.getContext("2d");
      conversionCtx.drawImage(image, 0, 0);
      conversionCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG conversion failed."));
      }, "image/png");
    };
    image.onerror = () => reject(new Error("Image conversion failed."));
    image.src = url;
  });
}

async function loadImageBackgroundRemoval() {
  if (!imageBackgroundRemovalModule) {
    imageBackgroundRemovalModule = import("https://esm.sh/@imgly/background-removal@1.5.8").then((module) => {
      if (typeof module.default === "function") return module.default;
      if (typeof module.removeBackground === "function") return module.removeBackground;
      throw new Error("No removeBackground export found.");
    });
  }
  return imageBackgroundRemovalModule;
}

function loadImageSource(url, options = {}) {
  const { revokeOnLoad = true } = options;
  imageElement = new Image();
  imageElement.onload = () => {
    if (revokeOnLoad) URL.revokeObjectURL(url);
    startEffect();
  };
  imageElement.onerror = () => {
    if (revokeOnLoad) URL.revokeObjectURL(url);
    alert("图片加载失败，请尝试其他文件。");
  };
  imageElement.src = url;
}

function startEffect() {
  uiLayer.classList.add("hidden");
  controls.classList.add("visible");
  setTimeout(() => controls.classList.remove("visible"), 3000);
  effectInitialized = true;
  resizeCanvas();
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animate();
}

function updateContentData() {
  const active = getActiveSource();
  if (!active || active.width === 0 || active.height === 0) return;

  const coverRect = calculateCoverRect({
    sourceWidth: active.width,
    sourceHeight: active.height,
    targetWidth: cols,
    targetHeight: rows
  });

  prepareVideoSegmentation(active.source);
  if (settings.backgroundRemoval.enabled && settings.backgroundRemoval.output === "transparent") {
    offCtx.clearRect(0, 0, cols, rows);
  } else {
    offCtx.fillStyle = getSourceFillColor();
    offCtx.fillRect(0, 0, cols, rows);
  }
  offCtx.drawImage(active.source, coverRect.x, coverRect.y, coverRect.width, coverRect.height);

  const imgData = offCtx.getImageData(0, 0, cols, rows).data;
  const maskData = getCurrentMaskData(coverRect);
  const activeChars = charSets[settings.charSet] || charSets.standard;
  for (let i = 0; i < particles.length; i += 1) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    let alpha = imgData[i * 4 + 3];
    if (maskData) {
      const score = maskData[i * 4] / 255;
      alpha = alphaFromSegmentationScore(
        score,
        settings.backgroundRemoval.threshold,
        settings.backgroundRemoval.softness
      );
    }
    const visiblePixel = applyBackgroundRemovalPixel({ r, g, b, alpha }, settings);
    const brightness = visiblePixel.r * 0.299 + visiblePixel.g * 0.587 + visiblePixel.b * 0.114;
    const particle = particles[i];
    particle.char = characterForBrightness(brightness, activeChars);
    particle.r = visiblePixel.r;
    particle.g = visiblePixel.g;
    particle.b = visiblePixel.b;
    particle.alpha = alpha;
    particle.brightness = brightness;
  }
}

function getSourceFillColor() {
  if (settings.backgroundRemoval.enabled && settings.backgroundRemoval.output === "color") {
    return settings.backgroundRemoval.replacementColor;
  }
  return "#000";
}

function getCurrentMaskData(coverRect) {
  if (!settings.backgroundRemoval.enabled || !isVideo || !segmentationReady) return null;
  if (!rawSegmentationMaskCanvas.width || !rawSegmentationMaskCanvas.height) return null;
  if (segmentationMaskCanvas.width !== cols || segmentationMaskCanvas.height !== rows) {
    segmentationMaskCanvas.width = cols;
    segmentationMaskCanvas.height = rows;
  }
  segmentationMaskCtx.clearRect(0, 0, cols, rows);
  segmentationMaskCtx.drawImage(
    rawSegmentationMaskCanvas,
    coverRect.x,
    coverRect.y,
    coverRect.width,
    coverRect.height
  );
  segmentationMaskData = segmentationMaskCtx.getImageData(0, 0, cols, rows).data;
  return segmentationMaskData;
}

function initVideoSegmentation() {
  if (!settings.backgroundRemoval.enabled) return;
  if (typeof window.SelfieSegmentation === "undefined") {
    setBackgroundRemovalStatus("视频去背景组件加载失败，视频会按原素材渲染。");
    return;
  }
  if (selfieSegmentation) return;
  setBackgroundRemovalStatus("正在初始化视频人像分割...");
  selfieSegmentation = new window.SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${file}`
  });
  selfieSegmentation.setOptions({ modelSelection: 1 });
  selfieSegmentation.onResults((results) => {
    const width = results.segmentationMask.width || results.image?.width || videoElement?.videoWidth || 0;
    const height = results.segmentationMask.height || results.image?.height || videoElement?.videoHeight || 0;
    if (!width || !height) {
      segmentationInFlight = false;
      return;
    }
    rawSegmentationMaskCanvas.width = width;
    rawSegmentationMaskCanvas.height = height;
    rawSegmentationMaskCtx.clearRect(0, 0, width, height);
    rawSegmentationMaskCtx.drawImage(results.segmentationMask, 0, 0, width, height);
    segmentationMaskData = null;
    segmentationInFlight = false;
    segmentationReady = true;
    setBackgroundRemovalStatus("视频人像去背景运行中。");
  });
}

function prepareVideoSegmentation(source) {
  if (!settings.backgroundRemoval.enabled || !isVideo || !selfieSegmentation || segmentationInFlight) return;
  segmentationInFlight = true;
  selfieSegmentation.send({ image: source }).catch((error) => {
    console.error("视频去背景失败", error);
    segmentationInFlight = false;
    if (!segmentationReady) setBackgroundRemovalStatus("视频去背景失败，已回退到原视频。");
  });
}

function setBackgroundRemovalStatus(message) {
  if (message) {
    backgroundRemovalStatus.textContent = message;
    return;
  }
  backgroundRemovalStatus.textContent = settings.backgroundRemoval.enabled
    ? "图片: 通用 AI 抠图 · 视频: 人像实时分割"
    : "图片: 通用 AI 抠图 · 视频: 人像实时分割";
}

function setBackgroundRemovalStage(stage, message) {
  setBackgroundRemovalStatus(message);
  const stageProgress = getBackgroundRemovalStageProgress(stage);
  showBackgroundProgress(stageProgress);

  if (stage === "complete" || stage === "failed" || stage === "idle") {
    stopBackgroundProgressTimer();
    return;
  }

  startBackgroundProgressTimer(stageProgress, stage === "processing" ? 94 : 68);
}

function showBackgroundProgress(value) {
  backgroundProgress.classList.remove("hidden");
  backgroundProgressText.classList.remove("hidden");
  backgroundProgress.setAttribute("aria-hidden", "false");
  backgroundProgressValue = Math.max(backgroundProgressValue, value);
  updateBackgroundProgress(backgroundProgressValue);
}

function updateBackgroundProgress(value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  backgroundProgressBar.style.width = `${clamped}%`;
  backgroundProgressText.textContent = `${clamped}%`;
}

function startBackgroundProgressTimer(start, ceiling) {
  stopBackgroundProgressTimer();
  backgroundProgressValue = Math.max(backgroundProgressValue, start);
  backgroundProgressTimer = window.setInterval(() => {
    if (backgroundProgressValue >= ceiling) return;
    const remaining = ceiling - backgroundProgressValue;
    backgroundProgressValue += Math.max(0.4, remaining * 0.08);
    updateBackgroundProgress(backgroundProgressValue);
  }, 350);
}

function stopBackgroundProgressTimer() {
  if (!backgroundProgressTimer) return;
  window.clearInterval(backgroundProgressTimer);
  backgroundProgressTimer = null;
}

function hideBackgroundProgress() {
  stopBackgroundProgressTimer();
  backgroundProgressValue = 0;
  updateBackgroundProgress(0);
  backgroundProgress.classList.add("hidden");
  backgroundProgressText.classList.add("hidden");
  backgroundProgress.setAttribute("aria-hidden", "true");
}

function getActiveSource() {
  if (isGif && gifElement) {
    const gifCanvas = gifElement.get_canvas();
    return { source: gifCanvas, width: gifCanvas.width, height: gifCanvas.height };
  }
  if (isVideo && videoElement) {
    return { source: videoElement, width: videoElement.videoWidth, height: videoElement.videoHeight };
  }
  if (imageElement) {
    return { source: imageElement, width: imageElement.width, height: imageElement.height };
  }
  return null;
}

class Ripple {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.speed = 20 + canvas.width / 100;
    this.life = 100;
    this.strength = settings.rippleStrength;
  }

  update() {
    this.radius += this.speed;
    this.life -= 1.5;
  }
}

function addRipple(clientX, clientY) {
  const pos = getCanvasCoordinates(clientX, clientY);
  ripples.push(new Ripple(pos.x, pos.y));
}

function getCanvasCoordinates(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height)
  };
}

function animate() {
  if (!effectInitialized) return;
  updateContentData();

  if (isRecording && autoStopRecording && isGif && gifElement) {
    const currentFrame = gifElement.get_current_frame();
    const totalFrames = gifElement.get_length();
    if (lastGifFrame === totalFrames - 1 && currentFrame === 0) stopRecording();
    lastGifFrame = currentFrame;
  }

  ctx.fillStyle = settings.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `500 ${settings.fontSize}px monospace`;
  ctx.textBaseline = "top";

  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    ripples[i].update();
    if (ripples[i].life <= 0) ripples.splice(i, 1);
  }

  const activeChars = charSets[settings.charSet] || charSets.standard;
  for (const particle of particles) {
    if (shouldSkipParticle(particle, settings, ripples.length > 0)) continue;

    let x = particle.x;
    let y = particle.y;
    let char = particle.char;
    const color = resolveDrawColor(particle, settings);
    let drawR = color.r;
    let drawG = color.g;
    let drawB = color.b;

    for (const ripple of ripples) {
      const dx = x - ripple.x;
      const dy = y - ripple.y;
      if (Math.abs(dx) > ripple.radius + 100 || Math.abs(dy) > ripple.radius + 100) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      const width = 120;
      if (Math.abs(dist - ripple.radius) < width) {
        const force = (width - Math.abs(dist - ripple.radius)) / width;
        const angle = Math.atan2(dy, dx);
        const move = force * ripple.strength * (ripple.life / 100);
        x += Math.cos(angle) * move;
        y += Math.sin(angle) * move;

        const highlight = force * 255 * (ripple.life / 100);
        drawR = Math.min(255, drawR + highlight);
        drawG = Math.min(255, drawG + highlight);
        drawB = Math.min(255, drawB + highlight);
        if (force > 0.7) {
          char = Math.random() > 0.5
            ? activeChars[activeChars.length - 1]
            : activeChars[Math.max(0, activeChars.length - 2)];
        }
      }
    }

    if (char !== " ") {
      ctx.fillStyle = `rgb(${drawR},${drawG},${drawB})`;
      ctx.fillText(char, x, y);
    }
  }

  animationFrameId = requestAnimationFrame(animate);
}

function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  if (!effectInitialized) {
    alert("请先上传一个视频、图片或 GIF。");
    return;
  }

  autoStopRecording = autoLoopRecord.checked;
  prepareAutoStop();

  try {
    const stream = canvas.captureStream(30);
    mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    recordedChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };
    mediaRecorder.onstop = exportVideo;
    mediaRecorder.start();
    isRecording = true;
    recordBtn.textContent = "停止录制视频";
    recordBtn.classList.add("recording");
    recordingIndicator.classList.remove("hidden");
    recordStatus.textContent = autoStopRecording ? "录制中...素材播放完毕将自动停止" : "正在录制...再次点击停止";
  } catch (error) {
    console.error("录制失败", error);
    alert("浏览器不支持或无法启动录制功能。");
    cleanupAutoStop();
  }
}

function prepareAutoStop() {
  if (!autoStopRecording) return;
  if (isVideo && videoElement) {
    videoElement.currentTime = 0;
    videoElement.loop = false;
    videoEndedCallback = () => {
      stopRecording();
      videoElement.loop = true;
      videoElement.play().catch(() => {});
    };
    videoElement.addEventListener("ended", videoEndedCallback);
  } else if (isGif && gifElement) {
    gifElement.move_to(0);
    lastGifFrame = 0;
  } else if (imageElement) {
    autoStopTimer = setTimeout(stopRecording, 3000);
  }
}

function stopRecording() {
  if (!isRecording) return;
  mediaRecorder.stop();
  isRecording = false;
  recordBtn.textContent = "开始录制视频";
  recordBtn.classList.remove("recording");
  recordingIndicator.classList.add("hidden");
  recordStatus.textContent = "处理中...";
  cleanupAutoStop();
}

function cleanupAutoStop() {
  if (isVideo && videoElement && videoEndedCallback) {
    videoElement.removeEventListener("ended", videoEndedCallback);
    videoElement.loop = true;
    videoElement.play().catch(() => {});
    videoEndedCallback = null;
  }
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
  autoStopRecording = false;
}

function exportVideo() {
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  downloadBlob(blob, `ascii_art_${Date.now()}.webm`);
  recordStatus.textContent = "下载已开始";
}

function exportCleanApp() {
  const files = [
    fetch("./index.html").then((response) => response.text()),
    fetch("./src/styles.css").then((response) => response.text()),
    fetch("./src/ascii-core.js").then((response) => response.text()),
    fetch("./src/app.js").then((response) => response.text())
  ];

  Promise.all(files)
    .then(([html, css, core, app]) => {
      const inlined = html
        .replace('<link rel="stylesheet" href="./src/styles.css">', `<style>\n${css}\n</style>`)
        .replace('<script type="module" src="./src/app.js"></script>', `<script type="module">\n${core}\n${rewriteAppImports(app)}\n<${"/"}script>`);
      downloadBlob(new Blob([inlined], { type: "text/html;charset=utf-8" }), `ASCII_Matrix_Tool_${Date.now()}.html`);
    })
    .catch((error) => {
      console.error("导出工具失败", error);
      alert("导出工具失败，请确认当前页面通过本地服务器打开。");
    });
}

function rewriteAppImports(source) {
  return source.replace(/import\s+\{[\s\S]*?\}\s+from\s+"\.\/ascii-core\.js";\n/, "");
}

function exportStandalonePlayer() {
  if (!currentFile) {
    alert("请先上传一个视频、图片或 GIF，才能导出播放器！");
    return;
  }
  if (isVideo && settings.backgroundRemoval.enabled) {
    alert("当前独立播放器暂不打包视频实时去背景；请先关闭 AI 去背景，或直接在本工具里录制去背景结果。");
    return;
  }

  exportPlayerBtn.textContent = "打包中...";
  const reader = new FileReader();
  let exportMimeType = currentFile.type;
  reader.onload = (event) => {
    const html = buildStandalonePlayerHtml({
      base64: event.target.result,
      mimeType: exportMimeType,
      settings,
      charSets,
      loop: exportLoopToggle.checked
    });
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `ASCII_Player_${Date.now()}.html`);
    exportPlayerBtn.textContent = "导出独立播放器 (HTML)";
  };
  reader.onerror = () => {
    exportPlayerBtn.textContent = "导出独立播放器 (HTML)";
    alert("读取文件失败，无法导出播放器。");
  };
  if (processedImageUrl && !isVideo && !isGif) {
    fetch(processedImageUrl)
      .then((response) => response.blob())
      .then((blob) => {
        exportMimeType = blob.type || "image/png";
        reader.readAsDataURL(blob);
      })
      .catch((error) => {
        console.error("读取去背景图片失败", error);
        reader.readAsDataURL(currentFile);
      });
  } else {
    reader.readAsDataURL(currentFile);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.style.display = "none";
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}
