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
    
    // IS-Net (FP16 optimized in WASM)
    const maskBlob = await imglyRemoveBackground(imageSrc, {
      model: 'isnet_fp16', 
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
    const resultBlob = await generateFinalOutput(origImg, maskImg, roughMaskCanvas, forceWhiteBackground);
    
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
  roughMaskCanvas: HTMLCanvasElement,
  forceWhiteBackground: boolean
): Promise<Blob> {
  const w = origImg.width;
  const h = origImg.height;

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = w; finalCanvas.height = h;
  const ctx = finalCanvas.getContext('2d')!;
  
  // Draw original image
  ctx.drawImage(origImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  
  // Draw IS-Net mask (scaled to original size)
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w; maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d')!;
  maskCtx.drawImage(maskImg, 0, 0, w, h);
  const maskData = maskCtx.getImageData(0, 0, w, h);

  for (let i = 0; i < imgData.data.length; i += 4) {
    let alpha = maskData.data[i + 3]; // Use the highly accurate IS-Net alpha channel
    
    // Step 3: Soft Thresholding for a "Perfectly Clear" Cutout
    // We use a softer threshold to preserve anti-aliased edges while removing faint background noise
    if (alpha < 15) {
        if (forceWhiteBackground) {
            // Force pure WHITE background
            imgData.data[i] = 255;     // R
            imgData.data[i + 1] = 255; // G
            imgData.data[i + 2] = 255; // B
            imgData.data[i + 3] = 255; // A
        } else {
            imgData.data[i + 3] = 0; // Transparent
        }
        continue;
    } else if (alpha > 240) {
        // Force fully opaque for the core subject
        imgData.data[i + 3] = 255;
    } else {
        // Smoothly blend the anti-aliased edges
        // Remap alpha to 0-1 range based on the 15-240 bounds
        const mappedAlpha = (alpha - 15) / 225;
        const invAlpha = 1 - mappedAlpha;
        
        let r = imgData.data[i];
        let g = imgData.data[i + 1];
        let b = imgData.data[i + 2];
        
        // Color decontamination: desaturate the edge to remove color fringing (color spread)
        const lum = r * 0.299 + g * 0.587 + b * 0.114;
        r = r * mappedAlpha + lum * invAlpha;
        g = g * mappedAlpha + lum * invAlpha;
        b = b * mappedAlpha + lum * invAlpha;
        
        if (forceWhiteBackground) {
            imgData.data[i] = Math.round(r * mappedAlpha + 255 * invAlpha);
            imgData.data[i + 1] = Math.round(g * mappedAlpha + 255 * invAlpha);
            imgData.data[i + 2] = Math.round(b * mappedAlpha + 255 * invAlpha);
            imgData.data[i + 3] = 255; // Result is fully opaque
        } else {
            imgData.data[i] = Math.round(r);
            imgData.data[i + 1] = Math.round(g);
            imgData.data[i + 2] = Math.round(b);
            // Use a smoothstep-like curve for the alpha to increase edge contrast slightly
            const smoothAlpha = mappedAlpha * mappedAlpha * (3 - 2 * mappedAlpha);
            imgData.data[i + 3] = Math.round(smoothAlpha * 255); // Transparent edge
        }
    }
  }
  
  ctx.putImageData(imgData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate final blob"));
    }, 'image/png');
  });
}
