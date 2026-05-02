import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

let isPreloaded = false;
let preloadPromise: Promise<void> | null = null;

export const ensurePreloaded = async () => {
  if (isPreloaded) return;
  if (preloadPromise) return preloadPromise;
  
  preloadPromise = (async () => {
    try {
      console.log(`Initializing IS-Net AI Pipeline...`);
      
      // Preload primary high-fidelity model (IS-Net)
      await preload({ 
        model: 'isnet' as any,
        fetchArgs: { cache: 'force-cache' }
      }).catch(() => {
        // Fallback to fp16 if full isnet fails to preload
        return preload({ 
          model: 'isnet_fp16' as any,
          fetchArgs: { cache: 'force-cache' }
        });
      }).catch(() => {});
      
      isPreloaded = true;
      console.log("IS-Net AI Pipeline Ready");
    } catch (err) {
      console.warn(`AI Initialization failed:`, err);
    }
  })();
  return preloadPromise;
};

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
      const ratio = Math.min(maxSize / width, maxSize / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error("Image reduction failed"));
    img.src = dataUrl;
  });
}

/**
 * High-Quality Background Removal using IS-Net
 */
export const removeBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void,
  forceWhiteBackground: boolean = false
): Promise<Blob> => {
  const startTime = Date.now();
  onProgress('Starting high-quality AI processing...');
  
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => { 
      img.onload = res; 
      img.onerror = rej; 
      img.src = imageSrc; 
    });

    onProgress('Applying Premium IS-Net processing...');
    
    // Maximize resolution for premium detail preservation (2048px)
    // This allows the model to see fine hair, threads, and sharp boundaries
    const optimizedSrc = await resizeImageIfNeeded(imageSrc, 2048);
    
    // Primary IS-Net Pipeline
    const isnetOptions: any = {
      model: 'isnet' as any, 
      output: { format: 'image/png', quality: 1.0 },
      debug: false,
      progress: (k: string, curr: number, total: number) => {
        if (total > 0) {
          const percent = Math.round((curr / total) * 100);
          onProgress(`Refining Precision Edges (${percent}%)...`);
        }
      }
    };
    
    const finalBlob = await imglyRemoveBackground(optimizedSrc, isnetOptions);
    
    let processed = finalBlob;
    if (forceWhiteBackground) processed = await applyWhiteBackground(processed);
    
    console.log(`IS-Net Process Complete: ${(Date.now() - startTime) / 1000}s`);
    return processed;
  } catch (error: any) {
    console.error("AI failed:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`AI Processing Error: ${errorMessage}. Please try again with a clearer image.`);
  }
};

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
        else reject(new Error("Merge failed"));
      }, 'image/png');
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("BG Apply failed"));
    img.src = URL.createObjectURL(transparentBlob);
  });
}


