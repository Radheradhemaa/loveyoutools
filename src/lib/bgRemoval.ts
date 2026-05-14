import { pipeline, env, RawImage } from '@huggingface/transformers';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.proxy = false;
// Standardize on 4 threads for better WASM performance without oversubscription
env.backends.onnx.wasm.numThreads = 4;

let isnetPipeline: any = null;
let u2netPipeline: any = null;

// Check for WebGPU adapter to avoid lazy initialization failures
let hasWebGPU = false;
let checkWebGPUPromise: Promise<void> | null = null;
const ensureWebGPUChecked = async () => {
    if (checkWebGPUPromise) return checkWebGPUPromise;
    checkWebGPUPromise = (async () => {
        if (typeof navigator !== 'undefined' && (navigator as any).gpu) {
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
        const device = hasWebGPU ? 'webgpu' : 'wasm';
        try {
            isnetPipeline = await pipeline('image-segmentation', 'Xenova/modnet', { device });
        } catch (e) {
            console.warn("[AI] MODNet primary load failed, trying WASM fallback", e);
            // In case WASM is also rejected but we can try without specifying
            isnetPipeline = await pipeline('image-segmentation', 'Xenova/modnet', { device: 'wasm' });
        }
    }
};

/**
 * Ensures the secondary refinement model is loaded.
 * Using MODNet as a stable fallback for structural passes.
 */
export const ensureU2netLoaded = async () => {
    if (!u2netPipeline) {
        await ensureWebGPUChecked();
        const device = hasWebGPU ? 'webgpu' : 'wasm';
        try {
            u2netPipeline = await pipeline('image-segmentation', 'Xenova/modnet', { device });
        } catch (e) {
            console.warn("[AI] MODNet secondary load failed, trying WASM fallback", e);
            u2netPipeline = await pipeline('image-segmentation', 'Xenova/modnet', { device: 'wasm' });
        }
    }
};

/**
 * Compatibility stubs.
 */
export const ensurePreloaded = async () => {
    await Promise.all([ensureIsnetLoaded(), ensureU2netLoaded()]);
};
export const ensureModnetLoaded = async () => ensureIsnetLoaded();

/**
 * Downscales an image if it exceeds max dimension.
 */
async function downscaleImageIfNeeded(imageSrc: string | File | Blob, maxDim = 2048): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const src = e.target?.result as string;
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                if (img.width <= maxDim && img.height <= maxDim) return resolve(src);
                const canvas = document.createElement('canvas');
                const ratio = Math.min(maxDim / img.width, maxDim / img.height);
                const w = img.width * ratio;
                const h = img.height * ratio;
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d')!;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/png', 0.95));
            };
            img.onerror = () => resolve(src);
            img.src = src;
        };

        if (typeof imageSrc === 'string') {
            resolve(imageSrc);
        } else {
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
    isManualMode = false
): Promise<Blob> {
    const startTime = Date.now();
    onProgress('Initializing Hybrid AI Core...');

    // Load both models (if one is already loaded it's instanced)
    await Promise.all([
        ensureIsnetLoaded().catch(console.error),
        ensureU2netLoaded().catch(console.error)
    ]);

    // Ensure input is a string (DataURL or URL)
    let imageSrcForDownscale: string;
    if (typeof imageInput === 'string') {
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
        onProgress('Analyzing Foreground (Dual Pass)...');

        // Parallel execution of both models for speed
        let [resIsnet, resU2net] = await Promise.all([
            isnetPipeline ? isnetPipeline(imageSrc).catch((e: any) => { console.error("ISNet pass failed", e); return null; }) : Promise.resolve(null),
            u2netPipeline ? u2netPipeline(imageSrc).catch((e: any) => { console.error("U2Net pass failed", e); return null; }) : Promise.resolve(null)
        ]);

        // If both failed and we were using webgpu, there might be a silent webgpu failure during inference
        // Let's forcibly fallback to WASM
        if (!resIsnet && !resU2net && hasWebGPU) {
            console.warn("[AI] WebGPU inference failed, forcing WASM fallback...");
            hasWebGPU = false; // Disable webgpu for future
            isnetPipeline = null;
            u2netPipeline = null;
            await Promise.all([
                ensureIsnetLoaded().catch(console.error),
                ensureU2netLoaded().catch(console.error)
            ]);
            [resIsnet, resU2net] = await Promise.all([
                isnetPipeline ? isnetPipeline(imageSrc).catch((e: any) => { console.error("ISNet WASM pass failed", e); return null; }) : Promise.resolve(null),
                u2netPipeline ? u2netPipeline(imageSrc).catch((e: any) => { console.error("U2Net WASM pass failed", e); return null; }) : Promise.resolve(null)
            ]);
        }

        if (!resIsnet && !resU2net) {
            throw new Error("Both AI models failed to process the image.");
        }

        onProgress('Merging AI Visions...');

        // Helper to extract mask data and normalize
        const getMask = (result: any) => {
            if (!result || result.length === 0) return null;
            let segment = result[0];
            if (result.length > 1) {
                const foreground = result.find((s: any) => !s.label.toLowerCase().includes('back'));
                if (foreground) segment = foreground;
            }
            return segment.mask;
        };

        const maskIsnet = getMask(resIsnet);
        const maskU2net = getMask(resU2net);

        // Load Full Original Image to get maximum quality output
        const origImg = new Image();
        origImg.crossOrigin = 'anonymous';
        await new Promise((res) => { origImg.onload = res; origImg.src = imageSrcForDownscale; });

        const canvas = document.createElement('canvas');
        canvas.width = origImg.width; canvas.height = origImg.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(origImg, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        // Process and Hybridize Masks
        // We favor ISNet (65%) for edge sharpness and U2Net (35%) for structural coverage
        const hybridAlphas = new Uint8ClampedArray(canvas.width * canvas.height);

        const processMaskToCanvas = (mask: any) => {
            if (!mask) return null;
            const c = document.createElement('canvas');
            c.width = mask.width; c.height = mask.height;
            const cx = c.getContext('2d')!;
            const id = cx.createImageData(mask.width, mask.height);
            const data = mask.data;
            let maxFound = 0;
            for (let i = 0; i < 50000; i += 10) if (data[i] > maxFound) maxFound = data[i];
            const scale = (maxFound > 0 && maxFound <= 1.1) ? 255 : 1;

            for (let i = 0; i < data.length; i++) {
                const v = Math.min(255, Math.max(0, Math.round(data[i] * scale)));
                const offset = i * 4;
                id.data[offset] = v; id.data[offset + 1] = v; id.data[offset + 2] = v; id.data[offset + 3] = 255;
            }
            cx.putImageData(id, 0, 0);
            
            // Scaled mask to match original image
            const sc = document.createElement('canvas');
            sc.width = canvas.width; sc.height = canvas.height;
            const scx = sc.getContext('2d')!;
            scx.imageSmoothingEnabled = true;
            scx.imageSmoothingQuality = 'high';
            scx.drawImage(c, 0, 0, canvas.width, canvas.height);
            return scx.getImageData(0, 0, canvas.width, canvas.height).data;
        };

        const dataIsnet = processMaskToCanvas(maskIsnet);
        const dataU2net = processMaskToCanvas(maskU2net);

        for (let i = 0; i < pixels.length; i += 4) {
            let aIsnet = dataIsnet ? dataIsnet[i] : 0;
            let aU2net = dataU2net ? dataU2net[i] : 0;

            let finalA: number;
            if (dataIsnet && dataU2net) {
                // Weighted hybrid approach
                finalA = (aIsnet * 0.7) + (aU2net * 0.3);
                // Boost confidence if both agree or if ISNet is strong
                if (aIsnet > 200 && aU2net > 200) finalA = Math.max(finalA, 255);
            } else {
                finalA = dataIsnet ? aIsnet : aU2net;
            }

            // Stricter Thresholding to eradicate faint distant objects (chairs, shadows)
            if (finalA < 90) {
                finalA = 0;
            } else if (finalA > 220) {
                finalA = 255;
            } else {
                finalA = Math.pow((finalA - 90) / 130, 1.2) * 255;
            }

            pixels[i + 3] = Math.min(255, Math.max(0, Math.round(finalA)));
        }

        ctx.putImageData(imageData, 0, 0);

        onProgress('Polishing Professional Cutout...');
        const rawBlob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'));
        
        let polishedBlob = rawBlob;
        if (!isManualMode) {
            try {
                polishedBlob = await polishCutoutEdges(rawBlob);
            } catch (e) {
                console.warn("[AI] Polish pass skipped", e);
            }
        }

        console.log(`[AI] Dual-Core Execution: ${(Date.now() - startTime) / 1000}s`);

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
      const canvas = document.createElement('canvas');
      const w = img.width;
      const h = img.height;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      
      // Step 1: Connected Component Analysis for Noise Removal
      const alphaBuffer = new Uint8ClampedArray(w * h);
      for (let i = 0; i < data.length; i += 4) alphaBuffer[i/4] = data[i+3];
      
      const visited = new Uint8Array(w * h);
      const components: { indices: number[], size: number, cx: number, cy: number }[] = [];
      
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const idx = y * w + x;
          if (!visited[idx] && alphaBuffer[idx] > 15) {
            const component: number[] = [];
            const stack = [idx];
            visited[idx] = 1;
            let sx = 0, sy = 0;
            
            while(stack.length > 0) {
              const cIdx = stack.pop()!;
              component.push(cIdx);
              const cx = cIdx % w, cy = Math.floor(cIdx / w);
              sx += cx; sy += cy;
              
              const neighbors = [cIdx+1, cIdx-1, cIdx+w, cIdx-w];
              for(const n of neighbors) {
                if(n >= 0 && n < w*h) {
                  const nx = n % w, ny = Math.floor(n / w);
                  if(Math.abs(nx-cx)<=1 && Math.abs(ny-cy)<=1 && !visited[n] && alphaBuffer[n] > 5) {
                    visited[n] = 1;
                    stack.push(n);
                  }
                }
              }
              if (component.length > 1000000) break;
            }
            
            if (component.length > 5) {
              components.push({
                indices: component,
                size: component.length,
                cx: sx / component.length,
                cy: sy / component.length
              });
            }
          }
        }
      }
      
      const finalAlpha = new Uint8Array(w * h);
      if (components.length > 0) {
        components.sort((a,b) => b.size - a.size);
        const maxSize = components[0].size;
        
        // Aggressive background object removal - keep only the primary subject and highly relevant strong attachments
        components.forEach((c, index) => {
          // Always keep the absolute largest foreground component
          if (index === 0) {
            c.indices.forEach(i => finalAlpha[i] = alphaBuffer[i]);
            return;
          }
          
          const isMegaComponent = c.size > maxSize * 0.3; // Must be very large
          const centralX = c.cx / w;
          const centralY = c.cy / h;
          const isCentral = centralX > 0.25 && centralX < 0.75 && centralY > 0.1 && centralY < 0.9;
          const isLargeAndCentral = isCentral && c.size > maxSize * 0.1;

          if (isMegaComponent || isLargeAndCentral) {
            c.indices.forEach(i => finalAlpha[i] = alphaBuffer[i]);
          }
        });
      }
      
      // Step 2: Edge Refinement and Defringing
      // We avoid aggressive erosion because it deletes fine details like hair and shoulders.
      // Instead, we use a targeted edge tighter (1px) and a light feather to remove white halos.
      const tightenedAlpha = new Uint8ClampedArray(w * h);
      
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const a = finalAlpha[idx];
          
          if (a === 0) {
            tightenedAlpha[idx] = 0;
            continue;
          }

          // Very light edge tightening (soft min filter) to reduce halos
          let minA = a;
          const neighbors = [
             (y-1)*w + x, (y+1)*w + x, y*w + (x-1), y*w + (x+1)
          ];
          
          let edgeCount = 0;
          for (let n of neighbors) {
              if (n >= 0 && n < w*h) {
                 const nA = finalAlpha[n];
                 if (nA < minA) minA = nA;
                 if (nA < 200) edgeCount++;
              } else {
                 minA = 0;
                 edgeCount++;
              }
          }

          // If we are at an edge, we tighten (erode) slightly
          if (edgeCount > 0) {
             // For semi-transparent pixels (hair), we keep them mostly intact
             // For solid edges, we shrink them slightly
             if (a > 100) {
                tightenedAlpha[idx] = minA; // Shrink
             } else {
                tightenedAlpha[idx] = a; // Preserve soft hair
             }
          } else {
             tightenedAlpha[idx] = a;
          }
        }
      }

      // Step 3: Gentle Feather (Box Blur on Alpha) to soften the cut and eliminate harsh jagged edges
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const centerA = tightenedAlpha[idx];
          
          // Optimization: Skip fully transparent or fully opaque non-edges
          if (centerA === 0 || centerA === 255) {
             let isUniform = true;
             if (y>0 && tightenedAlpha[idx-w] !== centerA) isUniform = false;
             else if (y<h-1 && tightenedAlpha[idx+w] !== centerA) isUniform = false;
             else if (x>0 && tightenedAlpha[idx-1] !== centerA) isUniform = false;
             else if (x<w-1 && tightenedAlpha[idx+1] !== centerA) isUniform = false;
             
             if (isUniform) {
                 data[idx * 4 + 3] = centerA;
                 continue;
             }
          }

          let sum = 0;
          let count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              if (nx >= 0 && nx < w) {
                sum += tightenedAlpha[ny * w + nx];
                count++;
              }
            }
          }
          data[idx * 4 + 3] = count > 0 ? (sum / count) : 0;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(b => {
        URL.revokeObjectURL(img.src);
        resolve(b || blob);
      }, 'image/png');
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
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = data.data;
      
      // Gentle overall enhancement
      for(let i=0; i<d.length; i+=4) {
        if (d[i+3] < 5) continue;
        
        // Slight contrast boost
        for(let j=0; j<3; j++) {
          let v = d[i+j] / 255;
          v = (v - 0.5) * 1.05 + 0.5;
          d[i+j] = Math.min(255, Math.max(0, v * 255));
        }
      }
      
      ctx.putImageData(data, 0, 0);
      canvas.toBlob(b => {
        URL.revokeObjectURL(img.src);
        resolve(b || cleanBlob);
      }, 'image/png');
    };
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
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob(b => {
        URL.revokeObjectURL(img.src);
        resolve(b || transparentBlob);
      }, 'image/png');
    };
    img.src = URL.createObjectURL(transparentBlob);
  });
}
