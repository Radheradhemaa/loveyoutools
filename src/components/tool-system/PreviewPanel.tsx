import React, { useState, useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize, Minimize, FileText, ImageIcon, FileCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PreviewPanelProps {
  file: File | File[] | null;
  type?: 'image' | 'pdf' | 'doc';
}

export default function PreviewPanel({ file, type }: PreviewPanelProps) {
  const [zoom, setZoom] = useState(0.5);
  const [isFitToScreen, setIsFitToScreen] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!file || Array.isArray(file)) return;
    
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const detectedType = type || (file && !Array.isArray(file) ? 
    (file.type.startsWith('image/') ? 'image' : 
     file.type === 'application/pdf' ? 'pdf' : 'doc') : 'doc');

  const handleZoomIn = () => {
    setIsFitToScreen(false);
    setZoom((prev) => Math.min(3, Math.round((prev + 0.25) * 100) / 100));
  };
  const handleZoomOut = () => {
    setIsFitToScreen(false);
    setZoom((prev) => Math.max(0.25, Math.round((prev - 0.25) * 100) / 100));
  };
  const resetZoom = () => {
    setIsFitToScreen(false);
    setZoom(1.0);
  };
  const toggleFit = () => {
    setIsFitToScreen(!isFitToScreen);
    if (!isFitToScreen) setZoom(1.0);
  };

  if (!file) return null;

  return (
    <div className="w-full h-full flex flex-col relative bg-bg-secondary/30">
      {/* Zoom Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2 px-4 py-2 bg-surface/90 backdrop-blur-md border border-border rounded-2xl shadow-2xl">
        <button onClick={handleZoomOut} className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary cursor-pointer" title="Zoom Out">
          <ZoomOut className="w-5 h-5" />
        </button>
        <button onClick={resetZoom} className="text-xs font-black w-14 text-center text-text-primary hover:text-accent transition-colors cursor-pointer" title="Click to reset to 100% Zoom">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={handleZoomIn} className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary cursor-pointer" title="Zoom In">
          <ZoomIn className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <button onClick={toggleFit} className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary cursor-pointer" title={isFitToScreen ? "Free Zoom Mode" : "Fit to Screen"}>
          {isFitToScreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-auto p-4 sm:p-8 custom-scrollbar"
      >
        <div className="w-max min-w-full min-h-full flex flex-col items-center justify-start py-6 px-4">
          <AnimatePresence mode="wait">
            {detectedType === 'image' && previewUrl && (
              <motion.div
                key="image-preview"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative shadow-2xl rounded-2xl overflow-hidden bg-white flex items-center justify-center shrink-0 transition-all duration-200"
                style={{ 
                  width: isFitToScreen ? 'auto' : `${Math.round(800 * zoom)}px`,
                  maxWidth: isFitToScreen ? 'min(90vw, 850px)' : 'none',
                  maxHeight: isFitToScreen ? 'min(80vh, 850px)' : 'none',
                }}
              >
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="block object-contain w-full h-full"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            )}

            {detectedType === 'pdf' && previewUrl && (
              <motion.div
                key="pdf-preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white shadow-2xl rounded-2xl overflow-hidden border border-border shrink-0 transition-all duration-200"
                style={{ 
                  width: isFitToScreen ? 'min(90vw, 850px)' : `${Math.round(850 * zoom)}px`,
                  height: isFitToScreen ? 'min(80vh, 1100px)' : `${Math.round(1100 * zoom)}px`,
                  maxWidth: isFitToScreen ? '100%' : 'none',
                }}
              >
                <iframe 
                  src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1`} 
                  className="w-full h-full border-0"
                  title="PDF Preview"
                />
              </motion.div>
            )}

            {detectedType === 'doc' && (
              <motion.div
                key="doc-preview"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white shadow-2xl rounded-2xl p-12 sm:p-20 overflow-y-auto border border-border shrink-0 transition-all duration-200"
                style={{ 
                  width: isFitToScreen ? 'min(90vw, 800px)' : `${Math.round(800 * zoom)}px`,
                  maxWidth: isFitToScreen ? '100%' : 'none',
                }}
              >
                <div className="prose prose-slate max-w-none">
                  <div className="flex items-center gap-4 mb-8 pb-8 border-b border-border">
                    <div className="w-16 h-16 bg-accent/10 text-accent rounded-2xl flex items-center justify-center">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-text-primary m-0">
                        {Array.isArray(file) ? `${file.length} Files Selected` : file.name}
                      </h2>
                      <p className="text-text-muted m-0 text-sm">
                        {Array.isArray(file) ? 'Batch processing mode' : `${(file.size / 1024).toFixed(1)} KB • ${file.type}`}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="h-4 bg-bg-secondary rounded-full w-3/4" />
                    <div className="h-4 bg-bg-secondary rounded-full w-full" />
                    <div className="h-4 bg-bg-secondary rounded-full w-5/6" />
                    <div className="h-4 bg-bg-secondary rounded-full w-2/3" />
                    <div className="h-4 bg-bg-secondary rounded-full w-full mt-12" />
                    <div className="h-4 bg-bg-secondary rounded-full w-4/5" />
                  </div>
                  
                  <div className="mt-20 p-8 border-2 border-dashed border-border rounded-3xl text-center">
                    <FileCode className="w-12 h-12 text-accent/30 mx-auto mb-4" />
                    <p className="text-text-muted font-medium">Document content preview is being processed...</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
