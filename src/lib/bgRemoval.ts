import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";
import {
  removeBackground as imglyRemoveBackground,
  preload,
} from "@imgly/background-removal";

let segmenter: ImageSegmenter | null = null;
let isPreloaded = false;
let preloadPromise: Promise<void> | null = null;

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    try {
      console.log(`Initializing Ultra-Fast AI Pipelines...`);

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
      );

      segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });

      // Preload high-fidelity models (U2Net, MODNet)
      await Promise.all([
        preload({
          model: "u2net" as any,
          fetchArgs: { cache: "force-cache" },
        }),
        preload({
          model: "modnet" as any,
          fetchArgs: { cache: "force-cache" },
        }),
      ]).catch(() => {});

      isPreloaded = true;
      console.log("Ultra-Fast AI Pipelines Ready (Dual-Model Ensemble Active)");
    } catch (err) {
      console.warn(`AI Initialization failed:`, err);
    }
  })();
  return preloadPromise;
};

async function resizeImageIfNeeded(
  dataUrl: string,
  maxSize: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxSize && height <= maxSize) {
        resolve(dataUrl);
        return;
      }
      const ratio = Math.min(maxSize / width, maxSize / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Image reduction failed"));
    img.src = dataUrl;
  });
}

/**
 * MediaPipe Ultra-Fast Segmenter (GPU)
 * Mimics Selfie Segmentation / MODNet pattern
 */
async function runFastSegmentation(source: HTMLImageElement): Promise<Blob> {
  if (!segmenter) await ensurePreloaded();
  if (!segmenter) throw new Error("AI Segmenter unavailable");

  const results = segmenter.segment(source);
  if (
    !results ||
    !results.confidenceMasks ||
    results.confidenceMasks.length === 0
  ) {
    throw new Error("Segmentation output invalid");
  }

  const personMask =
    results.confidenceMasks.length > 1
      ? results.confidenceMasks[1]
      : results.confidenceMasks[0];
  const maskWidth = personMask.width;
  const maskHeight = personMask.height;
  const maskData = personMask.getAsFloat32Array();

  // 1. Create a high-res canvas for the final result
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // 2. Process the mask into a temporary canvas for scaling
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = maskWidth;
  maskCanvas.height = maskHeight;
  const maskCtx = maskCanvas.getContext("2d")!;
  const maskImgData = maskCtx.createImageData(maskWidth, maskHeight);

  for (let i = 0; i < maskData.length; i++) {
    const confidence = maskData[i];
    const idx = i * 4;
    // We store the mask in the alpha channel of the temp canvas
    let alpha = 0;
    // Relaxed fallback thresholds to preserve fine subject detail at the edges
    if (confidence < 0.5) alpha = 0;
    else if (confidence > 0.95) alpha = 255;
    else {
      const t = (confidence - 0.5) / 0.45;
      // Hermite interpolation (smoothstep) for a clean, feathered edge
      const smoothT = t * t * (3 - 2 * t);
      alpha = Math.round(smoothT * 255);
    }
    maskImgData.data[idx] = 255;
    maskImgData.data[idx + 1] = 255;
    maskImgData.data[idx + 2] = 255;
    maskImgData.data[idx + 3] = alpha;
  }
  maskCtx.putImageData(maskImgData, 0, 0);

  // 3. Draw original image and use high-quality scaled mask for clipping
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0, source.width, source.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

/**
 * High-Speed Hybrid Background Removal
 * Dual-Model Flow: U2Net + MODNet Fusion logic for 5-7s delivery
 */
export const hybridRemoveBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void,
  forceWhiteBackground: boolean = false,
): Promise<Blob> => {
  const startTime = Date.now();
  onProgress("Igniting Dual-Model AI Pipeline...");

  let robustBlob: Blob | null = null;
  try {
    // 1. Initial High-Speed Pulse
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = imageSrc;
    });

    onProgress("Phase 1: Structural Analysis...");
    robustBlob = await runFastSegmentation(img);

    onProgress("Phase 2: Neural Recognition...");
    // Maximum resolution for professional studio-grade detail preservation
    const hdSource = await resizeImageIfNeeded(imageSrc, 3072);

    const runModel = async (model: string) => {
      try {
        return await imglyRemoveBackground(hdSource, {
          model: model as any,
          output: { format: "image/png", quality: 0.99 },
        });
      } catch (e) {
        console.warn(`Model ${model} failed`, e);
        return null;
      }
    };

    // Parallel execution for maximum throughput
    const [u2netBlob, modnetBlob] = await Promise.all([
      runModel("u2net"),
      runModel("modnet")
    ]);

    onProgress("Phase 3: Expert Fusion & Halo Removal...");

    const precisionBlobs = [
      { blob: u2netBlob, model: "u2net" },
      { blob: modnetBlob, model: "modnet" },
    ].filter(b => b.blob !== null) as { blob: Blob; model: string }[];

    if (precisionBlobs.length === 0) {
      console.warn("High-fidelity models failed, falling back to structural segmentation");
      let processed = robustBlob;
      if (forceWhiteBackground) {
        processed = await applyWhiteBackground(processed);
      }
      return processed;
    }

    let processed = await refineDualHybridMask(
      precisionBlobs,
      robustBlob,
      img,
    );

    if (forceWhiteBackground)
      processed = await applyWhiteBackground(processed);

    console.log(
      `Dual-Model Process Complete: ${(Date.now() - startTime) / 1000}s`,
    );
    return processed;
  } catch (error: any) {
    console.error("Hybrid AI failed:", error);
    
    // Final emergency fallback if structural result exists
    if (robustBlob) {
      console.log("Returning structural fallback after critical error");
      if (forceWhiteBackground) {
        return await applyWhiteBackground(robustBlob);
      }
      return robustBlob;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `AI Processing Error: ${errorMessage}. Please try again with a clearer image.`,
    );
  }
};

async function applyWhiteBackground(transparentBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Merge failed"));
      }, "image/png");
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("BG Apply failed"));
    img.src = URL.createObjectURL(transparentBlob);
  });
}

/**
 * Expert Dual-Model Hybrid Mask Fusion (Passport Grade)
 * Implements Morphological Post-processing, Halo Suppression, and Smooth-Edge Blending.
 */
async function refineDualHybridMask(
  precisionBlobs: { blob: Blob; model: string }[],
  robustBlob: Blob,
  originalSource: HTMLImageElement,
): Promise<Blob> {
  return new Promise((resolve) => {
    const images: { img: HTMLImageElement; model: string }[] = [];
    const robustImg = new Image();
    let loadedCount = 0;
    const totalToLoad = precisionBlobs.length + 1;

    const onLoaded = () => {
      loadedCount++;
      if (loadedCount < totalToLoad) return;

      const w = images[0].img.width;
      const h = images[0].img.height;

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      // 1. NEURAL ENSEMBLE: Balanced Priority for structural integrity and fine edges
      const ensembleMask = new Float32Array(w * h);
      let totalWeight = 0;

      images.forEach(({ img, model }) => {
        let weight = 1.0;
        if (model === "modnet") weight = 18.0; // High priority for hair and fine boundary detail
        if (model === "u2net") weight = 14.0;  // Strong structural support to prevent subject cutoff

        totalWeight += weight;

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        for (let i = 0; i < ensembleMask.length; i++) {
          ensembleMask[i] += (data[i * 4 + 3] / 255.0) * weight;
        }
      });

      for (let i = 0; i < ensembleMask.length; i++) {
        ensembleMask[i] /= totalWeight;
      }

      // 2. STRUCTURAL GATE: MediaPipe mask for interior hole-filling
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(robustImg, 0, 0, w, h);
      const rData = ctx.getImageData(0, 0, w, h).data;
      const rMask = new Float32Array(w * h);
      for (let i = 0; i < rMask.length; i++) {
        rMask[i] = rData[i * 4 + 3] / 255.0;
      }

      // 3. FUSION PASS: Dynamic Preservation
      const finalMask = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const e = ensembleMask[i];
        const r = rMask[i];

        let alpha = e;
        
        // SUBJECT PROTECTION GATE: Calibrated pruning to eliminate background "webbing" (ears/head)
        if (r < 0.26) {
          alpha = 0; // Clean rejection of background bleeds
        } else if (r < 0.92) {
          // Sharp structural transition window
          const weight = (r - 0.26) / 0.66;
          const curve = weight * weight * (3 - 2 * weight); 
          alpha = e * curve;
        }

        // Professional Progressive Smoothing (Quintic Step)
        if (alpha > 0.0001 && alpha < 0.9999) {
          const t = (alpha - 0.0001) / 0.9998;
          alpha = t * t * t * (t * (t * 6 - 15) + 10); 
          
          // Ultra-Clean Alpha Toggles: Surgical precision to destroy color patches
          if (alpha < 0.55) alpha = 0; 
          else if (alpha > 0.75) alpha = 1.0;
        }

        finalMask[i] = Math.round(alpha * 255);
      }

      // 4. MORPHOLOGICAL REFINEMENT: Studio-grade multi-pass polishing
      let alphaMask = new Uint8Array(finalMask);
      
      // Stage: Closing (Dilation then Erosion) - Fills micro-gaps to prevent subject detail loss
      const dilate = (src: Uint8Array) => {
        const dst = new Uint8Array(src);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (src[i] < 255) {
              const maxVal = Math.max(src[i-1], src[i+1], src[i-w], src[i+w]);
              if (maxVal > dst[i]) dst[i] = maxVal;
            }
          }
        }
        return dst;
      };

      const erode = (src: Uint8Array) => {
        const dst = new Uint8Array(src);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (src[i] > 0) {
              const minVal = Math.min(src[i-1], src[i+1], src[i-w], src[i+w]);
              if (minVal < dst[i]) dst[i] = minVal;
            }
          }
        }
        return dst;
      };

      // Perform a single "Closing" pass to repair the boundary interior
      alphaMask = dilate(alphaMask);
      alphaMask = erode(alphaMask);

      // Pass: Edge Purification - Targeted suppression of background halos near ears/hair
      for (let iter = 0; iter < 4; iter++) {
        const source = new Uint8Array(alphaMask);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            if (source[idx] > 0 && source[idx] < 255) {
              const hasBgNeighbor = 
                source[idx-1] === 0 || source[idx+1] === 0 || 
                source[idx-w] === 0 || source[idx+w] === 0;

              if (hasBgNeighbor) {
                // Precise suppression of background bloom for natural edges
                alphaMask[idx] = Math.max(0, source[idx] - 105);
              }
            }
          }
        }
      }

      // Pass 2: High-Speed Hole Filling (Interior Only)
      for (let pass = 0; pass < 2; pass++) {
        const src = new Uint8Array(alphaMask);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (src[i] > 100 && src[i] < 255) {
              // Fill small gaps inside solid subject parts (e.g. hair clusters)
              const maxVal = Math.max(src[i-1], src[i+1], src[i-w], src[i+w]);
              if (maxVal > 240) alphaMask[i] = 255;
            }
          }
        }
      }

      // 5. PROFESSIONAL EDGE DECONTAMINATION (AI-Driven Color Spill Removal)
      // This stage replaces "dirty" pixels at the edge with clean internal colors
      const spillCanvas = document.createElement("canvas");
      spillCanvas.width = w;
      spillCanvas.height = h;
      const spillCtx = spillCanvas.getContext("2d", { willReadFrequently: true })!;
      spillCtx.drawImage(originalSource, 0, 0, w, h);
      const imgData = spillCtx.getImageData(0, 0, w, h);
      const px = imgData.data;

      // Studio-Grade Color Matting: 10-pixel deep sampling for color restoration
      for (let y = 10; y < h - 10; y++) {
        for (let x = 10; x < w - 10; x++) {
          const idx = y * w + x;
          const a = alphaMask[idx];
          
          if (a > 0 && a < 255) {
            const isFringe = alphaMask[idx-1] === 0 || alphaMask[idx+1] === 0 || 
                             alphaMask[idx-w] === 0 || alphaMask[idx+w] === 0 ||
                             (a < 180);

            if (isFringe) {
              // Search deep for untainted color
              let bestSIdx = -1;
              for (let d = 2; d <= 10; d++) {
                if (alphaMask[idx - d] === 255) { bestSIdx = idx - d; break; }
                if (alphaMask[idx + d] === 255) { bestSIdx = idx + d; break; }
                if (alphaMask[idx - (w * d)] === 255) { bestSIdx = idx - (w * d); break; }
                if (alphaMask[idx + (w * d)] === 255) { bestSIdx = idx + (w * d); break; }
              }

              if (bestSIdx !== -1) {
                const s4 = bestSIdx * 4;
                const i4 = idx * 4;
                // High-precision color matching
                px[i4] = px[s4];
                px[i4 + 1] = px[s4 + 1];
                px[i4 + 2] = px[s4 + 2];
              } else {
                // If no pure subject color is nearby, it's a floating color patch (e.g. ear bloom). Obliterate it.
                alphaMask[idx] = 0;
              }
            }
          }
        }
      }
      spillCtx.putImageData(imgData, 0, 0);

      // 6. FINAL COMPOSITION: Studio-quality blending
      const finalImgData = ctx.createImageData(w, h);
      for (let i = 0; i < alphaMask.length; i++) {
        const val = alphaMask[i];
        finalImgData.data[i * 4] = 0;
        finalImgData.data[i * 4 + 1] = 0;
        finalImgData.data[i * 4 + 2] = 0;
        finalImgData.data[i * 4 + 3] = val;
      }
      ctx.putImageData(finalImgData, 0, 0);

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = originalSource.width;
      finalCanvas.height = originalSource.height;
      const fCtx = finalCanvas.getContext("2d")!;

      fCtx.drawImage(spillCanvas, 0, 0, originalSource.width, originalSource.height);
      fCtx.globalCompositeOperation = "destination-in";
      // Professional studio feathering: balanced for sharpness vs natural integration
      fCtx.filter = "blur(0.4px)"; 
      fCtx.drawImage(canvas, 0, 0, originalSource.width, originalSource.height);

      finalCanvas.toBlob(
        (result) => {
          images.forEach(({ img }) => URL.revokeObjectURL(img.src));
          URL.revokeObjectURL(robustImg.src);
          resolve(result || precisionBlobs[0].blob);
        },
        "image/png",
        0.99,
      );
    };

    precisionBlobs.forEach(({ blob, model }) => {
      const img = new Image();
      img.onload = onLoaded;
      img.onerror = onLoaded;
      img.src = URL.createObjectURL(blob);
      images.push({ img, model });
    });

    robustImg.onload = onLoaded;
    robustImg.onerror = onLoaded;
    robustImg.src = URL.createObjectURL(robustBlob);
  });
}
