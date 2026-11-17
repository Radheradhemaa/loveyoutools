import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
  // Standardize on 4 threads for better WASM performance without oversubscription
  env.backends.onnx.wasm.numThreads = 4;
}

let isnetPipeline: any = null;
let modnetPipeline: any = null;
let u2netPipeline: any = null;

// Check for WebGPU adapter to avoid lazy initialization failures
let hasWebGPU = false;
let checkWebGPUPromise: Promise<void> | null = null;

const isMobileDevice = () => {
  if (typeof window === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) ||
    (navigator.maxTouchPoints > 0 && /Android/i.test(navigator.userAgent))
  );
};

const ensureWebGPUChecked = async () => {
  if (checkWebGPUPromise) return checkWebGPUPromise;
  checkWebGPUPromise = (async () => {
    // Disable WebGPU on mobile automatically as it causes vertical stripes and artifacts
    if (isMobileDevice()) {
      hasWebGPU = false;
      return;
    }

    if (typeof navigator !== "undefined" && (navigator as any).gpu) {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) hasWebGPU = true;
      } catch (e) {
        console.warn("WebGPU adapter request failed", e);
      }
    }
  })();
  return checkWebGPUPromise;
};

/**
 * Ensures the primary precision model (RMBG-1.4) is loaded.
 */
export const ensureIsnetLoaded = async () => {
  if (!isnetPipeline) {
    await ensureWebGPUChecked();
    const device = hasWebGPU ? "webgpu" : "wasm";
    try {
      isnetPipeline = await pipeline("image-segmentation", "briaai/RMBG-1.4", { device });
    } catch (e) {
      try {
        isnetPipeline = await pipeline("image-segmentation", "Xenova/modnet", { device });
      } catch (e2) {
        isnetPipeline = await pipeline("image-segmentation", "Xenova/modnet", { device: "wasm" });
      }
    }
  }
};

/**
 * Ensures the portrait matting model (MODNet) is loaded.
 * MODNet is specialized in isolating human portraits and excluding chairs, desks, and backgrounds.
 */
export const ensureModnetLoaded = async () => {
  if (!modnetPipeline) {
    await ensureWebGPUChecked();
    const device = hasWebGPU ? "webgpu" : "wasm";
    try {
      modnetPipeline = await pipeline("image-segmentation", "Xenova/modnet", { device });
    } catch (e) {
      try {
        modnetPipeline = await pipeline("image-segmentation", "Xenova/modnet", { device: "wasm" });
      } catch (e2) {
        console.warn("MODNet failed to load, fallback to RMBG", e2);
      }
    }
  }
};

export const ensureU2netLoaded = async () => {
  if (!u2netPipeline) {
    await ensureWebGPUChecked();
    const device = hasWebGPU ? "webgpu" : "wasm";
    try {
      u2netPipeline = await pipeline("image-segmentation", "Xenova/isnet_general_use", { device });
    } catch (e) {
      try {
        u2netPipeline = await pipeline("image-segmentation", "Xenova/isnet_general_use", { device: "wasm" });
      } catch (e2) {
        console.warn("[AI] Secondary Background Model (ISNet) failed to load.", e2);
      }
    }
  }
};

/**
 * Compatibility stubs.
 */
export const ensurePreloaded = async () => {
  await Promise.all([
    ensureIsnetLoaded().catch(console.error),
    ensureModnetLoaded().catch(console.error),
  ]);
};

/**
 * Options for fine-grained AI background removal and subject preservation.
 */
export interface BgRemovalOptions {
  engine?: 'auto' | 'strict_subject' | 'rmbg' | 'modnet' | 'isnet';
  isolateMainSubject?: boolean;
  objectStrictness?: number; // 0 to 100
  severTouchingObjects?: boolean;
  removeBackgroundNoise?: boolean;
  preserveEarsAndShoulders?: boolean;
  extendLeftShoulder?: boolean;
  leftShoulderExtensionAmount?: number;
  decontaminateHalos?: boolean;
}

/**
 * Robust downscaling and preprocessing.
 * Mobile-safe: preserves original aspect ratio.
 * Optimized resolution (1024px desktop / 768px mobile) to capture high-frequency details (ears, neck, hair, hands, clothes).
 */
async function downscaleImageIfNeeded(
  imageSrc: string | File | Blob,
  maxDim = 1024,
): Promise<string> {
  const isMobile = isMobileDevice();
  const limit = isMobile ? Math.min(maxDim, 768) : maxDim;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (img.width <= limit && img.height <= limit) {
        if (typeof imageSrc === "string" && imageSrc.startsWith("data:"))
          return resolve(imageSrc);
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        return resolve(c.toDataURL("image/png"));
      }

      const canvas = document.createElement("canvas");
      const ratio = Math.min(limit / img.width, limit / img.height);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", {
        alpha: true,
        willReadFrequently: true,
      })!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = isMobile ? "medium" : "high";
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      if (typeof imageSrc === "string") resolve(imageSrc);
      else resolve("");
    };
    if (typeof imageSrc === "string") {
      img.src = imageSrc;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => (img.src = e.target?.result as string);
      reader.readAsDataURL(imageSrc);
    }
  });
}

// -------------------------------------------------------------
// STAGE 2: BACKGROUND COLOR SAMPLING
// -------------------------------------------------------------

interface SectorBackgroundModel {
  meanR: number;
  meanG: number;
  meanB: number;
  stdR: number;
  stdG: number;
  stdB: number;
  sampleCount: number;
}

interface BackgroundModels {
  global: SectorBackgroundModel;
  sectors: SectorBackgroundModel[]; // 3x3 grid of sectors
}

/**
 * Samples the background color distribution across spatial sectors from definite background pixels.
 */
function sampleBackgroundModels(
  imageData: ImageData,
  maskAlphas: Float32Array | Uint8Array,
  maskW: number,
  maskH: number
): BackgroundModels {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;

  const defaultSector = (): SectorBackgroundModel => ({
    meanR: 245,
    meanG: 245,
    meanB: 245,
    stdR: 15,
    stdG: 15,
    stdB: 15,
    sampleCount: 0,
  });

  const sectors: SectorBackgroundModel[] = Array.from({ length: 9 }, defaultSector);
  const sectorSums = Array.from({ length: 9 }, () => ({ r: 0, g: 0, b: 0, r2: 0, g2: 0, b2: 0, count: 0 }));

  let globalR = 0, globalG = 0, globalB = 0;
  let globalR2 = 0, globalG2 = 0, globalB2 = 0;
  let globalCount = 0;

  const stepY = Math.max(1, Math.floor(h / 120));
  const stepX = Math.max(1, Math.floor(w / 120));

  for (let y = 0; y < h; y += stepY) {
    const maskY = Math.min(maskH - 1, Math.floor((y / h) * maskH));
    const secY = Math.min(2, Math.floor((y / h) * 3));

    for (let x = 0; x < w; x += stepX) {
      const maskX = Math.min(maskW - 1, Math.floor((x / w) * maskW));
      const maskIdx = maskY * maskW + maskX;
      const alpha = maskAlphas[maskIdx];

      // Sample strictly from high-confidence definite background pixels (< 10/255)
      if (alpha < 10) {
        const secX = Math.min(2, Math.floor((x / w) * 3));
        const sectorIdx = secY * 3 + secX;

        const imgIdx = (y * w + x) * 4;
        const r = data[imgIdx];
        const g = data[imgIdx + 1];
        const b = data[imgIdx + 2];

        sectorSums[sectorIdx].r += r;
        sectorSums[sectorIdx].g += g;
        sectorSums[sectorIdx].b += b;
        sectorSums[sectorIdx].r2 += r * r;
        sectorSums[sectorIdx].g2 += g * g;
        sectorSums[sectorIdx].b2 += b * b;
        sectorSums[sectorIdx].count++;

        globalR += r;
        globalG += g;
        globalB += b;
        globalR2 += r * r;
        globalG2 += g * g;
        globalB2 += b * b;
        globalCount++;
      }
    }
  }

  // Compute Global Model
  let globalModel: SectorBackgroundModel;
  if (globalCount > 20) {
    const mR = globalR / globalCount;
    const mG = globalG / globalCount;
    const mB = globalB / globalCount;
    const varR = Math.max(9, globalR2 / globalCount - mR * mR);
    const varG = Math.max(9, globalG2 / globalCount - mG * mG);
    const varB = Math.max(9, globalB2 / globalCount - mB * mB);
    globalModel = {
      meanR: mR,
      meanG: mG,
      meanB: mB,
      stdR: Math.sqrt(varR),
      stdG: Math.sqrt(varG),
      stdB: Math.sqrt(varB),
      sampleCount: globalCount,
    };
  } else {
    globalModel = defaultSector();
  }

  // Compute Sector Models (fallback to global if low sample count in that sector)
  for (let s = 0; s < 9; s++) {
    const sum = sectorSums[s];
    if (sum.count > 10) {
      const mR = sum.r / sum.count;
      const mG = sum.g / sum.count;
      const mB = sum.b / sum.count;
      const varR = Math.max(9, sum.r2 / sum.count - mR * mR);
      const varG = Math.max(9, sum.g2 / sum.count - mG * mG);
      const varB = Math.max(9, sum.b2 / sum.count - mB * mB);
      sectors[s] = {
        meanR: mR,
        meanG: mG,
        meanB: mB,
        stdR: Math.sqrt(varR),
        stdG: Math.sqrt(varG),
        stdB: Math.sqrt(varB),
        sampleCount: sum.count,
      };
    } else {
      sectors[s] = { ...globalModel };
    }
  }

  return { global: globalModel, sectors };
}

// -------------------------------------------------------------
// STAGE 3: MASK EXTRACTION & NOISE SUPPRESSION
// -------------------------------------------------------------

/**
 * Robustly extracts single-channel float alpha values (0 to 255) from Transformers.js segmentation masks.
 */
function extractAlphaArrayFromMask(mask: any): { width: number; height: number; data: Float32Array } {
  const width = mask.width;
  const height = mask.height;
  const channels = mask.channels || 1;
  const raw = mask.data;
  const total = width * height;
  const out = new Float32Array(total);

  // Check scale (0..1 vs 0..255) across the entire mask, including center where subject is
  let maxVal = 0;
  const step = Math.max(1, Math.floor(raw.length / 500));
  for (let i = 0; i < raw.length; i += step) {
    if (raw[i] > maxVal) maxVal = raw[i];
  }
  // Check center core where portrait subjects are located
  const centerIdx = Math.floor(total * 0.45) * channels;
  const cRange = Math.min(500, Math.floor(raw.length * 0.1));
  for (let i = Math.max(0, centerIdx - cRange); i < Math.min(raw.length, centerIdx + cRange); i++) {
    if (raw[i] > maxVal) maxVal = raw[i];
  }

  // If neural net output is normalized floats (0..1) or maxVal <= 1.5, scale to 255.0
  const isNormalized = (raw instanceof Float32Array && maxVal <= 1.5) || (maxVal > 0 && maxVal <= 1.05);
  const scale = isNormalized ? 255.0 : 1.0;

  if (channels === 1) {
    for (let i = 0; i < total; i++) {
      out[i] = raw[i] * scale;
    }
  } else if (channels === 4) {
    // If RGBA, inspect whether mask is in alpha channel or luminance
    let alphaSum = 0;
    for (let i = 0; i < Math.min(200, total); i++) {
      alphaSum += raw[i * 4 + 3];
    }
    const useAlpha = alphaSum > 0 && alphaSum < 255 * 190;
    for (let i = 0; i < total; i++) {
      out[i] = (useAlpha ? raw[i * 4 + 3] : raw[i * 4]) * scale;
    }
  } else if (channels === 3) {
    for (let i = 0; i < total; i++) {
      out[i] = (0.299 * raw[i * 3] + 0.587 * raw[i * 3 + 1] + 0.114 * raw[i * 3 + 2]) * scale;
    }
  } else {
    for (let i = 0; i < total; i++) {
      out[i] = raw[i] * scale;
    }
  }

  // Polarity check: in portrait/passport photography, corners are background and center is subject.
  // If corners are opaque and center is transparent, the mask is inverted!
  let cornerSum = 0, cornerCount = 0;
  const sampleR = Math.max(3, Math.min(12, Math.floor(width / 10), Math.floor(height / 10)));
  for (let y = 0; y < sampleR; y++) {
    for (let x = 0; x < sampleR; x++) {
      cornerSum += out[y * width + x];
      cornerSum += out[y * width + (width - 1 - x)];
      cornerCount += 2;
    }
  }

  let centerSum = 0, centerCount = 0;
  const cYStart = Math.floor(height * 0.25);
  const cYEnd = Math.floor(height * 0.65);
  const cXStart = Math.floor(width * 0.35);
  const cXEnd = Math.floor(width * 0.65);
  const cStep = Math.max(1, Math.floor((cXEnd - cXStart) / 12));
  for (let y = cYStart; y < cYEnd; y += cStep) {
    const row = y * width;
    for (let x = cXStart; x < cXEnd; x += cStep) {
      centerSum += out[row + x];
      centerCount++;
    }
  }

  const avgCorner = cornerCount > 0 ? cornerSum / cornerCount : 0;
  const avgCenter = centerCount > 0 ? centerSum / centerCount : 0;

  if (avgCorner > 160 && avgCenter < 80) {
    console.log("[AI] Inverted mask detected. Inverting polarity to preserve subject.");
    for (let i = 0; i < total; i++) {
      out[i] = Math.max(0, Math.min(255, 255.0 - out[i]));
    }
  }

  return { width, height, data: out };
}

/**
 * Accurately finds all pixels connected to the image boundaries that belong to the outer background.
 * Uses a robust 4-way BFS queue starting strictly from outer perimeter background pixels.
 * Uses a strict barrier threshold to prevent flood-fill from ever entering head, ears, neck, shoulders, or clothes.
 */
function findExteriorBackgroundMask(
  alphas: Float32Array,
  w: number,
  h: number,
  bgThreshold = 20
): Uint8Array {
  const total = w * h;
  const isExterior = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  // 1. Estimate subject horizontal bounds to protect the torso / white shirt and shoulders
  let minSubjX = w;
  let maxSubjX = 0;
  let minSubjY = h;
  let maxSubjY = 0;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphas[row + x] >= 20) {
        if (x < minSubjX) minSubjX = x;
        if (x > maxSubjX) maxSubjX = x;
        if (y < minSubjY) minSubjY = y;
        if (y > maxSubjY) maxSubjY = y;
      }
    }
  }

  // If no clear subject detected, fallback bounds
  if (maxSubjX <= minSubjX) {
    minSubjX = Math.floor(w * 0.20);
    maxSubjX = Math.floor(w * 0.80);
    minSubjY = 0;
    maxSubjY = h - 1;
  }

  const subjHeight = maxSubjY - minSubjY;
  const chinY = Math.floor(minSubjY + subjHeight * 0.35);

  // 2. Safely seed the exterior background:
  // Top border: seed background ONLY if alpha is very low (< bgThreshold) and outside hair center
  for (let x = 0; x < w; x++) {
    const topIdx = x;
    const isOverHead = x >= (minSubjX + 10) && x <= (maxSubjX - 10);
    if (!isOverHead || alphas[topIdx] < 10) {
      if (alphas[topIdx] < bgThreshold && isExterior[topIdx] === 0) {
        isExterior[topIdx] = 1;
        queue[tail++] = topIdx;
      }
    }
  }

  // Left & Right borders:
  for (let y = 0; y < h; y++) {
    const leftIdx = y * w;
    const rightIdx = y * w + (w - 1);

    if (alphas[leftIdx] < bgThreshold && isExterior[leftIdx] === 0) {
      isExterior[leftIdx] = 1;
      queue[tail++] = leftIdx;
    }

    if (alphas[rightIdx] < bgThreshold && isExterior[rightIdx] === 0) {
      isExterior[rightIdx] = 1;
      queue[tail++] = rightIdx;
    }
  }

  // Bottom border: seed all background pixels outside subject
  for (let x = 0; x < w; x++) {
    const botIdx = (h - 1) * w + x;
    if (alphas[botIdx] < bgThreshold && isExterior[botIdx] === 0) {
      isExterior[botIdx] = 1;
      queue[tail++] = botIdx;
    }
  }

  // 3. 4-way BFS flood-fill outward to find true background
  // STRICT: Flood fill MUST NEVER cross into any pixel with alpha >= 20!
  // This guarantees hair, ears, head, shoulders, and clothes are NEVER penetrated!
  const barrierLimit = 20;

  while (head < tail) {
    const curr = queue[head++];
    const cy = Math.floor(curr / w);
    const cx = curr % w;

    const neighbors = [
      cy > 0 ? curr - w : -1,
      cy < h - 1 ? curr + w : -1,
      cx > 0 ? curr - 1 : -1,
      cx < w - 1 ? curr + 1 : -1,
    ];

    for (const nIdx of neighbors) {
      if (nIdx !== -1 && isExterior[nIdx] === 0 && alphas[nIdx] < barrierLimit) {
        isExterior[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
  }

  return isExterior;
}

/**
 * Intelligently detects and extends the left shoulder contour for human subjects,
 * specifically preventing white and check shirts from being cut or clipped against light/white backgrounds.
 * Uses anatomical right-shoulder symmetry, deltoid slope geometry, and fabric/check texture detection
 * to guarantee a full, natural, smooth deltoid curve without cutting white check shirts.
 */
export function extendAndProtectLeftShoulderAndGarment(
  rawAlphas: Float32Array,
  imageData: ImageData,
  w: number,
  h: number,
  options: {
    extendLeftShoulder?: boolean;
    leftShoulderExtensionAmount?: number;
  } = {},
  modnetAlphas?: Float32Array
) {
  const {
    extendLeftShoulder = true,
    leftShoulderExtensionAmount,
  } = options;

  if (!extendLeftShoulder) return;

  const pixels = imageData.data;

  // 1. Locate subject bounding box and center of mass
  let minSubjX = w, maxSubjX = 0, minSubjY = h, maxSubjY = 0;
  let massCenterX = 0;
  let confidentPxCount = 0;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const a = rawAlphas[row + x];
      if (a >= 45) {
        if (x < minSubjX) minSubjX = x;
        if (x > maxSubjX) maxSubjX = x;
        if (y < minSubjY) minSubjY = y;
        if (y > maxSubjY) maxSubjY = y;
        massCenterX += x;
        confidentPxCount++;
      }
    }
  }

  if (confidentPxCount < 200 || maxSubjX <= minSubjX || maxSubjY <= minSubjY) return;

  const coreCenterX = Math.round(massCenterX / confidentPxCount);
  const subjH = maxSubjY - minSubjY;
  const subjW = maxSubjX - minSubjX;

  // Compute head/face centerline (rows 15%-38%) so a clipped left shoulder doesn't skew symmetry rightward
  let headSumX = 0, headCount = 0;
  const headY0 = Math.floor(minSubjY + subjH * 0.15);
  const headY1 = Math.floor(minSubjY + subjH * 0.38);
  for (let y = headY0; y <= headY1; y++) {
    const row = y * w;
    for (let x = minSubjX; x <= maxSubjX; x++) {
      if (rawAlphas[row + x] >= 120) {
        headSumX += x;
        headCount++;
      }
    }
  }
  const symCenterX = headCount > 50
    ? Math.round((headSumX / headCount) * 0.7 + coreCenterX * 0.3)
    : coreCenterX;

  // 2. Trace current left and right edges for every row
  const leftEdgeX = new Int32Array(h);
  const rightEdgeX = new Int32Array(h);

  for (let y = 0; y < h; y++) {
    leftEdgeX[y] = -1;
    rightEdgeX[y] = -1;
    const row = y * w;

    for (let x = 0; x < coreCenterX; x++) {
      if (rawAlphas[row + x] >= 125) {
        leftEdgeX[y] = x;
        break;
      }
    }

    for (let x = w - 1; x >= coreCenterX; x--) {
      if (rawAlphas[row + x] >= 110) {
        rightEdgeX[y] = x;
        break;
      }
    }
  }

  // 3. Dynamically detect neck minimum & actual shoulder start Y using right-side contour
  // This prevents shoulder extension from ever filling background in the ear-to-shoulder pocket!
  const smoothedRightDist = new Float32Array(h);
  for (let y = minSubjY; y <= maxSubjY; y++) {
    let sum = 0, cnt = 0;
    for (let dy = -3; dy <= 3; dy++) {
      const ny = y + dy;
      if (ny >= minSubjY && ny <= maxSubjY && rightEdgeX[ny] !== -1) {
        sum += Math.max(0, rightEdgeX[ny] - coreCenterX);
        cnt++;
      }
    }
    smoothedRightDist[y] = cnt > 0 ? sum / cnt : 0;
  }

  // Find narrowest neck width on right side between 28% and 58% of subject height
  const neckSearchStart = Math.floor(minSubjY + subjH * 0.28);
  const neckSearchEnd = Math.floor(minSubjY + subjH * 0.58);
  let neckY = Math.floor(minSubjY + subjH * 0.46);
  let minNeckRightDist = Infinity;

  for (let y = neckSearchStart; y <= neckSearchEnd; y++) {
    if (smoothedRightDist[y] > 0 && smoothedRightDist[y] < minNeckRightDist) {
      minNeckRightDist = smoothedRightDist[y];
      neckY = y;
    }
  }
  if (!Number.isFinite(minNeckRightDist)) minNeckRightDist = subjW * 0.18;

  // Shoulder slope starts as soon as right contour begins flaring below neck minimum
  let detectedShoulderStartY = Math.floor(minSubjY + subjH * 0.50);
  const flareThreshold = minNeckRightDist + Math.max(8, subjW * 0.06);
  for (let y = neckY + 2; y <= Math.floor(minSubjY + subjH * 0.66); y++) {
    if (smoothedRightDist[y] >= flareThreshold) {
      detectedShoulderStartY = y;
      break;
    }
  }

  const shoulderStartY = Math.max(
    Math.floor(minSubjY + subjH * 0.45),
    Math.min(Math.floor(minSubjY + subjH * 0.56), Math.max(neckY + Math.round(subjH * 0.03), detectedShoulderStartY - 3))
  );
  const shoulderApexY = Math.max(shoulderStartY + 10, Math.floor(minSubjY + subjH * 0.78));
  const shoulderEndY = Math.min(h - 1, Math.floor(minSubjY + subjH * 0.96));

  if (shoulderStartY >= shoulderEndY) return;

  // 4. Sample per-row local LEFT and RIGHT exterior background colors & natural wall noise
  const rowBgR = new Float32Array(h);
  const rowBgG = new Float32Array(h);
  const rowBgB = new Float32Array(h);
  const rightRowBgR = new Float32Array(h);
  const rightRowBgG = new Float32Array(h);
  const rightRowBgB = new Float32Array(h);
  let globalBgNoiseSum = 0;
  let globalBgNoiseCount = 0;

  let fallbackSumR = 0, fallbackSumG = 0, fallbackSumB = 0, fallbackCount = 0;
  let rFallbackSumR = 0, rFallbackSumG = 0, rFallbackSumB = 0, rFallbackCount = 0;
  const farLeftLimit = Math.max(2, Math.min(minSubjX - 4, 25));
  const farRightStart = Math.min(w - 2, Math.max(maxSubjX + 4, w - 26));
  for (let y = shoulderStartY; y <= shoulderEndY; y += 2) {
    for (let x = 0; x < farLeftLimit; x += 2) {
      if (rawAlphas[y * w + x] < 15) {
        const pIdx = (y * w + x) * 4;
        fallbackSumR += pixels[pIdx];
        fallbackSumG += pixels[pIdx + 1];
        fallbackSumB += pixels[pIdx + 2];
        fallbackCount++;
      }
    }
    for (let x = farRightStart; x < w; x += 2) {
      if (rawAlphas[y * w + x] < 15) {
        const pIdx = (y * w + x) * 4;
        rFallbackSumR += pixels[pIdx];
        rFallbackSumG += pixels[pIdx + 1];
        rFallbackSumB += pixels[pIdx + 2];
        rFallbackCount++;
      }
    }
  }
  const fallbackBgR = fallbackCount > 0 ? fallbackSumR / fallbackCount : 245;
  const fallbackBgG = fallbackCount > 0 ? fallbackSumG / fallbackCount : 245;
  const fallbackBgB = fallbackCount > 0 ? fallbackSumB / fallbackCount : 245;
  const rFallbackBgR = rFallbackCount > 0 ? rFallbackSumR / rFallbackCount : fallbackBgR;
  const rFallbackBgG = rFallbackCount > 0 ? rFallbackSumG / rFallbackCount : fallbackBgG;
  const rFallbackBgB = rFallbackCount > 0 ? rFallbackSumB / rFallbackCount : fallbackBgB;

  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    let sR = 0, sG = 0, sB = 0, sCnt = 0;
    let rSR = 0, rSG = 0, rSB = 0, rSCnt = 0;
    const y0 = Math.max(0, y - 6);
    const y1 = Math.min(h - 1, y + 6);
    for (let sy = y0; sy <= y1; sy += 2) {
      const lEdge = leftEdgeX[sy] !== -1 ? leftEdgeX[sy] : minSubjX;
      const xEnd = Math.max(1, lEdge - 5);
      const xStart = Math.max(0, xEnd - 35);
      for (let x = xStart; x < xEnd; x += 2) {
        if (rawAlphas[sy * w + x] < 15) {
          const pIdx = (sy * w + x) * 4;
          sR += pixels[pIdx];
          sG += pixels[pIdx + 1];
          sB += pixels[pIdx + 2];
          sCnt++;
          if (x + 1 < xEnd) {
            const lumA = 0.299 * pixels[pIdx] + 0.587 * pixels[pIdx + 1] + 0.114 * pixels[pIdx + 2];
            const nIdx = (sy * w + x + 1) * 4;
            const lumB = 0.299 * pixels[nIdx] + 0.587 * pixels[nIdx + 1] + 0.114 * pixels[nIdx + 2];
            globalBgNoiseSum += Math.abs(lumA - lumB);
            globalBgNoiseCount++;
          }
        }
      }
      const rEdge = rightEdgeX[sy] !== -1 ? rightEdgeX[sy] : maxSubjX;
      const rxStart = Math.min(w - 2, rEdge + 5);
      const rxEnd = Math.min(w, rxStart + 35);
      for (let x = rxStart; x < rxEnd; x += 2) {
        if (rawAlphas[sy * w + x] < 15) {
          const pIdx = (sy * w + x) * 4;
          rSR += pixels[pIdx];
          rSG += pixels[pIdx + 1];
          rSB += pixels[pIdx + 2];
          rSCnt++;
        }
      }
    }
    rowBgR[y] = sCnt > 0 ? sR / sCnt : fallbackBgR;
    rowBgG[y] = sCnt > 0 ? sG / sCnt : fallbackBgG;
    rowBgB[y] = sCnt > 0 ? sB / sCnt : fallbackBgB;
    rightRowBgR[y] = rSCnt > 0 ? rSR / rSCnt : rFallbackBgR;
    rightRowBgG[y] = rSCnt > 0 ? rSG / rSCnt : rFallbackBgG;
    rightRowBgB[y] = rSCnt > 0 ? rSB / rSCnt : rFallbackBgB;
  }

  const avgBgNoise = globalBgNoiseCount > 0 ? globalBgNoiseSum / globalBgNoiseCount : 1.5;

  // 5. Detect garment RGB signature (center chest + independent left/right outer shoulder sleeves) & white/check shirt
  let garmentLumSum = 0;
  let garmentRSum = 0, garmentGSum = 0, garmentBSum = 0;
  let garmentSampleCount = 0;
  let lShRSum = 0, lShGSum = 0, lShBSum = 0, lShCount = 0;
  let rShRSum = 0, rShGSum = 0, rShBSum = 0, rShCount = 0;
  let lightShirtCount = 0;
  let checkEdgeCount = 0;
  const chestStartY = Math.max(shoulderStartY, Math.floor(minSubjY + subjH * 0.58));
  const chestEndY = Math.floor(minSubjY + subjH * 0.85);

  for (let y = chestStartY; y <= chestEndY; y += 3) {
    const row = y * w;
    const xMin = Math.max(0, coreCenterX - Math.floor(subjW * 0.20));
    const xMax = Math.min(w - 1, coreCenterX + Math.floor(subjW * 0.20));
    for (let x = xMin; x <= xMax; x += 3) {
      const idx = row + x;
      if (rawAlphas[idx] >= 180) {
        const pIdx = idx * 4;
        const r = pixels[pIdx];
        const g = pixels[pIdx + 1];
        const b = pixels[pIdx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        garmentLumSum += lum;
        garmentRSum += r;
        garmentGSum += g;
        garmentBSum += b;

        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        if (lum >= 165 && (maxC - minC) <= 50) lightShirtCount++;

        const rightPx = Math.min(w - 1, x + 3);
        const downPy = Math.min(h - 1, y + 3);
        const rIdx = (y * w + rightPx) * 4;
        const dIdx = (downPy * w + x) * 4;
        const lumR = 0.299 * pixels[rIdx] + 0.587 * pixels[rIdx + 1] + 0.114 * pixels[rIdx + 2];
        const lumD = 0.299 * pixels[dIdx] + 0.587 * pixels[dIdx + 1] + 0.114 * pixels[dIdx + 2];
        if (Math.abs(lum - lumR) >= 14 || Math.abs(lum - lumD) >= 14) checkEdgeCount++;

        garmentSampleCount++;
      }
    }

    // Independently sample outer confident left & right shoulder sleeves
    const lEd = leftEdgeX[y];
    if (lEd !== -1 && lEd < symCenterX - 16) {
      for (let sx = lEd + 4; sx <= Math.min(symCenterX - 8, lEd + 22); sx += 3) {
        const idx = row + sx;
        if (rawAlphas[idx] >= 185) {
          const pIdx = idx * 4;
          lShRSum += pixels[pIdx]; lShGSum += pixels[pIdx + 1]; lShBSum += pixels[pIdx + 2]; lShCount++;
        }
      }
    }
    const rEd = rightEdgeX[y];
    if (rEd !== -1 && rEd > symCenterX + 16) {
      for (let sx = Math.max(symCenterX + 8, rEd - 22); sx <= rEd - 4; sx += 3) {
        const idx = row + sx;
        if (rawAlphas[idx] >= 185) {
          const pIdx = idx * 4;
          rShRSum += pixels[pIdx]; rShGSum += pixels[pIdx + 1]; rShBSum += pixels[pIdx + 2]; rShCount++;
        }
      }
    }
  }

  const avgGarmentLum = garmentSampleCount > 0 ? garmentLumSum / garmentSampleCount : 180;
  const avgShirtR = garmentSampleCount > 0 ? garmentRSum / garmentSampleCount : 200;
  const avgShirtG = garmentSampleCount > 0 ? garmentGSum / garmentSampleCount : 200;
  const avgShirtB = garmentSampleCount > 0 ? garmentBSum / garmentSampleCount : 200;
  const avgLSleeveR = lShCount > 8 ? lShRSum / lShCount : avgShirtR;
  const avgLSleeveG = lShCount > 8 ? lShGSum / lShCount : avgShirtG;
  const avgLSleeveB = lShCount > 8 ? lShBSum / lShCount : avgShirtB;
  const avgRSleeveR = rShCount > 8 ? rShRSum / rShCount : avgShirtR;
  const avgRSleeveG = rShCount > 8 ? rShGSum / rShCount : avgShirtG;
  const avgRSleeveB = rShCount > 8 ? rShBSum / rShCount : avgShirtB;
  const lightFraction = garmentSampleCount > 0 ? lightShirtCount / garmentSampleCount : 0;
  const checkFraction = garmentSampleCount > 0 ? checkEdgeCount / garmentSampleCount : 0;
  const isWhiteOrCheckShirt =
    (avgGarmentLum >= 140 && (lightFraction >= 0.16 || checkFraction >= 0.05)) ||
    (lightFraction >= 0.22 && checkFraction >= 0.06);

  // 6. Compute symmetrical expected left & right shoulder widths based on anatomy and opposing side
  const expectedLeftDist = new Float32Array(h);
  const expectedRightDist = new Float32Array(h);

  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    const t = Math.min(1.0, (y - shoulderStartY) / Math.max(1, shoulderApexY - shoulderStartY));
    const anatomicalProfile = subjW * (0.20 + 0.28 * Math.sin((t * Math.PI) / 2));

    const lEdge = leftEdgeX[y];
    let leftDist = lEdge !== -1 ? (symCenterX - lEdge) : 0;
    leftDist = Math.max(0, Math.min(subjW * 0.65, leftDist));

    const rEdge = rightEdgeX[y];
    let rightDist = rEdge !== -1 ? (rEdge - symCenterX) : 0;
    rightDist = Math.max(0, Math.min(subjW * 0.65, rightDist));

    let expectedL = Math.max(anatomicalProfile, rightDist * 0.96);
    if (leftShoulderExtensionAmount && leftShoulderExtensionAmount > 0) {
      expectedL += leftShoulderExtensionAmount;
    } else if (isWhiteOrCheckShirt) {
      expectedL = Math.max(expectedL, rightDist * 0.99);
    }
    expectedLeftDist[y] = expectedL;

    let expectedR = Math.max(anatomicalProfile, leftDist * 0.96);
    if (isWhiteOrCheckShirt) {
      expectedR = Math.max(expectedR, leftDist * 0.99);
    }
    expectedRightDist[y] = expectedR;
  }

  const smoothedTargetLeftDist = new Float32Array(h);
  const smoothedTargetRightDist = new Float32Array(h);
  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    let sumL = 0, sumR = 0, count = 0;
    for (let dy = -3; dy <= 3; dy++) {
      const ny = y + dy;
      if (ny >= shoulderStartY && ny <= shoulderEndY) {
        sumL += expectedLeftDist[ny];
        sumR += expectedRightDist[ny];
        count++;
      }
    }
    smoothedTargetLeftDist[y] = count > 0 ? sumL / count : expectedLeftDist[y];
    smoothedTargetRightDist[y] = count > 0 ? sumR / count : expectedRightDist[y];
    if (y > shoulderStartY && y <= shoulderApexY) {
      smoothedTargetLeftDist[y] = Math.max(smoothedTargetLeftDist[y], smoothedTargetLeftDist[y - 1] - 0.5);
      smoothedTargetRightDist[y] = Math.max(smoothedTargetRightDist[y], smoothedTargetRightDist[y - 1] - 0.5);
    }
  }

  const fabricThresh = Math.max(4.5, avgBgNoise * 2.2);
  const isFabricOrCheckPattern = (px: number, py: number): boolean => {
    let localVar = 0;
    let localCount = 0;
    const centerIdx = (py * w + px) * 4;
    const cLum = 0.299 * pixels[centerIdx] + 0.587 * pixels[centerIdx + 1] + 0.114 * pixels[centerIdx + 2];

    for (let dy = -1; dy <= 1; dy++) {
      const ny = py + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx;
        if (nx < 0 || nx >= w) continue;
        const nIdx = (ny * w + nx) * 4;
        const nLum = 0.299 * pixels[nIdx] + 0.587 * pixels[nIdx + 1] + 0.114 * pixels[nIdx + 2];
        localVar += Math.abs(cLum - nLum);
        localCount++;
      }
    }
    const avgDelta = localCount > 0 ? localVar / localCount : 0;
    return avgDelta >= fabricThresh;
  };

  const maxStepOutPerRow = Math.max(8, Math.round(subjW * 0.04));

  // 7. Recover clipped LEFT & RIGHT shoulder garments cleanly (handles solid, check, light, and patterned shirts)
  let prevExtendedLeft = -1;
  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    const row = y * w;
    let currLeft = leftEdgeX[y];
    if (currLeft === -1) continue;

    let shAvgR = 0, shAvgG = 0, shAvgB = 0, shCnt = 0;
    let shLightR = 0, shLightG = 0, shLightB = 0, shLightCnt = 0;
    let shDarkR = 0, shDarkG = 0, shDarkB = 0, shDarkCnt = 0;
    for (let sy = Math.max(shoulderStartY, y - 2); sy <= Math.min(shoulderEndY, y + 2); sy++) {
      const sRow = sy * w;
      for (let sx = currLeft + 2; sx <= Math.min(coreCenterX, currLeft + 24); sx += 2) {
        const sIdx = sRow + sx;
        if (rawAlphas[sIdx] >= 165) {
          const sp = sIdx * 4;
          const sr = pixels[sp], sg = pixels[sp + 1], sb = pixels[sp + 2];
          const slum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
          shAvgR += sr; shAvgG += sg; shAvgB += sb; shCnt++;
          if (slum >= 155) {
            shLightR += sr; shLightG += sg; shLightB += sb; shLightCnt++;
          } else {
            shDarkR += sr; shDarkG += sg; shDarkB += sb; shDarkCnt++;
          }
        }
      }
    }
    const locShR = shCnt > 0 ? shAvgR / shCnt : avgShirtR;
    const locShG = shCnt > 0 ? shAvgG / shCnt : avgShirtG;
    const locShB = shCnt > 0 ? shAvgB / shCnt : avgShirtB;

    const symTargetLeft = Math.max(2, Math.round(symCenterX - smoothedTargetLeftDist[y]));
    const slopeClampLeft = prevExtendedLeft !== -1 ? Math.max(2, prevExtendedLeft - maxStepOutPerRow) : symTargetLeft;
    const targetLeft = y <= shoulderStartY + Math.round(subjH * 0.05) && prevExtendedLeft !== -1
      ? Math.max(symTargetLeft, slopeClampLeft)
      : symTargetLeft;

    if (currLeft <= targetLeft + Math.max(4, Math.round(subjW * 0.03))) {
      for (let x = currLeft + 3; x <= Math.min(coreCenterX, currLeft + 24); x++) {
        if (rawAlphas[row + x] >= 195) rawAlphas[row + x] = 255.0;
      }
      prevExtendedLeft = currLeft;
      continue;
    }

    const bgR = rowBgR[y];
    const bgG = rowBgG[y];
    const bgB = rowBgB[y];

    let actualReachedLeft = currLeft;
    let consecutiveBgLike = 0;

    for (let x = currLeft - 1; x >= targetLeft; x--) {
      const idx = row + x;
      const pIdx = idx * 4;
      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      const distToBg = Math.hypot(r - bgR, g - bgG, b - bgB);
      const chromaBgDiff = Math.abs((r - g) - (bgR - bgG)) + Math.abs((g - b) - (bgG - bgB));
      let distToShirt = garmentSampleCount > 0 ? Math.hypot(r - avgShirtR, g - avgShirtG, b - avgShirtB) : 999;
      if (shCnt > 0) distToShirt = Math.min(distToShirt, Math.hypot(r - locShR, g - locShG, b - locShB));
      if (lShCount > 8) distToShirt = Math.min(distToShirt, Math.hypot(r - avgLSleeveR, g - avgLSleeveG, b - avgLSleeveB));
      if (shLightCnt > 0) distToShirt = Math.min(distToShirt, Math.hypot(r - shLightR / shLightCnt, g - shLightG / shLightCnt, b - shLightB / shLightCnt));
      if (shDarkCnt > 0) distToShirt = Math.min(distToShirt, Math.hypot(r - shDarkR / shDarkCnt, g - shDarkG / shDarkCnt, b - shDarkB / shDarkCnt));

      const isFabric = isFabricOrCheckPattern(x, y);
      const isExteriorBgLike =
        rawAlphas[idx] < 65 &&
        distToBg < 20 &&
        chromaBgDiff <= 14 &&
        !isFabric &&
        (distToShirt > 26 || distToBg < distToShirt * 0.68);

      if (isExteriorBgLike) {
        consecutiveBgLike++;
        if (consecutiveBgLike >= 2 || (distToBg < 14 && distToShirt > 26 && rawAlphas[idx] < 45)) break;
        continue;
      }
      consecutiveBgLike = 0;

      const isUpperShoulderSlope = y <= shoulderStartY + Math.round(subjH * 0.14);
      const hasAiSignal = rawAlphas[idx] >= 125 && (distToBg >= 18 || isFabric || distToShirt <= 28);
      const matchesTorsoShirt =
        distToShirt <= 32 &&
        (distToBg >= 18 || isFabric || rawAlphas[idx] >= 95) &&
        distToShirt < Math.max(24, distToBg * 0.85);
      const hasSolidGarmentBelow = y + 3 < h && rawAlphas[(y + 3) * w + x] >= 175;
      const matchesCheckShirt =
        isWhiteOrCheckShirt &&
        !isUpperShoulderSlope &&
        ((isFabric && distToShirt <= 42) || (rawAlphas[idx] >= 105 && lum >= 125 && maxC - minC <= 60 && distToBg >= 14));

      if (
        modnetAlphas &&
        modnetAlphas[idx] < 14 &&
        !(matchesTorsoShirt && !isUpperShoulderSlope && hasSolidGarmentBelow)
      ) {
        break;
      }

      if (!hasAiSignal && !matchesTorsoShirt && !matchesCheckShirt) break;

      rawAlphas[idx] = Math.max(rawAlphas[idx], actualReachedLeft === currLeft ? 205.0 : 235.0);
      actualReachedLeft = x;
    }

    prevExtendedLeft = actualReachedLeft;
    for (let x = actualReachedLeft + 3; x <= Math.min(coreCenterX, currLeft + 24); x++) {
      if (rawAlphas[row + x] >= 185 && rawAlphas[row + x] < 255) {
        rawAlphas[row + x] = 255.0;
      }
    }
  }

  // 7b. Recover clipped RIGHT shoulder garment symmetrically
  let prevExtendedRight = -1;
  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    const row = y * w;
    let currRight = rightEdgeX[y];
    if (currRight === -1) continue;

    let shAvgR = 0, shAvgG = 0, shAvgB = 0, shCnt = 0;
    let shLightR = 0, shLightG = 0, shLightB = 0, shLightCnt = 0;
    let shDarkR = 0, shDarkG = 0, shDarkB = 0, shDarkCnt = 0;
    for (let sy = Math.max(shoulderStartY, y - 2); sy <= Math.min(shoulderEndY, y + 2); sy++) {
      const sRow = sy * w;
      for (let sx = Math.max(coreCenterX, currRight - 24); sx <= currRight - 2; sx += 2) {
        const sIdx = sRow + sx;
        if (rawAlphas[sIdx] >= 165) {
          const sp = sIdx * 4;
          const sr = pixels[sp], sg = pixels[sp + 1], sb = pixels[sp + 2];
          const slum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
          shAvgR += sr; shAvgG += sg; shAvgB += sb; shCnt++;
          if (slum >= 155) {
            shLightR += sr; shLightG += sg; shLightB += sb; shLightCnt++;
          } else {
            shDarkR += sr; shDarkG += sg; shDarkB += sb; shDarkCnt++;
          }
        }
      }
    }
    const locShR = shCnt > 0 ? shAvgR / shCnt : avgRSleeveR;
    const locShG = shCnt > 0 ? shAvgG / shCnt : avgRSleeveG;
    const locShB = shCnt > 0 ? shAvgB / shCnt : avgRSleeveB;

    const symTargetRight = Math.min(w - 3, Math.round(symCenterX + smoothedTargetRightDist[y]));
    const slopeClampRight = prevExtendedRight !== -1 ? Math.min(w - 3, prevExtendedRight + maxStepOutPerRow) : symTargetRight;
    const targetRight = y <= shoulderStartY + Math.round(subjH * 0.05) && prevExtendedRight !== -1
      ? Math.min(symTargetRight, slopeClampRight)
      : symTargetRight;

    if (currRight >= targetRight - Math.max(4, Math.round(subjW * 0.03))) {
      for (let x = Math.max(coreCenterX, currRight - 24); x <= currRight - 3; x++) {
        if (rawAlphas[row + x] >= 195) rawAlphas[row + x] = 255.0;
      }
      prevExtendedRight = currRight;
      continue;
    }

    const bgR = rightRowBgR[y];
    const bgG = rightRowBgG[y];
    const bgB = rightRowBgB[y];

    let actualReachedRight = currRight;
    let consecutiveBgLike = 0;

    for (let x = currRight + 1; x <= targetRight; x++) {
      const idx = row + x;
      const pIdx = idx * 4;
      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      const distToBg = Math.hypot(r - bgR, g - bgG, b - bgB);
      const chromaBgDiff = Math.abs((r - g) - (bgR - bgG)) + Math.abs((g - b) - (bgG - bgB));
      let distToShirt = garmentSampleCount > 0 ? Math.hypot(r - avgShirtR, g - avgShirtG, b - avgShirtB) : 999;
      if (shCnt > 0) distToShirt = Math.min(distToShirt, Math.hypot(r - locShR, g - locShG, b - locShB));
      if (rShCount > 8) distToShirt = Math.min(distToShirt, Math.hypot(r - avgRSleeveR, g - avgRSleeveG, b - avgRSleeveB));
      if (shLightCnt > 0) distToShirt = Math.min(distToShirt, Math.hypot(r - shLightR / shLightCnt, g - shLightG / shLightCnt, b - shLightB / shLightCnt));
      if (shDarkCnt > 0) distToShirt = Math.min(distToShirt, Math.hypot(r - shDarkR / shDarkCnt, g - shDarkG / shDarkCnt, b - shDarkB / shDarkCnt));

      const isFabric = isFabricOrCheckPattern(x, y);
      const isExteriorBgLike =
        rawAlphas[idx] < 65 &&
        distToBg < 20 &&
        chromaBgDiff <= 14 &&
        !isFabric &&
        (distToShirt > 26 || distToBg < distToShirt * 0.68);

      if (isExteriorBgLike) {
        consecutiveBgLike++;
        if (consecutiveBgLike >= 2 || (distToBg < 14 && distToShirt > 26 && rawAlphas[idx] < 45)) break;
        continue;
      }
      consecutiveBgLike = 0;

      const isUpperShoulderSlope = y <= shoulderStartY + Math.round(subjH * 0.14);
      const hasAiSignal = rawAlphas[idx] >= 125 && (distToBg >= 18 || isFabric || distToShirt <= 28);
      const matchesTorsoShirt =
        distToShirt <= 32 &&
        (distToBg >= 18 || isFabric || rawAlphas[idx] >= 95) &&
        distToShirt < Math.max(24, distToBg * 0.85);
      const hasSolidGarmentBelow = y + 3 < h && rawAlphas[(y + 3) * w + x] >= 175;
      const matchesCheckShirt =
        isWhiteOrCheckShirt &&
        !isUpperShoulderSlope &&
        ((isFabric && distToShirt <= 42) || (rawAlphas[idx] >= 105 && lum >= 125 && maxC - minC <= 60 && distToBg >= 14));

      if (
        modnetAlphas &&
        modnetAlphas[idx] < 14 &&
        !(matchesTorsoShirt && !isUpperShoulderSlope && hasSolidGarmentBelow)
      ) {
        break;
      }

      if (!hasAiSignal && !matchesTorsoShirt && !matchesCheckShirt) break;

      rawAlphas[idx] = Math.max(rawAlphas[idx], actualReachedRight === currRight ? 205.0 : 235.0);
      actualReachedRight = x;
    }

    prevExtendedRight = actualReachedRight;
    for (let x = Math.max(coreCenterX, currRight - 24); x <= actualReachedRight - 3; x++) {
      if (rawAlphas[row + x] >= 185 && rawAlphas[row + x] < 255) {
        rawAlphas[row + x] = 255.0;
      }
    }
  }

  // 8. Trim ONLY isolated faint low-confidence spikes along BOTH shoulders without flattening rounded curves
  const restoredLeftEdge = new Int32Array(h);
  const restoredRightEdge = new Int32Array(h);
  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    const row = y * w;
    restoredLeftEdge[y] = -1;
    restoredRightEdge[y] = -1;
    for (let x = 0; x < coreCenterX; x++) {
      if (rawAlphas[row + x] >= 95) {
        restoredLeftEdge[y] = x;
        break;
      }
    }
    for (let x = w - 1; x >= coreCenterX; x--) {
      if (rawAlphas[row + x] >= 95) {
        restoredRightEdge[y] = x;
        break;
      }
    }
  }

  for (let y = shoulderStartY + 2; y <= shoulderEndY - 2; y++) {
    const row = y * w;
    const curL = restoredLeftEdge[y];
    const prevL = restoredLeftEdge[y - 1];
    const nextL = restoredLeftEdge[y + 1];
    if (curL !== -1 && prevL !== -1 && nextL !== -1) {
      const avgAdjL = Math.round((prevL + nextL) * 0.5);
      if (curL < prevL - 3 && curL < nextL - 3 && avgAdjL - curL <= 8) {
        const bgR = rowBgR[y], bgG = rowBgG[y], bgB = rowBgB[y];
        for (let x = curL; x < avgAdjL; x++) {
          const pIdx = (row + x) * 4;
          const distToBg = Math.hypot(pixels[pIdx] - bgR, pixels[pIdx + 1] - bgG, pixels[pIdx + 2] - bgB);
          if (rawAlphas[row + x] < 110 && distToBg < 26) rawAlphas[row + x] = 0.0;
        }
      }
    }

    const curR = restoredRightEdge[y];
    const prevR = restoredRightEdge[y - 1];
    const nextR = restoredRightEdge[y + 1];
    if (curR !== -1 && prevR !== -1 && nextR !== -1) {
      const avgAdjR = Math.round((prevR + nextR) * 0.5);
      if (curR > prevR + 3 && curR > nextR + 3 && curR - avgAdjR <= 8) {
        const bgR = rightRowBgR[y], bgG = rightRowBgG[y], bgB = rightRowBgB[y];
        for (let x = avgAdjR + 1; x <= curR; x++) {
          const pIdx = (row + x) * 4;
          const distToBg = Math.hypot(pixels[pIdx] - bgR, pixels[pIdx + 1] - bgG, pixels[pIdx + 2] - bgB);
          if (rawAlphas[row + x] < 110 && distToBg < 26) rawAlphas[row + x] = 0.0;
        }
      }
    }
  }
}

/**
 * Solidifies the entire subject interior (face, hair, neck, torso, white shirt, clothes, hands).
 * Guarantees that white shirts and light clothes inside the subject silhouette are 100% solid (Alpha = 255.0)
 * without any holes or background color bleed-through, while strictly preserving subject boundaries.
 */
function solidifySubjectInteriorAndClothing(
  alphas: Float32Array,
  imageData: ImageData | null,
  w: number,
  h: number,
  modnetAlphas?: Float32Array
) {
  const total = w * h;

  // 1. Locate subject bounding box
  let minSubjX = w, maxSubjX = 0, minSubjY = h, maxSubjY = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphas[row + x] >= 20) {
        if (x < minSubjX) minSubjX = x;
        if (x > maxSubjX) maxSubjX = x;
        if (y < minSubjY) minSubjY = y;
        if (y > maxSubjY) maxSubjY = y;
      }
    }
  }

  if (maxSubjX <= minSubjX) {
    minSubjX = Math.floor(w * 0.20);
    maxSubjX = Math.floor(w * 0.80);
    minSubjY = 0;
    maxSubjY = h - 1;
  }

  const subjHeight = maxSubjY - minSubjY;
  const chinY = Math.floor(minSubjY + subjHeight * 0.35);

  // 2. Flood fill from outer image edges to identify true exterior background
  const isExterior = findExteriorBackgroundMask(alphas, w, h, 26);

  // Dilate exterior by 6 pixels to preserve perimeter edge transitions for guided filtering & de-fringing
  const isNearExterior = new Uint8Array(isExterior);
  for (let pass = 0; pass < 6; pass++) {
    const temp = new Uint8Array(isNearExterior);
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        if (temp[i] === 1) {
          isNearExterior[i - 1] = 1;
          isNearExterior[i + 1] = 1;
          isNearExterior[i - w] = 1;
          isNearExterior[i + w] = 1;
        }
      }
    }
  }

  // Sample average exterior background color so we never turn background pockets into solid foreground
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  if (imageData) {
    const px = imageData.data;
    const stepY = Math.max(1, Math.floor(h / 80));
    const stepX = Math.max(1, Math.floor(w / 80));
    for (let y = 0; y < h; y += stepY) {
      const row = y * w;
      for (let x = 0; x < w; x += stepX) {
        const idx = row + x;
        if (isExterior[idx] === 1) {
          const pIdx = idx * 4;
          bgR += px[pIdx];
          bgG += px[pIdx + 1];
          bgB += px[pIdx + 2];
          bgCount++;
        }
      }
    }
  }
  const meanBgR = bgCount > 10 ? bgR / bgCount : 245;
  const meanBgG = bgCount > 10 ? bgG / bgCount : 245;
  const meanBgB = bgCount > 10 ? bgB / bgCount : 245;

  const subjWidth = Math.max(1, maxSubjX - minSubjX);

  // Dynamically locate neck narrowing (26%..52% of subject height) so shirt collar & upper shoulders are included
  let neckY = Math.floor(minSubjY + subjHeight * 0.44);
  let minNeckSpan = Infinity;
  let neckLeftX = minSubjX;
  let neckRightX = maxSubjX;
  for (let y = Math.floor(minSubjY + subjHeight * 0.26); y <= Math.floor(minSubjY + subjHeight * 0.52); y++) {
    const row = y * w;
    let l = -1, r = -1;
    for (let x = minSubjX; x <= maxSubjX; x++) {
      if (alphas[row + x] >= 165) { l = x; break; }
    }
    for (let x = maxSubjX; x >= minSubjX; x--) {
      if (alphas[row + x] >= 165) { r = x; break; }
    }
    if (l !== -1 && r > l) {
      const span = r - l;
      if (span < minNeckSpan) {
        minNeckSpan = span;
        neckY = y;
        neckLeftX = l;
        neckRightX = r;
      }
    }
  }
  if (!Number.isFinite(minNeckSpan)) minNeckSpan = Math.round(subjWidth * 0.35);

  const torsoStartY = Math.min(
    Math.floor(minSubjY + subjHeight * 0.48),
    Math.max(Math.floor(minSubjY + subjHeight * 0.38), neckY + Math.round(subjHeight * 0.02))
  );
  const shoulderFlareStartY = Math.max(
    torsoStartY + 2,
    Math.min(Math.floor(minSubjY + subjHeight * 0.58), neckY + Math.round(subjHeight * 0.08))
  );
  const coreX0 = Math.floor(minSubjX + subjWidth * 0.14);
  const coreX1 = Math.floor(maxSubjX - subjWidth * 0.14);

  // Compute initial per-row garment bounds using alphas >= 135 (includes check stripes & collar edges, skips faint halos)
  const rowLeftRaw = new Int32Array(h).fill(-1);
  const rowRightRaw = new Int32Array(h).fill(-1);
  for (let y = torsoStartY; y <= maxSubjY; y++) {
    const row = y * w;
    for (let x = minSubjX; x <= maxSubjX; x++) {
      if (alphas[row + x] >= 135) {
        rowLeftRaw[y] = x;
        break;
      }
    }
    for (let x = maxSubjX; x >= minSubjX; x--) {
      if (alphas[row + x] >= 135) {
        rowRightRaw[y] = x;
        break;
      }
    }
  }

  // Detect if torso contains a white or check-patterned garment.
  // IMPORTANT: Sample ALL pixels inside the garment silhouette span (NOT gated by high alpha!),
  // because AI models often assign low alpha specifically to the white squares inside check shirts.
  let chestSamples = 0, lightChestSamples = 0, checkEdgeSamples = 0, lumSum = 0;
  if (imageData && coreX1 > coreX0) {
    const px = imageData.data;
    const cy0 = Math.min(h - 4, Math.floor(torsoStartY + subjHeight * 0.06));
    const cy1 = Math.min(h - 4, Math.floor(minSubjY + subjHeight * 0.88));
    for (let y = cy0; y <= cy1; y += 3) {
      const row = y * w;
      const sx0 = rowLeftRaw[y] !== -1 ? Math.max(coreX0, rowLeftRaw[y] + 4) : coreX0;
      const sx1 = rowRightRaw[y] !== -1 ? Math.min(coreX1, rowRightRaw[y] - 4) : coreX1;
      if (sx1 <= sx0 + 8) continue;
      for (let x = sx0; x <= sx1 - 3; x += 3) {
        const idx = row + x;
        const pIdx = idx * 4;
        const r = px[pIdx], g = px[pIdx + 1], b = px[pIdx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        lumSum += lum;
        if ((lum >= 132 && (maxC - minC) <= 82) || lum >= 175) lightChestSamples++;

        const rIdx = (y * w + Math.min(w - 1, x + 3)) * 4;
        const dIdx = (Math.min(h - 1, y + 3) * w + x) * 4;
        const lumR = 0.299 * px[rIdx] + 0.587 * px[rIdx + 1] + 0.114 * px[rIdx + 2];
        const lumD = 0.299 * px[dIdx] + 0.587 * px[dIdx + 1] + 0.114 * px[dIdx + 2];
        if (Math.abs(lum - lumR) >= 12 || Math.abs(lum - lumD) >= 12) checkEdgeSamples++;
        chestSamples++;
      }
    }
  }
  const avgChestLum = chestSamples > 0 ? lumSum / chestSamples : 0;
  const lightChestRatio = chestSamples > 0 ? lightChestSamples / chestSamples : 0;
  const checkEdgeRatio = chestSamples > 0 ? checkEdgeSamples / chestSamples : 0;
  const isWhiteOrCheckGarment =
    chestSamples > 18 &&
    (lightChestRatio >= 0.14 || checkEdgeRatio >= 0.035 || (avgChestLum >= 124 && lightChestRatio >= 0.10));

  // Compute per-row horizontal garment span [rowLeftSolid..rowRightSolid] inside torso
  const rowLeftSolid = new Int32Array(h).fill(-1);
  const rowRightSolid = new Int32Array(h).fill(-1);
  for (let y = torsoStartY; y <= maxSubjY; y++) {
    const row = y * w;
    for (let x = minSubjX; x <= maxSubjX; x++) {
      if (isExterior[row + x] === 0 && alphas[row + x] >= 145) {
        rowLeftSolid[y] = x;
        break;
      }
    }
    for (let x = maxSubjX; x >= minSubjX; x--) {
      if (isExterior[row + x] === 0 && alphas[row + x] >= 145) {
        rowRightSolid[y] = x;
        break;
      }
    }
  }

  // Smooth concave vertical bites along outer LOWER sleeve/shoulder edges caused by missing white check squares
  // IMPORTANT: Never bridge across the upper concave ear-to-neck-to-shoulder pocket above shoulderFlareStartY!
  if (isWhiteOrCheckGarment && imageData) {
    const px = imageData.data;
    const smoothLeft = new Int32Array(rowLeftSolid);
    const smoothRight = new Int32Array(rowRightSolid);
    const maxBite = Math.max(20, Math.round(subjWidth * 0.12));

    for (let y = shoulderFlareStartY; y <= maxSubjY - 2; y++) {
      const curSpan =
        rowLeftSolid[y] !== -1 && rowRightSolid[y] > rowLeftSolid[y]
          ? rowRightSolid[y] - rowLeftSolid[y]
          : 0;
      if (curSpan < minNeckSpan * 1.18) continue;

      let bestUpL = -1, bestDnL = -1;
      for (let dy = 1; dy <= 12 && y - dy >= shoulderFlareStartY; dy++) {
        if (rowLeftSolid[y - dy] !== -1) {
          if (bestUpL === -1 || rowLeftSolid[y - dy] < bestUpL) bestUpL = rowLeftSolid[y - dy];
        }
      }
      for (let dy = 1; dy <= 12 && y + dy <= maxSubjY; dy++) {
        if (rowLeftSolid[y + dy] !== -1) {
          if (bestDnL === -1 || rowLeftSolid[y + dy] < bestDnL) bestDnL = rowLeftSolid[y + dy];
        }
      }
      if (bestUpL !== -1 && bestDnL !== -1) {
        const bridgeL = Math.max(bestUpL, bestDnL);
        if (rowLeftSolid[y] === -1 || (rowLeftSolid[y] > bridgeL && rowLeftSolid[y] - bridgeL <= maxBite)) {
          const checkX = Math.min(w - 1, bridgeL + 2);
          const idx = y * w + checkX;
          const pIdx = idx * 4;
          const lum = 0.299 * px[pIdx] + 0.587 * px[pIdx + 1] + 0.114 * px[pIdx + 2];
          const maxC = Math.max(px[pIdx], px[pIdx + 1], px[pIdx + 2]);
          const minC = Math.min(px[pIdx], px[pIdx + 1], px[pIdx + 2]);
          const distToBg = Math.hypot(px[pIdx] - meanBgR, px[pIdx + 1] - meanBgG, px[pIdx + 2] - meanBgB);
          if (lum >= 135 && maxC - minC <= 60 && alphas[idx] >= 40 && (distToBg >= 16 || alphas[idx] >= 120)) {
            smoothLeft[y] = bridgeL;
          }
        }
      }

      let bestUpR = -1, bestDnR = -1;
      for (let dy = 1; dy <= 12 && y - dy >= shoulderFlareStartY; dy++) {
        if (rowRightSolid[y - dy] !== -1) {
          if (bestUpR === -1 || rowRightSolid[y - dy] > bestUpR) bestUpR = rowRightSolid[y - dy];
        }
      }
      for (let dy = 1; dy <= 12 && y + dy <= maxSubjY; dy++) {
        if (rowRightSolid[y + dy] !== -1) {
          if (bestDnR === -1 || rowRightSolid[y + dy] > bestDnR) bestDnR = rowRightSolid[y + dy];
        }
      }
      if (bestUpR !== -1 && bestDnR !== -1) {
        const bridgeR = Math.min(bestUpR, bestDnR);
        if (rowRightSolid[y] === -1 || (rowRightSolid[y] < bridgeR && bridgeR - rowRightSolid[y] <= maxBite)) {
          const checkX = Math.max(0, bridgeR - 2);
          const idx = y * w + checkX;
          const pIdx = idx * 4;
          const lum = 0.299 * px[pIdx] + 0.587 * px[pIdx + 1] + 0.114 * px[pIdx + 2];
          const maxC = Math.max(px[pIdx], px[pIdx + 1], px[pIdx + 2]);
          const minC = Math.min(px[pIdx], px[pIdx + 1], px[pIdx + 2]);
          const distToBg = Math.hypot(px[pIdx] - meanBgR, px[pIdx + 1] - meanBgG, px[pIdx + 2] - meanBgB);
          if (lum >= 135 && maxC - minC <= 60 && alphas[idx] >= 40 && (distToBg >= 16 || alphas[idx] >= 120)) {
            smoothRight[y] = bridgeR;
          }
        }
      }
    }

    for (let y = torsoStartY; y <= maxSubjY; y++) {
      rowLeftSolid[y] = smoothLeft[y];
      rowRightSolid[y] = smoothRight[y];
    }
  }

  // Compute average interior garment RGB so enclosed hole closing never fills contrasting exterior background gaps
  let avgGarR = 128, avgGarG = 128, avgGarB = 128, garRgbCnt = 0;
  if (imageData && coreX1 > coreX0) {
    const px = imageData.data;
    let sr = 0, sg = 0, sb = 0;
    for (let y = Math.floor(torsoStartY + subjHeight * 0.06); y <= Math.min(h - 4, Math.floor(minSubjY + subjHeight * 0.86)); y += 4) {
      const row = y * w;
      for (let x = coreX0; x <= coreX1; x += 4) {
        const idx = row + x;
        if (alphas[idx] >= 180) {
          const p = idx * 4;
          sr += px[p]; sg += px[p + 1]; sb += px[p + 2];
          garRgbCnt++;
        }
      }
    }
    if (garRgbCnt > 8) {
      avgGarR = sr / garRgbCnt;
      avgGarG = sg / garRgbCnt;
      avgGarB = sb / garRgbCnt;
    }
  }
  const garBgContrast = Math.hypot(avgGarR - meanBgR, avgGarG - meanBgG, avgGarB - meanBgB);

  // Plug ONLY genuine enclosed garment/check-square/fold leaks inside torso bounds
  // Never bridge wide empty bays between torso/arm and stray objects or pixels matching contrasting exterior background
  {
    const maxCheckGapX = Math.max(22, Math.round(subjWidth * 0.14));
    const maxCheckGapY = Math.max(28, Math.round(subjHeight * 0.12));
    const pxData = imageData ? imageData.data : null;

    for (let y = torsoStartY; y <= Math.min(maxSubjY - 6, h - 7); y++) {
      const rL = rowLeftSolid[y];
      const rR = rowRightSolid[y];
      if (rL === -1 || rR <= rL + 8) continue;
      const row = y * w;
      for (let x = rL + 1; x < rR; ) {
        if (isExterior[row + x] === 1) {
          const runStart = x;
          while (x < rR && isExterior[row + x] === 1) x++;
          const runLen = x - runStart;
          if (runLen <= maxCheckGapX && runStart > rL && x <= rR) {
            // Do not bridge wide gaps matching contrasting exterior background or MODNet-rejected gaps,
            // EXCEPT white/light check-shirt squares narrowly enclosed inside the chest/shirt interior!
            const chestSafeMargin = Math.max(10, Math.round(subjWidth * 0.07));
            const insideChestEnvelope = runStart >= rL + chestSafeMargin && x <= rR - chestSafeMargin;
            const isNarrowChestSquare = isWhiteOrCheckGarment && insideChestEnvelope && runLen <= Math.max(18, Math.round(subjWidth * 0.10));

            let bgMatchCnt = 0, modRejectCnt = 0, lightShirtCnt = 0, gapSampleCnt = 0;
            for (let rx = runStart; rx < x; rx += Math.max(1, Math.floor(runLen / 5))) {
              gapSampleCnt++;
              if (pxData) {
                const gp = (row + rx) * 4;
                const gr = pxData[gp], gg = pxData[gp + 1], gb = pxData[gp + 2];
                const gMax = Math.max(gr, gg, gb), gMin = Math.min(gr, gg, gb);
                const gLum = 0.299 * gr + 0.587 * gg + 0.114 * gb;
                if (gLum >= 132 && gMax - gMin <= 80) lightShirtCnt++;
                const dBg = Math.hypot(gr - meanBgR, gg - meanBgG, gb - meanBgB);
                if (garBgContrast > 24 && dBg < 24) bgMatchCnt++;
              }
              if (modnetAlphas && modnetAlphas[row + rx] < 14) modRejectCnt++;
            }
            const isProtectedCheckSquare = isNarrowChestSquare && lightShirtCnt / Math.max(1, gapSampleCnt) >= 0.5;
            if (
              gapSampleCnt > 0 &&
              !isProtectedCheckSquare &&
              (bgMatchCnt / gapSampleCnt >= 0.55 || modRejectCnt / gapSampleCnt >= 0.70)
            ) {
              continue;
            }

            let enclosedVert = true;
            for (let rx = runStart; rx < x; rx += Math.max(1, Math.floor(runLen / 4))) {
              let hasUp = false, hasDown = false;
              for (let dy = 1; dy <= maxCheckGapY && y - dy >= torsoStartY; dy++) {
                if (isExterior[(y - dy) * w + rx] === 0 && alphas[(y - dy) * w + rx] >= 165) {
                  hasUp = true;
                  break;
                }
              }
              for (let dy = 1; dy <= maxCheckGapY && y + dy <= maxSubjY; dy++) {
                if (isExterior[(y + dy) * w + rx] === 0 && alphas[(y + dy) * w + rx] >= 165) {
                  hasDown = true;
                  break;
                }
              }
              if (!hasUp || !hasDown) {
                enclosedVert = false;
                break;
              }
            }
            if (enclosedVert) {
              for (let rx = runStart; rx < x; rx++) {
                isExterior[row + rx] = 0;
                isNearExterior[row + rx] = 0;
                alphas[row + rx] = 255.0;
              }
            }
          }
        } else {
          x++;
        }
      }
    }
  }

  // 3. Full Garment, Shirt, Collar & Shoulder Interior Solidification:
  // Any enclosed pixel (isExterior === 0) inside the torso/shirt/collar/shoulder/sleeve span
  // (whether white, check, dark, colored, or patterned) is solidified to 255.0 so background colors never bleed through,
  // while outer boundary fringes & pixels above shoulder curves stay free for halo decontamination.
  if (imageData && coreX1 > coreX0) {
    const pixels = imageData.data;
    for (let y = torsoStartY; y <= maxSubjY; y++) {
      const row = y * w;
      const rL = rowLeftSolid[y];
      const rR = rowRightSolid[y];
      const rowSpan = rL !== -1 && rR > rL ? rR - rL : 0;
      const innerStartX = rL !== -1 ? rL + 3 : coreX0;
      const innerEndX = rR !== -1 ? rR - 3 : coreX1;
      const isUpperNeckZone = y < shoulderFlareStartY;

      for (let x = Math.max(0, minSubjX + 2); x <= Math.min(w - 1, maxSubjX - 2); x++) {
        const idx = row + x;
        if (isExterior[idx] !== 0) continue;

        // Above the shoulder flare line, only solidify within the neck/collar core [neckLeftX..neckRightX]
        if (isUpperNeckZone && (x < neckLeftX + 2 || x > neckRightX - 2)) {
          continue;
        }

        const inTorsoCore = x >= innerStartX && x <= innerEndX && rowSpan >= Math.max(20, subjWidth * 0.22);
        const pIdx = idx * 4;
        const r = pixels[pIdx];
        const g = pixels[pIdx + 1];
        const b = pixels[pIdx + 2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const isWhiteOrNeutralLight = (maxC >= 125 && (maxC - minC) <= 84) || (r > 130 && g > 130 && b > 130);

        if (isNearExterior[idx] === 0) {
          if (
            alphas[idx] >= (isWhiteOrCheckGarment ? 25 : 55) ||
            (isWhiteOrCheckGarment && inTorsoCore && isWhiteOrNeutralLight)
          ) {
            alphas[idx] = 255.0;
          }
        } else if (inTorsoCore) {
          if (y < shoulderFlareStartY && alphas[idx] < 120 && !isWhiteOrCheckGarment) {
            continue;
          }
          if (isWhiteOrCheckGarment && (isWhiteOrNeutralLight || alphas[idx] >= 75)) {
            alphas[idx] = 255.0;
          } else if (alphas[idx] >= 155) {
            const distToBg = Math.hypot(r - meanBgR, g - meanBgG, b - meanBgB);
            if (distToBg >= 18 || garBgContrast < 22 || alphas[idx] >= 185) {
              alphas[idx] = 255.0;
            }
          }
        }
      }
    }
  }

  // 4. Cleanly separate exterior background from confident deep interior subject core
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    const rL = y >= torsoStartY ? rowLeftSolid[y] : -1;
    const rR = y >= torsoStartY ? rowRightSolid[y] : -1;
    for (let x = 0; x < w; x++) {
      const i = rowOffset + x;
      if (isExterior[i] === 1) {
        alphas[i] = 0.0;
      } else if (alphas[i] < 18) {
        const insideClosedTorso =
          y >= shoulderFlareStartY &&
          rL !== -1 &&
          rR > rL &&
          x >= rL + 3 &&
          x <= rR - 3;
        if (!insideClosedTorso) {
          alphas[i] = 0.0;
        }
      } else if (isNearExterior[i] === 0) {
        if (y > shoulderFlareStartY && rL !== -1 && rR > rL && x >= rL + 2 && x <= rR - 2 && alphas[i] >= 55) {
          alphas[i] = 255.0;
        } else if (alphas[i] >= 210) {
          alphas[i] = 255.0;
        }
      }
    }
  }
}

/**
 * Cleans tiny isolated floating background noise pixels while guaranteeing 100% complete
 * preservation of the subject (hair, fingers, limbs, clothes, accessories, body).
 */
export function isolateAndCleanSubjectMask(
  maskData: { width: number; height: number; data: Float32Array },
  options: {
    isolateMainSubject?: boolean;
    objectStrictness?: number; // 0 to 100
    removeNoise?: boolean;
  } = {}
) {
  const mw = maskData.width;
  const mh = maskData.height;
  const srcData = maskData.data;
  const total = mw * mh;

  // Solidify confident subject pixels and zero out tiny background haze on the downscaled mask
  for (let i = 0; i < total; i++) {
    if (srcData[i] > 210) {
      srcData[i] = 255.0;
    } else if (srcData[i] < 12) {
      srcData[i] = 0.0;
    }
  }

  const { isolateMainSubject = false, removeNoise = true } = options;
  if (!isolateMainSubject && !removeNoise) return;

  const labels = new Int32Array(total);
  const compSizes: number[] = [0];
  const compSumX: number[] = [0];
  const compSumY: number[] = [0];
  const compMinX: number[] = [mw];
  const compMaxX: number[] = [0];
  const compMinY: number[] = [mh];
  const compMaxY: number[] = [0];
  const queue = new Int32Array(total);
  let curLabel = 0;

  for (let y = 0; y < mh; y++) {
    const row = y * mw;
    for (let x = 0; x < mw; x++) {
      const idx = row + x;
      if (srcData[idx] >= 35 && labels[idx] === 0) {
        curLabel++;
        let size = 0;
        let sX = 0, sY = 0;
        let cMinX = mw, cMaxX = 0, cMinY = mh, cMaxY = 0;
        let head = 0, tail = 0;
        labels[idx] = curLabel;
        queue[tail++] = idx;

        while (head < tail) {
          const curr = queue[head++];
          const cy = Math.floor(curr / mw);
          const cx = curr % mw;
          size++;
          sX += cx;
          sY += cy;
          if (cx < cMinX) cMinX = cx;
          if (cx > cMaxX) cMaxX = cx;
          if (cy < cMinY) cMinY = cy;
          if (cy > cMaxY) cMaxY = cy;

          if (cy > 0) {
            const n = curr - mw;
            if (srcData[n] >= 35 && labels[n] === 0) { labels[n] = curLabel; queue[tail++] = n; }
          }
          if (cy < mh - 1) {
            const n = curr + mw;
            if (srcData[n] >= 35 && labels[n] === 0) { labels[n] = curLabel; queue[tail++] = n; }
          }
          if (cx > 0) {
            const n = curr - 1;
            if (srcData[n] >= 35 && labels[n] === 0) { labels[n] = curLabel; queue[tail++] = n; }
          }
          if (cx < mw - 1) {
            const n = curr + 1;
            if (srcData[n] >= 35 && labels[n] === 0) { labels[n] = curLabel; queue[tail++] = n; }
          }
        }

        compSizes.push(size);
        compSumX.push(sX);
        compSumY.push(sY);
        compMinX.push(cMinX);
        compMaxX.push(cMaxX);
        compMinY.push(cMinY);
        compMaxY.push(cMaxY);
      }
    }
  }

  if (curLabel <= 1) return;

  let mainLabel = 1;
  let bestScore = -1;
  let maxCompSize = 0;
  for (let l = 1; l <= curLabel; l++) {
    if (compSizes[l] > maxCompSize) maxCompSize = compSizes[l];
  }
  const minCandidateSize = Math.max(80, Math.round(maxCompSize * 0.08));

  for (let l = 1; l <= curLabel; l++) {
    const sz = compSizes[l];
    if (sz < minCandidateSize && curLabel > 1) continue;
    const cx = compSumX[l] / Math.max(1, sz);
    const cy = compSumY[l] / Math.max(1, sz);
    const centerDist = Math.hypot((cx - mw * 0.5) / Math.max(1, mw), (cy - mh * 0.48) / Math.max(1, mh));
    const score = isolateMainSubject ? sz / (1 + 2.4 * centerDist) : sz;
    if (score > bestScore) {
      bestScore = score;
      mainLabel = l;
    }
  }

  const mainSize = compSizes[mainLabel];
  const mMinX = compMinX[mainLabel];
  const mMaxX = compMaxX[mainLabel];
  const mMinY = compMinY[mainLabel];
  const mMaxY = compMaxY[mainLabel];
  const mH = Math.max(1, mMaxY - mMinY);
  const hairPad = Math.max(8, Math.round(mw * 0.015));
  const noiseFloor = Math.max(12, Math.round(total * 0.0008));

  const keepComp = new Uint8Array(curLabel + 1);
  keepComp[mainLabel] = 1;

  for (let l = 1; l <= curLabel; l++) {
    if (l === mainLabel) continue;
    const sz = compSizes[l];
    if (isolateMainSubject) {
      // Keep only tiny stray hair strands immediately adjacent to the upper head contour
      const nearUpperHead =
        sz < Math.min(180, mainSize * 0.004) &&
        compMaxY[l] <= mMinY + mH * 0.44 &&
        compMinX[l] >= mMinX - hairPad &&
        compMaxX[l] <= mMaxX + hairPad;
      if (nearUpperHead) keepComp[l] = 1;
    } else if (sz >= noiseFloor) {
      keepComp[l] = 1;
    }
  }

  for (let i = 0; i < total; i++) {
    const l = labels[i];
    if (l > 0 && keepComp[l] === 0) {
      srcData[i] = 0.0;
    }
  }
}

/**
 * Eliminates chair backrests, furniture, disconnected background objects,
 * and severed touching background artifacts around the head, neck, and shoulders.
 */
export function eliminateChairAndBackrestObjects(
  pixels: Uint8ClampedArray,
  alphas: Float32Array,
  w: number,
  h: number,
  options: {
    severTouchingObjects?: boolean;
    objectStrictness?: number;
    isolateMainSubject?: boolean;
    preservePolishedEdges?: boolean;
  } = {},
  modnetAlphas?: Float32Array
) {
  const {
    severTouchingObjects = false,
    objectStrictness = 50,
    isolateMainSubject = false,
    preservePolishedEdges = false,
  } = options;
  const total = w * h;

  // 0. If Dual-AI MODNet mask is available & strict bridge-severing is active,
  // sever thin/lateral bridges where MODNet confidently sees background (ma < 16)
  // BEFORE connected-component labeling so attached chair/wall objects detach cleanly.
  if (!preservePolishedEdges && modnetAlphas && (severTouchingObjects || isolateMainSubject)) {
    const mLeft = new Int32Array(h).fill(-1);
    const mRight = new Int32Array(h).fill(-1);
    let mMinY = h, mMaxY = 0;
    let headSumX = 0, headCnt = 0;

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (modnetAlphas[row + x] >= 90) {
          if (mLeft[y] === -1) mLeft[y] = x;
          mRight[y] = x;
          if (y < mMinY) mMinY = y;
          if (y > mMaxY) mMaxY = y;
        }
      }
    }

    if (mMaxY > mMinY + 20) {
      const mH = mMaxY - mMinY;
      const neckSplit = Math.floor(mMinY + mH * 0.45);
      for (let y = Math.floor(mMinY + mH * 0.10); y <= Math.floor(mMinY + mH * 0.38); y += 2) {
        if (mLeft[y] !== -1 && mRight[y] !== -1) {
          headSumX += (mLeft[y] + mRight[y]) * 0.5;
          headCnt++;
        }
      }
      const headCX = headCnt > 0 ? headSumX / headCnt : w * 0.5;
      const headHalfEstimate = Math.max(24, Math.round(w * 0.22));
      const garmentLatPad = Math.max(14, Math.round(w * 0.032));

      // Fast 4-neighbor distance check to confident MODNet (ma >= 115) via 2-pass chamfer
      const mDist = new Uint8Array(total);
      mDist.fill(40);
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const i = row + x;
          if (modnetAlphas[i] >= 115) {
            mDist[i] = 0;
          } else {
            let d = 40;
            if (x > 0) d = Math.min(d, mDist[i - 1] + 1);
            if (y > 0) d = Math.min(d, mDist[i - w] + 1);
            mDist[i] = d;
          }
        }
      }
      for (let y = h - 1; y >= 0; y--) {
        const row = y * w;
        for (let x = w - 1; x >= 0; x--) {
          const i = row + x;
          let d = mDist[i];
          if (x < w - 1) d = Math.min(d, mDist[i + 1] + 1);
          if (y < h - 1) d = Math.min(d, mDist[i + w] + 1);
          mDist[i] = d;
        }
      }

      // Estimate center garment & independent left/right outer shoulder sleeves (handles directional side lighting)
      let gSumR = 0, gSumG = 0, gSumB = 0, gCnt = 0;
      let lsSumR = 0, lsSumG = 0, lsSumB = 0, lsCnt = 0;
      let rsSumR = 0, rsSumG = 0, rsSumB = 0, rsCnt = 0;
      let bgSumR = 0, bgSumG = 0, bgSumB = 0, bgCnt = 0;
      const gY0 = Math.min(h - 1, Math.floor(neckSplit + mH * 0.08));
      const gY1 = Math.min(h - 1, Math.floor(mMinY + mH * 0.86));
      for (let y = gY0; y <= gY1; y += 3) {
        const row = y * w;
        const x0 = Math.max(0, Math.round(headCX - w * 0.14));
        const x1 = Math.min(w - 1, Math.round(headCX + w * 0.14));
        for (let x = x0; x <= x1; x += 3) {
          const i = row + x;
          if (alphas[i] >= 180 && modnetAlphas[i] >= 135) {
            const p = i * 4;
            gSumR += pixels[p]; gSumG += pixels[p + 1]; gSumB += pixels[p + 2]; gCnt++;
          }
        }
        if (mLeft[y] !== -1 && mRight[y] > mLeft[y] + 28) {
          for (let sx = mLeft[y] + 6; sx <= Math.min(mRight[y] - 8, mLeft[y] + 24); sx += 3) {
            const i = row + sx;
            if (alphas[i] >= 185 && modnetAlphas[i] >= 150) {
              const p = i * 4;
              lsSumR += pixels[p]; lsSumG += pixels[p + 1]; lsSumB += pixels[p + 2]; lsCnt++;
            }
          }
          for (let sx = Math.max(mLeft[y] + 8, mRight[y] - 24); sx <= mRight[y] - 6; sx += 3) {
            const i = row + sx;
            if (alphas[i] >= 185 && modnetAlphas[i] >= 150) {
              const p = i * 4;
              rsSumR += pixels[p]; rsSumG += pixels[p + 1]; rsSumB += pixels[p + 2]; rsCnt++;
            }
          }
        }
      }
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const i = y * w + x;
          if (alphas[i] < 20 && modnetAlphas[i] < 20) {
            const p = i * 4;
            bgSumR += pixels[p]; bgSumG += pixels[p + 1]; bgSumB += pixels[p + 2]; bgCnt++;
          }
        }
      }
      const garR = gCnt > 8 ? gSumR / gCnt : 128;
      const garG = gCnt > 8 ? gSumG / gCnt : 128;
      const garB = gCnt > 8 ? gSumB / gCnt : 128;
      const lsR = lsCnt > 5 ? lsSumR / lsCnt : garR;
      const lsG = lsCnt > 5 ? lsSumG / lsCnt : garG;
      const lsB = lsCnt > 5 ? lsSumB / lsCnt : garB;
      const rsR = rsCnt > 5 ? rsSumR / rsCnt : garR;
      const rsG = rsCnt > 5 ? rsSumG / rsCnt : garG;
      const rsB = rsCnt > 5 ? rsSumB / rsCnt : garB;
      const bgR = bgCnt > 8 ? bgSumR / bgCnt : 245;
      const bgG = bgCnt > 8 ? bgSumG / bgCnt : 245;
      const bgB = bgCnt > 8 ? bgSumB / bgCnt : 245;
      const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

      for (let y = 0; y < h; y++) {
        const row = y * w;
        const mL = mLeft[y];
        const mR = mRight[y];
        const isUpper = y <= neckSplit;
        const inEarBand = y >= mMinY + mH * 0.16;
        const isHairCrown = y <= mMinY + mH * 0.34;

        for (let x = 0; x < w; x++) {
          const i = row + x;
          if (alphas[i] === 0) continue;
          const ma = modnetAlphas[i];
          const p = i * 4;
          const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const dBg = Math.hypot(r - bgR, g - bgG, b - bgB);

          if (isUpper) {
            const aboveCrown = y < mMinY + 8 && Math.abs(x - headCX) <= headHalfEstimate;
            const farLateralOfModnet = mL === -1 ? !aboveCrown : (x < mL - 6 || x > mR + 6);
            const insideModnetUpperSpan = mL !== -1 && x >= mL - 4 && x <= mR + 4;
            const hairDistMax = ma >= 12 ? 12 : (isHairCrown ? 6 : 3);
            const isDarkHair = lum < 92 && bgLum > 110 && dBg > 24 && mDist[i] <= hairDistMax;
            const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 10 && dBg > 20 && mDist[i] <= 11;
            const isProtectedEarEdge =
              isDarkHair ||
              isWarmSkin ||
              (inEarBand && insideModnetUpperSpan && alphas[i] >= 185 && dBg > 22 && mDist[i] <= 3) ||
              (inEarBand && alphas[i] >= 165 && ma >= 24 && mDist[i] <= 7);
            if (!aboveCrown && !isProtectedEarEdge) {
              if ((ma < 24 && (farLateralOfModnet || mDist[i] > 4)) || (ma < 44 && farLateralOfModnet && mDist[i] > 7)) {
                alphas[i] = 0;
                if (pixels) pixels[i * 4 + 3] = 0;
              }
            }
          } else {
            const insideTorsoBand = mL !== -1 && x >= mL - garmentLatPad && x <= mR + garmentLatPad;
            const farOutsideTorso = mL !== -1 ? !insideTorsoBand : mDist[i] > 6;
            const veryFarOutsideTorso = mL !== -1 && (x < mL - garmentLatPad * 1.45 || x > mR + garmentLatPad * 1.45);
            const dCoreGar = gCnt > 8 ? Math.hypot(r - garR, g - garG, b - garB) : 999;
            const dLsGar = lsCnt > 5 ? Math.hypot(r - lsR, g - lsG, b - lsB) : 999;
            const dRsGar = rsCnt > 5 ? Math.hypot(r - rsR, g - rsG, b - rsB) : 999;
            const dGar = Math.min(dCoreGar, dLsGar, dRsGar);
            const isGarMatch =
              ((gCnt > 8 || lsCnt > 5 || rsCnt > 5) && dGar < 38 && (dBg > 18 || alphas[i] >= 150) && mDist[i] <= 7 && insideTorsoBand) ||
              (alphas[i] >= 160 && insideTorsoBand && mDist[i] <= 7 && ma >= 10);
            // Sever touching background furniture/objects rejected by MODNet without cutting genuine shoulders/sleeves/folds
            if (
              !isGarMatch &&
              ((ma < 22 && (farOutsideTorso || mDist[i] > 5)) ||
                (ma < 42 && (veryFarOutsideTorso || (farOutsideTorso && mDist[i] > 6))))
            ) {
              alphas[i] = 0;
              if (pixels) pixels[i * 4 + 3] = 0;
            }
          }
        }
      }
    }
  }

  // 1. Locate subject bounding box and center of mass
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let coreCount = 0;
  let coreCenterX = 0;
  let coreCenterY = 0;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphas[row + x] >= 60) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        coreCenterX += x;
        coreCenterY += y;
        coreCount++;
      }
    }
  }

  if (coreCount === 0 || maxX <= minX || maxY <= minY) {
    return;
  }

  coreCenterX = Math.round(coreCenterX / coreCount);
  coreCenterY = Math.round(coreCenterY / coreCount);

  // 1b. When severTouchingObjects is requested, strip lateral/semi-transparent wing bridges
  if (!preservePolishedEdges && severTouchingObjects && objectStrictness > 65) {
    const subjH = maxY - minY;
    const subjW = maxX - minX;
    const chinY = Math.floor(minY + subjH * 0.48);
    const headHalfW = Math.max(34, Math.floor(subjW * 0.40));
    const leftLimit = coreCenterX - headHalfW;
    const rightLimit = coreCenterX + headHalfW;
    const semiCutoff = objectStrictness >= 80 ? 170 : 140;

    for (let y = minY; y <= chinY; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        const a = alphas[idx];
        if (a > 0 && a < semiCutoff) {
          const isFarLateral = x < (leftLimit - 20) || x > (rightLimit + 20);
          if (isFarLateral) {
            alphas[idx] = 0;
            if (pixels) pixels[idx * 4 + 3] = 0;
          }
        }
      }
    }
  }

  // 1b-morph. Safe Morphological Neck-Bridge Severing & Voronoi Partition:
  // If a secondary background object (chair back, frame, lamp, bag, wall fixture) touches the subject
  // via a narrow solid bridge (<= ~12px thick), interior erosion splits them into separate core regions.
  // Only secondary cores rejected by MODNet OR clearly distinct in color/position from skin & clothes
  // are cleanly cut along the Voronoi mid-bridge seam, leaving 100% of the main subject intact.
  if (!preservePolishedEdges && (isolateMainSubject || severTouchingObjects) && objectStrictness >= 60 && coreCount > 250) {
    const roughW = Math.max(1, maxX - minX);
    const roughH = Math.max(1, maxY - minY);
    const rErode = Math.max(5, Math.min(11, Math.round(roughW * 0.022)));

    // Sample subject chest garment, outer lower sleeves, face/side skin, and crown hair before morphological split
    let mGarR = 0, mGarG = 0, mGarB = 0, mGarC = 0;
    let mSlvR = 0, mSlvG = 0, mSlvB = 0, mSlvC = 0;
    let mSkinR = 0, mSkinG = 0, mSkinB = 0, mSkinC = 0;
    let mHairR = 0, mHairG = 0, mHairB = 0, mHairC = 0;
    for (let y = Math.floor(minY + roughH * 0.06); y <= Math.floor(minY + roughH * 0.22); y += 3) {
      const row = y * w;
      for (let x = Math.max(0, coreCenterX - Math.round(roughW * 0.16)); x <= Math.min(w - 1, coreCenterX + Math.round(roughW * 0.16)); x += 3) {
        const idx = row + x;
        if (alphas[idx] >= 210) {
          const p = idx * 4;
          mHairR += pixels[p]; mHairG += pixels[p + 1]; mHairB += pixels[p + 2]; mHairC++;
        }
      }
    }
    for (let y = Math.floor(minY + roughH * 0.22); y <= Math.floor(minY + roughH * 0.46); y += 3) {
      const row = y * w;
      for (let x = Math.max(0, coreCenterX - Math.round(roughW * 0.16)); x <= Math.min(w - 1, coreCenterX + Math.round(roughW * 0.16)); x += 3) {
        const idx = row + x;
        if (alphas[idx] >= 200) {
          const p = idx * 4;
          if (pixels[p] > pixels[p + 1] && pixels[p + 1] >= pixels[p + 2] * 0.85 && pixels[p] - pixels[p + 2] >= 12) {
            mSkinR += pixels[p]; mSkinG += pixels[p + 1]; mSkinB += pixels[p + 2]; mSkinC++;
          }
        }
      }
    }
    for (let y = Math.floor(minY + roughH * 0.56); y <= Math.floor(minY + roughH * 0.88); y += 3) {
      const row = y * w;
      let rL = -1, rR = -1;
      for (let x = minX; x <= maxX; x++) if (alphas[row + x] >= 195) { rL = x; break; }
      for (let x = maxX; x >= minX; x--) if (alphas[row + x] >= 195) { rR = x; break; }
      for (let x = Math.max(0, coreCenterX - Math.round(roughW * 0.16)); x <= Math.min(w - 1, coreCenterX + Math.round(roughW * 0.16)); x += 3) {
        const idx = row + x;
        if (alphas[idx] >= 190) {
          const p = idx * 4;
          mGarR += pixels[p]; mGarG += pixels[p + 1]; mGarB += pixels[p + 2]; mGarC++;
        }
      }
      if (y >= Math.floor(minY + roughH * 0.70) && rL !== -1 && rR > rL + 30) {
        for (let sx = rL + 6; sx <= rL + 20; sx += 3) {
          if (alphas[row + sx] >= 205) {
            const p = (row + sx) * 4;
            mSlvR += pixels[p]; mSlvG += pixels[p + 1]; mSlvB += pixels[p + 2]; mSlvC++;
          }
        }
        for (let sx = rR - 20; sx <= rR - 6; sx += 3) {
          if (alphas[row + sx] >= 205) {
            const p = (row + sx) * 4;
            mSlvR += pixels[p]; mSlvG += pixels[p + 1]; mSlvB += pixels[p + 2]; mSlvC++;
          }
        }
      }
    }
    const refHairR = mHairC > 5 ? mHairR / mHairC : 30;
    const refHairG = mHairC > 5 ? mHairG / mHairC : 30;
    const refHairB = mHairC > 5 ? mHairB / mHairC : 30;
    const refSkinR = mSkinC > 5 ? mSkinR / mSkinC : 0;
    const refSkinG = mSkinC > 5 ? mSkinG / mSkinC : 0;
    const refSkinB = mSkinC > 5 ? mSkinB / mSkinC : 0;
    const refGarR = mGarC > 8 ? mGarR / mGarC : 128;
    const refGarG = mGarC > 8 ? mGarG / mGarC : 128;
    const refGarB = mGarC > 8 ? mGarB / mGarC : 128;
    const refSlvR = mSlvC > 6 ? mSlvR / mSlvC : refGarR;
    const refSlvG = mSlvC > 6 ? mSlvG / mSlvC : refGarG;
    const refSlvB = mSlvC > 6 ? mSlvB / mSlvC : refGarB;

    const intDist = new Uint8Array(total);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        if (alphas[i] < 105) {
          intDist[i] = 0;
        } else {
          let d = (x === 0 || y === 0) ? 1 : 255;
          if (x > 0) d = Math.min(d, intDist[i - 1] + 1);
          if (y > 0) d = Math.min(d, intDist[i - w] + 1);
          intDist[i] = Math.min(255, d);
        }
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      for (let x = w - 1; x >= 0; x--) {
        const i = row + x;
        if (intDist[i] === 0) continue;
        let d = (x === w - 1 || y === h - 1) ? 1 : intDist[i];
        if (x < w - 1) d = Math.min(d, intDist[i + 1] + 1);
        if (y < h - 1) d = Math.min(d, intDist[i + w] + 1);
        intDist[i] = d;
      }
    }

    const eLabels = new Int32Array(total);
    const eQueue = new Int32Array(total);
    const eSize: number[] = [0];
    const eSumX: number[] = [0];
    const eSumY: number[] = [0];
    const eSumR: number[] = [0];
    const eSumG: number[] = [0];
    const eSumB: number[] = [0];
    const eSumMa: number[] = [0];
    const eMinX: number[] = [w];
    const eMaxX: number[] = [0];
    const eMinY: number[] = [h];
    const eMaxY: number[] = [0];
    let eCur = 0;

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        if (intDist[idx] >= rErode && eLabels[idx] === 0) {
          eCur++;
          let sz = 0, sx = 0, sy = 0, sr = 0, sg = 0, sb = 0, sma = 0;
          let bx0 = w, bx1 = 0, by0 = h, by1 = 0;
          let hd = 0, tl = 0;
          eLabels[idx] = eCur;
          eQueue[tl++] = idx;
          while (hd < tl) {
            const curr = eQueue[hd++];
            const cy = Math.floor(curr / w), cx = curr % w;
            const cp = curr * 4;
            sz++; sx += cx; sy += cy;
            sr += pixels[cp]; sg += pixels[cp + 1]; sb += pixels[cp + 2];
            if (modnetAlphas) sma += modnetAlphas[curr];
            if (cx < bx0) bx0 = cx;
            if (cx > bx1) bx1 = cx;
            if (cy < by0) by0 = cy;
            if (cy > by1) by1 = cy;
            if (cy > 0 && intDist[curr - w] >= rErode && eLabels[curr - w] === 0) { eLabels[curr - w] = eCur; eQueue[tl++] = curr - w; }
            if (cy < h - 1 && intDist[curr + w] >= rErode && eLabels[curr + w] === 0) { eLabels[curr + w] = eCur; eQueue[tl++] = curr + w; }
            if (cx > 0 && intDist[curr - 1] >= rErode && eLabels[curr - 1] === 0) { eLabels[curr - 1] = eCur; eQueue[tl++] = curr - 1; }
            if (cx < w - 1 && intDist[curr + 1] >= rErode && eLabels[curr + 1] === 0) { eLabels[curr + 1] = eCur; eQueue[tl++] = curr + 1; }
          }
          eSize.push(sz); eSumX.push(sx); eSumY.push(sy);
          eSumR.push(sr); eSumG.push(sg); eSumB.push(sb); eSumMa.push(sma);
          eMinX.push(bx0); eMaxX.push(bx1); eMinY.push(by0); eMaxY.push(by1);
        }
      }
    }

    if (eCur > 1) {
      let maxESz = 0;
      for (let l = 1; l <= eCur; l++) if (eSize[l] > maxESz) maxESz = eSize[l];
      let mainCore = 1, bestScore = -1;
      for (let l = 1; l <= eCur; l++) {
        const sz = eSize[l];
        if (sz < Math.max(40, maxESz * 0.08)) continue;
        const cx = eSumX[l] / sz, cy = eSumY[l] / sz;
        const dCenter = Math.hypot((cx - w * 0.5) / Math.max(1, w), (cy - h * 0.48) / Math.max(1, h));
        const sc = sz / (1 + 2.4 * dCenter);
        if (sc > bestScore) { bestScore = sc; mainCore = l; }
      }

      const mSz = eSize[mainCore];
      const severComp = new Uint8Array(eCur + 1);
      let hasSeverTarget = false;
      for (let l = 1; l <= eCur; l++) {
        if (l === mainCore) continue;
        const sz = eSize[l];
        const meanMa = modnetAlphas ? eSumMa[l] / sz : -1;
        const avgR = eSumR[l] / sz, avgG = eSumG[l] / sz, avgB = eSumB[l] / sz;
        const avgLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
        const distGar = mGarC > 8 ? Math.hypot(avgR - refGarR, avgG - refGarG, avgB - refGarB) : 999;
        const distSlv = mSlvC > 6 ? Math.hypot(avgR - refSlvR, avgG - refSlvG, avgB - refSlvB) : 999;
        const distSkin = mSkinC > 5 ? Math.hypot(avgR - refSkinR, avgG - refSkinG, avgB - refSkinB) : 999;
        const distHair = mHairC > 5 ? Math.hypot(avgR - refHairR, avgG - refHairG, avgB - refHairB) : 999;
        const touchesEdge = eMinX[l] <= 4 || eMaxX[l] >= w - 5 || eMinY[l] <= 4;
        const cx = eSumX[l] / sz;
        const cy = eSumY[l] / sz;
        const lateralWing = Math.abs(cx - coreCenterX) > roughW * 0.22;
        const isDarkHairAtHead = (avgLum < 85 || distHair < 36) && eMaxY[l] <= minY + roughH * 0.48 && !touchesEdge;

        // Strict Subject Protection: never sever anything MODNet marks as subject (meanMa >= 45),
        // and without MODNet protect garment, sleeve, hair, and skin-matching body parts
        if (modnetAlphas) {
          if (meanMa < 45 && !((distGar < 32 || distSlv < 32 || distSkin < 38) && meanMa >= 22 && !touchesEdge)) {
            severComp[l] = 1;
            hasSeverTarget = true;
          }
        } else {
          const likelySubjectPart =
            sz >= mSz * 0.35 ||
            distGar < 36 ||
            distSlv < 34 ||
            distSkin < 38 ||
            isDarkHairAtHead ||
            (!touchesEdge && !lateralWing && cy >= minY + roughH * 0.20);
          if (!likelySubjectPart) {
            severComp[l] = 1;
            hasSeverTarget = true;
          }
        }
      }

      if (hasSeverTarget) {
        // Multi-source Voronoi reconstruction across alphas >= 20 to cleanly split at the narrowest neck
        const vOwner = new Int32Array(eLabels);
        const vQueue = new Int32Array(total);
        let vHead = 0, vTail = 0;
        for (let i = 0; i < total; i++) {
          if (vOwner[i] > 0) vQueue[vTail++] = i;
        }
        while (vHead < vTail) {
          const curr = vQueue[vHead++];
          const ow = vOwner[curr];
          const cy = Math.floor(curr / w), cx = curr % w;
          if (cy > 0) { const n = curr - w; if (alphas[n] >= 20 && vOwner[n] === 0) { vOwner[n] = ow; vQueue[vTail++] = n; } }
          if (cy < h - 1) { const n = curr + w; if (alphas[n] >= 20 && vOwner[n] === 0) { vOwner[n] = ow; vQueue[vTail++] = n; } }
          if (cx > 0) { const n = curr - 1; if (alphas[n] >= 20 && vOwner[n] === 0) { vOwner[n] = ow; vQueue[vTail++] = n; } }
          if (cx < w - 1) { const n = curr + 1; if (alphas[n] >= 20 && vOwner[n] === 0) { vOwner[n] = ow; vQueue[vTail++] = n; } }
        }
        for (let i = 0; i < total; i++) {
          const ow = vOwner[i];
          if (ow > 0 && severComp[ow] === 1) {
            alphas[i] = 0;
            if (pixels) pixels[i * 4 + 3] = 0;
          }
        }
      }
    }
  }

  // 1b-chair. Close Chair/Object Wing & Protrusion Peeler:
  // Even when a chair backrest/headrest/corner is welded solidly (> 20px contact) beside the head, neck,
  // or upper shoulders, flood inward from exterior air strictly through non-subject material
  // (using MODNet rejection + anatomical bounds when available, or anchored sleeve/skin/hair exclusion without MODNet).
  if (!preservePolishedEdges && (isolateMainSubject || severTouchingObjects) && objectStrictness >= 70 && coreCount > 400) {
    const roughW = Math.max(1, maxX - minX);
    const roughH = Math.max(1, maxY - minY);
    const neckSplitY = Math.floor(minY + roughH * 0.45);
    const upperObjZoneEndY = Math.min(h - 2, Math.floor(minY + roughH * 0.72));

    // Estimate head centerline, head width, and fast chamfer distance to confident MODNet (ma >= 100)
    let hSumX = 0, hCnt = 0, headMaxHalf = Math.round(roughW * 0.24);
    const modSpanL = modnetAlphas ? new Int32Array(h).fill(-1) : null;
    const modSpanR = modnetAlphas ? new Int32Array(h).fill(-1) : null;
    const mChairDist = modnetAlphas ? new Uint8Array(total) : null;
    for (let y = Math.floor(minY + roughH * 0.14); y <= Math.floor(minY + roughH * 0.36); y += 2) {
      const row = y * w;
      let l = -1, r = -1;
      for (let x = minX; x <= maxX; x++) {
        if ((modnetAlphas ? modnetAlphas[row + x] : alphas[row + x]) >= 150) { l = x; break; }
      }
      for (let x = maxX; x >= minX; x--) {
        if ((modnetAlphas ? modnetAlphas[row + x] : alphas[row + x]) >= 150) { r = x; break; }
      }
      if (l !== -1 && r > l) {
        hSumX += (l + r) * 0.5;
        headMaxHalf = Math.max(headMaxHalf, Math.round((r - l) * 0.56));
        hCnt++;
      }
    }
    if (modnetAlphas && modSpanL && modSpanR && mChairDist) {
      mChairDist.fill(40);
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const idx = row + x;
          const ma = modnetAlphas[idx];
          if (ma >= 85) {
            if (modSpanL[y] === -1) modSpanL[y] = x;
            modSpanR[y] = x;
          }
          if (ma >= 100) {
            mChairDist[idx] = 0;
          } else {
            let d = 40;
            if (x > 0) d = Math.min(d, mChairDist[idx - 1] + 1);
            if (y > 0) d = Math.min(d, mChairDist[idx - w] + 1);
            mChairDist[idx] = d;
          }
        }
      }
      for (let y = h - 1; y >= 0; y--) {
        const row = y * w;
        for (let x = w - 1; x >= 0; x--) {
          const idx = row + x;
          let d = mChairDist[idx];
          if (x < w - 1) d = Math.min(d, mChairDist[idx + 1] + 1);
          if (y < h - 1) d = Math.min(d, mChairDist[idx + w] + 1);
          mChairDist[idx] = d;
        }
      }
    }
    const headCX = hCnt > 0 ? Math.round(hSumX / hCnt) : coreCenterX;

    // Natural independent left & right anatomical torso bounds (never crop or shrink natural width/pose asymmetry)
    const symAnatL = new Int32Array(h).fill(-1);
    const symAnatR = new Int32Array(h).fill(-1);
    const symMaxHalfCap = Math.max(48, Math.round(headMaxHalf * 3.0));
    let symPrevL = Math.max(20, Math.round(headMaxHalf * 1.05));
    let symPrevR = symPrevL;
    const anatStep = Math.max(12, Math.round(roughW * 0.045));
    for (let y = neckSplitY; y <= maxY; y++) {
      const row = y * w;
      let rL = -1, rR = -1;
      for (let x = minX; x <= maxX; x++) {
        if ((modSpanL && modSpanL[y] !== -1 ? modnetAlphas![row + x] : alphas[row + x]) >= 145) { rL = x; break; }
      }
      for (let x = maxX; x >= minX; x--) {
        if ((modSpanR && modSpanR[y] !== -1 ? modnetAlphas![row + x] : alphas[row + x]) >= 145) { rR = x; break; }
      }
      const dL = rL !== -1 && rL < headCX ? headCX - rL : symPrevL;
      const dR = rR !== -1 && rR > headCX ? rR - headCX : symPrevR;
      symPrevL = Math.min(symMaxHalfCap, Math.max(dL, Math.min(symPrevL + anatStep, dL + 8)));
      symPrevR = Math.min(symMaxHalfCap, Math.max(dR, Math.min(symPrevR + anatStep, dR + 8)));
      const padAnat = Math.max(12, Math.round(roughW * 0.03));
      symAnatL[y] = Math.max(0, Math.round(headCX - symPrevL - padAnat));
      symAnatR[y] = Math.min(w - 1, Math.round(headCX + symPrevR + padAnat));
    }

    let skR = 0, skG = 0, skB = 0, skC = 0;
    let hrR = 0, hrG = 0, hrB = 0, hrC = 0;
    let grR = 0, grG = 0, grB = 0, grC = 0;
    let lsR = 0, lsG = 0, lsB = 0, lsC = 0;
    let rsR = 0, rsG = 0, rsB = 0, rsC = 0;
    let lightShCnt = 0, checkShCnt = 0, totShCnt = 0;

    for (let y = Math.floor(minY + roughH * 0.06); y <= Math.floor(minY + roughH * 0.22); y += 2) {
      const row = y * w;
      for (let x = Math.max(0, headCX - Math.round(roughW * 0.14)); x <= Math.min(w - 1, headCX + Math.round(roughW * 0.14)); x += 2) {
        const idx = row + x;
        if (alphas[idx] >= 210) {
          const p = idx * 4;
          hrR += pixels[p]; hrG += pixels[p + 1]; hrB += pixels[p + 2]; hrC++;
        }
      }
    }
    for (let y = Math.floor(minY + roughH * 0.22); y <= Math.floor(minY + roughH * 0.46); y += 2) {
      const row = y * w;
      for (let x = Math.max(0, headCX - Math.round(roughW * 0.16)); x <= Math.min(w - 1, headCX + Math.round(roughW * 0.16)); x += 2) {
        const idx = row + x;
        if (alphas[idx] >= 215) {
          const p = idx * 4;
          const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
          if (r > g && g >= b * 0.85 && (r - b) >= 10) {
            skR += r; skG += g; skB += b; skC++;
          }
        }
      }
    }
    for (let y = Math.floor(minY + roughH * 0.56); y <= Math.floor(minY + roughH * 0.90); y += 3) {
      const row = y * w;
      for (let x = Math.max(0, headCX - Math.round(roughW * 0.15)); x <= Math.min(w - 1, headCX + Math.round(roughW * 0.15)); x += 3) {
        const idx = row + x;
        if (alphas[idx] >= 200) {
          const p = idx * 4;
          const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const rp = (row + Math.min(w - 1, x + 3)) * 4;
          const rLum = 0.299 * pixels[rp] + 0.587 * pixels[rp + 1] + 0.114 * pixels[rp + 2];
          grR += r; grG += g; grB += b; grC++;
          if (Math.max(r, g, b) >= 145 && Math.max(r, g, b) - Math.min(r, g, b) <= 60) lightShCnt++;
          if (Math.abs(lum - rLum) >= 14) checkShCnt++;
          totShCnt++;
        }
      }
      // Sample true inner-shoulder sleeves anchored inside portrait bounds
      const sLimL = modSpanL && modSpanL[y] !== -1 ? modSpanL[y] + 6 : symAnatL[y] + 10;
      const sLimR = modSpanR && modSpanR[y] !== -1 ? modSpanR[y] - 6 : symAnatR[y] - 10;
      if (y >= Math.floor(minY + roughH * 0.68) && sLimR > sLimL + 24) {
        for (let sx = Math.max(0, sLimL); sx <= Math.min(headCX - 8, sLimL + 16); sx += 3) {
          const idx = row + sx;
          if (alphas[idx] >= 210 && (!modnetAlphas || modnetAlphas[idx] >= 150)) {
            const p = idx * 4;
            lsR += pixels[p]; lsG += pixels[p + 1]; lsB += pixels[p + 2]; lsC++;
          }
        }
        for (let sx = Math.max(headCX + 8, sLimR - 16); sx <= Math.min(w - 1, sLimR); sx += 3) {
          const idx = row + sx;
          if (alphas[idx] >= 210 && (!modnetAlphas || modnetAlphas[idx] >= 150)) {
            const p = idx * 4;
            rsR += pixels[p]; rsG += pixels[p + 1]; rsB += pixels[p + 2]; rsC++;
          }
        }
      }
    }

    const avgHairR = hrC > 4 ? hrR / hrC : 30, avgHairG = hrC > 4 ? hrG / hrC : 30, avgHairB = hrC > 4 ? hrB / hrC : 30;
    const avgSkR = skC > 4 ? skR / skC : 0, avgSkG = skC > 4 ? skG / skC : 0, avgSkB = skC > 4 ? skB / skC : 0;
    const avgGrR = grC > 6 ? grR / grC : 128, avgGrG = grC > 6 ? grG / grC : 128, avgGrB = grC > 6 ? grB / grC : 128;
    const avgLsR = lsC > 4 ? lsR / lsC : avgGrR, avgLsG = lsC > 4 ? lsG / lsC : avgGrG, avgLsB = lsC > 4 ? lsB / lsC : avgGrB;
    const avgRsR = rsC > 4 ? rsR / rsC : avgGrR, avgRsG = rsC > 4 ? rsG / rsC : avgGrG, avgRsB = rsC > 4 ? rsB / rsC : avgGrB;
    const hasLightShirt = totShCnt > 10 && lightShCnt / totShCnt >= 0.22;
    const hasCheckShirt = totShCnt > 12 && checkShCnt / totShCnt >= 0.06;

    const isProtectedSubjectPixel = (idx: number, x: number, y: number): boolean => {
      const ma = modnetAlphas ? modnetAlphas[idx] : -1;
      if (modnetAlphas && ma >= 36) return true;
      const p = idx * 4;
      const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
      const md = mChairDist ? mChairDist[idx] : 0;
      const inModSpan = modSpanL && modSpanR && modSpanL[y] !== -1
        ? (x >= modSpanL[y] - 6 && x <= modSpanR[y] + 6)
        : false;

      // Protect authentic warm face/ear/under-ear/neck skin (when MODNet active, guard within <= 11px of head/neck)
      const warmTone = r > g && g >= b * 0.85 && (r - b) >= 10;
      const dSkin = skC > 4 ? Math.hypot(r - avgSkR, g - avgSkG, b - avgSkB) : 999;
      if (warmTone && (!modnetAlphas || md <= 11) && (dSkin < 40 || (y <= neckSplitY + roughH * 0.10 && (r - b) >= 14))) {
        return true;
      }

      // Protect hair strictly within the head silhouette (never shield dark chair headrests/frames outside head/neck!)
      const nearModHead = modnetAlphas && modSpanL && modSpanR && modSpanL[y] !== -1
        ? (x >= modSpanL[y] - 6 && x <= modSpanR[y] + 6)
        : Math.abs(x - headCX) <= headMaxHalf;
      const dHair = hrC > 4 ? Math.hypot(r - avgHairR, g - avgHairG, b - avgHairB) : 999;
      if (nearModHead && y <= neckSplitY + roughH * 0.08 && (dHair < 34 || (lum < 82 && (!modnetAlphas || ma >= 12 || md <= 5)))) {
        return true;
      }
      if (!modnetAlphas && y <= upperObjZoneEndY && Math.abs(x - headCX) <= roughW * 0.26 && dHair < 34) return true;

      // Protect torso / collar / sleeve / fold garments along & near the subject boundary
      // even when clothing color is close to the background!
      if (y >= neckSplitY - Math.round(roughH * 0.04)) {
        const dChest = grC > 6 ? Math.hypot(r - avgGrR, g - avgGrG, b - avgGrB) : 999;
        const dLeftS = lsC > 4 ? Math.hypot(r - avgLsR, g - avgLsG, b - avgLsB) : 999;
        const dRightS = rsC > 4 ? Math.hypot(r - avgRsR, g - avgRsG, b - avgRsB) : 999;
        const insideSymAnat = symAnatL[y] !== -1 && x >= symAnatL[y] && x <= symAnatR[y];
        if (alphas[idx] >= 165 && (!modnetAlphas || md <= 8 || ma >= 14 || insideSymAnat)) {
          return true;
        }
        if (
          insideSymAnat &&
          (dChest < 40 || dLeftS < 38 || dRightS < 38) &&
          (!modnetAlphas || md <= 9 || ma >= 12)
        ) {
          return true;
        }
        if (modnetAlphas && ma < 16 && !inModSpan && md > 6) {
          return false;
        }
        if (dChest < 40 || dLeftS < 38 || dRightS < 38) return true;
        if (hasLightShirt && lum >= 135 && (maxC - minC) <= 60) return true;
        if (!modnetAlphas && hasCheckShirt && y >= neckSplitY + Math.round(roughH * 0.08)) return true;
      }
      return false;
    };

    const wingVisited = new Uint8Array(total);
    const wingQueue = new Int32Array(total);
    const preWingAlpha = modnetAlphas ? null : new Float32Array(alphas);
    let wHead = 0, wTail = 0;

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        if (alphas[idx] < 25) {
          wingVisited[idx] = 1;
          wingQueue[wTail++] = idx;
        }
      }
    }

    const peeledList: number[] = [];
    const centerSafeHalf = Math.round(roughW * 0.15);
    let touchedCenter = false;

    while (wHead < wTail) {
      const curr = wingQueue[wHead++];
      const cy = Math.floor(curr / w), cx = curr % w;
      const nbs = [
        cy > 0 ? curr - w : -1,
        cy < h - 1 ? curr + w : -1,
        cx > 0 ? curr - 1 : -1,
        cx < w - 1 ? curr + 1 : -1,
      ];
      for (const n of nbs) {
        if (n === -1 || wingVisited[n] === 1) continue;
        wingVisited[n] = 1;
        if (alphas[n] < 25) {
          wingQueue[wTail++] = n;
          continue;
        }
        const ny = Math.floor(n / w), nx = n % w;
        if (isProtectedSubjectPixel(n, nx, ny)) continue;
        // Without MODNet, never crop solid shoulders/arms/folds; only peel faint bridges & disconnected upper wings
        if (!modnetAlphas) {
          if (Math.abs(nx - headCX) <= centerSafeHalf) {
            touchedCenter = true;
            continue;
          }
          if (ny >= neckSplitY && alphas[n] >= 170) continue;
        }
        alphas[n] = 0;
        if (pixels) pixels[n * 4 + 3] = 0;
        peeledList.push(n);
        wingQueue[wTail++] = n;
      }
    }

    if (!modnetAlphas && preWingAlpha && (peeledList.length > coreCount * 0.22 || (touchedCenter && peeledList.length > coreCount * 0.16))) {
      for (const idx of peeledList) {
        alphas[idx] = preWingAlpha[idx];
        if (pixels) pixels[idx * 4 + 3] = Math.round(preWingAlpha[idx]);
      }
    }
  }

  // 1c. Solid-Core Weak-Bridge Severing:
  // When isolating main subject, objects/color-patches in background often touch the subject through
  // a faint translucent mist bridge (alpha 20..94). Labeling at coreThresh severs haze bridges so
  // secondary background objects detach while preserving soft sleeve folds (>= 95).
  if (isolateMainSubject || severTouchingObjects) {
    const coreThresh = 95;
    const cLabels = new Int32Array(total);
    const cQueue = new Int32Array(total);
    const cSizes: number[] = [0];
    const cSumX: number[] = [0];
    const cSumY: number[] = [0];
    const cMinX: number[] = [w];
    const cMaxX: number[] = [0];
    const cMinY: number[] = [h];
    const cMaxY: number[] = [0];
    let cCur = 0;

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        if (alphas[idx] >= coreThresh && cLabels[idx] === 0) {
          cCur++;
          let sz = 0, sx = 0, sy = 0;
          let bx0 = w, bx1 = 0, by0 = h, by1 = 0;
          let hd = 0, tl = 0;
          cLabels[idx] = cCur;
          cQueue[tl++] = idx;
          while (hd < tl) {
            const curr = cQueue[hd++];
            const cy = Math.floor(curr / w);
            const cx = curr % w;
            sz++; sx += cx; sy += cy;
            if (cx < bx0) bx0 = cx;
            if (cx > bx1) bx1 = cx;
            if (cy < by0) by0 = cy;
            if (cy > by1) by1 = cy;
            if (cy > 0 && alphas[curr - w] >= coreThresh && cLabels[curr - w] === 0) { cLabels[curr - w] = cCur; cQueue[tl++] = curr - w; }
            if (cy < h - 1 && alphas[curr + w] >= coreThresh && cLabels[curr + w] === 0) { cLabels[curr + w] = cCur; cQueue[tl++] = curr + w; }
            if (cx > 0 && alphas[curr - 1] >= coreThresh && cLabels[curr - 1] === 0) { cLabels[curr - 1] = cCur; cQueue[tl++] = curr - 1; }
            if (cx < w - 1 && alphas[curr + 1] >= coreThresh && cLabels[curr + 1] === 0) { cLabels[curr + 1] = cCur; cQueue[tl++] = curr + 1; }
          }
          cSizes.push(sz); cSumX.push(sx); cSumY.push(sy);
          cMinX.push(bx0); cMaxX.push(bx1); cMinY.push(by0); cMaxY.push(by1);
        }
      }
    }

    if (cCur > 1) {
      let maxCSz = 0;
      for (let l = 1; l <= cCur; l++) if (cSizes[l] > maxCSz) maxCSz = cSizes[l];
      let mainCore = 1;
      let bestCoreScore = -1;
      const minCoreCand = Math.max(120, Math.round(maxCSz * 0.08));
      for (let l = 1; l <= cCur; l++) {
        const sz = cSizes[l];
        if (sz < minCoreCand) continue;
        const cx = cSumX[l] / Math.max(1, sz);
        const cy = cSumY[l] / Math.max(1, sz);
        const distCenter = Math.hypot((cx - w * 0.5) / Math.max(1, w), (cy - h * 0.48) / Math.max(1, h));
        const score = sz / (1 + 2.4 * distCenter);
        if (score > bestCoreScore) { bestCoreScore = score; mainCore = l; }
      }

      const mcSz = cSizes[mainCore];
      const mcMinX = cMinX[mainCore], mcMaxX = cMaxX[mainCore];
      const mcMinY = cMinY[mainCore], mcMaxY = cMaxY[mainCore];
      const mcH = Math.max(1, mcMaxY - mcMinY);
      const mcPad = Math.max(10, Math.round(w * 0.015));

      const keepCore = new Uint8Array(cCur + 1);
      keepCore[mainCore] = 1;
      for (let l = 1; l <= cCur; l++) {
        if (l === mainCore) continue;
        const sz = cSizes[l];
        const isHairWisp =
          sz < Math.min(240, mcSz * 0.004) &&
          cMaxY[l] <= mcMinY + mcH * 0.42 &&
          cMinX[l] >= mcMinX - mcPad &&
          cMaxX[l] <= mcMaxX + mcPad;
        if (isHairWisp) keepCore[l] = 1;
      }

      // Clear all secondary >= 95 islands + any < 95 haze within 4px around deleted islands
      const deletedSeed = new Uint8Array(total);
      let anyDeleted = false;
      for (let i = 0; i < total; i++) {
        const l = cLabels[i];
        if (l > 0 && keepCore[l] === 0) {
          alphas[i] = 0;
          if (pixels) pixels[i * 4 + 3] = 0;
          deletedSeed[i] = 1;
          anyDeleted = true;
        }
      }
      if (anyDeleted) {
        for (let y = 0; y < h; y++) {
          const row = y * w;
          for (let x = 0; x < w; x++) {
            const i = row + x;
            if (alphas[i] === 0 || alphas[i] >= coreThresh) continue;
            let nearMain = false;
            for (let dy = -2; dy <= 2 && !nearMain; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) continue;
              for (let dx = -2; dx <= 2; dx++) {
                const nx = x + dx;
                if (nx >= 0 && nx < w && keepCore[cLabels[ny * w + nx]] === 1) {
                  nearMain = true;
                  break;
                }
              }
            }
            if (nearMain) continue;
            let nearDeleted = false;
            for (let dy = -4; dy <= 4 && !nearDeleted; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) continue;
              for (let dx = -4; dx <= 4; dx++) {
                const nx = x + dx;
                if (nx >= 0 && nx < w && deletedSeed[ny * w + nx] === 1) {
                  nearDeleted = true;
                  break;
                }
              }
            }
            if (nearDeleted) {
              alphas[i] = 0;
              if (pixels) pixels[i * 4 + 3] = 0;
            }
          }
        }
      }
    }
  }

  // 2. Connected Component Labeling on alphas >= 20
  // Eliminates secondary disconnected chair artifacts, lamp poles, background objects & bystanders
  const labels = new Int32Array(total);
  let currentLabel = 0;
  const componentSizes: number[] = [0];
  const compSumX: number[] = [0];
  const compSumY: number[] = [0];
  const compMinX: number[] = [w];
  const compMaxX: number[] = [0];
  const compMinY: number[] = [h];
  const compMaxY: number[] = [0];
  const queue = new Int32Array(total);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      if (alphas[idx] >= 20 && labels[idx] === 0) {
        currentLabel++;
        let size = 0;
        let sX = 0, sY = 0;
        let cMinX = w, cMaxX = 0, cMinY = h, cMaxY = 0;
        let head = 0;
        let tail = 0;

        labels[idx] = currentLabel;
        queue[tail++] = idx;

        while (head < tail) {
          const curr = queue[head++];
          const cy = Math.floor(curr / w);
          const cx = curr % w;
          size++;
          sX += cx;
          sY += cy;
          if (cx < cMinX) cMinX = cx;
          if (cx > cMaxX) cMaxX = cx;
          if (cy < cMinY) cMinY = cy;
          if (cy > cMaxY) cMaxY = cy;

          if (cy > 0) {
            const n = curr - w;
            if (alphas[n] >= 20 && labels[n] === 0) { labels[n] = currentLabel; queue[tail++] = n; }
          }
          if (cy < h - 1) {
            const n = curr + w;
            if (alphas[n] >= 20 && labels[n] === 0) { labels[n] = currentLabel; queue[tail++] = n; }
          }
          if (cx > 0) {
            const n = curr - 1;
            if (alphas[n] >= 20 && labels[n] === 0) { labels[n] = currentLabel; queue[tail++] = n; }
          }
          if (cx < w - 1) {
            const n = curr + 1;
            if (alphas[n] >= 20 && labels[n] === 0) { labels[n] = currentLabel; queue[tail++] = n; }
          }
        }

        componentSizes.push(size);
        compSumX.push(sX);
        compSumY.push(sY);
        compMinX.push(cMinX);
        compMaxX.push(cMaxX);
        compMinY.push(cMinY);
        compMaxY.push(cMaxY);
      }
    }
  }

  if (currentLabel === 0) return;

  // 3. Find the main centered subject component
  let maxSize = 0;
  for (let l = 1; l <= currentLabel; l++) {
    if (componentSizes[l] > maxSize) maxSize = componentSizes[l];
  }
  const minCandidateSize = Math.max(150, Math.round(maxSize * 0.08));

  let mainLabel = 1;
  let bestScore = -1;
  for (let l = 1; l <= currentLabel; l++) {
    const sz = componentSizes[l];
    if (sz < minCandidateSize && currentLabel > 1) continue;
    const cx = compSumX[l] / Math.max(1, sz);
    const cy = compSumY[l] / Math.max(1, sz);
    const distCenter = Math.hypot((cx - w * 0.5) / Math.max(1, w), (cy - h * 0.48) / Math.max(1, h));
    const score = (isolateMainSubject || severTouchingObjects) ? sz / (1 + 2.4 * distCenter) : sz;
    if (score > bestScore) {
      bestScore = score;
      mainLabel = l;
    }
  }

  const mainSize = componentSizes[mainLabel];
  const mainMinX = compMinX[mainLabel];
  const mainMaxX = compMaxX[mainLabel];
  const mainMinY = compMinY[mainLabel];
  const mainMaxY = compMaxY[mainLabel];
  const mainH = Math.max(1, mainMaxY - mainMinY);
  const hairPad = Math.max(10, Math.round(w * 0.015));
  const fullIsolation = isolateMainSubject || severTouchingObjects;

  // 4. Eliminate disconnected secondary islands & background objects
  const keepComp = new Uint8Array(currentLabel + 1);
  keepComp[mainLabel] = 1;

  for (let l = 1; l <= currentLabel; l++) {
    if (l === mainLabel) continue;
    const sz = componentSizes[l];
    if (fullIsolation) {
      // Only spare tiny separated fine-hair flecks directly beside upper head
      const isTinyHeadWisp =
        sz < Math.min(220, mainSize * 0.004) &&
        compMaxY[l] <= mainMinY + mainH * 0.42 &&
        compMinX[l] >= mainMinX - hairPad &&
        compMaxX[l] <= mainMaxX + hairPad;
      if (isTinyHeadWisp) keepComp[l] = 1;
    } else if (sz >= maxSize * 0.40) {
      keepComp[l] = 1;
    }
  }

  for (let i = 0; i < total; i++) {
    const l = labels[i];
    if (l > 0 && keepComp[l] === 0) {
      alphas[i] = 0;
      if (pixels) pixels[i * 4 + 3] = 0;
    } else if (l === 0 && alphas[i] > 0 && alphas[i] < 20 && fullIsolation) {
      // Clear faint < 20 border haze not touching main component
      const y = Math.floor(i / w), x = i % w;
      const touchesMain =
        (y > 0 && labels[i - w] === mainLabel) ||
        (y < h - 1 && labels[i + w] === mainLabel) ||
        (x > 0 && labels[i - 1] === mainLabel) ||
        (x < w - 1 && labels[i + 1] === mainLabel);
      if (!touchesMain) {
        alphas[i] = 0;
        if (pixels) pixels[i * 4 + 3] = 0;
      }
    }
  }
}

// -------------------------------------------------------------
// STAGE 4: HIGH PRECISION GUIDED FILTER & CRISP BOUNDARY MATTING
// -------------------------------------------------------------

/**
 * Fast Guided Filter for sub-pixel boundary matting.
 * Uses the native RGB image as the guide to snap alpha edges cleanly to actual object/hair boundaries.
 */
function applyFastGuidedFilter(
  imageData: ImageData,
  rawAlpha: Float32Array,
  w: number,
  h: number,
  radius = 3,
  eps = 0.0001
): Float32Array {
  const total = w * h;
  const pixels = imageData.data;
  const guide = new Float32Array(total);
  const p = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    guide[i] = (0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]) / 255.0;
    p[i] = rawAlpha[i] / 255.0;
  }

  // 1D separable box filter
  const boxFilter = (src: Float32Array, r: number): Float32Array => {
    const dest = new Float32Array(total);
    const temp = new Float32Array(total);

    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = 0; x <= r && x < w; x++) {
        sum += src[row + x];
      }
      for (let x = 0; x < w; x++) {
        const left = x - r - 1;
        const right = x + r;
        if (left >= 0) sum -= src[row + left];
        if (right < w && right > r) sum += src[row + right];
        const count = Math.min(x + r, w - 1) - Math.max(0, x - r) + 1;
        temp[row + x] = sum / count;
      }
    }

    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = 0; y <= r && y < h; y++) {
        sum += temp[y * w + x];
      }
      for (let y = 0; y < h; y++) {
        const top = y - r - 1;
        const bottom = y + r;
        if (top >= 0) sum -= temp[top * w + x];
        if (bottom < h && bottom > r) sum += temp[bottom * w + x];
        const count = Math.min(y + r, h - 1) - Math.max(0, y - r) + 1;
        dest[y * w + x] = sum / count;
      }
    }

    return dest;
  };

  const meanI = boxFilter(guide, radius);
  const meanP = boxFilter(p, radius);

  const guideP = new Float32Array(total);
  const guideGuide = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    guideP[i] = guide[i] * p[i];
    guideGuide[i] = guide[i] * guide[i];
  }

  const meanIP = boxFilter(guideP, radius);
  const meanII = boxFilter(guideGuide, radius);

  const a = new Float32Array(total);
  const b = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const varI = Math.max(0, meanII[i] - meanI[i] * meanI[i]);
    const covIP = meanIP[i] - meanI[i] * meanP[i];
    const ak = covIP / (varI + eps);
    const bk = meanP[i] - ak * meanI[i];
    a[i] = ak;
    b[i] = bk;
  }

  const meanA = boxFilter(a, radius);
  const meanB = boxFilter(b, radius);

  const output = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const origA = rawAlpha[i];
    const gVal = guide[i];
    const y = Math.floor(i / w);

    // If neural net or interior solidification cleared background, never invent alpha
    if (origA < 22) {
      output[i] = 0;
      continue;
    }
    // If background is light/white and alpha is low, cleanly eliminate haze
    if (origA < 38 && gVal > 0.72) {
      output[i] = 0;
      continue;
    }
    if (origA >= 245) {
      output[i] = 255;
      continue;
    }

    const q = Math.max(0, Math.min(1.0, meanA[i] * gVal + meanB[i]));
    const rawVal = q * 255.0;

    // Sharp, crisp cutoff for body, and clean hair boundary cutoff without fuzzy halos
    const isUpper = y < h * 0.35;
    const threshLow = isUpper ? 36 : 34;
    const threshHigh = isUpper ? 222 : 218;
    
    if (rawVal <= threshLow) {
      output[i] = 0;
    } else if (rawVal >= threshHigh) {
      output[i] = 255;
    } else {
      const t = (rawVal - threshLow) / (threshHigh - threshLow);
      const s = t * t * (3 - 2 * t);
      const refined = s * 255.0;
      // Preserve solid deep interior lower torso/shirt garment pixels without locking perimeter edges prematurely
      if (origA >= 240 && y >= h * 0.54) {
        output[i] = 255;
      } else if (y >= h * 0.56 && origA >= 205 && refined >= 195) {
        output[i] = 255;
      } else if (gVal > 0.68) {
        output[i] = Math.max(0, Math.min(255, Math.min(origA + 6, refined)));
      } else {
        output[i] = Math.max(0, Math.min(255, Math.min(origA + 12, refined)));
      }
    }
  }

  return output;
}

// -------------------------------------------------------------
// STAGE 5: PRISTINE PHOTO DETAIL PRESERVATION & CLEAN EDGE MATTING
// -------------------------------------------------------------

/**
 * Applies clean edge matting with spatial sector background comparison and local color de-contamination
 * to eliminate halos of any background color (white, gray, blue, green, dark, outdoor) around
 * hair, ears, face, neck, and shoulders without cutting genuine subject edges.
 */
function applyCleanEdgeMatting(
  pixels: Uint8ClampedArray,
  alphas: Float32Array,
  w: number,
  h: number,
  bgModels?: BackgroundModels
) {
  const tempAlphas = new Float32Array(alphas);
  const copyPixels = new Uint8ClampedArray(pixels);

  const bgMeanR = bgModels?.global?.meanR ?? 245;
  const bgMeanG = bgModels?.global?.meanG ?? 245;
  const bgMeanB = bgModels?.global?.meanB ?? 245;
  const bgLum = 0.299 * bgMeanR + 0.587 * bgMeanG + 0.114 * bgMeanB;
  const isLightBg = bgLum > 155;

  // Sample core face/neck skin tone so warm/beige wall halos aren't mistaken for real skin
  let skinRSum = 0, skinGSum = 0, skinBSum = 0, skinSamples = 0;
  for (let y = Math.floor(h * 0.20); y <= Math.floor(h * 0.48); y += 3) {
    const row = y * w;
    for (let x = Math.floor(w * 0.34); x <= Math.floor(w * 0.66); x += 3) {
      const idx = row + x;
      if (tempAlphas[idx] >= 220) {
        const p = idx * 4;
        const sr = copyPixels[p], sg = copyPixels[p + 1], sb = copyPixels[p + 2];
        if (sr > sg && sr > sb && (sr - sb) >= 14) {
          skinRSum += sr;
          skinGSum += sg;
          skinBSum += sb;
          skinSamples++;
        }
      }
    }
  }
  const avgSkinR = skinSamples > 0 ? skinRSum / skinSamples : 0;
  const avgSkinG = skinSamples > 0 ? skinGSum / skinSamples : 0;
  const avgSkinB = skinSamples > 0 ? skinBSum / skinSamples : 0;

  // Dynamically detect subject height & neck minimum so white/light/check shirts & collars are never treated as upper-head haze
  let sMinY = h, sMaxY = 0, sMinX = w, sMaxX = 0;
  for (let y = 0; y < h; y += 2) {
    const row = y * w;
    for (let x = 0; x < w; x += 2) {
      if (tempAlphas[row + x] >= 40) {
        if (x < sMinX) sMinX = x;
        if (x > sMaxX) sMaxX = x;
        if (y < sMinY) sMinY = y;
        if (y > sMaxY) sMaxY = y;
      }
    }
  }
  const sH = Math.max(1, sMaxY - sMinY);
  let dynNeckY = Math.floor(h * 0.48);
  if (sMaxY > sMinY + 20) {
    let minSpan = Infinity;
    for (let y = Math.floor(sMinY + sH * 0.24); y <= Math.floor(sMinY + sH * 0.54); y++) {
      const row = y * w;
      let l = -1, r = -1;
      for (let x = sMinX; x <= sMaxX; x++) if (tempAlphas[row + x] >= 165) { l = x; break; }
      for (let x = sMaxX; x >= sMinX; x--) if (tempAlphas[row + x] >= 165) { r = x; break; }
      if (l !== -1 && r > l && (r - l) < minSpan) {
        minSpan = r - l;
        dynNeckY = y;
      }
    }
  }
  const upperZoneLimitY = Math.min(Math.floor(h * 0.52), dynNeckY + Math.round(sH * 0.02));
  const shirtProtectStartY = Math.min(Math.floor(h * 0.55), dynNeckY + Math.round(sH * 0.03));

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    const isUpper = y < upperZoneLimitY;
    const isEarLevel = y >= sMinY + sH * 0.14 && y <= upperZoneLimitY;
    const secY = Math.min(2, Math.floor((y / h) * 3));

    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x;
      const alphaVal = tempAlphas[idx];
      const pIdx = idx * 4;

      const r = copyPixels[pIdx];
      const g = copyPixels[pIdx + 1];
      const b = copyPixels[pIdx + 2];
      const curLum = 0.299 * r + 0.587 * g + 0.114 * b;

      const secX = Math.min(2, Math.floor((x / w) * 3));
      const sec = bgModels?.sectors?.[secY * 3 + secX];
      const secBgR = sec ? sec.meanR : bgMeanR;
      const secBgG = sec ? sec.meanG : bgMeanG;
      const secBgB = sec ? sec.meanB : bgMeanB;
      const secStd = sec ? Math.hypot(sec.stdR, sec.stdG, sec.stdB) : 18;
      const secBgLum = 0.299 * secBgR + 0.587 * secBgG + 0.114 * secBgB;

      // Cleanly cut outer background haze and color-matched fringes:
      let lowerCut = isUpper ? 36 : 28;
      if ((isLightBg || secBgLum > 155) && isUpper && curLum > 170) {
        lowerCut = isEarLevel ? 52 : 44;
      }
      // Keep transition pixels up to 232 smooth and eligible for color decontamination (no hard un-unmixed shoulder crust)
      const upperCut = isUpper ? 232 : 228;

      if (alphaVal <= lowerCut) {
        pixels[pIdx + 3] = 0;
        continue;
      }

      if (alphaVal >= upperCut) {
        pixels[pIdx + 3] = 255;
      } else {
        const t = (alphaVal - lowerCut) / (upperCut - lowerCut);
        const smoothAlpha = t * t * (3 - 2 * t) * 255.0;
        pixels[pIdx + 3] = Math.round(Math.max(0, Math.min(255, smoothAlpha)));
      }

      // Check local foreground & background match for semi-transparent fringe pixels (any bg color)
      const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 14;
      const distToSecBg = Math.hypot(r - secBgR, g - secBgG, b - secBgB);
      const distToGlobBg = Math.hypot(r - bgMeanR, g - bgMeanG, b - bgMeanB);
      const distToBg = Math.min(distToSecBg, distToGlobBg);
      const distToSkin = skinSamples > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
      const isLikelyRealSkin =
        isWarmSkin &&
        (skinSamples === 0
          ? distToBg > 24
          : (distToSkin < distToBg * 0.90 || (distToSkin <= 26 && distToBg > 20)));

      if (pixels[pIdx + 3] > 0 && alphaVal < upperCut) {
        let fgR = 0, fgG = 0, fgB = 0, fgCount = 0;
        let minSolidFgDist = 999;
        let sameToneR = 0, sameToneG = 0, sameToneB = 0, sameToneCnt = 0;
        const rad = 5;
        const startY = Math.max(0, y - rad);
        const endY = Math.min(h - 1, y + rad);
        const startX = Math.max(0, x - rad);
        const endX = Math.min(w - 1, x + rad);

        for (let ny = startY; ny <= endY; ny++) {
          const nRow = ny * w;
          for (let nx = startX; nx <= endX; nx++) {
            const nIdx = nRow + nx;
            if (tempAlphas[nIdx] >= 220) {
              const npIdx = nIdx * 4;
              const nr = copyPixels[npIdx], ng = copyPixels[npIdx + 1], nb = copyPixels[npIdx + 2];
              fgR += nr;
              fgG += ng;
              fgB += nb;
              fgCount++;
              const d = Math.hypot(r - nr, g - ng, b - nb);
              if (d < minSolidFgDist) minSolidFgDist = d;
              if (d <= 45) {
                sameToneR += nr; sameToneG += ng; sameToneB += nb; sameToneCnt++;
              }
            }
          }
        }

        const avgFgR = fgCount > 0 ? fgR / fgCount : r;
        const avgFgG = fgCount > 0 ? fgG / fgCount : g;
        const avgFgB = fgCount > 0 ? fgB / fgCount : b;
        const distToFg = Math.min(minSolidFgDist, fgCount > 0 ? Math.hypot(r - avgFgR, g - avgFgG, b - avgFgB) : 999);

        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const isLowerWhiteGarment =
          y >= shirtProtectStartY &&
          maxC >= 132 &&
          (maxC - minC) <= 82 &&
          alphaVal >= 95 &&
          fgCount >= 2 &&
          distToFg <= 38;
        const isLowerGarmentEdge = !isUpper && fgCount >= 5 && alphaVal >= 85 && (distToFg <= 34 || distToBg > 18);
        const bgMatchThresh = Math.max(20, Math.min(38, secStd * 1.55));
        if (
          !isLikelyRealSkin &&
          !isLowerWhiteGarment &&
          !isLowerGarmentEdge &&
          alphaVal < (isUpper ? 155 : (fgCount >= 6 ? 90 : 125)) &&
          distToBg <= bgMatchThresh
        ) {
          if (fgCount === 0 || (distToBg < distToFg * 0.72 && distToFg > 24)) {
            pixels[pIdx + 3] = 0;
            continue;
          }
        }

        // Green Spill Suppression (Despill) to eliminate green screen reflections
        if (g > r && g > b) {
          pixels[pIdx + 1] = Math.max(r, b);
        }

        // Universal Background Halo De-contamination (removes white, blue, green, grey, or dark halos without tainting white/check shirts)
        const toneRefR = sameToneCnt >= 2 ? sameToneR / sameToneCnt : avgFgR;
        const toneRefG = sameToneCnt >= 2 ? sameToneG / sameToneCnt : avgFgG;
        const toneRefB = sameToneCnt >= 2 ? sameToneB / sameToneCnt : avgFgB;
        if (!isLowerWhiteGarment && fgCount > 0 && pixels[pIdx + 3] > 0) {
          const fgBgDist = Math.hypot(toneRefR - secBgR, toneRefG - secBgG, toneRefB - secBgB);
          if (fgBgDist > 22 && distToFg > 14) {
            const aNorm = Math.max(0.25, pixels[pIdx + 3] / 255.0);
            const unmixR = Math.max(0, Math.min(255, (r - secBgR * (1 - aNorm)) / aNorm));
            const unmixG = Math.max(0, Math.min(255, (g - secBgG * (1 - aNorm)) / aNorm));
            const unmixB = Math.max(0, Math.min(255, (b - secBgB * (1 - aNorm)) / aNorm));

            // Keep unmixed RGB anchored near authentic same-tone foreground color so no dark/neon spots appear
            const anchorR = Math.max(Math.min(r, toneRefR) - 10, Math.min(Math.max(r, toneRefR) + 10, unmixR));
            const anchorG = Math.max(Math.min(g, toneRefG) - 10, Math.min(Math.max(g, toneRefG) + 10, unmixG));
            const anchorB = Math.max(Math.min(b, toneRefB) - 10, Math.min(Math.max(b, toneRefB) + 10, unmixB));

            const blend = Math.min(0.92, (1 - aNorm * 0.55) * Math.min(1.0, distToFg / Math.max(26, fgBgDist)));
            pixels[pIdx] = Math.round(r * (1 - blend) + anchorR * blend);
            pixels[pIdx + 1] = Math.round(g * (1 - blend) + anchorG * blend);
            pixels[pIdx + 2] = Math.round(b * (1 - blend) + anchorB * blend);
          }
        }
      }
    }
  }
}

/**
 * Applies Sub-Pixel Gaussian Anti-Aliasing to boundary edges to eliminate any jagged/pixelated staircases.
 */
function antiAliasBoundaryEdges(pixels: Uint8ClampedArray, w: number, h: number) {
  const total = w * h;
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = pixels[i * 4 + 3];
  }

  for (let y = 1; y < h - 1; y++) {
    const rowOffset = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = rowOffset + x;
      const a = alphaCopy[idx];

      // Smooth transition pixels on the perimeter (between 5 and 245)
      if (a > 5 && a < 245) {
        const a11 = alphaCopy[(y - 1) * w + x - 1];
        const a12 = alphaCopy[(y - 1) * w + x];
        const a13 = alphaCopy[(y - 1) * w + x + 1];
        const a21 = alphaCopy[rowOffset + x - 1];
        const a22 = a;
        const a23 = alphaCopy[rowOffset + x + 1];
        const a31 = alphaCopy[(y + 1) * w + x - 1];
        const a32 = alphaCopy[(y + 1) * w + x];
        const a33 = alphaCopy[(y + 1) * w + x + 1];

        const smoothA = (
          a11 * 1 + a12 * 2 + a13 * 1 +
          a21 * 2 + a22 * 4 + a23 * 2 +
          a31 * 1 + a32 * 2 + a33 * 1
        ) / 16;

        pixels[(idx * 4) + 3] = Math.round(smoothA);
      }
    }
  }
}

/**
 * Applies Adaptive Micro-Contrast & Detail Enhancement to the foreground subject
 * to make facial features, eyes, hair, and textures ultra crisp and high definition (HD).
 */
function enhanceForegroundSubjectClarity(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  clarityFactor = 0.25
) {
  const copy = new Uint8ClampedArray(pixels);

  for (let y = 1; y < h - 1; y++) {
    const rowOffset = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = (rowOffset + x) * 4;
      const alpha = pixels[idx + 3];
      if (alpha < 220) continue; // Skip boundary and transition pixels completely

      const iUp = ((y - 1) * w + x) * 4;
      const iDown = ((y + 1) * w + x) * 4;
      const iLeft = (rowOffset + x - 1) * 4;
      const iRight = (rowOffset + x + 1) * 4;

      // Prevent sharpening anywhere near transparency (preserves hair perimeter without dark ringing):
      if (copy[iUp + 3] < 220 || copy[iDown + 3] < 220 || copy[iLeft + 3] < 220 || copy[iRight + 3] < 220) {
        continue;
      }

      const blurR = (copy[iUp] + copy[iDown] + copy[iLeft] + copy[iRight]) * 0.25;
      const blurG = (copy[iUp + 1] + copy[iDown + 1] + copy[iLeft + 1] + copy[iRight + 1]) * 0.25;
      const blurB = (copy[iUp + 2] + copy[iDown + 2] + copy[iLeft + 2] + copy[iRight + 2]) * 0.25;

      const diffR = copy[idx] - blurR;
      const diffG = copy[idx + 1] - blurG;
      const diffB = copy[idx + 2] - blurB;

      const weight = (alpha / 255.0) * clarityFactor;
      pixels[idx] = Math.max(0, Math.min(255, Math.round(copy[idx] + diffR * weight)));
      pixels[idx + 1] = Math.max(0, Math.min(255, Math.round(copy[idx + 1] + diffG * weight)));
      pixels[idx + 2] = Math.max(0, Math.min(255, Math.round(copy[idx + 2] + diffB * weight)));
    }
  }
}

/**
 * Specialized pass to eliminate residual background halos and color bleed
 * in the crevices and gaps above/below ears, jawline, chin, and neck-to-head boundary.
 */
function cleanEarNeckHeadHalosPass(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  bgModels?: BackgroundModels
) {
  const total = w * h;
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = pixels[i * 4 + 3];
  }

  // 1. Locate subject bounding box and center of mass
  let minSubjX = w, maxSubjX = 0, minY = h, maxY = 0;
  let massCenterX = 0, subjCount = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphaCopy[row + x] > 30) {
        if (x < minSubjX) minSubjX = x;
        if (x > maxSubjX) maxSubjX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        massCenterX += x;
        subjCount++;
      }
    }
  }

  if (subjCount < 100 || maxY <= minY) return;

  const coreCenterX = Math.round(massCenterX / subjCount);
  const subjH = maxY - minY;
  const subjW = Math.max(1, maxSubjX - minSubjX);

  // Anatomical vertical bounds: full ear, cheek, jawline & neck down to shoulder junction
  const earStartY = Math.floor(minY + subjH * 0.14);
  const earEndY = Math.floor(minY + subjH * 0.53);
  const maxHeadNeckY = Math.min(h - 1, Math.floor(minY + subjH * 0.54));

  // Sample authentic face/neck + left-side shadowed cheek/jaw/neck skin so under-ear skin is never cut
  let skinR = 0, skinG = 0, skinB = 0, skinCount = 0;
  let sideSkinR = 0, sideSkinG = 0, sideSkinB = 0, sideSkinCount = 0;
  for (let y = Math.floor(minY + subjH * 0.22); y <= Math.floor(minY + subjH * 0.50); y += 2) {
    const row = y * w;
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.11)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.11)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 220) {
        const p = idx * 4;
        const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        if (r > g && r > b && (r - b) >= 12) {
          skinR += r;
          skinG += g;
          skinB += b;
          skinCount++;
        }
      }
    }
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.20)); x < Math.max(0, coreCenterX - Math.round(subjW * 0.06)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 230) {
        const p = idx * 4;
        const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        if (r > g && g >= b * 0.85 && (r - b) >= 10) {
          sideSkinR += r;
          sideSkinG += g;
          sideSkinB += b;
          sideSkinCount++;
        }
      }
    }
  }
  const avgSkinR = skinCount > 0 ? skinR / skinCount : 0;
  const avgSkinG = skinCount > 0 ? skinG / skinCount : 0;
  const avgSkinB = skinCount > 0 ? skinB / skinCount : 0;
  const avgSideSkinR = sideSkinCount > 0 ? sideSkinR / sideSkinCount : avgSkinR;
  const avgSideSkinG = sideSkinCount > 0 ? sideSkinG / sideSkinCount : avgSkinG;
  const avgSideSkinB = sideSkinCount > 0 ? sideSkinB / sideSkinCount : avgSkinB;

  // Sample local exterior background per row on left side
  const bgMeanR = bgModels?.global?.meanR ?? 245;
  const bgMeanG = bgModels?.global?.meanG ?? 245;
  const bgMeanB = bgModels?.global?.meanB ?? 245;

  const leftRowBgR = new Float32Array(h);
  const leftRowBgG = new Float32Array(h);
  const leftRowBgB = new Float32Array(h);
  for (let y = 0; y <= maxHeadNeckY; y++) {
    let sR = 0, sG = 0, sB = 0, sCnt = 0;
    for (let sy = Math.max(0, y - 5); sy <= Math.min(h - 1, y + 5); sy += 2) {
      const sRow = sy * w;
      let firstFg = coreCenterX;
      for (let x = 0; x < coreCenterX; x++) {
        if (alphaCopy[sRow + x] > 25) { firstFg = x; break; }
      }
      const x0 = Math.max(0, firstFg - 32);
      const x1 = Math.max(0, firstFg - 2);
      for (let x = x0; x < x1; x += 2) {
        const idx = sRow + x;
        if (alphaCopy[idx] <= 15) {
          const p = idx * 4;
          sR += pixels[p]; sG += pixels[p + 1]; sB += pixels[p + 2];
          sCnt++;
        }
      }
    }
    leftRowBgR[y] = sCnt >= 4 ? sR / sCnt : bgMeanR;
    leftRowBgG[y] = sCnt >= 4 ? sG / sCnt : bgMeanG;
    leftRowBgB[y] = sCnt >= 4 ? sB / sCnt : bgMeanB;
  }

  // Run 3 iterative inward passes so multi-pixel halo patches next to the left cheek, jawline & neck peel cleanly
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i <= maxHeadNeckY * w + w - 1 && i < total; i++) {
      alphaCopy[i] = pixels[i * 4 + 3];
    }

    for (let y = 0; y <= maxHeadNeckY; y++) {
      const rowOffset = y * w;
      const isEarLevel = y >= earStartY && y <= earEndY;

      for (let x = 0; x < w; x++) {
        const idx = rowOffset + x;
        const pIdx = idx * 4;
        const a = alphaCopy[idx];

        if (a === 0 || a >= 250) continue; // Skip fully transparent or solid subject core

        const isLeftEarZone = isEarLevel && (x < coreCenterX);
        const isRightEarZone = isEarLevel && (x >= coreCenterX) && y <= Math.floor(minY + subjH * 0.44);

        // Sample a 5x5 neighborhood around this boundary pixel
        let transparentCount = 0;
        let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;

        const startY = Math.max(0, y - 2);
        const endY = Math.min(h - 1, y + 2);
        const startX = Math.max(0, x - 2);
        const endX = Math.min(w - 1, x + 2);

        for (let ny = startY; ny <= endY; ny++) {
          const nRow = ny * w;
          for (let nx = startX; nx <= endX; nx++) {
            const nIdx = nRow + nx;
            const nA = alphaCopy[nIdx];
            const npIdx = nIdx * 4;
            if (nA <= 10) {
              transparentCount++;
              bgR += pixels[npIdx];
              bgG += pixels[npIdx + 1];
              bgB += pixels[npIdx + 2];
              bgCount++;
            }
          }
        }

        const curR = pixels[pIdx];
        const curG = pixels[pIdx + 1];
        const curB = pixels[pIdx + 2];
        const curLum = 0.299 * curR + 0.587 * curG + 0.114 * curB;

        // Effective background color reference
        const refBgR = bgCount > 0 ? (bgR / bgCount) : (isLeftEarZone ? leftRowBgR[y] : bgMeanR);
        const refBgG = bgCount > 0 ? (bgG / bgCount) : (isLeftEarZone ? leftRowBgG[y] : bgMeanG);
        const refBgB = bgCount > 0 ? (bgB / bgCount) : (isLeftEarZone ? leftRowBgB[y] : bgMeanB);
        const refBgLum = 0.299 * refBgR + 0.587 * refBgG + 0.114 * refBgB;

        const distToLocalBg = Math.hypot(curR - refBgR, curG - refBgG, curB - refBgB);
        const distToRowBg = isLeftEarZone
          ? Math.hypot(curR - leftRowBgR[y], curG - leftRowBgG[y], curB - leftRowBgB[y])
          : distToLocalBg;
        const distToBg = Math.min(distToLocalBg, distToRowBg);
        const chromaDist = Math.abs((curR - curG) - (refBgR - refBgG)) + Math.abs((curG - curB) - (refBgG - refBgB));
        const lumRatio = curLum / Math.max(20, refBgLum);

        // Distinguish real face/cheek/neck/ear/shadowed-jawline skin from warm/beige background wall or blended halo fringes
        const isWarmTone = (curR > curG && curG >= curB * 0.85 && (curR - curB) >= 10);
        const distCenterSkin = skinCount > 0 ? Math.hypot(curR - avgSkinR, curG - avgSkinG, curB - avgSkinB) : 999;
        const distSideSkin = (sideSkinCount > 0 || skinCount > 0)
          ? Math.hypot(curR - avgSideSkinR, curG - avgSideSkinG, curB - avgSideSkinB)
          : 999;
        const distToSkin = Math.min(distCenterSkin, distSideSkin);
        const hasWarmVsBg = (curR - curB) - (refBgR - refBgB) >= 8;
        const isLikelyRealSkin =
          isWarmTone &&
          ((skinCount === 0 && sideSkinCount === 0)
            ? distToBg > 20
            : (distToSkin < distToBg * 0.96 || (distToSkin <= 32 && distToBg > 18) || (hasWarmVsBg && distToBg > 22)));
        const isDarkHair = curLum < 82 && refBgLum > 110 && distToBg > 24;
        const isNeutralBgColor = Math.abs(curR - curG) <= 16 && Math.abs(curG - curB) <= 16 && !hasWarmVsBg;

        // 1. Left Ear, Cheek, Jawline & Neck Specialized Background Cleaning
        if (isLeftEarZone) {
          // Any faint edge pixel or boundary fringe touching transparency
          if (transparentCount >= 3 && a < 140 && !(isLikelyRealSkin && a >= 85) && !isDarkHair) {
            pixels[pIdx + 3] = 0;
            continue;
          }

          // Crevice / pocket between ear and hair or cheek/jaw and neck
          if (transparentCount >= 5 && a < 165 && !(isLikelyRealSkin && a >= 95) && !isDarkHair) {
            pixels[pIdx + 3] = 0;
            continue;
          }

          // Close color match to background (overrides false warm-skin guard when clearly closer to bg!)
          if (distToBg < 34 && a < 210 && (!isLikelyRealSkin || ((skinCount > 0 || sideSkinCount > 0) && distToBg < distToSkin * 0.62))) {
            pixels[pIdx + 3] = 0;
            continue;
          }

          // Neutral / shaded / shadow-chroma background patch next to cheek, ear or neck (never cut warm shadowed skin)
          if (
            !isLikelyRealSkin &&
            !hasWarmVsBg &&
            !isDarkHair &&
            transparentCount >= 1 &&
            a < 190 &&
            (isNeutralBgColor || distToBg < 44 || (chromaDist <= 14 && lumRatio >= 0.52 && lumRatio <= 1.14 && distToBg <= 52))
          ) {
            pixels[pIdx + 3] = 0;
            continue;
          }

          // High luminance white edge fringe next to cheek/ear/neck
          if (curLum > 165 && !isLikelyRealSkin && transparentCount >= 1 && a < 145) {
            pixels[pIdx + 3] = 0;
            continue;
          }
        }

        // 2. Right Ear Area Background Cleaning
        else if (isRightEarZone) {
          if (transparentCount >= 4 && a < 110) {
            pixels[pIdx + 3] = 0;
            continue;
          }
          if (distToBg < 30 && a < 180 && !isLikelyRealSkin) {
            pixels[pIdx + 3] = 0;
            continue;
          }
          if (!isLikelyRealSkin && isNeutralBgColor && transparentCount >= 2 && a < 160) {
            pixels[pIdx + 3] = 0;
            continue;
          }
        }

        // 3. General Head/Hair/Crown Area
        else {
          if (transparentCount >= 6 && a < 70) {
            pixels[pIdx + 3] = 0;
            continue;
          }
          if (distToBg < 25 && a < 80) {
            pixels[pIdx + 3] = 0;
            continue;
          }
        }

        // Green Spill Suppression (Despill) to eliminate green screen halos
        if (pixels[pIdx + 3] > 0 && a < 250) {
          if (curG > curR && curG > curB) {
            pixels[pIdx + 1] = Math.max(curR, curB);
          }
        }
      }
    }
  }
}

/**
 * Dedicated color- & gradient-guided cleaner for the concave background pocket
 * on the left side between the ear, jawline/neck, and top of the left shoulder.
 * Clears trapped solid/semi-transparent wall patches, shadow webs, and background bridges
 * while strictly protecting ear skin, hair, neck skin, and shirt/shoulder contours.
 */
function cleanLeftEarToShoulderPocket(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  bgModels?: BackgroundModels,
  hasOriginalRgb = true
) {
  const total = w * h;
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = pixels[i * 4 + 3];
  }

  // 1. Locate subject bounding box and center of mass
  let minSubjX = w, maxSubjX = 0, minY = h, maxY = 0;
  let massCenterX = 0, subjCount = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphaCopy[row + x] > 30) {
        if (x < minSubjX) minSubjX = x;
        if (x > maxSubjX) maxSubjX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        massCenterX += x;
        subjCount++;
      }
    }
  }

  if (subjCount < 150 || maxY <= minY || maxSubjX <= minSubjX) return;

  const coreCenterX = Math.round(massCenterX / subjCount);
  const subjH = maxY - minY;
  const subjW = maxSubjX - minSubjX;

  // Detect right-side neck minimum to estimate where the shoulder top actually sits
  let neckY = Math.floor(minY + subjH * 0.46);
  let minRightDist = Infinity;
  for (let y = Math.floor(minY + subjH * 0.28); y <= Math.floor(minY + subjH * 0.60); y++) {
    const row = y * w;
    let rEdge = -1;
    for (let x = w - 1; x >= coreCenterX; x--) {
      if (alphaCopy[row + x] >= 40) {
        rEdge = x;
        break;
      }
    }
    if (rEdge !== -1) {
      const d = rEdge - coreCenterX;
      if (d < minRightDist) {
        minRightDist = d;
        neckY = y;
      }
    }
  }

  // Left cheek-ear-neck-to-shoulder concave bay bounds (sweeps full diagonal slope down to outer shoulder turn)
  const pocketTopY = Math.max(1, Math.floor(minY + subjH * 0.18));
  const pocketBotY = Math.min(
    h - 2,
    Math.max(pocketTopY + 10, Math.min(Math.floor(minY + subjH * 0.78), neckY + Math.round(subjH * 0.30)))
  );
  const pocketMaxX = Math.min(w - 2, Math.round(coreCenterX - subjW * 0.05));

  if (pocketBotY <= pocketTopY || pocketMaxX <= 2) return;

  // 2. Sample skin reference (center face + left shadowed cheek/jaw/neck) and shirt reference (upper center chest)
  let skinR = 0, skinG = 0, skinB = 0, skinCount = 0;
  let sideSkinR = 0, sideSkinG = 0, sideSkinB = 0, sideSkinCount = 0;
  for (let y = Math.floor(minY + subjH * 0.24); y <= Math.floor(minY + subjH * 0.50); y += 2) {
    const row = y * w;
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.10)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.10)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 220) {
        const pIdx = idx * 4;
        const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
        if (r > g && r > b && (r - b) >= 12) {
          skinR += r;
          skinG += g;
          skinB += b;
          skinCount++;
        }
      }
    }
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.20)); x < Math.max(0, coreCenterX - Math.round(subjW * 0.06)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 230) {
        const pIdx = idx * 4;
        const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
        if (r > g && g >= b * 0.85 && (r - b) >= 10) {
          sideSkinR += r;
          sideSkinG += g;
          sideSkinB += b;
          sideSkinCount++;
        }
      }
    }
  }
  const avgSkinR = skinCount > 0 ? skinR / skinCount : 0;
  const avgSkinG = skinCount > 0 ? skinG / skinCount : 0;
  const avgSkinB = skinCount > 0 ? skinB / skinCount : 0;
  const avgSideSkinR = sideSkinCount > 0 ? sideSkinR / sideSkinCount : avgSkinR;
  const avgSideSkinG = sideSkinCount > 0 ? sideSkinG / sideSkinCount : avgSkinG;
  const avgSideSkinB = sideSkinCount > 0 ? sideSkinB / sideSkinCount : avgSkinB;

  let shirtR = 0, shirtG = 0, shirtB = 0, shirtCount = 0;
  const shirtSampleTop = Math.min(h - 1, Math.max(neckY + Math.round(subjH * 0.06), Math.floor(minY + subjH * 0.54)));
  const shirtSampleBot = Math.min(h - 1, Math.floor(minY + subjH * 0.80));
  for (let y = shirtSampleTop; y <= shirtSampleBot; y += 2) {
    const row = y * w;
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.16)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.16)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 220) {
        const pIdx = idx * 4;
        shirtR += pixels[pIdx];
        shirtG += pixels[pIdx + 1];
        shirtB += pixels[pIdx + 2];
        shirtCount++;
      }
    }
  }
  const avgShirtR = shirtCount > 0 ? shirtR / shirtCount : 128;
  const avgShirtG = shirtCount > 0 ? shirtG / shirtCount : 128;
  const avgShirtB = shirtCount > 0 ? shirtB / shirtCount : 128;
  const avgShirtLum = 0.299 * avgShirtR + 0.587 * avgShirtG + 0.114 * avgShirtB;

  // 3. Build per-row left exterior background model
  const rowBgR = new Float32Array(h);
  const rowBgG = new Float32Array(h);
  const rowBgB = new Float32Array(h);
  const rowBgTol = new Float32Array(h);

  const globalBgR = bgModels?.global?.meanR ?? 245;
  const globalBgG = bgModels?.global?.meanG ?? 245;
  const globalBgB = bgModels?.global?.meanB ?? 245;

  let pocketBgSumR = 0, pocketBgSumG = 0, pocketBgSumB = 0, pocketBgCount = 0;
  for (let y = pocketTopY; y <= pocketBotY; y += 2) {
    const row = y * w;
    let firstFg = pocketMaxX;
    for (let x = 0; x < pocketMaxX; x++) {
      if (alphaCopy[row + x] > 25) {
        firstFg = x;
        break;
      }
    }
    const sampleStart = Math.max(0, firstFg - 40);
    const sampleEnd = Math.max(0, firstFg - 2);
    for (let x = sampleStart; x < sampleEnd; x += 2) {
      const idx = row + x;
      const a = alphaCopy[idx];
      if ((hasOriginalRgb && a <= 20) || (!hasOriginalRgb && a > 5 && a < 140)) {
        const pIdx = idx * 4;
        pocketBgSumR += pixels[pIdx];
        pocketBgSumG += pixels[pIdx + 1];
        pocketBgSumB += pixels[pIdx + 2];
        pocketBgCount++;
      }
    }
    if (!hasOriginalRgb && firstFg < pocketMaxX) {
      for (let x = firstFg; x < Math.min(pocketMaxX, firstFg + 3); x++) {
        const idx = row + x;
        const a = alphaCopy[idx];
        if (a > 5 && a < 185) {
          const pIdx = idx * 4;
          pocketBgSumR += pixels[pIdx];
          pocketBgSumG += pixels[pIdx + 1];
          pocketBgSumB += pixels[pIdx + 2];
          pocketBgCount++;
        }
      }
    }
  }

  const baseBgR = pocketBgCount >= 10 ? pocketBgSumR / pocketBgCount : globalBgR;
  const baseBgG = pocketBgCount >= 10 ? pocketBgSumG / pocketBgCount : globalBgG;
  const baseBgB = pocketBgCount >= 10 ? pocketBgSumB / pocketBgCount : globalBgB;

  for (let y = pocketTopY; y <= pocketBotY; y++) {
    let sR = 0, sG = 0, sB = 0, sCnt = 0;
    let maxDev = 10;
    const y0 = Math.max(0, y - 8);
    const y1 = Math.min(h - 1, y + 8);

    for (let sy = y0; sy <= y1; sy += 2) {
      const row = sy * w;
      let firstFg = pocketMaxX;
      for (let x = 0; x < pocketMaxX; x++) {
        if (alphaCopy[row + x] > 25) {
          firstFg = x;
          break;
        }
      }
      const xStart = Math.max(0, firstFg - 36);
      const xEnd = Math.max(0, firstFg - 2);
      for (let x = xStart; x < xEnd; x += 2) {
        const idx = row + x;
        const a = alphaCopy[idx];
        if ((hasOriginalRgb && a <= 20) || (!hasOriginalRgb && a > 5 && a < 140)) {
          const pIdx = idx * 4;
          sR += pixels[pIdx];
          sG += pixels[pIdx + 1];
          sB += pixels[pIdx + 2];
          sCnt++;
        }
      }
    }

    if (sCnt >= 6) {
      const mR = sR / sCnt;
      const mG = sG / sCnt;
      const mB = sB / sCnt;
      rowBgR[y] = mR;
      rowBgG[y] = mG;
      rowBgB[y] = mB;

      for (let sy = y0; sy <= y1; sy += 3) {
        const row = sy * w;
        for (let x = 0; x < Math.min(minSubjX, 30); x += 3) {
          const idx = row + x;
          const a = alphaCopy[idx];
          if ((hasOriginalRgb && a <= 20) || (!hasOriginalRgb && a > 5 && a < 140)) {
            const pIdx = idx * 4;
            const d = Math.hypot(pixels[pIdx] - mR, pixels[pIdx + 1] - mG, pixels[pIdx + 2] - mB);
            if (d > maxDev && d < 35) maxDev = d;
          }
        }
      }
      rowBgTol[y] = Math.max(14, Math.min(26, maxDev * 1.1));
    } else {
      rowBgR[y] = baseBgR;
      rowBgG[y] = baseBgG;
      rowBgB[y] = baseBgB;
      rowBgTol[y] = 18;
    }
  }

  // 4. Surgical color- & texture-guided 4-way BFS flood fill from exterior left background
  const visited = new Uint8Array(total);
  const cleared = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  let clearedCount = 0;

  for (let y = pocketTopY; y <= pocketBotY; y++) {
    const row = y * w;
    for (let x = 0; x < pocketMaxX; x++) {
      const idx = row + x;
      if (alphaCopy[idx] <= 25) {
        visited[idx] = 1;
        queue[tail++] = idx;
      } else {
        break;
      }
    }
  }

  for (let y = pocketTopY; y <= pocketBotY; y++) {
    const row = y * w;
    for (let x = 0; x < pocketMaxX; x++) {
      const idx = row + x;
      if (visited[idx] === 0 && alphaCopy[idx] <= 20) {
        const hasVisitedNeighbor =
          (x > 0 && visited[idx - 1] === 1) ||
          (y > pocketTopY && visited[idx - w] === 1) ||
          (y < pocketBotY && visited[idx + w] === 1);
        if (hasVisitedNeighbor) {
          visited[idx] = 1;
          queue[tail++] = idx;
        }
      }
    }
  }

  const shoulderProtectionStartY = Math.max(neckY + Math.round(subjH * 0.05), Math.floor(minY + subjH * 0.49));
  // Compute diagonal column-wise solid shoulder top so background sitting ABOVE the sloping left shoulder stays cleanable!
  const colShoulderTopY = new Int32Array(w).fill(h);
  const colSearchTop = Math.max(1, neckY + 2);
  const colSearchBot = Math.min(h - 4, Math.floor(minY + subjH * 0.88));
  for (let x = minSubjX; x <= pocketMaxX; x++) {
    for (let y = colSearchTop; y <= colSearchBot; y++) {
      const i0 = y * w + x;
      if (
        alphaCopy[i0] >= 185 &&
        alphaCopy[i0 + w] >= 185 &&
        alphaCopy[i0 + w * 2] >= 185
      ) {
        const p0 = i0 * 4;
        const dRowBg = Math.hypot(pixels[p0] - rowBgR[y], pixels[p0 + 1] - rowBgG[y], pixels[p0 + 2] - rowBgB[y]);
        if (alphaCopy[i0] >= 205 || dRowBg > 16) {
          colShoulderTopY[x] = y;
          break;
        }
      }
    }
  }

  while (head < tail) {
    const curr = queue[head++];
    const cy = Math.floor(curr / w);
    const cPIdx = curr * 4;
    const currIsSeedBg = alphaCopy[curr] <= 25;
    const cR = currIsSeedBg && !hasOriginalRgb ? rowBgR[cy] : pixels[cPIdx];
    const cG = currIsSeedBg && !hasOriginalRgb ? rowBgG[cy] : pixels[cPIdx + 1];
    const cB = currIsSeedBg && !hasOriginalRgb ? rowBgB[cy] : pixels[cPIdx + 2];

    const neighbors = [
      cy > pocketTopY ? curr - w : -1,
      cy < pocketBotY ? curr + w : -1,
      (curr % w) > 0 ? curr - 1 : -1,
      (curr % w) < pocketMaxX ? curr + 1 : -1,
    ];

    for (const nIdx of neighbors) {
      if (nIdx === -1 || visited[nIdx] === 1) continue;

      const ny = Math.floor(nIdx / w);
      const nx = nIdx % w;
      const nA = alphaCopy[nIdx];

      if (nA <= 25) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
        continue;
      }

      const npIdx = nIdx * 4;
      const r = pixels[npIdx];
      const g = pixels[npIdx + 1];
      const b = pixels[npIdx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      const bgR = rowBgR[ny];
      const bgG = rowBgG[ny];
      const bgB = rowBgB[ny];
      const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
      const tol = rowBgTol[ny];

      const distToRowBg = Math.hypot(r - bgR, g - bgG, b - bgB);
      const stepDiff = Math.hypot(r - cR, g - cG, b - cB);

      // Guard 1: Protect dark hair & eyebrows/shadows
      if (lum < 85 && bgLum > 110 && distToRowBg > 24) {
        continue;
      }

      // Guard 2: Protect authentic warm ear/cheek/jaw/neck skin (including shadowed skin under ear)
      const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 10;
      const distCenterSkin = skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
      const distSideSkin = (sideSkinCount > 0 || skinCount > 0)
        ? Math.hypot(r - avgSideSkinR, g - avgSideSkinG, b - avgSideSkinB)
        : 999;
      const distToSkin = Math.min(distCenterSkin, distSideSkin);
      const hasWarmVsBg = (r - b) - (bgR - bgB) >= 8;
      const isLikelyRealSkin =
        isWarmSkin &&
        ((skinCount === 0 && sideSkinCount === 0)
          ? distToRowBg > 18
          : (distToSkin < distToRowBg * 0.98 || (distToSkin <= 32 && distToRowBg > 16) || (hasWarmVsBg && distToRowBg > 20)));
      if (isLikelyRealSkin && nA >= 90) {
        continue;
      }

      // Local 3x3 luminance variance check (protects textured ear/hair/check fabric)
      let localVar = 0;
      let varCnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const vy = ny + dy;
        if (vy < 0 || vy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const vx = nx + dx;
          if (vx < 0 || vx >= w) continue;
          const vIdx = (vy * w + vx) * 4;
          const vLum = 0.299 * pixels[vIdx] + 0.587 * pixels[vIdx + 1] + 0.114 * pixels[vIdx + 2];
          localVar += Math.abs(lum - vLum);
          varCnt++;
        }
      }
      const avgLocalVar = varCnt > 0 ? localVar / varCnt : 0;

      // Guard 3: Protect genuine shoulder / garment contours (including tone-on-tone clothes!)
      const colTopY = colShoulderTopY[nx];
      const isBelowDiagonalShoulderTop = colTopY < h
        ? ny >= colTopY
        : ny >= shoulderProtectionStartY + 8;
      const isAtShoulderLevel = ny >= shoulderProtectionStartY && isBelowDiagonalShoulderTop;
      if (isAtShoulderLevel) {
        if (nA >= 165) continue;
        if (shirtCount > 0) {
          const distToShirt = Math.hypot(r - avgShirtR, g - avgShirtG, b - avgShirtB);
          if (distToShirt < 32 && nA >= 90) continue;
          if (avgShirtLum > 135 && nA >= 150 && (avgLocalVar >= 4.0 || distToRowBg > 16)) continue;
        }
      }

      // Sample nearby solid interior subject color (check BOTH right toward neck/collar AND down toward shoulder)
      let localFgR = 0, localFgG = 0, localFgB = 0, localFgCount = 0;
      if (nA < 220) {
        for (let dy = -2; dy <= 10; dy += 2) {
          const fy = ny + dy;
          if (fy < 0 || fy >= h) continue;
          for (let dx = -1; dx <= 10; dx += 2) {
            if (dy <= 0 && dx <= 0) continue;
            const fx = nx + dx;
            if (fx < 0 || fx >= w) continue;
            const fIdx = fy * w + fx;
            if (alphaCopy[fIdx] >= 225) {
              const fpIdx = fIdx * 4;
              localFgR += pixels[fpIdx];
              localFgG += pixels[fpIdx + 1];
              localFgB += pixels[fpIdx + 2];
              localFgCount++;
            }
          }
        }
      }
      const distToLocalFg = localFgCount > 0
        ? Math.hypot(r - localFgR / localFgCount, g - localFgG / localFgCount, b - localFgB / localFgCount)
        : 999;

      // Shadow-invariant wall chroma check (catches background shadowed by cheek/neck/shirt collar!)
      const chromaDistToRowBg = Math.abs((r - g) - (bgR - bgG)) + Math.abs((g - b) - (bgG - bgB));
      const lumRatioToRowBg = lum / Math.max(20, bgLum);
      const distToShirtCol = shirtCount > 0 ? Math.hypot(r - avgShirtR, g - avgShirtG, b - avgShirtB) : 999;
      const matchesShirt = shirtCount > 0 && distToShirtCol < 28 && (distToRowBg > 16 || ny >= shoulderProtectionStartY);

      // Acceptance criteria for background & shadowed pocket beside left cheek/neck/collar:
      const isCloserToBgThanFg = localFgCount > 0 && distToRowBg < distToLocalFg * 0.85 && distToRowBg <= 46;
      const isFaintUpperHalo =
        nA < 135 &&
        !isLikelyRealSkin &&
        !matchesShirt &&
        stepDiff <= 28 &&
        (distToRowBg <= Math.min(50, tol * 2.0) || isCloserToBgThanFg || nA < 90);
      const isShadowedCollarWall =
        hasOriginalRgb &&
        !isAtShoulderLevel &&
        ny < shoulderProtectionStartY &&
        !isLikelyRealSkin &&
        !hasWarmVsBg &&
        !matchesShirt &&
        nA < (ny < neckY ? 200 : 215) &&
        distToRowBg <= 46 &&
        avgLocalVar < 6.0 &&
        chromaDistToRowBg <= 13 &&
        lumRatioToRowBg >= 0.52 &&
        lumRatioToRowBg <= 1.14 &&
        stepDiff <= 16;
      const isSemiTransparentBridge =
        !isAtShoulderLevel &&
        nA < 165 &&
        !matchesShirt &&
        stepDiff <= 22 &&
        (distToRowBg <= Math.min(44, tol * 1.7) || isCloserToBgThanFg || nA < 90);
      const isMedTrappedBg =
        hasOriginalRgb &&
        ny < colTopY &&
        nA >= 165 &&
        nA < 225 &&
        distToRowBg <= Math.min(30, tol * 1.35) &&
        stepDiff <= 14 &&
        avgLocalVar < 7.0;
      const isSolidFlatTrappedBg =
        hasOriginalRgb &&
        ny < shoulderProtectionStartY &&
        ny < colTopY &&
        nA >= 225 &&
        distToRowBg <= 22 &&
        stepDiff <= 10 &&
        avgLocalVar < 5.5;

      if (isFaintUpperHalo || isShadowedCollarWall || isSemiTransparentBridge || isMedTrappedBg || isSolidFlatTrappedBg) {
        visited[nIdx] = 1;
        cleared[nIdx] = 1;
        pixels[npIdx + 3] = 0;
        queue[tail++] = nIdx;
        clearedCount++;
      }
    }
  }

  // Safety rollback guard: if flood-fill cleared more than 10% of total subject, revert to preserve subject 100%
  if (clearedCount > subjCount * 0.10) {
    for (let i = 0; i < total; i++) {
      if (cleared[i] === 1) {
        pixels[i * 4 + 3] = alphaCopy[i];
      }
    }
    return;
  }

  // 4b. Enclosed Left Cheek, Jawline, Neck & Above-Shoulder Pocket Cleaner:
  // Catches any trapped wall/halo pocket beside the cheek, neck, collar, or diagonally ABOVE the left shoulder top
  // that had a thin rim blocking the exterior flood-fill.
  const collarPocketTop = pocketTopY;
  const collarPocketBot = Math.min(pocketBotY, Math.floor(minY + subjH * 0.74));
  const rowSolidLeftBound = new Int32Array(h).fill(pocketMaxX);
  for (let y = collarPocketTop; y < collarPocketBot; y++) {
    const row = y * w;
    const faceSafeMaxX = y < neckY
      ? Math.min(pocketMaxX, Math.round(coreCenterX - subjW * 0.13))
      : pocketMaxX;
    let foundSolid = faceSafeMaxX;
    for (let x = Math.max(1, minSubjX); x < faceSafeMaxX - 3; x++) {
      // Confirm 4 consecutive pixels of real non-wall core before treating as cheek/neck/shoulder wall
      let solidRun = true;
      for (let k = 0; k < 4; k++) {
        const idx = row + x + k;
        if (pixels[idx * 4 + 3] < 215) {
          solidRun = false;
          break;
        }
      }
      if (solidRun) {
        const p = (row + x) * 4;
        const dBg = Math.hypot(pixels[p] - rowBgR[y], pixels[p + 1] - rowBgG[y], pixels[p + 2] - rowBgB[y]);
        if (dBg > 20) {
          foundSolid = Math.min(faceSafeMaxX, x + 4);
          break;
        }
      }
    }
    rowSolidLeftBound[y] = foundSolid;
  }

  const cHoleVisited = new Uint8Array(total);
  const cHoleQueue = new Int32Array(total);
  for (let y = collarPocketTop; y < collarPocketBot; y++) {
    const row = y * w;
    const maxRowX = rowSolidLeftBound[y];
    for (let x = Math.max(1, minSubjX + 1); x < maxRowX; x++) {
      const idx = row + x;
      if (cHoleVisited[idx] === 1 || pixels[idx * 4 + 3] === 0) continue;
      if (y >= shoulderProtectionStartY && colShoulderTopY[x] < h && y >= colShoulderTopY[x]) continue;
      const pIdx = idx * 4;
      const a = pixels[pIdx + 3];
      if (a >= 253) continue;
      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const bgLum = 0.299 * rowBgR[y] + 0.587 * rowBgG[y] + 0.114 * rowBgB[y];
      const distBg = Math.hypot(r - rowBgR[y], g - rowBgG[y], b - rowBgB[y]);
      const chromaDist = Math.abs((r - g) - (rowBgR[y] - rowBgG[y])) + Math.abs((g - b) - (rowBgG[y] - rowBgB[y]));
      const lumRatio = lum / Math.max(20, bgLum);
      const isWarmTone = r > g && g >= b * 0.85 && (r - b) >= 10;
      const distToSkin = Math.min(
        skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999,
        (sideSkinCount > 0 || skinCount > 0) ? Math.hypot(r - avgSideSkinR, g - avgSideSkinG, b - avgSideSkinB) : 999
      );
      const hasWarmVsBg = (r - b) - (rowBgR[y] - rowBgB[y]) >= 8;
      const isLikelySkin = isWarmTone && ((skinCount === 0 && sideSkinCount === 0) ? distBg > 18 : (distToSkin < distBg * 0.96 || distToSkin <= 30 || (hasWarmVsBg && distBg > 20)));
      const isDarkHair = lum < 85 && bgLum > 110 && distBg > 24;
      const distToShirt = shirtCount > 0 ? Math.hypot(r - avgShirtR, g - avgShirtG, b - avgShirtB) : 999;
      const matchesShirt = y >= neckY && shirtCount > 0 && distToShirt < 28 && distBg > 20;
      if (isLikelySkin || isDarkHair || matchesShirt) continue;

      const isWallSeed =
        (a < 155 && distBg <= 46) ||
        (hasOriginalRgb && !hasWarmVsBg && a < (y < neckY ? 205 : 235) && chromaDist <= 14 && lumRatio >= 0.52 && lumRatio <= 1.14 && distBg <= 52);
      if (!isWallSeed) continue;

      let hHead = 0, hTail = 0;
      const comp: number[] = [];
      cHoleVisited[idx] = 1;
      cHoleQueue[hTail++] = idx;
      while (hHead < hTail && comp.length < subjCount * 0.035) {
        const curr = cHoleQueue[hHead++];
        comp.push(curr);
        const cy = Math.floor(curr / w), cx = curr % w;
        const nbs = [
          cy > collarPocketTop ? curr - w : -1,
          cy < collarPocketBot - 1 ? curr + w : -1,
          cx > 1 ? curr - 1 : -1,
          cx < rowSolidLeftBound[cy] ? curr + 1 : -1,
        ];
        for (const n of nbs) {
          if (n === -1 || cHoleVisited[n] === 1) continue;
          const na = pixels[n * 4 + 3];
          if (na === 0 || na >= 235) continue;
          const np = n * 4;
          const nr = pixels[np], ng = pixels[np + 1], nb = pixels[np + 2];
          const ny = Math.floor(n / w);
          const nx = n % w;
          if (ny >= shoulderProtectionStartY && colShoulderTopY[nx] < h && ny >= colShoulderTopY[nx]) continue;
          const nLum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
          const nBgLum = 0.299 * rowBgR[ny] + 0.587 * rowBgG[ny] + 0.114 * rowBgB[ny];
          const nDistBg = Math.hypot(nr - rowBgR[ny], ng - rowBgG[ny], nb - rowBgB[ny]);
          const nWarm = nr > ng && ng >= nb * 0.85 && (nr - nb) >= 10;
          const nDistSkin = Math.min(
            skinCount > 0 ? Math.hypot(nr - avgSkinR, ng - avgSkinG, nb - avgSkinB) : 999,
            (sideSkinCount > 0 || skinCount > 0) ? Math.hypot(nr - avgSideSkinR, ng - avgSideSkinG, nb - avgSideSkinB) : 999
          );
          const nHasWarm = (nr - nb) - (rowBgR[ny] - rowBgB[ny]) >= 8;
          const nLikelySkin = nWarm && ((skinCount === 0 && sideSkinCount === 0) ? nDistBg > 18 : (nDistSkin < nDistBg * 0.96 || nDistSkin <= 30 || (nHasWarm && nDistBg > 20)));
          if (nLikelySkin) continue;
          if (nLum < 85 && nBgLum > 110 && nDistBg > 24) continue;
          if (ny >= neckY && shirtCount > 0 && Math.hypot(nr - avgShirtR, ng - avgShirtG, nb - avgShirtB) < 28 && nDistBg > 20) continue;
          const nChroma = Math.abs((nr - ng) - (rowBgR[ny] - rowBgG[ny])) + Math.abs((ng - nb) - (rowBgG[ny] - rowBgB[ny]));
          const nRatio = nLum / Math.max(20, nBgLum);
          if ((na < 155 && nDistBg <= 46) || (!nHasWarm && na < (ny < neckY ? 205 : 235) && nChroma <= 14 && nRatio >= 0.52 && nRatio <= 1.14 && nDistBg <= 52)) {
            cHoleVisited[n] = 1;
            cHoleQueue[hTail++] = n;
          }
        }
      }
      if (comp.length >= 4 && comp.length < subjCount * 0.035) {
        for (const cIdx of comp) {
          pixels[cIdx * 4 + 3] = 0;
          cleared[cIdx] = 1;
        }
      }
    }
  }

  // 5. Clean 2px newly exposed boundary fringe around the cleared pocket (ear, cheek, neck & left shirt collar boundary)
  for (let pass = 0; pass < 2; pass++) {
    const prevCleared = new Uint8Array(cleared);
    for (let y = pocketTopY; y <= pocketBotY; y++) {
      const row = y * w;
      const maxX = Math.min(pocketMaxX, rowSolidLeftBound[y] + 4);
      for (let x = 1; x < maxX; x++) {
        const idx = row + x;
        if (pixels[idx * 4 + 3] === 0) continue;

        const touchesCleared =
          prevCleared[idx - 1] === 1 ||
          prevCleared[idx + 1] === 1 ||
          prevCleared[idx - w] === 1 ||
          prevCleared[idx + w] === 1;

        if (!touchesCleared) continue;

        const pIdx = idx * 4;
        const a = pixels[pIdx + 3];
        const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const distToRowBg = Math.hypot(r - rowBgR[y], g - rowBgG[y], b - rowBgB[y]);
        const isWarmTone = r > g && g >= b * 0.85 && (r - b) >= 14;
        const distToSkin = skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
        const isLikelySkin = isWarmTone && (skinCount === 0 ? distToRowBg > 22 : (distToSkin < distToRowBg * 0.90 || distToSkin <= 26));
        const bgLum = 0.299 * rowBgR[y] + 0.587 * rowBgG[y] + 0.114 * rowBgB[y];
        const isDarkHair = lum < 85 && bgLum > 110 && distToRowBg > 24;

        if (a < 130 && !(isLikelySkin && a >= 85) && !isDarkHair) {
          pixels[pIdx + 3] = 0;
          cleared[idx] = 1;
        } else if (!isLikelySkin && !isDarkHair && distToRowBg < 36 && a < 200) {
          pixels[pIdx + 3] = 0;
          cleared[idx] = 1;
        }
      }
    }
  }
}

/**
 * Symmetric cleaner for the right-side ear-to-shoulder concave pocket AND enclosed background pockets
 * (e.g. gaps between arms and torso, hair-to-collar traps) that exterior flood-fill cannot reach.
 */
function cleanRightPocketAndEnclosedHoles(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  bgModels?: BackgroundModels,
  hasOriginalRgb = true
) {
  const total = w * h;
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = pixels[i * 4 + 3];
  }

  let minSubjX = w, maxSubjX = 0, minY = h, maxY = 0;
  let massCenterX = 0, subjCount = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphaCopy[row + x] > 30) {
        if (x < minSubjX) minSubjX = x;
        if (x > maxSubjX) maxSubjX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        massCenterX += x;
        subjCount++;
      }
    }
  }

  if (subjCount < 150 || maxY <= minY || maxSubjX <= minSubjX) return;

  const coreCenterX = Math.round(massCenterX / subjCount);
  const subjH = maxY - minY;
  const subjW = maxSubjX - minSubjX;

  // Estimate left-side neck minimum to locate right-side shoulder top cleanly
  let neckY = Math.floor(minY + subjH * 0.46);
  let minLeftDist = Infinity;
  for (let y = Math.floor(minY + subjH * 0.28); y <= Math.floor(minY + subjH * 0.60); y++) {
    const row = y * w;
    let lEdge = -1;
    for (let x = 0; x <= coreCenterX; x++) {
      if (alphaCopy[row + x] >= 40) {
        lEdge = x;
        break;
      }
    }
    if (lEdge !== -1) {
      const d = coreCenterX - lEdge;
      if (d < minLeftDist) {
        minLeftDist = d;
        neckY = y;
      }
    }
  }

  // Locate right edge of solid neck at neckY to bound the right-side above-shoulder pocket cleanly
  let rightNeckX = Math.min(maxSubjX, Math.round(coreCenterX + subjH * 0.14));
  {
    const neckRow = Math.max(0, Math.min(h - 1, neckY)) * w;
    for (let x = maxSubjX; x > coreCenterX; x--) {
      if (alphaCopy[neckRow + x] >= 180) {
        rightNeckX = x;
        break;
      }
    }
  }

  const pocketTopY = Math.max(1, Math.floor(minY + subjH * 0.20));
  const pocketBotY = Math.min(
    h - 2,
    Math.max(pocketTopY + 10, Math.min(Math.floor(minY + subjH * 0.76), neckY + Math.round(subjH * 0.28)))
  );
  const pocketMinX = Math.max(1, Math.min(Math.round(coreCenterX + subjW * 0.08), rightNeckX - 8));

  // Sample skin & shirt colors
  let skinR = 0, skinG = 0, skinB = 0, skinCount = 0;
  for (let y = Math.floor(minY + subjH * 0.24); y <= Math.floor(minY + subjH * 0.48); y += 2) {
    const row = y * w;
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.10)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.10)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 220) {
        const pIdx = idx * 4;
        const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
        if (r > g && r > b && (r - b) >= 14) {
          skinR += r; skinG += g; skinB += b; skinCount++;
        }
      }
    }
  }
  const avgSkinR = skinCount > 0 ? skinR / skinCount : 0;
  const avgSkinG = skinCount > 0 ? skinG / skinCount : 0;
  const avgSkinB = skinCount > 0 ? skinB / skinCount : 0;

  let shirtR = 0, shirtG = 0, shirtB = 0, shirtCount = 0;
  const shirtTop = Math.min(h - 1, Math.max(neckY + Math.round(subjH * 0.06), Math.floor(minY + subjH * 0.54)));
  const shirtBot = Math.min(h - 1, Math.floor(minY + subjH * 0.80));
  for (let y = shirtTop; y <= shirtBot; y += 2) {
    const row = y * w;
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.16)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.16)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 220) {
        const pIdx = idx * 4;
        shirtR += pixels[pIdx]; shirtG += pixels[pIdx + 1]; shirtB += pixels[pIdx + 2]; shirtCount++;
      }
    }
  }
  const avgShirtR = shirtCount > 0 ? shirtR / shirtCount : 128;
  const avgShirtG = shirtCount > 0 ? shirtG / shirtCount : 128;
  const avgShirtB = shirtCount > 0 ? shirtB / shirtCount : 128;
  const avgShirtLum = 0.299 * avgShirtR + 0.587 * avgShirtG + 0.114 * avgShirtB;

  const globalBgR = bgModels?.global?.meanR ?? 245;
  const globalBgG = bgModels?.global?.meanG ?? 245;
  const globalBgB = bgModels?.global?.meanB ?? 245;

  // Part A: Right-side concave pocket BFS flood-fill (ear -> neck -> sloping right shoulder top)
  if (pocketBotY > pocketTopY && pocketMinX < w - 2) {
    const rowBgR = new Float32Array(h);
    const rowBgG = new Float32Array(h);
    const rowBgB = new Float32Array(h);
    const rowBgTol = new Float32Array(h);

    for (let y = pocketTopY; y <= pocketBotY; y++) {
      let sR = 0, sG = 0, sB = 0, sCnt = 0;
      const y0 = Math.max(0, y - 8), y1 = Math.min(h - 1, y + 8);
      for (let sy = y0; sy <= y1; sy += 2) {
        const row = sy * w;
        let lastFg = pocketMinX;
        for (let x = w - 1; x >= pocketMinX; x--) {
          if (alphaCopy[row + x] > 25) {
            lastFg = x;
            break;
          }
        }
        const xStart = Math.min(w - 1, lastFg + 2);
        const xEnd = Math.min(w, lastFg + 36);
        for (let x = xStart; x < xEnd; x += 2) {
          const idx = row + x;
          const a = alphaCopy[idx];
          if ((hasOriginalRgb && a <= 20) || (!hasOriginalRgb && a > 5 && a < 140)) {
            const pIdx = idx * 4;
            sR += pixels[pIdx]; sG += pixels[pIdx + 1]; sB += pixels[pIdx + 2]; sCnt++;
          }
        }
      }
      rowBgR[y] = sCnt >= 5 ? sR / sCnt : globalBgR;
      rowBgG[y] = sCnt >= 5 ? sG / sCnt : globalBgG;
      rowBgB[y] = sCnt >= 5 ? sB / sCnt : globalBgB;
      rowBgTol[y] = 20;
    }

    const shoulderProtectionStartY = Math.max(neckY + Math.round(subjH * 0.04), Math.floor(minY + subjH * 0.48));
    // Sample right shoulder sleeve RGB so shaded/two-tone right shoulders are protected independently from center chest
    let rSlR = 0, rSlG = 0, rSlB = 0, rSlCnt = 0;
    for (let sy = Math.max(shoulderProtectionStartY, pocketBotY - 14); sy <= Math.min(h - 2, pocketBotY + 14); sy += 2) {
      const sRow = sy * w;
      let rEd = -1;
      for (let sx = maxSubjX; sx > coreCenterX + 8; sx--) {
        if (alphaCopy[sRow + sx] >= 175) { rEd = sx; break; }
      }
      if (rEd !== -1 && rEd > rightNeckX + 10) {
        for (let sx = Math.max(rightNeckX + 4, rEd - 20); sx <= rEd - 3; sx += 2) {
          if (alphaCopy[sRow + sx] >= 195) {
            const sp = (sRow + sx) * 4;
            rSlR += pixels[sp]; rSlG += pixels[sp + 1]; rSlB += pixels[sp + 2]; rSlCnt++;
          }
        }
      }
    }
    const avgRSlR = rSlCnt > 4 ? rSlR / rSlCnt : avgShirtR;
    const avgRSlG = rSlCnt > 4 ? rSlG / rSlCnt : avgShirtG;
    const avgRSlB = rSlCnt > 4 ? rSlB / rSlCnt : avgShirtB;

    // Per-column solid right shoulder top Y (detecting >= 145 edge curves so outer right deltoids don't stay unmapped as h)
    const colRightShoulderTopY = new Int32Array(w).fill(h);
    for (let x = pocketMinX; x <= Math.min(w - 1, maxSubjX); x++) {
      for (let y = shoulderProtectionStartY; y <= Math.min(h - 4, pocketBotY + 12); y++) {
        const i0 = y * w + x;
        const a0 = alphaCopy[i0];
        const a1 = alphaCopy[i0 + w];
        if (a0 >= 145 && a1 >= 145) {
          const p0 = i0 * 4;
          const dBg = Math.hypot(pixels[p0] - rowBgR[y], pixels[p0 + 1] - rowBgG[y], pixels[p0 + 2] - rowBgB[y]);
          if (a0 >= 185 || dBg > 16) {
            colRightShoulderTopY[x] = y;
            break;
          }
        }
      }
    }

    const visited = new Uint8Array(total);
    const cleared = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0, tail = 0, clearedCount = 0;

    for (let y = pocketTopY; y <= pocketBotY; y++) {
      const row = y * w;
      for (let x = w - 1; x >= pocketMinX; x--) {
        const idx = row + x;
        if (alphaCopy[idx] <= 25) {
          visited[idx] = 1;
          queue[tail++] = idx;
        } else {
          break;
        }
      }
    }

    while (head < tail) {
      const curr = queue[head++];
      const cy = Math.floor(curr / w);
      const cPIdx = curr * 4;
      const currIsSeedBg = alphaCopy[curr] <= 25;
      const cR = currIsSeedBg && !hasOriginalRgb ? rowBgR[cy] : pixels[cPIdx];
      const cG = currIsSeedBg && !hasOriginalRgb ? rowBgG[cy] : pixels[cPIdx + 1];
      const cB = currIsSeedBg && !hasOriginalRgb ? rowBgB[cy] : pixels[cPIdx + 2];

      const neighbors = [
        cy > pocketTopY ? curr - w : -1,
        cy < pocketBotY ? curr + w : -1,
        (curr % w) > pocketMinX ? curr - 1 : -1,
        (curr % w) < w - 1 ? curr + 1 : -1,
      ];

      for (const nIdx of neighbors) {
        if (nIdx === -1 || visited[nIdx] === 1) continue;
        const ny = Math.floor(nIdx / w);
        const nx = nIdx % w;
        const nA = alphaCopy[nIdx];
        if (nA <= 25) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
          continue;
        }

        const isBelowRightShoulderTop =
          ny >= shoulderProtectionStartY && colRightShoulderTopY[nx] < h && ny >= colRightShoulderTopY[nx];
        if (isBelowRightShoulderTop) continue;

        const npIdx = nIdx * 4;
        const r = pixels[npIdx], g = pixels[npIdx + 1], b = pixels[npIdx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const bgR = rowBgR[ny], bgG = rowBgG[ny], bgB = rowBgB[ny];
        const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
        const distToBg = Math.hypot(r - bgR, g - bgG, b - bgB);
        const stepDiff = Math.hypot(r - cR, g - cG, b - cB);
        const chromaDist = Math.abs((r - g) - (bgR - bgG)) + Math.abs((g - b) - (bgG - bgB));
        const lumRatio = lum / Math.max(20, bgLum);

        if (lum < 85 && bgLum > 110 && distToBg > 24) continue;
        const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 12;
        const hasWarmVsBg = (r - b) - (bgR - bgB) >= 8;
        const distToSkin = skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
        if (isWarmSkin && distToBg > 18 && (skinCount === 0 || distToSkin < distToBg * 1.25 || hasWarmVsBg)) continue;

        let localVar = 0, varCnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const vy = ny + dy;
          if (vy < 0 || vy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const vx = nx + dx;
            if (vx < 0 || vx >= w) continue;
            const vIdx = (vy * w + vx) * 4;
            localVar += Math.abs(lum - (0.299 * pixels[vIdx] + 0.587 * pixels[vIdx + 1] + 0.114 * pixels[vIdx + 2]));
            varCnt++;
          }
        }
        const avgLocalVar = varCnt > 0 ? localVar / varCnt : 0;

        if (ny >= shoulderProtectionStartY) {
          if (nA >= 145) continue;
          if (shirtCount > 0 || rSlCnt > 4) {
            const distToChest = shirtCount > 0 ? Math.hypot(r - avgShirtR, g - avgShirtG, b - avgShirtB) : 999;
            const distToRightSleeve = rSlCnt > 4 ? Math.hypot(r - avgRSlR, g - avgRSlG, b - avgRSlB) : 999;
            const distToShirt = Math.min(distToChest, distToRightSleeve);
            if (distToShirt < 34 && nA >= 85) continue;
            if (avgShirtLum > 135 && nA >= 135 && (avgLocalVar >= 4.0 || distToBg > 16)) continue;
          }
        }

        const rColTop = colRightShoulderTopY[nx];
        const isSemiBridge = ny < shoulderProtectionStartY && nA < 165 && stepDiff <= 22 && (distToBg <= Math.min(44, rowBgTol[ny] * 1.7) || nA < 90);
        const isShadowedWall =
          hasOriginalRgb &&
          ny < shoulderProtectionStartY &&
          !hasWarmVsBg &&
          nA < (ny < neckY ? 200 : 215) &&
          chromaDist <= 13 &&
          lumRatio >= 0.52 &&
          lumRatio <= 1.14 &&
          distToBg <= 46 &&
          stepDiff <= 16 &&
          avgLocalVar < 7.0;
        const isTrappedBg = hasOriginalRgb && rColTop < h && ny < rColTop && nA >= 165 && nA < 225 && distToBg <= 28 && stepDiff <= 14 && avgLocalVar < 7.0;
        const isAboveShoulderFlatWall =
          hasOriginalRgb &&
          ny < shoulderProtectionStartY &&
          rColTop < h &&
          ny < rColTop &&
          nA >= 225 &&
          distToBg <= 22 &&
          stepDiff <= 10 &&
          avgLocalVar < 5.5;

        if (isSemiBridge || isShadowedWall || isTrappedBg || isAboveShoulderFlatWall || (nA < 110 && distToBg <= 32)) {
          visited[nIdx] = 1;
          cleared[nIdx] = 1;
          pixels[npIdx + 3] = 0;
          queue[tail++] = nIdx;
          clearedCount++;
        }
      }
    }

    if (clearedCount > subjCount * 0.10) {
      for (let i = 0; i < total; i++) {
        if (cleared[i] === 1) pixels[i * 4 + 3] = alphaCopy[i];
      }
    } else {
      // Clean 2px newly exposed boundary fringe along the cleared right neck-to-shoulder corner
      for (let pass = 0; pass < 2; pass++) {
        const prevCleared = new Uint8Array(cleared);
        for (let y = pocketTopY; y <= pocketBotY; y++) {
          const row = y * w;
          for (let x = pocketMinX; x < w - 1; x++) {
            const idx = row + x;
            if (pixels[idx * 4 + 3] === 0) continue;
            if (y >= shoulderProtectionStartY && colRightShoulderTopY[x] < h && y >= colRightShoulderTopY[x]) continue;
            const touchesCleared =
              prevCleared[idx - 1] === 1 ||
              prevCleared[idx + 1] === 1 ||
              prevCleared[idx - w] === 1 ||
              prevCleared[idx + w] === 1;
            if (!touchesCleared) continue;

            const pIdx = idx * 4;
            const a = pixels[pIdx + 3];
            const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const distToRowBg = Math.hypot(r - rowBgR[y], g - rowBgG[y], b - rowBgB[y]);
            const isWarmTone = r > g && g >= b * 0.85 && (r - b) >= 14;
            const distToSkin = skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
            const isLikelySkin = isWarmTone && (skinCount === 0 ? distToRowBg > 22 : (distToSkin < distToRowBg * 0.90 || distToSkin <= 26));
            const bgLum = 0.299 * rowBgR[y] + 0.587 * rowBgG[y] + 0.114 * rowBgB[y];
            const isDarkHair = lum < 85 && bgLum > 110 && distToRowBg > 24;

            if ((a < 130 && !(isLikelySkin && a >= 85) && !isDarkHair) || (!isLikelySkin && !isDarkHair && distToRowBg < 36 && a < 200)) {
              pixels[pIdx + 3] = 0;
              cleared[idx] = 1;
            }
          }
        }
      }
    }
  }

  // Part B: Enclosed Background Pockets Cleaner (gaps between arms & torso, hair & collar, under-chin pockets)
  // Guarded away from face oval, eyes, and entire white/check shirt envelope (chest, collar, shoulders, sleeves)
  const faceMinX = coreCenterX - subjW * 0.22;
  const faceMaxX = coreCenterX + subjW * 0.22;
  const faceMinY = minY + subjH * 0.12;
  const faceMaxY = minY + subjH * 0.44;
  const shirtCoreMinX = coreCenterX - subjW * 0.28;
  const shirtCoreMaxX = coreCenterX + subjW * 0.28;
  const shirtCoreMinY = minY + subjH * 0.44;

  // Per-row garment bounds so shoulders & sleeves are also guarded on white/check shirts
  const garmentL = new Int32Array(h).fill(-1);
  const garmentR = new Int32Array(h).fill(-1);
  for (let y = Math.max(0, Math.floor(shirtCoreMinY)); y <= maxY; y++) {
    const row = y * w;
    for (let x = minSubjX; x <= maxSubjX; x++) {
      if (alphaCopy[row + x] >= 120) { garmentL[y] = x; break; }
    }
    for (let x = maxSubjX; x >= minSubjX; x--) {
      if (alphaCopy[row + x] >= 120) { garmentR[y] = x; break; }
    }
  }

  // Detect light/white/check chest texture across ALL pixels inside chest bounds
  let lightChestPx = 0, checkChestPx = 0, chestTotalPx = 0;
  for (let y = Math.floor(shirtCoreMinY); y <= Math.min(h - 4, Math.floor(minY + subjH * 0.85)); y += 3) {
    const row = y * w;
    for (let x = Math.max(0, Math.floor(shirtCoreMinX)); x <= Math.min(w - 4, Math.floor(shirtCoreMaxX)); x += 3) {
      const idx = row + x;
      const pIdx = idx * 4;
      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if ((lum >= 132 && Math.max(r, g, b) - Math.min(r, g, b) <= 82) || lum >= 175) lightChestPx++;
      const rIdx = (row + x + 3) * 4;
      const lumR = 0.299 * pixels[rIdx] + 0.587 * pixels[rIdx + 1] + 0.114 * pixels[rIdx + 2];
      if (Math.abs(lum - lumR) >= 12) checkChestPx++;
      chestTotalPx++;
    }
  }
  const hasWhiteOrCheckShirt =
    chestTotalPx > 15 &&
    (lightChestPx / chestTotalPx >= 0.14 || checkChestPx / chestTotalPx >= 0.035);

  const isInsideProtectedShirt = (px: number, py: number) => {
    if (!hasWhiteOrCheckShirt || py < shirtCoreMinY) return false;
    const gl = garmentL[py];
    const gr = garmentR[py];
    if (gl !== -1 && gr > gl && px >= gl && px <= gr) return true;
    return px >= shirtCoreMinX && px <= shirtCoreMaxX;
  };

  const holeVisited = new Uint8Array(total);
  const holeQueue = new Int32Array(total);
  let totalHolesCleared = 0;

  for (let y = Math.max(1, minY + Math.round(subjH * 0.15)); y < Math.min(h - 1, maxY - 2); y++) {
    const secY = Math.min(2, Math.floor((y / h) * 3));
    const row = y * w;
    for (let x = Math.max(1, minSubjX + 2); x < Math.min(w - 1, maxSubjX - 2); x++) {
      const idx = row + x;
      if (holeVisited[idx] === 1) continue;
      const a = pixels[idx * 4 + 3];
      if (a === 0 || a >= 110) continue; // Only seed from translucent enclosed pockets

      // Protect face features (eyes, teeth, skin speculars)
      if (x >= faceMinX && x <= faceMaxX && y >= faceMinY && y <= faceMaxY) continue;
      // Never punch holes inside the shirt/shoulders/chest when wearing a white or check shirt
      if (isInsideProtectedShirt(x, y)) continue;

      const pIdx = idx * 4;
      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const secX = Math.min(2, Math.floor((x / w) * 3));
      const sec = bgModels?.sectors?.[secY * 3 + secX];
      const bgR = sec ? sec.meanR : globalBgR;
      const bgG = sec ? sec.meanG : globalBgG;
      const bgB = sec ? sec.meanB : globalBgB;
      const distToBg = Math.hypot(r - bgR, g - bgG, b - bgB);
      const distToShirt = shirtCount > 0 ? Math.hypot(r - avgShirtR, g - avgShirtG, b - avgShirtB) : 999;

      if (distToBg > 38 || (shirtCount > 0 && distToShirt < distToBg * 0.85)) continue;

      // Grow locally within trapped low-alpha / background-colored pocket
      let hHead = 0, hTail = 0;
      const compPixels: number[] = [];
      holeVisited[idx] = 1;
      holeQueue[hTail++] = idx;

      while (hHead < hTail && compPixels.length < subjCount * 0.06) {
        const curr = holeQueue[hHead++];
        compPixels.push(curr);
        const cy = Math.floor(curr / w);
        const cx = curr % w;
        const nbs = [
          cy > 1 ? curr - w : -1,
          cy < h - 2 ? curr + w : -1,
          cx > 1 ? curr - 1 : -1,
          cx < w - 2 ? curr + 1 : -1,
        ];
        for (const n of nbs) {
          if (n === -1 || holeVisited[n] === 1) continue;
          const na = pixels[n * 4 + 3];
          if (na === 0 || na >= 185) continue;
          const ny = Math.floor(n / w);
          const nx = n % w;
          if (nx >= faceMinX && nx <= faceMaxX && ny >= faceMinY && ny <= faceMaxY) continue;
          if (isInsideProtectedShirt(nx, ny)) continue;

          const np = n * 4;
          const nr = pixels[np], ng = pixels[np + 1], nb = pixels[np + 2];
          const isWarmSkin = nr > ng && ng >= nb * 0.85 && (nr - nb) >= 14;
          if (isWarmSkin && na >= 95) continue;

          const nSec = bgModels?.sectors?.[Math.min(2, Math.floor((ny / h) * 3)) * 3 + Math.min(2, Math.floor((nx / w) * 3))];
          const nbR = nSec ? nSec.meanR : globalBgR;
          const nbG = nSec ? nSec.meanG : globalBgG;
          const nbB = nSec ? nSec.meanB : globalBgB;
          const nDistBg = Math.hypot(nr - nbR, ng - nbG, nb - nbB);
          const nDistShirt = shirtCount > 0 ? Math.hypot(nr - avgShirtR, ng - avgShirtG, nb - avgShirtB) : 999;

          if ((na < 95 && nDistBg <= 40) || (na < 185 && nDistBg <= 28 && nDistBg < nDistShirt)) {
            holeVisited[n] = 1;
            holeQueue[hTail++] = n;
          }
        }
      }

      if (compPixels.length >= 6 && compPixels.length + totalHolesCleared <= subjCount * 0.07) {
        for (const cIdx of compPixels) {
          pixels[cIdx * 4 + 3] = 0;
        }
        totalHolesCleared += compPixels.length;
      }
    }
  }
}

/**
 * Carefully peels remaining semi-transparent halo patches & color-contaminated fringes
 * along BOTH left and right perimeters + top hair crown and removes small detached halo islands.
 */
function cleanLeftPerimeterHaloPatches(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  bgModels?: BackgroundModels,
  hasOriginalRgb = true,
  isolateAllDisconnected = false
) {
  const total = w * h;
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = pixels[i * 4 + 3];
  }

  let minSubjX = w, maxSubjX = 0, minY = h, maxY = 0;
  let massCenterX = 0, subjCount = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphaCopy[row + x] > 30) {
        if (x < minSubjX) minSubjX = x;
        if (x > maxSubjX) maxSubjX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        massCenterX += x;
        subjCount++;
      }
    }
  }

  if (subjCount < 150 || maxY <= minY || maxSubjX <= minSubjX) return;

  const coreCenterX = Math.round(massCenterX / subjCount);
  const subjW = maxSubjX - minSubjX;
  const subjH = maxY - minY;
  const maxLeftScanX = Math.max(4, Math.round(coreCenterX - subjW * 0.12));
  const minRightScanX = Math.min(w - 5, Math.round(coreCenterX + subjW * 0.12));

  // Dynamically locate neck Y so upper shoulders are never mistaken for ear/neck background
  let neckY = Math.floor(minY + subjH * 0.45);
  let minNeckSpan = Infinity;
  for (let y = Math.floor(minY + subjH * 0.28); y <= Math.floor(minY + subjH * 0.54); y++) {
    const row = y * w;
    let l = -1, r = -1;
    for (let x = minSubjX; x <= maxSubjX; x++) {
      if (alphaCopy[row + x] >= 165) { l = x; break; }
    }
    for (let x = maxSubjX; x >= minSubjX; x--) {
      if (alphaCopy[row + x] >= 165) { r = x; break; }
    }
    if (l !== -1 && r > l && (r - l) < minNeckSpan) {
      minNeckSpan = r - l;
      neckY = y;
    }
  }
  const upperEarStopY = Math.min(Math.floor(minY + subjH * 0.50), neckY + Math.round(subjH * 0.03));

  // Sample center face + shadowed left-side jaw/neck skin so under-ear skin is never chewed inward
  let skinR = 0, skinG = 0, skinB = 0, skinCount = 0;
  let sideSkinR = 0, sideSkinG = 0, sideSkinB = 0, sideSkinCount = 0;
  for (let y = Math.floor(minY + subjH * 0.22); y <= Math.floor(minY + subjH * 0.50); y += 2) {
    const row = y * w;
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.11)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.11)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 220) {
        const p = idx * 4;
        const sr = pixels[p], sg = pixels[p + 1], sb = pixels[p + 2];
        if (sr > sg && sr > sb && (sr - sb) >= 12) {
          skinR += sr; skinG += sg; skinB += sb; skinCount++;
        }
      }
    }
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.20)); x < Math.max(0, coreCenterX - Math.round(subjW * 0.06)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 230) {
        const p = idx * 4;
        const sr = pixels[p], sg = pixels[p + 1], sb = pixels[p + 2];
        if (sr > sg && sg >= sb * 0.85 && (sr - sb) >= 10) {
          sideSkinR += sr; sideSkinG += sg; sideSkinB += sb; sideSkinCount++;
        }
      }
    }
  }
  const avgSkinR = skinCount > 0 ? skinR / skinCount : 0;
  const avgSkinG = skinCount > 0 ? skinG / skinCount : 0;
  const avgSkinB = skinCount > 0 ? skinB / skinCount : 0;
  const avgSideSkinR = sideSkinCount > 0 ? sideSkinR / sideSkinCount : avgSkinR;
  const avgSideSkinG = sideSkinCount > 0 ? sideSkinG / sideSkinCount : avgSkinG;
  const avgSideSkinB = sideSkinCount > 0 ? sideSkinB / sideSkinCount : avgSkinB;

  const fallbackBgR = bgModels?.global?.meanR ?? 245;
  const fallbackBgG = bgModels?.global?.meanG ?? 245;
  const fallbackBgB = bgModels?.global?.meanB ?? 245;

  const peelSideRow = (y: number, dir: 1 | -1) => {
    const row = y * w;
    let edgeX = -1;
    if (dir === 1) {
      for (let x = 0; x < maxLeftScanX; x++) {
        if (pixels[(row + x) * 4 + 3] > 0) {
          edgeX = x;
          break;
        }
      }
    } else {
      for (let x = w - 1; x > minRightScanX; x--) {
        if (pixels[(row + x) * 4 + 3] > 0) {
          edgeX = x;
          break;
        }
      }
    }
    if (edgeX === -1) return;

    // Sample local exterior background outside edgeX
    let bgR = 0, bgG = 0, bgB = 0, bgCnt = 0;
    for (let sy = Math.max(0, y - 4); sy <= Math.min(h - 1, y + 4); sy += 2) {
      const sRow = sy * w;
      const x0 = dir === 1 ? Math.max(0, edgeX - 24) : Math.min(w - 1, edgeX + 1);
      const x1 = dir === 1 ? Math.max(0, edgeX - 1) : Math.min(w, edgeX + 25);
      for (let sx = x0; sx < x1; sx += 2) {
        const sIdx = sRow + sx;
        const sa = alphaCopy[sIdx];
        if ((hasOriginalRgb && sa <= 15) || (!hasOriginalRgb && sa > 5 && sa < 130)) {
          const sp = sIdx * 4;
          bgR += pixels[sp]; bgG += pixels[sp + 1]; bgB += pixels[sp + 2]; bgCnt++;
        }
      }
    }
    const localBgR = bgCnt >= 3 ? bgR / bgCnt : fallbackBgR;
    const localBgG = bgCnt >= 3 ? bgG / bgCnt : fallbackBgG;
    const localBgB = bgCnt >= 3 ? bgB / bgCnt : fallbackBgB;
    const localBgLum = 0.299 * localBgR + 0.587 * localBgG + 0.114 * localBgB;

    // Sample solid interior foreground in a 2D patch 4..22px inside (handles curved shoulder slopes cleanly)
    let fgR = 0, fgG = 0, fgB = 0, fgCnt = 0;
    for (let sy = Math.max(0, y - 2); sy <= Math.min(h - 1, y + 4); sy++) {
      const sRow = sy * w;
      for (let step = 4; step <= 22; step += 2) {
        const fx = edgeX + dir * step;
        if (fx < 0 || fx >= w) break;
        const fIdx = sRow + fx;
        if (alphaCopy[fIdx] >= 215) {
          const fp = fIdx * 4;
          fgR += pixels[fp]; fgG += pixels[fp + 1]; fgB += pixels[fp + 2]; fgCnt++;
        }
      }
    }
    const intFgR = fgCnt > 0 ? fgR / fgCnt : 128;
    const intFgG = fgCnt > 0 ? fgG / fgCnt : 128;
    const intFgB = fgCnt > 0 ? fgB / fgCnt : 128;

    const isUpperNeckEar = y < upperEarStopY;
    const maxPeelDepth = isUpperNeckEar ? (dir === 1 ? 14 : 12) : 10;

    for (let step = 0; step <= maxPeelDepth; step++) {
      const x = edgeX + dir * step;
      if (dir === 1 && x > maxLeftScanX) break;
      if (dir === -1 && x < minRightScanX) break;
      const pIdx = (row + x) * 4;
      const a = pixels[pIdx + 3];
      if (a === 0) continue;
      if (a >= 228) break;

      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const distToBg = Math.hypot(r - localBgR, g - localBgG, b - localBgB);
      const chromaToBg = Math.abs((r - g) - (localBgR - localBgG)) + Math.abs((g - b) - (localBgG - localBgB));
      const lumRatio = lum / Math.max(20, localBgLum);
      const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 10;
      const distToSkin = Math.min(
        skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999,
        (sideSkinCount > 0 || skinCount > 0) ? Math.hypot(r - avgSideSkinR, g - avgSideSkinG, b - avgSideSkinB) : 999
      );
      const hasWarmVsBg = (r - b) - (localBgR - localBgB) >= 8;
      const isLikelySkin = isWarmSkin && ((skinCount === 0 && sideSkinCount === 0) ? distToBg > 18 : (distToSkin < distToBg * 0.96 || distToSkin <= 30 || (hasWarmVsBg && distToBg > 20)));
      // Find nearest matching solid pixel in 2D neighborhood so check/striped shirts never compare white squares to dark stripes
      let nearestFgDist = 999;
      let stR = 0, stG = 0, stB = 0, stCnt = 0;
      for (let sy = Math.max(0, y - 3); sy <= Math.min(h - 1, y + 4); sy++) {
        const sRow = sy * w;
        for (let st = 1; st <= 10; st++) {
          const fx = x + dir * st;
          if (fx < 0 || fx >= w) break;
          const fIdx = sRow + fx;
          if (alphaCopy[fIdx] >= 215) {
            const fp = fIdx * 4;
            const fr = pixels[fp], fg = pixels[fp + 1], fb = pixels[fp + 2];
            const d = Math.hypot(r - fr, g - fg, b - fb);
            if (d < nearestFgDist) nearestFgDist = d;
            if (d <= 45) {
              stR += fr; stG += fg; stB += fb; stCnt++;
            }
          }
        }
      }
      const distToFg = Math.min(nearestFgDist, fgCnt > 0 ? Math.hypot(r - intFgR, g - intFgG, b - intFgB) : 999);
      const isLowerWhiteShirtEdge = !isUpperNeckEar && maxC >= 132 && (maxC - minC) <= 82 && (fgCnt === 0 || distToFg <= 38) && (distToBg > 20 || a >= 105);
      const isLowerGarmentEdge = !isUpperNeckEar && fgCnt > 0 && (distToFg <= 38 || distToBg > 20);

      if (isLikelySkin && a >= 85) break;
      if (lum < 82 && localBgLum > 110 && distToBg > 24 && a >= (isUpperNeckEar ? 90 : 135)) break;
      if (isLowerWhiteShirtEdge && a >= 95) break;
      if (!isUpperNeckEar && step >= 5) break;

      if (isLowerGarmentEdge && a >= 90) {
        break;
      }

      const isFaintHalo = isLowerWhiteShirtEdge
        ? (a < 45 && distToBg <= 24)
        : isUpperNeckEar
          ? (a < (dir === 1 ? 105 : 95) && distToBg <= 50)
          : (a < 54 && (fgCnt === 0 || distToBg < distToFg * 0.80 || distToBg <= 32));
      const isMidHaloCloserToBg =
        !isLowerWhiteShirtEdge &&
        a < (isUpperNeckEar ? (dir === 1 ? 180 : 165) : 110) &&
        fgCnt > 0 &&
        distToBg < distToFg * (isUpperNeckEar ? 0.88 : 0.65) &&
        distToBg <= (isUpperNeckEar ? 46 : 26);
      const isBgMatchedFringe =
        isUpperNeckEar &&
        a < 195 &&
        !isLikelySkin &&
        !hasWarmVsBg &&
        (distToBg <= (dir === -1 ? 28 : 34) ||
          (dir === 1 &&
            chromaToBg <= 14 &&
            lumRatio >= 0.52 &&
            lumRatio <= 1.14 &&
            distToBg <= 46 &&
            (fgCnt === 0 || distToFg > 24)));

      if (isFaintHalo || isMidHaloCloserToBg || isBgMatchedFringe) {
        pixels[pIdx + 3] = 0;
      } else {
        const refR = stCnt > 0 ? stR / stCnt : intFgR;
        const refG = stCnt > 0 ? stG / stCnt : intFgG;
        const refB = stCnt > 0 ? stB / stCnt : intFgB;
        if (!isLowerWhiteShirtEdge && fgCnt > 0 && a < 238 && distToBg < Math.max(42, distToFg * 1.35)) {
          const blend = Math.min(0.88, (1 - a / 255) + 0.35);
          pixels[pIdx] = Math.round(r * (1 - blend) + refR * blend);
          pixels[pIdx + 1] = Math.round(g * (1 - blend) + refG * blend);
          pixels[pIdx + 2] = Math.round(b * (1 - blend) + refB * blend);
        }
        if (a >= 150) break;
      }
    }
  };

  // 1. Row-by-row iterative inward halo peeling along BOTH left & right contours
  for (let y = Math.max(0, minY); y <= Math.min(h - 1, maxY); y++) {
    peelSideRow(y, 1);
    peelSideRow(y, -1);
  }

  // 2. Remove detached floating halo islands & lingering disconnected background patches
  const labels = new Int32Array(total);
  const compSizes: number[] = [0];
  const compSumX: number[] = [0];
  const compSumY: number[] = [0];
  const queue = new Int32Array(total);
  let curLabel = 0;
  let maxCompSize = 0;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      if (pixels[idx * 4 + 3] > 20 && labels[idx] === 0) {
        curLabel++;
        let size = 0;
        let sX = 0, sY = 0;
        let head = 0;
        let tail = 0;
        labels[idx] = curLabel;
        queue[tail++] = idx;

        while (head < tail) {
          const curr = queue[head++];
          const cy = Math.floor(curr / w);
          const cx = curr % w;
          size++;
          sX += cx;
          sY += cy;
          if (cy > 0) {
            const n = curr - w;
            if (pixels[n * 4 + 3] > 20 && labels[n] === 0) { labels[n] = curLabel; queue[tail++] = n; }
          }
          if (cy < h - 1) {
            const n = curr + w;
            if (pixels[n * 4 + 3] > 20 && labels[n] === 0) { labels[n] = curLabel; queue[tail++] = n; }
          }
          if (cx > 0) {
            const n = curr - 1;
            if (pixels[n * 4 + 3] > 20 && labels[n] === 0) { labels[n] = curLabel; queue[tail++] = n; }
          }
          if (cx < w - 1) {
            const n = curr + 1;
            if (pixels[n * 4 + 3] > 20 && labels[n] === 0) { labels[n] = curLabel; queue[tail++] = n; }
          }
        }
        compSizes.push(size);
        compSumX.push(sX);
        compSumY.push(sY);
        if (size > maxCompSize) {
          maxCompSize = size;
        }
      }
    }
  }

  if (curLabel > 1 && maxCompSize > 0) {
    let mainLabel = 1;
    let bestScore = -1;
    const minCandidate = Math.max(120, Math.round(maxCompSize * 0.08));
    for (let l = 1; l <= curLabel; l++) {
      const sz = compSizes[l];
      if (sz < minCandidate) continue;
      const cx = compSumX[l] / Math.max(1, sz);
      const cy = compSumY[l] / Math.max(1, sz);
      const centerDist = Math.hypot((cx - w * 0.5) / Math.max(1, w), (cy - h * 0.48) / Math.max(1, h));
      const score = sz / (1 + 2.2 * centerDist);
      if (score > bestScore) {
        bestScore = score;
        mainLabel = l;
      }
    }

    const islandCutoff = isolateAllDisconnected
      ? Infinity
      : Math.max(400, Math.min(4500, maxCompSize * 0.08));
    for (let i = 0; i < total; i++) {
      const l = labels[i];
      if (l > 0 && l !== mainLabel && compSizes[l] < islandCutoff) {
        pixels[i * 4 + 3] = 0;
      }
    }
  }
}

/**
 * Dedicated, highly precise left-edge halo and background eliminator.
 * Sweeps along the entire left contour from the ear, across the jawline/neck,
 * and down through the shoulder and deltoid.
 * Eradicates background bleed, light halos, and lingering edges without cutting the subject.
 */
function cleanLeftEdgeHalosFromEarToShoulder(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  bgModels?: BackgroundModels
) {
  const total = w * h;
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = pixels[i * 4 + 3];
  }

  // 1. Locate subject bounding box and center of mass
  let minSubjX = w, maxSubjX = 0, minY = h, maxY = 0;
  let massCenterX = 0, subjCount = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphaCopy[row + x] > 30) {
        if (x < minSubjX) minSubjX = x;
        if (x > maxSubjX) maxSubjX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        massCenterX += x;
        subjCount++;
      }
    }
  }

  if (subjCount < 100 || maxY <= minY) return;

  const coreCenterX = Math.round(massCenterX / subjCount);
  const subjH = maxY - minY;

  // Ear and neck zone: dynamically detect right-side neck minimum so both passport & waist-up crops work accurately
  const yStart = Math.max(0, Math.floor(minY + subjH * 0.16));
  let neckY = Math.floor(minY + subjH * 0.48);
  let minRightDist = Infinity;
  for (let y = Math.floor(minY + subjH * 0.25); y <= Math.floor(minY + subjH * 0.58); y++) {
    const row = y * w;
    let rEdge = -1;
    for (let x = w - 1; x >= coreCenterX; x--) {
      if (alphaCopy[row + x] >= 40) {
        rEdge = x;
        break;
      }
    }
    if (rEdge !== -1) {
      const d = rEdge - coreCenterX;
      if (d < minRightDist) {
        minRightDist = d;
        neckY = y;
      }
    }
  }
  const shoulderStartY = Math.min(
    Math.floor(minY + subjH * 0.56),
    Math.max(Math.floor(minY + subjH * 0.44), neckY + Math.round(subjH * 0.05))
  );
  const yEnd = Math.min(h - 1, Math.floor(minY + subjH * 0.95));

  // Locate left edge of solid neck at neckY to separate the left above-shoulder triangle from the neck core
  let leftNeckX = Math.max(minSubjX, Math.round(coreCenterX - subjH * 0.14));
  {
    const neckRow = Math.max(0, Math.min(h - 1, neckY)) * w;
    for (let x = minSubjX; x < coreCenterX; x++) {
      if (alphaCopy[neckRow + x] >= 180) {
        leftNeckX = x;
        break;
      }
    }
  }

  // Background color reference & center face/neck skin reference
  const bgMeanR = bgModels?.global?.meanR ?? 245;
  const bgMeanG = bgModels?.global?.meanG ?? 245;
  const bgMeanB = bgModels?.global?.meanB ?? 245;
  const isLightBg = (0.299 * bgMeanR + 0.587 * bgMeanG + 0.114 * bgMeanB) > 155;
  const subjW = Math.max(1, maxSubjX - minSubjX);

  let skinR = 0, skinG = 0, skinB = 0, skinCount = 0;
  let sideSkinR = 0, sideSkinG = 0, sideSkinB = 0, sideSkinCount = 0;
  for (let y = Math.floor(minY + subjH * 0.22); y <= Math.floor(minY + subjH * 0.50); y += 2) {
    const row = y * w;
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.11)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.11)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 220) {
        const p = idx * 4;
        const sr = pixels[p], sg = pixels[p + 1], sb = pixels[p + 2];
        if (sr > sg && sr > sb && (sr - sb) >= 12) {
          skinR += sr; skinG += sg; skinB += sb; skinCount++;
        }
      }
    }
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.20)); x < Math.max(0, coreCenterX - Math.round(subjW * 0.06)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 230) {
        const p = idx * 4;
        const sr = pixels[p], sg = pixels[p + 1], sb = pixels[p + 2];
        if (sr > sg && sg >= sb * 0.85 && (sr - sb) >= 10) {
          sideSkinR += sr; sideSkinG += sg; sideSkinB += sb; sideSkinCount++;
        }
      }
    }
  }
  const avgSkinR = skinCount > 0 ? skinR / skinCount : 0;
  const avgSkinG = skinCount > 0 ? skinG / skinCount : 0;
  const avgSkinB = skinCount > 0 ? skinB / skinCount : 0;
  const avgSideSkinR = sideSkinCount > 0 ? sideSkinR / sideSkinCount : avgSkinR;
  const avgSideSkinG = sideSkinCount > 0 ? sideSkinG / sideSkinCount : avgSkinG;
  const avgSideSkinB = sideSkinCount > 0 ? sideSkinB / sideSkinCount : avgSkinB;

  // Compute per-column solid shoulder top Y across the entire left shoulder width
  // (ignore background-matched semi-solid halos so faint patches sitting ABOVE the shoulder don't mask real shoulder top)
  const shoulderSolidTopY = new Int32Array(w).fill(h);
  const scanColEnd = Math.min(coreCenterX - 2, leftNeckX + 12);
  const colSearchStart = Math.max(1, Math.min(shoulderStartY, neckY + Math.round(subjH * 0.04)));
  const colSearchEnd = Math.min(h - 6, Math.floor(minY + subjH * 0.88));
  for (let x = minSubjX; x <= scanColEnd; x++) {
    for (let y = colSearchStart; y <= colSearchEnd; y++) {
      const i0 = y * w + x;
      const a0 = pixels[i0 * 4 + 3];
      const a1 = pixels[(i0 + w) * 4 + 3];
      const a2 = pixels[(i0 + w * 2) * 4 + 3];
      if (a0 >= 175 && a1 >= 175 && a2 >= 175) {
        const p0 = i0 * 4;
        const dBg = Math.hypot(pixels[p0] - bgMeanR, pixels[p0 + 1] - bgMeanG, pixels[p0 + 2] - bgMeanB);
        if (a0 >= 205 || dBg > 16) {
          shoulderSolidTopY[x] = y;
          break;
        }
      }
    }
  }

  // 2. Multi-pass sweep along the left perimeter (ear, cheek, jawline, neck, and above-shoulder contour)
  // Using 3 passes across the ear/neck and diagonal above-shoulder bay catches multi-pixel halo patches!
  for (let pass = 0; pass < 3; pass++) {
    const rowBegin = yStart;
    const rowLimit = pass === 0 ? yEnd : Math.min(yEnd, Math.floor(minY + subjH * 0.82));

    for (let y = rowBegin; y <= rowLimit; y++) {
      const row = y * w;
      const isShoulderArea = y >= shoulderStartY;

      // Find left-most non-transparent pixel
      let leftEdgeX = -1;
      for (let x = 0; x < coreCenterX; x++) {
        if (pixels[(row + x) * 4 + 3] > 15) {
          leftEdgeX = x;
          break;
        }
      }

      if (leftEdgeX === -1) continue;

      let scanEnd = Math.min(coreCenterX - 1, leftEdgeX + (isShoulderArea ? 12 : 10));
      if (!isShoulderArea) {
        // In ear/cheek/neck rows, walk inward up to solid face/neck core (4 pixels >= 205), capped to avoid eating shadowed jawline
        const safeFaceCap = Math.min(leftEdgeX + 18, Math.round(coreCenterX - subjW * 0.12));
        const maxScan = Math.max(leftEdgeX + 8, Math.min(coreCenterX - 4, safeFaceCap));
        let solidCoreX = maxScan;
        for (let sx = leftEdgeX; sx < maxScan - 3; sx++) {
          let runOk = true;
          for (let k = 0; k < 4; k++) {
            if (pixels[(row + sx + k) * 4 + 3] < 205) {
              runOk = false;
              break;
            }
          }
          if (runOk) {
            solidCoreX = Math.min(maxScan, sx + 4);
            break;
          }
        }
        scanEnd = Math.max(scanEnd, solidCoreX);
      } else {
        // Above the sloping left shoulder edge, walk inward until reaching solid garment below its diagonal top surface
        const shoulderInnerMax = Math.min(coreCenterX - 2, leftNeckX + 10);
        let slopeSolidX = scanEnd;
        for (let sx = leftEdgeX; sx <= shoulderInnerMax; sx++) {
          const sTop = shoulderSolidTopY[sx];
          if (sTop < h && y >= sTop) {
            slopeSolidX = Math.max(slopeSolidX, sx + 8);
            break;
          }
          slopeSolidX = sx;
        }
        scanEnd = Math.max(scanEnd, Math.min(shoulderInnerMax, slopeSolidX));
      }

      for (let x = Math.max(0, leftEdgeX - 2); x <= scanEnd; x++) {
        const idx = row + x;
        const pIdx = idx * 4;
        const a = pixels[pIdx + 3];

        if (a === 0) continue;

        // Determine whether this pixel sits genuinely ABOVE the left shoulder top surface
        // (Avoid false positive when shoulderSolidTopY[x] === h on tapered outer deltoid edges)
        const sTop = shoulderSolidTopY[x];
        const isAboveSolidShoulder = sTop < h ? y < sTop : y < shoulderStartY + Math.round(subjH * 0.06);

        const r = pixels[pIdx];
        const g = pixels[pIdx + 1];
        const b = pixels[pIdx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Sample 3x3 neighborhood for transparent neighbor count and background sample
        let transparentNeighbors = 0;
        let localBgR = 0, localBgG = 0, localBgB = 0, localBgCount = 0;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const nIdx = ny * w + nx;
            if (pixels[nIdx * 4 + 3] <= 20) {
              transparentNeighbors++;
              const npIdx = nIdx * 4;
              localBgR += pixels[npIdx];
              localBgG += pixels[npIdx + 1];
              localBgB += pixels[npIdx + 2];
              localBgCount++;
            }
          }
        }

        const refR = localBgCount > 0 ? (localBgR / localBgCount) : bgMeanR;
        const refG = localBgCount > 0 ? (localBgG / localBgCount) : bgMeanG;
        const refB = localBgCount > 0 ? (localBgB / localBgCount) : bgMeanB;
        const refLum = 0.299 * refR + 0.587 * refG + 0.114 * refB;
        const distToBg = Math.hypot(r - refR, g - refG, b - refB);
        const chromaToBg = Math.abs((r - g) - (refR - refG)) + Math.abs((g - b) - (refG - refB));
        const lumRatio = lum / Math.max(20, refLum);
        const isWarmTone = r > g && g >= b * 0.85 && (r - b) >= 10;
        const distToSkin = Math.min(
          skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999,
          (sideSkinCount > 0 || skinCount > 0) ? Math.hypot(r - avgSideSkinR, g - avgSideSkinG, b - avgSideSkinB) : 999
        );
        const hasWarmVsBg = (r - b) - (refR - refB) >= 8;
        const isLikelySkin = isWarmTone && ((skinCount === 0 && sideSkinCount === 0) ? distToBg > 18 : (distToSkin < distToBg * 0.96 || (distToSkin <= 30 && distToBg > 18) || (hasWarmVsBg && distToBg > 20)));
        const isDarkHair = lum < 85 && refLum > 110 && distToBg > 24;
        const touchesExterior = transparentNeighbors >= 1;

        // Along the outer left shoulder edge: strip genuine background halos clinging to the outside
        // & decontaminate surviving boundary pixels symmetrically with right shoulder without ever biting real fabric!
        if (isShoulderArea && !isAboveSolidShoulder) {
          if (a >= 230 || !touchesExterior) continue;
          let shR = 0, shG = 0, shB = 0, shCnt = 0;
          let stR = 0, stG = 0, stB = 0, stCnt = 0;
          let minPatchDist = 999;
          for (let sy = y; sy <= Math.min(h - 1, y + 10); sy += 2) {
            const sRow = sy * w;
            for (let step = 2; step <= 20 && x + step <= coreCenterX - 2; step += 2) {
              const inIdx = sRow + x + step;
              if (pixels[inIdx * 4 + 3] >= 195) {
                const inp = inIdx * 4;
                const sr = pixels[inp], sg = pixels[inp + 1], sb = pixels[inp + 2];
                shR += sr; shG += sg; shB += sb; shCnt++;
                const d = Math.hypot(r - sr, g - sg, b - sb);
                if (d < minPatchDist) minPatchDist = d;
                if (d <= 45) {
                  stR += sr; stG += sg; stB += sb; stCnt++;
                }
              }
            }
          }
          const avgShR = stCnt >= 2 ? stR / stCnt : (shCnt > 0 ? shR / shCnt : r);
          const avgShG = stCnt >= 2 ? stG / stCnt : (shCnt > 0 ? shG / shCnt : g);
          const avgShB = stCnt >= 2 ? stB / stCnt : (shCnt > 0 ? shB / shCnt : b);
          const distToSh = Math.min(minPatchDist, shCnt > 0 ? Math.hypot(r - avgShR, g - avgShG, b - avgShB) : 999);

          const isDarkJacketRim = isDarkHair && (shCnt === 0 || distToSh <= distToBg * 1.15) && a >= 115;
          const matchesLeftGarment = shCnt > 0 && distToSh <= 38 && (distToSh <= distToBg * 1.05 || a >= 115);

          if (
            a < 54 ||
            (!isLikelySkin &&
              !isDarkJacketRim &&
              !matchesLeftGarment &&
              a < 115 &&
              ((distToBg < 26 && (shCnt === 0 || distToBg < distToSh * 0.68)) ||
                (chromaToBg <= 13 && lumRatio >= 0.55 && lumRatio <= 1.12 && distToBg < 34 && distToSh > 34)))
          ) {
            pixels[pIdx + 3] = 0;
          } else if (shCnt > 0 && a < 245 && distToBg < Math.max(45, distToSh * 1.3) && distToSh > 12) {
            const blend = Math.min(0.88, (1 - a / 255.0) + 0.35);
            pixels[pIdx] = Math.round(r * (1 - blend) + avgShR * blend);
            pixels[pIdx + 1] = Math.round(g * (1 - blend) + avgShG * blend);
            pixels[pIdx + 2] = Math.round(b * (1 - blend) + avgShB * blend);
          }
          continue;
        }

        // In the concave zone above the solid shoulder top, never cut dark hair or real skin or solid pixels >= 190
        if (isShoulderArea && isAboveSolidShoulder && (a >= 190 || isDarkHair || (isLikelySkin && a >= 85))) {
          continue;
        }

        // Rule A: Faint boundary noise or outer halo on left edge of ear/cheek/neck/collar
        if (touchesExterior && a < 115 && !isDarkHair && !(isLikelySkin && a >= 75)) {
          pixels[pIdx + 3] = 0;
          continue;
        }

        // Rule B: Left ear/cheek/neck/collar perimeter pixel matching background color OR shadowed wall (never cut warm shadowed skin)
        if (
          touchesExterior &&
          !isLikelySkin &&
          !hasWarmVsBg &&
          !isDarkHair &&
          a < 195 &&
          (distToBg < 34 || (chromaToBg <= 14 && lumRatio >= 0.52 && lumRatio <= 1.14 && distToBg < 48))
        ) {
          pixels[pIdx + 3] = 0;
          continue;
        }

        // Rule C: Light/neutral background bleed on ear/cheek/neck/collar boundary
        if (isLightBg && touchesExterior && !isLikelySkin && !hasWarmVsBg && !isDarkHair && lum > 160 && (distToBg < 46 || (Math.abs(r - g) <= 14 && Math.abs(g - b) <= 14))) {
          if (a < 185) {
            pixels[pIdx + 3] = 0;
            continue;
          }
        }

        // Rule D: Crevices/corners along ear, cheek, neck & collar pocket (multiple transparent neighbors)
        if (transparentNeighbors >= 3 && !(isLikelySkin && a >= 95) && !isDarkHair && a < 165) {
          pixels[pIdx + 3] = 0;
          continue;
        }

        // Rule E: Inpaint/Decontaminate surviving edge pixels on ear/cheek/neck/collar
        if (pass === 2 && touchesExterior && a >= 135 && distToBg < 60) {
          let interiorR = 0, interiorG = 0, interiorB = 0, interiorCount = 0;
          for (let step = 2; step <= 5; step++) {
            const inX = x + step;
            if (inX < w) {
              const inIdx = row + inX;
              if (pixels[inIdx * 4 + 3] >= 220) {
                const inpIdx = inIdx * 4;
                interiorR += pixels[inpIdx];
                interiorG += pixels[inpIdx + 1];
                interiorB += pixels[inpIdx + 2];
                interiorCount++;
              }
            }
            if (isAboveSolidShoulder && y + step < h) {
              const dnIdx = (y + step) * w + x;
              if (pixels[dnIdx * 4 + 3] >= 220) {
                const dnpIdx = dnIdx * 4;
                interiorR += pixels[dnpIdx];
                interiorG += pixels[dnpIdx + 1];
                interiorB += pixels[dnpIdx + 2];
                interiorCount++;
              }
            }
          }

          if (interiorCount > 0) {
            const avgInR = interiorR / interiorCount;
            const avgInG = interiorG / interiorCount;
            const avgInB = interiorB / interiorCount;

            const blendFactor = Math.min(0.85, (1 - a / 255.0) + 0.35);
            pixels[pIdx] = Math.round(r * (1 - blendFactor) + avgInR * blendFactor);
            pixels[pIdx + 1] = Math.round(g * (1 - blendFactor) + avgInG * blendFactor);
            pixels[pIdx + 2] = Math.round(b * (1 - blendFactor) + avgInB * blendFactor);
          }
        }
      }
    }
  }

  // 3. Dedicated Top-Down Vertical Continuity Sweep Strictly ABOVE the Solid Left Shoulder Contour:
  // Eliminates multi-pixel halo bands, background patches & shadows sitting directly ABOVE the left shoulder edge
  // while stopping cleanly at the diagonal solid garment edge so the shoulder itself is 100% preserved!
  const vertStartY = Math.max(1, neckY - Math.round(subjH * 0.06));
  for (let x = Math.max(0, minSubjX - 2); x <= Math.min(coreCenterX - 3, leftNeckX + 8); x++) {
    const sTop = shoulderSolidTopY[x];
    // Strictly stop BEFORE sTop so solid shoulder stays intact
    const sweepEnd = Math.min(h - 2, sTop < h ? sTop - 1 : Math.floor(minY + subjH * 0.85));
    if (sweepEnd <= vertStartY) continue;

    // Sample column exterior background above the shoulder top (including adjacent columns if thin)
    let cBgR = 0, cBgG = 0, cBgB = 0, cBgCnt = 0;
    for (let sy = Math.max(0, vertStartY - 12); sy < sweepEnd; sy += 2) {
      for (let sx = Math.max(0, x - 3); sx <= Math.min(coreCenterX - 2, x + 3); sx += 2) {
        const idx = sy * w + sx;
        if (pixels[idx * 4 + 3] <= 15) {
          const p = idx * 4;
          cBgR += pixels[p]; cBgG += pixels[p + 1]; cBgB += pixels[p + 2];
          cBgCnt++;
        }
      }
    }
    const locBgR = cBgCnt >= 2 ? cBgR / cBgCnt : bgMeanR;
    const locBgG = cBgCnt >= 2 ? cBgG / cBgCnt : bgMeanG;
    const locBgB = cBgCnt >= 2 ? cBgB / cBgCnt : bgMeanB;
    const locBgLum = 0.299 * locBgR + 0.587 * locBgG + 0.114 * locBgB;

    // Sample solid shoulder fabric right below sTop (never cut pixels matching shoulder garment!)
    let shR = 0, shG = 0, shB = 0, shCnt = 0;
    if (sTop < h - 8) {
      for (let sy = sTop + 2; sy <= Math.min(h - 1, sTop + 12); sy += 2) {
        const idx = sy * w + x;
        if (pixels[idx * 4 + 3] >= 215) {
          const p = idx * 4;
          shR += pixels[p]; shG += pixels[p + 1]; shB += pixels[p + 2];
          shCnt++;
        }
      }
    }
    const avgShR = shCnt > 0 ? shR / shCnt : 0;
    const avgShG = shCnt > 0 ? shG / shCnt : 0;
    const avgShB = shCnt > 0 ? shB / shCnt : 0;

    // Top-down vertical continuity walk starting from exterior air above the shoulder
    let inExteriorFromTop = pixels[((vertStartY - 1) * w + x) * 4 + 3] <= 25;
    for (let y = vertStartY; y <= sweepEnd; y++) {
      const idx = y * w + x;
      const pIdx = idx * 4;
      const a = pixels[pIdx + 3];
      if (a <= 25) {
        pixels[pIdx + 3] = 0;
        inExteriorFromTop = true;
        continue;
      }
      if (!inExteriorFromTop) {
        // Also seed from immediate left exterior pixel on same row
        if (x > 0 && pixels[(idx - 1) * 4 + 3] <= 25) {
          inExteriorFromTop = true;
        } else {
          continue;
        }
      }

      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const distBg = Math.hypot(r - locBgR, g - locBgG, b - locBgB);
      const chromaBg = Math.abs((r - g) - (locBgR - locBgG)) + Math.abs((g - b) - (locBgG - locBgB));
      const lumRatio = lum / Math.max(20, locBgLum);
      const isWarmTone = r > g && g >= b * 0.85 && (r - b) >= 14;
      const distSkin = skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
      const isLikelySkin = isWarmTone && (skinCount === 0 ? distBg > 22 : (distSkin < distBg * 0.90 || distSkin <= 26));
      const distSh = shCnt > 0 ? Math.hypot(r - avgShR, g - avgShG, b - avgShB) : 999;
      const isDarkHair = lum < 85 && locBgLum > 110 && distBg > 24;

      if (isLikelySkin || isDarkHair) {
        inExteriorFromTop = false;
        continue;
      }
      if (shCnt > 0 && distSh <= 36) {
        inExteriorFromTop = false;
        continue;
      }

      const isAboveShoulderHalo =
        a < 95 ||
        (a < 155 &&
          (distBg <= 32 ||
            (shCnt > 0 && distBg < distSh * 0.78 && distBg <= 42) ||
            (chromaBg <= 13 && lumRatio >= 0.55 && lumRatio <= 1.12 && distBg <= 42)));

      if (isAboveShoulderHalo) {
        pixels[pIdx + 3] = 0;
      } else {
        inExteriorFromTop = false;
      }
    }
  }

  // 4. Symmetric Right-Shoulder Halo Sweep & Top-Down Vertical Continuity Walk Above Right Shoulder
  let rightNeckX = Math.min(maxSubjX, Math.round(coreCenterX + subjH * 0.14));
  {
    const neckRow = Math.max(0, Math.min(h - 1, neckY)) * w;
    for (let x = maxSubjX; x > coreCenterX; x--) {
      if (alphaCopy[neckRow + x] >= 180) {
        rightNeckX = x;
        break;
      }
    }
  }

  const rightShoulderTopY = new Int32Array(w).fill(h);
  const rColStart = Math.max(coreCenterX + 2, rightNeckX - 12);
  for (let x = rColStart; x <= maxSubjX; x++) {
    for (let y = colSearchStart; y <= colSearchEnd; y++) {
      const i0 = y * w + x;
      const a0 = pixels[i0 * 4 + 3];
      const a1 = pixels[(i0 + w) * 4 + 3];
      if (a0 >= 145 && a1 >= 145) {
        const p0 = i0 * 4;
        const dBg = Math.hypot(pixels[p0] - bgMeanR, pixels[p0 + 1] - bgMeanG, pixels[p0 + 2] - bgMeanB);
        if (a0 >= 185 || dBg > 16) {
          rightShoulderTopY[x] = y;
          break;
        }
      }
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    const rowLimit = pass === 0 ? yEnd : Math.min(yEnd, Math.floor(minY + subjH * 0.84));
    for (let y = shoulderStartY; y <= rowLimit; y++) {
      const row = y * w;
      let rightEdgeX = -1;
      for (let x = w - 1; x > coreCenterX; x--) {
        if (pixels[(row + x) * 4 + 3] > 15) {
          rightEdgeX = x;
          break;
        }
      }
      if (rightEdgeX === -1) continue;

      let scanStart = Math.max(coreCenterX + 1, rightEdgeX - 12);
      const rInnerMin = Math.max(coreCenterX + 2, rightNeckX - 10);
      let slopeSolidX = scanStart;
      for (let sx = rightEdgeX; sx >= rInnerMin; sx--) {
        const rTop = rightShoulderTopY[sx];
        if (rTop < h && y >= rTop) {
          slopeSolidX = Math.min(slopeSolidX, sx - 8);
          break;
        }
        slopeSolidX = sx;
      }
      scanStart = Math.min(scanStart, Math.max(rInnerMin, slopeSolidX));

      for (let x = Math.min(w - 1, rightEdgeX + 2); x >= scanStart; x--) {
        const idx = row + x;
        const pIdx = idx * 4;
        const a = pixels[pIdx + 3];
        if (a === 0 || a >= 232) continue;

        const rTop = rightShoulderTopY[x];
        const isAboveRightSh = rTop < h ? y < rTop : y < shoulderStartY + Math.round(subjH * 0.04);

        let transparentNeighbors = 0;
        let localBgR = 0, localBgG = 0, localBgB = 0, localBgCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const nIdx = ny * w + nx;
            if (pixels[nIdx * 4 + 3] <= 20) {
              transparentNeighbors++;
              const npIdx = nIdx * 4;
              localBgR += pixels[npIdx];
              localBgG += pixels[npIdx + 1];
              localBgB += pixels[npIdx + 2];
              localBgCount++;
            }
          }
        }
        if (transparentNeighbors === 0) continue;

        const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const refR = localBgCount > 0 ? localBgR / localBgCount : bgMeanR;
        const refG = localBgCount > 0 ? localBgG / localBgCount : bgMeanG;
        const refB = localBgCount > 0 ? localBgB / localBgCount : bgMeanB;
        const refLum = 0.299 * refR + 0.587 * refG + 0.114 * refB;
        const distToBg = Math.hypot(r - refR, g - refG, b - refB);
        const chromaToBg = Math.abs((r - g) - (refR - refG)) + Math.abs((g - b) - (refG - refB));
        const lumRatio = lum / Math.max(20, refLum);
        const isWarmTone = r > g && g >= b * 0.85 && (r - b) >= 10;
        const distToSkin = Math.min(
          skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999,
          (sideSkinCount > 0 || skinCount > 0) ? Math.hypot(r - avgSideSkinR, g - avgSideSkinG, b - avgSideSkinB) : 999
        );
        const hasWarmVsBg = (r - b) - (refR - refB) >= 8;
        const isLikelySkin = isWarmTone && ((skinCount === 0 && sideSkinCount === 0) ? distToBg > 18 : (distToSkin < distToBg * 0.96 || (distToSkin <= 30 && distToBg > 18) || (hasWarmVsBg && distToBg > 20)));
        const isDarkHair = lum < 85 && refLum > 110 && distToBg > 24;

        let shR = 0, shG = 0, shB = 0, shCnt = 0;
        for (let sy = y; sy <= Math.min(h - 1, y + 10); sy += 2) {
          const sRow = sy * w;
          for (let step = 2; step <= 20 && x - step >= coreCenterX + 2; step += 2) {
            const inIdx = sRow + x - step;
            if (pixels[inIdx * 4 + 3] >= 195) {
              const inp = inIdx * 4;
              shR += pixels[inp]; shG += pixels[inp + 1]; shB += pixels[inp + 2]; shCnt++;
            }
          }
        }
        const avgShR = shCnt > 0 ? shR / shCnt : r;
        const avgShG = shCnt > 0 ? shG / shCnt : g;
        const avgShB = shCnt > 0 ? shB / shCnt : b;
        const distToSh = shCnt > 0 ? Math.hypot(r - avgShR, g - avgShG, b - avgShB) : 999;

        const isDarkJacketRim = isDarkHair && (isAboveRightSh || ((shCnt === 0 || distToSh <= distToBg * 1.15) && a >= 115));
        const matchesRightGarment = shCnt > 0 && distToSh <= 38 && (distToSh <= distToBg * 1.05 || a >= 115);
        const onCurvedTopRim = rTop < h && y >= rTop - 2 && matchesRightGarment && a >= 55;
        if (isAboveRightSh && (a >= 190 || isDarkHair || onCurvedTopRim || matchesRightGarment || (isLikelySkin && a >= 85))) {
          if (shCnt > 0 && a < 245 && (onCurvedTopRim || matchesRightGarment)) {
            const blend = Math.min(0.90, (1 - a / 255.0) + 0.40);
            pixels[pIdx] = Math.round(r * (1 - blend) + avgShR * blend);
            pixels[pIdx + 1] = Math.round(g * (1 - blend) + avgShG * blend);
            pixels[pIdx + 2] = Math.round(b * (1 - blend) + avgShB * blend);
          }
          continue;
        }

        if (isAboveRightSh && rTop < h && y < rTop - 2) {
          if (
            a < 105 ||
            (!isLikelySkin &&
              !hasWarmVsBg &&
              !isDarkHair &&
              a < 185 &&
              (distToBg < 32 || (chromaToBg <= 14 && lumRatio >= 0.52 && lumRatio <= 1.14 && distToBg < 46 && (shCnt === 0 || distToSh > 34)))) ||
            (transparentNeighbors >= 3 && !isLikelySkin && !isDarkHair && a < 155)
          ) {
            pixels[pIdx + 3] = 0;
          } else if (shCnt > 0 && a < 245 && distToBg < distToSh * 1.25) {
            const blend = Math.min(0.90, (1 - a / 255.0) + 0.40);
            pixels[pIdx] = Math.round(r * (1 - blend) + avgShR * blend);
            pixels[pIdx + 1] = Math.round(g * (1 - blend) + avgShG * blend);
            pixels[pIdx + 2] = Math.round(b * (1 - blend) + avgShB * blend);
          }
          continue;
        }

        if (
          a < 54 ||
          (!isLikelySkin &&
            !isDarkJacketRim &&
            !matchesRightGarment &&
            a < 115 &&
            ((distToBg < 26 && (shCnt === 0 || distToBg < distToSh * 0.68)) ||
              (chromaToBg <= 13 && lumRatio >= 0.55 && lumRatio <= 1.12 && distToBg < 34 && distToSh > 34)))
        ) {
          pixels[pIdx + 3] = 0;
        } else if (shCnt > 0 && a < 245 && distToBg < Math.max(45, distToSh * 1.3)) {
          const blend = Math.min(0.90, (1 - a / 255.0) + 0.40);
          pixels[pIdx] = Math.round(r * (1 - blend) + avgShR * blend);
          pixels[pIdx + 1] = Math.round(g * (1 - blend) + avgShG * blend);
          pixels[pIdx + 2] = Math.round(b * (1 - blend) + avgShB * blend);
        }
      }
    }
  }

  for (let x = Math.max(coreCenterX + 3, rightNeckX - 8); x <= Math.min(w - 1, maxSubjX + 2); x++) {
    const rTop = rightShoulderTopY[x];
    const sweepEnd = Math.min(h - 2, rTop < h ? rTop - 1 : shoulderStartY + Math.round(subjH * 0.08));
    if (sweepEnd <= vertStartY) continue;

    let cBgR = 0, cBgG = 0, cBgB = 0, cBgCnt = 0;
    for (let sy = Math.max(0, vertStartY - 12); sy < sweepEnd; sy += 2) {
      for (let sx = Math.max(coreCenterX + 2, x - 3); sx <= Math.min(w - 1, x + 3); sx += 2) {
        const idx = sy * w + sx;
        if (pixels[idx * 4 + 3] <= 15) {
          const p = idx * 4;
          cBgR += pixels[p]; cBgG += pixels[p + 1]; cBgB += pixels[p + 2];
          cBgCnt++;
        }
      }
    }
    const locBgR = cBgCnt >= 2 ? cBgR / cBgCnt : bgMeanR;
    const locBgG = cBgCnt >= 2 ? cBgG / cBgCnt : bgMeanG;
    const locBgB = cBgCnt >= 2 ? cBgB / cBgCnt : bgMeanB;
    const locBgLum = 0.299 * locBgR + 0.587 * locBgG + 0.114 * locBgB;

    let shR = 0, shG = 0, shB = 0, shCnt = 0;
    if (rTop < h - 8) {
      for (let sy = rTop + 2; sy <= Math.min(h - 1, rTop + 12); sy += 2) {
        const idx = sy * w + x;
        if (pixels[idx * 4 + 3] >= 215) {
          const p = idx * 4;
          shR += pixels[p]; shG += pixels[p + 1]; shB += pixels[p + 2];
          shCnt++;
        }
      }
    }
    const avgShR = shCnt > 0 ? shR / shCnt : 0;
    const avgShG = shCnt > 0 ? shG / shCnt : 0;
    const avgShB = shCnt > 0 ? shB / shCnt : 0;

    let inExteriorFromTop = pixels[((vertStartY - 1) * w + x) * 4 + 3] <= 25;
    for (let y = vertStartY; y <= sweepEnd; y++) {
      const idx = y * w + x;
      const pIdx = idx * 4;
      const a = pixels[pIdx + 3];
      if (a <= 25) {
        pixels[pIdx + 3] = 0;
        inExteriorFromTop = true;
        continue;
      }
      if (!inExteriorFromTop) {
        if (x < w - 1 && pixels[(idx + 1) * 4 + 3] <= 25) {
          inExteriorFromTop = true;
        } else {
          continue;
        }
      }

      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const distBg = Math.hypot(r - locBgR, g - locBgG, b - locBgB);
      const chromaBg = Math.abs((r - g) - (locBgR - locBgG)) + Math.abs((g - b) - (locBgG - locBgB));
      const lumRatio = lum / Math.max(20, locBgLum);
      const isWarmTone = r > g && g >= b * 0.85 && (r - b) >= 14;
      const distSkin = skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
      const isLikelySkin = isWarmTone && (skinCount === 0 ? distBg > 22 : (distSkin < distBg * 0.90 || distSkin <= 26));
      const distSh = shCnt > 0 ? Math.hypot(r - avgShR, g - avgShG, b - avgShB) : 999;
      const isDarkHair = lum < 85 && locBgLum > 110 && distBg > 24;

      if (isLikelySkin || isDarkHair) {
        inExteriorFromTop = false;
        continue;
      }
      if (shCnt > 0 && distSh <= 36) {
        inExteriorFromTop = false;
        continue;
      }

      const isAboveShoulderHalo =
        a < 95 ||
        (a < 155 &&
          (distBg <= 32 ||
            (shCnt > 0 && distBg < distSh * 0.78 && distBg <= 42) ||
            (chromaBg <= 13 && lumRatio >= 0.55 && lumRatio <= 1.12 && distBg <= 42)));

      if (isAboveShoulderHalo) {
        pixels[pIdx + 3] = 0;
      } else {
        inExteriorFromTop = false;
      }
    }
  }
}

/**
 * Quality Control Pass.
 * Ensures the subject core is 100% solid, eliminates residual background fog/speckles and isolated artifacts.
 */
function qualityControlPerimeterPass(
  pixels: Uint8ClampedArray,
  w: number,
  h: number
) {
  const total = w * h;
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = pixels[i * 4 + 3];
  }

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x;
      const pIdx = idx * 4;
      const a = alphaCopy[idx];

      if (a === 0) continue;

      const isUpper = y < h * 0.55;
      const hazeCutoff = isUpper ? 34 : 30;
      const solidCutoff = isUpper ? 230 : 195;

      if (a < hazeCutoff) {
        pixels[pIdx + 3] = 0;
      } else if (a > solidCutoff) {
        const aUp = y > 0 ? alphaCopy[idx - w] : 0;
        const aDown = y < h - 1 ? alphaCopy[idx + w] : 0;
        const aLeft = x > 0 ? alphaCopy[idx - 1] : 0;
        const aRight = x < w - 1 ? alphaCopy[idx + 1] : 0;
        if (aUp > 20 && aDown > 20 && aLeft > 20 && aRight > 20) {
          pixels[pIdx + 3] = 255;
        }
      } else if (a < 95) {
        // Remove isolated floating semi-transparent background speckles far from confident core
        let nearSubject = false;
        const radius = 6;
        const startY = Math.max(0, y - radius);
        const endY = Math.min(h - 1, y + radius);
        const startX = Math.max(0, x - radius);
        const endX = Math.min(w - 1, x + radius);

        for (let ny = startY; ny <= endY; ny++) {
          const nRow = ny * w;
          for (let nx = startX; nx <= endX; nx++) {
            if (alphaCopy[nRow + nx] >= 165) {
              nearSubject = true;
              break;
            }
          }
          if (nearSubject) break;
        }

        if (!nearSubject) {
          pixels[pIdx + 3] = 0;
        }
      }
    }
  }
}

/**
 * Multi-Color Spatial Background Palette & Exterior Patch Sweeper:
 * Eliminates leftover semi-transparent color patches, shadowed wall blotches,
 * curtain/furniture edge smears, and faint background clouds anywhere around
 * the 360-degree subject perimeter without ever nibbling into solid shoulders,
 * dark hair wisps, skin, or white/check garments.
 */
function cleanResidualBackgroundPatchesAndObjects(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  bgModels?: BackgroundModels,
  hasOriginalRgb = true,
  isolateAll = false
) {
  const total = w * h;
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = pixels[i * 4 + 3];
  }

  let minX = w, maxX = 0, minY = h, maxY = 0;
  let massCenterX = 0, subjCount = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphaCopy[row + x] > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        massCenterX += x;
        subjCount++;
      }
    }
  }
  if (subjCount < 150 || maxX <= minX || maxY <= minY) return;

  const coreCenterX = Math.round(massCenterX / subjCount);
  const subjW = maxX - minX;
  const subjH = maxY - minY;

  // Locate neck Y cleanly
  let neckY = Math.floor(minY + subjH * 0.46);
  let minSpan = Infinity;
  for (let y = Math.floor(minY + subjH * 0.28); y <= Math.floor(minY + subjH * 0.56); y++) {
    const row = y * w;
    let l = -1, r = -1;
    for (let x = minX; x <= maxX; x++) {
      if (alphaCopy[row + x] >= 165) { l = x; break; }
    }
    for (let x = maxX; x >= minX; x--) {
      if (alphaCopy[row + x] >= 165) { r = x; break; }
    }
    if (l !== -1 && r > l && (r - l) < minSpan) {
      minSpan = r - l;
      neckY = y;
    }
  }
  const shoulderStartY = Math.min(
    Math.floor(minY + subjH * 0.56),
    Math.max(Math.floor(minY + subjH * 0.43), neckY + Math.round(subjH * 0.04))
  );

  // Sample face skin + center chest garment + outer sleeves (handles two-tone coats)
  let skinR = 0, skinG = 0, skinB = 0, skinCnt = 0;
  for (let y = Math.floor(minY + subjH * 0.22); y <= Math.floor(minY + subjH * 0.48); y += 2) {
    const row = y * w;
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.11)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.11)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 220) {
        const p = idx * 4;
        const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        if (r > g && r > b && (r - b) >= 14) {
          skinR += r; skinG += g; skinB += b; skinCnt++;
        }
      }
    }
  }
  const avgSkinR = skinCnt > 0 ? skinR / skinCnt : 0;
  const avgSkinG = skinCnt > 0 ? skinG / skinCnt : 0;
  const avgSkinB = skinCnt > 0 ? skinB / skinCnt : 0;

  let garR = 0, garG = 0, garB = 0, garCnt = 0;
  let lSlvR = 0, lSlvG = 0, lSlvB = 0, lSlvCnt = 0;
  let rSlvR = 0, rSlvG = 0, rSlvB = 0, rSlvCnt = 0;
  let lightGarCnt = 0, checkGarCnt = 0, totalGarSamples = 0;
  const gStartY = Math.max(shoulderStartY, Math.floor(minY + subjH * 0.56));
  const gEndY = Math.min(h - 3, Math.floor(minY + subjH * 0.90));
  for (let y = gStartY; y <= gEndY; y += 3) {
    const row = y * w;
    let rowL = -1, rowR = -1;
    for (let x = minX; x <= maxX; x++) if (alphaCopy[row + x] >= 180) { rowL = x; break; }
    for (let x = maxX; x >= minX; x--) if (alphaCopy[row + x] >= 180) { rowR = x; break; }
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.16)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.16)); x += 3) {
      const idx = row + x;
      if (alphaCopy[idx] >= 200) {
        const p = idx * 4;
        const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        garR += r; garG += g; garB += b; garCnt++;
        if ((lum >= 132 && Math.max(r, g, b) - Math.min(r, g, b) <= 82) || lum >= 175) lightGarCnt++;
        const rIdx = (row + Math.min(w - 1, x + 3)) * 4;
        const lumR = 0.299 * pixels[rIdx] + 0.587 * pixels[rIdx + 1] + 0.114 * pixels[rIdx + 2];
        if (Math.abs(lum - lumR) >= 12) checkGarCnt++;
        totalGarSamples++;
      }
    }
    if (rowL !== -1 && rowR > rowL + 24) {
      for (let sx = rowL + 4; sx <= Math.min(rowR - 4, rowL + 20); sx += 3) {
        if (alphaCopy[row + sx] >= 195) {
          const p = (row + sx) * 4;
          lSlvR += pixels[p]; lSlvG += pixels[p + 1]; lSlvB += pixels[p + 2]; lSlvCnt++;
        }
      }
      for (let sx = Math.max(rowL + 4, rowR - 20); sx <= rowR - 4; sx += 3) {
        if (alphaCopy[row + sx] >= 195) {
          const p = (row + sx) * 4;
          rSlvR += pixels[p]; rSlvG += pixels[p + 1]; rSlvB += pixels[p + 2]; rSlvCnt++;
        }
      }
    }
  }
  const avgGarR = garCnt > 0 ? garR / garCnt : 128;
  const avgGarG = garCnt > 0 ? garG / garCnt : 128;
  const avgGarB = garCnt > 0 ? garB / garCnt : 128;
  const avgLSlvR = lSlvCnt > 4 ? lSlvR / lSlvCnt : avgGarR;
  const avgLSlvG = lSlvCnt > 4 ? lSlvG / lSlvCnt : avgGarG;
  const avgLSlvB = lSlvCnt > 4 ? lSlvB / lSlvCnt : avgGarB;
  const avgRSlvR = rSlvCnt > 4 ? rSlvR / rSlvCnt : avgGarR;
  const avgRSlvG = rSlvCnt > 4 ? rSlvG / rSlvCnt : avgGarG;
  const avgRSlvB = rSlvCnt > 4 ? rSlvB / rSlvCnt : avgGarB;
  const isWhiteOrCheck = totalGarSamples > 12 && (lightGarCnt / totalGarSamples >= 0.14 || checkGarCnt / totalGarSamples >= 0.035);

  // Build 24px spatial local background grid + quantized multi-color exterior border palette (<= 24 clusters)
  const cellSz = 24;
  const gCols = Math.max(1, Math.ceil(w / cellSz));
  const gRows = Math.max(1, Math.ceil(h / cellSz));
  const gSumR = new Float32Array(gCols * gRows);
  const gSumG = new Float32Array(gCols * gRows);
  const gSumB = new Float32Array(gCols * gRows);
  const gCnt = new Int32Array(gCols * gRows);

  const palR: number[] = [];
  const palG: number[] = [];
  const palB: number[] = [];
  const palCnt: number[] = [];

  for (let y = 0; y < h; y += 2) {
    const gy = Math.min(gRows - 1, Math.floor(y / cellSz));
    const row = y * w;
    for (let x = 0; x < w; x += 2) {
      const idx = row + x;
      const a = alphaCopy[idx];
      const isExtSample = hasOriginalRgb ? a <= 15 : (a > 5 && a < 110);
      if (!isExtSample) continue;
      const p = idx * 4;
      const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
      const cIdx = gy * gCols + Math.min(gCols - 1, Math.floor(x / cellSz));
      gSumR[cIdx] += r; gSumG[cIdx] += g; gSumB[cIdx] += b; gCnt[cIdx]++;

      if ((x % 4 === 0) && (y % 4 === 0)) {
        let matched = false;
        for (let k = 0; k < palR.length; k++) {
          const d = Math.hypot(r - palR[k], g - palG[k], b - palB[k]);
          if (d <= 28) {
            const n = palCnt[k] + 1;
            palR[k] = (palR[k] * palCnt[k] + r) / n;
            palG[k] = (palG[k] * palCnt[k] + g) / n;
            palB[k] = (palB[k] * palCnt[k] + b) / n;
            palCnt[k] = n;
            matched = true;
            break;
          }
        }
        if (!matched && palR.length < 24) {
          palR.push(r); palG.push(g); palB.push(b); palCnt.push(1);
        }
      }
    }
  }

  const fbBgR = bgModels?.global?.meanR ?? 245;
  const fbBgG = bgModels?.global?.meanG ?? 245;
  const fbBgB = bgModels?.global?.meanB ?? 245;
  const cellBgR = new Float32Array(gCols * gRows);
  const cellBgG = new Float32Array(gCols * gRows);
  const cellBgB = new Float32Array(gCols * gRows);
  const cellDist = new Int32Array(gCols * gRows);

  for (let i = 0; i < gCols * gRows; i++) {
    if (gCnt[i] >= 3) {
      cellBgR[i] = gSumR[i] / gCnt[i];
      cellBgG[i] = gSumG[i] / gCnt[i];
      cellBgB[i] = gSumB[i] / gCnt[i];
      cellDist[i] = 0;
    } else {
      cellBgR[i] = fbBgR;
      cellBgG[i] = fbBgG;
      cellBgB[i] = fbBgB;
      cellDist[i] = 9999;
    }
  }

  // Propagate nearest populated local background color across the grid
  for (let gy = 0; gy < gRows; gy++) {
    for (let gx = 0; gx < gCols; gx++) {
      const i = gy * gCols + gx;
      if (cellDist[i] === 0) continue;
      if (gx > 0 && cellDist[i - 1] + 1 < cellDist[i]) {
        cellDist[i] = cellDist[i - 1] + 1;
        cellBgR[i] = cellBgR[i - 1]; cellBgG[i] = cellBgG[i - 1]; cellBgB[i] = cellBgB[i - 1];
      }
      if (gy > 0 && cellDist[i - gCols] + 1 < cellDist[i]) {
        cellDist[i] = cellDist[i - gCols] + 1;
        cellBgR[i] = cellBgR[i - gCols]; cellBgG[i] = cellBgG[i - gCols]; cellBgB[i] = cellBgB[i - gCols];
      }
    }
  }
  for (let gy = gRows - 1; gy >= 0; gy--) {
    for (let gx = gCols - 1; gx >= 0; gx--) {
      const i = gy * gCols + gx;
      if (cellDist[i] === 0) continue;
      if (gx < gCols - 1 && cellDist[i + 1] + 1 < cellDist[i]) {
        cellDist[i] = cellDist[i + 1] + 1;
        cellBgR[i] = cellBgR[i + 1]; cellBgG[i] = cellBgG[i + 1]; cellBgB[i] = cellBgB[i + 1];
      }
      if (gy < gRows - 1 && cellDist[i + gCols] + 1 < cellDist[i]) {
        cellDist[i] = cellDist[i + gCols] + 1;
        cellBgR[i] = cellBgR[i + gCols]; cellBgG[i] = cellBgG[i + gCols]; cellBgB[i] = cellBgB[i + gCols];
      }
    }
  }

  const minPaletteDist = (r: number, g: number, b: number) => {
    let best = 999;
    for (let k = 0; k < palR.length; k++) {
      if (palCnt[k] < 2) continue;
      const d = Math.hypot(r - palR[k], g - palG[k], b - palB[k]);
      if (d < best) best = d;
    }
    return best;
  };

  // Distance transform from confident solid core (>= 195 upper, >= 165 lower)
  const solidDist = new Uint8Array(total);
  solidDist.fill(40);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const solidMin = y >= shoulderStartY ? 165 : 195;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (alphaCopy[i] >= solidMin) {
        solidDist[i] = 0;
      } else {
        let d = 40;
        if (x > 0) d = Math.min(d, solidDist[i - 1] + 1);
        if (y > 0) d = Math.min(d, solidDist[i - w] + 1);
        solidDist[i] = d;
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    const row = y * w;
    for (let x = w - 1; x >= 0; x--) {
      const i = row + x;
      let d = solidDist[i];
      if (x < w - 1) d = Math.min(d, solidDist[i + 1] + 1);
      if (y < h - 1) d = Math.min(d, solidDist[i + w] + 1);
      solidDist[i] = d;
    }
  }

  // Pass 1: Strip lingering semi-transparent haze clouds & distant color blotches
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const gy = Math.min(gRows - 1, Math.floor(y / cellSz));
    const isUpper = y < shoulderStartY;

    for (let x = 0; x < w; x++) {
      const i = row + x;
      const a = pixels[i * 4 + 3];
      if (a === 0 || a >= 175) continue;

      const p = i * 4;
      const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const cIdx = gy * gCols + Math.min(gCols - 1, Math.floor(x / cellSz));
      const lBgR = cellBgR[cIdx], lBgG = cellBgG[cIdx], lBgB = cellBgB[cIdx];
      const lBgLum = 0.299 * lBgR + 0.587 * lBgG + 0.114 * lBgB;
      const distLocal = Math.hypot(r - lBgR, g - lBgG, b - lBgB);
      const distPal = palR.length > 0 ? minPaletteDist(r, g, b) : distLocal;
      const minBgD = Math.min(distLocal, distPal);

      const isDarkHair = isUpper && lum < 82 && lBgLum > 110 && minBgD > 26 && a >= 75;
      const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 14;
      const distSkin = skinCnt > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
      const isRealSkin = isWarmSkin && (skinCnt === 0 ? minBgD > 24 : (distSkin < minBgD * 0.90 || (distSkin <= 26 && minBgD > 20)));
      if (isDarkHair || (isRealSkin && a >= 75)) continue;

      let minLocalGarDist = 999;
      if (!isUpper && solidDist[i] <= 4) {
        for (let dy = -3; dy <= 3; dy++) {
          const ly = y + dy;
          if (ly < 0 || ly >= h) continue;
          for (let dx = -3; dx <= 3; dx++) {
            const lx = x + dx;
            if (lx < 0 || lx >= w) continue;
            const lIdx = ly * w + lx;
            if (alphaCopy[lIdx] >= 200) {
              const lp = lIdx * 4;
              const ld = Math.hypot(r - pixels[lp], g - pixels[lp + 1], b - pixels[lp + 2]);
              if (ld < minLocalGarDist) minLocalGarDist = ld;
            }
          }
        }
      }
      const distGar = Math.min(
        minLocalGarDist,
        garCnt > 0 ? Math.hypot(r - avgGarR, g - avgGarG, b - avgGarB) : 999,
        lSlvCnt > 4 ? Math.hypot(r - avgLSlvR, g - avgLSlvG, b - avgLSlvB) : 999,
        rSlvCnt > 4 ? Math.hypot(r - avgRSlvR, g - avgRSlvG, b - avgRSlvB) : 999
      );
      const isLowerShirtEdge =
        !isUpper &&
        a >= 55 &&
        ((distGar <= 40 && (minBgD > 14 || solidDist[i] <= 4)) ||
          (isWhiteOrCheck && maxC >= 132 && maxC - minC <= 82 && a >= 70));
      if (isLowerShirtEdge && solidDist[i] <= 5) continue;

      const sDist = solidDist[i];
      if (isUpper) {
        if (
          (sDist > 6 && a < 155) ||
          (sDist > 3 && a < 120 && minBgD <= 42) ||
          (isolateAll && a < 95 && minBgD <= 36)
        ) {
          pixels[p + 3] = 0;
        }
      } else {
        if (
          (sDist > 5 && a < 110 && (distGar > 38 || minBgD <= 26)) ||
          (sDist > 2 && a < 54 && minBgD <= 26 && distGar > 36) ||
          (a < 28 && distGar > 34)
        ) {
          pixels[p + 3] = 0;
        }
      }
    }
  }

  // Pass 2: Global 360-degree Exterior-Seeded Background Color-Patch Flood Fill
  const visited = new Uint8Array(total);
  const cleared = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0, tail = 0, clearedCnt = 0;

  for (let i = 0; i < total; i++) {
    if (pixels[i * 4 + 3] <= 15) {
      visited[i] = 1;
      queue[tail++] = i;
    }
  }
  if (tail === 0) return;

  while (head < tail) {
    const curr = queue[head++];
    const cy = Math.floor(curr / w);
    const cx = curr % w;
    const cP = curr * 4;
    const currExt = pixels[cP + 3] <= 15 && !hasOriginalRgb;
    const cCell = Math.min(gRows - 1, Math.floor(cy / cellSz)) * gCols + Math.min(gCols - 1, Math.floor(cx / cellSz));
    const cR = currExt ? cellBgR[cCell] : pixels[cP];
    const cG = currExt ? cellBgG[cCell] : pixels[cP + 1];
    const cB = currExt ? cellBgB[cCell] : pixels[cP + 2];

    const nbs = [
      cy > 0 ? curr - w : -1,
      cy < h - 1 ? curr + w : -1,
      cx > 0 ? curr - 1 : -1,
      cx < w - 1 ? curr + 1 : -1,
    ];

    for (const n of nbs) {
      if (n === -1 || visited[n] === 1) continue;
      const np = n * 4;
      const na = pixels[np + 3];
      if (na <= 15) {
        visited[n] = 1;
        queue[tail++] = n;
        continue;
      }
      if (na >= 235) continue;

      const ny = Math.floor(n / w);
      const nx = n % w;
      const r = pixels[np], g = pixels[np + 1], b = pixels[np + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const nCell = Math.min(gRows - 1, Math.floor(ny / cellSz)) * gCols + Math.min(gCols - 1, Math.floor(nx / cellSz));
      const lBgR = cellBgR[nCell], lBgG = cellBgG[nCell], lBgB = cellBgB[nCell];
      const lBgLum = 0.299 * lBgR + 0.587 * lBgG + 0.114 * lBgB;
      const distLocal = Math.hypot(r - lBgR, g - lBgG, b - lBgB);
      const distPal = palR.length > 0 ? minPaletteDist(r, g, b) : distLocal;
      const minBgD = Math.min(distLocal, distPal);
      const stepDiff = Math.hypot(r - cR, g - cG, b - cB);

      const isUpper = ny < shoulderStartY;
      const isDarkHair = lum < 82 && lBgLum > 110 && minBgD > 26 && na >= 85;
      const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 14;
      const distSkin = skinCnt > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
      const isRealSkin = isWarmSkin && (skinCnt === 0 ? minBgD > 24 : (distSkin < minBgD * 0.90 || (distSkin <= 26 && minBgD > 20)));
      if (isDarkHair || (isRealSkin && na >= 75)) continue;

      let minLocalGarDist = 999;
      if (!isUpper && solidDist[n] <= 4) {
        for (let dy = -3; dy <= 3; dy++) {
          const ly = ny + dy;
          if (ly < 0 || ly >= h) continue;
          for (let dx = -3; dx <= 3; dx++) {
            const lx = nx + dx;
            if (lx < 0 || lx >= w) continue;
            const lIdx = ly * w + lx;
            if (alphaCopy[lIdx] >= 200) {
              const lp = lIdx * 4;
              const ld = Math.hypot(r - pixels[lp], g - pixels[lp + 1], b - pixels[lp + 2]);
              if (ld < minLocalGarDist) minLocalGarDist = ld;
            }
          }
        }
      }
      const distGar = Math.min(
        minLocalGarDist,
        garCnt > 0 ? Math.hypot(r - avgGarR, g - avgGarG, b - avgGarB) : 999,
        lSlvCnt > 4 ? Math.hypot(r - avgLSlvR, g - avgLSlvG, b - avgLSlvB) : 999,
        rSlvCnt > 4 ? Math.hypot(r - avgRSlvR, g - avgRSlvG, b - avgRSlvB) : 999
      );
      if (
        !isUpper &&
        ((na >= 155 && solidDist[n] <= 4) ||
          (na >= 70 && distGar <= 42 && solidDist[n] <= 4) ||
          (na >= 120 && distGar <= 42 && minBgD > 16) ||
          (isWhiteOrCheck && na >= 85 && Math.max(r, g, b) >= 132 && Math.max(r, g, b) - Math.min(r, g, b) <= 82))
      ) {
        continue;
      }

      // Compute 3x3 luminance variance to shield textured hair/clothes while clearing flat wall/curtain patches
      let lVar = 0, vCnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const vy = ny + dy;
        if (vy < 0 || vy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const vx = nx + dx;
          if (vx < 0 || vx >= w) continue;
          const vp = (vy * w + vx) * 4;
          lVar += Math.abs(lum - (0.299 * pixels[vp] + 0.587 * pixels[vp + 1] + 0.114 * pixels[vp + 2]));
          vCnt++;
        }
      }
      const avgVar = vCnt > 0 ? lVar / vCnt : 0;

      const chromaLocal = Math.abs((r - g) - (lBgR - lBgG)) + Math.abs((g - b) - (lBgG - lBgB));
      const lumRatioLocal = lum / Math.max(20, lBgLum);
      const hasWarmTone = (r - b) - (lBgR - lBgB) >= 8;

      const canCleanPatch = isUpper
        ? (na < 135 && minBgD <= 40 && stepDiff <= 28) ||
          (hasOriginalRgb && na < 205 && minBgD <= 28 && stepDiff <= 15 && avgVar < 7.5) ||
          (hasOriginalRgb && na < 235 && minBgD <= 20 && stepDiff <= 10 && avgVar < 5.0) ||
          (hasOriginalRgb && !hasWarmTone && na < 220 && chromaLocal <= 13 && lumRatioLocal >= 0.50 && lumRatioLocal <= 1.15 && distLocal <= 46 && stepDiff <= 14 && avgVar < 6.0)
        : (na < 70 && minBgD <= 30 && stepDiff <= 22 && (solidDist[n] > 2 || distGar > 36)) ||
          (hasOriginalRgb && na < 130 && minBgD <= 24 && stepDiff <= 12 && avgVar < 5.5 && solidDist[n] > 3 && distGar > 36);

      if (canCleanPatch) {
        visited[n] = 1;
        cleared[n] = 1;
        pixels[np + 3] = 0;
        queue[tail++] = n;
        clearedCnt++;
      }
    }
  }

  // Safety guard: revert BFS if it accidentally cleared > 8% of subject
  if (clearedCnt > subjCount * 0.08) {
    for (let i = 0; i < total; i++) {
      if (cleared[i] === 1) {
        pixels[i * 4 + 3] = alphaCopy[i];
      }
    }
  }

  // Pass 3: Remove isolated sparse semi-transparent haze (< 85) not anchored to >= 3 solid neighbors
  const postA = new Uint8Array(total);
  for (let i = 0; i < total; i++) postA[i] = pixels[i * 4 + 3];
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const a = postA[i];
      if (a === 0 || a >= 85) continue;
      let solidN = 0;
      for (let dy = -2; dy <= 2 && solidN < 3; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w && postA[ny * w + nx] >= 185) {
            solidN++;
            if (solidN >= 3) break;
          }
        }
      }
      if (solidN < 3 && (a < 65 || solidDist[i] > 3)) {
        pixels[i * 4 + 3] = 0;
      }
    }
  }
}

/**
/**
 * Bilateral Left & Right Shoulder + Neck-Slope Edge Polish:
 * Trims protruding jagged halo fringes along BOTH neck-to-shoulder corners and outer left/right shoulder edges,
 * works across light shirts, check shirts, and dark blazers/coats without false skipping, smooths diagonal
 * shoulder-top staircases, decontaminates boundary RGB tints against local interior garment pixels, and applies
 * gentle bilateral anti-aliasing for clean, studio-grade left & right shoulder contours.
 */
function polishLeftShoulderAndNeckContour(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  bgModels?: BackgroundModels,
  hasOriginalRgb = true
) {
  const total = w * h;
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = pixels[i * 4 + 3];
  }

  let minX = w, maxX = 0, minY = h, maxY = 0;
  let massCenterX = 0, subjCount = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphaCopy[row + x] > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        massCenterX += x;
        subjCount++;
      }
    }
  }
  if (subjCount < 150 || maxX <= minX || maxY <= minY) return;

  const coreCenterX = Math.round(massCenterX / subjCount);
  const subjH = maxY - minY;
  const subjW = maxX - minX;

  let neckY = Math.floor(minY + subjH * 0.45);
  let minSpan = Infinity;
  let neckLeftAtMin = Math.round(coreCenterX - subjW * 0.16);
  let neckRightAtMin = Math.round(coreCenterX + subjW * 0.16);
  for (let y = Math.floor(minY + subjH * 0.28); y <= Math.floor(minY + subjH * 0.56); y++) {
    const row = y * w;
    let l = -1, r = -1;
    for (let x = minX; x <= maxX; x++) if (alphaCopy[row + x] >= 165) { l = x; break; }
    for (let x = maxX; x >= minX; x--) if (alphaCopy[row + x] >= 165) { r = x; break; }
    if (l !== -1 && r > l && (r - l) < minSpan) {
      minSpan = r - l;
      neckY = y;
      neckLeftAtMin = l;
      neckRightAtMin = r;
    }
  }

  // Cover directly beneath the left ear (earlobe -> jawline -> upper neck) + BOTH left & right shoulders down to maxY
  const startY = Math.max(1, Math.min(neckY, Math.floor(minY + subjH * 0.24)));
  const rightStartY = Math.max(1, neckY);
  const endY = Math.min(h - 2, maxY);
  const fbBgR = bgModels?.global?.meanR ?? 245;
  const fbBgG = bgModels?.global?.meanG ?? 245;
  const fbBgB = bgModels?.global?.meanB ?? 245;

  // Locate primary left & right edges (>= 120) per row
  const leftEdge = new Int32Array(h).fill(-1);
  const rightEdge = new Int32Array(h).fill(-1);
  for (let y = startY; y <= endY; y++) {
    const row = y * w;
    for (let x = 0; x < coreCenterX; x++) {
      if (pixels[(row + x) * 4 + 3] >= 120) {
        leftEdge[y] = x;
        break;
      }
    }
    if (y >= rightStartY) {
      for (let x = w - 1; x > coreCenterX; x--) {
        if (pixels[(row + x) * 4 + 3] >= 120) {
          rightEdge[y] = x;
          break;
        }
      }
    }
  }

  const polishHorizontalSide = (side: "left" | "right") => {
    const isLeft = side === "left";
    const rowBegin = isLeft ? startY + 2 : rightStartY + 2;
    const edgeArr = isLeft ? leftEdge : rightEdge;
    const dir = isLeft ? 1 : -1; // inward direction

    for (let y = rowBegin; y <= endY - 2; y++) {
      const cur = edgeArr[y];
      if (cur === -1) continue;
      const isUnderEarZone = isLeft && y < neckY;

      // Sample local exterior background outside `cur`
      let bR = 0, bG = 0, bB = 0, bCnt = 0;
      for (let sy = Math.max(0, y - 5); sy <= Math.min(h - 1, y + 5); sy += 2) {
        const sRow = sy * w;
        for (let step = 2; step <= 26; step += 2) {
          const sx = cur - dir * step;
          if (sx < 0 || sx >= w) break;
          const sIdx = sRow + sx;
          const sa = alphaCopy[sIdx];
          if ((hasOriginalRgb && sa <= 15) || (!hasOriginalRgb && sa > 5 && sa < 100)) {
            const sp = sIdx * 4;
            bR += pixels[sp]; bG += pixels[sp + 1]; bB += pixels[sp + 2]; bCnt++;
          }
        }
      }
      const bgR = bCnt >= 3 ? bR / bCnt : fbBgR;
      const bgG = bCnt >= 3 ? bG / bCnt : fbBgG;
      const bgB = bCnt >= 3 ? bB / bCnt : fbBgB;
      const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

      // Sample deep solid interior color 5..22px inside (also track same-tone match for check/striped shirts)
      let gR = 0, gG = 0, gB = 0, gCnt = 0;
      for (let sy = Math.max(startY, y - 3); sy <= Math.min(endY, y + 3); sy++) {
        const sRow = sy * w;
        for (let step = 5; step <= 22; step += 2) {
          const sx = cur + dir * step;
          if (isLeft ? sx > coreCenterX : sx < coreCenterX) break;
          const sIdx = sRow + sx;
          if (pixels[sIdx * 4 + 3] >= 230) {
            const sp = sIdx * 4;
            gR += pixels[sp]; gG += pixels[sp + 1]; gB += pixels[sp + 2]; gCnt++;
          }
        }
      }
      const garR = gCnt > 0 ? gR / gCnt : 128;
      const garG = gCnt > 0 ? gG / gCnt : 128;
      const garB = gCnt > 0 ? gB / gCnt : 128;
      const bgGarSep = gCnt > 0 ? Math.hypot(bgR - garR, bgG - garG, bgB - garB) : 0;

      // Trim ONLY genuine single-row outward halo spikes; also heal tiny 1px concave edge notches along curved shoulders!
      const prevE = edgeArr[y - 1];
      const nextE = edgeArr[y + 1];
      const isIsolatedOutSpike =
        prevE !== -1 &&
        nextE !== -1 &&
        (isLeft ? (cur < prevE - 2 && cur < nextE - 2) : (cur > prevE + 2 && cur > nextE + 2));
      const adjAvg = prevE !== -1 && nextE !== -1 ? Math.round((prevE + nextE) * 0.5) : cur;
      const isTinyConcaveDent =
        !isUnderEarZone &&
        prevE !== -1 &&
        nextE !== -1 &&
        Math.abs(prevE - nextE) <= 3 &&
        (isLeft ? (cur > adjAvg + 1 && cur - adjAvg <= 3) : (cur < adjAvg - 1 && adjAvg - cur <= 3));

      if (isTinyConcaveDent && gCnt > 0) {
        const fillFrom = isLeft ? Math.max(0, adjAvg) : Math.min(w - 1, cur + 1);
        const fillTo = isLeft ? Math.min(w - 1, cur - 1) : Math.min(w - 1, adjAvg);
        for (let fx = fillFrom; fx <= fillTo; fx++) {
          const fp = (y * w + fx) * 4;
          const fa = pixels[fp + 3];
          const fr = pixels[fp], fg = pixels[fp + 1], fb = pixels[fp + 2];
          const fBgD = Math.hypot(fr - bgR, fg - bgG, fb - bgB);
          const fGarD = Math.hypot(fr - garR, fg - garG, fb - garB);
          if (fa < 175 && (fGarD <= 40 || fBgD > 16 || fa >= 45)) {
            const targetA = fx === adjAvg ? 175 : 235;
            pixels[fp + 3] = Math.max(fa, targetA);
            if (bgGarSep > 14 && fGarD > 14 && fGarD <= 55) {
              const bMix = 0.55;
              pixels[fp] = Math.round(fr * (1 - bMix) + garR * bMix);
              pixels[fp + 1] = Math.round(fg * (1 - bMix) + garG * bMix);
              pixels[fp + 2] = Math.round(fb * (1 - bMix) + garB * bMix);
            }
          }
        }
      }

      const row = y * w;
      const outPad = isUnderEarZone ? 3 : 4;
      const inPad = isUnderEarZone ? 2 : 3;
      const xLow = isLeft
        ? Math.max(0, Math.min(cur, adjAvg) - outPad)
        : Math.max(coreCenterX + 1, Math.min(cur, adjAvg) - inPad);
      const xHigh = isLeft
        ? Math.min(coreCenterX - 1, Math.max(cur, adjAvg) + inPad)
        : Math.min(w - 1, Math.max(cur, adjAvg) + outPad);

      for (let x = xLow; x <= xHigh; x++) {
        const p = (row + x) * 4;
        const a = pixels[p + 3];
        if (a === 0) continue;

        const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
        const dBg = Math.hypot(r - bgR, g - bgG, b - bgB);

        // Closest solid neighbor in local 5x7 inward patch (check-shirt safe)
        let minPatchGarDist = 999;
        let stR = 0, stG = 0, stB = 0, stCnt = 0;
        for (let sy = Math.max(startY, y - 3); sy <= Math.min(endY, y + 3); sy++) {
          const sRow = sy * w;
          for (let st = 2; st <= 14; st += 2) {
            const sx = x + dir * st;
            if (isLeft ? sx > coreCenterX : sx < coreCenterX) break;
            const sIdx = sRow + sx;
            if (pixels[sIdx * 4 + 3] >= 220) {
              const sp = sIdx * 4;
              const sr = pixels[sp], sg = pixels[sp + 1], sb = pixels[sp + 2];
              const sd0 = Math.hypot(r - sr, g - sg, b - sb);
              if (sd0 < minPatchGarDist) minPatchGarDist = sd0;
              if (sd0 <= 42) {
                stR += sr; stG += sg; stB += sb; stCnt++;
              }
            }
          }
        }
        const toneGarR = stCnt > 0 ? stR / stCnt : garR;
        const toneGarG = stCnt > 0 ? stG / stCnt : garG;
        const toneGarB = stCnt > 0 ? stB / stCnt : garB;
        const dGar = Math.min(minPatchGarDist, gCnt > 0 ? Math.hypot(r - garR, g - garG, b - garB) : 999);
        const isLightFabricPx = !isUnderEarZone && maxC >= 132 && (maxC - minC) <= 82 && (dGar <= 34 || dBg > 20);
        const isDarkHairTone = lum < 82 && bgLum > 110 && dBg > 24;
        const isNearNeckHair = isDarkHairTone && y < neckY + Math.round(subjH * 0.08) && a >= 145;
        const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 10 && dBg > 20;

        const isOutsideIsolatedSpike = isIsolatedOutSpike && (isLeft ? x < adjAvg - 1 : x > adjAvg + 1);
        const isStrictlyOutsideRim = isLeft ? x < cur : x > cur;
        const isOnOrOutsideRim = isLeft ? x <= cur : x >= cur;
        const isStrictlyInsideRim = isLeft ? x >= cur + 1 : x <= cur - 1;
        const isDeepInsideRim = isLeft ? x >= cur + 2 : x <= cur - 2;
        const isNearOuterRim = isLeft ? x <= cur + 2 : x >= cur - 2;

        if (!isUnderEarZone) {
          if (isWarmSkin || isNearNeckHair) continue;

          // Clear genuine isolated outward spikes, faint < 54 exterior haze, or background-leaked fringe strictly outside cur
          if (isOutsideOutlier(isOutsideOutSpikeSafe(isOutsideIsolatedSpike, a, dBg, dGar, gCnt))) {
            pixels[p + 3] = 0;
            continue;
          }
          if (isOnOrOutsideRim && a < 54 && (gCnt === 0 || (!isLightFabricPx && dBg < dGar * 0.85) || dBg < 26)) {
            pixels[p + 3] = 0;
            continue;
          }
          if (
            !isLightFabricPx &&
            gCnt > 0 &&
            bgGarSep >= 22 &&
            isStrictlyOutsideRim &&
            a < 135 &&
            dGar > 34 &&
            dBg < dGar * 0.70 &&
            dBg <= 30
          ) {
            pixels[p + 3] = 0;
            continue;
          }
          // Eliminate washed-out semi-transparency inside the garment boundary while keeping outer 1px curve smooth
          if (
            isDeepInsideRim &&
            ((a >= 170) || (gCnt > 0 && a >= 120 && (dGar <= 36 || isLightFabricPx) && (bgGarSep < 22 || dBg > 18)))
          ) {
            pixels[p + 3] = 255;
          } else if (isStrictlyInsideRim && a >= 210) {
            pixels[p + 3] = 255;
          }
        } else {
          // Under-ear earlobe / jawline / neck contour: strip faint halo & outer bg crust while keeping genuine ear/jaw skin safe
          if (!isDarkHairTone && !(isWarmSkin && a >= 110)) {
            if (isLeft && x < cur && (a < 115 || (gCnt > 0 && dBg < dGar * 0.85 && dBg < 38))) {
              pixels[p + 3] = 0;
              continue;
            }
            if (a < 165 && gCnt > 0 && dBg < dGar * 0.88 && dBg < 38) {
              pixels[p + 3] = 0;
              continue;
            }
            if (isLeft && x <= cur && gCnt > 0 && dBg < 20 && dBg < dGar * 0.65) {
              pixels[p + 3] = 0;
              continue;
            }
          }
        }

        // Decontaminate ALL surviving boundary pixels toward same-tone interior color (never dark-tinting white checks)
        const finalA = pixels[p + 3];
        const toneBgSep = Math.hypot(bgR - toneGarR, bgG - toneGarG, bgB - toneGarB);
        if (!isLightFabricPx && finalA > 0 && finalA < 252 && gCnt > 0 && isNearOuterRim && toneBgSep > 16 && dBg < Math.max(48, toneBgSep * 1.35)) {
          const blend = Math.min(0.88, (1 - finalA / 255.0) + (isUnderEarZone ? 0.36 : 0.48));
          pixels[p] = Math.round(r * (1 - blend) + toneGarR * blend);
          pixels[p + 1] = Math.round(g * (1 - blend) + toneGarG * blend);
          pixels[p + 2] = Math.round(b * (1 - blend) + toneGarB * blend);
        }
      }
    }
  };

  const isOutsideOutlier = (flag: boolean) => flag;
  const isOutsideOutSpikeSafe = (isSpike: boolean, a: number, dBg: number, dGar: number, gCnt: number) =>
    isSpike && (a < 135 || (gCnt > 0 && dBg < dGar * 0.80 && dBg < 32));

  polishHorizontalSide("left");
  polishHorizontalSide("right");

  // Top-Down Diagonal Above-Shoulder Decontamination for BOTH Left & Right Slopes:
  // Preserves 100% of the rounded shoulder curve, collars, and folds while clearing background leakage above shTop,
  // decontaminating top rim RGB tints, and keeping fabric right inside the shoulder slope solid.
  const colLMinX = Math.max(1, minX);
  const colLMaxX = Math.min(coreCenterX - 3, Math.max(neckLeftAtMin + 4, Math.round(minX + subjW * 0.44)));
  const colRMinX = Math.max(coreCenterX + 3, Math.min(neckRightAtMin - 4, Math.round(maxX - subjW * 0.44)));
  const colRMaxX = Math.min(w - 2, maxX);
  const colTopStart = Math.max(1, Math.floor(minY + subjH * 0.36));
  const colTopEnd = Math.min(h - 4, Math.floor(minY + subjH * 0.88));
  const rawShTopL = new Int32Array(w).fill(h);
  const rawShTopR = new Int32Array(w).fill(h);

  const polishDiagonalSide = (
    xFrom: number,
    xTo: number,
    rawTopArr: Int32Array
  ) => {
    if (xTo < xFrom) return;
    for (let x = xFrom; x <= xTo; x++) {
      for (let y = colTopStart; y <= colTopEnd; y++) {
        const i0 = y * w + x;
        if (pixels[i0 * 4 + 3] >= 155 && pixels[(i0 + w) * 4 + 3] >= 155) {
          rawTopArr[x] = y;
          break;
        }
      }
    }

    for (let x = xFrom; x <= xTo; x++) {
      const shTop = rawTopArr[x];
      if (shTop >= h - 4) continue;

      let abR = 0, abG = 0, abB = 0, abCnt = 0;
      for (let sy = Math.max(0, shTop - 22); sy < shTop; sy += 2) {
        const idx = sy * w + x;
        const sa = pixels[idx * 4 + 3];
        if ((hasOriginalRgb && sa <= 15) || (!hasOriginalRgb && sa > 5 && sa < 100)) {
          const sp = idx * 4;
          abR += pixels[sp]; abG += pixels[sp + 1]; abB += pixels[sp + 2]; abCnt++;
        }
      }
      const locAbR = abCnt >= 2 ? abR / abCnt : fbBgR;
      const locAbG = abCnt >= 2 ? abG / abCnt : fbBgG;
      const locAbB = abCnt >= 2 ? abB / abCnt : fbBgB;
      const locAbLum = 0.299 * locAbR + 0.587 * locAbG + 0.114 * locAbB;

      let shR = 0, shG = 0, shB = 0, shCnt = 0;
      for (let sy = shTop + 2; sy <= Math.min(h - 1, shTop + 14); sy += 2) {
        const idx = sy * w + x;
        if (pixels[idx * 4 + 3] >= 215) {
          const sp = idx * 4;
          shR += pixels[sp]; shG += pixels[sp + 1]; shB += pixels[sp + 2]; shCnt++;
        }
      }
      if (shCnt === 0) continue;
      const avgShR = shR / shCnt;
      const avgShG = shG / shCnt;
      const avgShB = shB / shCnt;
      const bgShSep = Math.hypot(locAbR - avgShR, locAbG - avgShG, locAbB - avgShB);

      // Heal 1px vertical concave notch along the diagonal top shoulder curve if both side columns sit higher
      const prevTop = x > xFrom ? rawTopArr[x - 1] : h;
      const nextTop = x < xTo ? rawTopArr[x + 1] : h;
      if (prevTop < h && nextTop < h && shTop > prevTop + 1 && shTop > nextTop + 1 && shTop - Math.round((prevTop + nextTop) * 0.5) <= 3) {
        const targetTop = Math.round((prevTop + nextTop) * 0.5);
        for (let hy = targetTop; hy < shTop; hy++) {
          const hp = (hy * w + x) * 4;
          const ha = pixels[hp + 3];
          const hr = pixels[hp], hg = pixels[hp + 1], hb = pixels[hp + 2];
          let minNotchDist = 999, nToneR = 0, nToneG = 0, nToneB = 0, nToneCnt = 0, nBestR = avgShR, nBestG = avgShG, nBestB = avgShB;
          for (let sy = shTop + 2; sy <= Math.min(h - 1, shTop + 14); sy += 2) {
            const idx = sy * w + x;
            if (pixels[idx * 4 + 3] >= 215) {
              const sp = idx * 4;
              const sr = pixels[sp], sg = pixels[sp + 1], sb = pixels[sp + 2];
              const d = Math.hypot(hr - sr, hg - sg, hb - sb);
              if (d < minNotchDist) {
                minNotchDist = d; nBestR = sr; nBestG = sg; nBestB = sb;
              }
              if (d <= 44) {
                nToneR += sr; nToneG += sg; nToneB += sb; nToneCnt++;
              }
            }
          }
          const refShR = nToneCnt > 0 ? nToneR / nToneCnt : nBestR;
          const refShG = nToneCnt > 0 ? nToneG / nToneCnt : nBestG;
          const refShB = nToneCnt > 0 ? nToneB / nToneCnt : nBestB;
          const hdSh = Math.hypot(hr - refShR, hg - refShG, hb - refShB);
          const hdBg = Math.hypot(hr - locAbR, hg - locAbG, hb - locAbB);
          const hMaxC = Math.max(hr, hg, hb), hMinC = Math.min(hr, hg, hb);
          const hIsLightOrCheck = (hMaxC >= 132 && (hMaxC - hMinC) <= 82) || (0.299 * hr + 0.587 * hg + 0.114 * hb >= 168);
          if (ha < 185 && (hdSh <= 42 || hdBg > 16 || ha >= 45)) {
            pixels[hp + 3] = Math.max(ha, hy === targetTop ? 180 : 240);
            if (!hIsLightOrCheck && bgShSep > 14 && hdSh > 14) {
              const bMix = 0.62;
              pixels[hp] = Math.round(hr * (1 - bMix) + refShR * bMix);
              pixels[hp + 1] = Math.round(hg * (1 - bMix) + refShG * bMix);
              pixels[hp + 2] = Math.round(hb * (1 - bMix) + refShB * bMix);
            }
          }
        }
      }

      for (let y = Math.max(startY, neckY - 4); y <= Math.min(h - 2, shTop + 2); y++) {
        const p = (y * w + x) * 4;
        const a = pixels[p + 3];
        if (a === 0) continue;

        const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
        const dBg = Math.hypot(r - locAbR, g - locAbG, b - locAbB);

        // Compute distance to closest solid pixel & same-tone reference so check shirts never blend white with dark stripes
        let minShDist = 999, toneShR = 0, toneShG = 0, toneShB = 0, toneShCnt = 0, bestShR = avgShR, bestShG = avgShG, bestShB = avgShB;
        for (let sy = shTop + 2; sy <= Math.min(h - 1, shTop + 14); sy += 2) {
          const idx = sy * w + x;
          if (pixels[idx * 4 + 3] >= 215) {
            const sp = idx * 4;
            const sr = pixels[sp], sg = pixels[sp + 1], sb = pixels[sp + 2];
            const d = Math.hypot(r - sr, g - sg, b - sb);
            if (d < minShDist) {
              minShDist = d; bestShR = sr; bestShG = sg; bestShB = sb;
            }
            if (d <= 44) {
              toneShR += sr; toneShG += sg; toneShB += sb; toneShCnt++;
            }
          }
        }
        const refShR = toneShCnt > 0 ? toneShR / toneShCnt : bestShR;
        const refShG = toneShCnt > 0 ? toneShG / toneShCnt : bestShG;
        const refShB = toneShCnt > 0 ? toneShB / toneShCnt : bestShB;
        const dSh = Math.min(minShDist, Math.hypot(r - avgShR, g - avgShG, b - avgShB));
        const isLightOrCheckPx = ((maxC >= 132 && (maxC - minC) <= 82) || lum >= 168) && minShDist <= 38 && (dBg > 14 || a >= 130);

        const isNearNeckHair = y < neckY + Math.round(subjH * 0.08) && lum < 82 && locAbLum > 110 && dBg > 24 && a >= 145;
        const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 14 && dBg > 22;
        if (isNearNeckHair || isWarmSkin) continue;

        if (!isLightOrCheckPx && y < shTop - 1 && a < 58 && dBg < dSh * 0.85 && dBg < 34) {
          pixels[p + 3] = 0;
          continue;
        }
        if (!isLightOrCheckPx && y < shTop - 1 && bgShSep >= 22 && a < 140 && dSh > 32 && dBg < dSh * 0.72 && dBg <= 32) {
          pixels[p + 3] = 0;
          continue;
        }
        if (y >= shTop + 1 && ((a >= 180) || (a >= 140 && dSh <= 36 && (bgShSep < 22 || dBg > 18)) || (isLightOrCheckPx && a >= 115))) {
          pixels[p + 3] = 255;
        }

        const curA = pixels[p + 3];
        const toneBgSep = Math.hypot(locAbR - refShR, locAbG - refShG, locAbB - refShB);
        if (!isLightOrCheckPx && minShDist > 16 && curA > 0 && curA < 252 && toneBgSep > 16 && dBg < Math.max(48, toneBgSep * 1.35)) {
          const blend = Math.min(0.86, (1 - curA / 255.0) + 0.44);
          pixels[p] = Math.round(r * (1 - blend) + refShR * blend);
          pixels[p + 1] = Math.round(g * (1 - blend) + refShG * blend);
          pixels[p + 2] = Math.round(b * (1 - blend) + refShB * blend);
        }
      }
    }
  };

  polishDiagonalSide(colLMinX, colLMaxX, rawShTopL);
  polishDiagonalSide(colRMinX, colRMaxX, rawShTopR);

  // Final Shoulder & Garment Interior Opacity Consolidation:
  // Locks ALL interior clothes/shirt/collar/shoulder pixels below top curve to 255 SOLID,
  // while leaving the outer 1-2px curve cleanly anti-aliased!
  const preAa = new Uint8Array(total);
  for (let i = 0; i < total; i++) preAa[i] = pixels[i * 4 + 3];

  const colGarTop = new Int32Array(w).fill(h);
  for (let x = minX; x <= maxX; x++) {
    const rawKnown = Math.min(rawShTopL[x], rawShTopR[x]);
    if (rawKnown < h) {
      colGarTop[x] = rawKnown;
    } else {
      for (let y = neckY; y <= Math.min(h - 3, endY); y++) {
        if (preAa[y * w + x] >= 165 && preAa[(y + 1) * w + x] >= 165) {
          colGarTop[x] = y;
          break;
        }
      }
    }
  }

  for (let y = neckY; y <= endY - 1; y++) {
    const row = y * w;
    let lE = -1, rE = -1;
    for (let x = 0; x < coreCenterX; x++) {
      if (preAa[row + x] >= 95) { lE = x; break; }
    }
    for (let x = w - 1; x > coreCenterX; x--) {
      if (preAa[row + x] >= 95) { rE = x; break; }
    }
    if (lE !== -1 && rE > lE + 6) {
      for (let x = Math.max(1, lE + 1); x <= Math.min(w - 2, rE - 1); x++) {
        const idx = row + x;
        const a = preAa[idx];
        const insideTopCurve = y >= colGarTop[x] + 1;
        if (!insideTopCurve) continue;
        if (x === lE + 1 || x === rE - 1) {
          const innerIdx = x === lE + 1 ? idx + 1 : idx - 1;
          if (a >= 190 && preAa[innerIdx] >= 225) {
            pixels[idx * 4 + 3] = 255;
          }
          continue;
        }
        if (a < 255) {
          const solidN =
            (preAa[idx - w] >= 220 ? 1 : 0) +
            (preAa[idx + w] >= 220 ? 1 : 0) +
            (preAa[idx - 1] >= 220 ? 1 : 0) +
            (preAa[idx + 1] >= 220 ? 1 : 0);
          if ((a >= 105 && solidN >= 2) || (x >= lE + 3 && x <= rE - 3 && y >= colGarTop[x] + 3 && solidN >= 3)) {
            pixels[idx * 4 + 3] = 255;
          }
        }
      }
    }
  }

  // Ordered 2D Arc-Length Shoulder Contour Reconstruction & Natural Photographic Finishing:
  // Traces BOTH left and right continuous 8-connected shoulder-to-arm boundaries, fits rotation-invariant
  // local bilateral quadratic polynomials along arc length (preserving rounded shoulder curvature, collars & folds
  // with zero corner seams or slope flattening), removes outer sawtooth jitter, and blends sub-pixel coverage
  // strictly using authentic photo pixels + tone-matched interior garment RGB (check-shirt & light-shirt safe).
  const snapPx = new Uint8ClampedArray(pixels);
  const fg = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    fg[i] = snapPx[i * 4 + 3] >= 128 ? 1 : 0;
  }

  // True 4-connected exterior mask seeded from canvas borders (never treats interior shirt check holes as exterior!)
  const isExt = new Uint8Array(total);
  const extQ = new Int32Array(total);
  let eqH = 0, eqT = 0;
  for (let x = 0; x < w; x++) {
    if (fg[x] === 0 && isExt[x] === 0) { isExt[x] = 1; extQ[eqT++] = x; }
    const bIdx = (h - 1) * w + x;
    if (fg[bIdx] === 0 && isExt[bIdx] === 0) { isExt[bIdx] = 1; extQ[eqT++] = bIdx; }
  }
  for (let y = 1; y < h - 1; y++) {
    const lIdx = y * w;
    if (fg[lIdx] === 0 && isExt[lIdx] === 0) { isExt[lIdx] = 1; extQ[eqT++] = lIdx; }
    const rIdx = y * w + w - 1;
    if (fg[rIdx] === 0 && isExt[rIdx] === 0) { isExt[rIdx] = 1; extQ[eqT++] = rIdx; }
  }
  while (eqH < eqT) {
    const c = extQ[eqH++];
    const cy = Math.floor(c / w), cx = c % w;
    if (cy > 0) { const n = c - w; if (fg[n] === 0 && isExt[n] === 0) { isExt[n] = 1; extQ[eqT++] = n; } }
    if (cy < h - 1) { const n = c + w; if (fg[n] === 0 && isExt[n] === 0) { isExt[n] = 1; extQ[eqT++] = n; } }
    if (cx > 0) { const n = c - 1; if (fg[n] === 0 && isExt[n] === 0) { isExt[n] = 1; extQ[eqT++] = n; } }
    if (cx < w - 1) { const n = c + 1; if (fg[n] === 0 && isExt[n] === 0) { isExt[n] = 1; extQ[eqT++] = n; } }
  }

  // 8-connected clockwise offsets: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
  const DX = [0, 1, 1, 1, 0, -1, -1, -1];
  const DY = [-1, -1, 0, 1, 1, 1, 0, -1];
  const DIR_LUT = [7, 0, 1, 6, 0, 2, 5, 4, 3]; // (dy+1)*3 + (dx+1)

  const traceSideChain = (side: "left" | "right") => {
    const isLeft = side === "left";
    const ptsX: number[] = [];
    const ptsY: number[] = [];
    const seedEndY = Math.min(h - 4, neckY + Math.max(12, Math.round(subjH * 0.12)));
    let sx = -1, sy = -1;

    for (let y = Math.max(2, neckY + 1); y <= seedEndY && sx === -1; y++) {
      const row = y * w;
      if (isLeft) {
        for (let x = 2; x < coreCenterX - 6; x++) {
          if (fg[row + x] === 1 && isExt[row + x - 1] === 1) {
            let run = 0;
            for (let k = 0; k < 6 && x + k < w; k++) if (fg[row + x + k] === 1) run++;
            if (run >= 5) { sx = x; sy = y; break; }
          }
        }
      } else {
        for (let x = w - 3; x > coreCenterX + 6; x--) {
          if (fg[row + x] === 1 && isExt[row + x + 1] === 1) {
            let run = 0;
            for (let k = 0; k < 6 && x - k >= 0; k++) if (fg[row + x - k] === 1) run++;
            if (run >= 5) { sx = x; sy = y; break; }
          }
        }
      }
    }
    if (sx === -1) return { ptsX, ptsY };

    let cx = sx, cy = sy;
    let extDir = isLeft ? 6 : 2;
    let px = cx + DX[extDir];
    let py = cy + DY[extDir];
    const maxSteps = Math.min(total, 2 * (w + h));
    const minValidY = Math.max(1, neckY - 4);

    for (let s = 0; s < maxSteps; s++) {
      ptsX.push(cx);
      ptsY.push(cy);
      if (cy >= endY - 1 || cx <= 1 || cx >= w - 2) break;
      if (isLeft && cx >= coreCenterX - 2) break;
      if (!isLeft && cx <= coreCenterX + 2) break;

      let found = false;
      for (let step = 1; step <= 8; step++) {
        const d = isLeft ? (extDir - step + 8) % 8 : (extDir + step) % 8;
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx >= 1 && nx <= w - 2 && ny >= minValidY && ny <= endY) {
          if (fg[ny * w + nx] === 1) {
            extDir = DIR_LUT[(py - ny + 1) * 3 + (px - nx + 1)];
            cx = nx;
            cy = ny;
            found = true;
            break;
          }
        }
        px = nx;
        py = ny;
      }
      if (!found || (s > 8 && cx === sx && cy === sy)) break;
    }

    return { ptsX, ptsY };
  };

  const smoothOrderedChain = (ptsX: number[], ptsY: number[], isLeft: boolean) => {
    const n = ptsX.length;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const inNx = new Float32Array(n);
    const inNy = new Float32Array(n);
    if (n < 5) {
      for (let i = 0; i < n; i++) {
        xs[i] = ptsX[i];
        ys[i] = ptsY[i];
        inNx[i] = isLeft ? 1 : -1;
        inNy[i] = 0;
      }
      return { xs, ys, inNx, inNy };
    }

    const radius = 8;
    for (let i = 0; i < n; i++) {
      // Gently preserve endpoints at neck/bottom frame
      if (i < 2 || i > n - 3) {
        xs[i] = ptsX[i];
        ys[i] = ptsY[i];
        continue;
      }

      const fitPass = (prevX?: number, prevY?: number, prevTx?: number, prevTy?: number) => {
        let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
        let bx0 = 0, bx1 = 0, bx2 = 0;
        let by0 = 0, by1 = 0, by2 = 0;
        let cnt = 0;

        for (let d = -radius; d <= radius; d++) {
          const j = i + d;
          if (j < 0 || j >= n) continue;
          let wgt = Math.exp(-(d * d) / 22.0);
          if (prevX !== undefined && prevY !== undefined && prevTx !== undefined && prevTy !== undefined) {
            const perp = Math.abs((ptsX[j] - prevX) * (-prevTy) + (ptsY[j] - prevY) * prevTx);
            if (perp > 3.5) continue;
            wgt *= Math.exp(-(perp * perp) / 6.0);
          }
          const d2 = d * d;
          s0 += wgt;
          s1 += wgt * d;
          s2 += wgt * d2;
          s3 += wgt * d2 * d;
          s4 += wgt * d2 * d2;
          bx0 += wgt * ptsX[j];
          bx1 += wgt * ptsX[j] * d;
          bx2 += wgt * ptsX[j] * d2;
          by0 += wgt * ptsY[j];
          by1 += wgt * ptsY[j] * d;
          by2 += wgt * ptsY[j] * d2;
          cnt++;
        }

        if (cnt < 3 || s0 <= 1e-4) return { x0: ptsX[i], y0: ptsY[i], x1: 0, y1: 1 };
        let ax0 = bx0 / s0, ax1 = s2 > 1e-3 ? bx1 / s2 : 0;
        let ay0 = by0 / s0, ay1 = s2 > 1e-3 ? by1 / s2 : 0;

        if (cnt >= 5) {
          const m00 = s2 * s4 - s3 * s3;
          const m01 = s1 * s4 - s2 * s3;
          const m02 = s1 * s3 - s2 * s2;
          const det = s0 * m00 - s1 * m01 + s2 * m02;
          if (Math.abs(det) > 1e-3) {
            ax0 = (bx0 * m00 - s1 * (bx1 * s4 - bx2 * s3) + s2 * (bx1 * s3 - bx2 * s2)) / det;
            ax1 = (s0 * (bx1 * s4 - bx2 * s3) - bx0 * m01 + s2 * (s1 * bx2 - s2 * bx1)) / det;
            ay0 = (by0 * m00 - s1 * (by1 * s4 - by2 * s3) + s2 * (by1 * s3 - by2 * s2)) / det;
            ay1 = (s0 * (by1 * s4 - by2 * s3) - by0 * m01 + s2 * (s1 * by2 - s2 * by1)) / det;
          }
        }
        return { x0: ax0, y0: ay0, x1: ax1, y1: ay1 };
      };

      const pass1 = fitPass();
      const len1 = Math.hypot(pass1.x1, pass1.y1) || 1;
      const pass2 = fitPass(pass1.x0, pass1.y0, pass1.x1 / len1, pass1.y1 / len1);

      const dxS = pass2.x0 - ptsX[i];
      const dyS = pass2.y0 - ptsY[i];
      const mag = Math.hypot(dxS, dyS);
      if (mag > 2.3) {
        const s = 2.3 / mag;
        xs[i] = ptsX[i] + dxS * s;
        ys[i] = ptsY[i] + dyS * s;
      } else {
        xs[i] = pass2.x0;
        ys[i] = pass2.y0;
      }
    }

    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 2);
      const i1 = Math.min(n - 1, i + 2);
      const tx = xs[i1] - xs[i0];
      const ty = ys[i1] - ys[i0];
      const tLen = Math.hypot(tx, ty) || 1;
      const ux = tx / tLen;
      const uy = ty / tLen;
      // Walking downward along left shoulder has interior on (uy, -ux); right shoulder has interior on (-uy, ux)
      inNx[i] = isLeft ? uy : -uy;
      inNy[i] = isLeft ? -ux : ux;
    }

    return { xs, ys, inNx, inNy };
  };

  const nearestK = new Int32Array(total).fill(-1);
  const nearestDistSq = new Float32Array(total).fill(999);
  const upperSkinHairCutoffY = neckY + Math.round(subjH * 0.11);

  const applyPhotographicShoulderFinish = (side: "left" | "right") => {
    const isLeft = side === "left";
    const chain = traceSideChain(side);
    if (chain.ptsX.length < 10) return;
    const sm = smoothOrderedChain(chain.ptsX, chain.ptsY, isLeft);
    const nPts = sm.xs.length;
    const touchedPixels: number[] = [];

    for (let k = 0; k < nPts; k++) {
      const cx = Math.round(sm.xs[k]);
      const cy = Math.round(sm.ys[k]);
      for (let dy = -3; dy <= 3; dy++) {
        const y = cy + dy;
        if (y <= neckY || y >= endY) continue;
        const row = y * w;
        for (let dx = -3; dx <= 3; dx++) {
          const x = cx + dx;
          if (x < 1 || x >= w - 1) continue;
          const idx = row + x;
          const dSq = (x - sm.xs[k]) * (x - sm.xs[k]) + (y - sm.ys[k]) * (y - sm.ys[k]);
          if (dSq <= 12.25 && dSq < nearestDistSq[idx]) {
            if (nearestK[idx] === -1) touchedPixels.push(idx);
            nearestDistSq[idx] = dSq;
            nearestK[idx] = k;
          }
        }
      }
    }

    for (const idx of touchedPixels) {
      const k = nearestK[idx];
      if (k === -1) continue;
      const y = Math.floor(idx / w);
      const x = idx % w;
      const nx = sm.inNx[k];
      const ny = sm.inNy[k];
      const sd = (x - sm.xs[k]) * nx + (y - sm.ys[k]) * ny;

      const p = idx * 4;
      const origA = snapPx[p + 3];
      const origR = snapPx[p], origG = snapPx[p + 1], origB = snapPx[p + 2];
      const origLum = 0.299 * origR + 0.587 * origG + 0.114 * origB;
      const maxC = Math.max(origR, origG, origB), minC = Math.min(origR, origG, origB);

      // Sample along inward normal (+2..+9px) & outward normal (-2..-9px)
      let garR = 0, garG = 0, garB = 0, garCnt = 0;
      let sameToneR = 0, sameToneG = 0, sameToneB = 0, sameToneCnt = 0;
      let minPatchGarD = 999;
      let bgR = 0, bgG = 0, bgB = 0, bgCnt = 0;

      for (let step = 2; step <= 9; step += 2) {
        for (let lat = -2; lat <= 2; lat += 2) {
          const ix = Math.max(0, Math.min(w - 1, Math.round(sm.xs[k] + nx * step - ny * lat)));
          const iy = Math.max(0, Math.min(h - 1, Math.round(sm.ys[k] + ny * step + nx * lat)));
          const inIdx = iy * w + ix;
          if (snapPx[inIdx * 4 + 3] >= 210) {
            const inp = inIdx * 4;
            const ir = snapPx[inp], ig = snapPx[inp + 1], ib = snapPx[inp + 2];
            garR += ir; garG += ig; garB += ib; garCnt++;
            const d = Math.hypot(origR - ir, origG - ig, origB - ib);
            if (d < minPatchGarD) minPatchGarD = d;
            if (d <= 44) {
              sameToneR += ir; sameToneG += ig; sameToneB += ib; sameToneCnt++;
            }
          }
          const ox = Math.max(0, Math.min(w - 1, Math.round(sm.xs[k] - nx * (step + 1) - ny * lat)));
          const oy = Math.max(0, Math.min(h - 1, Math.round(sm.ys[k] - ny * (step + 1) + nx * lat)));
          const outIdx = oy * w + ox;
          const oa = snapPx[outIdx * 4 + 3];
          if ((hasOriginalRgb && oa <= 15) || (!hasOriginalRgb && oa > 5 && oa < 100)) {
            const outp = outIdx * 4;
            bgR += snapPx[outp]; bgG += snapPx[outp + 1]; bgB += snapPx[outp + 2]; bgCnt++;
          }
        }
      }

      const toneGarR = sameToneCnt >= 2 ? sameToneR / sameToneCnt : (garCnt > 0 ? garR / garCnt : origR);
      const toneGarG = sameToneCnt >= 2 ? sameToneG / sameToneCnt : (garCnt > 0 ? garG / garCnt : origG);
      const toneGarB = sameToneCnt >= 2 ? sameToneB / sameToneCnt : (garCnt > 0 ? garB / garCnt : origB);
      const avgBgR = bgCnt >= 2 ? bgR / bgCnt : fbBgR;
      const avgBgG = bgCnt >= 2 ? bgG / bgCnt : fbBgG;
      const avgBgB = bgCnt >= 2 ? bgB / bgCnt : fbBgB;
      const bgLum = 0.299 * avgBgR + 0.587 * avgBgG + 0.114 * avgBgB;

      const dGar = Math.min(minPatchGarD, garCnt > 0 ? Math.hypot(origR - toneGarR, origG - toneGarG, origB - toneGarB) : 999);
      const dBg = Math.hypot(origR - avgBgR, origG - avgBgG, origB - avgBgB);
      const bgGarSep = garCnt > 0 ? Math.hypot(toneGarR - avgBgR, toneGarG - avgBgG, toneGarB - avgBgB) : 0;
      const isLightOrCheckEdge = maxC >= 132 && (maxC - minC) <= 82 && (dGar <= 36 || dBg > 18);

      // Protect warm neck/collar skin or dark hair strands near neck corner
      if (y <= upperSkinHairCutoffY && origA >= 85) {
        const isWarmSkin = origR > origG && origG >= origB * 0.85 && (origR - origB) >= 12 && dBg > 20;
        const isDarkHairStr = origLum < 82 && bgLum > 110 && dBg > 24 && (garCnt === 0 || dGar > 34);
        if (isWarmSkin || isDarkHairStr) continue;
      }

      if (sd <= -0.85) {
        // Outside smooth shoulder line: strip jagged outer nubs & background fringe
        if (origA === 0) continue;
        if (origA < 220 || (!isLightOrCheckEdge && bgGarSep > 18 && dBg < dGar * 0.90)) {
          pixels[p + 3] = 0;
        }
      } else if (sd < 0.85) {
        // Sub-pixel natural edge transition (never paint fake outline onto empty sky)
        const t = (sd + 0.85) / 1.70;
        const targetA = Math.round(t * t * (3 - 2 * t) * 255);
        if (origA === 0) {
          if (sd > 0.05 && dGar <= 36 && (bgGarSep <= 18 || dBg >= 18)) {
            pixels[p + 3] = Math.min(targetA, 220);
          }
          continue;
        }
        if (sd < 0 && !isLightOrCheckEdge && bgGarSep > 18 && dBg < 20 && dGar > 38) {
          pixels[p + 3] = Math.min(origA, Math.round(targetA * 0.55));
        } else {
          pixels[p + 3] = Math.abs(origA - targetA) > 12 ? Math.round(origA * 0.22 + targetA * 0.78) : targetA;
        }

        const finalA = pixels[p + 3];
        if (!isLightOrCheckEdge && finalA > 0 && finalA < 252 && garCnt > 0 && bgGarSep > 16 && dBg < dGar * 1.15 && dGar > 12) {
          const aNorm = Math.max(0.28, Math.max(origA, finalA) / 255.0);
          const unmixR = Math.max(0, Math.min(255, (origR - avgBgR * (1 - aNorm)) / aNorm));
          const unmixG = Math.max(0, Math.min(255, (origG - avgBgG * (1 - aNorm)) / aNorm));
          const unmixB = Math.max(0, Math.min(255, (origB - avgBgB * (1 - aNorm)) / aNorm));

          const anchorR = Math.max(Math.min(origR, toneGarR) - 10, Math.min(Math.max(origR, toneGarR) + 10, unmixR));
          const anchorG = Math.max(Math.min(origG, toneGarG) - 10, Math.min(Math.max(origG, toneGarG) + 10, unmixG));
          const anchorB = Math.max(Math.min(origB, toneGarB) - 10, Math.min(Math.max(origB, toneGarB) + 10, unmixB));

          const blend = Math.min(0.88, (1 - finalA / 255.0) * 0.48 + 0.36);
          pixels[p] = Math.round(origR * (1 - blend) + anchorR * blend);
          pixels[p + 1] = Math.round(origG * (1 - blend) + anchorG * blend);
          pixels[p + 2] = Math.round(origB * (1 - blend) + anchorB * blend);
        }
      } else {
        // Strictly >= 0.85px inside shoulder curve: lock interior opaque & clean
        if (garCnt === 0 || origA >= 40 || dGar <= 42 || isLightOrCheckEdge || bgGarSep <= 22) {
          pixels[p + 3] = 255;
          if (!isLightOrCheckEdge && garCnt > 0 && bgGarSep > 16 && origA < 225 && dBg < dGar) {
            const mix = Math.min(0.82, (1 - origA / 255.0) * 0.65 + 0.25);
            pixels[p] = Math.round(origR * (1 - mix) + toneGarR * mix);
            pixels[p + 1] = Math.round(origG * (1 - mix) + toneGarG * mix);
            pixels[p + 2] = Math.round(origB * (1 - mix) + toneGarB * mix);
          }
        }
      }
    }
  };

  applyPhotographicShoulderFinish("left");
  nearestDistSq.fill(999);
  nearestK.fill(-1);
  applyPhotographicShoulderFinish("right");
}

/**
 * Eliminates white lines, halos, and background-colored edge fringes along the entire subject perimeter.
 */
export function removeSubjectBoundaryWhiteLine(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  bgModels?: BackgroundModels
) {
  const total = w * h;
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = pixels[i * 4 + 3];
  }

  let bgMeanR = bgModels?.global?.meanR ?? 250;
  let bgMeanG = bgModels?.global?.meanG ?? 250;
  let bgMeanB = bgModels?.global?.meanB ?? 250;
  const bgLum = 0.299 * bgMeanR + 0.587 * bgMeanG + 0.114 * bgMeanB;
  const isLightBg = bgLum > 155;

  let minSubjX = w, maxSubjX = 0, minSubjY = h, maxSubjY = 0;
  let massCenterX = 0, subjCount = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphaCopy[row + x] > 30) {
        if (x < minSubjX) minSubjX = x;
        if (x > maxSubjX) maxSubjX = x;
        if (y < minSubjY) minSubjY = y;
        if (y > maxSubjY) maxSubjY = y;
        massCenterX += x;
        subjCount++;
      }
    }
  }
  const subjH = Math.max(1, maxSubjY - minSubjY);
  const subjW = Math.max(1, maxSubjX - minSubjX);
  const coreCenterX = subjCount > 0 ? Math.round(massCenterX / subjCount) : Math.floor(w / 2);
  let detectedNeckY = Math.floor(minSubjY + subjH * 0.45);
  let minNeckSpan = Infinity;
  for (let y = Math.floor(minSubjY + subjH * 0.26); y <= Math.floor(minSubjY + subjH * 0.54); y++) {
    const row = y * w;
    let l = -1, r = -1;
    for (let x = minSubjX; x <= maxSubjX; x++) {
      if (alphaCopy[row + x] >= 165) { l = x; break; }
    }
    for (let x = maxSubjX; x >= minSubjX; x--) {
      if (alphaCopy[row + x] >= 165) { r = x; break; }
    }
    if (l !== -1 && r > l && (r - l) < minNeckSpan) {
      minNeckSpan = r - l;
      detectedNeckY = y;
    }
  }
  const headAndEarMaxY = minSubjY + subjH * 0.48;
  const upperPerimeterMaxY = Math.min(minSubjY + subjH * 0.51, detectedNeckY + Math.round(subjH * 0.03));

  // Sample authentic face/neck + shadowed left-side jaw/neck skin so under-ear skin isn't trimmed as halo
  let skinR = 0, skinG = 0, skinB = 0, skinCount = 0;
  let sideSkinR = 0, sideSkinG = 0, sideSkinB = 0, sideSkinCount = 0;
  for (let y = Math.floor(minSubjY + subjH * 0.22); y <= Math.floor(minSubjY + subjH * 0.50); y += 2) {
    const row = y * w;
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.11)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.11)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 220) {
        const p = idx * 4;
        const sr = pixels[p], sg = pixels[p + 1], sb = pixels[p + 2];
        if (sr > sg && sr > sb && (sr - sb) >= 12) {
          skinR += sr; skinG += sg; skinB += sb; skinCount++;
        }
      }
    }
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.20)); x < Math.max(0, coreCenterX - Math.round(subjW * 0.06)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 230) {
        const p = idx * 4;
        const sr = pixels[p], sg = pixels[p + 1], sb = pixels[p + 2];
        if (sr > sg && sg >= sb * 0.85 && (sr - sb) >= 10) {
          sideSkinR += sr; sideSkinG += sg; sideSkinB += sb; sideSkinCount++;
        }
      }
    }
  }
  const avgSkinR = skinCount > 0 ? skinR / skinCount : 0;
  const avgSkinG = skinCount > 0 ? skinG / skinCount : 0;
  const avgSkinB = skinCount > 0 ? skinB / skinCount : 0;
  const avgSideSkinR = sideSkinCount > 0 ? sideSkinR / sideSkinCount : avgSkinR;
  const avgSideSkinG = sideSkinCount > 0 ? sideSkinG / sideSkinCount : avgSkinG;
  const avgSideSkinB = sideSkinCount > 0 ? sideSkinB / sideSkinCount : avgSkinB;

  // Pass 1: Outermost boundary fringe trimming across head/ear/neck (2 passes) & lower shoulders/torso (1 gentle pass)
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      const isHeadAndEarZone = y < headAndEarMaxY;
      const isUpperPerimeterZone = isHeadAndEarZone || y < upperPerimeterMaxY;
      if (pass === 1 && !isUpperPerimeterZone) continue;
      const secY = Math.min(2, Math.floor((y / h) * 3));

      for (let x = 1; x < w - 1; x++) {
        const idx = row + x;
        const a = alphaCopy[idx];
        if (a === 0) continue;

        const aUp = alphaCopy[row - w + x];
        const aDown = alphaCopy[row + w + x];
        const aLeft = alphaCopy[row + x - 1];
        const aRight = alphaCopy[row + x + 1];

        const transparentNeighbors =
          (aUp <= 20 ? 1 : 0) +
          (aDown <= 20 ? 1 : 0) +
          (aLeft <= 20 ? 1 : 0) +
          (aRight <= 20 ? 1 : 0);

        if (transparentNeighbors > 0) {
          const pIdx = idx * 4;
          const r = pixels[pIdx];
          const g = pixels[pIdx + 1];
          const b = pixels[pIdx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);

          let isLowerWhiteShirtEdge = false;
          let isLowerGarmentEdge = false;
          if (!isUpperPerimeterZone) {
            let lFgR = 0, lFgG = 0, lFgB = 0, lFgCnt = 0;
            let minFgDist = 999;
            for (let dy = -3; dy <= 3; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) continue;
              for (let dx = -3; dx <= 3; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;
                const nIdx = ny * w + nx;
                if (alphaCopy[nIdx] >= 210) {
                  const npIdx = nIdx * 4;
                  const nr = pixels[npIdx], ng = pixels[npIdx + 1], nb = pixels[npIdx + 2];
                  const d = Math.hypot(r - nr, g - ng, b - nb);
                  if (d < minFgDist) minFgDist = d;
                  lFgR += nr; lFgG += ng; lFgB += nb; lFgCnt++;
                }
              }
            }
            if (lFgCnt > 0) {
              const aFgR = lFgR / lFgCnt, aFgG = lFgG / lFgCnt, aFgB = lFgB / lFgCnt;
              const aFgLum = 0.299 * aFgR + 0.587 * aFgG + 0.114 * aFgB;
              const lFgDist = Math.hypot(r - aFgR, g - aFgG, b - aFgB);
              if (
                (maxC >= 132 && (maxC - minC) <= 82 && (minFgDist <= 38 || (aFgLum >= 130 && lFgDist <= 38))) ||
                (lum >= 165 && minFgDist <= 34)
              ) {
                isLowerWhiteShirtEdge = true;
              }
              if (lFgCnt >= 3 && a >= 65 && (minFgDist <= 36 || lFgDist <= 38)) {
                isLowerGarmentEdge = true;
              }
            }
          }

          const sec = bgModels?.sectors?.[secY * 3 + Math.min(2, Math.floor((x / w) * 3))];
          const sBgR = sec ? sec.meanR : bgMeanR;
          const sBgG = sec ? sec.meanG : bgMeanG;
          const sBgB = sec ? sec.meanB : bgMeanB;
          const distToBg = Math.min(
            Math.hypot(r - sBgR, g - sBgG, b - sBgB),
            Math.hypot(r - bgMeanR, g - bgMeanG, b - bgMeanB)
          );
          const isWarmTone = r > g && g >= b * 0.85 && (r - b) >= 10;
          const distToSkin = Math.min(
            skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999,
            (sideSkinCount > 0 || skinCount > 0) ? Math.hypot(r - avgSideSkinR, g - avgSideSkinG, b - avgSideSkinB) : 999
          );
          const hasWarmVsBg = (r - b) - (sBgR - sBgB) >= 8;
          const isLikelySkin = isWarmTone && ((skinCount === 0 && sideSkinCount === 0) ? distToBg > 18 : (distToSkin < distToBg * 0.96 || distToSkin <= 30 || (hasWarmVsBg && distToBg > 20)));
          const isDarkHair = lum < 85 && bgLum > 110 && distToBg > 24;

          if (transparentNeighbors >= 2) {
            if (
              a < 40 ||
              (!isLikelySkin && !hasWarmVsBg && !isDarkHair && !isLowerWhiteShirtEdge && !isLowerGarmentEdge && a < 165 && distToBg < 32) ||
              (isLowerWhiteShirtEdge && a < 62 && distToBg < 18) ||
              (isUpperPerimeterZone && isLightBg && !isLikelySkin && !hasWarmVsBg && !isDarkHair && lum > 160 && a < 145)
            ) {
              pixels[pIdx + 3] = 0;
              alphaCopy[idx] = 0;
              continue;
            }
          } else if (transparentNeighbors === 1) {
            if (
              a < 26 ||
              (!isLikelySkin && !hasWarmVsBg && !isDarkHair && !isLowerWhiteShirtEdge && !isLowerGarmentEdge && a < 140 && distToBg < 28) ||
              (isLowerWhiteShirtEdge && a < 45 && distToBg < 16) ||
              (isUpperPerimeterZone && isLightBg && !isLikelySkin && !hasWarmVsBg && !isDarkHair && lum > 168 && a < 120)
            ) {
              pixels[pIdx + 3] = 0;
              alphaCopy[idx] = 0;
              continue;
            }
          }
        }
      }
    }
  }

  // Pass 2: Universal Color De-contamination on surviving perimeter pixels
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    const isUpperZone = y < upperPerimeterMaxY;
    const secY = Math.min(2, Math.floor((y / h) * 3));

    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      const a = pixels[idx * 4 + 3];
      if (a === 0 || a >= 235) continue;

      const aUp = alphaCopy[row - w + x];
      const aDown = alphaCopy[row + w + x];
      const aLeft = alphaCopy[row + x - 1];
      const aRight = alphaCopy[row + x + 1];
      if (aUp !== 0 && aDown !== 0 && aLeft !== 0 && aRight !== 0) continue;

      const pIdx = idx * 4;
      const curR = pixels[pIdx];
      const curG = pixels[pIdx + 1];
      const curB = pixels[pIdx + 2];
      const curLum = 0.299 * curR + 0.587 * curG + 0.114 * curB;

      const sec = bgModels?.sectors?.[secY * 3 + Math.min(2, Math.floor((x / w) * 3))];
      const sBgR = sec ? sec.meanR : bgMeanR;
      const sBgG = sec ? sec.meanG : bgMeanG;
      const sBgB = sec ? sec.meanB : bgMeanB;

      if (isUpperZone && isLightBg && curLum > 160 && a < 195) {
        if (curLum > 195 && a < 140) {
          pixels[pIdx + 3] = Math.round(a * 0.40);
        } else if (curLum > 170 && a < 165) {
          pixels[pIdx + 3] = Math.round(a * 0.70);
        }
      }

      let fgR = 0, fgG = 0, fgB = 0, fgCount = 0;
      let sameToneR = 0, sameToneG = 0, sameToneB = 0, sameToneCnt = 0;
      let minFgDist = 999, bestFgR = curR, bestFgG = curG, bestFgB = curB;
      for (let dy = -3; dy <= 3; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const nIdx = ny * w + nx;
          if (alphaCopy[nIdx] >= 215) {
            const npIdx = nIdx * 4;
            const nr = pixels[npIdx], ng = pixels[npIdx + 1], nb = pixels[npIdx + 2];
            const d = Math.hypot(curR - nr, curG - ng, curB - nb);
            if (d < minFgDist) {
              minFgDist = d; bestFgR = nr; bestFgG = ng; bestFgB = nb;
            }
            if (d <= 45) {
              sameToneR += nr; sameToneG += ng; sameToneB += nb; sameToneCnt++;
            }
            fgR += nr; fgG += ng; fgB += nb; fgCount++;
          }
        }
      }

      if (fgCount > 0) {
        const maxC = Math.max(curR, curG, curB);
        const minC = Math.min(curR, curG, curB);
        const avgFgR = fgR / fgCount;
        const avgFgG = fgG / fgCount;
        const avgFgB = fgB / fgCount;
        const refFgR = sameToneCnt > 0 ? sameToneR / sameToneCnt : bestFgR;
        const refFgG = sameToneCnt > 0 ? sameToneG / sameToneCnt : bestFgG;
        const refFgB = sameToneCnt > 0 ? sameToneB / sameToneCnt : bestFgB;
        const avgFgLum = 0.299 * avgFgR + 0.587 * avgFgG + 0.114 * avgFgB;
        const fgBgDist = Math.hypot(refFgR - sBgR, refFgG - sBgG, refFgB - sBgB);
        const curBgDist = Math.hypot(curR - sBgR, curG - sBgG, curB - sBgB);
        const curFgDist = Math.hypot(curR - avgFgR, curG - avgFgG, curB - avgFgB);
        const isLowerWhiteShirtEdge =
          !isUpperZone &&
          ((maxC >= 132 && (maxC - minC) <= 82 && (minFgDist <= 38 || (avgFgLum >= 130 && curFgDist <= 38))) ||
           (curLum >= 165 && minFgDist <= 34)) &&
          a >= 135 &&
          (curBgDist > 20 || minFgDist <= 18);

        if (!isLowerWhiteShirtEdge && minFgDist > 14 && fgBgDist > 24 && Math.min(minFgDist, curFgDist) > 14 && curBgDist < fgBgDist * 0.98) {
          const aNorm = Math.max(0.25, a / 255.0);
          const unmixR = Math.max(0, Math.min(255, (curR - sBgR * (1 - aNorm)) / aNorm));
          const unmixG = Math.max(0, Math.min(255, (curG - sBgG * (1 - aNorm)) / aNorm));
          const unmixB = Math.max(0, Math.min(255, (curB - sBgB * (1 - aNorm)) / aNorm));

          const anchorR = Math.max(Math.min(curR, refFgR) - 10, Math.min(Math.max(curR, refFgR) + 10, unmixR));
          const anchorG = Math.max(Math.min(curG, refFgG) - 10, Math.min(Math.max(curG, refFgG) + 10, unmixG));
          const anchorB = Math.max(Math.min(curB, refFgB) - 10, Math.min(Math.max(curB, refFgB) + 10, unmixB));

          const blend = Math.min(0.88, (1 - aNorm * 0.58));
          pixels[pIdx] = Math.round(curR * (1 - blend) + anchorR * blend);
          pixels[pIdx + 1] = Math.round(curG * (1 - blend) + anchorG * blend);
          pixels[pIdx + 2] = Math.round(curB * (1 - blend) + anchorB * blend);
        }
      }
    }
  }
}

/**
 * Final Garment & Shirt Opacity Lock:
 * Guarantees that after edge/halo cleanup passes, no shirt squares, stripes, folds,
 * collar pixels, or shoulder/sleeve interiors remain semi-transparent (< 255) or holed,
 * while strictly leaving outer exterior fringes free for contour decontamination (no halo freezing).
 */
function lockGarmentInteriorOpacity(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  interiorOnly = false
) {
  const total = w * h;
  const alphaFloat = new Float32Array(total);
  for (let i = 0; i < total; i++) alphaFloat[i] = pixels[i * 4 + 3];

  let minX = w, maxX = 0, minY = h, maxY = 0, subjCount = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alphaFloat[row + x] >= 35) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        subjCount++;
      }
    }
  }

  if (subjCount < 200 || maxX <= minX || maxY <= minY) return;
  const subjW = maxX - minX;
  const subjH = maxY - minY;

  // True exterior background + 3px perimeter band so exterior edge AA stays crisp and natural
  const isExterior = findExteriorBackgroundMask(alphaFloat, w, h, 20);
  const isNearExterior = new Uint8Array(isExterior);
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Uint8Array(isNearExterior);
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        if (tmp[i] === 1) {
          isNearExterior[i - 1] = 1;
          isNearExterior[i + 1] = 1;
          isNearExterior[i - w] = 1;
          isNearExterior[i + w] = 1;
        }
      }
    }
  }

  let bgR = 0, bgG = 0, bgB = 0, bgCnt = 0;
  const stepY = Math.max(1, Math.floor(h / 60));
  const stepX = Math.max(1, Math.floor(w / 60));
  for (let y = 0; y < h; y += stepY) {
    const row = y * w;
    for (let x = 0; x < w; x += stepX) {
      const i = row + x;
      if (isExterior[i] === 1) {
        const p = i * 4;
        bgR += pixels[p]; bgG += pixels[p + 1]; bgB += pixels[p + 2]; bgCnt++;
      }
    }
  }
  const meanBgR = bgCnt > 8 ? bgR / bgCnt : 245;
  const meanBgG = bgCnt > 8 ? bgG / bgCnt : 245;
  const meanBgB = bgCnt > 8 ? bgB / bgCnt : 245;

  // Locate neck minimum dynamically using solid core (>= 175) so faint halos don't distort collar/shoulder bounds
  let neckY = Math.floor(minY + subjH * 0.44);
  let minNeckSpan = Infinity;
  let neckL = minX;
  let neckR = maxX;
  for (let y = Math.floor(minY + subjH * 0.26); y <= Math.floor(minY + subjH * 0.52); y++) {
    const row = y * w;
    let l = -1, r = -1;
    for (let x = minX; x <= maxX; x++) {
      if (alphaFloat[row + x] >= 175) { l = x; break; }
    }
    for (let x = maxX; x >= minX; x--) {
      if (alphaFloat[row + x] >= 175) { r = x; break; }
    }
    if (l !== -1 && r > l && (r - l) < minNeckSpan) {
      minNeckSpan = r - l;
      neckY = y;
      neckL = l;
      neckR = r;
    }
  }

  const garmentStartY = Math.min(
    Math.floor(minY + subjH * 0.48),
    Math.max(Math.floor(minY + subjH * 0.38), neckY + Math.round(subjH * 0.02))
  );

  // Per-row horizontal solid garment span (>= 155 inside non-exterior)
  const leftBound = new Int32Array(h).fill(-1);
  const rightBound = new Int32Array(h).fill(-1);
  const upperCollarLimitY = Math.min(Math.floor(minY + subjH * 0.55), neckY + Math.round(subjH * 0.08));
  for (let y = garmentStartY; y <= maxY; y++) {
    const row = y * w;
    const minScanX = y < upperCollarLimitY ? Math.max(minX, neckL - 6) : minX;
    const maxScanX = y < upperCollarLimitY ? Math.min(maxX, neckR + 6) : maxX;
    for (let x = minScanX; x <= maxScanX; x++) {
      if (isExterior[row + x] === 0 && alphaFloat[row + x] >= 155) { leftBound[y] = x; break; }
    }
    for (let x = maxScanX; x >= minScanX; x--) {
      if (isExterior[row + x] === 0 && alphaFloat[row + x] >= 155) { rightBound[y] = x; break; }
    }
  }

  // Per-column solid garment top (skipping ear/hair at top) & interpolate narrow check-square dips (<= 8px)
  const colSolidTop = new Int32Array(w).fill(maxY);
  const colScanStart = Math.max(garmentStartY, neckY + Math.round(subjH * 0.01));
  for (let x = minX; x <= maxX; x++) {
    for (let y = colScanStart; y <= Math.min(h - 3, maxY); y++) {
      if (alphaFloat[y * w + x] >= 175 && alphaFloat[(y + 1) * w + x] >= 175) {
        colSolidTop[x] = y;
        break;
      }
    }
  }
  const rawColTop = new Int32Array(colSolidTop);
  for (let x = minX + 1; x <= maxX - 1; ) {
    if (rawColTop[x] >= maxY - 2) {
      const gapStart = x;
      while (x <= maxX - 1 && rawColTop[x] >= maxY - 2) x++;
      const gapLen = x - gapStart;
      if (gapLen <= 8 && gapStart > minX && x <= maxX) {
        const tL = rawColTop[gapStart - 1];
        const tR = rawColTop[x];
        if (tL < maxY - 2 && tR < maxY - 2 && Math.abs(tL - tR) <= 10) {
          for (let gx = gapStart; gx < x; gx++) {
            const frac = (gx - (gapStart - 1)) / (gapLen + 1);
            colSolidTop[gx] = Math.round(tL + (tR - tL) * frac);
          }
        }
      }
    } else {
      x++;
    }
  }

  // Detect light/white/pastel/check garment & average garment color inside chest silhouette
  let lightPx = 0, checkPx = 0, samplePx = 0;
  let garSumR = 0, garSumG = 0, garSumB = 0, garCnt = 0;
  const cX0 = Math.floor(minX + subjW * 0.16);
  const cX1 = Math.floor(maxX - subjW * 0.16);
  for (let y = Math.floor(garmentStartY + subjH * 0.04); y <= Math.min(h - 4, maxY - 2); y += 3) {
    const row = y * w;
    const sx0 = leftBound[y] !== -1 ? Math.max(cX0, leftBound[y] + 4) : cX0;
    const sx1 = rightBound[y] !== -1 ? Math.min(cX1, rightBound[y] - 4) : cX1;
    if (sx1 <= sx0 + 6) continue;
    for (let x = sx0; x <= sx1 - 3; x += 3) {
      const idx = row + x;
      const pIdx = idx * 4;
      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      if ((lum >= 132 && (maxC - minC) <= 82) || lum >= 175) lightPx++;
      const rIdx = (row + Math.min(w - 1, x + 3)) * 4;
      const lumR = 0.299 * pixels[rIdx] + 0.587 * pixels[rIdx + 1] + 0.114 * pixels[rIdx + 2];
      if (Math.abs(lum - lumR) >= 14) checkPx++;
      samplePx++;
      if (alphaFloat[idx] >= 180) {
        garSumR += r; garSumG += g; garSumB += b; garCnt++;
      }
    }
  }
  const isWhiteOrCheck = samplePx > 15 && (lightPx / samplePx >= 0.14 || checkPx / samplePx >= 0.035);
  const avgGarR = garCnt > 8 ? garSumR / garCnt : 128;
  const avgGarG = garCnt > 8 ? garSumG / garCnt : 128;
  const avgGarB = garCnt > 8 ? garSumB / garCnt : 128;
  const bgGarContrast = Math.hypot(avgGarR - meanBgR, avgGarG - meanBgG, avgGarB - meanBgB);

  // Lock ALL enclosed shirt & garment interior opacity strictly to 255 (chest, collar, shoulders, sleeves)
  // while leaving exterior boundary fringes free for clean edge polish & closing narrow enclosed clothing holes
  const maxCheckGapX = Math.max(22, Math.round(subjW * 0.14));
  const maxCheckGapY = Math.max(28, Math.round(subjH * 0.12));

  for (let y = garmentStartY; y <= maxY; y++) {
    const lB = leftBound[y];
    const rB = rightBound[y];
    if (lB === -1 || rB <= lB + 6) continue;
    const row = y * w;
    const innerL = lB + 2;
    const innerR = rB - 2;
    const coreInset = Math.max(8, Math.round(subjW * 0.08));

    for (let x = Math.max(minX, lB + 1); x <= Math.min(maxX, rB - 1); x++) {
      const idx = row + x;
      if (isExterior[idx] !== 0) continue;
      const pIdx = idx * 4;
      const a = pixels[pIdx + 3];
      if (a > 0 && a < 255) {
        const insideNeckCol = x >= neckL + 2 && x <= neckR - 2;
        if (isNearExterior[idx] === 0) {
          // Proven >= 3px inside the silhouette boundary: lock all enclosed clothing/collar pixels solidly to 255
          if ((y >= colSolidTop[x] && a >= 20) || (insideNeckCol && a >= 40)) {
            pixels[pIdx + 3] = 255;
          }
        } else if (!interiorOnly && x >= innerL && x <= innerR && y >= colSolidTop[x] + 1) {
          const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
          const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
          const distBg = Math.hypot(r - meanBgR, g - meanBgG, b - meanBgB);
          const isProtectedLight = isWhiteOrCheck && maxC >= 132 && (maxC - minC) <= 82 && (distBg >= 16 || bgGarContrast < 22);
          if (a >= 155 || (isProtectedLight && a >= 75)) {
            pixels[pIdx + 3] = 255;
          }
        }
      }
    }

    if (y >= maxY - 6 || y >= h - 7) continue;

    // Close narrow interior holes (< 45 alpha) enclosed on all 4 sides by solid garment (including white check squares)
    for (let x = Math.max(minX + 3, lB + 3); x <= Math.min(maxX - 3, rB - 3); ) {
      const a = pixels[(row + x) * 4 + 3];
      if (a < 45 && y >= colSolidTop[x] + 2) {
        const gapStart = x;
        while (x <= Math.min(maxX - 3, rB - 3) && pixels[(row + x) * 4 + 3] < 45) x++;
        const gapLen = x - gapStart;
        if (gapLen <= maxCheckGapX && gapStart > lB + 2 && x <= rB - 2) {
          let bgMatchCnt = 0, lightCnt = 0, sampleCnt = 0;
          for (let gx = gapStart; gx < x; gx += Math.max(1, Math.floor(gapLen / 4))) {
            sampleCnt++;
            const gp = (row + gx) * 4;
            const gr = pixels[gp], gg = pixels[gp + 1], gb = pixels[gp + 2];
            const gLum = 0.299 * gr + 0.587 * gg + 0.114 * gb;
            const gMaxC = Math.max(gr, gg, gb), gMinC = Math.min(gr, gg, gb);
            if ((gLum >= 132 && (gMaxC - gMinC) <= 82) || gLum >= 175) lightCnt++;
            if (bgGarContrast > 24 && Math.hypot(gr - meanBgR, gg - meanBgG, gb - meanBgB) < 24) {
              bgMatchCnt++;
            }
          }
          const insideChestCoreGap =
            gapStart >= lB + coreInset &&
            x <= rB - coreInset &&
            gapLen <= Math.max(18, Math.round(subjW * 0.10));
          const isEnclosedCheckSquare =
            isWhiteOrCheck &&
            insideChestCoreGap &&
            sampleCnt > 0 &&
            lightCnt / sampleCnt >= 0.5;
          if (!isEnclosedCheckSquare && sampleCnt > 0 && bgMatchCnt / sampleCnt >= 0.55) continue;

          let enclosedVert = true;
          for (let gx = gapStart; gx < x; gx += Math.max(1, Math.floor(gapLen / 4))) {
            let hasUp = false, hasDown = false;
            for (let dy = 1; dy <= maxCheckGapY && y - dy >= garmentStartY; dy++) {
              if (pixels[((y - dy) * w + gx) * 4 + 3] >= 175) { hasUp = true; break; }
            }
            for (let dy = 1; dy <= maxCheckGapY && y + dy <= maxY; dy++) {
              if (pixels[((y + dy) * w + gx) * 4 + 3] >= 175) { hasDown = true; break; }
            }
            if (!hasUp || !hasDown) {
              enclosedVert = false;
              break;
            }
          }
          if (enclosedVert) {
            for (let gx = gapStart; gx < x; gx++) {
              pixels[(row + gx) * 4 + 3] = 255;
            }
          }
        }
      } else {
        x++;
      }
    }
  }
}

// -------------------------------------------------------------
// MAIN ORCHESTRATION PIPELINE
// -------------------------------------------------------------

/**
 * Executes high-precision background removal using the RMBG-1.4 AI engine:
 * Preserves 100% complete subject (head, hair, ears, clothes, body, hands, legs, objects, products).
 */
export async function removeBackground(
  imageInput: string | File | Blob,
  onProgress: (p: string) => void = () => {},
  forceWhiteBackground = false,
  isManualMode = false,
  options: BgRemovalOptions = {}
): Promise<Blob> {
  const startTime = Date.now();
  onProgress("Initializing AI Engine...");

  const {
    engine = 'rmbg',
    removeBackgroundNoise = true,
    decontaminateHalos = true,
    extendLeftShoulder = true,
    leftShoulderExtensionAmount,
  } = options;

  // Always ensure state-of-the-art RMBG-1.4 is loaded
  await ensureIsnetLoaded().catch(console.error);

  // Ensure input is a string (DataURL or URL)
  let imageSrcForDownscale: string;
  if (typeof imageInput === "string") {
    imageSrcForDownscale = imageInput;
  } else {
    imageSrcForDownscale = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(imageInput);
    });
  }

  // Intermediate scaling for neural network
  const imageSrc = await downscaleImageIfNeeded(imageSrcForDownscale, 1024);

  try {
    onProgress("Segmenting Subject & Details...");

    let resSegmentation = null;
    let resModnet = null;

    // Dual-AI Consensus Pipeline:
    // Run RMBG-1.4 (universal/sharp subject & clothing) AND MODNet (portrait/hair/ear/chair specialist)
    if (engine === 'modnet') {
      await ensureModnetLoaded().catch(console.error);
      if (modnetPipeline) {
        resSegmentation = await modnetPipeline(imageSrc).catch((e: any) => {
          console.warn("MODNet inference failed, falling back to RMBG...", e);
          return null;
        });
      }
    } else if (engine === 'auto' || engine === 'strict_subject') {
      await ensureModnetLoaded().catch(() => {});
      const [rmbgRes, modnetRes] = await Promise.all([
        isnetPipeline
          ? isnetPipeline(imageSrc).catch((e: any) => {
              console.warn("RMBG-1.4 inference failed:", e);
              return null;
            })
          : Promise.resolve(null),
        modnetPipeline
          ? modnetPipeline(imageSrc).catch((e: any) => {
              console.warn("MODNet auxiliary inference failed:", e);
              return null;
            })
          : Promise.resolve(null),
      ]);
      resSegmentation = rmbgRes || modnetRes;
      if (rmbgRes && modnetRes) {
        resModnet = modnetRes;
      }
    } else if (isnetPipeline) {
      resSegmentation = await isnetPipeline(imageSrc).catch((e: any) => {
        console.warn("RMBG-1.4 inference failed:", e);
        return null;
      });
    }

    // Fallback to MODNet if primary failed
    if (!resSegmentation && modnetPipeline) {
      try {
        resSegmentation = await modnetPipeline(imageSrc);
      } catch (e) {
        console.warn("MODNet fallback failed", e);
      }
    }

    if (!resSegmentation && hasWebGPU) {
      console.warn("[AI] WebGPU inference failed, forcing WASM fallback...");
      hasWebGPU = false; 
      isnetPipeline = null;
      modnetPipeline = null;
      await ensureIsnetLoaded().catch(console.error);
      if (isnetPipeline) {
        resSegmentation = await isnetPipeline(imageSrc).catch((e: any) => {
          console.error("WASM RMBG pass failed", e);
          return null;
        });
      }
    }

    if (!resSegmentation) {
      throw new Error("AI models failed to process the image.");
    }

    onProgress("Processing Subject & Preserving Details...");

    const getMask = (result: any) => {
      if (!result || result.length === 0) return null;
      let segment = result[0];
      if (result.length > 1) {
        const foreground = result.find(
          (s: any) => !s.label.toLowerCase().includes("back"),
        );
        if (foreground) segment = foreground;
      }
      return segment.mask;
    };

    const rawMask = getMask(resSegmentation);
    let maskData: { width: number; height: number; data: Float32Array } | null = null;
    let modnetMaskData: { width: number; height: number; data: Float32Array } | null = null;

    if (rawMask) {
      maskData = extractAlphaArrayFromMask(rawMask);
      isolateAndCleanSubjectMask(maskData, {
        isolateMainSubject: options.isolateMainSubject ?? engine === 'strict_subject',
        objectStrictness: options.objectStrictness ?? 75,
        removeNoise: removeBackgroundNoise,
      });
    }

    if (resModnet) {
      const mMask = getMask(resModnet);
      if (mMask) {
        modnetMaskData = extractAlphaArrayFromMask(mMask);
      }
    }

    // Load Full Original Image to construct native high-resolution output
    const origImg = new Image();
    origImg.crossOrigin = "anonymous";
    await new Promise((res) => {
      origImg.onload = res;
      origImg.src = imageSrcForDownscale;
    });

    const canvas = document.createElement("canvas");
    canvas.width = origImg.width;
    canvas.height = origImg.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(origImg, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const w = canvas.width;
    const h = canvas.height;

    onProgress("Refining Edges & Eliminating Halos...");

    const upscaleMask = (srcMask: { width: number; height: number; data: Float32Array }): Float32Array => {
      const mw = srcMask.width;
      const mh = srcMask.height;
      const mData = srcMask.data;
      const out = new Float32Array(w * h);

      for (let y = 0; y < h; y++) {
        const srcY = Math.max(0, Math.min(mh - 1.001, (y + 0.5) * (mh / h) - 0.5));
        const y1 = Math.floor(srcY);
        const y2 = Math.min(mh - 1, y1 + 1);
        const fy = srcY - y1;
        const invFy = 1 - fy;
        const rowOffset = y * w;

        for (let x = 0; x < w; x++) {
          const srcX = Math.max(0, Math.min(mw - 1.001, (x + 0.5) * (mw / w) - 0.5));
          const x1 = Math.floor(srcX);
          const x2 = Math.min(mw - 1, x1 + 1);
          const fx = srcX - x1;
          const invFx = 1 - fx;

          const p11 = mData[y1 * mw + x1];
          const p21 = mData[y1 * mw + x2];
          const p12 = mData[y2 * mw + x1];
          const p22 = mData[y2 * mw + x2];

          const a = p11 * invFx * invFy + p21 * fx * invFy + p12 * invFx * fy + p22 * fx * fy;
          out[rowOffset + x] = Math.max(0, Math.min(255, a));
        }
      }
      return out;
    };

    if (maskData) {
      // 1. Bilinear Upscale of Primary Prediction Mask to Full Resolution
      const rawAlphas = upscaleMask(maskData);

      // 1a. Dual-AI Consensus Fusion (RMBG-1.4 + MODNet for clean human portrait separation)
      let portraitModnetAlphas: Float32Array | undefined = undefined;
      if (modnetMaskData) {
        const modnetAlphas = upscaleMask(modnetMaskData);
        const total = w * h;
        let rmbgFg = 0, modnetFg = 0, overlapFg = 0;
        let minSubjY = h, maxSubjY = 0;
        let sumBgR = 0, sumBgG = 0, sumBgB = 0, bgCnt = 0;

        const sampleStep = 4;
        for (let y = 0; y < h; y += sampleStep) {
          const row = y * w;
          for (let x = 0; x < w; x += sampleStep) {
            const i = row + x;
            const ra = rawAlphas[i];
            const ma = modnetAlphas[i];
            if (ra >= 128) {
              rmbgFg++;
              if (y < minSubjY) minSubjY = y;
              if (y > maxSubjY) maxSubjY = y;
            }
            if (ma >= 128) modnetFg++;
            if (ra >= 128 && ma >= 128) {
              overlapFg++;
            }
            if (ra < 25 && ma < 25) {
              const p = i * 4;
              sumBgR += pixels[p]; sumBgG += pixels[p + 1]; sumBgB += pixels[p + 2]; bgCnt++;
            }
          }
        }

        const modnetRatio = modnetFg / Math.max(1, Math.floor((w * h) / (sampleStep * sampleStep)));
        const overlapRatio = overlapFg / Math.max(1, rmbgFg);
        const modnetContainedInRmbg = overlapFg / Math.max(1, modnetFg);

        // Apply MODNet consensus whenever MODNet clearly isolates the foreground person inside RMBG's mask
        // (including scenes where RMBG also grabbed large chairs, sofas, or walls reducing overlapRatio)
        if (
          modnetRatio >= 0.035 &&
          modnetRatio <= 0.92 &&
          (overlapRatio >= 0.40 || (modnetContainedInRmbg >= 0.55 && overlapRatio >= 0.10))
        ) {
          portraitModnetAlphas = modnetAlphas;
          const strict =
            engine === 'strict_subject' ||
            Boolean(options.isolateMainSubject) ||
            (options.objectStrictness ?? 75) >= 65;
          const strictSever =
            Boolean(options.severTouchingObjects) ||
            Boolean(options.isolateMainSubject) ||
            engine === 'strict_subject';
          const mBgR = bgCnt > 10 ? sumBgR / bgCnt : 245;
          const mBgG = bgCnt > 10 ? sumBgG / bgCnt : 245;
          const mBgB = bgCnt > 10 ? sumBgB / bgCnt : 245;

          // Build MODNet human silhouette row spans & fast distance map from confident MODNet core (ma >= 110)
          const mLeft = new Int32Array(h).fill(-1);
          const mRight = new Int32Array(h).fill(-1);
          let mMinY = h, mMaxY = 0;
          const modnetDist = new Uint8Array(total);
          modnetDist.fill(40);

          for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
              const idx = row + x;
              const ma = modnetAlphas[idx];
              if (ma >= 85) {
                if (mLeft[y] === -1) mLeft[y] = x;
                mRight[y] = x;
                if (y < mMinY) mMinY = y;
                if (y > mMaxY) mMaxY = y;
              }
              if (ma >= 110) {
                modnetDist[idx] = 0;
              } else {
                let d = 40;
                if (x > 0) d = Math.min(d, modnetDist[idx - 1] + 1);
                if (y > 0) d = Math.min(d, modnetDist[idx - w] + 1);
                modnetDist[idx] = d;
              }
            }
          }
          for (let y = h - 1; y >= 0; y--) {
            const row = y * w;
            for (let x = w - 1; x >= 0; x--) {
              const idx = row + x;
              let d = modnetDist[idx];
              if (x < w - 1) d = Math.min(d, modnetDist[idx + 1] + 1);
              if (y < h - 1) d = Math.min(d, modnetDist[idx + w] + 1);
              modnetDist[idx] = d;
            }
          }

          if (mMaxY > mMinY + 10) {
            minSubjY = mMinY;
            maxSubjY = Math.max(maxSubjY, mMaxY);
          }
          const neckSplitY = minSubjY + Math.max(1, maxSubjY - minSubjY) * 0.44;
          const upperShoulderTransitionY = minSubjY + Math.max(1, maxSubjY - minSubjY) * 0.58;

          let headMinX = w, headMaxX = 0;
          for (let y = minSubjY; y <= Math.min(h - 1, Math.floor(neckSplitY)); y += 2) {
            if (mLeft[y] !== -1) {
              if (mLeft[y] < headMinX) headMinX = mLeft[y];
              if (mRight[y] > headMaxX) headMaxX = mRight[y];
            }
          }
          if (headMaxX <= headMinX) {
            headMinX = Math.floor(w * 0.30);
            headMaxX = Math.floor(w * 0.70);
          }

          // Estimate interior core garment + outer shoulder garment signature (handles two-tone jackets/coats)
          // & build anatomical symmetrical torso envelope so left shoulder stays intact while wide chairs are stripped.
          let gR = 0, gG = 0, gB = 0, gCnt = 0;
          let lShR = 0, lShG = 0, lShB = 0, lShCnt = 0;
          let rShR = 0, rShG = 0, rShB = 0, rShCnt = 0;
          let lightGarCnt = 0, checkGarCnt = 0, garCheckSamples = 0;
          const cStartY = Math.min(h - 1, Math.floor(neckSplitY));
          const cEndY = Math.min(h - 1, maxSubjY);
          const torsoMinX = new Int32Array(h).fill(-1);
          const torsoMaxX = new Int32Array(h).fill(-1);
          const symEnvL = new Int32Array(h).fill(-1);
          const symEnvR = new Int32Array(h).fill(-1);

          let centerSumX = 0, centerCntX = 0;
          for (let y = Math.floor(minSubjY + (maxSubjY - minSubjY) * 0.16); y <= Math.floor(neckSplitY); y += 2) {
            if (mLeft[y] !== -1 && mRight[y] > mLeft[y]) {
              centerSumX += (mLeft[y] + mRight[y]) * 0.5;
              centerCntX++;
            }
          }
          const bodyCenterX = centerCntX > 0 ? Math.round(centerSumX / centerCntX) : Math.round((headMinX + headMaxX) * 0.5);

          const maxHalfCap = Math.max(48, Math.round((headMaxX - headMinX) * 2.5));
          const maxStepEnv = Math.max(12, Math.round(w * 0.045));
          const rawDistL = new Int32Array(h).fill(0);
          const rawDistR = new Int32Array(h).fill(0);

          for (let y = cStartY; y <= cEndY; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
              const ra = rawAlphas[row + x], ma = modnetAlphas[row + x];
              if ((ra >= 155 && ma >= 100) || ma >= 155) {
                torsoMinX[y] = x;
                break;
              }
            }
            for (let x = w - 1; x >= 0; x--) {
              const ra = rawAlphas[row + x], ma = modnetAlphas[row + x];
              if ((ra >= 155 && ma >= 100) || ma >= 155) {
                torsoMaxX[y] = x;
                break;
              }
            }
            if (torsoMinX[y] !== -1 && torsoMinX[y] < bodyCenterX) {
              rawDistL[y] = Math.min(maxHalfCap, bodyCenterX - torsoMinX[y]);
            }
            if (torsoMaxX[y] !== -1 && torsoMaxX[y] > bodyCenterX) {
              rawDistR[y] = Math.min(maxHalfCap, torsoMaxX[y] - bodyCenterX);
            }
          }

          const envPad = Math.max(10, Math.round(w * 0.025));
          let prevHalfL = Math.max(14, Math.round((headMaxX - headMinX) * 0.52));
          let prevHalfR = prevHalfL;
          for (let y = cStartY; y <= cEndY; y++) {
            let sumL = 0, sumR = 0, cntE = 0;
            for (let dy = -3; dy <= 3; dy++) {
              const ny = y + dy;
              if (ny >= cStartY && ny <= cEndY) {
                if (rawDistL[ny] > 0) sumL += rawDistL[ny];
                if (rawDistR[ny] > 0) sumR += rawDistR[ny];
                cntE++;
              }
            }
            const smL = cntE > 0 ? sumL / cntE : rawDistL[y];
            const smR = cntE > 0 ? sumR / cntE : rawDistR[y];
            const symL = Math.max(smL, Math.min(prevHalfL + maxStepEnv, Math.max(smL, smR * 0.92)));
            const symR = Math.max(smR, Math.min(prevHalfR + maxStepEnv, Math.max(smR, smL * 0.92)));
            prevHalfL = symL;
            prevHalfR = symR;
            symEnvL[y] = Math.max(0, Math.round(bodyCenterX - symL - envPad));
            symEnvR[y] = Math.min(w - 1, Math.round(bodyCenterX + symR + envPad));
          }

          for (let y = cStartY; y <= cEndY; y += 3) {
            const row = y * w;
            const tL = torsoMinX[y];
            const tR = torsoMaxX[y];
            const x0 = tL !== -1 ? Math.max(Math.floor(w * 0.25), tL + 4) : Math.floor(w * 0.34);
            const x1 = tR !== -1 ? Math.min(Math.floor(w * 0.75), tR - 4) : Math.floor(w * 0.66);
            for (let x = x0; x <= x1 - 3; x += 3) {
              const idx = row + x;
              const p = idx * 4;
              const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              if ((lum >= 132 && Math.max(r, g, b) - Math.min(r, g, b) <= 82) || lum >= 175) lightGarCnt++;
              const rIdx = (row + Math.min(w - 1, x + 3)) * 4;
              const rLum = 0.299 * pixels[rIdx] + 0.587 * pixels[rIdx + 1] + 0.114 * pixels[rIdx + 2];
              if (Math.abs(lum - rLum) >= 14) checkGarCnt++;
              garCheckSamples++;
              if (rawAlphas[idx] >= 180 && modnetAlphas[idx] >= 120) {
                gR += r; gG += g; gB += b; gCnt++;
              }
            }
            if (tL !== -1 && tR > tL + 24) {
              for (let sx = tL + 4; sx <= tL + Math.min(24, Math.floor((tR - tL) * 0.2)); sx += 3) {
                const idx = row + sx;
                if (rawAlphas[idx] >= 180 && modnetAlphas[idx] >= 95) {
                  const p = idx * 4;
                  lShR += pixels[p]; lShG += pixels[p + 1]; lShB += pixels[p + 2]; lShCnt++;
                }
              }
              for (let sx = Math.max(tL + 4, tR - 24); sx <= tR - 4; sx += 3) {
                const idx = row + sx;
                if (rawAlphas[idx] >= 180 && modnetAlphas[idx] >= 95) {
                  const p = idx * 4;
                  rShR += pixels[p]; rShG += pixels[p + 1]; rShB += pixels[p + 2]; rShCnt++;
                }
              }
            }
          }
          const avgGarR = gCnt > 10 ? gR / gCnt : 128;
          const avgGarG = gCnt > 10 ? gG / gCnt : 128;
          const avgGarB = gCnt > 10 ? gB / gCnt : 128;
          const avgLShR = lShCnt > 6 ? lShR / lShCnt : avgGarR;
          const avgLShG = lShCnt > 6 ? lShG / lShCnt : avgGarG;
          const avgLShB = lShCnt > 6 ? lShB / lShCnt : avgGarB;
          const avgRShR = rShCnt > 6 ? rShR / rShCnt : avgGarR;
          const avgRShG = rShCnt > 6 ? rShG / rShCnt : avgGarG;
          const avgRShB = rShCnt > 6 ? rShB / rShCnt : avgGarB;
          const isTorsoWhiteOrCheck =
            garCheckSamples > 15 && (lightGarCnt / garCheckSamples >= 0.14 || checkGarCnt / garCheckSamples >= 0.035);

          for (let y = 0; y < h; y++) {
            const row = y * w;
            const isUpperPortrait = y <= neckSplitY;
            const isShoulderTransition = y > neckSplitY && y <= upperShoulderTransitionY;
            const tLeft = torsoMinX[y];
            const tRight = torsoMaxX[y];
            const envL = symEnvL[y];
            const envR = symEnvR[y];
            const mRowL = mLeft[y];
            const mRowR = mRight[y];
            const innerTorsoMargin = Math.max(12, Math.round((tRight - tLeft) * 0.16));

            for (let x = 0; x < w; x++) {
              const i = row + x;
              const ra = rawAlphas[i];
              const ma = modnetAlphas[i];

              // Strong dual agreement
              if (ra >= 230 && ma >= 200) {
                rawAlphas[i] = Math.max(ra, ma);
                continue;
              }
              if (ra < 20 && ma < 25) {
                rawAlphas[i] = 0;
                continue;
              }

              if (isUpperPortrait) {
                // Upper head/hair/ears/neck: protect hair/skin/ears while strictly severing MODNet-rejected
                // chairs, headrests, wall objects, poles & bystanders
                const p = i * 4;
                const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                const mBgLum = 0.299 * mBgR + 0.587 * mBgG + 0.114 * mBgB;
                const dToBg = Math.hypot(r - mBgR, g - mBgG, b - mBgB);
                const aboveHeadCrown = y < mMinY + 8 && x >= headMinX - 16 && x <= headMaxX + 16;
                const isHairCrown = y <= mMinY + Math.max(1, maxSubjY - minSubjY) * 0.34;
                const insideModnetRow = mRowL !== -1 && x >= mRowL - 4 && x <= mRowR + 4;
                const inEarBand = y >= mMinY + Math.max(1, maxSubjY - minSubjY) * 0.16;
                const closeToModnet = modnetDist[i] <= 6;
                const hairDistMax = ma >= 12 ? 12 : (isHairCrown ? 6 : 3);
                const isProtectedHairOrSkin =
                  (lum < 92 && mBgLum > 110 && dToBg > 24 && modnetDist[i] <= hairDistMax) ||
                  (r > g && g >= b * 0.85 && (r - b) >= 10 && dToBg > 20 && modnetDist[i] <= 11);
                const isProtectedEarEdge =
                  isProtectedHairOrSkin ||
                  (inEarBand && insideModnetRow && ra >= 185 && dToBg > 22 && modnetDist[i] <= 3) ||
                  (inEarBand && ra >= 165 && ma >= 24 && modnetDist[i] <= 7);

                if (ma < 26 && !isProtectedEarEdge) {
                  if (strictSever && ma < 22 && !aboveHeadCrown && (modnetDist[i] > 4 || !insideModnetRow)) {
                    rawAlphas[i] = 0;
                  } else if (strictSever && !aboveHeadCrown && (!insideModnetRow || !closeToModnet)) {
                    rawAlphas[i] = ma < 18 ? 0 : Math.min(ra, ma * 0.30);
                  } else if (ra < 228 || (strict && !aboveHeadCrown && modnetDist[i] > 6)) {
                    rawAlphas[i] = Math.min(ra, ma * 0.35);
                  }
                } else if (ma >= 205 && ra >= 70 && ra < 185) {
                  // Recover fine hair strands slightly softened by RMBG
                  rawAlphas[i] = Math.min(240, ra * 0.55 + ma * 0.45);
                } else if (ma < ra && !isProtectedEarEdge) {
                  if (strictSever && ma < 42 && modnetDist[i] > 6 && !aboveHeadCrown) {
                    rawAlphas[i] = 0;
                  } else if (strictSever && ma < 62 && (!insideModnetRow || modnetDist[i] > 6) && ra < 235) {
                    rawAlphas[i] = Math.min(ra, ma * 0.30);
                  } else if (ra < 240 || (strictSever && !insideModnetRow && modnetDist[i] > 8)) {
                    rawAlphas[i] = strict ? (ra * 0.25 + ma * 0.75) : (ra * 0.5 + ma * 0.5);
                  }
                }
              } else {
                // Lower collar/shoulder/torso: preserve complete natural shoulders, rounded curves, sleeves & tone-on-tone fabrics
                // while clearing chairs, sofas, beds, and close background objects rejected by MODNet.
                const p = i * 4;
                const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
                const maxC = Math.max(r, g, b);
                const minC = Math.min(r, g, b);
                const isWhiteOrNeutralLight = maxC >= 125 && (maxC - minC) <= 84;
                const insideShirtSpan =
                  tLeft !== -1 &&
                  tRight > tLeft + 10 &&
                  x >= tLeft + 3 &&
                  x <= tRight - 3;
                const insideSymEnv =
                  envL !== -1 &&
                  envR > envL + 10 &&
                  x >= envL &&
                  x <= envR;
                const insideChestCore =
                  tLeft !== -1 &&
                  tRight > tLeft + innerTorsoMargin * 2 &&
                  x >= tLeft + innerTorsoMargin &&
                  x <= tRight - innerTorsoMargin;

                if (insideChestCore && ra >= 110 && ma >= 75) {
                  rawAlphas[i] = Math.max(ra, 255);
                  continue;
                }
                if (insideShirtSpan && !isShoulderTransition && ra >= 175 && ma >= 120) {
                  rawAlphas[i] = Math.max(ra, 245);
                  continue;
                }
                if (insideShirtSpan && isTorsoWhiteOrCheck && (isWhiteOrNeutralLight || ra >= 110)) {
                  const safeShirtMargin = x >= tLeft + 5 && x <= tRight - 5;
                  if (!isShoulderTransition || insideChestCore || (safeShirtMargin && (ma >= 30 || ra >= 145)) || ma >= 45 || ra >= 205) {
                    rawAlphas[i] = 255;
                    continue;
                  }
                }

                if (ma < 80 && ra >= 25) {
                  const distToBg = Math.hypot(r - mBgR, g - mBgG, b - mBgB);
                  const distToCoreGar = gCnt > 10 ? Math.hypot(r - avgGarR, g - avgGarG, b - avgGarB) : 999;
                  const distToLGar = lShCnt > 6 ? Math.hypot(r - avgLShR, g - avgLShG, b - avgLShB) : 999;
                  const distToRGar = rShCnt > 6 ? Math.hypot(r - avgRShR, g - avgRShG, b - avgRShB) : 999;
                  const distToAnyGar = Math.min(distToCoreGar, distToLGar, distToRGar);
                  const matchesGarmentRGB = (gCnt > 10 || lShCnt > 6 || rShCnt > 6) && distToAnyGar <= 38 && (distToBg > 18 || ra >= 150);

                  if (
                    isTorsoWhiteOrCheck &&
                    isWhiteOrNeutralLight &&
                    (insideChestCore ||
                      (insideSymEnv &&
                        (distToBg > 16 || ra >= 155) &&
                        (insideShirtSpan || (!isShoulderTransition && (ma >= 24 || (ra >= 165 && modnetDist[i] <= 5))))))
                  ) {
                    rawAlphas[i] = Math.max(ra, 255);
                  } else if (
                    ra >= 135 &&
                    insideSymEnv &&
                    ((ma >= 18 && modnetDist[i] <= 7) || (matchesGarmentRGB && modnetDist[i] <= 7) || modnetDist[i] <= 5)
                  ) {
                    // Genuine outer shoulder/sleeve/fold (both left & right, including clothing with colors close to background) -> preserve intact
                    rawAlphas[i] = ra;
                  } else if (
                    !insideChestCore &&
                    ((strictSever && ma < 22 && !matchesGarmentRGB && (modnetDist[i] > 5 || !insideSymEnv)) ||
                      (strictSever && !insideSymEnv && (modnetDist[i] > 6 || ma < 38)) ||
                      (strictSever && distToAnyGar > 44 && ma < 42 && modnetDist[i] > 6) ||
                      (strict && ma < 34 && !matchesGarmentRGB && ra < 195 && distToBg < 32))
                  ) {
                    rawAlphas[i] = ma < 26 && strictSever ? 0 : Math.min(ra, ra * 0.25 + ma * 0.45);
                  }
                }
              }
            }
          }
        }
      }

      // 1a-clean. Immediately strip disconnected & touching background objects BEFORE shoulder extension & solidification
      // so detached chairs/objects cannot skew shoulder bounds or get bridged back onto the garment!
      if (options.isolateMainSubject || options.severTouchingObjects || engine === 'strict_subject') {
        eliminateChairAndBackrestObjects(pixels, rawAlphas, w, h, {
          severTouchingObjects: options.severTouchingObjects ?? false,
          objectStrictness: options.objectStrictness ?? 50,
          isolateMainSubject: options.isolateMainSubject ?? engine === 'strict_subject',
        }, portraitModnetAlphas);
      }

      // 1b. Extend & Protect Left Shoulder and White/Check Shirt Contours (only true garment pixels)
      extendAndProtectLeftShoulderAndGarment(rawAlphas, imageData, w, h, {
        extendLeftShoulder,
        leftShoulderExtensionAmount,
      }, portraitModnetAlphas);

      // 2. Solidify deep interior subject core & clothes without locking uncertain background/holes
      solidifySubjectInteriorAndClothing(rawAlphas, imageData, w, h, portraitModnetAlphas);

      // 3. Eliminate disconnected background noise, chair islands, and touching furniture
      eliminateChairAndBackrestObjects(pixels, rawAlphas, w, h, {
        severTouchingObjects: options.severTouchingObjects ?? false,
        objectStrictness: options.objectStrictness ?? 50,
        isolateMainSubject: options.isolateMainSubject ?? engine === 'strict_subject',
      }, portraitModnetAlphas);

      // 4. Sample Local Spatial Sector Background Color Models for De-fringing
      const bgModels = sampleBackgroundModels(imageData, rawAlphas, w, h);

      // 5. Fast Guided Filter for Sub-pixel Edge Alignment
      const refinedAlphas = applyFastGuidedFilter(imageData, rawAlphas, w, h, 2, 0.0001);

      // 6. Clean Edge Matting & Background De-fringing (Any background color)
      if (decontaminateHalos) {
        applyCleanEdgeMatting(pixels, refinedAlphas, w, h, bgModels);
      } else {
        for (let i = 0; i < w * h; i++) {
          pixels[i * 4 + 3] = Math.round(refinedAlphas[i]);
        }
      }

      // 7. Re-apply chair elimination check after de-fringing using synced pixel alphas
      if (options.severTouchingObjects || options.isolateMainSubject || engine === 'strict_subject') {
        for (let i = 0; i < w * h; i++) {
          refinedAlphas[i] = pixels[i * 4 + 3];
        }
        eliminateChairAndBackrestObjects(pixels, refinedAlphas, w, h, {
          severTouchingObjects: options.severTouchingObjects ?? false,
          objectStrictness: options.objectStrictness ?? 50,
          isolateMainSubject: options.isolateMainSubject ?? engine === 'strict_subject',
        }, portraitModnetAlphas);
      }

      // 9. HD Photo Clarity & Feature Enhancement
      enhanceForegroundSubjectClarity(pixels, w, h, 0.10);

      // 10. Left & Right Ear-to-Shoulder Concave Pocket + Enclosed Holes Background Cleaners
      cleanLeftEarToShoulderPocket(pixels, w, h, bgModels, true);
      cleanRightPocketAndEnclosedHoles(pixels, w, h, bgModels, true);

      // 10b. Ear, Neck & Jawline Halo Clearing Pass
      cleanEarNeckHeadHalosPass(pixels, w, h, bgModels);

      // 10c. Left-Edge Ear to Shoulder Halo & Background Removal
      cleanLeftEdgeHalosFromEarToShoulder(pixels, w, h, bgModels);

      // 10d. Symmetric Left & Right Perimeter Halo Peeling & Detached Island Cleanup
      const isolateAll = Boolean(options.isolateMainSubject || options.severTouchingObjects || engine === 'strict_subject');
      cleanLeftPerimeterHaloPatches(pixels, w, h, bgModels, true, isolateAll);

      // 11. Quality Control Pass
      qualityControlPerimeterPass(pixels, w, h);

      // 12. Eliminate Subject Boundary White Line & Background-Colored Halos
      removeSubjectBoundaryWhiteLine(pixels, w, h, bgModels);

      // 12b. Final Garment & Check-Shirt Opacity Lock (prevents background bleed onto shirt)
      lockGarmentInteriorOpacity(pixels, w, h);

      // 12c. Global Multi-Color Border Palette & Exterior Residual Patch/Object Sweeper
      cleanResidualBackgroundPatchesAndObjects(pixels, w, h, bgModels, true, isolateAll);

      // 12d. Left & Right Shoulder & Neck-Slope Edge Polish (halo strip, color unmix & natural AA bevel)
      polishLeftShoulderAndNeckContour(pixels, w, h, bgModels, true);

      // 12e. Post-polish interior opacity lock (guarantees 255 solid inside check/light shirts while keeping outer AA edges intact)
      lockGarmentInteriorOpacity(pixels, w, h, true);

      // 13. Final Sync & Detached Background Island Sweep
      for (let i = 0; i < w * h; i++) {
        refinedAlphas[i] = pixels[i * 4 + 3];
      }
      eliminateChairAndBackrestObjects(pixels, refinedAlphas, w, h, {
        severTouchingObjects: options.severTouchingObjects ?? false,
        objectStrictness: options.objectStrictness ?? 50,
        isolateMainSubject: options.isolateMainSubject ?? engine === 'strict_subject',
        preservePolishedEdges: true,
      }, portraitModnetAlphas);
    }

    // Verify subject preservation: check that at least 1.5% of pixels remain opaque
    let subjectPixelCount = 0;
    const totalPx = w * h;
    for (let i = 0; i < totalPx; i++) {
      if (pixels[i * 4 + 3] > 30) {
        subjectPixelCount++;
      }
    }

    const subjectRatio = subjectPixelCount / totalPx;
    console.log(`[AI] Subject verification: ${(subjectRatio * 100).toFixed(1)}% pixels retained`);

    // If subject was somehow lost/missing (< 1.5% subject pixels), restore subject silhouette
    if (subjectRatio < 0.015) {
      console.warn("[AI] Warning: Subject was missing in cutout. Restoring subject silhouette...");
      ctx.drawImage(origImg, 0, 0);
      const restoredData = ctx.getImageData(0, 0, w, h);
      const rPixels = restoredData.data;
      const cx = w * 0.5;
      const cy = h * 0.48;
      const rx = w * 0.44;
      const ry = h * 0.50;
      for (let y = 0; y < h; y++) {
        const dy = (y - cy) / ry;
        for (let x = 0; x < w; x++) {
          const dx = (x - cx) / rx;
          const d2 = dx * dx + dy * dy;
          const p = (y * w + x) * 4;
          if (d2 > 1.05) {
            rPixels[p + 3] = 0;
          } else if (d2 > 0.95) {
            rPixels[p + 3] = Math.round(255 * (1 - (d2 - 0.95) / 0.1));
          }
        }
      }
      ctx.putImageData(restoredData, 0, 0);
    } else {
      ctx.putImageData(imageData, 0, 0);
    }

    onProgress("Finalizing Cutout...");
    const rawBlob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png"),
    );

    console.log(
      `[AI] Subject Isolation Execution: ${(Date.now() - startTime) / 1000}s`,
    );

    if (forceWhiteBackground) {
      return await applyWhiteBackground(rawBlob);
    }
    return rawBlob;
  } catch (e: any) {
    console.error("[AI] Background Removal Failure:", e);
    throw new Error(`Background removal failed: ${e.message}`);
  }
}

/**
 * Solid White Studio Base
 */
async function applyWhiteBackground(transparentBlob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((b) => {
        URL.revokeObjectURL(img.src);
        resolve(b || transparentBlob);
      }, "image/png");
    };
    img.src = URL.createObjectURL(transparentBlob);
  });
}

/**
 * Magic Object Eraser: Erases an entire connected object/component clicked by the user.
 */
export async function magicEraseObjectAtPoint(
  imageSrc: string,
  clickX: number,
  clickY: number,
  colorTolerance = 35
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.width;
      const h = img.height;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      const px = Math.floor(Math.max(0, Math.min(w - 1, clickX)));
      const py = Math.floor(Math.max(0, Math.min(h - 1, clickY)));
      const startIdx = (py * w + px) * 4;

      if (data[startIdx + 3] === 0) {
        resolve(imageSrc);
        return;
      }

      const targetR = data[startIdx];
      const targetG = data[startIdx + 1];
      const targetB = data[startIdx + 2];

      const visited = new Uint8Array(w * h);
      const queue = new Int32Array(w * h);
      let head = 0;
      let tail = 0;

      const startPixel = py * w + px;
      queue[tail++] = startPixel;
      visited[startPixel] = 1;

      while (head < tail) {
        const curr = queue[head++];
        const cy = Math.floor(curr / w);
        const cx = curr % w;
        const idx = curr * 4;

        data[idx + 3] = 0;

        const neighbors = [
          cy > 0 ? curr - w : -1,
          cy < h - 1 ? curr + w : -1,
          cx > 0 ? curr - 1 : -1,
          cx < w - 1 ? curr + 1 : -1,
        ];

        for (const nIdx of neighbors) {
          if (nIdx !== -1 && visited[nIdx] === 0) {
            const nDataIdx = nIdx * 4;
            const nAlpha = data[nDataIdx + 3];

            if (nAlpha > 15) {
              const nr = data[nDataIdx];
              const ng = data[nDataIdx + 1];
              const nb = data[nDataIdx + 2];

              const colorDiff = Math.abs(nr - targetR) + Math.abs(ng - targetG) + Math.abs(nb - targetB);
              if (colorDiff <= colorTolerance * 3 || nAlpha < 50) {
                visited[nIdx] = 1;
                queue[tail++] = nIdx;
              }
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = imageSrc;
  });
}

/**
 * 1-Click Deep Edge Halo & Fringe Cleaner:
 * Eliminates halos, background color bleeding, and chair artifacts
 * specifically between the ears, neck, jawline, and shoulders.
 */
export async function cleanEdgeHalosAndDeFringe(
  imageSrc: string,
  options: {
    deFringeStrength?: number;
    haloThreshold?: number;
    severTouchingObjects?: boolean;
    objectStrictness?: number;
    isolateMainSubject?: boolean;
  } = {}
): Promise<string> {
  const {
    haloThreshold = 25,
    severTouchingObjects = Boolean(options.isolateMainSubject),
    objectStrictness = options.isolateMainSubject ? 78 : 40,
    isolateMainSubject = severTouchingObjects,
  } = options;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.width;
      const h = img.height;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, w, h);
      const pixels = imgData.data;
      const total = w * h;

      // 1. Build alpha map
      const alphas = new Float32Array(total);
      for (let i = 0; i < total; i++) {
        alphas[i] = pixels[i * 4 + 3];
      }

      // 2. Eliminate disconnected chair artifacts and furniture islands
      eliminateChairAndBackrestObjects(pixels, alphas, w, h, {
        severTouchingObjects,
        objectStrictness,
        isolateMainSubject,
      });

      // 3. Locate subject bounding box and neck/ear regions
      let minX = w, maxX = 0, minY = h, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (alphas[y * w + x] > 30) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const subjHeight = Math.max(1, maxY - minY);
      const earZoneYStart = Math.floor(minY + subjHeight * 0.16);
      const earZoneYEnd = Math.floor(minY + subjHeight * 0.49);
      const shoulderZoneYEnd = Math.min(h - 1, maxY);
      const coreCenterX = Math.round((minX + maxX) / 2);

      // 4. Sample dominant background colors near boundaries
      let bgSumR = 0, bgSumG = 0, bgSumB = 0, bgCount = 0;
      for (let y = 0; y < h; y += 4) {
        for (let x of [0, 1, 2, w - 3, w - 2, w - 1]) {
          const idx = (y * w + x) * 4;
          const a = pixels[idx + 3];
          if (a > 0 && a < 80) {
            bgSumR += pixels[idx];
            bgSumG += pixels[idx + 1];
            bgSumB += pixels[idx + 2];
            bgCount++;
          }
        }
      }
      // If transparent borders had zero RGB, default to white background (255, 255, 255)
      const avgBgR = bgCount > 5 ? bgSumR / bgCount : 255;
      const avgBgG = bgCount > 5 ? bgSumG / bgCount : 255;
      const avgBgB = bgCount > 5 ? bgSumB / bgCount : 255;

      // 5. Morphological edge fringe stripping and color de-contamination
      const copyPixels = new Uint8ClampedArray(pixels);

      for (let y = 1; y < h - 1; y++) {
        const isEarZone = y >= earZoneYStart && y <= earZoneYEnd;
        const isShoulderZone = y > earZoneYEnd && y <= shoulderZoneYEnd;
        const row = y * w;

        for (let x = 1; x < w - 1; x++) {
          const idx = (row + x) * 4;
          const a = alphas[row + x];

          if (a <= 5) {
            pixels[idx + 3] = 0;
            continue;
          }

          // Check if pixel is on the perimeter edge
          const neighborsAlpha = [
            alphas[row - w + x],
            alphas[row + w + x],
            alphas[row + x - 1],
            alphas[row + x + 1],
          ];
          const minNeighborA = Math.min(...neighborsAlpha);

          const isEdgePixel = minNeighborA < 200 || a < 235;

          if (isEdgePixel) {
            const r = copyPixels[idx];
            const g = copyPixels[idx + 1];
            const b = copyPixels[idx + 2];

            // If in ear/neck gap and has faint alpha or matches background haze (protect warm ear/jaw skin & dark hair):
            if (isEarZone) {
              const bgDist = Math.hypot(r - avgBgR, g - avgBgG, b - avgBgB);
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 10 && bgDist > 22;
              const isDarkHair = lum < 85 && bgDist > 24;
              const isLeftEar = x < coreCenterX;

              if (!isWarmSkin && !isDarkHair) {
                const maxBgD = Math.min(48, haloThreshold * 1.4);
                if (isLeftEar) {
                  if (a < 95 || (bgDist < maxBgD && a < 215)) {
                    pixels[idx + 3] = 0;
                    alphas[row + x] = 0;
                    continue;
                  }
                } else {
                  if (a < 90 || (bgDist < maxBgD && a < 210)) {
                    pixels[idx + 3] = 0;
                    alphas[row + x] = 0;
                    continue;
                  }
                }
              }
            } else if (isShoulderZone) {
              if (a < 25) {
                pixels[idx + 3] = 0;
                alphas[row + x] = 0;
                continue;
              }
            } else {
              const bgDist = Math.hypot(r - avgBgR, g - avgBgG, b - avgBgB);
              if (a < 35 || (bgDist < haloThreshold * 2.0 && a < 120)) {
                pixels[idx + 3] = 0;
                alphas[row + x] = 0;
              }
            }
          }
        }
      }

      // 5. Global Green Spill Suppression (Despill)
      for (let i = 0; i < total; i++) {
        const pIdx = i * 4;
        const a = pixels[pIdx + 3];
        const isUpper = Math.floor(i / w) < h * 0.6;
        if (a > 0 && (a < 255 || isUpper)) {
          const r = pixels[pIdx];
          const g = pixels[pIdx + 1];
          const b = pixels[pIdx + 2];
          if (g > r && g > b) {
            pixels[pIdx + 1] = Math.max(r, b);
          }
        }
      }

      // 6. Left & Right Ear-to-Shoulder Concave Pocket + Enclosed Holes Background Cleaners
      cleanLeftEarToShoulderPocket(pixels, w, h, undefined, false);
      cleanRightPocketAndEnclosedHoles(pixels, w, h, undefined, false);

      // 6b. Complete Subject Boundary Ear & Neck Halo Elimination
      cleanEarNeckHeadHalosPass(pixels, w, h);

      // 6c. Complete Left-Edge Ear to Shoulder Halo Elimination
      cleanLeftEdgeHalosFromEarToShoulder(pixels, w, h);

      // 6d. Careful Left & Right Perimeter Halo Peeling & Detached Island Cleanup
      cleanLeftPerimeterHaloPatches(pixels, w, h, undefined, false, isolateMainSubject);

      // 7. Complete Subject Boundary White Line & Halo Elimination
      removeSubjectBoundaryWhiteLine(pixels, w, h);

      // 8. Final Garment & Check-Shirt Opacity Lock
      lockGarmentInteriorOpacity(pixels, w, h);

      // 8b. Global Residual Background Patch & Halo Sweeper
      cleanResidualBackgroundPatchesAndObjects(pixels, w, h, undefined, false, isolateMainSubject);

      // 8c. Left & Right Shoulder & Neck-Slope Edge Polish
      polishLeftShoulderAndNeckContour(pixels, w, h, undefined, false);

      // 8d. Post-polish interior opacity lock (guarantees 255 solid inside check/light shirts while keeping outer AA edges intact)
      lockGarmentInteriorOpacity(pixels, w, h, true);

      // 9. Final Disconnected Island & Chair Wing Sweep
      for (let i = 0; i < total; i++) {
        alphas[i] = pixels[i * 4 + 3];
      }
      eliminateChairAndBackrestObjects(pixels, alphas, w, h, {
        severTouchingObjects,
        objectStrictness,
        isolateMainSubject,
        preservePolishedEdges: true,
      });

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = imageSrc;
  });
}

/**
 * Legacy Chair Removal Alias
 */
export const removeChairFromImage = cleanEdgeHalosAndDeFringe;


