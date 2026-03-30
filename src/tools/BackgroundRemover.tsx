import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Loader2, X, Wand2, Image as ImageIcon, Check, Trash2, Eraser, Paintbrush, Sliders, Sparkles, RefreshCw, Undo, Redo } from 'lucide-react';
import ToolLayout from '../components/tool-system/ToolLayout';
import { hybridRemoveBackground } from '../lib/bgRemoval';

export default function BackgroundRemover() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      setTimer(0);
      setProcessingError(null);
      interval = setInterval(() => {
        setTimer((prev) => Number((prev + 0.1).toFixed(1)));
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);
  const [bgColor, setBgColor] = useState('transparent');
  const [customColor, setCustomColor] = useState('#ffffff');
  
  // Manual Touchup State
  const [isManualMode, setIsManualMode] = useState(false);
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(25);
  const [zoom, setZoom] = useState(1.0);
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

  const removeBackground = async () => {
    if (!imageSrc) return;
    setIsProcessing(true);
    setProcessingError(null);
    setTimer(0);
    setStatusText('Initializing AI...');
    
    const startTime = Date.now();
    
    try {
      const rawBlob = await hybridRemoveBackground(imageSrc, 'hd', (status) => {
        setStatusText(status);
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
      acceptedFileTypes={['image/*']}
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
              
              const img = new Image();
              img.onload = () => { originalImgRef.current = img; };
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
                  {!resultImage ? (
                    <div className="space-y-4">
                      <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                        <Wand2 className="w-5 h-5 text-accent" /> AI Processing
                      </h3>
                      
                      <button 
                        onClick={removeBackground}
                        disabled={isProcessing}
                        className="w-full btn bp py-4 rounded-2xl gap-2 text-lg shadow-lg shadow-accent/20"
                      >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                        {processingError ? 'Try Again' : 'Remove Background'}
                      </button>
                      {processingError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-medium animate-in fade-in slide-in-from-top-2">
                          <p className="font-bold mb-1">Processing Error</p>
                          <p>{processingError}</p>
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
                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
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

                          <div className="space-y-3">
                            <div className="flex justify-between text-sm font-bold text-text-primary">
                              <span>Zoom</span>
                              <span className="text-accent">{Math.round(zoom * 100)}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="0.5" max="3" step="0.1"
                              value={zoom} 
                              onChange={(e) => setZoom(parseFloat(e.target.value))}
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
                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
                          <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                            <ImageIcon className="w-5 h-5 text-accent" /> Background
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
                      <li>Download as PNG to keep transparency.</li>
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
                  resultImage && (
                    <div className="flex flex-col gap-2">
                      <button onClick={downloadImage} className="w-full btn bp py-3 rounded-xl gap-2 font-bold shadow-lg shadow-accent/20">
                        <Download className="w-5 h-5" /> Download Image
                      </button>
                      <button onClick={onReset} className="w-full text-xs font-bold text-text-muted hover:text-red-500 transition-colors py-2">
                        Start Over
                      </button>
                    </div>
                  )
                )}
              </div>
            </aside>

            {/* --- MAIN PREVIEW --- */}
            <main className="tool-main-preview">
              <div className="preview-content-wrapper">
                <div 
                  className="relative w-full h-full bg-bg-secondary rounded-3xl overflow-hidden border border-border flex items-center justify-center group shadow-inner"
                  style={{ zoom: zoom }}
                >
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
                      className="max-w-full max-h-full object-contain cursor-crosshair shadow-2xl"
                    />
                  ) : (
                    <>
                      <img 
                        src={resultImage || imageSrc} 
                        alt="Preview" 
                        className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                        style={{ 
                          backgroundColor: resultImage && bgColor !== 'transparent' ? (bgColor === 'custom' ? customColor : bgColor) : 'transparent',
                          backgroundImage: !resultImage || bgColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none',
                          backgroundSize: '20px 20px',
                          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                        }}
                      />
                      
                      {isProcessing && (
                        <div className="preview-loading-overlay backdrop-blur-md bg-black/40">
                          <div className="flex flex-col items-center text-center max-w-xs w-full px-6">
                            <div className="relative mb-8">
                              <div className="w-24 h-24 rounded-full border-4 border-white/10 border-t-accent animate-spin" />
                              <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-white text-xl">
                                {timer.toFixed(1)}s
                              </div>
                            </div>
                            
                            <div className="w-full h-1.5 bg-white/10 rounded-full mb-4 overflow-hidden">
                              <div 
                                className="h-full bg-accent transition-all duration-500 ease-out"
                                style={{ 
                                  width: statusText.includes('Analyzing') ? '20%' : 
                                         statusText.includes('Extracting') ? '50%' : 
                                         statusText.includes('Refining') ? '80%' : 
                                         statusText.includes('Finalizing') ? '95%' : '10%'
                                }}
                              />
                            </div>

                            <p className="font-bold text-2xl mb-2 text-white tracking-tight">{statusText}</p>
                            <p className="text-sm text-white/60 font-medium">ISNet FP16 Optimized Engine</p>
                          </div>
                        </div>
                      )}
                    </>
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
