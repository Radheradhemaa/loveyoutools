import React, { useState, useRef, useEffect } from 'react';
import { Download, Layout, Sliders, Loader2, X, Scissors, Wand2, ArrowRight, Image as ImageIcon, Crop, Sparkles, Printer, Check, ZoomIn, ZoomOut, Maximize2, Undo, Redo } from 'lucide-react';
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import ToolLayout from '../components/tool-system/ToolLayout';
import { removeBackground as imglyRemoveBackground, preload } from '@imgly/background-removal';

// Preload the model in the background immediately to make the first run faster
preload({ model: 'isnet_fp16', device: 'gpu' }).catch(() => {});

// --- Configuration ---
const PRESETS = [
  { id: 'free', name: 'Free Crop', width: 0, height: 0 },
  { id: 'india', name: 'India (35x45 mm)', width: 35, height: 45 },
  { id: 'usa', name: 'USA (2x2 inch)', width: 51, height: 51 },
  { id: 'uk', name: 'UK (35x45 mm)', width: 35, height: 45 },
  { id: 'europe', name: 'Europe (35x45 mm)', width: 35, height: 45 },
  { id: 'singapore', name: 'Singapore (35x45 mm)', width: 35, height: 45 },
  { id: 'australia', name: 'Australia (35x45 mm)', width: 35, height: 45 },
];

const PAPER_SIZES = [
  { id: 'single', name: 'Single Photo', width: 0, height: 0 },
  { id: 'a4', name: 'A4 (210 x 297 mm)', width: 210, height: 297 },
  { id: 'a5', name: 'A5 (148 x 210 mm)', width: 148, height: 210 },
  { id: '4x6', name: '4 x 6 inch', width: 101.6, height: 152.4 },
  { id: '5x7', name: '5 x 7 inch', width: 127, height: 177.8 },
  { id: 'custom', name: 'Custom Size', width: 210, height: 297 },
];

const COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Blue', value: '#1e3a8a' },
  { name: 'Light Blue', value: '#E6F0FF' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Gray', value: '#f3f4f6' },
  { name: 'Transparent', value: 'transparent' }
];

type Step = 'crop' | 'edit' | 'print';

export default function PassportPhotoMaker() {
  const [step, setStep] = useState<Step>('crop');
  
  // Removed preload engine model on mount to prevent concurrent loading deadlocks
  
  // Image States
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const initialFilesProcessed = useRef(false);
  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [bgRemovedImageSrc, setBgRemovedImageSrc] = useState<string | null>(null);
  const [finalImageSrc, setFinalImageSrc] = useState<string | null>(null);
  const [printImageElement, setPrintImageElement] = useState<HTMLImageElement | null>(null);
  
  // Crop States
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [completedPercentCrop, setCompletedPercentCrop] = useState<CropType>();
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1); // Default zoom at 100%
  
  // Settings States
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[1]); // Default 35x45
  const [bgColor, setBgColor] = useState(COLORS[0].value);
  const [customColor, setCustomColor] = useState('#ffffff');
  const [dpi, setDpi] = useState(300);
  
  // Adjustments
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [sharpness, setSharpness] = useState(0);
  const [smoothness, setSmoothness] = useState(0);
  const [edgeSoftness, setEdgeSoftness] = useState(0);
  const [beautyFace, setBeautyFace] = useState(0);
  const [isUltraHD, setIsUltraHD] = useState(false);
  
  // Debounced Adjustments for Performance
  const [appliedAdjustments, setAppliedAdjustments] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sharpness: 0,
    smoothness: 0,
    edgeSoftness: 0,
    beautyFace: 0,
    isUltraHD: false
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedAdjustments({
        brightness,
        contrast,
        saturation,
        sharpness,
        smoothness,
        edgeSoftness,
        beautyFace,
        isUltraHD
      });
    }, 150); // 150ms debounce
    return () => clearTimeout(timer);
  }, [brightness, contrast, saturation, sharpness, smoothness, edgeSoftness, beautyFace, isUltraHD]);
  
  // History for Undo/Redo
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const addToHistory = (src: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(src);
    if (newHistory.length > 20) newHistory.shift(); // Limit history size
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const updateCanvasFromSrc = (src: string | null) => {
    const canvas = touchupCanvasRef.current;
    if (!canvas || !croppedImageSrc) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.globalCompositeOperation = 'copy'; // Replaces existing content including transparency
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    img.src = src || croppedImageSrc;
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      const prevSrc = history[prevIndex];
      // If we're back to the first item, it's the original cropped image
      setBgRemovedImageSrc(prevIndex === 0 ? null : prevSrc);
      updateCanvasFromSrc(prevSrc);
      // Clear final image to force re-render of adjustments
      setFinalImageSrc(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const nextSrc = history[nextIndex];
      setBgRemovedImageSrc(nextSrc);
      updateCanvasFromSrc(nextSrc);
      // Clear final image to force re-render of adjustments
      setFinalImageSrc(null);
    }
  };
  
  // Print States
  const [paperSize, setPaperSize] = useState(PAPER_SIZES[1]); // Default A4
  const [customPaper, setCustomPaper] = useState({ width: 210, height: 297 });
  const [hasBorder, setHasBorder] = useState(true);
  const [hasCutLines, setHasCutLines] = useState(true);
  
  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');

  // Manual Touchup State
  const [isManualMode, setIsManualMode] = useState(false);
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const touchupCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalPatternRef = useRef<CanvasPattern | null>(null);
  const lastPosRef = useRef<{x: number, y: number} | null>(null);

  // --- Manual Touchup Logic ---
  useEffect(() => {
    if (isManualMode && step === 'edit') {
      let isMounted = true;
      const initCanvas = async () => {
        const canvas = touchupCanvasRef.current;
        if (!canvas || !croppedImageSrc) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const origImg = new Image();
        origImg.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          origImg.onload = resolve;
          origImg.src = croppedImageSrc;
        });

        if (!isMounted) return;
        canvas.width = origImg.width;
        canvas.height = origImg.height;

        const pattern = ctx.createPattern(origImg, 'no-repeat');
        originalPatternRef.current = pattern;

        const currentImgSrc = bgRemovedImageSrc || croppedImageSrc;
        const currentImg = new Image();
        currentImg.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          currentImg.onload = resolve;
          currentImg.src = currentImgSrc;
        });

        if (!isMounted) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(currentImg, 0, 0, canvas.width, canvas.height);
      };
      initCanvas();
      return () => { isMounted = false; };
    }
  }, [isManualMode, step, bgRemovedImageSrc]); // Now depends on bgRemovedImageSrc to update when AI finishes

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = touchupCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    setIsDrawing(true);
    lastPosRef.current = getCoordinates(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !lastPosRef.current || !touchupCanvasRef.current) return;
    if (e.cancelable) e.preventDefault();
    
    const ctx = touchupCanvasRef.current.getContext('2d');
    if (!ctx) return;

    const currentPos = getCoordinates(e);
    if (!currentPos) return;

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (brushMode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = originalPatternRef.current || 'rgba(0,0,0,1)';
    }

    ctx.stroke();
    lastPosRef.current = currentPos;
  };

  const stopDrawing = () => {
    if (isDrawing && touchupCanvasRef.current) {
      setIsDrawing(false);
      lastPosRef.current = null;
      const result = touchupCanvasRef.current.toDataURL('image/png', 1.0);
      setBgRemovedImageSrc(result);
      addToHistory(result);
    }
  };

  // --- 1. Load Image & Initialize Crop ---
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setImgDimensions({ width, height });
    const aspect = selectedPreset.id !== 'free' ? selectedPreset.width / selectedPreset.height : undefined;
    
    let initialCrop;
    if (aspect) {
      initialCrop = centerCrop(
        makeAspectCrop({ unit: '%', width: 80 }, aspect, width, height),
        width,
        height
      );
    } else {
      initialCrop = centerCrop(
        { unit: '%', width: 80, height: 80, x: 10, y: 10 },
        width,
        height
      );
    }
    setCrop(initialCrop);
    setCompletedPercentCrop(initialCrop);
    
    // Set completed crop in pixels for immediate "Next" click
    setCompletedCrop({
      unit: 'px',
      x: (initialCrop.x * width) / 100,
      y: (initialCrop.y * height) / 100,
      width: (initialCrop.width * width) / 100,
      height: (initialCrop.height * height) / 100,
    });
  };

  // Update crop aspect ratio when preset changes
  useEffect(() => {
    if (imgRef.current && selectedPreset.id !== 'free') {
      const { width, height } = imgRef.current;
      const aspect = selectedPreset.width / selectedPreset.height;
      const newCrop = centerCrop(
        makeAspectCrop({ unit: '%', width: 80 }, aspect, width, height),
        width,
        height
      );
      setCrop(newCrop);
      setCompletedPercentCrop(newCrop);
      
      // Also update completed crop
      setCompletedCrop({
        unit: 'px',
        x: (newCrop.x * width) / 100,
        y: (newCrop.y * height) / 100,
        width: (newCrop.width * width) / 100,
        height: (newCrop.height * height) / 100,
      });
    }
  }, [selectedPreset]);

  // --- 2. Handle Crop Completion ---
  const handleCropComplete = () => {
    if (!completedPercentCrop || !imgRef.current) return;

    const canvas = document.createElement('canvas');
    const naturalWidth = imgRef.current.naturalWidth;
    const naturalHeight = imgRef.current.naturalHeight;
    
    // Use percentage crop for maximum precision against the natural dimensions
    const cropX = (completedPercentCrop.x * naturalWidth) / 100;
    const cropY = (completedPercentCrop.y * naturalHeight) / 100;
    const cropWidth = (completedPercentCrop.width * naturalWidth) / 100;
    const cropHeight = (completedPercentCrop.height * naturalHeight) / 100;

    canvas.width = Math.round(cropWidth);
    canvas.height = Math.round(cropHeight);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      imgRef.current,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const croppedDataUrl = canvas.toDataURL('image/png', 1.0);
    setCroppedImageSrc(croppedDataUrl);
    setBgRemovedImageSrc(null); // Reset BG removal if recropped
    setFinalImageSrc(null); // Clear final image to show loader while processing
    setHistory([croppedDataUrl]); // Initialize history with the original cropped image
    setHistoryIndex(0);
    setStep('edit');
    setZoom(1); // Reset to default zoom
  };

  // --- 3. Background Removal ---
  const resizeImage = (src: string, maxDim: number): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(new Blob());
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(blob || new Blob());
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => resolve(new Blob());
      img.src = src;
    });
  };

  const refineMask = (blob: Blob): Promise<Blob> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(blob);
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // 1. Noise Removal (Morphological Opening Simulation)
        const alphaData = new Uint8Array(width * height);
        for (let i = 0; i < data.length; i += 4) alphaData[i/4] = data[i+3];
        
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (alphaData[idx] > 0 && alphaData[idx] < 80) {
              let count = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (alphaData[(y+dy)*width + (x+dx)] > 0) count++;
                }
              }
              if (count < 3) data[idx*4 + 3] = 0;
            }
          }
        }
        
        // 2. Advanced Alpha Matting & Edge Refinement (Sub-3s target)
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha === 0) continue;

          // Thresholding with soft transition (Guided Filter simulation)
          let newAlpha;
          if (alpha < 90) newAlpha = 0; 
          else if (alpha > 240) newAlpha = 255;
          else {
            const t = (alpha - 90) / 150;
            newAlpha = (t * t * (3 - 2 * t)) * 255;
          }
          data[i + 3] = newAlpha;

          // 3. Alpha Matting (De-contamination)
          const a = newAlpha / 255;
          if (a > 0 && a < 1) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            // Recover subject color assuming white background bleed
            data[i] = Math.max(0, Math.min(255, (r - 255 * (1 - a)) / a));
            data[i + 1] = Math.max(0, Math.min(255, (g - 255 * (1 - a)) / a));
            data[i + 2] = Math.max(0, Math.min(255, (b - 255 * (1 - a)) / a));
            // Natural boost
            data[i] *= 1.02; data[i+1] *= 1.02; data[i+2] *= 1.02;
          }
        }

        // 4. Subject Enhancement: Slight Sharpening (3x3 Convolution)
        const originalData = new Uint8ClampedArray(data);
        const kernel = [0, -0.1, 0, -0.1, 1.4, -0.1, 0, -0.1, 0];
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            if (data[idx + 3] > 200) {
              for (let c = 0; c < 3; c++) {
                let val = 0;
                for (let ky = -1; ky <= 1; ky++) {
                  for (let kx = -1; kx <= 1; kx++) {
                    val += originalData[((y+ky)*width + (x+kx))*4 + c] * kernel[(ky+1)*3 + (kx+1)];
                  }
                }
                data[idx + c] = val;
              }
            }
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((refinedBlob) => {
          URL.revokeObjectURL(url);
          resolve(refinedBlob || blob);
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(blob);
      };
      img.src = url;
    });
  };

  const removeBackground = async (retryCount = 0) => {
    if (!croppedImageSrc) return;
    setIsProcessing(true);
    setIsManualMode(false);
    setStatusText('Removing Background...');
    
    try {
      // Native Model Resolution (512px) for absolute 3s speed
      const optimizedBlob = await resizeImage(croppedImageSrc, 512);
      const rawBlob = await imglyRemoveBackground(optimizedBlob, {
        model: 'isnet', // Upgraded to full IS-Net for maximum precision
        device: 'gpu',
        output: { format: 'image/png', quality: 1.0 }
      });

      const blob = await refineMask(rawBlob);
      
      // Upscale to original dimensions to prevent shifts and maintain quality
      const upscaledBlob = await new Promise<Blob>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const origImg = new Image();
          origImg.onload = () => {
            canvas.width = origImg.width;
            canvas.height = origImg.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(blob); return; }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((b) => resolve(b || blob), 'image/png');
          };
          origImg.src = croppedImageSrc;
        };
        img.src = URL.createObjectURL(blob);
      });

      const url = URL.createObjectURL(upscaledBlob);
      setBgRemovedImageSrc(url);
      addToHistory(url);

    } catch (error) {
      console.error("BG Removal Error:", error);
      alert("AI background removal failed. You can use 'Manual Touchup' to remove the background manually.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- 4. Apply Adjustments & Background Color ---
  useEffect(() => {
    const sourceImage = bgRemovedImageSrc || croppedImageSrc;
    if (!sourceImage) {
      setFinalImageSrc(null);
      return;
    }

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!isMounted) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw Background
      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor === 'custom' ? customColor : bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Apply Filters
      let b = appliedAdjustments.brightness;
      let c = appliedAdjustments.contrast;
      let s = appliedAdjustments.saturation;
      
      if (appliedAdjustments.isUltraHD) {
        c += 15; // Increased boost
        s += 20; // Increased boost
      }
      
      let filterString = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
      
      if (appliedAdjustments.smoothness > 0) {
        // Skin smoothing: subtle blur
        filterString += ` blur(${appliedAdjustments.smoothness / 100}px)`;
      }

      if (appliedAdjustments.beautyFace > 0) {
        // Beauty face: subtle blur + brightness boost + contrast reduction + saturation boost
        const beautyBlur = appliedAdjustments.beautyFace / 80;
        const beautyBright = 100 + (appliedAdjustments.beautyFace / 15);
        const beautyContrast = 100 - (appliedAdjustments.beautyFace / 20);
        const beautySaturate = 100 + (appliedAdjustments.beautyFace / 20);
        filterString += ` blur(${beautyBlur}px) brightness(${beautyBright}%) contrast(${beautyContrast}%) saturate(${beautySaturate}%)`;
      }

      if (appliedAdjustments.edgeSoftness > 0) {
        // Edge adjustment: drop-shadow + very subtle blur for feathering
        const edgeBlur = appliedAdjustments.edgeSoftness / 50;
        filterString += ` drop-shadow(0 0 ${edgeBlur}px rgba(0,0,0,0.15)) blur(${edgeBlur / 2}px)`;
      }
      
      ctx.filter = filterString;
      
      // Draw Image
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none'; // Reset

      // Apply Sharpness (Highly Optimized Convolution)
      const finalSharpness = appliedAdjustments.isUltraHD ? (appliedAdjustments.sharpness + 60) : appliedAdjustments.sharpness;
      if (finalSharpness > 0) {
        const amount = finalSharpness / 100; // More balanced sharpening
        const a = amount;
        const b_val = 1 + 4 * a;
        
        const sw = canvas.width;
        const sh = canvas.height;
        const imageData = ctx.getImageData(0, 0, sw, sh);
        const pixels = imageData.data;
        const output = ctx.createImageData(sw, sh);
        const dst = output.data;

        // Highly optimized convolution loop (unrolled 3x3)
        for (let i = 0; i < pixels.length; i += 4) {
          const x = (i / 4) % sw;
          const y = Math.floor((i / 4) / sw);
          
          // Skip edges for simplicity in the tight loop
          if (x === 0 || x === sw - 1 || y === 0 || y === sh - 1) {
            dst[i] = pixels[i];
            dst[i+1] = pixels[i+1];
            dst[i+2] = pixels[i+2];
            dst[i+3] = pixels[i+3];
            continue;
          }

          const iUp = i - sw * 4;
          const iDown = i + sw * 4;
          const iLeft = i - 4;
          const iRight = i + 4;

          // Apply kernel: [0, -a, 0], [-a, 1+4a, -a], [0, -a, 0]
          dst[i]     = pixels[i] * b_val - (pixels[iUp] + pixels[iDown] + pixels[iLeft] + pixels[iRight]) * a;
          dst[i + 1] = pixels[i + 1] * b_val - (pixels[iUp + 1] + pixels[iDown + 1] + pixels[iLeft + 1] + pixels[iRight + 1]) * a;
          dst[i + 2] = pixels[i + 2] * b_val - (pixels[iUp + 2] + pixels[iDown + 2] + pixels[iLeft + 2] + pixels[iRight + 2]) * a;
          dst[i + 3] = pixels[i + 3];
        }
        ctx.putImageData(output, 0, 0);
      }

      // Add Border if requested
      if (hasBorder) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(2, Math.round(canvas.width / 200));
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }

      if (isMounted) {
        setFinalImageSrc(canvas.toDataURL('image/png', 1.0));
      }
    };
    img.onerror = () => {
      if (isMounted) setFinalImageSrc(sourceImage); // Fallback to source if processing fails
    };
    img.src = sourceImage;
    return () => { isMounted = false; };
  }, [croppedImageSrc, bgRemovedImageSrc, bgColor, customColor, appliedAdjustments, hasBorder]);

  useEffect(() => {
    if (!finalImageSrc) {
      setPrintImageElement(null);
      return;
    }
    const img = new Image();
    img.onload = () => setPrintImageElement(img);
    img.src = finalImageSrc;
  }, [finalImageSrc]);

  // --- 5. Generate Print Layout ---
  const handleDownload = () => {
    if (!finalImageSrc || !printImageElement) return;
    
    if (paperSize.id === 'single') {
      if (selectedPreset.id === 'free') {
        const link = document.createElement('a');
        link.href = finalImageSrc;
        link.download = `passport-photo-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      } else {
        const photoWidth = Math.round((selectedPreset.width / 25.4) * dpi);
        const photoHeight = Math.round((selectedPreset.height / 25.4) * dpi);
        
        const canvas = document.createElement('canvas');
        canvas.width = photoWidth;
        canvas.height = photoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(printImageElement, 0, 0, photoWidth, photoHeight);
        
        const dataURLtoBlob = (dataurl: string) => {
          const arr = dataurl.split(',');
          const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          return new Blob([u8arr], { type: mime });
        };

        const dataUrl = canvas.toDataURL('image/png', 1.0);
        const blob = dataURLtoBlob(dataUrl);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `passport-photo-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
    }

    // Generate A4/Grid
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const sheetWidthMm = paperSize.id === 'custom' ? customPaper.width : paperSize.width;
    const sheetHeightMm = paperSize.id === 'custom' ? customPaper.height : paperSize.height;
    
    const sheetWidth = Math.round((sheetWidthMm / 25.4) * dpi);
    const sheetHeight = Math.round((sheetHeightMm / 25.4) * dpi);
    
    canvas.width = sheetWidth;
    canvas.height = sheetHeight;
    
    // Fill white background for paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    const targetPreset = selectedPreset.id === 'free' ? PRESETS[1] : selectedPreset;
    const photoWidth = Math.round((targetPreset.width / 25.4) * dpi);
    const photoHeight = Math.round((targetPreset.height / 25.4) * dpi);
    const margin = Math.round((5 / 25.4) * dpi); // 5mm margin between photos
    
    const cols = Math.floor((sheetWidth - margin) / (photoWidth + margin));
    const rows = Math.floor((sheetHeight - margin) / (photoHeight + margin));
    
    if (cols <= 0 || rows <= 0) {
      alert("Paper size is too small for even one photo.");
      return;
    }
    
    // Center the grid on the paper
    const startX = (sheetWidth - (cols * photoWidth + (cols - 1) * margin)) / 2;
    const startY = (sheetHeight - (rows * photoHeight + (rows - 1) * margin)) / 2;
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (photoWidth + margin);
        const y = startY + r * (photoHeight + margin);
        
        ctx.drawImage(printImageElement, x, y, photoWidth, photoHeight);
        
        if (hasCutLines) {
          ctx.strokeStyle = '#cccccc';
          ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
          ctx.setLineDash([Math.round(dpi/10), Math.round(dpi/10)]);
          ctx.strokeRect(x - margin/2, y - margin/2, photoWidth + margin, photoHeight + margin);
          ctx.setLineDash([]);
        }
      }
    }
    
    const dataURLtoBlob = (dataurl: string) => {
      const arr = dataurl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    };

    const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
    const blob = dataURLtoBlob(dataUrl);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `passport-print-${paperSize.name.replace(/\s+/g, '-')}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // --- Render Helpers ---
  const renderPrintPreview = () => {
    if (!finalImageSrc) return null;
    if (paperSize.id === 'single') {
      return (
        <div className="p-4">
          <img 
            src={finalImageSrc} 
            alt="Single Print" 
            className="object-contain shadow-2xl border border-gray-200 transition-all duration-300 mx-auto" 
            style={{ 
              zoom: zoom,
              height: `70vh`,
              maxWidth: `100%`,
              imageRendering: 'high-quality' 
            }}
          />
        </div>
      );
    }

    const sheetWidthMm = paperSize.id === 'custom' ? customPaper.width : paperSize.width;
    const sheetHeightMm = paperSize.id === 'custom' ? customPaper.height : paperSize.height;
    const targetPreset = selectedPreset.id === 'free' ? PRESETS[1] : selectedPreset;
    const photoWidthMm = targetPreset.width;
    const photoHeightMm = targetPreset.height;
    const marginMm = 5;
    
    const cols = Math.floor((sheetWidthMm - marginMm) / (photoWidthMm + marginMm));
    const rows = Math.floor((sheetHeightMm - marginMm) / (photoHeightMm + marginMm));
    
    if (cols <= 0 || rows <= 0) return <div className="p-4 text-center text-gray-500 font-bold">Paper size too small.</div>;
    
    const startXMm = (sheetWidthMm - (cols * photoWidthMm + (cols - 1) * marginMm)) / 2;
    const startYMm = (sheetHeightMm - (rows * photoHeightMm + (rows - 1) * marginMm)) / 2;

    return (
      <div className="p-4">
        <div 
          className="bg-white shadow-2xl relative transition-all duration-300 mx-auto" 
          style={{ 
            zoom: zoom,
            height: `70vh`,
            maxWidth: `100%`,
            aspectRatio: `${sheetWidthMm} / ${sheetHeightMm}`,
          }}
        >
          {Array.from({ length: rows }).map((_, r) => Array.from({ length: cols }).map((_, c) => {
            const x = startXMm + c * (photoWidthMm + marginMm);
            const y = startYMm + r * (photoHeightMm + marginMm);
            return (
              <div 
                key={`${r}-${c}`} 
                className="absolute flex items-center justify-center" 
                style={{ 
                  left: `${(x / sheetWidthMm) * 100}%`, 
                  top: `${(y / sheetHeightMm) * 100}%`, 
                  width: `${(photoWidthMm / sheetWidthMm) * 100}%`, 
                  height: `${(photoHeightMm / sheetHeightMm) * 100}%` 
                }}
              >
                {hasCutLines && (
                  <div 
                    className="absolute border border-dashed border-gray-400 pointer-events-none" 
                    style={{ 
                      left: `-${(marginMm/2 / photoWidthMm) * 100}%`, 
                      top: `-${(marginMm/2 / photoHeightMm) * 100}%`, 
                      width: `${((photoWidthMm + marginMm) / photoWidthMm) * 100}%`, 
                      height: `${((photoHeightMm + marginMm) / photoHeightMm) * 100}%` 
                    }} 
                  />
                )}
                <img 
                  src={finalImageSrc} 
                  alt="Copy" 
                  className="w-full h-full object-cover shadow-sm" 
                  style={{ imageRendering: 'high-quality' }}
                />
              </div>
            );
          }))}
        </div>
        <div className="mt-4 text-xs text-gray-500 font-bold uppercase tracking-widest">
          Preview: {cols * rows} photos on {paperSize.name}
        </div>
      </div>
    );
  };

  return (
    <ToolLayout
      title="Passport Size Photo Maker"
      description="Create professional passport, visa, and ID photos instantly. Step-by-step process with background removal, custom sizes, and A4 print layouts."
      toolId="passport-photo-maker"
      acceptedFileTypes={['image/jpeg', 'image/png', 'image/webp']}
      onDownload={handleDownload}
    >
      {({ file, onComplete, onReset }) => {
        
  // Handle initial file load
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file as File);
      setImageSrc(url);
      // Reset all states for new image
      setCroppedImageSrc(null);
      setBgRemovedImageSrc(null);
      setFinalImageSrc(null);
      setHistory([]);
      setHistoryIndex(-1);
      setStep('crop');
      setZoom(0.8);
      return () => URL.revokeObjectURL(url);
    } else {
      // Reset everything when file is null
      setImageSrc(null);
      setCroppedImageSrc(null);
      setBgRemovedImageSrc(null);
      setFinalImageSrc(null);
      setHistory([]);
      setHistoryIndex(-1);
      setStep('crop');
      setZoom(0.8);
    }
  }, [file]);

        return (
          <div className="flex flex-col lg:flex-row w-full h-full bg-gray-50 overflow-hidden">
            
            {/* --- SIDEBAR (STEPS & CONTROLS) --- */}
            <aside className="w-full lg:w-[320px] bg-white border-r border-gray-200 flex flex-col h-[40vh] lg:h-full z-10 shadow-lg">
              
              {/* Stepper Header */}
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
                {[
                  { id: 'crop', label: '1. Crop' },
                  { id: 'edit', label: '2. Edit' },
                  { id: 'print', label: '3. Print' }
                ].map((s, idx) => (
                  <div key={s.id} className={`flex items-center gap-2 ${step === s.id ? 'text-[#e8501a]' : 'text-gray-400'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      step === s.id ? 'bg-[#e8501a] text-white' : 
                      (['crop', 'edit', 'print'].indexOf(step) > idx ? 'bg-[#e8501a]/20 text-[#e8501a]' : 'bg-gray-200 text-gray-500')
                    }`}>
                      {idx + 1}
                    </div>
                    <span className="text-xs font-bold hidden sm:block">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Controls Area */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                
                {/* STEP 1: CROP */}
                {step === 'crop' && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-left-4">
                    <div>
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Crop className="w-4 h-4" /> Select Size
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {PRESETS.map(preset => (
                          <button
                            key={preset.id}
                            onClick={() => setSelectedPreset(preset)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              selectedPreset.id === preset.id 
                                ? 'border-[#e8501a] bg-[#e8501a]/5 ring-1 ring-[#e8501a]' 
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="font-bold text-xs text-gray-800">{preset.name}</div>
                            {preset.id !== 'free' && (
                              <div className="text-[10px] text-gray-500 mt-1">{preset.width} × {preset.height} mm</div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-blue-50 text-blue-800 p-3 rounded-xl text-xs flex items-start gap-2">
                      <div className="mt-0.5">ℹ️</div>
                      <p>Adjust the crop box on the image to frame the face properly. The aspect ratio is locked to your selected size.</p>
                    </div>
                  </div>
                )}

                {/* STEP 2: EDIT */}
                {step === 'edit' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
                    
                    {/* Background */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                          <Wand2 className="w-4 h-4" /> Background
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={undo}
                            disabled={historyIndex <= 0}
                            className="p-1.5 bg-white text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            title="Undo"
                          >
                            <Undo className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={redo}
                            disabled={historyIndex >= history.length - 1}
                            className="p-1.5 bg-white text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            title="Redo"
                          >
                            <Redo className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mb-4">
                        <button
                          onClick={removeBackground}
                          disabled={isProcessing}
                          className="flex-1 py-2.5 px-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70"
                        >
                          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          AI Auto Remove
                        </button>
                        <button
                          onClick={() => setIsManualMode(!isManualMode)}
                          className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                            isManualMode ? 'bg-[#e8501a] text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          {isManualMode ? 'Done Touchup' : 'Manual Touchup'}
                        </button>
                      </div>

                      {isManualMode && (
                        <div className="p-3 bg-gray-50 rounded-xl mb-4 space-y-3 border border-gray-200 animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Touchup Controls</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setBrushMode('erase')}
                              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${brushMode === 'erase' ? 'bg-white shadow-sm text-[#e8501a] ring-1 ring-[#e8501a]/30' : 'text-gray-600 hover:bg-gray-200'}`}
                            >
                              Erase
                            </button>
                            <button
                              onClick={() => setBrushMode('restore')}
                              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${brushMode === 'restore' ? 'bg-white shadow-sm text-[#e8501a] ring-1 ring-[#e8501a]/30' : 'text-gray-600 hover:bg-gray-200'}`}
                            >
                              Restore
                            </button>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                              <span className="font-bold">Brush Size</span>
                              <span className="font-bold">{brushSize}px</span>
                            </div>
                            <input
                              type="range"
                              min="5"
                              max="100"
                              value={brushSize}
                              onChange={(e) => setBrushSize(Number(e.target.value))}
                              className="w-full accent-[#e8501a]"
                            />
                          </div>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-4 gap-2">
                        {COLORS.map(color => (
                          <button
                            key={color.name}
                            onClick={() => setBgColor(color.value)}
                            className={`h-10 rounded-xl border-2 transition-all flex items-center justify-center ${
                              bgColor === color.value ? 'border-[#e8501a] scale-105 shadow-md' : 'border-gray-200 hover:border-gray-300'
                            }`}
                            style={{ background: color.value === 'transparent' ? 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 8px 8px' : color.value }}
                            title={color.name}
                          >
                            {bgColor === color.value && color.value !== '#ffffff' && color.value !== 'transparent' && <Check className="w-4 h-4 text-white" />}
                            {bgColor === color.value && (color.value === '#ffffff' || color.value === 'transparent') && <Check className="w-4 h-4 text-gray-900" />}
                          </button>
                        ))}
                        <div className="relative h-10 rounded-xl border-2 border-gray-200 overflow-hidden hover:border-gray-300 transition-all">
                          <input 
                            type="color" 
                            value={customColor} 
                            onChange={(e) => { setCustomColor(e.target.value); setBgColor('custom'); }}
                            className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                            title="Custom Color"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Adjustments */}
                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                          <Sliders className="w-4 h-4" /> Adjustments
                        </h3>
                        <button onClick={() => { 
                          setBrightness(100); 
                          setContrast(100); 
                          setSaturation(100); 
                          setSharpness(0); 
                          setSmoothness(0); 
                          setEdgeSoftness(0);
                          setBeautyFace(0);
                          setIsUltraHD(false); 
                        }} className="text-[10px] text-[#e8501a] font-bold hover:underline">Reset</button>
                      </div>
                      
                      <label className="flex items-center gap-2 p-3 bg-[#e8501a]/5 border border-[#e8501a]/20 rounded-xl cursor-pointer mb-4 hover:bg-[#e8501a]/10 transition-colors">
                        <input type="checkbox" checked={isUltraHD} onChange={(e) => setIsUltraHD(e.target.checked)} className="accent-[#e8501a] w-4 h-4" />
                        <span className="text-sm font-bold text-[#e8501a] flex items-center gap-1"><Sparkles className="w-4 h-4" /> Ultra HD Enhance</span>
                      </label>

                      <div className="space-y-4">
                        {[
                          { label: 'Brightness', val: brightness, set: setBrightness, min: 50, max: 150, unit: '%' },
                          { label: 'Contrast', val: contrast, set: setContrast, min: 50, max: 150, unit: '%' },
                          { label: 'Saturation', val: saturation, set: setSaturation, min: 0, max: 200, unit: '%' },
                          { label: 'Sharpness', val: sharpness, set: setSharpness, min: 0, max: 100, unit: '' },
                          { label: 'Skin Smoothing', val: smoothness, set: setSmoothness, min: 0, max: 100, unit: '' },
                          { label: 'Edge Adjustment', val: edgeSoftness, set: setEdgeSoftness, min: 0, max: 100, unit: '' },
                          { label: 'Beauty Face', val: beautyFace, set: setBeautyFace, min: 0, max: 100, unit: '' }
                        ].map(adj => (
                          <div key={adj.label}>
                            <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                              <span>{adj.label}</span>
                              <span>{adj.val}{adj.unit}</span>
                            </div>
                            <input 
                              type="range" 
                              min={adj.min} 
                              max={adj.max} 
                              value={adj.val} 
                              onChange={(e) => adj.set(Number(e.target.value))}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: PRINT */}
                {step === 'print' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
                    <div>
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Layout className="w-4 h-4" /> Paper Size
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {PAPER_SIZES.map(paper => (
                          <button
                            key={paper.id}
                            onClick={() => setPaperSize(paper)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              paperSize.id === paper.id ? 'border-[#e8501a] bg-[#e8501a]/5 ring-1 ring-[#e8501a]' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="font-bold text-xs text-gray-800">{paper.name}</div>
                          </button>
                        ))}
                      </div>
                      
                      {paperSize.id === 'custom' && (
                        <div className="grid grid-cols-2 gap-3 mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Width (mm)</label>
                            <input type="number" value={customPaper.width} onChange={e => setCustomPaper({...customPaper, width: Number(e.target.value)})} className="w-full p-2 mt-1 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#e8501a]" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Height (mm)</label>
                            <input type="number" value={customPaper.height} onChange={e => setCustomPaper({...customPaper, height: Number(e.target.value)})} className="w-full p-2 mt-1 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#e8501a]" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-gray-100 space-y-3">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Options</h3>
                      
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                        <div className="flex justify-between text-sm font-bold text-gray-700 mb-2">
                          <span>Print Resolution (DPI)</span>
                          <span>{dpi} DPI</span>
                        </div>
                        <input 
                          type="range" 
                          min="72" 
                          max="600" 
                          step="1"
                          value={dpi} 
                          onChange={(e) => setDpi(Number(e.target.value))}
                          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                        />
                        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                          <span>Web (72)</span>
                          <span>Print (300)</span>
                          <span>High (600)</span>
                        </div>
                      </div>

                      <label className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                        <span className="text-sm font-bold text-gray-700">Add Photo Border</span>
                        <input type="checkbox" checked={hasBorder} onChange={(e) => setHasBorder(e.target.checked)} className="accent-[#e8501a] w-4 h-4" />
                      </label>
                      <label className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                        <span className="text-sm font-bold text-gray-700">Show Cut Lines</span>
                        <input type="checkbox" checked={hasCutLines} onChange={(e) => setHasCutLines(e.target.checked)} className="accent-[#e8501a] w-4 h-4" />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Action Bar */}
              <div className="p-4 bg-white border-t border-gray-200 flex justify-between items-center shrink-0">
                <button 
                  onClick={() => {
                    if (step === 'crop') onReset();
                    else if (step === 'edit') setStep('crop');
                    else if (step === 'print') setStep('edit');
                  }}
                  className="px-4 py-2 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  {step === 'crop' ? 'Cancel' : 'Back'}
                </button>
                
                {step === 'crop' && (
                  <button 
                    onClick={handleCropComplete}
                    disabled={!completedCrop?.width || !completedCrop?.height}
                    className="px-6 py-2 bg-[#e8501a] text-white rounded-xl font-bold text-sm hover:bg-[#d04313] transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                {step === 'edit' && (
                  <button 
                    onClick={() => setStep('print')}
                    disabled={isProcessing}
                    className="px-6 py-2 bg-[#e8501a] text-white rounded-xl font-bold text-sm hover:bg-[#d04313] transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                {step === 'print' && (
                  <button 
                    onClick={handleDownload}
                    className="px-6 py-2 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors flex items-center gap-2 shadow-lg shadow-gray-900/20"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                )}
              </div>
            </aside>

            {/* --- MAIN PREVIEW AREA --- */}
            <main className="flex-1 lg:flex-[2] relative bg-[#e5e7eb] flex flex-col h-full overflow-hidden">
              
              {/* Toolbar (Zoom) - Improved with slider */}
              <div className="w-full pt-4 pb-2 flex justify-center items-center shrink-0 z-20 relative">
                <div className="flex items-center gap-3 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-md border border-gray-200">
                  <button 
                    onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} 
                    className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  
                  <input 
                    type="range" 
                    min="0.1" 
                    max="3" 
                    step="0.1" 
                    value={zoom} 
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-24 sm:w-32 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                  />

                  <button 
                    onClick={() => setZoom(z => Math.min(3, z + 0.1))} 
                    className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  
                  <div className="w-px h-4 bg-gray-300 mx-1" />
                  
                  <span className="text-[10px] font-bold w-10 text-center text-gray-500 tabular-nums">
                    {Math.round(zoom * 100)}%
                  </span>
                  
                  <button 
                    onClick={() => setZoom(1)} 
                    className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 transition-colors" 
                    title="Reset Zoom"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Preview Container - Darker background for focus */}
              <div className="flex-1 w-full overflow-auto p-4 pb-8 min-h-0 bg-gray-200/50">
                <div className="min-h-full flex items-center justify-center m-auto w-max min-w-full">
                  
                  {step === 'crop' && imageSrc && (
                    <ReactCrop
                      crop={crop}
                      onChange={(_, percentCrop) => setCrop(percentCrop)}
                      onComplete={(c, pc) => {
                        setCompletedCrop(c);
                        setCompletedPercentCrop(pc);
                      }}
                      aspect={selectedPreset.id !== 'free' ? selectedPreset.width / selectedPreset.height : undefined}
                      className="shadow-2xl rounded-sm bg-white border border-gray-300"
                      style={{ zoom: zoom }}
                    >
                      <img 
                        ref={imgRef}
                        src={imageSrc} 
                        alt="Upload" 
                        onLoad={onImageLoad}
                        style={{ 
                          maxWidth: '100%', 
                          maxHeight: '70vh',
                          width: 'auto',
                          height: 'auto',
                          display: 'block', 
                          imageRendering: 'high-quality',
                        }}
                      />
                    </ReactCrop>
                  )}

                  {step === 'edit' && (
                    <div 
                      className="relative shadow-2xl rounded-sm overflow-hidden bg-white flex items-center justify-center"
                      style={{
                        aspectRatio: selectedPreset.id !== 'free' ? `${selectedPreset.width} / ${selectedPreset.height}` : (completedCrop ? `${completedCrop.width} / ${completedCrop.height}` : 'auto'),
                        height: `70vh`,
                        maxWidth: `100%`,
                        transition: 'all 0.1s ease-out',
                        zoom: zoom
                      }}
                    >
                      {isManualMode ? (
                        <canvas
                          ref={touchupCanvasRef}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                          className="max-w-full max-h-full object-contain block cursor-crosshair touch-none"
                          style={{
                            filter: `brightness(${brightness}%) contrast(${contrast + (isUltraHD ? 15 : 0)}%) saturate(${saturation + (isUltraHD ? 20 : 0)}%) ${smoothness > 0 ? `blur(${smoothness / 20}px)` : ''}`,
                            backgroundColor: bgColor === 'transparent' ? 'transparent' : (bgColor === 'custom' ? customColor : bgColor),
                            backgroundImage: bgColor === 'transparent' ? 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 8px 8px' : 'none'
                          }}
                        />
                      ) : (
                        <>
                          <img 
                            src={finalImageSrc || bgRemovedImageSrc || croppedImageSrc || ''} 
                            alt="Processed" 
                            className={`max-w-full max-h-full object-contain block transition-opacity duration-200 ${!finalImageSrc ? 'opacity-50' : 'opacity-100'}`} 
                            style={{ imageRendering: 'auto' }}
                          />
                          {!finalImageSrc && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="text-center bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-xl border border-gray-100">
                                <Loader2 className="w-8 h-8 animate-spin text-[#e8501a] mx-auto mb-2" />
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Processing...</p>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      
                      {isProcessing && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50 text-white p-6">
                          <Loader2 className="w-10 h-10 animate-spin mb-4 text-[#e8501a]" />
                          <div className="text-sm font-bold text-center">{statusText}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {step === 'print' && renderPrintPreview()}

                </div>
              </div>

              {/* Exit Button */}
              <button 
                onClick={onReset}
                className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full shadow-lg border border-gray-200 transition-all z-20 text-gray-500 hover:text-red-500"
                title="Close Editor"
              >
                <X className="w-5 h-5" />
              </button>
            </main>

          </div>
        );
      }}
    </ToolLayout>
  );
}
