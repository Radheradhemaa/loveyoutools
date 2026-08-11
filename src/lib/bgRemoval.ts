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

  // Check scale (0..1 vs 0..255)
  let maxVal = 0;
  const sampleCount = Math.min(2000, raw.length);
  for (let i = 0; i < sampleCount; i++) {
    if (raw[i] > maxVal) maxVal = raw[i];
  }
  const scale = maxVal <= 1.05 && maxVal > 0 ? 255.0 : 1.0;

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

  return { width, height, data: out };
}

/**
 * Accurately finds all pixels connected to the image boundaries that belong to the outer background.
 * Uses a robust 4-way BFS queue starting from the outer perimeter with a strict threshold
 * to prevent background flood-fill from ever leaking into white shirts or clothing.
 */
function findExteriorBackgroundMask(
  alphas: Float32Array,
  w: number,
  h: number,
  bgThreshold = 30
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
    minSubjX = Math.floor(w * 0.25);
    maxSubjX = Math.floor(w * 0.75);
    minSubjY = 0;
    maxSubjY = h - 1;
  }

  const subjHeight = maxSubjY - minSubjY;
  const chinY = Math.floor(minSubjY + subjHeight * 0.30);

  // 2. Safely seed the exterior background:
  // Top border: seed background
  for (let x = 0; x < w; x++) {
    const topIdx = x;
    if (alphas[topIdx] < bgThreshold && isExterior[topIdx] === 0) {
      isExterior[topIdx] = 1;
      queue[tail++] = topIdx;
    }
  }

  // Left & Right borders:
  for (let y = 0; y < h; y++) {
    const leftIdx = y * w;
    const rightIdx = y * w + (w - 1);
    const isTorsoLevel = y >= chinY;

    // Do not seed left border at torso/clothing level unless alpha is extremely low (< 5)
    if (!isTorsoLevel || alphas[leftIdx] < 5) {
      if (alphas[leftIdx] < bgThreshold && isExterior[leftIdx] === 0) {
        isExterior[leftIdx] = 1;
        queue[tail++] = leftIdx;
      }
    }

    // Do not seed right border at torso/clothing level unless alpha is extremely low (< 5)
    if (!isTorsoLevel || alphas[rightIdx] < 5) {
      if (alphas[rightIdx] < bgThreshold && isExterior[rightIdx] === 0) {
        isExterior[rightIdx] = 1;
        queue[tail++] = rightIdx;
      }
    }
  }

  // Bottom border: ONLY seed far left and far right outside the subject torso
  const leftSafeLimit = Math.max(0, minSubjX - 15);
  const rightSafeLimit = Math.min(w - 1, maxSubjX + 15);

  for (let x = 0; x < leftSafeLimit; x++) {
    const botIdx = (h - 1) * w + x;
    if (alphas[botIdx] < bgThreshold && isExterior[botIdx] === 0) {
      isExterior[botIdx] = 1;
      queue[tail++] = botIdx;
    }
  }

  for (let x = rightSafeLimit + 1; x < w; x++) {
    const botIdx = (h - 1) * w + x;
    if (alphas[botIdx] < bgThreshold && isExterior[botIdx] === 0) {
      isExterior[botIdx] = 1;
      queue[tail++] = botIdx;
    }
  }

  // 3. 4-way BFS flood-fill outward to find true background
  // Allows higher barrier limit in upper body/head region so flood fill enters ear gaps & neck curves cleanly
  const neckLimitY = chinY + Math.floor(subjHeight * 0.35);
  while (head < tail) {
    const curr = queue[head++];
    const cy = Math.floor(curr / w);
    const cx = curr % w;

    const barrierLimit = cy < neckLimitY ? 100 : 45;

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
 * Solidifies the entire subject interior (face, hair, neck, torso, white shirt, clothes, hands).
 * Guarantees that white shirts and light clothes inside the subject silhouette are 100% solid (Alpha = 255.0)
 * without any holes or background color bleed-through, while keeping exterior background transparent.
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
    minSubjX = Math.floor(w * 0.25);
    maxSubjX = Math.floor(w * 0.75);
    minSubjY = 0;
    maxSubjY = h - 1;
  }

  const subjHeight = maxSubjY - minSubjY;
  const chinY = Math.floor(minSubjY + subjHeight * 0.30);

  // 2. Flood fill from outer image edges to identify true exterior background
  const isExterior = findExteriorBackgroundMask(alphas, w, h, 30);

  // 3. White Shirt & Light Garment RGB Signature Pass (when pixel color data is available)
  // Only solidifies interior pixels (isExterior === 0) to avoid filling concave gaps around ears/neck
  if (imageData) {
    const pixels = imageData.data;
    for (let y = Math.max(0, chinY - 20); y < h; y++) {
      const row = y * w;
      for (let x = Math.max(0, minSubjX - 10); x <= Math.min(w - 1, maxSubjX + 10); x++) {
        const idx = row + x;
        const pIdx = idx * 4;

        if (isExterior[idx] === 0) {
          const r = pixels[pIdx];
          const g = pixels[pIdx + 1];
          const b = pixels[pIdx + 2];

          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);

          // White / Light shirt signature: high brightness, low saturation
          const isWhiteShirt = maxC >= 150 && (maxC - minC) <= 50;
          if (isWhiteShirt) {
            alphas[idx] = Math.max(alphas[idx], 220.0);
          }
        }
      }
    }
  }

  // 4. Cleanly separate exterior background from interior subject
  for (let i = 0; i < total; i++) {
    if (isExterior[i] === 1) {
      // Clear out exterior background noise completely
      alphas[i] = 0.0;
    } else {
      // INSIDE SUBJECT SILHOUETTE:
      // Guarantee high opacity for interior while preserving smooth edge transitions
      if (alphas[i] > 10 && alphas[i] < 180) {
        alphas[i] = Math.max(alphas[i], 140.0);
      } else if (alphas[i] >= 180) {
        alphas[i] = 255.0;
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

  const {
    removeNoise = true
  } = options;

  if (removeNoise) {
    solidifySubjectInteriorAndClothing(srcData, null, mw, mh);
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
  const threshLow = 20;
  const threshHigh = 220;

  for (let i = 0; i < total; i++) {
    const origA = rawAlpha[i];
    if (origA <= 2) {
      output[i] = 0;
      continue;
    }
    if (origA >= 253) {
      output[i] = 255;
      continue;
    }

    const q = Math.max(0, Math.min(1.0, meanA[i] * guide[i] + meanB[i]));
    const rawVal = q * 255.0;

    // Apply Hermite Smoothstep Edge Sharpening for silky smooth anti-aliased edge
    if (rawVal <= threshLow) {
      output[i] = 0;
    } else if (rawVal >= threshHigh) {
      output[i] = 255;
    } else {
      const t = (rawVal - threshLow) / (threshHigh - threshLow);
      const s = t * t * (3 - 2 * t);
      output[i] = Math.max(0, Math.min(255, s * 255.0));
    }
  }

  return output;
}

// -------------------------------------------------------------
// STAGE 5: PRISTINE PHOTO DETAIL PRESERVATION & CLEAN EDGE MATTING
// -------------------------------------------------------------

/**
 * Applies clean edge matting with advanced local 5x5 color de-contamination (de-fringing)
 * to completely eliminate background halos around ears, face, jawline, neck, and hair.
 */
function applyCleanEdgeMatting(
  pixels: Uint8ClampedArray,
  alphas: Float32Array,
  w: number,
  h: number,
  bgModels?: BackgroundModels
) {
  const tempPixels = new Uint8ClampedArray(pixels);
  const tempAlphas = new Float32Array(alphas);

  for (let y = 0; y < h; y++) {
    const secY = Math.min(2, Math.floor((y / h) * 3));
    const rowOffset = y * w;

    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x;
      const alphaVal = tempAlphas[idx];
      const pIdx = idx * 4;

      if (alphaVal <= 8) {
        pixels[pIdx + 3] = 0;
        continue;
      }

      if (alphaVal >= 248) {
        pixels[pIdx + 3] = 255;
        continue;
      }

      // Smooth anti-aliased transition edge
      pixels[pIdx + 3] = Math.round(alphaVal);

      // High-precision 5x5 local neighborhood sampling for ear, face & hair decontamination
      let fgR = 0, fgG = 0, fgB = 0, fgCount = 0;
      let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;

      const rRange = 4;
      const startY = Math.max(0, y - rRange);
      const endY = Math.min(h - 1, y + rRange);
      const startX = Math.max(0, x - rRange);
      const endX = Math.min(w - 1, x + rRange);

      for (let ny = startY; ny <= endY; ny++) {
        const nRow = ny * w;
        for (let nx = startX; nx <= endX; nx++) {
          const nIdx = nRow + nx;
          const nA = tempAlphas[nIdx];
          const npIdx = nIdx * 4;

          if (nA >= 210) {
            fgR += tempPixels[npIdx];
            fgG += tempPixels[npIdx + 1];
            fgB += tempPixels[npIdx + 2];
            fgCount++;
          } else if (nA <= 10) {
            bgR += tempPixels[npIdx];
            bgG += tempPixels[npIdx + 1];
            bgB += tempPixels[npIdx + 2];
            bgCount++;
          }
        }
      }

      if (fgCount > 0) {
        const avgFgR = fgR / fgCount;
        const avgFgG = fgG / fgCount;
        const avgFgB = fgB / fgCount;

        const curR = tempPixels[pIdx];
        const curG = tempPixels[pIdx + 1];
        const curB = tempPixels[pIdx + 2];

        if (bgCount > 0) {
          const avgBgR = bgR / bgCount;
          const avgBgG = bgG / bgCount;
          const avgBgB = bgB / bgCount;

          const distToBg = Math.hypot(curR - avgBgR, curG - avgBgG, curB - avgBgB);
          const distToFg = Math.hypot(curR - avgFgR, curG - avgFgG, curB - avgFgB);

          // Zero out low-confidence halo noise around ears, face and hair
          if (alphaVal < 45 && distToBg < distToFg * 1.2) {
            pixels[pIdx + 3] = 0;
            continue;
          }

          // Unmix background color mathematically:
          const aNorm = Math.max(0.15, alphaVal / 255.0);
          const invA = 1.0 - aNorm;
          const unmixR = Math.max(0, Math.min(255, (curR - avgBgR * invA) / aNorm));
          const unmixG = Math.max(0, Math.min(255, (curG - avgBgG * invA) / aNorm));
          const unmixB = Math.max(0, Math.min(255, (curB - avgBgB * invA) / aNorm));

          // Replace contaminated pixel RGB with pure unmixed color blended toward true local skin/hair foreground
          const fgWeight = Math.max(0.55, aNorm);
          pixels[pIdx] = Math.round(unmixR * (1 - fgWeight) + avgFgR * fgWeight);
          pixels[pIdx + 1] = Math.round(unmixG * (1 - fgWeight) + avgFgG * fgWeight);
          pixels[pIdx + 2] = Math.round(unmixB * (1 - fgWeight) + avgFgB * fgWeight);
        } else {
          // If no background neighbor found in 5x5, use local foreground color to prevent halo
          pixels[pIdx] = Math.round(avgFgR);
          pixels[pIdx + 1] = Math.round(avgFgG);
          pixels[pIdx + 2] = Math.round(avgFgB);
        }
      } else if (bgModels) {
        // Sector model fallback for de-contamination
        const secX = Math.min(2, Math.floor((x / w) * 3));
        const sector = bgModels.sectors[secY * 3 + secX] || bgModels.global;

        const origR = tempPixels[pIdx];
        const origG = tempPixels[pIdx + 1];
        const origB = tempPixels[pIdx + 2];

        const alphaNorm = alphaVal / 255.0;
        const invAlpha = 1.0 - alphaNorm;

        const safeAlpha = Math.max(0.25, alphaNorm);
        const unmixR = (origR - sector.meanR * invAlpha) / safeAlpha;
        const unmixG = (origG - sector.meanG * invAlpha) / safeAlpha;
        const unmixB = (origB - sector.meanB * invAlpha) / safeAlpha;

        pixels[pIdx] = Math.round(Math.max(0, Math.min(255, unmixR)));
        pixels[pIdx + 1] = Math.round(Math.max(0, Math.min(255, unmixG)));
        pixels[pIdx + 2] = Math.round(Math.max(0, Math.min(255, unmixB)));
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
      if (alpha < 60) continue; // Skip transparent / outer background

      const iUp = ((y - 1) * w + x) * 4;
      const iDown = ((y + 1) * w + x) * 4;
      const iLeft = (rowOffset + x - 1) * 4;
      const iRight = (rowOffset + x + 1) * 4;

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

      if (a === 0 || a >= 245) continue; // Skip fully transparent or solid subject core

      // Sample a 5x5 neighborhood around this boundary pixel
      let transparentCount = 0;
      let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
      let fgR = 0, fgG = 0, fgB = 0, fgCount = 0;

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
          if (nA === 0) {
            transparentCount++;
            bgR += pixels[npIdx];
            bgG += pixels[npIdx + 1];
            bgB += pixels[npIdx + 2];
            bgCount++;
          } else if (nA >= 200) {
            fgR += pixels[npIdx];
            fgG += pixels[npIdx + 1];
            fgB += pixels[npIdx + 2];
            fgCount++;
          }
        }
      }

      // If a transition pixel is heavily surrounded by transparent background (concave gap/crevice)
      // or if its alpha is low in an ear/neck gap, clear its alpha to zero out halos
      if (transparentCount >= 9 && a < 140) {
        pixels[pIdx + 3] = 0;
        continue;
      }

      if (bgCount > 0 && fgCount > 0) {
        const avgBgR = bgR / bgCount;
        const avgBgG = bgG / bgCount;
        const avgBgB = bgB / bgCount;

        const curR = pixels[pIdx];
        const curG = pixels[pIdx + 1];
        const curB = pixels[pIdx + 2];

        const distToBg = Math.hypot(curR - avgBgR, curG - avgBgG, curB - avgBgB);

        // If the pixel color is very close to background color, clear it out
        if (distToBg < 30 && a < 150) {
          pixels[pIdx + 3] = 0;
          continue;
        }

        // Replace any remaining RGB color with pure local skin/hair foreground color
        const avgFgR = fgR / fgCount;
        const avgFgG = fgG / fgCount;
        const avgFgB = fgB / fgCount;

        pixels[pIdx] = Math.round(avgFgR);
        pixels[pIdx + 1] = Math.round(avgFgG);
        pixels[pIdx + 2] = Math.round(avgFgB);
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

      if (a < 8) {
        // Zero out faint boundary haze
        pixels[pIdx + 3] = 0;
      } else if (a > 248) {
        // Solidify subject core
        pixels[pIdx + 3] = 255;
      } else {
        // Check if there is any strong subject core pixel (alpha >= 180) within 3-pixel radius
        let nearSubject = false;
        const startY = Math.max(0, y - 3);
        const endY = Math.min(h - 1, y + 3);
        const startX = Math.max(0, x - 3);
        const endX = Math.min(w - 1, x + 3);

        for (let ny = startY; ny <= endY; ny++) {
          const nRow = ny * w;
          for (let nx = startX; nx <= endX; nx++) {
            if (alphaCopy[nRow + nx] >= 180) {
              nearSubject = true;
              break;
            }
          }
          if (nearSubject) break;
        }

        if (!nearSubject) {
          // Isolated floating noise artifact in the background - clear it completely!
          pixels[pIdx + 3] = 0;
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

      // 2. Solidify interior subject & fortify white shirts / clothing at native resolution
      solidifySubjectInteriorAndClothing(rawAlphas, imageData, w, h);

      // 3. Eliminate chair backrest and touching background furniture around neck and shoulders if explicitly requested
      if (options.severTouchingObjects) {
        eliminateChairAndBackrestObjects(pixels, rawAlphas, w, h, {
          severTouchingObjects: options.severTouchingObjects,
          objectStrictness: options.objectStrictness ?? 50,
        });
      }

      // 4. Sample Local Background Color Models for De-fringing
      const bgModels = sampleBackgroundModels(imageData, rawAlphas, w, h);

      // 5. Fast Guided Filter for Sub-pixel Edge Alignment
      const refinedAlphas = applyFastGuidedFilter(imageData, rawAlphas, w, h, 3, 0.0001);

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

      // 8. Sub-Pixel Edge Anti-Aliasing for Silky Smooth Contour Boundaries
      antiAliasBoundaryEdges(pixels, w, h);

      // 9. HD Photo Clarity & Feature Enhancement
      enhanceForegroundSubjectClarity(pixels, w, h, 0.25);

      // 10. Ear, Neck & Jawline Halo Clearing Pass
      cleanEarNeckHeadHalosPass(pixels, w, h);

      // 11. Quality Control Pass
      qualityControlPerimeterPass(pixels, w, h);
    }

    ctx.putImageData(imageData, 0, 0);

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

      // 2. Eliminate chair artifacts and furniture
      eliminateChairAndBackrestObjects(pixels, alphas, w, h, {
        severTouchingObjects: true,
        objectStrictness: 85,
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
      const earZoneYStart = Math.floor(minY + subjHeight * 0.15);
      const shoulderZoneYEnd = Math.floor(minY + subjHeight * 0.85);

      // 4. Sample dominant background colors near boundaries
      let bgSumR = 0, bgSumG = 0, bgSumB = 0, bgCount = 0;
      for (let y = 0; y < h; y += 4) {
        for (let x of [0, 1, 2, w - 3, w - 2, w - 1]) {
          const idx = (y * w + x) * 4;
          if (pixels[idx + 3] < 20) {
            bgSumR += pixels[idx];
            bgSumG += pixels[idx + 1];
            bgSumB += pixels[idx + 2];
            bgCount++;
          }
        }
      }
      const avgBgR = bgCount > 0 ? bgSumR / bgCount : 255;
      const avgBgG = bgCount > 0 ? bgSumG / bgCount : 255;
      const avgBgB = bgCount > 0 ? bgSumB / bgCount : 255;

      // 5. Morphological edge fringe stripping and color de-contamination
      const copyPixels = new Uint8ClampedArray(pixels);

      for (let y = 1; y < h - 1; y++) {
        const isEarShoulderZone = y >= earZoneYStart && y <= shoulderZoneYEnd;
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

            // If in ear/neck/shoulder zone and has faint alpha or matches background haze:
            if (isEarShoulderZone) {
              const bgDist = Math.hypot(r - avgBgR, g - avgBgG, b - avgBgB);
              
              // If it's a translucent halo fringe (< 75 alpha or high background color match)
              if (a < 80 || (bgDist < haloThreshold && a < 180)) {
                pixels[idx + 3] = 0;
                alphas[row + x] = 0;
                continue;
              }

              // De-fringe: If it's skin or dark hair/garment with light halo bleed, clamp color to nearest solid neighbor
              if (maxNeighborA > 220) {
                // Find solid interior neighbor
                let bestNeighborIdx = -1;
                let maxA = 0;
                const offsets = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
                for (const off of offsets) {
                  const nPos = row + x + off;
                  if (nPos >= 0 && nPos < total && alphas[nPos] > maxA) {
                    maxA = alphas[nPos];
                    bestNeighborIdx = nPos * 4;
                  }
                }

                if (bestNeighborIdx !== -1 && maxA > 240) {
                  const inR = copyPixels[bestNeighborIdx];
                  const inG = copyPixels[bestNeighborIdx + 1];
                  const inB = copyPixels[bestNeighborIdx + 2];

                  // Replace halo fringe color with pristine interior color
                  pixels[idx] = Math.round(r * (1 - deFringeStrength) + inR * deFringeStrength);
                  pixels[idx + 1] = Math.round(g * (1 - deFringeStrength) + inG * deFringeStrength);
                  pixels[idx + 2] = Math.round(b * (1 - deFringeStrength) + inB * deFringeStrength);
                  pixels[idx + 3] = 255;
                }
              }
            } else {
              // General perimeter clean
              if (a < 35) {
                pixels[idx + 3] = 0;
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
 * Legacy Chair Removal Alias
 */
export const removeChairFromImage = cleanEdgeHalosAndDeFringe;


