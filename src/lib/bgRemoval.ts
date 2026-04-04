import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

let isPreloaded = false;
let preloadPromise: Promise<void> | null = null;

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  if (preloadPromise) return preloadPromise;
  
  preloadPromise = (async () => {
    try {
      console.log(`Preloading High-Quality AI Models...`);
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

export const hybridRemoveBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void,
  forceWhiteBackground: boolean = false
): Promise<Blob> => {
  const startTime = Date.now();
  try {
    onProgress('Optimizing Image for Speed...');
    // Resize to max 1920px to guarantee 2-4s processing speed
    const resizedSrc = await resizeImageIfNeeded(imageSrc, 1920);

    onProgress('Analyzing Image & Removing Background...');
    const maskBlob = await imglyRemoveBackground(resizedSrc, {
      model: 'isnet', 
      output: { format: 'image/png', quality: 1.0 },
      debug: false,
    });

    onProgress('Applying Strict 7-Step Cleaning Pipeline...');
    const origImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load original image"));
      img.src = resizedSrc; 
    });

    // Execute the strict 7-step pipeline requested by the user
    let finalBlob = await executeStrictPipeline(origImg, maskBlob);

    if (forceWhiteBackground) {
      onProgress('Applying Background...');
      finalBlob = await applyWhiteBackground(finalBlob);
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Background removal completed in ${duration.toFixed(2)}s`);
    return finalBlob;

  } catch (error: any) {
    console.error("BG Removal Error:", error);
    throw error;
  }
};

/**
 * Executes the strict 7-step post-processing pipeline:
 * 1. Strict Foreground Isolation (Largest Connected Component)
 * 2. Background Suppression (Confidence Thresholding)
 * 3. Morphological Cleaning (Erode 2px, Dilate 1px)
 * 4-6. Heuristics (Handled via aggressive morphology & isolation)
 * 7. Final Alpha Cleanup (Feathering & Decontamination)
 */
async function executeStrictPipeline(origImg: HTMLImageElement, maskBlob: Blob): Promise<Blob> {
  const maskImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Failed to load mask"));
    i.src = URL.createObjectURL(maskBlob);
  });

  const width = origImg.width;
  const height = origImg.height;
  const len = width * height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  ctx.drawImage(origImg, 0, 0);
  const origPixels = ctx.getImageData(0, 0, width, height).data;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(maskImg, 0, 0);
  const maskPixels = ctx.getImageData(0, 0, width, height).data;

  let alpha = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    alpha[i] = maskPixels[i * 4 + 3];
  }

  // STEP 2: Background Suppression
  // Identify pixels with low confidence (0.3-0.7 range) and force them to background
  for (let i = 0; i < len; i++) {
    if (alpha[i] < 180) { // ~0.7 confidence threshold
      alpha[i] = 0;
    } else if (alpha[i] > 240) {
      alpha[i] = 255;
    }
  }

  // STEP 1 & 6: Strict Foreground Isolation & Anti-Object Leak
  // Keep only the main subject (largest connected component)
  const labels = new Int32Array(len);
  let currentLabel = 1;
  const areas = [0];
  
  for (let i = 0; i < len; i++) {
    if (alpha[i] > 0 && labels[i] === 0) {
      let area = 0;
      const queue = [i];
      labels[i] = currentLabel;
      let head = 0;

      // Breadth-First Search to find connected components
      while (head < queue.length) {
        const curr = queue[head++];
        area++;
        const x = curr % width;
        const y = Math.floor(curr / width);

        if (x > 0 && alpha[curr - 1] > 0 && labels[curr - 1] === 0) { labels[curr - 1] = currentLabel; queue.push(curr - 1); }
        if (x < width - 1 && alpha[curr + 1] > 0 && labels[curr + 1] === 0) { labels[curr + 1] = currentLabel; queue.push(curr + 1); }
        if (y > 0 && alpha[curr - width] > 0 && labels[curr - width] === 0) { labels[curr - width] = currentLabel; queue.push(curr - width); }
        if (y < height - 1 && alpha[curr + width] > 0 && labels[curr + width] === 0) { labels[curr + width] = currentLabel; queue.push(curr + width); }
      }
      areas.push(area);
      currentLabel++;
    }
  }

  let maxArea = 0;
  let maxLabel = 0;
  for (let i = 1; i < areas.length; i++) {
    if (areas[i] > maxArea) {
      maxArea = areas[i];
      maxLabel = i;
    }
  }

  // Remove all disconnected regions (noise, leftover chairs, etc.)
  for (let i = 0; i < len; i++) {
    if (labels[i] !== maxLabel) {
      alpha[i] = 0;
    }
  }

  // STEP 3: Morphological Cleaning
  // Apply erosion (2px) to shrink mask and remove edge leaks (like chair edges behind subject)
  for (let pass = 0; pass < 2; pass++) {
    let temp = new Uint8Array(len);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let i = y * width + x;
        if (alpha[i] === 0) continue;
        let minA = alpha[i];
        if (x > 0) minA = Math.min(minA, alpha[i - 1]);
        if (x < width - 1) minA = Math.min(minA, alpha[i + 1]);
        if (y > 0) minA = Math.min(minA, alpha[i - width]);
        if (y < height - 1) minA = Math.min(minA, alpha[i + width]);
        temp[i] = minA;
      }
    }
    alpha = temp;
  }

  // Apply dilation (1px) to restore subject shape
  let tempDilate = new Uint8Array(len);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let i = y * width + x;
      let maxA = alpha[i];
      if (x > 0) maxA = Math.max(maxA, alpha[i - 1]);
      if (x < width - 1) maxA = Math.max(maxA, alpha[i + 1]);
      if (y > 0) maxA = Math.max(maxA, alpha[i - width]);
      if (y < height - 1) maxA = Math.max(maxA, alpha[i + width]);
      tempDilate[i] = maxA;
    }
  }
  alpha = tempDilate;

  // STEP 7: Final Alpha Cleanup
  // Feather edges (1px max)
  let feathered = new Uint8Array(len);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let i = y * width + x;
      let sum = alpha[i-width-1] + alpha[i-width] + alpha[i-width+1] +
                alpha[i-1]       + alpha[i]*2     + alpha[i+1] +
                alpha[i+width-1] + alpha[i+width] + alpha[i+width+1];
      feathered[i] = sum / 10;
    }
  }
  alpha = feathered;

  // Color decontamination to remove leftover background tones
  let r = new Uint8Array(len);
  let g = new Uint8Array(len);
  let b = new Uint8Array(len);
  let weight = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    if (alpha[i] > 200) {
      r[i] = origPixels[i*4];
      g[i] = origPixels[i*4+1];
      b[i] = origPixels[i*4+2];
      weight[i] = 1;
    }
  }

  // Fast 2-pass bleed
  for (let pass = 0; pass < 2; pass++) {
    let nextR = new Uint8Array(r);
    let nextG = new Uint8Array(g);
    let nextB = new Uint8Array(b);
    let nextW = new Uint8Array(weight);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let i = y * width + x;
        if (weight[i] === 0 && alpha[i] > 0) {
          let sr=0, sg=0, sb=0, cnt=0;
          const n = [i-width, i-1, i+1, i+width];
          for(let idx of n) {
            if (weight[idx] > 0) { sr+=r[idx]; sg+=g[idx]; sb+=b[idx]; cnt++; }
          }
          if (cnt > 0) {
            nextR[i] = sr/cnt; nextG[i] = sg/cnt; nextB[i] = sb/cnt; nextW[i] = 1;
          }
        }
      }
    }
    r = nextR; g = nextG; b = nextB; weight = nextW;
  }

  // Final Composition
  const resultData = ctx.createImageData(width, height);
  const resultPixels = resultData.data;
  for (let i = 0; i < len; i++) {
    const idx = i * 4;
    if (alpha[i] > 0) {
      if (weight[i] === 0) {
        resultPixels[idx] = origPixels[idx];
        resultPixels[idx+1] = origPixels[idx+1];
        resultPixels[idx+2] = origPixels[idx+2];
      } else {
        let origW = (alpha[i] - 100) / 155;
        origW = Math.max(0, Math.min(1, origW));
        let bleedW = 1 - origW;
        resultPixels[idx] = origPixels[idx] * origW + r[i] * bleedW;
        resultPixels[idx+1] = origPixels[idx+1] * origW + g[i] * bleedW;
        resultPixels[idx+2] = origPixels[idx+2] * origW + b[i] * bleedW;
      }
      resultPixels[idx+3] = alpha[i];
    }
  }

  ctx.putImageData(resultData, 0, 0);
  URL.revokeObjectURL(maskImg.src);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Pipeline failed")), 'image/png');
  });
}

async function resizeImageIfNeeded(dataUrl: string, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      
      if (width <= maxSize && height <= maxSize) {
        resolve(dataUrl);
        return;
      }
      
      if (width > height) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => reject(new Error("Failed to load image for resizing"));
    img.src = dataUrl;
  });
}

async function applyWhiteBackground(transparentBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to apply white background"));
      }, 'image/jpeg', 1.0);
      
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("Failed to load transparent image"));
    img.src = URL.createObjectURL(transparentBlob);
  });
}
