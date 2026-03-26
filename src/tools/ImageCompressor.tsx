import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, RefreshCw, Trash2, ZoomIn, ZoomOut, ImagePlus } from 'lucide-react';
import JSZip from 'jszip';
import ToolLayout from '../components/tool-system/ToolLayout';
import RelatedTools from '../components/tool-system/RelatedTools';

interface ImageSettings {
  quality: number;
  format: string;
}

interface ImageItem {
  id: string;
  file: File;
  originalUrl: string;
  originalWidth: number;
  originalHeight: number;
  
  settings: ImageSettings;
  
  finalBlob: Blob | null;
  finalUrl: string | null;
  isProcessing: boolean;
}

const defaultSettings = (fileType: string): ImageSettings => ({
  quality: 0.8,
  format: fileType === 'image/png' || fileType === 'image/webp' ? fileType : 'image/jpeg',
});

export default function ImageCompressor() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const processedFilesRef = useRef<Set<File>>(new Set());

  const [zoom, setZoom] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024 ? 1 : 0.5);

  const faq = [
    { q: "What image formats are supported?", a: "We support all major formats including JPG, PNG, WEBP, GIF, BMP, and SVG." },
    { q: "Does it support bulk editing?", a: "Absolutely! You can upload multiple images, edit one, and apply the settings to all of them." },
    { q: "Will I lose image quality?", a: "You have full control over the compression quality to balance file size and visual fidelity." },
    { q: "Is it safe to upload my photos?", a: "Your photos never leave your browser. All processing happens locally on your device for maximum privacy." }
  ];

  const handleFiles = async (files: File | File[]) => {
    const selectedFiles = Array.isArray(files) ? files : [files];
    const newImages: ImageItem[] = [];

    for (const file of selectedFiles) {
      if (processedFilesRef.current.has(file)) continue;
      
      const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(file.name);
      if (!isImage) continue;
      
      processedFilesRef.current.add(file);
      const originalUrl = URL.createObjectURL(file);
      
      // Get dimensions
      const dimensions = await new Promise<{width: number, height: number}>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = originalUrl;
      });

      newImages.push({
        id: Math.random().toString(36).substr(2, 9),
        file,
        originalUrl,
        originalWidth: dimensions.width,
        originalHeight: dimensions.height,
        settings: defaultSettings(file.type),
        finalBlob: null,
        finalUrl: null,
        isProcessing: false,
      });
    }
    
    setImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      const newImages = prev.filter((_, i) => i !== index);
      if (currentIndex >= newImages.length) {
        setCurrentIndex(Math.max(0, newImages.length - 1));
      }
      return newImages;
    });
  };

  const currentImage = images[currentIndex];

  const updateSettings = (updates: Partial<ImageSettings>) => {
    if (!currentImage) return;
    setImages(prev => prev.map((img, i) => 
      i === currentIndex ? { ...img, settings: { ...img.settings, ...updates } } : img
    ));
  };

  const applyToAll = () => {
    if (!currentImage) return;
    setImages(prev => prev.map((img, i) => {
      if (i === currentIndex) return img; // Already has the settings and is being processed
      
      if (img.finalUrl) URL.revokeObjectURL(img.finalUrl);
      
      return {
        ...img,
        settings: { ...currentImage.settings },
        finalBlob: null,
        finalUrl: null,
      };
    }));
  };

  // Process pipeline
  useEffect(() => {
    if (!currentImage) return;

    let isCancelled = false;
    const processImage = async () => {
      setImages(prev => prev.map((img, i) => i === currentIndex ? { ...img, isProcessing: true } : img));

      const img = new Image();
      img.src = currentImage.originalUrl;
      
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });

      if (isCancelled) return;

      if (img.width === 0 || img.height === 0) {
        setImages(prev => prev.map((image, i) => i === currentIndex ? { ...image, isProcessing: false } : image));
        return;
      }

      const { settings } = currentImage;
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }

      // Export
      canvas.toBlob((blob) => {
        if (isCancelled) return;
        
        setImages(prev => prev.map((image, i) => {
          if (i === currentIndex) {
            if (image.finalUrl) URL.revokeObjectURL(image.finalUrl);
            
            return {
              ...image,
              finalBlob: blob,
              finalUrl: blob ? URL.createObjectURL(blob) : null,
              isProcessing: false
            };
          }
          return image;
        }));
      }, settings.format, settings.quality);
    };

    const timeoutId = setTimeout(processImage, 300); // Debounce
    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [currentImage?.settings, currentImage?.originalUrl, currentIndex]);

  const downloadAll = async () => {
    if (images.length === 0) return;
    setIsProcessingBatch(true);

    // Process all images that haven't been processed yet
    const processedImages = await Promise.all(images.map(async (img) => {
      if (img.finalBlob && !img.isProcessing) return img;
      
      // Process synchronously for export
      return new Promise<ImageItem>((resolve) => {
        const image = new Image();
        image.src = img.originalUrl;
        image.onload = () => {
          if (image.width === 0 || image.height === 0) {
            resolve(img);
            return;
          }

          const { settings } = img;
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(image, 0, 0);
          }

          canvas.toBlob((blob) => {
            resolve({ ...img, finalBlob: blob, finalUrl: blob ? URL.createObjectURL(blob) : null });
          }, settings.format, settings.quality);
        };
        image.onerror = () => resolve(img);
      });
    }));

    if (processedImages.length === 1) {
      const img = processedImages[0];
      if (img.finalUrl) {
        const a = document.createElement('a');
        a.href = img.finalUrl;
        const ext = img.settings.format.split('/')[1];
        a.download = `compressed_${img.file.name.split('.')[0]}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } else {
      const zip = new JSZip();
      for (let i = 0; i < processedImages.length; i++) {
        const img = processedImages[i];
        if (img.finalBlob) {
          const ext = img.settings.format.split('/')[1];
          zip.file(`compressed_${i}_${img.file.name.split('.')[0]}.${ext}`, img.finalBlob);
        }
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'compressed_images.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    setIsProcessingBatch(false);
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  return (
    <ToolLayout
      title="Image Compressor"
      description="Compress your images instantly. Batch process multiple files with live preview."
      toolId="image-compressor"
      acceptedFileTypes={['image/*']}
      multiple={true}
      faq={faq}
      onDownload={downloadAll}
    >
      {({ file, onComplete, onReset }) => {
        useEffect(() => {
          if (!file) {
            setImages([]);
            setCurrentIndex(0);
            return;
          }
          if (file) {
            handleFiles(file);
          }
        }, [file]);

        if (!currentImage) return null;

        return (
          <div className="w-full min-h-full lg:h-full flex flex-col lg:flex-row lg:overflow-hidden bg-bg-primary">
            {/* Left Preview - 2/3 width on desktop */}
            <main className="flex-1 lg:flex-[3] bg-[#f5f5f5] flex flex-col overflow-hidden relative min-h-[40vh] lg:min-h-0">
              <div className="p-4 bg-surface border-b border-border flex justify-between items-center z-10 shrink-0">
                <div className="bg-bg-secondary/50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm border border-border flex items-center gap-4">
                  <span className="truncate max-w-[150px] sm:max-w-[200px]" title={currentImage.file.name}>{currentImage.file.name}</span>
                  <span className="text-text-muted">|</span>
                  <span>{currentImage.originalWidth}x{currentImage.originalHeight}</span>
                  <span className="text-text-muted">|</span>
                  <span>{formatBytes(currentImage.file.size)} → {currentImage.finalBlob ? formatBytes(currentImage.finalBlob.size) : '...'}</span>
                  {currentImage.finalBlob && (
                    <span className="text-success ml-2">
                      (-{Math.round((1 - currentImage.finalBlob.size / currentImage.file.size) * 100)}%)
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    processedFilesRef.current.clear();
                    onReset();
                  }} className="bg-surface p-3 rounded-xl hover:bg-bg-secondary shadow-sm border border-border text-red-500 transition-all hover:scale-105">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center p-4 lg:p-8">
                {currentImage.isProcessing ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/50 backdrop-blur-sm z-20">
                    <RefreshCw className="w-8 h-8 animate-spin text-accent" />
                  </div>
                ) : null}

                <div className="w-full h-full max-h-[60vh] lg:max-h-none flex items-center justify-center">
                  {(currentImage.finalUrl || currentImage.originalUrl) && (
                    <img 
                      src={currentImage.finalUrl || currentImage.originalUrl} 
                      alt="Preview" 
                      style={{ 
                        maxHeight: '100%', 
                        maxWidth: '100%',
                        transform: `scale(${zoom})`,
                        objectFit: 'contain'
                      }} 
                      className="shadow-2xl rounded-xl border border-border transition-transform duration-300" 
                    />
                  )}
                </div>
              </div>

              {/* Image Carousel */}
              {images.length > 1 && (
                <div className="p-4 bg-surface border-t border-border flex gap-4 overflow-x-auto shrink-0 shadow-sm items-center">
                  {images.map((img, idx) => (
                    <button
                      key={img.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all duration-300 ${currentIndex === idx ? 'border-accent scale-105 shadow-xl' : 'border-transparent opacity-60 hover:opacity-100 hover:border-border scale-100'}`}
                    >
                      <img src={img.finalUrl || img.originalUrl} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                      <div className="absolute top-1 right-1 bg-black/50 text-white text-[8px] font-black px-1.5 py-0.5 rounded backdrop-blur-sm">
                        {idx + 1}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute bottom-1 right-1 bg-red-500 text-white p-1 rounded-lg opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </button>
                  ))}
                  <label className="flex-shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-text-muted hover:border-accent hover:text-accent transition-all cursor-pointer bg-surface/30 hover:bg-accent/5">
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-[8px] font-black uppercase">Add</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => {
                      if (e.target.files) handleFiles(Array.from(e.target.files));
                    }} />
                  </label>
                </div>
              )}
            </main>

            {/* Right Controls (Sidebar) */}
            <aside className="w-full lg:w-1/4 shrink-0 bg-surface border-l border-border flex flex-col shadow-sm overflow-hidden h-auto lg:h-full">
              <div className="p-6 space-y-6 overflow-y-auto scrollbar-hide flex-1">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Zoom Preview</label>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setZoom(Math.max(0.1, zoom - 0.25))}
                        className="p-1.5 rounded-lg bg-bg-secondary hover:bg-border text-text-muted transition-colors"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <span className="text-[10px] font-black w-10 text-center">{Math.round(zoom * 100)}%</span>
                      <button 
                        onClick={() => setZoom(Math.min(5, zoom + 0.25))}
                        className="p-1.5 rounded-lg bg-bg-secondary hover:bg-border text-text-muted transition-colors"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <input 
                    type="range" min="0.1" max="5" step="0.25" 
                    value={zoom} 
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full accent-accent h-1.5"
                  />
                </div>

                <div className="space-y-6 animate-in fade-in pt-6 border-t border-border">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3 block">Quality: {Math.round(currentImage.settings.quality * 100)}%</label>
                    <input 
                      type="range" min="0.1" max="1" step="0.05" 
                      value={currentImage.settings.quality} 
                      onChange={(e) => updateSettings({ quality: Number(e.target.value) })}
                      className="w-full accent-accent"
                    />
                    <div className="flex justify-between text-[10px] font-bold text-text-muted mt-2">
                      <span>Small Size</span>
                      <span>Best Quality</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted block">Format</label>
                    <select 
                      value={currentImage.settings.format}
                      onChange={(e) => updateSettings({ format: e.target.value })}
                      className="fi text-sm py-2.5 rounded-xl border-border bg-bg-secondary"
                    >
                      <option value="image/jpeg">JPG</option>
                      <option value="image/png">PNG</option>
                      <option value="image/webp">WEBP</option>
                    </select>
                  </div>
                </div>

                <RelatedTools currentToolId="image-compressor" />

                <div className="pt-6 border-t border-border space-y-4">
                  {images.length > 1 && (
                    <button 
                      onClick={applyToAll}
                      className="w-full py-4 rounded-2xl bg-bg-secondary hover:bg-border text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Apply to All
                    </button>
                  )}
                  <button 
                    onClick={downloadAll} 
                    disabled={isProcessingBatch}
                    className="btn bp w-full py-4 rounded-2xl gap-2 shadow-lg shadow-accent/20 text-xs font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {isProcessingBatch ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {images.length > 1 ? 'Download All' : 'Download Image'}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        );
      }}
    </ToolLayout>
  );
}
