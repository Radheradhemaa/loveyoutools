import React, { useState, useRef, useEffect } from 'react';
import { ImageIcon, Download, Settings, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';
import ToolLayout from '../components/tool-system/ToolLayout';

interface ProcessedImage {
  file: File;
  preview: string;
  output: string | null;
  metadata?: any;
}

export default function ImageTools({ toolId }: { toolId: string }) {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const imagesRef = useRef<ProcessedImage[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Keep ref in sync
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  const initialFilesProcessed = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Tool specific states
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const [unit, setUnit] = useState<'px' | 'in' | 'cm'>('px');
  const [dpi, setDpi] = useState(300);
  const [targetKB, setTargetKB] = useState(0);
  const [format, setFormat] = useState('image/jpeg');
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [filter, setFilter] = useState('none');
  const [watermarkText, setWatermarkText] = useState('Watermark');

  useEffect(() => {
    // Reset state when tool changes
    setImages([]);
  }, [toolId]);

  const handleFiles = (files: File | File[]) => {
    const selectedFiles = Array.isArray(files) ? files : [files];
    if (selectedFiles.length > 0) {
      const newImages: ProcessedImage[] = [];
      
      selectedFiles.forEach((file: File) => {
        // Check if file already exists in state
        const isDuplicate = images.some(img => 
          img.file.name === file.name && 
          img.file.size === file.size && 
          img.file.lastModified === file.lastModified
        );
        
        if (isDuplicate) return;

        const url = URL.createObjectURL(file);
        const imgObj: ProcessedImage = {
          file,
          preview: url,
          output: null
        };

        // Extract basic metadata if needed
        if (toolId === 'image-metadata-viewer') {
          imgObj.metadata = {
            name: file.name,
            size: (file.size / 1024).toFixed(2) + ' KB',
            type: file.type,
            lastModified: new Date(file.lastModified).toLocaleString()
          };
          
          const img = new Image();
          img.onload = () => {
            setImages(prev => {
              const updated = [...prev];
              const target = updated.find(i => i.preview === url);
              if (target && target.metadata) {
                target.metadata.width = img.width + 'px';
                target.metadata.height = img.height + 'px';
                target.metadata.aspectRatio = (img.width / img.height).toFixed(2);
              }
              return updated;
            });
          };
          img.src = url;
        }

        newImages.push(imgObj);
      });

      if (newImages.length > 0) {
        setImages(prev => [...prev, ...newImages]);
      }
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const processImages = async () => {
    if (images.length === 0 || !canvasRef.current) return;
    setLoading(true);

    const updatedImages = [...images];

    for (let i = 0; i < updatedImages.length; i++) {
      const imgData = updatedImages[i];
      if (imgData.output) continue; // Skip already processed

      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = async () => {
          try {
            const canvas = canvasRef.current!;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve();
              return;
            }

            let targetW = img.width;
            let targetH = img.height;

            if (toolId === 'image-resizer') {
              const convertToPx = (val: number, from: 'px' | 'in' | 'cm') => {
                if (from === 'px') return val;
                if (from === 'in') return val * dpi;
                if (from === 'cm') return (val / 2.54) * dpi;
                return val;
              };
              targetW = convertToPx(width, unit) || img.width;
              targetH = convertToPx(height, unit) || img.height;
            }

            // Handle rotation swapping dimensions
            if (toolId === 'image-rotator-flipper' && (rotation === 90 || rotation === 270)) {
              canvas.width = targetH;
              canvas.height = targetW;
            } else {
              canvas.width = targetW;
              canvas.height = targetH;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Apply transformations
            ctx.save();
            
            if (toolId === 'image-rotator-flipper') {
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate((rotation * Math.PI) / 180);
              ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
              ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
            } else {
              if (toolId === 'photo-filters') {
                ctx.filter = filter;
              }
              ctx.drawImage(img, 0, 0, targetW, targetH);
            }
            
            ctx.restore();

            // Apply Watermark
            if (toolId === 'watermark-adder') {
              ctx.font = `${Math.max(20, targetW / 20)}px Arial`;
              ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              // Rotate watermark diagonally
              ctx.translate(targetW / 2, targetH / 2);
              ctx.rotate(-Math.PI / 4);
              ctx.fillText(watermarkText, 0, 0);
              ctx.translate(-targetW / 2, -targetH / 2);
            }

            // Generate output
            const outFormat = toolId === 'image-converter' ? format : imgData.file.type || 'image/jpeg';
            
            let dataUrl = canvas.toDataURL(outFormat, 0.9);
            
            // Iterative compression for resizer if targetKB is set
            if (toolId === 'image-resizer' && targetKB > 0 && outFormat === 'image/jpeg') {
              let quality = 0.92;
              dataUrl = canvas.toDataURL('image/jpeg', quality);
              let size = getDataUrlSize(dataUrl) / 1024;
              
              let min = 0.01;
              let max = 1.0;
              for (let j = 0; j < 12; j++) {
                quality = (min + max) / 2;
                dataUrl = canvas.toDataURL('image/jpeg', quality);
                size = getDataUrlSize(dataUrl) / 1024;
                if (size > targetKB) max = quality;
                else min = quality;
              }
              dataUrl = canvas.toDataURL('image/jpeg', min);

              // Pad to exact size if requested
              const targetBytes = Math.floor(targetKB * 1024);
              const currentBytes = getDataUrlSize(dataUrl);
              
              if (currentBytes < targetBytes) {
                const diff = targetBytes - currentBytes;
                if (diff >= 4) {
                  const base64Data = dataUrl.split(',')[1];
                  const binaryString = atob(base64Data);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let k = 0; k < binaryString.length; k++) {
                    bytes[k] = binaryString.charCodeAt(k);
                  }

                  const newBytes = new Uint8Array(bytes.length + diff);
                  newBytes.set(bytes.slice(0, bytes.length - 2));
                  
                  const comHeader = [0xFF, 0xFE];
                  const payloadLen = diff - 2;
                  const lenField = [(payloadLen >> 8) & 0xFF, payloadLen & 0xFF];
                  
                  newBytes.set(comHeader, bytes.length - 2);
                  newBytes.set(lenField, bytes.length);
                  newBytes.set([0xFF, 0xD9], bytes.length + diff - 2);
                  
                  const blob = new Blob([newBytes], { type: 'image/jpeg' });
                  dataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                }
              }
            } else {
              dataUrl = canvas.toDataURL(outFormat, 0.9);
            }
            
            updatedImages[i].output = dataUrl;
          } catch (err) {
            console.error("Error processing image:", err);
          } finally {
            resolve();
          }
        };
        img.onerror = () => {
          console.error("Failed to load image for processing");
          resolve();
        };
        img.src = imgData.preview;
      });
    }

    setImages(updatedImages);
    setLoading(false);
  };

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
    const currentImages = imagesRef.current;
    const processedImages = currentImages.filter(img => img.output);
    if (processedImages.length === 0) {
      console.warn("No processed images to download");
      return;
    }

    if (processedImages.length === 1) {
      const blob = dataURLtoBlob(processedImages[0].output!);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const ext = (toolId === 'image-converter' ? format : processedImages[0].file.type || 'image/jpeg').split('/')[1];
      a.download = `processed_${processedImages[0].file.name.split('.')[0]}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return;
    }

    const zip = new JSZip();
    
    for (const img of processedImages) {
      const response = await fetch(img.output!);
      const blob = await response.blob();
      const ext = (toolId === 'image-converter' ? format : img.file.type || 'image/jpeg').split('/')[1];
      zip.file(`processed_${img.file.name.split('.')[0]}.${ext}`, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'processed_images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const allProcessed = images.length > 0 && images.every(img => img.output);

  const getDataUrlSize = (dataUrl: string) => {
    const base64String = dataUrl.split(',')[1];
    if (!base64String) return 0;
    const padding = (base64String.match(/=/g) || []).length;
    return (base64String.length * 0.75) - padding;
  };

  const getToolTitle = () => {
    switch (toolId) {
      case 'image-resizer': return 'Image Resizer';
      case 'image-converter': return 'Image Converter';
      case 'image-rotator-flipper': return 'Rotate & Flip Image';
      case 'photo-filters': return 'Photo Filters';
      case 'watermark-adder': return 'Add Watermark';
      case 'image-metadata-viewer': return 'Image Metadata Viewer';
      default: return 'Image Tools';
    }
  };

  const getToolDescription = () => {
    switch (toolId) {
      case 'image-resizer': return 'Resize images to exact dimensions or target file size.';
      case 'image-converter': return 'Convert images between JPG, PNG, and WebP formats.';
      case 'image-rotator-flipper': return 'Rotate images by 90 degrees or flip them horizontally/vertically.';
      case 'photo-filters': return 'Apply various filters like grayscale, sepia, and blur to your photos.';
      case 'watermark-adder': return 'Add a custom text watermark to your images.';
      case 'image-metadata-viewer': return 'View EXIF data and other metadata hidden in your image files.';
      default: return 'Process and edit your images.';
    }
  };

  return (
    <ToolLayout
      title={getToolTitle()}
      description={getToolDescription()}
      toolId={toolId}
      acceptedFileTypes={['image/*']}
      multiple={true}
      onDownload={downloadAll}
    >
      {({ file, onComplete, onReset }) => {
        useEffect(() => {
          if (!file) {
            setImages([]);
            initialFilesProcessed.current = false;
            return;
          }
          if (file && !initialFilesProcessed.current) {
            handleFiles(file);
            initialFilesProcessed.current = true;
          }
        }, [file]);

        if (images.length === 0) return null;

        return (
          <div className="max-w-[1200px] mx-auto w-full p-4 lg:p-6 flex flex-col gap-5 h-full">
            <canvas ref={canvasRef} className="hidden" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0">
              {/* Left Controls (Sidebar) */}
              <aside className="bg-surface border border-border rounded-2xl flex flex-col shadow-sm order-2 lg:order-1 overflow-y-auto scrollbar-hide">
                <div className="p-5 space-y-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-accent" /> Settings
                  </h3>

                  {toolId === 'image-resizer' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-text-primary">Units</label>
                        <div className="flex bg-bg-secondary rounded-lg p-1">
                          {['px', 'in', 'cm'].map(u => (
                            <button
                              key={u}
                              onClick={() => setUnit(u as any)}
                              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${unit === u ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                            >
                              {u.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>

                      {unit !== 'px' && (
                        <div className="fg">
                          <label className="fl">DPI (Resolution)</label>
                          <input type="number" className="fi" value={dpi} onChange={e => setDpi(Number(e.target.value))} />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="fg">
                          <label className="fl">Width ({unit})</label>
                          <input type="number" className="fi" value={width || ''} onChange={e => setWidth(Number(e.target.value))} />
                        </div>
                        <div className="fg">
                          <label className="fl">Height ({unit})</label>
                          <input type="number" className="fi" value={height || ''} onChange={e => setHeight(Number(e.target.value))} />
                        </div>
                      </div>

                      <div className="fg">
                        <label className="fl">Target File Size (KB)</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            className="fi pr-12" 
                            placeholder="Optional"
                            value={targetKB || ''} 
                            onChange={e => setTargetKB(Number(e.target.value))} 
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">KB</span>
                        </div>
                        <p className="text-[10px] text-text-muted mt-1">Leave 0 for no limit. Only works for JPG output.</p>
                      </div>
                    </div>
                  )}

                  {toolId === 'image-converter' && (
                    <div className="fg">
                      <label className="fl">Convert To</label>
                      <select className="fi" value={format} onChange={e => setFormat(e.target.value)}>
                        <option value="image/jpeg">JPG</option>
                        <option value="image/png">PNG</option>
                        <option value="image/webp">WebP</option>
                      </select>
                    </div>
                  )}

                  {toolId === 'image-rotator-flipper' && (
                    <div className="space-y-4">
                      <div className="fg">
                        <label className="fl">Rotation</label>
                        <div className="flex gap-2">
                          {[0, 90, 180, 270].map(deg => (
                            <button key={deg} onClick={() => setRotation(deg)} className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${rotation === deg ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'}`}>
                              {deg}°
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={flipH} onChange={e => setFlipH(e.target.checked)} className="rounded text-accent focus:ring-accent" />
                          <span className="text-sm font-medium">Flip Horizontal</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={flipV} onChange={e => setFlipV(e.target.checked)} className="rounded text-accent focus:ring-accent" />
                          <span className="text-sm font-medium">Flip Vertical</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {toolId === 'photo-filters' && (
                    <div className="fg">
                      <label className="fl">Select Filter</label>
                      <select className="fi" value={filter} onChange={e => setFilter(e.target.value)}>
                        <option value="none">Normal</option>
                        <option value="grayscale(100%)">Grayscale</option>
                        <option value="sepia(100%)">Sepia</option>
                        <option value="invert(100%)">Invert</option>
                        <option value="blur(5px)">Blur</option>
                        <option value="brightness(150%)">Brighten</option>
                        <option value="contrast(200%)">High Contrast</option>
                      </select>
                    </div>
                  )}

                  {toolId === 'watermark-adder' && (
                    <div className="fg">
                      <label className="fl">Watermark Text</label>
                      <input type="text" className="fi" value={watermarkText} onChange={e => setWatermarkText(e.target.value)} />
                    </div>
                  )}

                  {toolId !== 'image-metadata-viewer' && (
                    <div className="flex flex-col gap-3 mt-6">
                      <button 
                        onClick={async () => { 
                          setLoading(true);
                          try {
                            await processImages(); 
                            onComplete(); 
                          } catch (error) {
                            console.error("Processing failed:", error);
                          } finally {
                            setLoading(false);
                          }
                        }} 
                        disabled={loading || images.length === 0} 
                        className="btn bp w-full gap-2"
                      >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                        {loading ? 'Processing...' : allProcessed ? 'Reprocess All' : 'Process All'}
                      </button>
                      <button onClick={() => { setImages([]); initialFilesProcessed.current = false; onReset(); }} className="btn bs2 w-full">
                        Clear All
                      </button>
                    </div>
                  )}

                  {allProcessed && toolId !== 'image-metadata-viewer' && (
                    <div className="bg-success/10 border border-success/20 rounded-[14px] p-6 text-center animate-in fade-in slide-in-from-bottom-4 mt-6">
                      <h4 className="text-success font-bold text-lg mb-4">Processing Successful!</h4>
                      <button onClick={downloadAll} className="btn bg w-full gap-2">
                        <Download className="w-4 h-4" /> Download All {images.length > 1 ? '(ZIP)' : ''}
                      </button>
                    </div>
                  )}
                </div>
              </aside>

              {/* Right Preview */}
              <main className="bg-surface border border-border rounded-2xl flex flex-col shadow-sm order-1 lg:order-2 overflow-hidden min-h-[400px] lg:min-h-[600px] relative p-4 gap-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold flex items-center gap-2"><ImageIcon className="w-5 h-5 text-accent" /> Images ({images.length})</h3>
                  <label className="text-sm text-accent hover:underline cursor-pointer">
                    + Add More
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

                {toolId === 'image-metadata-viewer' ? (
                  <div className="space-y-4 max-h-[60vh] lg:max-h-[85vh] overflow-y-auto pr-2">
                    {images.map((img, idx) => (
                      <div key={idx} className="bg-surface border border-border rounded-lg p-4 relative group">
                        <button 
                          onClick={() => removeImage(idx)}
                          className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="flex gap-4">
                          <img src={img.preview} alt={img.file.name} className="w-24 h-24 object-cover rounded-md border border-border" />
                          <div className="flex-1 space-y-1 text-sm">
                            {img.metadata && Object.entries(img.metadata).map(([k, v]) => (
                              <div key={k} className="flex justify-between border-b border-border pb-1">
                                <span className="text-text-muted capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                                <span className="font-medium text-text-primary">{v as string}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[60vh] lg:max-h-[85vh] overflow-y-auto pr-2">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative group rounded-lg overflow-hidden border border-border bg-surface aspect-square flex flex-col">
                        <div className="flex-1 relative flex items-center justify-center p-2">
                          <img 
                            src={img.output || img.preview} 
                            alt={img.file.name} 
                            className="max-w-full max-h-full object-contain" 
                            style={{ filter: toolId === 'photo-filters' && !img.output ? filter : 'none' }} 
                          />
                          <button 
                            onClick={() => removeImage(idx)}
                            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="bg-bg-secondary p-2 text-xs border-t border-border flex justify-between items-center">
                          <p className="truncate font-medium" title={img.file.name}>{img.file.name}</p>
                          {img.output && <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </main>
            </div>
          </div>
        );
      }}
    </ToolLayout>
  );
}
