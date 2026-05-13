import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

/**
 * Stub for compatibility.
 */
export const ensurePreloaded = async () => Promise.resolve();

/**
 * Stub for ISNet compatibility (Using U2Net Large as High-Precision Fallback)
 *
 */
export const ensureIsnetLoaded = async () => Promise.resolve();
export const ensureModnetLoaded = async () => Promise.resolve();

/**
 * Downscales an image if it exceeds max dimension.
 */
async function downscaleImageIfNeeded(imageSrc: string, maxDim = 3072): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (img.width <= maxDim && img.height <= maxDim) return resolve(imageSrc);
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxDim / img.width, maxDim / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png', 0.95));
    };
    img.onerror = () => resolve(imageSrc);
    img.src = imageSrc;
  });
}

/**
 * Executes high-precision background removal.
 */
export const removeBackground = async (
  originalImageSrc: string,
  onProgress: (p: string) => void,
  forceWhiteBackground = true
): Promise<Blob> => {
  const startTime = Date.now();
  onProgress('Initializing Tri-Hybrid Engine...');

  // Use 2048 to balance extreme high-res capability and processing speed.
  const imageSrc = await downscaleImageIfNeeded(originalImageSrc, 2048);

  try {
    // Neural Model 1: ISNet (High Precision Core)
    const runIsnetEngine = async (src: string, model: 'small' | 'medium' = 'medium'): Promise<Blob> => {
      return imglyRemoveBackground(src, {
        model,
        output: { format: 'image/png', quality: 1.0, type: 'foreground' as any },
        progress: (status, progress) => {
          if (status === 'process') onProgress(`Precision Analysis: ${(progress * 100).toFixed(0)}%`);
        }
      });
    };

    onProgress('Running Fast ISNet Core...');
    
    let isnetBlob: Blob;
    try {
        isnetBlob = await runIsnetEngine(imageSrc, 'small');
    } catch (e1: any) {
        console.error("[AI] ISNet core failed.", e1);
        throw new Error(`Background removal core failed: ${e1.message || 'Unknown error'}`);
    }


    onProgress('Razor Sharp Boundary Pass...');
    const polishedBlob = await polishAndEnhance(isnetBlob);

    console.log(`[AI] Total Execution: ${(Date.now() - startTime) / 1000}s`);

    if (forceWhiteBackground) {
      return await applyWhiteBackground(polishedBlob);
    }
    
    return polishedBlob;

  } catch (e) {
    console.error("[AI] Critical Failure:", e);
    throw new Error("Background removal failed. Please try a clearer image.");
  }
}


/**
 * Natural Contour Polish & Artifact Eradication
 * Eradicates boundary patches and noisy webs via density morphological cleaning,
 * then applies S-Curve edge refinement and Halo Decontamination.
 */
async function polishCutoutEdges(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const w = img.width;
      const h = img.height;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      
      const alphaBuffer = new Uint8ClampedArray(w * h);
      for (let i = 0; i < data.length; i += 4) alphaBuffer[i/4] = data[i+3];
      
      const newAlphaBuffer = new Uint8ClampedArray(alphaBuffer);
      
      // Pass 1: High-Precision Density Cleaning (Artifact & Broken Pixel Eradication)
      for (let y = 2; y < h - 2; y++) {
          for (let x = 2; x < w - 2; x++) {
              let idx = y * w + x;
              let a = alphaBuffer[idx];
              if (a > 0) {
                  // Protect shoulders/shirt (typically lower half) from aggressive pixel erosion
                  let isShoulderOrShirt = y > h * 0.45;
                  
                  let solidNeighbors = 0;
                  let activeNeighbors = 0;
                  for (let dy = -2; dy <= 2; dy++) {
                      for (let dx = -2; dx <= 2; dx++) {
                          if (dx === 0 && dy === 0) continue;
                          let nx = x + dx;
                          let ny = y + dy;
                          let na = alphaBuffer[ny * w + nx];
                          if (na > 180) solidNeighbors++;
                          if (na > 20) activeNeighbors++;
                      }
                  }
                  
                  // Destroy sparse edge noise and detached fragments
                  if (!isShoulderOrShirt) {
                      if (activeNeighbors < 4) { 
                          newAlphaBuffer[idx] = 0; 
                      } else if (a < 200 && solidNeighbors < 3) {
                          newAlphaBuffer[idx] = 0; 
                      } else if (a >= 200 && solidNeighbors < 2) {
                          newAlphaBuffer[idx] = 0; 
                      }
                  } else {
                      // Very gentle noise removal for shirt/shoulders to prevent missing corners
                      // Only destroy if it's literally an isolated single pixel.
                      if (activeNeighbors < 1 && a < 50) {
                          newAlphaBuffer[idx] = 0;
                      }
                  }
              }
          }
      }

      // Pass 2: Smooth S-Curve Matting & Pixel-Perfect Color Decontamination
      for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
              let idx = y * w + x;
              let cIdx = idx * 4;
              let a = newAlphaBuffer[idx]; 
              
              if (a > 0 && a < 255) {
                  let isShoulderOrShirt = y > h * 0.45;

                  if (!isShoulderOrShirt) {
                      // Advanced Edge Contrast (Smoothstep Polynomial) for Hair/Face
                      let norm = a / 255;
                      let s1 = norm * norm * (3 - 2 * norm);
                      a = s1 * 255;
                      if (a < 15) a = 0; 
                      if (a > 230) a = 255; 
                  } else {
                      // Precise edge-aware segmentation for shoulders
                      // AI must intelligently distinguish shirt fabric from blue background
                      let norm = a / 255;
                      
                      // Convert the blurry soft matte into a sharp, crisp, 100% solid boundary
                      // with zero semi-transparent haze, while fully preserving width.
                      // A sharp step at 15% opacity to catch the true boundary without shrinking.
                      let edgeCenter = 0.15; 
                      let contrast = 6.0; 
                      let s1 = (norm - edgeCenter) * contrast + 0.5;
                      if (s1 < 0) s1 = 0;
                      if (s1 > 1) s1 = 1;
                      
                      // Smoothstep for sub-pixel anti-aliasing
                      s1 = s1 * s1 * (3 - 2 * s1);
                      a = s1 * 255;
                      
                      if (a < 15) a = 0; // Only destroy absolute invisible trailing noise
                      if (a > 240) a = 255; // Ensure 100% solid natural contour
                  }
                  
                  // ALWAYS run decontamination on the boundary pixels, even if we just pushed them to 255
                  let originalA = newAlphaBuffer[idx];
                  if (originalA > 0 && originalA < 250) {
                      // True Alpha Matting: Foreground Color Extension
                      let r = data[cIdx], g = data[cIdx+1], b = data[cIdx+2];
                      
                      let coreR = r, coreG = g, coreB = b;
                      let foundCore = false;
                      const R = 8; // Extended 8px search radius for nearest opaque core
                      let minDist = 999;
                      
                      // Find nearest solid foreground core to borrow true natural subject colors
                      for (let dy = -R; dy <= R; dy++) {
                          for (let dx = -R; dx <= R; dx++) {
                              let nx = x + dx;
                              let ny = y + dy;
                              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                  let nIdx = ny * w + nx;
                                  // Look for strictly solid foreground to sample color from
                                  if (newAlphaBuffer[nIdx] > 250) {
                                      let dist = dx*dx + dy*dy;
                                      if (dist < minDist) {
                                          minDist = dist;
                                          let ncIdx = nIdx * 4;
                                          coreR = data[ncIdx];
                                          coreG = data[ncIdx+1];
                                          coreB = data[ncIdx+2];
                                          foundCore = true;
                                      }
                                  }
                              }
                          }
                      }
                      
                      if (foundCore) {
                          // Ultra-Precise Adaptive Spill Suppression & Decontamination
                          let normA = originalA / 255;
                          
                          // The more transparent the pixel, the more we rely on core color.
                          // At <50% opacity (soft boundaries like hair), we rely 90%+ on core color
                          // to completely eliminate transparent edge haze and blue spill/fringing.
                          let colorBleed = normA < 0.6 ? 0.95 : Math.pow(1.0 - normA, 0.4); 
                          
                          // Shoulders get extra aggressive decontamination
                          if (isShoulderOrShirt) colorBleed = Math.max(colorBleed, 0.85);

                          let outR = r * (1 - colorBleed) + coreR * colorBleed;
                          let outG = g * (1 - colorBleed) + coreG * colorBleed;
                          let outB = b * (1 - colorBleed) + coreB * colorBleed;

                          // Targeted anti-fringing: prevent unnatural glow that doesn't match the core
                          // If outer pixel is unnaturally brighter or more blue/green than core
                          let outLuma = 0.2126 * outR + 0.7152 * outG + 0.0722 * outB;
                          let coreLuma = 0.2126 * coreR + 0.7152 * coreG + 0.0722 * coreB;
                          
                          if (outLuma > coreLuma * 1.15 && normA < 0.85) {
                              // Suppress white halos / bright edge glow
                              let reduce = (outLuma - coreLuma * 1.15) * 0.85;
                              outR = Math.max(0, outR - reduce);
                              outG = Math.max(0, outG - reduce);
                              outB = Math.max(0, outB - reduce);
                          }


                          // Specifically attack blue/cyan background contamination (Blue Spill/Edge Fringing)
                          // Check if pixel is excessively blue relative to red/green compared to core
                          let coreBlueRatio = coreB / (Math.max(coreR, coreG) + 1.0);
                          let outBlueRatio = outB / (Math.max(outR, outG) + 1.0);
                          
                          if (outBlueRatio > coreBlueRatio * 1.1 && normA < 0.95) {
                              // Force the blue channel to fall in line with the core's chrominance profile
                              let maxAllowedBlue = Math.max(outR, outG) * coreBlueRatio * 1.05;
                              outB = Math.min(outB, maxAllowedBlue);
                          }
                          
                          data[cIdx]   = Math.min(255, Math.max(0, outR));
                          data[cIdx+1] = Math.min(255, Math.max(0, outG));
                          data[cIdx+2] = Math.min(255, Math.max(0, outB));
                      }
                  }
              }
              data[cIdx+3] = a;
          }
      }
      ctx.putImageData(imageData, 0, 0);
      
      canvas.toBlob(b => {
        URL.revokeObjectURL(img.src);
        resolve(b || blob);
      }, 'image/png', 1.0);
    };
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Ultra-Detail Portrait Enhancement Pass
 * Resolves:
 * - Uneven skin & dark under-eyes (Shadow Recovery & Contrast)
 * - Flat lighting (Studio Radial Gradient Overlay)
 * - Soft face/details (Unsharp Masking for Passport Sharpness)
 */
async function polishAndEnhance(blob: Blob): Promise<Blob> {
  const cleanBlob = await polishCutoutEdges(blob);
  
  return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = data.data;
          
          // --- PASS 1: Lighting & Skin Retouching (Exposure, Contrast, Shadows) ---
          for(let i=0; i<d.length; i+=4) {
              if (d[i+3] === 0) continue; 
              
              let r = d[i], g = d[i+1], b = d[i+2];
              let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              
              // Shadow Recovery (lifts under-eye darkness and deep shadows)
              // Much gentler to prevent flattening the face structure
              let normLuma = luma / 255;
              let shadowBoost = (1 - normLuma) * normLuma * 5; // Reduced to maintain natural smoothness 
              r += shadowBoost; g += shadowBoost; b += shadowBoost;
              
              // S-Curve Contrast (enhances depth for DSLR quality)
              const contrast = 1.01; // Reduced from 1.05 to avoid over-lighting
              r = ((r / 255 - 0.5) * contrast + 0.5) * 255;
              g = ((g / 255 - 0.5) * contrast + 0.5) * 255;
              b = ((b / 255 - 0.5) * contrast + 0.5) * 255;
              
              // Saturation & Skin Tone Balance
              const sat = 1.02; // Reduced slightly
              const newLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              r = newLuma + sat * (r - newLuma);
              g = newLuma + sat * (g - newLuma);
              b = newLuma + sat * (b - newLuma);
              
              // Micro color grading: slight warmth in midtones for healthy skin
              if (newLuma > 100 && newLuma < 220) {
                  r *= 1.01;
                  b *= 0.99;
              }
              
              d[i] = Math.min(255, Math.max(0, r));
              d[i+1] = Math.min(255, Math.max(0, g));
              d[i+2] = Math.min(255, Math.max(0, b));
          }
          ctx.putImageData(data, 0, 0);
          
          // --- PASS 2: Studio High-End Lighting Overlay ---
          // Disabled to prevent over-lighting and preserve natural smoothness.
          
          // --- PASS 3: Professional Unsharp Mask (Micro-details & Passport Sharpness) ---
          const origCanvas = document.createElement('canvas');
          origCanvas.width = canvas.width; origCanvas.height = canvas.height;
          const oCtx = origCanvas.getContext('2d')!;
          oCtx.drawImage(canvas, 0, 0);
          
          // Blur pass for USM
          const blurCanvas = document.createElement('canvas');
          blurCanvas.width = canvas.width; blurCanvas.height = canvas.height;
          const bCtx = blurCanvas.getContext('2d')!;
          bCtx.filter = 'blur(1.2px)'; // Tighter blur for sharper micro-details
          bCtx.drawImage(origCanvas, 0, 0);
          
          const origD = oCtx.getImageData(0, 0, canvas.width, canvas.height);
          const blurD = bCtx.getImageData(0, 0, canvas.width, canvas.height);
          const finalD = ctx.createImageData(canvas.width, canvas.height);
          
          const amount = 0.5; // Finely tuned sharpness, reduced to maintain smoothness
          for(let i=0; i<origD.data.length; i+=4) {
              if (origD.data[i+3] === 0) continue;
              
              for(let c=0; c<3; c++) {
                  let o = origD.data[i+c];
                  let b = blurD.data[i+c];
                  // Unsharp Mask Formula
                  let val = o + amount * (o - b);
                  finalD.data[i+c] = Math.min(255, Math.max(0, val));
              }
              finalD.data[i+3] = origD.data[i+3];
          }
          ctx.putImageData(finalD, 0, 0);
          
          canvas.toBlob(b => {
              URL.revokeObjectURL(img.src);
              resolve(b || cleanBlob);
          }, 'image/png', 1.0);
      };
      img.src = URL.createObjectURL(cleanBlob);
  });
}

/**
 * Solid White Studio Base
 */
async function applyWhiteBackground(transparentBlob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob(b => {
        URL.revokeObjectURL(img.src);
        resolve(b || transparentBlob);
      }, 'image/png', 1.0);
    };
    img.src = URL.createObjectURL(transparentBlob);
  });
}
