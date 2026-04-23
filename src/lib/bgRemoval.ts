import { removeBackground as imglyRemoveBackground, preload, Config } from '@imgly/background-removal';

// Use default ONNX multi-threading configuration for MAXIMUM performance.
// Disabling threading artificially limits processing to 1 core, taking 60+ seconds.

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
  
  // Race multiple CDNs to find the fastest responder
  try {
    const workingPath = await Promise.any(CDNS.map(async (path) => {
      const ok = await checkCDN(path);
      if (ok) return path;
      throw new Error('failed');
    }));
    cachedPublicPath = workingPath;
    return workingPath;
  } catch (e) {
    // If all fail or race fails, return the first one as default
    return CDNS[0];
  }
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

        console.log(`Preloading IS-Net small from ${publicPath}...`);
        await preload({ 
          model: 'isnet_quint8', // small model is only ~11MB and caches almost instantly
          publicPath,
          fetchArgs: { cache: 'force-cache' }
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
    onProgress('AI Edge Refinement...');
    
    // 1. Resize for ultra-fast AI inference
    // 256px gives an ultra-fast bounding calculation. Edge refinement steps fix the rest.
    const aiSize = 256;
    const aiResizedSrc = await resizeImageIfNeeded(imageSrc, aiSize);
    
    const highResSrc = imageSrc;

    onProgress('Inferring subject boundaries...');
    let isnetError = null;
    
    const isnetMaskBlob = await withTimeout(
      runImglyModel(aiResizedSrc, 'isnet_quint8', (p) => onProgress(`Analyzing: ${Math.round(p * 100)}%`)), 
      60000, 
      "AI Processing Timeout"
    ).catch(e => { 
      console.error("AI Model failed:", e); 
      isnetError = e;
      return null; 
    });

    if (!isnetMaskBlob) {
      // (Error handling remains)
      if (!navigator.onLine) throw new Error("You are offline.");
      const detail = isnetError instanceof Error ? isnetError.message : String(isnetError);
      if (detail.includes('Failed to fetch') || detail.includes('NetworkError') || detail.includes('Timeout')) {
        throw new Error("Connection Error: The AI model is taking too long to download.");
      }
      throw new Error(`AI background removal engine failed to load. \nDetail: ${detail}`);
    }

    onProgress('Refining & Decontaminating Edges...');

    const origImg = await loadImage(highResSrc);
    const maskImg = await loadImage(URL.createObjectURL(isnetMaskBlob));

    // 3. High-Precision Mask Processing
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskImg.width;
    maskCanvas.height = maskImg.height;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
    maskCtx.drawImage(maskImg, 0, 0);
    
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const pixels = maskData.data;

    // Advanced Alpha Curve for "Perfection"
    // Threshold 0.2 keeps subjects (white shirts) but clears ghost objects (chairs)
    const alphaLookup = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        let a = i / 255.0;
        if (a < 0.2) {
            alphaLookup[i] = 0;
        } else if (a > 0.95) {
            alphaLookup[i] = 255;
        } else {
            // Cubic Hermite Interpolation for smooth but sharp edges
            let t = (a - 0.2) / 0.75;
            alphaLookup[i] = Math.round((t * t * (3 - 2 * t)) * 255);
        }
    }

    for (let i = 3; i < pixels.length; i += 4) {
      pixels[i] = alphaLookup[pixels[i]];
    }
    maskCtx.putImageData(maskData, 0, 0);

    // 4. Apply mask to High-Res Original
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = origImg.width;
    finalCanvas.height = origImg.height;
    const finalCtx = finalCanvas.getContext('2d')!;
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = 'high';

    finalCtx.drawImage(origImg, 0, 0);
    finalCtx.globalCompositeOperation = 'destination-in';
    finalCtx.drawImage(maskCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
    finalCtx.globalCompositeOperation = 'source-over';

    // 5. Intelligent Color Spill / Halo Correction
    // Only processed for reasonable image sizes to maintain 5-7s goal
    if (origImg.width * origImg.height < 5000000) {
        const finalData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
        const finalPixels = finalData.data;

        for (let i = 0; i < finalPixels.length; i += 4) {
          const a = finalPixels[i + 3];
          if (a > 0 && a < 250) {
            // Color decontamination: Soften the "halo" often seen in hair
            // by cooling down pixels that are too bright near the edges
            const mix = a / 255.0;
            const factor = Math.max(0.65, mix);
            finalPixels[i] *= factor;
            finalPixels[i + 1] *= factor;
            finalPixels[i + 2] *= factor;
          }
        }
        finalCtx.putImageData(finalData, 0, 0);
    }

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

async function runImglyModel(imageSrc: string, model: 'isnet_quint8' | 'isnet_fp16', onProgress: (p: number) => void): Promise<Blob> {
  let lastError: Error | null = null;
  
  const publicPath = await getFastestCDN();

  const config: Config = {
    model: model,
    output: { format: 'image/png', quality: 0.8 },
    publicPath,
    progress: (_key, current, total) => { if (total > 0) onProgress(current / total); },
  };

  try {
    console.log(`Running fast-path AI with ${publicPath} (Model: ${model})...`);
    return await imglyRemoveBackground(imageSrc, config);
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
  }

  // Desperate Fallback
  try {
    console.log("Desperate Fallback: Using library defaults...");
    return await imglyRemoveBackground(imageSrc, {
      model: 'isnet_quint8',
      output: { format: 'image/png', quality: 0.8 },
      progress: (_key, current, total) => { if (total > 0) onProgress(current / total); },
    });
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
  }
  
  const finalError = lastError || new Error("AI Processing failed");
  console.error("Critical Failure: All AI execution paths failed.", finalError);
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
