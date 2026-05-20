export const DEFAULT_CUSTOM_COLOR = Object.freeze({ r: 0, g: 255, b: 0 });

export const DEFAULT_SETTINGS = Object.freeze({
  fontSize: 10,
  charSpacing: 1,
  colorMode: "original",
  charSet: "standard",
  enableRipple: true,
  rippleStrength: 50,
  resolution: "screen",
  backgroundColor: "#000000",
  invert: false,
  ignoreWhite: false,
  customColor: DEFAULT_CUSTOM_COLOR,
  backgroundRemoval: Object.freeze({
    enabled: false,
    output: "transparent",
    replacementColor: "#000000",
    quality: "balanced",
    threshold: 0.5,
    softness: 0.1
  })
});

export const CHAR_SETS = Object.freeze({
  standard: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  geometric: "   ...:::---+++***◦◦••▢▣",
  binary: " 01"
});

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null;
}

export function isSupportedBackgroundRemovalBitmap(mimeType) {
  return ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimeType);
}

export function characterForBrightness(brightness, characterSet) {
  const chars = characterSet || CHAR_SETS.standard;
  const index = Math.max(
    0,
    Math.min(chars.length - 1, Math.floor((brightness / 255) * (chars.length - 1)))
  );
  return chars[index];
}

export function resolveDrawColor(pixel, settings) {
  const brightness = pixel.brightness;
  let drawR;
  let drawG;
  let drawB;

  switch (settings.colorMode) {
    case "matrix":
      drawR = 0;
      drawG = brightness;
      drawB = 0;
      break;
    case "bw":
      drawR = brightness;
      drawG = brightness;
      drawB = brightness;
      break;
    case "cyan":
      drawR = 0;
      drawG = brightness;
      drawB = brightness;
      break;
    case "fire":
      drawR = brightness;
      drawG = brightness * 0.6;
      drawB = 0;
      break;
    case "custom": {
      const customColor = settings.customColor || DEFAULT_CUSTOM_COLOR;
      const norm = brightness / 255;
      drawR = customColor.r * norm;
      drawG = customColor.g * norm;
      drawB = customColor.b * norm;
      break;
    }
    case "original":
    default:
      drawR = pixel.r;
      drawG = pixel.g;
      drawB = pixel.b;
      break;
  }

  if (settings.invert) {
    drawR = 255 - drawR;
    drawG = 255 - drawG;
    drawB = 255 - drawB;
  }

  return {
    r: Math.round(clampColor(drawR)),
    g: Math.round(clampColor(drawG)),
    b: Math.round(clampColor(drawB))
  };
}

export function shouldSkipParticle(pixel, settings, hasRipples) {
  if (
    settings.backgroundRemoval?.enabled &&
    settings.backgroundRemoval.output === "transparent" &&
    (pixel.alpha ?? 255) < 24 &&
    !hasRipples
  ) {
    return true;
  }
  if (pixel.brightness < 20 && !hasRipples && !settings.invert) return true;
  if (settings.ignoreWhite && pixel.brightness > 230 && !hasRipples) return true;
  return false;
}

export function alphaFromSegmentationScore(score, threshold = 0.5, softness = 0.1) {
  const safeSoftness = Math.max(0.001, softness);
  const start = threshold - safeSoftness;
  const end = threshold + safeSoftness;
  if (score <= start) return 0;
  if (score >= end) return 255;
  return Math.round(((score - start) / (end - start)) * 255);
}

export function applyBackgroundRemovalPixel(pixel, settings) {
  const removal = settings.backgroundRemoval;
  if (!removal?.enabled || removal.output !== "color") {
    return { r: pixel.r, g: pixel.g, b: pixel.b };
  }

  const background = hexToRgb(removal.replacementColor) || { r: 0, g: 0, b: 0 };
  const alpha = (pixel.alpha ?? 255) / 255;
  return {
    r: Math.round(pixel.r * alpha + background.r * (1 - alpha)),
    g: Math.round(pixel.g * alpha + background.g * (1 - alpha)),
    b: Math.round(pixel.b * alpha + background.b * (1 - alpha))
  };
}

export function calculateCoverRect({ sourceWidth, sourceHeight, targetWidth, targetHeight }) {
  const aspectSrc = sourceWidth / sourceHeight;
  const aspectDest = targetWidth / targetHeight;

  if (aspectSrc > aspectDest) {
    const height = targetHeight;
    const width = sourceWidth * (targetHeight / sourceHeight);
    return {
      x: (targetWidth - width) / 2,
      y: 0,
      width,
      height
    };
  }

  const width = targetWidth;
  const height = sourceHeight * (targetWidth / sourceWidth);
  return {
    x: 0,
    y: (targetHeight - height) / 2,
    width,
    height
  };
}

export function getBackgroundRemovalStageProgress(stage) {
  const progressByStage = {
    idle: 0,
    "loading-model": 18,
    converting: 35,
    processing: 72,
    complete: 100,
    failed: 100
  };
  return progressByStage[stage] ?? 0;
}

export function extractCleanAppHtml(html) {
  const appStart = html.search(/<meta\s+charset=["']UTF-8["']/i);
  if (appStart === -1) {
    throw new Error("Could not find the ASCII app document start.");
  }

  return `<!DOCTYPE html>\n<html lang="zh-CN"><head>${html.slice(appStart)}`;
}

export function buildStandalonePlayerHtml({ base64, mimeType, settings, charSets, loop }) {
  const playerSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    customColor: settings.customColor || DEFAULT_CUSTOM_COLOR
  };
  const serializedSettings = JSON.stringify(playerSettings);
  const serializedCharSets = JSON.stringify(charSets);
  const serializedBase64 = JSON.stringify(base64);
  const serializedMimeType = JSON.stringify(mimeType);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>ASCII 矩阵播放器</title>
  ${mimeType === "image/gif" ? `<script src="https://unpkg.com/libgif@0.0.3/libgif.js"><${"/"}script><script>if(!window.SuperGif){document.write('<script src="https://cdn.jsdelivr.net/npm/libgif@0.0.3/libgif.js"><\\\\/script>')}<${"/"}script>` : ""}
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: ${playerSettings.backgroundColor}; overflow: hidden; display: flex; align-items: center; justify-content: center; touch-action: none; }
    canvas { filter: contrast(1.3) brightness(1.1); }
    .scanlines { position: fixed; inset: 0; background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.1)); background-size: 100% 4px; z-index: 10; pointer-events: none; }
  </style>
</head>
<body>
  <div class="scanlines"></div>
  <div id="hidden-assets" style="display: none;"></div>
  <canvas id="asciiCanvas"></canvas>
  <script>
    const canvas = document.getElementById("asciiCanvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    const hiddenAssets = document.getElementById("hidden-assets");
    const settings = ${serializedSettings};
    const charSets = ${serializedCharSets};
    const sourceData = ${serializedBase64};
    const mimeType = ${serializedMimeType};
    const isLoop = ${Boolean(loop)};
    const isVideo = mimeType.startsWith("video/");
    const isGif = mimeType === "image/gif";
    let source = null;
    let videoElement = null;
    let gifElement = null;
    let particles = [];
    let ripples = [];
    let cols = 0;
    let rows = 0;
    const offCanvas = document.createElement("canvas");
    const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });

    function characterForBrightness(brightness, chars) {
      return chars[Math.max(0, Math.min(chars.length - 1, Math.floor((brightness / 255) * (chars.length - 1))))];
    }

    function resolveDrawColor(pixel) {
      let drawR;
      let drawG;
      let drawB;
      switch (settings.colorMode) {
        case "matrix": drawR = 0; drawG = pixel.brightness; drawB = 0; break;
        case "bw": drawR = pixel.brightness; drawG = pixel.brightness; drawB = pixel.brightness; break;
        case "cyan": drawR = 0; drawG = pixel.brightness; drawB = pixel.brightness; break;
        case "fire": drawR = pixel.brightness; drawG = pixel.brightness * 0.6; drawB = 0; break;
        case "custom": {
          const customColor = settings.customColor || { r: 0, g: 255, b: 0 };
          const norm = pixel.brightness / 255;
          drawR = customColor.r * norm; drawG = customColor.g * norm; drawB = customColor.b * norm;
          break;
        }
        default: drawR = pixel.r; drawG = pixel.g; drawB = pixel.b;
      }
      if (settings.invert) { drawR = 255 - drawR; drawG = 255 - drawG; drawB = 255 - drawB; }
      return { r: Math.round(Math.max(0, Math.min(255, drawR))), g: Math.round(Math.max(0, Math.min(255, drawG))), b: Math.round(Math.max(0, Math.min(255, drawB))) };
    }

    function resizeCanvas() {
      let targetWidth;
      let targetHeight;
      if (settings.resolution === "original") {
        if (isGif && gifElement && gifElement.get_canvas()) {
          targetWidth = gifElement.get_canvas().width;
          targetHeight = gifElement.get_canvas().height;
        } else if (isVideo && videoElement && videoElement.videoWidth) {
          targetWidth = videoElement.videoWidth;
          targetHeight = videoElement.videoHeight;
        } else if (source && source.width) {
          targetWidth = source.width;
          targetHeight = source.height;
        }
      }
      if (!targetWidth || !targetHeight) {
        if (settings.resolution === "screen") {
          targetWidth = window.innerWidth * (window.devicePixelRatio || 1);
          targetHeight = window.innerHeight * (window.devicePixelRatio || 1);
        } else {
          [targetWidth, targetHeight] = settings.resolution.split("x").map(Number);
        }
      }
      const windowRatio = window.innerWidth / window.innerHeight;
      const targetRatio = targetWidth / targetHeight;
      if (windowRatio > targetRatio) {
        canvas.style.height = "100%";
        canvas.style.width = "auto";
      } else {
        canvas.style.width = "100%";
        canvas.style.height = "auto";
      }
      const stride = settings.fontSize * settings.charSpacing;
      const targetCols = Math.ceil(targetWidth / stride);
      const targetRows = Math.ceil(targetHeight / stride);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight || cols !== targetCols || rows !== targetRows) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        cols = targetCols;
        rows = targetRows;
        offCanvas.width = cols;
        offCanvas.height = rows;
        initParticles();
      }
    }

    function initParticles() {
      const stride = settings.fontSize * settings.charSpacing;
      particles = new Array(cols * rows);
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          particles[y * cols + x] = { x: x * stride, y: y * stride, char: " ", r: 0, g: 0, b: 0, brightness: 0 };
        }
      }
    }

    class Ripple {
      constructor(x, y) { this.x = x; this.y = y; this.radius = 0; this.speed = 20 + canvas.width / 100; this.life = 100; this.strength = settings.rippleStrength; }
      update() { this.radius += this.speed; this.life -= 1.5; }
    }

    function getCanvasCoordinates(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
    }

    function addRipple(clientX, clientY) {
      if (!settings.enableRipple) return;
      const pos = getCanvasCoordinates(clientX, clientY);
      ripples.push(new Ripple(pos.x, pos.y));
    }

    canvas.addEventListener("click", (event) => addRipple(event.clientX, event.clientY));
    canvas.addEventListener("touchstart", (event) => {
      for (const touch of event.touches) addRipple(touch.clientX, touch.clientY);
    });

    function getActiveSource() {
      if (isGif && gifElement) return { source: gifElement.get_canvas(), width: gifElement.get_canvas().width, height: gifElement.get_canvas().height };
      if (isVideo && videoElement) return { source: videoElement, width: videoElement.videoWidth, height: videoElement.videoHeight };
      if (source) return { source, width: source.width, height: source.height };
      return null;
    }

    function updateContentData() {
      const active = getActiveSource();
      if (!active || !active.width || !active.height) return;
      const aspectSrc = active.width / active.height;
      const aspectDest = cols / rows;
      let drawW;
      let drawH;
      let drawX;
      let drawY;
      if (aspectSrc > aspectDest) {
        drawH = rows; drawW = active.width * (rows / active.height); drawX = (cols - drawW) / 2; drawY = 0;
      } else {
        drawW = cols; drawH = active.height * (cols / active.width); drawX = 0; drawY = (rows - drawH) / 2;
      }
      offCtx.fillStyle = "#000";
      offCtx.fillRect(0, 0, cols, rows);
      offCtx.drawImage(active.source, drawX, drawY, drawW, drawH);
      const imgData = offCtx.getImageData(0, 0, cols, rows).data;
      const activeChars = charSets[settings.charSet] || charSets.standard;
      for (let i = 0; i < particles.length; i += 1) {
        const r = imgData[i * 4];
        const g = imgData[i * 4 + 1];
        const b = imgData[i * 4 + 2];
        const brightness = r * 0.299 + g * 0.587 + b * 0.114;
        const p = particles[i];
        p.char = characterForBrightness(brightness, activeChars);
        p.r = r; p.g = g; p.b = b; p.brightness = brightness;
      }
    }

    function animate() {
      if (isGif && gifElement && !isLoop && gifElement.get_current_frame() >= gifElement.get_length() - 1) gifElement.pause();
      updateContentData();
      ctx.fillStyle = settings.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "500 " + settings.fontSize + "px monospace";
      ctx.textBaseline = "top";
      const activeChars = charSets[settings.charSet] || charSets.standard;
      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        ripples[i].update();
        if (ripples[i].life <= 0) ripples.splice(i, 1);
      }
      for (const p of particles) {
        if (p.brightness < 20 && ripples.length === 0 && !settings.invert) continue;
        if (settings.ignoreWhite && p.brightness > 230 && ripples.length === 0) continue;
        let x = p.x;
        let y = p.y;
        let char = p.char;
        const color = resolveDrawColor(p);
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
            if (force > 0.7) char = Math.random() > 0.5 ? activeChars.at(-1) : activeChars.at(-2);
          }
        }
        if (char !== " ") {
          ctx.fillStyle = "rgb(" + drawR + "," + drawG + "," + drawB + ")";
          ctx.fillText(char, x, y);
        }
      }
      requestAnimationFrame(animate);
    }

    function startPlayback() {
      resizeCanvas();
      animate();
    }

    window.addEventListener("resize", resizeCanvas);
    if (isGif) {
      if (!window.SuperGif) {
        document.body.textContent = "GIF 解析组件加载失败，请联网后重新打开。";
      } else {
        const image = document.createElement("img");
        image.src = sourceData;
        hiddenAssets.appendChild(image);
        const loader = new SuperGif({ gif: image, auto_play: true });
        loader.load(() => { gifElement = loader; startPlayback(); });
      }
    } else if (isVideo) {
      videoElement = document.createElement("video");
      videoElement.src = sourceData;
      videoElement.muted = true;
      videoElement.loop = isLoop;
      videoElement.playsInline = true;
      videoElement.autoplay = true;
      videoElement.style.display = "none";
      document.body.appendChild(videoElement);
      videoElement.onloadeddata = () => { videoElement.play(); startPlayback(); };
    } else {
      source = new Image();
      source.src = sourceData;
      source.onload = startPlayback;
    }
  <${"/"}script>
</body>
</html>`;
}

function clampColor(value) {
  return Math.max(0, Math.min(255, value));
}
