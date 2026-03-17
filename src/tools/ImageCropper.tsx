import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Upload, Download, Settings, RefreshCw, Crop as CropIcon, Trash2, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';

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

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      const newImages = selectedFiles.map((file: File) => ({
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

  const processCrop = () => {
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
      
      // Auto-advance to next uncropped image if available
      const nextUncropped = images.findIndex((img, idx) => idx > currentIndex && !img.output);
      if (nextUncropped !== -1) {
        setCurrentIndex(nextUncropped);
      }
    } catch (err) {
      console.error("Error cropping image:", err);
    } finally {
      setLoading(false);
    }
  };

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
  const allProcessed = images.length > 0 && images.every(img => img.output);

  return (
    <div className="space-y-6">
      {images.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-[14px] p-12 text-center hover:bg-bg-secondary transition-colors cursor-pointer relative">
          <input 
            type="file" 
            accept="image/*" 
            multiple
            onChange={onSelectFile} 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-lg mb-1">Upload Images</p>
              <p className="text-text-muted text-sm">Drag and drop or click to browse. Batch processing supported.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-bg-secondary rounded-[14px] p-4 relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2"><CropIcon className="w-5 h-5 text-accent" /> Crop Images ({images.length})</h3>
                <label className="text-sm text-accent hover:underline cursor-pointer">
                  + Add More
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    onChange={onSelectFile} 
                    className="hidden" 
                  />
                </label>
              </div>

              {/* Thumbnail strip */}
              <div className="flex gap-2 overflow-x-auto pb-4 mb-4 border-b border-border">
                {images.map((img, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative flex-shrink-0 w-20 h-20 rounded-md overflow-hidden cursor-pointer border-2 transition-colors ${currentIndex === idx ? 'border-accent' : 'border-transparent hover:border-border'}`}
                  >
                    <img src={img.output || img.preview} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                    {img.output && (
                      <div className="absolute top-1 right-1 bg-surface rounded-full">
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      </div>
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                      className="absolute bottom-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Main Crop Area */}
              {currentImage && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-surface rounded-lg p-2">
                  {currentImage.output ? (
                    <div className="relative">
                      <img src={currentImage.output} alt="Cropped" className="max-w-full max-h-[85vh] object-contain shadow-md rounded-lg" />
                      <button 
                        onClick={() => {
                          setImages(prev => {
                            const updated = [...prev];
                            updated[currentIndex].output = null;
                            return updated;
                          });
                        }}
                        className="absolute top-2 right-2 btn bs2 text-xs py-1 px-2"
                      >
                        Recrop
                      </button>
                    </div>
                  ) : (
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      onComplete={(c) => setCompletedCrop(c)}
                      aspect={aspect}
                    >
                      <img ref={imgRef} src={currentImage.preview} onLoad={onLoad} alt="Crop me" className="max-w-full max-h-[85vh] object-contain" />
                    </ReactCrop>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface border border-border rounded-[14px] p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent" /> Settings
              </h3>

              <div className="space-y-4">
                <div className="fg">
                  <label className="fl">Aspect Ratio</label>
                  <select className="fi" value={aspect || ''} onChange={e => setAspect(e.target.value ? Number(e.target.value) : undefined)}>
                    <option value="">Freeform</option>
                    <option value={1}>1:1 (Square)</option>
                    <option value={16/9}>16:9 (Landscape)</option>
                    <option value={4/3}>4:3</option>
                    <option value={9/16}>9:16 (Portrait)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-3 mt-6">
                  <button onClick={processCrop} disabled={loading || !completedCrop?.width || !completedCrop?.height || !!currentImage?.output} className="btn bp w-full gap-2">
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CropIcon className="w-4 h-4" />}
                    {loading ? 'Cropping...' : currentImage?.output ? 'Cropped' : 'Crop Current'}
                  </button>
                  <button onClick={() => setImages([])} className="btn bs2 w-full">
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            {images.some(img => img.output) && (
              <div className="bg-success/10 border border-success/20 rounded-[14px] p-6 text-center animate-in fade-in slide-in-from-bottom-4">
                <h4 className="text-success font-bold text-lg mb-4">
                  {allProcessed ? 'All Cropped!' : `${images.filter(img => img.output).length} Cropped`}
                </h4>
                <button onClick={downloadAll} className="btn bg w-full gap-2">
                  <Download className="w-4 h-4" /> Download {images.filter(img => img.output).length > 1 ? 'All (ZIP)' : 'Cropped'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
