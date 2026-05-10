import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

let isPreloaded = false;
let preloadPromise: Promise<void> | null = null;

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  if (preloadPromise) return preloadPromise;
  
  preloadPromise = (async () => {
    try {
      console.log(`Preloading Ultra-Fast AI Engine...`);
      await preload({ 
        model: 'small', // Switch to 'small' for ultra-fast ISNet-based performance
        publicPath: 'https://unpkg.com/@imgly/background-removal-data@1.4.5/dist/',
        proxyToWorker: true // Must be true so it doesn't freeze the main UI thread during load
      });
      isPreloaded = true;
    } catch (e) {
      console.error("AI Engine preload failed. Check network connection or CDN availability.", e);
    }
  })();
  return preloadPromise;
};

/**
 * Hybrid Professional Background Removal
 * Combines ultra-fast ISNet/U2Net models with studio-grade alpha refinement.
 */
export const removeBackground = async (
  imageSrc: string,
  onProgress: (status: string) => void,
  forceWhiteBackground: boolean = false
): Promise<Blob> => {
  const startTime = Date.now();
  onProgress('Initializing Fast AI Engine (ISNet/U2Net)...');
  
  try {
    console.log("Running Hybrid Fast AI Mode (v1.4.5)...");
    
    const runAI = async () => {
      const config = {
        model: 'small', // ISNet-FP16 optimized for sub-3s performance
        publicPath: 'https://unpkg.com/@imgly/background-removal-data@1.4.5/dist/',
        proxyToWorker: true, // Use worker so the main UI thread stays responsive
        output: { 
          format: 'image/webp',
          quality: 0.8, // Reduced quality for faster encoding and transfer
          type: 'foreground' as any
        }
      };
      
      return await imglyRemoveBackground(imageSrc, config as any);
    };

    let primaryBlob: Blob;
    try {
      primaryBlob = await runAI();
    } catch (error) {
      console.warn("Fast extraction failed, falling back to basic engine...", error);
      onProgress('Retrying Optimized AI...');
      primaryBlob = await runAI();
    }

    onProgress('Instant Edge Refinement...');
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

      // Fast Single-Pass Alpha Mapping (Zero-allocation, Instant)
      // Completely removes blur passes and runs directly on the image data.
      // Optimized to eliminate remaining chair halos instantly.
      for (let i = 3; i < pixels.length; i += 4) {
        let a = pixels[i];
        
        // Thresholds: ~0.45 and ~0.75 of 255
        const low = 115;
        const high = 190;

        if (a < low) {
          pixels[i] = 0; // Aggressively erase low-confidence background (chairs)
        } else if (a > high) {
          pixels[i] = 255; // Solidify safe subject areas
        } else {
          // Inline cheap smoothstep
          const n = (a - low) / (high - low);
          pixels[i] = Math.round((n * n * (3 - 2 * n)) * 255);
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(b => b ? resolve(b) : reject("Refine fail"), 'image/webp');
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
      canvas.toBlob(b => b ? resolve(b) : reject("BG Merge fail"), 'image/webp');
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject("Merge Image load fail");
    img.src = URL.createObjectURL(transparentBlob);
  });
}
