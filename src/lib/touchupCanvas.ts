/**
 * High-DPI, stepped-downscaling helper for Manual Touchup canvases.
 * Prevents browser CSS bilinear blur when displaying high-resolution photos on <canvas>
 * and preserves full native image resolution on an offscreen working canvas.
 */
export function drawSteppedHighQuality(
  src: HTMLCanvasElement | HTMLImageElement,
  dst: HTMLCanvasElement,
  dstW: number,
  dstH: number
): void {
  const srcW = src instanceof HTMLImageElement ? (src.naturalWidth || src.width) : src.width;
  const srcH = src instanceof HTMLImageElement ? (src.naturalHeight || src.height) : src.height;
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return;

  if (dst.width !== dstW) dst.width = dstW;
  if (dst.height !== dstH) dst.height = dstH;

  const dstCtx = dst.getContext('2d');
  if (!dstCtx) return;

  dstCtx.save();
  dstCtx.globalCompositeOperation = 'source-over';
  dstCtx.clearRect(0, 0, dstW, dstH);
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = 'high';

  // Progressive 0.5x downscaling when source is > 2x larger than destination
  // prevents Chromium/Android single-pass bilinear aliasing & muddiness.
  if (srcW > dstW * 2 && srcH > dstH * 2) {
    let curSrc: HTMLCanvasElement | HTMLImageElement = src;
    let curW = srcW;
    let curH = srcH;

    let stepCanvasA = document.createElement('canvas');
    let stepCanvasB = document.createElement('canvas');
    let useA = true;

    while (curW * 0.5 > dstW && curH * 0.5 > dstH) {
      const nextW = Math.max(dstW, Math.round(curW * 0.5));
      const nextH = Math.max(dstH, Math.round(curH * 0.5));
      const target = useA ? stepCanvasA : stepCanvasB;
      target.width = nextW;
      target.height = nextH;
      const tCtx = target.getContext('2d');
      if (!tCtx) break;
      tCtx.globalCompositeOperation = 'source-over';
      tCtx.clearRect(0, 0, nextW, nextH);
      tCtx.imageSmoothingEnabled = true;
      tCtx.imageSmoothingQuality = 'high';
      tCtx.drawImage(curSrc, 0, 0, nextW, nextH);
      curSrc = target;
      curW = nextW;
      curH = nextH;
      useA = !useA;
    }

    dstCtx.drawImage(curSrc, 0, 0, dstW, dstH);
  } else {
    dstCtx.drawImage(src, 0, 0, dstW, dstH);
  }

  dstCtx.restore();
}
