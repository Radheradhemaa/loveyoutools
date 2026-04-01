import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';
import cv from '@techstark/opencv-js';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';

let isPreloaded = false;
let selfieSegmentation: SelfieSegmentation | null = null;

const setupMediaPipe = async () => {
  if (selfieSegmentation) return selfieSegmentation;
  
  selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
    }
  });
  
  selfieSegmentation.setOptions({
    modelSelection: 1, // 1 for landscape (better quality), 0 for general
  });
  
  return selfieSegmentation;
};

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  try {
    console.log(`Preloading AI Models...`);
    await Promise.all([
      preload({ model: 'isnet_quint8' }),
      setupMediaPipe()
    ]);
    isPreloaded = true;
    console.log("AI Models Preloaded Successfully");
  } catch (err) {
    console.warn("AI Model Preload failed (will retry on demand):", err);
  }
};

const getRoughMask = async (img: HTMLImageElement): Promise<HTMLCanvasElement> => {
  const segmentation = await setupMediaPipe();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;

  return new Promise((resolve) => {
    segmentation.onResults((results) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    });
    segmentation.send({ image: img });
  });
};

export const hybridRemoveBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void
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

    // Step 1: Instant Rough Mask (MediaPipe) - Under 1 second
    onProgress('Generating Rough Mask...');
    const roughMaskCanvas = await getRoughMask(origImg);
    
    // Create intermediate blob for "instant" feedback
    const roughBlob = await new Promise<Blob | null>(res => roughMaskCanvas.toBlob(res, 'image/png'));
    if (roughBlob) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = origImg.width;
      tempCanvas.height = origImg.height;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.drawImage(origImg, 0, 0);
      tempCtx.globalCompositeOperation = 'destination-in';
      tempCtx.drawImage(roughMaskCanvas, 0, 0);
      
      const cutoutBlob = await new Promise<Blob | null>(res => tempCanvas.toBlob(res, 'image/png'));
      if (cutoutBlob) onProgress('Refining with IS-Net...', cutoutBlob);
    }

    // Step 2: High-Accuracy Refinement (IS-Net)
    // We use the rough mask to help focus the refinement if needed, 
    // but IS-Net is generally more accurate for the whole image.
    onProgress('Refining Details...');
    
    // Max dimension 1024px for high accuracy as requested
    const MAX_DIM = 1024;
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
    const workCtx = workCanvas.getContext('2d')!;
    workCtx.drawImage(origImg, 0, 0, workW, workH);

    const blob = await new Promise<Blob | null>(res => workCanvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error("Failed to create image blob");

    // IS-Net (FP16 optimized in WASM)
    const maskBlob = await imglyRemoveBackground(blob, {
      model: 'isnet_quint8', 
      output: { format: 'image/png' },
      debug: false
    });

    const maskImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load mask"));
      img.src = URL.createObjectURL(maskBlob);
    });

    // Step 3: Post-Processing (OpenCV)
    onProgress('Finalizing Result...');
    // We pass both the rough mask and the IS-Net mask to generate the final result
    const resultBlob = await generateFinalOutput(origImg, maskImg, roughMaskCanvas);
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`Hybrid BG Removal completed in ${duration.toFixed(2)}s`);
    return resultBlob;

  } catch (error: any) {
    console.error("BG Removal Error:", error);
    throw error;
  }
};

async function generateFinalOutput(
  origImg: HTMLImageElement, 
  maskImg: HTMLImageElement,
  roughMaskCanvas: HTMLCanvasElement
): Promise<Blob> {
  const w = origImg.width;
  const h = origImg.height;

  // Step 3.1: Morphological operations (dilate + erode) on a refinement resolution
  const REFINEMENT_DIM = 1024;
  let refW = w;
  let refH = h;
  if (refW > refH && refW > REFINEMENT_DIM) {
    refH = Math.round((refH * REFINEMENT_DIM) / refW);
    refW = REFINEMENT_DIM;
  } else if (refH > REFINEMENT_DIM) {
    refW = Math.round((refW * REFINEMENT_DIM) / refH);
    refH = REFINEMENT_DIM;
  }

  const refCanvas = document.createElement('canvas');
  refCanvas.width = refW; refCanvas.height = refH;
  const refCtx = refCanvas.getContext('2d')!;
  refCtx.drawImage(maskImg, 0, 0, refW, refH);
  const refData = refCtx.getImageData(0, 0, refW, refH);
  
  let alphaArray = new Uint8Array(refW * refH);
  for (let i = 0, j = 0; i < refData.data.length; i += 4, j++) {
    alphaArray[j] = refData.data[i + 3];
  }

  try {
    if (cv && cv.Mat) {
      const alphaMat = new cv.Mat(refH, refW, cv.CV_8UC1);
      alphaMat.data.set(alphaArray);
      
      // Morphological operations (dilate + erode) to clean up edges
      const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
      
      // Dilate then Erode (Closing) to fill small holes
      cv.morphologyEx(alphaMat, alphaMat, cv.MORPH_CLOSE, kernel);
      
      // Erode then Dilate (Opening) to remove small noise
      cv.morphologyEx(alphaMat, alphaMat, cv.MORPH_OPEN, kernel);
      
      // Step 3.2: Gaussian blur on mask edges for smoothing
      cv.GaussianBlur(alphaMat, alphaMat, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
      
      alphaArray.set(alphaMat.data);
      alphaMat.delete(); kernel.delete();
    }
  } catch (e) {
    console.error("OpenCV processing failed", e);
  }

  // Draw refined alpha back
  for (let i = 0, j = 0; i < refData.data.length; i += 4, j++) {
    refData.data[i + 3] = alphaArray[j];
  }
  refCtx.putImageData(refData, 0, 0);

  // Final assembly
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = w; finalCanvas.height = h;
  const ctx = finalCanvas.getContext('2d')!;
  
  ctx.drawImage(origImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  
  const finalMaskCanvas = document.createElement('canvas');
  finalMaskCanvas.width = w; finalMaskCanvas.height = h;
  const finalMaskCtx = finalMaskCanvas.getContext('2d')!;
  
  // Combine IS-Net mask with MediaPipe rough mask to remove distant artifacts
  finalMaskCtx.drawImage(refCanvas, 0, 0, w, h);
  finalMaskCtx.globalCompositeOperation = 'multiply';
  finalMaskCtx.drawImage(roughMaskCanvas, 0, 0, w, h);
  
  const finalMaskData = finalMaskCtx.getImageData(0, 0, w, h);

  for (let i = 0; i < imgData.data.length; i += 4) {
    let alpha = finalMaskData.data[i + 3];
    
    // Step 3.3: Feathering (alpha smoothing)
    // We apply a soft threshold to preserve hair details
    if (alpha < 30) {
        alpha = 0;
    } else if (alpha > 220) {
        alpha = 255;
    } else {
        // Linear interpolation for soft edges
        alpha = Math.round((alpha - 30) * (255 / 190));
    }

    if (alpha === 0) {
        imgData.data[i + 3] = 0;
        continue;
    }

    // Color decontamination (remove background spill)
    if (alpha < 255) {
        const factor = (255 - alpha) / 255;
        const r = imgData.data[i];
        const g = imgData.data[i + 1];
        const b = imgData.data[i + 2];
        const lum = (r * 0.299 + g * 0.587 + b * 0.114);
        imgData.data[i] = Math.round(r * (1 - factor) + lum * factor);
        imgData.data[i + 1] = Math.round(g * (1 - factor) + lum * factor);
        imgData.data[i + 2] = Math.round(b * (1 - factor) + lum * factor);
    }

    imgData.data[i + 3] = alpha;
  }
  
  ctx.putImageData(imgData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate final blob"));
    }, 'image/png');
  });
}
