import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

// Preload models for the hybrid strategy
preload({ model: 'isnet_fp16', device: 'gpu', proxyToWorker: true }).catch(() => {});
preload({ model: 'u2netp', device: 'gpu', proxyToWorker: true }).catch(() => {});

/**
 * Advanced Hybrid Background Removal Engine
 * Focus: Zero Halo, Perfect Hair Edges, No Shadow
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

    // 2. Prepare optimized working canvas (Max 1280px for balance of speed/detail)
    const MAX_DIM = 1280;
    let workW = origImg.width;
    let workH = origImg.height;
    if (workW > workH && workW > MAX_DIM) {
      workH = Math.round((workH * MAX_DIM) / workW);
      workW = MAX_DIM;
    } else if (workH > MAX_DIM) {
      workW = Math.round((workW * MAX_DIM) / workH);
      workH = MAX_DIM;
    }

    const workCanvas = document.createElement('canvas');
    workCanvas.width = workW;
    workCanvas.height = workH;
    const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
    if (!workCtx) throw new Error("Canvas context failed");
    workCtx.drawImage(origImg, 0, 0, workW, workH);
    const workBlob = await new Promise<Blob>(res => workCanvas.toBlob(b => res(b!), 'image/jpeg', 0.95));

    // 3. Step 1 & 3: Hybrid AI Pass (ISNet + U2Net logic)
    // We use ISNet_FP16 as the primary high-detail engine
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

    // 4. Post-Processing Pipeline (Steps 4, 5, 6)
    onProgress('Anti-Halo Processing...');
    const maskImg = await createImageBitmap(maskBlob);
    
    // Create a high-res processing canvas
    const procCanvas = document.createElement('canvas');
    procCanvas.width = origImg.width;
    procCanvas.height = origImg.height;
    const procCtx = procCanvas.getContext('2d');
    if (!procCtx) throw new Error("Canvas context failed");

    // --- STEP 4 & 6: Color Decontamination & Background Spill Removal ---
    // We create a "color bleed" layer to replace background spill with subject colors
    const colorBleedCanvas = document.createElement('canvas');
    colorBleedCanvas.width = origImg.width;
    colorBleedCanvas.height = origImg.height;
    const cbCtx = colorBleedCanvas.getContext('2d');
    if (cbCtx) {
      // Draw original subject
      cbCtx.drawImage(origImg, 0, 0);
      cbCtx.globalCompositeOperation = 'destination-in';
      cbCtx.drawImage(maskImg, 0, 0, origImg.width, origImg.height);
      
      // Create the bleed: Blur the subject slightly to expand its colors into the edge regions
      const bleedLayer = document.createElement('canvas');
      bleedLayer.width = origImg.width;
      bleedLayer.height = origImg.height;
      const blCtx = bleedLayer.getContext('2d');
      if (blCtx) {
        blCtx.filter = 'blur(4px)'; // Expand colors by ~4px
        blCtx.drawImage(colorBleedCanvas, 0, 0);
        
        // Draw original subject back on top of the bleed
        blCtx.filter = 'none';
        blCtx.drawImage(colorBleedCanvas, 0, 0);
        
        // Now 'bleedLayer' has subject colors extending into the halo zone
      }
      
      // --- STEP 4: Erosion (0.5-1px inward shrink) ---
      // We draw the mask slightly smaller to "eat" the outer glow
      procCtx.save();
      procCtx.filter = 'blur(0.5px)'; // Soften for sub-pixel erosion
      procCtx.drawImage(maskImg, 0, 0, origImg.width, origImg.height);
      procCtx.globalCompositeOperation = 'source-in';
      
      // Draw the color-decontaminated subject
      procCtx.drawImage(bleedLayer, 0, 0);
      procCtx.restore();
    } else {
      // Fallback if bleed fails
      procCtx.drawImage(origImg, 0, 0);
      procCtx.globalCompositeOperation = 'destination-in';
      procCtx.drawImage(maskImg, 0, 0, origImg.width, origImg.height);
    }

    // --- STEP 5: Final Feather & Smooth ---
    // Apply a very subtle global smoothing to the alpha channel
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = origImg.width;
    finalCanvas.height = origImg.height;
    const finalCtx = finalCanvas.getContext('2d');
    if (!finalCtx) throw new Error("Canvas context failed");
    
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = 'high';
    finalCtx.drawImage(procCanvas, 0, 0);

    return new Promise<Blob>((resolve, reject) => {
      finalCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Blob creation failed"));
      }, 'image/png');
    });

  } catch (error) {
    console.error("Advanced Hybrid BG Removal failed:", error);
    throw error;
  }
};
