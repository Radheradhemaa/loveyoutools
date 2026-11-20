import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Download, Layout, Sliders, Loader2, X, Scissors, Wand2, ArrowRight, Image as ImageIcon, Crop, Sparkles, Printer, Check, ZoomIn, ZoomOut, Maximize2, Undo, Redo, RefreshCw, Upload, FileText, Shirt, RotateCw, FlipHorizontal2, Move, Eye, EyeOff, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import jsPDF from 'jspdf';
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import ToolLayout from '../components/tool-system/ToolLayout';
import { removeBackground as runBgRemoval, ensurePreloaded } from '../lib/bgRemoval';
import { drawSteppedHighQuality } from '../lib/touchupCanvas';
import {
  SUIT_CATALOG,
  DEFAULT_SUIT_TRANSFORM,
  loadProcessedSuit,
  detectAutoSuitPlacement,
  compositeSubjectWithSuit,
  renderSuitLayerToCanvas,
  getSuitFrameBox,
  type SuitCategory,
  type SuitTransform,
  type ProcessedSuit,
} from '../lib/suitOverlay';

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
  { id: 'a5', name: 'A5 / Half A4 (210 x 148 mm)', width: 210, height: 148 },
  { id: '4x6', name: '4 x 6 inch', width: 101.6, height: 152.4 },
  { id: '5x7', name: '5 x 7 inch', width: 127, height: 177.8 },
  { id: 'custom', name: 'Custom Size', width: 210, height: 297 },
  { id: 'custom-grid', name: 'Custom Grid (A4)', width: 210, height: 297 },
];

const COLORS = [
  { name: 'Pure White', value: '#ffffff' },
  { name: 'Blue', value: '#0000ff' },
  { name: 'Navy Blue', value: '#1e3a8a' },
  { name: 'Light Blue', value: '#E6F0FF' },
  { name: 'Light Grey', value: '#eeeeee' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Transparent', value: 'transparent' }
];

type Step = 'crop' | 'edit' | 'print';



export default function PassportPhotoMaker() {
  const [step, setStep] = useState<Step>('crop');
  
  // Preload AI on mount to make background removal instant later
  useEffect(() => {
    ensurePreloaded().catch(console.error);
  }, []);
  
  // Image States
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const initialFilesProcessed = useRef(false);
  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [bgRemovedImageSrc, setBgRemovedImageSrc] = useState<string | null>(null);
  const [finalImageSrc, setFinalImageSrc] = useState<string | null>(null);
  const [isProcessingFilters, setIsProcessingFilters] = useState(false);
  const [printImageElement, setPrintImageElement] = useState<HTMLImageElement | null>(null);
  const [directPrintTileSrc, setDirectPrintTileSrc] = useState<string | null>(null);
  const directPrintTileKeyRef = useRef<string>('');
  const directPrintTileImgRef = useRef<HTMLImageElement | null>(null);
  const lastDirectPrintBlobUrlRef = useRef<string | null>(null);
  
  // Crop States
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [completedPercentCrop, setCompletedPercentCrop] = useState<CropType>();
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(0.8); // Default zoom at 80%
  
  // Settings States
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[1]); // Default 35x45
  const [bgColor, setBgColor] = useState(COLORS[0].value);
  const [customColor, setCustomColor] = useState('#ffffff');
  const [customBgImage, setCustomBgImage] = useState<string | null>(null);
  const customBgImgRef = useRef<HTMLImageElement | null>(null);
  const bgUploadInputRef = useRef<HTMLInputElement>(null);
  const [dpi, setDpi] = useState(600);
  
  // Adjustments & Shoulder Extensions
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [sharpness, setSharpness] = useState(0);
  const [smoothness, setSmoothness] = useState(0);
  const [edgeSoftness, setEdgeSoftness] = useState(0);
  const [beautyFace, setBeautyFace] = useState(0);
  const [isUltraHD, setIsUltraHD] = useState(false);
  
  // Frame Border Controls
  const [borderThickness, setBorderThickness] = useState(2); // Standard 2px thin border

  // Formal Suit / Outfit Overlay States
  const [suitCategory, setSuitCategory] = useState<SuitCategory>('all');
  const [selectedSuitId, setSelectedSuitId] = useState<string | null>(null);
  const [customSuitSrc, setCustomSuitSrc] = useState<string | null>(null);
  const suitUploadInputRef = useRef<HTMLInputElement>(null);
  const [processedSuit, setProcessedSuit] = useState<ProcessedSuit | null>(null);
  const [isLoadingSuit, setIsLoadingSuit] = useState(false);
  const [suitThumbs, setSuitThumbs] = useState<Record<string, string>>({});
  const [suitTransform, setSuitTransform] = useState<SuitTransform>(DEFAULT_SUIT_TRANSFORM);
  const [showSuitHandles, setShowSuitHandles] = useState(true);
  const [isDraggingSuit, setIsDraggingSuit] = useState(false);
  const hasAutoFittedSuitRef = useRef(false);

  // Fast Two-Stage Composite Refs (instant 60fps suit adjustment + background switch)
  const refinedSubjectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editLiveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editFrameRef = useRef<HTMLDivElement | null>(null);
  const lastFinalBlobUrlRef = useRef<string | null>(null);
  const [subjectVersion, setSubjectVersion] = useState(0);

  type SuitDragMode =
    | 'move'
    | 'scale-nw'
    | 'scale-ne'
    | 'scale-sw'
    | 'scale-se'
    | 'width-w'
    | 'width-e'
    | 'height-s'
    | 'rotate';

  const suitDragRef = useRef<{
    mode: SuitDragMode;
    startClientX: number;
    startClientY: number;
    frameW: number;
    frameH: number;
    anchorClientX: number;
    anchorClientY: number;
    startDist: number;
    startAngleDeg: number;
    initial: SuitTransform;
  } | null>(null);
  
  // Debounced Adjustments for Performance
  const [appliedAdjustments, setAppliedAdjustments] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sharpness: 0,
    smoothness: 0,
    edgeSoftness: 0,
    beautyFace: 0,
    isUltraHD: false,
    borderThickness: 2,
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
        isUltraHD,
        borderThickness,
      });
    }, 150); // 150ms debounce
    return () => clearTimeout(timer);
  }, [brightness, contrast, saturation, sharpness, smoothness, edgeSoftness, beautyFace, isUltraHD, borderThickness]);
  
  // History for Undo/Redo (Photo Cutout & Suit Touchup Mask)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [touchupTarget, setTouchupTarget] = useState<'photo' | 'suit'>('photo');
  const [showSuitInTouchup, setShowSuitInTouchup] = useState(true);
  const [suitMaskHistory, setSuitMaskHistory] = useState<string[]>(['']);
  const [suitMaskHistoryIndex, setSuitMaskHistoryIndex] = useState(0);
  const [suitMaskVersion, setSuitMaskVersion] = useState(0);
  const suitEraseMaskRef = useRef<HTMLCanvasElement | null>(null);
  const touchupSuitBackRef = useRef<HTMLCanvasElement | null>(null);
  const touchupSuitFrontRef = useRef<HTMLCanvasElement | null>(null);

  const addToHistory = (src: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(src);
    if (newHistory.length > 20) newHistory.shift(); // Limit history size
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const addToSuitMaskHistory = (dataUrl: string) => {
    const next = suitMaskHistory.slice(0, suitMaskHistoryIndex + 1);
    next.push(dataUrl);
    if (next.length > 21) next.shift();
    setSuitMaskHistory(next);
    setSuitMaskHistoryIndex(next.length - 1);
  };

  const clearSuitEraseMask = () => {
    if (suitEraseMaskRef.current) {
      const mCtx = suitEraseMaskRef.current.getContext('2d');
      mCtx?.clearRect(0, 0, suitEraseMaskRef.current.width, suitEraseMaskRef.current.height);
      suitEraseMaskRef.current = null;
    }
    setSuitMaskHistory(['']);
    setSuitMaskHistoryIndex(0);
    setSuitMaskVersion((v) => v + 1);
  };

  const restoreSuitMaskFromDataUrl = (dataUrl: string) => {
    if (!dataUrl) {
      if (suitEraseMaskRef.current) {
        const mCtx = suitEraseMaskRef.current.getContext('2d');
        mCtx?.clearRect(0, 0, suitEraseMaskRef.current.width, suitEraseMaskRef.current.height);
      }
      setSuitMaskVersion((v) => v + 1);
      syncTouchupSuitOverlays();
      return;
    }

    const img = new Image();
    img.onload = () => {
      const targetW = workCanvasRef.current?.width || canvasDims?.width || img.naturalWidth || img.width;
      const targetH = workCanvasRef.current?.height || canvasDims?.height || img.naturalHeight || img.height;
      if (!suitEraseMaskRef.current) {
        suitEraseMaskRef.current = document.createElement('canvas');
      }
      suitEraseMaskRef.current.width = targetW;
      suitEraseMaskRef.current.height = targetH;
      const mCtx = suitEraseMaskRef.current.getContext('2d');
      if (mCtx) {
        mCtx.clearRect(0, 0, targetW, targetH);
        mCtx.drawImage(img, 0, 0, targetW, targetH);
      }
      setSuitMaskVersion((v) => v + 1);
      syncTouchupSuitOverlays();
    };
    img.src = dataUrl;
  };

  const updateCanvasFromSrc = (src: string | null) => {
    const workCanvas = workCanvasRef.current;
    if (!workCanvas || !croppedImageSrc) return;
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
    img.src = src || croppedImageSrc;
  };

  const undo = () => {
    if (isManualMode && touchupTarget === 'suit' && processedSuit) {
      if (suitMaskHistoryIndex > 0) {
        const prevIndex = suitMaskHistoryIndex - 1;
        setSuitMaskHistoryIndex(prevIndex);
        restoreSuitMaskFromDataUrl(suitMaskHistory[prevIndex] || '');
      }
      return;
    }
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      const prevSrc = history[prevIndex];
      isDrawingUpdateRef.current = false;
      // If we're back to the first item, it's the original cropped image
      setBgRemovedImageSrc(prevIndex === 0 ? null : prevSrc);
      updateCanvasFromSrc(prevSrc);
      // Clear final image to force re-render of adjustments
      setFinalImageSrc(null);
    }
  };

  const redo = () => {
    if (isManualMode && touchupTarget === 'suit' && processedSuit) {
      if (suitMaskHistoryIndex < suitMaskHistory.length - 1) {
        const nextIndex = suitMaskHistoryIndex + 1;
        setSuitMaskHistoryIndex(nextIndex);
        restoreSuitMaskFromDataUrl(suitMaskHistory[nextIndex] || '');
      }
      return;
    }
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      const nextSrc = history[nextIndex];
      isDrawingUpdateRef.current = false;
      setBgRemovedImageSrc(nextSrc);
      updateCanvasFromSrc(nextSrc);
      // Clear final image to force re-render of adjustments
      setFinalImageSrc(null);
    }
  };
  
  // Print States
  const [paperSize, setPaperSize] = useState(PAPER_SIZES[1]); // Default A4
  const [customPaper, setCustomPaper] = useState({ width: 210, height: 297 });
  const [customGrid, setCustomGrid] = useState({ rows: 2, cols: 4 });
  const [hasBorder, setHasBorder] = useState(true);
  const [hasCutLines, setHasCutLines] = useState(true);
  const [printOrientation, setPrintOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [printError, setPrintError] = useState<string | null>(null);
  const [printNotice, setPrintNotice] = useState<string | null>(null);
  const printPreviewAreaRef = useRef<HTMLDivElement | null>(null);
  const [previewViewport, setPreviewViewport] = useState<{ width: number; height: number }>({ width: 760, height: 560 });

  useEffect(() => {
    const el = printPreviewAreaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setPreviewViewport({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [step, imageSrc]);

  useEffect(() => {
    return () => {
      document.getElementById('passport-direct-print-sheet')?.remove();
      document.getElementById('passport-direct-print-style')?.remove();
    };
  }, []);
  
  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      setTimer(1);
      interval = setInterval(() => {
        setTimer((prev) => {
          const cap = 3.5;
          if (prev >= cap) return cap;
          return prev + 0.1;
        });
      }, 100);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Manual Touchup State
  const [isManualMode, setIsManualMode] = useState(false);
  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(25);
  const [isDrawing, setIsDrawing] = useState(false);
  const touchupCanvasRef = useRef<HTMLCanvasElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const origImgRef = useRef<HTMLImageElement | null>(null);
  const origDisplayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalPatternRef = useRef<CanvasPattern | null>(null);
  const displayRestorePatternRef = useRef<CanvasPattern | null>(null);
  const lastPosRef = useRef<{x: number, y: number} | null>(null);
  const isDrawingUpdateRef = useRef(false);
  const [canvasDims, setCanvasDims] = useState<{ width: number; height: number } | null>(null);

  const getManualCanvasCssDims = (dims: { width: number; height: number } | null) => {
    const baseEditH = typeof window !== 'undefined' ? Math.round(Math.min(540, Math.max(300, window.innerHeight * 0.58))) : 440;
    const frameH = Math.max(60, Math.round(baseEditH * zoom));
    const presetRatio = selectedPreset.id !== 'free'
      ? selectedPreset.width / selectedPreset.height
      : (dims ? dims.width / dims.height : (completedCrop && completedCrop.height ? completedCrop.width / completedCrop.height : 35 / 45));
    const frameW = Math.max(60, Math.round(frameH * presetRatio));

    let canvasCssW = frameW;
    let canvasCssH = frameH;
    if (dims && dims.width > 0 && dims.height > 0) {
      const fitScale = Math.min(frameW / dims.width, frameH / dims.height);
      canvasCssW = Math.max(1, Math.round(dims.width * fitScale));
      canvasCssH = Math.max(1, Math.round(dims.height * fitScale));
    }
    return { frameW, frameH, canvasCssW, canvasCssH };
  };

  const syncTouchupSuitOverlays = (targetW?: number, targetH?: number) => {
    const displayCanvas = touchupCanvasRef.current;
    const w = targetW || displayCanvas?.width || 0;
    const h = targetH || displayCanvas?.height || 0;
    if (w <= 0 || h <= 0) return;

    const backCanvas = touchupSuitBackRef.current;
    const frontCanvas = touchupSuitFrontRef.current;
    const shouldShow = Boolean(processedSuit && showSuitInTouchup);

    if (backCanvas) {
      if (backCanvas.width !== w) backCanvas.width = w;
      if (backCanvas.height !== h) backCanvas.height = h;
      if (shouldShow && bgRemovedImageSrc && processedSuit?.backCanvas) {
        renderSuitLayerToCanvas(backCanvas, processedSuit, suitTransform, 'back', suitEraseMaskRef.current);
      } else {
        backCanvas.getContext('2d')?.clearRect(0, 0, w, h);
      }
    }

    if (frontCanvas) {
      if (frontCanvas.width !== w) frontCanvas.width = w;
      if (frontCanvas.height !== h) frontCanvas.height = h;
      if (shouldShow && processedSuit) {
        renderSuitLayerToCanvas(frontCanvas, processedSuit, suitTransform, 'front', suitEraseMaskRef.current);
      } else {
        frontCanvas.getContext('2d')?.clearRect(0, 0, w, h);
      }
    }
  };

  const syncDisplayCanvas = (nativeW?: number, nativeH?: number) => {
    const displayCanvas = touchupCanvasRef.current;
    const workCanvas = workCanvasRef.current;
    if (!displayCanvas || !workCanvas || workCanvas.width === 0 || workCanvas.height === 0) return;

    const dims = nativeW && nativeH ? { width: nativeW, height: nativeH } : { width: workCanvas.width, height: workCanvas.height };
    const { canvasCssW, canvasCssH } = getManualCanvasCssDims(dims);
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    const targetW = Math.max(1, Math.round(canvasCssW * dpr));
    const targetH = Math.max(1, Math.round(canvasCssH * dpr));

    drawSteppedHighQuality(workCanvas, displayCanvas, targetW, targetH);
    syncTouchupSuitOverlays(targetW, targetH);

    if (origImgRef.current && (origImgRef.current.naturalWidth || origImgRef.current.width) > 0) {
      if (!origDisplayCanvasRef.current) {
        origDisplayCanvasRef.current = document.createElement('canvas');
      }
      drawSteppedHighQuality(origImgRef.current, origDisplayCanvasRef.current, targetW, targetH);
      const dCtx = displayCanvas.getContext('2d');
      if (dCtx) {
        displayRestorePatternRef.current = dCtx.createPattern(origDisplayCanvasRef.current, 'no-repeat');
      }
    }
  };

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
    const canvas = touchupCanvasRef.current;
    const nativeW = workCanvasRef.current?.width || canvasDims?.width || canvas?.width || 1;
    if (!canvas) return Math.max(12, brushSize);
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / nativeW;
    return Math.max(8, Math.round(brushSize * scale));
  };

  // --- Manual Touchup Logic ---
  useEffect(() => {
    if (isManualMode && step === 'edit') {
      if (isDrawingUpdateRef.current) {
        isDrawingUpdateRef.current = false;
        return;
      }
      
      let isMounted = true;
      const initCanvas = async () => {
        const displayCanvas = touchupCanvasRef.current;
        if (!displayCanvas || !croppedImageSrc) return;

        const origImg = new Image();
        await new Promise((resolve) => {
          origImg.onload = resolve;
          origImg.onerror = resolve; // Continue even on error to avoid hanging
          origImg.src = croppedImageSrc;
        });

        if (!isMounted) return;
        if (!origImg.complete || origImg.naturalWidth === 0) return;

        const natW = origImg.naturalWidth || origImg.width;
        const natH = origImg.naturalHeight || origImg.height;
        origImgRef.current = origImg;

        if (!workCanvasRef.current) {
          workCanvasRef.current = document.createElement('canvas');
        }
        const workCanvas = workCanvasRef.current;
        workCanvas.width = natW;
        workCanvas.height = natH;
        const workCtx = workCanvas.getContext('2d');
        if (!workCtx) return;

        setCanvasDims({ width: natW, height: natH });
        originalPatternRef.current = workCtx.createPattern(origImg, 'no-repeat');

        const currentImgSrc = bgRemovedImageSrc || croppedImageSrc;
        const currentImg = new Image();
        await new Promise((resolve) => {
          currentImg.onload = resolve;
          currentImg.onerror = resolve;
          currentImg.src = currentImgSrc;
        });

        if (!isMounted) return;
        if (!currentImg.complete || currentImg.naturalWidth === 0) return;
        
        workCtx.save();
        workCtx.globalCompositeOperation = 'source-over';
        workCtx.clearRect(0, 0, natW, natH);
        workCtx.imageSmoothingEnabled = true;
        workCtx.imageSmoothingQuality = 'high';
        workCtx.drawImage(currentImg, 0, 0, natW, natH);
        workCtx.restore();

        syncDisplayCanvas(natW, natH);
      };
      initCanvas();
      return () => { isMounted = false; };
    }
  }, [isManualMode, step, bgRemovedImageSrc]); // Now depends on bgRemovedImageSrc to update when AI finishes

  // Keep visible HiDPI canvas razor-sharp when zooming or changing preset in manual mode
  useEffect(() => {
    if (isManualMode && step === 'edit' && workCanvasRef.current && workCanvasRef.current.width > 0) {
      syncDisplayCanvas();
    }
  }, [zoom, selectedPreset, isManualMode, step]);

  // Keep live suit layers synced in Manual Touchup whenever suit, transform, mask, or visibility changes
  useEffect(() => {
    if (isManualMode && step === 'edit') {
      syncTouchupSuitOverlays();
    }
  }, [isManualMode, step, processedSuit, suitTransform, suitMaskVersion, bgRemovedImageSrc, showSuitInTouchup]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = touchupCanvasRef.current;
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

  const ensureSuitEraseMask = (width: number, height: number): HTMLCanvasElement => {
    if (!suitEraseMaskRef.current) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      suitEraseMaskRef.current = c;
      return c;
    }
    const existing = suitEraseMaskRef.current;
    if (existing.width !== width || existing.height !== height) {
      const resized = document.createElement('canvas');
      resized.width = width;
      resized.height = height;
      const rCtx = resized.getContext('2d');
      if (rCtx && existing.width > 0 && existing.height > 0) {
        rCtx.drawImage(existing, 0, 0, width, height);
      }
      suitEraseMaskRef.current = resized;
      return resized;
    }
    return existing;
  };

  const paintSuitMaskDot = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    mode: 'erase' | 'restore'
  ) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.globalCompositeOperation = mode === 'erase' ? 'source-over' : 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
  };

  const paintSuitMaskSegment = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineW: number,
    mode: 'erase' | 'restore'
  ) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = mode === 'erase' ? 'source-over' : 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.stroke();
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    updateTouchupCursor(e, 'touches' in e);
    const pos = getCoordinates(e);
    if (!pos || !workCanvasRef.current || !touchupCanvasRef.current) return;
    setIsDrawing(true);
    lastPosRef.current = pos;

    const workCanvas = workCanvasRef.current;
    if (touchupTarget === 'suit' && processedSuit) {
      const maskCanvas = ensureSuitEraseMask(workCanvas.width, workCanvas.height);
      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        paintSuitMaskDot(maskCtx, pos.x, pos.y, brushSize / 2, brushMode);
      }
      syncTouchupSuitOverlays();
      return;
    }

    const displayCanvas = touchupCanvasRef.current;
    const workCtx = workCanvas.getContext('2d');
    const displayCtx = displayCanvas.getContext('2d');

    if (workCtx) {
      paintBrushDot(workCtx, pos.x, pos.y, brushSize / 2, brushMode, originalPatternRef.current);
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
    if (e.cancelable) e.preventDefault();
    updateTouchupCursor(e, 'touches' in e);
    if (!isDrawing || !lastPosRef.current || !workCanvasRef.current || !touchupCanvasRef.current) return;

    const currentPos = getCoordinates(e);
    if (!currentPos) return;

    const workCanvas = workCanvasRef.current;
    if (touchupTarget === 'suit' && processedSuit) {
      const maskCanvas = ensureSuitEraseMask(workCanvas.width, workCanvas.height);
      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        paintSuitMaskSegment(
          maskCtx,
          lastPosRef.current.x,
          lastPosRef.current.y,
          currentPos.x,
          currentPos.y,
          brushSize,
          brushMode
        );
      }
      lastPosRef.current = currentPos;
      syncTouchupSuitOverlays();
      return;
    }

    const displayCanvas = touchupCanvasRef.current;
    const workCtx = workCanvas.getContext('2d');
    const displayCtx = displayCanvas.getContext('2d');

    if (workCtx) {
      paintBrushSegment(
        workCtx,
        lastPosRef.current.x,
        lastPosRef.current.y,
        currentPos.x,
        currentPos.y,
        brushSize,
        brushMode,
        originalPatternRef.current
      );
    }
    if (displayCtx && workCanvas.width > 0 && workCanvas.height > 0) {
      const dxScale = displayCanvas.width / workCanvas.width;
      const dyScale = displayCanvas.height / workCanvas.height;
      paintBrushSegment(
        displayCtx,
        lastPosRef.current.x * dxScale,
        lastPosRef.current.y * dyScale,
        currentPos.x * dxScale,
        currentPos.y * dyScale,
        Math.max(1, brushSize * dxScale),
        brushMode,
        displayRestorePatternRef.current
      );
    }
    lastPosRef.current = currentPos;
  };

  const stopDrawing = () => {
    if (isDrawing && workCanvasRef.current) {
      setIsDrawing(false);
      lastPosRef.current = null;
      if (touchupTarget === 'suit' && processedSuit) {
        const maskUrl = suitEraseMaskRef.current ? suitEraseMaskRef.current.toDataURL('image/png') : '';
        addToSuitMaskHistory(maskUrl);
        setSuitMaskVersion((v) => v + 1);
        syncTouchupSuitOverlays();
      } else {
        const result = workCanvasRef.current.toDataURL('image/png', 1.0);
        isDrawingUpdateRef.current = true;
        setBgRemovedImageSrc(result);
        addToHistory(result);
        syncDisplayCanvas();
      }
    }
    if (cursorFadeTimerRef.current) clearTimeout(cursorFadeTimerRef.current);
    cursorFadeTimerRef.current = setTimeout(() => {
      setTouchupCursor(null);
    }, 450);
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

    // Preserve high-definition detail (up to 1600px ~ 900 DPI for 35x45mm) while keeping AI bg removal fast
    const MAX_CROP_DIM = 1600;
    const rawCropW = Math.max(1, Math.round(cropWidth));
    const rawCropH = Math.max(1, Math.round(cropHeight));
    let targetWidth = rawCropW;
    let targetHeight = rawCropH;
    
    if (targetWidth > targetHeight) {
      if (targetWidth > MAX_CROP_DIM) {
        targetHeight = Math.round((targetHeight * MAX_CROP_DIM) / targetWidth);
        targetWidth = MAX_CROP_DIM;
      }
    } else {
      if (targetHeight > MAX_CROP_DIM) {
        targetWidth = Math.round((targetWidth * MAX_CROP_DIM) / targetHeight);
        targetHeight = MAX_CROP_DIM;
      }
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    if (rawCropW > targetWidth * 2 && rawCropH > targetHeight * 2) {
      // Extract full-res crop first, then progressively downscale to preserve crisp studio micro-detail
      const rawCanvas = document.createElement('canvas');
      rawCanvas.width = rawCropW;
      rawCanvas.height = rawCropH;
      const rawCtx = rawCanvas.getContext('2d', { alpha: true });
      if (rawCtx) {
        rawCtx.imageSmoothingEnabled = true;
        rawCtx.imageSmoothingQuality = 'high';
        rawCtx.drawImage(imgRef.current, cropX, cropY, cropWidth, cropHeight, 0, 0, rawCropW, rawCropH);
        drawSteppedHighQuality(rawCanvas, canvas, targetWidth, targetHeight);
      } else {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(imgRef.current, cropX, cropY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);
      }
    } else {
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
        targetWidth,
        targetHeight
      );
    }

    // Use toBlob for better performance
    canvas.toBlob((blob) => {
      if (!blob) return;
      const croppedUrl = URL.createObjectURL(blob);
      setCanvasDims({ width: targetWidth, height: targetHeight });
      setCroppedImageSrc(croppedUrl);
      setBgRemovedImageSrc(null);
      setFinalImageSrc(null);
      setHistory([croppedUrl]);
      setHistoryIndex(0);
      clearSuitEraseMask();
      setTouchupTarget('photo');
      setStep('edit');
      setZoom(1);
      
      // Auto-trigger background removal for "instant" feel
      // Trigger as fast as possible, no 300ms waiting
      setTimeout(() => {
        removeBackgroundFromSrc(croppedUrl);
      }, 0);
    }, 'image/png');
  };

  const removeBackgroundFromSrc = async (src: string) => {
    const showProcessingLoader = setTimeout(() => {
      setIsProcessing(true);
    }, 150); // Show generic loader only if it takes more than 150ms
    
    setProcessingError(null);
    setIsManualMode(false);
    setStatusText('Initializing AI Engine...');
    
    try {
      const rawBlob = await runBgRemoval(
        src,
        (status) => {
          setStatusText(status);
        },
        false, // forceWhiteBackground
        false, // highPrecisionBoundary
        {
          engine: 'strict_subject',
          isolateMainSubject: true,
          removeBackgroundNoise: true,
          severTouchingObjects: true,
          objectStrictness: 85,
          preserveEarsAndShoulders: true,
          extendLeftShoulder: true,
          decontaminateHalos: true,
        }
      );

      const url = URL.createObjectURL(rawBlob);
      setBgRemovedImageSrc(url);
      addToHistory(url);

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
      clearTimeout(showProcessingLoader);
      setIsProcessing(false);
      setStatusText(''); // Clear status text on completion or error
    }
  };

  const handleResetCutout = () => {
    setBgRemovedImageSrc(null);
    if (croppedImageSrc) {
      addToHistory(croppedImageSrc);
      updateCanvasFromSrc(croppedImageSrc);
    }
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
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => resolve(new Blob());
      img.src = src;
    });
  };

  const removeBackground = async () => {
    if (!croppedImageSrc) return;
    await removeBackgroundFromSrc(croppedImageSrc);
  };

  // --- Suit Thumbnail Preloading & Selection Loader ---
  useEffect(() => {
    if (step !== 'edit') return;
    let cancelled = false;
    SUIT_CATALOG.forEach((item) => {
      if (suitThumbs[item.id]) return;
      loadProcessedSuit(item.id, item.src, item.isChromaKey)
        .then((res) => {
          if (cancelled) return;
          setSuitThumbs((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: res.thumbDataUrl }));
        })
        .catch(() => {
          // Ignore thumbnail preload error; fallback displays catalog src
        });
    });
    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    clearSuitEraseMask();
    setTouchupTarget('photo');
    if (!selectedSuitId) {
      setProcessedSuit(null);
      setIsLoadingSuit(false);
      hasAutoFittedSuitRef.current = false;
      return;
    }

    let cancelled = false;
    setIsLoadingSuit(true);

    const catalogItem = SUIT_CATALOG.find((s) => s.id === selectedSuitId);
    const src = selectedSuitId === 'custom' ? customSuitSrc : catalogItem?.src;
    const forceKey = selectedSuitId === 'custom' ? undefined : catalogItem?.isChromaKey;

    if (!src) {
      setProcessedSuit(null);
      setIsLoadingSuit(false);
      return;
    }

    loadProcessedSuit(selectedSuitId, src, forceKey)
      .then((loaded) => {
        if (cancelled) return;
        setProcessedSuit(loaded);
        setIsLoadingSuit(false);
        setShowSuitHandles(true);
        if (!hasAutoFittedSuitRef.current) {
          hasAutoFittedSuitRef.current = true;
          const autoFit = detectAutoSuitPlacement(refinedSubjectCanvasRef.current, loaded);
          setSuitTransform((prev) => ({
            ...prev,
            ...autoFit,
          }));
        }
      })
      .catch((err) => {
        console.error('Failed to process suit overlay:', err);
        if (!cancelled) {
          setIsLoadingSuit(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSuitId, customSuitSrc]);

  const handleAutoFitSuit = () => {
    if (!processedSuit) return;
    const autoFit = detectAutoSuitPlacement(refinedSubjectCanvasRef.current, processedSuit);
    setSuitTransform((prev) => ({
      ...prev,
      ...autoFit,
      flipX: false,
      neckCutOffset: 0,
    }));
  };

  const handleResetSuitAdjustments = () => {
    setSuitTransform({ ...DEFAULT_SUIT_TRANSFORM });
  };

  const nudgeSuit = (dx: number, dy: number) => {
    setSuitTransform((prev) => ({
      ...prev,
      x: Math.max(-45, Math.min(45, Math.round((prev.x + dx) * 10) / 10)),
      y: Math.max(25, Math.min(110, Math.round((prev.y + dy) * 10) / 10)),
    }));
  };

  const startSuitDrag = (
    e: React.PointerEvent,
    mode: SuitDragMode,
    frameW: number,
    frameH: number
  ) => {
    if (!processedSuit || !editFrameRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = editFrameRef.current.getBoundingClientRect();
    const box = getSuitFrameBox(frameW, frameH, processedSuit, suitTransform);
    const scaleCssX = rect.width / Math.max(1, frameW);
    const scaleCssY = rect.height / Math.max(1, frameH);
    const anchorClientX = rect.left + box.anchorX * scaleCssX;
    const anchorClientY = rect.top + box.anchorY * scaleCssY;

    const dx = e.clientX - anchorClientX;
    const dy = e.clientY - anchorClientY;
    const startDist = Math.max(16, Math.hypot(dx, dy));
    const startAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    suitDragRef.current = {
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      frameW: rect.width,
      frameH: rect.height,
      anchorClientX,
      anchorClientY,
      startDist,
      startAngleDeg,
      initial: { ...suitTransform },
    };
    setIsDraggingSuit(true);
  };

  useEffect(() => {
    if (!isDraggingSuit) return;

    const handlePointerMove = (e: PointerEvent) => {
      const drag = suitDragRef.current;
      if (!drag) return;
      e.preventDefault();

      const dxPx = e.clientX - drag.startClientX;
      const dyPx = e.clientY - drag.startClientY;

      if (drag.mode === 'move') {
        let nextX = drag.initial.x + (dxPx / Math.max(1, drag.frameW)) * 100;
        if (Math.abs(nextX) < 0.9) nextX = 0; // Soft magnetic center snap
        const nextY = drag.initial.y + (dyPx / Math.max(1, drag.frameH)) * 100;
        setSuitTransform((prev) => ({
          ...prev,
          x: Math.max(-45, Math.min(45, Math.round(nextX * 10) / 10)),
          y: Math.max(25, Math.min(110, Math.round(nextY * 10) / 10)),
        }));
      } else if (
        drag.mode === 'scale-nw' ||
        drag.mode === 'scale-ne' ||
        drag.mode === 'scale-sw' ||
        drag.mode === 'scale-se'
      ) {
        const curDist = Math.max(16, Math.hypot(e.clientX - drag.anchorClientX, e.clientY - drag.anchorClientY));
        const ratio = curDist / drag.startDist;
        const nextScale = Math.max(0.45, Math.min(1.85, Math.round(drag.initial.scale * ratio * 100) / 100));
        setSuitTransform((prev) => ({ ...prev, scale: nextScale }));
      } else if (drag.mode === 'width-w' || drag.mode === 'width-e') {
        const rad = (-drag.initial.rotation * Math.PI) / 180;
        const localDx = dxPx * Math.cos(rad) - dyPx * Math.sin(rad);
        const signedDx = drag.mode === 'width-e' ? localDx : -localDx;
        const deltaRatio = (signedDx * 2) / Math.max(40, drag.frameW * drag.initial.scale);
        const nextScaleX = Math.max(0.7, Math.min(1.45, Math.round((drag.initial.scaleX + deltaRatio) * 100) / 100));
        setSuitTransform((prev) => ({ ...prev, scaleX: nextScaleX }));
      } else if (drag.mode === 'height-s') {
        const rad = (-drag.initial.rotation * Math.PI) / 180;
        const localDy = dxPx * Math.sin(rad) + dyPx * Math.cos(rad);
        const deltaRatio = localDy / Math.max(40, drag.frameH * 0.55);
        const nextScaleY = Math.max(0.7, Math.min(1.5, Math.round((drag.initial.scaleY + deltaRatio) * 100) / 100));
        setSuitTransform((prev) => ({ ...prev, scaleY: nextScaleY }));
      } else if (drag.mode === 'rotate') {
        const curAngle = (Math.atan2(e.clientY - drag.anchorClientY, e.clientX - drag.anchorClientX) * 180) / Math.PI;
        let diff = curAngle - drag.startAngleDeg;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        let nextRot = drag.initial.rotation + diff;
        if (Math.abs(nextRot) < 1.2) nextRot = 0; // Magnetic snap to 0°
        nextRot = Math.max(-25, Math.min(25, Math.round(nextRot * 2) / 2));
        setSuitTransform((prev) => ({ ...prev, rotation: nextRot }));
      }
    };

    const handlePointerUp = () => {
      suitDragRef.current = null;
      setIsDraggingSuit(false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDraggingSuit]);

  // --- 4A. Stage 1: Subject Adjustments, Skin Smoothing & Sharpness (Cached Canvas) ---
  useEffect(() => {
    if (isManualMode) return;
    const sourceImage = bgRemovedImageSrc || croppedImageSrc;
    if (!sourceImage) {
      refinedSubjectCanvasRef.current = null;
      setFinalImageSrc(null);
      return;
    }

    let isMounted = true;
    const img = new Image();
    img.onload = () => {
      if (!isMounted) return;
      setIsProcessingFilters(true);

      requestAnimationFrame(() => {
        if (!isMounted) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d', { alpha: true });
        if (!tempCtx) {
          setIsProcessingFilters(false);
          return;
        }

        const b = appliedAdjustments.brightness;
        let c = appliedAdjustments.contrast;
        let s = appliedAdjustments.saturation;

        if (appliedAdjustments.isUltraHD) {
          c += 15;
          s += 20;
        }

        let filterString = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
        if (appliedAdjustments.edgeSoftness > 0) {
          const edgeBlur = appliedAdjustments.edgeSoftness / 50;
          filterString += ` drop-shadow(0 0 ${edgeBlur}px rgba(0,0,0,0.15)) blur(${edgeBlur / 2}px)`;
        }

        tempCtx.filter = filterString;
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(img, 0, 0);
        tempCtx.filter = 'none';

        const finalSharpness = appliedAdjustments.isUltraHD ? (appliedAdjustments.sharpness + 60) : appliedAdjustments.sharpness;
        const smoothnessVal = appliedAdjustments.smoothness;
        const beautyVal = appliedAdjustments.beautyFace;

        if (finalSharpness > 0 || smoothnessVal > 0 || beautyVal > 0) {
          const sw = tempCanvas.width;
          const sh = tempCanvas.height;
          const imageData = tempCtx.getImageData(0, 0, sw, sh);
          const pixels = new Uint32Array(imageData.data.buffer);
          const output = tempCtx.createImageData(sw, sh);
          const dst = new Uint32Array(output.data.buffer);

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
            const offset = y * sw;
            for (let x = 0; x < sw; x++) {
              const i = offset + x;
              const p = pixels[i];
              const alpha = (p >> 24) & 0xff;

              if (alpha === 0) continue;

              if (x === 0 || x === sw - 1 || y === 0 || y === sh - 1) {
                dst[i] = p;
                continue;
              }

              const r_orig = p & 0xff;
              const g_orig = (p >> 8) & 0xff;
              const b_orig = (p >> 16) & 0xff;

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
                  const rowOffset = ny * sw;
                  for (let dx = -2; dx <= 2; dx++) {
                    const nx = x + dx;
                    const np = pixels[rowOffset + nx];
                    const nAlpha = (np >> 24) & 0xff;
                    if (nAlpha === 0) continue;

                    const nr = np & 0xff;
                    const ng = (np >> 8) & 0xff;
                    const nb = (np >> 16) & 0xff;

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
                  finalR = (r_orig * (1 - blend) + smoothedR * blend) | 0;
                  finalG = (g_orig * (1 - blend) + smoothedG * blend) | 0;
                  finalB = (b_orig * (1 - blend) + smoothedB * blend) | 0;
                }

                if (beautyVal > 0) {
                  const beautyFactor = beautyVal / 100;
                  finalR = Math.min(255, finalR * (1.0 + 0.08 * beautyFactor)) | 0;
                  finalG = Math.min(255, finalG * (1.0 + 0.05 * beautyFactor)) | 0;
                  finalB = Math.min(255, finalB * (1.0 + 0.03 * beautyFactor)) | 0;
                }
              }

              // 2. High-precision Laplacian Sharpening
              if (finalSharpness > 0) {
                const iUp = i - sw;
                const iDown = i + sw;
                const iLeft = i - 1;
                const iRight = i + 1;

                const pUp = pixels[iUp];
                const pDown = pixels[iDown];
                const pLeft = pixels[iLeft];
                const pRight = pixels[iRight];

                const getR = (px: number) => ((px >> 24) & 0xff) === 0 ? r_orig : (px & 0xff);
                const getG = (px: number) => ((px >> 24) & 0xff) === 0 ? g_orig : ((px >> 8) & 0xff);
                const getB = (px: number) => ((px >> 24) & 0xff) === 0 ? b_orig : ((px >> 16) & 0xff);

                const r_sharp = (finalR * b_val - (getR(pUp) + getR(pDown) + getR(pLeft) + getR(pRight)) * a);
                const g_sharp = (finalG * b_val - (getG(pUp) + getG(pDown) + getG(pLeft) + getG(pRight)) * a);
                const b_sharp = (finalB * b_val - (getB(pUp) + getB(pDown) + getB(pLeft) + getB(pRight)) * a);

                const fR = r_sharp < 0 ? 0 : r_sharp > 255 ? 255 : (r_sharp | 0);
                const fG = g_sharp < 0 ? 0 : g_sharp > 255 ? 255 : (g_sharp | 0);
                const fB = b_sharp < 0 ? 0 : b_sharp > 255 ? 255 : (b_sharp | 0);

                const skinWeight = isSkin ? 0.15 : 1.0;
                finalR = (finalR * (1 - skinWeight) + fR * skinWeight) | 0;
                finalG = (finalG * (1 - skinWeight) + fG * skinWeight) | 0;
                finalB = (finalB * (1 - skinWeight) + fB * skinWeight) | 0;
              }

              const finalAlpha = alpha <= 2 ? 0 : alpha;
              dst[i] = finalR | (finalG << 8) | (finalB << 16) | (finalAlpha << 24);
            }
          }
          tempCtx.putImageData(output, 0, 0);
        }

        if (isMounted) {
          refinedSubjectCanvasRef.current = tempCanvas;
          setSubjectVersion((v) => v + 1);
          setIsProcessingFilters(false);
        }
      });
    };
    img.onerror = () => {
      if (isMounted) setFinalImageSrc(sourceImage);
      setIsProcessingFilters(false);
    };
    img.src = sourceImage;
    return () => {
      isMounted = false;
    };
  }, [croppedImageSrc, bgRemovedImageSrc, appliedAdjustments, isManualMode]);

  // --- 4B. Stage 2: Instant Real-Time Compositing (Background + Suit + Subject + Border) ---
  useEffect(() => {
    if (isManualMode) return;
    const subjectCanvas = refinedSubjectCanvasRef.current;
    if (!subjectCanvas) return;

    let isMounted = true;
    const canvas = compositeCanvasRef.current || document.createElement('canvas');
    compositeCanvasRef.current = canvas;
    canvas.width = subjectCanvas.width;
    canvas.height = subjectCanvas.height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Background
    if (bgColor === 'custom-image' && customBgImgRef.current) {
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

    // 2. Subject + Formal Suit (rear collar behind neck + optional old-shoulder mask + front tailored suit + manual suit touchup mask)
    compositeSubjectWithSuit(
      ctx,
      canvas.width,
      canvas.height,
      subjectCanvas,
      processedSuit,
      suitTransform,
      Boolean(bgRemovedImageSrc),
      suitEraseMaskRef.current
    );

    // 3. Border on opaque studio backgrounds
    if (hasBorder && bgColor !== 'transparent') {
      ctx.strokeStyle = '#000000';
      const thickness = Math.max(1, Math.round((appliedAdjustments.borderThickness / 2) * Math.max(1, canvas.width / 350)));
      ctx.lineWidth = thickness;
      ctx.strokeRect(thickness / 2, thickness / 2, canvas.width - thickness, canvas.height - thickness);
    }

    // 4. Blit immediately to live Edit preview canvas for smooth 60fps suit adjustment
    const liveCanvas = editLiveCanvasRef.current;
    if (liveCanvas) {
      if (liveCanvas.width !== canvas.width || liveCanvas.height !== canvas.height) {
        liveCanvas.width = canvas.width;
        liveCanvas.height = canvas.height;
      }
      const liveCtx = liveCanvas.getContext('2d');
      if (liveCtx) {
        liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
        liveCtx.drawImage(canvas, 0, 0);
      }
    }

    // 5. Bake full-resolution PNG blob for Print / PDF / JPG / Single export (debounced while actively dragging)
    const blobDelay = isDraggingSuit ? 120 : 0;
    const blobTimer = setTimeout(() => {
      if (!isMounted) return;
      canvas.toBlob((blob) => {
        if (blob && isMounted) {
          const url = URL.createObjectURL(blob);
          const prevUrl = lastFinalBlobUrlRef.current;
          lastFinalBlobUrlRef.current = url;
          setFinalImageSrc(url);
          if (prevUrl) {
            setTimeout(() => URL.revokeObjectURL(prevUrl), 1500);
          }
        }
      }, 'image/png');
    }, blobDelay);

    return () => {
      isMounted = false;
      clearTimeout(blobTimer);
    };
  }, [
    subjectVersion,
    bgColor,
    customColor,
    customBgImage,
    hasBorder,
    appliedAdjustments.borderThickness,
    processedSuit,
    suitTransform,
    suitMaskVersion,
    bgRemovedImageSrc,
    isManualMode,
    isDraggingSuit,
    step,
  ]);

  useEffect(() => {
    if (!finalImageSrc) {
      setPrintImageElement(null);
      directPrintTileKeyRef.current = '';
      directPrintTileImgRef.current = null;
      if (lastDirectPrintBlobUrlRef.current) {
        URL.revokeObjectURL(lastDirectPrintBlobUrlRef.current);
        lastDirectPrintBlobUrlRef.current = null;
      }
      setDirectPrintTileSrc(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setPrintImageElement(img);
    };
    img.src = finalImageSrc;

    return () => {
      cancelled = true;
    };
  }, [finalImageSrc]);

  // --- Physical DPI & Exact Print Layout Helpers ---
  const dataURLtoBytes = (dataurl: string): { bytes: Uint8Array; mime: string } => {
    if (!dataurl || typeof dataurl !== 'string') return { bytes: new Uint8Array(0), mime: 'image/png' };
    const arr = dataurl.split(',');
    if (arr.length < 2) return { bytes: new Uint8Array(0), mime: 'image/png' };
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return { bytes: u8arr, mime };
  };

  const injectJpegDpiBytes = (bytes: Uint8Array, targetDpi: number): Uint8Array => {
    const safeDpi = Math.max(72, Math.min(2400, Math.round(targetDpi)));
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

    // Check existing JFIF APP0 marker right after SOI
    if (
      bytes.length >= 18 &&
      bytes[2] === 0xff &&
      bytes[3] === 0xe0 &&
      bytes[6] === 0x4a && // 'J'
      bytes[7] === 0x46 && // 'F'
      bytes[8] === 0x49 && // 'I'
      bytes[9] === 0x46 && // 'F'
      bytes[10] === 0x00
    ) {
      const patched = new Uint8Array(bytes);
      patched[13] = 1; // units = pixels per inch
      patched[14] = (safeDpi >> 8) & 0xff;
      patched[15] = safeDpi & 0xff;
      patched[16] = (safeDpi >> 8) & 0xff;
      patched[17] = safeDpi & 0xff;
      return patched;
    }

    // Splice fresh JFIF APP0 segment after SOI (0xFF 0xD8)
    const app0 = new Uint8Array([
      0xff, 0xe0, 0x00, 0x10,
      0x4a, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01,
      0x01,
      (safeDpi >> 8) & 0xff, safeDpi & 0xff,
      (safeDpi >> 8) & 0xff, safeDpi & 0xff,
      0x00, 0x00,
    ]);
    const out = new Uint8Array(bytes.length + app0.length);
    out.set(bytes.slice(0, 2), 0);
    out.set(app0, 2);
    out.set(bytes.slice(2), 2 + app0.length);
    return out;
  };

  const crc32 = (data: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      c ^= data[i];
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const injectPngDpiBytes = (bytes: Uint8Array, targetDpi: number): Uint8Array => {
    const safeDpi = Math.max(72, Math.min(2400, Math.round(targetDpi)));
    // Verify PNG signature + IHDR chunk minimum size (8 + 25 = 33)
    if (
      bytes.length < 33 ||
      bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47
    ) {
      return bytes;
    }
    const ihdrLength = ((bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11]) >>> 0;
    const insertPos = 8 + 4 + 4 + ihdrLength + 4;
    if (insertPos > bytes.length) return bytes;

    const ppm = Math.round(safeDpi / 0.0254);
    const chunk = new Uint8Array(21);
    // Chunk length = 9
    chunk[0] = 0; chunk[1] = 0; chunk[2] = 0; chunk[3] = 9;
    // Type = 'pHYs'
    chunk[4] = 0x70; chunk[5] = 0x48; chunk[6] = 0x59; chunk[7] = 0x73;
    // Pixels per unit X (big-endian uint32)
    chunk[8] = (ppm >>> 24) & 0xff;
    chunk[9] = (ppm >>> 16) & 0xff;
    chunk[10] = (ppm >>> 8) & 0xff;
    chunk[11] = ppm & 0xff;
    // Pixels per unit Y (big-endian uint32)
    chunk[12] = (ppm >>> 24) & 0xff;
    chunk[13] = (ppm >>> 16) & 0xff;
    chunk[14] = (ppm >>> 8) & 0xff;
    chunk[15] = ppm & 0xff;
    // Unit specifier = 1 (meter)
    chunk[16] = 1;

    const crc = crc32(chunk.slice(4, 17));
    chunk[17] = (crc >>> 24) & 0xff;
    chunk[18] = (crc >>> 16) & 0xff;
    chunk[19] = (crc >>> 8) & 0xff;
    chunk[20] = crc & 0xff;

    const out = new Uint8Array(bytes.length + chunk.length);
    out.set(bytes.slice(0, insertPos), 0);
    out.set(chunk, insertPos);
    out.set(bytes.slice(insertPos), insertPos + chunk.length);
    return out;
  };

  const computePrintLayout = () => {
    const targetPreset = selectedPreset.id === 'free' ? PRESETS[1] : selectedPreset;
    const isHorizontal = printOrientation === 'horizontal';
    const baseW = isHorizontal ? targetPreset.height : targetPreset.width;
    const baseH = isHorizontal ? targetPreset.width : targetPreset.height;

    const buildRowWiseTopAlignedSlots = (
      rowCounts: number[],
      maxCols: number,
      maxRows: number,
      sheetWidthMm: number,
      sheetHeightMm: number,
      photoWidthMm: number,
      photoHeightMm: number,
      gapMm: number,
      preferredTopMm = 4
    ) => {
      const maxPhotos = Math.max(0, maxCols * maxRows);
      const activeRows = rowCounts
        .slice(0, maxRows)
        .map((n) => Math.max(0, Math.min(maxCols, Math.round(n))))
        .filter((n) => n > 0);

      const photoCount = activeRows.reduce((sum, n) => sum + n, 0);
      if (photoCount === 0 || maxCols <= 0 || maxRows <= 0) {
        return {
          slots: [] as Array<{ xMm: number; yMm: number }>,
          startXMm: 0,
          startYMm: 0,
          usedCols: 0,
          usedRows: 0,
          usedBottomMm: 0,
          maxPhotos,
          photoCount: 0,
        };
      }

      const usedRows = activeRows.length;
      const usedCols = Math.max(...activeRows);
      const widestRowW = usedCols * photoWidthMm + Math.max(0, usedCols - 1) * gapMm;
      const activeGridH = usedRows * photoHeightMm + Math.max(0, usedRows - 1) * gapMm;
      // Strictly anchored to TOP area of page (never centered vertically),
      // with every row horizontally centered across the sheet width (never stuck on left or right side).
      const startXMm = (sheetWidthMm - widestRowW) / 2;
      const slackY = Math.max(0, sheetHeightMm - activeGridH);
      const startYMm = Math.min(preferredTopMm, slackY / 2);

      const slots: Array<{ xMm: number; yMm: number }> = [];
      activeRows.forEach((rowLen, r) => {
        const rowW = rowLen * photoWidthMm + Math.max(0, rowLen - 1) * gapMm;
        const rowStartX = (sheetWidthMm - rowW) / 2;
        const yMm = startYMm + r * (photoHeightMm + gapMm);
        for (let c = 0; c < rowLen; c++) {
          slots.push({
            xMm: rowStartX + c * (photoWidthMm + gapMm),
            yMm,
          });
        }
      });

      const usedBottomMm = startYMm + activeGridH;
      return { slots, startXMm, startYMm, usedCols, usedRows, usedBottomMm, maxPhotos, photoCount };
    };

    const buildTopAlignedSlots = (
      cols: number,
      rows: number,
      requestedCount: number,
      sheetWidthMm: number,
      sheetHeightMm: number,
      photoWidthMm: number,
      photoHeightMm: number,
      gapMm: number,
      preferredTopMm = 4
    ) => {
      const maxPhotos = Math.max(0, cols * rows);
      const count = Math.max(0, Math.min(maxPhotos, requestedCount));
      const rowCounts: number[] = [];
      let remaining = count;
      for (let r = 0; r < rows && remaining > 0; r++) {
        const take = Math.min(cols, remaining);
        rowCounts.push(take);
        remaining -= take;
      }
      return buildRowWiseTopAlignedSlots(
        rowCounts,
        cols,
        rows,
        sheetWidthMm,
        sheetHeightMm,
        photoWidthMm,
        photoHeightMm,
        gapMm,
        preferredTopMm
      );
    };

    if (paperSize.id === 'single') {
      return {
        isSingle: true,
        sheetWidthMm: baseW,
        sheetHeightMm: baseH,
        photoWidthMm: baseW,
        photoHeightMm: baseH,
        origPhotoWidthMm: targetPreset.width,
        origPhotoHeightMm: targetPreset.height,
        gapMm: 0,
        cols: 1,
        rows: 1,
        maxPhotos: 1,
        photoCount: 1,
        startXMm: 0,
        startYMm: 0,
        usedBottomMm: baseH,
        slots: [{ xMm: 0, yMm: 0 }],
        isHorizontal,
        isScaledDown: false,
        isValid: true,
      };
    }

    let sheetWidthMm = paperSize.id === 'custom' ? Math.max(10, Number(customPaper.width) || 0) : paperSize.width;
    let sheetHeightMm = paperSize.id === 'custom' ? Math.max(10, Number(customPaper.height) || 0) : paperSize.height;

    if (paperSize.id === 'a5') {
      // A5 = Half A4 (210 x 148 mm) -> fixed 2 rows x 6 photos (6 + 6 = 12), top-aligned
      sheetWidthMm = 210;
      sheetHeightMm = 148;
      const cols = 6;
      const rows = 2;
      const gapMm = 1.2;
      const outerMarginX = 2.4;
      const outerMarginY = 4;
      const maxFitW = (sheetWidthMm - 2 * outerMarginX - (cols - 1) * gapMm) / cols;
      const maxFitH = (sheetHeightMm - 2 * outerMarginY - (rows - 1) * gapMm) / rows;
      const scale = Math.min(1, maxFitW / baseW, maxFitH / baseH);
      const photoWidthMm = baseW * scale;
      const photoHeightMm = baseH * scale;
      const origPhotoWidthMm = targetPreset.width * scale;
      const origPhotoHeightMm = targetPreset.height * scale;
      const placed = buildTopAlignedSlots(
        cols,
        rows,
        cols * rows,
        sheetWidthMm,
        sheetHeightMm,
        photoWidthMm,
        photoHeightMm,
        gapMm,
        outerMarginY
      );
      return {
        isSingle: false,
        sheetWidthMm,
        sheetHeightMm,
        photoWidthMm,
        photoHeightMm,
        origPhotoWidthMm,
        origPhotoHeightMm,
        gapMm,
        cols,
        rows,
        maxPhotos: placed.maxPhotos,
        photoCount: placed.photoCount,
        startXMm: placed.startXMm,
        startYMm: placed.startYMm,
        usedBottomMm: placed.usedBottomMm,
        slots: placed.slots,
        isHorizontal,
        isScaledDown: scale < 0.999,
        isValid: photoWidthMm > 0 && photoHeightMm > 0 && placed.photoCount > 0,
      };
    }

    if (paperSize.id === 'custom-grid') {
      // Anchor Custom Grid on A4 sheet (210 x 297 mm) strictly at the TOP area to avoid paper waste
      sheetWidthMm = 210;
      sheetHeightMm = 297;
      const cols = Math.max(1, Math.min(20, Math.round(customGrid.cols || 1)));
      const rows = Math.max(1, Math.min(20, Math.round(customGrid.rows || 1)));
      const gapMm = 1.5;
      const padX = 4;
      const padY = 4;
      const maxFitW = (sheetWidthMm - 2 * padX - (cols - 1) * gapMm) / cols;
      const maxFitH = (sheetHeightMm - 2 * padY - (rows - 1) * gapMm) / rows;
      const scale = Math.min(1, maxFitW / baseW, maxFitH / baseH);
      const photoWidthMm = baseW * scale;
      const photoHeightMm = baseH * scale;
      const origPhotoWidthMm = targetPreset.width * scale;
      const origPhotoHeightMm = targetPreset.height * scale;
      const placed = buildTopAlignedSlots(
        cols,
        rows,
        cols * rows,
        sheetWidthMm,
        sheetHeightMm,
        photoWidthMm,
        photoHeightMm,
        gapMm,
        padY
      );
      return {
        isSingle: false,
        sheetWidthMm,
        sheetHeightMm,
        photoWidthMm,
        photoHeightMm,
        origPhotoWidthMm,
        origPhotoHeightMm,
        gapMm,
        cols,
        rows,
        maxPhotos: placed.maxPhotos,
        photoCount: placed.photoCount,
        startXMm: placed.startXMm,
        startYMm: placed.startYMm,
        usedBottomMm: placed.usedBottomMm,
        slots: placed.slots,
        isHorizontal,
        isScaledDown: scale < 0.999,
        isValid: photoWidthMm > 0 && photoHeightMm > 0 && placed.photoCount > 0,
      };
    }

    // Standard sheets (A4, 4x6, 5x7, Custom Size): exact true physical passport dimensions,
    // strictly starting from the TOP area of the page in both vertical and horizontal orientations
    const gapMm = 2;
    const edgePadMm = 3;
    const usableW = Math.max(0, sheetWidthMm - 2 * edgePadMm);
    const usableH = Math.max(0, sheetHeightMm - 2 * edgePadMm);
    let cols = Math.max(0, Math.floor((usableW + gapMm + 0.001) / (baseW + gapMm)));
    let rows = Math.max(0, Math.floor((usableH + gapMm + 0.001) / (baseH + gapMm)));

    if (cols === 0 && sheetWidthMm >= baseW + 2) {
      cols = Math.max(0, Math.floor((sheetWidthMm - 2 + gapMm + 0.001) / (baseW + gapMm)));
    }
    if (rows === 0 && sheetHeightMm >= baseH + 2) {
      rows = Math.max(0, Math.floor((sheetHeightMm - 2 + gapMm + 0.001) / (baseH + gapMm)));
    }

    const maxPhotos = cols * rows;
    const placed = buildTopAlignedSlots(
      cols,
      rows,
      maxPhotos,
      sheetWidthMm,
      sheetHeightMm,
      baseW,
      baseH,
      gapMm,
      4
    );

    return {
      isSingle: false,
      sheetWidthMm,
      sheetHeightMm,
      photoWidthMm: baseW,
      photoHeightMm: baseH,
      origPhotoWidthMm: targetPreset.width,
      origPhotoHeightMm: targetPreset.height,
      gapMm,
      cols,
      rows,
      maxPhotos: placed.maxPhotos,
      photoCount: placed.photoCount,
      startXMm: placed.startXMm,
      startYMm: placed.startYMm,
      usedBottomMm: placed.usedBottomMm,
      slots: placed.slots,
      isHorizontal,
      isScaledDown: false,
      isValid: cols > 0 && rows > 0 && placed.photoCount > 0,
    };
  };

  const createHdTileCanvas = (
    origPhotoWidthMm: number,
    origPhotoHeightMm: number,
    isHorizontal: boolean,
    targetDpi: number,
    fillWhiteBg = false
  ): HTMLCanvasElement | null => {
    if (!printImageElement) return null;

    const srcW = printImageElement.naturalWidth || printImageElement.width;
    const srcH = printImageElement.naturalHeight || printImageElement.height;
    if (srcW <= 0 || srcH <= 0) return null;

    const effectiveTileDpi = Math.max(72, Math.round(targetDpi));
    const origWPx = Math.max(1, Math.round((origPhotoWidthMm / 25.4) * effectiveTileDpi));
    const origHPx = Math.max(1, Math.round((origPhotoHeightMm / 25.4) * effectiveTileDpi));

    // Render upright tile at exact selected DPI using stepped high-quality resampling (zero single-pass blur)
    const uprightCanvas = document.createElement('canvas');
    drawSteppedHighQuality(printImageElement, uprightCanvas, origWPx, origHPx);

    let finalTile = uprightCanvas;
    if (fillWhiteBg) {
      const solidCanvas = document.createElement('canvas');
      solidCanvas.width = origWPx;
      solidCanvas.height = origHPx;
      const sCtx = solidCanvas.getContext('2d');
      if (sCtx) {
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, origWPx, origHPx);
        sCtx.drawImage(uprightCanvas, 0, 0);
        finalTile = solidCanvas;
      }
    }

    if (!isHorizontal) {
      return finalTile;
    }

    // Exact 90° pixel-to-pixel clockwise rotation (no odd-dimension 0.5px center-offset blur)
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = finalTile.height;
    rotCanvas.height = finalTile.width;
    const rCtx = rotCanvas.getContext('2d');
    if (!rCtx) return null;
    if (fillWhiteBg) {
      rCtx.fillStyle = '#ffffff';
      rCtx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
    }
    rCtx.imageSmoothingEnabled = false;
    rCtx.translate(rotCanvas.width, 0);
    rCtx.rotate(Math.PI / 2);
    rCtx.drawImage(finalTile, 0, 0);
    return rotCanvas;
  };

  const createTileDataUrl = (
    _photoWidthMm: number,
    _photoHeightMm: number,
    origPhotoWidthMm: number,
    origPhotoHeightMm: number,
    isHorizontal: boolean
  ): string | null => {
    // Produce lossless PNG strictly at the user-selected DPI
    const selectedDpi = Math.max(72, Math.round(dpi));
    const tileCanvas = createHdTileCanvas(
      origPhotoWidthMm,
      origPhotoHeightMm,
      isHorizontal,
      selectedDpi,
      bgColor !== 'transparent'
    );
    if (!tileCanvas) return null;
    return tileCanvas.toDataURL('image/png');
  };

  const currentDirectPrintKey = `${finalImageSrc || ''}|${dpi}|${paperSize.id}|${customPaper.width}x${customPaper.height}|${customGrid.cols}x${customGrid.rows}|${selectedPreset.id}|${printOrientation}|${bgColor}`;

  useEffect(() => {
    if (step !== 'print' || !printImageElement || !finalImageSrc) return;
    const layout = computePrintLayout();
    if (!layout.isValid) return;

    let cancelled = false;
    const key = currentDirectPrintKey;
    const selectedDpi = Math.max(72, Math.round(dpi));
    const tileCanvas = createHdTileCanvas(
      layout.origPhotoWidthMm,
      layout.origPhotoHeightMm,
      layout.isHorizontal,
      selectedDpi,
      bgColor !== 'transparent'
    );
    if (!tileCanvas) return;

    tileCanvas.toBlob((blob) => {
      if (!blob || cancelled) return;
      const tileUrl = URL.createObjectURL(blob);
      const preImg = new Image();
      preImg.onload = () => {
        if (cancelled) {
          URL.revokeObjectURL(tileUrl);
          return;
        }
        const prevUrl = lastDirectPrintBlobUrlRef.current;
        lastDirectPrintBlobUrlRef.current = tileUrl;
        directPrintTileImgRef.current = preImg;
        directPrintTileKeyRef.current = key;
        setDirectPrintTileSrc(tileUrl);
        if (prevUrl && prevUrl !== tileUrl) {
          setTimeout(() => URL.revokeObjectURL(prevUrl), 1500);
        }
      };
      preImg.onerror = () => {
        URL.revokeObjectURL(tileUrl);
      };
      preImg.src = tileUrl;
    }, 'image/png');

    return () => {
      cancelled = true;
    };
  }, [step, printImageElement, currentDirectPrintKey]);

  const handleDownloadSinglePhoto = () => {
    setPrintError(null);

    // Determine the freshest source canvas/image so clicking Single Photo while in Manual Touchup
    // or right after adjusting a suit always includes the latest touchup + suit + suit mask
    let sourceEl: HTMLCanvasElement | HTMLImageElement | null = null;
    if (isManualMode && workCanvasRef.current && workCanvasRef.current.width > 0) {
      const work = workCanvasRef.current;
      const subj = document.createElement('canvas');
      subj.width = work.width;
      subj.height = work.height;
      const sCtx = subj.getContext('2d');
      if (sCtx) {
        sCtx.filter = `brightness(${brightness}%) contrast(${contrast + (isUltraHD ? 15 : 0)}%) saturate(${saturation + (isUltraHD ? 20 : 0)}%)`;
        sCtx.drawImage(work, 0, 0);
      }

      const comp = document.createElement('canvas');
      comp.width = work.width;
      comp.height = work.height;
      const cCtx = comp.getContext('2d', { alpha: true });
      if (cCtx) {
        if (bgColor === 'custom-image' && customBgImgRef.current) {
          const bgImg = customBgImgRef.current;
          const imgRatio = bgImg.width / Math.max(1, bgImg.height);
          const targetRatio = comp.width / Math.max(1, comp.height);
          let drawW = comp.width, drawH = comp.height, offsetX = 0, offsetY = 0;
          if (imgRatio > targetRatio) {
            drawH = comp.height;
            drawW = comp.height * imgRatio;
            offsetX = (comp.width - drawW) / 2;
          } else {
            drawW = comp.width;
            drawH = comp.width / imgRatio;
            offsetY = (comp.height - drawH) / 2;
          }
          cCtx.drawImage(bgImg, offsetX, offsetY, drawW, drawH);
        } else if (bgColor !== 'transparent') {
          cCtx.fillStyle = bgColor === 'custom' ? customColor : bgColor;
          cCtx.fillRect(0, 0, comp.width, comp.height);
        }

        compositeSubjectWithSuit(
          cCtx,
          comp.width,
          comp.height,
          subj,
          processedSuit,
          suitTransform,
          Boolean(bgRemovedImageSrc),
          suitEraseMaskRef.current
        );

        if (hasBorder && bgColor !== 'transparent') {
          cCtx.strokeStyle = '#000000';
          const thickness = Math.max(1, Math.round((borderThickness / 2) * Math.max(1, comp.width / 350)));
          cCtx.lineWidth = thickness;
          cCtx.strokeRect(thickness / 2, thickness / 2, comp.width - thickness, comp.height - thickness);
        }
        sourceEl = comp;
      }
      setIsManualMode(false);
    } else if (compositeCanvasRef.current && compositeCanvasRef.current.width > 0) {
      sourceEl = compositeCanvasRef.current;
    } else if (printImageElement) {
      sourceEl = printImageElement;
    }

    if (!sourceEl) return;

    const exportDpi = Math.max(72, Math.round(dpi));
    let rawPngUrl: string;
    if (selectedPreset.id !== 'free') {
      const photoWidth = Math.max(1, Math.round((selectedPreset.width / 25.4) * exportDpi));
      const photoHeight = Math.max(1, Math.round((selectedPreset.height / 25.4) * exportDpi));
      const canvas = document.createElement('canvas');
      drawSteppedHighQuality(sourceEl, canvas, photoWidth, photoHeight);
      rawPngUrl = canvas.toDataURL('image/png');
    } else if (sourceEl instanceof HTMLCanvasElement) {
      rawPngUrl = sourceEl.toDataURL('image/png');
    } else {
      const srcW = sourceEl.naturalWidth || sourceEl.width;
      const srcH = sourceEl.naturalHeight || sourceEl.height;
      const canvas = document.createElement('canvas');
      drawSteppedHighQuality(sourceEl, canvas, srcW, srcH);
      rawPngUrl = canvas.toDataURL('image/png');
    }

    const { bytes, mime } = dataURLtoBytes(rawPngUrl);
    const dpiBytes = mime === 'image/png' ? injectPngDpiBytes(bytes, exportDpi) : bytes;
    const blob = new Blob([dpiBytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `passport-photo-${exportDpi}dpi-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderSheetCanvas = () => {
    if (!finalImageSrc || !printImageElement) return null;
    const layout = computePrintLayout();
    if (!layout.isValid) {
      setPrintError('Paper size is too small for even one photo at this preset size.');
      return null;
    }
    setPrintError(null);

    // Honor exact user-selected DPI while staying safely within browser canvas limits on giant custom sheets
    const desiredDpi = Math.max(72, Math.round(dpi));
    const rawW = (layout.sheetWidthMm / 25.4) * desiredDpi;
    const rawH = (layout.sheetHeightMm / 25.4) * desiredDpi;
    const MAX_SHEET_PIXELS = 36_000_000;
    const effectiveDpi =
      rawW * rawH > MAX_SHEET_PIXELS
        ? Math.max(72, Math.floor(desiredDpi * Math.sqrt(MAX_SHEET_PIXELS / (rawW * rawH))))
        : desiredDpi;

    const mmToPx = (mm: number) => (mm / 25.4) * effectiveDpi;
    const sheetWidth = Math.max(1, Math.round(mmToPx(layout.sheetWidthMm)));
    const sheetHeight = Math.max(1, Math.round(mmToPx(layout.sheetHeightMm)));
    const photoWidth = Math.max(1, Math.round(mmToPx(layout.photoWidthMm)));
    const photoHeight = Math.max(1, Math.round(mmToPx(layout.photoHeightMm)));
    const gapPx = mmToPx(layout.gapMm);

    // Build ONE stepped-high-quality master tile at exact selected DPI and stamp it pixel-aligned onto every slot
    const masterTile = createHdTileCanvas(
      layout.origPhotoWidthMm,
      layout.origPhotoHeightMm,
      layout.isHorizontal,
      effectiveDpi,
      true
    );
    if (!masterTile) return null;

    const canvas = document.createElement('canvas');
    canvas.width = sheetWidth;
    canvas.height = sheetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (const slot of layout.slots) {
      const x = Math.round(mmToPx(slot.xMm));
      const y = Math.round(mmToPx(slot.yMm));
      ctx.drawImage(masterTile, x, y, photoWidth, photoHeight);

      if (hasCutLines) {
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = Math.max(1, Math.round(effectiveDpi / 180));
        const dashLen = Math.max(6, Math.round(effectiveDpi / 16));
        ctx.setLineDash([dashLen, dashLen]);
        ctx.strokeRect(
          x - gapPx / 2,
          y - gapPx / 2,
          photoWidth + gapPx,
          photoHeight + gapPx
        );
        ctx.setLineDash([]);
      }
    }

    return { canvas, layout, effectiveDpi };
  };

  // --- 5. Generate Print Layout (Exact selected DPI JPG with embedded physical DPI) ---
  const handleDownload = () => {
    if (!finalImageSrc || !printImageElement) return;
    if (paperSize.id === 'single') {
      handleDownloadSinglePhoto();
      return;
    }

    const rendered = renderSheetCanvas();
    if (!rendered) return;

    const dataUrl = rendered.canvas.toDataURL('image/jpeg', 1.0);
    const { bytes } = dataURLtoBytes(dataUrl);
    const dpiBytes = injectJpegDpiBytes(bytes, rendered.effectiveDpi);
    const blob = new Blob([dpiBytes], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `passport-print-${paperSize.id}-${rendered.effectiveDpi}dpi.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // --- 6. Exact-Size Lossless Vector PDF Download at Selected DPI ---
  const handleDownloadPdf = () => {
    if (!finalImageSrc || !printImageElement) return;
    const layout = computePrintLayout();
    if (!layout.isValid) {
      setPrintError('Paper size is too small for even one photo at this preset size.');
      return;
    }
    setPrintError(null);

    const selectedDpi = Math.max(72, Math.round(dpi));
    // Lossless PNG tile at exact selected DPI, embedded ONCE via shared jsPDF alias
    const tileDataUrl = createTileDataUrl(
      layout.photoWidthMm,
      layout.photoHeightMm,
      layout.origPhotoWidthMm,
      layout.origPhotoHeightMm,
      layout.isHorizontal
    );
    if (!tileDataUrl) return;

    // For single photo PDF, place at exact mm size centered at the TOP of A4 to avoid paper waste
    const pageW = layout.isSingle ? 210 : layout.sheetWidthMm;
    const pageH = layout.isSingle ? 297 : layout.sheetHeightMm;

    const pdf = new jsPDF({
      orientation: pageW >= pageH ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [pageW, pageH],
      compress: true,
    });

    const pdfSlots = layout.isSingle
      ? [{ xMm: (pageW - layout.photoWidthMm) / 2, yMm: 5 }]
      : layout.slots;

    for (const slot of pdfSlots) {
      const x = slot.xMm;
      const y = slot.yMm;
      pdf.addImage(
        tileDataUrl,
        'PNG',
        x,
        y,
        layout.photoWidthMm,
        layout.photoHeightMm,
        'passport-hd-tile',
        'NONE'
      );

      if (hasCutLines && !layout.isSingle) {
        pdf.setDrawColor(160, 160, 160);
        pdf.setLineWidth(0.2);
        pdf.setLineDashPattern([1.5, 1.5], 0);
        pdf.rect(
          x - layout.gapMm / 2,
          y - layout.gapMm / 2,
          layout.photoWidthMm + layout.gapMm,
          layout.photoHeightMm + layout.gapMm
        );
      }
    }

    pdf.save(`passport-print-${paperSize.id}-${selectedDpi}dpi-${Math.round(layout.photoWidthMm)}x${Math.round(layout.photoHeightMm)}mm.pdf`);
  };

  // --- 7. Direct Browser Print (Native Lossless Exact-DPI <img> + Vector Cut Lines + Sandbox PDF Fallback) ---
  const handlePrintSheet = () => {
    if (!finalImageSrc || !printImageElement) {
      setPrintError('Photo is still preparing. Please wait a moment and try Print again.');
      return;
    }
    const layout = computePrintLayout();
    if (!layout.isValid) {
      setPrintError('Paper size is too small for even one photo at this preset size.');
      return;
    }
    setPrintError(null);
    setPrintNotice(null);

    // For single photo, print on A4 at exact physical mm so printer never enlarges it to full page
    const pageW = layout.isSingle ? 210 : layout.sheetWidthMm;
    const pageH = layout.isSingle ? 297 : layout.sheetHeightMm;

    // Use pre-decoded lossless PNG tile generated at the exact selected DPI so Direct Print
    // matches the chosen DPI cleanly with zero <canvas> print blur
    let printImgSrc: string | null =
      directPrintTileSrc && directPrintTileKeyRef.current === currentDirectPrintKey
        ? directPrintTileSrc
        : null;
    if (!printImgSrc) {
      printImgSrc = createTileDataUrl(
        layout.photoWidthMm,
        layout.photoHeightMm,
        layout.origPhotoWidthMm,
        layout.origPhotoHeightMm,
        layout.isHorizontal
      );
    }
    if (!printImgSrc) return;

    const printSlots = layout.isSingle
      ? [{ xMm: (pageW - layout.photoWidthMm) / 2, yMm: 5 }]
      : layout.slots;

    document.getElementById('passport-direct-print-sheet')?.remove();
    document.getElementById('passport-direct-print-style')?.remove();

    const styleEl = document.createElement('style');
    styleEl.id = 'passport-direct-print-style';
    styleEl.textContent = `
      @page {
        size: ${pageW}mm ${pageH}mm;
        margin: 0;
      }
      #passport-direct-print-sheet {
        display: none;
      }
      @media print {
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${pageW}mm !important;
          height: ${pageH}mm !important;
          background: #ffffff !important;
          overflow: hidden !important;
        }
        body > *:not(#passport-direct-print-sheet) {
          display: none !important;
        }
        #passport-direct-print-sheet {
          display: block !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: ${pageW}mm !important;
          height: ${pageH}mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          overflow: hidden !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
        }
        #passport-direct-print-sheet img {
          display: block !important;
          max-width: none !important;
          max-height: none !important;
          image-rendering: auto !important;
        }
      }
    `;

    const container = document.createElement('div');
    container.id = 'passport-direct-print-sheet';

    for (const slot of printSlots) {
      const photoImg = document.createElement('img');
      photoImg.src = printImgSrc;
      photoImg.alt = '';
      photoImg.style.position = 'absolute';
      photoImg.style.left = `${slot.xMm}mm`;
      photoImg.style.top = `${slot.yMm}mm`;
      photoImg.style.width = `${layout.photoWidthMm}mm`;
      photoImg.style.height = `${layout.photoHeightMm}mm`;
      photoImg.style.objectFit = 'fill';
      photoImg.style.margin = '0';
      photoImg.style.padding = '0';
      photoImg.style.border = '0';
      container.appendChild(photoImg);

      if (hasCutLines && !layout.isSingle) {
        const cutBox = document.createElement('div');
        cutBox.style.position = 'absolute';
        cutBox.style.left = `${slot.xMm - layout.gapMm / 2}mm`;
        cutBox.style.top = `${slot.yMm - layout.gapMm / 2}mm`;
        cutBox.style.width = `${layout.photoWidthMm + layout.gapMm}mm`;
        cutBox.style.height = `${layout.photoHeightMm + layout.gapMm}mm`;
        cutBox.style.border = '0.2mm dashed #9ca3af';
        cutBox.style.boxSizing = 'border-box';
        cutBox.style.pointerEvents = 'none';
        container.appendChild(cutBox);
      }
    }

    document.head.appendChild(styleEl);
    document.body.appendChild(container);

    const cleanup = () => {
      container.remove();
      styleEl.remove();
    };

    let printDialogOpened = false;
    const onBeforePrint = () => {
      printDialogOpened = true;
    };
    window.addEventListener('beforeprint', onBeforePrint, { once: true });
    window.addEventListener('afterprint', cleanup, { once: true });

    // Call synchronously inside user click to preserve browser user activation gesture
    const t0 = performance.now();
    try {
      window.print();
    } catch {
      // Fall through to PDF fallback check below
    }
    const elapsedMs = performance.now() - t0;

    setTimeout(() => {
      window.removeEventListener('beforeprint', onBeforePrint);
      if (!printDialogOpened && elapsedMs < 80) {
        cleanup();
        handleDownloadPdf();
        setPrintNotice(
          'Your browser preview blocked the native print popup, so an exact-size printable PDF was downloaded instead. Open the PDF and print at 100% / Actual Size.'
        );
      }
    }, 350);

    setTimeout(cleanup, 60000);
  };

  // --- Render Helpers ---
  const renderPrintPreview = () => {
    if (!finalImageSrc) return null;
    const layout = computePrintLayout();

    const availW = Math.max(220, previewViewport.width - 56);
    const availH = Math.max(200, previewViewport.height - 110);

    if (layout.isSingle) {
      const targetPreset = selectedPreset.id === 'free' ? PRESETS[1] : selectedPreset;
      const singleBaseH = Math.min(availH, 420);
      return (
        <div className="p-2 flex flex-col items-center">
          <div className="mb-2.5 text-[11px] font-bold text-gray-600 bg-white/90 px-3 py-1 rounded-full border border-gray-200 shadow-xs">
            Single Photo • {selectedPreset.id === 'free' ? 'Custom Crop' : `${targetPreset.width} × ${targetPreset.height} mm`} • {dpi} DPI
          </div>
          <img
            src={finalImageSrc}
            alt="Single Print"
            className="object-contain shadow-2xl border border-gray-300 transition-all duration-200 mx-auto bg-white"
            style={{
              height: `${Math.round(singleBaseH * zoom)}px`,
              width: 'auto',
              maxWidth: 'none',
              imageRendering: 'high-quality',
            }}
          />
        </div>
      );
    }

    if (!layout.isValid) {
      return (
        <div className="p-6 text-center text-red-600 bg-red-50 border border-red-200 rounded-xl font-bold text-sm max-w-md mx-auto">
          Paper size ({layout.sheetWidthMm} × {layout.sheetHeightMm} mm) is too small for even one {layout.photoWidthMm.toFixed(1)} × {layout.photoHeightMm.toFixed(1)} mm photo.
        </div>
      );
    }

    // Responsive aspect-exact fit inside the live preview viewport (scales every paper sheet cleanly without CSS zoom bugs)
    const fitScale = Math.min(availW / layout.sheetWidthMm, availH / layout.sheetHeightMm);
    const baseSheetPxW = Math.max(120, Math.round(layout.sheetWidthMm * fitScale));
    const baseSheetPxH = Math.max(96, Math.round(layout.sheetHeightMm * fitScale));
    const sheetPxW = Math.max(80, Math.round(baseSheetPxW * zoom));
    const sheetPxH = Math.max(64, Math.round(baseSheetPxH * zoom));
    const unusedBottomMm = Math.max(0, layout.sheetHeightMm - layout.usedBottomMm);
    const showSavedPaperGuide = unusedBottomMm >= 18;

    return (
      <div className="p-2 flex flex-col items-center">
        <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold text-gray-700 bg-white/90 px-3 py-1 rounded-full border border-gray-200 shadow-xs">
          <span>{paperSize.name}</span>
          <span className="text-gray-300">•</span>
          <span className="text-[#e8501a]">
            {layout.photoCount} {layout.photoCount === 1 ? 'Photo' : 'Photos'}
          </span>
          <span className="text-gray-300">•</span>
          <span className="text-gray-500">{layout.sheetWidthMm} × {layout.sheetHeightMm} mm</span>
        </div>

        <div
          className="bg-white shadow-2xl relative transition-all duration-200 mx-auto border border-gray-300 overflow-hidden shrink-0"
          style={{
            width: `${sheetPxW}px`,
            height: `${sheetPxH}px`,
          }}
        >
          {layout.slots.map((slot, idx) => (
            <div
              key={idx}
              className="absolute flex items-center justify-center overflow-visible"
              style={{
                left: `${(slot.xMm / layout.sheetWidthMm) * 100}%`,
                top: `${(slot.yMm / layout.sheetHeightMm) * 100}%`,
                width: `${(layout.photoWidthMm / layout.sheetWidthMm) * 100}%`,
                height: `${(layout.photoHeightMm / layout.sheetHeightMm) * 100}%`,
              }}
            >
              {hasCutLines && (
                <div
                  className="absolute border border-dashed border-gray-400 pointer-events-none"
                  style={{
                    left: `-${((layout.gapMm / 2) / layout.photoWidthMm) * 100}%`,
                    top: `-${((layout.gapMm / 2) / layout.photoHeightMm) * 100}%`,
                    width: `${((layout.photoWidthMm + layout.gapMm) / layout.photoWidthMm) * 100}%`,
                    height: `${((layout.photoHeightMm + layout.gapMm) / layout.photoHeightMm) * 100}%`,
                    zIndex: 10,
                  }}
                />
              )}
              <img
                src={finalImageSrc}
                alt="Copy"
                className="shadow-xs absolute block"
                style={{
                  imageRendering: 'high-quality',
                  width: layout.isHorizontal ? `${(layout.origPhotoWidthMm / layout.photoWidthMm) * 100}%` : '100%',
                  height: layout.isHorizontal ? `${(layout.origPhotoHeightMm / layout.photoHeightMm) * 100}%` : '100%',
                  top: '50%',
                  left: '50%',
                  transform: layout.isHorizontal ? 'translate(-50%, -50%) rotate(90deg)' : 'translate(-50%, -50%)',
                  objectFit: 'fill',
                }}
              />
            </div>
          ))}

          {/* Visual-only reusable paper area cue (not printed) */}
          {showSavedPaperGuide && (
            <div
              className="absolute inset-x-0 bottom-0 pointer-events-none flex items-center justify-center border-t border-dashed border-emerald-400/70 bg-emerald-50/25"
              style={{
                top: `${Math.min(96, ((layout.usedBottomMm + Math.max(1.5, layout.gapMm)) / layout.sheetHeightMm) * 100)}%`,
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/80 bg-white/85 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Reusable Blank Paper ({Math.round(unusedBottomMm)} mm saved)
              </span>
            </div>
          )}
        </div>

        <div className="mt-2.5 text-[11px] text-gray-600 font-bold uppercase tracking-wider text-center">
          Photo: {layout.photoWidthMm.toFixed(1)} × {layout.photoHeightMm.toFixed(1)} mm • Top Area Print ({printOrientation === 'horizontal' ? 'Horizontal' : 'Vertical'})
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
      setSelectedSuitId(null);
      setProcessedSuit(null);
      setSuitTransform(DEFAULT_SUIT_TRANSFORM);
      hasAutoFittedSuitRef.current = false;
      refinedSubjectCanvasRef.current = null;
      clearSuitEraseMask();
      setTouchupTarget('photo');
      setShowSuitInTouchup(true);
      setIsManualMode(false);
      setSubjectVersion(0);
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
      setSelectedSuitId(null);
      setProcessedSuit(null);
      setSuitTransform(DEFAULT_SUIT_TRANSFORM);
      hasAutoFittedSuitRef.current = false;
      refinedSubjectCanvasRef.current = null;
      clearSuitEraseMask();
      setTouchupTarget('photo');
      setShowSuitInTouchup(true);
      setIsManualMode(false);
      setSubjectVersion(0);
      setHistory([]);
      setHistoryIndex(-1);
      setStep('crop');
      setZoom(0.8);
    }
  }, [file]);

        return (
          <div className="flex flex-col lg:flex-row-reverse w-full h-full bg-gray-50 overflow-hidden">
            
            {/* --- SIDEBAR (STEPS & CONTROLS) --- */}
            <aside className="w-full lg:w-[320px] bg-white border-l border-gray-200 flex flex-col h-[40vh] lg:h-full z-10 shadow-lg order-2 lg:order-2">
              
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
                  <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
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
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    
                    {/* Background */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                          <Wand2 className="w-4 h-4" /> Background
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={undo}
                            disabled={
                              isManualMode && touchupTarget === 'suit' && processedSuit
                                ? suitMaskHistoryIndex <= 0
                                : historyIndex <= 0
                            }
                            className="p-1.5 bg-white text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            title={isManualMode && touchupTarget === 'suit' && processedSuit ? 'Undo Suit Touchup' : 'Undo'}
                          >
                            <Undo className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={redo}
                            disabled={
                              isManualMode && touchupTarget === 'suit' && processedSuit
                                ? suitMaskHistoryIndex >= suitMaskHistory.length - 1
                                : historyIndex >= history.length - 1
                            }
                            className="p-1.5 bg-white text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            title={isManualMode && touchupTarget === 'suit' && processedSuit ? 'Redo Suit Touchup' : 'Redo'}
                          >
                            <Redo className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2 mb-2">
                        <button
                          onClick={removeBackground}
                          disabled={isProcessing}
                          className="flex-1 py-2.5 px-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70 shadow-sm"
                        >
                          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          AI Auto Remove
                        </button>
                        {bgRemovedImageSrc && (
                          <button
                            onClick={handleResetCutout}
                            className="py-2.5 px-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1"
                            title="Restore Original Photo"
                          >
                            <Undo className="w-3.5 h-3.5 text-gray-500" />
                            Original
                          </button>
                        )}
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
                            {processedSuit && (
                              <div className="flex items-center gap-1.5">
                                {suitMaskHistoryIndex > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      clearSuitEraseMask();
                                      setTimeout(() => syncTouchupSuitOverlays(), 0);
                                    }}
                                    className="text-[10px] font-bold text-red-500 hover:underline"
                                    title="Restore full untouched suit"
                                  >
                                    Reset Suit
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setShowSuitInTouchup((v) => !v)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-white border border-gray-200 text-gray-700 hover:border-[#e8501a] flex items-center gap-1"
                                  title="Toggle suit visibility while brushing"
                                >
                                  {showSuitInTouchup ? <Eye className="w-3 h-3 text-[#e8501a]" /> : <EyeOff className="w-3 h-3 text-gray-400" />}
                                  {showSuitInTouchup ? 'Suit On' : 'Suit Off'}
                                </button>
                              </div>
                            )}
                          </div>

                          {processedSuit && (
                            <div className="space-y-1.5">
                              <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-200/70 rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => setTouchupTarget('photo')}
                                  className={`py-1.5 px-2 text-[11px] font-bold rounded-md transition-all ${
                                    touchupTarget === 'photo'
                                      ? 'bg-white text-gray-900 shadow-xs'
                                      : 'text-gray-600 hover:text-gray-900'
                                  }`}
                                >
                                  Photo / Clothes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTouchupTarget('suit');
                                    setShowSuitInTouchup(true);
                                  }}
                                  className={`py-1.5 px-2 text-[11px] font-bold rounded-md transition-all flex items-center justify-center gap-1 ${
                                    touchupTarget === 'suit'
                                      ? 'bg-white text-[#e8501a] shadow-xs'
                                      : 'text-gray-600 hover:text-gray-900'
                                  }`}
                                >
                                  <Shirt className="w-3 h-3" /> Suit Layer
                                </button>
                              </div>
                              <p className="text-[10px] text-gray-500 leading-snug">
                                {touchupTarget === 'suit'
                                  ? 'Erase suit edges so hair, beard, or neckwear naturally sits over the collar.'
                                  : 'Erase stray old clothes or background edges while previewing the suit live.'}
                              </p>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => setBrushMode('erase')}
                              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${brushMode === 'erase' ? 'bg-white shadow-sm text-[#e8501a] ring-1 ring-[#e8501a]/30' : 'text-gray-600 hover:bg-gray-200'}`}
                            >
                              {touchupTarget === 'suit' && processedSuit ? 'Erase Suit' : 'Erase'}
                            </button>
                            <button
                              onClick={() => setBrushMode('restore')}
                              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${brushMode === 'restore' ? 'bg-white shadow-sm text-[#e8501a] ring-1 ring-[#e8501a]/30' : 'text-gray-600 hover:bg-gray-200'}`}
                            >
                              {touchupTarget === 'suit' && processedSuit ? 'Restore Suit' : 'Restore'}
                            </button>
                          </div>
                          <div className="space-y-3 pt-1">
                            <div className="flex items-center gap-3 p-2 bg-white rounded-xl border border-gray-200 shadow-xs">
                              {/* Visual Round Brush Shape Preview */}
                              <div className="w-11 h-11 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 relative overflow-hidden" title="Live Round Brush Preview">
                                <div 
                                  className="rounded-full border-2 border-white shadow-sm ring-1 ring-black/40 transition-all duration-75 flex items-center justify-center"
                                  style={{ 
                                    width: `${Math.min(38, Math.max(8, brushSize * 0.38))}px`, 
                                    height: `${Math.min(38, Math.max(8, brushSize * 0.38))}px`,
                                    backgroundColor:
                                      touchupTarget === 'suit' && processedSuit
                                        ? brushMode === 'erase'
                                          ? 'rgba(232, 80, 26, 0.45)'
                                          : 'rgba(16, 185, 129, 0.45)'
                                        : brushMode === 'erase'
                                          ? 'rgba(239, 68, 68, 0.45)'
                                          : 'rgba(59, 130, 246, 0.45)'
                                  }}
                                >
                                  <div className="w-1 h-1 rounded-full bg-white shadow-xs" />
                                </div>
                              </div>
                              <div className="flex-1 space-y-1">
                                <div className="flex justify-between text-xs text-gray-700">
                                  <span className="font-bold flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-[#e8501a] inline-block" />
                                    Round Brush Size
                                  </span>
                                  <span className="font-extrabold text-[#e8501a]">{brushSize}px</span>
                                </div>
                                <input
                                  type="range"
                                  min="5"
                                  max="100"
                                  value={brushSize}
                                  onChange={(e) => setBrushSize(Number(e.target.value))}
                                  className="w-full accent-[#e8501a] cursor-pointer"
                                />
                              </div>
                            </div>

                            {/* Quick Presets for Smart Phone Android & Desktop */}
                            <div className="flex items-center gap-1.5">
                              {[
                                { label: '10px', val: 10 },
                                { label: '20px', val: 20 },
                                { label: '35px', val: 35 },
                                { label: '50px', val: 50 },
                                { label: '75px', val: 75 },
                              ].map((preset) => (
                                <button
                                  key={preset.val}
                                  type="button"
                                  onClick={() => setBrushSize(preset.val)}
                                  className={`flex-1 py-1 px-1 text-[10px] font-bold rounded-lg border transition-all text-center ${
                                    brushSize === preset.val 
                                      ? 'bg-[#e8501a] text-white border-[#e8501a] shadow-xs' 
                                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-5 gap-2">
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
                            {bgColor === color.value && color.value !== '#ffffff' && color.value !== '#eeeeee' && color.value !== '#E6F0FF' && color.value !== 'transparent' && <Check className="w-4 h-4 text-white" />}
                            {bgColor === color.value && (color.value === '#ffffff' || color.value === '#eeeeee' || color.value === '#E6F0FF' || color.value === 'transparent') && <Check className="w-4 h-4 text-gray-900" />}
                          </button>
                        ))}
                        <div className={`relative h-10 rounded-xl border-2 overflow-hidden transition-all ${bgColor === 'custom' ? 'border-[#e8501a] scale-105 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                          <input 
                            type="color" 
                            value={customColor} 
                            onChange={(e) => { setCustomColor(e.target.value); setBgColor('custom'); }}
                            className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                            title="Custom Color"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (customBgImage) setBgColor('custom-image');
                            else bgUploadInputRef.current?.click();
                          }}
                          className={`h-10 rounded-xl border-2 transition-all flex items-center justify-center overflow-hidden ${
                            bgColor === 'custom-image' ? 'border-[#e8501a] scale-105 shadow-md' : 'border-dashed border-gray-300 hover:border-[#e8501a] bg-gray-50'
                          }`}
                          style={customBgImage ? { backgroundImage: `url(${customBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                          title="Custom Background Image"
                        >
                          {!customBgImage && <Upload className="w-4 h-4 text-gray-600" />}
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

                      {bgColor === 'custom-image' && (
                        <div className="mt-2.5 p-2.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => bgUploadInputRef.current?.click()}
                            className="text-xs font-bold text-gray-700 hover:text-[#e8501a] flex items-center gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5" /> {customBgImage ? 'Change BG Image' : 'Upload BG Image'}
                          </button>
                          {customBgImage && (
                            <button
                              type="button"
                              onClick={() => {
                                setCustomBgImage(null);
                                customBgImgRef.current = null;
                                setBgColor('#ffffff');
                              }}
                              className="text-[10px] font-bold text-red-500 hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Formal Suit / Outfit */}
                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                          <Shirt className="w-4 h-4" /> Formal Suit
                        </h3>
                        {selectedSuitId && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSuitId(null);
                              setProcessedSuit(null);
                            }}
                            className="text-[10px] text-red-500 font-bold hover:underline"
                          >
                            Remove Suit
                          </button>
                        )}
                      </div>

                      {/* Category Tabs */}
                      <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl mb-3">
                        {(
                          [
                            { id: 'all', label: 'All' },
                            { id: 'men', label: 'Men' },
                            { id: 'women', label: 'Women' },
                          ] as { id: SuitCategory; label: string }[]
                        ).map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSuitCategory(cat.id)}
                            className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                              suitCategory === cat.id
                                ? 'bg-white text-[#e8501a] shadow-xs'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>

                      {/* Suit Gallery Grid */}
                      <div className="grid grid-cols-3 gap-2">
                        {/* None Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSuitId(null);
                            setProcessedSuit(null);
                          }}
                          className={`p-2 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all h-24 ${
                            selectedSuitId === null
                              ? 'border-[#e8501a] bg-[#e8501a]/5 shadow-xs'
                              : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                          }`}
                        >
                          <X className="w-5 h-5 text-gray-500" />
                          <span className="text-[10px] font-bold text-gray-700">No Suit</span>
                        </button>

                        {SUIT_CATALOG.filter((s) => suitCategory === 'all' || s.category === suitCategory).map((suit) => (
                          <button
                            key={suit.id}
                            type="button"
                            onClick={() => {
                              if (isManualMode) setIsManualMode(false);
                              setSelectedSuitId(suit.id);
                            }}
                            className={`p-1.5 rounded-xl border-2 flex flex-col items-center justify-between transition-all h-24 overflow-hidden ${
                              selectedSuitId === suit.id
                                ? 'border-[#e8501a] bg-[#e8501a]/5 shadow-xs'
                                : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                            }`}
                            title={`${suit.name} (${suit.subtitle})`}
                          >
                            <div className="w-full h-14 flex items-center justify-center overflow-hidden">
                              {suitThumbs[suit.id] ? (
                                <img
                                  src={suitThumbs[suit.id]}
                                  alt={suit.name}
                                  className="max-w-full max-h-full object-contain"
                                />
                              ) : (
                                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                              )}
                            </div>
                            <span className="text-[9px] font-bold text-gray-800 leading-tight text-center truncate w-full">
                              {suit.name}
                            </span>
                          </button>
                        ))}

                        {/* Custom PNG / Suit Upload */}
                        <button
                          type="button"
                          onClick={() => suitUploadInputRef.current?.click()}
                          className={`p-2 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all h-24 ${
                            selectedSuitId === 'custom'
                              ? 'border-[#e8501a] bg-[#e8501a]/5'
                              : 'border-gray-300 hover:border-[#e8501a] bg-gray-50'
                          }`}
                          title="Upload custom transparent PNG suit"
                        >
                          <Upload className="w-4 h-4 text-gray-600" />
                          <span className="text-[10px] font-bold text-gray-700 text-center leading-tight">
                            Custom PNG
                          </span>
                        </button>
                      </div>

                      <input
                        ref={suitUploadInputRef}
                        type="file"
                        accept="image/png,image/webp,image/jpeg"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const src = ev.target?.result as string;
                            if (src) {
                              if (isManualMode) setIsManualMode(false);
                              setCustomSuitSrc(src);
                              setSelectedSuitId('custom');
                            }
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />

                      {/* Full Precision Suit Adjustment Controls */}
                      {selectedSuitId && (
                        <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-600 uppercase flex items-center gap-1">
                              <Move className="w-3 h-3 text-[#e8501a]" /> Adjust Suit Fit
                            </span>
                            {isLoadingSuit && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#e8501a]" />}
                          </div>

                          {/* Quick Action Row */}
                          <div className="grid grid-cols-4 gap-1">
                            <button
                              type="button"
                              onClick={handleAutoFitSuit}
                              className="py-1.5 px-1 bg-[#e8501a] text-white rounded-lg text-[10px] font-bold hover:bg-[#d04313] transition-colors flex items-center justify-center gap-1"
                              title="Automatically align suit collar to neck and shoulders"
                            >
                              <Sparkles className="w-3 h-3" /> Auto
                            </button>
                            <button
                              type="button"
                              onClick={() => setSuitTransform((prev) => ({ ...prev, flipX: !prev.flipX }))}
                              className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${
                                suitTransform.flipX
                                  ? 'bg-gray-900 text-white border-gray-900'
                                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                              }`}
                              title="Flip suit horizontally"
                            >
                              <FlipHorizontal2 className="w-3 h-3" /> Flip
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowSuitHandles((v) => !v)}
                              className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${
                                showSuitHandles
                                  ? 'bg-white text-[#e8501a] border-[#e8501a]/40'
                                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                              }`}
                              title="Toggle interactive drag/resize handles on photo"
                            >
                              {showSuitHandles ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Box
                            </button>
                            <button
                              type="button"
                              onClick={handleResetSuitAdjustments}
                              className="py-1.5 px-1 bg-white text-gray-700 border border-gray-200 rounded-lg text-[10px] font-bold hover:bg-gray-100 transition-colors"
                              title="Reset suit position and size"
                            >
                              Reset
                            </button>
                          </div>

                          {/* Precision Nudge Pad */}
                          <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-gray-200">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Fine Nudge</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => nudgeSuit(-0.5, 0)}
                                className="p-1 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700"
                                title="Move Left"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => nudgeSuit(0, -0.5)}
                                className="p-1 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700"
                                title="Move Up"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSuitTransform((prev) => ({ ...prev, x: 0 }))}
                                className="px-1.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-[9px] font-bold text-gray-700"
                                title="Center Horizontally"
                              >
                                Ctr
                              </button>
                              <button
                                type="button"
                                onClick={() => nudgeSuit(0, 0.5)}
                                className="p-1 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700"
                                title="Move Down"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => nudgeSuit(0.5, 0)}
                                className="p-1 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700"
                                title="Move Right"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Position, Scale, Shoulder Width, Height, Rotation Sliders */}
                          <div className="space-y-2.5">
                            <div>
                              <div className="flex justify-between text-[11px] font-bold text-gray-700 mb-0.5">
                                <span>Left / Right (X)</span>
                                <span className="tabular-nums text-[#e8501a]">{suitTransform.x > 0 ? `+${suitTransform.x.toFixed(1)}` : suitTransform.x.toFixed(1)}%</span>
                              </div>
                              <input
                                type="range"
                                min="-40"
                                max="40"
                                step="0.5"
                                value={suitTransform.x}
                                onChange={(e) => setSuitTransform((prev) => ({ ...prev, x: Number(e.target.value) }))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] font-bold text-gray-700 mb-0.5">
                                <span>Up / Down (Collar Y)</span>
                                <span className="tabular-nums text-[#e8501a]">{suitTransform.y.toFixed(1)}%</span>
                              </div>
                              <input
                                type="range"
                                min="30"
                                max="105"
                                step="0.5"
                                value={suitTransform.y}
                                onChange={(e) => setSuitTransform((prev) => ({ ...prev, y: Number(e.target.value) }))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] font-bold text-gray-700 mb-0.5">
                                <span>Overall Size</span>
                                <span className="tabular-nums text-[#e8501a]">{Math.round(suitTransform.scale * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min="0.45"
                                max="1.80"
                                step="0.01"
                                value={suitTransform.scale}
                                onChange={(e) => setSuitTransform((prev) => ({ ...prev, scale: Number(e.target.value) }))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] font-bold text-gray-700 mb-0.5">
                                <span>Shoulder Width</span>
                                <span className="tabular-nums text-[#e8501a]">{Math.round(suitTransform.scaleX * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min="0.70"
                                max="1.45"
                                step="0.01"
                                value={suitTransform.scaleX}
                                onChange={(e) => setSuitTransform((prev) => ({ ...prev, scaleX: Number(e.target.value) }))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] font-bold text-gray-700 mb-0.5">
                                <span>Torso Height</span>
                                <span className="tabular-nums text-[#e8501a]">{Math.round(suitTransform.scaleY * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min="0.70"
                                max="1.50"
                                step="0.01"
                                value={suitTransform.scaleY}
                                onChange={(e) => setSuitTransform((prev) => ({ ...prev, scaleY: Number(e.target.value) }))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] font-bold text-gray-700 mb-0.5">
                                <span>Tilt / Rotation</span>
                                <span className="tabular-nums text-[#e8501a]">{suitTransform.rotation > 0 ? `+${suitTransform.rotation}` : suitTransform.rotation}°</span>
                              </div>
                              <input
                                type="range"
                                min="-25"
                                max="25"
                                step="0.5"
                                value={suitTransform.rotation}
                                onChange={(e) => setSuitTransform((prev) => ({ ...prev, rotation: Number(e.target.value) }))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                              />
                            </div>
                          </div>

                          {/* Clean Old Shoulders (when BG removed) */}
                          {bgRemovedImageSrc && (
                            <div className="pt-2 border-t border-gray-200 space-y-2">
                              <label className="flex items-center justify-between cursor-pointer">
                                <span className="text-[11px] font-bold text-gray-700">Hide Old Shoulders</span>
                                <input
                                  type="checkbox"
                                  checked={suitTransform.hideOldClothes}
                                  onChange={(e) =>
                                    setSuitTransform((prev) => ({ ...prev, hideOldClothes: e.target.checked }))
                                  }
                                  className="accent-[#e8501a] w-4 h-4"
                                />
                              </label>
                              {suitTransform.hideOldClothes && (
                                <div>
                                  <div className="flex justify-between text-[10px] font-bold text-gray-600 mb-0.5">
                                    <span>Collar Trim Line</span>
                                    <span className="tabular-nums">{suitTransform.neckCutOffset > 0 ? `+${suitTransform.neckCutOffset}` : suitTransform.neckCutOffset}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-12"
                                    max="12"
                                    step="0.5"
                                    value={suitTransform.neckCutOffset}
                                    onChange={(e) =>
                                      setSuitTransform((prev) => ({ ...prev, neckCutOffset: Number(e.target.value) }))
                                    }
                                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Suit Lighting Match */}
                          <div className="pt-2 border-t border-gray-200 space-y-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase block">Match Suit Lighting</span>
                            <div>
                              <div className="flex justify-between text-[10px] font-bold text-gray-600 mb-0.5">
                                <span>Brightness</span>
                                <span className="tabular-nums">{suitTransform.brightness}%</span>
                              </div>
                              <input
                                type="range"
                                min="60"
                                max="140"
                                value={suitTransform.brightness}
                                onChange={(e) => setSuitTransform((prev) => ({ ...prev, brightness: Number(e.target.value) }))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[10px] font-bold text-gray-600 mb-0.5">
                                <span>Contrast</span>
                                <span className="tabular-nums">{suitTransform.contrast}%</span>
                              </div>
                              <input
                                type="range"
                                min="60"
                                max="140"
                                value={suitTransform.contrast}
                                onChange={(e) => setSuitTransform((prev) => ({ ...prev, contrast: Number(e.target.value) }))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[10px] font-bold text-gray-600 mb-0.5">
                                <span>Saturation</span>
                                <span className="tabular-nums">{suitTransform.saturation}%</span>
                              </div>
                              <input
                                type="range"
                                min="50"
                                max="150"
                                value={suitTransform.saturation}
                                onChange={(e) => setSuitTransform((prev) => ({ ...prev, saturation: Number(e.target.value) }))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                              />
                            </div>
                          </div>

                          <p className="text-[10px] text-gray-500 leading-snug">
                            Tip: Drag directly on the photo to move the suit, use corner handles to resize, side handles for shoulder width, or top handle to tilt.
                          </p>
                        </div>
                      )}
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
                          setBorderThickness(2);
                        }} className="text-[10px] text-[#e8501a] font-bold hover:underline">Reset</button>
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
                        className="w-full py-2.5 px-3 mb-3 bg-gradient-to-r from-[#e8501a]/15 to-[#e8501a]/5 hover:from-[#e8501a]/25 hover:to-[#e8501a]/10 border border-[#e8501a]/30 rounded-xl text-xs font-bold text-[#e8501a] flex items-center justify-center gap-2 transition-all shadow-sm"
                      >
                        <Sparkles className="w-4 h-4 animate-pulse" /> Auto HD Clarity & De-Halo (1-Click)
                      </button>

                      <label className="flex items-center gap-2 p-3 bg-[#e8501a]/5 border border-[#e8501a]/20 rounded-xl cursor-pointer mb-4 hover:bg-[#e8501a]/10 transition-colors">
                        <input type="checkbox" checked={isUltraHD} onChange={(e) => setIsUltraHD(e.target.checked)} className="accent-[#e8501a] w-4 h-4" />
                        <span className="text-sm font-bold text-[#e8501a] flex items-center gap-1"><Sparkles className="w-4 h-4" /> Ultra HD Studio Clarity</span>
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
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div>
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Layout className="w-4 h-4" /> Paper Size
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {PAPER_SIZES.map(paper => (
                          <button
                            key={paper.id}
                            onClick={() => {
                              setPaperSize(paper);
                              setPrintError(null);
                              setPrintNotice(null);
                            }}
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
                            <input type="number" min="20" value={customPaper.width} onChange={e => { setPrintError(null); setCustomPaper({...customPaper, width: Math.max(10, Number(e.target.value))}); }} className="w-full p-2 mt-1 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#e8501a]" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Height (mm)</label>
                            <input type="number" min="20" value={customPaper.height} onChange={e => { setPrintError(null); setCustomPaper({...customPaper, height: Math.max(10, Number(e.target.value))}); }} className="w-full p-2 mt-1 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#e8501a]" />
                          </div>
                        </div>
                      )}

                      {paperSize.id === 'custom-grid' && (
                        <div className="grid grid-cols-2 gap-3 mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Photos per Row</label>
                            <input type="number" min="1" max="20" value={customGrid.cols} onChange={e => { setPrintError(null); setCustomGrid({...customGrid, cols: Math.max(1, Math.min(20, Number(e.target.value) || 1))}); }} className="w-full p-2 mt-1 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#e8501a]" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Number of Rows</label>
                            <input type="number" min="1" max="20" value={customGrid.rows} onChange={e => { setPrintError(null); setCustomGrid({...customGrid, rows: Math.max(1, Math.min(20, Number(e.target.value) || 1))}); }} className="w-full p-2 mt-1 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#e8501a]" />
                          </div>
                        </div>
                      )}

                      {(() => {
                        const layout = computePrintLayout();
                        return (
                          <div className="mt-3 p-3 bg-orange-50/70 border border-orange-200/80 rounded-xl space-y-1">
                            <div className="flex justify-between text-[11px] font-bold text-gray-800">
                              <span>Sheet: {layout.isSingle ? 'A4 Print / Exact Photo' : `${layout.sheetWidthMm} × ${layout.sheetHeightMm} mm`}</span>
                              <span className="text-[#e8501a]">
                                {layout.photoCount} {layout.photoCount === 1 ? 'photo' : 'photos'} • Top-Aligned
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-600 font-medium">
                              Photo Size: <strong className="text-gray-800">{layout.photoWidthMm.toFixed(1)} × {layout.photoHeightMm.toFixed(1)} mm</strong> ({dpi} DPI)
                            </div>
                            <p className="text-[10px] text-gray-600 leading-snug pt-1 border-t border-orange-200/60">
                              Print Tip: Select <strong>Actual Size / 100%</strong> in printer settings (turn OFF &ldquo;Fit to Page&rdquo;) for true passport size.
                            </p>
                          </div>
                        );
                      })()}

                      {printError && (
                        <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600">
                          {printError}
                        </div>
                      )}

                      {printNotice && (
                        <div className="mt-3 p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-medium text-blue-800">
                          {printNotice}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-gray-100 space-y-3">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Options</h3>
                      
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                        <div className="flex justify-between text-sm font-bold text-gray-700">
                          <span>Print Resolution (DPI)</span>
                          <span className="text-[#e8501a] tabular-nums">{dpi} DPI</span>
                        </div>
                        <input 
                          type="range" 
                          min="150" 
                          max="600" 
                          step="1"
                          value={dpi} 
                          onChange={(e) => setDpi(Number(e.target.value))}
                          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e8501a]"
                        />
                        <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                          {[150, 300, 450, 600].map((presetDpi) => (
                            <button
                              key={presetDpi}
                              type="button"
                              onClick={() => setDpi(presetDpi)}
                              className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                                dpi === presetDpi
                                  ? 'bg-[#e8501a] text-white border-[#e8501a] shadow-xs'
                                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              {presetDpi} DPI
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-sm font-bold text-gray-700">Add Photo Border</span>
                          <input type="checkbox" checked={hasBorder} onChange={(e) => setHasBorder(e.target.checked)} className="accent-[#e8501a] w-4 h-4" />
                        </label>
                        
                        {hasBorder && (
                          <div className="pt-2 border-t border-gray-200 space-y-2">
                            <div className="flex justify-between text-xs font-bold text-gray-700">
                              <span>Border Thickness</span>
                              <span className="text-[#e8501a] font-bold">{borderThickness}px ({borderThickness === 2 ? 'Standard' : borderThickness === 1 ? 'Thin' : 'Custom'})</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              {[
                                { label: 'Thin 1px', val: 1 },
                                { label: 'Std 2px', val: 2 },
                                { label: 'Med 3px', val: 3 },
                                { label: 'Thick 4px', val: 4 },
                              ].map((item) => (
                                <button
                                  key={item.val}
                                  type="button"
                                  onClick={() => setBorderThickness(item.val)}
                                  className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                                    borderThickness === item.val
                                      ? 'bg-[#e8501a] text-white border-[#e8501a] shadow-xs'
                                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <label className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                        <span className="text-sm font-bold text-gray-700">Show Cut Lines</span>
                        <input type="checkbox" checked={hasCutLines} onChange={(e) => setHasCutLines(e.target.checked)} className="accent-[#e8501a] w-4 h-4" />
                      </label>
                      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl transition-colors">
                        <span className="text-sm font-bold text-gray-700">Photo Orientation</span>
                        <select 
                          value={printOrientation} 
                          onChange={(e) => {
                            setPrintOrientation(e.target.value as 'vertical' | 'horizontal');
                          }}
                          className="bg-white border border-gray-300 text-gray-700 text-sm rounded-lg focus:ring-[#e8501a] focus:border-[#e8501a] block p-2"
                        >
                          <option value="vertical">Vertical</option>
                          <option value="horizontal">Horizontal</option>
                        </select>
                      </div>
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
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleDownloadSinglePhoto}
                      className="px-4 py-2 bg-gray-100 text-gray-800 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors flex items-center gap-2"
                      title="Download single photo directly"
                    >
                      <Download className="w-4 h-4" /> Single Photo
                    </button>
                    <button 
                      onClick={() => {
                        if (isManualMode) setIsManualMode(false);
                        setZoom(1);
                        setStep('print');
                      }}
                      disabled={isProcessing}
                      className="px-6 py-2 bg-[#e8501a] text-white rounded-xl font-bold text-sm hover:bg-[#d04313] transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      Next <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {step === 'print' && (
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {paperSize.id !== 'single' && (
                      <button 
                        onClick={handleDownloadSinglePhoto}
                        disabled={!finalImageSrc || !printImageElement}
                        className="px-2.5 py-2 bg-gray-100 text-gray-800 rounded-xl font-bold text-xs hover:bg-gray-200 transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Download single passport photo (with exact DPI)"
                      >
                        <Download className="w-3.5 h-3.5" /> Single
                      </button>
                    )}
                    <button
                      onClick={handlePrintSheet}
                      disabled={!finalImageSrc || !printImageElement}
                      className="px-2.5 py-2 bg-[#e8501a] text-white rounded-xl font-bold text-xs hover:bg-[#d04313] transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                      title="Print sheet at exact millimeter size"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print
                    </button>
                    <button
                      onClick={handleDownloadPdf}
                      disabled={!finalImageSrc || !printImageElement}
                      className="px-2.5 py-2 bg-gray-100 text-gray-800 rounded-xl font-bold text-xs hover:bg-gray-200 transition-colors flex items-center gap-1 disabled:opacity-50"
                      title="Download exact-size printable PDF"
                    >
                      <FileText className="w-3.5 h-3.5" /> PDF
                    </button>
                    <button 
                      onClick={handleDownload}
                      disabled={!finalImageSrc || !printImageElement}
                      className="px-3 py-2 bg-gray-900 text-white rounded-xl font-bold text-xs hover:bg-gray-800 transition-colors flex items-center gap-1 shadow-lg shadow-gray-900/20 disabled:opacity-50"
                      title={paperSize.id === 'single' ? 'Download single PNG' : 'Download sheet JPG with physical DPI metadata'}
                    >
                      <Download className="w-3.5 h-3.5" /> {paperSize.id === 'single' ? 'Download' : 'JPG'}
                    </button>
                  </div>
                )}
              </div>
            </aside>

            {/* --- MAIN PREVIEW AREA --- */}
            <main className="flex-1 relative bg-[#e5e7eb] flex flex-col h-full overflow-hidden max-h-[600px] lg:max-h-none order-1 lg:order-1">
              
              {/* Toolbar (Zoom) - Improved with slider */}
              <div className="w-full pt-2 pb-1 flex justify-center items-center shrink-0 z-20 relative">
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
                    onClick={() => setZoom(step === 'print' ? 1 : 0.8)} 
                    className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 transition-colors" 
                    title="Reset Zoom"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>

                  {step === 'edit' && selectedSuitId && !isManualMode && (
                    <>
                      <div className="w-px h-4 bg-gray-300 mx-1" />
                      <button
                        type="button"
                        onClick={handleAutoFitSuit}
                        className="px-2.5 py-1 bg-[#e8501a]/10 hover:bg-[#e8501a]/20 text-[#e8501a] rounded-full text-[11px] font-bold flex items-center gap-1 transition-colors"
                        title="Auto-align suit to neck and shoulders"
                      >
                        <Sparkles className="w-3 h-3" /> Auto-Fit
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSuitHandles((v) => !v)}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-[11px] font-bold flex items-center gap-1 transition-colors"
                        title="Show or hide suit adjustment handles"
                      >
                        {showSuitHandles ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showSuitHandles ? 'Hide Box' : 'Show Box'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Preview Container - Darker background for focus */}
              <div ref={printPreviewAreaRef} className="flex-1 w-full overflow-auto p-4 sm:p-8 min-h-0 bg-gray-200/50">
                <div className="min-h-full flex items-center justify-center m-auto w-max min-w-full">
                  
                  {step === 'crop' && imageSrc && (() => {
                    const baseCropH = typeof window !== 'undefined' ? Math.round(Math.min(540, Math.max(300, window.innerHeight * 0.58))) : 440;
                    return (
                      <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c, pc) => {
                          setCompletedCrop(c);
                          setCompletedPercentCrop(pc);
                        }}
                        aspect={selectedPreset.id !== 'free' ? selectedPreset.width / selectedPreset.height : undefined}
                        className="shadow-2xl rounded-sm bg-white border border-gray-300 shrink-0"
                      >
                        <img 
                          ref={imgRef}
                          src={imageSrc} 
                          alt="Upload" 
                          onLoad={onImageLoad}
                          style={{ 
                            height: `${Math.round(baseCropH * zoom)}px`,
                            width: 'auto',
                            maxWidth: 'none',
                            maxHeight: 'none',
                            display: 'block', 
                            imageRendering: 'high-quality',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)'
                          }}
                        />
                      </ReactCrop>
                    );
                  })()}

                  {step === 'edit' && (() => {
                    const { frameW, frameH, canvasCssW, canvasCssH } = getManualCanvasCssDims(canvasDims);
                    const suitBox = !isManualMode && processedSuit ? getSuitFrameBox(frameW, frameH, processedSuit, suitTransform) : null;

                    return (
                    <div 
                      ref={editFrameRef}
                      className="relative shadow-2xl rounded-sm overflow-visible flex items-center justify-center shrink-0 select-none"
                      style={{
                        width: `${frameW}px`,
                        height: `${frameH}px`,
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)'
                      }}
                    >
                      <div
                        className="absolute inset-0 rounded-sm overflow-hidden flex items-center justify-center"
                        style={{
                          backgroundColor: bgColor === 'transparent' || bgColor === 'custom-image' ? 'transparent' : (bgColor === 'custom' ? customColor : bgColor),
                          backgroundImage: bgColor === 'transparent' ? 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 8px 8px' : 'none',
                        }}
                      >
                      {isManualMode ? (
                        <div
                          className="flex items-center justify-center w-full h-full relative"
                          onMouseEnter={(e) => updateTouchupCursor(e, false)}
                          onMouseMove={(e) => updateTouchupCursor(e, false)}
                          onMouseLeave={() => setTouchupCursor(null)}
                        >
                          {bgColor === 'custom-image' && customBgImage && (
                            <img src={customBgImage} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" />
                          )}
                          <div
                            className="relative shrink-0"
                            style={{
                              width: `${canvasCssW}px`,
                              height: `${canvasCssH}px`,
                            }}
                          >
                            {/* Rear Suit Collar Layer (behind subject cutout) */}
                            <canvas
                              ref={touchupSuitBackRef}
                              className="absolute inset-0 z-[5] block pointer-events-none select-none"
                              style={{
                                width: `${canvasCssW}px`,
                                height: `${canvasCssH}px`,
                                imageRendering: 'auto',
                              }}
                            />
                            {/* Interactive Subject Touchup Canvas */}
                            <canvas
                              ref={touchupCanvasRef}
                              onMouseDown={(e) => { updateTouchupCursor(e, false); startDrawing(e); }}
                              onMouseMove={(e) => { updateTouchupCursor(e, false); draw(e); }}
                              onMouseUp={stopDrawing}
                              onMouseLeave={() => { setTouchupCursor(null); stopDrawing(); }}
                              onTouchStart={(e) => { updateTouchupCursor(e, true); startDrawing(e); }}
                              onTouchMove={(e) => { updateTouchupCursor(e, true); draw(e); }}
                              onTouchEnd={stopDrawing}
                              className="relative z-10 block cursor-none touch-none select-none"
                              style={{
                                width: `${canvasCssW}px`,
                                height: `${canvasCssH}px`,
                                filter: `brightness(${brightness}%) contrast(${contrast + (isUltraHD ? 15 : 0)}%) saturate(${saturation + (isUltraHD ? 20 : 0)}%)`,
                                backgroundColor: 'transparent',
                                imageRendering: 'auto',
                              }}
                            />
                            {/* Front Tailored Suit Layer (live over subject, supports suit erase/restore) */}
                            <canvas
                              ref={touchupSuitFrontRef}
                              className="absolute inset-0 z-20 block pointer-events-none select-none"
                              style={{
                                width: `${canvasCssW}px`,
                                height: `${canvasCssH}px`,
                                imageRendering: 'auto',
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <canvas
                            ref={editLiveCanvasRef}
                            className={`w-full h-full object-contain block transition-opacity duration-200 ${isProcessingFilters ? 'opacity-50' : 'opacity-100'}`}
                            style={{ imageRendering: 'auto' }}
                          />
                        </>
                      )}
                      </div>

                      {/* Interactive Direct-Manipulation Suit Handles (Unclipped outer layer: Move, Corner Scale, Shoulder Width, Height, Rotate) */}
                      {!isManualMode && suitBox && showSuitHandles && !isProcessing && !isProcessingFilters && (
                            <>
                              {/* Magnetic Center Snap Guide Line while dragging */}
                              {isDraggingSuit && Math.abs(suitTransform.x) < 0.1 && (
                                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1.5px] bg-[#e8501a]/80 pointer-events-none z-20" />
                              )}

                              <div
                                onPointerDown={(e) => startSuitDrag(e, 'move', frameW, frameH)}
                                className="absolute z-20 cursor-move touch-none"
                                style={{
                                  left: `${suitBox.cx}px`,
                                  top: `${suitBox.cy}px`,
                                  width: `${suitBox.width}px`,
                                  height: `${suitBox.height}px`,
                                  transform: `translate(-50%, -50%) rotate(${suitBox.rotation}deg)`,
                                }}
                                title="Drag to reposition suit"
                              >
                                {/* Selection Outline */}
                                <div className="absolute inset-0 border-[1.5px] border-dashed border-[#e8501a]/90 shadow-[0_0_0_1px_rgba(255,255,255,0.7)] pointer-events-none" />

                                {/* Collar Pivot Marker */}
                                <div
                                  className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#e8501a] border-2 border-white shadow-sm pointer-events-none"
                                  style={{ top: `${(processedSuit?.collarAnchorNormY ?? 0.14) * 100}%` }}
                                />

                                {/* Top Rotation Handle */}
                                <div
                                  onPointerDown={(e) => startSuitDrag(e, 'rotate', frameW, frameH)}
                                  className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-grab active:cursor-grabbing touch-none"
                                  title="Drag to tilt / rotate suit"
                                >
                                  <div className="w-6 h-6 rounded-full bg-white border-2 border-[#e8501a] shadow-md flex items-center justify-center text-[#e8501a] hover:scale-110 transition-transform">
                                    <RotateCw className="w-3 h-3" />
                                  </div>
                                  <div className="w-0.5 h-2 bg-[#e8501a]" />
                                </div>

                                {/* 4 Corner Uniform Scale Handles */}
                                <div
                                  onPointerDown={(e) => startSuitDrag(e, 'scale-nw', frameW, frameH)}
                                  className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-white border-2 border-[#e8501a] shadow-md cursor-nwse-resize hover:scale-125 transition-transform touch-none"
                                  title="Resize suit"
                                />
                                <div
                                  onPointerDown={(e) => startSuitDrag(e, 'scale-ne', frameW, frameH)}
                                  className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-white border-2 border-[#e8501a] shadow-md cursor-nesw-resize hover:scale-125 transition-transform touch-none"
                                  title="Resize suit"
                                />
                                <div
                                  onPointerDown={(e) => startSuitDrag(e, 'scale-sw', frameW, frameH)}
                                  className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-white border-2 border-[#e8501a] shadow-md cursor-nesw-resize hover:scale-125 transition-transform touch-none"
                                  title="Resize suit"
                                />
                                <div
                                  onPointerDown={(e) => startSuitDrag(e, 'scale-se', frameW, frameH)}
                                  className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-white border-2 border-[#e8501a] shadow-md cursor-nwse-resize hover:scale-125 transition-transform touch-none"
                                  title="Resize suit"
                                />

                                {/* Left & Right Shoulder Width Handles */}
                                <div
                                  onPointerDown={(e) => startSuitDrag(e, 'width-w', frameW, frameH)}
                                  className="absolute top-[30%] -left-2 -translate-y-1/2 w-3.5 h-6 rounded-full bg-[#e8501a] border-2 border-white shadow-md cursor-ew-resize hover:scale-110 transition-transform touch-none"
                                  title="Adjust shoulder width"
                                />
                                <div
                                  onPointerDown={(e) => startSuitDrag(e, 'width-e', frameW, frameH)}
                                  className="absolute top-[30%] -right-2 -translate-y-1/2 w-3.5 h-6 rounded-full bg-[#e8501a] border-2 border-white shadow-md cursor-ew-resize hover:scale-110 transition-transform touch-none"
                                  title="Adjust shoulder width"
                                />

                                {/* Bottom Torso Height Handle */}
                                <div
                                  onPointerDown={(e) => startSuitDrag(e, 'height-s', frameW, frameH)}
                                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-7 h-3 rounded-full bg-[#e8501a] border-2 border-white shadow-md cursor-ns-resize hover:scale-110 transition-transform touch-none"
                                  title="Adjust torso height"
                                />
                              </div>
                            </>
                          )}

                          {!isManualMode && (isProcessingFilters || (!finalImageSrc && !refinedSubjectCanvasRef.current)) && (
                            <div className="absolute inset-0 flex items-center justify-center">
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
                                className="relative w-16 h-20 flex flex-col items-center justify-center filter drop-shadow-[0_0_10px_rgba(232,80,26,0.6)]"
                              >
                                {/* Upper Head */}
                                <div className="w-10 h-8 bg-[#e8501a] rounded-t-[100%] rounded-b-[20%] relative overflow-hidden shadow-inner">
                                  <div className="absolute inset-x-0 top-0 h-1 bg-white/40" />
                                </div>
                                {/* Waist */}
                                <div className="w-3 h-3 bg-white/90 z-10 border border-[#e8501a] rounded-sm shadow-sm" />
                                {/* Lower Head */}
                                <div className="w-10 h-8 bg-[#e8501a] rounded-b-[100%] rounded-t-[20%] relative overflow-hidden shadow-inner">
                                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/40" />
                                </div>
                                
                                {/* Side Beads/Strings for Damru */}
                                <motion.div 
                                  animate={{ rotate: [-60, 60] }} 
                                  transition={{ duration: 0.08, repeat: Infinity, repeatType: "mirror" }}
                                  className="absolute left-[0px] top-1/2 w-6 h-[2px] bg-gray-300 origin-right rounded-full"
                                >
                                   <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-100 rounded-full border border-[#e8501a] shadow-sm" />
                                </motion.div>
                                <motion.div 
                                  animate={{ rotate: [60, -60] }} 
                                  transition={{ duration: 0.08, repeat: Infinity, repeatType: "mirror" }}
                                  className="absolute right-[0px] top-1/2 w-6 h-[2px] bg-gray-300 origin-left rounded-full"
                                >
                                   <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-100 rounded-full border border-[#e8501a] shadow-sm" />
                                </motion.div>
                              </motion.div>
                            </div>
                          )}
                      
                      {processingError && (
                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center z-50 text-white p-6 transition-all duration-300 backdrop-blur-sm">
                          <div className="bg-gray-900/95 backdrop-blur-md px-8 py-8 rounded-2xl shadow-2xl flex flex-col items-center text-center border border-red-500/30 max-w-sm">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                              <X className="w-6 h-6 text-red-500" />
                            </div>
                            <h3 className="text-lg font-bold mb-2">Processing Failed</h3>
                            <p className="text-sm text-gray-400 mb-6">{processingError}</p>
                            <button 
                              onClick={() => croppedImageSrc && removeBackgroundFromSrc(croppedImageSrc)}
                              className="w-full py-3 bg-[#e8501a] text-white rounded-xl font-bold text-sm hover:bg-[#d04313] transition-colors flex items-center justify-center gap-2"
                            >
                              <RefreshCw className="w-4 h-4" /> Try Again
                            </button>
                          </div>
                        </div>
                      )}

                      {isProcessing && !processingError && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center z-50 text-white p-6 transition-all duration-300">
                          <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex flex-col items-center justify-center p-10 bg-gray-900/40 rounded-3xl shadow-2xl relative border border-white/10"
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
                              className="relative w-24 h-28 flex flex-col items-center justify-center filter drop-shadow-[0_0_20px_rgba(232,80,26,0.6)]"
                            >
                              {/* Upper Head */}
                              <div className="w-16 h-12 bg-[#e8501a] rounded-t-[100%] rounded-b-[20%] relative overflow-hidden shadow-inner">
                                <div className="absolute inset-x-0 top-0 h-1 bg-white/40" />
                              </div>
                              {/* Waist */}
                              <div className="w-5 h-5 bg-white/90 z-10 border-2 border-[#e8501a] rounded-sm shadow-sm" />
                              {/* Lower Head */}
                              <div className="w-16 h-12 bg-[#e8501a] rounded-b-[100%] rounded-t-[20%] relative overflow-hidden shadow-inner">
                                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/40" />
                              </div>
                              
                              {/* Side Beads/Strings for Damru */}
                              <motion.div 
                                animate={{ rotate: [-60, 60] }} 
                                transition={{ duration: 0.08, repeat: Infinity, repeatType: "mirror" }}
                                className="absolute left-[-25px] top-1/2 w-12 h-[3px] bg-white origin-right rounded-full"
                              >
                                 <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-[#e8501a] shadow-sm" />
                              </motion.div>
                              <motion.div 
                                animate={{ rotate: [60, -60] }} 
                                transition={{ duration: 0.08, repeat: Infinity, repeatType: "mirror" }}
                                className="absolute right-[-25px] top-1/2 w-12 h-[3px] bg-white origin-left rounded-full"
                              >
                                 <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-[#e8501a] shadow-sm" />
                              </motion.div>
                            </motion.div>
                          </motion.div>
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {step === 'print' && renderPrintPreview()}

                </div>
              </div>

              {/* Round Shape Brush Cursor Overlay for Desktop & Mobile Touch (fixed viewport, unaffected by zoom/scroll) */}
              {step === 'edit' && isManualMode && touchupCursor && (
                <div
                  className="pointer-events-none fixed z-50 rounded-full -translate-x-1/2 -translate-y-1/2 select-none transition-transform duration-75"
                  style={{
                    left: `${touchupCursor.x}px`,
                    top: `${touchupCursor.y}px`,
                    width: `${getBrushRenderedDiameter()}px`,
                    height: `${getBrushRenderedDiameter()}px`,
                    border: '2px solid rgba(255, 255, 255, 0.95)',
                    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.8), 0 0 12px rgba(0, 0, 0, 0.4)',
                    backgroundColor:
                      touchupTarget === 'suit' && processedSuit
                        ? brushMode === 'erase'
                          ? 'rgba(232, 80, 26, 0.38)'
                          : 'rgba(16, 185, 129, 0.38)'
                        : brushMode === 'erase'
                          ? 'rgba(239, 68, 68, 0.35)'
                          : 'rgba(59, 130, 246, 0.35)',
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
