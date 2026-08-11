/**
 * High-Fidelity Shoulder Reconstruction & Extension Engine
 * Synthesizes natural, anatomically correct shoulders and garment textures
 * for passport photos and portraits with cropped, clipped, or cut-off shoulders.
 */

export interface ShoulderReconstructOptions {
  extendLeft?: number; // pixels to extend on the viewer's left
  extendRight?: number; // pixels to extend on the viewer's right
  shoulderStartRatio?: number; // vertical ratio from head top (0.45 - 0.70)
  clothingSlope?: number; // slope of clothing texture warp
  shoulderCurve?: number; // curvature intensity of deltoid/shoulder roundness
  smoothEdges?: boolean;
}

export function reconstructShoulders(
  imageSrc: string,
  options: ShoulderReconstructOptions = {}
): Promise<string> {
  const {
    extendLeft = 50,
    extendRight = 0,
    shoulderStartRatio = 0.52,
    clothingSlope = 0.18,
    shoulderCurve = 0.50,
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const W = img.width;
      const H = img.height;

      const padLeft = Math.max(0, Math.round(extendLeft));
      const padRight = Math.max(0, Math.round(extendRight));
      const W_new = W + padLeft + padRight;

      if (padLeft === 0 && padRight === 0) {
        resolve(imageSrc);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = W_new;
      canvas.height = H;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(imageSrc);
        return;
      }

      ctx.clearRect(0, 0, W_new, H);

      // Draw original image shifted by padLeft
      ctx.drawImage(img, padLeft, 0);

      const fullData = ctx.getImageData(0, 0, W_new, H);
      const pixels = fullData.data;

      // Sample border columns for background blending
      const origLeftX = padLeft;
      const origRightX = padLeft + W - 1;

      // Determine subject top and shoulder starting point
      let topY = H;
      let bottomY = 0;
      for (let y = 0; y < H; y++) {
        for (let x = origLeftX; x <= origRightX; x++) {
          const idx = (y * W_new + x) * 4;
          if (pixels[idx + 3] > 40) {
            if (y < topY) topY = y;
            if (y > bottomY) bottomY = y;
            break;
          }
        }
      }

      if (topY >= bottomY) {
        topY = 0;
        bottomY = H;
      }

      const subjHeight = bottomY - topY;
      const y_start = Math.floor(topY + subjHeight * shoulderStartRatio);

      // Create vector masks for Left and Right extended shoulder paths
      const pathCanvas = document.createElement('canvas');
      pathCanvas.width = W_new;
      pathCanvas.height = H;
      const pctx = pathCanvas.getContext('2d');

      if (pctx) {
        pctx.fillStyle = '#000000';
        pctx.fillRect(0, 0, W_new, H);

        pctx.fillStyle = '#ffffff';

        // 1. Left Shoulder Path (if extending left)
        if (padLeft > 0) {
          pctx.beginPath();
          pctx.moveTo(padLeft, H);
          pctx.lineTo(padLeft + 15, H);
          pctx.lineTo(padLeft + 15, y_start);
          pctx.lineTo(padLeft, y_start);

          // Smooth anatomical bezier curve outward to x=0 at bottom
          const cp1x = padLeft * 0.50;
          const cp1y = y_start + (H - y_start) * 0.10;
          const cp2x = 0;
          const cp2y = y_start + (H - y_start) * shoulderCurve;

          pctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, 0, H);
          pctx.closePath();
          pctx.fill();
        }

        // 2. Right Shoulder Path (if extending right)
        if (padRight > 0) {
          const rightOrigin = padLeft + W;
          pctx.beginPath();
          pctx.moveTo(rightOrigin, H);
          pctx.lineTo(rightOrigin - 15, H);
          pctx.lineTo(rightOrigin - 15, y_start);
          pctx.lineTo(rightOrigin, y_start);

          // Smooth anatomical bezier curve outward to x=W_new at bottom
          const cp1x = rightOrigin + padRight * 0.50;
          const cp1y = y_start + (H - y_start) * 0.10;
          const cp2x = W_new;
          const cp2y = y_start + (H - y_start) * shoulderCurve;

          pctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, W_new, H);
          pctx.closePath();
          pctx.fill();
        }
      }

      const maskData = pctx ? pctx.getImageData(0, 0, W_new, H).data : null;

      // Sample original edge background pixels
      const leftBgCol: { r: number; g: number; b: number; a: number }[] = [];
      const rightBgCol: { r: number; g: number; b: number; a: number }[] = [];

      for (let y = 0; y < H; y++) {
        const lIdx = (y * W_new + origLeftX) * 4;
        const rIdx = (y * W_new + origRightX) * 4;
        leftBgCol.push({
          r: pixels[lIdx],
          g: pixels[lIdx + 1],
          b: pixels[lIdx + 2],
          a: pixels[lIdx + 3],
        });
        rightBgCol.push({
          r: pixels[rIdx],
          g: pixels[rIdx + 1],
          b: pixels[rIdx + 2],
          a: pixels[rIdx + 3],
        });
      }

      // Synthesize Left Shoulder Texture
      if (padLeft > 0) {
        for (let y = 0; y < H; y++) {
          const bgY = y < y_start ? y : Math.max(0, y_start - 1);
          const bg = leftBgCol[bgY] || { r: 0, g: 0, b: 0, a: 0 };

          for (let x = 0; x < padLeft; x++) {
            const idx = (y * W_new + x) * 4;
            const maskVal = maskData ? maskData[idx] : 0;
            const alpha = maskVal / 255;

            if (alpha > 0) {
              const distFromEdge = padLeft - x;
              const srcY = Math.min(H - 1, Math.max(0, y - Math.floor(distFromEdge * clothingSlope)));
              const srcX = Math.min(origRightX, origLeftX + Math.floor(distFromEdge * 0.75));
              const srcIdx = (srcY * W_new + srcX) * 4;

              const texR = pixels[srcIdx];
              const texG = pixels[srcIdx + 1];
              const texB = pixels[srcIdx + 2];
              const texA = pixels[srcIdx + 3];

              // Natural ambient shading falloff on garment edge
              const lighting = 1.0 - (distFromEdge / Math.max(1, padLeft)) * 0.04;
              const finalR = Math.max(0, Math.min(255, texR * lighting));
              const finalG = Math.max(0, Math.min(255, texG * lighting));
              const finalB = Math.max(0, Math.min(255, texB * lighting));

              if (bg.a < 15) {
                // Transparent background - keep alpha crisp
                pixels[idx] = Math.round(finalR);
                pixels[idx + 1] = Math.round(finalG);
                pixels[idx + 2] = Math.round(finalB);
                pixels[idx + 3] = Math.round(texA * alpha);
              } else {
                // Blend with background
                pixels[idx] = Math.round(finalR * alpha + bg.r * (1 - alpha));
                pixels[idx + 1] = Math.round(finalG * alpha + bg.g * (1 - alpha));
                pixels[idx + 2] = Math.round(finalB * alpha + bg.b * (1 - alpha));
                pixels[idx + 3] = Math.round(texA * alpha + bg.a * (1 - alpha));
              }
            } else {
              // Background zone outside shoulder
              if (bg.a < 15) {
                pixels[idx + 3] = 0;
              } else {
                pixels[idx] = bg.r;
                pixels[idx + 1] = bg.g;
                pixels[idx + 2] = bg.b;
                pixels[idx + 3] = bg.a;
              }
            }
          }
        }
      }

      // Synthesize Right Shoulder Texture
      if (padRight > 0) {
        const rightOrigin = padLeft + W;
        for (let y = 0; y < H; y++) {
          const bgY = y < y_start ? y : Math.max(0, y_start - 1);
          const bg = rightBgCol[bgY] || { r: 0, g: 0, b: 0, a: 0 };

          for (let x = rightOrigin; x < W_new; x++) {
            const idx = (y * W_new + x) * 4;
            const maskVal = maskData ? maskData[idx] : 0;
            const alpha = maskVal / 255;

            if (alpha > 0) {
              const distFromEdge = x - rightOrigin;
              const srcY = Math.min(H - 1, Math.max(0, y - Math.floor(distFromEdge * clothingSlope)));
              const srcX = Math.max(origLeftX, origRightX - Math.floor(distFromEdge * 0.75));
              const srcIdx = (srcY * W_new + srcX) * 4;

              const texR = pixels[srcIdx];
              const texG = pixels[srcIdx + 1];
              const texB = pixels[srcIdx + 2];
              const texA = pixels[srcIdx + 3];

              // Natural ambient shading falloff on garment edge
              const lighting = 1.0 - (distFromEdge / Math.max(1, padRight)) * 0.04;
              const finalR = Math.max(0, Math.min(255, texR * lighting));
              const finalG = Math.max(0, Math.min(255, texG * lighting));
              const finalB = Math.max(0, Math.min(255, texB * lighting));

              if (bg.a < 15) {
                // Transparent background
                pixels[idx] = Math.round(finalR);
                pixels[idx + 1] = Math.round(finalG);
                pixels[idx + 2] = Math.round(finalB);
                pixels[idx + 3] = Math.round(texA * alpha);
              } else {
                // Blend with background
                pixels[idx] = Math.round(finalR * alpha + bg.r * (1 - alpha));
                pixels[idx + 1] = Math.round(finalG * alpha + bg.g * (1 - alpha));
                pixels[idx + 2] = Math.round(finalB * alpha + bg.b * (1 - alpha));
                pixels[idx + 3] = Math.round(texA * alpha + bg.a * (1 - alpha));
              }
            } else {
              // Background zone outside shoulder
              if (bg.a < 15) {
                pixels[idx + 3] = 0;
              } else {
                pixels[idx] = bg.r;
                pixels[idx + 1] = bg.g;
                pixels[idx + 2] = bg.b;
                pixels[idx + 3] = bg.a;
              }
            }
          }
        }
      }

      ctx.putImageData(fullData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = (e) => reject(e);
    img.src = imageSrc;
  });
}
