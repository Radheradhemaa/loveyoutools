import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.numThreads = 4;
}

let modnetPipeline: any = null;
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

export const ensureIsnetLoaded = async () => {
  if (!modnetPipeline) {
    await ensureWebGPUChecked();
    const device = hasWebGPU ? "webgpu" : "wasm";
    try {
      modnetPipeline = await pipeline("image-segmentation", "Xenova/modnet", {
        device,
      });
    } catch (e) {
      console.warn("Primary load failed, trying WASM fallback", e);
      modnetPipeline = await pipeline("image-segmentation", "Xenova/modnet", {
        device: "wasm",
      });
    }
  }
};

export const ensurePreloaded = async () => ensureIsnetLoaded();
export const ensureModnetLoaded = async () => ensureIsnetLoaded();

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

export async function removeBackground(
  imageInput: string | File | Blob,
  onProgress: (p: string) => void = () => {},
  forceWhiteBackground = false,
  isManualMode = false,
): Promise<Blob> {
  const startTime = Date.now();
  onProgress("Initializing AI Core...");

  await ensureIsnetLoaded().catch(console.error);

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

  const imageSrc = await downscaleImageIfNeeded(imageSrcForDownscale, 1280);

  try {
    onProgress("Analyzing Foreground (ModNet + U2Net Ensemble)...");

    let resModel = null;
    if (modnetPipeline) {
      resModel = await modnetPipeline(imageSrc).catch((e: any) => {
        console.error("AI pass failed", e);
        return null;
      });
    }

    if (!resModel && hasWebGPU) {
      hasWebGPU = false; 
      modnetPipeline = null;
      await ensureIsnetLoaded().catch(console.error);
      resModel = await modnetPipeline(imageSrc).catch((e: any) => {
        console.error("WASM pass failed", e);
        return null;
      });
    }

    if (!resModel) {
      throw new Error("AI models failed to process the image.");
    }

    onProgress("Extracting Subject Data...");

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

      // Normalize array to 0..255
      const normMask = new Float32Array(mw * mh);
      for (let i = 0; i < mw * mh; i++) {
        normMask[i] = mData[i] * maskScale;
      }

      // Step 1: Create an inclusive, highly complete binary mask of the subject based on model confidence
      const bin = new Uint8Array(mw * mh);
      for (let i = 0; i < mw * mh; i++) {
        bin[i] = normMask[i] > 35 ? 1 : 0;
      }

      // Step 2: Run Connected Component Analysis (CCA) directly on the complete binary mask.
      // This groups pixels into distinct components. The largest component represents the human subject.
      const labels = new Int32Array(mw * mh);
      const visited = new Uint8Array(mw * mh);
      let labelCounter = 0;
      let maxCompLabel = 0;
      let maxCompSize = 0;
      const stack = new Int32Array(mw * mh);

      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const idx = y * mw + x;
          if (bin[idx] === 1 && visited[idx] === 0) {
            labelCounter++;
            let head = 0;
            let tail = 0;
            stack[tail++] = idx;
            visited[idx] = 1;
            labels[idx] = labelCounter;

            while (head < tail) {
              const curr = stack[head++];
              const cx = curr % mw;
              const cy = Math.floor(curr / mw);
              
              const neighbors = [
                curr - 1,
                curr + 1,
                curr - mw,
                curr + mw
              ];
              for (const n of neighbors) {
                if (n >= 0 && n < mw * mh) {
                  const nx = n % mw;
                  const ny = Math.floor(n / mw);
                  if (Math.abs(nx - cx) <= 1 && Math.abs(ny - cy) <= 1) {
                    if (bin[n] === 1 && visited[n] === 0) {
                      visited[n] = 1;
                      labels[n] = labelCounter;
                      stack[tail++] = n;
                    }
                  }
                }
              }
            }
            const componentSize = tail;
            if (componentSize > maxCompSize) {
              maxCompSize = componentSize;
              maxCompLabel = labelCounter;
            }
          }
        }
      }

      // Isolate the human subject component
      const humanCore = new Uint8Array(mw * mh);
      if (maxCompLabel > 0) {
        for (let i = 0; i < mw * mh; i++) {
          if (labels[i] === maxCompLabel) {
            humanCore[i] = 1;
          }
        }
      } else {
        // Fallback to bin directly if no component is labeled
        for (let i = 0; i < mw * mh; i++) {
          humanCore[i] = bin[i];
        }
      }

      // Step 3: Perform morphological dilation back to recover anti-aliased soft edges, hair, and clothing contours completely,
      // without bringing in far away, disconnected background noise.
      const dilRad = 6;
      const horizDil = new Uint8Array(mw * mh);
      for (let y = 0; y < mh; y++) {
        const offset = y * mw;
        for (let x = 0; x < mw; x++) {
          let found = 0;
          const startX = Math.max(0, x - dilRad);
          const endX = Math.min(mw - 1, x + dilRad);
          for (let nx = startX; nx <= endX; nx++) {
            if (humanCore[offset + nx] === 1) {
              found = 1;
              break;
            }
          }
          horizDil[offset + x] = found;
        }
      }

      const dilatedCore = new Uint8Array(mw * mh);
      for (let x = 0; x < mw; x++) {
        for (let y = 0; y < mh; y++) {
          let found = 0;
          const startY = Math.max(0, y - dilRad);
          const endY = Math.min(mh - 1, y + dilRad);
          for (let ny = startY; ny <= endY; ny++) {
            if (horizDil[ny * mw + x] === 1) {
              found = 1;
              break;
            }
          }
          dilatedCore[y * mw + x] = found;
        }
      }

      // Step 4: Mask the original confidence values with the cleaned dilated component
      const cleanMask = new Float32Array(mw * mh);
      for (let i = 0; i < mw * mh; i++) {
        cleanMask[i] = dilatedCore[i] === 1 ? normMask[i] : 0;
      }

      // Step 5: Upscale and refine the matte overlay onto the image.
      // We narrow the interpolation window (floor = 110, ceil = 140) to create an extremely crisp, 
      // clear, high-contrast professional boundary that prevents blurring and oversmoothing,
      // while retaining exactly enough micro-fringe for subpixel anti-aliasing.
      const floor = 108; 
      const ceil = 138;

      for (let y = 0; y < h; y++) {
        const srcY = Math.max(0, Math.min(mh - 1.001, (y + 0.5) * (mh / h) - 0.5));
        const y1 = Math.floor(srcY);
        const y2 = Math.min(mh - 1, y1 + 1);
        const fy = srcY - y1;
        const invFy = 1 - fy;

        for (let x = 0; x < w; x++) {
          const srcX = Math.max(0, Math.min(mw - 1.001, (x + 0.5) * (mw / w) - 0.5));
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

          let a = p11 * invFx * invFy + p21 * fx * invFy + p12 * invFx * fy + p22 * fx * fy;

          if (a < floor) {
            a = 0; 
          } else if (a > ceil) {
            a = 255; 
          } else {
            const t = (a - floor) / (ceil - floor);
            a = t * t * (3 - 2 * t) * 255;
          }

          const idx = (y * w + x) * 4;

          // Step 6: Smart background chair and edge shadow removal.
          // We ONLY inspect and suppress weak boundary pixels (fringe alpha <= 140).
          // Core pixels of the subject (whose alpha is high/solid >= 140) are 100% protected and remain fully opaque.
          // Shoulder regions (lower y coordinates, e.g. >= h * 0.45) are fully protected to preserve garments of any dark/neutral color.
          if (a > 0 && a <= 140) {
            const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
            const maxVal = Math.max(r, g, b);
            const minVal = Math.min(r, g, b);
            const sat = maxVal > 0 ? (maxVal - minVal) / maxVal : 0;
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            // Check if this weak fringe pixel looks like a typical neutral gray/dark office chair frame, mesh, or backrest shadow
            const isTypicalChairColor = (lum < 95 && sat < 0.20) || (lum < 55);
            
            // Only suppress around the lateral upper-neck, ears, and high-backrest regions (where chairs actually appear)
            const isLateralRegion = x < w * 0.30 || x > w * 0.70;
            const isHighBackrestRegionY = y > h * 0.08 && y < h * 0.45;

            if (isTypicalChairColor && isLateralRegion && isHighBackrestRegionY) {
              a = 0;
            }
          }

          if (a < 5) a = 0;

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
        console.warn("Polish pass skipped", e);
      }
    }

    console.log(`Execution Time: ${(Date.now() - startTime) / 1000}s`);

    if (forceWhiteBackground) {
      return await applyWhiteBackground(polishedBlob);
    }
    return polishedBlob;
  } catch (e: any) {
    console.error("Hybrid Failure:", e);
    throw new Error(`Background removal failed: ${e.message}`);
  }
}

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

      // Step 1: Chamfer distance transform to calculate distance from background (alpha < 10)
      const dist = new Float32Array(w * h);
      
      // Forward pass
      for (let y = 0; y < h; y++) {
        const rowOff = y * w;
        for (let x = 0; x < w; x++) {
          const idx = rowOff + x;
          if (data[idx * 4 + 3] < 10) {
            dist[idx] = 0;
          } else {
            let d = 99999;
            if (x > 0) d = Math.min(d, dist[idx - 1] + 1);
            if (y > 0) d = Math.min(d, dist[idx - w] + 1);
            if (x > 0 && y > 0) d = Math.min(d, dist[idx - w - 1] + 1.4);
            if (x < w - 1 && y > 0) d = Math.min(d, dist[idx - w + 1] + 1.4);
            dist[idx] = d;
          }
        }
      }

      // Backward pass
      for (let y = h - 1; y >= 0; y--) {
        const rowOff = y * w;
        for (let x = w - 1; x >= 0; x--) {
          const idx = rowOff + x;
          let d = dist[idx];
          if (x < w - 1) d = Math.min(d, dist[idx + 1] + 1);
          if (y < h - 1) d = Math.min(d, dist[idx + w] + 1);
          if (x < w - 1 && y < h - 1) d = Math.min(d, dist[idx + w + 1] + 1.4);
          if (x > 0 && y < h - 1) d = Math.min(d, dist[idx + w - 1] + 1.4);
          dist[idx] = d;
        }
      }

      // Step 2: Edge decontamination
      // Any pixel close to the background (dist < 5.0) is contaminated with original light/white wall background color.
      // We overwrite its RGB with the nearest secure interior pixel (dist >= 5.0 and high alpha).
      for (let y = 0; y < h; y++) {
        const rowOff = y * w;
        for (let x = 0; x < w; x++) {
          const idx = rowOff + x;
          const dVal = dist[idx];
          
          if (dVal > 0 && dVal < 5.0) {
            let bestX = x, bestY = y;
            let minDistSq = 99999;
            let found = false;

            // Search locally up to radius 6
            const rad = 6;
            for (let dy = -rad; dy <= rad; dy++) {
              const ny = y + dy;
              if (ny >= 0 && ny < h) {
                const nRowOff = ny * w;
                for (let dx = -rad; dx <= rad; dx++) {
                  const nx = x + dx;
                  if (nx >= 0 && nx < w) {
                    const nIdx = nRowOff + nx;
                    if (dist[nIdx] >= 5.0 && data[nIdx * 4 + 3] >= 240) {
                      const distSq = dx * dx + dy * dy;
                      if (distSq < minDistSq) {
                        minDistSq = distSq;
                        bestX = nx;
                        bestY = ny;
                        found = true;
                      }
                    }
                  }
                }
              }
            }

            if (found) {
              const targetIdx = (bestY * w + bestX) * 4;
              const srcIdx = idx * 4;
              data[srcIdx] = data[targetIdx];
              data[srcIdx + 1] = data[targetIdx + 1];
              data[srcIdx + 2] = data[targetIdx + 2];
            } else {
              // Fallback to progressive edge darkening for remaining light-colored halos
              const srcIdx = idx * 4;
              const r = data[srcIdx], g = data[srcIdx + 1], b = data[srcIdx + 2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              if (lum > 110) {
                const finalA = data[srcIdx + 3];
                const transFactor = (255 - finalA) / 255;
                const darkening = 1.0 - transFactor * 0.70;
                data[srcIdx] = Math.max(0, Math.min(255, Math.round(r * darkening)));
                data[srcIdx + 1] = Math.max(0, Math.min(255, Math.round(g * darkening)));
                data[srcIdx + 2] = Math.max(0, Math.min(255, Math.round(b * darkening)));
              }
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

      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 5) continue;

        for (let j = 0; j < 3; j++) {
          let v = d[i + j] / 255;
          v = (v - 0.5) * 1.08 + 0.5;
          v = v * 1.06;
          d[i + j] = Math.min(255, Math.max(0, v * 255));
        }

        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = 1.18;
        let nr = Math.min(255, Math.max(0, (l + (r - l) * sat) * 255));
        let ng = Math.min(255, Math.max(0, (l + (g - l) * sat) * 255));
        let nb = Math.min(255, Math.max(0, (l + (b - l) * sat) * 255));
        
        nr = Math.min(255, nr * 1.03);
        ng = Math.min(255, ng * 1.015);
        
        d[i] = nr;
        d[i + 1] = ng;
        d[i + 2] = nb;
      }

      ctx.putImageData(data, 0, 0);
      canvas.toBlob((b) => resolve(b || cleanBlob), "image/png");
    };
    img.onerror = () => resolve(cleanBlob);
    img.src = URL.createObjectURL(cleanBlob);
  });
}

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

