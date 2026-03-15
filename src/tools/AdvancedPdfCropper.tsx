import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, ZoomIn, ZoomOut, Maximize, FileUp, Settings, ChevronLeft, ChevronRight, RotateCw, Crop, Trash2, CheckSquare, Square, SplitSquareHorizontal, ArrowRight, Layers, Lock, Unlock, Zap, FileText } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument, degrees } from 'pdf-lib';
import JSZip from 'jszip';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageData {
  viewport: pdfjs.PageViewport;
  cropBox: CropBox;
  rotation: number;
}

export default function AdvancedPdfCropper() {
  const [files, setFiles] = useState<File[]>([]);
  const [currentFileIdx, setCurrentFileIdx] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const [needsPasswordForFile, setNeedsPasswordForFile] = useState<number | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwords, setPasswords] = useState<Record<number, string>>({});
  
  // Store crop data per file and page
  // Key format: `${fileIdx}-${pageNum}`
  const [pagesData, setPagesData] = useState<Record<string, PageData>>({});
  
  const [applyToAll, setApplyToAll] = useState(true);
  const [aspectRatioLock, setAspectRatioLock] = useState(false);
  const [customWidth, setCustomWidth] = useState<number | ''>('');
  const [customHeight, setCustomHeight] = useState<number | ''>('');
  const [unit, setUnit] = useState<'px' | 'mm' | 'inch'>('px');
  
  const [isDragging, setIsDragging] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCropBox, setInitialCropBox] = useState<CropBox | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf');
    if (pdfFiles.length > 0) {
      setFiles(prev => [...prev, ...pdfFiles]);
      if (!pdfDoc) {
        await loadPdf(pdfFiles[0], 0);
      }
    }
  };

  const loadPdf = async (file: File, fileIdx: number, pwd?: string) => {
    setLoading(true);
    setNeedsPasswordForFile(null);
    setPasswordError('');
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({
        data: arrayBuffer,
        password: pwd,
      });

      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setCurrentFileIdx(fileIdx);
      setPageNum(1);
      
      if (pwd) {
        setPasswords(prev => ({ ...prev, [fileIdx]: pwd }));
      }
      
      // Initialize page data if not exists
      const newPagesData = { ...pagesData };
      for (let i = 1; i <= pdf.numPages; i++) {
        const key = `${fileIdx}-${i}`;
        if (!newPagesData[key]) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          newPagesData[key] = {
            viewport,
            cropBox: { x: 0, y: 0, width: viewport.width, height: viewport.height },
            rotation: 0
          };
        }
      }
      setPagesData(newPagesData);
    } catch (error: any) {
      console.error('Error loading PDF:', error);
      if (error.name === 'PasswordException') {
        setNeedsPasswordForFile(fileIdx);
        if (pwd) setPasswordError('Incorrect password');
      } else {
        alert('Error loading PDF. Please try another file.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getCurrentPageData = () => {
    return pagesData[`${currentFileIdx}-${pageNum}`];
  };

  const updateCurrentPageData = (updates: Partial<PageData>) => {
    const key = `${currentFileIdx}-${pageNum}`;
    const currentData = pagesData[key];
    if (!currentData) return;

    const newData = { ...currentData, ...updates };
    
    setPagesData(prev => {
      const next = { ...prev, [key]: newData };
      
      if (applyToAll && updates.cropBox) {
        // Apply proportional crop to all pages in all files
        const refWidth = currentData.viewport.width;
        const refHeight = currentData.viewport.height;
        const rx = updates.cropBox.x / refWidth;
        const ry = updates.cropBox.y / refHeight;
        const rw = updates.cropBox.width / refWidth;
        const rh = updates.cropBox.height / refHeight;

        Object.keys(next).forEach(k => {
          if (k !== key) {
            const vp = next[k].viewport;
            next[k] = {
              ...next[k],
              cropBox: {
                x: vp.width * rx,
                y: vp.height * ry,
                width: vp.width * rw,
                height: vp.height * rh
              }
            };
          }
        });
      }
      return next;
    });
  };

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    const pageData = getCurrentPageData();
    if (!pageData) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoom, rotation: pageData.rotation });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      renderTaskRef.current = page.render({
        canvasContext: context,
        viewport: viewport,
      });
      await renderTaskRef.current.promise;
    } catch (error: any) {
      if (error.name !== 'RenderingCancelledException') {
        console.error('Error rendering page:', error);
      }
    }
  }, [pdfDoc, pageNum, zoom, pagesData, currentFileIdx]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Auto detect margins (simplified version by analyzing canvas pixels)
  const autoDetectMargins = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    let top = 0, bottom = height, left = 0, right = width;

    const isWhite = (r: number, g: number, b: number, a: number) => {
      return (r > 240 && g > 240 && b > 240) || a < 10;
    };

    // Find top
    for (let y = 0; y < height; y++) {
      let rowIsWhite = true;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (!isWhite(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
          rowIsWhite = false;
          break;
        }
      }
      if (!rowIsWhite) { top = y; break; }
    }

    // Find bottom
    for (let y = height - 1; y >= 0; y--) {
      let rowIsWhite = true;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (!isWhite(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
          rowIsWhite = false;
          break;
        }
      }
      if (!rowIsWhite) { bottom = y; break; }
    }

    // Find left
    for (let x = 0; x < width; x++) {
      let colIsWhite = true;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        if (!isWhite(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
          colIsWhite = false;
          break;
        }
      }
      if (!colIsWhite) { left = x; break; }
    }

    // Find right
    for (let x = width - 1; x >= 0; x--) {
      let colIsWhite = true;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        if (!isWhite(data[idx], data[idx+1], data[idx+2], data[idx+3])) {
          colIsWhite = false;
          break;
        }
      }
      if (!colIsWhite) { right = x; break; }
    }

    // Add padding
    const padding = 20 * zoom;
    top = Math.max(0, top - padding);
    bottom = Math.min(height, bottom + padding);
    left = Math.max(0, left - padding);
    right = Math.min(width, right + padding);

    updateCurrentPageData({
      cropBox: {
        x: left / zoom,
        y: top / zoom,
        width: (right - left) / zoom,
        height: (bottom - top) / zoom
      }
    });
  };

  const handleMouseDown = (e: React.MouseEvent, handle: string | null) => {
    e.preventDefault();
    setIsDragging(true);
    setResizeHandle(handle);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialCropBox({ ...getCurrentPageData().cropBox });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !initialCropBox) return;

    const dx = (e.clientX - dragStart.x) / zoom;
    const dy = (e.clientY - dragStart.y) / zoom;
    const pageData = getCurrentPageData();
    const maxWidth = pageData.viewport.width;
    const maxHeight = pageData.viewport.height;

    let newBox = { ...initialCropBox };

    if (resizeHandle === 'move') {
      newBox.x = Math.max(0, Math.min(maxWidth - newBox.width, initialCropBox.x + dx));
      newBox.y = Math.max(0, Math.min(maxHeight - newBox.height, initialCropBox.y + dy));
    } else if (resizeHandle) {
      if (resizeHandle.includes('w')) {
        const newX = Math.max(0, Math.min(initialCropBox.x + initialCropBox.width - 10, initialCropBox.x + dx));
        newBox.width = initialCropBox.width + (initialCropBox.x - newX);
        newBox.x = newX;
      }
      if (resizeHandle.includes('e')) {
        newBox.width = Math.max(10, Math.min(maxWidth - initialCropBox.x, initialCropBox.width + dx));
      }
      if (resizeHandle.includes('n')) {
        const newY = Math.max(0, Math.min(initialCropBox.y + initialCropBox.height - 10, initialCropBox.y + dy));
        newBox.height = initialCropBox.height + (initialCropBox.y - newY);
        newBox.y = newY;
      }
      if (resizeHandle.includes('s')) {
        newBox.height = Math.max(10, Math.min(maxHeight - initialCropBox.y, initialCropBox.height + dy));
      }

      if (aspectRatioLock) {
        const ratio = initialCropBox.width / initialCropBox.height;
        if (resizeHandle.includes('e') || resizeHandle.includes('w')) {
          newBox.height = newBox.width / ratio;
          if (resizeHandle.includes('n')) newBox.y = initialCropBox.y + (initialCropBox.height - newBox.height);
        } else {
          newBox.width = newBox.height * ratio;
          if (resizeHandle.includes('w')) newBox.x = initialCropBox.x + (initialCropBox.width - newBox.width);
        }
      }
    }

    updateCurrentPageData({ cropBox: newBox });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setResizeHandle(null);
  };

  // Keyboard nudge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const pageData = getCurrentPageData();
      if (!pageData) return;
      
      const step = e.shiftKey ? 10 : 1;
      let { x, y, width, height } = pageData.cropBox;
      let changed = false;

      if (e.key === 'ArrowUp') { y -= step; changed = true; }
      if (e.key === 'ArrowDown') { y += step; changed = true; }
      if (e.key === 'ArrowLeft') { x -= step; changed = true; }
      if (e.key === 'ArrowRight') { x += step; changed = true; }

      if (changed) {
        e.preventDefault();
        x = Math.max(0, Math.min(pageData.viewport.width - width, x));
        y = Math.max(0, Math.min(pageData.viewport.height - height, y));
        updateCurrentPageData({ cropBox: { x, y, width, height } });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFileIdx, pageNum, pagesData]);

  const exportPdfs = async () => {
    if (files.length === 0) return;
    setLoading(true);

    try {
      const zip = new JSZip();

      for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const file = files[fIdx];
        const arrayBuffer = await file.arrayBuffer();
        const pwd = passwords[fIdx];
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pages = pdfDoc.getPages();

        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          const pageData = pagesData[`${fIdx}-${pIdx + 1}`];
          if (!pageData) continue;

          const page = pages[pIdx];
          const { width, height } = page.getSize();
          
          // Convert crop box from viewport coordinates to PDF coordinates
          // PDF coordinates start from bottom-left, viewport from top-left
          const { x, y, width: cw, height: ch } = pageData.cropBox;
          
          const pdfX = x;
          const pdfY = height - y - ch;
          
          page.setCropBox(pdfX, pdfY, cw, ch);
          page.setMediaBox(pdfX, pdfY, cw, ch);
          
          if (pageData.rotation !== 0) {
            page.setRotation(degrees(page.getRotation().angle + pageData.rotation));
          }
        }

        const pdfBytes = await pdfDoc.save();
        
        if (files.length === 1) {
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `cropped_${file.name}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          zip.file(`cropped_${file.name}`, pdfBytes);
        }
      }

      if (files.length > 1) {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cropped_pdfs.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error: any) {
      console.error('Error exporting PDFs:', error);
      if (error.message?.includes('encrypted')) {
        alert('Cannot export this PDF because it is encrypted with a user password. Please remove the password first.');
      } else {
        alert('Error exporting PDFs. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: string) => {
    const pageData = getCurrentPageData();
    if (!pageData) return;
    const { width, height } = pageData.viewport;

    let newBox = { ...pageData.cropBox };

    switch (preset) {
      case 'reset':
        newBox = { x: 0, y: 0, width, height };
        break;
      case 'center':
        newBox = { x: width * 0.1, y: height * 0.1, width: width * 0.8, height: height * 0.8 };
        break;
      case 'split-left':
        newBox = { x: 0, y: 0, width: width / 2, height };
        break;
      case 'split-right':
        newBox = { x: width / 2, y: 0, width: width / 2, height };
        break;
      case 'safe-area':
        newBox = { x: width * 0.05, y: height * 0.05, width: width * 0.9, height: height * 0.9 };
        break;
    }

    updateCurrentPageData({ cropBox: newBox });
  };

  const pageData = getCurrentPageData();

  if (needsPasswordForFile !== null) {
    return (
      <div className="max-w-md mx-auto mt-20 bg-surface border border-border rounded-2xl p-8 shadow-sm">
        <h2 className="text-2xl font-bold mb-4">Password Protected</h2>
        <p className="text-text-secondary mb-6">
          The file "{files[needsPasswordForFile]?.name}" requires a password to open.
        </p>
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordInput) {
              loadPdf(files[needsPasswordForFile], needsPasswordForFile, passwordInput);
            }
          }} 
          className="space-y-4"
        >
          <div>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter PDF password"
              className="fi w-full"
              autoFocus
            />
            {passwordError && <p className="text-error text-sm mt-1">{passwordError}</p>}
          </div>
          <div className="flex gap-2">
            <button 
              type="button" 
              onClick={() => {
                // Remove the file that needs password
                const newFiles = [...files];
                newFiles.splice(needsPasswordForFile, 1);
                setFiles(newFiles);
                setNeedsPasswordForFile(null);
                setPasswordInput('');
                setPasswordError('');
                
                // Load previous file if exists
                if (newFiles.length > 0) {
                  const newIdx = Math.max(0, needsPasswordForFile - 1);
                  loadPdf(newFiles[newIdx], newIdx);
                }
              }} 
              className="btn bs flex-1"
            >
              Cancel
            </button>
            <button type="submit" className="btn bp flex-1" disabled={loading}>
              {loading ? 'Opening...' : 'Unlock PDF'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-text-primary mb-4">Advanced PDF Cropper</h2>
          <p className="text-text-secondary">Crop PDF margins, change page size, and batch process multiple files with pixel precision.</p>
        </div>

        <div className="bg-surface border-2 border-dashed border-border rounded-2xl p-12 text-center hover:border-accent transition-colors">
          <Crop className="w-12 h-12 text-accent mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Upload PDF Documents</h3>
          <p className="text-text-secondary mb-6">Drag and drop your PDFs here, or click to browse</p>
          <label className="btn bp cursor-pointer inline-flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Select PDF Files
            <input 
              type="file" 
              className="hidden" 
              accept=".pdf"
              multiple
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[850px] bg-bg-secondary rounded-[14px] border border-border overflow-hidden">
      {/* Top Toolbar */}
      <div className="bg-surface border-b border-border p-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="btn bs text-sm py-1.5 cursor-pointer flex items-center gap-2">
              <FileUp size={16} /> Add More
              <input type="file" className="hidden" accept=".pdf" multiple onChange={handleFileUpload} />
            </label>
            {files.length > 1 && (
              <select 
                className="fi text-sm py-1.5"
                value={currentFileIdx}
                onChange={(e) => {
                  setCurrentFileIdx(Number(e.target.value));
                  setPageNum(1);
                  loadPdf(files[Number(e.target.value)], Number(e.target.value));
                }}
              >
                {files.map((f, i) => (
                  <option key={i} value={i}>{f.name}</option>
                ))}
              </select>
            )}
          </div>
          
          <div className="h-6 w-px bg-border"></div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setPageNum(Math.max(1, pageNum - 1))}
              disabled={pageNum <= 1}
              className="p-1.5 hover:bg-bg-secondary rounded disabled:opacity-50"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium w-24 text-center">Page {pageNum} of {numPages}</span>
            <button 
              onClick={() => setPageNum(Math.min(numPages, pageNum + 1))}
              disabled={pageNum >= numPages}
              className="p-1.5 hover:bg-bg-secondary rounded disabled:opacity-50"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="h-6 w-px bg-border"></div>

          <div className="flex items-center gap-2">
            <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} className="p-1.5 hover:bg-bg-secondary rounded">
              <ZoomOut size={18} />
            </button>
            <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-1.5 hover:bg-bg-secondary rounded">
              <ZoomIn size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input 
              type="checkbox" 
              checked={applyToAll} 
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent"
            />
            Apply to all pages
          </label>
          <button onClick={exportPdfs} className="btn bp text-sm py-1.5 flex items-center gap-2" disabled={loading}>
            {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> : <Download size={16} />}
            {files.length > 1 ? 'Export All PDFs' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Tools */}
        <div className="w-64 bg-surface border-r border-border p-4 overflow-y-auto space-y-6">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
              <Zap size={14} /> Smart Actions
            </h3>
            <div className="space-y-2">
              <button onClick={autoDetectMargins} className="w-full btn bs text-sm py-2 flex items-center justify-center gap-2">
                <Maximize size={16} /> Auto Detect Margins
              </button>
              <button onClick={() => applyPreset('reset')} className="w-full btn bs text-sm py-2 flex items-center justify-center gap-2">
                <Square size={16} /> Reset Crop
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
              <Layers size={14} /> Presets
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => applyPreset('center')} className="btn bs text-xs py-2">Center</button>
              <button onClick={() => applyPreset('safe-area')} className="btn bs text-xs py-2">Safe Area</button>
              <button onClick={() => applyPreset('split-left')} className="btn bs text-xs py-2 flex items-center justify-center gap-1"><SplitSquareHorizontal size={14} /> Left</button>
              <button onClick={() => applyPreset('split-right')} className="btn bs text-xs py-2 flex items-center justify-center gap-1">Right <SplitSquareHorizontal size={14} /></button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
              <Settings size={14} /> Dimensions
            </h3>
            
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-text-secondary">Lock Aspect Ratio</label>
              <button 
                onClick={() => setAspectRatioLock(!aspectRatioLock)}
                className={`p-1.5 rounded ${aspectRatioLock ? 'bg-accent/10 text-accent' : 'text-text-muted hover:bg-bg-secondary'}`}
              >
                {aspectRatioLock ? <Lock size={16} /> : <Unlock size={16} />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[10px] text-text-muted uppercase">Width</label>
                <input 
                  type="number" 
                  className="fi text-sm w-full" 
                  value={pageData ? Math.round(pageData.cropBox.width) : ''}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    if (w > 0 && pageData) {
                      updateCurrentPageData({ cropBox: { ...pageData.cropBox, width: w } });
                    }
                  }}
                />
              </div>
              <div>
                <label className="text-[10px] text-text-muted uppercase">Height</label>
                <input 
                  type="number" 
                  className="fi text-sm w-full" 
                  value={pageData ? Math.round(pageData.cropBox.height) : ''}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    if (h > 0 && pageData) {
                      updateCurrentPageData({ cropBox: { ...pageData.cropBox, height: h } });
                    }
                  }}
                />
              </div>
            </div>
            <p className="text-[10px] text-text-muted">Tip: Use arrow keys to nudge the crop box. Hold Shift for larger steps.</p>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
              <RotateCw size={14} /> Page Rotation
            </h3>
            <div className="flex gap-2">
              <button 
                onClick={() => updateCurrentPageData({ rotation: ((pageData?.rotation || 0) - 90) % 360 })}
                className="flex-1 btn bs text-sm py-2"
              >
                -90°
              </button>
              <button 
                onClick={() => updateCurrentPageData({ rotation: ((pageData?.rotation || 0) + 90) % 360 })}
                className="flex-1 btn bs text-sm py-2"
              >
                +90°
              </button>
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div 
          className="flex-1 overflow-auto p-8 flex justify-center items-start bg-stone-100 dark:bg-stone-900 pattern-grid relative"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {pageData && (
            <div 
              className="relative shadow-2xl bg-white" 
              style={{ 
                width: pageData.viewport.width, 
                height: pageData.viewport.height,
                transform: `rotate(${pageData.rotation}deg)`,
                transition: isDragging ? 'none' : 'transform 0.3s ease'
              }}
            >
              <canvas ref={canvasRef} className="block" />
              
              {/* Crop Overlay */}
              <div className="absolute inset-0 pointer-events-none z-10">
                {/* Darkened areas */}
                <div className="absolute top-0 left-0 right-0 bg-black/40" style={{ height: pageData.cropBox.y * zoom }} />
                <div className="absolute bottom-0 left-0 right-0 bg-black/40" style={{ top: (pageData.cropBox.y + pageData.cropBox.height) * zoom }} />
                <div className="absolute bg-black/40" style={{ top: pageData.cropBox.y * zoom, bottom: pageData.viewport.height - (pageData.cropBox.y + pageData.cropBox.height) * zoom, left: 0, width: pageData.cropBox.x * zoom }} />
                <div className="absolute bg-black/40" style={{ top: pageData.cropBox.y * zoom, bottom: pageData.viewport.height - (pageData.cropBox.y + pageData.cropBox.height) * zoom, right: 0, left: (pageData.cropBox.x + pageData.cropBox.width) * zoom }} />

                {/* Crop Box */}
                <div 
                  className="absolute border-2 border-accent pointer-events-auto cursor-move group"
                  style={{
                    left: pageData.cropBox.x * zoom,
                    top: pageData.cropBox.y * zoom,
                    width: pageData.cropBox.width * zoom,
                    height: pageData.cropBox.height * zoom,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, 'move')}
                >
                  {/* Grid lines */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-0 group-hover:opacity-50 transition-opacity">
                    <div className="border-r border-b border-white/50"></div>
                    <div className="border-r border-b border-white/50"></div>
                    <div className="border-b border-white/50"></div>
                    <div className="border-r border-b border-white/50"></div>
                    <div className="border-r border-b border-white/50"></div>
                    <div className="border-b border-white/50"></div>
                    <div className="border-r border-white/50"></div>
                    <div className="border-r border-white/50"></div>
                    <div></div>
                  </div>

                  {/* Resize Handles */}
                  <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-accent cursor-nwse-resize rounded-full" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'nw'); }} />
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-accent cursor-ns-resize rounded-full" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'n'); }} />
                  <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-accent cursor-nesw-resize rounded-full" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'ne'); }} />
                  <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-accent cursor-ew-resize rounded-full" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'e'); }} />
                  <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-accent cursor-nwse-resize rounded-full" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'se'); }} />
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-accent cursor-ns-resize rounded-full" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 's'); }} />
                  <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-accent cursor-nesw-resize rounded-full" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'sw'); }} />
                  <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-accent cursor-ew-resize rounded-full" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'w'); }} />
                  
                  {/* Dimensions tooltip */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {Math.round(pageData.cropBox.width)} × {Math.round(pageData.cropBox.height)} px
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
