import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

let isPreloaded = false;
let preloadPromise: Promise<void> | null = null;

// v1.4.5 Aligned Release
const PRIMARY_CDN = 'https://unpkg.com/@imgly/background-removal-data@1.4.5/dist/';
const SECONDARY_CDN = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal-data@1.4.5/dist/';
const TERTIARY_CDN = 'https://static.imgly.com/packages/@imgly/background-removal-data/1.4.5/dist/';

let currentPublicPath = PRIMARY_CDN;

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  if (preloadPromise) return preloadPromise;
  
  preloadPromise = (async () => {
    const tryPreload = async (path: string) => {
      console.log(`Preloading AI Engine (v1.4.5) from ${path}...`);
      await preload({ 
        model: 'medium', 
        publicPath: path,
        proxyToWorker: false
      });
    };

    try {
      await tryPreload(PRIMARY_CDN);
      currentPublicPath = PRIMARY_CDN;
    } catch (e) {
      console.warn("Primary CDN failed, trying secondary...", e);
      try {
        await tryPreload(SECONDARY_CDN);
        currentPublicPath = SECONDARY_CDN;
      } catch (ee) {
        console.warn("Secondary CDN failed, trying tertiary...", ee);
        try {
          await tryPreload(TERTIARY_CDN);
          currentPublicPath = TERTIARY_CDN;
        } catch (eee) {
          console.error("All preloads failed. Check network connection or CDN availability.", eee);
        }
      }
    }

    isPreloaded = true;
  })();
  return preloadPromise;
};

/**
 * Professional High-Precision Background Removal
 * Optimized for high-fidelity extraction with studio-grade alpha refinement.
 */
export const removeBackground = async (
  imageSrc: string,
  onProgress: (status: string) => void,
  forceWhiteBackground: boolean = false
): Promise<Blob> => {
  const startTime = Date.now();
  onProgress('Initializing AI Engine...');
  
  try {
    console.log("Running AI Mode (v1.4.5)...");
    
    const runAI = async (path: string) => {
      const config = {
        model: 'medium',
        publicPath: path,
        proxyToWorker: false,
        output: { 
          quality: 1.0, 
          type: 'foreground' as any
        }
      };
      
      return await imglyRemoveBackground(imageSrc, config as any);
    };

    let primaryBlob: Blob;
    try {
      primaryBlob = await runAI(currentPublicPath);
    } catch (error) {
      console.warn("Primary extraction failed, trying fallback...", error);
      const fallbackPath = currentPublicPath === PRIMARY_CDN ? SECONDARY_CDN : PRIMARY_CDN;
      onProgress('Retrying AI...');
      primaryBlob = await runAI(fallbackPath);
    }

    onProgress('Studio Edge Refinement...');
    return await finalProcess(primaryBlob, forceWhiteBackground, startTime);

  } catch (e) {
    console.error("AI Failure:", e);
    throw new Error(`AI Extraction failed. This usually happens due to temporary CDN outages or large images. Error details: ${e instanceof Error ? e.message : 'Unknown'}`);
  }
};

async function finalProcess(blob: Blob, forceWhite: boolean, start: number): Promise<Blob> {
  let processed = await refineAlphaChannel(blob);
  if (forceWhite) processed = await applyWhiteBackground(processed);
  console.log(`AI Pipeline Complete: ${(Date.now() - start) / 1000}s`);
  return processed;
}

/**
 * High-Precision Alpha Refinement
 * Optimized for complex boundaries like hair, ears, and shoulders.
 * Uses a separable box blur followed by a cubic smoothstep to eliminate jagged edges
 * while keeping boundaries crisp and removing halos.
 */
async function refineAlphaChannel(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
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
      const pixels = imageData.data;

      const alphaBuffer = new Uint8Array(w * h);
      for (let i = 0; i < pixels.length; i += 4) {
        alphaBuffer[i / 4] = pixels[i + 3];
      }

      // Step 1: Fast Separable Box Blur on Alpha (Radius = 2) to smooth jagged edges
      const tempAlpha = new Float32Array(w * h);
      const smoothedAlpha = new Float32Array(w * h);
      const r = 2; // 5x5 blur for higher-quality edge filtering

      // Horizontal pass
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
           let sum = 0; let count = 0;
           for (let dx = -r; dx <= r; dx++) {
             const nx = x + dx;
             if (nx >= 0 && nx < w) {
               sum += alphaBuffer[y * w + nx];
               count++;
             }
           }
           tempAlpha[y * w + x] = sum / count;
        }
      }

      // Vertical pass
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
           let sum = 0; let count = 0;
           for (let dy = -r; dy <= r; dy++) {
             const ny = y + dy;
             if (ny >= 0 && ny < h) {
               sum += tempAlpha[ny * w + x];
               count++;
             }
           }
           smoothedAlpha[y * w + x] = sum / count;
        }
      }

      // Step 2: Adaptive Non-linear Alpha Mapping
      // Uses a strictly tuned vertical gradient to eliminate neck/head halos
      // while maintaining the high-opacity fix for shoulders and clothing.
      for (let i = 0; i < pixels.length; i += 4) {
        const idx = i / 4;
        const relY = Math.floor(idx / w) / h;
        let alpha = smoothedAlpha[idx] / 255;
        
        let tLow: number;
        let tHigh: number;

        // Head & Neck Zone: Precision choke for halos and artifacts near ears
        if (relY < 0.30) {
          tLow = 0.68;  // Increased to aggressively remove white line halos
          tHigh = 0.80; // Sharp transition for facial contours
        } 
        // Shoulder & Chest Zone: Optimized to prevent transparency in shirt
        // while maintaining clear, rounded shoulder structure.
        else if (relY > 0.45) {
          tLow = 0.15;  // Keep low to prevent shoulder clipping
          tHigh = 0.40; 
        } 
        // Transition Zone: Dynamic interpolation between facial and body logic
        else {
          const fade = (relY - 0.30) / (0.45 - 0.30);
          tLow = 0.68 - (0.68 - 0.15) * fade;
          tHigh = 0.80 - (0.80 - 0.40) * fade;
        }

        if (alpha < tLow) {
          alpha = 0; // Cut residual noise/halos
        } else if (alpha > tHigh) {
          alpha = 1; // Solidify interior
        } else {
          const normalized = (alpha - tLow) / (tHigh - tLow);
          // Cubic smoothstep for natural boundary look
          alpha = normalized * normalized * (3 - 2 * normalized);
        }
        
        pixels[i + 3] = Math.round(alpha * 255);
      }
      
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(b => b ? resolve(b) : reject("Refine fail"), 'image/png');
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject("Image load fail");
    img.src = URL.createObjectURL(blob);
  });
}

async function applyWhiteBackground(transparentBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(b => b ? resolve(b) : reject("BG Merge fail"), 'image/png');
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject("Merge Image load fail");
    img.src = URL.createObjectURL(transparentBlob);
  });
}
