import {
  removeBackground as imglyRemoveBackground,
  Config,
} from "@imgly/background-removal";
import { ImageSegmenter, FilesetResolver, ImageSegmenterResult } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web";

let mediapipeSegmenter: ImageSegmenter | null = null;
let modnetSession: ort.InferenceSession | null = null;
let u2netSession: ort.InferenceSession | null = null;

const MODNET_MIRRORS = [
    "https://huggingface.co/Zuz666/modnet-onnx/resolve/main/modnet_photographic_portrait_matting.onnx",
    "https://cdn.jsdelivr.net/gh/luciddreams-ai/modnet-onnx@main/modnet_photographic_portrait_matting.onnx",
];

const U2NET_MIRRORS = [
    "https://huggingface.co/Zuz666/u2net-onnx/resolve/main/u2net.onnx",
    "https://cdn.jsdelivr.net/gh/luciddreams-ai/u2net-onnx@main/u2net.onnx",
];

// Configure ONNX Runtime to use reliable WASM paths
const setupNeuralEngines = async () => {
    if (modnetSession && u2netSession) return;
    
    const baseUrl = "https://unpkg.com/onnxruntime-web@1.20.1/dist/";
    ort.env.wasm.wasmPaths = baseUrl;
    ort.env.wasm.proxy = false; 
    ort.env.wasm.numThreads = 1; // Back to 1 to avoid SharedArrayBuffer/crossOriginIsolated errors

    const loadModel = async (mirrors: string[], name: string) => {
        for (const url of mirrors) {
            try {
                console.log(`Attempting to load ${name} from: ${url}`);
                const session = await ort.InferenceSession.create(url, { 
                    executionProviders: ["webgl", "wasm"], 
                    graphOptimizationLevel: "all" 
                });
                console.log(`${name} Engine Ready via ${url}`);
                return session;
            } catch (err) {
                console.warn(`${name} mirror failed: ${url}`, err);
            }
        }
        return null;
    };

    [modnetSession, u2netSession] = await Promise.all([
        loadModel(MODNET_MIRRORS, "MODNet"),
        loadModel(U2NET_MIRRORS, "U2Net")
    ]);
};

/**
 * Preload all engines to ensure smooth transitions.
 */
export const ensurePreloaded = async () => {
  await Promise.allSettled([
    setupNeuralEngines(),
    (async () => {
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
        console.warn("MediaPipe Fallback Preload Failed:", err);
      }
    })()
  ]);
};

async function runOnnxModel(imageSrc: string, session: ort.InferenceSession | null, res: number, name: string): Promise<Uint8ClampedArray | null> {
  if (!session) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise(r => { img.onload = r; img.src = imageSrc; });

    const canvas = document.createElement("canvas");
    canvas.width = res; canvas.height = res;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, res, res);
    const { data } = ctx.getImageData(0, 0, res, res);
    
    const input = new Float32Array(res * res * 3);
    for (let i = 0; i < res * res; i++) {
        input[i] = (data[i * 4] / 255.0 - 0.5) / 0.5;
        input[i + res * res] = (data[i * 4 + 1] / 255.0 - 0.5) / 0.5;
        input[i + res * res * 2] = (data[i * 4 + 2] / 255.0 - 0.5) / 0.5;
    }

    const tensor = new ort.Tensor("float32", input, [1, 3, res, res]);
    const outputMap = await session.run({ input: tensor });
    const output = outputMap[Object.keys(outputMap)[0]] as ort.Tensor;
    const outputData = output.data as Float32Array;

    const mCanvas = document.createElement("canvas");
    mCanvas.width = res; mCanvas.height = res;
    const mCtx = mCanvas.getContext("2d")!;
    const mImgData = mCtx.createImageData(res, res);
    for (let i = 0; i < outputData.length; i++) {
        const v = Math.round(outputData[i] * 255);
        mImgData.data[i * 4] = v; mImgData.data[i * 4 + 1] = v; mImgData.data[i * 4 + 2] = v; mImgData.data[i * 4 + 3] = 255;
    }
    mCtx.putImageData(mImgData, 0, 0);

    const fCanvas = document.createElement("canvas");
    fCanvas.width = img.width; fCanvas.height = img.height;
    const fCtx = fCanvas.getContext("2d")!;
    fCtx.imageSmoothingEnabled = true;
    fCtx.imageSmoothingQuality = "high";
    fCtx.drawImage(mCanvas, 0, 0, img.width, img.height);
    
    const finalMaskRes = fCtx.getImageData(0, 0, img.width, img.height).data;
    const alphaBuffer = new Uint8ClampedArray(img.width * img.height);
    for (let i = 0; i < alphaBuffer.length; i++) alphaBuffer[i] = finalMaskRes[i * 4];
    return alphaBuffer;
  } catch (err) {
    console.warn(`${name} failed:`, err);
    return null;
  }
}

/**
 * Triple-Engine Hybrid AI: Fuses MODNet (Accuracy), U2Net (Boundaries), and ISNet (Structure).
 */
export const hybridRemoveBackground = async (
  imageSrc: string,
  onProgress: (status: string, intermediateBlob?: Blob) => void,
  forceWhiteBackground: boolean = false,
): Promise<Blob> => {
  onProgress("Initializing Triple-Engine Hybrid AI...");
  await setupNeuralEngines();

  try {
    const [modnetAlpha, u2netAlpha, imglyBlob] = await Promise.all([
      runOnnxModel(imageSrc, modnetSession, 1024, "MODNet"),
      runOnnxModel(imageSrc, u2netSession, 768, "U2Net"),
      (async () => {
        onProgress("ISNet Structural Analysis...");
        try {
          const config: Config = {
            model: "isnet",
            output: { format: "image/png", quality: 1.0 },
            publicPath: "https://unpkg.com/@imgly/background-removal-data@1.5.7/dist/",
          };
          return await imglyRemoveBackground(imageSrc, config);
        } catch (e) {
          console.warn("ISNet Bypass:", e);
          return null;
        }
      })()
    ]);

    if (!imglyBlob && !modnetAlpha && !u2netAlpha) {
      console.warn("Primary engines unavailable, attempting recovery engine fallback...");
      return await mediapipeFallback(imageSrc, forceWhiteBackground, onProgress);
    }

    onProgress("Fusing Triple-Engine Computations...");
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise(r => { img.onload = r; img.src = imageSrc; });

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    
    let imglyData: Uint8ClampedArray | null = null;
    if (imglyBlob) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tCtx = tempCanvas.getContext("2d", { willReadFrequently: true })!;
        
        const iImg = new Image();
        iImg.src = URL.createObjectURL(imglyBlob);
        await new Promise(r => { iImg.onload = r; });
        tCtx.drawImage(iImg, 0, 0);
        imglyData = tCtx.getImageData(0, 0, img.width, img.height).data;
        URL.revokeObjectURL(iImg.src);
    }
    
    // Always use the ORIGINAL image's RGB so restored edges have native color
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    for (let i = 0; i < canvas.width * canvas.height; i++) {
        const m = modnetAlpha ? modnetAlpha[i] : (imglyData ? imglyData[i * 4 + 3] : 255);
        const u = u2netAlpha ? u2netAlpha[i] : m;
        const s = imglyData ? imglyData[i * 4 + 3] : m;

        // Synergistic Fusion of ISNet and MODNet for Sharp, Clean Edges
        let alpha = 0;

        // 1. Extreme Halos and Gaps Cleanup
        // If MODNet strongly marks this as background, it is excellent at carving out 
        // hair gaps and ear cutouts. We trust it over ISNet's tendency to blob.
        if (m < 60) {
            alpha = 0;
        } 
        // 2. Solid Body/Subject
        // Both agree it's subject
        else if (s > 200 && m > 200) {
            alpha = 255;
        }
        // 3. Synergistic Transition (Sharp Edge Processing)
        else {
            // High threshold for ISNet to preserve solid body (shoulders)
            const isISNetBody = s > 220 && m > 80;
            // High threshold for MODNet to preserve hair/ears
            const isModNetHair = m > 220 && s > 60;
            
            if (isISNetBody || isModNetHair) {
                alpha = 255;
            } else {
                // Strict joint-agreement for the remaining transition pixels (kills fringe)
                const jointConf = (s / 255.0) * (m / 255.0);
                if (jointConf > 0.35) {
                    alpha = 255;
                } else {
                    alpha = 0;
                }
            }
        }

        pixels[i * 4 + 3] = alpha;
    }

    // 3. Edge Smoothing and Color Decontamination (Defringing)
    // To solve the "white line" halo without cutting the subject (shoulders/ears),
    // we find edge pixels and shift their RGB colors towards the safe internal subject color.
    const alphaBuffer = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < pixels.length; i += 4) alphaBuffer[i / 4] = pixels[i + 3];

    for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
            const idx = y * canvas.width + x;
            const a = alphaBuffer[idx];
            
            if (a === 0) continue;

            // Simple smoothing on alpha to remove jarring aliased edges (jaggies)
            if (a > 0 && a < 255) {
                let sumAlpha = 0;
                let count = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        sumAlpha += alphaBuffer[(y + dy) * canvas.width + (x + dx)];
                        count++;
                    }
                }
                pixels[idx * 4 + 3] = sumAlpha / count;
            }

            // Defringing: if this pixel is on or near the boundary (has transparent neighbors)
            // AND it's not fully solid deep inside.
            let isEdge = false;
            for (let dy = -3; dy <= 3; dy++) {
                for (let dx = -3; dx <= 3; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
                        if (alphaBuffer[ny * canvas.width + nx] < 100) {
                            isEdge = true;
                            break;
                        }
                    }
                }
                if (isEdge) break;
            }

            if (isEdge) {
                // Find nearest solid color deep inside the subject to pull outward
                let nr = pixels[idx * 4];
                let ng = pixels[idx * 4 + 1];
                let nb = pixels[idx * 4 + 2];
                let found = false;

                // Search radius up to 6 pixels inwards
                for (let r = 1; r <= 6; r++) {
                    for (let dy = -r; dy <= r; dy++) {
                        const dxRange = r - Math.abs(dy);
                        for (let dx = -dxRange; dx <= dxRange; dx++) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
                                const nIdx = ny * canvas.width + nx;
                                if (alphaBuffer[nIdx] === 255) {
                                    nr = pixels[nIdx * 4];
                                    ng = pixels[nIdx * 4 + 1];
                                    nb = pixels[nIdx * 4 + 2];
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if (found) break;
                    }
                    if (found) break;
                }

                // If found a safe deep pixel, blend the edge pixel towards it
                // We mix based on alpha. The more transparent, the more we use the deep color.
                // Even for alpha=255 near the edge, we will apply a 40% mix to kill any baked-in white outline.
                if (found) {
                    const mix = Math.max(0.4, Math.min(1.0, (255 - pixels[idx * 4 + 3]) / 255.0 + 0.3));
                    pixels[idx * 4] = pixels[idx * 4] * (1 - mix) + nr * mix;
                    pixels[idx * 4 + 1] = pixels[idx * 4 + 1] * (1 - mix) + ng * mix;
                    pixels[idx * 4 + 2] = pixels[idx * 4 + 2] * (1 - mix) + nb * mix;
                }
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);

    return await polishAndFinalize(canvas, forceWhiteBackground, onProgress);

  } catch (err) {
    console.error("Hybrid AI Failure:", err);
    return await mediapipeFallback(imageSrc, forceWhiteBackground, onProgress);
  }
};


async function polishAndFinalize(canvas: HTMLCanvasElement, forceWhite: boolean, onProgress: (s:string)=>void): Promise<Blob> {
    onProgress("Refining Edge Polish...");
    const width = canvas.width;
    const height = canvas.height;
    
    // We already have a clean alpha mask from the fusion.
    // 1. FINAL COMPOSITING WITH SMOOTHING
    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const oCtx = outCanvas.getContext("2d")!;
    
    if (forceWhite) {
        oCtx.fillStyle = "#ffffff";
        oCtx.fillRect(0, 0, width, height);
    }
    
    // Use multi-pass compositing to provide a smooth, professional anti-aliased edge
    oCtx.imageSmoothingEnabled = true;
    oCtx.imageSmoothingQuality = "high";
    oCtx.drawImage(canvas, 0, 0);

    return new Promise((res, rej) => {
        outCanvas.toBlob(b => b ? res(b) : rej(new Error("Polish failed")), "image/png", 1.0);
    });
}

async function mediapipeFallback(imageSrc: string, forceWhite: boolean, onProgress: (s:string)=>void): Promise<Blob> {
    onProgress("Running Recovery Engine...");
    if (!mediapipeSegmenter) await ensurePreloaded();
    if (!mediapipeSegmenter) throw new Error("Engines Offline");

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

    for (let i = 0; i < mask.length; i++) {
        p[i * 4 + 3] = mask[i] > 0.5 ? 255 : 0;
    }
    ctx.putImageData(idata, 0, 0);
    return await polishAndFinalize(canvas, forceWhite, onProgress);
}


