import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Image as ImageIcon, X, Settings, CheckCircle2, AlertCircle, Plus, Undo, Redo, ZoomIn, ZoomOut, Move, Type, Droplet, Square, Box, Layers } from 'lucide-react';

interface SvgFile {
  id: string;
  file: File;
  name: string;
  svgContent: string;
  previewUrl: string;
  width: number;
  height: number;
  status: 'pending' | 'converting' | 'done' | 'error';
  error?: string;
}

interface EditorState {
  bgColor: string;
  isTransparent: boolean;
  shadow: {
    enabled: boolean;
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  border: {
    enabled: boolean;
    color: string;
    width: number;
  };
  watermark: {
    enabled: boolean;
    text: string;
    color: string;
    fontSize: number;
    fontFamily: string;
    x: number;
    y: number;
  };
  exportFormat: 'png' | 'jpeg' | 'webp';
  exportResolution: '1x' | '2x' | '4x' | 'custom';
  customWidth: number;
}

const initialState: EditorState = {
  bgColor: '#ffffff',
  isTransparent: true,
  shadow: { enabled: false, color: 'rgba(0,0,0,0.5)', blur: 10, offsetX: 5, offsetY: 5 },
  border: { enabled: false, color: '#000000', width: 5 },
  watermark: { enabled: false, text: 'Watermark', color: 'rgba(255,255,255,0.5)', fontSize: 48, fontFamily: 'Arial', x: 50, y: 50 },
  exportFormat: 'png',
  exportResolution: '1x',
  customWidth: 1024
};

export default function SvgToPngConverter() {
  const [files, setFiles] = useState<SvgFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  
  const [history, setHistory] = useState<EditorState[]>([initialState]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [localWatermarkPos, setLocalWatermarkPos] = useState<{x: number, y: number} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const currentState = history[historyIndex];
  const selectedFile = files.find(f => f.id === selectedFileId);

  const updateState = (newState: Partial<EditorState>) => {
    const nextState = { ...currentState, ...newState };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(nextState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) setHistoryIndex(historyIndex - 1);
  };

  const redo = () => {
    if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = async (newFiles: File[]) => {
    const svgFiles = newFiles.filter(file => file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'));
    
    if (svgFiles.length === 0) {
      alert('Please upload valid SVG files.');
      return;
    }

    const newSvgFiles: SvgFile[] = [];

    for (const file of svgFiles) {
      try {
        const text = await file.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const svgElement = doc.documentElement;
        
        if (!svgElement.hasAttribute('xmlns')) {
          svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        }
        
        let width = 512;
        let height = 512;
        
        if (svgElement.hasAttribute('width') && svgElement.hasAttribute('height')) {
          const w = svgElement.getAttribute('width');
          const h = svgElement.getAttribute('height');
          if (w && h && !w.includes('%') && !h.includes('%')) {
            width = parseFloat(w);
            height = parseFloat(h);
          } else if (svgElement.hasAttribute('viewBox')) {
            const viewBox = svgElement.getAttribute('viewBox')?.split(' ');
            if (viewBox && viewBox.length === 4) {
              width = parseFloat(viewBox[2]);
              height = parseFloat(viewBox[3]);
            }
          }
        } else if (svgElement.hasAttribute('viewBox')) {
          const viewBox = svgElement.getAttribute('viewBox')?.split(' ');
          if (viewBox && viewBox.length === 4) {
            width = parseFloat(viewBox[2]);
            height = parseFloat(viewBox[3]);
          }
        }

        if (!svgElement.hasAttribute('width')) svgElement.setAttribute('width', width.toString());
        if (!svgElement.hasAttribute('height')) svgElement.setAttribute('height', height.toString());

        const serializer = new XMLSerializer();
        const processedSvgText = serializer.serializeToString(doc);
        
        const base64 = btoa(new TextEncoder().encode(processedSvgText).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        const url = `data:image/svg+xml;base64,${base64}`;

        const newFile: SvgFile = {
          id: Math.random().toString(36).substring(7),
          file,
          name: file.name,
          svgContent: text,
          previewUrl: url,
          width,
          height,
          status: 'pending'
        };
        newSvgFiles.push(newFile);
      } catch (err) {
        console.error('Error parsing SVG:', err);
      }
    }

    setFiles(prev => {
      const updated = [...prev, ...newSvgFiles];
      if (!selectedFileId && updated.length > 0) {
        setSelectedFileId(updated[0].id);
      }
      return updated;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      if (selectedFileId === id) {
        setSelectedFileId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  };

  const clearAll = () => {
    setFiles([]);
    setSelectedFileId(null);
  };

  // Preview Canvas Interactions
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.min(Math.max(0.1, prev * zoomFactor), 5));
    }
  };

  const handlePreviewMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle click or Alt+Left click for panning
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handlePreviewMouseUp = () => {
    setIsPanning(false);
  };

  const handlePreviewTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsPanning(true);
      setPanStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
    }
  };

  const handlePreviewTouchMove = (e: React.TouchEvent) => {
    if (isPanning && e.touches.length === 1) {
      const touch = e.touches[0];
      setPan({ x: touch.clientX - panStart.x, y: touch.clientY - panStart.y });
    }
  };

  const handlePreviewTouchEnd = () => {
    setIsPanning(false);
  };

  // Text Dragging
  const handleTextMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingText(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setLocalWatermarkPos({ x: currentState.watermark.x, y: currentState.watermark.y });
  };

  const handleTextTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDraggingText(true);
      setDragStart({ x: touch.clientX, y: touch.clientY });
      setLocalWatermarkPos({ x: currentState.watermark.x, y: currentState.watermark.y });
    }
  };

  const handleTextTouchMove = (e: React.TouchEvent) => {
    if (isDraggingText && localWatermarkPos && e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = (touch.clientX - dragStart.x) / zoom;
      const dy = (touch.clientY - dragStart.y) / zoom;
      setLocalWatermarkPos({
        x: localWatermarkPos.x + dx,
        y: localWatermarkPos.y + dy
      });
      setDragStart({ x: touch.clientX, y: touch.clientY });
    }
  };

  const handleTextTouchEnd = () => {
    handleTextMouseUp();
  };

  const handleTextMouseMove = (e: React.MouseEvent) => {
    if (isDraggingText && localWatermarkPos) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;
      setLocalWatermarkPos({
        x: localWatermarkPos.x + dx,
        y: localWatermarkPos.y + dy
      });
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleTextMouseUp = () => {
    if (isDraggingText && localWatermarkPos) {
      updateState({
        watermark: {
          ...currentState.watermark,
          x: localWatermarkPos.x,
          y: localWatermarkPos.y
        }
      });
      setIsDraggingText(false);
      setLocalWatermarkPos(null);
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsPanning(false);
      if (isDraggingText) handleTextMouseUp();
    };
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingText) {
        handleTextMouseMove(e as any);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isDraggingText, localWatermarkPos, zoom, dragStart]);

  // Export Logic
  const convertSvgToImage = (svgFile: SvgFile, state: EditorState): Promise<{ dataUrl: string, filename: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('No context'));

        let targetWidth = svgFile.width;
        let targetHeight = svgFile.height;

        if (state.exportResolution === '2x') {
          targetWidth *= 2;
          targetHeight *= 2;
        } else if (state.exportResolution === '4x') {
          targetWidth *= 4;
          targetHeight *= 4;
        } else if (state.exportResolution === 'custom') {
          targetWidth = state.customWidth;
          targetHeight = (state.customWidth / svgFile.width) * svgFile.height;
        }

        const scale = targetWidth / svgFile.width;

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Background
        if (!state.isTransparent) {
          ctx.fillStyle = state.bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (state.exportFormat === 'jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Shadow
        if (state.shadow.enabled) {
          ctx.shadowColor = state.shadow.color;
          ctx.shadowBlur = state.shadow.blur * scale;
          ctx.shadowOffsetX = state.shadow.offsetX * scale;
          ctx.shadowOffsetY = state.shadow.offsetY * scale;
        }

        // Draw SVG
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Border
        if (state.border.enabled) {
          ctx.strokeStyle = state.border.color;
          ctx.lineWidth = state.border.width * scale;
          ctx.strokeRect(
            (ctx.lineWidth / 2), 
            (ctx.lineWidth / 2), 
            targetWidth - ctx.lineWidth, 
            targetHeight - ctx.lineWidth
          );
        }

        // Watermark
        if (state.watermark.enabled) {
          ctx.font = `${state.watermark.fontSize * scale}px ${state.watermark.fontFamily}`;
          ctx.fillStyle = state.watermark.color;
          ctx.textBaseline = 'top';
          ctx.fillText(state.watermark.text, state.watermark.x * scale, state.watermark.y * scale);
        }

        try {
          const mimeType = state.exportFormat === 'jpeg' ? 'image/jpeg' : 
                           state.exportFormat === 'webp' ? 'image/webp' : 'image/png';
          const dataUrl = canvas.toDataURL(mimeType, 0.92);
          const ext = state.exportFormat === 'jpeg' ? 'jpg' : state.exportFormat;
          resolve({ dataUrl, filename: svgFile.name.replace(/\.svg$/i, `.${ext}`) });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to load SVG'));
      img.src = svgFile.previewUrl;
    });
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConvertAll = async () => {
    if (files.length === 0) return;
    setIsConverting(true);
    
    const updatedFiles = [...files];
    
    for (let i = 0; i < updatedFiles.length; i++) {
      updatedFiles[i].status = 'converting';
      setFiles([...updatedFiles]);
      
      try {
        const { dataUrl, filename } = await convertSvgToImage(updatedFiles[i], currentState);
        downloadImage(dataUrl, filename);
        updatedFiles[i].status = 'done';
      } catch (error) {
        updatedFiles[i].status = 'error';
        updatedFiles[i].error = error instanceof Error ? error.message : 'Unknown error';
      }
      setFiles([...updatedFiles]);
    }
    setIsConverting(false);
  };

  const handleConvertSingle = async (id: string) => {
    const fileIndex = files.findIndex(f => f.id === id);
    if (fileIndex === -1) return;
    
    const updatedFiles = [...files];
    updatedFiles[fileIndex].status = 'converting';
    setFiles([...updatedFiles]);
    
    try {
      const { dataUrl, filename } = await convertSvgToImage(updatedFiles[fileIndex], currentState);
      downloadImage(dataUrl, filename);
      updatedFiles[fileIndex].status = 'done';
    } catch (error) {
      updatedFiles[fileIndex].status = 'error';
      updatedFiles[fileIndex].error = error instanceof Error ? error.message : 'Unknown error';
    }
    setFiles([...updatedFiles]);
  };

  if (files.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="bg-bg-surface border border-border rounded-2xl p-6 sm:p-12 shadow-sm text-center">
          <div className="w-20 h-20 bg-accent/10 text-accent rounded-full flex items-center justify-center mx-auto mb-6">
            <ImageIcon className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Advanced SVG to PNG Converter</h2>
          <p className="text-text-muted mb-8 max-w-lg mx-auto">
            Convert, edit, and customize SVG files. Add watermarks, shadows, borders, and export to PNG, JPG, or WebP in high resolution.
          </p>
          
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-200 ${
              isDragging 
                ? 'border-accent bg-accent/5 scale-[1.02]' 
                : 'border-border hover:border-accent/50 hover:bg-bg-secondary'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".svg,image/svg+xml"
              multiple
              className="hidden"
            />
            <Upload className="w-8 h-8 text-text-muted mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Drag & Drop SVG Files</h3>
            <p className="text-text-muted text-sm">or click to browse from your device</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1920px] mx-auto p-4 lg:h-[85vh] lg:min-h-[800px] flex flex-col">
      {/* Top Bar */}
      <div className="bg-bg-surface border border-border rounded-xl p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <h2 className="font-bold text-lg hidden sm:block">SVG Editor</h2>
          <div className="flex items-center gap-2 bg-bg-secondary rounded-lg p-1">
            <button 
              onClick={undo} 
              disabled={historyIndex === 0}
              className="p-2 rounded hover:bg-bg-surface disabled:opacity-50 transition-colors"
              title="Undo"
            >
              <Undo className="w-4 h-4" />
            </button>
            <button 
              onClick={redo} 
              disabled={historyIndex === history.length - 1}
              className="p-2 rounded hover:bg-bg-surface disabled:opacity-50 transition-colors"
              title="Redo"
            >
              <Redo className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 bg-bg-secondary rounded-lg p-1">
            <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} className="p-2 rounded hover:bg-bg-surface"><ZoomOut className="w-4 h-4" /></button>
            <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(5, z + 0.1))} className="p-2 rounded hover:bg-bg-surface"><ZoomIn className="w-4 h-4" /></button>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
          <button onClick={clearAll} className="text-sm font-medium text-text-muted hover:text-red-500 transition-colors">
            Clear All
          </button>
          <button 
            onClick={handleConvertAll}
            disabled={isConverting}
            className="btn bp py-2 px-6 flex items-center gap-2 flex-1 sm:flex-none justify-center"
          >
            {isConverting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Exporting...
              </span>
            ) : (
              <>
                <Download className="w-4 h-4" /> Export All
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Left Sidebar - File List */}
        <div className="w-full lg:w-56 bg-bg-surface border border-border rounded-xl flex flex-col shadow-sm shrink-0 overflow-hidden max-h-[30vh] lg:max-h-none">
          <div className="p-3 border-b border-border flex items-center justify-between bg-bg-secondary/50">
            <h3 className="font-bold text-xs">Files ({files.length})</h3>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-1 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors"
              title="Add more files"
            >
              <Plus className="w-3 h-3" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".svg,image/svg+xml"
              multiple
              className="hidden"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
            {files.map(file => (
              <div 
                key={file.id}
                onClick={() => setSelectedFileId(file.id)}
                className={`p-1.5 rounded-lg border cursor-pointer flex items-center gap-2 transition-colors group ${
                  selectedFileId === file.id 
                    ? 'border-accent bg-accent/5' 
                    : 'border-transparent hover:bg-bg-secondary'
                }`}
              >
                <div className="w-9 h-9 rounded bg-bg-surface border border-border flex items-center justify-center shrink-0 checkerboard-bg overflow-hidden">
                  <img src={file.previewUrl} alt="" className="max-w-full max-h-full object-contain p-0.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{file.name}</p>
                  <p className="text-[10px] text-text-muted">{file.width}x{file.height}</p>
                </div>
                <button 
                  onClick={(e) => removeFile(file.id, e)}
                  className="p-1 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Center - Live Preview */}
        <div className="flex-1 bg-bg-secondary border border-border rounded-xl overflow-hidden relative shadow-inner flex items-center justify-center min-h-[400px] lg:min-h-0 touch-none"
             ref={previewContainerRef}
             onWheel={handleWheel}
             onMouseDown={handlePreviewMouseDown}
             onMouseMove={handlePreviewMouseMove}
             onMouseUp={handlePreviewMouseUp}
             onMouseLeave={handlePreviewMouseUp}
             onTouchStart={handlePreviewTouchStart}
             onTouchMove={handlePreviewTouchMove}
             onTouchEnd={handlePreviewTouchEnd}>
          
          {selectedFile ? (
            <div 
              className="relative transition-transform duration-75"
              style={{ 
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                cursor: isPanning ? 'grabbing' : 'grab'
              }}
            >
              {/* Background */}
              <div 
                className="absolute inset-0 shadow-sm"
                style={{
                  backgroundColor: currentState.isTransparent ? 'transparent' : currentState.bgColor,
                  backgroundImage: currentState.isTransparent ? `
                    linear-gradient(45deg, #e5e5e5 25%, transparent 25%),
                    linear-gradient(-45deg, #e5e5e5 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #e5e5e5 75%),
                    linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)
                  ` : 'none',
                  backgroundSize: '20px 20px',
                  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                }}
              />
              
              {/* SVG Image */}
              <img 
                src={selectedFile.previewUrl} 
                alt="Preview" 
                className="relative z-10 pointer-events-none"
                style={{
                  width: selectedFile.width,
                  height: selectedFile.height,
                  filter: currentState.shadow.enabled ? `drop-shadow(${currentState.shadow.offsetX}px ${currentState.shadow.offsetY}px ${currentState.shadow.blur}px ${currentState.shadow.color})` : 'none',
                  border: currentState.border.enabled ? `${currentState.border.width}px solid ${currentState.border.color}` : 'none',
                  boxSizing: 'border-box'
                }}
              />

              {/* Watermark */}
              {currentState.watermark.enabled && (
                <div 
                  className="absolute z-20 cursor-move hover:outline hover:outline-2 hover:outline-accent/50 p-1"
                  style={{
                    left: (localWatermarkPos ? localWatermarkPos.x : currentState.watermark.x),
                    top: (localWatermarkPos ? localWatermarkPos.y : currentState.watermark.y),
                    color: currentState.watermark.color,
                    fontSize: `${currentState.watermark.fontSize}px`,
                    fontFamily: currentState.watermark.fontFamily,
                    whiteSpace: 'nowrap',
                    userSelect: 'none'
                  }}
                  onMouseDown={handleTextMouseDown}
                  onTouchStart={handleTextTouchStart}
                  onTouchMove={handleTextTouchMove}
                  onTouchEnd={handleTextTouchEnd}
                >
                  {currentState.watermark.text}
                </div>
              )}
            </div>
          ) : (
            <div className="text-text-muted flex flex-col items-center">
              <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
              <p>Select a file to preview</p>
            </div>
          )}
          
          {/* Instructions overlay */}
          <div className="absolute bottom-4 left-4 bg-bg-surface/80 backdrop-blur text-xs px-3 py-2 rounded-lg border border-border text-text-secondary pointer-events-none">
            <p><strong>Ctrl + Scroll:</strong> Zoom</p>
            <p><strong>Alt + Drag:</strong> Pan canvas</p>
            {currentState.watermark.enabled && <p><strong>Drag text:</strong> Move watermark</p>}
          </div>
        </div>

        {/* Right Sidebar - Controls */}
        <div className="w-full lg:w-80 bg-bg-surface border border-border rounded-xl shadow-sm shrink-0 overflow-y-auto max-h-[50vh] lg:max-h-none">
          <div className="p-4 border-b border-border bg-bg-secondary/50 sticky top-0 z-10">
            <h3 className="font-bold text-sm flex items-center gap-2"><Settings className="w-4 h-4" /> Customization</h3>
          </div>
          
          <div className="p-4 space-y-6">
            {/* Background Settings */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2"><Droplet className="w-3 h-3" /> Background</h4>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={currentState.isTransparent}
                    onChange={(e) => updateState({ isTransparent: e.target.checked })}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  Transparent
                </label>
              </div>
              {!currentState.isTransparent && (
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={currentState.bgColor}
                    onChange={(e) => updateState({ bgColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <span className="text-sm font-mono">{currentState.bgColor}</span>
                </div>
              )}
            </div>

            <hr className="border-border" />

            {/* Shadow Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2"><Layers className="w-3 h-3" /> Shadow</h4>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={currentState.shadow.enabled} onChange={(e) => updateState({ shadow: { ...currentState.shadow, enabled: e.target.checked } })} />
                  <div className="w-9 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>
              
              {currentState.shadow.enabled && (
                <div className="space-y-3 bg-bg-secondary p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <input type="color" value={currentState.shadow.color} onChange={(e) => updateState({ shadow: { ...currentState.shadow, color: e.target.value } })} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                    <span className="text-xs">Color</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span>Blur</span><span>{currentState.shadow.blur}px</span></div>
                    <input type="range" min="0" max="50" value={currentState.shadow.blur} onChange={(e) => updateState({ shadow: { ...currentState.shadow, blur: parseInt(e.target.value) } })} className="w-full accent-accent" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs text-text-muted block mb-1">Offset X</span>
                      <input type="number" value={currentState.shadow.offsetX} onChange={(e) => updateState({ shadow: { ...currentState.shadow, offsetX: parseInt(e.target.value) } })} className="w-full bg-bg-surface border border-border rounded px-2 py-1 text-sm" />
                    </div>
                    <div>
                      <span className="text-xs text-text-muted block mb-1">Offset Y</span>
                      <input type="number" value={currentState.shadow.offsetY} onChange={(e) => updateState({ shadow: { ...currentState.shadow, offsetY: parseInt(e.target.value) } })} className="w-full bg-bg-surface border border-border rounded px-2 py-1 text-sm" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <hr className="border-border" />

            {/* Border Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2"><Square className="w-3 h-3" /> Border</h4>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={currentState.border.enabled} onChange={(e) => updateState({ border: { ...currentState.border, enabled: e.target.checked } })} />
                  <div className="w-9 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>
              
              {currentState.border.enabled && (
                <div className="space-y-3 bg-bg-secondary p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <input type="color" value={currentState.border.color} onChange={(e) => updateState({ border: { ...currentState.border, color: e.target.value } })} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                    <span className="text-xs">Color</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span>Width</span><span>{currentState.border.width}px</span></div>
                    <input type="range" min="1" max="50" value={currentState.border.width} onChange={(e) => updateState({ border: { ...currentState.border, width: parseInt(e.target.value) } })} className="w-full accent-accent" />
                  </div>
                </div>
              )}
            </div>

            <hr className="border-border" />

            {/* Watermark Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2"><Type className="w-3 h-3" /> Watermark</h4>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={currentState.watermark.enabled} onChange={(e) => updateState({ watermark: { ...currentState.watermark, enabled: e.target.checked } })} />
                  <div className="w-9 h-5 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>
              
              {currentState.watermark.enabled && (
                <div className="space-y-3 bg-bg-secondary p-3 rounded-lg border border-border">
                  <input 
                    type="text" 
                    value={currentState.watermark.text}
                    onChange={(e) => updateState({ watermark: { ...currentState.watermark, text: e.target.value } })}
                    className="w-full bg-bg-surface border border-border rounded px-3 py-2 text-sm"
                    placeholder="Watermark text"
                  />
                  <div className="flex items-center gap-3">
                    <input type="color" value={currentState.watermark.color.length === 7 ? currentState.watermark.color : '#ffffff'} onChange={(e) => updateState({ watermark: { ...currentState.watermark, color: e.target.value } })} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                    <span className="text-xs">Color</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span>Font Size</span><span>{currentState.watermark.fontSize}px</span></div>
                    <input type="range" min="10" max="200" value={currentState.watermark.fontSize} onChange={(e) => updateState({ watermark: { ...currentState.watermark, fontSize: parseInt(e.target.value) } })} className="w-full accent-accent" />
                  </div>
                  <div>
                    <span className="text-xs text-text-muted block mb-1">Font Family</span>
                    <select 
                      value={currentState.watermark.fontFamily}
                      onChange={(e) => updateState({ watermark: { ...currentState.watermark, fontFamily: e.target.value } })}
                      className="w-full bg-bg-surface border border-border rounded px-2 py-1.5 text-sm"
                    >
                      <option value="Arial">Arial</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Impact">Impact</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs text-text-muted block mb-1">Pos X</span>
                      <input type="number" value={Math.round(currentState.watermark.x)} onChange={(e) => updateState({ watermark: { ...currentState.watermark, x: parseInt(e.target.value) } })} className="w-full bg-bg-surface border border-border rounded px-2 py-1 text-sm" />
                    </div>
                    <div>
                      <span className="text-xs text-text-muted block mb-1">Pos Y</span>
                      <input type="number" value={Math.round(currentState.watermark.y)} onChange={(e) => updateState({ watermark: { ...currentState.watermark, y: parseInt(e.target.value) } })} className="w-full bg-bg-surface border border-border rounded px-2 py-1 text-sm" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <hr className="border-border" />

            {/* Export Settings */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2"><Download className="w-3 h-3" /> Export Settings</h4>
              
              <div>
                <span className="text-xs text-text-muted block mb-2">Format</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => updateState({ exportFormat: fmt })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors uppercase ${
                        currentState.exportFormat === fmt 
                          ? 'border-accent bg-accent/5 text-accent' 
                          : 'border-border hover:border-accent/50 text-text-secondary'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs text-text-muted block mb-2">Resolution</span>
                <div className="grid grid-cols-4 gap-2">
                  {(['1x', '2x', '4x', 'custom'] as const).map((res) => (
                    <button
                      key={res}
                      onClick={() => updateState({ exportResolution: res })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                        currentState.exportResolution === res 
                          ? 'border-accent bg-accent/5 text-accent' 
                          : 'border-border hover:border-accent/50 text-text-secondary'
                      }`}
                    >
                      {res === '1x' ? 'Orig' : res === '2x' ? 'HD' : res === '4x' ? '4K' : 'Cust'}
                    </button>
                  ))}
                </div>
              </div>

              {currentState.exportResolution === 'custom' && (
                <div>
                  <span className="text-xs text-text-muted block mb-1">Custom Width (px)</span>
                  <input 
                    type="number" 
                    value={currentState.customWidth} 
                    onChange={(e) => updateState({ customWidth: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full bg-bg-surface border border-border rounded px-3 py-2 text-sm"
                  />
                  <p className="text-[10px] text-text-muted mt-1">Height will be calculated automatically to maintain aspect ratio.</p>
                </div>
              )}
              
              <button 
                onClick={() => selectedFile && handleConvertSingle(selectedFile.id)}
                disabled={!selectedFile || isConverting}
                className="w-full btn bp py-2 text-sm flex items-center justify-center gap-2 mt-4"
              >
                <Download className="w-4 h-4" /> Export Current
              </button>
            </div>

          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .checkerboard-bg {
          background-image: linear-gradient(45deg, #e5e5e5 25%, transparent 25%),
            linear-gradient(-45deg, #e5e5e5 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #e5e5e5 75%),
            linear-gradient(-45deg, transparent 75%, #e5e5e5 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        }
        .dark .checkerboard-bg {
          background-image: linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
            linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
            linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
        }
      `}} />
    </div>
  );
}
