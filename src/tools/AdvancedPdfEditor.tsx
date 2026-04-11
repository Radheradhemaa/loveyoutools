import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, 
  Download, 
  Type, 
  Square, 
  Circle as CircleIcon, 
  Highlighter, 
  Eraser, 
  Undo2, 
  Redo2, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Minimize,
  Layers,
  Trash2,
  Search,
  Replace,
  Image as ImageIcon,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  MousePointer2,
  Settings2,
  PenTool,
  Type as TypeIcon,
  Plus,
  RotateCw,
  GripVertical,
  Lock,
  Unlock,
  Zap,
  Shield,
  Star,
  Sparkles,
  Wand2,
  FileDown,
  FileUp,
  History,
  Languages,
  Moon,
  Sun,
  Monitor,
  Smartphone,
  Tablet,
  Layout,
  MoreVertical,
  Eye,
  EyeOff,
  CloudUpload,
  Scissors,
  Copy,
  PlusCircle,
  Signature
} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import { Canvas, IText, Rect, Circle, Image as FabricImage, Path, Group, PencilBrush } from 'fabric';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import Tesseract from 'tesseract.js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import confetti from 'canvas-confetti';
import { useFocusMode } from '../contexts/FocusModeContext';
import ToolLayout from '../components/tool-system/ToolLayout';

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// --- Types ---
interface EditorState {
  currentPage: number;
  zoom: number;
  tool: ToolType;
  isProcessing: boolean;
  history: any[];
  historyIndex: number;
  pageData: Record<number, any>;
  deletedPages: number[];
  pageOrder: number[];
  selectedObject: any;
  showSearch: boolean;
  searchQuery: string;
  replaceQuery: string;
  thumbnails: string[];
  isDarkMode: boolean;
  exportFormat: 'pdf' | 'docx' | 'jpg' | 'png';
  compressionLevel: number;
  isPasswordProtected: boolean;
  password: string;
}

type ToolType = 'select' | 'text' | 'rect' | 'circle' | 'pen' | 'highlight' | 'eraser' | 'image' | 'signature';

// --- Helper Components ---

const SortableThumbnail = ({ id, index, thumb, isActive, isDeleted, onClick, onDelete, onRotate }: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`relative group cursor-pointer rounded-lg border-2 p-1 transition-all ${isActive ? 'border-accent shadow-lg bg-accent/5' : 'border-transparent hover:border-border'}`}
      onClick={onClick}
    >
      <div {...attributes} {...listeners} className="absolute top-2 left-2 p-1 bg-surface/80 rounded opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing z-10">
        <GripVertical className="w-3 h-3 text-text-muted" />
      </div>
      
      <div className="relative aspect-[3/4] bg-bg-secondary rounded overflow-hidden">
        <img src={thumb} alt={`Page ${index + 1}`} className={`w-full h-full object-contain ${isDeleted ? 'opacity-30 grayscale' : ''}`} />
        {isDeleted && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
            <Trash2 className="w-8 h-8 text-red-500" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[10px] font-bold text-text-muted">PAGE {index + 1}</span>
        <div className="flex items-center gap-1">
          <button 
            onClick={(e) => { e.stopPropagation(); onRotate(id); }}
            className="p-1 rounded hover:bg-bg-secondary text-text-muted hover:text-accent"
          >
            <RotateCw className="w-3 h-3" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
            className={`p-1 rounded hover:bg-bg-secondary ${isDeleted ? 'text-red-500' : 'text-text-muted hover:text-red-500'}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function AdvancedPdfEditor() {
  const [lastExportedUrl, setLastExportedUrl] = useState<string | null>(null);
  const editorRef = useRef<any>(null);

  const faq = [
    { q: "Is this PDF editor really free?", a: "Yes, our advanced PDF editor is 100% free to use with no hidden costs or subscriptions." },
    { q: "Can I edit text in a scanned PDF?", a: "Yes! Our OCR technology automatically detects text in scanned documents, making them editable." },
    { q: "Is my data safe?", a: "Absolutely. We use client-side processing, meaning your files never leave your device and are never uploaded to our servers." },
    { q: "What file formats can I export to?", a: "You can export your edited document as a PDF, or as high-quality JPG and PNG images." }
  ];

  const handleDownload = () => {
    if (lastExportedUrl) {
      const link = document.createElement('a');
      link.href = lastExportedUrl;
      link.download = `loveyoutools_edited.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <ToolLayout
      title="Advanced PDF Editor"
      description="Edit text, add images, sign, and annotate PDFs instantly in your browser. Smart text detection for easier editing."
      toolId="pdf-editor"
      acceptedFileTypes={['.pdf']}
      multiple={true}
      faq={faq}
      onDownload={handleDownload}
      renderToolbar={() => null}
    >
      {({ file, state, onComplete, onReset }) => {
        useEffect(() => {
          if (state === 'BEFORE') {
            setLastExportedUrl(null);
          }
        }, [state]);

        return (
          <PdfEditorWorkspace 
            initialFile={file} 
            onComplete={(url: string) => {
              setLastExportedUrl(url);
              onComplete();
            }} 
            onReset={onReset}
            ref={editorRef}
          />
        );
      }}
    </ToolLayout>
  );
}

const PdfEditorWorkspace = React.forwardRef(({ initialFile, onComplete, onReset }: any, ref) => {
  const { setIsFocusMode } = useFocusMode();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [state, setState] = useState<EditorState>({
    currentPage: 1,
    zoom: 1,
    tool: 'select',
    isProcessing: false,
    history: [],
    historyIndex: -1,
    pageData: {},
    deletedPages: [],
    pageOrder: [],
    selectedObject: null,
    showSearch: false,
    searchQuery: '',
    replaceQuery: '',
    thumbnails: [],
    isDarkMode: false,
    exportFormat: 'pdf',
    compressionLevel: 0.7,
    isPasswordProtected: false,
    password: '',
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvas = useRef<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const originalDimensions = useRef({ width: 0, height: 0 });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --- Core Logic ---

  const savePageState = useCallback(() => {
    if (!fabricCanvas.current) return;
    const json = fabricCanvas.current.toJSON();
    setState(prev => {
      const newPageData = { ...prev.pageData, [prev.currentPage]: json };
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push({ page: prev.currentPage, data: json });
      return {
        ...prev,
        pageData: newPageData,
        history: newHistory,
        historyIndex: newHistory.length - 1
      };
    });
  }, [state.currentPage]);

  const renderPage = async (pageNum: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    setState(prev => ({ ...prev, isProcessing: true }));
    
    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      originalDimensions.current = { width: viewport.width, height: viewport.height };
      
      if (fabricCanvas.current) {
        fabricCanvas.current.dispose();
      }
      
      const canvas = new Canvas(canvasRef.current, {
        width: viewport.width * state.zoom,
        height: viewport.height * state.zoom,
        backgroundColor: 'white'
      });
      canvas.setZoom(state.zoom);
      
      fabricCanvas.current = canvas;

      const tempCanvas = document.createElement('canvas');
      const context = tempCanvas.getContext('2d');
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;
      
      await (page as any).render({ canvasContext: context!, viewport }).promise;
      
      const bgImage = await FabricImage.fromURL(tempCanvas.toDataURL());
      bgImage.set({ selectable: false, evented: false });
      canvas.add(bgImage);
      canvas.sendObjectToBack(bgImage);

      if (state.pageData[pageNum]) {
        await canvas.loadFromJSON(state.pageData[pageNum]);
      } else {
        const textContent = await page.getTextContent();
        const items = textContent.items as any[];
        
        items.forEach(item => {
          if (!item.str.trim()) return;
          
          const tx = pdfjs.Util.transform(viewport.transform, item.transform);
          const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]) || item.height * viewport.scale;
          
          const fontName = item.fontName?.toLowerCase() || '';
          const fontWeight = fontName.includes('bold') ? 'bold' : 'normal';
          const fontStyle = fontName.includes('italic') ? 'italic' : 'normal';
          
          let color = '#000000';
          if (item.color && Array.isArray(item.color)) {
            color = `rgb(${item.color[0]}, ${item.color[1]}, ${item.color[2]})`;
          }

          const text = new IText(item.str, {
            left: tx[4],
            top: tx[5] - fontSize * 0.8,
            fontSize: fontSize,
            fontFamily: 'sans-serif',
            fontWeight: fontWeight,
            fontStyle: fontStyle,
            fill: 'transparent',
            data: { isOriginal: true, originalText: item.str, originalColor: color },
            hoverCursor: 'text',
            selectable: true,
          });

          text.on('selected', () => {
            text.set({ fill: text.data.originalColor, backgroundColor: 'rgba(255, 255, 255, 0.8)' });
            canvas.renderAll();
          });

          text.on('deselected', () => {
            if (text.text === text.data.originalText) {
              text.set({ fill: 'transparent', backgroundColor: 'transparent' });
            } else {
              text.set({ fill: text.data.originalColor, backgroundColor: '#ffffff' });
            }
            canvas.renderAll();
          });

          text.on('editing:entered', () => {
            text.set({ fill: text.data.originalColor, backgroundColor: '#ffffff' });
            canvas.renderAll();
          });
          
          text.on('changed', () => {
            text.set({ fill: text.data.originalColor, backgroundColor: '#ffffff' });
            canvas.renderAll();
          });

          canvas.add(text);
        });
      }

      canvas.on('object:modified', savePageState);
      canvas.on('object:added', savePageState);
      canvas.on('object:removed', savePageState);
      canvas.on('selection:created', (e) => setState(prev => ({ ...prev, selectedObject: e.selected?.[0] })));
      canvas.on('selection:updated', (e) => setState(prev => ({ ...prev, selectedObject: e.selected?.[0] })));
      canvas.on('selection:cleared', () => setState(prev => ({ ...prev, selectedObject: null })));

      setState(prev => ({ ...prev, isProcessing: false }));
    } catch (error) {
      console.error('Error rendering page:', error);
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  useEffect(() => {
    if (initialFile) {
      const file = Array.isArray(initialFile) ? initialFile[0] : initialFile;
      setPdfFile(file);
      loadPdf(file, state.password);
    } else {
      // Reset state when initialFile is null
      setPdfFile(null);
      pdfDocRef.current = null;
      if (fabricCanvas.current) {
        fabricCanvas.current.dispose();
        fabricCanvas.current = null;
      }
      setState({
        currentPage: 1,
        zoom: 1,
        tool: 'select',
        isProcessing: false,
        history: [],
        historyIndex: -1,
        pageData: {},
        deletedPages: [],
        pageOrder: [],
        selectedObject: null,
        showSearch: false,
        searchQuery: '',
        replaceQuery: '',
        thumbnails: [],
        isDarkMode: false,
        exportFormat: 'pdf',
        compressionLevel: 0.7,
        isPasswordProtected: false,
        password: '',
      });
    }
  }, [initialFile]);

  const loadPdf = (file: File, password?: string) => {
    setState(prev => ({ ...prev, isProcessing: true, isPasswordProtected: false }));
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const loadingTask = pdfjs.getDocument({ data, password });
        const pdf = await loadingTask.promise;
        pdfDocRef.current = pdf;
        
        const order = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
        setState(prev => ({ ...prev, pageOrder: order }));
        
        const newThumbnails = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.3 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await (page as any).render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          newThumbnails.push(canvas.toDataURL());
        }
        
        setState(prev => ({ 
          ...prev, 
          thumbnails: newThumbnails, 
          isProcessing: false,
          currentPage: 1,
          isPasswordProtected: false
        }));
        
        renderPage(1);
      } catch (error: any) {
        if (error.name === 'PasswordException') {
          setState(prev => ({ ...prev, isPasswordProtected: true, isProcessing: false }));
        } else {
          console.error('Error loading PDF:', error);
          setState(prev => ({ ...prev, isProcessing: false }));
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pdfFile) {
      loadPdf(pdfFile, state.password);
    }
  };

  useEffect(() => {
    if (fabricCanvas.current && originalDimensions.current.width > 0) {
      const canvas = fabricCanvas.current;
      canvas.setDimensions({
        width: originalDimensions.current.width * state.zoom,
        height: originalDimensions.current.height * state.zoom
      });
      canvas.setZoom(state.zoom);
    }
  }, [state.zoom]);

  const addText = () => {
    if (!fabricCanvas.current) return;
    fabricCanvas.current.isDrawingMode = false;
    const text = new IText('Type something...', {
      left: 100 / state.zoom,
      top: 100 / state.zoom,
      fontFamily: 'Arial',
      fontSize: 24,
      fill: state.isDarkMode ? '#ffffff' : '#000000'
    });
    fabricCanvas.current.add(text);
    fabricCanvas.current.setActiveObject(text);
    setState(prev => ({ ...prev, tool: 'select' }));
  };

  const addImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricCanvas.current) return;
    
    const reader = new FileReader();
    reader.onload = async (f) => {
      const img = await FabricImage.fromURL(f.target?.result as string);
      img.scaleToWidth(200);
      fabricCanvas.current!.isDrawingMode = false;
      fabricCanvas.current?.add(img);
      fabricCanvas.current?.setActiveObject(img);
      fabricCanvas.current?.renderAll();
      setState(prev => ({ ...prev, tool: 'select' }));
    };
    reader.readAsDataURL(file);
  };

  const togglePen = (isHighlight = false) => {
    if (!fabricCanvas.current) return;
    const canvas = fabricCanvas.current;
    canvas.isDrawingMode = true;
    if (!canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush = new PencilBrush(canvas);
    }
    canvas.freeDrawingBrush.width = isHighlight ? 20 : 5;
    canvas.freeDrawingBrush.color = isHighlight ? 'rgba(255, 255, 0, 0.3)' : (state.isDarkMode ? '#ffffff' : '#000000');
    setState(prev => ({ ...prev, tool: isHighlight ? 'highlight' : 'pen' }));
  };

  const toggleEraser = () => {
    if (!fabricCanvas.current) return;
    const canvas = fabricCanvas.current;
    canvas.isDrawingMode = true;
    if (!canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush = new PencilBrush(canvas);
    }
    canvas.freeDrawingBrush.width = 20;
    canvas.freeDrawingBrush.color = '#ffffff';
    setState(prev => ({ ...prev, tool: 'eraser' }));
  };

  const setSelectTool = () => {
    if (!fabricCanvas.current) return;
    fabricCanvas.current.isDrawingMode = false;
    setState(prev => ({ ...prev, tool: 'select' }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setState((prev) => {
        const oldIndex = prev.pageOrder.indexOf(active.id as number);
        const newIndex = prev.pageOrder.indexOf(over?.id as number);
        return { ...prev, pageOrder: arrayMove(prev.pageOrder, oldIndex, newIndex) };
      });
    }
  };

  const handleSearchReplace = () => {
    if (!fabricCanvas.current || !state.searchQuery) return;
    const canvas = fabricCanvas.current;
    const objects = canvas.getObjects('i-text') as IText[];
    
    let count = 0;
    objects.forEach(obj => {
      if (obj.text.includes(state.searchQuery)) {
        obj.set('text', obj.text.replace(new RegExp(state.searchQuery, 'g'), state.replaceQuery));
        obj.set({ fill: obj.data?.originalColor || '#000000', backgroundColor: '#ffffff' });
        count++;
      }
    });
    
    if (count > 0) {
      canvas.renderAll();
      savePageState();
      setState(prev => ({ ...prev, showSearch: false }));
    }
  };

  const exportPdf = async () => {
    if (!pdfFile) return;
    setState(prev => ({ ...prev, isProcessing: true }));
    
    try {
      const existingPdfBytes = await pdfFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
      const finalPdfDoc = await PDFDocument.create();
      
      for (const pageNum of state.pageOrder) {
        if (state.deletedPages.includes(pageNum)) continue;
        
        const [copiedPage] = await finalPdfDoc.copyPages(pdfDoc, [pageNum - 1]);
        const data = state.pageData[pageNum];
        
        if (data && data.objects) {
          const pdfjsPage = await pdfDocRef.current.getPage(pageNum);
          const viewport = pdfjsPage.getViewport({ scale: 1.0 });

          for (const obj of data.objects) {
            if (obj.type === 'image' && !obj.selectable) continue;

            const fabricX = obj.left;
            const fabricY = obj.top;
            const [pdfX, pdfY] = viewport.convertToPdfPoint(fabricX / 2.0, fabricY / 2.0);

            if (obj.type === 'i-text' || obj.type === 'text') {
              copiedPage.drawText(obj.text, {
                x: pdfX,
                y: pdfY - (obj.fontSize / 2.0),
                size: obj.fontSize / 2.0,
                color: rgb(0, 0, 0),
              });
            } else if (obj.type === 'image') {
              const imgBytes = await fetch(obj.src).then(res => res.arrayBuffer());
              const embeddedImg = await finalPdfDoc.embedPng(imgBytes);
              copiedPage.drawImage(embeddedImg, {
                x: pdfX,
                y: pdfY - (obj.height * obj.scaleY / 2.0),
                width: obj.width * obj.scaleX / 2.0,
                height: obj.height * obj.scaleY / 2.0,
              });
            }
          }
        }
        finalPdfDoc.addPage(copiedPage);
      }

      const pdfBytes = await finalPdfDoc.save({
        useObjectStreams: state.compressionLevel > 0.5,
        addDefaultPage: false,
      });

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });

      onComplete(url);
    } catch (error) {
      console.error('Export Error:', error);
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  return (
    <div className={`tool-layout-container ${state.isDarkMode ? 'dark' : ''}`}>
      <aside className="tool-sidebar">
        <div className="sidebar-content custom-scrollbar p-6 space-y-6">
          {/* Editing Tools */}
          <div className="space-y-4">
            <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
              <Settings2 className="w-4 h-4 text-accent" /> Editing Tools
            </h3>
            <div className="flex flex-wrap items-center gap-2 bg-bg-secondary p-2 rounded-xl border border-border">
              <button onClick={setSelectTool} className={`p-2 rounded-lg transition-all ${state.tool === 'select' ? 'bg-accent text-white shadow-lg' : 'hover:bg-border text-text-muted'}`} title="Select">
                <MousePointer2 className="w-5 h-5" />
              </button>
              <button onClick={addText} className={`p-2 rounded-lg transition-all ${state.tool === 'text' ? 'bg-accent text-white shadow-lg' : 'hover:bg-border text-text-muted'}`} title="Add Text">
                <TypeIcon className="w-5 h-5" />
              </button>
              <button onClick={() => togglePen()} className={`p-2 rounded-lg transition-all ${state.tool === 'pen' ? 'bg-accent text-white shadow-lg' : 'hover:bg-border text-text-muted'}`} title="Draw">
                <PenTool className="w-5 h-5" />
              </button>
              <button onClick={() => togglePen(true)} className={`p-2 rounded-lg transition-all ${state.tool === 'highlight' ? 'bg-accent text-white shadow-lg' : 'hover:bg-border text-text-muted'}`} title="Highlight">
                <Highlighter className="w-5 h-5" />
              </button>
              <button onClick={toggleEraser} className={`p-2 rounded-lg transition-all ${state.tool === 'eraser' ? 'bg-accent text-white shadow-lg' : 'hover:bg-border text-text-muted'}`} title="Whiteout / Eraser">
                <Eraser className="w-5 h-5" />
              </button>
              <div className="h-6 w-px bg-border mx-1" />
              <button 
                onClick={() => setState(prev => ({ ...prev, showSearch: !prev.showSearch }))}
                className={`p-2 rounded-lg transition-all ${state.showSearch ? 'bg-accent text-white shadow-lg' : 'hover:bg-border text-text-muted'}`} 
                title="Search & Replace"
              >
                <Search className="w-5 h-5" />
              </button>
              <button onClick={() => imageInputRef.current?.click()} className="p-2 rounded-lg hover:bg-border text-text-muted transition-all" title="Add Image">
                <ImageIcon className="w-5 h-5" />
              </button>
              <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={addImage} />
            </div>
          </div>

          {/* Pages */}
          <div className="space-y-4 flex-1 flex flex-col min-h-[300px]">
            <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
              <Layers className="w-4 h-4 text-accent" /> Pages
            </h3>
            <div className="flex-1 overflow-y-auto bg-bg-secondary/50 rounded-xl p-4 border border-border">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={state.pageOrder}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {state.pageOrder.map((id, index) => (
                      <SortableThumbnail 
                        key={id}
                        id={id}
                        index={index}
                        thumb={state.thumbnails[id - 1]}
                        isActive={state.currentPage === id}
                        isDeleted={state.deletedPages.includes(id)}
                        onClick={() => {
                          setState(prev => ({ ...prev, currentPage: id }));
                          renderPage(id);
                        }}
                        onDelete={(pageId: number) => {
                          setState(prev => ({
                            ...prev,
                            deletedPages: prev.deletedPages.includes(pageId) 
                              ? prev.deletedPages.filter(p => p !== pageId)
                              : [...prev.deletedPages, pageId]
                          }));
                        }}
                        onRotate={() => {}}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </div>

        <div className="sidebar-actions p-4 border-t border-border bg-surface">
          <button onClick={exportPdf} className="btn bp w-full py-4 rounded-2xl gap-2 shadow-lg shadow-accent/20 text-xs font-black uppercase tracking-widest">
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </aside>

      <main className="tool-main-preview">
        {/* Top Toolbar Overlay */}
        <div className="absolute top-0 left-0 right-0 bg-surface/90 backdrop-blur-md border-b border-border p-3 flex flex-wrap items-center justify-between gap-4 z-20 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={onReset}
              className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-muted hover:text-text-primary"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-border mx-1" />
            <div className="flex items-center gap-2 bg-bg-secondary px-3 py-1.5 rounded-xl border border-border">
              <button onClick={() => setState(prev => ({ ...prev, zoom: Math.max(0.3, prev.zoom - 0.1) }))} className="p-1 hover:bg-surface rounded text-text-muted hover:text-text-primary">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-black w-12 text-center text-text-primary">{Math.round(state.zoom * 100)}%</span>
              <button onClick={() => setState(prev => ({ ...prev, zoom: Math.min(3, prev.zoom + 0.1) }))} className="p-1 hover:bg-surface rounded text-text-muted hover:text-text-primary">
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setState(prev => ({ ...prev, isDarkMode: !prev.isDarkMode }))}
              className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-muted hover:text-text-primary"
            >
              {state.isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="preview-content-wrapper pt-20 p-4 lg:p-8 relative">
          {state.showSearch && (
            <div className="absolute top-24 right-8 w-80 bg-surface border border-border rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-text-primary">Search & Replace</h4>
                <button onClick={() => setState(prev => ({ ...prev, showSearch: false }))} className="p-1 hover:bg-bg-secondary rounded text-text-muted hover:text-text-primary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="fg">
                  <label className="fl">Find</label>
                  <input 
                    type="text" 
                    className="fi text-xs"
                    value={state.searchQuery}
                    onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
                    placeholder="Search text..."
                  />
                </div>
                <div className="fg">
                  <label className="fl">Replace with</label>
                  <input 
                    type="text" 
                    className="fi text-xs"
                    value={state.replaceQuery}
                    onChange={(e) => setState(prev => ({ ...prev, replaceQuery: e.target.value }))}
                    placeholder="Replacement text..."
                  />
                </div>
                <button onClick={handleSearchReplace} className="btn bp w-full py-2 text-xs">
                  Replace All
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 w-full h-full overflow-auto bg-bg-secondary/30 rounded-xl border border-border p-4">
            <div className="shadow-2xl bg-white mx-auto w-max">
              <canvas ref={canvasRef} />
            </div>
          </div>

          {state.isProcessing && (
            <div className="absolute inset-0 bg-surface/50 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="flex flex-col items-center gap-4 bg-surface p-6 rounded-2xl shadow-2xl border border-border">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="font-bold text-accent text-sm uppercase tracking-widest">Processing Magic...</p>
              </div>
            </div>
          )}

          {state.isPasswordProtected && (
            <div className="absolute inset-0 bg-surface/90 backdrop-blur-sm flex items-center justify-center z-50">
              <form onSubmit={handlePasswordSubmit} className="flex flex-col items-center gap-4 bg-surface p-8 rounded-2xl shadow-2xl border border-border max-w-md w-full">
                <Lock className="w-12 h-12 text-amber-500 mb-2" />
                <h3 className="font-bold text-xl text-center">Password Protected PDF</h3>
                <p className="text-text-muted text-sm text-center mb-4">This document requires a password to open.</p>
                <input 
                  type="password" 
                  className="fi w-full"
                  value={state.password}
                  onChange={(e) => setState(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter password..."
                  required
                />
                <div className="flex gap-4 w-full mt-2">
                  <button type="button" onClick={onReset} className="btn bs flex-1">Cancel</button>
                  <button type="submit" className="btn bp flex-1">Unlock</button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
});
