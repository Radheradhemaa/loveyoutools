import React, { useState, useEffect } from 'react';
import { Download, Image as ImageIcon, RefreshCw, Trash2 } from 'lucide-react';
import JSZip from 'jszip';
import ToolLayout from '../components/tool-system/ToolLayout';

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

  const faq = [
    { q: "Is this image compressor free?", a: "Yes, our image compressor is 100% free to use with no limits on the number of images." },
    { q: "Does it support bulk compression?", a: "Absolutely! You can upload multiple images at once and compress them all in one click." },
    { q: "Will I lose image quality?", a: "You can adjust the compression quality. At 80-90%, the difference is usually invisible to the human eye while significantly reducing file size." },
    { q: "Is it safe to upload my photos?", a: "Your photos never leave your browser. All compression happens locally on your device for maximum privacy." }
  ];

  const handleFiles = (files: File | File[]) => {
    const selectedFiles = Array.isArray(files) ? files : [files];
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
      if (imgData.compressedUrl) continue;

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
    <ToolLayout
      title="Smart Image Compressor"
      description="Reduce image file size by up to 90% without losing quality. Batch process multiple JPG, PNG, and WebP images instantly."
      toolId="image-compressor"
      acceptedFileTypes={['image/*']}
      multiple={true}
      faq={faq}
      onDownload={downloadAll}
    >
      {({ file, onComplete, onReset }) => {
        // Initialize images if not already done
        useEffect(() => {
          if (file && images.length === 0) {
            handleFiles(file);
          }
        }, [file]);

        return (
          <div className="flex flex-col lg:flex-row h-full overflow-hidden bg-bg-secondary/30">
            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
              <div className="max-w-5xl mx-auto space-y-6">
                <div className="bg-surface border border-border rounded-3xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-black text-xl flex items-center gap-2">
                      <ImageIcon className="w-6 h-6 text-accent" /> 
                      Images ({images.length})
                    </h3>
                    <div className="flex items-center gap-4">
                      {allCompressed && (
                        <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-xl text-sm font-bold">
                          Saved {totalSavings}% ({formatBytes(totalOriginalSize - totalCompressedSize)})
                        </div>
                      )}
                      <button 
                        onClick={onReset}
                        className="text-sm font-bold text-red-500 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative group rounded-2xl overflow-hidden border border-border bg-bg-primary aspect-square flex flex-col shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex-1 relative flex items-center justify-center p-2 bg-black/5">
                          {img.compressedUrl ? (
                            <div className="relative w-full h-full flex items-center justify-center group/comp">
                              <img src={img.compressedUrl} alt="Compressed" className="max-w-full max-h-full object-contain" />
                              <div className="absolute inset-0 opacity-0 group-hover/comp:opacity-100 transition-opacity bg-black/40 flex items-center justify-center">
                                <div className="text-[10px] text-white font-bold bg-accent px-2 py-1 rounded">AFTER</div>
                              </div>
                              <div className="absolute top-2 left-2">
                                <div className="text-[10px] text-white font-bold bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
                                  -{Math.round((1 - img.compressedSize/img.originalSize) * 100)}%
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="relative w-full h-full flex items-center justify-center group/comp">
                              <img src={img.previewUrl} alt="Original" className="max-w-full max-h-full object-contain" />
                              <div className="absolute inset-0 opacity-0 group-hover/comp:opacity-100 transition-opacity bg-black/40 flex items-center justify-center">
                                <div className="text-[10px] text-white font-bold bg-text-muted px-2 py-1 rounded">BEFORE</div>
                              </div>
                            </div>
                          )}
                          <button 
                            onClick={() => removeImage(idx)}
                            className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="bg-surface p-3 text-xs border-t border-border">
                          <p className="truncate font-bold text-text-primary mb-1" title={img.file.name}>{img.file.name}</p>
                          <div className="flex justify-between text-text-muted">
                            <span>{formatBytes(img.originalSize)}</span>
                            {img.compressedUrl && (
                              <span className="text-success font-black">{formatBytes(img.compressedSize)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar Controls */}
            <aside className="w-full lg:w-80 bg-surface border-l border-border p-6 shrink-0 shadow-2xl">
              <div className="sticky top-6 space-y-8">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest mb-6 text-text-muted">Compression Settings</h3>
                  <div className="space-y-6">
                    <div className="fg">
                      <div className="flex justify-between items-center mb-3">
                        <label className="fl text-sm">Quality: {Math.round(quality * 100)}%</label>
                        <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded uppercase">Recommended</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.1" max="1" step="0.05" 
                        value={quality} 
                        onChange={(e) => setQuality(Number(e.target.value))}
                        className="w-full accent-accent"
                      />
                      <div className="flex justify-between text-[10px] text-text-muted mt-2">
                        <span>Small Size</span>
                        <span>Best Quality</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-border space-y-4">
                  <button 
                    onClick={compressImages} 
                    disabled={isCompressing || allCompressed || images.length === 0}
                    className="btn bp w-full py-4 rounded-2xl gap-2 text-lg font-bold shadow-xl shadow-accent/20 disabled:opacity-50"
                  >
                    {isCompressing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    {isCompressing ? 'Compressing...' : allCompressed ? 'Compressed' : 'Compress All'}
                  </button>
                  
                  {allCompressed && (
                    <button 
                      onClick={onComplete}
                      className="btn bg w-full py-4 rounded-2xl gap-2 text-lg font-bold shadow-xl shadow-success/20 animate-in zoom-in-95"
                    >
                      <Download className="w-5 h-5" /> Finish & Download
                    </button>
                  )}
                </div>

                {allCompressed && (
                  <div className="p-4 bg-success/5 border border-success/20 rounded-2xl">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 bg-success/10 text-success rounded-lg flex items-center justify-center">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-success">Success!</span>
                    </div>
                    <p className="text-xs text-success/70 leading-relaxed">
                      You saved <strong>{formatBytes(totalOriginalSize - totalCompressedSize)}</strong> of space. That's a <strong>{totalSavings}%</strong> reduction!
                    </p>
                  </div>
                )}
              </div>
            </aside>
          </div>
        );
      }}
    </ToolLayout>
  );
}
