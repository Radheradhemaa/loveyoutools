import React, { useState, useRef, useCallback } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Download, Settings, RefreshCw, Crop as CropIcon, Trash2, CheckCircle2, AlertCircle, Plus, ChevronLeft, ChevronRight, X, Layers } from 'lucide-react';
import JSZip from 'jszip';
import ToolLayout from '../components/tool-system/ToolLayout';

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

  const handleFiles = (files: File[]) => {
    if (files.length > 0) {
      const newImages = files.map((file: File) => ({
        file,
        preview: URL.createObjectURL(file),
        output: null
      }));
      setImages(prev => [...prev, ...newImages]);
      if (images.length === 0) {
        setCurrentIndex(0);
      }
    }
  };

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    imgRef.current = e.currentTarget;
  };

  const processCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current || images.length === 0) return;
    setLoading(true);

    try {
      const image = imgRef.current;
      const canvas = document.createElement('canvas');
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      canvas.width = completedCrop.width;
      canvas.height = completedCrop.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        setLoading(false);
        return;
      }

      ctx.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        completedCrop.width,
        completedCrop.height
      );

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      
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

  const downloadAll = async () => {
    const processedImages = images.filter(img => img.output);
    if (processedImages.length === 0) return;

    if (processedImages.length === 1) {
      const a = document.createElement('a');
      a.href = processedImages[0].output!;
      a.download = `cropped_${processedImages[0].file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const zip = new JSZip();
    
    for (const img of processedImages) {
      const response = await fetch(img.output!);
      const blob = await response.blob();
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
    URL.revokeObjectURL(url);
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
      question: "How do I crop multiple images at once?",
      answer: "Simply upload all your images together. You can then navigate through them using the thumbnail strip, apply crops individually, and finally download all cropped images as a single ZIP file."
    },
    {
      question: "What aspect ratios are supported?",
      answer: "We support common aspect ratios like 1:1 (Square), 16:9 (Landscape), 4:3, and 9:16 (Portrait). You can also use 'Freeform' to crop to any custom dimension."
    },
    {
      question: "Is there a limit to the number of images?",
      answer: "While there's no hard limit, we recommend processing up to 20-30 images at a time for the best performance, as all processing happens in your browser's memory."
    }
  ];

  return (
    <ToolLayout
      title="Image Cropper"
      description="Crop one or multiple images instantly with precision. Support for standard aspect ratios."
      onFilesSelected={handleFiles}
      files={images.map(img => img.file)}
      isProcessing={loading}
      onReset={() => {
        setImages([]);
        setCurrentIndex(0);
      }}
      faqs={faqs}
      renderToolbar={() => (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-surface/50 p-1 rounded-lg border border-border/50">
            <button
              onClick={() => setAspect(undefined)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${aspect === undefined ? 'bg-accent text-white shadow-sm' : 'hover:bg-surface text-text-secondary'}`}
            >
              Freeform
            </button>
            <button
              onClick={() => setAspect(1)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${aspect === 1 ? 'bg-accent text-white shadow-sm' : 'hover:bg-surface text-text-secondary'}`}
            >
              1:1
            </button>
            <button
              onClick={() => setAspect(16/9)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${aspect === 16/9 ? 'bg-accent text-white shadow-sm' : 'hover:bg-surface text-text-secondary'}`}
            >
              16:9
            </button>
            <button
              onClick={() => setAspect(9/16)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${aspect === 9/16 ? 'bg-accent text-white shadow-sm' : 'hover:bg-surface text-text-secondary'}`}
            >
              9:16
            </button>
          </div>
          <div className="h-6 w-px bg-border/50" />
          <button
            onClick={processCrop}
            disabled={loading || !completedCrop?.width || !!currentImage?.output}
            className="btn bp py-1.5 px-4 text-xs gap-2"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CropIcon className="w-3.5 h-3.5" />}
            {currentImage?.output ? 'Cropped' : 'Crop Current'}
          </button>
          {processedCount > 0 && (
            <button onClick={downloadAll} className="btn bg py-1.5 px-4 text-xs gap-2">
              <Download className="w-3.5 h-3.5" />
              Download {processedCount > 1 ? `All (${processedCount})` : 'Cropped'}
            </button>
          )}
        </div>
      )}
      renderSettings={() => (
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-text-primary">
              <Settings className="w-4 h-4 text-accent" /> Crop Settings
            </h3>
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-wider font-bold text-text-muted">Aspect Ratio</label>
              <select 
                className="fi text-sm py-2" 
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

          <div className="space-y-4 pt-4 border-t border-border/50">
            <h3 className="text-sm font-bold flex items-center gap-2 text-text-primary">
              <Layers className="w-4 h-4 text-accent" /> Batch Info
            </h3>
            <div className="p-4 rounded-xl bg-bg-secondary/50 border border-border/50 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Total Images</span>
                <span className="text-sm font-bold text-text-primary">{images.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Processed</span>
                <span className="text-sm font-bold text-success">{processedCount}</span>
              </div>
              <div className="w-full bg-border/30 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-success transition-all duration-500" 
                  style={{ width: `${(processedCount / images.length) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-accent/5 border border-accent/10 rounded-xl p-4 mt-6">
            <h4 className="text-xs font-bold text-accent mb-2 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5" /> Quick Tip
            </h4>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              Use the arrow keys or the thumbnail strip to quickly navigate between images in your batch.
            </p>
          </div>
        </div>
      )}
    >
      {images.length > 0 && (
        <div className="h-full flex flex-col gap-6">
          {/* Thumbnail Strip */}
          <div className="flex items-center gap-4 bg-surface/50 p-3 rounded-2xl border border-border/50 overflow-hidden">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
              {images.map((img, idx) => (
                <div 
                  key={idx} 
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${currentIndex === idx ? 'border-accent scale-105 shadow-md' : 'border-transparent hover:border-border scale-100'}`}
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
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <label className="flex-shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-text-muted hover:border-accent hover:text-accent transition-all cursor-pointer bg-surface/30">
                <Plus className="w-5 h-5" />
                <span className="text-[10px] font-bold">Add</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple
                  onChange={(e) => handleFiles(Array.from(e.target.files || []))} 
                  className="hidden" 
                />
              </label>
            </div>
            
            <div className="flex items-center gap-2 pr-2">
              <button 
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="p-2 rounded-xl bg-surface border border-border hover:bg-bg-secondary disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setCurrentIndex(prev => Math.min(images.length - 1, prev + 1))}
                disabled={currentIndex === images.length - 1}
                className="p-2 rounded-xl bg-surface border border-border hover:bg-bg-secondary disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Working Area */}
          <div className="flex-1 relative bg-bg-secondary/50 rounded-2xl overflow-hidden border border-border/50 flex flex-col items-center justify-center p-4">
            {currentImage && (
              <div className="w-full h-full flex items-center justify-center">
                {currentImage.output ? (
                  <div className="relative animate-in zoom-in-95 duration-300">
                    <img src={currentImage.output} alt="Cropped" className="max-w-full max-h-[70vh] object-contain shadow-2xl rounded-xl border border-white/10" />
                    <button 
                      onClick={() => {
                        setImages(prev => {
                          const updated = [...prev];
                          updated[currentIndex].output = null;
                          return updated;
                        });
                      }}
                      className="absolute -top-3 -right-3 btn bs2 py-2 px-4 text-xs shadow-xl bg-surface/90 backdrop-blur-md border border-border/50"
                    >
                      Recrop Image
                    </button>
                  </div>
                ) : (
                  <div className="max-w-full max-h-full">
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      onComplete={(c) => setCompletedCrop(c)}
                      aspect={aspect}
                      className="max-w-full max-h-[70vh]"
                    >
                      <img 
                        ref={imgRef} 
                        src={currentImage.preview} 
                        onLoad={onLoad} 
                        alt="Crop target" 
                        className="max-w-full max-h-[70vh] object-contain" 
                      />
                    </ReactCrop>
                  </div>
                )}
              </div>
            )}
            
            {/* Navigation Hint */}
            {!currentImage?.output && (
              <div className="mt-4 text-xs text-text-muted flex items-center gap-2 bg-surface/50 px-4 py-2 rounded-full border border-border/50">
                <AlertCircle className="w-3.5 h-3.5" /> Drag the corners to adjust the crop area
              </div>
            )}
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
