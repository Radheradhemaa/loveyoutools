import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

// Preload models for the hybrid strategy
preload({ model: 'isnet_fp16', device: 'gpu', proxyToWorker: true }).catch(() => {});

/**
 * Advanced Hybrid Background Removal Engine
 * Optimized for speed and zero-halo quality.
 */
export const hybridRemoveBackground = async (
  imageSrc: string,
  mode: string = 'hd',
  onProgress: (status: string) => void
): Promise<Blob> => {
  try {
    onProgress('Analyzing Scene...');
    
    // 1. Load original high-res image
    const origImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageSrc;
    });

    // 2. Prepare optimized working canvas (Max 1024px for AI Pass - faster)
    const AI_MAX_DIM = 1024;
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
    
    // Use toBlob with lower quality for AI pass to speed up transfer
    const workBlob = await new Promise<Blob>(res => workCanvas.toBlob(b => res(b!), 'image/jpeg', 0.8));

    // 3. AI Pass
    onProgress('Extracting Subject...');
    const maskBlob = await imglyRemoveBackground(workBlob, {
      model: 'isnet_fp16', 
      device: 'gpu',
      proxyToWorker: true,
      output: { format: 'image/png' },
      progress: (step, progress) => {
        const stepName = step.includes('fetch') ? 'Loading AI' : step.includes('compute') ? 'Processing' : 'Finalizing';
        onProgress(`${stepName}: ${Math.round(progress * 100)}%`);
      }
    });

    // 4. Fast Post-Processing Pipeline (Optimized for zero-halo)
    onProgress('Refining Edges...');
    const maskImg = await createImageBitmap(maskBlob);
    
    // Use OffscreenCanvas if available for better performance
    const useOffscreen = typeof OffscreenCanvas !== 'undefined';
    const finalCanvas = useOffscreen 
      ? new OffscreenCanvas(origImg.width, origImg.height) 
      : document.createElement('canvas');
    
    if (!useOffscreen) {
      finalCanvas.width = origImg.width;
      finalCanvas.height = origImg.height;
    }
    
    const finalCtx = finalCanvas.getContext('2d', { alpha: true });
    if (!finalCtx) throw new Error("Canvas context failed");

    // --- Advanced Anti-Halo & Color Decontamination ---
    
    // Step A: Draw the mask first (scaled to full res)
    finalCtx.drawImage(maskImg, 0, 0, origImg.width, origImg.height);
    
    // Step B: Draw the original image only where the mask is (Source-In)
    finalCtx.globalCompositeOperation = 'source-in';
    finalCtx.drawImage(origImg, 0, 0);
    
    // Step C: Color Decontamination (Color Bleed)
    // We create a "bleed" layer by blurring the subject and drawing it behind itself.
    // This replaces background color spill with subject color spill.
    const bleedCanvas = useOffscreen 
      ? new OffscreenCanvas(origImg.width, origImg.height) 
      : document.createElement('canvas');
    if (!useOffscreen) {
      bleedCanvas.width = origImg.width;
      bleedCanvas.height = origImg.height;
    }
    const bleedCtx = bleedCanvas.getContext('2d');
    if (bleedCtx) {
      bleedCtx.filter = 'blur(4px)'; // Expand subject colors
      bleedCtx.drawImage(finalCanvas as any, 0, 0);
      
      finalCtx.globalCompositeOperation = 'destination-over';
      finalCtx.drawImage(bleedCanvas as any, 0, 0);
    }
    
    // Step D: Final Mask Clip & Erosion (Anti-Halo)
    // Re-apply the mask with a slight blur to create soft, natural edges and remove outer glow.
    finalCtx.globalCompositeOperation = 'destination-in';
    finalCtx.filter = 'blur(0.5px)'; // Sub-pixel erosion + smoothing
    finalCtx.drawImage(maskImg, 0, 0, origImg.width, origImg.height);
    finalCtx.filter = 'none';

    onProgress('Finalizing...');
    
    // Use toBlob on the canvas (OffscreenCanvas.convertToBlob or HTMLCanvasElement.toBlob)
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

    return resultBlob;

  } catch (error) {
    console.error("Advanced Hybrid BG Removal failed:", error);
    throw error;
  }
};
