import React, { useState, useRef } from 'react';
import { Upload, Download, Image as ImageIcon, RefreshCw, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import JSZip from 'jszip';

interface CompressedImage {
  file: File;
  previewUrl: string;
  compressedUrl: string | null;
  originalSize: number;
  compressedSize: number;
}

export default function ImageCompressor() {
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [quality, setQuality] = useState(0.8);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newImages = selectedFiles
      .filter((file: File) => file.type.startsWith('image/'))
      .map((file: File) => ({
        file,
        previewUrl: URL.createObjectURL(file),
        compressedUrl: null,
        originalSize: file.size,
        compressedSize: 0,
      }));
    
    setImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const compressImages = async () => {
    if (images.length === 0) return;
    setIsCompressing(true);

    const updatedImages = [...images];

    for (let i = 0; i < updatedImages.length; i++) {
      const imgData = updatedImages[i];
      if (imgData.compressedUrl) continue; // Skip already compressed

      await new Promise<void>((resolve) => {
        const img = new Image();
        img.src = imgData.previewUrl;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve();
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                updatedImages[i].compressedUrl = URL.createObjectURL(blob);
                updatedImages[i].compressedSize = blob.size;
              }
              resolve();
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => resolve();
      });
    }

    setImages(updatedImages);
    setIsCompressing(false);
  };

  const downloadAll = async () => {
    const compressedImages = images.filter(img => img.compressedUrl);
    if (compressedImages.length === 0) return;

    if (compressedImages.length === 1) {
      const a = document.createElement('a');
      a.href = compressedImages[0].compressedUrl!;
      a.download = `compressed_${compressedImages[0].file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const zip = new JSZip();
    
    for (const img of compressedImages) {
      const response = await fetch(img.compressedUrl!);
      const blob = await response.blob();
      zip.file(`compressed_${img.file.name}`, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'compressed_images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const totalOriginalSize = images.reduce((acc, img) => acc + img.originalSize, 0);
  const totalCompressedSize = images.reduce((acc, img) => acc + img.compressedSize, 0);
  const totalSavings = totalOriginalSize && totalCompressedSize 
    ? Math.round(((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100) 
    : 0;
  const allCompressed = images.length > 0 && images.every(img => img.compressedUrl);

  return (
    <div className="space-y-8">
      {images.length === 0 ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-[14px] p-12 text-center cursor-pointer hover:bg-bg-secondary hover:border-accent transition-all group"
        >
          <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold mb-2">Upload Images to Compress</h3>
          <p className="text-text-muted mb-6">Drag and drop or click to select files (JPG, PNG, WebP). Batch processing supported.</p>
          <button className="btn bp">Select Images</button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            multiple
            className="hidden" 
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-bg-secondary border border-border rounded-[14px] p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2"><ImageIcon className="w-5 h-5 text-accent" /> Images ({images.length})</h3>
                <button onClick={() => fileInputRef.current?.click()} className="text-sm text-accent hover:underline">
                  + Add More
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  multiple
                  className="hidden" 
                />
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative group rounded-lg overflow-hidden border border-border bg-surface aspect-square flex flex-col">
                    <div className="flex-1 relative flex items-center justify-center p-2">
                      <img src={img.compressedUrl || img.previewUrl} alt={img.file.name} className="max-w-full max-h-full object-contain" />
                      <button 
                        onClick={() => removeImage(idx)}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="bg-bg-secondary p-2 text-xs border-t border-border">
                      <p className="truncate font-medium" title={img.file.name}>{img.file.name}</p>
                      <div className="flex justify-between text-text-muted mt-1">
                        <span>{formatBytes(img.originalSize)}</span>
                        {img.compressedUrl && (
                          <span className="text-success font-medium">{formatBytes(img.compressedSize)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface border border-border rounded-[14px] p-6">
              <h3 className="font-bold text-lg mb-4">Settings</h3>
              <div className="fg">
                <div className="flex justify-between items-center mb-2">
                  <label className="fl">Compression Quality: {Math.round(quality * 100)}%</label>
                  <span className="text-xs text-text-muted">Lower % = Smaller File</span>
                </div>
                <input 
                  type="range" 
                  min="0.1" max="1" step="0.05" 
                  value={quality} 
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>

              <div className="flex flex-col gap-3 mt-6">
                <button 
                  onClick={compressImages} 
                  disabled={isCompressing || allCompressed}
                  className="btn bp w-full gap-2"
                >
                  {isCompressing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {isCompressing ? 'Compressing...' : allCompressed ? 'All Compressed' : 'Compress All'}
                </button>
                <button 
                  onClick={() => setImages([])} 
                  className="btn bs2 w-full"
                >
                  Clear All
                </button>
              </div>
            </div>

            {allCompressed && (
              <div className="bg-success/10 border border-success/20 rounded-[14px] p-6 text-center animate-in fade-in slide-in-from-bottom-4">
                <h4 className="text-success font-bold text-lg mb-1">Compression Successful!</h4>
                <p className="text-success/80 text-sm mb-4">Total saved: {totalSavings}% ({formatBytes(totalOriginalSize - totalCompressedSize)})</p>
                <button 
                  onClick={downloadAll}
                  className="btn bg w-full gap-2"
                >
                  <Download className="w-4 h-4" /> Download All {images.length > 1 ? '(ZIP)' : ''}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
