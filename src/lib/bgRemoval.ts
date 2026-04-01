import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

let isPreloaded = false;

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  try {
    console.log(`Preloading AI Models...`);
    await preload({ model: 'isnet_fp16' });
    isPreloaded = true;
    console.log("AI Models Preloaded Successfully");
  } catch (err) {
    console.warn("AI Model Preload failed (will retry on demand):", err);
  }
};

export const hybridRemoveBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void,
  forceWhiteBackground: boolean = false
): Promise<Blob> => {
  const startTime = Date.now();
  try {
    await ensurePreloaded();
    
    const origImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = imageSrc;
    });

    onProgress('Refining Details with AI...');
    
    // IS-Net (FP16 optimized in WASM) - Native output is already perfectly matted
    const maskBlob = await imglyRemoveBackground(imageSrc, {
      model: 'isnet_fp16', 
      output: { format: 'image/png' },
      debug: false,
      progress: (key, current, total) => {
        const percent = Math.round((current / total) * 100);
        if (key.includes('fetch')) {
          onProgress(`Downloading AI Model... ${percent}%`);
        } else if (key === 'compute:inference') {
          onProgress(`AI Processing... ${percent}%`);
        }
      }
    });

    onProgress('Refining Edges & Removing Halos...');
    const refinedBlob = await refineCutout(maskBlob, origImg.width, origImg.height);

    if (!forceWhiteBackground) {
      const duration = (Date.now() - startTime) / 1000;
      console.log(`AI BG Removal completed in ${duration.toFixed(2)}s`);
      return refinedBlob;
    }

    // If white background is forced, composite it natively
    onProgress('Finalizing Result...');
    const maskImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load mask"));
      img.src = URL.createObjectURL(refinedBlob);
    });

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = origImg.width;
    finalCanvas.height = origImg.height;
    const ctx = finalCanvas.getContext('2d')!;
    
    // Draw pure white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    
    // Draw the perfectly matted AI cutout over it
    ctx.drawImage(maskImg, 0, 0, finalCanvas.width, finalCanvas.height);
    
    const resultBlob = await new Promise<Blob>((resolve, reject) => {
      finalCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to generate final blob"));
      }, 'image/jpeg', 1.0);
    });

    const duration = (Date.now() - startTime) / 1000;
    console.log(`AI BG Removal completed in ${duration.toFixed(2)}s`);
    return resultBlob;

  } catch (error: any) {
    console.error("BG Removal Error:", error);
    throw error;
  }
};

async function refineCutout(maskBlob: Blob, origWidth: number, origHeight: number): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Failed to load mask"));
    i.src = URL.createObjectURL(maskBlob);
  });

  const canvas = document.createElement('canvas');
  // Force the canvas to be the original image's dimensions
  const w = origWidth;
  const h = origHeight;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  
  // Draw the mask image, scaling it to the original dimensions if necessary
  ctx.drawImage(img, 0, 0, w, h);
  
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const origData = new Uint8ClampedArray(data);
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = origData[i + 3];
      
      if (alpha < 55) {
        // Very aggressive threshold to eliminate background halos and artifacts
        data[i + 3] = 0;
      } else if (alpha < 240) {
        // Defringe: find nearest opaque pixel within a small radius
        let bestR = origData[i];
        let bestG = origData[i+1];
        let bestB = origData[i+2];
        let maxAlpha = alpha;
        
        // Search a 3x3 window for the most opaque pixel (subject core)
        const radius = 1;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
              const ni = (ny * w + nx) * 4;
              const nAlpha = origData[ni + 3];
              if (nAlpha > maxAlpha) {
                maxAlpha = nAlpha;
                bestR = origData[ni];
                bestG = origData[ni+1];
                bestB = origData[ni+2];
              }
            }
          }
        }
        
        // If we found a significantly more opaque pixel (>220), pull the color towards it
        // This ensures we only borrow color from the subject core, not from other halo pixels
        if (maxAlpha > 220 && maxAlpha > alpha) {
            // The more transparent the pixel, the more we borrow from the opaque neighbor
            const blendFactor = Math.min(1, (240 - alpha) / 160); 
            
            data[i] = Math.round(origData[i] * (1 - blendFactor) + bestR * blendFactor);
            data[i+1] = Math.round(origData[i+1] * (1 - blendFactor) + bestG * blendFactor);
            data[i+2] = Math.round(origData[i+2] * (1 - blendFactor) + bestB * blendFactor);
        }
        
        // Sharpen edges by eroding alpha. More aggressive for lower alpha values to remove halos.
        // We only erode semi-transparent pixels to avoid making the subject core transparent.
        const erosion = alpha < 80 ? 50 : (alpha < 160 ? 35 : (alpha < 220 ? 20 : 0));
        data[i+3] = Math.max(0, alpha - erosion);
      }
    }
  }
  
  ctx.putImageData(imgData, 0, 0);
  
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate refined blob"));
    }, 'image/png');
  });
}
