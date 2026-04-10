import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Download, Settings, RefreshCw, Crop as CropIcon, Trash2, CheckCircle2, AlertCircle, Plus, ChevronLeft, ChevronRight, X, Layers } from 'lucide-react';
import JSZip from 'jszip';
import ToolLayout from '../components/tool-system/ToolLayout';
import RelatedTools from '../components/tool-system/RelatedTools';

interface ProcessedImage {
  file: File;
  preview: string;
  output: string | null;
}

export default function ImageCropper() {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    width: 50,
    height: 50,
    x: 25,
    y: 25
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [loading, setLoading] = useState(false);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleFiles = (files: File[]) => {
    if (files.length > 0) {
      const newImages = files.map((file: File) => ({
        file,
        preview: URL.createObjectURL(file),
        output: null
      }));
      setImages(prev => {
        setTimeout(() => setCurrentIndex(prev.length), 0);
        return [...prev, ...newImages];
      });
    }
  };

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    imgRef.current = e.currentTarget;
  };

  const generateCropDataUrl = (image: HTMLImageElement, crop: PixelCrop): string | null => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    const targetWidth = crop.width * scaleX;
    const targetHeight = crop.height * scaleY;
    
    if (targetWidth <= 0 || targetHeight <= 0) return null;
    
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      targetWidth,
      targetHeight
    );

    return canvas.toDataURL('image/jpeg', 0.95);
  };

  const processCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current || images.length === 0) return;
    setLoading(true);

    try {
      const dataUrl = generateCropDataUrl(imgRef.current, completedCrop);
      if (!dataUrl) {
        setLoading(false);
        return;
      }
      
      setImages(prev => {
        const updated = [...prev];
        updated[currentIndex].output = dataUrl;
        return updated;
      });
      
      const nextUncropped = images.findIndex((img, idx) => idx > currentIndex && !img.output);
      if (nextUncropped !== -1) {
        setCurrentIndex(nextUncropped);
      }
    } catch (err) {
      console.error("Error cropping image:", err);
    } finally {
      setLoading(false);
    }
  }, [completedCrop, images, currentIndex]);

  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const downloadAll = async () => {
    let finalImages = [...images];
    
    // Auto-crop current image if it hasn't been cropped and we have a valid crop box
    if (finalImages.length > 0 && !finalImages[currentIndex].output && completedCrop && imgRef.current) {
      const dataUrl = generateCropDataUrl(imgRef.current, completedCrop);
      if (dataUrl) {
        finalImages[currentIndex].output = dataUrl;
        setImages(finalImages);
      }
    }

    const processedImages = finalImages.filter(img => img.output);
    if (processedImages.length === 0) return;

    if (processedImages.length === 1) {
      const blob = dataURLtoBlob(processedImages[0].output!);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `cropped_${processedImages[0].file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return;
    }

    const zip = new JSZip();
    
    for (const img of processedImages) {
      const blob = dataURLtoBlob(img.output!);
      zip.file(`cropped_${img.file.name}`, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cropped_images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    if (currentIndex >= index && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const currentImage = images[currentIndex];
  const processedCount = images.filter(img => img.output).length;

  const faqs = [
    {
      q: "How do I crop multiple images at once?",
      a: "Simply upload all your images together. You can then navigate through them using the thumbnail strip, apply crops individually, and finally download all cropped images as a single ZIP file."
    },
    {
      q: "What aspect ratios are supported?",
      a: "We support common aspect ratios like 1:1 (Square), 16:9 (Landscape), 4:3, and 9:16 (Portrait). You can also use 'Freeform' to crop to any custom dimension."
    },
    {
      q: "Is there a limit to the number of images?",
      a: "While there's no hard limit, we recommend processing up to 20-30 images at a time for the best performance, as all processing happens in your browser's memory."
    }
  ];

  return (
    <ToolLayout
      title="Image Cropper"
      description="Crop one or multiple images instantly with precision. Support for standard aspect ratios."
      toolId="image-cropper"
      acceptedFileTypes={['image/*']}
      multiple={true}
      faq={faqs}
      onDownload={downloadAll}
    >
      {({ file, state, onComplete, onReset }) => {
        useEffect(() => {
          if (!file) {
            setImages([]);
            return;
          }
          setImages(prev => {
            if (prev.length > 0) return prev;
            const initialFiles = Array.isArray(file) ? file : [file];
            return initialFiles.map(f => ({
              file: f,
              preview: URL.createObjectURL(f),
              output: null
            }));
          });
          setCurrentIndex(0);
        }, [file]);

        if (images.length === 0) return null;

        return (
          <div className="w-full min-h-full lg:h-full flex flex-col lg:flex-row lg:overflow-hidden bg-bg-primary">
            {/* Left Preview Section - 2/3 width on desktop */}
            <main className="flex-1 lg:flex-[3] bg-[#f5f5f5] flex flex-col overflow-hidden relative min-h-[40vh] lg:min-h-0">
              {/* Thumbnail Strip */}
              <div className="p-4 bg-surface border-b border-border flex items-center gap-4 shrink-0 overflow-hidden text-text-primary">
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide flex-1 items-center">
                  {images.map((img, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setCurrentIndex(idx)}
                      className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-300 ${currentIndex === idx ? 'border-accent scale-105 shadow-xl' : 'border-transparent opacity-60 hover:opacity-100 hover:border-border scale-100'}`}
                    >
                      <img src={img.output || img.preview} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                      {img.output && (
                        <div className="absolute top-1 right-1 bg-success text-white rounded-full p-0.5 shadow-sm">
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute bottom-1 right-1 bg-red-500/80 backdrop-blur-sm text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label className="flex-shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-text-muted hover:border-accent hover:text-accent transition-all cursor-pointer bg-surface/30 hover:bg-accent/5">
                    <Plus className="w-5 h-5" />
                    <span className="text-[8px] font-black uppercase">Add</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple
                      onChange={(e) => {
                        if (e.target.files) handleFiles(Array.from(e.target.files));
                      }} 
                      className="hidden" 
                    />
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentIndex === 0}
                    className="p-3 rounded-xl bg-surface border border-border hover:bg-bg-secondary disabled:opacity-30 transition-all shadow-sm"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setCurrentIndex(prev => Math.min(images.length - 1, prev + 1))}
                    disabled={currentIndex === images.length - 1}
                    className="p-3 rounded-xl bg-surface border border-border hover:bg-bg-secondary disabled:opacity-30 transition-all shadow-sm"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Main Working Area */}
              <div className="flex-1 relative overflow-auto flex flex-col items-center justify-center p-4 lg:p-8">
                {currentImage && (
                  <div className="w-full h-full flex items-center justify-center min-h-0">
                    {currentImage.output ? (
                      <div 
                        className="relative animate-in zoom-in-95 duration-500 flex items-center justify-center w-full h-full transition-transform duration-300 origin-center"
                        style={{ transform: `scale(${zoom})` }}
                      >
                        <img 
                          src={currentImage.output} 
                          alt="Cropped" 
                          style={{ 
                            maxHeight: '70vh', 
                            maxWidth: '100%'
                          }}
                          className="shadow-2xl rounded-xl border border-border" 
                        />
                        <button 
                          onClick={() => {
                            setImages(prev => {
                              const updated = [...prev];
                              updated[currentIndex].output = null;
                              return updated;
                            });
                          }}
                          className="absolute top-4 right-4 btn bs px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl bg-surface/90 backdrop-blur-md border border-border hover:scale-105 transition-transform"
                        >
                          Recrop Image
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-full max-h-[70vh] lg:max-h-none flex items-center justify-center p-4">
                        <div 
                          className="transition-transform duration-300 origin-center flex items-center justify-center"
                          style={{ transform: `scale(${zoom})` }}
                        >
                          <ReactCrop
                            crop={crop}
                            onChange={(c) => setCrop(c)}
                            onComplete={(c) => setCompletedCrop(c)}
                            aspect={aspect}
                            className="shadow-2xl rounded-sm max-h-full"
                          >
                            <img 
                              ref={imgRef} 
                              src={currentImage.preview} 
                              onLoad={onLoad} 
                              alt="Crop target" 
                              style={{ 
                                maxHeight: '70vh', 
                                maxWidth: '100%'
                              }}
                              className="block w-auto h-auto" 
                            />
                          </ReactCrop>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Navigation Hint */}
                {!currentImage?.output && (
                  <div className="absolute bottom-8 text-[10px] font-black uppercase tracking-widest text-text-muted flex items-center gap-3 bg-surface/90 backdrop-blur-md px-6 py-3 rounded-full border border-border shadow-2xl pointer-events-none animate-bounce">
                    <AlertCircle className="w-4 h-4 text-accent" /> Drag corners to adjust crop
                  </div>
                )}
              </div>
            </main>

            {/* Right Settings Panel */}
            <aside className="w-full lg:w-1/4 shrink-0 bg-surface border-l border-border flex flex-col shadow-sm overflow-hidden h-auto lg:h-full">
              <div className="p-6 space-y-6 overflow-y-auto scrollbar-hide flex-1">
                <div className="space-y-4">
                  <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                    <Settings className="w-4 h-4 text-accent" /> Crop Settings
                  </h3>
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase tracking-wider font-bold text-text-muted opacity-70">Aspect Ratio</label>
                    <select 
                      className="fi text-sm py-2.5 rounded-xl border-border bg-bg-secondary text-text-primary" 
                      value={aspect || ''} 
                      onChange={e => setAspect(e.target.value ? Number(e.target.value) : undefined)}
                    >
                      <option value="">Freeform</option>
                      <option value={1}>1:1 (Square)</option>
                      <option value={16/9}>16:9 (Landscape)</option>
                      <option value={4/3}>4:3</option>
                      <option value={9/16}>9:16 (Portrait)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                      <RefreshCw className="w-4 h-4 text-accent" /> Zoom & Adjust
                    </h3>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setZoom(Math.max(0.2, zoom - 0.1))}
                        className="p-1.5 rounded-lg bg-bg-secondary hover:bg-border text-text-muted transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-[10px] font-black w-10 text-center text-text-primary">{Math.round(zoom * 100)}%</span>
                      <button 
                        onClick={() => setZoom(Math.min(5, zoom + 0.1))}
                        className="p-1.5 rounded-lg bg-bg-secondary hover:bg-border text-text-muted transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="0.2" 
                    max="5" 
                    step="0.1" 
                    value={zoom} 
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full accent-accent h-1.5"
                  />
                </div>

                <div className="space-y-4 pt-6 border-t border-border/50">
                  <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                    <Layers className="w-4 h-4 text-accent" /> Batch Info
                  </h3>
                  <div className="p-4 rounded-xl bg-bg-secondary/50 border border-border/50 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase text-text-muted">Total</span>
                      <span className="text-xs font-black text-text-primary">{images.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase text-text-muted">Done</span>
                      <span className="text-xs font-black text-success">{processedCount}</span>
                    </div>
                    <div className="w-full bg-border/30 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-success transition-all duration-500" 
                        style={{ width: `${(processedCount / images.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                <RelatedTools currentToolId="image-cropper" />

                <div className="pt-6 border-t border-border/50 flex flex-col gap-3">
                  <button
                    onClick={processCrop}
                    disabled={loading || !completedCrop?.width || !!currentImage?.output}
                    className="btn bp w-full py-4 rounded-2xl gap-2 shadow-lg shadow-accent/20 text-xs font-black uppercase tracking-widest"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CropIcon className="w-4 h-4" />}
                    {currentImage?.output ? 'Cropped' : 'Crop Current'}
                  </button>
                  {processedCount > 0 && (
                    <button 
                      onClick={async () => { 
                        await downloadAll(); 
                        onComplete(); 
                      }} 
                      className="btn bp w-full py-4 rounded-2xl gap-2 shadow-md text-xs font-black uppercase tracking-widest"
                    >
                      <Download className="w-4 h-4" />
                      Download {processedCount > 1 ? `All (${processedCount})` : 'Cropped'}
                    </button>
                  )}
                </div>
              </div>
            </aside>
          </div>
        );
      }}
    </ToolLayout>
  );
}
