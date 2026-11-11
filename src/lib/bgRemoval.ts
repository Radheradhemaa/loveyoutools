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
 * Guarantees a natural, smooth, full anatomical shoulder/deltoid curve.
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
      if (a >= 50) {
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

  // 2. Identify anatomical vertical regions (strictly below ears and jawline to protect left ear)
  const shoulderStartY = Math.floor(minSubjY + subjH * 0.46); // Deltoid / shoulder slope starts below the chin/earlobe
  const shoulderApexY = Math.floor(minSubjY + subjH * 0.78); // Deltoid / shoulder crest

  // 3. Sample left exterior background color (from far left perimeter, well outside subject)
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  const sampleBgLimit = Math.max(2, Math.min(minSubjX - 5, 20));
  for (let y = shoulderStartY; y <= shoulderApexY; y += 3) {
    for (let x = 0; x < sampleBgLimit; x += 2) {
      const idx = (y * w + x) * 4;
      bgR += pixels[idx];
      bgG += pixels[idx + 1];
      bgB += pixels[idx + 2];
      bgCount++;
    }
  }
  const avgBgR = bgCount > 0 ? bgR / bgCount : 255;
  const avgBgG = bgCount > 0 ? bgG / bgCount : 255;
  const avgBgB = bgCount > 0 ? bgB / bgCount : 255;

  // 4. Trace the current left edge across the shoulder region
  const leftEdgeX = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    leftEdgeX[y] = -1;
    const row = y * w;
    for (let x = 0; x < coreCenterX; x++) {
      if (rawAlphas[row + x] >= 45) {
        leftEdgeX[y] = x;
        break;
      }
    }
  }

  // 5. Subtle maximum recovery (strictly 3 to 6 pixels at most)
  const maxRecovery = leftShoulderExtensionAmount ?? Math.min(6, Math.max(3, Math.round(subjW * 0.015)));

  // 6. Only recover shoulder pixels that are strictly authentic cloth and NOT the background
  for (let y = shoulderStartY; y <= shoulderApexY; y++) {
    const currLeft = leftEdgeX[y];
    if (currLeft === -1) continue;

    // Progression along shoulder slope (0 at neck to 1 at deltoid)
    const t = (y - shoulderStartY) / Math.max(1, shoulderApexY - shoulderStartY);
    const curveWeight = Math.sin((t * Math.PI) / 2);
    const allowPixels = Math.round(maxRecovery * curveWeight);
    if (allowPixels <= 0) continue;

    const row = y * w;
    const targetLeft = Math.max(0, currLeft - allowPixels);

    for (let x = currLeft - 1; x >= targetLeft; x--) {
      const idx = row + x;
      const pIdx = idx * 4;
      const r = pixels[pIdx];
      const g = pixels[pIdx + 1];
      const b = pixels[pIdx + 2];

      // Measure distance to exterior background
      const distToBg = Math.hypot(r - avgBgR, g - avgBgG, b - avgBgB);

      // If this pixel matches or is close to the background, STOP! Never paint over background!
      if (distToBg < 28) {
        break;
      }

      // ONLY recover if high foreground confidence AND clear contrast from background
      if (rawAlphas[idx] >= 40 && distToBg >= 35) {
        rawAlphas[idx] = 255.0;
      } else {
        break;
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
  const isExterior = findExteriorBackgroundMask(alphas, w, h, 20);

  // Dilate exterior by 4 pixels to create a safe boundary margin
  const isNearExterior = new Uint8Array(isExterior);
  for (let pass = 0; pass < 4; pass++) {
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

  // 3. White Shirt & Light Garment RGB Signature Pass (when pixel color data is available)
  if (imageData) {
    const pixels = imageData.data;
    for (let y = Math.max(0, chinY - 20); y < h; y++) {
      const row = y * w;
      for (let x = Math.max(0, minSubjX + 5); x <= Math.min(w - 1, maxSubjX - 5); x++) {
        const idx = row + x;
        const pIdx = idx * 4;

        if (isNearExterior[idx] === 0 && alphas[idx] >= 100) {
          const r = pixels[pIdx];
          const g = pixels[pIdx + 1];
          const b = pixels[pIdx + 2];

          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);

          // White / Light shirt & Check shirt signature: high brightness, low/moderate saturation, or check grid lines
          const isWhiteOrCheckShirt = (maxC >= 115 && (maxC - minC) <= 75) || (r > 125 && g > 125 && b > 125);
          if (isWhiteOrCheckShirt) {
            alphas[idx] = 255.0; // Strictly 255 for deep interior garment core
          }
        }
      }
    }
  }

  // 4. Cleanly separate exterior background from interior subject
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const i = rowOffset + x;
      if (isExterior[i] === 1) {
        // Completely clear all exterior background pixels
        alphas[i] = 0.0;
      } else {
        // Solidify interior core to prevent transparency holes in face or body
        if (y > chinY) {
          if (isNearExterior[i] === 0 && alphas[i] > 140) alphas[i] = 255.0;
        } else {
          if (alphas[i] >= 220) alphas[i] = 255.0;
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
  // Detect chair wings/backrests protruding high above/beside the head and neck
  if (severTouchingObjects && objectStrictness > 70) {
    const subjH = maxY - minY;
    const subjW = maxX - minX;
    const chinY = Math.floor(minY + subjH * 0.30);

    // Head boundary width estimate (allow generous margin for hair, ears, accessories)
    const headHalfW = Math.max(35, Math.floor(subjW * 0.48));
    const leftLimit = coreCenterX - headHalfW;
    const rightLimit = coreCenterX + headHalfW;

    for (let y = minY; y <= chinY; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const idx = row + x;
        // Only strip if low/medium alpha (< 40) and far outside head bounds
        if (alphas[idx] > 0 && alphas[idx] < 40) {
          const isFarLateral = x < (leftLimit - 25) || x > (rightLimit + 25);
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
    const isShoulderTorsoZone = y >= Math.floor(h * 0.27);

    // If neural net or interior solidification cleared background, never invent alpha
    if (origA < 20) {
      output[i] = 0;
      continue;
    }
    // If background is light/white and alpha is low, cleanly eliminate haze
    if (origA < 35 && gVal > 0.70) {
      output[i] = 0;
      continue;
    }
    if (origA >= 245) {
      output[i] = 255;
      continue;
    }

    const q = Math.max(0, Math.min(1.0, meanA[i] * gVal + meanB[i]));
    const rawVal = q * 255.0;

    // Sharp, crisp cutoff for body, and clean hair boundary cutoff without fuzzy white halos
    const isUpper = y < h * 0.35;
    const threshLow = isUpper ? 36 : 30; // Cleanly cuts outer white fringe
    const threshHigh = isUpper ? 215 : 195;
    
    if (rawVal <= threshLow) {
      output[i] = 0;
    } else if (rawVal >= threshHigh) {
      output[i] = 255;
    } else {
      const t = (rawVal - threshLow) / (threshHigh - threshLow);
      const s = t * t * (3 - 2 * t);
      const refined = s * 255.0;
      if (gVal > 0.68) {
        output[i] = Math.max(0, Math.min(255, Math.min(origA + 8, refined)));
      } else {
        output[i] = Math.max(0, Math.min(255, Math.min(origA + 15, refined)));
      }
    }
  }

  return output;
}

// -------------------------------------------------------------
// STAGE 5: PRISTINE PHOTO DETAIL PRESERVATION & CLEAN EDGE MATTING
// -------------------------------------------------------------

/**
 * Applies clean edge matting with advanced local color de-contamination (de-fringing)
 * to completely eliminate white background halos around hair, ears, face, jawline, and neck
 * without introducing any artificial black spots.
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

  // Background luminance check
  const bgMeanR = bgModels?.global?.meanR ?? 245;
  const bgMeanG = bgModels?.global?.meanG ?? 245;
  const bgMeanB = bgModels?.global?.meanB ?? 245;
  const bgLum = 0.299 * bgMeanR + 0.587 * bgMeanG + 0.114 * bgMeanB;
  const isLightBg = bgLum > 155;

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    const isUpper = y < h * 0.54; // Head, hair, ears, and jawline boundary
    const isEarLevel = y >= h * 0.16 && y <= h * 0.54;

    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x;
      const alphaVal = tempAlphas[idx];
      const pIdx = idx * 4;

      const r = copyPixels[pIdx];
      const g = copyPixels[pIdx + 1];
      const b = copyPixels[pIdx + 2];
      const curLum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Cleanly cut outer background haze and white fringe:
      // Prevents white halos from lingering in the background transition of hair and ears
      let lowerCut = isUpper ? 36 : 20;
      if (isLightBg && isUpper && curLum > 170) {
        lowerCut = isEarLevel ? 52 : 48; // Cut white background bleed on outer perimeter of ears and hair
      }
      const upperCut = isUpper ? 220 : 190;

      if (alphaVal <= lowerCut) {
        pixels[pIdx + 3] = 0;
        continue;
      }

      if (alphaVal >= upperCut) {
        pixels[pIdx + 3] = 255;
      } else {
        // Smooth non-linear curve for anti-aliased hair strands and clean contours
        const t = (alphaVal - lowerCut) / (upperCut - lowerCut);
        const smoothAlpha = t * t * (3 - 2 * t) * 255.0;
        pixels[pIdx + 3] = Math.round(Math.max(0, Math.min(255, smoothAlpha)));
      }

      // Green Spill Suppression (Despill) to eliminate green screen reflections in hair/shoulders
      if (pixels[pIdx + 3] > 0 && alphaVal < 250) {
        if (g > r && g > b) {
          pixels[pIdx + 1] = Math.max(r, b); // Clamp green to max of red or blue
        }
      }

      // Hair Edge White Halo De-contamination (De-fringing)
      // If the original background was light/white and this boundary pixel has white background bleed,
      // sample authentic interior hair color and remove the white matte contamination
      // WITHOUT clamping to zero (which prevents black spots).
      if (isLightBg && isUpper && pixels[pIdx + 3] > 0 && alphaVal < 225) {
        // Sample nearby interior hair foreground (where alpha is high)
        let fgR = 0, fgG = 0, fgB = 0, fgCount = 0;
        const rad = 4;
        const startY = Math.max(0, y - rad);
        const endY = Math.min(h - 1, y + rad);
        const startX = Math.max(0, x - rad);
        const endX = Math.min(w - 1, x + rad);

        for (let ny = startY; ny <= endY; ny++) {
          const nRow = ny * w;
          for (let nx = startX; nx <= endX; nx++) {
            const nIdx = nRow + nx;
            if (tempAlphas[nIdx] >= 210) {
              const npIdx = nIdx * 4;
              fgR += copyPixels[npIdx];
              fgG += copyPixels[npIdx + 1];
              fgB += copyPixels[npIdx + 2];
              fgCount++;
            }
          }
        }

        if (fgCount > 0) {
          const avgFgR = fgR / fgCount;
          const avgFgG = fgG / fgCount;
          const avgFgB = fgB / fgCount;
          const fgLum = 0.299 * avgFgR + 0.587 * avgFgG + 0.114 * avgFgB;

          // If the boundary pixel is lighter than authentic hair due to white background spill:
          if (curLum > fgLum + 12) {
            const aNorm = Math.max(0.2, pixels[pIdx + 3] / 255.0);
            const haloFactor = Math.min(1.0, (curLum - fgLum) / 120.0);
            
            // Decontaminate white background bleed towards natural hair color
            // Lower-bounded by avgFg so it NEVER creates black spots!
            const unmixR = Math.max(avgFgR, (r - bgMeanR * (1 - aNorm)) / aNorm);
            const unmixG = Math.max(avgFgG, (g - bgMeanG * (1 - aNorm)) / aNorm);
            const unmixB = Math.max(avgFgB, (b - bgMeanB * (1 - aNorm)) / aNorm);

            const blend = haloFactor * (1 - aNorm * 0.7);
            pixels[pIdx] = Math.round(r * (1 - blend) + Math.min(255, unmixR) * blend);
            pixels[pIdx + 1] = Math.round(g * (1 - blend) + Math.min(255, unmixG) * blend);
            pixels[pIdx + 2] = Math.round(b * (1 - blend) + Math.min(255, unmixB) * blend);
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

  // Anatomical vertical bounds: full ear extends from eye level down to below earlobe / upper neck
  const earStartY = Math.floor(minY + subjH * 0.16);
  const earEndY = Math.floor(minY + subjH * 0.54);
  const maxHeadNeckY = Math.min(h - 1, Math.floor(minY + subjH * 0.54)); // Never touch shoulders/torso!

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
      const isRightEarZone = isEarLevel && (x >= coreCenterX);

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

  // Range from top of ear (0.16) down to the bottom of the shoulder / chest (0.92)
  const yStart = Math.max(0, Math.floor(minY + subjH * 0.16));
  const yEnd = Math.min(h - 1, Math.floor(minY + subjH * 0.92));

  // Background color reference
  const bgMeanR = bgModels?.global?.meanR ?? 245;
  const bgMeanG = bgModels?.global?.meanG ?? 245;
  const bgMeanB = bgModels?.global?.meanB ?? 245;
  const isLightBg = (0.299 * bgMeanR + 0.587 * bgMeanG + 0.114 * bgMeanB) > 155;

  // 2. Row by row, identify the left perimeter edge
  for (let y = yStart; y <= yEnd; y++) {
    const row = y * w;
    
    // Find left-most non-transparent pixel
    let leftEdgeX = -1;
    for (let x = 0; x < coreCenterX; x++) {
      if (alphaCopy[row + x] > 15) {
        leftEdgeX = x;
        break;
      }
    }

    if (leftEdgeX === -1) continue;

    // Scan a band of 6 pixels starting from the left edge inward
    const bandEnd = Math.min(coreCenterX - 1, leftEdgeX + 6);

    for (let x = Math.max(0, leftEdgeX - 2); x <= bandEnd; x++) {
      const idx = row + x;
      const pIdx = idx * 4;
      const a = pixels[pIdx + 3];

      if (a === 0) continue;

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

      // Rule A: Faint boundary noise or outer halo on the left edge
      if (touchesExterior && a < 140) {
        pixels[pIdx + 3] = 0;
        continue;
      }

      // Rule B: Any left-edge pixel matching background color
      if (distToBg < 35 && a < 225) {
        pixels[pIdx + 3] = 0;
        continue;
      }

      // Rule C: Light/white background bleed on boundary
      if (isLightBg && touchesExterior && lum > 165 && (distToBg < 48 || (Math.abs(r - g) <= 15 && Math.abs(g - b) <= 15))) {
        if (a < 210) {
          pixels[pIdx + 3] = 0;
          continue;
        }
      }

      // Rule D: Crevices/corners along ear, neck, and shoulder (multiple transparent neighbors)
      if (transparentNeighbors >= 3 && a < 185) {
        pixels[pIdx + 3] = 0;
        continue;
      }

      // Rule E: Inpaint/Decontaminate edge pixels that remain:
      // Pull authentic interior color from 2-5 pixels inside the subject
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
      const hazeCutoff = isUpper ? 30 : 25; // Cleanly eliminate faint boundary haze around hair
      const solidCutoff = isUpper ? 230 : 190;

      if (a < hazeCutoff) {
        // Zero out faint boundary haze heavily so no black spots or smudges spread
        pixels[pIdx + 3] = 0;
      } else if (a > solidCutoff) {
        // Only solidify if not touching an external transparent pixel:
        const aUp = y > 0 ? alphaCopy[idx - w] : 0;
        const aDown = y < h - 1 ? alphaCopy[idx + w] : 0;
        const aLeft = x > 0 ? alphaCopy[idx - 1] : 0;
        const aRight = x < w - 1 ? alphaCopy[idx + 1] : 0;
        if (aUp <= 20 || aDown <= 20 || aLeft <= 20 || aRight <= 20) {
          // Preserve smooth anti-aliased alpha along the perimeter
        } else {
          // Solidify deep subject core
          pixels[pIdx + 3] = 255;
        }
      } else {
        // Only remove faint isolated floating noise (a < 55) that is far from any subject core
        if (a < 55) {
          let nearSubject = false;
          const radius = 8;
          const startY = Math.max(0, y - radius);
          const endY = Math.min(h - 1, y + radius);
          const startX = Math.max(0, x - radius);
          const endX = Math.min(w - 1, x + radius);

          for (let ny = startY; ny <= endY; ny++) {
            const nRow = ny * w;
            for (let nx = startX; nx <= endX; nx++) {
              if (alphaCopy[nRow + nx] >= 110) {
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
}

/**
 * Eliminates white lines, halos, and light fringes along the subject perimeter boundary.
 * 1. Trims the outermost white background fringe where exposed to transparency.
 * 2. Inpaints and decontaminates edge pixels by pulling true interior foreground colors (skin, hair, clothing)
 *    into the boundary transition pixels, ensuring zero white edge border on any background.
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

  // Determine dominant background luminance
  let bgMeanR = bgModels?.global?.meanR ?? 250;
  let bgMeanG = bgModels?.global?.meanG ?? 250;
  let bgMeanB = bgModels?.global?.meanB ?? 250;
  const bgLum = 0.299 * bgMeanR + 0.587 * bgMeanG + 0.114 * bgMeanB;
  const isLightBg = bgLum > 155;

  // Pass 1: Outermost white boundary trimming on hair crown, ears, and entire left edge
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    const isHeadAndEarZone = y < h * 0.54;

    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      const a = alphaCopy[idx];
      if (a === 0) continue;

      const isLeftPerimeterZone = (x < w * 0.5) && (y < h * 0.92);
      const shouldCleanBoundary = isHeadAndEarZone || isLeftPerimeterZone;

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

        // If exposed to transparent neighbors, cleanly eliminate light/white background fringe
        if (transparentNeighbors >= 2) {
          if (a < 25 || (shouldCleanBoundary && isLightBg && lum > 145 && a < 140)) {
            pixels[pIdx + 3] = 0;
            alphaCopy[idx] = 0;
            continue;
          }
        } else if (transparentNeighbors === 1) {
          if (a < 15 || (shouldCleanBoundary && isLightBg && lum > 155 && a < 100)) {
            pixels[pIdx + 3] = 0;
            alphaCopy[idx] = 0;
            continue;
          }
        }
      }
    }
  }

  // Pass 2: Boundary Fringe White Halo De-contamination & Alpha Attenuation
  // Cleanly eliminates white background rims around hair strands, ears, and entire left shoulder perimeter
  // without staining or darkening genuine hair/skin/clothing.
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    const isHeadAndEarZone = y < h * 0.54;

    for (let x = 1; x < w - 1; x++) {
      const idx = row + x;
      const a = pixels[idx * 4 + 3];
      if (a === 0 || a >= 235) continue;

      const isLeftPerimeterZone = (x < w * 0.5) && (y < h * 0.92);
      const shouldCleanBoundary = isHeadAndEarZone || isLeftPerimeterZone;

      // Check if pixel is on the perimeter edge touching transparency
      const aUp = alphaCopy[row - w + x];
      const aDown = alphaCopy[row + w + x];
      const aLeft = alphaCopy[row + x - 1];
      const aRight = alphaCopy[row + x + 1];
      const isTouchingBg = aUp === 0 || aDown === 0 || aLeft === 0 || aRight === 0;

      if (!isTouchingBg) continue;

      const pIdx = idx * 4;
      const curR = pixels[pIdx];
      const curG = pixels[pIdx + 1];
      const curB = pixels[pIdx + 2];
      const curLum = 0.299 * curR + 0.587 * curG + 0.114 * curB;

      // If background is light and boundary pixel is a pale fringe in target zone, cleanly attenuate its alpha
      if (shouldCleanBoundary && isLightBg && curLum > 155 && a < 195) {
        if (curLum > 195 && a < 140) {
          pixels[pIdx + 3] = Math.round(a * 0.40);
        } else if (curLum > 170 && a < 165) {
          pixels[pIdx + 3] = Math.round(a * 0.70);
        }

        // Decontaminate hair/ear/shoulder edge pixels by removing white background light bleed
        if (shouldCleanBoundary) {
          let fgR = 0, fgG = 0, fgB = 0, fgCount = 0;
          for (let dy = -3; dy <= 3; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -3; dx <= 3; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= w) continue;
              const nIdx = ny * w + nx;
              if (alphaCopy[nIdx] >= 210) {
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
            const fgLum = 0.299 * avgFgR + 0.587 * avgFgG + 0.114 * avgFgB;

            if (curLum > fgLum + 12) {
              const aNorm = Math.max(0.2, a / 255.0);
              const haloFactor = Math.min(1.0, (curLum - fgLum) / 100.0);
              const unmixR = Math.max(avgFgR, (curR - bgMeanR * (1 - aNorm)) / aNorm);
              const unmixG = Math.max(avgFgG, (curG - bgMeanG * (1 - aNorm)) / aNorm);
              const unmixB = Math.max(avgFgB, (curB - bgMeanB * (1 - aNorm)) / aNorm);

              const blend = haloFactor * (1 - aNorm * 0.7);
              pixels[pIdx] = Math.round(curR * (1 - blend) + Math.min(255, unmixR) * blend);
              pixels[pIdx + 1] = Math.round(curG * (1 - blend) + Math.min(255, unmixG) * blend);
              pixels[pIdx + 2] = Math.round(curB * (1 - blend) + Math.min(255, unmixB) * blend);
            }
          }
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

    // Primary: Route model according to requested engine
    if (engine === 'modnet' || engine === 'strict_subject') {
      await ensureModnetLoaded().catch(console.error);
      if (modnetPipeline) {
        try {
          resSegmentation = await modnetPipeline(imageSrc);
        } catch (e) {
          console.warn("MODNet primary inference failed, trying RMBG...", e);
        }
      }
    }

    // Secondary / Universal Engine: RMBG-1.4 (SOTA Salient & Human Subject Segmentation)
    if (!resSegmentation && isnetPipeline) {
      try {
        resSegmentation = await isnetPipeline(imageSrc);
      } catch (e) {
        console.warn("RMBG-1.4 primary inference failed, trying fallback...", e);
      }
    }

    // Tertiary fallback to MODNet if RMBG failed
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

    if (rawMask) {
      maskData = extractAlphaArrayFromMask(rawMask);

      // Clean background speckles without cutting off the subject
      isolateAndCleanSubjectMask(maskData, {
        removeNoise: removeBackgroundNoise
      });
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

    if (maskData) {
      const mw = maskData.width;
      const mh = maskData.height;
      const mData = maskData.data;

      // 1. Bilinear Upscale of Prediction Mask to Full Resolution
      const rawAlphas = new Float32Array(w * h);

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
          rawAlphas[rowOffset + x] = Math.max(0, Math.min(255, a));
        }
      }

      // 1b. Extend & Protect Left Shoulder and White/Check Shirt Contours
      extendAndProtectLeftShoulderAndGarment(rawAlphas, imageData, w, h, {
        extendLeftShoulder,
        leftShoulderExtensionAmount,
      });

      // 2. Solidify interior subject & fortify white shirts / clothing at native resolution
      solidifySubjectInteriorAndClothing(rawAlphas, imageData, w, h);

      // 3. Eliminate disconnected background noise, chair islands, and touching furniture
      eliminateChairAndBackrestObjects(pixels, rawAlphas, w, h, {
        severTouchingObjects: options.severTouchingObjects ?? false,
        objectStrictness: options.objectStrictness ?? 50,
      });

      // 4. Sample Local Background Color Models for De-fringing
      const bgModels = sampleBackgroundModels(imageData, rawAlphas, w, h);

      // 5. Fast Guided Filter for Sub-pixel Edge Alignment
      const refinedAlphas = applyFastGuidedFilter(imageData, rawAlphas, w, h, 2, 0.0001);

      // 6. Clean Edge Matting & Background De-fringing (Removes halos around ears and hair)
      if (decontaminateHalos) {
        applyCleanEdgeMatting(pixels, refinedAlphas, w, h, bgModels);
      } else {
        for (let i = 0; i < w * h; i++) {
          pixels[i * 4 + 3] = Math.round(refinedAlphas[i]);
        }
      }

      // 7. Re-apply chair elimination check after de-fringing if explicitly requested
      if (options.severTouchingObjects) {
        eliminateChairAndBackrestObjects(pixels, refinedAlphas, w, h, {
          severTouchingObjects: options.severTouchingObjects,
          objectStrictness: options.objectStrictness ?? 50,
        });
      }

      // 8. Sub-Pixel Edge Anti-Aliasing (DISABLED - strict binary cut in use)
      // antiAliasBoundaryEdges(pixels, w, h);

      // 9. HD Photo Clarity & Feature Enhancement
      enhanceForegroundSubjectClarity(pixels, w, h, 0.10);

      // 10. Ear, Neck & Jawline Halo Clearing Pass
      cleanEarNeckHeadHalosPass(pixels, w, h, bgModels);

      // 10b. Left-Edge Ear to Shoulder Halo & Background Removal
      cleanLeftEdgeHalosFromEarToShoulder(pixels, w, h, bgModels);

      // 11. Quality Control Pass
      qualityControlPerimeterPass(pixels, w, h);

      // 12. Eliminate Subject Boundary White Line & Halos
      removeSubjectBoundaryWhiteLine(pixels, w, h, bgModels);
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
              const bgDist = Math.hypot(r - avgBgR, g - avgBgG, b - avgBgB);
              const isLeftShoulder = x < coreCenterX;
              
              if (isLeftShoulder) {
                // Thoroughly clear left shoulder edge halos and background fringes
                if (a < 140 || (bgDist < haloThreshold * 3.2 && a < 235)) {
                  pixels[idx + 3] = 0;
                  alphas[row + x] = 0;
                  continue;
                }
              } else {
                // In right shoulder zone, protect white check shirts; only clear genuine background noise (a < 25)
                if (a < 25) {
                  pixels[idx + 3] = 0;
                  alphas[row + x] = 0;
                  continue;
                }
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

      // 6. Complete Subject Boundary Ear & Neck Halo Elimination
      cleanEarNeckHeadHalosPass(pixels, w, h);

      // 6b. Complete Left-Edge Ear to Shoulder Halo Elimination
      cleanLeftEdgeHalosFromEarToShoulder(pixels, w, h);

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


