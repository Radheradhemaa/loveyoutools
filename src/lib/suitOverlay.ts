import menBlackSuitUrl from '../assets/images/men_black_suit_1795071489494.jpg';
import menNavySuitUrl from '../assets/images/men_navy_suit_1795071489616.jpg';
import menCharcoalSuitUrl from '../assets/images/men_charcoal_suit_1795071489917.jpg';
import womenBlackBlazerUrl from '../assets/images/women_black_blazer_1795071490656.jpg';
import womenNavyBlazerUrl from '../assets/images/women_navy_blazer_1795071489881.jpg';

export type SuitCategory = 'all' | 'men' | 'women';

export interface SuitItem {
  id: string;
  name: string;
  subtitle: string;
  category: 'men' | 'women';
  src: string;
  isChromaKey: boolean;
}

export interface SuitTransform {
  x: number; // Horizontal center offset (% of photo width, -45..45)
  y: number; // Collar anchor Y position (% of photo height, 25..110)
  scale: number; // Uniform scale relative to photo width (0.45..1.85)
  scaleX: number; // Shoulder width multiplier (0.70..1.45)
  scaleY: number; // Torso height multiplier (0.70..1.50)
  rotation: number; // Tilt in degrees (-25..25)
  flipX: boolean; // Mirror horizontally
  brightness: number; // 60..140
  contrast: number; // 60..140
  saturation: number; // 50..150
  hideOldClothes: boolean; // Mask protruding original shoulders below collar line (when BG removed)
  neckCutOffset: number; // Fine-tune collar cleanup height (-15..15 % of photo height)
}

export const DEFAULT_SUIT_TRANSFORM: SuitTransform = {
  x: 0,
  y: 66,
  scale: 1.08,
  scaleX: 1.0,
  scaleY: 1.0,
  rotation: 0,
  flipX: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hideOldClothes: true,
  neckCutOffset: 0,
};

export const SUIT_CATALOG: SuitItem[] = [
  {
    id: 'men-black',
    name: 'Classic Black',
    subtitle: 'Burgundy Tie',
    category: 'men',
    src: menBlackSuitUrl,
    isChromaKey: true,
  },
  {
    id: 'men-navy',
    name: 'Navy Business',
    subtitle: 'Navy Tie',
    category: 'men',
    src: menNavySuitUrl,
    isChromaKey: true,
  },
  {
    id: 'men-charcoal',
    name: 'Charcoal Grey',
    subtitle: 'Black Tie',
    category: 'men',
    src: menCharcoalSuitUrl,
    isChromaKey: true,
  },
  {
    id: 'women-black',
    name: 'Black Blazer',
    subtitle: 'White Blouse',
    category: 'women',
    src: womenBlackBlazerUrl,
    isChromaKey: true,
  },
  {
    id: 'women-navy',
    name: 'Navy Blazer',
    subtitle: 'White Blouse',
    category: 'women',
    src: womenNavyBlazerUrl,
    isChromaKey: true,
  },
];

export interface ProcessedSuit {
  id: string;
  width: number;
  height: number;
  frontCanvas: HTMLCanvasElement;
  backCanvas: HTMLCanvasElement | null;
  thumbDataUrl: string;
  collarAnchorNormY: number; // Normalized Y (0..1) inside cropped suit where neck meets front collar/V
  neckWidthNorm: number; // Normalized width (0..1) of collar opening relative to suit width
}

export interface SuitFrameBox {
  cx: number; // Center X of suit box in frame px
  cy: number; // Center Y of suit box in frame px
  anchorX: number; // Collar pivot X in frame px
  anchorY: number; // Collar pivot Y in frame px
  width: number; // Drawn width in frame px
  height: number; // Drawn height in frame px
  rotation: number; // Degrees
}

const processedSuitCache = new Map<string, ProcessedSuit>();
const pendingSuitLoads = new Map<string, Promise<ProcessedSuit>>();

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function hasGreenCorners(data: Uint8ClampedArray, w: number, h: number): boolean {
  const sampleCoords = [
    [2, 2],
    [w - 3, 2],
    [Math.floor(w * 0.5), 2],
    [2, Math.floor(h * 0.15)],
    [w - 3, Math.floor(h * 0.15)],
  ];
  let greenHits = 0;
  for (const [sx, sy] of sampleCoords) {
    const x = Math.max(0, Math.min(w - 1, sx));
    const y = Math.max(0, Math.min(h - 1, sy));
    const idx = (y * w + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    if (a > 200 && g > 140 && g - Math.max(r, b) > 55) {
      greenHits++;
    }
  }
  return greenHits >= 3;
}

/**
 * Chroma-keys pure green studio suit templates with sub-pixel color unmixing + green despill,
 * splits any upper back-collar arch into a separate rear layer so the user's neck is never covered,
 * and crops tightly to the suit bounding box for exact alignment.
 */
export async function loadProcessedSuit(
  id: string,
  src: string,
  forceChromaKey?: boolean
): Promise<ProcessedSuit> {
  const cacheKey = `${id}::${src}`;
  const cached = processedSuitCache.get(cacheKey);
  if (cached) return cached;

  const existing = pendingSuitLoads.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const img = await loadImageElement(src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = w;
    rawCanvas.height = h;
    const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
    if (!rawCtx) {
      throw new Error('Could not initialize 2D canvas context for suit');
    }
    rawCtx.drawImage(img, 0, 0, w, h);

    const imgData = rawCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const shouldKey = forceChromaKey ?? hasGreenCorners(data, w, h);

    if (shouldKey) {
      const lo = 16;
      const hi = 92;
      const range = hi - lo;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const maxRB = r > b ? r : b;
        const greenExcess = g - maxRB;

        if (greenExcess >= hi) {
          data[i + 3] = 0;
        } else if (greenExcess > lo) {
          const t = (greenExcess - lo) / range;
          // Smoothstep for crisp anti-aliased edge
          const smoothT = t * t * (3 - 2 * t);
          const alphaF = 1 - smoothT;
          const alphaByte = Math.round(alphaF * 255);
          data[i + 3] = alphaByte;

          // Unmix foreground color from #00FF00 background so white collars & black lapels have zero green halo
          if (alphaF > 0.08) {
            const invA = 1 / alphaF;
            const ur = clampByte(r * invA);
            const ub = clampByte(b * invA);
            const rawUg = (g - (1 - alphaF) * 255) * invA;
            const capG = Math.max(ur, ub);
            const ug = clampByte(Math.min(rawUg, capG));
            data[i] = ur;
            data[i + 1] = ug;
            data[i + 2] = ub;
          }
        } else if (greenExcess > 3) {
          // Gentle green despill on interior rim pixels
          const neutralTarget = Math.min(g, maxRB + 2);
          data[i + 1] = Math.round(g * 0.25 + neutralTarget * 0.75);
        }
      }

      // Single pass micro-despill on 1px outer border adjacent to transparency
      const alphaCopy = new Uint8Array(w * h);
      for (let p = 0; p < w * h; p++) alphaCopy[p] = data[p * 4 + 3];

      for (let y = 1; y < h - 1; y++) {
        const rowOff = y * w;
        for (let x = 1; x < w - 1; x++) {
          const idx = rowOff + x;
          const a = alphaCopy[idx];
          if (a === 0) continue;
          const nearTrans =
            alphaCopy[idx - 1] < 220 ||
            alphaCopy[idx + 1] < 220 ||
            alphaCopy[idx - w] < 220 ||
            alphaCopy[idx + w] < 220;
          if (nearTrans) {
            const o = idx * 4;
            const r = data[o];
            const g = data[o + 1];
            const b = data[o + 2];
            const maxRB = r > b ? r : b;
            if (g > maxRB) {
              data[o + 1] = maxRB;
            }
          }
        }
      }

      rawCtx.putImageData(imgData, 0, 0);
    }

    // Compute tight bounding box of non-transparent suit pixels
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    for (let y = 0; y < h; y++) {
      const rowOff = y * w;
      for (let x = 0; x < w; x++) {
        if (data[(rowOff + x) * 4 + 3] > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      minX = 0;
      minY = 0;
      maxX = w - 1;
      maxY = h - 1;
    }

    const pad = 2;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;

    const frontCanvas = document.createElement('canvas');
    frontCanvas.width = cropW;
    frontCanvas.height = cropH;
    const frontCtx = frontCanvas.getContext('2d', { willReadFrequently: true });
    if (!frontCtx) throw new Error('Failed to create front suit canvas');
    frontCtx.drawImage(rawCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    // Split upper back-collar arch into backCanvas (if present) and find collar anchor
    const frontData = frontCtx.getImageData(0, 0, cropW, cropH);
    const fBytes = frontData.data;

    let backCanvas: HTMLCanvasElement | null = null;
    let neckHoleLeft = Math.round(cropW * 0.37);
    let neckHoleRight = Math.round(cropW * 0.63);
    let collarAnchorY = Math.round(cropH * 0.14);

    // Detect hollow neck opening in central upper band (x in 30%..70%, y in 0%..45%)
    const scanStartX = Math.round(cropW * 0.30);
    const scanEndX = Math.round(cropW * 0.70);
    const scanMaxY = Math.round(cropH * 0.48);

    const holeTopByCol = new Int32Array(cropW).fill(-1);
    const holeBotByCol = new Int32Array(cropW).fill(-1);
    let backBandPixels = 0;

    for (let x = scanStartX; x <= scanEndX; x++) {
      // Find first opaque band (potential back collar) then transparent hole then front chest/tie below it
      let y = 0;
      while (y < scanMaxY && fBytes[(y * cropW + x) * 4 + 3] < 40) y++;
      const firstOpaqueTop = y;

      while (y < scanMaxY && fBytes[(y * cropW + x) * 4 + 3] >= 40) y++;
      const firstOpaqueBot = y;

      // Check if there is a hollow opening below this top band
      const bandThickness = firstOpaqueBot - firstOpaqueTop;
      if (firstOpaqueTop < Math.round(cropH * 0.12) && bandThickness > 3 && bandThickness < Math.round(cropH * 0.14)) {
        const holeTop = firstOpaqueBot;
        while (y < scanMaxY && fBytes[(y * cropW + x) * 4 + 3] < 40) y++;
        const holeBot = y;
        if (holeBot - holeTop >= 8 && holeBot < scanMaxY) {
          holeTopByCol[x] = holeTop;
          holeBotByCol[x] = holeBot;
          backBandPixels += bandThickness;
        }
      }
    }

    if (backBandPixels > 60) {
      // We have a closed back-collar arch -> move those pixels into backCanvas so the user's neck stays in front!
      let minHoleX = cropW;
      let maxHoleX = 0;
      let deepestBotY = 0;
      for (let x = scanStartX; x <= scanEndX; x++) {
        if (holeTopByCol[x] !== -1) {
          if (x < minHoleX) minHoleX = x;
          if (x > maxHoleX) maxHoleX = x;
          if (holeBotByCol[x] > deepestBotY) deepestBotY = holeBotByCol[x];
        }
      }

      if (maxHoleX > minHoleX + 10) {
        neckHoleLeft = minHoleX;
        neckHoleRight = maxHoleX;
        // Anchor right at the mid-lower collar opening where the user's neck enters the shirt collar
        const centerX = Math.round((minHoleX + maxHoleX) / 2);
        const centerBot = holeBotByCol[centerX] !== -1 ? holeBotByCol[centerX] : deepestBotY;
        const centerTop = holeTopByCol[centerX] !== -1 ? holeTopByCol[centerX] : Math.round(cropH * 0.05);
        collarAnchorY = Math.round(centerTop * 0.25 + centerBot * 0.75);

        backCanvas = document.createElement('canvas');
        backCanvas.width = cropW;
        backCanvas.height = cropH;
        const backCtx = backCanvas.getContext('2d');
        if (backCtx) {
          const backImg = backCtx.createImageData(cropW, cropH);
          const bBytes = backImg.data;
          const featherCols = 5;

          for (let x = minHoleX; x <= maxHoleX; x++) {
            const cutY = holeTopByCol[x];
            if (cutY === -1) continue;
            const distEdge = Math.min(x - minHoleX, maxHoleX - x);
            const backWeight = distEdge < featherCols ? distEdge / featherCols : 1;

            for (let y = 0; y <= cutY + 1; y++) {
              const o = (y * cropW + x) * 4;
              const a = fBytes[o + 3];
              if (a === 0) continue;

              // Copy to rear collar layer
              bBytes[o] = fBytes[o];
              bBytes[o + 1] = fBytes[o + 1];
              bBytes[o + 2] = fBytes[o + 2];
              bBytes[o + 3] = Math.round(a * backWeight);

              // Remove from front layer so it never overlaps the user's throat/chin
              fBytes[o + 3] = Math.round(a * (1 - backWeight));
            }
          }

          backCtx.putImageData(backImg, 0, 0);
          frontCtx.putImageData(frontData, 0, 0);
        }
      }
    } else {
      // Open-top neckline (e.g. Women's Navy Blazer): find V-notch bottom at center
      const midX = Math.round(cropW * 0.5);
      let y = 0;
      while (y < scanMaxY && fBytes[(y * cropW + midX) * 4 + 3] < 40) y++;
      collarAnchorY = Math.max(Math.round(cropH * 0.08), Math.min(Math.round(cropH * 0.30), Math.round(y * 0.65)));

      // Measure opening width around y = 0.08 * cropH
      const probeY = Math.round(cropH * 0.08);
      let l = midX;
      while (l > Math.round(cropW * 0.25) && fBytes[(probeY * cropW + l) * 4 + 3] < 40) l--;
      let r = midX;
      while (r < Math.round(cropW * 0.75) && fBytes[(probeY * cropW + r) * 4 + 3] < 40) r++;
      if (r - l > 16) {
        neckHoleLeft = l;
        neckHoleRight = r;
      }
    }

    // Build crisp transparent thumbnail for gallery preview (combines back + front)
    const thumbSize = 180;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbSize;
    thumbCanvas.height = thumbSize;
    const thumbCtx = thumbCanvas.getContext('2d');
    if (thumbCtx) {
      const scale = Math.min((thumbSize - 16) / cropW, (thumbSize - 16) / cropH);
      const dw = cropW * scale;
      const dh = cropH * scale;
      const dx = (thumbSize - dw) / 2;
      const dy = (thumbSize - dh) / 2;
      thumbCtx.imageSmoothingEnabled = true;
      thumbCtx.imageSmoothingQuality = 'high';
      if (backCanvas) thumbCtx.drawImage(backCanvas, dx, dy, dw, dh);
      thumbCtx.drawImage(frontCanvas, dx, dy, dw, dh);
    }

    const processed: ProcessedSuit = {
      id,
      width: cropW,
      height: cropH,
      frontCanvas,
      backCanvas,
      thumbDataUrl: thumbCanvas.toDataURL('image/png'),
      collarAnchorNormY: Math.max(0.05, Math.min(0.35, collarAnchorY / cropH)),
      neckWidthNorm: Math.max(0.16, Math.min(0.40, (neckHoleRight - neckHoleLeft) / cropW)),
    };

    processedSuitCache.set(cacheKey, processed);
    return processed;
  })();

  pendingSuitLoads.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingSuitLoads.delete(cacheKey);
  }
}

export function getSuitFrameBox(
  frameW: number,
  frameH: number,
  suit: ProcessedSuit,
  transform: SuitTransform
): SuitFrameBox {
  const aspect = suit.height / Math.max(1, suit.width);
  const baseW = frameW * transform.scale;
  const baseH = baseW * aspect;
  const width = baseW * transform.scaleX;
  const height = baseH * transform.scaleY;

  const anchorX = frameW * 0.5 + (transform.x / 100) * frameW;
  const anchorY = (transform.y / 100) * frameH;

  // Offset from collar anchor to geometric center of suit box (rotated around collar anchor)
  const localOffsetY = (0.5 - suit.collarAnchorNormY) * height;
  const rad = (transform.rotation * Math.PI) / 180;
  const cx = anchorX - Math.sin(rad) * localOffsetY;
  const cy = anchorY + Math.cos(rad) * localOffsetY;

  return {
    cx,
    cy,
    anchorX,
    anchorY,
    width,
    height,
    rotation: transform.rotation,
  };
}

/**
 * Estimates optimal suit position & shoulder scale from the subject's alpha silhouette
 * (if background was removed) or falls back to standard biometric passport framing.
 */
export function detectAutoSuitPlacement(
  subjectCanvas: HTMLCanvasElement | null,
  suit: ProcessedSuit
): Partial<SuitTransform> {
  if (!subjectCanvas) {
    return { x: 0, y: 66, scale: 1.08, scaleX: 1.0, scaleY: 1.0, rotation: 0 };
  }

  const sw = subjectCanvas.width;
  const sh = subjectCanvas.height;
  if (sw < 20 || sh < 20) {
    return { x: 0, y: 66, scale: 1.08, scaleX: 1.0, scaleY: 1.0, rotation: 0 };
  }

  // Downsample to ~160px tall for fast silhouette analysis
  const sampleH = 160;
  const sampleW = Math.max(40, Math.round((sw / sh) * sampleH));
  const probe = document.createElement('canvas');
  probe.width = sampleW;
  probe.height = sampleH;
  const pCtx = probe.getContext('2d', { willReadFrequently: true });
  if (!pCtx) return { x: 0, y: 66, scale: 1.08, scaleX: 1.0, scaleY: 1.0, rotation: 0 };
  pCtx.drawImage(subjectCanvas, 0, 0, sampleW, sampleH);
  const bytes = pCtx.getImageData(0, 0, sampleW, sampleH).data;

  // Verify subject actually has transparent background
  let transparentBorder = 0;
  let totalBorder = 0;
  for (let x = 0; x < sampleW; x++) {
    totalBorder++;
    if (bytes[x * 4 + 3] < 40) transparentBorder++;
  }
  for (let y = 0; y < Math.floor(sampleH * 0.5); y++) {
    totalBorder += 2;
    if (bytes[(y * sampleW) * 4 + 3] < 40) transparentBorder++;
    if (bytes[(y * sampleW + (sampleW - 1)) * 4 + 3] < 40) transparentBorder++;
  }
  if (transparentBorder / Math.max(1, totalBorder) < 0.25) {
    // Opaque photo without BG removal -> clean passport proportions
    return { x: 0, y: 66, scale: 1.08, scaleX: 1.0, scaleY: 1.0, rotation: 0 };
  }

  const rowLeft = new Int32Array(sampleH).fill(-1);
  const rowRight = new Int32Array(sampleH).fill(-1);
  const rowWidth = new Int32Array(sampleH).fill(0);

  let headTop = -1;
  for (let y = 0; y < sampleH; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < sampleW; x++) {
      if (bytes[(y * sampleW + x) * 4 + 3] > 90) {
        if (l === -1) l = x;
        r = x;
      }
    }
    if (l !== -1 && r - l > 4) {
      if (headTop === -1) headTop = y;
      rowLeft[y] = l;
      rowRight[y] = r;
      rowWidth[y] = r - l + 1;
    }
  }

  if (headTop === -1 || headTop > sampleH * 0.5) {
    return { x: 0, y: 66, scale: 1.08, scaleX: 1.0, scaleY: 1.0, rotation: 0 };
  }

  // Find widest head row between headTop + 10% and headTop + 45%
  const headSearchStart = Math.min(sampleH - 1, headTop + Math.round(sampleH * 0.08));
  const headSearchEnd = Math.min(sampleH - 1, headTop + Math.round(sampleH * 0.42));
  let maxHeadW = 0;
  let headMidY = headSearchStart;
  for (let y = headSearchStart; y <= headSearchEnd; y++) {
    if (rowWidth[y] > maxHeadW) {
      maxHeadW = rowWidth[y];
      headMidY = y;
    }
  }

  // Find narrowest neck waist below headMidY and above 80% height
  const neckStart = Math.min(sampleH - 2, headMidY + Math.round(sampleH * 0.14));
  const neckEnd = Math.min(sampleH - 2, Math.max(neckStart + 6, Math.round(sampleH * 0.78)));
  let minNeckW = sampleW;
  let neckY = Math.round(sampleH * 0.64);
  for (let y = neckStart; y <= neckEnd; y++) {
    if (rowWidth[y] > 6 && rowWidth[y] < minNeckW) {
      minNeckW = rowWidth[y];
      neckY = y;
    }
  }

  const neckCenterX =
    rowLeft[neckY] !== -1
      ? (rowLeft[neckY] + rowRight[neckY]) / 2
      : sampleW / 2;

  // Measure shoulder span below neckY
  const shStart = Math.min(sampleH - 1, neckY + Math.round(sampleH * 0.08));
  const shEnd = Math.min(sampleH - 1, Math.round(sampleH * 0.94));
  let shoulderW = 0;
  for (let y = shStart; y <= shEnd; y++) {
    if (rowWidth[y] > shoulderW) shoulderW = rowWidth[y];
  }

  // Compute placement so collar sits slightly below neck waist and covers shoulders + bottom cleanly
  const offsetX = Math.max(-20, Math.min(20, ((neckCenterX - sampleW / 2) / sampleW) * 100));
  const targetCollarY = Math.max(46, Math.min(82, ((neckY + sampleH * 0.05) / sampleH) * 100));

  // Match suit width to cover detected shoulders cleanly (with ~8% tailoring margin)
  const shoulderRatio = shoulderW > maxHeadW * 1.1 ? shoulderW / sampleW : 0.92;
  const neckBasedScale = (minNeckW / sampleW) / Math.max(0.18, suit.neckWidthNorm) * 1.12;
  let idealScale = Math.max(shoulderRatio * 1.08, Math.min(1.25, neckBasedScale));

  // Ensure the suit reaches down to the bottom edge of the photo so there's no floating torso gap
  const suitAspect = suit.height / Math.max(1, suit.width);
  const photoAspect = sh / Math.max(1, sw);
  const remainingHeightNorm = (100 - targetCollarY) / 100 + 0.04;
  const minScaleForBottom =
    (remainingHeightNorm * photoAspect) / Math.max(0.4, (1 - suit.collarAnchorNormY) * suitAspect);
  idealScale = Math.max(0.82, Math.min(1.45, Math.max(idealScale, minScaleForBottom)));

  return {
    x: Math.round(offsetX * 10) / 10,
    y: Math.round(targetCollarY * 10) / 10,
    scale: Math.round(idealScale * 100) / 100,
    scaleX: 1.0,
    scaleY: 1.0,
    rotation: 0,
  };
}

function drawTransformedSuitLayer(
  ctx: CanvasRenderingContext2D,
  layerCanvas: HTMLCanvasElement,
  box: SuitFrameBox,
  suit: ProcessedSuit,
  transform: SuitTransform,
  addSoftCollarShadow: boolean
) {
  ctx.save();
  ctx.translate(box.anchorX, box.anchorY);
  if (transform.rotation !== 0) {
    ctx.rotate((transform.rotation * Math.PI) / 180);
  }
  if (transform.flipX) {
    ctx.scale(-1, 1);
  }

  const filters: string[] = [];
  if (transform.brightness !== 100) filters.push(`brightness(${transform.brightness}%)`);
  if (transform.contrast !== 100) filters.push(`contrast(${transform.contrast}%)`);
  if (transform.saturation !== 100) filters.push(`saturate(${transform.saturation}%)`);
  if (addSoftCollarShadow) {
    filters.push('drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.22))');
  }
  if (filters.length > 0) {
    ctx.filter = filters.join(' ');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const drawX = -box.width / 2;
  const drawY = -suit.collarAnchorNormY * box.height;
  ctx.drawImage(layerCanvas, drawX, drawY, box.width, box.height);
  ctx.restore();
}

let cachedSuitMaskScratch: HTMLCanvasElement | null = null;
let cachedHideClothesMask: HTMLCanvasElement | null = null;

function getReusableCanvas(existing: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
  const c = existing || document.createElement('canvas');
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

function drawMaskedSuitLayer(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  layerCanvas: HTMLCanvasElement,
  box: SuitFrameBox,
  suit: ProcessedSuit,
  transform: SuitTransform,
  addSoftCollarShadow: boolean,
  suitEraseMask?: HTMLCanvasElement | null
) {
  if (!suitEraseMask || suitEraseMask.width === 0 || suitEraseMask.height === 0) {
    drawTransformedSuitLayer(ctx, layerCanvas, box, suit, transform, addSoftCollarShadow);
    return;
  }

  cachedSuitMaskScratch = getReusableCanvas(cachedSuitMaskScratch, canvasW, canvasH);
  const sCtx = cachedSuitMaskScratch.getContext('2d');
  if (!sCtx) {
    drawTransformedSuitLayer(ctx, layerCanvas, box, suit, transform, addSoftCollarShadow);
    return;
  }

  sCtx.clearRect(0, 0, canvasW, canvasH);
  drawTransformedSuitLayer(sCtx, layerCanvas, box, suit, transform, addSoftCollarShadow);
  sCtx.save();
  sCtx.globalCompositeOperation = 'destination-out';
  sCtx.imageSmoothingEnabled = true;
  sCtx.imageSmoothingQuality = 'high';
  sCtx.drawImage(suitEraseMask, 0, 0, canvasW, canvasH);
  sCtx.restore();

  ctx.drawImage(cachedSuitMaskScratch, 0, 0);
}

/**
 * Renders the front or rear suit layer directly onto a target canvas at exact normalized coordinates,
 * applying optional manual touchup erase mask (used for live Suit-aware Manual Touchup overlay).
 */
export function renderSuitLayerToCanvas(
  targetCanvas: HTMLCanvasElement,
  suit: ProcessedSuit | null,
  transform: SuitTransform,
  layer: 'front' | 'back',
  suitEraseMask?: HTMLCanvasElement | null
) {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx || targetCanvas.width === 0 || targetCanvas.height === 0) return;
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  if (!suit) return;

  const srcLayer = layer === 'back' ? suit.backCanvas : suit.frontCanvas;
  if (!srcLayer) return;

  const box = getSuitFrameBox(targetCanvas.width, targetCanvas.height, suit, transform);
  drawMaskedSuitLayer(
    ctx,
    targetCanvas.width,
    targetCanvas.height,
    srcLayer,
    box,
    suit,
    transform,
    layer === 'front',
    suitEraseMask
  );
}

/**
 * Composites background-aware rear collar, subject (with optional clean old-shoulder masking),
 * and front photorealistic suit (with optional manual suit erase mask) onto the target canvas.
 */
export function compositeSubjectWithSuit(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  subjectCanvas: HTMLCanvasElement,
  suit: ProcessedSuit | null,
  transform: SuitTransform,
  hasCutoutSubject: boolean,
  suitEraseMask?: HTMLCanvasElement | null
) {
  if (!suit) {
    ctx.drawImage(subjectCanvas, 0, 0, canvasW, canvasH);
    return;
  }

  const box = getSuitFrameBox(canvasW, canvasH, suit, transform);

  // 1. Rear collar band goes BEHIND the user's neck when background is removed
  if (hasCutoutSubject && suit.backCanvas) {
    drawMaskedSuitLayer(ctx, canvasW, canvasH, suit.backCanvas, box, suit, transform, false, suitEraseMask);
  }

  // 2. Subject layer (optionally mask out protruding wide original shoulders below collar line)
  if (hasCutoutSubject && transform.hideOldClothes) {
    const maskedSubject = document.createElement('canvas');
    maskedSubject.width = canvasW;
    maskedSubject.height = canvasH;
    const mCtx = maskedSubject.getContext('2d');
    if (mCtx) {
      mCtx.drawImage(subjectCanvas, 0, 0, canvasW, canvasH);

      // Build shoulder erase region on a dedicated mask so any area where the user
      // manually erased the suit (e.g. long hair, beard, scarf over lapels) preserves the subject
      cachedHideClothesMask = getReusableCanvas(cachedHideClothesMask, canvasW, canvasH);
      const cutCtx = cachedHideClothesMask.getContext('2d');
      if (cutCtx) {
        cutCtx.clearRect(0, 0, canvasW, canvasH);
        cutCtx.save();
        cutCtx.fillStyle = '#000000';
        cutCtx.translate(box.anchorX, box.anchorY);
        if (transform.rotation !== 0) {
          cutCtx.rotate((transform.rotation * Math.PI) / 180);
        }

        const cutOffsetY = (transform.neckCutOffset / 100) * canvasH;
        const neckHalfW = Math.max(box.width * suit.neckWidthNorm * 0.62, canvasW * 0.14);
        const slopeDrop = box.height * 0.11;
        const deepBottom = Math.max(canvasH * 1.6, box.height * 1.6);
        const farSide = Math.max(canvasW * 1.6, box.width * 1.6);

        // Left shoulder exterior erase region (smooth sloped collar-to-shoulder boundary)
        cutCtx.beginPath();
        cutCtx.moveTo(-neckHalfW, cutOffsetY + slopeDrop * 0.35);
        cutCtx.quadraticCurveTo(-neckHalfW * 1.45, cutOffsetY + slopeDrop * 0.75, -farSide, cutOffsetY + slopeDrop * 0.9);
        cutCtx.lineTo(-farSide, deepBottom);
        cutCtx.lineTo(-neckHalfW * 0.85, deepBottom);
        cutCtx.closePath();
        cutCtx.fill();

        // Right shoulder exterior erase region
        cutCtx.beginPath();
        cutCtx.moveTo(neckHalfW, cutOffsetY + slopeDrop * 0.35);
        cutCtx.quadraticCurveTo(neckHalfW * 1.45, cutOffsetY + slopeDrop * 0.75, farSide, cutOffsetY + slopeDrop * 0.9);
        cutCtx.lineTo(farSide, deepBottom);
        cutCtx.lineTo(neckHalfW * 0.85, deepBottom);
        cutCtx.closePath();
        cutCtx.fill();

        // Erase any old torso hanging below the bottom hem of the suit
        const suitBottomLocalY = (1 - suit.collarAnchorNormY) * box.height - 2;
        cutCtx.fillRect(-farSide, suitBottomLocalY, farSide * 2, deepBottom);
        cutCtx.restore();

        // Preserve subject pixels wherever the user explicitly erased the suit
        if (suitEraseMask && suitEraseMask.width > 0 && suitEraseMask.height > 0) {
          cutCtx.save();
          cutCtx.globalCompositeOperation = 'destination-out';
          cutCtx.imageSmoothingEnabled = true;
          cutCtx.imageSmoothingQuality = 'high';
          cutCtx.drawImage(suitEraseMask, 0, 0, canvasW, canvasH);
          cutCtx.restore();
        }

        mCtx.save();
        mCtx.globalCompositeOperation = 'destination-out';
        mCtx.drawImage(cachedHideClothesMask, 0, 0);
        mCtx.restore();
      }

      ctx.drawImage(maskedSubject, 0, 0);
    } else {
      ctx.drawImage(subjectCanvas, 0, 0, canvasW, canvasH);
    }
  } else {
    ctx.drawImage(subjectCanvas, 0, 0, canvasW, canvasH);
  }

  // 3. Front tailored suit + shirt collar + tie drawn cleanly over torso
  drawMaskedSuitLayer(ctx, canvasW, canvasH, suit.frontCanvas, box, suit, transform, true, suitEraseMask);
}
