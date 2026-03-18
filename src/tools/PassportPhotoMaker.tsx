import React, { useState, useRef, useEffect } from 'react';
import { Download, Layout, Sliders, Loader2, X, Scissors, Wand2, Eraser, Undo, Redo, ScanFace, ZoomIn, ZoomOut, Sparkles, ArrowRight, Image as ImageIcon } from 'lucide-react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { FaceDetector, ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';
import ToolLayout from '../components/tool-system/ToolLayout';

interface Preset {
  id: string;
  name: string;
  width: number; // in mm
  height: number; // in mm
}

// Global AI instances for fast reuse
let vision: any = null;
let faceDetector: any = null;
let segmenter: any = null;
let isInitializing = false;

const isWebGLSupported = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
};

const initAI = async (onStatus?: (s: string) => void) => {
  if (vision && faceDetector && segmenter) return;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (vision && faceDetector && segmenter) return;
  }
  
  isInitializing = true;
  
  const loadAI = async (delegate: "GPU" | "CPU" = "GPU") => {
    onStatus?.('Downloading AI engine...');
    if (!vision) {
      vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
    }
    
    onStatus?.(`Initializing ${delegate} models...`);
    
    const [fd, seg] = await Promise.all([
      FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          delegate: delegate
        },
        runningMode: "IMAGE"
      }),
      ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
          delegate: delegate
        },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: true
      })
    ]);
    
    faceDetector = fd;
    segmenter = seg;
  };

  try {
    if (!isWebGLSupported()) {
      await loadAI("CPU");
    } else {
      await Promise.race([
        loadAI("GPU"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("AI Init Timeout")), 15000))
      ]);
    }
  } catch (e) {
    console.warn("GPU AI Init failed or timed out, falling back to CPU:", e);
    try {
      await loadAI("CPU");
    } catch (err) {
      console.error("AI Initialization failed completely:", err);
      vision = null;
      faceDetector = null;
      segmenter = null;
      throw err;
    }
  } finally {
    isInitializing = false;
  }
};

const PAPER_SIZES = [
  { id: 'single', name: 'Single Photo', width: 0, height: 0 },
  { id: 'a4', name: 'A4 (210 x 297 mm)', width: 210, height: 297 },
  { id: 'a5', name: 'A5 (148 x 210 mm)', width: 148, height: 210 },
  { id: 'letter', name: 'US Letter (8.5 x 11 in)', width: 215.9, height: 279.4 },
  { id: 'legal', name: 'US Legal (8.5 x 14 in)', width: 215.9, height: 355.6 },
  { id: '4x6', name: '4 x 6 in', width: 101.6, height: 152.4 },
  { id: '5x7', name: '5 x 7 in', width: 127, height: 177.8 },
  { id: 'custom', name: 'Custom Size', width: 0, height: 0 },
];

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
  const [autoRemovedImageSrc, setAutoRemovedImageSrc] = useState<string | null>(null);
  const [finalImageSrc, setFinalImageSrc] = useState<string | null>(null);
  
  // Crop states
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Settings
  const [selectedPreset, setSelectedPreset] = useState<Preset>(PRESETS[1]);
  const [bgColor, setBgColor] = useState(COLORS[0].value);
  const [customColor, setCustomColor] = useState('#ffffff');
  const [edgeCleanup, setEdgeCleanup] = useState(180);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [paperSizeId, setPaperSizeId] = useState<string>('single');
  const [customPaper, setCustomPaper] = useState({ width: 210, height: 297 });
  const [hasBorder, setHasBorder] = useState(true);
  const [hasCutLines, setHasCutLines] = useState(true);
  const [zoom, setZoom] = useState(1);
  
  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [bgRemovalChoice, setBgRemovalChoice] = useState<'auto' | 'manual' | null>(null);

  // Eraser states
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [eraserSize, setEraserSize] = useState(25);
  const [eraserHardness, setEraserHardness] = useState(0.8);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cursorPos, setCursorPos] = useState<{x: number, y: number} | null>(null);
  const eraserCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastPos = useRef<{x: number, y: number} | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const skipCanvasUpdate = useRef(false);

  const faq = [
    { q: "What is the standard passport photo size?", a: "Standard sizes vary by country. For example, India uses 35x45 mm, while the USA uses 2x2 inches. Our tool includes presets for most major countries." },
    { q: "Can I change the background color?", a: "Yes! You can choose from standard colors like white or blue, or pick any custom color. Our AI automatically removes the original background for you." },
    { q: "How many photos can I print on one sheet?", a: "Depending on your paper size (like A4 or 4x6 inch), our tool will automatically arrange as many photos as possible to save paper." },
    { q: "Is my photo data safe?", a: "Absolutely. All processing, including AI background removal and face detection, happens entirely within your browser. Your photos are never uploaded to our servers." }
  ];

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const aspect = selectedPreset.id !== 'free' ? selectedPreset.width / selectedPreset.height : 1;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
      width,
      height
    );
    setCrop(initialCrop);
  };

  useEffect(() => {
    if (imgRef.current && selectedPreset.id !== 'free') {
      const { width, height } = imgRef.current;
      const aspect = selectedPreset.width / selectedPreset.height;
      const initialCrop = centerCrop(
        makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
        width,
        height
      );
      setCrop(initialCrop);
    }
  }, [selectedPreset]);

  const handleCropComplete = async () => {
    if (!completedCrop || !imgRef.current) return;

    const canvas = document.createElement('canvas');
    const rect = imgRef.current.getBoundingClientRect();
    const displayWidth = rect.width || imgRef.current.width;
    const displayHeight = rect.height || imgRef.current.height;
    
    const scaleX = imgRef.current.naturalWidth / displayWidth;
    const scaleY = imgRef.current.naturalHeight / displayHeight;
    
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
    setBgRemovalChoice(null);
  };

  const handleAutoCrop = async () => {
    if (!imageSrc || !imgRef.current) return;
    setIsProcessing(true);
    setStatusText('Detecting face...');
    try {
      await initAI((status) => setStatusText(status));
      const img = imgRef.current;
      
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);

      const detections = faceDetector.detect(canvas);
      if (detections.detections.length > 0) {
        const face = detections.detections[0].boundingBox;
        const targetAspect = selectedPreset.id !== 'free' ? selectedPreset.width / selectedPreset.height : 0.8;
        
        const faceHeight = face.height;
        const cropHeight = faceHeight / 0.7;
        const cropWidth = cropHeight * targetAspect;
        
        const faceCenterY = face.originY + face.height / 2;
        const faceCenterX = face.originX + face.width / 2;
        
        let cropX = faceCenterX - cropWidth / 2;
        let cropY = faceCenterY - cropHeight * 0.45;
        
        cropX = Math.max(0, Math.min(cropX, img.naturalWidth - cropWidth));
        cropY = Math.max(0, Math.min(cropY, img.naturalHeight - cropHeight));
        
        setCrop({
          unit: '%',
          x: (cropX / img.naturalWidth) * 100,
          y: (cropY / img.naturalHeight) * 100,
          width: (cropWidth / img.naturalWidth) * 100,
          height: (cropHeight / img.naturalHeight) * 100
        });
      } else {
        alert("No face detected. Please crop manually.");
      }
    } catch (e) {
      console.error("Auto crop failed:", e);
      alert("Auto crop failed. Please crop manually.");
    }
    setIsProcessing(false);
  };

  const processFastBackgroundRemoval = async (imgSrc: string) => {
    setBgRemovalChoice('auto');
    setIsProcessing(true);
    setProgress(10);
    setStatusText('Starting AI...');
    setIsEraserMode(false);

    try {
      await initAI((status) => setStatusText(status));
      setProgress(30);
      setStatusText('Preparing image...');
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = imgSrc;
      });

      const segmentationCanvas = document.createElement('canvas');
      const maxSegDim = 1024;
      let segW = img.width;
      let segH = img.height;
      if (segW > maxSegDim || segH > maxSegDim) {
        if (segW > segH) {
          segH = (segH / segW) * maxSegDim;
          segW = maxSegDim;
        } else {
          segW = (segW / segH) * maxSegDim;
          segH = maxSegDim;
        }
      }
      segmentationCanvas.width = segW;
      segmentationCanvas.height = segH;
      const segCtx = segmentationCanvas.getContext('2d');
      if (!segCtx) throw new Error("No segmentation context");
      segCtx.drawImage(img, 0, 0, segW, segH);

      setProgress(50);
      setStatusText('Analyzing background...');
      
      const segmentationResult = segmenter.segment(segmentationCanvas);
      if (!segmentationResult) throw new Error("Segmentation failed");
      
      setProgress(80);
      setStatusText('Applying mask...');

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = img.width;
      finalCanvas.height = img.height;
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) throw new Error("No final context");
      finalCtx.drawImage(img, 0, 0);
      
      let personMask: Float32Array;
      if (segmentationResult.confidenceMasks && segmentationResult.confidenceMasks.length > 1) {
        personMask = segmentationResult.confidenceMasks[1].getAsFloat32Array();
      } else if (segmentationResult.confidenceMasks && segmentationResult.confidenceMasks.length === 1) {
        personMask = segmentationResult.confidenceMasks[0].getAsFloat32Array();
      } else {
        const catMask = segmentationResult.categoryMask.getAsUint8Array();
        personMask = new Float32Array(catMask.length);
        for (let i = 0; i < catMask.length; i++) {
          personMask[i] = catMask[i] > 0 ? 1.0 : 0.0;
        }
      }

      const maskCanvas = document.createElement('canvas');
      const maskWidth = segmentationResult.confidenceMasks ? segmentationResult.confidenceMasks[0].width : segmentationResult.categoryMask.width;
      const maskHeight = segmentationResult.confidenceMasks ? segmentationResult.confidenceMasks[0].height : segmentationResult.categoryMask.height;
      maskCanvas.width = maskWidth;
      maskCanvas.height = maskHeight;
      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        const maskImageData = maskCtx.createImageData(maskWidth, maskHeight);
        for (let i = 0; i < personMask.length; i++) {
          let alpha = personMask[i];
          if (alpha < 0.3) alpha = 0;
          else if (alpha > 0.8) alpha = 1;
          else alpha = (alpha - 0.3) / 0.5;
          alpha = Math.pow(alpha, 1.5);
          const val = Math.round(alpha * 255);
          maskImageData.data[i * 4] = val;
          maskImageData.data[i * 4 + 1] = val;
          maskImageData.data[i * 4 + 2] = val;
          maskImageData.data[i * 4 + 3] = val;
        }
        maskCtx.putImageData(maskImageData, 0, 0);
        
        const refinedMaskCanvas = document.createElement('canvas');
        refinedMaskCanvas.width = finalCanvas.width;
        refinedMaskCanvas.height = finalCanvas.height;
        const refinedMaskCtx = refinedMaskCanvas.getContext('2d');
        if (refinedMaskCtx) {
          refinedMaskCtx.imageSmoothingEnabled = true;
          refinedMaskCtx.imageSmoothingQuality = 'high';
          refinedMaskCtx.filter = 'blur(1px)';
          refinedMaskCtx.drawImage(maskCanvas, 0, 0, refinedMaskCanvas.width, refinedMaskCanvas.height);
          refinedMaskCtx.filter = 'none';
        }

        finalCtx.globalCompositeOperation = 'destination-in';
        finalCtx.drawImage(refinedMaskCanvas, 0, 0);
        finalCtx.globalCompositeOperation = 'source-over';
      }
      
      const highResDataUrl = finalCanvas.toDataURL('image/png', 1.0);
      
      if (segmentationResult.categoryMask) segmentationResult.categoryMask.close();
      if (segmentationResult.confidenceMasks) segmentationResult.confidenceMasks.forEach(m => m.close());
      
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(highResDataUrl);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      
      skipCanvasUpdate.current = false;
      setBgRemovedImageSrc(highResDataUrl);
      setAutoRemovedImageSrc(highResDataUrl);
      
      setProgress(100);
      setStatusText('Done!');
      setTimeout(() => setIsProcessing(false), 300);
      
    } catch (error) {
      console.error('Error removing background:', error);
      setStatusText('Fast AI failed. You can try Manual Edit.');
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
    
    if ('clientX' in e || 'touches' in e) {
      let clientX, clientY;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      setCursorPos({ x: clientX, y: clientY });
    }
    
    const ctx = eraserCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.globalCompositeOperation = 'destination-out';
      if (eraserHardness >= 0.95) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, eraserSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, eraserSize / 2);
        gradient.addColorStop(0, 'rgba(0,0,0,1)');
        gradient.addColorStop(eraserHardness, 'rgba(0,0,0,1)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, eraserSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPos(e);
    if ('clientX' in e || 'touches' in e) {
      let clientX, clientY;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      setCursorPos({ x: clientX, y: clientY });
    }

    if (!isDrawing || !lastPos.current) return;
    
    const ctx = eraserCanvasRef.current?.getContext('2d');
    if (ctx && lastPos.current) {
      ctx.globalCompositeOperation = 'destination-out';
      if (eraserHardness >= 0.95) {
        ctx.beginPath();
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.lineWidth = eraserSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      } else {
        const dist = Math.sqrt(Math.pow(pos.x - lastPos.current.x, 2) + Math.pow(pos.y - lastPos.current.y, 2));
        const steps = Math.max(1, Math.ceil(dist / (eraserSize / 10)));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const cx = lastPos.current.x + (pos.x - lastPos.current.x) * t;
          const cy = lastPos.current.y + (pos.y - lastPos.current.y) * t;
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, eraserSize / 2);
          gradient.addColorStop(0, 'rgba(0,0,0,1)');
          gradient.addColorStop(eraserHardness, 'rgba(0,0,0,1)');
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(cx, cy, eraserSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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

  useEffect(() => {
    if (!bgRemovedImageSrc) {
      setFinalImageSrc(null);
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
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = canvas.width;
      const height = canvas.height;
      
      const isWhiteBg = bgColor === '#ffffff' || (bgColor === 'custom' && customColor === '#ffffff');
      const isBgRemoved = bgRemovedImageSrc !== croppedImageSrc;
      
      if (isBgRemoved) {
        const baseCutoff = Math.floor((edgeCleanup / 255) * 130);
        const cutoff = isWhiteBg ? Math.max(baseCutoff, 80) : baseCutoff; 
        
        for (let i = 0; i < width * height; i++) {
          const idx = i * 4;
          const a = data[idx + 3];
          if (a > 0) {
            if (a <= cutoff) {
              data[idx + 3] = 0;
            } else {
              let newAlpha = ((a - cutoff) / (255 - cutoff)) * 255;
              const power = isWhiteBg ? 1.8 : 1.5;
              newAlpha = Math.pow(newAlpha / 255, power) * 255;
              data[idx + 3] = Math.max(0, Math.min(255, newAlpha));
            }
          }
        }

        const processedData = new Uint8ClampedArray(data);
        const searchRadius = Math.max(4, Math.floor(edgeCleanup / 25));
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const a = data[idx + 3];
            const r_orig = data[idx];
            const g_orig = data[idx + 1];
            const b_orig = data[idx + 2];

            if (a > 0 && a < 250) {
              let sumR = 0, sumG = 0, sumB = 0, weightSum = 0;
              for (let dy = -searchRadius; dy <= searchRadius; dy++) {
                for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = (ny * width + nx) * 4;
                    const nAlpha = data[nIdx + 3];
                    if (nAlpha > a + 20 || nAlpha > 240) { 
                      const distSq = dx * dx + dy * dy;
                      const weight = 1 / (1 + distSq);
                      sumR += data[nIdx] * weight;
                      sumG += data[nIdx + 1] * weight;
                      sumB += data[nIdx + 2] * weight;
                      weightSum += weight;
                    }
                  }
                }
              }

              if (weightSum > 0) {
                let r = sumR / weightSum;
                let g = sumG / weightSum;
                let b = sumB / weightSum;
                let darkenFactor = 0.95 - (edgeCleanup / 250) * 0.2; 
                if (isWhiteBg) {
                  const br = (r_orig + g_orig + b_orig) / 3;
                  if (br > 180) darkenFactor *= 0.8;
                }
                r *= darkenFactor;
                g *= darkenFactor;
                b *= darkenFactor;
                const blend = Math.pow(1 - (a / 255), 0.25); 
                processedData[idx] = data[idx] * (1 - blend) + r * blend;
                processedData[idx + 1] = data[idx + 1] * (1 - blend) + g * blend;
                processedData[idx + 2] = data[idx + 2] * (1 - blend) + b * blend;
              }
            }
          }
        }
        data.set(processedData);

        const sharpenedData = new Uint8ClampedArray(data);
        const amount = isWhiteBg ? 1.4 : 0.9;
        const sharpenContrast = isWhiteBg ? 1.35 : 1.2;
        
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            if (data[idx + 3] < 5) continue;
            for (let c = 0; c < 3; c++) {
              const current = data[idx + c];
              const neighbors = (
                data[((y - 1) * width + x) * 4 + c] +
                data[((y + 1) * width + x) * 4 + c] +
                data[(y * width + (x - 1)) * 4 + c] +
                data[(y * width + (x + 1)) * 4 + c]
              ) / 4;
              let val = current + (current - neighbors) * amount;
              val = ((val / 255 - 0.5) * sharpenContrast + 0.5) * 255;
              if (isWhiteBg) val += 8;
              sharpenedData[idx + c] = Math.min(255, Math.max(0, val));
            }
          }
        }
        data.set(sharpenedData);

        if (isWhiteBg) {
          for (let i = 0; i < width * height; i++) {
            const idx = i * 4;
            const a = data[idx + 3];
            if (a < 255 && a > 0) {
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              if (r > 180 && g > 180 && b > 180) {
                data[idx + 3] = Math.max(0, a - 180);
              }
            }
          }
        }
      }
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx?.putImageData(imageData, 0, 0);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor === 'custom' ? customColor : bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.filter = 'none';

      if (hasBorder) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(2, Math.round(canvas.width / 150));
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }

      setFinalImageSrc(canvas.toDataURL('image/png', 1.0));
    };
    img.src = bgRemovedImageSrc;
  }, [bgRemovedImageSrc, croppedImageSrc, bgColor, customColor, edgeCleanup, hasBorder, brightness, contrast, saturation]);

  const handleDownload = () => {
    if (!finalImageSrc) return;
    if (paperSizeId === 'single') {
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
    const paper = PAPER_SIZES.find(p => p.id === paperSizeId) || PAPER_SIZES[1];
    const sheetWidthMm = paper.id === 'custom' ? customPaper.width : paper.width;
    const sheetHeightMm = paper.id === 'custom' ? customPaper.height : paper.height;
    const sheetWidth = Math.round((sheetWidthMm / 25.4) * dpi);
    const sheetHeight = Math.round((sheetHeightMm / 25.4) * dpi);
    canvas.width = sheetWidth;
    canvas.height = sheetHeight;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);
    const img = new Image();
    img.onload = () => {
      const targetPreset = selectedPreset.id === 'free' ? PRESETS[1] : selectedPreset;
      const photoWidth = Math.round((targetPreset.width / 25.4) * dpi);
      const photoHeight = Math.round((targetPreset.height / 25.4) * dpi);
      const margin = Math.round((5 / 25.4) * dpi);
      const cols = Math.floor((sheetWidth - margin) / (photoWidth + margin));
      const rows = Math.floor((sheetHeight - margin) / (photoHeight + margin));
      if (cols <= 0 || rows <= 0) {
        alert("Paper size is too small for even one photo.");
        return;
      }
      const startX = (sheetWidth - (cols * photoWidth + (cols - 1) * margin)) / 2;
      const startY = (sheetHeight - (rows * photoHeight + (rows - 1) * margin)) / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = startX + c * (photoWidth + margin);
          const y = startY + r * (photoHeight + margin);
          ctx.drawImage(img, x, y, photoWidth, photoHeight);
          if (hasCutLines) {
            ctx.strokeStyle = '#aaaaaa';
            ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
            ctx.setLineDash([Math.round(dpi/10), Math.round(dpi/10)]);
            ctx.strokeRect(x - margin/2, y - margin/2, photoWidth + margin, photoHeight + margin);
            ctx.setLineDash([]);
          }
        }
      }
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.download = `passport-print-${paper.name}.jpg`;
      link.click();
    };
    img.src = finalImageSrc;
  };

  const renderPrintPreview = () => {
    if (!finalImageSrc) return null;
    if (paperSizeId === 'single') {
      return (
        <div className="relative shadow-xl rounded-sm overflow-hidden max-h-full max-w-full flex items-center justify-center bg-white p-4 sm:p-8">
          <img src={finalImageSrc} alt="Single Print" className="max-h-[60vh] sm:max-h-[80vh] object-contain shadow-md" />
        </div>
      );
    }
    const paper = PAPER_SIZES.find(p => p.id === paperSizeId) || PAPER_SIZES[1];
    const sheetWidthMm = paper.id === 'custom' ? customPaper.width : paper.width;
    const sheetHeightMm = paper.id === 'custom' ? customPaper.height : paper.height;
    const targetPreset = selectedPreset.id === 'free' ? PRESETS[1] : selectedPreset;
    const photoWidthMm = targetPreset.width;
    const photoHeightMm = targetPreset.height;
    const marginMm = 5;
    const cols = Math.floor((sheetWidthMm - marginMm) / (photoWidthMm + marginMm));
    const rows = Math.floor((sheetHeightMm - marginMm) / (photoHeightMm + marginMm));
    if (cols <= 0 || rows <= 0) return <div className="p-8 text-center text-text-muted">Paper size too small.</div>;
    const startXMm = (sheetWidthMm - (cols * photoWidthMm + (cols - 1) * marginMm)) / 2;
    const startYMm = (sheetHeightMm - (rows * photoHeightMm + (rows - 1) * marginMm)) / 2;
    return (
      <div className="w-full h-full flex flex-col items-center justify-center overflow-auto p-4 sm:p-8 bg-bg-secondary/30 min-h-[400px]">
        <div className="bg-white shadow-2xl relative mx-auto max-w-full max-h-full" style={{ width: 'min(500px, 100%)', aspectRatio: `${sheetWidthMm} / ${sheetHeightMm}` }}>
          {Array.from({ length: rows }).map((_, r) => Array.from({ length: cols }).map((_, c) => {
            const x = startXMm + c * (photoWidthMm + marginMm);
            const y = startYMm + r * (photoHeightMm + marginMm);
            return (
              <div key={`${r}-${c}`} className="absolute flex items-center justify-center" style={{ left: `${(x / sheetWidthMm) * 100}%`, top: `${(y / sheetHeightMm) * 100}%`, width: `${(photoWidthMm / sheetWidthMm) * 100}%`, height: `${(photoHeightMm / sheetHeightMm) * 100}%` }}>
                {hasCutLines && <div className="absolute border border-dashed border-gray-400 pointer-events-none" style={{ left: `-${(marginMm/2 / photoWidthMm) * 100}%`, top: `-${(marginMm/2 / photoHeightMm) * 100}%`, width: `${((photoWidthMm + marginMm) / photoWidthMm) * 100}%`, height: `${((photoHeightMm + marginMm) / photoHeightMm) * 100}%` }} />}
                <img src={finalImageSrc} alt="Copy" className="w-full h-full object-fill shadow-sm" />
              </div>
            );
          }))}
        </div>
        <div className="mt-4 text-sm text-text-muted font-bold">Preview: {cols * rows} copies on {paper.name}</div>
      </div>
    );
  };

  return (
    <ToolLayout
      title="AI Passport Photo Maker"
      description="Create professional passport, visa, and ID photos instantly. AI-powered background removal, face detection, and print-ready layouts."
      toolId="passport-photo-maker"
      acceptedFileTypes={['image/*']}
      faq={faq}
      onDownload={handleDownload}
    >
      {({ file, onComplete, onReset }) => {
        useEffect(() => {
          if (file && !imageSrc) {
            const reader = new FileReader();
            reader.onload = (e) => {
              setImageSrc(e.target?.result as string);
              setStep('crop');
            };
            reader.readAsDataURL(file as File);
          }
        }, [file]);

        return (
          <div className="flex flex-col h-full bg-bg-secondary/30">
            {/* Stepper Header */}
            <div className="flex items-center justify-between bg-surface px-6 py-4 border-b border-border overflow-x-auto no-scrollbar shrink-0">
              {[
                { id: 'upload', label: 'Upload' },
                { id: 'crop', label: 'Crop' },
                { id: 'process', label: 'Edit' },
                { id: 'print', label: 'Print' }
              ].map((s, idx, arr) => (
                <React.Fragment key={s.id}>
                  <div className={`flex items-center gap-3 shrink-0 ${step === s.id ? 'text-accent font-black' : 'text-text-muted'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all ${
                      step === s.id ? 'bg-accent text-white scale-110 shadow-lg shadow-accent/20' : 
                      (arr.findIndex(x => x.id === step) > idx ? 'bg-accent/20 text-accent' : 'bg-bg-secondary')
                    }`}>
                      {idx + 1}
                    </div>
                    <span className="text-sm uppercase tracking-widest hidden sm:inline">{s.label}</span>
                  </div>
                  {idx < arr.length - 1 && <div className="flex-1 h-px bg-border mx-4 min-w-[20px]" />}
                </React.Fragment>
              ))}
            </div>

            <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
              {/* Main Preview Area */}
              <div className="flex-1 relative flex flex-col min-h-0 bg-bg-primary">
                <div className="flex-1 relative flex items-center justify-center p-4 sm:p-8 overflow-hidden">
                  {step === 'crop' && imageSrc && (
                    <div className="w-full h-full flex items-center justify-center overflow-hidden">
                      <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        aspect={selectedPreset.id !== 'free' ? selectedPreset.width / selectedPreset.height : undefined}
                        className="shadow-2xl rounded-sm overflow-hidden"
                      >
                        <img 
                          ref={imgRef}
                          src={imageSrc} 
                          alt="Upload" 
                          onLoad={onImageLoad}
                          style={{ maxHeight: '75vh', maxWidth: '100%' }}
                          className="block w-auto h-auto"
                        />
                      </ReactCrop>
                    </div>
                  )}

                  {step === 'process' && (
                    <div className="relative w-full h-full flex flex-col items-center justify-center p-4 overflow-auto">
                      <div 
                        className="relative shadow-2xl rounded-sm overflow-hidden flex items-center justify-center bg-white transition-all duration-300 origin-center" 
                        style={{
                          aspectRatio: selectedPreset.id !== 'free' ? `${selectedPreset.width} / ${selectedPreset.height}` : (completedCrop ? `${completedCrop.width} / ${completedCrop.height}` : 'auto'),
                          height: `${80 * zoom}vh`,
                          maxHeight: '80vh',
                          backgroundColor: bgColor === 'custom' ? customColor : (bgColor !== 'transparent' ? bgColor : 'transparent'),
                          backgroundImage: bgColor === 'transparent' ? 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 20px 20px' : 'none'
                        }}
                      >
                        {isEraserMode ? (
                          <div className="relative w-full h-full group overflow-hidden flex items-center justify-center">
                            <canvas
                              ref={eraserCanvasRef}
                              className="w-full h-full object-contain cursor-none touch-none"
                              onMouseDown={startDrawing}
                              onMouseMove={draw}
                              onMouseUp={stopDrawing}
                              onMouseLeave={() => { stopDrawing(); setCursorPos(null); }}
                              onMouseEnter={(e) => setCursorPos({ x: e.clientX, y: e.clientY })}
                              onTouchStart={startDrawing}
                              onTouchMove={draw}
                              onTouchEnd={() => { stopDrawing(); setCursorPos(null); }}
                            />
                            {cursorPos && (
                              <div 
                                className="fixed pointer-events-none z-50 border-2 border-white shadow-2xl rounded-full bg-white/10 flex items-center justify-center"
                                style={{
                                  left: cursorPos.x,
                                  top: cursorPos.y,
                                  width: eraserCanvasRef.current ? (eraserSize * (eraserCanvasRef.current.getBoundingClientRect().width / eraserCanvasRef.current.width)) : eraserSize,
                                  height: eraserCanvasRef.current ? (eraserSize * (eraserCanvasRef.current.getBoundingClientRect().height / eraserCanvasRef.current.height)) : eraserSize,
                                  transform: 'translate(-50%, -50%)',
                                  background: `radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) ${eraserHardness * 100}%)`
                                }}
                              >
                                <div className="w-1 h-1 bg-white rounded-full shadow-sm" />
                              </div>
                            )}
                          </div>
                        ) : finalImageSrc ? (
                          <img src={finalImageSrc} alt="Processed" className="w-full h-full object-contain" />
                        ) : croppedImageSrc ? (
                          <img src={croppedImageSrc} alt="Cropped Preview" className="w-full h-full object-contain" />
                        ) : null}
                      </div>

                      {isProcessing && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50 text-white p-8">
                          <Loader2 className="w-16 h-16 animate-spin mb-6 text-accent" />
                          <div className="text-xl font-black mb-4 tracking-tight">{statusText}</div>
                          <div className="w-full max-w-xs h-2 bg-white/20 rounded-full overflow-hidden mb-6">
                            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
                          </div>
                          <button onClick={() => setIsProcessing(false)} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-all border border-white/20">Cancel AI Task</button>
                        </div>
                      )}
                    </div>
                  )}

                  {step === 'print' && renderPrintPreview()}
                </div>

                {/* Bottom Navigation Bar */}
                <div className="p-6 bg-surface border-t border-border flex justify-between items-center shrink-0 shadow-2xl z-10">
                  <button 
                    onClick={() => {
                      if (step === 'crop') onReset();
                      else if (step === 'process') setStep('crop');
                      else if (step === 'print') setStep('process');
                    }}
                    className="btn bs2 px-8 py-3 rounded-2xl font-bold"
                  >
                    {step === 'crop' ? 'Cancel' : 'Back'}
                  </button>
                  <div className="flex gap-4">
                    {step === 'crop' && (
                      <button 
                        onClick={handleCropComplete}
                        disabled={!completedCrop?.width || !completedCrop?.height}
                        className="btn bp px-10 py-3 rounded-2xl font-bold gap-2 shadow-xl shadow-accent/20"
                      >
                        Next Step <ArrowRight className="w-5 h-5" />
                      </button>
                    )}
                    {step === 'process' && (
                      <button 
                        onClick={() => setStep('print')}
                        disabled={isProcessing}
                        className="btn bp px-10 py-3 rounded-2xl font-bold gap-2 shadow-xl shadow-accent/20"
                      >
                        Next Step <ArrowRight className="w-5 h-5" />
                      </button>
                    )}
                    {step === 'print' && (
                      <button 
                        onClick={onComplete}
                        className="btn bg px-10 py-3 rounded-2xl font-bold gap-2 shadow-xl shadow-success/20"
                      >
                        Finish & Download <Download className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar Controls */}
              <aside className="w-full lg:w-80 bg-surface border-l border-border flex flex-col shrink-0 shadow-2xl overflow-y-auto">
                <div className="p-6 space-y-8">
                  {step === 'crop' && (
                    <div className="space-y-6">
                      <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Select Document Size</h3>
                      <div className="grid grid-cols-1 gap-2">
                        {PRESETS.map(preset => (
                          <button
                            key={preset.id}
                            onClick={() => setSelectedPreset(preset)}
                            className={`p-4 rounded-2xl border text-left transition-all group ${
                              selectedPreset.id === preset.id 
                                ? 'border-accent bg-accent/5 ring-2 ring-accent/20' 
                                : 'border-border hover:border-accent/50'
                            }`}
                          >
                            <div className="font-bold text-sm group-hover:text-accent transition-colors">{preset.name}</div>
                            {preset.id !== 'free' && (
                              <div className="text-[10px] text-text-muted font-bold mt-1">{preset.width} × {preset.height} mm</div>
                            )}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={handleAutoCrop}
                        disabled={isProcessing}
                        className="w-full p-4 rounded-2xl border-2 border-accent bg-accent/5 text-accent hover:bg-accent hover:text-white flex items-center justify-center gap-3 transition-all font-black text-sm disabled:opacity-50 shadow-lg shadow-accent/10"
                      >
                        <ScanFace className="w-6 h-6" /> AI Auto-Center Face
                      </button>
                    </div>
                  )}

                  {step === 'process' && (
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Background Tools</h3>
                          <div className="flex gap-1">
                            <button onClick={handleUndo} disabled={historyIndex <= 0 || isProcessing} className="p-2 rounded-lg hover:bg-accent/10 disabled:opacity-30 transition-colors"><Undo className="w-4 h-4" /></button>
                            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1 || isProcessing} className="p-2 rounded-lg hover:bg-accent/10 disabled:opacity-30 transition-colors"><Redo className="w-4 h-4" /></button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          <button
                            onClick={() => { setIsEraserMode(false); processFastBackgroundRemoval(croppedImageSrc!); }}
                            disabled={isProcessing}
                            className={`p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${
                              bgRemovalChoice === 'auto' && !isEraserMode ? 'border-accent bg-accent/5 ring-4 ring-accent/10' : 'border-border hover:border-accent/50'
                            }`}
                          >
                            <Wand2 className="w-6 h-6 text-accent" />
                            <span className="text-xs font-black uppercase tracking-tighter">AI Remove Background</span>
                          </button>
                          <button
                            onClick={() => { setBgRemovalChoice('manual'); setIsEraserMode(!isEraserMode); }}
                            disabled={isProcessing}
                            className={`p-4 rounded-2xl border-2 flex flex-row items-center justify-center gap-3 transition-all ${
                              isEraserMode ? 'border-accent bg-accent/5 ring-4 ring-accent/10' : 'border-border hover:border-accent/50'
                            }`}
                          >
                            <Eraser className={`w-6 h-6 ${isEraserMode ? 'text-accent' : 'text-text-muted'}`} />
                            <span className="text-xs font-black uppercase tracking-tighter">Manual Eraser</span>
                          </button>
                        </div>

                        {isEraserMode && (
                          <div className="p-4 bg-bg-secondary rounded-2xl border border-border space-y-6 animate-in slide-in-from-top-4">
                            <div className="flex items-center gap-2 bg-surface p-1 rounded-xl border border-border">
                              <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="p-2 hover:bg-bg-secondary rounded-lg transition-colors"><ZoomOut className="w-4 h-4"/></button>
                              <span className="flex-1 text-center text-[10px] font-black">{Math.round(zoom * 100)}%</span>
                              <button onClick={() => setZoom(z => Math.min(4, z + 0.5))} className="p-2 hover:bg-bg-secondary rounded-lg transition-colors"><ZoomIn className="w-4 h-4"/></button>
                            </div>
                            <div className="space-y-3">
                              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-text-muted">
                                <span>Size</span>
                                <span>{eraserSize}px</span>
                              </div>
                              <input type="range" min="2" max="150" value={eraserSize} onChange={(e) => setEraserSize(parseInt(e.target.value))} className="w-full accent-accent" />
                            </div>
                            <div className="space-y-3">
                              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-text-muted">
                                <span>Hardness</span>
                                <span>{Math.round(eraserHardness * 100)}%</span>
                              </div>
                              <input type="range" min="0" max="100" step="5" value={eraserHardness * 100} onChange={(e) => setEraserHardness(parseInt(e.target.value) / 100)} className="w-full accent-accent" />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4 pt-6 border-t border-border">
                        <div className="flex justify-between items-center">
                          <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Background Color</h3>
                          <button onClick={() => { setBgColor('#ffffff'); setEdgeCleanup(200); }} className="text-[10px] font-black text-accent hover:underline flex items-center gap-1 uppercase tracking-tighter">
                            <Sparkles className="w-3 h-3" /> Clean White
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {COLORS.map(color => (
                            <button
                              key={color.name}
                              onClick={() => setBgColor(color.value)}
                              disabled={isProcessing}
                              className={`p-2 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${
                                bgColor === color.value ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/30'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-lg border border-border shadow-sm" style={{ background: color.value === 'transparent' ? 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 8px 8px' : color.value }} />
                              <span className="text-[8px] font-black uppercase tracking-tighter truncate w-full text-center">{color.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4 pt-6 border-t border-border">
                        <div className="flex justify-between items-center">
                          <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Adjustments</h3>
                          <button onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); }} className="text-[10px] text-accent hover:underline font-black uppercase tracking-tighter">Reset</button>
                        </div>
                        <div className="space-y-6">
                          {[
                            { label: 'Brightness', value: brightness, min: 50, max: 150, onChange: setBrightness },
                            { label: 'Contrast', value: contrast, min: 50, max: 150, onChange: setContrast },
                            { label: 'Saturation', value: saturation, min: 0, max: 200, onChange: setSaturation }
                          ].map(adj => (
                            <div key={adj.label} className="space-y-2">
                              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-text-muted">
                                <span>{adj.label}</span>
                                <span>{adj.value}%</span>
                              </div>
                              <input type="range" min={adj.min} max={adj.max} value={adj.value} onChange={(e) => adj.onChange(Number(e.target.value))} className="w-full accent-accent" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 'print' && (
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Layout Options</h3>
                        <div className="space-y-3">
                          {[
                            { id: 'border', label: 'Photo Border', icon: Layout, value: hasBorder, setter: setHasBorder },
                            { id: 'cut', label: 'Cut Guides', icon: Scissors, value: hasCutLines, setter: setHasCutLines }
                          ].map(opt => (
                            <div key={opt.id} className="flex items-center justify-between p-4 bg-bg-secondary rounded-2xl border border-border">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                                  <opt.icon className="w-5 h-5" />
                                </div>
                                <span className="text-sm font-bold">{opt.label}</span>
                              </div>
                              <button onClick={() => opt.setter(!opt.value)} className={`w-12 h-6 rounded-full transition-all relative ${opt.value ? 'bg-accent' : 'bg-border'}`}>
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${opt.value ? 'left-7' : 'left-1'}`} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4 pt-6 border-t border-border">
                        <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Paper Size</h3>
                        <div className="grid grid-cols-2 gap-2">
                          {PAPER_SIZES.map(paper => (
                            <button
                              key={paper.id}
                              onClick={() => setPaperSizeId(paper.id)}
                              className={`p-4 rounded-2xl border text-left transition-all ${
                                paperSizeId === paper.id ? 'border-accent bg-accent/5 ring-2 ring-accent/20' : 'border-border hover:border-accent/50'
                              }`}
                            >
                              <div className="font-bold text-xs">{paper.name}</div>
                            </button>
                          ))}
                        </div>
                        
                        {paperSizeId === 'custom' && (
                          <div className="grid grid-cols-2 gap-4 p-4 bg-bg-secondary rounded-2xl border border-border animate-in zoom-in-95">
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">Width (mm)</label>
                              <input type="number" value={customPaper.width} onChange={e => setCustomPaper({...customPaper, width: Number(e.target.value)})} className="w-full p-3 rounded-xl border border-border text-sm font-bold" />
                            </div>
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2 block">Height (mm)</label>
                              <input type="number" value={customPaper.height} onChange={e => setCustomPaper({...customPaper, height: Number(e.target.value)})} className="w-full p-3 rounded-xl border border-border text-sm font-bold" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        );
      }}
    </ToolLayout>
  );
}
