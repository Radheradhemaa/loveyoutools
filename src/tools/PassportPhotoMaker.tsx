import React, { useState, useRef, useEffect } from 'react';
import { Download, Layout, Sliders, Loader2, X, Scissors, Wand2, ArrowRight, Image as ImageIcon, Crop, Sparkles, Printer, Check, ZoomIn, ZoomOut, Maximize2, Undo, Redo } from 'lucide-react';
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import ToolLayout from '../components/tool-system/ToolLayout';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

// --- Global AI Cache for Instant Background Removal ---
let imageSegmenter: ImageSegmenter | null = null;
let selfieSegmentation: SelfieSegmentation | null = null;
let aiInitPromise: Promise<any> | null = null;

const initAI = async (onProgress?: (text: string) => void) => {
  if (imageSegmenter) return { type: 'modern', model: imageSegmenter };
  if (selfieSegmentation) return { type: 'legacy', model: selfieSegmentation };
  
  // If already initializing, wait for it
  if (aiInitPromise) {
    const result = await aiInitPromise;
    if (result) return result;
    // If it resolved to null, we try again
  }
  
  aiInitPromise = (async () => {
    // Try Modern ImageSegmenter first
    try {
      if (onProgress) onProgress('Loading AI Engine (Modern)...');
      
      const vision = await Promise.race([
        FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm"
        ),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("WASM timeout")), 10000))
      ]);
      
      // Try GPU first, then CPU
      const delegates: ("GPU" | "CPU")[] = ["GPU", "CPU"];
      for (const delegate of delegates) {
        try {
          if (onProgress) onProgress(`Initializing AI (${delegate})...`);
          imageSegmenter = await Promise.race([
            ImageSegmenter.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`,
                delegate: delegate
              },
              runningMode: "IMAGE",
              outputCategoryMask: false,
              outputConfidenceMasks: true,
            }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Init ${delegate} timeout`)), 15000))
          ]);
          
          if (imageSegmenter) {
            console.log(`Modern ImageSegmenter Initialized with ${delegate}`);
            const res = { type: 'modern', model: imageSegmenter };
            return res;
          }
        } catch (e) {
          console.warn(`Modern ImageSegmenter ${delegate} failed:`, e);
        }
      }
    } catch (error) {
      console.warn("Modern ImageSegmenter setup failed:", error);
    }

    // Fallback to Legacy SelfieSegmentation
    const cdns = [
      `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747`,
      `https://www.gstatic.com/mediapipe/solutions/selfie_segmentation`
    ];

    for (const base of cdns) {
      try {
        if (onProgress) onProgress(`Loading AI Engine (Legacy)...`);
        const instance = new SelfieSegmentation({
          locateFile: (file) => `${base}/${file}`
        });
        
        instance.setOptions({ modelSelection: 0 });

        await Promise.race([
          instance.initialize(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Legacy Init timeout")), 15000))
        ]);

        selfieSegmentation = instance;
        console.log(`Legacy AI Initialized from ${base}`);
        const res = { type: 'legacy', model: selfieSegmentation };
        return res;
      } catch (error) {
        console.warn(`Legacy AI failed from ${base}:`, error);
      }
    }

    aiInitPromise = null; // Clear promise on total failure so we can retry
    return null;
  })();
  
  const finalResult = await aiInitPromise;
  if (!finalResult) aiInitPromise = null; // Ensure we don't cache a null result
  return finalResult;
};

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
  { name: 'Light Blue', value: '#bae6fd' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Gray', value: '#f3f4f6' },
  { name: 'Transparent', value: 'transparent' }
];

type Step = 'crop' | 'edit' | 'print';

export default function PassportPhotoMaker() {
  const [step, setStep] = useState<Step>('crop');
  
  // Preload AI model on mount for instant results later
  useEffect(() => {
    initAI();
  }, []);
  
  // Image States
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [bgRemovedImageSrc, setBgRemovedImageSrc] = useState<string | null>(null);
  const [finalImageSrc, setFinalImageSrc] = useState<string | null>(null);
  
  // Crop States
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024 ? 1 : 1);
  
  // Settings States
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[1]); // Default 35x45
  const [bgColor, setBgColor] = useState(COLORS[0].value);
  const [customColor, setCustomColor] = useState('#ffffff');
  
  // Adjustments
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [sharpness, setSharpness] = useState(0);
  const [smoothness, setSmoothness] = useState(0);
  const [isUltraHD, setIsUltraHD] = useState(false);
  
  // Debounced Adjustments for Performance
  const [appliedAdjustments, setAppliedAdjustments] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sharpness: 0,
    smoothness: 0,
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
        isUltraHD
      });
    }, 150); // 150ms debounce
    return () => clearTimeout(timer);
  }, [brightness, contrast, saturation, sharpness, smoothness, isUltraHD]);
  
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

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setBgRemovedImageSrc(history[prevIndex]);
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      setBgRemovedImageSrc(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setBgRemovedImageSrc(history[nextIndex]);
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
        ctx.drawImage(currentImg, 0, 0);
      };
      initCanvas();
      return () => { isMounted = false; };
    }
  }, [isManualMode, step]); // Intentionally not depending on bgRemovedImageSrc

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
    setIsDrawing(true);
    lastPosRef.current = getCoordinates(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !lastPosRef.current || !touchupCanvasRef.current) return;
    
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
    }
  }, [selectedPreset]);

  // --- 2. Handle Crop Completion ---
  const handleCropComplete = () => {
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
    setBgRemovedImageSrc(null); // Reset BG removal if recropped
    setHistory([]);
    setHistoryIndex(-1);
    setStep('edit');
    setZoom(1); // Reset zoom for next step
  };

  // --- 3. Background Removal ---
  const removeBackground = async () => {
    if (!croppedImageSrc) return;
    setIsProcessing(true);
    setIsManualMode(false);
    setStatusText('Preparing AI...');
    
    try {
      const aiResult = await initAI((text) => setStatusText(text));
      if (!aiResult) {
        throw new Error("AI Engine failed to initialize. Please check your internet connection and try again.");
      }
      
      const { type, model } = aiResult;
      setStatusText('Analyzing Image...');
      await new Promise(r => setTimeout(r, 100));
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image for processing."));
        img.src = croppedImageSrc;
      });

      // Original dimensions
      const origWidth = img.width;
      const origHeight = img.height;

      // Downscale for AI processing
      let aiWidth = origWidth;
      let aiHeight = origHeight;
      const MAX_AI_DIM = 768; // Balanced resolution for speed and accuracy
      if (aiWidth > MAX_AI_DIM || aiHeight > MAX_AI_DIM) {
        const ratio = Math.min(MAX_AI_DIM / aiWidth, MAX_AI_DIM / aiHeight);
        aiWidth = Math.round(aiWidth * ratio);
        aiHeight = Math.round(aiHeight * ratio);
      }

      const aiCanvas = document.createElement('canvas');
      aiCanvas.width = aiWidth;
      aiCanvas.height = aiHeight;
      const aiCtx = aiCanvas.getContext('2d');
      if (!aiCtx) throw new Error("Canvas context failed");
      aiCtx.drawImage(img, 0, 0, aiWidth, aiHeight);
      
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = aiWidth;
      maskCanvas.height = aiHeight;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) throw new Error("Mask context failed");

      if (type === 'modern') {
        const segmenter = model as ImageSegmenter;
        const result = segmenter.segment(aiCanvas);
        const confidenceMasks = result.confidenceMasks;
        if (!confidenceMasks || confidenceMasks.length === 0) throw new Error("Segmentation failed");
        
        const mask = confidenceMasks[0];
        const maskData = mask.getAsFloat32Array();
        const maskImageData = maskCtx.createImageData(aiWidth, aiHeight);
        for (let i = 0; i < maskData.length; i++) {
          const val = Math.round(maskData[i] * 255);
          maskImageData.data[i * 4] = 255;
          maskImageData.data[i * 4 + 1] = 255;
          maskImageData.data[i * 4 + 2] = 255;
          maskImageData.data[i * 4 + 3] = val;
        }
        maskCtx.putImageData(maskImageData, 0, 0);
      } else {
        const legacyModel = model as SelfieSegmentation;
        await new Promise<void>((resolve, reject) => {
          let isResolved = false;
          const timeout = setTimeout(() => {
            if (isResolved) return;
            isResolved = true;
            reject(new Error("AI processing timed out."));
          }, 30000);

          legacyModel.onResults((results) => {
            if (isResolved) return;
            isResolved = true;
            if (timeout) clearTimeout(timeout);
            if (!results || !results.segmentationMask) return reject(new Error("No mask"));
            maskCtx.drawImage(results.segmentationMask, 0, 0, aiWidth, aiHeight);
            resolve();
          });
          legacyModel.send({ image: aiCanvas }).catch(reject);
        });
      }

      // Refine the mask (Neat and Clean)
      const imageData = maskCtx.getImageData(0, 0, aiWidth, aiHeight);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        // Smoother thresholding for cleaner edges
        if (alpha > 200) data[i + 3] = 255;
        else if (alpha < 50) data[i + 3] = 0;
        else {
          // Linear interpolation for soft edges
          data[i + 3] = Math.round((alpha - 50) * (255 / 150));
        }
      }
      maskCtx.putImageData(imageData, 0, 0);

      // Apply a slight blur to the mask for "neat" edges
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = aiWidth;
      blurCanvas.height = aiHeight;
      const blurCtx = blurCanvas.getContext('2d');
      if (blurCtx) {
        blurCtx.filter = 'blur(1.5px)'; // Slightly more blur for smoother transition
        blurCtx.drawImage(maskCanvas, 0, 0);
        maskCtx.clearRect(0, 0, aiWidth, aiHeight);
        maskCtx.drawImage(blurCanvas, 0, 0);
      }

      // Create Final High-Res Result
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = origWidth;
      finalCanvas.height = origHeight;
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) throw new Error("Final context failed");
      
      finalCtx.drawImage(img, 0, 0, origWidth, origHeight);
      finalCtx.globalCompositeOperation = 'destination-in';
      finalCtx.imageSmoothingEnabled = true;
      finalCtx.imageSmoothingQuality = 'high';
      finalCtx.drawImage(maskCanvas, 0, 0, origWidth, origHeight);
      finalCtx.globalCompositeOperation = 'source-over';
      
      const result = finalCanvas.toDataURL('image/png', 1.0);
      setBgRemovedImageSrc(result);
      addToHistory(result);
    } catch (error) {
      console.error("BG Removal Error:", error);
      alert(error instanceof Error ? error.message : "Failed to remove background.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- 4. Apply Adjustments & Background Color ---
  useEffect(() => {
    const sourceImage = bgRemovedImageSrc || croppedImageSrc;
    if (!sourceImage) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
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
        // Increased blur range for better visibility (max 5px)
        filterString += ` blur(${appliedAdjustments.smoothness / 20}px)`;
      }
      
      ctx.filter = filterString;
      
      // Draw Image
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none'; // Reset

      // Apply Sharpness (Highly Optimized Convolution)
      const finalSharpness = appliedAdjustments.isUltraHD ? (appliedAdjustments.sharpness + 40) : appliedAdjustments.sharpness;
      if (finalSharpness > 0) {
        const amount = finalSharpness / 60; // More aggressive sharpening
        const a = amount;
        const b_val = 1 + 4 * a;
        
        const sw = canvas.width;
        const sh = canvas.height;
        const imageData = ctx.getImageData(0, 0, sw, sh);
        const pixels = imageData.data;
        const output = ctx.createImageData(sw, sh);
        const dst = output.data;

        // Highly optimized convolution loop (unrolled 3x3)
        for (let y = 0; y < sh; y++) {
          const yOff = y * sw;
          const yUpOff = Math.max(0, y - 1) * sw;
          const yDownOff = Math.min(sh - 1, y + 1) * sw;
          
          for (let x = 0; x < sw; x++) {
            const i = (yOff + x) * 4;
            const xLeft = Math.max(0, x - 1);
            const xRight = Math.min(sw - 1, x + 1);
            
            const iUp = (yUpOff + x) * 4;
            const iDown = (yDownOff + x) * 4;
            const iLeft = (yOff + xLeft) * 4;
            const iRight = (yOff + xRight) * 4;

            // Apply kernel: [0, -a, 0], [-a, 1+4a, -a], [0, -a, 0]
            dst[i]     = pixels[i] * b_val - (pixels[iUp] + pixels[iDown] + pixels[iLeft] + pixels[iRight]) * a;
            dst[i + 1] = pixels[i + 1] * b_val - (pixels[iUp + 1] + pixels[iDown + 1] + pixels[iLeft + 1] + pixels[iRight + 1]) * a;
            dst[i + 2] = pixels[i + 2] * b_val - (pixels[iUp + 2] + pixels[iDown + 2] + pixels[iLeft + 2] + pixels[iRight + 2]) * a;
            dst[i + 3] = pixels[i + 3];
          }
        }
        ctx.putImageData(output, 0, 0);
      }

      // Add Border if requested
      if (hasBorder) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(2, Math.round(canvas.width / 200));
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }

      setFinalImageSrc(canvas.toDataURL('image/png', 1.0));
    };
    img.src = sourceImage;
  }, [croppedImageSrc, bgRemovedImageSrc, bgColor, customColor, appliedAdjustments, hasBorder]);

  // --- 5. Generate Print Layout ---
  const handleDownload = () => {
    if (!finalImageSrc) return;
    
    if (paperSize.id === 'single') {
      const link = document.createElement('a');
      link.href = finalImageSrc;
      link.download = `passport-photo-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Generate A4/Grid
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpi = 300;
    const sheetWidthMm = paperSize.id === 'custom' ? customPaper.width : paperSize.width;
    const sheetHeightMm = paperSize.id === 'custom' ? customPaper.height : paperSize.height;
    
    const sheetWidth = Math.round((sheetWidthMm / 25.4) * dpi);
    const sheetHeight = Math.round((sheetHeightMm / 25.4) * dpi);
    
    canvas.width = sheetWidth;
    canvas.height = sheetHeight;
    
    // Fill white background for paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);
    
    const img = new Image();
    img.onload = () => {
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
          
          ctx.drawImage(img, x, y, photoWidth, photoHeight);
          
          if (hasCutLines) {
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
            ctx.setLineDash([Math.round(dpi/10), Math.round(dpi/10)]);
            ctx.strokeRect(x - margin/2, y - margin/2, photoWidth + margin, photoHeight + margin);
            ctx.setLineDash([]);
          }
        }
      }
      
      canvas.toBlob((blob) => {
        if (!blob) {
          alert("Failed to generate download. Please try again.");
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `passport-print-${paperSize.name.replace(/\s+/g, '-')}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/jpeg', 1.0);
    };
    img.src = finalImageSrc;
  };

  // --- Render Helpers ---
  const renderPrintPreview = () => {
    if (!finalImageSrc) return null;
    if (paperSize.id === 'single') {
      return (
        <div className="w-full h-full flex items-center justify-center p-4">
          <img 
            src={finalImageSrc} 
            alt="Single Print" 
            className="max-h-full max-w-full object-contain shadow-2xl border border-gray-200" 
            style={{ imageRendering: 'high-quality' }}
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
      <div className="w-full h-full flex flex-col items-center justify-center overflow-auto p-4 bg-gray-100">
        <div 
          className="bg-white shadow-2xl relative transition-all duration-300 mx-auto" 
          style={{ 
            width: '500px', // Fixed base width for preview, parent handles scaling
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
      description="Create professional passport, visa, and ID photos instantly. Step-by-step process with AI background removal, custom sizes, and A4 print layouts."
      toolId="passport-photo-maker"
      acceptedFileTypes={['image/jpeg', 'image/png', 'image/webp']}
      onDownload={handleDownload}
    >
      {({ file, onComplete, onReset }) => {
        
        // Handle initial file load
        useEffect(() => {
          if (file && !imageSrc) {
            const reader = new FileReader();
            reader.onload = (e) => {
              setImageSrc(e.target?.result as string);
              setStep('crop');
            };
            reader.readAsDataURL(file as File);
          } else if (!file) {
            // Reset everything
            setImageSrc(null);
            setCroppedImageSrc(null);
            setBgRemovedImageSrc(null);
            setHistory([]);
            setHistoryIndex(-1);
            setFinalImageSrc(null);
            setStep('crop');
          }
        }, [file]);

        return (
          <div className="flex flex-col lg:flex-row w-full h-[calc(100vh-80px)] bg-gray-50 overflow-hidden">
            
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
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Wand2 className="w-4 h-4" /> Background
                      </h3>
                      
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

                      <div className="flex gap-2 mb-4">
                        <button
                          onClick={undo}
                          disabled={historyIndex < 0}
                          className="flex-1 py-2 px-2 bg-gray-100 text-gray-700 rounded-lg text-[10px] font-bold hover:bg-gray-200 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                          title="Undo last action"
                        >
                          <Undo className="w-3 h-3" /> Undo
                        </button>
                        <button
                          onClick={redo}
                          disabled={historyIndex >= history.length - 1}
                          className="flex-1 py-2 px-2 bg-gray-100 text-gray-700 rounded-lg text-[10px] font-bold hover:bg-gray-200 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                          title="Redo last action"
                        >
                          <Redo className="w-3 h-3" /> Redo
                        </button>
                      </div>

                      {isManualMode && (
                        <div className="p-3 bg-gray-50 rounded-xl mb-4 space-y-3 border border-gray-200 animate-in fade-in slide-in-from-top-2">
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
                        <button onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); setSharpness(0); setSmoothness(0); setIsUltraHD(false); }} className="text-[10px] text-[#e8501a] font-bold hover:underline">Reset</button>
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
                          { label: 'Smoothness', val: smoothness, set: setSmoothness, min: 0, max: 100, unit: '' }
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
            <main className="flex-[2] relative bg-[#e5e7eb] flex flex-col h-auto lg:h-full min-h-[300px] overflow-hidden">
              
              {/* Toolbar (Zoom) - Moved above the image */}
              <div className="w-full pt-4 pb-2 flex justify-center items-center shrink-0 z-20 relative">
                <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200">
                  <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 hover:bg-gray-100 rounded-full text-gray-600"><ZoomOut className="w-4 h-4" /></button>
                  <span className="text-xs font-bold w-12 text-center text-gray-700">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1 hover:bg-gray-100 rounded-full text-gray-600"><ZoomIn className="w-4 h-4" /></button>
                  <div className="w-px h-4 bg-gray-300 mx-1" />
                  <button onClick={() => setZoom(1)} className="p-1 hover:bg-gray-100 rounded-full text-gray-600" title="Reset Zoom"><Maximize2 className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Preview Container */}
              <div className="flex-1 w-full overflow-auto flex items-center justify-center p-4 pb-8">
                <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 0.2s ease-out' }} className="flex items-center justify-center">
                  
                  {step === 'crop' && imageSrc && (
                    <ReactCrop
                      crop={crop}
                      onChange={(_, percentCrop) => setCrop(percentCrop)}
                      onComplete={(c) => setCompletedCrop(c)}
                      aspect={selectedPreset.id !== 'free' ? selectedPreset.width / selectedPreset.height : undefined}
                      className="shadow-2xl rounded-sm bg-white border border-gray-300"
                    >
                      <img 
                        ref={imgRef}
                        src={imageSrc} 
                        alt="Upload" 
                        onLoad={onImageLoad}
                        style={{ maxHeight: '70vh', maxWidth: '100%', objectFit: 'contain', display: 'block' }}
                      />
                    </ReactCrop>
                  )}

                  {step === 'edit' && (
                    <div 
                      className="relative shadow-2xl rounded-sm overflow-hidden bg-white"
                      style={{
                        aspectRatio: selectedPreset.id !== 'free' ? `${selectedPreset.width} / ${selectedPreset.height}` : (completedCrop ? `${completedCrop.width} / ${completedCrop.height}` : 'auto'),
                        maxHeight: '70vh',
                        maxWidth: '100%'
                      }}
                    >
                      {isManualMode ? (
                        <div 
                          className="w-full h-full"
                          style={{
                            background: bgColor === 'transparent' ? 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 8px 8px' : (bgColor === 'custom' ? customColor : bgColor)
                          }}
                        >
                          <canvas
                            ref={touchupCanvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            className="w-full h-full object-contain block cursor-crosshair touch-none"
                            style={{
                              filter: `brightness(${brightness}%) contrast(${contrast + (isUltraHD ? 15 : 0)}%) saturate(${saturation + (isUltraHD ? 20 : 0)}%) ${smoothness > 0 ? `blur(${smoothness / 20}px)` : ''}`
                            }}
                          />
                        </div>
                      ) : (
                        finalImageSrc && <img src={finalImageSrc} alt="Processed" className="w-full h-full object-contain block" />
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
