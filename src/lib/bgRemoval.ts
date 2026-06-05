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
    // Force WASM on mobile devices for stability
    const device = hasWebGPU ? "webgpu" : "wasm";
    try {
      isnetPipeline = await pipeline("image-segmentation", "Xenova/modnet", {
        device,
      });
    } catch (e) {
      console.warn("[AI] MODNet primary load failed, trying WASM fallback", e);
      isnetPipeline = await pipeline("image-segmentation", "Xenova/modnet", {
        device: "wasm",
      });
    }
  }
};

/**
 * Compatibility stubs.
 */
export const ensurePreloaded = async () => {
  await ensureIsnetLoaded();
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

  // Load models
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

  // Use 1280 for ultra-speed while maintaining professional detail.
  const imageSrc = await downscaleImageIfNeeded(imageSrcForDownscale, 1280);

  try {
    onProgress("Analyzing Foreground (ModNet Pass)...");

    // Execute primary model (MODNet)
    let resModel = null;
    if (isnetPipeline) {
      resModel = await isnetPipeline(imageSrc).catch((e: any) => {
        console.error("Modnet pass failed", e);
        return null;
      });
    }

    if (!resModel && hasWebGPU) {
      console.warn("[AI] WebGPU inference failed, forcing WASM fallback...");
      hasWebGPU = false; 
      isnetPipeline = null;
      await ensureIsnetLoaded().catch(console.error);
      resModel = await isnetPipeline(imageSrc).catch((e: any) => {
        console.error("WASM Modnet pass failed", e);
        return null;
      });
    }

    if (!resModel) {
      throw new Error("AI models failed to process the image.");
    }

    onProgress("Extracting Subject Data...");

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

    let maskData = getMask(resModel);

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

      // High Precision CPU Bilinear Upscale + Float32 S-Curve
      // Softer floor to preserve soft details and natural organic contours around shoulders & neck.
      const floor = 10;
      const ceil = 245;

      for (let y = 0; y < h; y++) {
        // Perfect geometric center calculation
        const srcY = Math.max(
          0,
          Math.min(mh - 1.001, (y + 0.5) * (mh / h) - 0.5),
        );
        const y1 = Math.floor(srcY);
        const y2 = Math.min(mh - 1, y1 + 1);
        const fy = srcY - y1;
        const invFy = 1 - fy; // Optimization

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

          const p11 = mData[row1 + x1] * maskScale;
          const p21 = mData[row1 + x2] * maskScale;
          const p12 = mData[row2 + x1] * maskScale;
          const p22 = mData[row2 + x2] * maskScale;

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

          const idx = (y * w + x) * 4;

          // Smooth Natural Edge Preservation (Replaces aggressive jagged color-defringer)
          if (a > 2 && a < 253) {
            const r = pixels[idx],
              g = pixels[idx + 1],
              b = pixels[idx + 2];
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

            // Mild uniform halo suppression based strictly on edge brightness
            // avoids checking saturation which destroys gray/white clothing
            if (lum > 0.8) {
              // Ensure we do NOT suppress/translucify shoulder/shirt boundaries (causes color bleeding when overlaid 
              // on a colored passport background). Keep them solid and natural.
              const isShoulderRegion = y > h * 0.4;
              if (isShoulderRegion) {
                // Do not boost! Just let it be naturally sharp to avoid background halo bleeding
                a = Math.min(255, a); 
              } else {
                a *= 0.75; // strictly suppress very white edge bleed on hair/head region
              }
            } else if (lum < 0.2) {
              a = Math.min(255, a * 1.05); // preserve dark edge details (like hair) slightly
            }
          }

          // Strict background suppression
          if (a < 5) a = 0;
          if (a > 250) a = 255;

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

      // Only perform Color Decontamination on semi-transparent pixels (the edge boundaries)
      for (let i = 0; i < w * h; i++) {
        // Keep pristine original edge processing for the main subject!
        // No dual blurring or S-curving to prevent ANY outline, haloing, or "double cutout lines".
        const finalA = data[i * 4 + 3];
        if (finalA > 0 && finalA < 255) {
          const idx = i * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const maxVal = Math.max(r, g, b);
          const minVal = Math.min(r, g, b);
          const sat = maxVal > 0 ? (maxVal - minVal) / maxVal : 0;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          // Smart edge-only de-halo pass to purge light background halos from clothing, skin and hair
          const isWhiteShirt = sat < 0.15 && lum > 160;
          if (!isWhiteShirt && lum > 110) {
            const transFactor = (255 - finalA) / 255;
            const darkening = 1.0 - transFactor * 0.70;
            data[idx] = Math.max(0, Math.min(255, Math.round(r * darkening)));
            data[idx + 1] = Math.max(0, Math.min(255, Math.round(g * darkening)));
            data[idx + 2] = Math.max(0, Math.min(255, Math.round(b * darkening)));
          }
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

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = data.data;

      // Gentle overall enhancement for portrait beautification
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 5) continue; // skip transparent

        // Slight contrast and brightness boost (beautify)
        for (let j = 0; j < 3; j++) {
          let v = d[i + j] / 255;
          v = (v - 0.5) * 1.08 + 0.5; // slight contrast enhancement
          v = v * 1.06; // brightness boost for fresh look
          d[i + j] = Math.min(255, Math.max(0, v * 255));
        }

        // Slight saturation and "warmth" boost for skin
        const r = d[i] / 255,
          g = d[i + 1] / 255,
          b = d[i + 2] / 255;
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = 1.18; // 18% saturation boost (healthy glow)
        let nr = Math.min(255, Math.max(0, (l + (r - l) * sat) * 255));
        let ng = Math.min(255, Math.max(0, (l + (g - l) * sat) * 255));
        let nb = Math.min(255, Math.max(0, (l + (b - l) * sat) * 255));
        
        // Add a tiny bit of red/yellow (warmth) for beautification of skin tones
        nr = Math.min(255, nr * 1.03);
        ng = Math.min(255, ng * 1.015);
        
        d[i] = nr;
        d[i + 1] = ng;
        d[i + 2] = nb;
      }

      // -------------------------------------------------------------
      // (Shoulder stretching removed to preserve natural contours)
      // -------------------------------------------------------------
      
      ctx.putImageData(data, 0, 0);
      canvas.toBlob((b) => resolve(b || cleanBlob), "image/png");
    };
    img.onerror = () => resolve(cleanBlob);
    img.src = URL.createObjectURL(cleanBlob);
  });
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
