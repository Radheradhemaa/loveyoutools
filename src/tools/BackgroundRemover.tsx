import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Loader2, X, Wand2, Image as ImageIcon, Check, Trash2, Eraser, Paintbrush, Sliders, Sparkles, RefreshCw, Undo, Redo } from 'lucide-react';
import ToolLayout from '../components/tool-system/ToolLayout';

// --- Global Engine Cache ---
let isEngineWarmed = false;
let engineWarmPromise: Promise<void> | null = null;
let selfieSegmentationInstance: any = null;

const getSelfieSegmentation = async () => {
  if (selfieSegmentationInstance) return selfieSegmentationInstance;
  
  try {
    const mpSelfie = await import('@mediapipe/selfie_segmentation');
    // Handle both default and named exports
    const SelfieSegmentationClass = mpSelfie.SelfieSegmentation || (mpSelfie as any).default;
    
    if (!SelfieSegmentationClass) {
      throw new Error("SelfieSegmentation class not found in @mediapipe/selfie_segmentation");
    }

    selfieSegmentationInstance = new SelfieSegmentationClass({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
      }
    });

    selfieSegmentationInstance.setOptions({
      modelSelection: 1,
      selfieMode: false,
    });

    return selfieSegmentationInstance;
  } catch (err) {
    console.error("Failed to load MediaPipe Selfie Segmentation:", err);
    throw err;
  }
};

const prewarmEngine = async () => {
  if (isEngineWarmed) return;
  if (engineWarmPromise) return engineWarmPromise;

  engineWarmPromise = (async () => {
    try {
      const segmenter = await getSelfieSegmentation();
      
      const tinyPixel = new Image();
      tinyPixel.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      await new Promise((resolve) => {
        tinyPixel.onload = async () => {
          await segmenter.send({ image: tinyPixel });
          resolve(null);
        };
      });

      isEngineWarmed = true;
    } catch (e) {
      console.warn("Prewarm failed", e);
    }
  })();
  return engineWarmPromise;
};

export default function BackgroundRemover() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [bgColor, setBgColor] = useState('transparent');
  const [customColor, setCustomColor] = useState('#ffffff');
  
  // Manual Touchup State
  const [isManualMode, setIsManualMode] = useState(false);
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(25);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const lastPosRef = useRef<{x: number, y: number} | null>(null);

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
      setResultImage(history[prevIndex]);
      updateCanvasFromSrc(history[prevIndex]);
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      setResultImage(null);
      updateCanvasFromSrc(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setResultImage(history[nextIndex]);
      updateCanvasFromSrc(history[nextIndex]);
    }
  };

  // Preload engine model on mount for instant results later
  useEffect(() => {
    prewarmEngine();
  }, []);

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
      
      const img = new Image();
      img.onload = () => { originalImgRef.current = img; };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const resizeImage = (src: string, maxDim: number): Promise<string> => {
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
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  };

  const removeBackground = async () => {
    if (!imageSrc) return;
    setIsProcessing(true);
    setStatusText('AI is working...');
    
    try {
      const segmenter = await getSelfieSegmentation();

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageSrc;
      await new Promise((resolve, reject) => { 
        img.onload = resolve; 
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      const resultBlob = await new Promise<Blob | null>((resolve) => {
        let resolved = false;
        
        segmenter.onResults((results: any) => {
          if (resolved) return;
          resolved = true;
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // 1. Create a refined mask
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = canvas.width;
          maskCanvas.height = canvas.height;
          const maskCtx = maskCanvas.getContext('2d')!;
          
          // Draw the raw mask
          maskCtx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
          
          // 2. Refine the mask for better hair/shoulder edges
          const refinedMaskCanvas = document.createElement('canvas');
          refinedMaskCanvas.width = canvas.width;
          refinedMaskCanvas.height = canvas.height;
          const refinedMaskCtx = refinedMaskCanvas.getContext('2d')!;
          
          // Apply a slight blur and then high contrast to the mask to sharpen edges while keeping them smooth
          refinedMaskCtx.filter = 'blur(1px) contrast(200%) brightness(110%)';
          refinedMaskCtx.drawImage(maskCanvas, 0, 0);
          
          // 3. Use the refined mask to clip the original image
          ctx.save();
          ctx.drawImage(refinedMaskCanvas, 0, 0, canvas.width, canvas.height);
          ctx.globalCompositeOperation = 'source-in';
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
          ctx.restore();

          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        });

        segmenter.send({ image: img }).catch((err: any) => {
          console.error("MediaPipe send error:", err);
          resolve(null);
        });

        // Timeout fallback - 5 seconds as requested
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        }, 5000);
      });

      if (resultBlob) {
        const url = URL.createObjectURL(resultBlob);
        setResultImage(url);
        addToHistory(url);
        
        // Update original image ref for manual mode
        const resultImg = new Image();
        resultImg.onload = () => { originalImgRef.current = resultImg; };
        resultImg.src = url;
      } else {
        throw new Error("Background removal failed or timed out");
      }

    } catch (error) {
      console.error("BG Removal Error:", error);
      alert("Background removal failed. Please try a different image.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Manual Touchup Logic ---
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
  }, [isManualMode]);

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
      setResultImage(result);
      addToHistory(result);
    }
  };

  const downloadImage = () => {
    if (!resultImage) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
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
      
      ctx.filter = filterString;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';

      // Apply Sharpness
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

        for (let i = 0; i < pixels.length; i += 4) {
          const x = (i / 4) % sw;
          const y = Math.floor((i / 4) / sw);
          if (x === 0 || x === sw - 1 || y === 0 || y === sh - 1) {
            dst[i] = pixels[i]; dst[i+1] = pixels[i+1]; dst[i+2] = pixels[i+2]; dst[i+3] = pixels[i+3];
            continue;
          }
          const iUp = i - sw * 4; const iDown = i + sw * 4; const iLeft = i - 4; const iRight = i + 4;
          dst[i]     = pixels[i] * b_val - (pixels[iUp] + pixels[iDown] + pixels[iLeft] + pixels[iRight]) * a;
          dst[i + 1] = pixels[i + 1] * b_val - (pixels[iUp + 1] + pixels[iDown + 1] + pixels[iLeft + 1] + pixels[iRight + 1]) * a;
          dst[i + 2] = pixels[i + 2] * b_val - (pixels[iUp + 2] + pixels[iDown + 2] + pixels[iLeft + 2] + pixels[iRight + 2]) * a;
          dst[i + 3] = pixels[i + 3];
        }
        ctx.putImageData(output, 0, 0);
      }
      
      const link = document.createElement('a');
      link.download = `bg-removed-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = resultImage;
  };

  return (
    <ToolLayout
      title="AI Background Remover"
      description="Remove image backgrounds instantly with professional precision using MediaPipe AI."
      toolId="background-remover"
    >
      <div className="max-w-5xl mx-auto p-4 lg:p-8">
        {!imageSrc ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-3xl p-12 bg-surface/50 hover:bg-surface transition-colors cursor-pointer group"
               onClick={() => document.getElementById('file-upload')?.click()}>
            <input type="file" id="file-upload" className="hidden" accept="image/*" onChange={handleFile} />
            <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Upload className="w-10 h-10 text-accent" />
            </div>
            <h3 className="text-xl font-bold mb-2">Upload an Image</h3>
            <p className="text-text-muted text-center max-w-xs">Drag and drop or click to upload. High quality images work best.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Preview Area */}
            <div className="lg:col-span-8 space-y-4">
              <div className="relative bg-bg-secondary rounded-3xl overflow-hidden border border-border min-h-[400px] flex items-center justify-center group">
                {isManualMode ? (
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="max-w-full max-h-[70vh] cursor-crosshair shadow-lg"
                  />
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center p-4">
                    <img 
                      src={resultImage || imageSrc} 
                      alt="Preview" 
                      className="max-w-full max-h-[70vh] object-contain shadow-lg rounded-lg"
                      style={{ 
                        backgroundColor: resultImage && bgColor !== 'transparent' ? (bgColor === 'custom' ? customColor : bgColor) : 'transparent',
                        backgroundImage: !resultImage || bgColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none',
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                      }}
                    />
                    {isProcessing && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center">
                        <Loader2 className="w-12 h-12 animate-spin mb-4 text-accent" />
                        <p className="font-bold text-lg mb-2">{statusText}</p>
                        <p className="text-sm opacity-80">This usually takes a few seconds...</p>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Floating Controls */}
                <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setImageSrc(null); setResultImage(null); }} className="p-2 bg-white/90 hover:bg-white text-red-500 rounded-full shadow-lg transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Status Bar */}
              {resultImage && !isManualMode && (
                <div className="flex items-center justify-between bg-accent/5 border border-accent/20 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-accent">
                    <Check className="w-5 h-5" />
                    <span className="font-bold">Background Removed Perfectly!</span>
                  </div>
                  <button onClick={() => setIsManualMode(true)} className="text-sm font-bold text-accent hover:underline flex items-center gap-1">
                    <Eraser className="w-4 h-4" /> Manual Touchup
                  </button>
                </div>
              )}
            </div>

            {/* Controls Sidebar */}
            <div className="lg:col-span-4 space-y-6">
              {!resultImage ? (
                <div className="bg-surface border border-border rounded-3xl p-6 shadow-sm">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-accent" /> AI Processing
                  </h3>
                  <button 
                    onClick={removeBackground}
                    disabled={isProcessing}
                    className="w-full btn bp py-4 rounded-2xl gap-2 text-lg"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    Remove Background
                  </button>
                  <p className="text-xs text-text-muted mt-4 text-center">
                    Our AI will analyze your image and remove the background with high precision.
                  </p>
                </div>
              ) : (
                <>
                  {/* Manual Mode Controls */}
                  {isManualMode ? (
                    <div className="bg-surface border border-border rounded-3xl p-6 shadow-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <Eraser className="w-5 h-5 text-accent" /> Touchup
                        </h3>
                        <button onClick={() => setIsManualMode(false)} className="p-1 hover:bg-bg-secondary rounded-full">
                          <X className="w-5 h-5" />
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
                        <div className="flex justify-between text-sm font-bold">
                          <span>Brush Size</span>
                          <span className="text-accent">{brushSize}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="5" max="100" 
                          value={brushSize} 
                          onChange={(e) => setBrushSize(parseInt(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={undo} disabled={historyIndex < 0} className="btn bs2 py-3 rounded-xl gap-2 disabled:opacity-50 text-xs">
                          <RefreshCw className="w-4 h-4" /> Undo
                        </button>
                        <button onClick={redo} disabled={historyIndex >= history.length - 1} className="btn bs2 py-3 rounded-xl gap-2 disabled:opacity-50 text-xs">
                          <RefreshCw className="w-4 h-4 rotate-180" /> Redo
                        </button>
                      </div>
                      <button onClick={() => setIsManualMode(false)} className="w-full btn bp py-3 rounded-xl">
                        Done
                      </button>
                    </div>
                  ) : (
                    <div className="bg-surface border border-border rounded-3xl p-6 shadow-sm space-y-6">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <Sliders className="w-5 h-5 text-accent" /> Background
                      </h3>

                      <div className="grid grid-cols-4 gap-2">
                        {['transparent', '#ffffff', '#1e3a8a', '#dc2626', '#bae6fd', '#f3f4f6'].map(color => (
                          <button
                            key={color}
                            onClick={() => setBgColor(color)}
                            className={`w-full aspect-square rounded-xl border-2 transition-all ${bgColor === color ? 'border-accent scale-110 shadow-md' : 'border-transparent hover:border-border'}`}
                            style={{ 
                              backgroundColor: color === 'transparent' ? 'white' : color,
                              backgroundImage: color === 'transparent' ? 'linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%, #eee 100%), linear-gradient(45deg, #eee 25%, white 25%, white 75%, #eee 75%, #eee 100%)' : 'none',
                              backgroundSize: color === 'transparent' ? '10px 10px' : 'auto',
                              backgroundPosition: color === 'transparent' ? '0 0, 5px 5px' : '0 0'
                            }}
                          />
                        ))}
                        <button
                          onClick={() => setBgColor('custom')}
                          className={`w-full aspect-square rounded-xl border-2 flex items-center justify-center bg-gradient-to-br from-red-500 via-green-500 to-blue-500 transition-all ${bgColor === 'custom' ? 'border-accent scale-110 shadow-md' : 'border-transparent hover:border-border'}`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white/50" />
                        </button>
                      </div>

                      {bgColor === 'custom' && (
                        <div className="fg">
                          <label className="fl">Custom Color</label>
                          <div className="flex gap-2">
                            <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="w-12 h-10 rounded-lg cursor-pointer" />
                            <input type="text" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="fi flex-1" />
                          </div>
                        </div>
                      )}

                      <div className="pt-4 border-t border-border space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-lg flex items-center gap-2">
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

                        <button onClick={downloadImage} className="w-full btn bp py-4 rounded-2xl gap-2 text-lg shadow-lg shadow-accent/20">
                          <Download className="w-5 h-5" /> Download Image
                        </button>
                        <button onClick={() => { setImageSrc(null); setResultImage(null); }} className="w-full mt-3 text-sm font-bold text-text-muted hover:text-red-500 transition-colors">
                          Start Over
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Tips Box */}
              <div className="bg-accent/5 border border-accent/20 rounded-3xl p-6">
                <h4 className="font-bold text-accent mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Pro Tips
                </h4>
                <ul className="text-xs text-text-secondary space-y-2 list-disc pl-4">
                  <li>Use well-lit photos for best results.</li>
                  <li>Clear contrast between subject and background helps AI.</li>
                  <li>Use "Manual Touchup" to fix tiny details.</li>
                  <li>Download as PNG to keep transparency.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
