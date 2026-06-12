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
let u2netPipeline: any = null;

// Check for WebGPU adapter to avoid lazy initialization failures
let hasWebGPU = false;
let checkWebGPUPromise: Promise<void> | null = null;

const isMobileDevice = () => {
  if (typeof window === "undefined") return false;
  // Enhanced mobile detection including touch capability and user agent
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
      console.log(
        "[AI] Mobile detected: Disabling GPU processing to prevent artifacts (vertical streaks, mask corruption).",
      );
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
 * Ensures the primary precision model (MODNet) is loaded.
 */
export const ensureIsnetLoaded = async () => {
  if (!isnetPipeline) {
    await ensureWebGPUChecked();
    const device = hasWebGPU ? "webgpu" : "wasm";
    try {
      isnetPipeline = await pipeline("image-segmentation", "Xenova/modnet", { device });
    } catch (e) {
      isnetPipeline = await pipeline("image-segmentation", "Xenova/modnet", { device: "wasm" });
    }
  }
};

export const ensureU2netLoaded = async () => {
  if (!u2netPipeline) {
    await ensureWebGPUChecked();
    const device = hasWebGPU ? "webgpu" : "wasm";
    try {
      // Trying alternative general background models if U2Net is unavailable
      u2netPipeline = await pipeline("image-segmentation", "Xenova/isnet_general_use", { device });
    } catch (e) {
      try {
        u2netPipeline = await pipeline("image-segmentation", "Xenova/isnet_general_use", { device: "wasm" });
      } catch(e) {
         console.warn("[AI] Secondary Background Model (ISNet) failed to load. Will rely on ModNet.", e);
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
    ensureU2netLoaded().catch(console.error)
  ]);
};
export const ensureModnetLoaded = async () => ensureIsnetLoaded();

/**
 * Robust downscaling and preprocessing.
 * Mobile-safe: preserves original aspect ratio with padding if needed.
 */
async function downscaleImageIfNeeded(
  imageSrc: string | File | Blob,
  maxDim = 1024,
): Promise<string> {
  const isMobile = isMobileDevice();
  const limit = isMobile ? Math.min(maxDim, 1024) : maxDim;

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

/**
 * Executes high-precision background removal using a hybrid ISNet + U2Net ensemble.
 */
export async function removeBackground(
  imageInput: string | File | Blob,
  onProgress: (p: string) => void = () => {},
  forceWhiteBackground = false,
  isManualMode = false,
): Promise<Blob> {
  const startTime = Date.now();
  onProgress("Initializing AI Core...");

  // Load models (ModNet AND U2Net for best combined quality instantly)
  await Promise.all([
    ensureIsnetLoaded().catch(console.error),
    ensureU2netLoaded().catch(console.error)
  ]);

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

  // Use 512 for instant mask generation speed (< 3s)
  const imageSrc = await downscaleImageIfNeeded(imageSrcForDownscale, 512);

  try {
    onProgress("Analyzing Foreground (Ensemble Pass)...");

    const imgEl = new Image();
    imgEl.crossOrigin = "anonymous";
    await new Promise((resolve) => {
      imgEl.onload = resolve;
      imgEl.src = imageSrc;
    });

    let [resModnet, resU2net] = await Promise.all([
      isnetPipeline ? isnetPipeline(imageSrc).catch((e: any) => {
        console.error("ModNet pass failed", e);
        return null;
      }) : Promise.resolve(null),
      u2netPipeline ? u2netPipeline(imageSrc).catch((e: any) => {
        console.error("U2Net pass failed", e);
        return null;
      }) : Promise.resolve(null)
    ]);

    if (!resModnet && hasWebGPU) {
      console.warn("[AI] WebGPU inference failed, forcing WASM fallback...");
      hasWebGPU = false; 
      isnetPipeline = null;
      await ensureIsnetLoaded().catch(console.error);
      resModnet = await isnetPipeline(imageSrc).catch((e: any) => {
        console.error("WASM ModNet pass failed", e);
        return null;
      });
    }

    if (!resModnet && !resU2net) {
      throw new Error("AI models failed to process the image.");
    }

    onProgress("Harmonizing Ensemble Masks (ModNet + U2Net)...");

    // Helper to extract mask data and normalize
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

    let maskData = getMask(resModnet) || getMask(resU2net);
    const u2Data = getMask(resU2net);

    // Apply Ensemble Strategy
    if (maskData) {
        const mw = maskData.width;
        const mh = maskData.height;
        const canUseU2 = u2Data && u2Data.data.length === mw * mh;

        const maxModVal = maskData.data.reduce((a: number,b: number) => a>b?a:b, 0);
        const modScale = maxModVal > 0 && maxModVal <= 1.2 ? 255 : 1;
        
        let maxU2Val = 0;
        if (canUseU2) {
           maxU2Val = u2Data.data.reduce((a: number,b: number) => a>b?a:b, 0);
        }
        const u2Scale = maxU2Val > 0 && maxU2Val <= 1.2 ? 255 : 1;

        for (let i = 0; i < mw * mh; i++) {
            let modVal = maskData.data[i] * modScale;
            let u2Val = canUseU2 ? u2Data.data[i] * u2Scale : modVal;
            
            // Base mask uses ModNet primarily but respects U2Net.
            // If both fail or differ wildly, taking max or sum/2 helps smooth it, but here we just average them.
            // Because U2Net doesn't drop chairs as well, we slightly favor Modnet for object elimination.
            let finalVal = 0;
            if (modVal > 220 && u2Val > 220) {
                finalVal = Math.max(modVal, u2Val);
            } else if (modVal < 80 || u2Val < 80) {
                // If one model heavily doubts it, we lean towards the skeptical one to kill chairs.
                finalVal = Math.min(modVal, u2Val);
            } else {
                finalVal = (modVal * 0.6) + (u2Val * 0.4);
            }

            // Write back (normalized 0-255 scale)
            maskData.data[i] = finalVal;
        }
    }

    // Load Full Original Image to get maximum quality output
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

    // --- High-Precision CPU-Grade Compositing Pipeline ---
    // Bypasses browser Canvas rendering engines to guarantee 0 GPU artifacts
    const processMaskAndCompositeCPU = (mask: any) => {
      if (!mask) return;
      const mw = mask.width;
      const mh = mask.height;
      const mData = mask.data;
      const w = canvas.width;
      const h = canvas.height;

      let maxFound = 0;
      const skip = Math.max(1, Math.floor(mData.length / 5000));
      for (let i = 0; i < mData.length; i += skip) {
        if (mData[i] > maxFound) maxFound = mData[i];
      }
      const maskScale = maxFound > 0 && maxFound <= 1.2 ? 255 : 1;

      // 1. Skip Morphological processing completely for ultra-fast Delivery
      // The ensemble math has already harshly solved the chair problem!
      const cleanMask = new Float32Array(mw * mh);
      for (let i = 0; i < mw * mh; i++) {
        cleanMask[i] = mData[i] * maskScale;
      }

      // High Precision CPU Bilinear Upscale + Float32 S-Curve with Joint Bilateral Guided Alpha refinement
      // Pre-calculates upscaled raw alphas to run a guided 3x3 bilateral edge filtering pass.
      const rawAlphas = new Float32Array(w * h);
      // Aggressive floor to cut out small halos, but still preserve enough structure
      const floor = 80;
      const ceil = 220;

      for (let y = 0; y < h; y++) {
        const srcY = Math.max(
          0,
          Math.min(mh - 1.001, (y + 0.5) * (mh / h) - 0.5),
        );
        const y1 = Math.floor(srcY);
        const y2 = Math.min(mh - 1, y1 + 1);
        const fy = srcY - y1;
        const invFy = 1 - fy;

        const rowOffset = y * w;

        for (let x = 0; x < w; x++) {
          const srcX = Math.max(
            0,
            Math.min(mw - 1.001, (x + 0.5) * (mw / w) - 0.5),
          );
          const x1 = Math.floor(srcX);
          const x2 = Math.min(mw - 1, x1 + 1);
          const fx = srcX - x1;
          const invFx = 1 - fx;

          const row1 = y1 * mw;
          const row2 = y2 * mw;

          const p11 = cleanMask[row1 + x1];
          const p21 = cleanMask[row1 + x2];
          const p12 = cleanMask[row2 + x1];
          const p22 = cleanMask[row2 + x2];

          let a =
            p11 * invFx * invFy +
            p21 * fx * invFy +
            p12 * invFx * fy +
            p22 * fx * fy;

          // Float32 Hermite S-Curve Re-mapping
          if (a < floor) {
            a = 0;
          } else if (a > ceil) {
            a = 255;
          } else {
            const t = (a - floor) / (ceil - floor);
            a = t * t * (3 - 2 * t) * 255;
          }

          rawAlphas[rowOffset + x] = a;
        }
      }

      // Execute Joint Bilateral Guided Alpha Filter to snap and smooth edge lines
      for (let y = 0; y < h; y++) {
        const rowOffset = y * w;
        for (let x = 0; x < w; x++) {
          let a = rawAlphas[rowOffset + x];
          const idx = (rowOffset + x) * 4;

          // Apply guided bilateral sharpening and halo suppression strictly to transition pixels
          if (a > 3 && a < 252) {
            const r_center = pixels[idx];
            const g_center = pixels[idx + 1];
            const b_center = pixels[idx + 2];

            let sumAlpha = 0;
            let sumW = 0;

            // 3x3 Guided Window
            for (let dy = -1; dy <= 1; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) continue;
              const nRowOffset = ny * w;
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;

                const nIdx = (nRowOffset + nx) * 4;
                const nr = pixels[nIdx];
                const ng = pixels[nIdx + 1];
                const nb = pixels[nIdx + 2];
                const nAlpha = rawAlphas[nRowOffset + nx];

                const colorDist = Math.abs(nr - r_center) + Math.abs(ng - g_center) + Math.abs(nb - b_center);
                const rangeWeight = Math.max(0.01, 1.0 - (colorDist / 90));
                const spatialWeight = (dx === 0 && dy === 0) ? 1.0 : 0.65;
                const weight = rangeWeight * spatialWeight;

                sumAlpha += nAlpha * weight;
                sumW += weight;
              }
            }

            // Alpha suppression / boost based on edge brightness (suppress halo leaks)
            const isShoulderRegion = y > h * 0.42;
            const lum = (0.299 * r_center + 0.587 * g_center + 0.114 * b_center) / 255;
            
            if (sumW > 0) {
              a = sumAlpha / sumW;
            }

            // High contrast snap for crystal clear edges without jagged clipping
            if (a < 50) {
                a = 0; // Cut off noise and completely obliterate halos
            } else if (a > 200) {
                a = 255; // Snap the inside to solid early
            } else {
                // Sharpen intermediate values for a crisp but anti-aliased edge
                const t = (a - 50) / 150;
                a = Math.round((t * t * (3 - 2 * t)) * 255);
            }
          }

          if (a < 2) a = 0;
          if (a > 253) a = 255;

          pixels[idx + 3] = Math.round(a);
        }
      }
    };

    processMaskAndCompositeCPU(maskData);

    ctx.putImageData(imageData, 0, 0);

    onProgress("Polishing Professional Cutout...");
    const rawBlob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png"),
    );

    let polishedBlob = rawBlob;
    if (!isManualMode) {
      try {
        polishedBlob = await polishAndEnhance(rawBlob);
      } catch (e) {
        console.warn("[AI] Polish pass skipped", e);
      }
    }

    console.log(
      `[AI] Dual-Core Execution: ${(Date.now() - startTime) / 1000}s`,
    );

    if (forceWhiteBackground) {
      return await applyWhiteBackground(polishedBlob);
    }
    return polishedBlob;
  } catch (e: any) {
    console.error("[AI] Hybrid Failure:", e);
    throw new Error(`Hybrid Background removal failed: ${e.message}`);
  }
}

/**
 * Natural Contour Polish & Artifact Eradication
 * Applies Halo Decontamination to perfectly preserve edge detail while removing colored fringing.
 */
async function polishCutoutEdges(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = img.width;
      const h = img.height;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      
      // Calculate a strict geometric distance-to-transparent map to find thick inner edges (halos)
      // This prevents the face/body from being brightened/corrupted if alpha is 254 in the center.
      const isEdge = new Uint8Array(w * h);
      const isTransp = new Uint8Array(w * h);
      
      for (let i = 0; i < w * h; i++) {
        if (data[i * 4 + 3] < 20) { // Consider anything < 20 alpha as background/transparent
          isTransp[i] = 1;
        }
      }

      for (let y = 3; y < h - 3; y++) {
        for (let x = 3; x < w - 3; x++) {
          const idx = y * w + x;
          const a = data[idx * 4 + 3];
          
          if (a >= 20) {
            // Check if this pixel is geometrically close to the background
            let nearTransp = false;
            for(let dy = -3; dy <= 3; dy++) {
               for(let dx = -3; dx <= 3; dx++) {
                  if(isTransp[(y + dy) * w + (x + dx)] === 1) {
                     nearTransp = true; 
                     break;
                  }
               }
               if(nearTransp) break;
            }
            
            if (nearTransp) {
              if (a < 255) {
                isEdge[idx] = 1; // Semi-transparent physical edge
              } else {
                isEdge[idx] = 2; // Solid inner boundary (might have halo)
              }
            }
          }
        }
      }

      // Perform Halo reduction on all edges
      for (let i = 0; i < w * h; i++) {
        const edgeState = isEdge[i];
        if (edgeState > 0) {
          const idx = i * 4;
          let r = data[idx];
          let g = data[idx + 1];
          let b = data[idx + 2];
          const originalA = data[idx + 3];
          
          let alpha = originalA / 255;
          let finalAlpha = originalA;
          
          const bgR = 252;
          const bgG = 252;
          const bgB = 252;

          // Inverse blending for semi-transparent edges
          if (alpha > 0.05 && alpha < 0.98) {
            let decompR = (r - bgR * (1 - alpha)) / alpha;
            let decompG = (g - bgG * (1 - alpha)) / alpha;
            let decompB = (b - bgB * (1 - alpha)) / alpha;

            // Restrict decomp from creating dark/black edges: never darken more than 10%
            decompR = Math.max(r * 0.9, Math.min(255, decompR));
            decompG = Math.max(g * 0.9, Math.min(255, decompG));
            decompB = Math.max(b * 0.9, Math.min(255, decompB));

            const blend = Math.max(0, Math.min(1.0, (alpha - 0.05) / 0.5)); // gentler blend curve

            r = Math.round(r * (1 - blend) + decompR * blend);
            g = Math.round(g * (1 - blend) + decompG * blend);
            b = Math.round(b * (1 - blend) + decompB * blend);
            
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
          }

          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          
          // No edge dimming to avoid black lines on the boundary.
          data[idx + 3] = finalAlpha;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((b) => {
        URL.revokeObjectURL(img.src);
        resolve(b || blob);
      }, "image/png");
    };
    img.onerror = () => resolve(blob);
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Gentle Image Enhancement Pass
 */
async function polishAndEnhance(blob: Blob): Promise<Blob> {
  const cleanBlob = await polishCutoutEdges(blob);
  return cleanBlob;
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
