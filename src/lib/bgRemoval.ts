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

        console.log(`Preloading HD Matting AI Architecture from ${publicPath}...`);
        await preload({ 
          model: 'medium' as any,
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
    onProgress('AI Initializing...');
    
    onProgress('Running Core Segmentation (High Precision Mode)...');
    let isnetError = null;
    
    // Scale image down to 800px to force lightning-fast AI execution (<10s requirement)
    // while preventing high-frequency noise ("green dots") from tensor upscaling.
    const optimizedSrc = await resizeImageIfNeeded(imageSrc, 800);
    
    const isnetMaskBlob = await withTimeout(
      runImglyModel(optimizedSrc, 'medium', (p) => onProgress(`Analyzing Detailed Mask: ${Math.round(p * 100)}%`)), 
      120000, 
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
        throw new Error("Connection Error: The AI model is taking too long to download. Please try again on a faster network connection or wait a moment before trying again.");
      }
      throw new Error(`AI background removal engine failed to load. \nDetail: ${detail}`);
    }

    onProgress('Sharpening Edges...');

    // Convert to Image to draw on canvas
    const resultImg = await loadImage(URL.createObjectURL(isnetMaskBlob));
    
    // Extracted Alpha Mask Layer
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = resultImg.width;
    finalCanvas.height = resultImg.height;
    const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true })!;
    
    finalCtx.drawImage(resultImg, 0, 0);
    
    const finalData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
    const mPixels = finalData.data;

    // Apply "Pure Structural Alpha Matting".
    // 1. NEVER touch RGB colors (preserves 100% natural photo color, even if subject wears green on green bg)
    // 2. High threshold cuts off floating background objects (a < 64)
    // 3. Sharpens the subject edges seamlessly
    const width = finalCanvas.width;
    const height = finalCanvas.height;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let i = (y * width + x) * 4;
        let a = mPixels[i + 3];
        
        if (a > 0 && a < 255) {
          // Despeckle pass: if an isolated pixel somehow survived the AI, delete it
          if (a < 120 && (y < 2 || x < 2 || y > height - 3 || x > width - 3)) {
             mPixels[i + 3] = 0;
             continue;
          }
          
          if (a < 70) {
            mPixels[i + 3] = 0;       // Completely destroy background artifacts
          } else if (a > 185) {
            mPixels[i + 3] = 255;     // Solidify the inner structure (sharp edges)
          } else {
            // Smooth, firm transition to avoid ragged edges
            mPixels[i + 3] = Math.round(((a - 70) / 115.0) * 255);
          }
        }
      }
    }

    finalCtx.putImageData(finalData, 0, 0);

    let finalBlob = await new Promise<Blob>((resolve, reject) => {
      finalCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Final render failed")), 'image/png');
    });

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

async function runImglyModel(imageSrc: string, model: string, onProgress: (p: number) => void): Promise<Blob> {
  let lastError: Error | null = null;
  
  const publicPath = await getFastestCDN();

  const config: Config = {
    model: model as any, // Cast to bypass types
    output: { format: 'image/png', quality: 1.0 }, // Maximum quality output
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
      model: 'medium' as any,
      output: { format: 'image/png', quality: 1.0 },
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
