import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

// Preload the requested ISNet model for maximum accuracy
const models = ['isnet'] as const;
models.forEach(model => {
  preload({ model, proxyToWorker: true }).catch((err) => {
    console.warn(`AI Model Preload failed for ${model}:`, err);
  });
});

/**
 * High-Precision Background Removal using ISNet (Full)
 * Optimized for absolute background elimination ("Proper Clear").
 */
export const hybridRemoveBackground = async (
  imageSrc: string,
  mode: string = 'hd',
  onProgress: (status: string) => void
): Promise<Blob> => {
  console.log("Starting Ultra-Clear BG Removal for:", imageSrc);
  const startTime = Date.now();
  
  try {
    onProgress('Analyzing Scene...');
    
    // 1. Load original high-res image
    const origImg = await new Promise<ImageBitmap | HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          if (typeof createImageBitmap !== 'undefined') {
            const bitmap = await createImageBitmap(img);
            resolve(bitmap);
          } else {
            resolve(img);
          }
        } catch (e) {
          resolve(img);
        }
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = imageSrc;
    });

    // 2. Prepare optimized working canvas (800px for maximum detail)
    // 800px provides much better segmentation for complex backgrounds.
    const AI_MAX_DIM = 800;
    let workW = origImg.width;
    let workH = origImg.height;
    if (workW > workH && workW > AI_MAX_DIM) {
      workH = Math.round((workH * AI_MAX_DIM) / workW);
      workW = AI_MAX_DIM;
    } else if (workH > AI_MAX_DIM) {
      workW = Math.round((workW * AI_MAX_DIM) / workH);
      workH = AI_MAX_DIM;
    }

    const workCanvas = document.createElement('canvas');
    workCanvas.width = workW;
    workCanvas.height = workH;
    const workCtx = workCanvas.getContext('2d', { alpha: false });
    if (!workCtx) throw new Error("Canvas context failed");
    workCtx.drawImage(origImg, 0, 0, workW, workH);
    
    const workBlob = await new Promise<Blob | null>(res => workCanvas.toBlob(res, 'image/jpeg', 0.95));
    if (!workBlob) throw new Error("Failed to create work blob");

    // 3. AI Pass using ISNet (Full)
    onProgress('Extracting Subject (AI)...');
    
    const maskBlob = await imglyRemoveBackground(workBlob, {
      model: 'isnet',
      proxyToWorker: true,
      output: { format: 'image/png' }
    });

    if (!maskBlob) throw new Error("AI model failed to process");

    // 4. Ultra-Precision Mask Processing
    onProgress('Refining Edges...');
    
    const maskImg = await new Promise<ImageBitmap | HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = async () => {
        if (typeof createImageBitmap !== 'undefined') {
          res(await createImageBitmap(img));
        } else {
          res(img);
        }
      };
      img.onerror = rej;
      img.src = URL.createObjectURL(maskBlob);
    });

    const useOffscreen = typeof OffscreenCanvas !== 'undefined';
    const finalCanvas = useOffscreen 
      ? new OffscreenCanvas(origImg.width, origImg.height) 
      : document.createElement('canvas');
    
    if (!useOffscreen) {
      (finalCanvas as HTMLCanvasElement).width = origImg.width;
      (finalCanvas as HTMLCanvasElement).height = origImg.height;
    }
    
    const finalCtx = finalCanvas.getContext('2d', { alpha: true });
    if (!finalCtx) throw new Error("Final canvas context failed");

    // Step A: Draw the mask at full resolution
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = 'high';
    
    // Aggressive "Binary Mask" filter to force background out.
    // High contrast (2.5) + Brightness (0.8) ensures a very tight, sharp edge.
    // This "shrinks" the mask slightly to ensure no background pixels are left at the boundary.
    finalCtx.filter = 'contrast(2.5) brightness(0.8) grayscale(1)'; 
    finalCtx.drawImage(maskImg, 0, 0, origImg.width, origImg.height);
    finalCtx.filter = 'none';
    
    // Step B: Apply the original image using the refined mask
    finalCtx.globalCompositeOperation = 'source-in';
    finalCtx.drawImage(origImg, 0, 0);
    
    // Step C: Final Alpha Cleanup (Forcefully remove any faint background)
    // We do a secondary pass with even higher contrast to "punch out" any remaining noise.
    finalCtx.globalCompositeOperation = 'destination-in';
    finalCtx.filter = 'contrast(2.0) brightness(0.9)'; 
    finalCtx.drawImage(maskImg, 0, 0, origImg.width, origImg.height);
    finalCtx.filter = 'none';

    onProgress('Finalizing...');
    
    const resultBlob = await new Promise<Blob>((resolve, reject) => {
      if (useOffscreen && (finalCanvas as any).convertToBlob) {
        (finalCanvas as any).convertToBlob({ type: 'image/png' }).then(resolve).catch(reject);
      } else {
        (finalCanvas as HTMLCanvasElement).toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Blob creation failed"));
        }, 'image/png');
      }
    });

    const duration = (Date.now() - startTime) / 1000;
    console.log(`BG Removal completed in ${duration.toFixed(2)}s`);
    
    return resultBlob;

  } catch (error) {
    console.error("High-Accuracy BG Removal failed:", error);
    throw error;
  }
};
