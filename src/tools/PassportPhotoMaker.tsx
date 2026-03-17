import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Settings, Image as ImageIcon, Layout, Sliders, Check, Loader2, X, Printer, Crop as CropIcon, ArrowRight, ArrowLeft, Wand2, Eraser, Undo, Redo, ScanFace, ZoomIn, ZoomOut, Scissors, Sparkles } from 'lucide-react';
import { removeBackground } from '@imgly/background-removal';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { FaceDetector, ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';

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

const initAI = async (onStatus?: (s: string) => void, forceCPU: boolean = false) => {
  if (vision && faceDetector && segmenter) return;
  if (isInitializing) {
    // Wait for existing initialization
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (vision && faceDetector && segmenter) return;
  }
  
  isInitializing = true;
  
  const loadAI = async (delegate: "GPU" | "CPU" = "GPU") => {
    onStatus?.('Downloading AI engine...');
    // Note: "INFO: Created TensorFlow Lite XNNPACK delegate for CPU" is a normal informational 
    // message from MediaPipe indicating optimized CPU acceleration is active.
    if (!vision) {
      vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
    }
    
    onStatus?.(`Initializing ${delegate} models...`);
    
    // Load face detector and segmenter in parallel
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
    if (forceCPU || !isWebGLSupported()) {
      await loadAI("CPU");
    } else {
      // Try with GPU first, with a 15s timeout
      await Promise.race([
        loadAI("GPU"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("AI Init Timeout")), 15000))
      ]);
    }
  } catch (e) {
    console.warn("GPU AI Init failed or timed out, falling back to CPU:", e);
    try {
      // Fallback to CPU
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
  const [selectedPreset, setSelectedPreset] = useState<Preset>(PRESETS[1]); // Default to India
  const [bgColor, setBgColor] = useState(COLORS[0].value);
  const [customColor, setCustomColor] = useState('#ffffff');
  const [edgeCleanup, setEdgeCleanup] = useState(180); // Increased default for cleaner white background
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
  const [useCPUOnly, setUseCPUOnly] = useState(false);

  const resetAI = () => {
    vision = null;
    faceDetector = null;
    segmenter = null;
    setIsProcessing(false);
    setStatusText('');
    setProgress(0);
  };

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
        makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
        width,
        height
      );
      setCrop(initialCrop);
    } else {
      const initialCrop = centerCrop(
        makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
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
    // Fallback to width/height if rect is 0 (e.g. display: none)
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
    setBgRemovalChoice(null); // Reset choice
  };

  const handleAutoCrop = async () => {
    if (!imageSrc || !imgRef.current) return;
    setIsProcessing(true);
    setStatusText('Detecting face...');
    try {
      await initAI((status) => setStatusText(status), useCPUOnly);
      const img = imgRef.current;
      
      // We need to create a canvas to pass to mediapipe to ensure it reads the natural dimensions correctly
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);

      const detections = faceDetector.detect(canvas);
      if (detections.detections.length > 0) {
        const face = detections.detections[0].boundingBox;
        
        // Calculate crop based on passport standards
        const targetAspect = selectedPreset.id !== 'free' ? selectedPreset.width / selectedPreset.height : 0.8;
        
        const faceHeight = face.height;
        // Face should be ~70% of the photo height
        const cropHeight = faceHeight / 0.7;
        const cropWidth = cropHeight * targetAspect;
        
        const faceCenterY = face.originY + face.height / 2;
        const faceCenterX = face.originX + face.width / 2;
        
        let cropX = faceCenterX - cropWidth / 2;
        let cropY = faceCenterY - cropHeight * 0.45; // Face slightly above center
        
        // Ensure within bounds
        cropX = Math.max(0, Math.min(cropX, img.naturalWidth - cropWidth));
        cropY = Math.max(0, Math.min(cropY, img.naturalHeight - cropHeight));
        
        // Convert to percentages for ReactCrop
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
      await initAI((status) => setStatusText(status), useCPUOnly);
      setProgress(30);
      setStatusText('Preparing image...');
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = imgSrc;
      });

      // Optimization: Resize image for segmentation (MediaPipe works best at smaller sizes)
      const segmentationCanvas = document.createElement('canvas');
      const maxSegDim = 1024; // Increased for better edge detail
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
      
      // Run segmentation on the resized image
      const segmentationResult = segmenter.segment(segmentationCanvas);
      if (!segmentationResult) throw new Error("Segmentation failed");
      
      setProgress(80);
      setStatusText('Applying mask...');

      // Create the final high-res canvas
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = img.width;
      finalCanvas.height = img.height;
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) throw new Error("No final context");
      finalCtx.drawImage(img, 0, 0);
      
      // Extract the mask
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

      // Create a mask canvas to upscale
      const maskCanvas = document.createElement('canvas');
      const maskWidth = segmentationResult.confidenceMasks ? segmentationResult.confidenceMasks[0].width : segmentationResult.categoryMask.width;
      const maskHeight = segmentationResult.confidenceMasks ? segmentationResult.confidenceMasks[0].height : segmentationResult.categoryMask.height;
      maskCanvas.width = maskWidth;
      maskCanvas.height = maskHeight;
      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        const maskImageData = maskCtx.createImageData(maskWidth, maskHeight);
        for (let i = 0; i < personMask.length; i++) {
          // Apply a slight gamma correction to the mask to expand it slightly (5-10%)
          // and ensure soft edges are preserved.
          const alpha = Math.pow(personMask[i], 0.7); 
          const val = Math.round(alpha * 255);
          maskImageData.data[i * 4] = val;
          maskImageData.data[i * 4 + 1] = val;
          maskImageData.data[i * 4 + 2] = val;
          maskImageData.data[i * 4 + 3] = val;
        }
        maskCtx.putImageData(maskImageData, 0, 0);
        
        // Refine mask edges
        const refinedMaskCanvas = document.createElement('canvas');
        refinedMaskCanvas.width = finalCanvas.width;
        refinedMaskCanvas.height = finalCanvas.height;
        const refinedMaskCtx = refinedMaskCanvas.getContext('2d');
        if (refinedMaskCtx) {
          refinedMaskCtx.imageSmoothingEnabled = true;
          refinedMaskCtx.imageSmoothingQuality = 'high';
          refinedMaskCtx.drawImage(maskCanvas, 0, 0, refinedMaskCanvas.width, refinedMaskCanvas.height);
          
          // Soft feathering
          refinedMaskCtx.filter = 'blur(1.5px)';
          refinedMaskCtx.globalCompositeOperation = 'copy';
          refinedMaskCtx.drawImage(refinedMaskCanvas, 0, 0);
          refinedMaskCtx.filter = 'none';
        }

        // Apply scaled mask to high-res image
        finalCtx.globalCompositeOperation = 'destination-in';
        finalCtx.drawImage(refinedMaskCanvas, 0, 0);
        finalCtx.globalCompositeOperation = 'source-over';
        
        // Final sharpening and enhancement
        finalCtx.filter = 'contrast(1.05) brightness(1.02)';
        finalCtx.drawImage(finalCanvas, 0, 0);
        finalCtx.filter = 'none';
      }
      
      const highResDataUrl = finalCanvas.toDataURL('image/png', 1.0);
      
      // Cleanup
      if (segmentationResult.categoryMask) segmentationResult.categoryMask.close();
      if (segmentationResult.confidenceMasks) segmentationResult.confidenceMasks.forEach(m => m.close());
      
      // Update history
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
      setStatusText('Fast AI failed. You can try HQ AI or Manual Edit.');
      setIsProcessing(false);
      // Don't auto-fallback to HQ as it might also hang if connection is the issue
    }
  };

  const processBackgroundRemoval = async (imgSrc: string) => {
    setBgRemovalChoice('auto');
    setIsProcessing(true);
    setProgress(5);
    setStatusText('AI Analysis...');
    setIsEraserMode(false);

    try {
      // 1. Resize image to a reasonable size for 2-second processing
      // Passport photos don't need 4K resolution for background removal
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = imgSrc;
      });

      const maxDim = 1280; // Increased for HD quality
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = (height / width) * maxDim;
          width = maxDim;
        } else {
          width = (width / height) * maxDim;
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      
      const resizedBlob = await new Promise<Blob>((resolve) => 
        canvas.toBlob((b) => resolve(b!), 'image/png')
      );

      setStatusText('Removing background...');
      setProgress(20);
      
      // 2. Use faster model
      const bgRemovedBlob = await removeBackground(resizedBlob, {
        publicPath: "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/",
        model: 'isnet', // Best balance of speed and A1 quality
        progress: (key, current, total) => {
          if (total > 0) {
            setProgress(20 + Math.round((current / total) * 70));
          }
        }
      });
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const bgRemovedDataUrl = reader.result as string;
        
        // 3. Restore to original resolution by upscaling the mask
        const bgRemovedImg = new Image();
        await new Promise((resolve) => {
          bgRemovedImg.onload = resolve;
          bgRemovedImg.src = bgRemovedDataUrl;
        });

        const originalImg = new Image();
        await new Promise((resolve) => {
          originalImg.onload = resolve;
          originalImg.src = imgSrc;
        });

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = originalImg.width;
        finalCanvas.height = originalImg.height;
        const finalCtx = finalCanvas.getContext('2d');
        if (finalCtx) {
          // Draw original high-res image
          finalCtx.drawImage(originalImg, 0, 0);
          
          // Create a mask canvas from the AI result
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = originalImg.width;
          maskCanvas.height = originalImg.height;
          const maskCtx = maskCanvas.getContext('2d');
          if (maskCtx) {
            maskCtx.imageSmoothingEnabled = true;
            maskCtx.imageSmoothingQuality = 'high';
            maskCtx.drawImage(bgRemovedImg, 0, 0, originalImg.width, originalImg.height);
            
            // Advanced Mask Refinement:
            // 1. Morphological Closing (Dilation then Erosion) to fill small holes
            // We simulate this by drawing the mask with slight offsets
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = originalImg.width;
            tempCanvas.height = originalImg.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              tempCtx.drawImage(maskCanvas, 0, 0);
              
              maskCtx.globalAlpha = 0.5;
              maskCtx.drawImage(tempCanvas, 1, 1);
              maskCtx.drawImage(tempCanvas, -1, -1);
              maskCtx.drawImage(tempCanvas, 1, -1);
              maskCtx.drawImage(tempCanvas, -1, 1);
              maskCtx.globalAlpha = 1.0;
            }

            // 2. Soft Feathering for natural blending
            maskCtx.filter = 'blur(2px)';
            maskCtx.globalCompositeOperation = 'copy';
            maskCtx.drawImage(maskCanvas, 0, 0);
            maskCtx.filter = 'none';

            // Apply mask to original image
            finalCtx.globalCompositeOperation = 'destination-in';
            finalCtx.drawImage(maskCanvas, 0, 0);
            
            // 3. Final Quality Enhancement: Sharpening
            // We use a slight contrast and brightness boost to make the subject pop
            finalCtx.globalCompositeOperation = 'source-over';
            finalCtx.filter = 'contrast(1.05) brightness(1.02) saturate(1.02)';
            finalCtx.drawImage(finalCanvas, 0, 0);
            finalCtx.filter = 'none';
          }
        }

        const highResDataUrl = finalCanvas.toDataURL('image/png', 1.0);
        
        // Update history and current image
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
      };
      reader.readAsDataURL(bgRemovedBlob);
      
    } catch (error: any) {
      console.error('Error removing background:', error);
      let errorMessage = 'Error processing image';
      if (error?.message?.includes("_OrtGetInputOutputMetadata")) {
        errorMessage = "AI Engine incompatibility detected. Please try using 'Force CPU Mode' in troubleshooting or refresh the page.";
      }
      setStatusText(errorMessage);
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
    
    // Update cursor position for preview
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
    
    // Update cursor position for preview
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
        // For soft edges, we draw multiple points along the line
        const dist = Math.sqrt(Math.pow(pos.x - lastPos.current.x, 2) + Math.pow(pos.y - lastPos.current.y, 2));
        const angle = Math.atan2(pos.y - lastPos.current.y, pos.x - lastPos.current.x);
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
      
      // 2. Color Decontamination, Edge Darkening & Sharpening
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      if (!(data instanceof Uint8ClampedArray)) {
        console.error("ImageData.data is not a Uint8ClampedArray");
        return;
      }
      const width = canvas.width;
      const height = canvas.height;
      
      // Pass 1: Alpha Thresholding & Smoothing (Edge Cleanup)
      // This removes the faint halo and sharpens the edge slightly
      // edgeCleanup is 0-250. 
      // For white background, we use a slightly more aggressive threshold
      const isWhiteBg = bgColor === '#ffffff';
      const baseCutoff = Math.floor((edgeCleanup / 255) * 100);
      const cutoff = isWhiteBg ? Math.max(baseCutoff, 60) : baseCutoff; 
      
      for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        const a = data[idx + 3];
        
        if (a > 0) {
          if (a <= cutoff) {
            data[idx + 3] = 0; // Remove faint edges completely
          } else {
            // Rescale alpha to maintain smooth edges but remove the halo
            let newAlpha = ((a - cutoff) / (255 - cutoff)) * 255;
            
            // Apply a curve to make the core solid and edges soft
            // For white background, we want slightly sharper edges to avoid "gray halo"
            const power = isWhiteBg ? 1.4 : 1.2;
            newAlpha = Math.pow(newAlpha / 255, power) * 255;
            
            data[idx + 3] = Math.max(0, Math.min(255, newAlpha));
          }
        }
      }

      // Pass 2: Color Decontamination (Defringing)
      // For semi-transparent pixels, their color is mixed with the old background.
      // We pull their color towards the nearest fully opaque pixel.
      const processedData = new Uint8ClampedArray(data);
      const searchRadius = Math.max(3, Math.floor(edgeCleanup / 35)); // Increased radius
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const a = data[idx + 3];
          const r_orig = data[idx];
          const g_orig = data[idx + 1];
          const b_orig = data[idx + 2];

          // Only process edge pixels
          if (a > 0 && a < 252) {
            let sumR = 0, sumG = 0, sumB = 0, weightSum = 0;
            
            for (let dy = -searchRadius; dy <= searchRadius; dy++) {
              for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const nIdx = (ny * width + nx) * 4;
                  const nAlpha = data[nIdx + 3];
                  
                  // Sample from more opaque pixels
                  if (nAlpha > a + 15 || nAlpha > 245) { 
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

              // Darken the edge slightly to hide remaining bright halos (common in hair)
              // The higher the edgeCleanup, the more we darken the edges
              let darkenFactor = 0.92 - (edgeCleanup / 250) * 0.35; 
              
              // If target background is white, we need to be extra careful with bright fringes
              if (isWhiteBg) {
                // Detect if the original pixel was very bright (likely background remnant)
                const brightness = (r_orig + g_orig + b_orig) / 3;
                if (brightness > 200) {
                  darkenFactor *= 0.85; // Extra darkening for bright fringes on white bg
                }
              }

              r *= darkenFactor;
              g *= darkenFactor;
              b *= darkenFactor;

              // Blend the decontaminated color with the original color
              const blend = Math.pow(1 - (a / 255), 0.6); 
              processedData[idx] = data[idx] * (1 - blend) + r * blend;
              processedData[idx + 1] = data[idx + 1] * (1 - blend) + g * blend;
              processedData[idx + 2] = data[idx + 2] * (1 - blend) + b * blend;
            }
          }
        }
      }
      if (processedData instanceof Uint8ClampedArray && typeof data.set === 'function') {
        data.set(processedData);
      }

      // Pass 3: Studio Sharpening & Detail Enhancement
      const sharpenedData = new Uint8ClampedArray(data);
      const amount = isWhiteBg ? 1.4 : 0.9; // Increased sharpening
      const contrast = isWhiteBg ? 1.35 : 1.2; // Increased contrast
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          if (data[idx + 3] < 5) continue;

          for (let c = 0; c < 3; c++) {
            // 1. Sharpen (Unsharp Mask)
            const current = data[idx + c];
            const neighbors = (
              data[((y - 1) * width + x) * 4 + c] +
              data[((y + 1) * width + x) * 4 + c] +
              data[(y * width + (x - 1)) * 4 + c] +
              data[(y * width + (x + 1)) * 4 + c]
            ) / 4;
            
            let val = current + (current - neighbors) * amount;
            
            // 2. Contrast Adjustment
            val = ((val / 255 - 0.5) * contrast + 0.5) * 255;
            
            // 3. Brightness Adjustment (Subtle boost for passport look)
            if (isWhiteBg) {
              val += 8; // Slightly more brightness boost
            }
            
            sharpenedData[idx + c] = Math.min(255, Math.max(0, val));
          }
        }
      }
      if (sharpenedData instanceof Uint8ClampedArray && typeof data.set === 'function') {
        data.set(sharpenedData);
      }

      // Pass 4: Background Whitening (Final Polish)
      // This ensures that any stray pixels that are almost white are pushed to pure white
      // if they are near the edges.
      if (isWhiteBg) {
        for (let i = 0; i < width * height; i++) {
          const idx = i * 4;
          const a = data[idx + 3];
          if (a < 255 && a > 0) {
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            // If the pixel is very bright and semi-transparent, it's likely a background artifact
            // We use a slightly lower threshold (225) to catch more "grayish" artifacts
            if (r > 225 && g > 225 && b > 225) {
              data[idx + 3] = Math.max(0, a - 120); // Even stronger fade for artifacts on white bg
            }
          }
        }
      }
      
      // 3. Create a temporary canvas with the processed image
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

      // 6. Add black border if enabled
      if (hasBorder) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(2, Math.round(canvas.width / 150)); // Proportional border
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }

      setFinalImageSrc(canvas.toDataURL('image/png', 1.0));
    };
    img.src = bgRemovedImageSrc;
  }, [bgRemovedImageSrc, bgColor, customColor, edgeCleanup, hasBorder]);

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
          
          // Draw cut lines
          if (hasCutLines) {
            ctx.strokeStyle = '#aaaaaa';
            ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
            ctx.setLineDash([Math.round(dpi/10), Math.round(dpi/10)]);
            ctx.strokeRect(x - margin/2, y - margin/2, photoWidth + margin, photoHeight + margin);
            ctx.setLineDash([]); // reset
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

  // Render Print Preview
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
    
    if (cols <= 0 || rows <= 0) {
      return (
        <div className="w-full h-full flex items-center justify-center p-8 bg-gray-100">
          <div className="text-center text-text-muted">
            <p>Paper size is too small for this photo size.</p>
            <p className="text-sm mt-2">Photo: {photoWidthMm}x{photoHeightMm}mm</p>
            <p className="text-sm">Paper: {sheetWidthMm}x{sheetHeightMm}mm</p>
          </div>
        </div>
      );
    }

    const startXMm = (sheetWidthMm - (cols * photoWidthMm + (cols - 1) * marginMm)) / 2;
    const startYMm = (sheetHeightMm - (rows * photoHeightMm + (rows - 1) * marginMm)) / 2;
    
    const totalPhotos = cols * rows;
    
    return (
      <div className="w-full h-full flex flex-col items-center justify-center overflow-auto p-2 sm:p-8 bg-gray-100 min-h-[400px]">
        <div 
          className="bg-white shadow-2xl relative mx-auto max-w-full max-h-full"
          style={{
            width: 'min(500px, 100%)',
            aspectRatio: `${sheetWidthMm} / ${sheetHeightMm}`,
          }}
        >
          {Array.from({ length: rows }).map((_, r) => (
            Array.from({ length: cols }).map((_, c) => {
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
                    height: `${(photoHeightMm / sheetHeightMm) * 100}%`,
                  }}
                >
                  {hasCutLines && (
                    <div 
                      className="absolute border border-dashed border-gray-400 pointer-events-none"
                      style={{
                        left: `-${(marginMm/2 / photoWidthMm) * 100}%`,
                        top: `-${(marginMm/2 / photoHeightMm) * 100}%`,
                        width: `${((photoWidthMm + marginMm) / photoWidthMm) * 100}%`,
                        height: `${((photoHeightMm + marginMm) / photoHeightMm) * 100}%`,
                      }}
                    />
                  )}
                  <img src={finalImageSrc} alt={`Copy`} className="w-full h-full object-fill shadow-sm" />
                </div>
              );
            })
          ))}
        </div>
        <div className="mt-4 text-sm text-text-muted font-medium text-center">
          Preview: {totalPhotos} copies on {paper.name}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-[600px] lg:h-[calc(100vh-6rem)]">
      {/* Stepper Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 bg-surface p-3 sm:p-4 rounded-2xl border border-border overflow-x-auto no-scrollbar">
        <div className={`flex items-center gap-2 shrink-0 ${step === 'upload' ? 'text-accent font-bold' : 'text-text-muted'}`}>
          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-base ${step === 'upload' ? 'bg-accent text-white' : 'bg-bg-secondary'}`}>1</div>
          <span className="text-xs sm:text-sm">Upload</span>
        </div>
        <div className="w-4 sm:flex-1 h-px bg-border mx-2 sm:mx-4 shrink-0"></div>
        <div className={`flex items-center gap-2 shrink-0 ${step === 'crop' ? 'text-accent font-bold' : 'text-text-muted'}`}>
          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-base ${step === 'crop' ? 'bg-accent text-white' : step === 'process' || step === 'print' ? 'bg-accent text-white' : 'bg-bg-secondary'}`}>2</div>
          <span className="text-xs sm:text-sm">Crop</span>
        </div>
        <div className="w-4 sm:flex-1 h-px bg-border mx-2 sm:mx-4 shrink-0"></div>
        <div className={`flex items-center gap-2 shrink-0 ${step === 'process' ? 'text-accent font-bold' : 'text-text-muted'}`}>
          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-base ${step === 'process' ? 'bg-accent text-white' : step === 'print' ? 'bg-accent text-white' : 'bg-bg-secondary'}`}>3</div>
          <span className="text-xs sm:text-sm">Edit</span>
        </div>
        <div className="w-4 sm:flex-1 h-px bg-border mx-2 sm:mx-4 shrink-0"></div>
        <div className={`flex items-center gap-2 shrink-0 ${step === 'print' ? 'text-accent font-bold' : 'text-text-muted'}`}>
          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-base ${step === 'print' ? 'bg-accent text-white' : 'bg-bg-secondary'}`}>4</div>
          <span className="text-xs sm:text-sm">Print</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 flex-1 min-h-0">
        {/* Left Panel - Editor/Preview */}
        <div className="flex-1 bg-surface border border-border rounded-2xl overflow-hidden flex flex-col relative min-h-[400px] lg:min-h-0">
          <div className="flex-1 bg-bg-secondary relative flex items-center justify-center p-2 sm:p-6 overflow-hidden">
            
            {/* STEP 1: UPLOAD */}
            {step === 'upload' && (
              <div 
                className="w-full max-w-md border-2 border-dashed border-border rounded-2xl p-6 sm:p-12 flex flex-col items-center justify-center text-center hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer mx-auto"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mb-4">
                  <Upload className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold mb-2">Upload Photo</h3>
                <p className="text-text-muted text-xs sm:text-sm mb-6">
                  Drag & drop or click to upload.<br/>
                  We'll guide you step by step.
                </p>
                <button className="btn btn-primary">Select Image</button>
              </div>
            )}

            {/* STEP 2: CROP */}
            {step === 'crop' && imageSrc && (
              <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-bg-secondary/50">
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={selectedPreset.id !== 'free' ? selectedPreset.width / selectedPreset.height : undefined}
                  className="shadow-2xl"
                >
                  <img 
                    ref={imgRef}
                    src={imageSrc} 
                    alt="Upload" 
                    onLoad={onImageLoad}
                    style={{ maxHeight: 'calc(100vh - 16rem)', maxWidth: '100%' }}
                    className="block w-auto h-auto"
                  />
                </ReactCrop>
              </div>
            )}

            {/* STEP 3: PROCESS */}
            {step === 'process' && (
              <div className="relative w-full h-full flex flex-col items-center justify-start p-2 sm:p-8 overflow-auto min-h-0 min-w-0 bg-bg-secondary/50">
                {/* Always show the image preview */}
                <div 
                  className="relative shadow-2xl rounded-sm overflow-hidden flex items-center justify-center bg-white transition-all duration-200 origin-top" 
                  style={{
                    aspectRatio: selectedPreset.id !== 'free' ? `${selectedPreset.width} / ${selectedPreset.height}` : (completedCrop ? `${completedCrop.width} / ${completedCrop.height}` : 'auto'),
                    height: `${60 * zoom}vh`,
                    minHeight: `${60 * zoom}vh`,
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
                        onMouseLeave={() => {
                          stopDrawing();
                          setCursorPos(null);
                        }}
                        onMouseEnter={(e) => {
                          setCursorPos({ x: e.clientX, y: e.clientY });
                        }}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={() => {
                          stopDrawing();
                          setCursorPos(null);
                        }}
                      />
                      {cursorPos && (
                        <div 
                          className="fixed pointer-events-none z-50 border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] rounded-full bg-white/10 flex items-center justify-center"
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
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center z-10 rounded-2xl text-white p-4">
                    <Loader2 className="w-8 h-8 sm:w-12 sm:h-12 animate-spin mb-4" />
                    <div className="text-sm sm:text-lg font-bold mb-2 drop-shadow-md text-center">{statusText}</div>
                    <div className="w-full max-w-[200px] sm:max-w-xs h-1.5 sm:h-2 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm mb-4">
                      <div 
                        className="h-full bg-white transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <button 
                      onClick={() => setIsProcessing(false)}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors border border-white/20"
                    >
                      Cancel / Stop AI
                    </button>
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
                  <button
                    onClick={handleAutoCrop}
                    disabled={isProcessing}
                    className="w-full p-3 rounded-xl border border-accent bg-accent text-white hover:bg-accent/90 flex items-center justify-center gap-2 transition-all font-bold text-sm disabled:opacity-50"
                  >
                    <ScanFace className="w-5 h-5" /> Auto Center Face (AI)
                  </button>
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
                          processFastBackgroundRemoval(croppedImageSrc!);
                        }}
                        disabled={isProcessing}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                          bgRemovalChoice === 'auto' && !isEraserMode ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:border-accent/50'
                        }`}
                      >
                        <Wand2 className="w-5 h-5 text-accent" />
                        <span className="text-[10px] font-medium text-center">AI Remove (Fast)</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsEraserMode(false);
                          processBackgroundRemoval(croppedImageSrc!);
                        }}
                        disabled={isProcessing}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                          bgRemovalChoice === 'auto' && !isEraserMode ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:border-accent/50'
                        }`}
                      >
                        <ImageIcon className="w-5 h-5 text-accent" />
                        <span className="text-[10px] font-medium text-center">AI Remove (HQ)</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        onClick={() => {
                          setBgRemovalChoice('manual');
                          setIsEraserMode(!isEraserMode);
                        }}
                        disabled={isProcessing}
                        className={`p-3 rounded-xl border flex flex-row items-center justify-center gap-2 transition-all ${
                          isEraserMode ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:border-accent/50'
                        }`}
                      >
                        <Eraser className={`w-5 h-5 ${isEraserMode ? 'text-accent' : 'text-text-muted'}`} />
                        <span className="text-xs font-medium text-center">Manual Eraser / Touch-up</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          if (bgRemovedImageSrc) {
                            const link = document.createElement('a');
                            link.href = bgRemovedImageSrc;
                            link.download = `transparent-photo.png`;
                            link.click();
                          }
                        }}
                        disabled={!bgRemovedImageSrc || isProcessing}
                        className="p-2 rounded-lg border border-border hover:bg-bg-secondary text-[10px] font-bold uppercase tracking-tighter flex items-center justify-center gap-1 disabled:opacity-30"
                      >
                        <Download className="w-3 h-3" /> Download PNG
                      </button>
                      <button
                        onClick={() => {
                          if (autoRemovedImageSrc) {
                            setBgRemovedImageSrc(autoRemovedImageSrc);
                            setBgRemovalChoice('auto');
                            setIsEraserMode(false);
                            // Add to history
                            const newHistory = history.slice(0, historyIndex + 1);
                            newHistory.push(autoRemovedImageSrc);
                            setHistory(newHistory);
                            setHistoryIndex(newHistory.length - 1);
                          }
                        }}
                        disabled={!autoRemovedImageSrc || isProcessing}
                        className="p-2 rounded-lg border border-border hover:bg-bg-secondary text-[10px] font-bold uppercase tracking-tighter flex items-center justify-center gap-1 disabled:opacity-30"
                      >
                        <Undo className="w-3 h-3" /> Restore AI
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        if (croppedImageSrc) {
                          setBgRemovedImageSrc(croppedImageSrc);
                          setBgRemovalChoice(null);
                          setIsEraserMode(false);
                          setAutoRemovedImageSrc(null);
                          // Add to history
                          const newHistory = history.slice(0, historyIndex + 1);
                          newHistory.push(croppedImageSrc);
                          setHistory(newHistory);
                          setHistoryIndex(newHistory.length - 1);
                        }
                      }}
                      disabled={isProcessing}
                      className="w-full p-2 rounded-lg border border-border hover:bg-bg-secondary text-[10px] font-bold uppercase tracking-tighter flex items-center justify-center gap-1"
                    >
                      <X className="w-3 h-3" /> Reset to Original
                    </button>

                    {isEraserMode && (
                      <div className="pt-2 space-y-4">
                        <div className="flex items-center gap-2 bg-bg-secondary p-1.5 rounded-xl border border-border">
                          <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="p-2 hover:bg-white rounded-lg transition-colors"><ZoomOut className="w-4 h-4"/></button>
                          <span className="flex-1 text-center text-xs font-bold">{Math.round(zoom * 100)}%</span>
                          <button onClick={() => setZoom(z => Math.min(4, z + 0.5))} className="p-2 hover:bg-white rounded-lg transition-colors"><ZoomIn className="w-4 h-4"/></button>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-xs font-medium text-text-muted">Eraser Size</label>
                            <span className="text-xs text-text-muted">{eraserSize}px</span>
                          </div>
                          <input 
                            type="range" 
                            min="2" 
                            max="150" 
                            value={eraserSize}
                            onChange={(e) => setEraserSize(parseInt(e.target.value))}
                            className="w-full accent-accent"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <label className="text-xs font-medium text-text-muted">Hardness</label>
                            <span className="text-xs text-text-muted">{Math.round(eraserHardness * 100)}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            step="5"
                            value={eraserHardness * 100}
                            onChange={(e) => setEraserHardness(parseInt(e.target.value) / 100)}
                            className="w-full accent-accent"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-sm text-text-muted uppercase tracking-wider">Background Color</h3>
                      <button 
                        onClick={() => {
                          setBgColor('#ffffff');
                          setEdgeCleanup(200);
                        }}
                        className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> Clean White
                      </button>
                    </div>
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
                      max="255" 
                      value={edgeCleanup}
                      onChange={(e) => setEdgeCleanup(parseInt(e.target.value))}
                      className="w-full accent-accent"
                    />
                    <p className="text-xs text-text-muted mt-2">
                      Increase to remove stray hairs and color halos. Decrease if the edges look too sharp.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-border">
                    <h3 className="font-bold text-sm text-text-muted uppercase tracking-wider mb-2">Troubleshooting</h3>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-secondary cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={useCPUOnly}
                          onChange={(e) => {
                            setUseCPUOnly(e.target.checked);
                            resetAI();
                          }}
                          className="w-4 h-4 accent-accent"
                        />
                        <span className="text-xs font-medium">Force CPU Mode (Slower but safer)</span>
                      </label>
                      <button
                        onClick={resetAI}
                        className="w-full p-2 rounded-lg border border-border hover:bg-bg-secondary text-[10px] font-bold uppercase tracking-tighter flex items-center justify-center gap-1"
                      >
                        <Wand2 className="w-3 h-3" /> Reset AI Engine
                      </button>
                      <p className="text-[10px] text-text-muted leading-tight">
                        If AI is stuck loading, try switching to CPU mode or resetting the engine.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4 CONTROLS */}
              {step === 'print' && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm text-text-muted uppercase tracking-wider">Print Options</h3>
                    
                    <div className="flex items-center justify-between p-3 bg-bg-secondary rounded-xl border border-border">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Layout className="w-4 h-4 text-accent" />
                        </div>
                        <span className="text-sm font-medium">Photo Border</span>
                      </div>
                      <button 
                        onClick={() => setHasBorder(!hasBorder)}
                        className={`w-12 h-6 rounded-full transition-all relative ${hasBorder ? 'bg-accent' : 'bg-border'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${hasBorder ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-bg-secondary rounded-xl border border-border">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Scissors className="w-4 h-4 text-accent" />
                        </div>
                        <span className="text-sm font-medium">Cut Lines (Guides)</span>
                      </div>
                      <button 
                        onClick={() => setHasCutLines(!hasCutLines)}
                        className={`w-12 h-6 rounded-full transition-all relative ${hasCutLines ? 'bg-accent' : 'bg-border'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${hasCutLines ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="font-bold text-sm text-text-muted uppercase tracking-wider">Paper Size</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {PAPER_SIZES.map(paper => (
                        <button
                          key={paper.id}
                          onClick={() => setPaperSizeId(paper.id)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            paperSizeId === paper.id 
                              ? 'border-accent bg-accent/5 ring-1 ring-accent' 
                              : 'border-border hover:border-accent/50'
                          }`}
                        >
                          <div className="font-medium text-xs">{paper.name}</div>
                        </button>
                      ))}
                    </div>
                    
                    {paperSizeId === 'custom' && (
                      <div className="grid grid-cols-2 gap-4 p-4 bg-bg-secondary rounded-xl border border-border">
                        <div>
                          <label className="text-xs font-medium text-text-muted mb-1 block">Width (mm)</label>
                          <input 
                            type="number" 
                            value={customPaper.width}
                            onChange={e => setCustomPaper({...customPaper, width: Number(e.target.value)})}
                            className="w-full p-2 rounded-lg border border-border text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-text-muted mb-1 block">Height (mm)</label>
                          <input 
                            type="number" 
                            value={customPaper.height}
                            onChange={e => setCustomPaper({...customPaper, height: Number(e.target.value)})}
                            className="w-full p-2 rounded-lg border border-border text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="p-4 border-t border-border bg-bg-secondary/50 flex gap-2 sticky bottom-0 z-20">
              {step === 'crop' && (
                <>
                  <button 
                    onClick={() => setStep('upload')}
                    className="flex-1 btn bg-white border border-border text-text-primary hover:bg-bg-secondary text-sm"
                  >
                    Back
                  </button>
                  <button 
                    onClick={handleCropComplete}
                    disabled={!completedCrop?.width || !completedCrop?.height}
                    className="flex-1 btn btn-primary flex items-center justify-center gap-2 text-sm"
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
                    className="flex-1 btn bg-white border border-border text-text-primary hover:bg-bg-secondary text-sm"
                  >
                    Back
                  </button>
                  <button 
                    onClick={() => setStep('print')}
                    disabled={isProcessing}
                    className="flex-1 btn btn-primary flex items-center justify-center gap-2 text-sm"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {step === 'print' && (
                <>
                  <button 
                    onClick={() => setStep('process')}
                    className="flex-1 btn bg-white border border-border text-text-primary hover:bg-bg-secondary text-sm"
                  >
                    Back
                  </button>
                  <button 
                    onClick={handleDownload}
                    className="flex-1 btn btn-primary flex items-center justify-center gap-2 text-sm"
                  >
                    Download <Download className="w-4 h-4" />
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

