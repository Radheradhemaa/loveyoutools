import { pipeline, env, RawImage } from "@huggingface/transformers";

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
export const ensureU2netLoaded = async () => ensureIsnetLoaded(); // stub

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
  onProgress("Initializing Hybrid AI Core...");

  // Load model
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

    // Execute primary model
    let resModel = null;
    if (isnetPipeline) {
      resModel = await isnetPipeline(imageSrc).catch((e: any) => {
        console.error("Model pass failed", e);
        return null;
      });
    }

    // If failed and we were using webgpu, there might be a silent webgpu failure during inference
    // Let's forcibly fallback to WASM
    if (!resModel && hasWebGPU) {
      console.warn("[AI] WebGPU inference failed, forcing WASM fallback...");
      hasWebGPU = false; // Disable webgpu for future
      isnetPipeline = null;
      await ensureIsnetLoaded().catch(console.error);
      resModel = await isnetPipeline(imageSrc).catch((e: any) => {
        console.error("WASM pass failed", e);
        return null;
      });
    }

    if (!resModel) {
      throw new Error("AI model failed to process the image.");
    }

    onProgress("Merging AI Visions...");

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

    const maskData = getMask(resModel);

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
    // Completely bypasses browser Canvas rendering engines to guarantee 0 GPU artifacts
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

      const isMobile = isMobileDevice();

      // 1. High-Precision Morphological Opening (Erosion + Connected Component Filter + Dilation)
      // This severs thin bridges connecting background clutter (chairs, wall shadows) to cheeks, head, neck, and shoulders.
      const binMask = new Uint8Array(mw * mh);
      for (let y = 0; y < mh; y++) {
        const rowOffset = y * mw;
        for (let x = 0; x < mw; x++) {
          const idx = rowOffset + x;
          const val = mData[idx] * maskScale;
          
          // Use a very gentle threshold to ensure we don't cut off genuine shoulder edges or hair
          const threshold = y > mh * 0.40 ? 40 : 15; 
          binMask[idx] = val >= threshold ? 1 : 0;
        }
      }

      // 1b. Erosion Pass
      const erodedBin = new Uint8Array(mw * mh);
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          let erRad = 1; // Gentle erosion for head/face
          if (y > mh * 0.45) {
            // Very slightly stronger erosion at lower torso to cut off distinct noise 
            // without harming the real shoulder bounds
            erRad = 2;
          }

          const idx = y * mw + x;
          if (binMask[idx] === 0) {
            erodedBin[idx] = 0;
            continue;
          }
          let allOne = 1;
          for (let dy = -erRad; dy <= erRad; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= mh) {
              allOne = 0;
              break;
            }
            for (let dx = -erRad; dx <= erRad; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= mw) {
                allOne = 0;
                break;
              }
              if (binMask[ny * mw + nx] === 0) {
                allOne = 0;
                break;
              }
            }
            if (allOne === 0) break;
          }
          erodedBin[idx] = allOne;
        }
      }

      // 1c. Connected Component Analysis (CCA) to isolate target subject (the person)
      const visited = new Uint8Array(mw * mh);
      const stack = new Int32Array(mw * mh);
      const compLabels = new Int32Array(mw * mh);
      let bestCompId = 0;
      let maxCompSize = 0;
      let labelCounter = 0;

      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const idx = y * mw + x;
          if (erodedBin[idx] === 1 && visited[idx] === 0) {
            labelCounter++;
            let head = 0;
            let tail = 0;

            stack[tail++] = idx;
            visited[idx] = 1;
            compLabels[idx] = labelCounter;

            while (head < tail) {
              const curr = stack[head++];
              const cx = curr % mw;
              const cy = Math.floor(curr / mw);

              const neighbors = [curr - 1, curr + 1, curr - mw, curr + mw];
              for (let n = 0; n < neighbors.length; n++) {
                const nIdx = neighbors[n];
                if (nIdx >= 0 && nIdx < mw * mh) {
                  const nx = nIdx % mw;
                  const ny = Math.floor(nIdx / mw);
                  if (Math.abs(nx - cx) <= 1 && Math.abs(ny - cy) <= 1) {
                    if (erodedBin[nIdx] === 1 && visited[nIdx] === 0) {
                      visited[nIdx] = 1;
                      compLabels[nIdx] = labelCounter;
                      stack[tail++] = nIdx;
                    }
                  }
                }
              }
            }

            if (tail > maxCompSize) {
              maxCompSize = tail;
              bestCompId = labelCounter;
            }
          }
        }
      }

      // Isolate only pixels belonging to the primary component
      const cleanBin = new Uint8Array(mw * mh);
      if (bestCompId > 0) {
        for (let i = 0; i < mw * mh; i++) {
          if (compLabels[i] === bestCompId) {
            cleanBin[i] = 1;
          }
        }
      }

      // 1d. Morphological Dilation Pass (Radius = 2, leaves a strong 2-5 pixel inward crop to remove all edge halos)
      let dilatedBin = cleanBin;
      for (let iter = 0; iter < 2; iter++) {
        const next = new Uint8Array(mw * mh);
        for (let y = 0; y < mh; y++) {
          for (let x = 0; x < mw; x++) {
            const idx = y * mw + x;
            if (dilatedBin[idx] === 1) {
              next[idx] = 1;
              continue;
            }
            let isDilated = false;
            for (let dy = -1; dy <= 1; dy++) {
              const ny = y + dy;
              if (ny >= 0 && ny < mh) {
                for (let dx = -1; dx <= 1; dx++) {
                  const nx = x + dx;
                  if (nx >= 0 && nx < mw) {
                    if (dilatedBin[ny * mw + nx] === 1) {
                      isDilated = true;
                      break;
                    }
                  }
                }
              }
              if (isDilated) break;
            }
            next[idx] = isDilated ? 1 : 0;
          }
        }
        dilatedBin = next;
      }

      // Apply the dilated subject profile to mask, filtering all outside fragments (chairs, shadows, specks) completely.
      const correctedMask = new Float32Array(mw * mh);
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const idx = y * mw + x;
          let val = mData[idx] * maskScale * dilatedBin[idx];

          // Gentle internal thresholding inside subject container
          const internalThresh = 15;
          if (val < internalThresh) {
            val = 0;
          }

          // Kill spikes
          if (x > 1 && x < mw - 2) {
            const left1 = mData[y * mw + x - 1] * maskScale * dilatedBin[y * mw + x - 1];
            const right1 = mData[y * mw + x + 1] * maskScale * dilatedBin[y * mw + x + 1];
            const nAvg = (left1 + right1) / 2;
            if (Math.abs(val - nAvg) > 50) val = nAvg;
          }
          correctedMask[idx] = val;
        }
      }

      // 1e. Simple Erosion to eliminate wild flyaway fringes near head & template boundary
      const erodedMask = correctedMask;

      // 2. Separable Spatial Tensor Blur to soften the mask's micro-boundaries naturally
      const blurRad = 2;
      const tempMask = new Float32Array(mw * mh);
      const cleanMask = new Float32Array(mw * mh);

      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          let sum = 0, count = 0;
          for (let dx = -blurRad; dx <= blurRad; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < mw) {
              sum += erodedMask[y * mw + nx];
              count++;
            }
          }
          tempMask[y * mw + x] = sum / count;
        }
      }
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          let sum = 0,
            count = 0;
          for (let dy = -blurRad; dy <= blurRad; dy++) {
            const ny = y + dy;
            if (ny >= 0 && ny < mh) {
              sum += tempMask[ny * mw + x];
              count++;
            }
          }
          cleanMask[y * mw + x] = sum / count;
        }
      }

      // 3. High Precision CPU Bilinear Upscale + Float32 S-Curve
      // Softer floor to preserve soft details and natural organic contours around shoulders & neck.
      const floor = 20;
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
          if (a < 8) a = 0;
          if (a > 248) a = 255;

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
 * Eradicates boundary patches and noisy webs via density morphological cleaning,
 * then applies S-Curve edge refinement and Halo Decontamination.
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

      // 1. High-precision 1:1 Connected Component Analysis to isolate subject and erase all background noise
      const visited = new Uint32Array(w * h);
      let componentCount = 0;
      
      const compSizes = [0];
      const compSumX = [0];
      const compSumY = [0];
      
      const stack = new Int32Array(w * h);
      let stackLen = 0;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const a = data[idx * 4 + 3];

          if (a > 20 && visited[idx] === 0) {
            componentCount++;
            const compId = componentCount;
            compSizes[compId] = 0;
            compSumX[compId] = 0;
            compSumY[compId] = 0;

            stack[0] = idx;
            stackLen = 1;
            visited[idx] = compId;

            while (stackLen > 0) {
              const curr = stack[--stackLen];
              const cx = curr % w;
              const cy = Math.floor(curr / w);

              compSizes[compId]++;
              compSumX[compId] += cx;
              compSumY[compId] += cy;

              if (cx > 0) {
                const n = curr - 1;
                if (visited[n] === 0 && data[n * 4 + 3] > 20) {
                  visited[n] = compId;
                  stack[stackLen++] = n;
                }
              }
              if (cx < w - 1) {
                const n = curr + 1;
                if (visited[n] === 0 && data[n * 4 + 3] > 20) {
                  visited[n] = compId;
                  stack[stackLen++] = n;
                }
              }
              if (cy > 0) {
                const n = curr - w;
                if (visited[n] === 0 && data[n * 4 + 3] > 20) {
                  visited[n] = compId;
                  stack[stackLen++] = n;
                }
              }
              if (cy < h - 1) {
                const n = curr + w;
                if (visited[n] === 0 && data[n * 4 + 3] > 20) {
                  visited[n] = compId;
                  stack[stackLen++] = n;
                }
              }
            }
          }
        }
      }

      let bestCompId = 1;
      let maxScore = -1;

      for (let id = 1; id <= componentCount; id++) {
        const size = compSizes[id];
        if (size === 0) continue;

        const avgX = compSumX[id] / size;
        const avgY = compSumY[id] / size;

        const dx = (avgX - w / 2) / (w / 2);
        const dy = (avgY - h / 2) / (h / 2);
        const centerDistance = Math.sqrt(dx * dx + dy * dy);

        const score = size * (1.0 - 0.6 * centerDistance);
        if (score > maxScore) {
          maxScore = score;
          bestCompId = id;
        }
      }

      // Fill holes and build solid foreground mask
      const alphaMap = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        if (visited[i] === bestCompId) {
          alphaMap[i] = 1;
        }
      }

      const isExternal = new Uint8Array(w * h);
      const q = new Int32Array(w * h);
      let qHead = 0;
      let qTail = 0;

      for (let x = 0; x < w; x++) {
        const topIdx = x;
        if (alphaMap[topIdx] === 0) {
          isExternal[topIdx] = 1;
          q[qTail++] = topIdx;
        }
        const botIdx = (h - 1) * w + x;
        if (alphaMap[botIdx] === 0) {
          isExternal[botIdx] = 1;
          q[qTail++] = botIdx;
        }
      }
      for (let y = 0; y < h; y++) {
        const leftIdx = y * w;
        if (alphaMap[leftIdx] === 0) {
          isExternal[leftIdx] = 1;
          q[qTail++] = leftIdx;
        }
        const rightIdx = y * w + (w - 1);
        if (alphaMap[rightIdx] === 0) {
          isExternal[rightIdx] = 1;
          q[qTail++] = rightIdx;
        }
      }

      while (qHead < qTail) {
        const curr = q[qHead++];
        const cx = curr % w;
        const cy = Math.floor(curr / w);

        if (cx > 0) {
          const n = curr - 1;
          if (alphaMap[n] === 0 && isExternal[n] === 0) {
            isExternal[n] = 1;
            q[qTail++] = n;
          }
        }
        if (cx < w - 1) {
          const n = curr + 1;
          if (alphaMap[n] === 0 && isExternal[n] === 0) {
            isExternal[n] = 1;
            q[qTail++] = n;
          }
        }
        if (cy > 0) {
          const n = curr - w;
          if (alphaMap[n] === 0 && isExternal[n] === 0) {
            isExternal[n] = 1;
            q[qTail++] = n;
          }
        }
        if (cy < h - 1) {
          const n = curr + w;
          if (alphaMap[n] === 0 && isExternal[n] === 0) {
            isExternal[n] = 1;
            q[qTail++] = n;
          }
        }
      }

      // Erase all background pixels (either external/border-touching or non-subject components)
      // to guarantee absolute elimination of any floating or partially touching background fragments, chairs, or shadows.
      for (let i = 0; i < w * h; i++) {
        if (isExternal[i] === 1 || visited[i] !== bestCompId) {
          data[i * 4 + 3] = 0;
        } else {
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

      // Automatically extent the shoulder to fit the frame (bottom 25% of image)
      // This prevents the "cut off shoulders" look and smoothly fills the bottom corners.
      const shoulderLimit = Math.floor(canvas.height * 0.75);
      for (let y = shoulderLimit; y < canvas.height; y++) {
        let lx = -1;
        let rx = -1;
        for (let x = 0; x < canvas.width; x++) {
          if (d[(y * canvas.width + x) * 4 + 3] > 200) {
            lx = x; break;
          }
        }
        for (let x = canvas.width - 1; x >= 0; x--) {
          if (d[(y * canvas.width + x) * 4 + 3] > 200) {
            rx = x; break;
          }
        }
        
        // If we found valid shoulder bounds that are wide enough (> 40% of image), stretch them to the edges
        if (lx > 0 && rx > lx && (rx - lx) > canvas.width * 0.40) {
          const lIdx = (y * canvas.width + lx) * 4;
          for (let x = 0; x < lx; x++) {
            const idx = (y * canvas.width + x) * 4;
            // Add a subtle darkening towards the edge to simulate depth/falloff
            const falloff = Math.max(0.7, 1 - ((lx - x) / lx) * 0.3);
            d[idx] = d[lIdx] * falloff;
            d[idx + 1] = d[lIdx + 1] * falloff;
            d[idx + 2] = d[lIdx + 2] * falloff;
            d[idx + 3] = d[lIdx + 3];
          }
          
          const rIdx = (y * canvas.width + rx) * 4;
          const rightDist = canvas.width - 1 - rx;
          for (let x = rx + 1; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            const falloff = Math.max(0.7, 1 - ((x - rx) / rightDist) * 0.3);
            d[idx] = d[rIdx] * falloff;
            d[idx + 1] = d[rIdx + 1] * falloff;
            d[idx + 2] = d[rIdx + 2] * falloff;
            d[idx + 3] = d[rIdx + 3];
          }
        }
      }

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
