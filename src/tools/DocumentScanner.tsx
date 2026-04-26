import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  FileText, 
  Image as ImageIcon, 
  Download, 
  RotateCw, 
  Trash2, 
  Plus, 
  ChevronRight, 
  ChevronLeft,
  Settings,
  X,
  FlipHorizontal,
  CheckCircle2,
  Filter,
  Layers,
  Sparkles,
  Zap,
  Scissors,
  Maximize
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as fabric from 'fabric';

// Note: OpenCV.js is imported via script tag in index.html or loaded dynamically
// For this environment, we'll implement a robust manual crop first then add AI/OpenCV if ready

interface ScannedPage {
  id: string;
  dataUrl: string;
  filter: 'none' | 'grayscale' | 'contrast' | 'sepia';
  perspectivePoints?: { x: number, y: number }[];
}

interface CropState {
  pageId: string;
  isOpen: boolean;
}

export default function DocumentScanner() {
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(-1);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cropState, setCropState] = useState<CropState>({ pageId: '', isOpen: false });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize Fabric Canvas for cropping
  useEffect(() => {
    if (cropState.isOpen && fabricCanvasRef.current) {
      const page = pages.find(p => p.id === cropState.pageId);
      if (!page) return;

      const img = new Image();
      img.onload = () => {
        const maxWidth = window.innerWidth * 0.8;
        const maxHeight = window.innerHeight * 0.6;
        let scale = Math.min(maxWidth / img.width, maxHeight / img.height);
        
        const width = img.width * scale;
        const height = img.height * scale;

        const canvas = new fabric.Canvas(fabricCanvasRef.current, {
          width,
          height,
          selection: false
        });

        fabric.Image.fromURL(page.dataUrl).then((fImg) => {
          fImg.set({
            selectable: false,
            evented: false,
            scaleX: scale,
            scaleY: scale
          });
          canvas.add(fImg);
          
          // Initial points (corners)
          const margin = 40;
          const points = [
            { x: margin, y: margin },
            { x: width - margin, y: margin },
            { x: width - margin, y: height - margin },
            { x: margin, y: height - margin }
          ];

          const polygon = new fabric.Polygon(points, {
            fill: 'rgba(var(--accent-rgb), 0.1)',
            stroke: 'rgba(var(--accent-rgb), 0.8)',
            strokeWidth: 2,
            selectable: false,
            evented: false,
            objectCaching: false
          });
          canvas.add(polygon);

          // Create draggable handles
          points.forEach((p, i) => {
            const circle = new fabric.Circle({
              left: p.x,
              top: p.y,
              radius: 12,
              fill: '#ffffff',
              stroke: 'rgba(var(--accent-rgb), 1)',
              strokeWidth: 3,
              originX: 'center',
              originY: 'center',
              hasControls: false,
              hasBorders: false,
              data: { index: i }
            });

            circle.on('moving', (e) => {
              const newPoints = [...polygon.points];
              newPoints[i] = { x: circle.left!, y: circle.top! };
              polygon.set({ points: newPoints });
              canvas.requestRenderAll();
            });

            canvas.add(circle);
          });

          fabricRef.current = canvas;
        });
      };
      img.src = page.dataUrl;
    }

    return () => {
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
  }, [cropState.isOpen, cropState.pageId]);

  const autoDetectEdges = () => {
    // Basic heuristic: search for high contrast areas or just reset to a nice center quad
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    const width = canvas.width!;
    const height = canvas.height!;
    const inset = 60;
    
    // In a real app with OpenCV loaded, we'd use findContours here.
    // For now, we reset to a document-like shape
    const newPoints = [
      { x: inset, y: inset },
      { x: width - inset, y: inset },
      { x: width - inset, y: height - inset },
      { x: inset, y: height - inset }
    ];

    const poly = canvas.getObjects('polygon')[0] as fabric.Polygon;
    poly.set({ points: newPoints });
    
    const circles = canvas.getObjects('circle');
    circles.forEach((c, i) => {
      c.set({ left: newPoints[i].x, top: newPoints[i].y });
    });
    
    canvas.requestRenderAll();
  };

  const applyPerspectiveCrop = async () => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    const poly = canvas.getObjects('polygon')[0] as fabric.Polygon;
    const page = pages.find(p => p.id === cropState.pageId);
    if (!page) return;

    const img = await loadImage(page.dataUrl);
    const scaleX = img.width / canvas.width!;
    const scaleY = img.height / canvas.height!;

    const srcPoints = poly.points.map(p => ({
      x: p.x * scaleX,
      y: p.y * scaleY
    }));

    // Perform perspective transform
    const resultDataUrl = await performPerspectiveWarp(img, srcPoints);
    
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, dataUrl: resultDataUrl } : p));
    setCropState({ pageId: '', isOpen: false });
  };

  const performPerspectiveWarp = (img: HTMLImageElement, pts: {x: number, y: number}[]): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Determine output size (max of edges for aspect ratio)
      const w1 = Math.sqrt(Math.pow(pts[1].x - pts[0].x, 2) + Math.pow(pts[1].y - pts[0].y, 2));
      const w2 = Math.sqrt(Math.pow(pts[2].x - pts[3].x, 2) + Math.pow(pts[2].y - pts[3].y, 2));
      const h1 = Math.sqrt(Math.pow(pts[3].x - pts[0].x, 2) + Math.pow(pts[3].y - pts[0].y, 2));
      const h2 = Math.sqrt(Math.pow(pts[2].x - pts[1].x, 2) + Math.pow(pts[2].y - pts[1].y, 2));
      
      const width = Math.max(w1, w2);
      const height = Math.max(h1, h2);

      canvas.width = width;
      canvas.height = height;

      // Manual perspective transform logic
      // In a production app, use cv.getPerspectiveTransform(src, dst)
      // For now, we'll use a simplified homography or draw image slices (triangulation)
      // Since triangulation is complex in pure canvas, I'll use a safe approximation 
      // or if OpenCV is actually available in the environment from package.json, try it.
      
      // FALLBACK: Simple crop if warp logic is unavailable in pure canvas
      // But let's try a triangle-based warp
      const drawTriangle = (s1:any, s2:any, s3:any, d1:any, d2:any, d3:any) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(d1.x, d1.y);
        ctx.lineTo(d2.x, d2.y);
        ctx.lineTo(d3.x, d3.y);
        ctx.closePath();
        ctx.clip();

        const denom = (s1.x - s3.x) * (s2.y - s3.y) - (s1.y - s3.y) * (s2.x - s3.x);
        const a = ((d1.x - d3.x) * (s2.y - s3.y) - (d2.x - d3.x) * (s1.y - s3.y)) / denom;
        const b = ((d2.x - d3.x) * (s1.x - s3.x) - (d1.x - d3.x) * (s2.x - s3.x)) / denom;
        const c = d3.x - a * s3.x - b * s3.y;
        const d = ((d1.y - d3.y) * (s2.y - s3.y) - (d2.y - d3.y) * (s1.y - s3.y)) / denom;
        const e = ((d2.y - d3.y) * (s1.x - s3.x) - (d1.y - d3.y) * (s2.x - s3.x)) / denom;
        const f = d3.y - d * s3.x - e * s3.y;

        ctx.transform(a, d, b, e, c, f);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      };

      // Split quad into two triangles
      drawTriangle(pts[0], pts[1], pts[2], {x:0, y:0}, {x:width, y:0}, {x:width, y:height});
      drawTriangle(pts[0], pts[2], pts[3], {x:0, y:0}, {x:width, y:height}, {x:0, y:height});

      resolve(canvas.toDataURL('image/jpeg', 0.95));
    });
  };

  // Initialize device list without prompting for permissions yet
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setDevices(videoDevices);
      } catch (err) {
        console.error("Error listing devices:", err);
      }
    };
    getDevices();
  }, []);

  // Handle stream attachment to video element
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isCameraActive]);

  const startCamera = async () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId } }
          : { facingMode: 'environment' } // Default to back camera
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setIsCameraActive(true);

      // Refresh devices to get labels now that we have permission
      const updatedDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = updatedDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
      
      if (videoDevices.length > 0 && !selectedDeviceId) {
        const backCam = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
        setSelectedDeviceId(backCam ? backCam.deviceId : videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      // Fallback for some browsers that might fail with exact deviceId
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setStream(fallbackStream);
        setIsCameraActive(true);
      } catch (fallbackErr) {
        alert("Camera access denied or device not found. Please check permissions.");
      }
    }
  };

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  }, [stream]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const newPage: ScannedPage = {
        id: Math.random().toString(36).substr(2, 9),
        dataUrl,
        filter: 'none'
      };
      setPages(prev => [...prev, newPage]);
      setCurrentPageIndex(pages.length);
      stopCamera();
    }
  };

  const deletePage = (id: string) => {
    const updated = pages.filter(p => p.id !== id);
    setPages(updated);
    if (currentPageIndex >= updated.length) {
      setCurrentPageIndex(updated.length - 1);
    }
  };

  const applyPageFilter = (id: string, filterType: ScannedPage['filter']) => {
    setPages(pages.map(p => p.id === id ? { ...p, filter: filterType } : p));
  };

  const getFilteredDataUrl = (dataUrl: string, filter: string): string => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const img = new Image();
    img.src = dataUrl;

    // This is a synchronous placeholder. Real implementation needs to handle image loading.
    // For now, we'll apply CSS filters in the UI and apply to export.
    return dataUrl;
  };

  const downloadAll = async (format: 'pdf' | 'jpg') => {
    if (pages.length === 0) return;
    setIsSaving(true);

    try {
      if (format === 'pdf') {
        const pdf = new jsPDF();
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const img = await loadImage(page.dataUrl);
          
          // Process image with filter on a canvas before adding to PDF
          const processedDataUrl = await processImageData(img, page.filter);
          
          const imgProps = pdf.getImageProperties(processedDataUrl);
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          
          if (i > 0) pdf.addPage();
          pdf.addImage(processedDataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        }
        pdf.save(`scan_${Date.now()}.pdf`);
      } else {
        // Zip multiple photos or just download one if it's single
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const img = await loadImage(page.dataUrl);
          const processedUrl = await processImageData(img, page.filter);
          const link = document.createElement('a');
          link.href = processedUrl;
          link.download = `scan_page_${i + 1}_${Date.now()}.jpg`;
          link.click();
        }
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = url;
    });
  };

  const processImageData = async (img: HTMLImageElement, filterType: string): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;

    switch (filterType) {
      case 'grayscale': ctx.filter = 'grayscale(100%)'; break;
      case 'contrast': ctx.filter = 'contrast(150%) brightness(110%)'; break;
      case 'sepia': ctx.filter = 'sepia(80%)'; break;
      default: ctx.filter = 'none';
    }

    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const currentFilterClass = (filter: string) => {
    switch (filter) {
      case 'grayscale': return 'grayscale';
      case 'contrast': return 'contrast-150 brightness-110';
      case 'sepia': return 'sepia-80';
      default: return '';
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-8 bg-surface-dark/5 rounded-3xl">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-text-primary flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-accent" /> Document Scanner
          </h2>
          <p className="text-text-muted mt-2">Scan multi-page documents to PDF or JPG with filters</p>
        </div>
        
        <div className="flex items-center gap-3 bg-surface p-2 rounded-2xl border border-border">
          <select 
            className="bg-transparent text-sm font-medium px-3 outline-none min-w-[150px]"
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
          >
            {devices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
              </option>
            ))}
          </select>
          <div className="w-px h-6 bg-border" />
          <button 
            onClick={isCameraActive ? stopCamera : startCamera}
            className={`p-2 rounded-xl transition-colors ${
              isCameraActive ? 'bg-red-500/10 text-red-500' : 'bg-accent/10 text-accent'
            }`}
          >
            {isCameraActive ? <X className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Viewport */}
        <div className="lg:col-span-2 space-y-4">
          <div className="aspect-[3/4] bg-bg-secondary rounded-3xl relative overflow-hidden border-2 border-dashed border-border group">
            <AnimatePresence mode="wait">
              {isCameraActive ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0"
                >
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 pointer-events-none border-[1px] border-white/20">
                     {/* Scanning frame overlay */}
                     <div className="absolute inset-10 border-2 border-accent/40 rounded-lg shadow-[0_0_100px_rgba(var(--accent-rgb),0.1)]">
                        <motion.div 
                          animate={{ top: ['0%', '100%', '0%'] }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                          className="absolute left-0 right-0 h-0.5 bg-accent shadow-[0_0_15px_rgba(var(--accent-rgb),1)]"
                        />
                     </div>
                  </div>
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6">
                    <button 
                      onClick={capturePhoto}
                      className="w-16 h-16 bg-white rounded-full border-4 border-accent p-1 active:scale-95 transition-transform flex items-center justify-center"
                    >
                      <div className="w-full h-full bg-accent rounded-full flex items-center justify-center text-white">
                        <Camera className="w-6 h-6" />
                      </div>
                    </button>
                  </div>
                </motion.div>
              ) : currentPageIndex >= 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 p-4 flex items-center justify-center"
                >
                  <img 
                    src={pages[currentPageIndex].dataUrl} 
                    alt="Scanned Page"
                    className={`max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-all duration-500 ${currentFilterClass(pages[currentPageIndex].filter)}`}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-6 right-6 flex flex-col gap-2">
                    <button 
                      onClick={() => setCropState({ pageId: pages[currentPageIndex].id, isOpen: true })}
                      className="p-3 bg-accent text-white rounded-full shadow-lg hover:scale-110 transition-transform"
                      title="Adjust Crop"
                    >
                      <Scissors className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => deletePage(pages[currentPageIndex].id)}
                      className="p-3 bg-red-500 text-white rounded-full shadow-lg hover:scale-110 transition-transform"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted">
                  <div className="w-24 h-24 bg-surface rounded-full flex items-center justify-center mb-4 border border-border">
                    <ImageIcon className="w-10 h-10 opacity-20" />
                  </div>
                  <p className="font-bold">No Scanned Pages</p>
                  <button 
                    onClick={startCamera}
                    className="btn bp mt-6 h-12 px-8 rounded-2xl gap-2"
                  >
                    <Plus className="w-4 h-4" /> Start Camera
                  </button>
                </div>
              )}
            </AnimatePresence>
          </div>

          {pages.length > 0 && (
            <div className="flex items-center justify-between text-sm text-text-muted px-2">
              <div className="flex items-center gap-2">
                <button 
                  disabled={currentPageIndex <= 0}
                  onClick={() => setCurrentPageIndex(p => p - 1)}
                  className="p-2 hover:bg-surface rounded-lg disabled:opacity-30"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="font-mono">Page {currentPageIndex + 1} / {pages.length}</span>
                <button 
                  disabled={currentPageIndex >= pages.length - 1}
                  onClick={() => setCurrentPageIndex(p => p + 1)}
                  className="p-2 hover:bg-surface rounded-lg disabled:opacity-30"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs bg-accent/10 px-3 py-1 rounded-full border border-accent/20 text-accent font-bold uppercase tracking-widest">
                {pages[currentPageIndex]?.filter}
              </p>
            </div>
          )}
        </div>

        {/* Sidebar Controls */}
        <div className="space-y-6">
          <div className="bg-surface border border-border p-6 rounded-3xl space-y-6 shadow-sm shadow-text-muted/5">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">Image Filters</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'none', label: 'Original', icon: <Sparkles /> },
                { id: 'grayscale', label: 'B & W', icon: <RotateCw /> },
                { id: 'contrast', label: 'Digitalize', icon: <Zap /> },
                { id: 'sepia', label: 'Classic', icon: <FlipHorizontal /> }
              ].map(f => (
                <button
                  key={f.id}
                  disabled={currentPageIndex === -1}
                  onClick={() => applyPageFilter(pages[currentPageIndex].id, f.id as any)}
                  className={`p-4 rounded-2xl flex flex-col items-center gap-3 transition-all border ${
                    pages[currentPageIndex]?.filter === f.id 
                      ? 'bg-accent/10 border-accent text-accent shadow-inner' 
                      : 'bg-bg-secondary border-transparent hover:border-border grayscale'
                  } disabled:opacity-20`}
                >
                  <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center shadow-sm">
                    {React.cloneElement(f.icon as React.ReactElement, { className: 'w-5 h-5' })}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-tighter">{f.label}</span>
                </button>
              ))}
            </div>

            <div className="h-px bg-border my-6" />

            <div className="flex items-center gap-2 mb-4">
              <Download className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">Export Options</h3>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => downloadAll('pdf')}
                disabled={pages.length === 0 || isSaving}
                className="w-full btn bp h-14 rounded-2xl text-lg gap-3 shadow-lg shadow-accent/20"
              >
                {isSaving ? <RotateCw className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                Export to PDF
              </button>
              <button 
                onClick={() => downloadAll('jpg')}
                disabled={pages.length === 0 || isSaving}
                className="w-full btn bg-bg-secondary text-text-primary hover:bg-surface h-14 rounded-2xl text-lg gap-3 border border-border"
              >
                {isSaving ? <RotateCw className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                Export to JPG
              </button>
            </div>
          </div>

          {/* Thumbnail list */}
          {pages.length > 0 && (
            <div className="bg-surface border border-border p-4 rounded-3xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-accent" />
                  <span className="text-xs font-bold uppercase tracking-wider text-text-muted">All Pages ({pages.length})</span>
                </div>
                {!isCameraActive && (
                  <button 
                    onClick={startCamera}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-accent text-white hover:scale-105 transition-transform"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {pages.map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => setCurrentPageIndex(idx)}
                    className={`aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all relative group ${
                      idx === currentPageIndex ? 'border-accent shadow-md' : 'border-transparent'
                    }`}
                  >
                    <img 
                      src={p.dataUrl} 
                      className={`w-full h-full object-cover ${currentFilterClass(p.filter)}`}
                      alt={`Page ${idx + 1}`}
                      referrerPolicy="no-referrer"
                    />
                    <div className={`absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-accent/20 transition-opacity`}>
                      <span className="bg-white/90 text-accent font-black text-[10px] px-1.5 py-0.5 rounded-sm shadow-sm">{idx + 1}</span>
                    </div>
                    {idx === currentPageIndex && (
                      <div className="absolute top-1 right-1">
                        <CheckCircle2 className="w-3 h-3 text-accent fill-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Advanced Crop Overlay */}
      <AnimatePresence>
        {cropState.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 sm:p-10"
          >
            <div className="w-full max-w-4xl flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-accent" /> Perspective Crop
                </h3>
                <p className="text-gray-400 text-sm">Drag corners to match your document boundaries</p>
              </div>
              <button 
                onClick={() => setCropState({ pageId: '', isOpen: false })}
                className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="relative flex-1 w-full flex items-center justify-center bg-gray-900 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <canvas ref={fabricCanvasRef} />
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
                <button 
                  onClick={autoDetectEdges}
                  className="px-6 py-2.5 bg-accent/20 text-accent border border-accent/30 rounded-full font-bold text-sm hover:bg-accent hover:text-white transition-all flex items-center gap-2"
                >
                  <Maximize className="w-4 h-4" /> Auto Detect
                </button>
                <button 
                  onClick={applyPerspectiveCrop}
                  className="px-8 py-2.5 bg-accent text-white rounded-full font-bold text-sm shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Apply & Crop
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(var(--accent-rgb), 0.2);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
