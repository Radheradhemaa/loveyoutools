import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Download, ZoomIn, ZoomOut, Maximize, FileUp, Settings, ChevronLeft, ChevronRight, RotateCw, Crop, Trash2, CheckSquare, Square, SplitSquareHorizontal, ArrowRight, Layers, Lock, Unlock, Zap, FileText, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import ToolLayout from '../components/tool-system/ToolLayout';

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
  const [zoom, setZoom] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState('');
  
  const [needsPasswordForFile, setNeedsPasswordForFile] = useState<number | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwords, setPasswords] = useState<Record<number, string>>({});
  const pdfDocsMap = useRef<Record<number, pdfjs.PDFDocumentProxy>>({});
  
  // Store crop data per file and page
  // Key format: `${fileIdx}-${pageNum}`
  const [pagesData, setPagesData] = useState<Record<string, PageData>>({});
  
  const [applyToAll, setApplyToAll] = useState(true);
  const [aspectRatioLock, setAspectRatioLock] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCropBox, setInitialCropBox] = useState<CropBox | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  const handleFilesSelected = async (selectedFiles: File | File[]) => {
    const pdfFiles = (Array.isArray(selectedFiles) ? selectedFiles : [selectedFiles]).filter(f => f.type === 'application/pdf');
    if (pdfFiles.length > 0) {
      setFiles(pdfFiles);
      await loadPdf(pdfFiles[0], 0);
    }
  };

  const isPasswordError = (error: any) => {
    if (!error) return false;
    const name = String(error.name || '');
    const msg = String(error.message || '');
    const code = error.code;
    return (
      name === 'PasswordException' ||
      name.toLowerCase().includes('password') ||
      msg.toLowerCase().includes('password') ||
      msg.toLowerCase().includes('encrypted') ||
      code === 1 || // pdfjs.PasswordResponses.NEED_PASSWORD
      code === 2    // pdfjs.PasswordResponses.INCORRECT_PASSWORD
    );
  };

  const attemptPdfUnlock = async (
    rawArrayBuffer: ArrayBuffer,
    enteredPassword?: string
  ): Promise<{ pdf: pdfjs.PDFDocumentProxy; workingPassword: string }> => {
    const candidates: string[] = [];
    if (enteredPassword !== undefined && enteredPassword !== null && enteredPassword !== '') {
      // 1. Exact entered password
      candidates.push(enteredPassword);

      // 2. Trimmed password (fixes clipboard trailing space/newline from WhatsApp, Gmail, SMS)
      const trimmed = enteredPassword.trim();
      if (trimmed && !candidates.includes(trimmed)) {
        candidates.push(trimmed);
      }

      // 3. Unquoted password (e.g. "secret" -> secret)
      const unquoted = enteredPassword.replace(/^["'`]|["'`]$/g, '').trim();
      if (unquoted && !candidates.includes(unquoted)) {
        candidates.push(unquoted);
      }

      // 4. Uppercase variant (Aadhaar / PAN / Bank statement passwords like 'rajesh1990' -> 'RAJESH1990')
      const upper = trimmed.toUpperCase();
      if (upper && !candidates.includes(upper)) {
        candidates.push(upper);
      }

      // 5. Lowercase variant (mobile keyboards auto-capitalizing first letter)
      const lower = trimmed.toLowerCase();
      if (lower && !candidates.includes(lower)) {
        candidates.push(lower);
      }
    } else {
      candidates.push('');
    }

    let lastError: any = null;

    for (const pwd of candidates) {
      try {
        // CRITICAL: Slice fresh copy of buffer because Web Worker transfers and detaches it
        const dataCopy = new Uint8Array(rawArrayBuffer.slice(0));
        const loadingTask = pdfjs.getDocument({
          data: dataCopy,
          password: pwd || undefined,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
          cMapPacked: true,
        });

        let tried = false;
        loadingTask.onPassword = (
          updatePassword: (p: string | Error) => void,
          reason: number
        ) => {
          // reason === 1: NEED_PASSWORD, reason === 2: INCORRECT_PASSWORD
          if (reason === 2 || tried || !pwd) {
            updatePassword(new Error('Incorrect password'));
          } else {
            tried = true;
            updatePassword(pwd);
          }
        };

        const pdf = await loadingTask.promise;
        return { pdf, workingPassword: pwd };
      } catch (err: any) {
        lastError = err;
        if (!isPasswordError(err)) {
          throw err;
        }
      }
    }

    throw lastError;
  };

  const loadPdf = async (file: File, fileIdx: number, pwd?: string) => {
    setLoading(true);
    setPasswordError('');
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { pdf, workingPassword } = await attemptPdfUnlock(arrayBuffer, pwd);
      
      pdfDocsMap.current[fileIdx] = pdf;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setCurrentFileIdx(fileIdx);
      setPageNum(1);
      
      if (workingPassword) {
        setPasswords(prev => ({ ...prev, [fileIdx]: workingPassword }));
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
      // Dismiss password modal only upon verified successful unlock
      setNeedsPasswordForFile(null);
      setPasswordInput('');

      // Trigger immediate rendering
      setTimeout(() => {
        renderPage();
      }, 60);
    } catch (error: any) {
      if (isPasswordError(error)) {
        setNeedsPasswordForFile(fileIdx);
        if (pwd) setPasswordError('Incorrect password. Please verify and try again.');
      } else {
        console.error('Error loading PDF:', error);
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
    if (!pdfDoc) return;

    if (!canvasRef.current) {
      requestAnimationFrame(() => {
        if (canvasRef.current && pdfDoc) {
          renderPage();
        }
      });
      return;
    }

    const pageData = getCurrentPageData();
    if (!pageData) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const dpr = Math.max(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
      const viewport = page.getViewport({ scale: zoom * dpr, rotation: pageData.rotation });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) return;

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      canvas.style.width = '100%';
      canvas.style.height = '100%';

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      renderTaskRef.current = page.render({
        canvasContext: context,
        viewport: viewport,
      } as any);
      await renderTaskRef.current.promise;
    } catch (error: any) {
      if (
        error?.name !== 'RenderingCancelledException' && 
        !error?.message?.includes('cancelled') &&
        !String(error).includes('cancelled')
      ) {
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

    // Add padding with dpr scale accounted for
    const dpr = Math.max(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const totalScale = zoom * dpr;
    const padding = 20 * totalScale;
    top = Math.max(0, top - padding);
    bottom = Math.min(height, bottom + padding);
    left = Math.max(0, left - padding);
    right = Math.min(width, right + padding);

    updateCurrentPageData({
      cropBox: {
        x: left / totalScale,
        y: top / totalScale,
        width: (right - left) / totalScale,
        height: (bottom - top) / totalScale
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

    const newBox = { ...initialCropBox };

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

  const exportPdfs = async (onComplete: () => void) => {
    if (files.length === 0) return;
    setLoading(true);

    try {
      const zip = new JSZip();

      for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const file = files[fIdx];
        const pwd = passwords[fIdx];
        let pdfBytes: Uint8Array | null = null;
        let isVectorSuccess = false;

        // 1. Lossless Vector Crop attempt (preserves 100% vector resolution for unencrypted or decryptable pdf-lib docs)
        if (!pwd) {
          try {
            const freshArrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(freshArrayBuffer, { ignoreEncryption: false });
            const pages = pdfDoc.getPages();

            for (let pIdx = 0; pIdx < pages.length; pIdx++) {
              const pageData = pagesData[`${fIdx}-${pIdx + 1}`];
              if (!pageData) continue;

              const page = pages[pIdx];
              const { height } = page.getSize();
              const { x, y, width: cw, height: ch } = pageData.cropBox;

              const pdfX = x;
              const pdfY = height - y - ch;

              page.setCropBox(pdfX, pdfY, cw, ch);
              page.setMediaBox(pdfX, pdfY, cw, ch);

              if (pageData.rotation !== 0) {
                page.setRotation(degrees(page.getRotation().angle + pageData.rotation));
              }
            }

            pdfBytes = await pdfDoc.save();
            isVectorSuccess = true;
          } catch (vErr) {
            console.warn('Vector crop not possible, falling back to high-res engine:', vErr);
            isVectorSuccess = false;
          }
        }

        // 2. High-DPI Engine for Password-Protected or Encrypted Documents
        // Maintains supreme quality (3.0x scale = 216-300 DPI, razor-sharp text and graphics)
        if (!isVectorSuccess) {
          const finalPdfDoc = await PDFDocument.create();
          let pdfProxy = pdfDocsMap.current[fIdx];
          if (!pdfProxy) {
            const buf = await file.arrayBuffer();
            const res = await attemptPdfUnlock(buf, pwd);
            pdfProxy = res.pdf;
            pdfDocsMap.current[fIdx] = pdfProxy;
          }

          const pageCount = pdfProxy.numPages;
          for (let pIdx = 0; pIdx < pageCount; pIdx++) {
            const pageData = pagesData[`${fIdx}-${pIdx + 1}`];
            const page = await pdfProxy.getPage(pIdx + 1);
            const baseVp = page.getViewport({ scale: 1.0 });

            const crop = pageData?.cropBox || { x: 0, y: 0, width: baseVp.width, height: baseVp.height };
            const cw = Math.max(10, crop.width);
            const ch = Math.max(10, crop.height);

            // Ultra High-Res rendering: 4.0x scale (300 DPI) + lossless PNG ensures 100% sharp text, barcodes, and lines without compression artifacts
            const renderScale = 4.0;
            const highResViewport = page.getViewport({ scale: renderScale });

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(cw * renderScale);
            canvas.height = Math.round(ch * renderScale);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);

              // Translate canvas to crop offset
              ctx.translate(-crop.x * renderScale, -crop.y * renderScale);
              await page.render({ canvasContext: ctx, viewport: highResViewport }).promise;

              const imgData = canvas.toDataURL('image/png');
              const embeddedImg = await finalPdfDoc.embedPng(imgData);
              const newPage = finalPdfDoc.addPage([cw, ch]);

              newPage.drawImage(embeddedImg, {
                x: 0,
                y: 0,
                width: cw,
                height: ch
              });

              if (pageData && pageData.rotation !== 0) {
                newPage.setRotation(degrees(pageData.rotation));
              }
            }
          }

          pdfBytes = await finalPdfDoc.save();
        }

        if (pdfBytes) {
          if (files.length === 1) {
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            setResultBlob(blob);
            setResultName(`cropped_${file.name}`);
          } else {
            zip.file(`cropped_${file.name}`, pdfBytes);
          }
        }
      }

      if (files.length > 1) {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setResultBlob(zipBlob);
        setResultName(`cropped_pdfs.zip`);
      }

      onComplete();
    } catch (error: any) {
      console.error('Error exporting PDFs:', error);
      alert('Error exporting PDFs. Please check the file and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = resultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleReset = () => {
    setFiles([]);
    setPdfDoc(null);
    setPagesData({});
    setResultBlob(null);
    setNeedsPasswordForFile(null);
    setPasswordInput('');
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

  const faqs = [
    { q: "How does the PDF cropper work?", a: "It allows you to visually select a crop area for each page of your PDF. You can apply the same crop to all pages or customize them individually." },
    { q: "Can I crop multiple PDFs at once?", a: "Yes, you can upload multiple PDF files and batch process them. The tool will provide a ZIP file containing all your cropped documents." },
    { q: "Is my data secure?", a: "Absolutely. All processing happens locally in your browser. Your files are never uploaded to any server." },
    { q: "What if my PDF is password protected?", a: "The tool will prompt you for the password so it can unlock and process the file locally." }
  ];

  const pageData = getCurrentPageData();

  return (
    <ToolLayout
      title="Advanced PDF Cropper"
      description="Crop PDF margins, change page size, and batch process multiple files with pixel precision."
      toolId="pdf-cropper"
      acceptedFileTypes={['application/pdf']}
      multiple={true}
      onDownload={handleDownload}
      faq={faqs}
    >
      {({ file, state, onComplete, onReset }) => {
        useEffect(() => {
          if (file && files.length === 0) {
            handleFilesSelected(file);
          }
        }, [file]);

        useEffect(() => {
          if (state === 'BEFORE') {
            handleReset();
          }
        }, [state]);

        if (state === 'BEFORE') return null;

        return (
          <div className="w-full h-full flex flex-col overflow-hidden bg-bg-primary">
            {/* Custom Toolbar inside DURING state */}
            <div className="bg-surface border-b border-border p-4 flex flex-wrap items-center justify-between gap-4 z-20 shadow-sm shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {files.length > 1 && (
                    <select 
                      className="fi text-xs font-bold py-1.5 px-3 rounded-xl border-border bg-bg-secondary"
                      value={currentFileIdx}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        setCurrentFileIdx(idx);
                        setPageNum(1);
                        loadPdf(files[idx], idx);
                      }}
                    >
                      {files.map((f, i) => (
                        <option key={i} value={i}>{f.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                
                <div className="h-6 w-px bg-border"></div>
                
                <div className="flex items-center gap-2 bg-bg-secondary p-1 rounded-xl border border-border">
                  <button 
                    onClick={() => setPageNum(Math.max(1, pageNum - 1))}
                    disabled={pageNum <= 1}
                    className="p-1.5 hover:bg-surface rounded-lg disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-[10px] font-black uppercase tracking-widest w-20 text-center">Page {pageNum} / {numPages}</span>
                  <button 
                    onClick={() => setPageNum(Math.min(numPages, pageNum + 1))}
                    disabled={pageNum >= numPages}
                    className="p-1.5 hover:bg-surface rounded-lg disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="h-6 w-px bg-border"></div>

                <div className="flex items-center gap-1 sm:gap-2 bg-bg-secondary p-1 rounded-xl border border-border">
                  <button onClick={() => setZoom(Math.max(0.25, Math.round((zoom - 0.25) * 100) / 100))} className="p-1.5 hover:bg-surface rounded-lg transition-colors cursor-pointer" title="Zoom Out">
                    <ZoomOut size={16} />
                  </button>
                  <button onClick={() => setZoom(1.0)} className="text-[10px] font-black w-12 text-center hover:text-accent transition-colors cursor-pointer" title="Reset to 100% Zoom">
                    {Math.round(zoom * 100)}%
                  </button>
                  <button onClick={() => setZoom(Math.min(3, Math.round((zoom + 0.25) * 100) / 100))} className="p-1.5 hover:bg-surface rounded-lg transition-colors cursor-pointer" title="Zoom In">
                    <ZoomIn size={16} />
                  </button>
                  <button 
                    onClick={() => {
                      if (pageData && pageData.viewport.width > 0) {
                        const mainW = window.innerWidth > 1024 ? (window.innerWidth * 0.7 - 80) : (window.innerWidth - 64);
                        setZoom(Math.max(0.25, Math.min(2.5, Math.round((mainW / pageData.viewport.width) * 100) / 100)));
                      }
                    }} 
                    className="p-1.5 hover:bg-surface rounded-lg text-[9px] font-black uppercase text-text-muted hover:text-text-primary transition-colors hidden sm:block cursor-pointer px-2"
                    title="Fit to Page Width"
                  >
                    Fit Width
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted cursor-pointer hover:text-text-primary transition-colors">
                  <input 
                    type="checkbox" 
                    checked={applyToAll} 
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  Apply to all
                </label>
                <button 
                  onClick={() => exportPdfs(onComplete)} 
                  className="btn bp text-xs font-black py-2 px-6 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20" 
                  disabled={loading}
                >
                  {loading ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div> : <Download size={14} />}
                  {files.length > 1 ? 'EXPORT ALL' : 'EXPORT PDF'}
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 min-h-0 lg:overflow-hidden">
              {/* Left Sidebar - Tools - 1/4 width */}
              <aside className="w-full lg:w-1/4 shrink-0 bg-surface border-r border-border flex flex-col shadow-sm order-2 lg:order-1 overflow-hidden h-auto lg:h-full">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <Zap size={14} className="text-accent" /> Smart Actions
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    <button onClick={autoDetectMargins} className="w-full btn bs text-[11px] font-bold py-3 flex items-center justify-center gap-2 rounded-xl">
                      <Maximize size={14} /> Auto Detect
                    </button>
                    <button onClick={() => applyPreset('reset')} className="w-full btn bs text-[11px] font-bold py-3 flex items-center justify-center gap-2 rounded-xl">
                      <Square size={14} /> Reset Crop
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <Layers size={14} className="text-accent" /> Presets
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => applyPreset('center')} className="btn bs text-[10px] font-bold py-2.5 rounded-xl">Center</button>
                    <button onClick={() => applyPreset('safe-area')} className="btn bs text-[10px] font-bold py-2.5 rounded-xl">Safe Area</button>
                    <button onClick={() => applyPreset('split-left')} className="btn bs text-[10px] font-bold py-2.5 rounded-xl flex items-center justify-center gap-1"><SplitSquareHorizontal size={12} /> Left</button>
                    <button onClick={() => applyPreset('split-right')} className="btn bs text-[10px] font-bold py-2.5 rounded-xl flex items-center justify-center gap-1">Right <SplitSquareHorizontal size={12} /></button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <Settings size={14} className="text-accent" /> Dimensions
                  </h3>
                  
                  <div className="flex items-center justify-between p-3 bg-bg-secondary rounded-xl border border-border">
                    <span className="text-[11px] font-bold">Lock Aspect Ratio</span>
                    <button 
                      onClick={() => setAspectRatioLock(!aspectRatioLock)}
                      className={`p-2 rounded-lg transition-all ${aspectRatioLock ? 'bg-accent text-white shadow-md shadow-accent/20' : 'bg-surface text-text-muted hover:text-text-primary border border-border'}`}
                    >
                      {aspectRatioLock ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-muted ml-1">Width</label>
                      <input 
                        type="number" 
                        className="fi text-xs font-bold w-full py-2.5 rounded-xl bg-bg-secondary border-border" 
                        value={pageData ? Math.round(pageData.cropBox.width) : ''}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          if (w > 0 && pageData) {
                            updateCurrentPageData({ cropBox: { ...pageData.cropBox, width: w } });
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-muted ml-1">Height</label>
                      <input 
                        type="number" 
                        className="fi text-xs font-bold w-full py-2.5 rounded-xl bg-bg-secondary border-border" 
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
                  <p className="text-[9px] font-medium text-text-muted leading-relaxed italic">Tip: Use arrow keys to nudge. Hold Shift for larger steps.</p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <RotateCw size={14} className="text-accent" /> Page Rotation
                  </h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => updateCurrentPageData({ rotation: ((pageData?.rotation || 0) - 90) % 360 })}
                      className="flex-1 btn bs text-[11px] font-bold py-3 rounded-xl"
                    >
                      -90°
                    </button>
                    <button 
                      onClick={() => updateCurrentPageData({ rotation: ((pageData?.rotation || 0) + 90) % 360 })}
                      className="flex-1 btn bs text-[11px] font-bold py-3 rounded-xl"
                    >
                      +90°
                    </button>
                  </div>
                </div>
              </aside>

              {/* Main Workspace - 3/4 width */}
              <main className="flex-1 lg:flex-[3] bg-bg-secondary/20 flex flex-col order-1 lg:order-2 overflow-hidden relative min-h-[40vh] lg:min-h-0">
                <div 
                  className="flex-1 relative overflow-hidden flex flex-col w-full h-full"
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <div className="w-full h-full overflow-auto p-4 sm:p-8 custom-scrollbar">
                    <div className="w-max min-w-full min-h-full flex flex-col items-center justify-start py-6 px-4">
                    {pageData ? (
                      <div 
                        className="relative shadow-2xl bg-white ring-1 ring-black/5 shrink-0" 
                        style={{ 
                      width: pageData.viewport.width * zoom, 
                      height: pageData.viewport.height * zoom,
                      transform: `rotate(${pageData.rotation}deg)`,
                      transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    <canvas ref={canvasRef} className="block w-full h-full" />
                    
                    {/* Crop Overlay */}
                    <div className="absolute inset-0 pointer-events-none z-10">
                      {/* Darkened areas */}
                      <div className="absolute top-0 left-0 right-0 bg-black/60 backdrop-blur-[1px]" style={{ height: pageData.cropBox.y * zoom }} />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-[1px]" style={{ top: (pageData.cropBox.y + pageData.cropBox.height) * zoom }} />
                      <div className="absolute bg-black/60 backdrop-blur-[1px]" style={{ top: pageData.cropBox.y * zoom, bottom: (pageData.viewport.height - (pageData.cropBox.y + pageData.cropBox.height)) * zoom, left: 0, width: pageData.cropBox.x * zoom }} />
                      <div className="absolute bg-black/60 backdrop-blur-[1px]" style={{ top: pageData.cropBox.y * zoom, bottom: (pageData.viewport.height - (pageData.cropBox.y + pageData.cropBox.height)) * zoom, right: 0, left: (pageData.cropBox.x + pageData.cropBox.width) * zoom }} />

                      {/* Crop Box */}
                      <div 
                        className="absolute border-2 border-accent pointer-events-auto cursor-move group shadow-[0_0_0_1px_rgba(255,255,255,0.5)]"
                        style={{
                          left: pageData.cropBox.x * zoom,
                          top: pageData.cropBox.y * zoom,
                          width: pageData.cropBox.width * zoom,
                          height: pageData.cropBox.height * zoom,
                        }}
                        onMouseDown={(e) => handleMouseDown(e, 'move')}
                      >
                        {/* Grid lines */}
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-0 group-hover:opacity-40 transition-opacity">
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
                        {[
                          { h: 'nw', c: '-top-1.5 -left-1.5 cursor-nwse-resize' },
                          { h: 'n', c: '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
                          { h: 'ne', c: '-top-1.5 -right-1.5 cursor-nesw-resize' },
                          { h: 'e', c: 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize' },
                          { h: 'se', c: '-bottom-1.5 -right-1.5 cursor-nwse-resize' },
                          { h: 's', c: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
                          { h: 'sw', c: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
                          { h: 'w', c: 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize' }
                        ].map(handle => (
                          <div 
                            key={handle.h}
                            className={`absolute w-3 h-3 bg-white border-2 border-accent rounded-full shadow-sm z-20 ${handle.c}`} 
                            onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, handle.h); }} 
                          />
                        ))}
                        
                        {/* Dimensions tooltip */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[10px] font-black px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all pointer-events-none shadow-xl border border-white/10">
                          {Math.round(pageData.cropBox.width)} × {Math.round(pageData.cropBox.height)} px
                        </div>
                      </div>
                      </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin mb-4" />
                        <span className="text-xs font-bold text-text-muted">
                          {needsPasswordForFile !== null ? "Document locked with password" : "Loading PDF..."}
                        </span>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </main>
            </div>

            {/* Password Modal Overlay */}
            {needsPasswordForFile !== null && (
              <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md z-[100] p-4 animate-in fade-in duration-200">
                <div className="max-w-md w-full mx-4 bg-surface border border-border rounded-3xl p-8 shadow-2xl animate-in zoom-in-95">
                  <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShieldAlert size={32} />
                  </div>
                  <h2 className="text-2xl font-black text-center mb-2">Password Protected PDF</h2>
                  <p className="text-text-muted text-center text-xs mb-6">
                    The file <strong className="text-text-primary">"{files[needsPasswordForFile]?.name}"</strong> requires a password to open and crop.
                  </p>
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (passwordInput.trim() && files[needsPasswordForFile]) {
                        loadPdf(files[needsPasswordForFile], needsPasswordForFile, passwordInput.trim());
                      }
                    }} 
                    className="space-y-4"
                  >
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted w-5 h-5" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={passwordInput}
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          setPasswordError('');
                        }}
                        placeholder="Enter PDF password"
                        className="fi w-full pl-12 pr-12 py-3.5 rounded-2xl text-sm"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1 cursor-pointer"
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {passwordError && (
                      <p className="text-error text-xs font-bold mt-1 ml-2">
                        {passwordError}
                      </p>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button 
                        type="button" 
                        onClick={() => {
                          const newFiles = [...files];
                          newFiles.splice(needsPasswordForFile, 1);
                          setFiles(newFiles);
                          setNeedsPasswordForFile(null);
                          setPasswordInput('');
                          setPasswordError('');
                          if (newFiles.length === 0) {
                            handleReset();
                            onReset();
                          }
                          else if (newFiles.length > 0) {
                            const newIdx = Math.max(0, needsPasswordForFile - 1);
                            loadPdf(newFiles[newIdx], newIdx);
                          }
                        }} 
                        className="btn bs flex-1 py-3.5 rounded-2xl font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        className="btn bp flex-1 py-3.5 rounded-2xl font-bold cursor-pointer flex items-center justify-center gap-2" 
                        disabled={loading || !passwordInput.trim()}
                      >
                        {loading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Unlocking...</span>
                          </>
                        ) : (
                          <span>Unlock & Open</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        );
      }}
  </ToolLayout>
);
}
