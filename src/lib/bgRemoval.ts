import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

let isPreloaded = false;
let preloadPromise: Promise<void> | null = null;

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  if (preloadPromise) return preloadPromise;
  
  preloadPromise = (async () => {
    try {
      console.log(`Preloading High-Quality AI Models...`);
      // Using 'isnet' for maximum accuracy and clarity
      await preload({ model: 'isnet' });
      isPreloaded = true;
      console.log("AI Models Preloaded Successfully");
    } catch (err) {
      console.warn("AI Model Preload failed (will retry on demand):", err);
    } finally {
      preloadPromise = null;
    }
  })();
  
  return preloadPromise;
};

/**
 * Advanced AI Image Matting Engine:
 * 1. AI processes a high-res version (1024px) using the full 'isnet' model.
 * 2. Advanced Matting:
 *    - Mask contraction & feathering
 *    - Color decontamination (removing background spill)
 *    - Edge color correction (darkening & saturation)
 *    - Micro-blur & sharpening
 * 3. Mask is applied to the original high-res image for professional quality.
 */
export const hybridRemoveBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void,
  forceWhiteBackground: boolean = false
): Promise<Blob> => {
  const startTime = Date.now();
  try {
    // Load original image at full resolution
    const origImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load original image"));
      img.src = imageSrc;
    });

    // Step 1: Create a high-quality version for the AI (1024px)
    onProgress('Analyzing Image...');
    const aiCanvas = document.createElement('canvas');
    const aiSize = 1024; 
    const scale = Math.min(1, aiSize / Math.max(origImg.width, origImg.height));
    aiCanvas.width = Math.round(origImg.width * scale);
    aiCanvas.height = Math.round(origImg.height * scale);
    const aiCtx = aiCanvas.getContext('2d')!;
    aiCtx.imageSmoothingEnabled = true;
    aiCtx.imageSmoothingQuality = 'high';
    aiCtx.drawImage(origImg, 0, 0, aiCanvas.width, aiCanvas.height);
    const aiDataUrl = aiCanvas.toDataURL('image/jpeg', 0.95);

    // Step 2: Run AI on high-res version using the full 'isnet' model
    onProgress('Removing Background...');
    const maskBlob = await imglyRemoveBackground(aiDataUrl, {
      model: 'isnet', 
      output: { format: 'image/png', quality: 1.0 },
      debug: false,
    });

    // Step 3: Advanced Matting Engine
    onProgress('Refining Edges...');
    const refinedBlob = await advancedMattingEngine(origImg, maskBlob);

    if (forceWhiteBackground) {
      onProgress('Applying Background...');
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = origImg.width;
      finalCanvas.height = origImg.height;
      const ctx = finalCanvas.getContext('2d')!;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
      
      const mattedImg = await new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = URL.createObjectURL(refinedBlob);
      });
      
      ctx.drawImage(mattedImg, 0, 0);
      URL.revokeObjectURL(mattedImg.src);

      return new Promise<Blob>((resolve, reject) => {
        finalCanvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to generate final blob"));
        }, 'image/jpeg', 1.0);
      });
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Advanced Matting completed in ${duration.toFixed(2)}s`);
    return refinedBlob;

  } catch (error: any) {
    console.error("BG Removal Error:", error);
    throw error;
  }
};

/**
 * Advanced Matting Engine:
 * Implements mask refinement, color decontamination, edge correction,
 * and aggressive background cleanup (island removal/hole filling).
 */
async function advancedMattingEngine(origImg: HTMLImageElement, maskBlob: Blob): Promise<Blob> {
  const maskImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Failed to load mask"));
    i.src = URL.createObjectURL(maskBlob);
  });

  const width = origImg.width;
  const height = origImg.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 1. Draw original image
  ctx.drawImage(origImg, 0, 0);
  const origData = ctx.getImageData(0, 0, width, height);
  const origPixels = origData.data;

  // 2. Draw mask to get its data
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(maskImg, 0, 0, width, height);
  const maskData = ctx.getImageData(0, 0, width, height);
  const maskPixels = maskData.data;

  // 3. Advanced Processing
  const resultData = ctx.createImageData(width, height);
  const resultPixels = resultData.data;

  // Use Uint32Array for faster access
  const origBuffer = new Uint32Array(origPixels.buffer);
  const maskBuffer = new Uint32Array(maskPixels.buffer);
  const resultBuffer = new Uint32Array(resultPixels.buffer);

  // Pre-process mask: Island removal and Hole filling
  const refinedAlpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    refinedAlpha[i] = (maskBuffer[i] >> 24) & 0xff;
  }

  // Aggressive Cleanup Pass
  const finalAlpha = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      let a = refinedAlpha[i];

      // Thresholding: Eliminate low-alpha noise (dhaba)
      if (a < 25) a = 0;
      else if (a > 235) a = 255;

      // Island Removal: If a pixel is opaque but surrounded by transparent pixels, it's an artifact
      if (a > 0) {
        let opaqueNeighbors = 0;
        // Check 7x7 area for ultra-aggressive island detection
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              if (refinedAlpha[ny * width + nx] > 40) opaqueNeighbors++;
            }
          }
        }
        // If very few opaque neighbors in a 7x7 area, it's definitely an island/artifact
        if (opaqueNeighbors < 6) a = 0;
      }

      // Hole Filling: If a pixel is transparent but surrounded by opaque pixels, it's a hole
      if (a < 255) {
        let opaqueNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              if (refinedAlpha[ny * width + nx] > 200) opaqueNeighbors++;
            }
          }
        }
        // If mostly surrounded by opaque pixels, fill the hole
        if (opaqueNeighbors > 6) a = 255;
      }

      finalAlpha[i] = a;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const maskA = finalAlpha[i];
      
      if (maskA === 0) {
        resultBuffer[i] = 0;
        continue;
      }

      const origPixel = origBuffer[i];
      let r = origPixel & 0xff;
      let g = (origPixel >> 8) & 0xff;
      let b = (origPixel >> 16) & 0xff;

      // Color Decontamination for edges (maskA < 250)
      if (maskA < 250) {
        let found = false;
        let avgR = 0, avgG = 0, avgB = 0, count = 0;
        
        // Search in a larger radius (up to 7px) for solid foreground pixels
        for (let dy = -7; dy <= 7 && !found; dy++) {
          for (let dx = -7; dx <= 7; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const ni = ny * width + nx;
              if (finalAlpha[ni] > 250) {
                const sample = origBuffer[ni];
                const sr = sample & 0xff;
                const sg = (sample >> 8) & 0xff;
                const sb = (sample >> 16) & 0xff;
                
                // Avoid sampling white/very bright pixels for decontamination
                // Increased threshold to 235 for even more aggressive avoidance
                if (sr < 235 || sg < 235 || sb < 235) {
                  avgR += sr;
                  avgG += sg;
                  avgB += sb;
                  count++;
                  if (count > 12) { 
                    found = true;
                    break;
                  }
                }
              }
            }
          }
        }

        if (count > 0) {
          r = avgR / count;
          g = avgG / count;
          b = avgB / count;
          
          // Edge Color Correction: Counteract white spill by darkening
          // If the original pixel was very bright (likely white spill), darken it significantly
          const origLum = (0.299 * (origPixel & 0xff) + 0.587 * ((origPixel >> 8) & 0xff) + 0.114 * ((origPixel >> 16) & 0xff));
          // More aggressive darkening for bright edges
          const darken = origLum > 160 ? 0.75 : 0.85; 
          
          r = Math.min(255, r * darken);
          g = Math.min(255, g * darken);
          b = Math.min(255, b * darken);
          
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          const sat = 1.25; // More saturation for edges to kill gray/white haze
          r = Math.min(255, Math.max(0, gray + (r - gray) * sat));
          g = Math.min(255, Math.max(0, gray + (g - gray) * sat));
          b = Math.min(255, Math.max(0, gray + (b - gray) * sat));
        } else {
          // If no solid neighbor found, it's likely a thin strand or noise
          // Darken it aggressively to avoid white fringes
          r *= 0.7;
          g *= 0.7;
          b *= 0.7;
        }
      }

      // Final Alpha Refinement: Contract 2.5px to eliminate lingering white fringes
      let a = maskA;
      if (maskA > 0 && maskA < 255) {
        let minNeighborA = maskA;
        // Check 7x7 area for 3px contraction
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const na = finalAlpha[ny * width + nx];
              if (na < minNeighborA) minNeighborA = na;
            }
          }
        }
        // Ultra-aggressive contraction for semi-transparent edges
        // This effectively "eats" the white halo
        a = Math.max(0, minNeighborA - 25); 
      }

      resultBuffer[i] = (a << 24) | (b << 16) | (g << 8) | r;
    }
  }

  ctx.putImageData(resultData, 0, 0);

  // 4. Micro Blur (0.3px) and Subtle Sharpening
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = height;
  const finalCtx = finalCanvas.getContext('2d')!;
  
  finalCtx.filter = 'blur(0.3px) contrast(1.02) saturate(1.02)';
  finalCtx.drawImage(canvas, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob((blob) => {
      if (blob) {
        URL.revokeObjectURL(maskImg.src);
        resolve(blob);
      } else {
        reject(new Error("Matting failed"));
      }
    }, 'image/png');
  });
}
