import {
  removeBackground as imglyRemoveBackground,
  Config,
} from "@imgly/background-removal";
import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

let mediapipeSegmenter: ImageSegmenter | null = null;

// Preload MediaPipe as a silent safety net
export const ensurePreloaded = async () => {
  if (mediapipeSegmenter) return;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    mediapipeSegmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
        delegate: "GPU"
      },
      runningMode: "IMAGE",
      outputCategoryMask: false,
      outputConfidenceMasks: true
    });
  } catch (err) {
    console.warn("Safety Net (MediaPipe) failed to preload:", err);
  }
};

/**
 * Clean & Professional ISNet-Only Background Removal
 * Now with Internal Neural Fallback for restricted networks.
 */
export const removeBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void,
  forceWhiteBackground: boolean = false,
): Promise<Blob> => {
  onProgress("Initializing Elite AI Engine...");

  try {
    onProgress("Initializing Ultra-Precision AI 分析...");
    
    // Expanded mirrors including specific stable versions and standard latest paths
    const CDN_MIRRORS = [
      "https://static.img.ly/packages/@imgly/background-removal-data/1.5.7/dist/",
      "https://cdn.jsdelivr.net/npm/@imgly/background-removal-data@1.5.7/dist/",
      "https://unpkg.com/@imgly/background-removal-data@1.5.7/dist/",
      "https://cdn.jsdelivr.net/npm/@imgly/background-removal-data/dist/",
      "https://unpkg.com/@imgly/background-removal-data/dist/",
    ];

    let imglyBlob: Blob | null = null;
    const modelsToTry: ("isnet" | "isnet_fp16")[] = ["isnet", "isnet_fp16"];
    
    // Optimized Rotational AI Engagement with robust fallback
    for (const modelType of modelsToTry) {
        let mirrorIndex = 0;
        while (mirrorIndex < CDN_MIRRORS.length && !imglyBlob) {
            const publicPath = CDN_MIRRORS[mirrorIndex];
            try {
                const config: Config = {
                    model: modelType,
                    output: { format: "image/png", quality: 1.0 },
                    publicPath: publicPath,
                };
                
                onProgress(`Precision Scan: ${modelType === "isnet" ? "Ultra-HD" : "Elite-HD"} (Mirror ${mirrorIndex + 1})...`);
                
                // Perform a lightweight check for model availability (HEAD check can be blocked, so we use GET with abort)
                const isReachable = await Promise.race([
                    fetch(`${publicPath}metadata.json`, { method: 'GET', mode: 'cors' }).then(r => r.ok).catch(() => false),
                    new Promise<boolean>(r => setTimeout(() => r(false), 2500))
                ]);

                if (!isReachable && mirrorIndex < CDN_MIRRORS.length - 1) {
                    mirrorIndex++;
                    continue;
                }

                imglyBlob = await imglyRemoveBackground(imageSrc, config);
            } catch (e) {
                console.warn(`Connection to Mirror ${mirrorIndex + 1} failed:`, e);
                mirrorIndex++;
                if (mirrorIndex < CDN_MIRRORS.length) {
                    onProgress(`Syncing backup AI mirror...`);
                    await new Promise(r => setTimeout(r, 200));
                }
            }
        }
        if (imglyBlob) break;
    }

    if (!imglyBlob) {
        onProgress("Engaging Compatibility Safety Net (Restricted Network Detected)...");
        try {
            return await mediapipeFallback(imageSrc, forceWhiteBackground, onProgress);
        } catch (fbErr) {
            console.error("Safety net failed:", fbErr);
            throw new Error(`AI Engines strictly unreachable. Your network is blocking Neural Network (WASM) chunks. (Technical: ${fbErr instanceof Error ? fbErr.message : String(fbErr)})`);
        }
    }

    onProgress("Finalizing Cutout & Edge Smoothing...");
    const iImg = new Image();
    iImg.src = URL.createObjectURL(imglyBlob);
    await new Promise(r => { iImg.onload = r; });
    
    // Run MediaPipe to get a semantic "Human" mask for robust patch elimination and shoulder protection
    onProgress("Running Semantic Deep-Scan (Targeting Ears & Shoulders)...");
    let mpMask: Float32Array | null = null;
    try {
        if (!mediapipeSegmenter) await ensurePreloaded();
        if (mediapipeSegmenter) {
            const origImg = new Image();
            origImg.crossOrigin = "anonymous";
            await new Promise(r => { origImg.onload = r; origImg.src = imageSrc; });
            // Compare dimensions just in case
            if (origImg.width === iImg.width && origImg.height === iImg.height) {
                const result = mediapipeSegmenter.segment(origImg);
                if (result && result.confidenceMasks && result.confidenceMasks.length > 0) {
                    mpMask = result.confidenceMasks[0].getAsFloat32Array();
                }
            }
        }
    } catch (e) {
        console.warn("Semantic scan failed, continuing with standard cutout.", e);
    }

    const canvas = document.createElement("canvas");
    canvas.width = iImg.width;
    canvas.height = iImg.height;
    
    URL.revokeObjectURL(iImg.src);

    return await polishAndFinalize(iImg, canvas, forceWhiteBackground, onProgress, mpMask);

  } catch (err) {
    console.error("BG removal logic failed:", err);
    throw new Error(`The AI engine encountered an issue: ${err instanceof Error ? err.message : String(err)}. This usually happens with restricted networks or low-resolution photos.`);
  }
};


async function mediapipeFallback(imageSrc: string, forceWhite: boolean, onProgress: (s:string)=>void): Promise<Blob> {
    onProgress("Running Recovery Engine (High-Res)...");
    if (!mediapipeSegmenter) await ensurePreloaded();
    if (!mediapipeSegmenter) throw new Error("AI Engines strictly blocked by your network. Please try a different connection or VPN.");

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise(r => { img.onload = r; img.src = imageSrc; });

    const result = mediapipeSegmenter.segment(img);
    const mask = result.confidenceMasks![0].getAsFloat32Array();
    
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const p = idata.data;

    // Apply MediaPipe mask to alpha channel using soft matting (0-255 scale)
    for (let i = 0; i < mask.length; i++) {
        // Enhance sharpness of mediapipe mask slightly
        let m = mask[i];
        if (m > 0.1 && m < 0.9) {
            m = (m - 0.5) * 1.5 + 0.5;
            m = Math.max(0, Math.min(1, m));
        }
        p[i * 4 + 3] = Math.round(m * 255);
    }
    ctx.putImageData(idata, 0, 0);
    
    // For mediapipe, canvas now holds the extracted image. 
    // We can just pass the canvas to polishAndFinalize it as the imgSource.
    const resImg = new Image();
    resImg.src = canvas.toDataURL("image/png");
    await new Promise(r => { resImg.onload = r; });
    
    return await polishAndFinalize(resImg, canvas, forceWhite, onProgress);
}

async function polishAndFinalize(
    imgSource: HTMLImageElement | HTMLCanvasElement, 
    canvas: HTMLCanvasElement, 
    forceWhite: boolean, 
    onProgress: (s:string)=>void,
    mpMask?: Float32Array | null
): Promise<Blob> {
    onProgress("Initiating Studio-Quality Matting...");
    const width = canvas.width;
    const height = canvas.height;
    
    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const oCtx = outCanvas.getContext("2d", { willReadFrequently: true })!;
    
    // Draw the processed image
    oCtx.drawImage(imgSource, 0, 0, width, height);

    const idata = oCtx.getImageData(0, 0, width, height);
    const data = idata.data;

    // Buffer for original alpha
    const alphaBuffer = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        alphaBuffer[i / 4] = data[i + 3];
    }

    if (mpMask) {
        onProgress("Fusing Semantic Mask to Restore Shoulders & Delete Patches...");
        for (let i = 0; i < width * height; i++) {
            const isnetA = alphaBuffer[i] / 255.0;
            const mpConf = mpMask[i];
            
            // Only restore missing solid body parts (like shoulders) where MediaPipe is extremely confident
            if (isnetA < 0.5 && mpConf > 0.9) {
                alphaBuffer[i] = Math.max(alphaBuffer[i], Math.round(mpConf * 255));
                data[i * 4 + 3] = alphaBuffer[i]; 
            }
            
            // Only delete patches where MediaPipe is absolutely certain it's background (<=0.02)
            // This prevents cutting the shoulder edge while still deleting far-away ISNet garbage.
            if (isnetA > 0.0 && mpConf <= 0.02) {
                alphaBuffer[i] = 0;
                data[i * 4 + 3] = 0;
            }
        }
    }

    onProgress("Decontaminating Edge Halos & Spill...");
    // 1. Edge Color Decontamination (Bleeding solid RGB into translucent edges)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const a = alphaBuffer[idx];
            
            if (a > 0 && a < 252) {
                let matchIdx = -1;
                const maxRadius = 6; // Expanded to 6 to catch thicker edge halos around the ear
                for (let r = 1; r <= maxRadius; r++) {
                    for (let dy = -r; dy <= r; dy++) {
                        for (let dx = -r; dx <= r; dx++) {
                            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                            const nx = x + dx, ny = y + dy;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nidx = ny * width + nx;
                                if (alphaBuffer[nidx] >= 252) {
                                    matchIdx = nidx;
                                    break;
                                }
                            }
                        }
                        if (matchIdx !== -1) break;
                    }
                    if (matchIdx !== -1) break;
                }

                if (matchIdx !== -1) {
                    // Blend interior color over the edge.
                    // For highly translucent edges, we completely replace the RGB (mixRatio approaching 1.2, clamped to 1) 
                    // This perfectly kills any white/background rim light without harming alpha
                    const mixRatio = Math.min(1.0, ((255 - a) / 255.0) * 1.5); 
                    data[idx * 4]     = Math.round(data[idx * 4] * (1 - mixRatio) + data[matchIdx * 4] * mixRatio);
                    data[idx * 4 + 1] = Math.round(data[idx * 4 + 1] * (1 - mixRatio) + data[matchIdx * 4 + 1] * mixRatio);
                    data[idx * 4 + 2] = Math.round(data[idx * 4 + 2] * (1 - mixRatio) + data[matchIdx * 4 + 2] * mixRatio);
                } else if (a < 210) {
                     // Faint pixel with no solid anchor within wide radius.
                     // It is an isolated stray patch (e.g. background patches far from ear).
                     data[idx * 4 + 3] = 0;
                     alphaBuffer[idx] = 0; // Update buffer
                }
            }
        }
    }

    onProgress("Removing Minor Patches & Refining Alpha Edge...");
    // 2. High-Fidelity Alpha Contrast & Smoothing
    const newAlpha = new Float32Array(width * height);
    for (let i = 0; i < alphaBuffer.length; i++) newAlpha[i] = alphaBuffer[i] / 255.0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const origA = alphaBuffer[idx] / 255.0;
            
            if (origA > 0 && origA < 1.0) {
                let sumA = 0;
                let emptyNeighbors = 0;
                let minA = origA;
                
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const na = alphaBuffer[(y + dy) * width + (x + dx)] / 255.0;
                        sumA += na;
                        if (na < minA) minA = na;
                        if (na < 0.05) emptyNeighbors++;
                    }
                }
                const avgA = sumA / 9.0;
                
                // Hard delete completely isolated fuzzy noise
                if (emptyNeighbors >= 5 && origA < 0.5) {
                    newAlpha[idx] = 0;
                    continue;
                }
                
                // Sub-pixel Erode (Choke): Pulls the edge inwards heavily
                // by blending the original alpha mostly with the minimum alpha in the neighborhood.
                // This eliminates the stubborn 1-2px white fringe near the ear perfectly.
                let erodedA = (origA * 0.15) + (minA * 0.85); 
                
                // Apply steep contrast curve to the eroded alpha to tighten the edge
                let finalA = erodedA * erodedA * (3 - 2 * erodedA);
                finalA = finalA * finalA * (3 - 2 * finalA); // Double sigmoid for extreme sharpness while keeping 1px gradient
                
                // Blend with local average slightly for smooth anti-aliased edge
                finalA = (finalA * 0.8) + (avgA * 0.2);
                
                // Thresholding
                if (finalA < 0.15) finalA = 0; // Cutoff trailing edge shadows completely
                if (finalA > 0.90) finalA = 1; // Snap near-opaque to full solid

                
                newAlpha[idx] = finalA;
            }
        }
    }

    // Apply finalized alpha channel
    for (let i = 0; i < data.length; i += 4) {
        if (newAlpha[i / 4] === 0) {
            data[i + 3] = 0; // Pure transparent
        } else {
            data[i + 3] = Math.max(0, Math.min(255, Math.round(newAlpha[i / 4] * 255)));
        }
    }

    oCtx.putImageData(idata, 0, 0);

    if (forceWhite) {
        const finalCanvas = document.createElement("canvas");
        finalCanvas.width = width;
        finalCanvas.height = height;
        const fCtx = finalCanvas.getContext("2d")!;
        fCtx.fillStyle = "#ffffff";
        fCtx.fillRect(0, 0, width, height);
        fCtx.drawImage(outCanvas, 0, 0);
        
        return new Promise((res, rej) => {
            finalCanvas.toBlob(b => b ? res(b) : rej(new Error("Finalization failed")), "image/jpeg", 0.95);
        });
    }

    return new Promise((res, rej) => {
        outCanvas.toBlob(b => b ? res(b) : rej(new Error("Finalization failed")), "image/png");
    });
}



