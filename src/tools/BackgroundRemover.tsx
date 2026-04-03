import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Loader2, X, Wand2, Image as ImageIcon, Check, Trash2, Eraser, Paintbrush, Sliders, Sparkles, RefreshCw, Undo, Redo, Maximize2, Crop as CropIcon, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import ToolLayout from '../components/tool-system/ToolLayout';
import { hybridRemoveBackground, ensurePreloaded } from '../lib/bgRemoval';

export default function BackgroundRemover() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [statusText, setStatusText] = useState('');
  // Removed preload engine model on mount to prevent concurrent loading deadlocks

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      setTimer(0);
      setProcessingError(null);
      interval = setInterval(() => {
        setTimer((prev) => {
          // Target 7 seconds for a high-quality result
          if (prev >= 6.9) return 6.9;
          return prev + 0.1;
        });
      }, 100);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);
  const [bgColor, setBgColor] = useState('transparent');
  const [customColor, setCustomColor] = useState('#ffffff');
  
  // Manual Touchup State
  const [isManualMode, setIsManualMode] = useState(false);
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(25);
  const [zoom, setZoom] = useState(0.3);
  const handleZoomIn = useCallback(() => setZoom(prev => Math.min(prev + 0.1, 4)), []);
  const handleZoomOut = useCallback(() => setZoom(prev => Math.max(prev - 0.1, 0.1)), []);
  const handleZoomReset = useCallback(() => setZoom(0.3), []);

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
    let b = brightness;
    let c = contrast;
    let s = saturation;
    
    if (isUltraHD) {
      c += 15;
      s += 20;
    }
    
    let filterString = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
    if (smoothness > 0) {
      filterString += ` blur(${smoothness / 100}px)`;
    }
    if (beautyFace > 0) {
      const beautyBlur = beautyFace / 80;
      const beautyBright = 100 + (beautyFace / 15);
      const beautyContrast = 100 - (beautyFace / 20);
      const beautySaturate = 100 + (beautyFace / 20);
      filterString += ` blur(${beautyBlur}px) brightness(${beautyBright}%) contrast(${beautyContrast}%) saturate(${beautySaturate}%)`;
    }
    if (edgeSoftness > 0) {
      const edgeBlur = edgeSoftness / 50;
      filterString += ` drop-shadow(0 0 ${edgeBlur}px rgba(0,0,0,0.15)) blur(${edgeBlur / 2}px)`;
    }
    
    const finalSharpness = isUltraHD ? (sharpness + 60) : sharpness;
    if (finalSharpness > 0) {
      filterString += ` url(#sharpen-filter)`;
    }
    
    return filterString;
  };

  const finalSharpness = isUltraHD ? (sharpness + 60) : sharpness;
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

  // Preload AI models on mount for "instant" feel
  useEffect(() => {
    ensurePreloaded();
  }, []);

  const updateCanvasFromSrc = (src: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
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
      setResultImage(null);
      setHistory([]);
      setHistoryIndex(-1);
      setIsManualMode(false);
      setIsCropping(false); // Direct to instant result
      setHasCropped(false);
      setZoom(0.3); // Reset zoom to 30%
      
      const img = new Image();
      img.onload = () => { 
        originalImgRef.current = img; 
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

  const removeBackground = async (src?: string | React.MouseEvent) => {
    const targetSrc = typeof src === 'string' ? src : imageSrc;
    if (!targetSrc) return;
    setIsProcessing(true);
    setProcessingError(null);
    setTimer(0);
    setStatusText('Initializing AI Engine...');
    
    const startTime = Date.now();
    
    try {
      const rawBlob = await hybridRemoveBackground(targetSrc, async (status, intermediateBlob) => {
        setStatusText(status);
        if (intermediateBlob) {
          const url = URL.createObjectURL(intermediateBlob);
          setResultImage(url);
        }
      });

      const url = URL.createObjectURL(rawBlob);
      setResultImage(url);
      addToHistory(url);
      
      // Update original image ref for manual mode
      const resultImg = new Image();
      resultImg.onload = () => { originalImgRef.current = resultImg; };
      resultImg.src = url;

      const duration = (Date.now() - startTime) / 1000;
      console.log(`UI: BG Removal took ${duration}s`);

    } catch (error) {
      console.error("BG Removal Error:", error);
      const errorMessage = error instanceof Error ? error.message : "AI background removal failed.";
      setProcessingError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Manual Touchup Logic ---
  useEffect(() => {
    if (isManualMode && canvasRef.current) {
      if (isDrawingUpdateRef.current) {
        isDrawingUpdateRef.current = false;
        return;
      }
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.onload = async () => {
        // Always use original image dimensions for the canvas to avoid shifts
        const origImg = new Image();
        origImg.src = imageSrc || '';
        await new Promise(resolve => { origImg.onload = resolve; });
        
        canvas.width = origImg.width;
        canvas.height = origImg.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = resultImage || imageSrc || '';
    }
  }, [isManualMode, resultImage, imageSrc]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    lastPosRef.current = getCoords(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !lastPosRef.current || !canvasRef.current || !originalImgRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const pos = getCoords(e);
    if (!pos) return;

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (brushMode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      const pattern = ctx.createPattern(originalImgRef.current, 'no-repeat');
      if (pattern) {
        ctx.strokeStyle = pattern;
        ctx.stroke();
      }
    }

    lastPosRef.current = pos;
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      setIsDrawing(false);
      const result = canvasRef.current.toDataURL('image/png');
      isDrawingUpdateRef.current = true;
      setResultImage(result);
      addToHistory(result);
    }
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

    // Apply Filters to the subject
    let b = appliedAdjustments.brightness;
    let c = appliedAdjustments.contrast;
    let s = appliedAdjustments.saturation;
    
    if (appliedAdjustments.isUltraHD) {
      c += 15;
      s += 20;
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
    
    tempCtx.filter = filterString;
    tempCtx.drawImage(img, 0, 0);
    tempCtx.filter = 'none';

    // Apply Sharpness to the subject only
    const finalSharpness = appliedAdjustments.isUltraHD ? (appliedAdjustments.sharpness + 60) : appliedAdjustments.sharpness;
    if (finalSharpness > 0) {
      const amount = finalSharpness / 100; // More balanced sharpening
      const a = amount;
      const b_val = 1 + 4 * a;
      const sw = tempCanvas.width;
      const sh = tempCanvas.height;
      const imageData = tempCtx.getImageData(0, 0, sw, sh);
      const pixels = imageData.data;
      const output = tempCtx.createImageData(sw, sh);
      const dst = output.data;

      for (let i = 0; i < pixels.length; i += 4) {
        const x = (i / 4) % sw;
        const y = Math.floor((i / 4) / sw);
        const alpha = pixels[i + 3];
        
        if (alpha === 0 || x === 0 || x === sw - 1 || y === 0 || y === sh - 1) {
          dst[i] = pixels[i]; dst[i+1] = pixels[i+1]; dst[i+2] = pixels[i+2]; dst[i+3] = pixels[i+3];
          continue;
        }
        
        const iUp = i - sw * 4; const iDown = i + sw * 4; const iLeft = i - 4; const iRight = i + 4;
        
        // Alpha-aware neighbor sampling
        const getR = (idx: number) => pixels[idx + 3] === 0 ? pixels[i] : pixels[idx];
        const getG = (idx: number) => pixels[idx + 3] === 0 ? pixels[i + 1] : pixels[idx + 1];
        const getB = (idx: number) => pixels[idx + 3] === 0 ? pixels[i + 2] : pixels[idx + 2];

        dst[i]     = pixels[i] * b_val - (getR(iUp) + getR(iDown) + getR(iLeft) + getR(iRight)) * a;
        dst[i + 1] = pixels[i + 1] * b_val - (getG(iUp) + getG(iDown) + getG(iLeft) + getG(iRight)) * a;
        dst[i + 2] = pixels[i + 2] * b_val - (getB(iUp) + getB(iDown) + getB(iLeft) + getB(iRight)) * a;
        dst[i + 3] = alpha;
      }
      tempCtx.putImageData(output, 0, 0);
    }
    
    // Now composite everything onto the final canvas
    // 1. Draw Background
    if (bgColor !== 'transparent') {
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
      description="Remove image backgrounds instantly with professional precision using High-Accuracy AI."
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
                // Reset all states for new image
                setResultImage(null);
                setProcessingError(null);
                setHistory([]);
                setHistoryIndex(-1);
                setIsManualMode(false);
                setIsCropping(false); // Skip crop mode by default for "instant" feel
                setHasCropped(false);
                setZoom(0.3); // Default to 30% on new upload
                
                const img = new Image();
              img.onload = () => { 
                originalImgRef.current = img;
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
          }
        }, [file]);

        useEffect(() => {
          if (isManualMode && resultImage && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const img = new Image();
            img.onload = () => {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
            };
            img.src = resultImage;
          }
        }, [isManualMode, resultImage]);

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
                            Ultra-fast hybrid AI processing.
                          </p>
                        </div>

                        <button 
                          onClick={removeBackground}
                        disabled={isProcessing}
                        className={`w-full btn py-4 rounded-2xl gap-2 text-lg shadow-lg ${processingError ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' : 'bp shadow-accent/20'}`}
                      >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : processingError ? <RefreshCw className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                        {processingError ? 'Retry AI Removal' : 'Remove Background'}
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
                              <Eraser className="w-5 h-5 text-accent" /> Touchup
                            </h3>
                            <button onClick={() => setIsManualMode(false)} className="p-1 hover:bg-bg-secondary rounded-full transition-colors">
                              <X className="w-5 h-5 text-text-muted" />
                            </button>
                          </div>

                          <div className="flex bg-bg-secondary rounded-xl p-1">
                            <button 
                              onClick={() => setBrushMode('erase')}
                              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold transition-all ${brushMode === 'erase' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:text-text-primary'}`}
                            >
                              <Eraser className="w-4 h-4" /> Erase
                            </button>
                            <button 
                              onClick={() => setBrushMode('restore')}
                              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold transition-all ${brushMode === 'restore' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:text-text-primary'}`}
                            >
                              <Paintbrush className="w-4 h-4" /> Restore
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div className="flex justify-between text-sm font-bold text-text-primary">
                              <span>Brush Size</span>
                              <span className="text-accent">{brushSize}px</span>
                            </div>
                            <input 
                              type="range" 
                              min="5" max="100" 
                              value={brushSize} 
                              onChange={(e) => setBrushSize(parseInt(e.target.value))}
                              className="w-full h-1.5 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
                            />
                          </div>

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
                          <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                            <ImageIcon className="w-5 h-5 text-accent" /> Background
                          </h3>

                            <div className="grid grid-cols-4 gap-2">
                              {[
                                { color: 'transparent', label: 'Clear' },
                                { color: '#ffffff', label: 'White' },
                                { color: '#000000', label: 'Black' },
                                { color: '#1e3a8a', label: 'Blue' },
                                { color: '#dc2626', label: 'Red' },
                                { color: '#bae6fd', label: 'Sky' },
                                { color: '#f3f4f6', label: 'Gray' }
                              ].map(item => (
                                <button
                                  key={item.color}
                                  onClick={() => setBgColor(item.color)}
                                  title={item.label}
                                  className={`w-full aspect-square rounded-xl border-2 transition-all relative group ${bgColor === item.color ? 'border-accent scale-110 shadow-md' : 'border-transparent hover:border-border'}`}
                                  style={{ 
                                    backgroundColor: item.color === 'transparent' ? 'white' : item.color,
                                    backgroundImage: item.color === 'transparent' ? 'linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%, #eee 100%), linear-gradient(45deg, #eee 25%, white 25%, white 75%, #eee 75%, #eee 100%)' : 'none',
                                    backgroundSize: item.color === 'transparent' ? '10px 10px' : 'auto',
                                    backgroundPosition: item.color === 'transparent' ? '0 0, 5px 5px' : '0 0'
                                  }}
                                >
                                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-bg-primary px-1 rounded border border-border whitespace-nowrap z-10">
                                    {item.label}
                                  </span>
                                </button>
                              ))}
                              <button
                                onClick={() => setBgColor('custom')}
                                title="Custom"
                                className={`w-full aspect-square rounded-xl border-2 flex items-center justify-center bg-gradient-to-br from-red-500 via-green-500 to-blue-500 transition-all relative group ${bgColor === 'custom' ? 'border-accent scale-110 shadow-md' : 'border-transparent hover:border-border'}`}
                              >
                                <div className="w-4 h-4 rounded-full bg-white/50" />
                                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity bg-bg-primary px-1 rounded border border-border whitespace-nowrap z-10">
                                  Custom
                                </span>
                              </button>
                            </div>

                          {bgColor === 'custom' && (
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-text-muted uppercase">Custom Color</label>
                              <div className="flex gap-2">
                                <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="w-12 h-10 rounded-lg cursor-pointer bg-transparent border-none" />
                                <input type="text" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="fi flex-1" />
                              </div>
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

                            <label className="flex items-center gap-2 p-3 bg-accent/5 border border-accent/20 rounded-xl cursor-pointer hover:bg-accent/10 transition-colors">
                              <input type="checkbox" checked={isUltraHD} onChange={(e) => setIsUltraHD(e.target.checked)} className="accent-accent w-4 h-4" />
                              <span className="text-sm font-bold text-accent flex items-center gap-1"><Sparkles className="w-4 h-4" /> Ultra HD Enhance</span>
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
                      <li>Clear contrast between subject and background helps AI.</li>
                      <li>Use "Manual Touchup" to fix tiny details.</li>
                      <li>The background is automatically replaced with pure white.</li>
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

                <svg width="0" height="0" className="absolute pointer-events-none">
                  <defs>
                    <filter id="sharpen-filter">
                      <feConvolveMatrix 
                        order="3 3" 
                        preserveAlpha="true" 
                        kernelMatrix={`0 ${-sharpnessAmount} 0 ${-sharpnessAmount} ${centerValue} ${-sharpnessAmount} 0 ${-sharpnessAmount} 0`}
                        edgeMode="duplicate"
                      />
                    </filter>
                  </defs>
                </svg>
                <div 
                  ref={previewContainerRef}
                  className="relative w-full h-[400px] sm:h-[550px] bg-bg-secondary rounded-3xl overflow-auto border border-border group shadow-inner p-6 sm:p-12"
                >
                  <div 
                    className="table mx-auto transition-all duration-200 ease-out"
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
                    ) : isManualMode ? (
                      <div className="flex items-center justify-center w-full h-full">
                        <canvas
                          ref={canvasRef}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                          className="max-w-full max-h-full cursor-crosshair shadow-2xl rounded-lg transition-all duration-200"
                          style={{
                            zoom: zoom,
                            backgroundColor: resultImage && bgColor !== 'transparent' ? (bgColor === 'custom' ? customColor : bgColor) : 'transparent',
                            backgroundImage: !resultImage || bgColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none',
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center relative w-full h-full">
                        <img 
                          ref={resultImgElementRef}
                          key={resultImage || 'original'}
                          src={resultImage || imageSrc} 
                          alt="Preview" 
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            console.error("Preview image failed to load:", resultImage);
                            // Fallback to original if result fails
                            if (resultImage) {
                              setResultImage(null);
                            }
                          }}
                          className="max-w-full max-h-full shadow-2xl rounded-lg transition-all duration-200"
                          style={{ 
                            zoom: zoom,
                            filter: resultImage && !isManualMode ? getFilterStyle() : 'none',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                            backgroundColor: resultImage && bgColor !== 'transparent' ? (bgColor === 'custom' ? customColor : bgColor) : 'transparent',
                            backgroundImage: !resultImage || bgColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none',
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                          }}
                        />
                        
                        {isProcessing && (
                          <div className="preview-loading-overlay backdrop-blur-sm bg-black/40 rounded-lg">
                            <div className="flex flex-col items-center text-center max-w-xs w-full px-6 bg-gray-900/80 p-6 rounded-xl border border-white/10 shadow-2xl">
                              <div className="relative mb-3">
                                <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-accent animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-white text-[10px]">
                                  {timer.toFixed(1)}s
                                </div>
                              </div>
                              <div className="w-full h-1.5 bg-white/10 rounded-full mb-2 overflow-hidden">
                                <div 
                                  className="h-full bg-accent transition-all duration-300 ease-out"
                                  style={{ 
                                    width: statusText.match(/(\d+)%/) ? statusText.match(/(\d+)%/)![0] :
                                           statusText.includes('Downloading') ? '20%' : 
                                           statusText.includes('Processing') ? '50%' : 
                                           statusText.includes('Refining Edges') ? '80%' : 
                                           statusText.includes('Finalizing') ? '95%' : '5%'
                                  }}
                                />
                              </div>
                              <p className="mt-1 text-xs font-bold text-white uppercase tracking-wider">{statusText || 'Removing...'}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                  
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
