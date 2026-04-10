import React, { useState, useRef, useEffect } from 'react';
import { Upload, Droplet, Copy, CheckCircle2, Trash2, Image as ImageIcon, Plus, ChevronLeft, ChevronRight, X } from 'lucide-react';
import ToolLayout from '../components/tool-system/ToolLayout';

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

  const handleFiles = (files: File[]) => {
    if (files.length > 0) {
      const newImages = files.map((file: File) => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      setImages(prev => {
        const isFirst = prev.length === 0;
        if (isFirst) {
          setCurrentIndex(0);
        }
        return [...prev, ...newImages];
      });
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

  const handlePickColor = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !imgRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = imgRef.current.getBoundingClientRect();
    
    // Calculate scale between displayed size and actual image size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

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

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    handlePickColor(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length > 0) {
      handlePickColor(e.touches[0].clientX, e.touches[0].clientY);
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

  const faqs = [
    {
      q: "How do I pick a color from an image?",
      a: "Upload your image, then simply hover your mouse (or drag your finger on mobile) over the image. The color under your cursor will be displayed in the panel. Click the image to copy the HEX code."
    },
    {
      q: "Can I pick colors from multiple images?",
      a: "Yes, you can upload multiple images at once. Use the thumbnail strip below the main image to switch between them."
    },
    {
      q: "What color formats are supported?",
      a: "We provide both HEX (e.g., #FF0000) and RGB (e.g., rgb(255, 0, 0)) formats. You can copy either format with a single click."
    }
  ];

  return (
    <ToolLayout
      title="Image Color Picker"
      description="Extract precise colors from any image. Hover to pick, click to copy HEX and RGB codes instantly."
      toolId="image-color-picker"
      acceptedFileTypes={['image/*']}
      multiple={true}
      faq={faqs}
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
              preview: URL.createObjectURL(f)
            }));
          });
          setCurrentIndex(0);
        }, [file]);

        if (images.length === 0) return null;

        return (
          <div className="max-w-[1200px] mx-auto w-full p-4 lg:p-6 flex flex-col gap-5 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0">
              {/* Left Controls (Sidebar) */}
              <aside className="bg-surface border border-border rounded-2xl flex flex-col shadow-sm order-2 lg:order-1 overflow-hidden h-auto lg:h-full">
                <div className="p-5 space-y-6 overflow-y-auto scrollbar-hide flex-1">
                  <div className="space-y-4">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-text-primary">
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
                        <p className="text-sm text-text-muted mt-4 text-center">Hover over the image to pick a color, click the image to copy HEX.</p>
                      </div>
                    ) : (
                      <div className="py-12 text-text-muted text-center border-2 border-dashed border-border rounded-xl">
                        Hover over the image to pick a color
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4 border-t border-border/50 bg-bg-secondary/30">
                  <button onClick={onReset} className="btn bs w-full py-3">
                    Clear All
                  </button>
                </div>
              </aside>

              {/* Right Preview */}
              <main className="bg-surface border border-border rounded-2xl flex flex-col shadow-sm order-1 lg:order-2 overflow-hidden min-h-[400px] lg:min-h-0 h-auto lg:h-full relative p-4 gap-4">
                {/* Thumbnail Strip */}
                <div className="flex items-center gap-2 bg-bg-secondary/50 p-2 rounded-xl border border-border shadow-sm overflow-hidden shrink-0">
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
                    {images.map((img, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => {
                          setCurrentIndex(idx);
                          setColor(null);
                          setRgb(null);
                        }}
                        className={`relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${currentIndex === idx ? 'border-accent scale-105 shadow-md' : 'border-transparent hover:border-border scale-100'}`}
                      >
                        <img src={img.preview} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                          className="absolute bottom-0.5 right-0.5 bg-red-500/80 backdrop-blur-sm text-white p-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <label className="flex-shrink-0 w-12 h-12 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-0 text-text-muted hover:border-accent hover:text-accent transition-all cursor-pointer bg-surface/30">
                      <Plus className="w-4 h-4" />
                      <span className="text-[8px] font-bold uppercase mt-0.5">Add</span>
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
                  
                  <div className="flex items-center gap-1 pr-1">
                    <button 
                      onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentIndex === 0}
                      className="p-2 rounded-lg bg-surface border border-border hover:bg-bg-secondary disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setCurrentIndex(prev => Math.min(images.length - 1, prev + 1))}
                      disabled={currentIndex === images.length - 1}
                      className="p-2 rounded-lg bg-surface border border-border hover:bg-bg-secondary disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Main Working Area */}
                <div className="flex-1 relative bg-bg-secondary/30 rounded-xl overflow-hidden border border-border flex flex-col items-center justify-center p-4 shadow-inner">
                  {currentImage && (
                    <div className="w-full h-full max-h-[60vh] lg:max-h-none flex items-center justify-center overflow-auto scrollbar-hide cursor-crosshair touch-none">
                      <img 
                        ref={imgRef}
                        src={currentImage.preview} 
                        alt="Preview" 
                        onLoad={handleImageLoad}
                        onMouseMove={handleMouseMove}
                        onTouchMove={handleTouchMove}
                        onTouchStart={handleTouchMove}
                        onClick={() => color && copyToClipboard(color)}
                        className="max-w-full max-h-full object-contain shadow-sm rounded-lg" 
                      />
                      <canvas ref={canvasRef} className="hidden" />
                    </div>
                  )}
                </div>
              </main>
            </div>
          </div>
        );
      }}
    </ToolLayout>
  );
}
