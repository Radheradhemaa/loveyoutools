import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';
import * as ort from 'onnxruntime-web';

// Explicitly configure ONNX Runtime to avoid requesting threaded WASM files which might not exist on the CDN
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;

const CDNS = [
  'https://static.imgly.com/packages/@imgly/background-removal/1.5.5/dist/',
  'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/dist/',
  'https://unpkg.com/@imgly/background-removal@1.5.5/dist/',
  'https://fastly.jsdelivr.net/npm/@imgly/background-removal@1.5.5/dist/',
  'https://cdn.imgly.com/packages/@imgly/background-removal/1.5.5/dist/'
];

async function checkCDN(publicPath: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    // Check manifest and verify WASM magic word to prevent HTML-as-WASM errors
    const [manifestRes, wasmSimdRes, wasmRes] = await Promise.all([
      fetch(`${publicPath}isnet.json`, { method: 'GET', mode: 'cors', cache: 'no-cache', signal: controller.signal }),
      fetch(`${publicPath}ort-wasm-simd.wasm`, { 
        method: 'GET', 
        mode: 'cors', 
        cache: 'no-cache', 
        signal: controller.signal,
        headers: { 'Range': 'bytes=0-3' } // Only fetch first 4 bytes
      }).catch(() => null),
      fetch(`${publicPath}ort-wasm.wasm`, { 
        method: 'GET', 
        mode: 'cors', 
        cache: 'no-cache', 
        signal: controller.signal,
        headers: { 'Range': 'bytes=0-3' } // Only fetch first 4 bytes
      }).catch(() => null)
    ]);
    
    clearTimeout(timeoutId);
    
    if (!manifestRes.ok) return false;
    
    // Verify manifest is actually JSON
    const contentType = manifestRes.headers.get('content-type') || '';
    if (contentType.includes('text/html')) return false;
    
    const text = await manifestRes.text();
    if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html') || !text.trim().startsWith('{')) return false;

    // Verify WASM magic word (0x00 0x61 0x73 0x6D)
    const checkWasm = async (res: Response | null) => {
      if (res && res.ok) {
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (bytes.length < 4 || bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6D) {
          return false;
        }
        return true;
      }
      return false;
    };

    const isSimdValid = await checkWasm(wasmSimdRes);
    const isWasmValid = await checkWasm(wasmRes);

    if (!isSimdValid && !isWasmValid) {
      console.warn(`CDN ${publicPath} returned invalid WASM magic word for both SIMD and non-SIMD. Likely an HTML 404 page.`);
      return false;
    }
    
    return true;
  } catch (e) {
    return false;
  }
}

let isPreloaded = false;
let preloadPromise: Promise<void> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(res => {
      clearTimeout(timer);
      resolve(res);
    }).catch(err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  if (preloadPromise) return preloadPromise;
  
  preloadPromise = (async () => {
    // Preload IS-Net
    for (const publicPath of CDNS) {
      try {
        console.log(`Checking CDN connectivity: ${publicPath}`);
        const isAvailable = await checkCDN(publicPath);
        if (!isAvailable) {
          console.warn(`CDN unreachable: ${publicPath}`);
          continue;
        }

        console.log(`Preloading IS-Net from ${publicPath}...`);
        await preload({ 
          model: 'isnet', 
          publicPath,
          fetchArgs: { cache: 'no-cache' }
        });
        break;
      } catch (err) {
        console.warn(`Preload failed for ${publicPath}:`, err);
      }
    }
    
    isPreloaded = true;
    console.log("AI Models Preloaded Successfully");
  })().finally(() => {
    preloadPromise = null;
  });
  
  return preloadPromise;
};

export const hybridRemoveBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void,
  forceWhiteBackground: boolean = false
): Promise<Blob> => {
  const startTime = Date.now();
  try {
    onProgress('Optimizing Image for AI Processing...');
    
    // 1. Resize for AI Models (1024px for speed)
    const aiResizedSrc = await resizeImageIfNeeded(imageSrc, 1024);
    
    // 2. Preserve full original image dimensions for High-Res Output
    const highResSrc = imageSrc;

    onProgress('Running AI Model (IS-Net)...');
    let isnetError = null;
    const isnetMaskBlob = await withTimeout(runImglyModel(aiResizedSrc, 'isnet', (p) => onProgress(`IS-Net: ${Math.round(p * 100)}%`)), 180000, "IS-Net Timeout").catch(e => { 
      console.error("ISNet failed:", e); 
      isnetError = e;
      return null; 
    });

    if (!isnetMaskBlob) {
      if (!navigator.onLine) {
        throw new Error("You are offline. Background removal requires an internet connection to load AI models.");
      }
      const detail = isnetError instanceof Error ? isnetError.message : String(isnetError);
      if (detail.includes('Failed to fetch') || detail.includes('NetworkError')) {
        throw new Error("Network Error: Failed to load AI models. This may be due to a slow connection or an ad-blocker blocking our model CDNs. Please try disabling ad-blockers or using a different network.");
      }
      throw new Error(`AI background removal engine failed to load. Detail: ${detail}`);
    }

    onProgress('Processing Mask...');
    
    // 3. Extract pixel data from mask
    const aiImg = await loadImage(aiResizedSrc);
    const width = aiImg.width;
    const height = aiImg.height;

    const isnetAlpha = await getAlphaFromBlob(isnetMaskBlob, width, height);

    // 4. Clean up mask
    let processedAlpha = new Uint8Array(isnetAlpha.length);
    for (let i = 0; i < isnetAlpha.length; i++) {
      const val = isnetAlpha[i] / 255.0;
      // Eliminate grey patches in the background
      if (val < 0.15) {
        processedAlpha[i] = 0;
      } else {
        processedAlpha[i] = Math.round(val * 255);
      }
    }

    // Expand mask outward for safety (prevent edge cutting)
    processedAlpha = dilateMask(processedAlpha, width, height, 2);

    // 5. Island Removal (Kill floating background objects)
    const len = width * height;
    const labels = new Int32Array(len);
    let currentLabel = 1;
    const areas = [0];
    const queue = new Int32Array(len);

    for (let i = 0; i < len; i++) {
      if (processedAlpha[i] > 128 && labels[i] === 0) {
        let area = 0;
        let head = 0, tail = 0;
        queue[tail++] = i;
        labels[i] = currentLabel;

        while (head < tail) {
          const curr = queue[head++];
          area++;
          
          const x = curr % width;
          const y = Math.floor(curr / width);
          if (x > 0 && processedAlpha[curr - 1] > 128 && labels[curr - 1] === 0) { labels[curr - 1] = currentLabel; queue[tail++] = curr - 1; }
          if (x < width - 1 && processedAlpha[curr + 1] > 128 && labels[curr + 1] === 0) { labels[curr + 1] = currentLabel; queue[tail++] = curr + 1; }
          if (y > 0 && processedAlpha[curr - width] > 128 && labels[curr - width] === 0) { labels[curr - width] = currentLabel; queue[tail++] = curr - width; }
          if (y < height - 1 && processedAlpha[curr + width] > 128 && labels[curr + width] === 0) { labels[curr + width] = currentLabel; queue[tail++] = curr + width; }
        }
        areas.push(area);
        currentLabel++;
      }
    }

    let maxArea = 0;
    let maxLabel = 0;
    for (let i = 1; i < areas.length; i++) {
      if (areas[i] > maxArea) { maxArea = areas[i]; maxLabel = i; }
    }

    for (let i = 0; i < len; i++) {
      const label = labels[i];
      if (label > 0 && label !== maxLabel) {
        // Remove object if it's small compared to main subject
        if (areas[label] < maxArea * 0.1) {
          processedAlpha[i] = 0;
        }
      }
    }

    onProgress('Upscaling Mask & Refining Edges...');
    
    // 5. Upscale Mask to High-Res
    const highResImg = await loadImage(highResSrc);
    const hrWidth = highResImg.width;
    const hrHeight = highResImg.height;
    
    const upscaledAlpha = await upscaleMask(processedAlpha, width, height, hrWidth, hrHeight);

    // 6. High-Res Edge Refinement & Color Decontamination
    let finalBlob = await processHighRes(highResImg, upscaledAlpha);

    if (forceWhiteBackground) {
      onProgress('Applying Background...');
      finalBlob = await applyWhiteBackground(finalBlob);
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Background removal completed in ${duration.toFixed(2)}s`);
    return finalBlob;

  } catch (error: any) {
    console.error("BG Removal Error:", error);
    throw error;
  }
};

async function runImglyModel(imageSrc: string, model: 'isnet', onProgress: (p: number) => void): Promise<Blob> {
  const modelsToTry = [model, 'isnet_fp16', 'isnet_quint8'] as const;
  let lastError: Error | null = null;
  const triedCDNs: string[] = [];

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (const modelName of modelsToTry) {
    // Try with explicit CDNs first
    for (const publicPath of CDNS) {
      triedCDNs.push(publicPath);
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`Attempting ${modelName} from ${publicPath} (Worker: true, Attempt: ${attempt})...`);
          
          const isAvailable = await checkCDN(publicPath);
          if (!isAvailable && attempt === 1) {
            console.warn(`CDN check failed for ${publicPath}. Skipping.`);
            break; 
          }

          ort.env.wasm.wasmPaths = publicPath;
          return await imglyRemoveBackground(imageSrc, {
            model: modelName as any,
            output: { format: 'image/png', quality: 1.0 },
            debug: true,
            proxyToWorker: true,
            publicPath,
            device: 'cpu', // Force CPU for better compatibility and to avoid ta[c] errors
            fetchArgs: { 
              mode: 'cors',
              cache: 'default'
            },
            progress: (key: string, current: number, total: number) => {
              if (total > 0) {
                onProgress(current / total);
              }
            },
          });
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          console.warn(`${modelName} Worker failed (Attempt ${attempt}) for ${publicPath}:`, err);
          lastError = err;
          
          if (err.message.includes('Resource metadata not found')) {
            break; 
          }

          if (attempt < 2) {
            await sleep(1500);
            continue;
          }

          // Try without worker as a last resort for this CDN
          try {
            console.log(`Attempting ${modelName} from ${publicPath} (Worker: false)...`);
            ort.env.wasm.wasmPaths = publicPath;
            return await imglyRemoveBackground(imageSrc, {
              model: modelName as any,
              output: { format: 'image/png', quality: 1.0 },
              debug: true,
              proxyToWorker: false,
              publicPath,
              device: 'cpu',
              fetchArgs: { 
                mode: 'cors',
                cache: 'default'
              },
              progress: (key: string, current: number, total: number) => {
                if (total > 0) {
                  onProgress(current / total);
                }
              },
            });
          } catch (e2) {
            console.warn(`${modelName} Main Thread failed for ${publicPath}`, e2);
            lastError = e2 instanceof Error ? e2 : new Error(String(e2));
          }
        }
      }
    }

    // Final fallback: Try without publicPath (let library use its defaults)
    try {
      console.log(`Attempting ${modelName} with library defaults (no publicPath)...`);
      return await imglyRemoveBackground(imageSrc, {
        model: modelName as any,
        output: { format: 'image/png', quality: 1.0 },
        debug: true,
        proxyToWorker: true,
        progress: (key: string, current: number, total: number) => {
          if (total > 0) onProgress(current / total);
        },
      });
    } catch (e3) {
      console.warn(`${modelName} Default attempt failed`, e3);
      lastError = e3 instanceof Error ? e3 : new Error(String(e3));
    }
  }
  
  const errorMessage = lastError ? (lastError.message || String(lastError)) : "Unknown error";
  throw new Error(`Failed to run background removal models. Tried ${triedCDNs.length} CDNs. Last error: ${errorMessage}`);
}

function dilateMask(alpha: Uint8Array, width: number, height: number, passes: number): Uint8Array {
  let current = new Uint8Array(alpha);
  const len = width * height;
  for (let pass = 0; pass < passes; pass++) {
    let temp = new Uint8Array(len);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let i = y * width + x;
        temp[i] = Math.max(current[i], current[i-1], current[i+1], current[i-width], current[i+width]);
      }
    }
    current = temp;
  }
  return current;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

async function getAlphaFromBlob(blob: Blob, width: number, height: number): Promise<Uint8Array> {
  const img = await loadImage(URL.createObjectURL(blob));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = data[i * 4 + 3];
  }
  URL.revokeObjectURL(img.src);
  return alpha;
}

async function upscaleMask(alpha: Uint8Array, srcW: number, srcH: number, dstW: number, dstH: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(srcW, srcH);
  for (let i = 0; i < alpha.length; i++) {
    imgData.data[i * 4] = 255;
    imgData.data[i * 4 + 1] = 255;
    imgData.data[i * 4 + 2] = 255;
    imgData.data[i * 4 + 3] = alpha[i];
  }
  ctx.putImageData(imgData, 0, 0);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstW;
  dstCanvas.height = dstH;
  const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true })!;
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = 'high';
  dstCtx.drawImage(canvas, 0, 0, dstW, dstH);
  
  const dstData = dstCtx.getImageData(0, 0, dstW, dstH).data;
  const dstAlpha = new Uint8Array(dstW * dstH);
  for (let i = 0; i < dstAlpha.length; i++) {
    dstAlpha[i] = dstData[i * 4 + 3];
  }
  return dstAlpha;
}

async function processHighRes(origImg: HTMLImageElement, alpha: Uint8Array): Promise<Blob> {
  const width = origImg.width;
  const height = origImg.height;
  const len = width * height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(origImg, 0, 0);
  const origPixels = ctx.getImageData(0, 0, width, height).data;

  // 1. Expand mask outward for safety (5-10 pixels depending on resolution)
  // We apply a maximum filter (dilation) to expand the solid foreground
  const expandPixels = Math.max(2, Math.round(width / 500)); // Scale expansion with image size
  let expandedAlpha = new Uint8Array(alpha);
  
  // Fast dilation
  for (let pass = 0; pass < expandPixels; pass++) {
    let temp = new Uint8Array(len);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let i = y * width + x;
        temp[i] = Math.max(
          expandedAlpha[i], 
          expandedAlpha[i-1], 
          expandedAlpha[i+1], 
          expandedAlpha[i-width], 
          expandedAlpha[i+width]
        );
      }
    }
    expandedAlpha = temp;
  }
  alpha = expandedAlpha;

  // 2. Soft blending / Feathering (Blur the mask)
  // This creates a smooth transition zone for the guided filter
  const blurRadius = Math.max(2, Math.round(width / 400));
  let blurredAlpha = new Uint8Array(len);
  
  // Fast box blur
  for (let pass = 0; pass < 2; pass++) {
    // Horizontal pass
    let temp = new Uint8Array(len);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0, count = 0;
        for (let dx = -blurRadius; dx <= blurRadius; dx++) {
          let nx = x + dx;
          if (nx >= 0 && nx < width) {
            sum += alpha[y * width + nx];
            count++;
          }
        }
        temp[y * width + x] = sum / count;
      }
    }
    // Vertical pass
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sum = 0, count = 0;
        for (let dy = -blurRadius; dy <= blurRadius; dy++) {
          let ny = y + dy;
          if (ny >= 0 && ny < height) {
            sum += temp[ny * width + x];
            count++;
          }
        }
        blurredAlpha[y * width + x] = sum / count;
      }
    }
    alpha = blurredAlpha;
  }

  // 3. Alpha Matting Refinement (Guided Filter on Boundary Only)
  let refinedAlpha = new Uint8Array(len);
  const radius = 2; // 5x5 window
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      let i = y * width + x;
      
      // Only process boundary pixels to save time and prevent artifacts
      if (alpha[i] === 0 || alpha[i] === 255) {
        refinedAlpha[i] = alpha[i];
        continue;
      }

      let sumA = 0, sumI = 0, sumAI = 0, sumII = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          let ni = (y + dy) * width + (x + dx);
          let intensity = (origPixels[ni*4] + origPixels[ni*4+1] + origPixels[ni*4+2]) / 3;
          sumA += alpha[ni]; sumI += intensity; sumAI += alpha[ni] * intensity; sumII += intensity * intensity; count++;
        }
      }
      let meanA = sumA / count, meanI = sumI / count, meanAI = sumAI / count, meanII = sumII / count;
      let varI = meanII - meanI * meanI, covAI = meanAI - meanI * meanA;
      let a = covAI / (varI + 0.001); 
      let b = meanA - a * meanI;
      let currentIntensity = (origPixels[i*4] + origPixels[i*4+1] + origPixels[i*4+2]) / 3;
      refinedAlpha[i] = Math.max(0, Math.min(255, a * currentIntensity + b));
    }
  }
  alpha = refinedAlpha;

  // Halo & Color Decontamination
  let r = new Uint8Array(len);
  let g = new Uint8Array(len);
  let b = new Uint8Array(len);
  let weight = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    if (alpha[i] > 220) { // Increased threshold to ensure pure foreground colors for bleeding
      r[i] = origPixels[i*4];
      g[i] = origPixels[i*4+1];
      b[i] = origPixels[i*4+2];
      weight[i] = 1;
    }
  }

  for (let pass = 0; pass < 4; pass++) {
    let nextR = new Uint8Array(r);
    let nextG = new Uint8Array(g);
    let nextB = new Uint8Array(b);
    let nextW = new Uint8Array(weight);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let i = y * width + x;
        if (weight[i] === 0 && alpha[i] > 0) {
          let sr=0, sg=0, sb=0, cnt=0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            let ni = ny * width + nx;
            if (weight[ni] > 0) { sr+=r[ni]; sg+=g[ni]; sb+=b[ni]; cnt++; }
          }
        }
      }
          if (cnt > 0) {
            nextR[i] = sr/cnt; nextG[i] = sg/cnt; nextB[i] = sb/cnt; nextW[i] = 1;
          }
        }
      }
    }
    r = nextR; g = nextG; b = nextB; weight = nextW;
  }

  // Final Composition & Feathering
  const resultData = ctx.createImageData(width, height);
  const resultPixels = resultData.data;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let i = y * width + x;
      const idx = i * 4;
      
      // Feathering (3x3 kernel)
      let sumAlpha = alpha[i] * 4 + 
                (alpha[i-1] + alpha[i+1] + alpha[i-width] + alpha[i+width]) * 2 +
                (alpha[i-width-1] + alpha[i-width+1] + alpha[i+width-1] + alpha[i+width+1]) * 1;
      let featheredA = Math.round(sumAlpha / 16);
      
      // Final anti-aliasing smoothstep
      let finalV = featheredA / 255.0;
      finalV = finalV * finalV * (3 - 2 * finalV);
      featheredA = Math.round(finalV * 255);

      if (featheredA > 0) {
        if (weight[i] === 0 || featheredA > 240) {
          resultPixels[idx] = origPixels[idx];
          resultPixels[idx+1] = origPixels[idx+1];
          resultPixels[idx+2] = origPixels[idx+2];
        } else {
          let origW = (featheredA / 255);
          let bleedW = Math.pow(1 - origW, 0.5); 
          let finalOrigW = 1 - bleedW;
          
          resultPixels[idx] = origPixels[idx] * finalOrigW + r[i] * bleedW;
          resultPixels[idx+1] = origPixels[idx+1] * finalOrigW + g[i] * bleedW;
          resultPixels[idx+2] = origPixels[idx+2] * finalOrigW + b[i] * bleedW;
        }
        resultPixels[idx+3] = featheredA;
      }
    }
  }

  ctx.putImageData(resultData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Pipeline failed")), 'image/png');
  });
}

async function resizeImageIfNeeded(dataUrl: string, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      
      if (width <= maxSize && height <= maxSize) {
        resolve(dataUrl);
        return;
      }
      
      if (width > height) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error("Failed to load image for resizing"));
    img.src = dataUrl;
  });
}

async function applyWhiteBackground(transparentBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to apply white background"));
      }, 'image/jpeg', 1.0);
      
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("Failed to load transparent image"));
    img.src = URL.createObjectURL(transparentBlob);
  });
}
