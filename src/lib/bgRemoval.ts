import { SelfieSegmentation } from "@mediapipe/selfie_segmentation";

/**
 * Hybrid AI Background Removal System
 * 1. MediaPipe (Selfie Segmentation) -> Instant Mask
 * 2. U2Net Lite (isnet_quint8) -> Precision Structure
 * 3. MODNet (medium) -> Edge & Matting Polish
 */

// Initialize MediaPipe once
let selfieSegmentation: SelfieSegmentation | null = null;
const getSelfieSegmentation = async () => {
  if (selfieSegmentation) return selfieSegmentation;
  selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
  });
  selfieSegmentation.setOptions({
    modelSelection: 1, // 0 for general, 1 for landscape/selfie precision
  });
  return selfieSegmentation;
};

async function runMediaPipeInstant(imageSrc: string): Promise<Blob | null> {
  return new Promise(async (resolve) => {
    try {
      const segmenter = await getSelfieSegmentation();
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;

        await segmenter.send({ image: img });
        
        // Timeout protection for MediaPipe
        const timeout = setTimeout(() => resolve(null), 3000);

        segmenter.onResults((results) => {
          clearTimeout(timeout);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Draw the segmentation mask
          ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
          
          const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = idata.data;
          for (let i = 0; i < data.length; i += 4) {
            const val = data[i]; 
            // Return soft values for better multi-model merging
            data[i + 3] = val; 
            data[i] = 255;
            data[i+1] = 255;
            data[i+2] = 255;
          }
          ctx.putImageData(idata, 0, 0);

          canvas.toBlob((blob) => resolve(blob), "image/png");
        });
      };
      img.onerror = () => resolve(null);
      img.src = imageSrc;
    } catch (e) {
      resolve(null);
    }
  });
}

async function resizeImageForAI(
  imageSrc: string,
  maxDim: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (img.width <= maxDim && img.height <= maxDim) {
        resolve(null);
        return;
      }
      let w = img.width;
      let h = img.height;
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.95);
    };
    img.onerror = () => resolve(null);
    img.src = imageSrc;
  });
}

export const preloadBackgroundRemoval = async (): Promise<void> => {
  const engineVersion = "1.5.0";
  const cdnMirrors = [
    `https://unpkg.com/@imgly/background-removal-data@${engineVersion}/dist/`,
    `https://cdn.jsdelivr.net/npm/@imgly/background-removal-data@${engineVersion}/dist/`,
    undefined,
  ];

  // Pre-warm MediaPipe
  getSelfieSegmentation().catch(() => {});

  for (const cdn of cdnMirrors) {
    try {
      await new Promise<void>((resolve, reject) => {
        const worker = new Worker(new URL("./bgWorker.ts", import.meta.url), {
          type: "module",
        });

        worker.onmessage = (e) => {
          if (e.data.type === "preload_success") {
            worker.terminate();
            resolve();
          } else if (e.data.type === "error") {
            worker.terminate();
            reject(new Error(e.data.errorMsg));
          }
        };

        worker.onerror = (e) => {
          worker.terminate();
          reject(new Error(e.message));
        };

        worker.postMessage({ type: "PRELOAD", modelType: "isnet_quint8", cdn });
      });
      return;
    } catch (e) {
      console.warn("Preload failed on mirror", cdn, e);
    }
  }
};

export const removeBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void,
  forceWhiteBackground = false,
): Promise<Blob> => {
  const objectUrls: string[] = [];
  const cleanup = () => objectUrls.forEach((url) => {
    try { URL.revokeObjectURL(url); } catch(e) {}
  });

  try {
    onProgress("Initializing Hybrid Multi-Model AI...");

    const runWorkerPipeline = async (
      id: string,
      modelType: string,
      src: string,
    ): Promise<Blob> => {
      const engineVersion = "1.5.0";
      const cdnMirrors = [
        `https://unpkg.com/@imgly/background-removal-data@${engineVersion}/dist/`,
        `https://cdn.jsdelivr.net/npm/@imgly/background-removal-data@${engineVersion}/dist/`,
        undefined,
      ];

      let lastError: any = null;
      for (const cdn of cdnMirrors) {
        try {
          return await new Promise<Blob>((resolve, reject) => {
            const worker = new Worker(
              new URL("./bgWorker.ts", import.meta.url),
              { type: "module" },
            );

            worker.onmessage = (e) => {
              if (e.data.type === "success") {
                worker.terminate();
                resolve(e.data.blob);
              } else if (e.data.type === "error") {
                worker.terminate();
                reject(new Error(e.data.errorMsg));
              } else if (e.data.type === "progress") {
                onProgress(`${id}: ${Math.round(e.data.progress * 100)}%`);
              }
            };

            worker.onerror = (e) => {
              worker.terminate();
              reject(new Error(e.message || "Worker crashed"));
            };

            worker.postMessage({
              type: "PROCESS",
              id,
              processSrc: src,
              modelType,
              cdn,
            });
          });
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          continue;
        }
      }
      throw lastError || new Error(`Pipeline ${id} failed.`);
    };

    // Stage 1: MediaPipe Instant Pass (Parallel)
    const instantPromise = runMediaPipeInstant(imageSrc);

    // Stage 2: Deep Scene Understanding Resolution
    // Higher resolution allows the models to better distinguish between subject and complex background objects (chairs, etc).
    const u2netBlobPromise = resizeImageForAI(imageSrc, 800); 
    const modnetBlobPromise = resizeImageForAI(imageSrc, 1024);

    const [u2netBlob, modnetBlob] = await Promise.all([u2netBlobPromise, modnetBlobPromise]);
    
    const u2netSrc = u2netBlob ? URL.createObjectURL(u2netBlob) : imageSrc;
    const modnetSrc = modnetBlob ? URL.createObjectURL(modnetBlob) : imageSrc;
    if (u2netBlob) objectUrls.push(u2netSrc);
    if (modnetBlob) objectUrls.push(modnetSrc);

    onProgress("Tuning AI Engines...");

    const u2netPipeline = runWorkerPipeline("Precision", "isnet_quint8", u2netSrc);
    const modnetPipeline = runWorkerPipeline("Edge Matting", "medium", modnetSrc);

    const highResSource = new Image();
    highResSource.crossOrigin = "anonymous";
    highResSource.src = imageSrc;
    await new Promise((res, rej) => {
      highResSource.onload = res;
      highResSource.onerror = rej;
    });

    const applyMaskAndComposite = async (
      maskBlob: Blob | Blob[], // Can now take multiple blobs for consensus
      isFinalRefinement: boolean,
    ): Promise<Blob> => {
      const canvas = document.createElement("canvas");
      canvas.width = highResSource.width;
      canvas.height = highResSource.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      const blobs = Array.isArray(maskBlob) ? maskBlob : [maskBlob];
      
      // Temporary canvas to stack masks
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tCtx = tempCanvas.getContext("2d")!;

      for (let i = 0; i < blobs.length; i++) {
        const mImg = new Image();
        const url = URL.createObjectURL(blobs[i]);
        objectUrls.push(url);
        await new Promise((r) => { mImg.onload = r; mImg.src = url; });
        
        if (i === 0) {
          tCtx.drawImage(mImg, 0, 0, canvas.width, canvas.height);
        } else {
          // Multiply/Intersect masks to remove background objects (chairs, etc)
          // that only one model incorrectly identifies as foreground.
          tCtx.globalCompositeOperation = "multiply";
          tCtx.drawImage(mImg, 0, 0, canvas.width, canvas.height);
          tCtx.globalCompositeOperation = "source-over";
        }
      }

      ctx.drawImage(tempCanvas, 0, 0);

      if (isFinalRefinement) {
        const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = idata.data;
        // Anti-Halo & Strict Subject Isolation:
        // 1. Higher floor (100) to aggressively cut off surviving objects/chairs.
        // 2. Ceiling at 175 for solid subject preservation (shoulders/shirts).
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 100) {
            data[i + 3] = 0; 
          } else if (a > 175) {
            data[i + 3] = 255; 
          } else {
            const t = (a - 100) / 75; // 175 - 100 = 75
            const smooth = t * t * (3 - 2 * t);
            data[i + 3] = Math.round(smooth * 255);
          }
        }
        ctx.putImageData(idata, 0, 0);
      }

      ctx.globalCompositeOperation = "source-in";
      // Subtle studio lighting boost
      ctx.filter = "brightness(1.02) contrast(1.02)";
      ctx.drawImage(highResSource, 0, 0);
      ctx.filter = "none";
      ctx.globalCompositeOperation = "source-over";

      if (forceWhiteBackground) {
        const finalCanvas = document.createElement("canvas");
        finalCanvas.width = canvas.width;
        finalCanvas.height = canvas.height;
        const fCtx = finalCanvas.getContext("2d")!;
        fCtx.fillStyle = "#ffffff";
        fCtx.fillRect(0, 0, canvas.width, canvas.height);
        fCtx.drawImage(canvas, 0, 0);
        return new Promise((res, rej) =>
          finalCanvas.toBlob(
            (b) => (b ? res(b) : rej()),
            "image/jpeg",
            0.98,
          ),
        );
      }
      return new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej()), "image/png"),
      );
    };

    let fastResolved = false;

    // MediaPipe Result Handling
    instantPromise.then(async (maskBlob) => {
      if (maskBlob && !fastResolved) {
        try {
          const instantResult = await applyMaskAndComposite(maskBlob, false);
          if (!fastResolved) {
            onProgress("MediaPipe: Instant Output", instantResult);
          }
        } catch (e) {}
      }
    });

    try {
      // Stage 2: Parallel Model Generation
      onProgress("Refining with AI Engines...");
      
      // Wait for all models to get the best possible consensus
      // MediaPipe (Person), U2Net (Structure), MODNet (Matting)
      const [u2netRes, modnetRes, mpRes] = await Promise.allSettled([
        u2netPipeline, 
        modnetPipeline,
        instantPromise
      ]);
      
      fastResolved = true;
      
      const consensusMasks: Blob[] = [];
      
      if (u2netRes.status === "fulfilled") consensusMasks.push(u2netRes.value);
      if (modnetRes.status === "fulfilled") consensusMasks.push(modnetRes.value);
      if (mpRes.status === "fulfilled" && mpRes.value) consensusMasks.push(mpRes.value);

      if (consensusMasks.length === 0) throw new Error("Quality AI pipelines failed");

      onProgress("Final Studio Quality Polish...");
      return await applyMaskAndComposite(consensusMasks, true);
    } catch (e) {
      console.warn("Refinement failed, falling back to instant", e);
      fastResolved = true;
      const mask = await instantPromise;
      if (!mask) throw new Error("All AI pipelines failed");
      return await applyMaskAndComposite(mask, true);
    }
  } finally {
    cleanup();
  }
};
