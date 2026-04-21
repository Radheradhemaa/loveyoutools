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
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    
    // Simplest possible check: Is the manifest JSON file reachable?
    const manifestRes = await fetch(`${publicPath}isnet.json`, { 
      method: 'GET', 
      mode: 'cors', 
      cache: 'no-cache', 
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    
    if (!manifestRes.ok) return false;
    
    // Verify it doesn't look like an HTML error page (common on redirects or 404s)
    const contentType = manifestRes.headers.get('content-type') || '';
    if (contentType.includes('text/html')) return false;
    
    const text = await manifestRes.text();
    const cleanText = text.trim();
    if (cleanText.startsWith('<!') || cleanText.startsWith('<html') || !cleanText.startsWith('{')) return false;
    
    return true;
  } catch (e) {
    return false;
  }
}

let isPreloaded = false;
let preloadPromise: Promise<void> | null = null;
let cachedPublicPath: string | null = null;

async function getFastestCDN(): Promise<string> {
  if (cachedPublicPath) return cachedPublicPath;
  
  // Try to find the first working CDN
  for (const publicPath of CDNS) {
    if (await checkCDN(publicPath)) {
      cachedPublicPath = publicPath;
      return publicPath;
    }
  }
  return CDNS[0]; // Fallback
}

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
    
    // 1. Resize for AI Models (512px is the industry standard for fast inference masks)
    // The refinement step handles upscaling to the high-res original.
    const aiResizedSrc = await resizeImageIfNeeded(imageSrc, 512);
    
    // 2. Preserve full original image dimensions for High-Res Output
    const highResSrc = imageSrc;

    onProgress('Running AI Model...');
    let isnetError = null;
    const isnetMaskBlob = await withTimeout(runImglyModel(aiResizedSrc, 'isnet', (p) => onProgress(`Processing: ${Math.round(p * 100)}%`)), 180000, "AI Model Timeout").catch(e => { 
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
        throw new Error("Network Error: The AI models could not be downloaded. This is often caused by a slow connection, a corporate firewall, or an ad-blocker (like uBlock Origin or AdGuard) blocking our model CDNs. \n\nTroubleshooting:\n1. Disable ad-blockers for this site.\n2. Check your internet connection.\n3. If you are on a VPN or corporate network, try a different connection.");
      }
      
      if (detail.includes('WebAssembly') || detail.includes('WASM')) {
        throw new Error("Compatibility Error: Your browser had trouble initializing the AI engine (WebAssembly). \n\nTroubleshooting:\n1. Ensure your browser is up to date.\n2. Try disabling 'Hardware Acceleration' in your browser settings.\n3. Try using a different browser (Chrome or Edge recommended).");
      }

      if (detail.includes('out of memory') || detail.includes('allocation failed')) {
        throw new Error("Memory Error: The AI model failed due to insufficient memory. \n\nTroubleshooting:\n1. Close other browser tabs and apps.\n2. Try a smaller image.\n3. Try a device with more RAM.");
      }

      throw new Error(`AI background removal engine failed to load. \nDetail: ${detail}\n\nPlease try refreshing the page or using a different browser.`);
    }

    onProgress('Refining Edges & Enhancing Quality...');

    // Load original high-res image
    const origImg = await loadImage(highResSrc);

    // Load low-res AI cutout
    const maskImg = await loadImage(URL.createObjectURL(isnetMaskBlob));

    // 3. Clean up the AI mask (Fast JS pass on low-res image)
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskImg.width;
    maskCanvas.height = maskImg.height;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
    maskCtx.drawImage(maskImg, 0, 0);
    
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const pixels = maskData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      let a = pixels[i + 3] / 255.0;

      // Aggressive mask cleanup: clear faint background noise and transparent ghosts
      if (a < 0.45) {
        a = 0;
      } else {
        // Steep smoothstep to sharpen edges and completely cut out weak background artifacts
        let t = (a - 0.45) / 0.55;
        a = t * t * (3 - 2 * t);
      }

      pixels[i + 3] = Math.round(a * 255);
    }
    maskCtx.putImageData(maskData, 0, 0);

    // 4. Apply cleaned mask to High-Res Original
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = origImg.width;
    finalCanvas.height = origImg.height;
    const finalCtx = finalCanvas.getContext('2d')!;

    // Enable high-quality smoothing for the mask upscaling
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = 'high';

    // Draw original high-res image
    finalCtx.drawImage(origImg, 0, 0);

    // Apply the mask
    finalCtx.globalCompositeOperation = 'destination-in';
    finalCtx.drawImage(maskCanvas, 0, 0, finalCanvas.width, finalCanvas.height);

    // Reset composite operation
    finalCtx.globalCompositeOperation = 'source-over';

    // DEFRINGE / HALO REMOVAL (White Color Decontamination)
    // Fixes the issue where hair edges show white color when placed on a new background
    const finalData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
    const finalPixels = finalData.data;

    for (let i = 0; i < finalPixels.length; i += 4) {
      const alpha = finalPixels[i + 3];
      
      // Target semi-transparent edge pixels (the "halo" area)
      if (alpha > 0 && alpha < 245) {
        // Assume the halo is caused by a bright/white original background.
        // We darken the edge pixels based on their transparency to cancel out the white light bleed.
        // A lower alpha means more background was mixed in, so we darken it more.
        const mixRatio = alpha / 255.0; // 0.0 to 1.0
        
        // We pull the RGB values down. A factor between 0.5 (heavy dark) and 1.0 (no dark).
        // For very transparent pixels (e.g. 0.2), factor is 0.5
        // For opaque pixels (e.g. 0.9), factor is ~0.9
        const factor = Math.max(0.5, mixRatio * 1.1); 

        // Also if the pixel is dangerously close to white (high luminance), we aggressively un-whiten it
        const r = finalPixels[i];
        const g = finalPixels[i + 1];
        const b = finalPixels[i + 2];
        const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
        
        // If it's a very bright pixel on the edge, it's almost certainly background bleed
        let applyFactor = factor;
        if (luminance > 180) {
            applyFactor = applyFactor * 0.8; // extra darkening for pure white fringes
        }

        finalPixels[i] = r * applyFactor;
        finalPixels[i + 1] = g * applyFactor;
        finalPixels[i + 2] = b * applyFactor;
      }
    }
    finalCtx.putImageData(finalData, 0, 0);

    // 5. Final Output Generation
    onProgress('Finalizing Image...');
    let finalBlob = await new Promise<Blob>((resolve, reject) => {
      finalCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Final render failed")), 'image/png');
    });

    if (forceWhiteBackground) {
      onProgress('Applying Background...');
      finalBlob = await applyWhiteBackground(finalBlob);
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Background removal completed in ${duration.toFixed(2)}s`);
    
    URL.revokeObjectURL(maskImg.src);
    return finalBlob;

  } catch (error: any) {
    console.error("BG Removal Error:", error);
    throw error;
  }
};

async function runImglyModel(imageSrc: string, model: 'isnet', onProgress: (p: number) => void): Promise<Blob> {
  // Prioritize smaller models (quint8 ~11MB, fp16 ~22MB) over full isnet (~44MB) for slow networks
  const modelsToTry = ['isnet_quint8', 'isnet_fp16', model] as const;
  let lastError: Error | null = null;
  
  const publicPath = await getFastestCDN();

  // 1. Try identified mirrors with prioritized model sizes
  for (const modelName of modelsToTry) {
    try {
      console.log(`Running optimized model ${modelName} (Fast Path)...`);
      ort.env.wasm.wasmPaths = publicPath;
      return await imglyRemoveBackground(imageSrc, {
        model: modelName as any,
        output: { format: 'image/png', quality: 0.7 },
        proxyToWorker: true,
        publicPath,
        device: 'cpu',
        fetchArgs: { mode: 'cors', cache: 'force-cache' },
        progress: (_key, current, total) => { if (total > 0) onProgress(current / total); },
      });
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // If it's a fetch error, move to next model/CDN quickly
      continue;
    }
  }

  // 2. Fallback to other CDNs if the fastest one failed for all model variants
  for (const altPath of CDNS) {
    if (altPath === publicPath) continue;
    try {
      console.log(`Trying alternative CDN: ${altPath}`);
      return await imglyRemoveBackground(imageSrc, {
        model: 'isnet_quint8' as any, // Only try the smallest model on fallback CDNs
        output: { format: 'image/png', quality: 0.7 },
        proxyToWorker: true,
        publicPath: altPath,
        device: 'cpu',
        fetchArgs: { mode: 'cors', cache: 'force-cache' },
        progress: (_key, current, total) => { if (total > 0) onProgress(current / total); },
      });
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  // 2. Final Desperate Fallback: No dedicated publicPath (let library use its internal default)
  try {
    console.log("Desperate Fallback: Using library defaults...");
    return await imglyRemoveBackground(imageSrc, {
      model: 'isnet' as any,
      output: { format: 'image/png', quality: 0.8 },
      proxyToWorker: false, // Try main thread in case worker fetch is blocked
      device: 'cpu',
      progress: (_key, current, total) => { if (total > 0) onProgress(current / total); },
    });
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
  }
  
  const finalError = lastError || new Error("AI Processing failed");
  console.error("Critical Failure: All CDNs and fallback models failed.", finalError);
  throw finalError;
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
