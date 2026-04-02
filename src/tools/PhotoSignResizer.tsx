import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, PixelCrop, PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Download, RefreshCw, Settings, CheckCircle2, AlertCircle, Image as ImageIcon, Type, Maximize2, FileImage, Lock, Unlock, ZoomIn, ZoomOut } from 'lucide-react';
import ToolLayout from '../components/tool-system/ToolLayout';
import RelatedTools from '../components/tool-system/RelatedTools';

export default function PhotoSignResizer() {
  const [image, setImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [percentCrop, setPercentCrop] = useState<PercentCrop>();
  const [targetWidth, setTargetWidth] = useState(300);
  const [targetHeight, setTargetHeight] = useState(400);
  const [unit, setUnit] = useState<'px' | 'in' | 'cm'>('px');
  const [dpi, setDpi] = useState(300);
  const [targetKB, setTargetKB] = useState(50);
  const [loading, setLoading] = useState(false);
  const initialFilesProcessed = useRef(false);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [result, setResult] = useState<{ url: string; previewUrl: string; size: number; width: number; height: number } | null>(null);
  const [fileName, setFileName] = useState('photo');
  const [originalFileName, setOriginalFileName] = useState('');
  const [lockAspect, setLockAspect] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [imgDimensions, setImgDimensions] = useState<{ naturalWidth: number; naturalHeight: number; width: number; height: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Cleanup result URL on unmount or change
  useEffect(() => {
    return () => {
      if (result?.url && result.url.startsWith('blob:')) {
        URL.revokeObjectURL(result.url);
      }
    };
  }, [result]);

  // Live size estimation
  useEffect(() => {
    if (!image || !percentCrop || !imgDimensions) return;
    
    const timer = setTimeout(async () => {
      const { w, h } = getTargetPx();
      
      // Calculate natural pixels from percentage crop
      const naturalCrop = {
        x: (percentCrop.x * imgDimensions.naturalWidth) / 100,
        y: (percentCrop.y * imgDimensions.naturalHeight) / 100,
        width: (percentCrop.width * imgDimensions.naturalWidth) / 100,
        height: (percentCrop.height * imgDimensions.naturalHeight) / 100,
        unit: 'px' as const
      };

      const res = await getCroppedImg(image, naturalCrop, w, h, targetKB, 1, 1, true);
      if (res) {
        setEstimatedSize(res.size);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [image, percentCrop, targetWidth, targetHeight, targetKB, dpi, unit, imgDimensions]);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height, naturalWidth, naturalHeight } = e.currentTarget;
    setImgDimensions({ width, height, naturalWidth, naturalHeight });
    const aspect = targetWidth / targetHeight;
    const initialCrop = centerCrop(
      makeAspectCrop(
        { unit: '%', width: 90 },
        aspect,
        width,
        height
      ),
      width,
      height
    );
    setCrop(initialCrop);
    setPercentCrop(initialCrop as PercentCrop);
    
    // Initialize completedCrop
    setCompletedCrop({
      unit: 'px',
      x: (initialCrop.x * width) / 100,
      y: (initialCrop.y * height) / 100,
      width: (initialCrop.width * width) / 100,
      height: (initialCrop.height * height) / 100
    });
  };

  const handleFiles = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      
      // Check if it's the same file as currently loaded
      if (image && originalFileName === file.name.split('.')[0]) {
        return;
      }

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
    
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      const aspect = w / h;
      const newCrop = centerCrop(
        makeAspectCrop(
          { unit: '%', width: 90 },
          aspect,
          width,
          height
        ),
        width,
        height
      );
      setCrop(newCrop);
    }
  };

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getDataUrlSize = (dataUrl: string) => {
    const base64String = dataUrl.split(',')[1];
    if (!base64String) return 0;
    const padding = (base64String.endsWith('==') ? 2 : (base64String.endsWith('=') ? 1 : 0));
    return (base64String.length * 0.75) - padding;
  };

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: PixelCrop,
    targetW: number,
    targetH: number,
    targetKB: number,
    scaleX: number,
    scaleY: number,
    isFast: boolean = false
  ) => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    canvas.width = targetW;
    canvas.height = targetH;

    ctx.drawImage(
      image,
      pixelCrop.x * scaleX,
      pixelCrop.y * scaleY,
      pixelCrop.width * scaleX,
      pixelCrop.height * scaleY,
      0,
      0,
      targetW,
      targetH
    );

    // Iterative compression to reach target KB
    let quality = 0.92;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    let size = getDataUrlSize(dataUrl) / 1024;

    // Binary search for the best quality to hit targetKB
    let min = 0.01;
    let max = 1.0;
    
    const iterations = isFast ? 6 : 15;
    
    for (let i = 0; i < iterations; i++) {
      quality = (min + max) / 2;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      size = getDataUrlSize(dataUrl) / 1024;
      
      if (size > targetKB) {
        max = quality;
      } else {
        min = quality;
      }
    }

    // Use the highest quality that is still <= targetKB
    dataUrl = canvas.toDataURL('image/jpeg', min);
    
    if (isFast) {
      const finalSize = getDataUrlSize(dataUrl) / 1024;
      return { 
        url: dataUrl, 
        previewUrl: dataUrl,
        size: Number(finalSize.toFixed(2)), 
        width: targetW, 
        height: targetH 
      };
    }

    // For final download, use Blobs for better reliability
    const targetBytes = Math.floor(targetKB * 1024);
    let blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/jpeg', min));
    let currentBytes = blob.size;
    
    if (currentBytes < targetBytes) {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Find the last EOI marker (FF D9)
      let eoiPos = -1;
      for (let i = bytes.length - 2; i >= 0; i--) {
        if (bytes[i] === 0xFF && bytes[i + 1] === 0xD9) {
          eoiPos = i;
          break;
        }
      }

      if (eoiPos !== -1) {
        const newBytes = new Uint8Array(targetBytes);
        // Copy everything up to the EOI
        newBytes.set(bytes.slice(0, eoiPos));
        
        let currentPos = eoiPos;
        let remainingPadding = targetBytes - eoiPos - 2; // -2 for the final EOI

        // Add padding using COM segments (FF FE)
        while (remainingPadding >= 4) {
          const segmentLen = Math.min(remainingPadding, 65535);
          const payloadLen = segmentLen - 4; // 2 for marker, 2 for length field
          
          newBytes[currentPos++] = 0xFF;
          newBytes[currentPos++] = 0xFE;
          newBytes[currentPos++] = (segmentLen - 2 >> 8) & 0xFF; // Length field value
          newBytes[currentPos++] = (segmentLen - 2) & 0xFF;
          
          // Fill payload with zeros
          for (let i = 0; i < payloadLen; i++) {
            newBytes[currentPos++] = 0;
          }
          remainingPadding -= segmentLen;
        }

        // Fill any tiny remaining gap with zeros before EOI
        while (currentPos < targetBytes - 2) {
          newBytes[currentPos++] = 0;
        }

        // Add final EOI
        newBytes[currentPos++] = 0xFF;
        newBytes[currentPos++] = 0xD9;
        
        blob = new Blob([newBytes], { type: 'image/jpeg' });
      }
    }

    const finalUrl = URL.createObjectURL(blob);
    return { 
      url: finalUrl, 
      previewUrl: dataUrl,
      size: Number((blob.size / 1024).toFixed(2)), 
      width: targetW, 
      height: targetH 
    };
  };

  const convertValue = (val: number, from: 'px' | 'in' | 'cm', to: 'px' | 'in' | 'cm') => {
    if (from === to) return val;
    
    // Convert to pixels first
    let px = val;
    if (from === 'in') px = val * dpi;
    if (from === 'cm') px = (val / 2.54) * dpi;
    
    // Convert from pixels to target
    if (to === 'px') return Math.round(px);
    if (to === 'in') return Number((px / dpi).toFixed(2));
    if (to === 'cm') return Number(((px / dpi) * 2.54).toFixed(2));
    return px;
  };

  const handleUnitChange = (newUnit: 'px' | 'in' | 'cm') => {
    setTargetWidth(convertValue(targetWidth, unit, newUnit));
    setTargetHeight(convertValue(targetHeight, unit, newUnit));
    setUnit(newUnit);
  };

  const getTargetPx = () => {
    return {
      w: convertValue(targetWidth, unit, 'px'),
      h: convertValue(targetHeight, unit, 'px')
    };
  };

  const handleDownload = async (onComplete?: () => void, skipDownload = false) => {
    if (loading) return;

    if (!image || !percentCrop || !imgDimensions) return;
    setLoading(true);
    try {
      const { w, h } = getTargetPx();
      
      // Calculate natural pixels from percentage crop
      const naturalCrop = {
        x: (percentCrop.x * imgDimensions.naturalWidth) / 100,
        y: (percentCrop.y * imgDimensions.naturalHeight) / 100,
        width: (percentCrop.width * imgDimensions.naturalWidth) / 100,
        height: (percentCrop.height * imgDimensions.naturalHeight) / 100,
        unit: 'px' as const
      };

      const res = await getCroppedImg(
        image,
        naturalCrop,
        w,
        h,
        targetKB,
        1,
        1,
        false // High precision for final download
      );
      if (res) {
        setResult(res);
        if (!skipDownload) {
          const link = document.createElement('a');
          const finalKB = res.size.toFixed(0);
          link.download = `${originalFileName || fileName}_${res.width}x${res.height}_${finalKB}KB.jpg`;
          link.href = res.url;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        if (onComplete) onComplete();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const faqs = [
    {
      q: "What is Photo & Signature Resizer?",
      a: "It's a specialized tool designed primarily for Indian government job applications (SSC, UPSC, Banking, etc.) that require photos and signatures in specific dimensions and file sizes (e.g., 50KB for photo, 20KB for signature)."
    },
    {
      q: "How does the target size (KB) work?",
      a: "The tool uses an advanced iterative compression algorithm. It adjusts the JPEG quality automatically until the file size is as close as possible to your target KB without exceeding it."
    },
    {
      q: "Is my photo secure?",
      a: "Yes, 100%. All processing, including cropping and compression, happens entirely within your browser. Your photos are never uploaded to any server."
    },
    {
      q: "What are the standard sizes for SSC/UPSC?",
      a: "Typically, SSC requires a photo of 3.5cm x 4.5cm (approx 300x400px) under 50KB, and a signature of 4.0cm x 2.0cm (approx 140x60px) under 20KB. Our presets are configured for these common requirements."
    }
  ];

  return (
    <ToolLayout
      title="Photo & Signature Resizer"
      description="Resize photos and signatures to exact dimensions and KB size for government forms."
      toolId="photo-sign-resizer"
      acceptedFileTypes={['image/*']}
      multiple={false}
      faq={faqs}
      onDownload={() => {
        if (result) {
          const link = document.createElement('a');
          const finalKB = result.size.toFixed(0);
          link.download = `resized_${result.width}x${result.height}_${finalKB}KB.jpg`;
          link.href = result.url;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          handleDownload();
        }
      }}
      renderAfter={({ onReset }) => (
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="bg-surface border border-border rounded-3xl p-8 lg:p-12 shadow-2xl text-center">
            <div className="w-20 h-20 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-black text-text-primary mb-4">Processing Complete!</h2>
            <p className="text-text-muted mb-8">Your resized image has been processed with high precision.</p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              {result ? (
                <a 
                  href={result.url}
                  download={`${originalFileName || fileName}_${result.width}x${result.height}_${result.size.toFixed(0)}KB.jpg`}
                  className="btn bp px-12 py-4 rounded-2xl text-lg font-bold shadow-xl shadow-accent/20 w-full sm:w-auto flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download Again
                </a>
              ) : (
                <button 
                  onClick={() => handleDownload()}
                  disabled={loading}
                  className="btn bp px-12 py-4 rounded-2xl text-lg font-bold shadow-xl shadow-accent/20 w-full sm:w-auto flex items-center justify-center gap-2"
                >
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  {loading ? 'Processing...' : 'Download Again'}
                </button>
              )}
              <button 
                onClick={onReset}
                className="btn bs px-12 py-4 rounded-2xl text-lg font-bold w-full sm:w-auto"
              >
                <RefreshCw className="w-5 h-5 mr-2" /> Resize Another
              </button>
            </div>

            {loading || !result ? (
              <div className="bg-bg-secondary rounded-2xl p-12 border border-border/50 flex flex-col items-center justify-center gap-4 min-h-[300px]">
                <RefreshCw className="w-10 h-10 animate-spin text-accent" />
                <p className="text-sm font-bold text-text-muted uppercase tracking-widest">Generating Actual Result...</p>
              </div>
            ) : (
              <div className="bg-bg-secondary rounded-2xl p-6 lg:p-8 border border-border/50 text-left animate-in fade-in zoom-in-95 duration-300">
                <h3 className="text-sm font-bold text-text-primary mb-6 flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-accent" /> Actual Processed Result
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-surface rounded-xl p-4 border border-border/50">
                        <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Final Size</div>
                        <div className="text-xl font-black text-text-primary">
                          {result.size.toFixed(2)} <span className="text-xs font-bold text-text-muted">KB</span>
                        </div>
                      </div>
                      <div className="bg-surface rounded-xl p-4 border border-border/50">
                        <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Dimensions</div>
                        <div className="text-xl font-black text-text-primary">
                          {result.width}x{result.height} <span className="text-xs font-bold text-text-muted">px</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-surface rounded-xl p-4 border border-border/50">
                      <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Print Size (@{dpi} DPI)</div>
                      <div className="text-sm font-bold text-text-primary">
                        {Number((result.width / dpi).toFixed(2))}" x {Number((result.height / dpi).toFixed(2))}"
                      </div>
                    </div>
                    <div className="bg-accent/10 rounded-xl p-4 border border-accent/20">
                      <p className="text-xs text-accent font-medium leading-relaxed">
                        This preview shows the actual compressed image that was downloaded. The quality is optimized to stay under {targetKB} KB.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center bg-surface rounded-xl p-6 border border-border/50 min-h-[300px] relative overflow-hidden">
                    {/* Subtle grid background for the preview area */}
                    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '20px 20px' }} />
                    
                    <div className="relative group/result z-10">
                      <img 
                        src={result.previewUrl || result.url} 
                        alt="Result preview" 
                        className="max-h-[400px] max-w-full object-contain rounded shadow-2xl border border-border bg-white" 
                        style={{ imageRendering: 'auto' }}
                      />
                      <div className="absolute -bottom-3 -right-3 bg-accent text-white text-[10px] font-black px-2 py-1 rounded shadow-lg uppercase tracking-tighter">
                        Actual Result
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    >
      {({ file, state, onComplete, onReset }) => {
        useEffect(() => {
          if (!file) {
            setImage(null);
            setResult(null);
            setOriginalFileName(null);
            setLoading(false);
            initialFilesProcessed.current = false;
            return;
          }
          if (file && !initialFilesProcessed.current) {
            handleFiles(Array.isArray(file) ? file : [file]);
            initialFilesProcessed.current = true;
          }
        }, [file]);

        if (!image) return null;

        return (
          <div className="w-full min-h-full lg:h-full flex flex-col lg:flex-row lg:overflow-hidden bg-bg-primary">
            {/* Left Workspace (Preview) - 3/4 width */}
            <main className="flex-1 lg:flex-[3] bg-[#f5f5f5] flex flex-col order-1 overflow-hidden relative min-h-[40vh] lg:min-h-0">
              <div className="flex-1 w-full h-full overflow-auto p-4 lg:p-12 scrollbar-hide">
                <div className="min-h-full flex items-center justify-center m-auto w-max min-w-full">
                  <ReactCrop
                    crop={crop}
                    onChange={c => setCrop(c)}
                    onComplete={(c, pc) => {
                      setCompletedCrop(c);
                      setPercentCrop(pc);
                    }}
                    aspect={lockAspect ? targetWidth / targetHeight : undefined}
                    className="shadow-[0_20px_50px_rgba(0,0,0,0.2)] rounded-sm bg-white"
                    style={{ zoom: zoom }}
                  >
                    <img
                      ref={imgRef}
                      src={image}
                      alt="Crop source"
                      onLoad={onImageLoad}
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '70vh',
                        width: 'auto',
                        height: 'auto',
                        display: 'block', 
                        imageRendering: 'high-quality',
                      }}
                    />
                  </ReactCrop>
                </div>
              </div>
              
              {/* Overlay Info */}
              <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
                <div className="bg-surface/80 backdrop-blur-md text-text-primary px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2 border border-border shadow-xl w-fit">
                  <Maximize2 className="w-4 h-4 text-text-muted" /> {targetWidth} x {targetHeight} px
                </div>
                {estimatedSize !== null && (
                  <div className="bg-surface/80 backdrop-blur-md text-text-primary px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2 border border-border shadow-xl w-fit">
                    <FileImage className="w-4 h-4 text-accent" /> Est. Size: {estimatedSize.toFixed(2)} KB
                  </div>
                )}
              </div>
            </main>

            {/* Right Sidebar (Settings) - 1/4 width */}
            <aside className="w-full lg:w-1/4 shrink-0 bg-surface border-l border-border flex flex-col shadow-sm order-2 overflow-hidden h-auto lg:h-full">
                <div className="p-5 space-y-6 overflow-y-auto flex-1 scrollbar-hide">
                  <div className="space-y-4">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                      <Settings className="w-5 h-5 text-accent" /> Presets
                    </h3>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => setPreset(300, 400, 50, 'photo')}
                        className={`px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${targetWidth === 300 ? 'bg-accent text-white shadow-sm' : 'bg-bg-secondary hover:bg-bg-secondary/80 text-text-secondary'}`}
                      >
                        Passport Photo (300x400, 50KB)
                      </button>
                      <button
                        onClick={() => setPreset(140, 60, 20, 'sign')}
                        className={`px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${targetWidth === 140 ? 'bg-accent text-white shadow-sm' : 'bg-bg-secondary hover:bg-bg-secondary/80 text-text-secondary'}`}
                      >
                        Signature (140x60, 20KB)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 pt-6 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                        <Settings className="w-5 h-5 text-accent" /> Dimensions
                      </h3>
                      <select 
                        value={unit} 
                        onChange={(e) => handleUnitChange(e.target.value as any)}
                        className="text-xs font-bold bg-bg-secondary border border-border rounded-lg px-2 py-1 outline-none"
                      >
                        <option value="px">PX</option>
                        <option value="in">IN</option>
                        <option value="cm">CM</option>
                      </select>
                    </div>

                    {unit !== 'px' && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-wider font-bold text-text-muted">DPI (Resolution)</label>
                        <input 
                          type="number" 
                          className="fi text-sm py-2" 
                          value={dpi} 
                          onChange={e => { setDpi(Number(e.target.value)); setResult(null); }} 
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Width ({unit})</label>
                        <input 
                          type="number" 
                          className="fi text-sm py-2" 
                          value={targetWidth || ''} 
                          onChange={e => { setTargetWidth(Number(e.target.value)); setResult(null); }} 
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Height ({unit})</label>
                        <input 
                          type="number" 
                          className="fi text-sm py-2" 
                          value={targetHeight || ''} 
                          onChange={e => { setTargetHeight(Number(e.target.value)); setResult(null); }} 
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Target Size (Max KB)</label>
                        {estimatedSize !== null && (
                          <span className="text-[10px] font-bold text-accent animate-pulse">Live: {estimatedSize.toFixed(2)} KB</span>
                        )}
                      </div>
                      <input 
                        type="number" 
                        className="fi text-sm py-2" 
                        value={targetKB || ''} 
                        onChange={e => { setTargetKB(Number(e.target.value)); setResult(null); }} 
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-6 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
                      <Maximize2 className="w-5 h-5 text-accent" /> Adjust Crop
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
                        className="p-1.5 rounded-lg bg-bg-secondary hover:bg-border text-text-muted transition-colors"
                        title="Zoom Out"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setZoom(Math.min(5, zoom + 0.1))}
                        className="p-1.5 rounded-lg bg-bg-secondary hover:bg-border text-text-muted transition-colors"
                        title="Zoom In"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setZoom(1)}
                        className="p-1.5 rounded-lg bg-bg-secondary hover:bg-border text-text-muted transition-colors"
                        title="Reset Zoom"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <div className="w-px h-4 bg-border mx-1" />
                      <button 
                        onClick={() => setLockAspect(!lockAspect)}
                        className={`p-1.5 rounded-lg transition-colors ${lockAspect ? 'bg-accent/10 text-accent' : 'bg-bg-secondary text-text-muted'}`}
                        title={lockAspect ? "Unlock Aspect Ratio" : "Lock Aspect Ratio"}
                      >
                        {lockAspect ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold text-text-muted uppercase tracking-wider">
                      <span>Zoom Level</span>
                      <span>{Math.round(zoom * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="5" 
                      step="0.05" 
                      value={zoom} 
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full accent-accent h-1.5 cursor-pointer"
                    />
                    <p className="text-[10px] text-text-muted leading-relaxed italic">
                      Tip: Use the slider to zoom the image for precise cropping. Drag the handles to adjust the area.
                    </p>
                  </div>
                  </div>

                  <div className="bg-accent/5 border border-accent/10 rounded-xl p-4 mt-6">
                    <h4 className="text-sm font-bold text-accent mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> Pro Tip
                    </h4>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      For best results, upload a high-resolution photo. The tool will automatically handle the compression to meet your KB limit.
                    </p>
                  </div>

                  <RelatedTools currentToolId="photo-sign-resizer" />

                  <div className="pt-6 border-t border-border/50 space-y-3">
                    <button
                      onClick={() => handleDownload(onComplete)}
                      disabled={loading}
                      className="w-full btn bp py-4 px-6 shadow-xl shadow-accent/20 flex items-center justify-center gap-3 group"
                    >
                      {loading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-white" />
                          <span className="font-black text-lg">Finish & Download</span>
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-center text-text-muted font-bold uppercase tracking-widest">
                      Target: <span className="text-accent">{targetKB} KB</span> · {targetWidth}x{targetHeight}px
                    </p>
                  </div>
                </div>
              </aside>
          </div>
        );
      }}
    </ToolLayout>
  );
}
