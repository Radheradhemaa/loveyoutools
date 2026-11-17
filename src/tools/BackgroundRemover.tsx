import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Download, Loader2, X, Wand2, Image as ImageIcon, Check, Trash2, Eraser, Paintbrush, Sliders, Sparkles, RefreshCw, Undo, Redo, Maximize2, Crop as CropIcon, RotateCcw, ZoomIn, ZoomOut, Target, MousePointerClick } from 'lucide-react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import ToolLayout from '../components/tool-system/ToolLayout';
import { removeBackground as runBgRemoval, ensurePreloaded, magicEraseObjectAtPoint, BgRemovalOptions } from '../lib/bgRemoval';
import { reconstructLeftShoulder } from '../lib/shoulderReconstruction';
import { drawSteppedHighQuality } from '../lib/touchupCanvas';

export default function BackgroundRemover() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalUploadedSrc, setOriginalUploadedSrc] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [statusText, setStatusText] = useState('');
  
  // Preload AI assets quietly in the background after mount
  useEffect(() => {
    ensurePreloaded().catch(console.error);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      setTimer(0);
      setProcessingError(null);
      interval = setInterval(() => {
        setTimer((prev) => {
          // Hybrid Dual-Core Timer: Optimized for 5-7 second performance
          // Reaches ~90% in 5 seconds for a snappy feel.
          if (prev >= 98) return prev; 
          
          let increment = 0.5; // Faster base speed
          if (prev > 75) increment = 0.2; 
          if (prev > 92) increment = 0.08; 
          
          return Math.min(prev + increment, 98.8);
        });
      }, 30);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);
  const [bgColor, setBgColor] = useState('transparent');
  const [customColor, setCustomColor] = useState('#ffffff');
  const [customBgImage, setCustomBgImage] = useState<string | null>(null);
  const customBgImgRef = useRef<HTMLImageElement | null>(null);
  const bgUploadInputRef = useRef<HTMLInputElement>(null);
  const [blurAmount, setBlurAmount] = useState(10);
  
  // AI Subject Focus & Precision Engine Options
  const [isolateMainSubject, setIsolateMainSubject] = useState(true);
  const [objectStrictness, setObjectStrictness] = useState(82);
  const [severTouchingObjects, setSeverTouchingObjects] = useState(true);
  const [removeBackgroundNoise, setRemoveBackgroundNoise] = useState(true);
  const [autoExtendLeftShoulder, setAutoExtendLeftShoulder] = useState(true);

  // AI Shoulder Restoration State
  const [extendAmount, setExtendAmount] = useState(50);
  const [shoulderHeightRatio, setShoulderHeightRatio] = useState(0.52);
  const [clothingSlope, setClothingSlope] = useState(0.18);
  const [shoulderCurve, setShoulderCurve] = useState(0.50);
  const [isExtendingShoulder, setIsExtendingShoulder] = useState(false);

  // Manual Touchup & Magic Eraser State
  const [isManualMode, setIsManualMode] = useState(false);
  const [brushMode, setBrushMode] = useState<'erase' | 'restore' | 'magic'>('erase');
  const [brushSize, setBrushSize] = useState(25);
  const [magicEraserTolerance, setMagicEraserTolerance] = useState(35);
  const [zoom, setZoom] = useState(1);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const handleZoomIn = useCallback(() => setZoom(prev => Math.min(Number((prev + 0.1).toFixed(2)), 4)), []);
  const handleZoomOut = useCallback(() => setZoom(prev => Math.max(Number((prev - 0.1).toFixed(2)), 0.1)), []);
  const handleZoomReset = useCallback(() => setZoom(1), []);

  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom if ctrl/meta is pressed, OR if we just want to zoom on any wheel event
      // The user requested "scrolldownable to zoom", so we zoom on any wheel event
      e.preventDefault(); // Prevent page/container scroll
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleZoomIn, handleZoomOut]);

  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const origDisplayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workRestorePatternRef = useRef<CanvasPattern | null>(null);
  const displayRestorePatternRef = useRef<CanvasPattern | null>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const lastPosRef = useRef<{x: number, y: number} | null>(null);
  const isDrawingUpdateRef = useRef(false);

  // History for Undo
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Adjustments
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [sharpness, setSharpness] = useState(0);
  const [smoothness, setSmoothness] = useState(0);
  const [edgeSoftness, setEdgeSoftness] = useState(0);
  const [beautyFace, setBeautyFace] = useState(0);
  const [isUltraHD, setIsUltraHD] = useState(false);

  // Crop State
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [isCropping, setIsCropping] = useState(false);
  const [hasCropped, setHasCropped] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = aspect 
      ? centerCrop(
          makeAspectCrop(
            {
              unit: '%',
              width: 90,
            },
            aspect,
            width,
            height
          ),
          width,
          height
        )
      : {
          unit: '%' as const,
          x: 5,
          y: 5,
          width: 90,
          height: 90,
        };
    setCrop(initialCrop);
  };

  const [rotation, setRotation] = useState(0);

  const getCroppedImg = async (imageSrc: string, pixelCrop: PixelCrop, rotation = 0): Promise<string> => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise(resolve => image.onload = resolve);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageSrc;

    // We need to use the rendered dimensions of the image in the cropper to calculate scales
    // Since we are in an async function, we'll assume the imgRef is still valid or use natural dimensions if not
    const renderedWidth = imgRef.current?.width || image.naturalWidth;
    const renderedHeight = imgRef.current?.height || image.naturalHeight;

    const scaleX = image.naturalWidth / renderedWidth;
    const scaleY = image.naturalHeight / renderedHeight;

    // Calculate canvas size based on rotation
    const rotRad = (rotation * Math.PI) / 180;
    const { width: cropWidth, height: cropHeight } = pixelCrop;
    
    // For simplicity in this tool, we'll handle rotation before cropping or as part of it
    // But react-image-crop doesn't handle rotation in the crop object easily.
    // Let's just implement high-quality cropping first.

    canvas.width = cropWidth * scaleX;
    canvas.height = cropHeight * scaleY;

    ctx.save();
    ctx.drawImage(
      image,
      pixelCrop.x * scaleX,
      pixelCrop.y * scaleY,
      pixelCrop.width * scaleX,
      pixelCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );
    ctx.restore();

    return canvas.toDataURL('image/png');
  };

  const applyCrop = async () => {
    if (!imageSrc || !completedCrop) return;
    try {
      const cropped = await getCroppedImg(imageSrc, completedCrop, rotation);
      setImageSrc(cropped);
      setOriginalUploadedSrc(cropped);
      setIsCropping(false);
      setHasCropped(true);
      setRotation(0); // Reset rotation after apply
      
      const img = new Image();
      img.onload = () => { originalImgRef.current = img; };
      img.src = cropped;
    } catch (e) {
      console.error(e);
    }
  };

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
    }, 150);
    return () => clearTimeout(timer);
  }, [brightness, contrast, saturation, sharpness, smoothness, edgeSoftness, beautyFace, isUltraHD]);

  const getFilterStyle = () => {
    const b = brightness;
    let c = contrast;
    let s = saturation;
    
    if (isUltraHD) {
      c += 15;
      s += 20;
    }
    
    let filterString = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
    if (beautyFace > 0) {
      const beautyBright = 100 + (beautyFace / 15);
      const beautyContrast = 100 - (beautyFace / 25);
      const beautySaturate = 100 + (beautyFace / 20);
      filterString += ` brightness(${beautyBright}%) contrast(${beautyContrast}%) saturate(${beautySaturate}%)`;
    }
    if (edgeSoftness > 0) {
      const edgeFeather = edgeSoftness / 50;
      filterString += ` drop-shadow(0 0 ${edgeFeather}px rgba(0,0,0,0.12))`;
    }
    
    const finalSharpness = isUltraHD ? (sharpness + 35) : sharpness;
    if (finalSharpness > 0) {
      const extraContrast = Math.round(finalSharpness * 0.12);
      filterString += ` contrast(${c + extraContrast}%)`;
    }
    
    return filterString;
  };

  const finalSharpness = isUltraHD ? (sharpness + 35) : sharpness;
  const sharpnessAmount = finalSharpness / 100;
  const centerValue = 1 + 4 * sharpnessAmount;

  const addToHistory = (src: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(src);
    if (newHistory.length > 15) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      isDrawingUpdateRef.current = false;
      setResultImage(history[prevIndex]);
      updateCanvasFromSrc(history[prevIndex]);
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      isDrawingUpdateRef.current = false;
      setResultImage(null);
      updateCanvasFromSrc(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      isDrawingUpdateRef.current = false;
      setResultImage(history[nextIndex]);
      updateCanvasFromSrc(history[nextIndex]);
    }
  };

  // Removed preload engine model on mount to prevent concurrent loading deadlocks

  // Removed redundant preload

  const getManualDisplayDims = (dims: { width: number; height: number } | null) => {
    const d = dims || { width: 500, height: 500 };
    const baseScale = Math.min(460 / d.height, 640 / d.width, 1);
    const displayW = Math.max(40, Math.round(d.width * baseScale * zoom));
    const displayH = Math.max(40, Math.round(d.height * baseScale * zoom));
    return { displayW, displayH };
  };

  const syncDisplayCanvas = (nativeW?: number, nativeH?: number) => {
    const displayCanvas = canvasRef.current;
    const workCanvas = workCanvasRef.current;
    if (!displayCanvas || !workCanvas || workCanvas.width === 0 || workCanvas.height === 0) return;

    const dims = nativeW && nativeH ? { width: nativeW, height: nativeH } : { width: workCanvas.width, height: workCanvas.height };
    const { displayW, displayH } = getManualDisplayDims(dims);
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    const targetW = Math.max(1, Math.round(displayW * dpr));
    const targetH = Math.max(1, Math.round(displayH * dpr));

    drawSteppedHighQuality(workCanvas, displayCanvas, targetW, targetH);

    if (originalImgRef.current && (originalImgRef.current.naturalWidth || originalImgRef.current.width) > 0) {
      if (!origDisplayCanvasRef.current) {
        origDisplayCanvasRef.current = document.createElement('canvas');
      }
      drawSteppedHighQuality(originalImgRef.current, origDisplayCanvasRef.current, targetW, targetH);
      const dCtx = displayCanvas.getContext('2d');
      if (dCtx) {
        displayRestorePatternRef.current = dCtx.createPattern(origDisplayCanvasRef.current, 'no-repeat');
      }
    }
  };

  const updateCanvasFromSrc = (src: string | null) => {
    const workCanvas = workCanvasRef.current;
    if (!workCanvas) return;
    const ctx = workCanvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, workCanvas.width, workCanvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, workCanvas.width, workCanvas.height);
      ctx.restore();
      syncDisplayCanvas(workCanvas.width, workCanvas.height);
    };
    img.src = src || imageSrc || '';
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = 'target' in e ? e.target.files?.[0] : e;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setImageSrc(src);
      setOriginalUploadedSrc(src);
      setResultImage(null);
      setHistory([]);
      setHistoryIndex(-1);
      setIsManualMode(false);
      setIsCropping(false); // Direct to instant result
      setHasCropped(false);
      setZoom(1); // Reset zoom to 100%
      
      const img = new Image();
      img.onload = () => { 
        originalImgRef.current = img; 
        setImageDims({ width: img.width, height: img.height });
        // Auto-trigger background removal for "instant" feel
        removeBackground(src);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

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
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => resolve(new Blob());
      img.src = src;
    });
  };

  const removeBackground = async (src?: string | React.MouseEvent, customOptions?: BgRemovalOptions) => {
    const targetSrc = typeof src === 'string' ? src : imageSrc;
    if (!targetSrc) return;
    setIsProcessing(true);
    setProcessingError(null);
    setTimer(0);
    setStatusText('Initializing AI Engine...');
    
    const startTime = Date.now();
    
    try {
      const options: BgRemovalOptions = {
        engine: 'auto',
        isolateMainSubject,
        objectStrictness,
        severTouchingObjects,
        removeBackgroundNoise,
        preserveEarsAndShoulders: true,
        extendLeftShoulder: autoExtendLeftShoulder,
        ...customOptions
      };

      const rawBlob = await runBgRemoval(targetSrc, (status) => {
        setStatusText(status);
      }, false, false, options);

      const url = URL.createObjectURL(rawBlob);
      setResultImage(url);
      addToHistory(url);

      const duration = (Date.now() - startTime) / 1000;
      console.log(`UI: BG Removal took ${duration}s`);

    } catch (error) {
      console.error("BG Removal Error:", error);
      let errorMessage = error instanceof Error ? error.message : "AI background removal failed.";
      if (errorMessage.includes('Failed to fetch')) {
        errorMessage = "Network Error: Failed to download AI models. Please check your internet connection and try again. If the issue persists, try clearing your browser cache and refreshing the page.";
      } else if (errorMessage.includes('Resource') && errorMessage.includes('not found')) {
        errorMessage = "AI Model Error: Could not load background removal models. Please try refreshing the page or clearing your browser cache. If the issue persists, try a different browser or force-refresh (Ctrl+F5).";
      } else if (errorMessage.includes('processing failed')) {
        errorMessage = "AI Processing Error: The background removal process failed. Please try refreshing the page or clearing your browser cache.";
      }
      setProcessingError(errorMessage);
    } finally {
      setIsProcessing(false);
      setStatusText(''); // Clear status text on completion or error
    }
  };

  const handleAutoCleanBackground = () => {
    if (!imageSrc) return;
    removeBackground(imageSrc, {
      engine: 'strict_subject',
      isolateMainSubject: true,
      objectStrictness: 80,
      severTouchingObjects: true,
      removeBackgroundNoise: true,
      decontaminateHalos: true,
    });
  };

  const handleMagicEraserClick = async (e: React.MouseEvent<HTMLImageElement | HTMLCanvasElement>) => {
    if (brushMode !== 'magic' || !resultImage) return;

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const nativeW = target instanceof HTMLImageElement
      ? target.naturalWidth
      : (workCanvasRef.current?.width || imageDims?.width || target.width);
    const nativeH = target instanceof HTMLImageElement
      ? target.naturalHeight
      : (workCanvasRef.current?.height || imageDims?.height || target.height);
    const clickX = ((e.clientX - rect.left) / rect.width) * nativeW;
    const clickY = ((e.clientY - rect.top) / rect.height) * nativeH;

    try {
      const updatedUrl = await magicEraseObjectAtPoint(resultImage, clickX, clickY, magicEraserTolerance);
      setResultImage(updatedUrl);
      addToHistory(updatedUrl);
    } catch (err) {
      console.error("Magic eraser failed:", err);
    }
  };

  // --- Manual Touchup Logic ---
  useEffect(() => {
    if (isManualMode && canvasRef.current) {
      if (isDrawingUpdateRef.current) {
        isDrawingUpdateRef.current = false;
        return;
      }
      
      let isMounted = true;
      const initTouchup = async () => {
        const displayCanvas = canvasRef.current;
        if (!displayCanvas) return;

        const origImg = new Image();
        await new Promise(resolve => {
          origImg.onload = resolve;
          origImg.onerror = resolve;
          origImg.src = imageSrc || '';
        });
        if (!isMounted || !origImg.naturalWidth) return;

        const natW = origImg.naturalWidth || origImg.width;
        const natH = origImg.naturalHeight || origImg.height;
        originalImgRef.current = origImg;
        setImageDims({ width: natW, height: natH });

        if (!workCanvasRef.current) {
          workCanvasRef.current = document.createElement('canvas');
        }
        const workCanvas = workCanvasRef.current;
        workCanvas.width = natW;
        workCanvas.height = natH;
        const workCtx = workCanvas.getContext('2d');
        if (!workCtx) return;

        workRestorePatternRef.current = workCtx.createPattern(origImg, 'no-repeat');

        const currentImg = new Image();
        await new Promise(resolve => {
          currentImg.onload = resolve;
          currentImg.onerror = resolve;
          currentImg.src = resultImage || imageSrc || '';
        });
        if (!isMounted || !currentImg.naturalWidth) return;

        workCtx.save();
        workCtx.globalCompositeOperation = 'source-over';
        workCtx.clearRect(0, 0, natW, natH);
        workCtx.imageSmoothingEnabled = true;
        workCtx.imageSmoothingQuality = 'high';
        workCtx.drawImage(currentImg, 0, 0, natW, natH);
        workCtx.restore();

        syncDisplayCanvas(natW, natH);
      };
      initTouchup();
      return () => { isMounted = false; };
    }
  }, [isManualMode, resultImage, imageSrc]);

  // Keep visible HiDPI canvas razor-sharp when zooming in manual mode
  useEffect(() => {
    if (isManualMode && workCanvasRef.current && workCanvasRef.current.width > 0) {
      syncDisplayCanvas();
    }
  }, [zoom, isManualMode]);

  // Round Brush Cursor State for Desktop & Smart Phone Android
  const [touchupCursor, setTouchupCursor] = useState<{ x: number; y: number; isTouch: boolean } | null>(null);
  const cursorFadeTimerRef = useRef<any>(null);

  const updateTouchupCursor = (e: React.MouseEvent | React.TouchEvent, isTouch = false) => {
    if (cursorFadeTimerRef.current) clearTimeout(cursorFadeTimerRef.current);
    let clientX: number, clientY: number;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    setTouchupCursor({ x: clientX, y: clientY, isTouch });
  };

  const getBrushRenderedDiameter = () => {
    const canvas = canvasRef.current;
    const nativeW = workCanvasRef.current?.width || imageDims?.width || canvas?.width || 1;
    if (!canvas) return Math.max(12, brushSize);
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / nativeW;
    return Math.max(8, Math.round(brushSize * scale));
  };

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    const workCanvas = workCanvasRef.current;
    if (!canvas || !workCanvas || workCanvas.width === 0 || workCanvas.height === 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = workCanvas.width / rect.width;
    const scaleY = workCanvas.height / rect.height;
    
    let clientX: number, clientY: number;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return null;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const paintBrushDot = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    mode: 'erase' | 'restore',
    pattern: CanvasPattern | null
  ) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fill();
    } else if (pattern) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = pattern;
      ctx.fill();
    }
  };

  const paintBrushSegment = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineW: number,
    mode: 'erase' | 'restore',
    pattern: CanvasPattern | null
  ) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.stroke();
    } else if (pattern) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = pattern;
      ctx.stroke();
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (brushMode === 'magic') return;
    if (e.cancelable) e.preventDefault();
    updateTouchupCursor(e, 'touches' in e);
    const pos = getCoords(e);
    if (!pos || !workCanvasRef.current || !canvasRef.current) return;
    setIsDrawing(true);
    lastPosRef.current = pos;

    const workCanvas = workCanvasRef.current;
    const displayCanvas = canvasRef.current;
    const workCtx = workCanvas.getContext('2d');
    const displayCtx = displayCanvas.getContext('2d');

    if (workCtx) {
      paintBrushDot(workCtx, pos.x, pos.y, brushSize / 2, brushMode, workRestorePatternRef.current);
    }
    if (displayCtx && workCanvas.width > 0 && workCanvas.height > 0) {
      const dxScale = displayCanvas.width / workCanvas.width;
      const dyScale = displayCanvas.height / workCanvas.height;
      paintBrushDot(
        displayCtx,
        pos.x * dxScale,
        pos.y * dyScale,
        (brushSize / 2) * dxScale,
        brushMode,
        displayRestorePatternRef.current
      );
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (brushMode === 'magic') return;
    if (e.cancelable) e.preventDefault();
    updateTouchupCursor(e, 'touches' in e);
    if (!isDrawing || !lastPosRef.current || !workCanvasRef.current || !canvasRef.current) return;

    const pos = getCoords(e);
    if (!pos) return;

    const workCanvas = workCanvasRef.current;
    const displayCanvas = canvasRef.current;
    const workCtx = workCanvas.getContext('2d');
    const displayCtx = displayCanvas.getContext('2d');

    if (workCtx) {
      paintBrushSegment(
        workCtx,
        lastPosRef.current.x,
        lastPosRef.current.y,
        pos.x,
        pos.y,
        brushSize,
        brushMode,
        workRestorePatternRef.current
      );
    }
    if (displayCtx && workCanvas.width > 0 && workCanvas.height > 0) {
      const dxScale = displayCanvas.width / workCanvas.width;
      const dyScale = displayCanvas.height / workCanvas.height;
      paintBrushSegment(
        displayCtx,
        lastPosRef.current.x * dxScale,
        lastPosRef.current.y * dyScale,
        pos.x * dxScale,
        pos.y * dyScale,
        Math.max(1, brushSize * dxScale),
        brushMode,
        displayRestorePatternRef.current
      );
    }

    lastPosRef.current = pos;
  };

  const stopDrawing = () => {
    if (isDrawing && workCanvasRef.current) {
      setIsDrawing(false);
      lastPosRef.current = null;
      const result = workCanvasRef.current.toDataURL('image/png');
      isDrawingUpdateRef.current = true;
      setResultImage(result);
      addToHistory(result);
      syncDisplayCanvas();
    }
    if (cursorFadeTimerRef.current) clearTimeout(cursorFadeTimerRef.current);
    cursorFadeTimerRef.current = setTimeout(() => {
      setTouchupCursor(null);
    }, 450);
  };

  const resultImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (resultImage) {
      const img = new Image();
      img.onload = () => {
        resultImgRef.current = img;
      };
      img.src = resultImage;
    } else {
      resultImgRef.current = null;
    }
  }, [resultImage]);

  const resultImgElementRef = useRef<HTMLImageElement>(null);

  const downloadImage = () => {
    if (!resultImage) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use the already loaded image element from the DOM if available, otherwise fallback to the ref
    const img = resultImgElementRef.current || resultImgRef.current;
    if (!img) {
      console.error("Image not ready for download");
      return;
    }
    
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    if (!width || !height) {
      // Image hasn't loaded its dimensions yet, wait for it
      const tempImg = new Image();
      tempImg.onload = () => {
        resultImgRef.current = tempImg;
        downloadImage(); // Retry
      };
      tempImg.src = resultImage;
      return;
    }
    
    canvas.width = width;
    canvas.height = height;
    
    // We need a temporary canvas to process the subject independently of the background
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d', { alpha: true });
    if (!tempCtx) return;

    // Apply overall base adjustments to the subject (excluding blurs which are handled via skin-selective CPU bilateral filters)
    const b = appliedAdjustments.brightness;
    let c = appliedAdjustments.contrast;
    let s = appliedAdjustments.saturation;
    
    if (appliedAdjustments.isUltraHD) {
      c += 15;
      s += 20;
    }
    
    let filterString = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
    if (appliedAdjustments.edgeSoftness > 0) {
      // Edge adjustment: drop-shadow + very subtle blur for feathering
      const edgeBlur = appliedAdjustments.edgeSoftness / 50;
      filterString += ` drop-shadow(0 0 ${edgeBlur}px rgba(0,0,0,0.15)) blur(${edgeBlur / 2}px)`;
    }
    
    tempCtx.filter = filterString;
    tempCtx.drawImage(img, 0, 0);
    tempCtx.filter = 'none';

    // Apply Advanced Skin-Selective Bilateral Smoothing, Beautification, and Sharpness
    const finalSharpness = appliedAdjustments.isUltraHD ? (appliedAdjustments.sharpness + 60) : appliedAdjustments.sharpness;
    const smoothnessVal = appliedAdjustments.smoothness;
    const beautyVal = appliedAdjustments.beautyFace;

    if (finalSharpness > 0 || smoothnessVal > 0 || beautyVal > 0) {
      const sw = tempCanvas.width;
      const sh = tempCanvas.height;
      const imageData = tempCtx.getImageData(0, 0, sw, sh);
      const pixels = imageData.data;
      const output = tempCtx.createImageData(sw, sh);
      const dst = output.data;

      const isSkinColor = (r: number, g: number, b: number) => {
        if (r < 60 || g < 40 || b < 20) return false;
        if (r <= g || r <= b) return false;
        if (r - g < 8) return false;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min < 15) return false;
        return Math.abs(r - g) > 8;
      };

      const amount = finalSharpness / 100;
      const a = amount;
      const b_val = 1 + 4 * a;

      for (let y = 0; y < sh; y++) {
        const offset = y * sw * 4;
        for (let x = 0; x < sw; x++) {
          const i = offset + x * 4;
          const alpha = pixels[i + 3];

          if (alpha === 0) continue;

          if (x === 0 || x === sw - 1 || y === 0 || y === sh - 1) {
            dst[i] = pixels[i]; dst[i + 1] = pixels[i + 1]; dst[i + 2] = pixels[i + 2]; dst[i + 3] = pixels[i + 3];
            continue;
          }

          let r_orig = pixels[i];
          let g_orig = pixels[i + 1];
          let b_orig = pixels[i + 2];

          let finalR = r_orig;
          let finalG = g_orig;
          let finalB = b_orig;

          // 1. Smart Bilateral Skin Smoothing & Beautification
          const isSkin = isSkinColor(r_orig, g_orig, b_orig);
          if ((smoothnessVal > 0 || beautyVal > 0) && isSkin && x > 1 && x < sw - 2 && y > 1 && y < sh - 2) {
            let sumR = 0, sumG = 0, sumB = 0, totalWeight = 0;
            const maxStrength = Math.max(smoothnessVal, beautyVal);
            const colorThreshold = 35 + (100 - maxStrength) * 0.45;

            for (let dy = -2; dy <= 2; dy++) {
              const ny = y + dy;
              const rowIdx = ny * sw * 4;
              for (let dx = -2; dx <= 2; dx++) {
                const nx = x + dx;
                const nIdx = rowIdx + nx * 4;
                const nAlpha = pixels[nIdx + 3];
                if (nAlpha === 0) continue;

                const nr = pixels[nIdx];
                const ng = pixels[nIdx + 1];
                const nb = pixels[nIdx + 2];

                const dist = Math.abs(nr - r_orig) + Math.abs(ng - g_orig) + Math.abs(nb - b_orig);
                if (dist < colorThreshold) {
                  const spatialDistSq = dy * dy + dx * dx;
                  const weight = 1.0 / (1.0 + spatialDistSq * 0.25);
                  sumR += nr * weight;
                  sumG += ng * weight;
                  sumB += nb * weight;
                  totalWeight += weight;
                }
              }
            }

            if (totalWeight > 0) {
              const smoothedR = sumR / totalWeight;
              const smoothedG = sumG / totalWeight;
              const smoothedB = sumB / totalWeight;

              const blend = maxStrength / 100;
              finalR = r_orig * (1 - blend) + smoothedR * blend;
              finalG = g_orig * (1 - blend) + smoothedG * blend;
              finalB = b_orig * (1 - blend) + smoothedB * blend;
            }

            if (beautyVal > 0) {
              const beautyFactor = beautyVal / 100;
              finalR = Math.min(255, finalR * (1.0 + 0.08 * beautyFactor));
              finalG = Math.min(255, finalG * (1.0 + 0.05 * beautyFactor));
              finalB = Math.min(255, finalB * (1.0 + 0.03 * beautyFactor));
            }
          }

          // 2. High-precision Laplacian Sharpening
          if (finalSharpness > 0) {
            const iUp = i - sw * 4; const iDown = i + sw * 4; const iLeft = i - 4; const iRight = i + 4;
            const getR = (idx: number) => pixels[idx + 3] === 0 ? r_orig : pixels[idx];
            const getG = (idx: number) => pixels[idx + 3] === 0 ? g_orig : pixels[idx + 1];
            const getB = (idx: number) => pixels[idx + 3] === 0 ? b_orig : pixels[idx + 2];

            const r_sharp = finalR * b_val - (getR(iUp) + getR(iDown) + getR(iLeft) + getR(iRight)) * a;
            const g_sharp = finalG * b_val - (getG(iUp) + getG(iDown) + getG(iLeft) + getG(iRight)) * a;
            const b_sharp = finalB * b_val - (getB(iUp) + getB(iDown) + getB(iLeft) + getB(iRight)) * a;

            let fR = Math.max(0, Math.min(255, r_sharp));
            let fG = Math.max(0, Math.min(255, g_sharp));
            let fB = Math.max(0, Math.min(255, b_sharp));

            const skinWeight = isSkin ? 0.15 : 1.0;
            finalR = finalR * (1 - skinWeight) + fR * skinWeight;
            finalG = finalG * (1 - skinWeight) + fG * skinWeight;
            finalB = finalB * (1 - skinWeight) + fB * skinWeight;
          }

          // Preserve smooth natural sub-pixel hair & clothing alpha edges
          dst[i] = Math.round(finalR);
          dst[i + 1] = Math.round(finalG);
          dst[i + 2] = Math.round(finalB);
          dst[i + 3] = alpha <= 2 ? 0 : alpha;
        }
      }
      tempCtx.putImageData(output, 0, 0);
    }
    
    // Now composite everything onto the final canvas AFTER mask refinement
    // 1. Draw Background
    if (bgColor === 'portrait') {
      if (imageSrc && originalImgRef.current) {
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = canvas.width;
        bgCanvas.height = canvas.height;
        const bgCtx = bgCanvas.getContext('2d');
        if (bgCtx) {
          bgCtx.filter = `blur(${blurAmount}px)`;
          bgCtx.drawImage(originalImgRef.current, 0, 0, canvas.width, canvas.height);
          ctx.drawImage(bgCanvas, 0, 0);
        }
      }
    } else if (bgColor === 'custom-image' && customBgImgRef.current) {
      const bgImg = customBgImgRef.current;
      const imgRatio = bgImg.width / Math.max(1, bgImg.height);
      const targetRatio = canvas.width / Math.max(1, canvas.height);
      let drawW = canvas.width, drawH = canvas.height, offsetX = 0, offsetY = 0;
      if (imgRatio > targetRatio) {
        drawH = canvas.height;
        drawW = canvas.height * imgRatio;
        offsetX = (canvas.width - drawW) / 2;
      } else {
        drawW = canvas.width;
        drawH = canvas.width / imgRatio;
        offsetY = (canvas.height - drawH) / 2;
      }
      ctx.drawImage(bgImg, offsetX, offsetY, drawW, drawH);
    } else if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor === 'custom' ? customColor : bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Draw the processed subject
    ctx.drawImage(tempCanvas, 0, 0);
    
    // Use toBlob for large image support. Since we removed the async img.onload, 
    // this should still be considered part of the user gesture by most browsers.
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error("Failed to create blob for download");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `bg-removed-${Date.now()}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  return (
    <ToolLayout
      title="AI Background Remover"
      description="Professional Studio-Quality Extraction. Dual-precision AI ensemble for crisp subject isolation, clean edges, and automatic chair/object removal."
      toolId="background-remover"
      acceptedFileTypes={['image/*']}
      onDownload={downloadImage}
    >
      {({ file, onReset }) => {
        // Sync with ToolLayout file
        useEffect(() => {
          if (file && !Array.isArray(file)) {
            const reader = new FileReader();
              reader.onload = (event) => {
                const src = event.target?.result as string;
                setImageSrc(src);
                setOriginalUploadedSrc(src);
                // Reset all states for new image
                setResultImage(null);
                setProcessingError(null);
                setHistory([]);
                setHistoryIndex(-1);
                setIsManualMode(false);
                setIsCropping(false); 
                setHasCropped(false);
                setZoom(1); // Default to 100% fitted on new upload
                
                const img = new Image();
              img.onload = () => { 
                originalImgRef.current = img;
                setImageDims({ width: img.width, height: img.height });
                // AUTO-TRIGGER removal on upload
                removeBackground(src);
              };
              img.src = src;
            };
            reader.readAsDataURL(file);
          } else if (!file) {
            // Reset everything when file is null
            setImageSrc(null);
            setResultImage(null);
            setProcessingError(null);
            setHistory([]);
            setHistoryIndex(-1);
            setIsManualMode(false);
            setIsCropping(false);
            setHasCropped(false);
            setImageDims(null);
          }
        }, [file]);

        if (!imageSrc) return null;

        return (
          <div className="tool-layout-container">
            {/* --- SIDEBAR (CONTROLS) --- */}
            <aside className="tool-sidebar">
              <div className="sidebar-content">
                <div className="space-y-6">
                  {isCropping ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                      <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                        <CropIcon className="w-5 h-5 text-accent" /> Crop Image
                      </h3>
                      <p className="text-xs text-text-muted">
                        Drag the corners to select the area you want to keep.
                      </p>
                      
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Aspect Ratio</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Free', value: undefined },
                            { label: '1:1', value: 1 },
                            { label: '4:3', value: 4/3 },
                            { label: '16:9', value: 16/9 },
                            { label: '3:4', value: 3/4 },
                            { label: '9:16', value: 9/16 },
                          ].map((ratio) => (
                            <button
                              key={ratio.label}
                              onClick={() => {
                                setAspect(ratio.value);
                                if (imgRef.current) {
                                  const { width, height } = imgRef.current;
                                  const newCrop = ratio.value 
                                    ? centerCrop(makeAspectCrop({ unit: '%', width: 90 }, ratio.value, width, height), width, height)
                                    : { unit: '%' as const, x: 5, y: 5, width: 90, height: 90 };
                                  setCrop(newCrop);
                                }
                              }}
                              className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${aspect === ratio.value ? 'bg-accent border-accent text-white' : 'bg-surface border-border text-text-muted hover:border-accent'}`}
                            >
                              {ratio.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Rotation</label>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setRotation((prev) => (prev - 90) % 360)}
                            className="flex-1 py-2 bg-surface border border-border rounded-lg text-text-primary hover:border-accent transition-all flex items-center justify-center gap-2 text-[10px] font-bold"
                          >
                            <RotateCcw className="w-3 h-3" /> Rotate Left
                          </button>
                          <button 
                            onClick={() => setRotation((prev) => (prev + 90) % 360)}
                            className="flex-1 py-2 bg-surface border border-border rounded-lg text-text-primary hover:border-accent transition-all flex items-center justify-center gap-2 text-[10px] font-bold"
                          >
                            <RotateCcw className="w-3 h-3 scale-x-[-1]" /> Rotate Right
                          </button>
                        </div>
                        <button 
                          onClick={() => {
                            setRotation(0);
                            setAspect(undefined);
                            if (imgRef.current) {
                              setCrop({ unit: '%' as const, x: 5, y: 5, width: 90, height: 90 });
                            }
                          }}
                          className="w-full py-2 bg-surface border border-border rounded-lg text-text-muted hover:text-accent transition-all text-[10px] font-bold mt-2"
                        >
                          Reset Crop Area
                        </button>
                      </div>

                      <div className="pt-4 flex flex-col gap-2">
                        <button 
                          onClick={applyCrop}
                          className="w-full btn bp py-4 rounded-2xl gap-2 text-lg shadow-lg shadow-accent/20"
                        >
                          <Sparkles className="w-5 h-5" /> Remove Background
                        </button>
                        <button 
                          onClick={() => {
                            setIsCropping(false);
                            setHasCropped(true);
                            removeBackground(imageSrc || '');
                          }}
                          className="w-full py-3 bg-surface border border-border rounded-xl text-text-muted hover:text-accent transition-all text-xs font-bold"
                        >
                          Skip Crop & Remove Background
                        </button>
                        <button 
                          onClick={() => {
                            setIsCropping(false);
                            if (!hasCropped) onReset();
                          }}
                          className="w-full py-2 text-xs font-bold text-text-muted hover:text-red-500 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : !resultImage ? (
                      <div className="space-y-4">
                        <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                          <Wand2 className="w-5 h-5 text-accent" /> AI Processing
                        </h3>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Background Removal</label>
                          <p className="text-[10px] text-text-muted px-1">
                            Ultra-fast AI processing optimized for speed.
                          </p>
                        </div>

                        <button 
                          onClick={removeBackground}
                          disabled={isProcessing}
                          className={`w-full btn py-4 rounded-2xl gap-2 text-lg shadow-lg ${processingError ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' : 'bp shadow-accent/20'}`}
                        >
                          {isProcessing ? (
                             <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}>
                               <Loader2 className="w-6 h-6" />
                             </motion.div>
                          ) : processingError ? (
                            <>
                              <RefreshCw className="w-5 h-5" />
                              Retry AI Removal
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-5 h-5" />
                              Remove Background
                            </>
                          )}
                        </button>
                      <button 
                        onClick={() => setIsCropping(true)}
                        className="w-full py-2 text-xs font-bold text-text-muted hover:text-accent transition-colors flex items-center justify-center gap-2"
                      >
                        <CropIcon className="w-4 h-4" /> Adjust Crop
                      </button>
                      {processingError && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-red-500/20 rounded-lg shrink-0">
                              <X className="w-4 h-4" />
                            </div>
                            <div className="space-y-1">
                              <p className="font-bold">AI Processing Failed</p>
                              <p className="text-xs opacity-80 leading-relaxed">{processingError}</p>
                            </div>
                          </div>
                          <div className="mt-4 pt-4 border-t border-red-500/10">
                            <p className="text-[10px] text-text-muted mb-2">Alternatively, you can remove the background manually:</p>
                            <button 
                              onClick={() => {
                                setProcessingError(null);
                                setIsManualMode(true);
                              }}
                              className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors"
                            >
                              Open Manual Touchup
                            </button>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-text-muted text-center">
                        Our AI will analyze your image and remove the background with high precision.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Manual Mode Controls */}
                      {isManualMode ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                              <Eraser className="w-5 h-5 text-accent" /> Touchup & Eraser
                            </h3>
                            <button onClick={() => setIsManualMode(false)} className="p-1 hover:bg-bg-secondary rounded-full transition-colors">
                              <X className="w-5 h-5 text-text-muted" />
                            </button>
                          </div>

                          <div className="grid grid-cols-3 bg-bg-secondary rounded-xl p-1 gap-1">
                            <button 
                              onClick={() => setBrushMode('magic')}
                              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${brushMode === 'magic' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:text-text-primary'}`}
                              title="Click on any unwanted background object to remove it instantly"
                            >
                              <Wand2 className="w-3.5 h-3.5" /> Magic Eraser
                            </button>
                            <button 
                              onClick={() => setBrushMode('erase')}
                              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${brushMode === 'erase' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:text-text-primary'}`}
                            >
                              <Eraser className="w-3.5 h-3.5" /> Erase
                            </button>
                            <button 
                              onClick={() => setBrushMode('restore')}
                              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${brushMode === 'restore' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:text-text-primary'}`}
                            >
                              <Paintbrush className="w-3.5 h-3.5" /> Restore
                            </button>
                          </div>

                          {brushMode === 'magic' ? (
                            <div className="space-y-3 p-3.5 bg-accent/5 border border-accent/20 rounded-xl">
                              <div className="flex justify-between text-xs font-bold text-accent">
                                <span className="flex items-center gap-1.5"><MousePointerClick className="w-3.5 h-3.5" /> 1-Click Magic Object Eraser</span>
                                <span>{magicEraserTolerance} tol</span>
                              </div>
                              <p className="text-[10px] text-text-muted leading-relaxed">
                                Simply click or tap on any remaining chair, table, shadow, or background object in the preview to erase it completely!
                              </p>
                              <input 
                                type="range" 
                                min="10" max="80" 
                                value={magicEraserTolerance} 
                                onChange={(e) => setMagicEraserTolerance(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
                              />
                            </div>
                          ) : (
                            <div className="space-y-3.5 p-3.5 bg-accent/5 border border-accent/20 rounded-2xl">
                              <div className="flex items-center gap-3">
                                {/* Visual Round Brush Shape Preview */}
                                <div className="w-12 h-12 rounded-xl bg-surface border border-border shadow-xs flex items-center justify-center shrink-0 relative overflow-hidden" title="Live Round Shape Brush Preview">
                                  <div 
                                    className="rounded-full border-2 border-white shadow-sm ring-1 ring-black/40 transition-all duration-75 flex items-center justify-center"
                                    style={{ 
                                      width: `${Math.min(42, Math.max(8, brushSize * 0.42))}px`, 
                                      height: `${Math.min(42, Math.max(8, brushSize * 0.42))}px`,
                                      backgroundColor: brushMode === 'erase' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.4)'
                                    }}
                                  >
                                    <div className="w-1 h-1 rounded-full bg-white shadow-xs" />
                                  </div>
                                </div>
                                <div className="flex-1 space-y-1">
                                  <div className="flex justify-between text-xs font-bold text-text-primary">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-accent inline-block" />
                                      Round Brush Size
                                    </span>
                                    <span className="text-accent font-extrabold">{brushSize}px</span>
                                  </div>
                                  <input 
                                    type="range" 
                                    min="5" max="100" 
                                    value={brushSize} 
                                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
                                  />
                                </div>
                              </div>

                              {/* Quick Preset Buttons for Smartphone & Desktop */}
                              <div className="flex items-center gap-1.5">
                                {[
                                  { label: '10px', val: 10 },
                                  { label: '25px', val: 25 },
                                  { label: '45px', val: 45 },
                                  { label: '70px', val: 70 },
                                ].map((preset) => (
                                  <button
                                    key={preset.val}
                                    type="button"
                                    onClick={() => setBrushSize(preset.val)}
                                    className={`flex-1 py-1 px-1 text-[10px] font-bold rounded-lg border transition-all text-center ${
                                      brushSize === preset.val 
                                        ? 'bg-accent text-white border-accent shadow-xs' 
                                        : 'bg-surface text-text-secondary border-border hover:border-accent'
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3">
                            <button onClick={undo} disabled={historyIndex < 0} className="btn bs2 py-3 rounded-xl gap-2 disabled:opacity-50 text-xs">
                              <Undo className="w-4 h-4" /> Undo
                            </button>
                            <button onClick={redo} disabled={historyIndex >= history.length - 1} className="btn bs2 py-3 rounded-xl gap-2 disabled:opacity-50 text-xs">
                              <Redo className="w-4 h-4" /> Redo
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                          {/* Subject Focus & Object Removal Controls */}
                          <div className="p-3.5 bg-accent/5 border border-accent/20 rounded-2xl space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-sm text-text-primary flex items-center gap-1.5">
                                <Target className="w-4 h-4 text-accent" /> Subject & Object Isolation
                              </h4>
                              <span className="text-[10px] bg-accent/10 text-accent font-bold px-2 py-0.5 rounded-full">
                                Dual AI Active
                              </span>
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between text-xs font-bold text-text-primary">
                                <span>Background Object Removal</span>
                                <span className="text-accent">{objectStrictness}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" max="100" 
                                value={objectStrictness} 
                                onChange={(e) => setObjectStrictness(parseInt(e.target.value))}
                                onMouseUp={() => imageSrc && removeBackground(imageSrc, { objectStrictness })}
                                onTouchEnd={() => imageSrc && removeBackground(imageSrc, { objectStrictness })}
                                className="w-full h-1.5 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
                              />
                              <div className="flex justify-between text-[8px] text-text-muted font-bold">
                                <span>Keep All</span>
                                <span>Balanced</span>
                                <span className="text-accent font-extrabold">Clean Studio</span>
                              </div>
                            </div>

                            <div className="space-y-1.5 pt-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-text-muted flex items-center gap-1.5 cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    checked={autoExtendLeftShoulder} 
                                    onChange={(e) => {
                                      setAutoExtendLeftShoulder(e.target.checked);
                                      if (imageSrc) removeBackground(imageSrc, { extendLeftShoulder: e.target.checked });
                                    }}
                                    className="accent-accent w-3.5 h-3.5 rounded"
                                  />
                                  Auto Extend Left Shoulder (White Check Shirt Fix)
                                </label>
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20">AI Active</span>
                              </div>

                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-text-muted flex items-center gap-1 cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    checked={severTouchingObjects} 
                                    onChange={(e) => {
                                      setSeverTouchingObjects(e.target.checked);
                                      if (imageSrc) removeBackground(imageSrc, { severTouchingObjects: e.target.checked });
                                    }}
                                    className="accent-accent w-3.5 h-3.5 rounded"
                                  />
                                  Sever Touching Objects (Chairs, Desks)
                                </label>
                              </div>
                            </div>
                          </div>

                          <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                            <ImageIcon className="w-5 h-5 text-accent" /> Background
                          </h3>

                            <div className="grid grid-cols-5 gap-2.5">
                              {[
                                { color: 'transparent', label: 'Transparent' },
                                { color: '#ffffff', label: 'Pure White' },
                                { color: '#0000ff', label: 'Blue' },
                                { color: '#eeeeee', label: 'Light Grey' },
                                { color: 'portrait', label: 'Blur BG' },
                                { color: '#1e3a8a', label: 'Navy' },
                                { color: '#dc2626', label: 'Red' },
                                { color: '#000000', label: 'Black' },
                              ].map(item => (
                                <button
                                  key={item.color}
                                  onClick={() => setBgColor(item.color)}
                                  title={item.label}
                                  className={`w-full aspect-square rounded-xl border-2 transition-all relative group flex items-center justify-center ${bgColor === item.color ? 'border-accent scale-105 shadow-md' : 'border-border/50 hover:border-border'}`}
                                  style={{ 
                                    backgroundColor: item.color === 'transparent' || item.color === 'portrait' ? 'transparent' : item.color,
                                    backgroundImage: item.color === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc 100%), linear-gradient(45deg, #ccc 25%, white 25%, white 75%, #ccc 75%, #ccc 100%)' : item.color === 'portrait' ? `url(${imageSrc})` : 'none',
                                    backgroundSize: item.color === 'transparent' ? '10px 10px' : 'cover',
                                    backgroundPosition: 'center'
                                  }}
                                >
                                  {item.color === 'portrait' && <Sparkles className="w-4 h-4 text-white drop-shadow-md" />}
                                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-bg-primary px-1 rounded border border-border whitespace-nowrap z-10">
                                    {item.label}
                                  </span>
                                </button>
                              ))}
                              <button
                                onClick={() => setBgColor('custom')}
                                title="Custom Color"
                                className={`w-full aspect-square rounded-xl border-2 flex items-center justify-center bg-gradient-to-br from-red-500 via-green-500 to-blue-500 transition-all relative group ${bgColor === 'custom' ? 'border-accent scale-105 shadow-md' : 'border-transparent hover:border-border'}`}
                              >
                                <div className="w-3.5 h-3.5 rounded-full bg-white/70" />
                                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-bg-primary px-1 rounded border border-border whitespace-nowrap z-10">
                                  Color
                                </span>
                              </button>
                              <button
                                onClick={() => {
                                  if (customBgImage) setBgColor('custom-image');
                                  else bgUploadInputRef.current?.click();
                                }}
                                title="Custom Background Image"
                                className={`w-full aspect-square rounded-xl border-2 flex items-center justify-center bg-bg-secondary transition-all relative group overflow-hidden ${bgColor === 'custom-image' ? 'border-accent scale-105 shadow-md' : 'border-dashed border-border hover:border-accent'}`}
                                style={customBgImage ? { backgroundImage: `url(${customBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                              >
                                {!customBgImage && <Upload className="w-4 h-4 text-text-muted" />}
                                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-bg-primary px-1 rounded border border-border whitespace-nowrap z-10">
                                  Image
                                </span>
                              </button>
                            </div>

                            <input
                              ref={bgUploadInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  const src = ev.target?.result as string;
                                  const img = new Image();
                                  img.onload = () => {
                                    customBgImgRef.current = img;
                                    setCustomBgImage(src);
                                    setBgColor('custom-image');
                                  };
                                  img.src = src;
                                };
                                reader.readAsDataURL(file);
                                e.target.value = '';
                              }}
                            />

                          {bgColor === 'portrait' && (
                            <div className="space-y-3 p-3 bg-accent/5 border border-accent/20 rounded-xl animate-in slide-in-from-top-2">
                              <div className="flex justify-between items-center text-[10px] font-bold text-accent">
                                <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> Portrait Blur</span>
                                <span>{blurAmount}px</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" max="30" 
                                value={blurAmount} 
                                onChange={(e) => setBlurAmount(Number(e.target.value))}
                                className="w-full h-1 bg-accent/20 rounded-lg appearance-none cursor-pointer accent-accent"
                              />
                            </div>
                          )}

                          {bgColor === 'custom' && (
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-text-muted uppercase">Custom Color</label>
                              <div className="flex gap-2">
                                <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="w-12 h-10 rounded-lg cursor-pointer bg-transparent border-none" />
                                <input type="text" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="fi flex-1" />
                              </div>
                            </div>
                          )}

                          {bgColor === 'custom-image' && (
                            <div className="space-y-2 p-3 bg-accent/5 border border-accent/20 rounded-xl">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-text-primary">Custom Background Image</span>
                                {customBgImage && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCustomBgImage(null);
                                      customBgImgRef.current = null;
                                      setBgColor('transparent');
                                    }}
                                    className="text-[10px] font-bold text-red-500 hover:underline"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => bgUploadInputRef.current?.click()}
                                className="w-full py-2 px-3 bg-surface border border-border hover:border-accent rounded-xl text-xs font-bold text-text-primary flex items-center justify-center gap-1.5 transition-all"
                              >
                                <Upload className="w-3.5 h-3.5" /> {customBgImage ? 'Change Background Image' : 'Upload Background Image'}
                              </button>
                            </div>
                          )}

                          <div className="pt-4 border-t border-border space-y-6">
                            <div className="flex items-center justify-between">
                              <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                                <Sliders className="w-5 h-5 text-accent" /> Adjustments
                              </h3>
                              <button onClick={() => { 
                                setBrightness(100); setContrast(100); setSaturation(100); 
                                setSharpness(0); setSmoothness(0); setEdgeSoftness(0); setBeautyFace(0); 
                                setIsUltraHD(false); 
                              }} className="text-xs text-accent font-bold hover:underline">Reset</button>
                            </div>

                            {/* 1-Click Auto Clarity & Edge Cleaner */}
                            <button
                              type="button"
                              onClick={() => {
                                setIsUltraHD(true);
                                setSharpness(40);
                                setContrast(108);
                                setSaturation(108);
                                setBrightness(102);
                                setEdgeSoftness(0);
                                setBeautyFace(10);
                              }}
                              className="w-full py-2.5 px-3 bg-gradient-to-r from-accent/15 to-accent/5 hover:from-accent/25 hover:to-accent/10 border border-accent/30 rounded-xl text-xs font-bold text-accent flex items-center justify-center gap-2 transition-all shadow-sm"
                            >
                              <Sparkles className="w-4 h-4 animate-pulse" /> Auto HD Clarity & De-Halo (1-Click)
                            </button>

                            <label className="flex items-center gap-2 p-3 bg-accent/5 border border-accent/20 rounded-xl cursor-pointer hover:bg-accent/10 transition-colors">
                              <input type="checkbox" checked={isUltraHD} onChange={(e) => setIsUltraHD(e.target.checked)} className="accent-accent w-4 h-4" />
                              <span className="text-sm font-bold text-accent flex items-center gap-1"><Sparkles className="w-4 h-4" /> Ultra HD Studio Clarity</span>
                            </label>

                            <div className="space-y-4">
                              {[
                                { label: 'Brightness', val: brightness, set: setBrightness, min: 50, max: 150, unit: '%' },
                                { label: 'Contrast', val: contrast, set: setContrast, min: 50, max: 150, unit: '%' },
                                { label: 'Saturation', val: saturation, set: setSaturation, min: 0, max: 200, unit: '%' },
                                { label: 'Photo Sharpness & Clarity', val: sharpness, set: setSharpness, min: 0, max: 100, unit: '' },
                                { label: 'Skin Smoothing', val: smoothness, set: setSmoothness, min: 0, max: 100, unit: '' },
                                { label: 'Edge Softness', val: edgeSoftness, set: setEdgeSoftness, min: 0, max: 100, unit: '' },
                                { label: 'Beauty Face & Glow', val: beautyFace, set: setBeautyFace, min: 0, max: 100, unit: '' }
                              ].map(adj => (
                                <div key={adj.label}>
                                  <div className="flex justify-between text-xs font-bold text-text-primary mb-1">
                                    <span>{adj.label}</span>
                                    <span>{adj.val}{adj.unit}</span>
                                  </div>
                                  <input 
                                    type="range" 
                                    min={adj.min} max={adj.max} 
                                    value={adj.val} 
                                    onChange={(e) => adj.set(Number(e.target.value))}
                                    className="w-full h-1.5 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                        {/* AI Shoulder Restoration Section */}
                        <div className="pt-4 border-t border-border space-y-4">
                          <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                            <Sparkles className="w-5 h-5 text-accent animate-pulse" /> AI Shoulder Restoration
                          </h3>
                          <p className="text-[10px] text-text-muted leading-relaxed">
                            Extend and preserve the left shoulder boundary seamlessly. Reconstructs missing shoulder portions naturally with pristine anti-aliased edges, keeping the original shirt texture, folds, and red background intact.
                          </p>

                          <div className="space-y-4 p-3 bg-accent/5 border border-accent/10 rounded-2xl animate-in slide-in-from-top-2">
                            <div className="space-y-3">
                              <div className="flex justify-between text-xs font-bold text-text-primary">
                                <span>Extension Width</span>
                                <span className="text-accent">{extendAmount}px</span>
                              </div>
                              <input 
                                type="range" 
                                min="20" max="150" 
                                value={extendAmount} 
                                onChange={(e) => setExtendAmount(Number(e.target.value))}
                                className="w-full h-1.5 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
                              />
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between text-xs font-bold text-text-primary">
                                <span>Shoulder Start Height</span>
                                <span className="text-accent">{Math.round((1 - shoulderHeightRatio) * 100)}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="42" max="68" 
                                value={Math.round(shoulderHeightRatio * 100)} 
                                onChange={(e) => setShoulderHeightRatio(Number(e.target.value) / 100)}
                                className="w-full h-1.5 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
                              />
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between text-xs font-bold text-text-primary">
                                <span>Fabric Texture Slope</span>
                                <span className="text-accent">{Math.round(clothingSlope * 100)}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" max="60" 
                                value={Math.round(clothingSlope * 100)} 
                                onChange={(e) => setClothingSlope(Number(e.target.value) / 100)}
                                className="w-full h-1.5 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
                              />
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between text-xs font-bold text-text-primary">
                                <span>Shoulder Curve Roundness</span>
                                <span className="text-accent">{Math.round(shoulderCurve * 100)}%</span>
                              </div>
                              <input 
                                type="range" 
                                min="25" max="75" 
                                value={Math.round(shoulderCurve * 100)} 
                                onChange={(e) => setShoulderCurve(Number(e.target.value) / 100)}
                                className="w-full h-1.5 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
                              />
                            </div>

                            <div className="flex flex-col gap-2 pt-2">
                              <button
                                type="button"
                                disabled={isProcessing || isExtendingShoulder}
                                onClick={async () => {
                                  if (!originalUploadedSrc) return;
                                  setIsExtendingShoulder(true);
                                  setProcessingError(null);
                                  try {
                                    const restored = await reconstructLeftShoulder(
                                      originalUploadedSrc,
                                      extendAmount,
                                      shoulderHeightRatio,
                                      clothingSlope,
                                      shoulderCurve
                                    );
                                    setImageSrc(restored);
                                    // Trigger background removal on the reconstructed source image immediately
                                    await removeBackground(restored);
                                  } catch (err) {
                                    console.error(err);
                                    setProcessingError("Failed to reconstruct the shoulder naturally.");
                                  } finally {
                                    setIsExtendingShoulder(false);
                                  }
                                }}
                                className="w-full btn bp py-2.5 rounded-xl font-bold text-xs gap-2 flex items-center justify-center bg-accent text-white hover:bg-accent/90 transition-all disabled:opacity-50"
                              >
                                {isExtendingShoulder ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Reconstructing...
                                  </>
                                ) : (
                                  <>
                                    <Wand2 className="w-4 h-4" /> Reconstruct Left Shoulder
                                  </>
                                )}
                              </button>

                              {imageSrc !== originalUploadedSrc && originalUploadedSrc && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setImageSrc(originalUploadedSrc);
                                    setResultImage(null);
                                    removeBackground(originalUploadedSrc);
                                  }}
                                  className="w-full py-2 border border-border hover:bg-bg-secondary rounded-xl text-[10px] font-bold text-text-muted hover:text-text-primary transition-all flex items-center justify-center gap-1.5"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" /> Reset to Original Photo
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                  {/* Tips Box */}
                  <div className="bg-accent/5 border border-accent/20 rounded-2xl p-4">
                    <h4 className="font-bold text-accent text-sm mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> Pro Tips
                    </h4>
                    <ul className="text-[10px] text-text-secondary space-y-1.5 list-disc pl-4">
                      <li>Use well-lit photos for best results.</li>
                      <li>Hair-aware edge matting preserves fine strands, ears, and clothing contours.</li>
                      <li>Use "Portrait" mode with blur to keep your original high-quality background.</li>
                      <li>Use "Manual Touchup" to fix tiny details or stray hair strands.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Sidebar Actions */}
              <div className="sidebar-actions">
                {isManualMode ? (
                  <button onClick={() => setIsManualMode(false)} className="w-full btn bp py-3 rounded-xl font-bold">
                    Done Touchup
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    {!resultImage && !isProcessing && imageSrc && (
                      <button 
                        onClick={() => removeBackground()} 
                        className="w-full btn bp py-3 rounded-xl gap-2 font-bold shadow-lg shadow-accent/20 animate-bounce"
                      >
                        <Wand2 className="w-5 h-5" /> Remove Background Now
                      </button>
                    )}
                    
                    {resultImage && (
                      <>
                        <button onClick={downloadImage} className="w-full btn bp py-3 rounded-xl gap-2 font-bold shadow-lg shadow-accent/20">
                          <Download className="w-5 h-5" /> Download Image
                        </button>
                        <button onClick={onReset} className="w-full text-xs font-bold text-text-muted hover:text-red-500 transition-colors py-2">
                          Start Over
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </aside>

            {/* --- MAIN PREVIEW --- */}
            <main className={`tool-main-preview ${isCropping ? 'is-cropping-mobile' : ''}`}>
              <div className="preview-content-wrapper flex flex-col gap-4">
                {/* Separate Zoom Controls */}
                <div className="flex items-center justify-center gap-2 bg-surface/80 backdrop-blur-md p-2 rounded-2xl border border-border shadow-sm w-fit mx-auto animate-in fade-in slide-in-from-top-2">
                  <button 
                    onClick={handleZoomOut}
                    className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-primary"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-5 h-5" />
                  </button>
                  <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-xs font-bold text-text-primary">
                      {Math.round(zoom * 100)}%
                    </span>
                    <div className="w-full h-1 bg-border rounded-full mt-1 overflow-hidden">
                      <div 
                        className="h-full bg-accent transition-all" 
                        style={{ width: `${Math.min(100, (zoom / 4) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <button 
                    onClick={handleZoomIn}
                    className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-primary"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-5 h-5" />
                  </button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <button 
                    onClick={handleZoomReset}
                    className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-primary flex items-center gap-2 text-xs font-bold"
                    title="Reset Zoom"
                  >
                    <Maximize2 className="w-4 h-4" />
                    Reset
                  </button>
                </div>

                <div 
                  ref={previewContainerRef}
                  className="relative w-full h-[400px] sm:h-[550px] bg-bg-secondary rounded-3xl overflow-auto border border-border group shadow-inner p-6 sm:p-12"
                >
                  <div 
                    className="table mx-auto"
                    style={{ minHeight: '100%' }}
                  >
                    <div className="table-cell align-middle">
                    {isCropping ? (
                      <div className="w-full h-full flex items-center justify-center p-4 overflow-auto bg-black/20 rounded-3xl">
                        <ReactCrop
                          crop={crop}
                          onChange={(c) => setCrop(c)}
                          onComplete={(c) => setCompletedCrop(c)}
                          aspect={aspect}
                          className="shadow-2xl rounded-sm bg-white border border-gray-300"
                          ruleOfThirds
                          keepSelection
                        >
                          <img 
                            ref={imgRef}
                            src={imageSrc} 
                            onLoad={onImageLoad}
                            alt="To crop" 
                            style={{ 
                              maxWidth: '100%', 
                              maxHeight: '400px',
                              width: 'auto',
                              height: 'auto',
                              transform: `rotate(${rotation}deg)`,
                              touchAction: 'none'
                            }}
                          />
                        </ReactCrop>
                      </div>
                    ) : isManualMode ? (() => {
                      const { displayW, displayH } = getManualDisplayDims(imageDims);
                      return (
                      <div 
                        className="flex items-center justify-center relative shrink-0 rounded-lg overflow-hidden shadow-2xl"
                        onMouseEnter={(e) => updateTouchupCursor(e, false)}
                        onMouseMove={(e) => updateTouchupCursor(e, false)}
                        onMouseLeave={() => setTouchupCursor(null)}
                        style={{
                          width: `${displayW}px`,
                          height: `${displayH}px`,
                          backgroundColor: resultImage && bgColor !== 'transparent' && bgColor !== 'portrait' && bgColor !== 'custom-image' ? (bgColor === 'custom' ? customColor : bgColor) : 'transparent',
                          backgroundImage: !resultImage || bgColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none',
                          backgroundSize: '20px 20px',
                          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                        }}
                      >
                        {resultImage && bgColor === 'portrait' && imageSrc && (
                          <img src={imageSrc} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" style={{ filter: `blur(${blurAmount}px)` }} />
                        )}
                        {resultImage && bgColor === 'custom-image' && customBgImage && (
                          <img src={customBgImage} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" />
                        )}
                        <canvas
                          ref={canvasRef}
                          onMouseDown={(e) => { updateTouchupCursor(e, false); startDrawing(e); }}
                          onMouseMove={(e) => { updateTouchupCursor(e, false); draw(e); }}
                          onMouseUp={stopDrawing}
                          onMouseLeave={() => { setTouchupCursor(null); stopDrawing(); }}
                          onTouchStart={(e) => { updateTouchupCursor(e, true); startDrawing(e); }}
                          onTouchMove={(e) => { updateTouchupCursor(e, true); draw(e); }}
                          onTouchEnd={stopDrawing}
                          onClick={handleMagicEraserClick}
                          className={`${brushMode === 'magic' ? 'cursor-pointer' : 'cursor-none'} relative z-10 select-none touch-none block shrink-0`}
                          style={{
                            width: `${displayW}px`,
                            height: `${displayH}px`,
                            filter: resultImage ? getFilterStyle() : 'none',
                            backgroundColor: 'transparent',
                            imageRendering: 'auto'
                          }}
                        />
                      </div>
                      );
                    })() : (() => {
                      const { displayW, displayH } = getManualDisplayDims(imageDims);
                      return (
                      <div
                        className="flex items-center justify-center relative shrink-0 rounded-lg overflow-hidden"
                        style={{
                          width: `${displayW}px`,
                          height: `${displayH}px`,
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                          backgroundColor: resultImage && bgColor !== 'transparent' && bgColor !== 'portrait' && bgColor !== 'custom-image' ? (bgColor === 'custom' ? customColor : bgColor) : 'transparent',
                          backgroundImage: !resultImage || bgColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none',
                          backgroundSize: '20px 20px',
                          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                        }}
                      >
                        {resultImage && bgColor === 'portrait' && imageSrc && (
                          <img src={imageSrc} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" style={{ filter: `blur(${blurAmount}px)` }} />
                        )}
                        {resultImage && bgColor === 'custom-image' && customBgImage && (
                          <img src={customBgImage} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" />
                        )}
                        <img 
                          ref={resultImgElementRef}
                          key={resultImage || 'original'}
                          src={resultImage || imageSrc} 
                          alt="Preview" 
                          referrerPolicy="no-referrer"
                          onClick={handleMagicEraserClick}
                          onError={() => {
                            console.error("Preview image failed to load:", resultImage);
                            if (resultImage) {
                              setResultImage(null);
                            }
                          }}
                          className={`relative z-10 block shrink-0 ${brushMode === 'magic' ? 'cursor-pointer hover:ring-2 hover:ring-accent' : ''}`}
                          style={{ 
                            width: `${displayW}px`,
                            height: `${displayH}px`,
                            filter: resultImage && !isManualMode ? getFilterStyle() : 'none',
                            backgroundColor: 'transparent'
                          }}
                        />
                        
                        {processingError && (
                          <div className="preview-loading-overlay backdrop-blur-sm bg-black/40 rounded-lg">
                            <div className="flex flex-col items-center text-center max-w-xs w-full px-6 bg-gray-900/90 p-6 rounded-xl border border-red-500/50 shadow-2xl">
                              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                                <X className="w-6 h-6 text-red-500" />
                              </div>
                              <h3 className="text-white font-bold mb-2">Processing Failed</h3>
                              <p className="text-gray-400 text-xs mb-6">{processingError}</p>
                              <button 
                                onClick={() => removeBackground()}
                                className="w-full py-2 bg-accent text-white rounded-lg font-bold text-sm hover:bg-accent/80 transition-colors flex items-center justify-center gap-2"
                              >
                                <RefreshCw className="w-4 h-4" /> Try Again
                              </button>
                            </div>
                          </div>
                        )}
                        
                        {isProcessing && !processingError && (
                          <div className="preview-loading-overlay backdrop-blur-md bg-black/40 rounded-lg">
                            <motion.div 
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="flex flex-col items-center justify-center p-10 bg-gray-900/40 rounded-3xl border border-white/10 shadow-2xl relative"
                            >
                              {/* Damru AI Animation - Ultra Fast Mode */}
                              <motion.div
                                animate={{
                                  rotate: [0, -45, 45, -45, 45, -45, 45, 0],
                                  scale: [1, 1.2, 0.8, 1.2, 0.9, 1.1, 1]
                                }}
                                transition={{
                                  duration: 0.15,
                                  repeat: Infinity,
                                  ease: "linear"
                                }}
                                className="relative w-24 h-28 flex flex-col items-center justify-center filter drop-shadow-[0_0_20px_rgba(var(--accent-rgb,255,100,100),0.6)]"
                              >
                                {/* Upper Head */}
                                <div className="w-16 h-12 bg-accent rounded-t-[100%] rounded-b-[20%] relative overflow-hidden shadow-inner">
                                  <div className="absolute inset-x-0 top-0 h-1 bg-white/40" />
                                </div>
                                {/* Waist */}
                                <div className="w-5 h-5 bg-white/90 z-10 border-2 border-accent rounded-sm shadow-sm" />
                                {/* Lower Head */}
                                <div className="w-16 h-12 bg-accent rounded-b-[100%] rounded-t-[20%] relative overflow-hidden shadow-inner">
                                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/40" />
                                </div>
                                
                                {/* Side Beads/Strings for Damru */}
                                <motion.div 
                                  animate={{ rotate: [-60, 60] }} 
                                  transition={{ duration: 0.08, repeat: Infinity, repeatType: "mirror" }}
                                  className="absolute left-[-25px] top-1/2 w-12 h-[3px] bg-white origin-right rounded-full"
                                >
                                   <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-accent shadow-sm" />
                                </motion.div>
                                <motion.div 
                                  animate={{ rotate: [60, -60] }} 
                                  transition={{ duration: 0.08, repeat: Infinity, repeatType: "mirror" }}
                                  className="absolute right-[-25px] top-1/2 w-12 h-[3px] bg-white origin-left rounded-full"
                                >
                                   <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-accent shadow-sm" />
                                </motion.div>
                              </motion.div>
                            </motion.div>
                          </div>
                        )}
                      </div>
                      );
                    })()}
                    </div>
                  </div>
                  
                  {/* Round Shape Brush Cursor Overlay for Desktop & Mobile Touch (fixed viewport, unaffected by zoom/scroll) */}
                  {isManualMode && brushMode !== 'magic' && touchupCursor && (
                    <div
                      className="pointer-events-none fixed z-50 rounded-full -translate-x-1/2 -translate-y-1/2 select-none transition-transform duration-75"
                      style={{
                        left: `${touchupCursor.x}px`,
                        top: `${touchupCursor.y}px`,
                        width: `${getBrushRenderedDiameter()}px`,
                        height: `${getBrushRenderedDiameter()}px`,
                        border: '2px solid rgba(255, 255, 255, 0.95)',
                        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.8), 0 0 12px rgba(0, 0, 0, 0.4)',
                        backgroundColor: brushMode === 'erase' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)',
                      }}
                    >
                      <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-white shadow-xs ring-1 ring-black/70" />
                      {touchupCursor.isTouch && (
                        <>
                          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-0.5 h-2.5 bg-white shadow-xs ring-1 ring-black/60" />
                          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-0.5 h-2.5 bg-white shadow-xs ring-1 ring-black/60" />
                          <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-0.5 bg-white shadow-xs ring-1 ring-black/60" />
                          <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-2.5 h-0.5 bg-white shadow-xs ring-1 ring-black/60" />
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/85 text-white text-[9px] font-bold rounded-full shadow-md whitespace-nowrap border border-white/30 backdrop-blur-xs">
                            {brushSize}px
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Floating Controls */}
                  <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={onReset} className="p-3 bg-white/90 hover:bg-white text-red-500 rounded-full shadow-xl transition-all hover:scale-110">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Status Bar */}
                {resultImage && !isManualMode && (
                  <div className="mt-4 flex items-center justify-between bg-accent/5 border border-accent/20 rounded-2xl p-4 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center gap-2 text-accent">
                      <Check className="w-5 h-5" />
                      <span className="font-bold text-sm">Background Removed Perfectly!</span>
                    </div>
                    <button onClick={() => setIsManualMode(true)} className="text-sm font-bold text-accent hover:underline flex items-center gap-1 bg-accent/10 px-3 py-1.5 rounded-lg transition-colors">
                      <Eraser className="w-4 h-4" /> Manual Touchup
                    </button>
                  </div>
                )}
              </div>
            </main>
          </div>
        );
      }}
    </ToolLayout>
  );
}
