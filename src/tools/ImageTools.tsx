import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Download, Settings, RefreshCw, Crop, Move, Type, Droplet, Info, Trash2, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';

interface ProcessedImage {
  file: File;
  preview: string;
  output: string | null;
  metadata?: any;
}

export default function ImageTools({ toolId }: { toolId: string }) {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Tool specific states
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      const newImages = selectedFiles.map((file: File) => {
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

        return imgObj;
      });

      setImages(prev => [...prev, ...newImages]);
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
        img.onload = () => {
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
              targetW = width || img.width;
              targetH = height || img.height;
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
            const dataUrl = canvas.toDataURL(outFormat, 0.9);
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

  const downloadAll = async () => {
    const processedImages = images.filter(img => img.output);
    if (processedImages.length === 0) return;

    if (processedImages.length === 1) {
      const a = document.createElement('a');
      a.href = processedImages[0].output!;
      const ext = (toolId === 'image-converter' ? format : processedImages[0].file.type || 'image/jpeg').split('/')[1];
      a.download = `processed_${processedImages[0].file.name.split('.')[0]}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
    URL.revokeObjectURL(url);
  };

  const allProcessed = images.length > 0 && images.every(img => img.output);

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />
      {images.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-[14px] p-12 text-center hover:bg-bg-secondary transition-colors cursor-pointer relative">
          <input 
            type="file" 
            accept="image/*" 
            multiple
            onChange={handleFileChange} 
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
                <h3 className="font-bold flex items-center gap-2"><ImageIcon className="w-5 h-5 text-accent" /> Images ({images.length})</h3>
                <label className="text-sm text-accent hover:underline cursor-pointer">
                  + Add More
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    onChange={handleFileChange} 
                    className="hidden" 
                  />
                </label>
              </div>

              {toolId === 'image-metadata-viewer' ? (
                <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-2">
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[85vh] overflow-y-auto pr-2">
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
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface border border-border rounded-[14px] p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent" /> Settings
              </h3>

              {toolId === 'image-resizer' && (
                <div className="space-y-4">
                  <div className="fg">
                    <label className="fl">Width (px)</label>
                    <input type="number" className="fi" value={width || ''} onChange={e => setWidth(Number(e.target.value))} />
                  </div>
                  <div className="fg">
                    <label className="fl">Height (px)</label>
                    <input type="number" className="fi" value={height || ''} onChange={e => setHeight(Number(e.target.value))} />
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
                  <button onClick={processImages} disabled={loading || allProcessed} className="btn bp w-full gap-2">
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                    {loading ? 'Processing...' : allProcessed ? 'All Processed' : 'Process All'}
                  </button>
                  <button onClick={() => setImages([])} className="btn bs2 w-full">
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {allProcessed && toolId !== 'image-metadata-viewer' && (
              <div className="bg-success/10 border border-success/20 rounded-[14px] p-6 text-center animate-in fade-in slide-in-from-bottom-4">
                <h4 className="text-success font-bold text-lg mb-4">Processing Successful!</h4>
                <button onClick={downloadAll} className="btn bg w-full gap-2">
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
