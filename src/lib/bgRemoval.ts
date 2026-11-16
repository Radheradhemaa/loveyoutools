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
  } = {}
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
      if (rawAlphas[row + x] >= 40) {
        leftEdgeX[y] = x;
        break;
      }
    }

    for (let x = w - 1; x >= coreCenterX; x--) {
      if (rawAlphas[row + x] >= 40) {
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

  // Find narrowest neck width on right side between 28% and 60% of subject height
  const neckSearchStart = Math.floor(minSubjY + subjH * 0.28);
  const neckSearchEnd = Math.floor(minSubjY + subjH * 0.60);
  let neckY = Math.floor(minSubjY + subjH * 0.48);
  let minNeckRightDist = Infinity;

  for (let y = neckSearchStart; y <= neckSearchEnd; y++) {
    if (smoothedRightDist[y] > 0 && smoothedRightDist[y] < minNeckRightDist) {
      minNeckRightDist = smoothedRightDist[y];
      neckY = y;
    }
  }
  if (!Number.isFinite(minNeckRightDist)) minNeckRightDist = subjW * 0.18;

  // Shoulder slope starts ONLY after right contour flares significantly below the neck minimum
  let detectedShoulderStartY = Math.floor(minSubjY + subjH * 0.52);
  const flareThreshold = minNeckRightDist + Math.max(10, subjW * 0.075);
  for (let y = neckY + 2; y <= Math.floor(minSubjY + subjH * 0.68); y++) {
    if (smoothedRightDist[y] >= flareThreshold) {
      detectedShoulderStartY = y;
      break;
    }
  }

  const shoulderStartY = Math.max(
    Math.floor(minSubjY + subjH * 0.48),
    Math.min(Math.floor(minSubjY + subjH * 0.60), Math.max(neckY + Math.round(subjH * 0.05), detectedShoulderStartY))
  );
  const shoulderApexY = Math.max(shoulderStartY + 10, Math.floor(minSubjY + subjH * 0.78));
  const shoulderEndY = Math.min(h - 1, Math.floor(minSubjY + subjH * 0.95));

  if (shoulderStartY >= shoulderEndY) return;

  // 4. Sample per-row local left exterior background color & natural wall noise
  const rowBgR = new Float32Array(h);
  const rowBgG = new Float32Array(h);
  const rowBgB = new Float32Array(h);
  let globalBgNoiseSum = 0;
  let globalBgNoiseCount = 0;

  let fallbackSumR = 0, fallbackSumG = 0, fallbackSumB = 0, fallbackCount = 0;
  const farLeftLimit = Math.max(2, Math.min(minSubjX - 4, 25));
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
  }
  const fallbackBgR = fallbackCount > 0 ? fallbackSumR / fallbackCount : 245;
  const fallbackBgG = fallbackCount > 0 ? fallbackSumG / fallbackCount : 245;
  const fallbackBgB = fallbackCount > 0 ? fallbackSumB / fallbackCount : 245;

  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    let sR = 0, sG = 0, sB = 0, sCnt = 0;
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
    }
    rowBgR[y] = sCnt > 0 ? sR / sCnt : fallbackBgR;
    rowBgG[y] = sCnt > 0 ? sG / sCnt : fallbackBgG;
    rowBgB[y] = sCnt > 0 ? sB / sCnt : fallbackBgB;
  }

  const avgBgNoise = globalBgNoiseCount > 0 ? globalBgNoiseSum / globalBgNoiseCount : 1.5;

  // 5. Detect garment RGB signature & whether subject is wearing a white or check shirt in the torso region
  let garmentLumSum = 0;
  let garmentVarSum = 0;
  let garmentRSum = 0, garmentGSum = 0, garmentBSum = 0;
  let garmentSampleCount = 0;
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

        const rightPx = (idx + 1) * 4;
        const downPx = (idx + w) * 4;
        const diffR = Math.abs(r - pixels[rightPx]);
        const diffD = Math.abs(r - pixels[downPx]);
        garmentVarSum += (diffR + diffD);
        garmentSampleCount++;
      }
    }
  }

  const avgGarmentLum = garmentSampleCount > 0 ? garmentLumSum / garmentSampleCount : 180;
  const avgGarmentTexture = garmentSampleCount > 0 ? garmentVarSum / garmentSampleCount : 5;
  const avgShirtR = garmentSampleCount > 0 ? garmentRSum / garmentSampleCount : 200;
  const avgShirtG = garmentSampleCount > 0 ? garmentGSum / garmentSampleCount : 200;
  const avgShirtB = garmentSampleCount > 0 ? garmentBSum / garmentSampleCount : 200;
  const isWhiteOrCheckShirt = avgGarmentLum >= 135 || avgGarmentTexture >= 4.0;

  // 6. Compute symmetrical expected left shoulder width based on right shoulder
  const expectedLeftDist = new Float32Array(h);

  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    const t = Math.min(1.0, (y - shoulderStartY) / Math.max(1, shoulderApexY - shoulderStartY));
    const anatomicalProfile = subjW * (0.20 + 0.28 * Math.sin((t * Math.PI) / 2));

    const rEdge = rightEdgeX[y];
    let rightDist = rEdge !== -1 ? (rEdge - symCenterX) : 0;
    rightDist = Math.max(0, Math.min(subjW * 0.65, rightDist));

    let expectedW = Math.max(anatomicalProfile, rightDist * 0.94);
    if (leftShoulderExtensionAmount && leftShoulderExtensionAmount > 0) {
      expectedW += leftShoulderExtensionAmount;
    } else if (isWhiteOrCheckShirt) {
      expectedW = Math.max(expectedW, rightDist * 0.98);
    }

    expectedLeftDist[y] = expectedW;
  }

  const smoothedLeftDist = new Float32Array(h);
  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    let sum = 0, count = 0;
    for (let dy = -3; dy <= 3; dy++) {
      const ny = y + dy;
      if (ny >= shoulderStartY && ny <= shoulderEndY) {
        sum += expectedLeftDist[ny];
        count++;
      }
    }
    smoothedLeftDist[y] = count > 0 ? sum / count : expectedLeftDist[y];
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

  // 7. Recover clipped left shoulder garment ONLY when pixel genuinely belongs to torso garment (never paint over background!)
  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    const row = y * w;
    let currLeft = leftEdgeX[y];
    if (currLeft === -1) continue;

    const targetLeft = Math.max(2, Math.round(symCenterX - smoothedLeftDist[y]));
    if (currLeft <= targetLeft + Math.max(4, Math.round(subjW * 0.03))) {
      for (let x = currLeft + 3; x <= Math.min(coreCenterX, currLeft + 15); x++) {
        if (rawAlphas[row + x] >= 175 && rawAlphas[row + x] < 220) rawAlphas[row + x] = 255.0;
      }
      continue;
    }

    const bgR = rowBgR[y];
    const bgG = rowBgG[y];
    const bgB = rowBgB[y];

    let actualReachedLeft = currLeft;
    for (let x = currLeft - 1; x >= targetLeft; x--) {
      const idx = row + x;
      const pIdx = idx * 4;
      const r = pixels[pIdx];
      const g = pixels[pIdx + 1];
      const b = pixels[pIdx + 2];

      const distToBg = Math.hypot(r - bgR, g - bgG, b - bgB);
      const distToShirt = garmentSampleCount > 0
        ? Math.hypot(r - avgShirtR, g - avgShirtG, b - avgShirtB)
        : 999;
      const isFabric = isFabricOrCheckPattern(x, y);

      if (distToBg < 20 && !isFabric) {
        break;
      }

      const hasAiSignal = rawAlphas[idx] >= 65;
      const matchesTorsoShirt = garmentSampleCount > 0 && distToShirt <= 42 && distToShirt < distToBg * 0.90;
      const matchesCheckShirt = isWhiteOrCheckShirt && isFabric && distToBg >= 18;

      if (!hasAiSignal && !matchesTorsoShirt && !matchesCheckShirt) {
        break;
      }

      rawAlphas[idx] = Math.max(rawAlphas[idx], 220.0);
      actualReachedLeft = x;
    }

    for (let x = actualReachedLeft + 3; x <= Math.min(w - 1, currLeft + 10); x++) {
      if (rawAlphas[row + x] >= 175 && rawAlphas[row + x] < 225) {
        rawAlphas[row + x] = 255.0;
      }
    }
  }

  // 8. 1D Median / Boundary Smoothing across the left shoulder edge (only on non-background garment pixels)
  const restoredLeftEdge = new Int32Array(h);
  for (let y = shoulderStartY; y <= shoulderEndY; y++) {
    const row = y * w;
    restoredLeftEdge[y] = -1;
    for (let x = 0; x < coreCenterX; x++) {
      if (rawAlphas[row + x] >= 120) {
        restoredLeftEdge[y] = x;
        break;
      }
    }
  }

  for (let y = shoulderStartY + 2; y <= shoulderEndY - 2; y++) {
    const cur = restoredLeftEdge[y];
    if (cur === -1) continue;

    const neighbors = [
      restoredLeftEdge[y - 2],
      restoredLeftEdge[y - 1],
      cur,
      restoredLeftEdge[y + 1],
      restoredLeftEdge[y + 2],
    ].filter(v => v !== -1);

    if (neighbors.length >= 3) {
      neighbors.sort((a, b) => a - b);
      const medianX = neighbors[Math.floor(neighbors.length / 2)];
      if (medianX < cur && cur - medianX <= 6) {
        const row = y * w;
        const bgR = rowBgR[y];
        const bgG = rowBgG[y];
        const bgB = rowBgB[y];
        for (let x = medianX; x < cur; x++) {
          const pIdx = (row + x) * 4;
          const distToBg = Math.hypot(pixels[pIdx] - bgR, pixels[pIdx + 1] - bgG, pixels[pIdx + 2] - bgB);
          const distToShirt = garmentSampleCount > 0
            ? Math.hypot(pixels[pIdx] - avgShirtR, pixels[pIdx + 1] - avgShirtG, pixels[pIdx + 2] - avgShirtB)
            : 999;
          if (distToBg >= 24 && (rawAlphas[row + x] >= 65 || distToShirt <= 40)) {
            rawAlphas[row + x] = 255.0;
          }
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
  h: number
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
  const torsoStartY = Math.floor(minSubjY + subjHeight * 0.54);
  const coreX0 = Math.floor(minSubjX + subjWidth * 0.18);
  const coreX1 = Math.floor(maxSubjX - subjWidth * 0.18);

  // 3. White Shirt & Light Garment Protection strictly inside deep central torso interior
  // Never solidify outer concave bays, enclosed arm-torso pockets, or uncertain background haze!
  if (imageData && coreX1 > coreX0) {
    const pixels = imageData.data;
    for (let y = torsoStartY; y < maxSubjY; y++) {
      const row = y * w;
      for (let x = coreX0; x <= coreX1; x++) {
        const idx = row + x;
        if (isNearExterior[idx] === 0 && alphas[idx] >= 175) {
          const pIdx = idx * 4;
          const r = pixels[pIdx];
          const g = pixels[pIdx + 1];
          const b = pixels[pIdx + 2];

          const distToBg = Math.hypot(r - meanBgR, g - meanBgG, b - meanBgB);
          if (distToBg < 20 && alphas[idx] < 220) continue;

          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const isWhiteOrCheckShirt = (maxC >= 125 && (maxC - minC) <= 65) || (r > 135 && g > 135 && b > 135);
          if (isWhiteOrCheckShirt) {
            alphas[idx] = 255.0;
          }
        }
      }
    }
  }

  // 4. Cleanly separate exterior background from confident deep interior subject core
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const i = rowOffset + x;
      if (isExterior[i] === 1 || alphas[i] < 18) {
        alphas[i] = 0.0;
      } else if (isNearExterior[i] === 0) {
        if (y > torsoStartY && x >= coreX0 && x <= coreX1 && alphas[i] >= 205) {
          alphas[i] = 255.0;
        } else if (alphas[i] >= 232) {
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
  _options: {
    isolateMainSubject?: boolean;
    objectStrictness?: number; // 0 to 100
    removeNoise?: boolean;
  } = {}
) {
  const mw = maskData.width;
  const mh = maskData.height;
  const srcData = maskData.data;

  // Solidify confident subject pixels and zero out tiny background haze on the downscaled mask
  for (let i = 0; i < mw * mh; i++) {
    if (srcData[i] > 210) {
      srcData[i] = 255.0;
    } else if (srcData[i] < 12) {
      srcData[i] = 0.0;
    }
  }
}

/**
 * Eliminates chair backrests, furniture, and severed touching background objects
 * around the head, neck, and shoulders.
 */
export function eliminateChairAndBackrestObjects(
  pixels: Uint8ClampedArray,
  alphas: Float32Array,
  w: number,
  h: number,
  options: { severTouchingObjects?: boolean; objectStrictness?: number } = {}
) {
  const { severTouchingObjects = false, objectStrictness = 50 } = options;
  const total = w * h;

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

  // 2. Connected Component Labeling on alphas >= 30
  // Eliminates secondary disconnected chair artifacts, lamp poles, background islands
  const labels = new Int32Array(total);
  let currentLabel = 0;
  const componentSizes: number[] = [0];
  const queue = new Int32Array(total);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      if (alphas[idx] >= 30 && labels[idx] === 0) {
        currentLabel++;
        let size = 0;
        let head = 0;
        let tail = 0;

        labels[idx] = currentLabel;
        queue[tail++] = idx;

        while (head < tail) {
          const curr = queue[head++];
          size++;
          const cy = Math.floor(curr / w);
          const cx = curr % w;

          const neighbors = [
            cy > 0 ? curr - w : -1,
            cy < h - 1 ? curr + w : -1,
            cx > 0 ? curr - 1 : -1,
            cx < w - 1 ? curr + 1 : -1,
          ];

          for (const n of neighbors) {
            if (n !== -1 && alphas[n] >= 30 && labels[n] === 0) {
              labels[n] = currentLabel;
              queue[tail++] = n;
            }
          }
        }

        componentSizes.push(size);
      }
    }
  }

  if (currentLabel === 0) return;

  // 3. Find the main subject component
  const coreIdx = coreCenterY * w + coreCenterX;
  const coreLabel = labels[coreIdx];
  let mainLabel = coreLabel > 0 ? coreLabel : 1;
  let maxSize = 0;

  for (let l = 1; l <= currentLabel; l++) {
    if (componentSizes[l] > maxSize) {
      maxSize = componentSizes[l];
      if (coreLabel === 0) {
        mainLabel = l;
      }
    }
  }

  // 4. Eliminate disconnected secondary islands (e.g. detached chair corners)
  for (let i = 0; i < total; i++) {
    const l = labels[i];
    if (l > 0 && l !== mainLabel) {
      // If smaller than 40% of main subject, eliminate
      if (componentSizes[l] < maxSize * 0.40) {
        alphas[i] = 0;
        if (pixels) pixels[i * 4 + 3] = 0;
      }
    }
  }

  // 5. If severTouchingObjects is requested:
  // Detect chair wings/backrests protruding far lateral beside the head and upper neck
  if (severTouchingObjects && objectStrictness > 70) {
    const subjH = maxY - minY;
    const subjW = maxX - minX;
    const chinY = Math.floor(minY + subjH * 0.40);

    // Head boundary width estimate (allow generous margin for hair, ears, accessories)
    const headHalfW = Math.max(38, Math.floor(subjW * 0.44));
    const leftLimit = coreCenterX - headHalfW;
    const rightLimit = coreCenterX + headHalfW;

    for (let y = minY; y <= chinY; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        const a = alphas[idx];
        // Strip faint/medium-confidence detached or protruding chair wings far lateral of head
        if (a > 0 && a < 140) {
          const isFarLateral = x < (leftLimit - 28) || x > (rightLimit + 28);
          if (isFarLateral) {
            alphas[idx] = 0;
            if (pixels) pixels[idx * 4 + 3] = 0;
          }
        }
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
    const threshLow = isUpper ? 36 : 32;
    const threshHigh = isUpper ? 215 : 200;
    
    if (rawVal <= threshLow) {
      output[i] = 0;
    } else if (rawVal >= threshHigh) {
      output[i] = 255;
    } else {
      const t = (rawVal - threshLow) / (threshHigh - threshLow);
      const s = t * t * (3 - 2 * t);
      const refined = s * 255.0;
      if (gVal > 0.68) {
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

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    const isUpper = y < h * 0.54;
    const isEarLevel = y >= h * 0.16 && y <= h * 0.54;
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
      let lowerCut = isUpper ? 36 : 26;
      if ((isLightBg || secBgLum > 155) && isUpper && curLum > 170) {
        lowerCut = isEarLevel ? 52 : 48;
      }
      const upperCut = isUpper ? 220 : 195;

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

      if (pixels[pIdx + 3] > 0 && alphaVal < 225) {
        let fgR = 0, fgG = 0, fgB = 0, fgCount = 0;
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
              fgR += copyPixels[npIdx];
              fgG += copyPixels[npIdx + 1];
              fgB += copyPixels[npIdx + 2];
              fgCount++;
            }
          }
        }

        const avgFgR = fgCount > 0 ? fgR / fgCount : r;
        const avgFgG = fgCount > 0 ? fgG / fgCount : g;
        const avgFgB = fgCount > 0 ? fgB / fgCount : b;
        const distToFg = fgCount > 0 ? Math.hypot(r - avgFgR, g - avgFgG, b - avgFgB) : 999;

        // Strip faint/medium haze pixels that match local background far better than nearest solid subject
        const bgMatchThresh = Math.max(22, Math.min(44, secStd * 1.65));
        if (!isWarmSkin && alphaVal < (isUpper ? 160 : 135) && distToBg <= bgMatchThresh) {
          if (fgCount === 0 || distToBg < distToFg * 0.78) {
            pixels[pIdx + 3] = 0;
            continue;
          }
        }

        // Green Spill Suppression (Despill) to eliminate green screen reflections
        if (g > r && g > b) {
          pixels[pIdx + 1] = Math.max(r, b);
        }

        // Universal Background Halo De-contamination (removes white, blue, green, grey, or dark halos)
        if (fgCount > 0 && pixels[pIdx + 3] > 0) {
          const fgBgDist = Math.hypot(avgFgR - secBgR, avgFgG - secBgG, avgFgB - secBgB);
          if (fgBgDist > 24 && distToFg > 16) {
            const aNorm = Math.max(0.25, pixels[pIdx + 3] / 255.0);
            const unmixR = Math.max(0, Math.min(255, (r - secBgR * (1 - aNorm)) / aNorm));
            const unmixG = Math.max(0, Math.min(255, (g - secBgG * (1 - aNorm)) / aNorm));
            const unmixB = Math.max(0, Math.min(255, (b - secBgB * (1 - aNorm)) / aNorm));

            // Keep unmixed RGB anchored near authentic foreground color so no dark/neon spots appear
            const anchorR = Math.max(Math.min(r, avgFgR) - 10, Math.min(Math.max(r, avgFgR) + 10, unmixR));
            const anchorG = Math.max(Math.min(g, avgFgG) - 10, Math.min(Math.max(g, avgFgG) + 10, unmixG));
            const anchorB = Math.max(Math.min(b, avgFgB) - 10, Math.min(Math.max(b, avgFgB) + 10, unmixB));

            const blend = Math.min(0.85, (1 - aNorm * 0.65) * Math.min(1.0, distToFg / Math.max(30, fgBgDist)));
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

  // Anatomical vertical bounds: full ear extends from eye level down to lower neck / shoulder junction
  const earStartY = Math.floor(minY + subjH * 0.16);
  const earEndY = Math.floor(minY + subjH * 0.52);
  const maxHeadNeckY = Math.min(h - 1, Math.floor(minY + subjH * 0.54));

  // Sample local background reference
  const bgMeanR = bgModels?.global?.meanR ?? 245;
  const bgMeanG = bgModels?.global?.meanG ?? 245;
  const bgMeanB = bgModels?.global?.meanB ?? 245;

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
      const refBgR = bgCount > 0 ? (bgR / bgCount) : bgMeanR;
      const refBgG = bgCount > 0 ? (bgG / bgCount) : bgMeanG;
      const refBgB = bgCount > 0 ? (bgB / bgCount) : bgMeanB;
      const distToBg = Math.hypot(curR - refBgR, curG - refBgG, curB - refBgB);

      // Distinguish skin/ear cartilage from background:
      // Human skin has warm tone: curR > curG && curR > curB with noticeable red-blue delta
      const isSkinTone = (curR > curG && curG >= curB * 0.85 && (curR - curB) >= 18);
      // Background is usually neutral/gray/white (|r-g| <= 16 and |g-b| <= 16) or matches sampled background
      const isNeutralBgColor = Math.abs(curR - curG) <= 18 && Math.abs(curG - curB) <= 18;

      // 1. Left Ear Area Specialized Background Cleaning
      if (isLeftEarZone) {
        // Any faint edge pixel or boundary fringe touching transparency
        if (transparentCount >= 3 && a < 140) {
          pixels[pIdx + 3] = 0;
          continue;
        }

        // Crevice / pocket between ear and hair or ear and jaw (surrounded on multiple sides by transparency)
        if (transparentCount >= 5 && a < 185) {
          pixels[pIdx + 3] = 0;
          continue;
        }

        // Close color match to background
        if (distToBg < 35 && a < 210) {
          pixels[pIdx + 3] = 0;
          continue;
        }

        // Neutral / white / gray background haze next to ear that is clearly NOT skin
        if (!isSkinTone && (isNeutralBgColor || distToBg < 45) && transparentCount >= 2 && a < 200) {
          pixels[pIdx + 3] = 0;
          continue;
        }

        // High luminance white edge fringe next to ear
        if (curLum > 165 && !isSkinTone && transparentCount >= 1 && a < 150) {
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
        if (distToBg < 30 && a < 180) {
          pixels[pIdx + 3] = 0;
          continue;
        }
        if (!isSkinTone && isNeutralBgColor && transparentCount >= 2 && a < 160) {
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
          pixels[pIdx + 1] = Math.max(curR, curB); // Clamp green to max of red or blue
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

  // Left ear-to-shoulder & neck concave bay bounds (reaches down to the shoulder top, outside face/neck core)
  const pocketTopY = Math.max(1, Math.floor(minY + subjH * 0.20));
  const pocketBotY = Math.min(
    h - 2,
    Math.max(pocketTopY + 10, Math.min(Math.floor(minY + subjH * 0.62), neckY + Math.round(subjH * 0.16)))
  );
  const pocketMaxX = Math.min(w - 2, Math.round(coreCenterX - subjW * 0.08));

  if (pocketBotY <= pocketTopY || pocketMaxX <= 2) return;

  // 2. Sample skin reference (face/neck) and shirt reference (upper center chest)
  let skinR = 0, skinG = 0, skinB = 0, skinCount = 0;
  for (let y = Math.floor(minY + subjH * 0.24); y <= Math.floor(minY + subjH * 0.48); y += 2) {
    const row = y * w;
    for (let x = Math.max(0, coreCenterX - Math.round(subjW * 0.10)); x <= Math.min(w - 1, coreCenterX + Math.round(subjW * 0.10)); x += 2) {
      const idx = row + x;
      if (alphaCopy[idx] >= 220) {
        const pIdx = idx * 4;
        const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
        if (r > g && r > b && (r - b) >= 14) {
          skinR += r;
          skinG += g;
          skinB += b;
          skinCount++;
        }
      }
    }
  }
  const avgSkinR = skinCount > 0 ? skinR / skinCount : 0;
  const avgSkinG = skinCount > 0 ? skinG / skinCount : 0;
  const avgSkinB = skinCount > 0 ? skinB / skinCount : 0;

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

      // Guard 2: Protect warm ear/jaw/neck skin
      const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 12;
      const distToSkin = skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
      if (isWarmSkin && distToRowBg > 18 && (skinCount === 0 || distToSkin < distToRowBg * 1.25)) {
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

      // Guard 3: Protect genuine shirt / shoulder garment below shoulderProtectionStartY
      const isAtShoulderLevel = ny >= shoulderProtectionStartY;
      if (isAtShoulderLevel) {
        if (shirtCount > 0) {
          const distToShirt = Math.hypot(r - avgShirtR, g - avgShirtG, b - avgShirtB);
          // Distinct colored/dark shirt
          if (distToShirt < 28 && distToRowBg > 22) {
            continue;
          }
          // Light/check shirt: protect pixels with fabric texture or high alpha that don't closely match flat exterior bg
          if (avgShirtLum > 135 && nA >= 200 && (avgLocalVar >= 5.5 || distToRowBg > 22)) {
            continue;
          }
        } else if (nA >= 220 && (distToRowBg > 20 || stepDiff > 10)) {
          continue;
        }
      }

      // Sample nearby solid interior subject color (to distinguish semi-transparent halo from real subject edge)
      let localFgR = 0, localFgG = 0, localFgB = 0, localFgCount = 0;
      if (nA < 195) {
        for (let dy = -3; dy <= 3; dy++) {
          const fy = ny + dy;
          if (fy < 0 || fy >= h) continue;
          for (let dx = 1; dx <= 8; dx++) {
            const fx = nx + dx;
            if (fx >= w) break;
            const fIdx = fy * w + fx;
            if (alphaCopy[fIdx] >= 230) {
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

      // Acceptance criteria for background above shoulder & near neck:
      const isCloserToBgThanFg = localFgCount > 0 && distToRowBg < distToLocalFg * 0.88 && distToRowBg <= 48;
      const isSemiTransparentBridge =
        nA < 185 &&
        stepDiff <= 24 &&
        (distToRowBg <= Math.min(44, tol * 1.7) || isCloserToBgThanFg || nA < 100);
      const isMedTrappedBg =
        hasOriginalRgb &&
        nA >= 185 &&
        nA < 238 &&
        distToRowBg <= Math.min(30, tol * 1.3) &&
        stepDiff <= 15 &&
        avgLocalVar < 8.5;
      const isSolidFlatTrappedBg =
        hasOriginalRgb &&
        nA >= 238 &&
        distToRowBg <= 22 &&
        stepDiff <= 11 &&
        avgLocalVar < 6.0;

      if (isSemiTransparentBridge || isMedTrappedBg || isSolidFlatTrappedBg) {
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

  // 5. Clean 1px newly exposed boundary fringe around the cleared pocket
  for (let y = pocketTopY; y <= pocketBotY; y++) {
    const row = y * w;
    for (let x = 1; x < pocketMaxX; x++) {
      const idx = row + x;
      if (pixels[idx * 4 + 3] === 0) continue;

      const touchesCleared =
        cleared[idx - 1] === 1 ||
        cleared[idx + 1] === 1 ||
        cleared[idx - w] === 1 ||
        cleared[idx + w] === 1;

      if (!touchesCleared) continue;

      const pIdx = idx * 4;
      const a = pixels[pIdx + 3];
      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const distToRowBg = Math.hypot(r - rowBgR[y], g - rowBgG[y], b - rowBgB[y]);
      const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 14;

      if (a < 115 || (!isWarmSkin && distToRowBg < 28 && a < 195)) {
        pixels[pIdx + 3] = 0;
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

  const pocketTopY = Math.max(1, Math.floor(minY + subjH * 0.20));
  const pocketBotY = Math.min(
    h - 2,
    Math.max(pocketTopY + 10, Math.min(Math.floor(minY + subjH * 0.62), neckY + Math.round(subjH * 0.16)))
  );
  const pocketMinX = Math.max(1, Math.round(coreCenterX + subjW * 0.08));

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

  // Part A: Right-side concave pocket BFS flood-fill
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

    const shoulderProtectionStartY = Math.max(neckY + Math.round(subjH * 0.05), Math.floor(minY + subjH * 0.49));

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

        const npIdx = nIdx * 4;
        const r = pixels[npIdx], g = pixels[npIdx + 1], b = pixels[npIdx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const bgR = rowBgR[ny], bgG = rowBgG[ny], bgB = rowBgB[ny];
        const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
        const distToBg = Math.hypot(r - bgR, g - bgG, b - bgB);
        const stepDiff = Math.hypot(r - cR, g - cG, b - cB);

        if (lum < 85 && bgLum > 110 && distToBg > 24) continue;
        const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 12;
        const distToSkin = skinCount > 0 ? Math.hypot(r - avgSkinR, g - avgSkinG, b - avgSkinB) : 999;
        if (isWarmSkin && distToBg > 18 && (skinCount === 0 || distToSkin < distToBg * 1.25)) continue;

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
          if (shirtCount > 0) {
            const distToShirt = Math.hypot(r - avgShirtR, g - avgShirtG, b - avgShirtB);
            if (distToShirt < 28 && distToBg > 22) continue;
            if (avgShirtLum > 135 && nA >= 200 && (avgLocalVar >= 5.5 || distToBg > 22)) continue;
          } else if (nA >= 220 && (distToBg > 20 || stepDiff > 10)) {
            continue;
          }
        }

        const isSemiBridge = nA < 185 && stepDiff <= 22 && (distToBg <= Math.min(40, rowBgTol[ny] * 1.6) || nA < 95);
        const isTrappedBg = hasOriginalRgb && nA >= 185 && nA < 236 && distToBg <= 26 && stepDiff <= 14 && avgLocalVar < 7.5;

        if (isSemiBridge || isTrappedBg) {
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
    }
  }

  // Part B: Enclosed Background Pockets Cleaner (gaps between arms & torso, hair & collar, under-chin pockets)
  // Guarded away from face oval & eyes (center top 45% inside face width)
  const faceMinX = coreCenterX - subjW * 0.22;
  const faceMaxX = coreCenterX + subjW * 0.22;
  const faceMinY = minY + subjH * 0.12;
  const faceMaxY = minY + subjH * 0.45;

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

          const np = n * 4;
          const nr = pixels[np], ng = pixels[np + 1], nb = pixels[np + 2];
          const isWarmSkin = nr > ng && ng >= nb * 0.85 && (nr - nb) >= 14;
          if (isWarmSkin && na >= 95) continue;

          const nSec = bgModels?.sectors?.[Math.min(2, Math.floor((ny / h) * 3)) * 3 + Math.min(2, Math.floor((nx / w) * 3))];
          const nbR = nSec ? nSec.meanR : globalBgR;
          const nbG = nSec ? nSec.meanG : globalBgG;
          const nbB = nSec ? nSec.meanB : globalBgB;
          const nDistBg = Math.hypot(nr - nbR, ng - nbG, nbB - nb);
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
  const subjW = maxSubjX - minSubjX;
  const subjH = maxY - minY;
  const maxLeftScanX = Math.max(4, Math.round(coreCenterX - subjW * 0.12));
  const minRightScanX = Math.min(w - 5, Math.round(coreCenterX + subjW * 0.12));

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

    // Sample solid interior foreground 6..24px inside
    let fgR = 0, fgG = 0, fgB = 0, fgCnt = 0;
    for (let sy = Math.max(0, y - 2); sy <= Math.min(h - 1, y + 2); sy++) {
      const sRow = sy * w;
      for (let step = 6; step <= 24; step += 2) {
        const fx = edgeX + dir * step;
        if (fx < 0 || fx >= w) break;
        const fIdx = sRow + fx;
        if (alphaCopy[fIdx] >= 230) {
          const fp = fIdx * 4;
          fgR += pixels[fp]; fgG += pixels[fp + 1]; fgB += pixels[fp + 2]; fgCnt++;
        }
      }
    }
    const intFgR = fgCnt > 0 ? fgR / fgCnt : 128;
    const intFgG = fgCnt > 0 ? fgG / fgCnt : 128;
    const intFgB = fgCnt > 0 ? fgB / fgCnt : 128;

    const isUpperNeckEar = y < minY + subjH * 0.56;
    const maxPeelDepth = isUpperNeckEar ? (dir === 1 ? 18 : 14) : (dir === 1 ? 12 : 10);

    for (let step = 0; step <= maxPeelDepth; step++) {
      const x = edgeX + dir * step;
      if (dir === 1 && x > maxLeftScanX) break;
      if (dir === -1 && x < minRightScanX) break;
      const pIdx = (row + x) * 4;
      const a = pixels[pIdx + 3];
      if (a === 0) continue;
      if (a >= 210) break;

      const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 14;

      if (isWarmSkin && a >= 105) break;
      if (lum < 82 && localBgLum > 110 && a >= 90) break;

      const distToBg = Math.hypot(r - localBgR, g - localBgG, b - localBgB);
      const distToFg = fgCnt > 0 ? Math.hypot(r - intFgR, g - intFgG, b - intFgB) : 999;

      if (!isUpperNeckEar && fgCnt > 0 && a >= 135 && distToFg <= distToBg * 1.1) {
        break;
      }

      const isFaintHalo = a < 95 && distToBg <= 60;
      const isMidHaloCloserToBg = a < 170 && fgCnt > 0 && distToBg < distToFg * 0.88 && distToBg <= 45;
      const isBgMatchedFringe = a < 195 && !isWarmSkin && distToBg <= 26;

      if (isFaintHalo || isMidHaloCloserToBg || isBgMatchedFringe) {
        pixels[pIdx + 3] = 0;
      } else {
        if (fgCnt > 0 && a < 210 && distToBg < distToFg) {
          const blend = Math.min(0.75, (1 - a / 255) + 0.25);
          pixels[pIdx] = Math.round(r * (1 - blend) + intFgR * blend);
          pixels[pIdx + 1] = Math.round(g * (1 - blend) + intFgG * blend);
          pixels[pIdx + 2] = Math.round(b * (1 - blend) + intFgB * blend);
        }
        break;
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
  const queue = new Int32Array(total);
  let curLabel = 0;
  let maxCompSize = 0;
  let mainLabel = 0;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      if (pixels[idx * 4 + 3] > 20 && labels[idx] === 0) {
        curLabel++;
        let size = 0;
        let head = 0;
        let tail = 0;
        labels[idx] = curLabel;
        queue[tail++] = idx;

        while (head < tail) {
          const curr = queue[head++];
          size++;
          const cy = Math.floor(curr / w);
          const cx = curr % w;
          const nbs = [
            cy > 0 ? curr - w : -1,
            cy < h - 1 ? curr + w : -1,
            cx > 0 ? curr - 1 : -1,
            cx < w - 1 ? curr + 1 : -1,
          ];
          for (const n of nbs) {
            if (n !== -1 && pixels[n * 4 + 3] > 20 && labels[n] === 0) {
              labels[n] = curLabel;
              queue[tail++] = n;
            }
          }
        }
        compSizes.push(size);
        if (size > maxCompSize) {
          maxCompSize = size;
          mainLabel = curLabel;
        }
      }
    }
  }

  if (curLabel > 1 && mainLabel > 0) {
    const islandCutoff = Math.max(400, Math.min(4500, maxCompSize * 0.08));
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

  // Background color reference
  const bgMeanR = bgModels?.global?.meanR ?? 245;
  const bgMeanG = bgModels?.global?.meanG ?? 245;
  const bgMeanB = bgModels?.global?.meanB ?? 245;
  const isLightBg = (0.299 * bgMeanR + 0.587 * bgMeanG + 0.114 * bgMeanB) > 155;

  // 2. Row by row, sweep along the left perimeter edge
  for (let y = yStart; y <= yEnd; y++) {
    const row = y * w;
    const isShoulderArea = y >= shoulderStartY;
    
    // Find left-most non-transparent pixel
    let leftEdgeX = -1;
    for (let x = 0; x < coreCenterX; x++) {
      if (alphaCopy[row + x] > 15) {
        leftEdgeX = x;
        break;
      }
    }

    if (leftEdgeX === -1) continue;

    // Scan a safe band along the perimeter (8px in ear/neck/above-shoulder, 3px on lower shoulder)
    const bandWidth = isShoulderArea ? 3 : 8;
    const bandEnd = Math.min(coreCenterX - 1, leftEdgeX + bandWidth);

    for (let x = Math.max(0, leftEdgeX - 2); x <= bandEnd; x++) {
      const idx = row + x;
      const pIdx = idx * 4;
      const a = pixels[pIdx + 3];

      if (a === 0) continue;

      // In shoulder area: PROTECT WHITE CHECK SHIRTS!
      // Only eliminate faint floating background noise (a < 30)
      if (isShoulderArea) {
        if (a < 30) {
          pixels[pIdx + 3] = 0;
        }
        continue; // Never erase white check shirt pixels on the shoulder!
      }

      // EAR & NECK AREA (y < shoulderStartY): Clean halos safely without cutting skin!
      const r = pixels[pIdx];
      const g = pixels[pIdx + 1];
      const b = pixels[pIdx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 14;

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
          if (alphaCopy[nIdx] <= 15) {
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
      const distToBg = Math.hypot(r - refR, g - refG, b - refB);

      // Check if pixel is touching outside transparency
      const touchesExterior = transparentNeighbors >= 1;

      // Rule A: Faint boundary noise or outer halo on the left edge of ear/neck
      if (touchesExterior && a < 120) {
        pixels[pIdx + 3] = 0;
        continue;
      }

      // Rule B: Left ear/neck perimeter pixel closely matching background color (never cut solid warm skin)
      if (touchesExterior && !isWarmSkin && distToBg < 32 && a < 210) {
        pixels[pIdx + 3] = 0;
        continue;
      }

      // Rule C: Light/white background bleed on ear/neck boundary
      if (isLightBg && touchesExterior && !isWarmSkin && lum > 165 && (distToBg < 44 || (Math.abs(r - g) <= 15 && Math.abs(g - b) <= 15))) {
        if (a < 195) {
          pixels[pIdx + 3] = 0;
          continue;
        }
      }

      // Rule D: Crevices/corners along ear and neck (multiple transparent neighbors)
      if (transparentNeighbors >= 3 && a < 185) {
        pixels[pIdx + 3] = 0;
        continue;
      }

      // Rule E: Inpaint/Decontaminate edge pixels on ear/neck:
      // Pull authentic interior skin/hair color from 2-5 pixels inside
      if (touchesExterior && a >= 140 && distToBg < 60) {
        let interiorR = 0, interiorG = 0, interiorB = 0, interiorCount = 0;
        for (let step = 2; step <= 5; step++) {
          const inX = x + step;
          if (inX < w) {
            const inIdx = row + inX;
            if (alphaCopy[inIdx] >= 220) {
              const inpIdx = inIdx * 4;
              interiorR += pixels[inpIdx];
              interiorG += pixels[inpIdx + 1];
              interiorB += pixels[inpIdx + 2];
              interiorCount++;
            }
          }
        }

        if (interiorCount > 0) {
          const avgInR = interiorR / interiorCount;
          const avgInG = interiorG / interiorCount;
          const avgInB = interiorB / interiorCount;

          // De-fringe: blend edge pixel towards authentic interior subject color
          const blendFactor = Math.min(0.85, (1 - a / 255.0) + 0.35);
          pixels[pIdx] = Math.round(r * (1 - blendFactor) + avgInR * blendFactor);
          pixels[pIdx + 1] = Math.round(g * (1 - blendFactor) + avgInG * blendFactor);
          pixels[pIdx + 2] = Math.round(b * (1 - blendFactor) + avgInB * blendFactor);
        }
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

  // Pass 1: Outermost boundary fringe trimming across head, ears, neck, shoulders & perimeter
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    const isHeadAndEarZone = y < h * 0.48;
    const secY = Math.min(2, Math.floor((y / h) * 3));

    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      const a = alphaCopy[idx];
      if (a === 0) continue;

      const isUpperPerimeterZone = isHeadAndEarZone || (y < h * 0.56);
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
        const isWarmSkin = r > g && g >= b * 0.85 && (r - b) >= 14;

        const sec = bgModels?.sectors?.[secY * 3 + Math.min(2, Math.floor((x / w) * 3))];
        const sBgR = sec ? sec.meanR : bgMeanR;
        const sBgG = sec ? sec.meanG : bgMeanG;
        const sBgB = sec ? sec.meanB : bgMeanB;
        const distToBg = Math.min(
          Math.hypot(r - sBgR, g - sBgG, b - sBgB),
          Math.hypot(r - bgMeanR, g - bgMeanG, b - bgMeanB)
        );

        if (transparentNeighbors >= 2) {
          if (
            a < 40 ||
            (!isWarmSkin && a < 165 && distToBg < 28) ||
            (isUpperPerimeterZone && isLightBg && !isWarmSkin && lum > 155 && a < 145)
          ) {
            pixels[pIdx + 3] = 0;
            alphaCopy[idx] = 0;
            continue;
          }
        } else if (transparentNeighbors === 1) {
          if (
            a < 25 ||
            (!isWarmSkin && a < 140 && distToBg < 22) ||
            (isUpperPerimeterZone && isLightBg && !isWarmSkin && lum > 165 && a < 110)
          ) {
            pixels[pIdx + 3] = 0;
            alphaCopy[idx] = 0;
            continue;
          }
        }
      }
    }
  }

  // Pass 2: Universal Color De-contamination on surviving perimeter pixels
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    const isUpperZone = y < h * 0.54;
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
      for (let dy = -3; dy <= 3; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const nIdx = ny * w + nx;
          if (alphaCopy[nIdx] >= 215) {
            const npIdx = nIdx * 4;
            fgR += pixels[npIdx];
            fgG += pixels[npIdx + 1];
            fgB += pixels[npIdx + 2];
            fgCount++;
          }
        }
      }

      if (fgCount > 0) {
        const avgFgR = fgR / fgCount;
        const avgFgG = fgG / fgCount;
        const avgFgB = fgB / fgCount;
        const fgBgDist = Math.hypot(avgFgR - sBgR, avgFgG - sBgG, avgFgB - sBgB);
        const curBgDist = Math.hypot(curR - sBgR, curG - sBgG, curB - sBgB);
        const curFgDist = Math.hypot(curR - avgFgR, curG - avgFgG, curB - avgFgB);

        if (fgBgDist > 26 && curFgDist > 16 && curBgDist < fgBgDist * 0.95) {
          const aNorm = Math.max(0.25, a / 255.0);
          const unmixR = Math.max(0, Math.min(255, (curR - sBgR * (1 - aNorm)) / aNorm));
          const unmixG = Math.max(0, Math.min(255, (curG - sBgG * (1 - aNorm)) / aNorm));
          const unmixB = Math.max(0, Math.min(255, (curB - sBgB * (1 - aNorm)) / aNorm));

          const anchorR = Math.max(Math.min(curR, avgFgR) - 10, Math.min(Math.max(curR, avgFgR) + 10, unmixR));
          const anchorG = Math.max(Math.min(curG, avgFgG) - 10, Math.min(Math.max(curG, avgFgG) + 10, unmixG));
          const anchorB = Math.max(Math.min(curB, avgFgB) - 10, Math.min(Math.max(curB, avgFgB) + 10, unmixB));

          const blend = Math.min(0.85, (1 - aNorm * 0.65));
          pixels[pIdx] = Math.round(curR * (1 - blend) + anchorR * blend);
          pixels[pIdx + 1] = Math.round(curG * (1 - blend) + anchorG * blend);
          pixels[pIdx + 2] = Math.round(curB * (1 - blend) + anchorB * blend);
        }
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
        removeNoise: removeBackgroundNoise
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
      if (modnetMaskData) {
        const modnetAlphas = upscaleMask(modnetMaskData);
        const total = w * h;
        let rmbgFg = 0, modnetFg = 0, overlapFg = 0;
        let sumFgY = 0, minSubjY = h, maxSubjY = 0;
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
              sumFgY += y;
            }
            if (ra < 25 && ma < 25) {
              const p = i * 4;
              sumBgR += pixels[p]; sumBgG += pixels[p + 1]; sumBgB += pixels[p + 2]; bgCnt++;
            }
          }
        }

        const modnetRatio = modnetFg / Math.max(1, Math.floor((w * h) / (sampleStep * sampleStep)));
        const overlapRatio = overlapFg / Math.max(1, rmbgFg);

        // Apply MODNet consensus ONLY when MODNet clearly detects the same foreground (prevents breaking products/logos)
        if (modnetRatio >= 0.04 && modnetRatio <= 0.92 && overlapRatio >= 0.42) {
          const neckSplitY = minSubjY + Math.max(1, maxSubjY - minSubjY) * 0.54;
          const strict = engine === 'strict_subject' || (options.objectStrictness ?? 75) >= 65;
          const mBgR = bgCnt > 10 ? sumBgR / bgCnt : 245;
          const mBgG = bgCnt > 10 ? sumBgG / bgCnt : 245;
          const mBgB = bgCnt > 10 ? sumBgB / bgCnt : 245;

          // Estimate interior core garment color (lower center) so white/black clothes aren't eaten
          let gR = 0, gG = 0, gB = 0, gCnt = 0;
          const cStartY = Math.min(h - 1, Math.floor(neckSplitY));
          const cEndY = Math.min(h - 1, maxSubjY);
          for (let y = cStartY; y <= cEndY; y += 3) {
            const row = y * w;
            for (let x = Math.floor(w * 0.35); x <= Math.floor(w * 0.65); x += 3) {
              const idx = row + x;
              if (rawAlphas[idx] >= 220 && modnetAlphas[idx] >= 180) {
                const p = idx * 4;
                gR += pixels[p]; gG += pixels[p + 1]; gB += pixels[p + 2]; gCnt++;
              }
            }
          }
          const avgGarR = gCnt > 10 ? gR / gCnt : 128;
          const avgGarG = gCnt > 10 ? gG / gCnt : 128;
          const avgGarB = gCnt > 10 ? gB / gCnt : 128;

          for (let y = 0; y < h; y++) {
            const row = y * w;
            const isUpperPortrait = y <= neckSplitY;
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
                // Upper head/hair/ears/neck: MODNet excels at clearing trapped walls/shadows/chairs
                if (ma < 30 && ra < 228) {
                  rawAlphas[i] = Math.min(ra, ma * 0.65);
                } else if (ma >= 205 && ra >= 70 && ra < 185) {
                  // Recover fine hair strands slightly softened by RMBG
                  rawAlphas[i] = Math.min(240, ra * 0.55 + ma * 0.45);
                } else if (ma < ra && ra < 240) {
                  rawAlphas[i] = strict ? (ra * 0.35 + ma * 0.65) : (ra * 0.5 + ma * 0.5);
                }
              } else {
                // Lower shoulder/torso: suppress chairs/walls/clutter rejected by MODNet unless pixel matches core garment
                if (ma < 65 && ra >= 35) {
                  const p = i * 4;
                  const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
                  const distToBg = Math.hypot(r - mBgR, g - mBgG, b - mBgB);
                  const distToGar = gCnt > 10 ? Math.hypot(r - avgGarR, g - avgGarG, b - avgGarB) : 999;

                  if (ra >= 232 && gCnt > 10 && distToGar < 42 && distToBg > 24) {
                    // Confident shirt/coat color matching core torso -> preserve!
                    rawAlphas[i] = ra;
                  } else if (distToBg < 38 || (strict && distToGar > 48 && ra < 238)) {
                    // Background wall, shadow, or chair/desk object rejected by MODNet -> suppress cleanly
                    rawAlphas[i] = Math.min(ra, ra * 0.25 + ma * 0.75);
                  }
                }
              }
            }
          }
        }
      }

      // 1b. Extend & Protect Left Shoulder and White/Check Shirt Contours (only true garment pixels)
      extendAndProtectLeftShoulderAndGarment(rawAlphas, imageData, w, h, {
        extendLeftShoulder,
        leftShoulderExtensionAmount,
      });

      // 2. Solidify deep interior subject core & clothes without locking uncertain background/holes
      solidifySubjectInteriorAndClothing(rawAlphas, imageData, w, h);

      // 3. Eliminate disconnected background noise, chair islands, and touching furniture
      eliminateChairAndBackrestObjects(pixels, rawAlphas, w, h, {
        severTouchingObjects: options.severTouchingObjects ?? false,
        objectStrictness: options.objectStrictness ?? 50,
      });

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
      if (options.severTouchingObjects) {
        for (let i = 0; i < w * h; i++) {
          refinedAlphas[i] = pixels[i * 4 + 3];
        }
        eliminateChairAndBackrestObjects(pixels, refinedAlphas, w, h, {
          severTouchingObjects: options.severTouchingObjects,
          objectStrictness: options.objectStrictness ?? 50,
        });
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
      cleanLeftPerimeterHaloPatches(pixels, w, h, bgModels, true);

      // 11. Quality Control Pass
      qualityControlPerimeterPass(pixels, w, h);

      // 12. Eliminate Subject Boundary White Line & Background-Colored Halos
      removeSubjectBoundaryWhiteLine(pixels, w, h, bgModels);

      // 13. Final Sync & Detached Background Island Sweep
      for (let i = 0; i < w * h; i++) {
        refinedAlphas[i] = pixels[i * 4 + 3];
      }
      eliminateChairAndBackrestObjects(pixels, refinedAlphas, w, h, {
        severTouchingObjects: options.severTouchingObjects ?? false,
        objectStrictness: options.objectStrictness ?? 50,
      });
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
  options: { deFringeStrength?: number; haloThreshold?: number } = {}
): Promise<string> {
  const { deFringeStrength = 0.85, haloThreshold = 25 } = options;

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
        severTouchingObjects: false,
        objectStrictness: 40,
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
      const earZoneYEnd = Math.floor(minY + subjHeight * 0.54);
      const shoulderZoneYEnd = Math.floor(minY + subjHeight * 0.85);
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
          const maxNeighborA = Math.max(...neighborsAlpha);

          const isEdgePixel = minNeighborA < 200 || a < 235;

          if (isEdgePixel) {
            const r = copyPixels[idx];
            const g = copyPixels[idx + 1];
            const b = copyPixels[idx + 2];

            // If in ear/neck gap and has faint alpha or matches background haze:
            if (isEarZone) {
              const bgDist = Math.hypot(r - avgBgR, g - avgBgG, b - avgBgB);
              const isLeftEar = x < coreCenterX;
              
              if (isLeftEar) {
                // Thorough left ear background clearing: completely eliminate lingering background & fringe
                if (a < 140 || (bgDist < haloThreshold * 3.5 && a < 235)) {
                  pixels[idx + 3] = 0;
                  alphas[row + x] = 0;
                  continue;
                }
              } else {
                if (a < 120 || (bgDist < haloThreshold * 3 && a < 230)) {
                  pixels[idx + 3] = 0;
                  alphas[row + x] = 0;
                  continue;
                }
              }
            } else if (isShoulderZone) {
              // In shoulder zone, protect white check shirts and deltoids on both left and right sides
              // Only clear genuine background noise floating outside the shoulder silhouette (a < 25)
              if (a < 25) {
                pixels[idx + 3] = 0;
                alphas[row + x] = 0;
                continue;
              }
            } else {
              // General perimeter clean: strip light/white boundary fringe
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
        const isUpper = Math.floor(i / w) < h * 0.6; // Despill upper 60%
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
      cleanLeftPerimeterHaloPatches(pixels, w, h, undefined, false);

      // 7. Complete Subject Boundary White Line & Halo Elimination
      removeSubjectBoundaryWhiteLine(pixels, w, h);

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


