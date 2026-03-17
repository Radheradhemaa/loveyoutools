import React, { useState, useRef, useEffect } from 'react';
import { Upload, Droplet, Copy, CheckCircle2, Trash2, Image as ImageIcon } from 'lucide-react';

interface ProcessedImage {
  file: File;
  preview: string;
}

export default function ImageColorPicker() {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [color, setColor] = useState<string | null>(null);
  const [rgb, setRgb] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      const newImages = selectedFiles.map((file: File) => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      setImages(prev => [...prev, ...newImages]);
      if (images.length === 0) {
        setCurrentIndex(0);
      }
      setColor(null);
      setRgb(null);
    }
  };

  const handleImageLoad = () => {
    if (imgRef.current && canvasRef.current) {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, img.width, img.height);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!canvasRef.current || !imgRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = imgRef.current.getBoundingClientRect();
    
    // Calculate scale between displayed size and actual image size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    try {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const hex = `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`.toUpperCase();
      const rgbStr = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
      setColor(hex);
      setRgb(rgbStr);
    } catch (err) {
      // Ignore cross-origin canvas errors if any
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    if (currentIndex >= index && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
    setColor(null);
    setRgb(null);
  };

  const currentImage = images[currentIndex];

  return (
    <div className="space-y-6">
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

              {/* Thumbnail strip */}
              <div className="flex gap-2 overflow-x-auto pb-4 mb-4 border-b border-border">
                {images.map((img, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => {
                      setCurrentIndex(idx);
                      setColor(null);
                      setRgb(null);
                    }}
                    className={`relative flex-shrink-0 w-20 h-20 rounded-md overflow-hidden cursor-pointer border-2 transition-colors ${currentIndex === idx ? 'border-accent' : 'border-transparent hover:border-border'}`}
                  >
                    <img src={img.preview} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                      className="absolute bottom-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Main Image Area */}
              {currentImage && (
                <div className="flex flex-col items-center justify-center min-h-[300px] bg-surface rounded-lg p-2 cursor-crosshair">
                  <img 
                    ref={imgRef}
                    src={currentImage.preview} 
                    alt="Preview" 
                    onLoad={handleImageLoad}
                    onMouseMove={handleMouseMove}
                    onClick={() => color && copyToClipboard(color)}
                    className="max-w-full max-h-[85vh] object-contain shadow-md rounded-lg" 
                  />
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}
            </div>
            
            <div className="flex gap-4">
              <button onClick={() => setImages([])} className="btn bs flex-1">
                Clear All
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface border border-border rounded-[14px] p-6 text-center">
              <h3 className="font-bold text-lg mb-6 flex items-center justify-center gap-2">
                <Droplet className="w-5 h-5 text-accent" /> Picked Color
              </h3>

              {color ? (
                <div className="space-y-6">
                  <div 
                    className="w-32 h-32 mx-auto rounded-full shadow-lg border-4 border-white"
                    style={{ backgroundColor: color }}
                  ></div>
                  
                  <div className="space-y-3">
                    <button 
                      onClick={() => copyToClipboard(color)}
                      className="w-full flex items-center justify-between p-3 bg-bg-secondary rounded-lg hover:bg-border transition-colors group"
                    >
                      <span className="font-mono font-medium">{color}</span>
                      {copied ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-text-muted group-hover:text-text-primary" />}
                    </button>
                    
                    <button 
                      onClick={() => rgb && copyToClipboard(rgb)}
                      className="w-full flex items-center justify-between p-3 bg-bg-secondary rounded-lg hover:bg-border transition-colors group"
                    >
                      <span className="font-mono font-medium">{rgb}</span>
                      {copied ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-text-muted group-hover:text-text-primary" />}
                    </button>
                  </div>
                  <p className="text-sm text-text-muted mt-4">Hover over the image to pick a color, click the image to copy HEX.</p>
                </div>
              ) : (
                <div className="py-12 text-text-muted">
                  Hover over the image to pick a color
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
