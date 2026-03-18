import React, { useState, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { Download, RefreshCw, Settings, CheckCircle2, AlertCircle, Image as ImageIcon, Type, Maximize2, FileImage } from 'lucide-react';
import ToolLayout from '../components/tool-system/ToolLayout';

interface Point {
  x: number;
  y: number;
}

interface Area {
  width: number;
  height: number;
  x: number;
  y: number;
}

export default function PhotoSignResizer() {
  const [image, setImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [targetWidth, setTargetWidth] = useState(300);
  const [targetHeight, setTargetHeight] = useState(400);
  const [targetKB, setTargetKB] = useState(50);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; size: number; width: number; height: number } | null>(null);
  const [fileName, setFileName] = useState('photo');
  const [originalFileName, setOriginalFileName] = useState('');

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFiles = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      setOriginalFileName(file.name.split('.')[0]);
      const reader = new FileReader();
      reader.addEventListener('load', () => setImage(reader.result as string));
      reader.readAsDataURL(file);
      setResult(null);
      
      if (file.name.toLowerCase().includes('sign')) setFileName('sign');
      else setFileName('photo');
    }
  };

  const setPreset = (w: number, h: number, kb: number, name: string) => {
    setTargetWidth(w);
    setTargetHeight(h);
    setTargetKB(kb);
    setFileName(name);
    setResult(null);
  };

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
    targetW: number,
    targetH: number,
    targetKB: number
  ) => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    canvas.width = targetW;
    canvas.height = targetH;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      targetW,
      targetH
    );

    // Iterative compression to reach target KB
    let quality = 0.95;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    let size = Math.round((dataUrl.length * 3) / 4 / 1024);

    if (size > targetKB) {
      let min = 0.01;
      let max = 0.95;
      for (let i = 0; i < 8; i++) {
        quality = (min + max) / 2;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        size = Math.round((dataUrl.length * 3) / 4 / 1024);
        if (size > targetKB) {
          max = quality;
        } else {
          min = quality;
        }
      }
      dataUrl = canvas.toDataURL('image/jpeg', min);
      size = Math.round((dataUrl.length * 3) / 4 / 1024);
    }

    return { url: dataUrl, size, width: targetW, height: targetH };
  };

  const handleProcess = async () => {
    if (!image || !croppedAreaPixels) return;
    setLoading(true);
    try {
      const res = await getCroppedImg(
        image,
        croppedAreaPixels,
        targetWidth,
        targetHeight,
        targetKB
      );
      setResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const link = document.createElement('a');
    link.download = `${originalFileName || fileName}_resized_${result.width}x${result.height}_${targetKB}kb.jpg`;
    link.href = result.url;
    link.click();
  };

  const faqs = [
    {
      question: "What is Photo & Signature Resizer?",
      answer: "It's a specialized tool designed primarily for Indian government job applications (SSC, UPSC, Banking, etc.) that require photos and signatures in specific dimensions and file sizes (e.g., 50KB for photo, 20KB for signature)."
    },
    {
      question: "How does the target size (KB) work?",
      answer: "The tool uses an advanced iterative compression algorithm. It adjusts the JPEG quality automatically until the file size is as close as possible to your target KB without exceeding it."
    },
    {
      question: "Is my photo secure?",
      answer: "Yes, 100%. All processing, including cropping and compression, happens entirely within your browser. Your photos are never uploaded to any server."
    },
    {
      question: "What are the standard sizes for SSC/UPSC?",
      answer: "Typically, SSC requires a photo of 3.5cm x 4.5cm (approx 300x400px) under 50KB, and a signature of 4.0cm x 2.0cm (approx 140x60px) under 20KB. Our presets are configured for these common requirements."
    }
  ];

  return (
    <ToolLayout
      title="Photo & Signature Resizer"
      description="Resize photos and signatures to exact dimensions and KB size for government forms."
      onFilesSelected={handleFiles}
      files={image ? [new File([], 'image.png')] : []}
      isProcessing={loading}
      onReset={() => {
        setImage(null);
        setResult(null);
      }}
      faqs={faqs}
      renderToolbar={() => (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-surface/50 p-1 rounded-lg border border-border/50">
            <button
              onClick={() => setPreset(300, 400, 50, 'photo')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${targetWidth === 300 ? 'bg-accent text-white shadow-sm' : 'hover:bg-surface text-text-secondary'}`}
            >
              Passport Photo (50KB)
            </button>
            <button
              onClick={() => setPreset(140, 60, 20, 'sign')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${targetWidth === 140 ? 'bg-accent text-white shadow-sm' : 'hover:bg-surface text-text-secondary'}`}
            >
              Signature (20KB)
            </button>
          </div>
          <div className="h-6 w-px bg-border/50" />
          <button
            onClick={handleProcess}
            disabled={loading || !image}
            className="btn bp py-1.5 px-4 text-xs gap-2"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Apply & Preview
          </button>
        </div>
      )}
      renderSettings={() => (
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-text-primary">
              <Settings className="w-4 h-4 text-accent" /> Custom Dimensions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Width (px)</label>
                <input 
                  type="number" 
                  className="fi text-sm py-2" 
                  value={targetWidth || ''} 
                  onChange={e => { setTargetWidth(Number(e.target.value)); setResult(null); }} 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Height (px)</label>
                <input 
                  type="number" 
                  className="fi text-sm py-2" 
                  value={targetHeight || ''} 
                  onChange={e => { setTargetHeight(Number(e.target.value)); setResult(null); }} 
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Target Size (Max KB)</label>
              <input 
                type="number" 
                className="fi text-sm py-2" 
                value={targetKB || ''} 
                onChange={e => { setTargetKB(Number(e.target.value)); setResult(null); }} 
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border/50">
            <h3 className="text-sm font-bold flex items-center gap-2 text-text-primary">
              <Maximize2 className="w-4 h-4 text-accent" /> Adjust View
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-bold text-text-muted uppercase tracking-wider">
                <span>Zoom</span>
                <span>{zoom.toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="3" 
                step="0.1" 
                value={zoom} 
                onChange={e => setZoom(Number(e.target.value))} 
                className="w-full accent-accent h-1.5 bg-border rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          <div className="bg-accent/5 border border-accent/10 rounded-xl p-4 mt-6">
            <h4 className="text-xs font-bold text-accent mb-2 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5" /> Pro Tip
            </h4>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              For best results, upload a high-resolution photo. The tool will automatically handle the compression to meet your KB limit.
            </p>
          </div>
        </div>
      )}
    >
      {image && (
        <div className="h-full flex flex-col">
          <div className="flex-1 relative bg-bg-secondary/50 rounded-2xl overflow-hidden border border-border/50 group">
            <Cropper
              image={image}
              crop={crop}
              zoom={zoom}
              aspect={targetWidth / targetHeight}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
            
            {/* Overlay Info */}
            <div className="absolute top-4 left-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-2 border border-white/10">
                <Maximize2 className="w-3 h-3" /> {targetWidth} x {targetHeight} px
              </div>
            </div>
          </div>

          {result && (
            <div className="mt-6 bg-surface border border-border rounded-2xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-success/10 text-success flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-text-primary">Ready for Download</h3>
                    <p className="text-xs text-text-secondary">Optimized to {result.size} KB</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="px-3 py-1.5 rounded-lg bg-bg-secondary border border-border text-xs font-bold text-text-primary">
                    {result.width} x {result.height} px
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${result.size > targetKB ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-success/10 text-success border-success/20'}`}>
                    {result.size} KB / {targetKB} KB
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="relative group">
                  <div className="absolute -inset-4 bg-accent/5 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative bg-bg-secondary p-2 rounded-xl border border-border shadow-inner max-w-[200px]">
                    <img src={result.url} alt="Result" className="w-full h-auto rounded-lg shadow-sm" />
                  </div>
                </div>
                
                <div className="flex-1 w-full space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-bg-secondary/50 border border-border/50">
                      <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Format</div>
                      <div className="text-sm font-bold text-text-primary">JPEG</div>
                    </div>
                    <div className="p-4 rounded-xl bg-bg-secondary/50 border border-border/50">
                      <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Quality</div>
                      <div className="text-sm font-bold text-text-primary">Optimized</div>
                    </div>
                  </div>
                  <button 
                    onClick={downloadResult} 
                    className="btn bp w-full py-4 rounded-xl gap-3 text-base shadow-lg shadow-accent/20 hover:shadow-accent/30 transition-all active:scale-[0.98]"
                  >
                    <Download className="w-5 h-5" /> Download Resized Image
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolLayout>
  );
}
