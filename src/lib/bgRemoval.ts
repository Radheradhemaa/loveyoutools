import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';
import cv from '@techstark/opencv-js';

let isPreloaded = false;

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  try {
    console.log(`Preloading AI Models...`);
    await Promise.race([
      preload({ model: 'isnet_quint8' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Model preload timeout")), 15000))
    ]);
    isPreloaded = true;
    console.log("AI Models Preloaded Successfully");
  } catch (err) {
    console.warn("AI Model Preload failed (will retry on demand):", err);
  }
};

export const hybridRemoveBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void
): Promise<Blob> => {
  const startTime = Date.now();
  try {
    // Skip redundant status updates for "instant" feel
    await ensurePreloaded();
    
    const origImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = imageSrc;
    });

    // Max dimension 240px for extreme "instant" feel (sub-1s target)
    const MAX_DIM = 240;
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

    onProgress('Removing Background...');
    // No artificial progress delay for "instant" feel

    const blob = await new Promise<Blob | null>(res => workCanvas.toBlob(res, 'image/png'));
    if (!blob) {
      throw new Error("Failed to create image blob");
    }

    // Use isnet_quint8 for lightning speed with professional edge quality
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

    onProgress('Finalizing Result...');
    const resultBlob = await generateFinalOutput(origImg, maskImg);
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`BG Removal completed in ${duration.toFixed(2)}s`);
    return resultBlob;

  } catch (error: any) {
    console.error("BG Removal Error:", error);
    throw error;
  }
};

async function generateFinalOutput(origImg: HTMLImageElement, maskImg: HTMLImageElement): Promise<Blob> {
  const w = origImg.width;
  const h = origImg.height;

  // Optimize refinement: Process mask at a fixed resolution (max 480px) for extreme speed
  const REFINEMENT_DIM = 480;
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

  // Use OpenCV to strictly refine the alpha channel at refinement resolution
  try {
    if (cv && cv.Mat) {
      const alphaMat = new cv.Mat(refH, refW, cv.CV_8UC1);
      alphaMat.data.set(alphaArray);
      
      // 1. ISLAND REMOVAL
      const binaryMask = new cv.Mat();
      cv.threshold(alphaMat, binaryMask, 20, 255, cv.THRESH_BINARY);
      
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(binaryMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      
      let maxArea = 0;
      let maxContourIdx = -1;
      for (let i = 0; i < contours.size(); i++) {
          let area = cv.contourArea(contours.get(i));
          if (area > maxArea) {
              maxArea = area;
              maxContourIdx = i;
          }
      }
      
      const cleanMask = cv.Mat.zeros(alphaMat.rows, alphaMat.cols, cv.CV_8UC1);
      if (maxContourIdx !== -1) {
          for (let i = 0; i < contours.size(); i++) {
              let area = cv.contourArea(contours.get(i));
              if (area > maxArea * 0.2) {
                  cv.drawContours(cleanMask, contours, i, new cv.Scalar(255), -1, cv.LINE_8, hierarchy, 0);
              }
          }
      }
      
      cv.bitwise_and(alphaMat, cleanMask, alphaMat);
      
      // 2. MORPHOLOGICAL REFINEMENT
      const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
      cv.morphologyEx(alphaMat, alphaMat, cv.MORPH_CLOSE, kernel);
      cv.morphologyEx(alphaMat, alphaMat, cv.MORPH_OPEN, kernel);
      
      // 3. Edge smoothing
      cv.erode(alphaMat, alphaMat, kernel, new cv.Point(-1, -1), 2);
      cv.GaussianBlur(alphaMat, alphaMat, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
      
      alphaArray.set(alphaMat.data);
      
      binaryMask.delete(); contours.delete(); hierarchy.delete(); cleanMask.delete();
      alphaMat.delete(); kernel.delete();
    }
  } catch (e) {
    console.error("OpenCV mask refinement failed", e);
  }

  // Draw refined alpha back to refinement canvas
  for (let i = 0, j = 0; i < refData.data.length; i += 4, j++) {
    refData.data[i + 3] = alphaArray[j];
  }
  refCtx.putImageData(refData, 0, 0);

  // Final assembly on original resolution
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = w; finalCanvas.height = h;
  const ctx = finalCanvas.getContext('2d')!;
  
  // Draw original image
  ctx.drawImage(origImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  
  // Draw upscaled refined mask
  const finalMaskCanvas = document.createElement('canvas');
  finalMaskCanvas.width = w; finalMaskCanvas.height = h;
  const finalMaskCtx = finalMaskCanvas.getContext('2d')!;
  finalMaskCtx.drawImage(refCanvas, 0, 0, w, h);
  const finalMaskData = finalMaskCtx.getImageData(0, 0, w, h);

  for (let i = 0; i < imgData.data.length; i += 4) {
    let alpha = finalMaskData.data[i + 3];
    
    // ULTRA-STRICT THRESHOLDING
    if (alpha < 130) {
        alpha = 0;
    } else if (alpha > 240) {
        alpha = 255;
    } else {
        alpha = Math.round((alpha - 130) * (255 / 110));
    }

    if (alpha === 0) {
        imgData.data[i] = 0;
        imgData.data[i + 1] = 0;
        imgData.data[i + 2] = 0;
        imgData.data[i + 3] = 0;
        continue;
    }

    // Advanced Color Decontamination
    if (alpha < 255) {
        let r = imgData.data[i];
        let g = imgData.data[i + 1];
        let b = imgData.data[i + 2];
        const lum = (r * 0.299 + g * 0.587 + b * 0.114);
        const factor = (255 - alpha) / 255;
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
