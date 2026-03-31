import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';
import cv from '@techstark/opencv-js';

let isPreloaded = false;

const ensurePreloaded = async () => {
  if (isPreloaded) return;
  try {
    console.log(`Preloading AI Models...`);
    await Promise.race([
      preload({ model: 'isnet' }),
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
    onProgress('Initializing Engine...');
    await ensurePreloaded();
    
    onProgress('Optimizing Input...');
    const origImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = imageSrc;
    });

    // Max dimension 1024px for balance of professional quality and <7s speed
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

    onProgress('Segmenting Subject...');
    const blob = await new Promise<Blob | null>(res => workCanvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error("Failed to create image blob");

    // Use isnet for professional hair/edge quality
    const maskBlob = await imglyRemoveBackground(blob, {
      model: 'isnet',
      output: { format: 'image/png' },
      debug: false
    });

    const maskImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load mask"));
      img.src = URL.createObjectURL(maskBlob);
    });

    onProgress('Refining Edges & Colors...');
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

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = w; finalCanvas.height = h;
  const ctx = finalCanvas.getContext('2d')!;
  
  // Draw original image to get pure RGB data
  ctx.drawImage(origImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  
  // Draw maskImg (the cutout from imgly) to get its Alpha channel
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w; maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  maskCtx.drawImage(maskImg, 0, 0, w, h);
  const maskData = maskCtx.getImageData(0, 0, w, h);
  
  // Extract the true alpha channel
  let alphaArray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < maskData.data.length; i += 4, j++) {
    alphaArray[j] = maskData.data[i + 3];
  }

  // Use OpenCV to strictly refine the alpha channel and remove ALL background remnants
  try {
    if (cv && cv.Mat) {
      const alphaMat = new cv.Mat(h, w, cv.CV_8UC1);
      alphaMat.data.set(alphaArray);
      
      // 1. ISLAND REMOVAL: Find contours and delete floating background patches
      const binaryMask = new cv.Mat();
      cv.threshold(alphaMat, binaryMask, 20, 255, cv.THRESH_BINARY);
      
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(binaryMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      
      let maxArea = 0;
      for (let i = 0; i < contours.size(); i++) {
          let area = cv.contourArea(contours.get(i));
          if (area > maxArea) maxArea = area;
      }
      
      const cleanMask = cv.Mat.zeros(alphaMat.rows, alphaMat.cols, cv.CV_8UC1);
      for (let i = 0; i < contours.size(); i++) {
          let area = cv.contourArea(contours.get(i));
          // Keep only significant contours (at least 2% of the main subject's size)
          // This completely deletes floating background patches
          if (area > maxArea * 0.02) {
              cv.drawContours(cleanMask, contours, i, new cv.Scalar(255), -1, cv.LINE_8, hierarchy, 0);
          }
      }
      
      // Apply the clean mask to the original alpha
      cv.bitwise_and(alphaMat, cleanMask, alphaMat);
      
      // 2. AGGRESSIVE EROSION: Cut deeper into the edge to remove halos
      const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
      cv.erode(alphaMat, alphaMat, kernel, new cv.Point(-1, -1), 1);
      
      // 3. BLUR: Soften the eroded edge
      cv.GaussianBlur(alphaMat, alphaMat, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
      
      alphaArray.set(alphaMat.data);
      
      // Cleanup OpenCV memory
      binaryMask.delete(); contours.delete(); hierarchy.delete(); cleanMask.delete();
      alphaMat.delete(); kernel.delete();
    }
  } catch (e) {
    console.error("OpenCV mask refinement failed", e);
  }

  for (let i = 0, j = 0; i < imgData.data.length; i += 4, j++) {
    let alpha = alphaArray[j];
    
    // STRICT THRESHOLDING: Aggressively destroy faint background noise
    if (alpha < 50) {
        alpha = 0;
    } else if (alpha > 220) {
        alpha = 255;
    } else {
        // Smooth interpolation for the edges
        alpha = Math.round((alpha - 50) * (255 / 170));
    }

    if (alpha === 0) {
        imgData.data[i] = 0;
        imgData.data[i + 1] = 0;
        imgData.data[i + 2] = 0;
        imgData.data[i + 3] = 0;
        continue;
    }

    // Color Decontamination (Spill Suppression) on semi-transparent edges
    if (alpha < 255) {
        let r = imgData.data[i];
        let g = imgData.data[i + 1];
        let b = imgData.data[i + 2];

        // Neutralize green spill (more aggressive)
        if (g > r * 1.05 && g > b * 1.05) {
            imgData.data[i + 1] = Math.round((r + b) / 2);
        }
        // Neutralize blue spill
        else if (b > r * 1.1 && b > g * 1.1) {
            imgData.data[i + 2] = Math.round((r + g) / 2);
        }
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
