import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';
import cv from '@techstark/opencv-js';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';

let isPreloaded = false;
let selfieSegmentation: SelfieSegmentation | null = null;

let mpResolver: ((results: any) => void) | null = null;

/**
 * Initialize MediaPipe Selfie Segmentation
 */
const getMediaPipe = async () => {
  if (selfieSegmentation) return selfieSegmentation;
  
  selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
  });
  
  selfieSegmentation.setOptions({
    modelSelection: 1, // 0 for general, 1 for landscape/selfie
  });

  selfieSegmentation.onResults((results) => {
    if (mpResolver) mpResolver(results);
  });
  
  return selfieSegmentation;
};

/**
 * Lazy-load AI models only when needed.
 */
const ensurePreloaded = async (mode: string) => {
  if (isPreloaded && mode !== 'hd') return;
  
  // Use isnet_fp16 for 'fast' and 'smart' modes for better speed/accuracy balance
  const models = mode === 'hd' ? ['isnet'] : ['isnet_fp16'] as const;
  try {
    if (models.length > 0) {
      console.log(`Preloading ${models[0]} Model...`);
      // Add a timeout for preloading
      await Promise.race([
        Promise.all(models.map(model => preload({ model, proxyToWorker: true }))),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Model preload timeout")), 20000))
      ]);
    }
    await getMediaPipe();
    isPreloaded = true;
    console.log("AI Models Preloaded Successfully");
  } catch (err) {
    console.warn("AI Model Preload failed:", err);
  }
};

/**
 * Helper to yield the main thread and prevent "Page Unresponsive" errors.
 */
const yieldThread = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * High-Performance Hybrid AI Background Removal Engine
 * MediaPipe (Fast Base) + U²-Net (Edge Refinement)
 */
export const hybridRemoveBackground = async (
  imageSrc: string,
  mode: string = 'smart', // 'fast', 'smart', 'hd'
  onProgress: (status: string, intermediateBlob?: Blob) => void
): Promise<Blob> => {
  console.log(`Starting Hybrid BG Removal [Mode: ${mode}] for:`, imageSrc);
  const startTime = Date.now();
  
  try {
    onProgress('Initializing Engine...');
    await ensurePreloaded(mode);
    await yieldThread();
    
    // --- Step 1: Input Optimization ---
    onProgress('Optimizing Input...');
    const origImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timeout = setTimeout(() => reject(new Error("Image load timeout")), 15000);
      img.onload = () => { clearTimeout(timeout); resolve(img); };
      img.onerror = () => { clearTimeout(timeout); reject(new Error("Failed to load image")); };
      img.src = imageSrc;
    });

    const MAX_DIM = mode === 'hd' ? 1536 : 1024;
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
    const workCtx = workCanvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!workCtx) throw new Error("Canvas context failed");
    workCtx.drawImage(origImg, 0, 0, workW, workH);
    
    // Compression if needed (>2MB check is hard without blob, so we compress by default for speed)
    const workBlob = await new Promise<Blob | null>(res => workCanvas.toBlob(res, 'image/jpeg', 0.85));
    if (!workBlob) throw new Error("Failed to create work blob");

    // --- Step 2: Fast Segmentation (MediaPipe) ---
    onProgress('Fast Segmentation (MediaPipe)...');
    await yieldThread();
    
    const mp = await getMediaPipe();
    let mpMask: HTMLCanvasElement | null = null;
    
    // Use a promise to wait for MediaPipe results correctly
    const mpResult = await new Promise<HTMLCanvasElement | null>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn("MediaPipe timeout");
        resolve(null);
      }, 5000);

      mpResolver = (results) => {
        clearTimeout(timeout);
        const canvas = document.createElement('canvas');
        canvas.width = workW;
        canvas.height = workH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(results.segmentationMask, 0, 0, workW, workH);
        }
        mpResolver = null;
        resolve(canvas);
      };

      mp.send({ image: workCanvas }).catch(err => {
        console.error("MediaPipe send error:", err);
        clearTimeout(timeout);
        resolve(null);
      });
    });

    if (!mpResult) {
      console.warn("MediaPipe failed, falling back to U²-Net only if possible");
    }
    mpMask = mpResult;

    // Progressive Rendering: Show fast result first (Step 8: Output)
    let intermediateBlob: Blob | null = null;
    if (mpMask) {
      intermediateBlob = await finalizeResult(origImg, mpMask, onProgress);
      onProgress('Fast Result Ready', intermediateBlob);
    }

    // If Fast Mode, we still want accuracy, so we continue to U²-Net refinement
    // but we used isnet_fp16 which is much faster.
    // We only return early if MediaPipe failed completely or if we are in a true "preview" mode.

    // --- Step 3 & 4: Selective U²Net Refinement ---
    onProgress('Edge Refinement (U²-Net)...');
    await yieldThread();

    // Check if we are exceeding 4 seconds already, if so skip U²Net (Step 7)
    if (Date.now() - startTime > 4000 && mode !== 'hd') {
      console.warn("Performance Control: Skipping U²Net due to delay");
      return intermediateBlob || throwError("Processing took too long");
    }

    // Run U²Net on a smaller dimension for speed (Step 4: Selective)
    // Use isnet_fp16 for 'fast' and 'smart' modes for speed
    const AI_DIM = mode === 'hd' ? 640 : 448;
    const modelToUse = mode === 'hd' ? 'isnet' : 'isnet_fp16';
    
    const aiCanvas = document.createElement('canvas');
    aiCanvas.width = AI_DIM;
    aiCanvas.height = Math.round((workH * AI_DIM) / workW);
    const aiCtx = aiCanvas.getContext('2d');
    aiCtx?.drawImage(workCanvas, 0, 0, aiCanvas.width, aiCanvas.height);
    const aiBlob = await new Promise<Blob | null>(res => aiCanvas.toBlob(res, 'image/jpeg', 0.8));
    if (!aiBlob) throw new Error("Failed to create AI blob");

    await yieldThread();

    // Add a timeout for imglyRemoveBackground
    const u2netMaskBlob = await Promise.race([
      imglyRemoveBackground(aiBlob, {
        model: modelToUse,
        proxyToWorker: true,
        output: { format: 'image/png' },
        debug: false
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("U²-Net refinement timeout")), 15000))
    ]);

    const u2netMaskImg = await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      const timeout = setTimeout(() => rej(new Error("Mask image load timeout")), 5000);
      img.onload = () => { clearTimeout(timeout); res(img); };
      img.onerror = () => { clearTimeout(timeout); rej(new Error("Failed to load mask image")); };
      img.src = URL.createObjectURL(u2netMaskBlob);
    });

    // --- Step 5 & 6: Smart Mask Fusion & Cleanup ---
    onProgress('Smart Mask Fusion & Cleanup...');
    await yieldThread();

    const refinedMask = await fuseAndCleanup(mpMask, u2netMaskImg, workW, workH);
    
    const result = await finalizeResult(origImg, refinedMask, onProgress);
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`Hybrid BG Removal completed in ${duration.toFixed(2)}s`);
    return result;

  } catch (error: any) {
    console.error("Hybrid BG Removal failed:", error);
    // Final fallback: try to return whatever we have
    throw error;
  }
};

const throwError = (msg: string): never => {
  throw new Error(msg);
};

/**
 * Step 5 & 6: Mask Fusion and Advanced OpenCV Cleanup
 */
async function fuseAndCleanup(mpMask: HTMLCanvasElement | null, u2netMask: HTMLImageElement, w: number, h: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return mpMask || document.createElement('canvas');

  // Draw U²Net mask (it's a transparent PNG result)
  ctx.drawImage(u2netMask, 0, 0, w, h);
  const u2netData = ctx.getImageData(0, 0, w, h);
  
  // If we have MediaPipe mask, use it to guide the fusion
  if (mpMask) {
    const mpCtx = mpMask.getContext('2d');
    if (mpCtx) {
      const mpData = mpCtx.getImageData(0, 0, w, h);
      // Process in chunks if large
      for (let i = 0; i < u2netData.data.length; i += 4) {
        if (i % 100000 === 0) await yieldThread();
        const mpAlpha = mpData.data[i]; 
        const u2Alpha = u2netData.data[i + 3];
        
        // Strategy: U²-Net is better for hair/edges, MP is better for body stability.
        // We trust U²-Net more at the edges, but MP helps prevent "holes" in the body.
        // If MP says it's definitely foreground (>200) but U²-Net is unsure, we boost U²-Net.
        if (mpAlpha > 200 && u2Alpha < 100) {
          u2netData.data[i + 3] = Math.max(u2Alpha, mpAlpha * 0.8);
        } else if (mpAlpha < 50 && u2Alpha < 50) {
          // If both say background, make it definitely background (removes "shades")
          u2netData.data[i + 3] = 0;
        } else {
          // Otherwise, trust U²-Net's sharp edges
          u2netData.data[i + 3] = u2Alpha;
        }
        
        // Set RGB to white for the mask
        u2netData.data[i] = 255;
        u2netData.data[i + 1] = 255;
        u2netData.data[i + 2] = 255;
      }
    }
  } else {
    for (let i = 0; i < u2netData.data.length; i += 4) {
      u2netData.data[i] = 255;
      u2netData.data[i + 1] = 255;
      u2netData.data[i + 2] = 255;
    }
  }
  
  ctx.putImageData(u2netData, 0, 0);

  // Step 6: Advanced Edge Refinement with OpenCV
  try {
    if (cv.Mat) {
      let src = cv.imread(canvas);
      let gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      
      // 1. Thresholding to remove very faint "shades" (halos)
      // Any alpha below 15 becomes 0
      cv.threshold(gray, gray, 15, 255, cv.THRESH_TOZERO);
      
      // 2. Morphological Closing to fill small holes in the mask
      let kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
      cv.morphologyEx(gray, gray, cv.MORPH_CLOSE, kernel);
      
      // 3. Subtle Erosion to pull back the edge slightly (removes background bleed)
      let erodeKernel = cv.Mat.ones(2, 2, cv.CV_8U);
      cv.erode(gray, gray, erodeKernel, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
      
      // 4. Guided Filter or Bilateral Filter could be here, but Gaussian is faster for real-time
      // We use a very small blur to keep hair edges sharp but not aliased
      cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0.3, 0.3, cv.BORDER_DEFAULT);
      
      // Convert back to RGBA
      let channels = new cv.MatVector();
      let r = cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8U);
      let g = cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8U);
      let b = cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8U);
      r.setTo(new cv.Scalar(255));
      g.setTo(new cv.Scalar(255));
      b.setTo(new cv.Scalar(255));
      
      channels.push_back(r);
      channels.push_back(g);
      channels.push_back(b);
      channels.push_back(gray);
      
      let rgba = new cv.Mat();
      cv.merge(channels, rgba);
      cv.imshow(canvas, rgba);
      
      src.delete(); gray.delete(); kernel.delete(); erodeKernel.delete(); rgba.delete(); channels.delete(); r.delete(); g.delete(); b.delete();
    }
  } catch (e) {
    console.warn("OpenCV edge refinement failed:", e);
  }
  
  return canvas;
}

/**
 * Step 8: Final Output Composition with Color Decontamination
 */
async function finalizeResult(origImg: HTMLImageElement, mask: HTMLCanvasElement, onProgress: (s: string, b?: Blob) => void): Promise<Blob> {
  onProgress('Finalizing Output...');
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = origImg.width;
  finalCanvas.height = origImg.height;
  const finalCtx = finalCanvas.getContext('2d', { alpha: true });
  if (!finalCtx) throw new Error("Final canvas context failed");

  // 1. Draw the mask
  finalCtx.drawImage(mask, 0, 0, origImg.width, origImg.height);
  
  // 2. Clip to the mask
  finalCtx.globalCompositeOperation = 'source-in';
  finalCtx.drawImage(origImg, 0, 0);
  
  // 3. Color Decontamination (Spill Suppression)
  // This removes "shades" or color bleed from the original background at the edges
  const imageData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    if (i % 100000 === 0) await yieldThread();
    const a = data[i + 3];
    if (a > 0 && a < 255) {
      // Semi-transparent pixel (edge)
      // We perform a simple spill suppression: if G or B is much higher than R (assuming green/blue screen)
      // Or just generally desaturate the edge slightly to remove background "shade"
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Simple neutral spill suppression
      const avg = (r + g + b) / 3;
      const factor = (255 - a) / 255; // More suppression for more transparent pixels
      
      data[i] = r * (1 - 0.2 * factor) + avg * (0.2 * factor);
      data[i + 1] = g * (1 - 0.2 * factor) + avg * (0.2 * factor);
      data[i + 2] = b * (1 - 0.2 * factor) + avg * (0.2 * factor);
    }
  }
  finalCtx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Blob creation failed"));
    }, 'image/png');
  });
}
