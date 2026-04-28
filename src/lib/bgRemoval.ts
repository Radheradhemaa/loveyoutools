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
    
    const canvas = document.createElement("canvas");
    canvas.width = iImg.width;
    canvas.height = iImg.height;
    
    URL.revokeObjectURL(iImg.src);

    return await polishAndFinalize(iImg, canvas, forceWhiteBackground, onProgress);

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

async function polishAndFinalize(imgSource: HTMLImageElement | HTMLCanvasElement, canvas: HTMLCanvasElement, forceWhite: boolean, onProgress: (s:string)=>void): Promise<Blob> {
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

    onProgress("Decontaminating Edge Halos & Spill...");
    // 1. Edge Color Decontamination (Bleeding solid RGB into translucent edges)
    // To eradicate white/color halos, we push internal solid colors outward into the semi-transparent rim.
    // We limit the search distance to preserve hair color.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const a = alphaBuffer[idx];
            
            if (a > 0 && a < 252) {
                let matchIdx = -1;
                const maxRadius = 3; // Keep it tight to avoid changing hair to skin color
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
                    // Blend interior color over the edge. Lower alpha = takes more interior color.
                    // This kills the white/background fringing without destroying the original edge completely.
                    // Added a 0.9 multiplier so it doesn't entirely overwrite everything, preserving some natural texture.
                    const mixRatio = ((255 - a) / 255.0) * 0.9; 
                    data[idx * 4]     = Math.round(data[idx * 4] * (1 - mixRatio) + data[matchIdx * 4] * mixRatio);
                    data[idx * 4 + 1] = Math.round(data[idx * 4 + 1] * (1 - mixRatio) + data[matchIdx * 4 + 1] * mixRatio);
                    data[idx * 4 + 2] = Math.round(data[idx * 4 + 2] * (1 - mixRatio) + data[matchIdx * 4 + 2] * mixRatio);
                } else if (a < 150) {
                     // If it's a faint pixel and has NO solid pixel within a 3px radius, it's very likely
                     // floating background noise/patch leftover from ISNet. Eradicate it.
                     data[idx * 4 + 3] = 0;
                     alphaBuffer[idx] = 0; // Update buffer so subsequent steps ignore it
                }
            }
        }
    }

    onProgress("Applying Sub-Pixel Alpha & Anti-aliasing...");
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
                
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const na = alphaBuffer[(y + dy) * width + (x + dx)] / 255.0;
                        sumA += na;
                        if (na < 0.05) emptyNeighbors++;
                    }
                }
                const avgA = sumA / 9.0;
                
                // Hard delete completely isolated fuzzy noise
                if (emptyNeighbors >= 6 && origA < 0.4) {
                    newAlpha[idx] = 0;
                    continue;
                }
                
                // Enhance the alpha contrast to remove the "soft/blurry" appearance 
                // of ISNet borders while maintaining a 1px anti-aliased gradient
                let finalA = origA;
                
                // Sigmoid-like curve: pushes <0.5 lower, >0.5 higher
                finalA = finalA * finalA * (3 - 2 * finalA);
                
                // Blend with local average to prevent jagged aliased stair-stepping
                finalA = (finalA * 0.65) + (avgA * 0.35);
                
                // Cut off super faint dust / trailing shadows 
                if (finalA < 0.05) finalA = 0;
                // Snap nearly pure opaque to 1
                if (finalA > 0.95) finalA = 1;
                
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



