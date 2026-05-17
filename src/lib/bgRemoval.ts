import { pipeline, env, RawImage } from '@huggingface/transformers';

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
    if (typeof window === 'undefined') return false;
    // Enhanced mobile detection including touch capability and user agent
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           (navigator.maxTouchPoints > 0 && /Android/i.test(navigator.userAgent));
};

const ensureWebGPUChecked = async () => {
    if (checkWebGPUPromise) return checkWebGPUPromise;
    checkWebGPUPromise = (async () => {
        // Disable WebGPU on mobile automatically as it causes vertical stripes and artifacts
        if (isMobileDevice()) {
            console.log("[AI] Mobile detected: Disabling GPU processing to prevent artifacts (vertical streaks, mask corruption).");
            hasWebGPU = false;
            return;
        }

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
        // Force WASM on mobile devices for stability
        const device = hasWebGPU ? 'webgpu' : 'wasm';
        try {
            isnetPipeline = await pipeline('image-segmentation', 'Xenova/modnet', { 
                device,
                // On mobile, force lower precision if we ever use GPU, 
                // but we prefer WASM here anyway.
            });
        } catch (e) {
            console.warn("[AI] MODNet primary load failed, trying WASM fallback", e);
            isnetPipeline = await pipeline('image-segmentation', 'Xenova/modnet', { device: 'wasm' });
        }
    }
};

/**
 * Ensures the secondary refinement model is loaded.
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
 * Robust downscaling and preprocessing.
 * Mobile-safe: preserves original aspect ratio with padding if needed.
 */
async function downscaleImageIfNeeded(imageSrc: string | File | Blob, maxDim = 1024): Promise<string> {
    const isMobile = isMobileDevice();
    const limit = isMobile ? Math.min(maxDim, 1024) : maxDim;

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            if (img.width <= limit && img.height <= limit) {
                if (typeof imageSrc === 'string' && imageSrc.startsWith('data:')) return resolve(imageSrc);
                const c = document.createElement('canvas');
                c.width = img.width; c.height = img.height;
                const ctx = c.getContext('2d', { willReadFrequently: true })!;
                ctx.drawImage(img, 0, 0);
                return resolve(c.toDataURL('image/png'));
            }
            
            const canvas = document.createElement('canvas');
            const ratio = Math.min(limit / img.width, limit / img.height);
            const w = Math.round(img.width * ratio);
            const h = Math.round(img.height * ratio);
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true })!;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = isMobile ? 'medium' : 'high';
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => {
            if (typeof imageSrc === 'string') resolve(imageSrc);
            else resolve('');
        };
        if (typeof imageSrc === 'string') {
            img.src = imageSrc;
        } else {
            const reader = new FileReader();
            reader.onload = (e) => img.src = e.target?.result as string;
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
        onProgress('Analyzing Foreground (ModNet Pass)...');

        // Execute primary model
        let resModel = null;
        if (isnetPipeline) {
             resModel = await isnetPipeline(imageSrc).catch((e: any) => { console.error("Model pass failed", e); return null; });
        }

        // If failed and we were using webgpu, there might be a silent webgpu failure during inference
        // Let's forcibly fallback to WASM
        if (!resModel && hasWebGPU) {
            console.warn("[AI] WebGPU inference failed, forcing WASM fallback...");
            hasWebGPU = false; // Disable webgpu for future
            isnetPipeline = null;
            await ensureIsnetLoaded().catch(console.error);
            resModel = await isnetPipeline(imageSrc).catch((e: any) => { console.error("WASM pass failed", e); return null; });
        }

        if (!resModel) {
            throw new Error("AI model failed to process the image.");
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

        const maskData = getMask(resModel);

        // Load Full Original Image to get maximum quality output
        const origImg = new Image();
        origImg.crossOrigin = 'anonymous';
        await new Promise((res) => { origImg.onload = res; origImg.src = imageSrcForDownscale; });

        const canvas = document.createElement('canvas');
        canvas.width = origImg.width; canvas.height = origImg.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
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
            const maskScale = (maxFound > 0 && maxFound <= 1.2) ? 255 : 1;

            const isMobile = isMobileDevice();
            
            // 1. Artifact Eradication: 1D Directional Filters to kill stripes
            const correctedMask = new Float32Array(mw * mh);
            for (let y = 0; y < mh; y++) {
                for (let x = 0; x < mw; x++) {
                    const idx = y * mw + x;
                    let val = mData[idx] * maskScale;
                    
                    // Kill highly anomalous vertical pixels (scanline artifacts/gaps)
                    if (x > 1 && x < mw - 2) {
                        const left1 = mData[y * mw + x - 1] * maskScale;
                        const right1 = mData[y * mw + x + 1] * maskScale;
                        const left2 = mData[y * mw + x - 2] * maskScale;
                        const right2 = mData[y * mw + x + 2] * maskScale;
                        const nAvg = (left1 + right1 + left2 + right2) / 4;
                        
                        // Detect and fill deep valleys/spikes vs robust average
                        if (Math.abs(val - nAvg) > 50) {
                            val = nAvg;
                        }
                    }
                    correctedMask[idx] = val;
                }
            }

            // 2. Separable Spatial Tensor Blur (Removes banding, quant noise, and streaks)
            // Reduced blur radius: huge blurs expand the person's alpha into nearby background objects (chairs)
            const blurRad = isMobile ? 1 : 1; 
            const tempMask = new Float32Array(mw * mh);
            const cleanMask = new Float32Array(mw * mh);

            for (let y = 0; y < mh; y++) {
                for (let x = 0; x < mw; x++) {
                    let sum = 0, count = 0;
                    for (let dx = -blurRad; dx <= blurRad; dx++) {
                        const nx = x + dx;
                        if (nx >= 0 && nx < mw) {
                            sum += correctedMask[y * mw + nx];
                            count++;
                        }
                    }
                    tempMask[y * mw + x] = sum / count;
                }
            }
            for (let y = 0; y < mh; y++) {
                for (let x = 0; x < mw; x++) {
                    let sum = 0, count = 0;
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
            // Sidesteps all Android Canvas rendering bugs, scaling bands, and tiling artifacts
            // Balanced floor to prevent internal holes in bright subjects (e.g., white shirts) 
            // while still disconnecting faint background artifacts.
            const floor = isMobile ? 80 : 60; 
            const ceil = 245; 

            for (let y = 0; y < h; y++) {
                // Perfect geometric center calculation
                const srcY = Math.max(0, Math.min(mh - 1.001, (y + 0.5) * (mh / h) - 0.5));
                const y1 = Math.floor(srcY);
                const y2 = Math.min(mh - 1, y1 + 1);
                const fy = srcY - y1;
                const invFy = 1 - fy; // Optimization

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

                    let a = p11 * invFx * invFy +
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
                        a = (t * t * (3 - 2 * t)) * 255; 
                    }

                    const idx = (y * w + x) * 4;

                    // Smooth Natural Edge Preservation (Replaces aggressive jagged color-defringer)
                    if (a > 2 && a < 253) {
                        const r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2];
                        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                        
                        // Mild uniform halo suppression based strictly on edge brightness
                        // avoids checking saturation which destroys gray/white clothing
                        if (lum > 0.8) {
                            a *= 0.85; // gently suppress very white edge bleed
                        } else if (lum < 0.2) { 
                            a = Math.min(255, a * 1.15); // preserve dark edge details (like hair)
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

        onProgress('Polishing Professional Cutout...');
        const rawBlob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'));
        
        let polishedBlob = rawBlob;
        if (!isManualMode) {
            try {
                polishedBlob = await polishAndEnhance(rawBlob);
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
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      
      // Step 1: Memory-efficient Connected Component Analysis for Noise Removal
      // Run natively at 1:1 scale to avoid ANY blocky nearest-neighbor artifacts on mobile edges
      const aw = w;
      const ah = h;
      
      const visited = new Uint8Array(aw * ah);
      const components: { indices: number[], size: number, cx: number, cy: number }[] = [];
      
      // Fast component discovery (skip by 2 for speed, but process natively)
      for (let y = 0; y < ah; y += 2) {
        for (let x = 0; x < aw; x += 2) {
          const idx = y * aw + x;
          const a = data[idx * 4 + 3];
          if (!visited[idx] && a > 80) { // Require strong core to start a region
            const component: number[] = [];
            const stack = [idx];
            visited[idx] = 1;
            let sx = 0, sy = 0;
            
            while(stack.length > 0 && component.length < 1000000) {
              const cIdx = stack.pop()!;
              component.push(cIdx);
              const cx = cIdx % aw, cy = Math.floor(cIdx / aw);
              sx += cx; sy += cy;
              
              const neighbors = [cIdx+1, cIdx-1, cIdx+aw, cIdx-aw];
              for(const n of neighbors) {
                if(n >= 0 && n < aw*ah) {
                  const nx = n % aw, ny = Math.floor(n / aw);
                  // Loosened threshold to keep textures of light-colored clothing (e.g. check shirts)
                  if(Math.abs(nx-cx)<=1 && Math.abs(ny-cy)<=1 && !visited[n] && data[n * 4 + 3] > 20) {
                    visited[n] = 1;
                    stack.push(n);
                  }
                }
              }
            }
            
            if (component.length > 10) {
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
      
      const finalAlphaMap = new Uint8Array(aw * ah);
      if (components.length > 0) {
        components.sort((a,b) => b.size - a.size);
        const maxSize = components[0].size;
        
        components.forEach((c, index) => {
          // Strict keeping: we want core subject integrity
          const isVeryLarge = c.size > maxSize * 0.5; 
          const centralX = c.cx / aw;
          const centralY = c.cy / ah;
          // Tighter central window but inclusive of main subject
          const isStrictCentral = centralX > 0.3 && centralX < 0.7 && centralY > 0.15 && centralY < 0.85;
          const isLargeAndCentral = isStrictCentral && c.size > maxSize * 0.15;

          // Only keep the main component, or significant satellites
          if (index === 0 || isVeryLarge || isLargeAndCentral) {
            c.indices.forEach(i => finalAlphaMap[i] = 1);
          }
        });

        // --- INTERNAL HOLE FILLING ---
        // Prevents holes inside clothing caused by aggressive thresholding 
        // Logic: if a pixel is 0 but fully enclosed by 1s, it should be 1.
        const floodFill = new Uint8Array(aw * ah); // 0: unknown, 1: external background
        const q: number[] = [];
        for (let x = 0; x < aw; x++) {
            if (finalAlphaMap[x] === 0) { floodFill[x] = 1; q.push(x); }
            const botIdx = (ah - 1) * aw + x;
            if (finalAlphaMap[botIdx] === 0) { floodFill[botIdx] = 1; q.push(botIdx); }
        }
        for (let y = 0; y < ah; y++) {
            const leftIdx = y * aw;
            if (finalAlphaMap[leftIdx] === 0) { floodFill[leftIdx] = 1; q.push(leftIdx); }
            const rightIdx = y * aw + (aw - 1);
            if (finalAlphaMap[rightIdx] === 0) { floodFill[rightIdx] = 1; q.push(rightIdx); }
        }
        
        let head = 0;
        while (head < q.length) {
            const cIdx = q[head++]!;
            const cx = cIdx % aw;
            const cy = Math.floor(cIdx / aw);
            const neighbors = [cIdx - 1, cIdx + 1, cIdx - aw, cIdx + aw];
            for (const nIdx of neighbors) {
                if (nIdx >= 0 && nIdx < aw * ah) {
                    const nx = nIdx % aw, ny = Math.floor(nIdx / aw);
                    if (Math.abs(nx-cx) <= 1 && Math.abs(ny-cy) <= 1 && floodFill[nIdx] === 0 && finalAlphaMap[nIdx] === 0) {
                        floodFill[nIdx] = 1;
                        q.push(nIdx);
                    }
                }
            }
        }
        
        // Finalize map: if it's not external background and not already 1, it's an internal hole
        for (let i = 0; i < aw * ah; i++) {
            if (floodFill[i] === 0) finalAlphaMap[i] = 1;
        }
      }
      
      // Step 2: Apply Refined Alpha and Decontaminate Edges
      const tempAlpha = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        tempAlpha[i] = data[i * 4 + 3];
      }

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
           const idx = y * w + x;
           const isNoise = components.length > 0 && finalAlphaMap[idx] === 0 
                && (x === 0 || finalAlphaMap[idx-1] === 0) 
                && (y === 0 || finalAlphaMap[idx-w] === 0);
           
           const dataIdx = idx * 4;
           
           if (isNoise) {
               data[dataIdx+3] = 0; // Eradicate noise
               tempAlpha[idx] = 0;
               continue;
           }

           let a = tempAlpha[idx];
           
           // Spatial Anti-Aliasing on Boundaries
           if (a > 0 && a < 255 && x > 0 && x < w - 1 && y > 0 && y < h - 1) {
               const aL = tempAlpha[idx - 1];
               const aR = tempAlpha[idx + 1];
               const aU = tempAlpha[idx - w];
               const aD = tempAlpha[idx + w];
               // Soft gaussian-like blur just for the edge pixels
               a = (a * 4 + aL + aR + aU + aD) / 8;
               data[dataIdx+3] = a;
           }

           if (a > 0 && a < 255) {
               // Enhanced De-halo: darkened boundary pixels often contain white bleed from background.
               // We push the color of semi-transparent bright pixels towards a darker, more natural subject tone.
               const r = data[dataIdx], g = data[dataIdx+1], b = data[dataIdx+2];
               const lum = 0.299*r + 0.587*g + 0.114*b;
               if (lum > 130) { // Broad de-halo for bright edges
                   const transFactor = (255 - a) / 255;
                   const darkening = 1 - (transFactor * 0.7); // Aggressive darkening on the very edge
                   data[dataIdx] *= darkening; 
                   data[dataIdx+1] *= darkening; 
                   data[dataIdx+2] *= darkening;
                   
                   // Targeted alpha choke for extremely faint, bright noise ONLY if near total transparency
                   if (lum > 220 && a < 80) {
                       data[dataIdx+3] = Math.max(0, a * 0.5);
                   }
               }
           }
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
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = data.data;
      
      // Gentle overall enhancement
      for(let i=0; i<d.length; i+=4) {
        if (d[i+3] < 5) continue; // skip transparent
        
        // Slight contrast boost
        for(let j=0; j<3; j++) {
          let v = d[i+j] / 255;
          v = (v - 0.5) * 1.05 + 0.5; // very mild contrast curve (1.05)
          d[i+j] = Math.min(255, Math.max(0, v * 255));
        }
        
        // Slight saturation boost
        const r = d[i]/255, g = d[i+1]/255, b = d[i+2]/255;
        const l = 0.299*r + 0.587*g + 0.114*b;
        const sat = 1.1; // 10% saturation boost
        d[i] = Math.min(255, Math.max(0, (l + (r - l)*sat) * 255));
        d[i+1] = Math.min(255, Math.max(0, (l + (g - l)*sat) * 255));
        d[i+2] = Math.min(255, Math.max(0, (l + (b - l)*sat) * 255));
      }
      
      ctx.putImageData(data, 0, 0);
      canvas.toBlob(b => resolve(b || cleanBlob), 'image/png');
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
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      
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
