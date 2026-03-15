import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Settings, Image as ImageIcon, Layout, Sliders, Check, Loader2, X, Printer, Crop as CropIcon, ArrowRight, ArrowLeft, Wand2, Eraser, Undo, Redo } from 'lucide-react';
import { removeBackground } from '@imgly/background-removal';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface Preset {
  id: string;
  name: string;
  width: number; // in mm
  height: number; // in mm
}

const PRESETS: Preset[] = [
  { id: 'free', name: 'Free Size', width: 0, height: 0 },
  { id: 'india', name: 'India (35x45 mm)', width: 35, height: 45 },
  { id: 'usa', name: 'USA (2x2 inch)', width: 51, height: 51 },
  { id: 'uk', name: 'UK (35x45 mm)', width: 35, height: 45 },
  { id: 'canada', name: 'Canada (50x70 mm)', width: 50, height: 70 },
  { id: 'australia', name: 'Australia (35x45 mm)', width: 35, height: 45 },
  { id: 'schengen', name: 'Schengen Visa (35x45 mm)', width: 35, height: 45 },
];

const COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Passport Blue', value: '#1e3a8a' },
  { name: 'Light Gray', value: '#f3f4f6' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Transparent', value: 'transparent' }
];

type Step = 'upload' | 'crop' | 'process' | 'print';

export default function PassportPhotoMaker() {
  const [step, setStep] = useState<Step>('upload');
  
  // Image states
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [bgRemovedImageSrc, setBgRemovedImageSrc] = useState<string | null>(null);
  const [finalImageSrc, setFinalImageSrc] = useState<string | null>(null);
  
  // Crop states
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Settings
  const [selectedPreset, setSelectedPreset] = useState<Preset>(PRESETS[1]); // Default to India
  const [bgColor, setBgColor] = useState(COLORS[0].value);
  const [customColor, setCustomColor] = useState('#ffffff');
  const [edgeCleanup, setEdgeCleanup] = useState(180); // Very aggressive default to remove all stray hairs
  const [printLayout, setPrintLayout] = useState<'single' | 'a4' | '4x6'>('single');
  
  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  // Eraser states
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [eraserSize, setEraserSize] = useState(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const eraserCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastPos = useRef<{x: number, y: number} | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const skipCanvasUpdate = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string);
      setStep('crop');
    };
    reader.readAsDataURL(file);
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (selectedPreset.id !== 'free') {
      const aspect = selectedPreset.width / selectedPreset.height;
      const initialCrop = centerCrop(
        makeAspectCrop({ unit: '%', width: 50 }, aspect, width, height),
        width,
        height
      );
      setCrop(initialCrop);
    } else {
      const initialCrop = centerCrop(
        makeAspectCrop({ unit: '%', width: 50 }, 1, width, height),
        width,
        height
      );
      setCrop(initialCrop);
    }
  };

  useEffect(() => {
    if (imgRef.current && selectedPreset.id !== 'free') {
      const { width, height } = imgRef.current;
      const aspect = selectedPreset.width / selectedPreset.height;
      const initialCrop = centerCrop(
        makeAspectCrop({ unit: '%', width: 50 }, aspect, width, height),
        width,
        height
      );
      setCrop(initialCrop);
    }
  }, [selectedPreset]);

  const handleCropComplete = async () => {
    if (!completedCrop || !imgRef.current) return;

    const canvas = document.createElement('canvas');
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
    
    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      imgRef.current,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const croppedDataUrl = canvas.toDataURL('image/png', 1.0);
    setCroppedImageSrc(croppedDataUrl);
    setBgRemovedImageSrc(croppedDataUrl);
    setHistory([croppedDataUrl]);
    setHistoryIndex(0);
    setStep('process');
    setFinalImageSrc(null);
    setIsEraserMode(false);
  };

  const processBackgroundRemoval = async (imgSrc: string) => {
    setIsProcessing(true);
    setProgress(10);
    setStatusText('Removing background (High Quality)...');
    setIsEraserMode(false);

    try {
      // Convert the cropped data URL directly to a Blob
      const res = await fetch(imgSrc);
      const blob = await res.blob();
      
      // High quality background removal
      const bgRemovedBlob = await removeBackground(blob, {
        model: 'isnet_fp16', // Use high quality model for clean edges
        progress: (key, current, total) => {
          if (total > 0) {
            setProgress(10 + Math.round((current / total) * 80));
          }
        }
      });
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(dataUrl);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        
        skipCanvasUpdate.current = false;
        setBgRemovedImageSrc(dataUrl);
        
        setProgress(100);
        setStatusText('Done!');
        setTimeout(() => setIsProcessing(false), 500);
      };
      reader.readAsDataURL(bgRemovedBlob);
      
    } catch (error) {
      console.error('Error removing background:', error);
      setStatusText('Error processing image');
      setIsProcessing(false);
    }
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = eraserCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const pos = getPos(e);
    lastPos.current = pos;
    
    const ctx = eraserCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, eraserSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !lastPos.current) return;
    const pos = getPos(e);
    
    const ctx = eraserCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.lineWidth = eraserSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    lastPos.current = pos;
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPos.current = null;
    if (eraserCanvasRef.current) {
      const dataUrl = eraserCanvasRef.current.toDataURL('image/png', 1.0);
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(dataUrl);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      
      skipCanvasUpdate.current = true;
      setBgRemovedImageSrc(dataUrl);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      skipCanvasUpdate.current = false;
      setBgRemovedImageSrc(history[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      skipCanvasUpdate.current = false;
      setBgRemovedImageSrc(history[newIndex]);
    }
  };

  useEffect(() => {
    if (isEraserMode && eraserCanvasRef.current && bgRemovedImageSrc) {
      if (skipCanvasUpdate.current) {
        skipCanvasUpdate.current = false;
        return;
      }
      const canvas = eraserCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx?.drawImage(img, 0, 0);
      };
      img.src = bgRemovedImageSrc;
    }
  }, [isEraserMode, bgRemovedImageSrc]);

  // Apply background color and defringe
  useEffect(() => {
    if (!bgRemovedImageSrc) {
      setFinalImageSrc(null);
      return;
    }
    
    if (bgRemovedImageSrc === croppedImageSrc) {
      setFinalImageSrc(croppedImageSrc);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 1. Draw the raw background-removed image
      ctx.drawImage(img, 0, 0);
      
      // 2. Defringe and Erode (Remove color halos and smooth edges)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = canvas.width;
      const height = canvas.height;
      
      const originalAlpha = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) {
        originalAlpha[i] = data[i * 4 + 3];
      }

      // Calculate erosion radius based on edgeCleanup slider
      // 0-50: 0px, 51-100: 1px, 101-150: 2px, 151-200: 3px, 201-250: 4px
      const radius = Math.floor(edgeCleanup / 50); 
      const cutoff = edgeCleanup;

      // First pass: Erode the mask
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alphaIdx = y * width + x;
          const idx = alphaIdx * 4;
          let a = originalAlpha[alphaIdx];
          
          if (a > 0) {
            if (a < cutoff) {
              data[idx + 3] = 0;
            } else {
              let erode = false;
              if (radius > 0) {
                const minY = Math.max(0, y - radius);
                const maxY = Math.min(height - 1, y + radius);
                const minX = Math.max(0, x - radius);
                const maxX = Math.min(width - 1, x + radius);
                
                for (let ny = minY; ny <= maxY; ny++) {
                  for (let nx = minX; nx <= maxX; nx++) {
                    if (originalAlpha[ny * width + nx] < cutoff) {
                      erode = true;
                      break;
                    }
                  }
                  if (erode) break;
                }
              }
              
              if (erode) {
                data[idx + 3] = 0;
              } else {
                data[idx + 3] = 255; // Solidify the inside
              }
            }
          }
        }
      }

      // Second pass: Anti-alias the newly eroded hard edges
      const erodedAlpha = new Uint8Array(width * height);
      for (let i = 0; i < width * height; i++) {
        erodedAlpha[i] = data[i * 4 + 3];
      }

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const alphaIdx = y * width + x;
          const idx = alphaIdx * 4;
          
          let sum = 0;
          let hasZero = false;
          let hasFull = false;
          
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const a = erodedAlpha[(y + dy) * width + (x + dx)];
              sum += a;
              if (a === 0) hasZero = true;
              if (a === 255) hasFull = true;
            }
          }
          
          // If it's an edge pixel (mix of 0 and 255 in neighborhood)
          if (hasZero && hasFull) {
            data[idx + 3] = sum / 9;
          }
        }
      }
      
      // 3. Create a temporary canvas with the defringed image
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx?.putImageData(imageData, 0, 0);

      // 4. Clear main canvas and draw background color
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor === 'custom' ? customColor : bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 5. Draw the defringed image over the background
      ctx.drawImage(tempCanvas, 0, 0);

      setFinalImageSrc(canvas.toDataURL('image/png', 1.0));
    };
    img.src = bgRemovedImageSrc;
  }, [bgRemovedImageSrc, bgColor, customColor, edgeCleanup]);

  const handleDownload = () => {
    if (!finalImageSrc) return;

    if (printLayout === 'single') {
      const link = document.createElement('a');
      link.href = finalImageSrc;
      link.download = `passport-photo.png`;
      link.click();
    } else {
      generatePrintLayout();
    }
  };

  const generatePrintLayout = () => {
    if (!finalImageSrc) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpi = 300;
    let sheetWidth, sheetHeight, cols, rows;

    if (printLayout === 'a4') {
      sheetWidth = Math.round((210 / 25.4) * dpi);
      sheetHeight = Math.round((297 / 25.4) * dpi);
    } else { // 4x6
      sheetWidth = Math.round(4 * dpi);
      sheetHeight = Math.round(6 * dpi);
    }

    canvas.width = sheetWidth;
    canvas.height = sheetHeight;

    // White background for sheet
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);

    const img = new Image();
    img.onload = () => {
      // Default to India size if free size is selected for printing
      const targetPreset = selectedPreset.id === 'free' ? PRESETS[1] : selectedPreset;
      
      const photoWidth = Math.round((targetPreset.width / 25.4) * dpi);
      const photoHeight = Math.round((targetPreset.height / 25.4) * dpi);
      
      const margin = Math.round((5 / 25.4) * dpi); // 5mm margin
      
      cols = Math.floor((sheetWidth - margin) / (photoWidth + margin));
      rows = Math.floor((sheetHeight - margin) / (photoHeight + margin));

      const startX = (sheetWidth - (cols * photoWidth + (cols - 1) * margin)) / 2;
      const startY = (sheetHeight - (rows * photoHeight + (rows - 1) * margin)) / 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = startX + c * (photoWidth + margin);
          const y = startY + r * (photoHeight + margin);
          
          // Draw cut lines
          ctx.strokeStyle = '#cccccc';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 1, y - 1, photoWidth + 2, photoHeight + 2);
          
          ctx.drawImage(img, x, y, photoWidth, photoHeight);
        }
      }

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.download = `passport-print-${printLayout}.jpg`;
      link.click();
    };
    img.src = finalImageSrc;
  };

  // Render Print Preview
  const renderPrintPreview = () => {
    if (!finalImageSrc) return null;
    
    if (printLayout === 'single') {
      return (
        <div className="relative shadow-xl rounded-sm overflow-hidden max-h-full max-w-full flex items-center justify-center bg-white p-4">
          <img src={finalImageSrc} alt="Single Print" className="max-h-[60vh] object-contain border border-gray-200" />
        </div>
      );
    }

    // CSS-based preview for multiple copies
    const targetPreset = selectedPreset.id === 'free' ? PRESETS[1] : selectedPreset;
    const isA4 = printLayout === 'a4';
    
    // A4: 210x297mm, 4x6: 101.6x152.4mm
    const sheetWidthMm = isA4 ? 210 : 101.6;
    const sheetHeightMm = isA4 ? 297 : 152.4;
    
    const photoWidthMm = targetPreset.width;
    const photoHeightMm = targetPreset.height;
    const marginMm = 5;
    
    const cols = Math.floor((sheetWidthMm - marginMm) / (photoWidthMm + marginMm));
    const rows = Math.floor((sheetHeightMm - marginMm) / (photoHeightMm + marginMm));
    
    const totalPhotos = cols * rows;
    
    return (
      <div className="w-full h-full flex flex-col items-center justify-center overflow-auto p-4 bg-gray-100">
        <div 
          className="bg-white shadow-xl relative"
          style={{
            width: isA4 ? '420px' : '300px', // Scaled down for preview
            height: isA4 ? '594px' : '450px',
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: '10px',
            alignContent: 'center',
            justifyContent: 'center'
          }}
        >
          {Array.from({ length: totalPhotos }).map((_, i) => (
            <div key={i} className="border border-gray-300 flex items-center justify-center p-1">
              <img src={finalImageSrc} alt={`Copy ${i+1}`} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
        <div className="mt-4 text-sm text-text-muted font-medium">
          Preview: {totalPhotos} copies on {isA4 ? 'A4' : '4x6'} sheet
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] min-h-[600px]">
      {/* Stepper Header */}
      <div className="flex items-center justify-between mb-6 bg-surface p-4 rounded-2xl border border-border">
        <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-accent font-bold' : 'text-text-muted'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'upload' ? 'bg-accent text-white' : 'bg-bg-secondary'}`}>1</div>
          <span className="hidden sm:inline">Upload</span>
        </div>
        <div className="flex-1 h-1 bg-border mx-4 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: step === 'upload' ? '0%' : '100%' }}></div>
        </div>
        <div className={`flex items-center gap-2 ${step === 'crop' ? 'text-accent font-bold' : 'text-text-muted'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'crop' ? 'bg-accent text-white' : step === 'process' || step === 'print' ? 'bg-accent text-white' : 'bg-bg-secondary'}`}>2</div>
          <span className="hidden sm:inline">Crop</span>
        </div>
        <div className="flex-1 h-1 bg-border mx-4 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: step === 'crop' || step === 'upload' ? '0%' : '100%' }}></div>
        </div>
        <div className={`flex items-center gap-2 ${step === 'process' ? 'text-accent font-bold' : 'text-text-muted'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'process' ? 'bg-accent text-white' : step === 'print' ? 'bg-accent text-white' : 'bg-bg-secondary'}`}>3</div>
          <span className="hidden sm:inline">Background</span>
        </div>
        <div className="flex-1 h-1 bg-border mx-4 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: step === 'print' ? '100%' : '0%' }}></div>
        </div>
        <div className={`flex items-center gap-2 ${step === 'print' ? 'text-accent font-bold' : 'text-text-muted'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'print' ? 'bg-accent text-white' : 'bg-bg-secondary'}`}>4</div>
          <span className="hidden sm:inline">Print</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left Panel - Editor/Preview */}
        <div className="flex-1 bg-surface border border-border rounded-2xl overflow-hidden flex flex-col relative">
          <div className="flex-1 bg-bg-secondary relative flex items-center justify-center p-6 overflow-hidden">
            
            {/* STEP 1: UPLOAD */}
            {step === 'upload' && (
              <div 
                className="w-full max-w-md border-2 border-dashed border-border rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mb-4">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2">Upload Photo</h3>
                <p className="text-text-muted text-sm mb-6">
                  Drag & drop or click to upload.<br/>
                  We'll guide you step by step.
                </p>
                <button className="btn btn-primary">Select Image</button>
              </div>
            )}

            {/* STEP 2: CROP */}
            {step === 'crop' && imageSrc && (
              <div className="w-full h-full flex items-center justify-center overflow-auto">
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={selectedPreset.id !== 'free' ? selectedPreset.width / selectedPreset.height : undefined}
                  className="max-h-full"
                >
                  <img 
                    ref={imgRef}
                    src={imageSrc} 
                    alt="Upload" 
                    onLoad={onImageLoad}
                    className="max-h-[60vh] object-contain"
                  />
                </ReactCrop>
              </div>
            )}

            {/* STEP 3: PROCESS */}
            {step === 'process' && (
              <div className="relative w-full h-full flex items-center justify-center">
                <div 
                  className="relative shadow-2xl rounded-sm overflow-hidden" 
                  style={{
                    aspectRatio: selectedPreset.id !== 'free' ? `${selectedPreset.width} / ${selectedPreset.height}` : 'auto',
                    maxHeight: '100%',
                    maxWidth: '100%',
                    backgroundColor: bgColor === 'custom' ? customColor : (bgColor !== 'transparent' ? bgColor : 'transparent'),
                    backgroundImage: bgColor === 'transparent' ? 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 20px 20px' : 'none'
                  }}
                >
                  {isEraserMode ? (
                    <canvas
                      ref={eraserCanvasRef}
                      className="w-full h-full object-contain cursor-crosshair touch-none"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                  ) : finalImageSrc ? (
                    <img src={finalImageSrc} alt="Processed" className="w-full h-full object-contain" />
                  ) : croppedImageSrc ? (
                    <img src={croppedImageSrc} alt="Cropped Preview" className="w-full h-full object-contain" />
                  ) : null}
                </div>

                {isProcessing && (
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center z-10 rounded-2xl text-white">
                    <Loader2 className="w-12 h-12 animate-spin mb-4" />
                    <div className="text-lg font-bold mb-2 drop-shadow-md">{statusText}</div>
                    <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                      <div 
                        className="h-full bg-white transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: PRINT */}
            {step === 'print' && renderPrintPreview()}

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
        </div>

        {/* Right Panel - Controls */}
        <div className="w-full lg:w-80 flex flex-col gap-4">
          <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col h-full">
            
            <div className="p-4 overflow-y-auto flex-1">
              {/* STEP 1 CONTROLS */}
              {step === 'upload' && (
                <div className="flex flex-col items-center justify-center h-full text-center text-text-muted">
                  <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                  <p>Please upload an image to begin.</p>
                </div>
              )}

              {/* STEP 2 CONTROLS */}
              {step === 'crop' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-text-muted uppercase tracking-wider">Select Size</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => setSelectedPreset(preset)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedPreset.id === preset.id 
                            ? 'border-accent bg-accent/5 ring-1 ring-accent' 
                            : 'border-border hover:border-accent/50'
                        }`}
                      >
                        <div className="font-medium text-sm">{preset.name}</div>
                        {preset.id !== 'free' && (
                          <div className="text-xs text-text-muted">{preset.width} × {preset.height} mm</div>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="p-3 bg-accent/5 text-accent text-sm rounded-xl">
                    Adjust the crop box on the image to frame your photo correctly.
                  </div>
                </div>
              )}
              {/* STEP 3 CONTROLS */}
              {step === 'process' && (
                <div className="space-y-6">
                  {/* Background Removal Actions */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-sm text-text-muted uppercase tracking-wider">Background Tools</h3>
                      <div className="flex gap-1">
                        <button 
                          onClick={handleUndo} 
                          disabled={historyIndex <= 0 || isProcessing}
                          className="p-1.5 rounded-md hover:bg-accent/10 disabled:opacity-30 transition-colors"
                          title="Undo"
                        >
                          <Undo className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={handleRedo} 
                          disabled={historyIndex >= history.length - 1 || isProcessing}
                          className="p-1.5 rounded-md hover:bg-accent/10 disabled:opacity-30 transition-colors"
                          title="Redo"
                        >
                          <Redo className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setIsEraserMode(false);
                          processBackgroundRemoval(croppedImageSrc!);
                        }}
                        disabled={isProcessing}
                        className="p-3 rounded-xl border border-border hover:border-accent/50 flex flex-col items-center justify-center gap-2 transition-all"
                      >
                        <Wand2 className="w-5 h-5 text-accent" />
                        <span className="text-xs font-medium text-center">Auto Remove</span>
                      </button>
                      <button
                        onClick={() => setIsEraserMode(!isEraserMode)}
                        disabled={isProcessing}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                          isEraserMode ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:border-accent/50'
                        }`}
                      >
                        <Eraser className={`w-5 h-5 ${isEraserMode ? 'text-accent' : 'text-text-muted'}`} />
                        <span className="text-xs font-medium text-center">Manual Eraser</span>
                      </button>
                    </div>

                    {isEraserMode && (
                      <div className="pt-2">
                        <div className="flex justify-between mb-2">
                          <label className="text-xs font-medium text-text-muted">Eraser Size</label>
                          <span className="text-xs text-text-muted">{eraserSize}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="5" 
                          max="100" 
                          value={eraserSize}
                          onChange={(e) => setEraserSize(parseInt(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="font-bold text-sm text-text-muted uppercase tracking-wider">Background Color</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {COLORS.map(color => (
                        <button
                          key={color.name}
                          onClick={() => setBgColor(color.value)}
                          disabled={isProcessing}
                          className={`p-3 rounded-xl border flex items-center gap-2 transition-all ${
                            bgColor === color.value 
                              ? 'border-accent bg-accent/5 ring-1 ring-accent' 
                              : 'border-border hover:border-accent/50'
                          } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div 
                            className="w-6 h-6 rounded-full border border-border shadow-sm" 
                            style={{ 
                              background: color.value === 'transparent' 
                                ? 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 10px 10px' 
                                : color.value 
                            }} 
                          />
                          <span className="text-sm font-medium">{color.name}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => setBgColor('custom')}
                        disabled={isProcessing}
                        className={`p-3 rounded-xl border flex items-center gap-2 transition-all ${
                          bgColor === 'custom' 
                            ? 'border-accent bg-accent/5 ring-1 ring-accent' 
                            : 'border-border hover:border-accent/50'
                        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div 
                          className="w-6 h-6 rounded-full border border-border shadow-sm overflow-hidden relative"
                        >
                          <input 
                            type="color" 
                            value={customColor}
                            onChange={(e) => {
                              setCustomColor(e.target.value);
                              setBgColor('custom');
                            }}
                            className="absolute inset-[-10px] w-[200%] h-[200%] cursor-pointer"
                          />
                        </div>
                        <span className="text-sm font-medium">Custom</span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-border">
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-medium text-text-muted uppercase tracking-wider">Edge Cleanup</label>
                      <span className="text-xs text-text-muted">{Math.round((edgeCleanup / 255) * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="250" 
                      value={edgeCleanup}
                      onChange={(e) => setEdgeCleanup(parseInt(e.target.value))}
                      className="w-full accent-accent"
                    />
                    <p className="text-xs text-text-muted mt-2">
                      Increase to remove stray hairs and color halos. Decrease if the edges look too sharp.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 4 CONTROLS */}
              {step === 'print' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-text-muted uppercase tracking-wider">Print Layout</h3>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => setPrintLayout('single')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        printLayout === 'single' 
                          ? 'border-accent bg-accent/5 ring-1 ring-accent' 
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <div className="font-medium text-sm">Single Photo</div>
                      <div className="text-xs text-text-muted">Download just the photo</div>
                    </button>
                    <button
                      onClick={() => setPrintLayout('4x6')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        printLayout === '4x6' 
                          ? 'border-accent bg-accent/5 ring-1 ring-accent' 
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <div className="font-medium text-sm">4x6 inch Sheet</div>
                      <div className="text-xs text-text-muted">Standard photo print size</div>
                    </button>
                    <button
                      onClick={() => setPrintLayout('a4')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        printLayout === 'a4' 
                          ? 'border-accent bg-accent/5 ring-1 ring-accent' 
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <div className="font-medium text-sm">A4 Sheet</div>
                      <div className="text-xs text-text-muted">Standard printer paper</div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="p-4 border-t border-border bg-bg-secondary/50 flex gap-2">
              {step === 'crop' && (
                <>
                  <button 
                    onClick={() => setStep('upload')}
                    className="flex-1 btn bg-white border border-border text-text-primary hover:bg-bg-secondary"
                  >
                    Back
                  </button>
                  <button 
                    onClick={handleCropComplete}
                    disabled={!completedCrop?.width || !completedCrop?.height}
                    className="flex-1 btn btn-primary flex items-center justify-center gap-2"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
              
              {step === 'process' && (
                <>
                  <button 
                    onClick={() => setStep('crop')}
                    disabled={isProcessing}
                    className="flex-1 btn bg-white border border-border text-text-primary hover:bg-bg-secondary"
                  >
                    Back
                  </button>
                  <button 
                    onClick={() => setStep('print')}
                    disabled={isProcessing}
                    className="flex-1 btn btn-primary flex items-center justify-center gap-2"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {step === 'print' && (
                <>
                  <button 
                    onClick={() => setStep('process')}
                    className="flex-1 btn bg-white border border-border text-text-primary hover:bg-bg-secondary"
                  >
                    Back
                  </button>
                  <button 
                    onClick={handleDownload}
                    className="flex-1 btn btn-primary flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

