import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

let isPreloaded = false;
let preloadPromise: Promise<void> | null = null;

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  if (preloadPromise) return preloadPromise;
  
  preloadPromise = (async () => {
    try {
      console.log(`Initializing IS-Net AI Pipeline...`);
      
      // Preload primary high-fidelity model (IS-Net)
      await preload({ 
        model: 'isnet' as any,
        fetchArgs: { cache: 'force-cache' }
      }).catch(() => {
        // Fallback to fp16 if full isnet fails to preload
        return preload({ 
          model: 'isnet_fp16' as any,
          fetchArgs: { cache: 'force-cache' }
        });
      }).catch(() => {});
      
      isPreloaded = true;
      console.log("IS-Net AI Pipeline Ready");
    } catch (err) {
      console.warn(`AI Initialization failed:`, err);
    }
  })();
  return preloadPromise;
};

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
      const ratio = Math.min(maxSize / width, maxSize / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error("Image reduction failed"));
    img.src = dataUrl;
  });
}

/**
 * High-Quality Background Removal using IS-Net
 */
export const removeBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void,
  forceWhiteBackground: boolean = false,
  safetyMode: boolean = false
): Promise<Blob> => {
  const startTime = Date.now();
  onProgress(safetyMode ? 'Starting safe AI processing...' : 'Starting high-quality AI processing...');
  
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => { 
      img.onload = res; 
      img.onerror = rej; 
      img.src = imageSrc; 
    });

    onProgress('Applying Premium IS-Net processing...');
    
    // Maximize resolution for premium detail preservation (2048px)
    const optimizedSrc = await resizeImageIfNeeded(imageSrc, 2048);
    
    // Primary IS-Net Pipeline
    const isnetOptions: any = {
      model: 'isnet' as any, 
      output: { format: 'image/png', quality: 1.0 },
      debug: false,
      progress: (k: string, curr: number, total: number) => {
        if (total > 0) {
          const percent = Math.round((curr / total) * 100);
          onProgress(`Refining Precision Edges (${percent}%)...`);
        }
      }
    };
    
    const finalBlob = await imglyRemoveBackground(optimizedSrc, isnetOptions);
    
    let processed = finalBlob;
    
    // Apply subject-preservation refinement and studio enhancement in safety mode
    if (safetyMode) {
      onProgress('Studio Lighting & Subject Preservation...');
      processed = await refineEnhanceAndExpand(processed, img);
    }

    if (forceWhiteBackground) {
      onProgress('Applying pure white background...');
      processed = await applyWhiteBackground(processed);
    }
    
    console.log(`IS-Net Process Complete: ${(Date.now() - startTime) / 1000}s`);
    return processed;
  } catch (error: any) {
    console.error("AI failed:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`AI Processing Error: ${errorMessage}. Please try again with a clearer image.`);
  }
};

/**
 * Advanced Safe Refiner & Studio Enhancer: 
 * 1. Dilates mask for safety (no missing parts)
 * 2. Solidifies core to prevent transparency on shoulders/body
 * 3. Cleans ear-head gaps and hair edges
 * 4. Applies Studio Lighting processing
 */
async function refineEnhanceAndExpand(maskBlob: Blob, originalImg: HTMLImageElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const maskImg = new Image();
    maskImg.onload = () => {
      const width = originalImg.width;
      const height = originalImg.height;
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      
      // Get Original Pixels
      const oCanvas = document.createElement('canvas');
      oCanvas.width = width;
      oCanvas.height = height;
      const oCtx = oCanvas.getContext('2d', { willReadFrequently: true })!;
      oCtx.drawImage(originalImg, 0, 0, width, height);
      const oPixels = oCtx.getImageData(0, 0, width, height).data;

      // Get Mask Pixels
      ctx.drawImage(maskImg, 0, 0, width, height);
      const maskData = ctx.getImageData(0, 0, width, height);
      const mPixels = maskData.data;
      
      const alpha = new Uint8Array(width * height);
      for (let i = 0; i < mPixels.length; i += 4) {
        alpha[i/4] = mPixels[i + 3];
      }
      
      // Pass 1: Subject Core Solidification
      // Ensures shoulders and body are 255 (solid) to prevent transparency
      const solidCore = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          let a = alpha[idx];
          
          if (a > 120) {
            // Check if this is likely interior subject
            let highCount = 0;
            const checkRadius = 3;
            for (let dy = -checkRadius; dy <= checkRadius; dy++) {
              for (let dx = -checkRadius; dx <= checkRadius; dx++) {
                const ny = y+dy; const nx = x+dx;
                if (ny >=0 && ny < height && nx >=0 && nx < width) {
                  if (alpha[ny * width + nx] > 100) highCount++;
                }
              }
            }
            // If surrounded by subject pixels, make it fully solid
            if (highCount > 35) a = 255;
          }
          solidCore[idx] = a;
        }
      }

      // Pass 2: Expansion & Safety Dilation
      const safeAlpha = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          let maxA = solidCore[idx];
          if (maxA < 255) {
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                const ny = y+dy; const nx = x+dx;
                if (ny >=0 && ny < height && nx >= 0 && nx < width) {
                  const val = solidCore[ny * width + nx];
                  if (val > maxA) maxA = val;
                }
              }
            }
          }
          safeAlpha[idx] = maxA;
        }
      }

      // Pass 3: Ear-Gap & Stray Patch Deep Cleaning
      // Targets background noise trapped near ears and hair wisps
      const cleanAlpha = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          let a = safeAlpha[idx];
          
          if (a > 0 && a < 255) {
            // Sensitivity is higher in the head/neck area (top 55%)
            const isHeadArea = y < height * 0.55;
            const isShoulderArea = y >= height * 0.55;
            
            if (isHeadArea) {
              // 1. Enhanced 8-Directional Raycasting
              // Detects background trapped in valleys (ear gaps, hair strands)
              const directions = [
                [1, 0], [-1, 0], [0, 1], [0, -1],
                [1, 1], [-1, -1], [1, -1], [-1, 1]
              ];
              let trappedSides = 0;
              const dist = 25; // Deep search for trapped pixels
              
              for (const [dx, dy] of directions) {
                for (let s = 1; s <= dist; s++) {
                  const nx = x + dx * s; const ny = y + dy * s;
                  if (nx < 0 || nx >= width || ny < 0 || ny >= height) break;
                  if (safeAlpha[ny * width + nx] === 255) {
                    trappedSides++;
                    break;
                  }
                }
              }

              // 2. Proximity Analysis
              let solidNeighborCount = 0;
              const radius = 3;
              for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                  const ny = y + dy; const nx = x + dx;
                  if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                    if (safeAlpha[ny * width + nx] > 200) solidNeighborCount++;
                  }
                }
              }

              // Aggressive cleaning for hair/ear gaps:
              // If the pixel is significantly "trapped" by solid mass but itself is not solid, 
              // it's likely background noise bleeding into the subject.
              if (trappedSides >= 3 && a < 200) {
                 a = 0; // Solid erase for trapped background
              } else if (trappedSides >= 2 && a < 170) {
                 a *= 0.3; // Heavy softening for edge noise
              }
              
              // Isolated patch removal
              if (solidNeighborCount < 4 && a < 150) a = 0;
            } else if (isShoulderArea) {
              // Shoulder area Rule: Absolute protection. Do not erase unless it's extremely thin noise.
              let neighborMass = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const ny = y + dy; const nx = x + dx;
                  if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                    if (safeAlpha[ny * width + nx] > 100) neighborMass++;
                  }
                }
              }
              if (neighborMass <= 1 && a < 30) a = 0; 
            }
          }
          cleanAlpha[idx] = a;
        }
      }

      // Pass 4: Studio Lighting & Final Mask Application
      for (let i = 0; i < width * height; i++) {
        const px = i * 4;
        let r = oPixels[px];
        let g = oPixels[px+1];
        let b = oPixels[px+2];

        // Improved Studio Curve
        const x = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const boost = 1.05;
        const curve = (val: number) => {
          const n = val / 255;
          const s = n < 0.5 ? 2 * n * n : 1 - Math.pow(-2 * n + 2, 2) / 2;
          return Math.min(255, Math.round(s * 255 * boost));
        };

        const lift = (val: number) => (val < 90 ? val + (90 - val) * 0.2 : val);

        r = lift(curve(r));
        g = lift(curve(g));
        b = lift(curve(b));

        // Mask Thresholding (Pass 3 logic merged here)
        let a = cleanAlpha[i];
        const floor = 50; // Slightly higher floor to eliminate soft background haze
        const ceiling = 180; // Lower ceiling to solidify hair edges faster
        if (a < floor) a = 0;
        else if (a > ceiling) a = 255;
        else {
          const t = (a - floor) / (ceiling - floor);
          // Stronger power curve (1.3) for crisp, professional hair cutouts
          a = Math.round(Math.pow(t, 1.3) * 255);
        }

        mPixels[px] = r;
        mPixels[px+1] = g;
        mPixels[px+2] = b;
        mPixels[px+3] = a;
      }
      
      ctx.putImageData(maskData, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(maskImg.src);
        if (blob) resolve(blob);
        else reject(new Error("Subject enhancement failed"));
      }, 'image/png');
    };
    maskImg.onerror = reject;
    maskImg.src = URL.createObjectURL(maskBlob);
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
        else reject(new Error("Merge failed"));
      }, 'image/png');
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("BG Apply failed"));
    img.src = URL.createObjectURL(transparentBlob);
  });
}


