import "regenerator-runtime/runtime";
import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Check,
  Minus,
  X,
  ChevronLeft,
  ChevronRight,
  MousePointer2,
  Bold,
  Italic,
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
  Pencil,
  RefreshCw,
  Maximize2,
  Minimize2,
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import {
  Canvas,
  IText,
  Rect,
  Circle,
  Image as FabricImage,
  Path,
  Group,
  PencilBrush,
} from "fabric";
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import Tesseract from "tesseract.js";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import confetti from "canvas-confetti";
import { useFocusMode } from "../contexts/FocusModeContext";
import ToolLayout from "../components/tool-system/ToolLayout";

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
  exportFormat: "pdf" | "docx" | "jpg" | "png";
  compressionLevel: number;
  isPasswordProtected: boolean;
  password: string;
  eraserWidth: number;
  showFloatingMenu: boolean;
  floatingMenuPos: { x: number; y: number };
  textData: Record<number, any[]>;
  editingText: {
    visible: boolean;
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
    fontSize: number;
    fontFamily: string;
    fontWeight: string | number;
    fontStyle: string;
    color: string;
    targetObj: any | null;
    cssScaleY: number;
  } | null;
}

type ToolType =
  | "select"
  | "text"
  | "rect"
  | "circle"
  | "pen"
  | "highlight"
  | "erase"
  | "image"
  | "signature"
  | "arrow"
  | "check"
  | "cross"
  | "sticky"
  | "redact"
  | "draw";

// --- Helper Components ---

const SortableThumbnail = ({
  id,
  index,
  thumb,
  isActive,
  isDeleted,
  onClick,
  onDelete,
  onRotate,
}: any) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group cursor-pointer rounded-lg border-2 p-1 transition-all ${isActive ? "border-accent shadow-lg bg-accent/5" : "border-transparent hover:border-border"}`}
      onClick={onClick}
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 p-1 bg-surface/80 rounded opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing z-10"
      >
        <GripVertical className="w-3 h-3 text-text-muted" />
      </div>

      <div className="relative aspect-[3/4] bg-bg-secondary rounded overflow-hidden">
        <img
          src={thumb}
          alt={`Page ${index + 1}`}
          className={`w-full h-full object-contain ${isDeleted ? "opacity-30 grayscale" : ""}`}
        />
        {isDeleted && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
            <Trash2 className="w-8 h-8 text-red-500" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[10px] font-bold text-text-muted">
          PAGE {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRotate(id);
            }}
            className="p-1 rounded hover:bg-bg-secondary text-text-muted hover:text-accent"
          >
            <RotateCw className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id);
            }}
            className={`p-1 rounded hover:bg-bg-secondary ${isDeleted ? "text-red-500" : "text-text-muted hover:text-red-500"}`}
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
  const lastExportedUrlRef = useRef<string | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string>("document");
  const editorRef = useRef<any>(null);

  const faq = [
    {
      q: "Is this PDF editor really free?",
      a: "Yes, our advanced PDF editor is 100% free to use with no hidden costs or subscriptions.",
    },
    {
      q: "Can I edit text in a scanned PDF?",
      a: "Yes! Our OCR technology automatically detects text in scanned documents, making them editable.",
    },
    {
      q: "Is my data safe?",
      a: "Absolutely. We use client-side processing, meaning your files never leave your device and are never uploaded to our servers.",
    },
    {
      q: "What file formats can I export to?",
      a: "You can export your edited document as a PDF, or as high-quality JPG and PNG images.",
    },
  ];

  const handleDownload = () => {
    const urlToUse = lastExportedUrlRef.current || lastExportedUrl;
    if (urlToUse) {
      const link = document.createElement("a");
      link.href = urlToUse;
      const baseName = originalFilename.replace(/\.pdf$/i, "");
      link.download = `edited-${baseName}.pdf`;
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
      acceptedFileTypes={[".pdf"]}
      multiple={true}
      faq={faq}
      onDownload={handleDownload}
      downloadUrl={lastExportedUrl || undefined}
      downloadFileName={`edited-${originalFilename.replace(/\.pdf$/i, "")}.pdf`}
      renderToolbar={() => null}
    >
      {({ file, state, onComplete, onReset }) => {
        useEffect(() => {
          if (state === "BEFORE") {
            setLastExportedUrl(null);
            lastExportedUrlRef.current = null;
          }
        }, [state]);

        useEffect(() => {
          setLastExportedUrl(null);
          lastExportedUrlRef.current = null;
          if (file && file[0]) {
            setOriginalFilename(file[0].name);
          }
        }, [file]);

        return (
          <PdfEditorWorkspace
            initialFile={file}
            onComplete={(url: string) => {
              lastExportedUrlRef.current = url;
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

const getFontFamilyForText = (text: string, originalFamily: string, rawFontName?: string): string => {
  const fonts: string[] = [];
  const rawLower = (rawFontName || "").toLowerCase();
  const familyLower = (originalFamily || "").toLowerCase();
  const combined = `${rawLower} ${familyLower}`;

  if (rawFontName) {
    fonts.push(`"${rawFontName}"`);
  }

  // Devanagari / Hindi script support
  if (/[\u0900-\u097F]/.test(text || "")) {
    const isSerif = combined.includes("serif") || 
                    combined.includes("aparajita") || 
                    combined.includes("times") || 
                    combined.includes("mangal") || 
                    combined.includes("devanagari-serif");
    if (isSerif) {
      fonts.push('"Aparajita"', '"Noto Serif Devanagari"');
    } else {
      fonts.push('"Mangal"', '"Noto Sans Devanagari"');
    }
  }

  // Intelligent matching of standard font families
  if (combined.includes("calibri") || combined.includes("carlito")) {
    fonts.push('"Calibri"', '"Carlito"', '"Segoe UI"', 'sans-serif');
  } else if (combined.includes("cambria") || combined.includes("caladea")) {
    fonts.push('"Cambria"', '"Caladea"', '"Georgia"', 'serif');
  } else if (combined.includes("times") || combined.includes("georgia") || combined.includes("garamond") || combined.includes("minion") || combined.includes("serif")) {
    fonts.push('"Times New Roman"', '"Times"', '"Georgia"', '"Garamond"', 'serif');
  } else if (combined.includes("courier") || combined.includes("mono") || combined.includes("consolas")) {
    fonts.push('"Courier New"', '"Courier"', '"Consolas"', '"Liberation Mono"', 'monospace');
  } else if (combined.includes("arial") || combined.includes("helvet") || combined.includes("liberation")) {
    fonts.push('"Arial"', '"Helvetica Neue"', '"Helvetica"', '"Liberation Sans"', 'sans-serif');
  } else if (combined.includes("segoe")) {
    fonts.push('"Segoe UI"', '"Segoe"', 'sans-serif');
  } else if (combined.includes("roboto")) {
    fonts.push('"Roboto"', 'sans-serif');
  } else if (combined.includes("open") && combined.includes("sans")) {
    fonts.push('"Open Sans"', 'sans-serif');
  } else if (combined.includes("tahoma")) {
    fonts.push('"Tahoma"', '"Verdana"', 'sans-serif');
  } else if (combined.includes("verdana")) {
    fonts.push('"Verdana"', '"Geneva"', 'sans-serif');
  } else if (combined.includes("trebuchet")) {
    fonts.push('"Trebuchet MS"', 'sans-serif');
  } else if (originalFamily) {
    fonts.push(originalFamily);
  } else {
    fonts.push('sans-serif');
  }

  if (originalFamily && !fonts.includes(originalFamily)) {
    fonts.push(originalFamily);
  }

  const uniqueFonts = Array.from(new Set(fonts));
  return uniqueFonts.join(", ");
};

const reshapeTextForPdf = (str: string): string => {
  if (!str) return "";
  if (/[\u0900-\u097F]/.test(str)) {
    const clusterRegex = /((?:[\u0915-\u0939\u0958-\u095F]\u094D)*[\u0915-\u0939\u0958-\u095F])\u093F/g;
    return str.replace(clusterRegex, "\u093F$1");
  }
  return str;
};

const MeasurerText = ({ text, style, onMeasure }: { text: string; style: React.CSSProperties; onMeasure: (width: number) => void }) => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) {
      onMeasure(ref.current.getBoundingClientRect().width);
    }
  }, [text, style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle]);

  return (
    <span
      ref={ref}
      style={{
        ...style,
        position: "absolute",
        visibility: "hidden",
        whiteSpace: "pre",
        pointerEvents: "none",
        letterSpacing: "normal",
        transform: "none",
        padding: 0,
        margin: 0,
      }}
    >
      {text}
    </span>
  );
};

const PixelPerfectBlock = ({ 
  block, 
  state, 
  isModified, 
  showWhiteout, 
  getFontFamilyForText, 
  setState,
  fabricCanvas
}: { 
  block: any; 
  state: any; 
  isModified: boolean; 
  showWhiteout: boolean; 
  getFontFamilyForText: any; 
  setState: React.Dispatch<React.SetStateAction<any>>;
  fabricCanvas: any;
}) => {
  const [naturalWidth, setNaturalWidth] = useState(0);

  const text = block.text || "";
  const isEditing = state.editingText?.blockId === block.id;

  const originalLength = block.originalText?.length || 1;
  const textLength = text.length || 1;
  const targetWidth = block.width * state.zoom;

  let letterSpacing = 0;
  if (naturalWidth > 0 && textLength > 1) {
    if (!isModified || Math.abs(textLength - originalLength) <= Math.max(1, Math.round(originalLength * 0.4))) {
      const rawSpacing = (targetWidth - naturalWidth) / (textLength - 1);
      const maxSpacing = Math.min(2.0, Math.max(0, block.fontSize * state.zoom * 0.06));
      const minSpacing = -1.5;
      letterSpacing = Math.max(minSpacing, Math.min(maxSpacing, rawSpacing));
    }
  }
  
  const getWeightNumber = (w: any) => {
    if (!w) return 400;
    if (typeof w === "number") return w;
    const num = parseInt(w, 10);
    if (!isNaN(num)) return num;
    const s = String(w).toLowerCase();
    if (s === "bold" || s === "700") return 700;
    if (s === "normal" || s === "400") return 400;
    if (s === "semibold" || s === "medium" || s === "500" || s === "600") return 600;
    if (s === "black" || s === "heavy" || s === "900") return 900;
    return 400;
  };

  const fontStyleObj = {
    fontFamily: getFontFamilyForText(text, block.fontFamily, block.originalFontName),
    fontSize: block.fontSize * state.zoom,
    fontWeight: getWeightNumber(block.fontWeight),
    fontStyle: block.fontStyle || "normal",
  };

  // Transform matrix from original block if preserved
  let tMatrix = "none";
  if (block.originalTransform && Array.isArray(block.originalTransform) && block.originalTransform.length === 6) {
     const t = block.originalTransform;
     // The raw pdf transform operates in its own space (often origin bottom-left),
     // but we translate the block independently in HTML so we isolate rotation/scale matrix
     // without its unscaled translation offsets.
     tMatrix = `matrix(${t[0]/block.fontSize}, ${t[1]}, ${t[2]}, ${t[3]/block.fontSize}, 0, 0)`;
  }

  const commonStyle: React.CSSProperties = {
    position: "absolute",
    left: block.left * state.zoom,
    top: block.top * state.zoom,
    width: (isModified || isEditing) ? Math.max(targetWidth, naturalWidth + 20) : targetWidth, 
    height: block.fontSize * state.zoom,
    padding: 0,
    margin: 0,
    lineHeight: "1",
    border: "none",
    outline: "none",
    background: "transparent",
    letterSpacing: `${letterSpacing}px`,
    fontVariantLigatures: "common-ligatures",
    fontFeatureSettings: '"liga" on, "clig" on, "calt" on',
    WebkitFontSmoothing: "subpixel-antialiased",
    MozOsxFontSmoothing: "grayscale",
    textRendering: "geometricPrecision",
    whiteSpace: "pre",
    transformOrigin: "top left",
    transform: tMatrix !== "none" ? tMatrix : "none",
    overflow: "visible",
    // Always transparent so it doesn't cover nearby elements with solid blocks.
    // The original text is already hidden by the Fabric.js whiteout mask.
    backgroundColor: "transparent",
  };

  return (
    <>
      {/* Hidden measurer to find natural width under standard rendering */}
      <MeasurerText 
        text={text} 
        style={fontStyleObj} 
        onMeasure={(w) => setNaturalWidth(w)} 
      />

      {!block.isDeleted && (
        isEditing ? (
          <input
            type="text"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            data-ms-editor="false"
            data-spellcheck="false"
            data-page-number={state.currentPage}
            data-block-id={block.id}
            className="editable-text absolute outline-none rounded-md transition-shadow"
            style={{
              position: "absolute",
              left: block.left * state.zoom,
              top: block.top * state.zoom,
              minWidth: Math.max(targetWidth + 24, 70),
              height: Math.max(block.fontSize * state.zoom * 1.35, 24),
              lineHeight: "1.25",
              padding: "2px 6px",
              zIndex: 100,
              color: block.color || "#000000",
              caretColor: block.color || "#000000",
              cursor: "text",
              pointerEvents: "auto",
              boxShadow: "0 0 0 2px #2563eb, 0 4px 14px rgba(0,0,0,0.18)",
              backgroundColor: "#ffffff",
              border: "1px solid #3b82f6",
              ...fontStyleObj,
            }}
            value={text}
            onChange={(e) => {
              const val = e.target.value;
              setState((prev: any) => {
                const newTextData = { ...prev.textData };
                const pageBlocks = [...(newTextData[state.currentPage] || [])];
                const idx = pageBlocks.findIndex((b: any) => b.id === block.id);
                if (idx > -1) {
                  pageBlocks[idx] = { ...pageBlocks[idx], text: val };
                }
                newTextData[state.currentPage] = pageBlocks;
                const newEditingText = prev.editingText ? { ...prev.editingText, text: val } : null;
                return { ...prev, textData: newTextData, editingText: newEditingText };
              });
              if (fabricCanvas.current) {
                const isModifiedNow = block.isDeleted || 
                                      val !== block.originalText || 
                                      block.color !== block.originalColor || 
                                      block.fontSize !== (block.originalFontSize || block.fontSize) ||
                                      block.fontWeight !== (block.originalFontWeight || block.fontWeight) ||
                                      block.fontStyle !== (block.originalFontStyle || block.fontStyle);

                const rect = fabricCanvas.current.getObjects().find((o: any) => o.type === "rect" && o.data?.blockId === block.id && o.data?.isWhiteout);
                if (rect) {
                  rect.set({ visible: isModifiedNow });
                }

                const textObj = fabricCanvas.current.getObjects().find((o: any) => o.type === "i-text" && o.data?.blockId === block.id && o.data?.isTextOverlay);
                if (textObj) {
                  textObj.set({
                    text: val,
                    visible: false,
                  });
                }
                fabricCanvas.current.renderAll();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget as HTMLElement).blur();
              }
            }}
          />
        ) : (
          <span
            data-page-number={state.currentPage}
            data-block-id={block.id}
            spellCheck={false}
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            data-ms-editor="false"
            data-spellcheck="false"
            className="editable-text absolute outline-none border-none ring-0 focus:ring-0 select-text"
            onClick={() => {
              if (state.tool === 'text' || state.tool === 'select' || !block.isOriginal) {
                setState((prev: any) => ({
                  ...prev,
                  editingText: {
                    visible: true,
                    text: block.text,
                    left: block.left * prev.zoom,
                    top: block.top * prev.zoom,
                    width: block.width * prev.zoom,
                    height: block.height * prev.zoom,
                    fontSize: block.fontSize * prev.zoom,
                    fontFamily: block.fontFamily,
                    fontWeight: block.fontWeight,
                    fontStyle: block.fontStyle,
                    color: block.color,
                    cssScaleY: 1,
                    targetObj: null,
                    blockId: block.id,
                  }
                }));
              }
            }}
            style={{
              ...commonStyle,
              zIndex: 2,
              color: isModified ? (block.color || "#000000") : "transparent",
              cursor: (state.tool === 'text' || state.tool === 'select' || !block.isOriginal) ? "text" : "default",
              pointerEvents: (state.tool === 'text' || state.tool === 'select' || !block.isOriginal) ? "auto" : "none",
              display: "inline-block",
              ...fontStyleObj,
            }}
          >
            {text}
          </span>
        )
      )}
      
      {(block.isDeleted || isModified || isEditing) && block.isOriginal && (
        <div style={{
          position: "absolute",
          left: (block.left - 0.5) * state.zoom,
          top: (block.top - 1) * state.zoom,
          width: targetWidth + 1.5 * state.zoom,
          height: (block.fontSize * 1.25) * state.zoom,
          backgroundColor: block.bgColor || "#ffffff",
          color: "transparent",
          pointerEvents: "none",
          zIndex: 1,
          borderRadius: "1px",
        }} />
      )}
    </>
  );
};

const PdfEditorWorkspace = React.forwardRef(
  ({ initialFile, onComplete, onReset }: any, ref) => {
    const { setIsFocusMode } = useFocusMode();
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [passwordError, setPasswordError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [docLoadVersion, setDocLoadVersion] = useState(0);
    const [state, setState] = useState<EditorState>({
      currentPage: 1,
      zoom: 1,
      tool: "select",
      isProcessing: false,
      history: [],
      historyIndex: -1,
      pageData: {},
      deletedPages: [],
      pageOrder: [],
      selectedObject: null,
      showSearch: false,
      searchQuery: "",
      replaceQuery: "",
      thumbnails: [],
      isDarkMode: false,
      exportFormat: "pdf",
      compressionLevel: 0.7,
      isPasswordProtected: false,
      password: "",
      eraserWidth: 20,
      showFloatingMenu: false,
      floatingMenuPos: { x: 0, y: 0 },
      textData: {},
      editingText: null,
    });

    const updateActiveTextData = (updates: any) => {
      setState(prev => {
        if (!prev.editingText) return prev;
        
        if (prev.editingText.targetObj) {
          // If we are editing a Fabric targetObj directly (like newly added text)
          if (updates.isDeleted) {
             fabricCanvas.current?.remove(prev.editingText.targetObj);
          } else {
             const fabricUpdates: any = {};
             if (updates.text !== undefined) fabricUpdates.text = updates.text;
             if (updates.color !== undefined) fabricUpdates.fill = updates.color;
             if (updates.fontSize !== undefined) fabricUpdates.fontSize = updates.fontSize;
             if (updates.fontWeight !== undefined) fabricUpdates.fontWeight = updates.fontWeight;
             if (updates.fontStyle !== undefined) fabricUpdates.fontStyle = updates.fontStyle;
             if (updates.fontFamily !== undefined) fabricUpdates.fontFamily = updates.fontFamily;
             prev.editingText.targetObj.set(fabricUpdates);
          }
          fabricCanvas.current?.renderAll();
          return { ...prev, editingText: { ...prev.editingText, ...updates } };
        }

        const newEditingText = { ...prev.editingText, ...updates };
        const newTextData = { ...prev.textData };
        const pageBlocks = [...(newTextData[prev.currentPage] || [])];
        const idx = pageBlocks.findIndex(b => b.id === prev.editingText?.blockId);
        if (idx > -1) {
          pageBlocks[idx] = { ...pageBlocks[idx], ...updates };
          
          if (fabricCanvas.current) {
            const blockId = prev.editingText.blockId;
            const block = pageBlocks[idx];
            const isModifiedNow = block.isDeleted || 
                                  block.text !== block.originalText || 
                                  block.color !== block.originalColor || 
                                  block.fontSize !== (block.originalFontSize || block.fontSize) ||
                                  block.fontWeight !== (block.originalFontWeight || block.fontWeight) ||
                                  block.fontStyle !== (block.originalFontStyle || block.fontStyle);

            const rect = fabricCanvas.current.getObjects().find((o: any) => o.type === "rect" && o.data?.blockId === blockId && o.data?.isWhiteout);
            if (rect) {
              rect.set({ visible: isModifiedNow });
            }
            fabricCanvas.current.renderAll();
          }
        }
        newTextData[prev.currentPage] = pageBlocks;

        return { ...prev, textData: newTextData, editingText: newEditingText };
      });
    };

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvas = useRef<Canvas | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const pdfDocRef = useRef<any>(null);

    const renderPageRef = useRef<number>(0);
    const activeRenderTaskRef = useRef<any>(null);
    const isRenderingRef = useRef<boolean>(false);

    const imageInputRef = useRef<HTMLInputElement>(null);
    const replaceImageInputRef = useRef<HTMLInputElement>(null);
    const originalDimensions = useRef({ width: 0, height: 0 });
    const userAdjustedZoomRef = useRef(false);
    const [showMobileThumbnails, setShowMobileThumbnails] = useState(false);

    const stateRef = useRef(state);
    useEffect(() => {
      stateRef.current = state;
    }, [state]);



    const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      }),
    );

    // --- Core Logic ---

    const savePageState = useCallback(() => {
      // Small timeout to ensure Fabric has fully updated the objects
      setTimeout(() => {
        if (!fabricCanvas.current) return;
        // CRITICAL: Include 'data' and 'visible' properties in toJSON to preserve original text info and whiteout rect visibility
        const json = fabricCanvas.current.toJSON(["data", "visible"]);
        
        // Remove background from serialized JSON to prevent doubling up on load
        if (json.objects) {
          json.objects = json.objects.filter((obj: any) => !obj.data?.isBackground);
        }

        setState((prev) => {
          const newPageData = { ...prev.pageData, [prev.currentPage]: json };
          const newHistory = prev.history.slice(0, prev.historyIndex + 1);

          // Push initial base state if this is the first edit for the session on this page
          if (
            newHistory.length === 0 ||
            newHistory[newHistory.length - 1].page !== prev.currentPage
          ) {
            const baseState = prev.pageData[prev.currentPage];
            if (baseState) {
              newHistory.push({ page: prev.currentPage, data: baseState });
            }
          }

          newHistory.push({ page: prev.currentPage, data: json });

          return {
            ...prev,
            pageData: newPageData,
            history: newHistory,
            historyIndex: newHistory.length - 1,
          };
        });
      }, 0);
    }, [state.currentPage]);

    const commitAndCloseEditing = useCallback(() => {
      setState((prev) => {
        if (!prev.editingText) return prev;
        if (fabricCanvas.current && prev.editingText.targetObj) {
          prev.editingText.targetObj.set({
            visible: true,
            text: prev.editingText.text || "",
          });
          fabricCanvas.current.renderAll();
        }
        if (fabricCanvas.current && prev.editingText.blockId) {
          const blockId = prev.editingText.blockId;
          const pageBlocks = prev.textData[prev.currentPage] || [];
          const block = pageBlocks.find((b: any) => b.id === blockId);
          if (block) {
            const isModifiedNow = block.isDeleted || 
                                  block.text !== block.originalText || 
                                  block.color !== block.originalColor || 
                                  block.fontSize !== (block.originalFontSize || block.fontSize) ||
                                  block.fontWeight !== (block.originalFontWeight || block.fontWeight) ||
                                  block.fontStyle !== (block.originalFontStyle || block.fontStyle);

            const rect = fabricCanvas.current.getObjects().find((o: any) => o.type === "rect" && o.data?.blockId === blockId && o.data?.isWhiteout);
            if (rect) {
              rect.set({ visible: isModifiedNow });
            }
            fabricCanvas.current.renderAll();
          }
        }
        return { ...prev, editingText: null };
      });
      savePageState();
    }, [savePageState]);

    const deleteActiveText = useCallback(() => {
      setState((prev) => {
        if (!prev.editingText) return prev;
        if (fabricCanvas.current && prev.editingText.targetObj) {
          fabricCanvas.current.remove(prev.editingText.targetObj);
          fabricCanvas.current.renderAll();
          return { ...prev, editingText: null, selectedObject: null, showFloatingMenu: false };
        }
        if (prev.editingText.blockId) {
          const newTextData = { ...prev.textData };
          const pageBlocks = [...(newTextData[prev.currentPage] || [])];
          const idx = pageBlocks.findIndex(b => b.id === prev.editingText?.blockId);
          if (idx > -1) {
            pageBlocks[idx] = { ...pageBlocks[idx], isDeleted: true, text: "" };
            if (fabricCanvas.current) {
              const rect = fabricCanvas.current.getObjects().find((o: any) => o.type === "rect" && o.data?.blockId === prev.editingText.blockId && o.data?.isWhiteout);
              if (rect) {
                rect.set({ visible: true });
              }
              fabricCanvas.current.renderAll();
            }
          }
          newTextData[prev.currentPage] = pageBlocks;
          return { ...prev, textData: newTextData, editingText: null };
        }
        return { ...prev, editingText: null };
      });
      savePageState();
    }, [savePageState]);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (!state.editingText) return;
        
        const target = e.target as HTMLElement;
        if (!target) return;
        
        const isInsideTextarea = target.classList.contains("editable-text") || target.tagName === "TEXTAREA" || target.tagName === "INPUT";
        const isInsideToolbar = target.closest(".floating-text-toolbar") || target.classList.contains("floating-text-toolbar");
        
        if (!isInsideTextarea && !isInsideToolbar) {
          commitAndCloseEditing();
        }
      };
      
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [state.editingText, commitAndCloseEditing]);

    const undo = async () => {
      if (state.historyIndex <= 0) return;
      const newIndex = state.historyIndex - 1;
      const targetState = state.history[newIndex];

      setState((prev) => ({
        ...prev,
        historyIndex: newIndex,
        currentPage: targetState.page,
        pageData: { ...prev.pageData, [targetState.page]: targetState.data },
      }));

      if (targetState.page !== state.currentPage) {
        // Handled by useEffect on currentPage change
      } else if (fabricCanvas.current) {
        fabricCanvas.current.off("object:added");
        fabricCanvas.current.off("object:modified");
        fabricCanvas.current.off("object:removed");
        await fabricCanvas.current.loadFromJSON(targetState.data);
        fabricCanvas.current.renderAll();
        fabricCanvas.current.on("object:added", savePageState);
        fabricCanvas.current.on("object:modified", savePageState);
        fabricCanvas.current.on("object:removed", savePageState);
      }
    };

    const redo = async () => {
      if (state.historyIndex >= state.history.length - 1) return;
      const newIndex = state.historyIndex + 1;
      const targetState = state.history[newIndex];

      setState((prev) => ({
        ...prev,
        historyIndex: newIndex,
        currentPage: targetState.page,
        pageData: { ...prev.pageData, [targetState.page]: targetState.data },
      }));

      if (targetState.page !== state.currentPage) {
        // Handled by useEffect on currentPage change
      } else if (fabricCanvas.current) {
        fabricCanvas.current.off("object:added");
        fabricCanvas.current.off("object:modified");
        fabricCanvas.current.off("object:removed");
        await fabricCanvas.current.loadFromJSON(targetState.data);
        fabricCanvas.current.renderAll();
        fabricCanvas.current.on("object:added", savePageState);
        fabricCanvas.current.on("object:modified", savePageState);
        fabricCanvas.current.on("object:removed", savePageState);
      }
    };

    const attachTextHandlers = (canvas: Canvas) => {
      const objects = canvas.getObjects();
      objects.forEach((obj) => {
        if (
          (obj.type === "i-text" || obj.type === "text") &&
          (obj as any).data?.isOriginal
        ) {
          const text = obj as IText;
          // Find matching whiteout rect
          const whiteoutRect = objects.find(
            (o) =>
              o.type === "rect" &&
              (o as any).data?.isWhiteout &&
              Math.abs(o.left - (text as any).data.originalTx4) < 1,
          ) as Rect;

          if (!whiteoutRect) return;

          text.on("mousedblclick", () => {
            const currentState = stateRef.current;
            if (
              currentState.tool === "select" ||
              currentState.tool === "text"
            ) {
              text.set({ visible: false });
              canvas.renderAll();
              const cssScaleX =
                canvas.getElement().clientWidth / canvas.getWidth();
              const cssScaleY =
                canvas.getElement().clientHeight / canvas.getHeight();
              const finalScaleX = currentState.zoom * cssScaleX;
              const finalScaleY = currentState.zoom * cssScaleY;

              setState((prev) => ({
                ...prev,
                editingText: {
                  visible: true,
                  text: text.text || "",
                  left: (text.left || 0) * finalScaleX,
                  top: (text.top || 0) * finalScaleY,
                  width: (text.width || 0) * (text.scaleX || 1) * finalScaleX,
                  height: (text.height || 0) * (text.scaleY || 1) * finalScaleY,
                  fontSize: (text.fontSize || 12) * finalScaleY,
                  fontFamily: text.fontFamily || "sans-serif",
                  fontWeight: text.fontWeight || "normal",
                  fontStyle: text.fontStyle || "normal",
                  color:
                    (text as any).data?.originalColor || text.fill || "#000",
                  targetObj: text,
                  cssScaleY: cssScaleY,
                },
                showFloatingMenu: false,
              }));
            }
          });

          text.on("mouseover", () => {
            if (text.fill === "transparent" || text.fill === "rgba(255, 255, 255, 0.01)") {
              text.set({ backgroundColor: "transparent" });
              canvas.renderAll();
            }
          });

          text.on("mouseout", () => {
            if (text.fill === "transparent" || text.fill === "rgba(255, 255, 255, 0.01)") {
              text.set({ backgroundColor: "transparent" });
              canvas.renderAll();
            }
          });

          text.on("selected", () => {
            whiteoutRect.set({ visible: true });
            text.set({
              fill: (text as any).data.originalColor,
              backgroundColor: "transparent",
            });
            canvas.renderAll();
          });

          text.on("deselected", () => {
            if (text.text === (text as any).data.originalText) {
              whiteoutRect.set({ visible: false });
              text.set({
                fill: "rgba(255, 255, 255, 0.01)",
                backgroundColor: "transparent",
              });
            } else {
              whiteoutRect.set({ visible: true });
              text.set({
                fill: (text as any).data.originalColor,
                backgroundColor: "transparent",
              });
            }
            canvas.renderAll();
          });

          text.on("editing:entered", () => {
            whiteoutRect.set({ visible: true });
            text.set({
              fill: (text as any).data.originalColor,
              backgroundColor: "transparent",
              cursorColor: "#000000",
            });
            canvas.renderAll();
          });

          text.on("changed", () => {
            whiteoutRect.set({ visible: true });
            text.set({
              fill: (text as any).data.originalColor,
              backgroundColor: "transparent",
            });
            canvas.renderAll();
            savePageState();
          });

          text.on("editing:exited", () => {
            savePageState();
          });
        }
      });
    };

    const renderPage = async (pageNum: number) => {
      if (!pdfDocRef.current) return;
      if (!canvasRef.current) {
        requestAnimationFrame(() => {
          if (canvasRef.current && pdfDocRef.current) {
            renderPage(pageNum);
          }
        });
        return;
      }

      // Prevent duplicate concurrent render tasks by cancelling the previous one
      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel();
        } catch (e) {
          console.warn("Cancelling previous render task failed:", e);
        }
        activeRenderTaskRef.current = null;
      }

      // Render lock to avoid simultaneous page.render calls
      if (isRenderingRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      isRenderingRef.current = true;
      setState((prev) => ({ ...prev, isProcessing: true, editingText: null }));

      const currentCallId = ++renderPageRef.current;

      try {
        const page = await pdfDocRef.current.getPage(pageNum);
        if (currentCallId !== renderPageRef.current) return;

        const baseViewport = page.getViewport({ scale: 1.0 });
        originalDimensions.current = {
          width: baseViewport.width,
          height: baseViewport.height,
        };

        if (fabricCanvas.current) {
          try {
            fabricCanvas.current.dispose();
          } catch (e) {
            console.warn("Disposing fabric canvas failed:", e);
          }
          fabricCanvas.current = null;
        }

        // 1. Clear the main workspace canvas to avoid ghost overlays and duplicated dimensions
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
        }

        const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
        const targetDpr = Math.max(dpr, 2.0);
        // Ultra-sharp rendering scale matching physical screen pixels at current zoom
        const renderScale = Math.max(2.5, stateRef.current.zoom * targetDpr);

        const canvas = new Canvas(canvasRef.current, {
          width: baseViewport.width * stateRef.current.zoom,
          height: baseViewport.height * stateRef.current.zoom,
          backgroundColor: "white",
          imageSmoothingEnabled: true,
          enableRetinaScaling: true,
          allowTouchScrolling: true,
        });

        if (canvas.contextContainer) {
          canvas.contextContainer.imageSmoothingEnabled = true;
          canvas.contextContainer.imageSmoothingQuality = "high";
        }
        if (canvas.contextTop) {
          canvas.contextTop.imageSmoothingEnabled = true;
          canvas.contextTop.imageSmoothingQuality = "high";
        }

        canvas.setZoom(stateRef.current.zoom);
        fabricCanvas.current = canvas;

        const renderViewport = page.getViewport({ scale: renderScale });

        const tempCanvas = document.createElement("canvas");
        const context = tempCanvas.getContext("2d", { alpha: false });
        if (context) {
          tempCanvas.width = Math.round(renderViewport.width);
          tempCanvas.height = Math.round(renderViewport.height);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

          // Image extraction removed as per user request to avoid duplicates and ensure pixel-perfect preview

          // 2. We do NOT suppress text in the background canvas. We want pixel-perfect PDF rendering including text!
          // We will render HTML text on top with transparent color.

          const renderContext = {
            canvasContext: context,
            viewport: renderViewport,
            annotationMode: 0, // Disable duplicate annotation overlays
            textLayerMode: 0,
          };

          const renderTask = (page as any).render(renderContext);
          activeRenderTaskRef.current = renderTask;
          
          // Attach a dummy catch handler immediately to prevent unhandled promise rejections if it fails while we do other async things
          renderTask.promise.catch(() => {});

          // Re-extract original image positions so we can reliably create interactive overlays
          const extractedImages: { left: number, top: number, pdfWidth: number, pdfHeight: number }[] = [];
          try {
            const ops = await (page as any).getOperatorList();
            if (currentCallId !== renderPageRef.current) return;
            const fnArray = ops.fnArray;
            const argsArray = ops.argsArray;
            const SAVE_OP = (pdfjs as any).OPS?.save ?? 2;
            const RESTORE_OP = (pdfjs as any).OPS?.restore ?? 3;
            const TRANSFORM_OP = (pdfjs as any).OPS?.transform ?? 11;
            const PAINT_IMAGE_OP = (pdfjs as any).OPS?.paintImageXObject ?? 82;
            const PAINT_INLINE_IMAGE_OP = (pdfjs as any).OPS?.paintInlineImageXObject ?? 83;

            const ctmStack: any[] = [];
            let currentTransform = [1, 0, 0, 1, 0, 0];
            for (let i = 0; i < fnArray.length; i++) {
              const fn = fnArray[i];
              if (fn === SAVE_OP) ctmStack.push([...currentTransform]);
              else if (fn === RESTORE_OP) { if (ctmStack.length > 0) currentTransform = ctmStack.pop(); }
              else if (fn === TRANSFORM_OP) {
                const matrix = argsArray[i];
                if (matrix && matrix.length >= 6) {
                  const [a1, b1, c1, d1, e1, f1] = currentTransform;
                  const [a2, b2, c2, d2, e2, f2] = matrix;
                  currentTransform = [
                    a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1,
                  ];
                }
              } else if (fn === PAINT_IMAGE_OP || fn === PAINT_INLINE_IMAGE_OP) {
                const [a, b, c, d, tx, ty] = currentTransform;
                const pdfWidth = Math.sqrt(a * a + b * b);
                const pdfHeight = Math.sqrt(c * c + d * d);
                const left = tx;
                // Since this uses the base unscaled page transform for viewport...
                const top = (baseViewport.height - ty - pdfHeight);
                if (pdfWidth < 20 || pdfHeight < 20 || (pdfWidth > baseViewport.width * 0.9 && pdfHeight > baseViewport.height * 0.9)) continue;
                // Add tiny offset padding just in case
                extractedImages.push({ left, top, pdfWidth, pdfHeight });
              }
            }
          } catch(e) {
            console.error("Failed to parse PDF images", e);
          }

          try {
            await renderTask.promise;
          } catch (err: any) {
            if (
              err?.name === "RenderingCancelledException" || 
              err?.message?.includes("cancelled") ||
              err?.message?.includes("Rendering cancelled") ||
              String(err).includes("Rendering cancelled") ||
              String(err).includes("cancelled")
            ) {
               console.log("PDFJS page rendering cancelled safely.");
               return;
            }
            throw err;
          } finally {
            if (activeRenderTaskRef.current === renderTask) {
              activeRenderTaskRef.current = null;
            }
          }

          if (currentCallId !== renderPageRef.current) return;

          let bgImage: any;
          try {
            bgImage = new FabricImage(tempCanvas, {
              selectable: false,
              evented: false,
              scaleX: 1 / renderScale,
              scaleY: 1 / renderScale,
              left: 0,
              top: 0,
              originX: "left",
              originY: "top",
              objectCaching: false,
              data: { isBackground: true },
            });
          } catch {
            bgImage = await FabricImage.fromURL(
              tempCanvas.toDataURL("image/png"),
            );
            bgImage.set({
              selectable: false,
              evented: false,
              scaleX: 1 / renderScale,
              scaleY: 1 / renderScale,
              left: 0,
              top: 0,
              originX: "left",
              originY: "top",
              objectCaching: false,
              data: { isBackground: true },
            });
          }

          // Helper to inject the extracted layers
          // (Disabled image extraction rendering to prevent duplicates and keep original raster assets)

          if (stateRef.current.pageData[pageNum]) {
            await canvas.loadFromJSON(stateRef.current.pageData[pageNum]);
            if (currentCallId !== renderPageRef.current) return;
            
            // Remove any old backgrounds to avoid layering duplicates
            const objects = canvas.getObjects();
            objects.forEach((obj: any) => {
              if (obj.data?.isBackground) {
                canvas.remove(obj);
              }
            });
            
            canvas.add(bgImage);
            canvas.sendObjectToBack(bgImage);
            attachTextHandlers(canvas);
          } else {
            canvas.add(bgImage);
            canvas.sendObjectToBack(bgImage);
            
            // Add original images as transparent clickable boxes
            extractedImages.forEach((imgPos) => {
              const rect = new Rect({
                left: imgPos.left,
                top: imgPos.top,
                width: imgPos.pdfWidth,
                height: imgPos.pdfHeight,
                fill: "rgba(255, 255, 255, 0.01)", // almost transparent so it's clickable
                stroke: "transparent",
                strokeWidth: 0,
                strokeDashArray: [4, 4],
                selectable: true,
                hasControls: true,
                data: { isWhiteoutMask: true, isLogoWhiteoutMask: true },
              });
              canvas.add(rect);
            });
          }
        } else {
          if (stateRef.current.pageData[pageNum]) {
            await canvas.loadFromJSON(stateRef.current.pageData[pageNum]);
            if (currentCallId !== renderPageRef.current) return;
            attachTextHandlers(canvas);
          }
        }

        if (!stateRef.current.pageData[pageNum]) {
          const textContent = await page.getTextContent();
          if (currentCallId !== renderPageRef.current) return;
          const items = textContent.items as any[];

          const validItems = items.filter((item) => item.str.trim().length > 0);

          // OCR Fallback for scanned PDFs
          if (validItems.length === 0) {
            try {
              const imgUrl = tempCanvas.toDataURL("image/png");
              const worker = await Tesseract.createWorker("eng");
              const ret = await worker.recognize(imgUrl);
              await worker.terminate();
              
              if (currentCallId !== renderPageRef.current) return;

              if (ret.data && ret.data.words) {
                ret.data.words.forEach((word) => {
                  const left = word.bbox.x0 / renderScale;
                  const top = word.bbox.y0 / renderScale;
                  const width = (word.bbox.x1 - word.bbox.x0) / renderScale;
                  const height = (word.bbox.y1 - word.bbox.y0) / renderScale;
                  const fontSize = height;

                  items.push({
                    str: word.text + " ",
                    transform: [
                      fontSize,
                      0,
                      0,
                      fontSize,
                      left,
                      top + fontSize * 0.8,
                    ],
                    fontName: "Arial",
                    color: [0, 0, 0],
                    width: width,
                    height: fontSize,
                    fontWeight: 400,
                    isOCR: true,
                  });
                });
              }
            } catch (err) {
              console.error("OCR failed:", err);
            }
          }

          const currentScale = baseViewport.scale;
          const itemsWithCoords = items.map((item) => {
            let x = item.transform[4] * currentScale;
            let y = baseViewport.height - (item.transform[5] * currentScale);
            let fontSize = Math.sqrt(
              item.transform[0] * item.transform[0] +
              item.transform[1] * item.transform[1]
            ) * currentScale;

            if (item.isOCR) {
              x = item.transform[4];
              y = item.transform[5];
              fontSize = item.height;
            }

            return {
              ...item,
              tx: [item.transform[0], item.transform[1], item.transform[2], item.transform[3], x, y],
              fontSize,
              textWidth: item.isOCR ? item.width : item.width * currentScale,
              str: item.str,
              originalStr: item.str,
            };
          });

          // Sort primarily by Y, then by X. Use a stable threshold for Y.
          itemsWithCoords.sort((a, b) => {
            const yDiff = a.tx[5] - b.tx[5];
            if (Math.abs(yDiff) > 4) {
              return yDiff > 0 ? 1 : -1;
            }
            return a.tx[4] - b.tx[4];
          });

          const groupedItems: any[] = [];
          let currentGroup: any = null;

          itemsWithCoords.forEach((item) => {
            if (!item.str || !item.str.trim()) return;

            if (!currentGroup) {
              currentGroup = { ...item };
            } else {
              const yDiff = Math.abs(currentGroup.tx[5] - item.tx[5]);
              const isSameFont =
                currentGroup.fontName === item.fontName &&
                Math.abs(currentGroup.fontSize - item.fontSize) < 2;

              const space =
                item.tx[4] - (currentGroup.tx[4] + currentGroup.textWidth);

              if (
                yDiff < 4 &&
                isSameFont &&
                space > -currentGroup.fontSize * 0.2 &&
                space < currentGroup.fontSize * 0.25
              ) {
                const needsSpace =
                  space > currentGroup.fontSize * 0.1 &&
                  !currentGroup.str.endsWith(" ") &&
                  !item.str.startsWith(" ");
                const addSpace = needsSpace ? " " : "";
                currentGroup.str += addSpace + item.str;
                currentGroup.textWidth = item.tx[4] - currentGroup.tx[4] + item.textWidth;
              } else {
                groupedItems.push(currentGroup);
                currentGroup = { ...item };
              }
            }
          });
          if (currentGroup) {
            groupedItems.push(currentGroup);
          }

          const extractedBlocks: any[] = [];
          
          groupedItems.forEach((item) => {
            if (!item.str.trim()) return;

            const x = item.tx[4];
            const y = item.tx[5];
            const fontSize = item.fontSize;

            let fontName = item.fontName || "";
            if (page) {
              try {
                if (page.commonObjs && page.commonObjs.has(item.fontName)) {
                  const resFont = page.commonObjs.get(item.fontName);
                  if (resFont && resFont.name) fontName = resFont.name;
                } else if (page.objs && page.objs.has(item.fontName)) {
                  const resFont = page.objs.get(item.fontName);
                  if (resFont && resFont.name) fontName = resFont.name;
                }
              } catch (e) {
                console.warn("Font lookup failed:", e);
              }
            }
            const fontNameLower = fontName.toLowerCase();
            const isBold =
              fontNameLower.includes("bold") || 
              fontNameLower.includes("black") || 
              fontNameLower.includes("heavy") || 
              fontNameLower.includes("medium") || 
              fontNameLower.includes("semibold") || 
              fontNameLower.includes("w700") || 
              fontNameLower.includes("w600") || 
              fontNameLower.includes("w500") || 
              (item.fontWeight && item.fontWeight > 400);
            const isItalic =
              fontNameLower.includes("italic") ||
              fontNameLower.includes("oblique");

            let cleanedFontName = fontName;
            if (fontName.includes("+")) {
              cleanedFontName = fontName.split("+")[1];
            }
            cleanedFontName = cleanedFontName
              .replace(/-bold.*/i, "")
              .replace(/-italic.*/i, "")
              .replace(/-oblique.*/i, "")
              .replace(/mt.*/i, "")
              .replace(/ps.*/i, "");

            let resolvedFont = `"${cleanedFontName}", sans-serif`;
            if (fontNameLower.includes("calibri") || fontNameLower.includes("carlito")) {
              resolvedFont = `"${cleanedFontName}", "Calibri", "Carlito", "Segoe UI", sans-serif`;
            } else if (fontNameLower.includes("cambria") || fontNameLower.includes("caladea")) {
              resolvedFont = `"${cleanedFontName}", "Cambria", "Caladea", "Georgia", serif`;
            } else if (
              fontNameLower.includes("arial") ||
              fontNameLower.includes("helvet") ||
              fontNameLower.includes("verdana")
            ) {
              resolvedFont = `"${cleanedFontName}", Arial, "Helvetica Neue", Helvetica, sans-serif`;
            } else if (
              fontNameLower.includes("times") ||
              fontNameLower.includes("georgia") ||
              fontNameLower.includes("serif")
            ) {
              resolvedFont = `"${cleanedFontName}", "Times New Roman", Times, Georgia, serif`;
            } else if (
              fontNameLower.includes("courier") ||
              fontNameLower.includes("mono")
            ) {
              resolvedFont = `"${cleanedFontName}", "Courier New", Courier, monospace`;
            } else if (fontNameLower.includes("segoe")) {
              resolvedFont = `"${cleanedFontName}", "Segoe UI", "Segoe", sans-serif`;
            } else if (fontNameLower.includes("roboto")) {
              resolvedFont = `"${cleanedFontName}", Roboto, sans-serif`;
            }

            let color = "#000000";
            if (item.color && Array.isArray(item.color) && item.color.length >= 3) {
              const isNormalized = item.color.some((val: number) => val > 0 && val <= 1) && !item.color.some((val: number) => val > 1);
              const r = Math.min(255, Math.max(0, isNormalized ? Math.round(item.color[0] * 255) : Math.round(item.color[0])));
              const g = Math.min(255, Math.max(0, isNormalized ? Math.round(item.color[1] * 255) : Math.round(item.color[1])));
              const b = Math.min(255, Math.max(0, isNormalized ? Math.round(item.color[2] * 255) : Math.round(item.color[2])));
              color = `rgb(${r}, ${g}, ${b})`;
            } else if (item.g !== undefined) {
              const gVal = item.g <= 1 && item.g > 0 ? Math.round(item.g * 255) : Math.round(item.g);
              color = `rgb(${gVal}, ${gVal}, ${gVal})`;
            } else if (context) {
              // Direct high-res sampling of original text color from rendered canvas
              try {
                const sampleStartX = Math.round((x + Math.min(textWidth * 0.25, 20)) * renderScale);
                const sampleStartY = Math.round((y - fontSize * 0.45) * renderScale);
                if (sampleStartX >= 0 && sampleStartX < tempCanvas.width - 4 && sampleStartY >= 0 && sampleStartY < tempCanvas.height - 4) {
                  const sampleData = context.getImageData(sampleStartX, sampleStartY, 4, 4).data;
                  let darkest = 999;
                  let targetR = 0, targetG = 0, targetB = 0;
                  for (let i = 0; i < sampleData.length; i += 4) {
                    const r = sampleData[i];
                    const g = sampleData[i + 1];
                    const b = sampleData[i + 2];
                    const a = sampleData[i + 3];
                    if (a > 120) {
                      const lum = (r * 299 + g * 587 + b * 114) / 1000;
                      if (lum < darkest) {
                        darkest = lum;
                        targetR = r;
                        targetG = g;
                        targetB = b;
                      }
                    }
                  }
                  if (darkest < 220) {
                    color = `rgb(${targetR}, ${targetG}, ${targetB})`;
                  }
                }
              } catch {
                // Ignore canvas context read errors
              }
            }

            const textWidth = item.textWidth;
            const blockId = Math.random().toString(36).substring(7);

            // Multi-point sampling around the text block to get true paper/background color
            let sampledBgColor = "#ffffff";
            if (context) {
              const checkPoints = [
                { sx: Math.round((x - 2) * renderScale), sy: Math.round((y - fontSize - 2) * renderScale) },
                { sx: Math.round((x + textWidth + 2) * renderScale), sy: Math.round((y - fontSize - 2) * renderScale) },
                { sx: Math.round((x - 2) * renderScale), sy: Math.round((y + 2) * renderScale) },
              ];
              for (const pt of checkPoints) {
                if (pt.sx >= 0 && pt.sx < tempCanvas.width && pt.sy >= 0 && pt.sy < tempCanvas.height) {
                  try {
                    const pixel = context.getImageData(pt.sx, pt.sy, 1, 1).data;
                    const lum = (pixel[0] * 299 + pixel[1] * 587 + pixel[2] * 114) / 1000;
                    if (lum > 190 && pixel[3] > 0) {
                      sampledBgColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
                      break;
                    }
                  } catch {
                    // Ignore canvas sampling errors
                  }
                }
              }
            }
            
            extractedBlocks.push({
              id: blockId,
              text: item.str,
              left: x,
              top: y - fontSize,
              width: textWidth,
              height: fontSize,
              fontSize: fontSize,
              fontFamily: resolvedFont,
              fontWeight: isBold ? "bold" : "normal",
              fontStyle: isItalic ? "italic" : "normal",
              color: color,
              isOriginal: true,
              originalText: item.str,
              originalColor: color,
              originalFontSize: fontSize,
              originalFontWeight: isBold ? "bold" : "normal",
              originalFontStyle: isItalic ? "italic" : "normal",
              bgColor: sampledBgColor,
              originalTx4: x,
              originalTx5: y,
              originalFontName: fontName,
              originalTransform: item.transform,
              isDeleted: false,
            });
          });
          
          // --- AUTOMATIC IMAGE/LOGO/PHOTO EXTRACTION PRE-LOAD COMPLETED ---

          setState(prev => ({
            ...prev,
            textData: {
              ...prev.textData,
              [pageNum]: extractedBlocks
            }
          }));

          attachTextHandlers(canvas);
        } else {
          attachTextHandlers(canvas);
        }

        // Cleanup page of PDFJS
        if (page.cleanup) {
          page.cleanup();
        }

        const hideControls = (obj: any) => {
          if (!obj) return;
          obj.set({
            hasBorders: false,
            hasControls: false,
          });
        };

        const showControls = (obj: any) => {
          if (!obj || obj.data?.isBackground || obj.data?.isWhiteout) return;
          obj.set({
            hasBorders: true,
            hasControls: true,
            borderColor: "rgba(33, 150, 243, 0.85)",
            cornerColor: "#ffffff",
            cornerStrokeColor: "rgba(33, 150, 243, 0.95)",
            cornerSize: 8,
            cornerStyle: "circle",
            transparentCorners: false,
          });
        };

        canvas.on("object:modified", (e: any) => {
          savePageState();
          if (e.target) showControls(e.target);
          canvas.renderAll();
        });
        canvas.on("object:added", (e: any) => {
          savePageState();
          if (e.target) showControls(e.target);
          canvas.renderAll();
        });
        canvas.on("object:removed", savePageState);

        const handleSelection = (e: any) => {
          const obj = e.selected?.[0] || e.target;
          if (!obj) return;
          showControls(obj);
          const currentZoom = stateRef.current.zoom;
          const cssScaleX = canvas.getElement().clientWidth / canvas.getWidth();
          const cssScaleY =
            canvas.getElement().clientHeight / canvas.getHeight();
          setState((prev) => ({
            ...prev,
            selectedObject: obj,
            showFloatingMenu: !!obj && !(obj as any).data?.isWhiteout && !(obj as any).data?.isBackground,
            floatingMenuPos: {
              x: obj.left * currentZoom * cssScaleX,
              y: (obj.top - 50) * currentZoom * cssScaleY,
            },
          }));
        };

        canvas.on("selection:created", handleSelection);
        canvas.on("selection:updated", handleSelection);

        canvas.on("selection:cleared", () => {
          setState((prev) => ({
            ...prev,
            selectedObject: null,
            showFloatingMenu: false,
          }));
        });

        canvas.on("mouse:down", (e) => {
          const obj = e.target;
          if (obj && !obj.data?.isBackground && !obj.data?.isWhiteout) {
            showControls(obj);
            canvas.renderAll();
          }
        });

        canvas.on("mouse:up", () => {
          const obj = canvas.getActiveObject();
          if (obj) {
            showControls(obj);
            canvas.requestRenderAll();
          }
        });

        canvas.on("object:moving", (e: any) => {
          const obj = e.target;
          showControls(obj);
        });

        canvas.on("object:scaling", (e: any) => {
          const obj = e.target;
          showControls(obj);
        });

        canvas.on("object:rotating", (e: any) => {
          const obj = e.target;
          showControls(obj);
        });

        if (currentCallId !== renderPageRef.current) return;
        canvas.renderAll();
      } catch (err: any) {
        if (
          err?.name !== 'RenderingCancelledException' && 
          !err?.message?.includes('cancelled') &&
          !String(err).includes('cancelled')
        ) {
          console.error("Error rendering page:", err);
        }
      } finally {
        isRenderingRef.current = false;
        setState((prev) => ({ ...prev, isProcessing: false }));
      }
    };
    useEffect(() => {
      if (!fabricCanvas.current) return;
      const canvas = fabricCanvas.current;
      const isEditMode = state.tool === "select" || state.tool === "text";

      canvas.getObjects().forEach((obj) => {
        if (!(obj as any).data?.isBackground) {
          obj.set({
            selectable: isEditMode,
            evented:
              isEditMode ||
              state.tool === "signature" ||
              state.tool === "select",
            // If we're in drawing mode, objects shouldn't catch mouse events
            // so we can draw "through" them if needed, or simply avoid accidental selections
          });

          // Exceptions: drawing tools should keep objects non-evented
          if (["draw", "highlight", "redact", "erase"].includes(state.tool)) {
            obj.set({ evented: false });
          } else {
            obj.set({ evented: true });
          }
        }
      });
      canvas.renderAll();
    }, [state.tool]);

    useEffect(() => {
      if (initialFile) {
        const file = Array.isArray(initialFile) ? initialFile[0] : initialFile;
        setPdfFile(file);
        setPasswordError("");
        setShowPassword(false);
        setIsDecrypting(false);
        if (fabricCanvas.current) {
          fabricCanvas.current.dispose();
          fabricCanvas.current = null;
        }
        setState({
          currentPage: 1,
          zoom: 1,
          tool: "select",
          isProcessing: true,
          history: [],
          historyIndex: -1,
          pageData: {},
          deletedPages: [],
          pageOrder: [],
          selectedObject: null,
          showSearch: false,
          searchQuery: "",
          replaceQuery: "",
          thumbnails: [],
          isDarkMode: false,
          exportFormat: "pdf",
          compressionLevel: 0.7,
          isPasswordProtected: false,
          password: "",
          eraserWidth: 20,
          showFloatingMenu: false,
          floatingMenuPos: { x: 0, y: 0 },
          textData: {},
          editingText: null,
        });
        loadPdf(file, "");
      } else {
        // Reset state when initialFile is null
        setPdfFile(null);
        pdfDocRef.current = null;
        setPasswordError("");
        setIsDecrypting(false);
        if (fabricCanvas.current) {
          fabricCanvas.current.dispose();
          fabricCanvas.current = null;
        }
        setState({
          currentPage: 1,
          zoom: 1,
          tool: "select",
          isProcessing: false,
          history: [],
          historyIndex: -1,
          pageData: {},
          deletedPages: [],
          pageOrder: [],
          selectedObject: null,
          showSearch: false,
          searchQuery: "",
          replaceQuery: "",
          thumbnails: [],
          isDarkMode: false,
          exportFormat: "pdf",
          compressionLevel: 0.7,
          isPasswordProtected: false,
          password: "",
          eraserWidth: 20,
          showFloatingMenu: false,
          floatingMenuPos: { x: 0, y: 0 },
          textData: {},
          editingText: null,
        });
      }
    }, [initialFile]);

    const isPasswordError = (error: any) => {
      if (!error) return false;
      const name = String(error.name || "");
      const msg = String(error.message || "");
      const code = error.code;
      return (
        name === "PasswordException" ||
        name.toLowerCase().includes("password") ||
        msg.toLowerCase().includes("password") ||
        msg.toLowerCase().includes("encrypted") ||
        code === 1 || // pdfjs.PasswordResponses.NEED_PASSWORD
        code === 2    // pdfjs.PasswordResponses.INCORRECT_PASSWORD
      );
    };

    const attemptPdfUnlock = async (
      rawArrayBuffer: ArrayBuffer,
      enteredPassword?: string
    ): Promise<{ pdf: any; workingPassword: string }> => {
      const candidates: string[] = [];
      if (enteredPassword !== undefined && enteredPassword !== null && enteredPassword !== "") {
        // 1. Exact entered password
        candidates.push(enteredPassword);

        // 2. Trimmed password (fixes clipboard trailing space/newline from WhatsApp, Gmail, etc.)
        const trimmed = enteredPassword.trim();
        if (trimmed && !candidates.includes(trimmed)) {
          candidates.push(trimmed);
        }

        // 3. Unquoted password (e.g. "secret" -> secret)
        const unquoted = enteredPassword.replace(/^["'`]|["'`]$/g, "").trim();
        if (unquoted && !candidates.includes(unquoted)) {
          candidates.push(unquoted);
        }

        // 4. Uppercase variant (e.g. Aadhaar / PAN / Bank statement passwords typed in lowercase)
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
        candidates.push("");
      }

      let lastError: any = null;

      for (const pwd of candidates) {
        try {
          // CRITICAL: PDF.js transfers the buffer to the Web Worker. Always slice a fresh copy!
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
              updatePassword(new Error("Incorrect password"));
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

    const loadPdf = (file: File, password?: string) => {
      const hasProvidedPassword = Boolean(password && password.trim());
      if (hasProvidedPassword) {
        setIsDecrypting(true);
      } else {
        setState((prev) => ({
          ...prev,
          isProcessing: true,
        }));
      }
      setPasswordError("");

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const rawBuffer = e.target?.result as ArrayBuffer;
          if (!rawBuffer || rawBuffer.byteLength === 0) {
            throw new Error("Unable to read PDF file data.");
          }

          const { pdf, workingPassword } = await attemptPdfUnlock(rawBuffer, password);
          pdfDocRef.current = pdf;

          const order = Array.from({ length: pdf.numPages }, (_, i) => i + 1);

          // Generate page 1 thumbnail immediately so editor opens without delay
          const newThumbnails: string[] = [];
          try {
            const page1 = await pdf.getPage(1);
            const vp1 = page1.getPageViewport ? page1.getPageViewport({ scale: 0.5 }) : page1.getViewport({ scale: 0.5 });
            const c1 = document.createElement("canvas");
            c1.width = vp1.width;
            c1.height = vp1.height;
            const ctx1 = c1.getContext("2d");
            if (ctx1) {
              await (page1 as any).render({ canvasContext: ctx1, viewport: vp1 }).promise;
              newThumbnails.push(c1.toDataURL("image/jpeg", 0.8));
              c1.width = 0;
              c1.height = 0;
            }
          } catch (tErr) {
            console.warn("Non-fatal first thumbnail error:", tErr);
          }

          // Asynchronously render remaining thumbnails for multi-page documents so all pages are visible
          if (pdf.numPages > 1) {
            setTimeout(async () => {
              for (let pageIdx = 2; pageIdx <= pdf.numPages; pageIdx++) {
                try {
                  const p = await pdf.getPage(pageIdx);
                  const vp = p.getViewport({ scale: 0.35 });
                  const tc = document.createElement("canvas");
                  tc.width = vp.width;
                  tc.height = vp.height;
                  const tCtx = tc.getContext("2d");
                  if (tCtx) {
                    await (p as any).render({ canvasContext: tCtx, viewport: vp }).promise;
                    const thumbUrl = tc.toDataURL("image/jpeg", 0.75);
                    setState((prev) => {
                      const updated = [...prev.thumbnails];
                      updated[pageIdx - 1] = thumbUrl;
                      return { ...prev, thumbnails: updated };
                    });
                    tc.width = 0;
                    tc.height = 0;
                  }
                } catch (e) {
                  // Non-fatal thumbnail error
                }
              }
            }, 80);
          }

          let initialZoom = 1;
          userAdjustedZoomRef.current = false;
          try {
            if (wrapperRef.current) {
              const wrapperWidth = wrapperRef.current.clientWidth;
              if (wrapperWidth > 150) {
                const containerWidth = Math.min(950, wrapperWidth) - 48;
                const firstPage = await pdf.getPage(1);
                const firstPageViewport = firstPage.getViewport({ scale: 1.0 });
                if (firstPageViewport.width > 0) {
                  const scaleWidth = containerWidth / firstPageViewport.width;
                  // Comfortably fit page width to enable full natural vertical scrolling
                  initialZoom = Math.min(1.2, Math.max(0.65, Math.floor(scaleWidth * 100) / 100));
                }
              }
            }
          } catch (zoomErr) {
            console.warn("Non-fatal error calculating initial zoom:", zoomErr);
          }

          setState((prev) => ({
            ...prev,
            thumbnails: newThumbnails,
            isProcessing: false,
            currentPage: 1,
            zoom: initialZoom,
            isPasswordProtected: false,
            password: workingPassword || prev.password || "",
            textData: {},
            pageData: {},
            deletedPages: [],
            pageOrder: order,
            history: [],
            historyIndex: -1,
            editingText: null,
          }));
          setIsDecrypting(false);
          setPasswordError("");
          setDocLoadVersion((v) => v + 1);

          // Force page 1 render after loading completes
          setTimeout(() => {
            renderPage(1);
          }, 80);
        } catch (error: any) {
          setIsDecrypting(false);
          if (isPasswordError(error)) {
            setState((prev) => ({
              ...prev,
              isPasswordProtected: true,
              isProcessing: false,
            }));
            if (hasProvidedPassword) {
              setPasswordError("Incorrect password. Please verify Caps Lock and try again.");
            } else {
              setPasswordError("");
            }
          } else {
            console.error("Error loading PDF:", error);
            setState((prev) => ({ ...prev, isProcessing: false, isPasswordProtected: false }));
          }
        }
      };
      reader.readAsArrayBuffer(file);
    };

    const handlePasswordSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const entered = state.password;
      if (!entered || !entered.trim()) {
        setPasswordError("Please enter the password to unlock this PDF.");
        return;
      }
      const targetFile = pdfFile || (initialFile ? (Array.isArray(initialFile) ? initialFile[0] : initialFile) : null);
      if (targetFile) {
        setPdfFile(targetFile);
        loadPdf(targetFile, entered);
      } else {
        setPasswordError("PDF file reference not found. Please re-upload.");
      }
    };

    useEffect(() => {
      if (fabricCanvas.current && originalDimensions.current.width > 0) {
        const canvas = fabricCanvas.current;
        canvas.setDimensions({
          width: originalDimensions.current.width * state.zoom,
          height: originalDimensions.current.height * state.zoom,
        });
        canvas.setZoom(state.zoom);
      }
    }, [state.zoom]);

    useEffect(() => {
      const container = wrapperRef.current;
      if (!container) return;
      let resizeTimeout: NodeJS.Timeout;
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && entry.contentRect.width > 0) {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            if (originalDimensions.current.width > 0 && originalDimensions.current.height > 0) {
              // Only auto-fit width if the user has not manually adjusted zoom
              if (!userAdjustedZoomRef.current) {
                const wrapperWidth = entry.contentRect.width;
                const containerWidth = Math.min(950, wrapperWidth) - 48;
                if (containerWidth > 0) {
                  const scaleWidth = containerWidth / originalDimensions.current.width;
                  const scale = Math.min(1.2, Math.max(0.65, Math.round(scaleWidth * 100) / 100));
                  setState((prev) => {
                    if (Math.abs(scale - prev.zoom) > 0.04) {
                      return { ...prev, zoom: scale };
                    }
                    return prev;
                  });
                }
              }
            }
          }, 150);
        }
      });
      observer.observe(container);
      return () => {
        clearTimeout(resizeTimeout);
        observer.disconnect();
      };
    }, []);

    // Pinch-to-zoom support for mobile touch devices
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let initialDistance = 0;
      let initialZoom = 1;

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dx = t1.clientX - t2.clientX;
          const dy = t1.clientY - t2.clientY;
          initialDistance = Math.sqrt(dx * dx + dy * dy);
          initialZoom = stateRef.current.zoom;
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && initialDistance > 0) {
          e.preventDefault();
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dx = t1.clientX - t2.clientX;
          const dy = t1.clientY - t2.clientY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > 5) {
            const factor = distance / initialDistance;
            const newZoom = Math.min(3.0, Math.max(0.3, initialZoom * factor));

            setState((prev) => {
              if (Math.abs(prev.zoom - newZoom) > 0.01) {
                return { ...prev, zoom: parseFloat(newZoom.toFixed(2)) };
              }
              return prev;
            });
          }
        }
      };

      const handleTouchEnd = (e: TouchEvent) => {
        if (e.touches.length < 2) {
          initialDistance = 0;
        }
      };

      container.addEventListener("touchstart", handleTouchStart, { passive: false });
      container.addEventListener("touchmove", handleTouchMove, { passive: false });
      container.addEventListener("touchend", handleTouchEnd, { passive: true });

      return () => {
        container.removeEventListener("touchstart", handleTouchStart);
        container.removeEventListener("touchmove", handleTouchMove);
        container.removeEventListener("touchend", handleTouchEnd);
      };
    }, []);

    useEffect(() => {
      if (pdfDocRef.current) {
        renderPage(state.currentPage);
      }
    }, [state.currentPage, state.zoom, docLoadVersion]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          // If we are typing in an input field, do nothing
          if (
            document.activeElement?.tagName === "INPUT" ||
            document.activeElement?.tagName === "TEXTAREA"
          ) {
            return;
          }
          if (fabricCanvas.current) {
            const activeObject = fabricCanvas.current.getActiveObject();
            if (activeObject) {
              // Only delete if it's not being actively edited
              if ((activeObject as any).isEditing) {
                return;
              }
              const activeObjects = fabricCanvas.current.getActiveObjects();
              if (activeObjects.length) {
                activeObjects.forEach((obj) =>
                  fabricCanvas.current!.remove(obj),
                );
                fabricCanvas.current.discardActiveObject();
                fabricCanvas.current.requestRenderAll();
                savePageState();
              }
            }
          }
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [savePageState]);

    useEffect(() => {
      if (
        fabricCanvas.current &&
        state.tool === "erase" &&
        fabricCanvas.current.freeDrawingBrush
      ) {
        fabricCanvas.current.freeDrawingBrush.width = state.eraserWidth;
      }
    }, [state.eraserWidth, state.tool]);

    const addText = () => {
      if (!fabricCanvas.current) return;
      fabricCanvas.current.isDrawingMode = false;
      const text = new IText("Type something...", {
        left: 100 / state.zoom,
        top: 100 / state.zoom,
        fontFamily: "Arial",
        fontSize: 24,
        fill: state.isDarkMode ? "#ffffff" : "#000000",
        hasControls: false,
        hasBorders: false,
      });

      text.on("changed", savePageState);
      text.on("editing:exited", savePageState);

      text.on("mousedblclick", () => {
        const currentState = stateRef.current;
        if (currentState.tool === "select" || currentState.tool === "text") {
          const cssScaleX =
            fabricCanvas.current!.getElement().clientWidth /
            fabricCanvas.current!.getWidth();
          const cssScaleY =
            fabricCanvas.current!.getElement().clientHeight /
            fabricCanvas.current!.getHeight();
          const finalScaleX = currentState.zoom * cssScaleX;
          const finalScaleY = currentState.zoom * cssScaleY;

          setState((prev) => ({
            ...prev,
            editingText: {
              visible: true,
              text: text.text || "",
              left: (text.left || 0) * finalScaleX,
              top: (text.top || 0) * finalScaleY,
              width: (text.width || 0) * (text.scaleX || 1) * finalScaleX,
              height: (text.height || 0) * (text.scaleY || 1) * finalScaleY,
              fontSize: (text.fontSize || 12) * finalScaleY,
              fontFamily: text.fontFamily || "sans-serif",
              fontWeight: text.fontWeight || "normal",
              fontStyle: text.fontStyle || "normal",
              color: (text.fill as string) || "#000",
              targetObj: text,
              cssScaleY: cssScaleY,
            },
            showFloatingMenu: false,
          }));
        }
      });

      fabricCanvas.current.add(text);
      fabricCanvas.current.setActiveObject(text);

      const canvas = fabricCanvas.current;
      const cssScaleX = canvas.getElement().clientWidth / canvas.getWidth();
      const cssScaleY = canvas.getElement().clientHeight / canvas.getHeight();
      const finalScaleX = state.zoom * cssScaleX;
      const finalScaleY = state.zoom * cssScaleY;

      setState((prev) => ({
        ...prev,
        tool: "select",
        editingText: {
          visible: true,
          text: text.text || "",
          left: (text.left || 0) * finalScaleX,
          top: (text.top || 0) * finalScaleY,
          width: (text.width || 0) * (text.scaleX || 1) * finalScaleX,
          height: (text.height || 0) * (text.scaleY || 1) * finalScaleY,
          fontSize: (text.fontSize || 12) * finalScaleY,
          fontFamily: text.fontFamily || "sans-serif",
          fontWeight: text.fontWeight || "normal",
          fontStyle: text.fontStyle || "normal",
          color: (text.fill as string) || "#000",
          targetObj: text,
          cssScaleY: cssScaleY,
        },
      }));
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
        setState((prev) => ({ ...prev, tool: "select" }));
      };
      reader.readAsDataURL(file);
    };

    const replaceSelectedImage = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !fabricCanvas.current || !state.selectedObject) return;

      const reader = new FileReader();
      reader.onload = async (f) => {
        const canvas = fabricCanvas.current!;
        const currentObj = state.selectedObject;
        
        try {
          const newImg = await FabricImage.fromURL(f.target?.result as string);
          
          // Match position, scale, rotation and other properties of old selected object
          newImg.set({
            left: currentObj.left,
            top: currentObj.top,
            angle: currentObj.angle,
            scaleX: (currentObj.width * currentObj.scaleX) / newImg.width,
            scaleY: (currentObj.height * currentObj.scaleY) / newImg.height,
            originX: currentObj.originX,
            originY: currentObj.originY,
            flipX: currentObj.flipX,
            flipY: currentObj.flipY,
            skewX: currentObj.skewX,
            skewY: currentObj.skewY,
          });

          // Replace in canvas
          if ((currentObj as any).data?.isLogoWhiteoutMask || (currentObj as any).data?.isWhiteoutMask) {
            currentObj.set({
              fill: "rgba(255, 255, 255, 1)",
              strokeWidth: 0,
              data: { ...((currentObj as any).data || {}), isWhiteoutElement: true }
            });
            canvas.add(newImg);
            canvas.sendObjectToBack(newImg);
            canvas.sendObjectToBack(currentObj);
            const bgImgObj = canvas.getObjects().find((o: any) => o.data?.isBackground) as any;
            if (bgImgObj) {
              canvas.sendObjectToBack(bgImgObj); // Background always at back
            }
          } else {
            canvas.remove(currentObj);
            canvas.add(newImg);
          }
          
          canvas.setActiveObject(newImg);
          canvas.renderAll();
          
          // Save state and update selectedObj in react state
          savePageState();
          setState((prev) => ({ ...prev, selectedObject: newImg }));
        } catch (err) {
          console.error("Failed to replace image", err);
        }
      };
      reader.readAsDataURL(file);
      
      // Reset input value to allow triggering same file selection again
      e.target.value = "";
    };

    const extractAreaAsImage = async (rect: any) => {
      if (!fabricCanvas.current || !rect) return;
      const canvas = fabricCanvas.current;

      // Find background image
      const bgImgObj = canvas.getObjects().find((o: any) => o.data?.isBackground) as any;
      if (!bgImgObj) return;

      const imgElement = bgImgObj.getElement();
      if (!imgElement) return;

      try {
        const left = rect.left;
        const top = rect.top;
        const width = rect.width * rect.scaleX;
        const height = rect.height * rect.scaleY;

        // Scale factors from canvas dimensions (originalDimensions) to high-res background image dimensions
        const scaleFactorX = imgElement.width / originalDimensions.current.width;
        const scaleFactorY = imgElement.height / originalDimensions.current.height;

        const cropX = left * scaleFactorX;
        const cropY = top * scaleFactorY;
        const cropW = width * scaleFactorX;
        const cropH = height * scaleFactorY;

        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext("2d");
        if (!cropCtx) return;

        cropCtx.drawImage(
          imgElement,
          cropX, cropY, cropW, cropH,
          0, 0, cropW, cropH
        );

        const dataUrl = cropCanvas.toDataURL("image/png");

        const croppedFabImg = await FabricImage.fromURL(dataUrl);
        croppedFabImg.set({
          left: left,
          top: top,
          scaleX: width / croppedFabImg.width,
          scaleY: height / croppedFabImg.height,
          selectable: true,
          evented: true,
          hasBorders: true,
          hasControls: true,
          data: { isExtractedSubArea: true }
        });

        // Mutate rect into a permanent solid whiteout block under the cropped image
        rect.set({
          fill: rect.fill || "#ffffff",
          stroke: "transparent",
          strokeWidth: 0,
          strokeDashArray: null,
          selectable: false,
          evented: false,
        });
        rect.data = rect.data || {};
        rect.data.isWhiteoutElement = true;

        // Keep bgImgObj first, and rect second in layers stack
        canvas.sendObjectToBack(bgImgObj);
        canvas.sendObjectToBack(rect);
        canvas.sendObjectToBack(bgImgObj);

        canvas.add(croppedFabImg);
        canvas.setActiveObject(croppedFabImg);
        canvas.renderAll();

        savePageState();

        setState((prev) => ({
          ...prev,
          selectedObject: croppedFabImg,
          showFloatingMenu: true,
        }));
        
        cropCanvas.width = 0;
        cropCanvas.height = 0;
      } catch (err) {
        console.error("Failed to extract area as image:", err);
      }
    };

    const addShape = (type: "check" | "cross" | "sticky" | "whiteout") => {
      if (!fabricCanvas.current) return;
      const canvas = fabricCanvas.current;
      canvas.isDrawingMode = false;

      let obj;
      const pos = { left: 100 / state.zoom, top: 100 / state.zoom };

      if (type === "check") {
        obj = new IText("✓", {
          ...pos,
          fontSize: 40,
          fill: "#22c55e",
          fontWeight: "bold",
        });
      } else if (type === "cross") {
        obj = new IText("✕", {
          ...pos,
          fontSize: 40,
          fill: "#ef4444",
          fontWeight: "bold",
        });
      } else if (type === "sticky") {
        const rect = new Rect({
          width: 150,
          height: 150,
          fill: "#fef08a",
          shadow: "rgba(0,0,0,0.2) 2px 2px 5px",
        });
        const text = new IText("Write note...", {
          fontSize: 14,
          left: 10,
          top: 10,
          width: 130,
        });
        obj = new Group([rect, text], { ...pos });
      } else if (type === "whiteout") {
        obj = new Rect({
          ...pos,
          width: 140,
          height: 70,
          fill: "#ffffff",
          stroke: "#3b82f6",
          strokeWidth: 1.5,
          strokeDashArray: [4, 4],
          rx: 1,
          ry: 1,
        });
        obj.set({
          data: { isWhiteoutMask: true }
        });
      }

      if (obj) {
        canvas.add(obj);
        canvas.setActiveObject(obj);
        canvas.renderAll();
        savePageState();
      }
    };

    const addArrow = () => {
      if (!fabricCanvas.current) return;
      const canvas = fabricCanvas.current;
      canvas.isDrawingMode = true;
      // Simple arrow implementation using a path or pencil with custom tip
      // For now, let's just set the tool and we can handle it in a custom brush if needed
      // Or just draw a pre-baked arrow
      const arrow = new Path("M 0 0 L 50 0 M 50 0 L 40 -10 M 50 0 L 40 10", {
        left: 100 / state.zoom,
        top: 100 / state.zoom,
        stroke: "#000000",
        strokeWidth: 3,
        fill: "transparent",
      });
      canvas.add(arrow);
      canvas.setActiveObject(arrow);
      canvas.renderAll();
      savePageState();
    };

    const togglePen = (isHighlight = false, isRedact = false) => {
      if (!fabricCanvas.current) return;
      const canvas = fabricCanvas.current;
      canvas.isDrawingMode = true;
      if (!canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush = new PencilBrush(canvas);
      }
      canvas.freeDrawingBrush.width = isHighlight || isRedact ? 20 : 5;
      canvas.freeDrawingBrush.color = isHighlight
        ? "rgba(255, 255, 0, 0.4)"
        : isRedact
          ? "#000000"
          : state.isDarkMode
            ? "#ffffff"
            : "#000000";
      setState((prev) => ({
        ...prev,
        tool: isHighlight ? "highlight" : isRedact ? "redact" : "draw",
      }));
    };

    const toggleEraser = () => {
      if (!fabricCanvas.current) return;
      const canvas = fabricCanvas.current;
      canvas.isDrawingMode = true;
      if (!canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush = new PencilBrush(canvas);
      }
      canvas.freeDrawingBrush.width = state.eraserWidth;
      // In Fabric.js we often use a specific eraser brush if available,
      // otherwise we just draw white, which effectively "erases" on white backgrounds.
      // But for PDF background, we might need a real eraser.
      // For now, let's keep it simple.
      canvas.freeDrawingBrush.color = "#ffffff";
      setState((prev) => ({ ...prev, tool: "erase" }));
    };

    const setSelectTool = () => {
      if (!fabricCanvas.current) return;
      fabricCanvas.current.isDrawingMode = false;
      setState((prev) => ({ ...prev, tool: "select" }));
    };

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (active.id !== over?.id) {
        setState((prev) => {
          const oldIndex = prev.pageOrder.indexOf(active.id as number);
          const newIndex = prev.pageOrder.indexOf(over?.id as number);
          return {
            ...prev,
            pageOrder: arrayMove(prev.pageOrder, oldIndex, newIndex),
          };
        });
      }
    };

    const handleSearchReplace = () => {
      if (!fabricCanvas.current || !state.searchQuery) return;
      const canvas = fabricCanvas.current;
      const objects = canvas.getObjects("i-text") as IText[];

      let count = 0;
      objects.forEach((obj) => {
        const originalColor = (obj as any).data?.originalColor || "#000000";
        if (obj.text.includes(state.searchQuery)) {
          obj.set(
            "text",
            obj.text.replace(
              new RegExp(state.searchQuery, "g"),
              state.replaceQuery,
            ),
          );
          obj.set({ fill: originalColor, backgroundColor: "#ffffff" });
          count++;
        }
      });

      if (count > 0) {
        canvas.renderAll();
        savePageState();
        setState((prev) => ({ ...prev, showSearch: false }));
      }
    };

    const exportPdf = async () => {
      const getImgBytes = async (src: string): Promise<ArrayBuffer> => {
        if (src.startsWith("data:")) {
          const parts = src.split(",");
          const byteString = atob(parts[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          return ab;
        } else {
          return await fetch(src).then((res) => res.arrayBuffer());
        }
      };

      if (!pdfFile) return;
      setState((prev) => ({ ...prev, isProcessing: true }));

      // 1. Commit active editing text if currently in the middle of typing
      if (state.editingText && (state.editingText as any).blockId) {
        const blkId = (state.editingText as any).blockId;
        const curText = state.editingText.text;
        const pageNum = state.currentPage;
        const pageBlocks = [...(state.textData[pageNum] || [])];
        const idx = pageBlocks.findIndex((b: any) => b.id === blkId);
        if (idx > -1) {
          pageBlocks[idx] = { ...pageBlocks[idx], text: curText };
          state.textData[pageNum] = pageBlocks;
        }
      }

      // 2. Capture live Fabric canvas objects for the active page
      let activeCanvasJson: any = null;
      if (fabricCanvas.current) {
        activeCanvasJson = fabricCanvas.current.toJSON(["data", "visible"]);
        if (activeCanvasJson && activeCanvasJson.objects) {
          activeCanvasJson.objects = activeCanvasJson.objects.filter((obj: any) => !obj.data?.isBackground);
        }
      }

      try {
        const existingPdfBytes = await pdfFile.arrayBuffer();
        let pdfDoc: any = null;
        try {
          pdfDoc = await PDFDocument.load(existingPdfBytes, {
            ignoreEncryption: true, 
          });
          // CRITICAL: pdf-lib does NOT decrypt PDF streams when ignoreEncryption is true!
          // Copying encrypted pages into an unencrypted PDFDocument causes PDF readers to fail parsing
          // the ciphertext content stream, producing a 100% BLANK page.
          // Therefore, if the document is encrypted, we MUST use PDF.js high-resolution decrypted rendering!
          if (pdfDoc.isEncrypted) {
            console.log("PDF is encrypted - switching to decrypted high-fidelity raster export");
            pdfDoc = null;
          }
        } catch (e) {
          console.warn("Could not load PDF with pdf-lib, falling back to PDF.js export:", e);
          pdfDoc = null;
        }
        const finalPdfDoc = await PDFDocument.create();
        finalPdfDoc.registerFontkit((fontkit as any).default || fontkit);
        const helveticaFont = await finalPdfDoc.embedFont(StandardFonts.Helvetica);
        const helveticaBoldFont = await finalPdfDoc.embedFont(StandardFonts.HelveticaBold);
        const helveticaObliqueFont = await finalPdfDoc.embedFont(StandardFonts.HelveticaOblique);
        const helveticaBoldObliqueFont = await finalPdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

        const timesRomanFont = await finalPdfDoc.embedFont(StandardFonts.TimesRoman);
        const timesRomanBoldFont = await finalPdfDoc.embedFont(StandardFonts.TimesRomanBold);
        const timesRomanItalicFont = await finalPdfDoc.embedFont(StandardFonts.TimesRomanItalic);
        const timesRomanBoldItalicFont = await finalPdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

        const courierFont = await finalPdfDoc.embedFont(StandardFonts.Courier);
        const courierBoldFont = await finalPdfDoc.embedFont(StandardFonts.CourierBold);
        const courierObliqueFont = await finalPdfDoc.embedFont(StandardFonts.CourierOblique);
        const courierBoldObliqueFont = await finalPdfDoc.embedFont(StandardFonts.CourierBoldOblique);

        const fontCache: Record<string, any> = {};

        const detectFontUrl = (text: string, isRegularOrBold?: boolean, fontFamily?: string): string | null => {
          // Hindi / Devanagari range is \u0900-\u097F
          if (/[\u0900-\u097F]/.test(text)) {
            const familyLower = (fontFamily || "").toLowerCase();
            const isSerif = familyLower.includes("serif") || 
                            familyLower.includes("aparajita") || 
                            familyLower.includes("times") || 
                            familyLower.includes("mangal") || 
                            familyLower.includes("devanagari-serif");
            if (isSerif) {
              return isRegularOrBold 
                ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSerifDevanagari/NotoSerifDevanagari-Bold.ttf"
                : "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSerifDevanagari/NotoSerifDevanagari-Regular.ttf";
            } else {
              return isRegularOrBold 
                ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Bold.ttf"
                : "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf";
            }
          }
          // Arabic (\u0600-\u06FF)
          if (/[\u0600-\u06FF]/.test(text)) {
            return isRegularOrBold
              ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoKufiArabic/NotoKufiArabic-Bold.ttf"
              : "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoKufiArabic/NotoKufiArabic-Regular.ttf";
          }
          // Tamil (\u0B80-\u0BFF)
          if (/[\u0B80-\u0BFF]/.test(text)) {
            return isRegularOrBold
              ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansTamil/NotoSansTamil-Bold.ttf"
              : "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansTamil/NotoSansTamil-Regular.ttf";
          }
          // Telugu (\u0C00-\u0C7F)
          if (/[\u0C00-\u0C7F]/.test(text)) {
            return isRegularOrBold
              ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Bold.ttf"
              : "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Regular.ttf";
          }
          // Bengali (\u0980-\u09FF)
          if (/[\u0980-\u09FF]/.test(text)) {
            return isRegularOrBold
              ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansBengali/NotoSansBengali-Bold.ttf"
              : "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansBengali/NotoSansBengali-Regular.ttf";
          }
          // Thai (\u0E00-\u0E7F)
          if (/[\u0E00-\u0E7F]/.test(text)) {
            return isRegularOrBold
              ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansThai/NotoSansThai-Bold.ttf"
              : "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf";
          }
          // CJK (Chinese, Japanese, Korean)
          if (/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/.test(text)) {
            return isRegularOrBold
              ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/Japanese/NotoSansCJKjp-Bold.otf"
              : "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf";
          }
          // General non-ASCII/non-Latin characters (Cyrillic, Greek, Hebrew, etc.)
          if (/[^\u0000-\u00FF]/.test(text)) {
            return isRegularOrBold
              ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf"
              : "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";
          }
          return null;
        };

        for (const pageNum of state.pageOrder) {
          if (state.deletedPages.includes(pageNum)) continue;

          let copiedPage: any;
          const pdfjsPage = await pdfDocRef.current.getPage(pageNum);
          const viewport = pdfjsPage.getViewport({ scale: 1.0 });

          let isPageVectorCopied = false;
          if (pdfDoc && !pdfDoc.isEncrypted) {
            try {
              const [page] = await finalPdfDoc.copyPages(pdfDoc, [
                pageNum - 1,
              ]);
              copiedPage = finalPdfDoc.addPage(page);
              isPageVectorCopied = true;
            } catch (copyErr) {
              console.warn(`Vector copy failed for page ${pageNum}, falling back to high-res render:`, copyErr);
              isPageVectorCopied = false;
            }
          }

          if (!isPageVectorCopied) {
            // Decrypted high-resolution export for encrypted/protected PDFs or unsupported formats (300 DPI Lossless)
            copiedPage = finalPdfDoc.addPage([viewport.width, viewport.height]);
            const renderScale = 4.0; // 300 DPI, ultra-sharp vector-grade clarity
            const renderViewport = pdfjsPage.getViewport({ scale: renderScale });
            const tempCanvas = document.createElement("canvas");
            const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true })!;
            tempCanvas.width = renderViewport.width;
            tempCanvas.height = renderViewport.height;

            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = "high";

            // Fill solid white background so transparency doesn't produce black background
            tempCtx.fillStyle = "#ffffff";
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

            // CRITICAL: Render PDF.js page with ALL text and graphics enabled (never mute fillText/strokeText!)
            await pdfjsPage.render({ canvasContext: tempCtx, viewport: renderViewport }).promise;

            // Whiteout rectangles for modified or deleted text directly on the high-res canvas
            const pageTexts = state.textData[pageNum] || [];
            for (const textBlock of pageTexts) {
              const isModified = textBlock.isDeleted || 
                                 textBlock.text !== textBlock.originalText || 
                                 textBlock.color !== textBlock.originalColor || 
                                 textBlock.fontSize !== (textBlock.originalFontSize || textBlock.fontSize) ||
                                 textBlock.fontWeight !== (textBlock.originalFontWeight || textBlock.fontWeight) ||
                                 textBlock.fontStyle !== (textBlock.originalFontStyle || textBlock.fontStyle);

              if (textBlock.isOriginal && isModified) {
                const pad = 1.5 * renderScale;
                tempCtx.fillStyle = textBlock.bgColor || "#ffffff";
                tempCtx.fillRect(
                  textBlock.left * renderScale - pad,
                  textBlock.top * renderScale - pad,
                  textBlock.width * renderScale + pad * 2,
                  textBlock.height * renderScale + pad * 2
                );
              }
            }

            const imgData = tempCanvas.toDataURL("image/png");
            const img = await finalPdfDoc.embedPng(imgData);
            copiedPage.drawImage(img, {
              x: 0,
              y: 0,
              width: viewport.width,
              height: viewport.height,
            });
          }

          // 1. Loop over HTML text overlays to add them to PDF FIRST, so they are embedded exactly in the background layer
          const texts = state.textData[pageNum] || [];
          const runPageTexts = async () => {
             for (const textBlock of texts) {
             const finalTextBlockText = textBlock.text;
             const isModified = textBlock.isDeleted || 
                                finalTextBlockText !== textBlock.originalText || 
                                textBlock.color !== textBlock.originalColor || 
                                textBlock.fontSize !== (textBlock.originalFontSize || textBlock.fontSize) ||
                                textBlock.fontWeight !== (textBlock.originalFontWeight || textBlock.fontWeight) ||
                                textBlock.fontStyle !== (textBlock.originalFontStyle || textBlock.fontStyle);

             // If vector page was copied, white out the original PDF text
             if (textBlock.isOriginal && isModified && isPageVectorCopied) {
                const padLeft = 1;
                const padRight = 1;
                const padBottom = 2;
                const padTop = 1;
                const boxBottom = textBlock.top + textBlock.fontSize + padBottom;
                const boxTop = textBlock.top - padTop;
                
                const [whiteoutX, whiteoutY] = viewport.convertToPdfPoint(
                   textBlock.left - padLeft, 
                   boxBottom
                );
                copiedPage.drawRectangle({
                   x: whiteoutX,
                   y: whiteoutY,
                   width: textBlock.width + padLeft + padRight,
                   height: boxBottom - boxTop,
                   color: textBlock.bgColor ? (() => { const match = textBlock.bgColor.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/); return match ? rgb(parseInt(match[1], 10) / 255, parseInt(match[2], 10) / 255, parseInt(match[3], 10) / 255) : rgb(1, 1, 1); })() : rgb(1, 1, 1),
                });
             }

             if (textBlock.isDeleted) continue;

             if (!textBlock.isOriginal || isModified) {
               let fontToUse = helveticaFont;
               const weightVal = typeof textBlock.fontWeight === "number"
                 ? textBlock.fontWeight
                 : parseInt(String(textBlock.fontWeight), 10) || 400;
               const isBold = textBlock.fontWeight === "bold" || textBlock.fontWeight === "semibold" || textBlock.fontWeight === "medium" || weightVal > 400;

               // Load custom Unicode/language font dynamically if needed
               const textToDraw = reshapeTextForPdf(finalTextBlockText);
               const customFontUrl = detectFontUrl(textToDraw, isBold, textBlock.fontFamily);
               if (customFontUrl) {
                 try {
                   if (!fontCache[customFontUrl]) {
                     const fontResp = await fetch(customFontUrl);
                     if (fontResp.ok) {
                       const fontBytes = await fontResp.arrayBuffer();
                       fontCache[customFontUrl] = await finalPdfDoc.embedFont(fontBytes);
                     }
                   }
                   if (fontCache[customFontUrl]) {
                     fontToUse = fontCache[customFontUrl];
                   }
                 } catch (fontErr) {
                   console.warn(`Could not load custom font ${customFontUrl}:`, fontErr);
                 }
               } else {
                 const isItalic = textBlock.fontStyle === "italic" || textBlock.fontStyle === "oblique";
                 const famLower = (textBlock.fontFamily || "").toLowerCase();
                 const isSerif = famLower.includes("times") || 
                                 famLower.includes("serif") || 
                                 famLower.includes("cambria") || 
                                 famLower.includes("georgia") || 
                                 famLower.includes("garamond") || 
                                 famLower.includes("caladea") || 
                                 famLower.includes("roman") || 
                                 famLower.includes("minion");
                 const isMono = famLower.includes("courier") || 
                                famLower.includes("mono") || 
                                famLower.includes("consolas") || 
                                famLower.includes("code") || 
                                famLower.includes("typewriter");

                 if (isSerif) {
                   if (isBold && isItalic) fontToUse = timesRomanBoldItalicFont;
                   else if (isBold) fontToUse = timesRomanBoldFont;
                   else if (isItalic) fontToUse = timesRomanItalicFont;
                   else fontToUse = timesRomanFont;
                 } else if (isMono) {
                   if (isBold && isItalic) fontToUse = courierBoldObliqueFont;
                   else if (isBold) fontToUse = courierBoldFont;
                   else if (isItalic) fontToUse = courierObliqueFont;
                   else fontToUse = courierFont;
                 } else {
                   if (isBold && isItalic) fontToUse = helveticaBoldObliqueFont;
                   else if (isBold) fontToUse = helveticaBoldFont;
                   else if (isItalic) fontToUse = helveticaObliqueFont;
                   else fontToUse = helveticaFont;
                 }
               }

               let r = 0, g = 0, b = 0;
               if (textBlock.color && textBlock.color.startsWith("rgb")) {
                  const m = textBlock.color.match(/\d+/g);
                  if (m && m.length >= 3) {
                     r = Number(m[0]) / 255;
                     g = Number(m[1]) / 255;
                     b = Number(m[2]) / 255;
                  }
               } else if (textBlock.color && textBlock.color.startsWith("#")) {
                  r = (parseInt(textBlock.color.slice(1, 3), 16) || 0) / 255;
                  g = (parseInt(textBlock.color.slice(3, 5), 16) || 0) / 255;
                  b = (parseInt(textBlock.color.slice(5, 7), 16) || 0) / 255;
               }
               
               // Clone exact font metrics: Fit edited text smoothly into original bounding box,
               // auto-calculating correct text dimensions and size scaling based on embedded font measurements.
               let drawFontSize = textBlock.fontSize;
               if (textBlock.isOriginal && textBlock.originalText && textBlock.originalText.trim().length > 0) {
                 try {
                   const originalWidth = textBlock.width;
                   const calculatedWidth = fontToUse.widthOfTextAtSize(textToDraw, textBlock.fontSize);
                   if (calculatedWidth > 0 && originalWidth > 0) {
                     const widthRatio = originalWidth / calculatedWidth;
                     const lengthRatio = textToDraw.length / textBlock.originalText.length;
                     
                     // If the text content is similar or slightly changed, auto-scale font size
                     // to perfectly match the original visual boundaries of the Document.
                     if (Math.abs(lengthRatio - 1) < 0.12) {
                       drawFontSize = textBlock.fontSize * Math.min(1.04, Math.max(0.92, widthRatio));
                     } else {
                       // Prevent overflowing next column or alignment breaks for significantly edited text
                       if (calculatedWidth > originalWidth) {
                         drawFontSize = textBlock.fontSize * Math.max(0.72, Math.min(1.0, widthRatio));
                       }
                     }
                   }
                 } catch (metricErr) {
                   console.warn("Failed clone exact font metrics match:", metricErr);
                 }
               }

               // Restore baseline to exact CSS y if available to prevent vertical shifting drifting
               let convertedX = 0;
               let convertedY = 0;
               if (textBlock.originalTx4 !== undefined && textBlock.originalTx5 !== undefined) {
                 const exactConverted = viewport.convertToPdfPoint(textBlock.originalTx4, textBlock.originalTx5);
                 convertedX = exactConverted[0];
                 convertedY = exactConverted[1];
               } else {
                 const pdfBaselineY = textBlock.top + textBlock.fontSize * 0.8;
                 const converted = viewport.convertToPdfPoint(textBlock.left, pdfBaselineY);
                 convertedX = converted[0];
                 convertedY = converted[1];
               }
               const drawX = convertedX;
               const drawY = convertedY;

                try {
                  copiedPage.drawText(textToDraw, {
                     x: drawX,
                     y: drawY,
                     size: drawFontSize,
                     font: fontToUse,
                     color: rgb(r, g, b),
                  });
                } catch (drawError) {
                  console.warn("Failed drawing text with custom/selected font, trying fallback...", drawError);
                  // Clean up string to pure basic ASCII if it cannot be encoded at all
                  try {
                    const cleanedText = textToDraw.replace(/[^\x00-\x7F]/g, "?");
                    copiedPage.drawText(cleanedText, {
                       x: drawX,
                       y: drawY,
                       size: drawFontSize,
                       font: helveticaFont,
                       color: rgb(r, g, b),
                    });
                  } catch (fallbackError) {
                    console.error("Even drawing fallback text failed:", fallbackError);
                  }
                }

             }
          }
          };
          await runPageTexts();

          // 2. Draw user-placed Fabric objects (photos, signatures, shapes, drawings)
          const data = (pageNum === state.currentPage && activeCanvasJson) 
            ? activeCanvasJson 
            : (state.pageData[pageNum] || { objects: [] });

          if (data && data.objects && data.objects.length > 0) {
            // Check for path objects (freehand drawings, signatures, eraser strokes, highlighters)
            const pathObjects = data.objects.filter((o: any) => o.type === "path" && o.visible !== false);
            if (pathObjects.length > 0) {
              try {
                const overlayScale = 2.0;
                const overlayCanvas = document.createElement("canvas");
                overlayCanvas.width = viewport.width * overlayScale;
                overlayCanvas.height = viewport.height * overlayScale;
                const oCtx = overlayCanvas.getContext("2d");
                if (oCtx) {
                  oCtx.scale(overlayScale, overlayScale);
                  for (const pObj of pathObjects) {
                    if (Array.isArray(pObj.path)) {
                      oCtx.save();
                      oCtx.translate(pObj.left || 0, pObj.top || 0);
                      oCtx.scale(pObj.scaleX || 1, pObj.scaleY || 1);
                      if (pObj.angle) {
                        oCtx.rotate((pObj.angle * Math.PI) / 180);
                      }
                      oCtx.globalAlpha = pObj.opacity !== undefined ? pObj.opacity : 1;
                      oCtx.strokeStyle = pObj.stroke || "#000000";
                      oCtx.lineWidth = pObj.strokeWidth || 1;
                      oCtx.lineCap = (pObj.strokeLineCap as CanvasLineCap) || "round";
                      oCtx.lineJoin = (pObj.strokeLineJoin as CanvasLineJoin) || "round";
                      if (pObj.fill && pObj.fill !== "transparent") {
                        oCtx.fillStyle = pObj.fill;
                      }

                      oCtx.beginPath();
                      for (const cmd of pObj.path) {
                        const type = cmd[0];
                        if (type === "M") oCtx.moveTo(cmd[1], cmd[2]);
                        else if (type === "L") oCtx.lineTo(cmd[1], cmd[2]);
                        else if (type === "Q") oCtx.quadraticCurveTo(cmd[1], cmd[2], cmd[3], cmd[4]);
                        else if (type === "C") oCtx.bezierCurveTo(cmd[1], cmd[2], cmd[3], cmd[4], cmd[5], cmd[6]);
                        else if (type === "Z") oCtx.closePath();
                      }
                      if (pObj.fill && pObj.fill !== "transparent") {
                        oCtx.fill();
                      }
                      if (pObj.stroke && pObj.stroke !== "transparent") {
                        oCtx.stroke();
                      }
                      oCtx.restore();
                    }
                  }
                  const overlayImgBytes = await getImgBytes(overlayCanvas.toDataURL("image/png"));
                  const overlayEmbedded = await finalPdfDoc.embedPng(overlayImgBytes);
                  copiedPage.drawImage(overlayEmbedded, {
                    x: 0,
                    y: 0,
                    width: viewport.width,
                    height: viewport.height,
                  });
                }
              } catch (pathErr) {
                console.warn("Failed drawing path overlay:", pathErr);
              }
            }

            // Draw other Fabric objects: text, images, rects, circles
            for (const obj of data.objects) {
              if (obj.visible === false) continue;
              if (obj.type === "path") continue; // Handled via high-fidelity overlay
              if (obj.type === "image" && !obj.selectable) continue;

              const pdfCoords = viewport.convertToPdfPoint(obj.left, obj.top);
              const pdfX = pdfCoords[0];
              const pdfY = pdfCoords[1];

              if (obj.type === "i-text" || obj.type === "text") {
                const textToDraw = obj.text || "";
                let fontToUse = helveticaFont;
                const isBold = obj.fontWeight === "bold" || (typeof obj.fontWeight === "number" && obj.fontWeight > 400);
                const isItalic = obj.fontStyle === "italic" || obj.fontStyle === "oblique";
                
                if (isBold && isItalic) fontToUse = helveticaBoldObliqueFont;
                else if (isBold) fontToUse = helveticaBoldFont;
                else if (isItalic) fontToUse = helveticaObliqueFont;

                let r = 0, g = 0, b = 0;
                if (obj.fill && typeof obj.fill === "string") {
                  if (obj.fill.startsWith("rgba")) {
                    const m = obj.fill.match(/[\d.]+/g);
                    if (m && m.length >= 3) {
                      r = Number(m[0]) / 255; g = Number(m[1]) / 255; b = Number(m[2]) / 255;
                    }
                  } else if (obj.fill.startsWith("#")) {
                    r = (parseInt(obj.fill.slice(1, 3), 16) || 0) / 255;
                    g = (parseInt(obj.fill.slice(3, 5), 16) || 0) / 255;
                    b = (parseInt(obj.fill.slice(5, 7), 16) || 0) / 255;
                  }
                }
                
                try {
                  const drawFontSize = (obj.fontSize || 16) * (obj.scaleY || 1);
                  copiedPage.drawText(textToDraw, {
                    x: pdfX,
                    y: pdfY - (obj.height * (obj.scaleY || 1)) + ((obj.fontSize || 16) * 0.2),
                    size: drawFontSize,
                    font: fontToUse,
                    color: rgb(r, g, b),
                  });
                } catch (e) {
                  console.warn("Failed user added text", e);
                }
              } else if (obj.type === "image") {
                try {
                  const imgBytes = await getImgBytes(obj.src);
                  let embeddedImg: any;
                  try {
                    embeddedImg = await finalPdfDoc.embedPng(imgBytes);
                  } catch (ePng) {
                    try {
                      embeddedImg = await finalPdfDoc.embedJpg(imgBytes);
                    } catch (eJpg) {
                      console.error("Failed to embed PNG or JPG, skipping image: ", eJpg);
                      continue;
                    }
                  }
                  copiedPage.drawImage(embeddedImg, {
                    x: pdfX,
                    y: pdfY - obj.height * obj.scaleY,
                    width: obj.width * obj.scaleX,
                    height: obj.height * obj.scaleY,
                  });
                } catch (imgErr) {
                  console.error("Failed to process image object for export:", imgErr);
                }
              } else if (obj.type === "rect") {
                let rectColor = { r: 1, g: 1, b: 1 };
                let strokeColor = { r: 0, g: 0, b: 0 };
                const strokeWidth = obj.strokeWidth || 0;
                let opacity = obj.opacity || 1;

                if (obj.fill && typeof obj.fill === "string") {
                  if (obj.fill.startsWith("rgba")) {
                    const m = obj.fill.match(/[\d.]+/g);
                    if (m && m.length >= 4) {
                      rectColor = { r: Number(m[0]) / 255, g: Number(m[1]) / 255, b: Number(m[2]) / 255 };
                      opacity = Number(m[3]);
                    }
                  } else if (obj.fill.startsWith("#")) {
                    rectColor = {
                      r: (parseInt(obj.fill.slice(1, 3), 16) || 0) / 255,
                      g: (parseInt(obj.fill.slice(3, 5), 16) || 0) / 255,
                      b: (parseInt(obj.fill.slice(5, 7), 16) || 0) / 255,
                    };
                  }
                }

                if (obj.stroke && typeof obj.stroke === "string") {
                  if (obj.stroke.startsWith("rgba")) {
                    const m = obj.stroke.match(/[\d.]+/g);
                    if (m && m.length >= 4) {
                      strokeColor = { r: Number(m[0]) / 255, g: Number(m[1]) / 255, b: Number(m[2]) / 255 };
                      opacity = opacity === 1 ? Number(m[3]) : opacity;
                    }
                  } else if (obj.stroke.startsWith("#")) {
                    strokeColor = {
                      r: (parseInt(obj.stroke.slice(1, 3), 16) || 0) / 255,
                      g: (parseInt(obj.stroke.slice(3, 5), 16) || 0) / 255,
                      b: (parseInt(obj.stroke.slice(5, 7), 16) || 0) / 255,
                    };
                  }
                }

                if (obj.visible) {
                  const isMask = obj.data?.isWhiteoutMask || obj.data?.isLogoWhiteoutMask || obj.data?.isWhiteoutElement || obj.strokeDashArray;
                  const finalBorderColor = isMask ? undefined : (obj.stroke ? rgb(strokeColor.r, strokeColor.g, strokeColor.b) : undefined);
                  const finalBorderWidth = isMask ? 0 : strokeWidth;

                  copiedPage.drawRectangle({
                    x: pdfX,
                    y: pdfY - obj.height * obj.scaleY,
                    width: obj.width * obj.scaleX,
                    height: obj.height * obj.scaleY,
                    color: (obj.fill === "transparent" || obj.fill === "rgba(255, 255, 255, 0.01)") 
                      ? undefined : rgb(rectColor.r, rectColor.g, rectColor.b),
                    borderColor: finalBorderColor,
                    borderWidth: finalBorderWidth,
                    opacity: opacity,
                  });
                }
              } else if (obj.type === "circle") {
                let circleColor = { r: 1, g: 1, b: 1 };
                let strokeColor = { r: 0, g: 0, b: 0 };
                const strokeWidth = obj.strokeWidth || 0;
                let opacity = obj.opacity || 1;

                if (obj.fill && typeof obj.fill === "string") {
                  if (obj.fill.startsWith("rgba")) {
                    const m = obj.fill.match(/[\d.]+/g);
                    if (m && m.length >= 4) {
                      circleColor = { r: Number(m[0]) / 255, g: Number(m[1]) / 255, b: Number(m[2]) / 255 };
                      opacity = Number(m[3]);
                    }
                  } else if (obj.fill.startsWith("#")) {
                    circleColor = {
                      r: (parseInt(obj.fill.slice(1, 3), 16) || 0) / 255,
                      g: (parseInt(obj.fill.slice(3, 5), 16) || 0) / 255,
                      b: (parseInt(obj.fill.slice(5, 7), 16) || 0) / 255,
                    };
                  }
                }
                if (obj.stroke && typeof obj.stroke === "string") {
                  if (obj.stroke.startsWith("rgba")) {
                    const m = obj.stroke.match(/[\d.]+/g);
                    if (m && m.length >= 4) {
                      strokeColor = { r: Number(m[0]) / 255, g: Number(m[1]) / 255, b: Number(m[2]) / 255 };
                    }
                  } else if (obj.stroke.startsWith("#")) {
                    strokeColor = {
                      r: (parseInt(obj.stroke.slice(1, 3), 16) || 0) / 255,
                      g: (parseInt(obj.stroke.slice(3, 5), 16) || 0) / 255,
                      b: (parseInt(obj.stroke.slice(5, 7), 16) || 0) / 255,
                    };
                  }
                }

                const radius = (obj.radius || 20) * (obj.scaleX || 1);
                copiedPage.drawEllipse({
                  x: pdfX + radius,
                  y: pdfY - radius,
                  xScale: radius,
                  yScale: radius * ((obj.scaleY || 1) / (obj.scaleX || 1)),
                  color: (obj.fill === "transparent" || obj.fill === "rgba(255, 255, 255, 0.01)") 
                    ? undefined : rgb(circleColor.r, circleColor.g, circleColor.b),
                  borderColor: obj.stroke ? rgb(strokeColor.r, strokeColor.g, strokeColor.b) : undefined,
                  borderWidth: strokeWidth,
                  opacity: opacity,
                });
              }
            }
          }

        }

        const pdfBytes = await finalPdfDoc.save({
          useObjectStreams: state.compressionLevel > 0.5,
          addDefaultPage: false,
        });

        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        // Immediate direct browser download so the user receives their file without delay
        const baseName = (pdfFile?.name || "document").replace(/\.pdf$/i, "");
        const downloadName = `edited-${baseName}.pdf`;
        const link = document.createElement("a");
        link.href = url;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
        });

        setState((prev) => ({ ...prev, isProcessing: false }));
        onComplete(url);
      } catch (error) {
        console.error("Export Error:", error);
        setState((prev) => ({ ...prev, isProcessing: false }));
      }
    };

    return (
      <div
        className={`flex flex-col h-screen overflow-hidden bg-[#f0f2f5] font-sans ${state.isDarkMode ? "dark" : ""}`}
      >
        {/* Top Navbar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-50 shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={onReset}
            >
              <div className="w-8 h-8 bg-[#ff4b4b] rounded-lg flex items-center justify-center shadow-lg">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-gray-800 tracking-tight hidden sm:inline text-lg">
                LoveYouTools{" "}
                <span className="font-light text-gray-400">Editor</span>
              </span>
            </div>
            <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block" />
            <button className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-gray-500 hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200">
              <PlusCircle className="w-3.5 h-3.5" />
              More Tools
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button
                onClick={undo}
                disabled={state.historyIndex <= 0}
                className="p-1.5 text-gray-500 hover:bg-white hover:shadow-sm rounded-lg disabled:opacity-30 transition-all"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={state.historyIndex >= state.history.length - 1}
                className="p-1.5 text-gray-500 hover:bg-white hover:shadow-sm rounded-lg disabled:opacity-30 transition-all"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1 hidden lg:block" />

            <div className="hidden sm:flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button
                onClick={() => {
                  userAdjustedZoomRef.current = true;
                  setState((prev) => ({
                    ...prev,
                    zoom: Math.max(0.3, Math.round((prev.zoom - 0.1) * 100) / 100),
                  }));
                }}
                className="p-1.5 hover:bg-white rounded-lg shadow-none hover:shadow-sm text-gray-600 transition-all cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => {
                  userAdjustedZoomRef.current = true;
                  if (wrapperRef.current && originalDimensions.current.width > 0) {
                    const widthScale = (wrapperRef.current.clientWidth - 64) / originalDimensions.current.width;
                    setState(prev => ({ ...prev, zoom: Math.max(0.3, Math.min(3.0, Math.round(widthScale * 100) / 100)) }));
                  }
                }}
                className="p-1.5 hover:bg-white rounded-lg shadow-none hover:shadow-sm text-gray-600 transition-all cursor-pointer"
                title="Fit Width"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => {
                  userAdjustedZoomRef.current = true;
                  if (wrapperRef.current && originalDimensions.current.width > 0 && originalDimensions.current.height > 0) {
                    const widthScale = (wrapperRef.current.clientWidth - 64) / originalDimensions.current.width;
                    const heightScale = (wrapperRef.current.clientHeight - 64) / originalDimensions.current.height;
                    const scale = Math.min(widthScale, heightScale);
                    setState(prev => ({ ...prev, zoom: Math.max(0.3, Math.min(3.0, Math.round(scale * 100) / 100)) }));
                  }
                }}
                className="p-1.5 hover:bg-white rounded-lg shadow-none hover:shadow-sm text-gray-600 transition-all cursor-pointer"
                title="Fit Page"
              >
                <Minimize2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  userAdjustedZoomRef.current = true;
                  setState(prev => ({ ...prev, zoom: 1 }));
                }}
                className="px-2 font-black text-[10px] w-12 text-center text-gray-600 hover:text-black transition-all cursor-pointer"
                title="100% Zoom"
              >
                {Math.round(state.zoom * 100)}%
              </button>

              <button
                onClick={() => {
                  userAdjustedZoomRef.current = true;
                  setState((prev) => ({
                    ...prev,
                    zoom: Math.min(3.0, Math.round((prev.zoom + 0.1) * 100) / 100),
                  }));
                }}
                className="p-1.5 hover:bg-white rounded-lg shadow-none hover:shadow-sm text-gray-600 transition-all cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block" />

            <button
              onClick={exportPdf}
              disabled={state.isProcessing}
              className="flex items-center gap-2 px-3 py-2 sm:px-6 sm:py-2.5 bg-[#1a1a1a] hover:bg-black text-white rounded-full font-black text-[10px] uppercase tracking-widest shadow-xl hover:shadow-2xl transition-all active:scale-95 disabled:opacity-50 shrink-0"
            >
              {state.isProcessing ? (
                <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Download<span className="hidden sm:inline"> PDF</span></span>
            </button>
          </div>
        </header>

        {/* Main Toolbar */}
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-start md:justify-center px-4 z-40 shrink-0 shadow-sm overflow-x-auto no-scrollbar w-full">
          <div className="flex items-center gap-1 bg-gray-50/50 p-1 rounded-2xl border border-gray-100/50 min-w-max">
            <ToolButton
              active={state.tool === "select"}
              onClick={setSelectTool}
              icon={<MousePointer2 className="w-4 h-4" />}
              label="Select"
            />
            <ToolButton
              active={state.tool === "text"}
              onClick={() => {
                if (fabricCanvas.current)
                  fabricCanvas.current.isDrawingMode = false;
                setState((prev) => ({ ...prev, tool: "text" }));
              }}
              icon={<Type className="w-4 h-4" />}
              label="Edit PDF"
            />
            <ToolButton
              active={state.tool === "signature"}
              onClick={() => {
                if (fabricCanvas.current)
                  fabricCanvas.current.isDrawingMode = false;
                setState((prev) => ({ ...prev, tool: "signature" }));
              }}
              icon={<Pencil className="w-4 h-4" />}
              label="Sign"
            />
            <div className="h-6 w-px bg-gray-200 mx-2" />
            <ToolButton
              onClick={addText}
              icon={<Plus className="w-4 h-4" />}
              label="Add Text"
            />
            <ToolButton
              active={state.tool === "erase"}
              onClick={toggleEraser}
              icon={<Eraser className="w-4 h-4" />}
              label="Erase"
            />
            <ToolButton
              active={state.tool === "highlight"}
              onClick={() => togglePen(true)}
              icon={<Highlighter className="w-4 h-4" />}
              label="Highlight"
            />
            <ToolButton
              active={state.tool === "redact"}
              onClick={() => togglePen(false, true)}
              icon={<Shield className="w-4 h-4" />}
              label="Redact"
            />
            <div className="h-6 w-px bg-gray-200 mx-2" />
            <ToolButton
              onClick={() => imageInputRef.current?.click()}
              icon={<ImageIcon className="w-4 h-4" />}
              label="Image"
            />
            <ToolButton
              onClick={addArrow}
              icon={<PenTool className="w-4 h-4" />}
              label="Arrow"
            />
            <ToolButton
              active={state.tool === "draw"}
              onClick={() => togglePen(false, false)}
              icon={<PencilBrushIcon className="w-4 h-4" />}
              label="Draw"
            />
            <div className="h-6 w-px bg-gray-200 mx-2" />
            <ToolButton
              onClick={() => addShape("cross")}
              icon={<X className="w-4 h-4" />}
              label="Cross"
            />
            <ToolButton
              onClick={() => addShape("check")}
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Check"
            />
            <ToolButton
              onClick={() => addShape("sticky")}
              icon={<Square className="w-4 h-4" />}
              label="Sticky Note"
            />
            <ToolButton
              onClick={() => addShape("whiteout")}
              icon={<Eraser className="w-4 h-4 text-emerald-500" />}
              label="Whiteout"
            />
            <div className="h-6 w-px bg-gray-200 mx-2" />
            <ToolButton
              onClick={() =>
                setState((prev) => ({ ...prev, showSearch: !prev.showSearch }))
              }
              icon={<Search className="w-4 h-4" />}
              label="Search"
            />
            <ToolButton
              onClick={() => {}}
              icon={<MoreVertical className="w-4 h-4" />}
              label="More"
            />
          </div>

          {state.tool === "erase" && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100/80 rounded-2xl p-1.5 px-3 min-w-max text-rose-800 shadow-sm shrink-0 animate-in fade-in zoom-in-95 duration-200">
              <Eraser className="w-4 h-4 text-rose-500 animate-bounce" />
              <span className="text-xs font-bold font-sans">Eraser Size:</span>
              <input
                type="range"
                min="2"
                max="100"
                value={state.eraserWidth}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setState((prev) => ({ ...prev, eraserWidth: val }));
                }}
                className="w-24 md:w-32 h-1 rounded-lg appearance-none cursor-pointer bg-rose-200 accent-rose-600 focus:outline-none"
              />
              <span className="text-xs font-mono font-bold bg-rose-100/70 p-0.5 px-1.5 rounded-lg min-w-[36px] text-center">
                {state.eraserWidth}px
              </span>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Thumbnails Sidebar */}
          <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden lg:flex shrink-0 shadow-inner z-30">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Thumbnails ({state.pageOrder.length})
              </span>
              <div className="flex gap-1">
                <button className="p-1 px-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 text-[9px] font-black transition-colors uppercase">
                  Manage
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 pt-6 custom-scrollbar bg-white">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={state.pageOrder}
                  strategy={verticalListSortingStrategy}
                >
                  {state.pageOrder.map((id, index) => (
                    <SortableThumbnail
                      key={id}
                      id={id}
                      index={index}
                      thumb={state.thumbnails[id - 1]}
                      isActive={state.currentPage === id}
                      isDeleted={state.deletedPages.includes(id)}
                      onClick={() => {
                        setState((prev) => ({ ...prev, currentPage: id }));
                      }}
                      onDelete={(id: number) =>
                        setState((prev) => ({
                          ...prev,
                          deletedPages: prev.deletedPages.includes(id)
                            ? prev.deletedPages.filter((p) => p !== id)
                            : [...prev.deletedPages, id],
                        }))
                      }
                      onRotate={() => {}}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </aside>

          {/* Canvas Workspace */}
          <div 
            ref={wrapperRef} 
            className="preview-wrapper flex-1 w-full h-full overflow-auto bg-[#e4e7eb] dark:bg-[#111315] relative custom-scrollbar p-4 sm:p-6 md:p-8 select-none outline-none"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
              if (e.key === "PageDown" || (e.key === "ArrowDown" && e.altKey)) {
                if (state.currentPage < state.pageOrder.length) {
                  e.preventDefault();
                  userAdjustedZoomRef.current = true;
                  setState(prev => ({ ...prev, currentPage: prev.currentPage + 1 }));
                  wrapperRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                }
              } else if (e.key === "PageUp" || (e.key === "ArrowUp" && e.altKey)) {
                if (state.currentPage > 1) {
                  e.preventDefault();
                  userAdjustedZoomRef.current = true;
                  setState(prev => ({ ...prev, currentPage: prev.currentPage - 1 }));
                  wrapperRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                }
              }
            }}
          >
            <div className="w-max min-w-full min-h-full flex flex-col items-center justify-start pb-28">
              <div
                ref={containerRef}
                className="preview-container relative flex flex-col items-center shrink-0 py-2 text-left"
              >
              {/* Context Floating Menu */}
            <AnimatePresence>
              {state.showFloatingMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  style={{
                    position: "absolute",
                    left: `clamp(10px, ${state.floatingMenuPos.x}px, calc(100% - 240px))`,
                    top: `clamp(10px, ${state.floatingMenuPos.y > 50 ? state.floatingMenuPos.y : state.floatingMenuPos.y + 60}px, calc(100% - 70px))`,
                    zIndex: 100,
                  }}
                  className="flex items-center gap-1 bg-white border border-gray-200 shadow-[0_20px_50px_rgba(0,0,0,0.2)] rounded-2xl p-2 ring-1 ring-black/5 backdrop-blur-md"
                >
                  {(state.selectedObject?.type === 'i-text' || state.selectedObject?.type === 'text') && (
                    <>
                      <button
                        onClick={() => {
                          if (state.selectedObject && fabricCanvas.current) {
                            const text = state.selectedObject as any;
                            const canvas = fabricCanvas.current;
                            if (text.type === "text" || text.type === "i-text") {
                              text.set({ visible: false });
                              canvas.renderAll();
                              const cssScaleX =
                                canvas.getElement().clientWidth / canvas.getWidth();
                              const cssScaleY =
                                canvas.getElement().clientHeight /
                                canvas.getHeight();
                              const finalScaleX = state.zoom * cssScaleX;
                              const finalScaleY = state.zoom * cssScaleY;

                              setState((prev) => ({
                                ...prev,
                                editingText: {
                                  visible: true,
                                  text: text.text || "",
                                  left: (text.left || 0) * finalScaleX,
                                  top: (text.top || 0) * finalScaleY,
                                  width:
                                    (text.width || 0) *
                                    (text.scaleX || 1) *
                                    finalScaleX,
                                  height:
                                    (text.height || 0) *
                                    (text.scaleY || 1) *
                                    finalScaleY,
                                  fontSize: (text.fontSize || 12) * finalScaleY,
                                  fontFamily: text.fontFamily || "sans-serif",
                                  fontWeight: text.fontWeight || "normal",
                                  fontStyle: text.fontStyle || "normal",
                                  color:
                                    text.data?.originalColor || text.fill || "#000",
                                  targetObj: text,
                                  cssScaleY: cssScaleY,
                                },
                                showFloatingMenu: false,
                              }));
                            }
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-gray-100 text-gray-700 text-[10px] font-black uppercase transition-all"
                      >
                        <TypeIcon className="w-4 h-4 text-[#3b82f6]" />
                        Edit Text
                      </button>
                      <div className="h-6 w-px bg-gray-200 mx-1" />
                    </>
                  )}
                  {((state.selectedObject?.type === 'image') || (state.selectedObject?.type === 'rect' && ((state.selectedObject as any).data?.isWhiteoutMask || (state.selectedObject as any).data?.isLogoWhiteoutMask))) && (
                    <>
                      <button
                        onClick={() => replaceImageInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-emerald-55 text-emerald-600 text-[10px] font-black uppercase transition-all"
                        title="Replace Image"
                      >
                        <RefreshCw className="w-4 h-4 text-emerald-55 border-none" />
                        Replace Image
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Page Title Wrapper */}
            <div className="mb-10 text-center animate-in fade-in duration-700">
              <h2 className="text-2xl font-black text-gray-800 tracking-tight">
                {pdfFile?.name || "Untitled Document"}
              </h2>
              <div className="flex items-center justify-center gap-3 mt-3">
                <div className="h-px w-8 bg-gray-300" />
                <p className="text-[10px] font-black text-gray-400 space-x-2 uppercase tracking-[0.2em]">
                  <span>Page {state.currentPage}</span>
                  <span className="text-gray-300">•</span>
                  <span>{state.pageOrder.length} Total</span>
                </p>
                <div className="h-px w-8 bg-gray-300" />
              </div>
            </div>

            <div className="inline-block relative group perspective-1000 whitespace-normal text-left">
              {/* Complex Layered Shadow */}
              <div className="absolute -inset-1 bg-gradient-to-tr from-gray-400/20 to-gray-200/20 rounded-lg blur-2xl opacity-50 group-hover:opacity-80 transition duration-1000"></div>

              <div className="relative bg-white shadow-[0_50px_100px_rgba(0,0,0,0.15)] rounded-sm transition-all duration-500 ring-1 ring-black/5 overflow-visible">
                <canvas ref={canvasRef} className="block relative" style={{ zIndex: 1 }} />
                
                {/* HTML Text Layer */}
                {state.textData[state.currentPage] && (
                  <div 
                    className="absolute"
                    style={{
                      zIndex: 2,
                      top: 0,
                      left: 0,
                      width: originalDimensions.current.width * state.zoom,
                      height: originalDimensions.current.height * state.zoom,
                      pointerEvents: 'none'
                    }}
                  >
                    {state.textData[state.currentPage].map(block => {
                      const isModified = block.isDeleted || 
                                         block.text !== block.originalText || 
                                         block.color !== block.originalColor || 
                                         block.fontSize !== (block.originalFontSize || block.fontSize) ||
                                         block.fontWeight !== (block.originalFontWeight || block.fontWeight) ||
                                         block.fontStyle !== (block.originalFontStyle || block.fontStyle);
                      // Whiteout is active if modified OR if currently actively editing the block to avoid double/cluttered text
                      const showWhiteout = block.isOriginal && (isModified || state.editingText?.blockId === block.id);

                      if (block.isDeleted && !block.isOriginal) return null;

                      return (
                        <PixelPerfectBlock
                          key={block.id}
                          block={block}
                          state={state}
                          isModified={isModified}
                          showWhiteout={showWhiteout}
                          getFontFamilyForText={getFontFamilyForText}
                          setState={setState}
                          fabricCanvas={fabricCanvas}
                        />
                      );
                    })}
                  </div>
                )}

                {/* In-place editor for targetObj (Fabric text objects) */}
                {state.editingText && state.editingText.visible && state.editingText.targetObj && (
                  <input
                    type="text"
                    autoFocus
                    value={state.editingText.text || ""}
                    onChange={(e) => updateActiveTextData({ text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitAndCloseEditing();
                      }
                    }}
                    className="editable-text absolute outline-none rounded-md transition-shadow font-medium"
                    style={{
                      position: "absolute",
                      left: state.editingText.left,
                      top: state.editingText.top,
                      minWidth: Math.max(state.editingText.width + 24, 80),
                      height: Math.max(state.editingText.height || 26, 26),
                      lineHeight: "1.25",
                      padding: "2px 6px",
                      zIndex: 100,
                      color: state.editingText.color || "#000000",
                      caretColor: state.editingText.color || "#000000",
                      cursor: "text",
                      pointerEvents: "auto",
                      boxShadow: "0 0 0 2px #2563eb, 0 4px 14px rgba(0,0,0,0.18)",
                      backgroundColor: "#ffffff",
                      border: "1px solid #3b82f6",
                      fontSize: state.editingText.fontSize,
                      fontFamily: state.editingText.fontFamily,
                      fontWeight: state.editingText.fontWeight,
                      fontStyle: state.editingText.fontStyle,
                    }}
                  />
                )}

                {/* Floating Rich Text Editor Window */}
                {state.editingText && state.editingText.visible && (
                  <div
                    style={(() => {
                      const pageWidth = originalDimensions.current.width * state.zoom;
                      const toolbarWidth = 470;
                      const textTop = state.editingText.top;
                      const textLeft = state.editingText.left;
                      const textHeight = state.editingText.height || 26;

                      // Position above if there is space, otherwise place safely below the text
                      const shouldPlaceBelow = textTop < 125;
                      const calculatedTop = shouldPlaceBelow 
                        ? textTop + textHeight + 14 
                        : Math.max(10, textTop - 118);

                      // Ensure toolbar stays within horizontal canvas bounds
                      const calculatedLeft = Math.max(10, Math.min(textLeft - 10, Math.max(10, pageWidth - toolbarWidth - 10)));

                      return {
                        position: "absolute" as const,
                        left: calculatedLeft,
                        top: calculatedTop,
                        zIndex: 1000,
                        width: "min(470px, calc(100vw - 40px))",
                      };
                    })()}
                    className="floating-text-toolbar bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-700/90 shadow-[0_16px_48px_rgba(0,0,0,0.22)] rounded-2xl p-3 ring-1 ring-black/10 backdrop-blur-md flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150"
                  >
                    {/* Top Row: Direct Text Edit Field + Done / Delete / Close Actions */}
                    <div className="flex items-center gap-1.5 w-full">
                      <div className="flex items-center gap-2 flex-1 bg-gray-50 dark:bg-gray-800/80 rounded-xl px-2.5 py-1.5 border border-gray-200/80 dark:border-gray-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                        <TypeIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <input
                          type="text"
                          value={state.editingText.text || ""}
                          onChange={(e) => updateActiveTextData({ text: e.target.value })}
                          placeholder="Type or edit text here..."
                          className="w-full bg-transparent text-xs font-semibold text-gray-800 dark:text-gray-100 outline-none placeholder:text-gray-400"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitAndCloseEditing();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              commitAndCloseEditing();
                            }
                          }}
                        />
                      </div>

                      {/* Done / Save Button */}
                      <button
                        onClick={commitAndCloseEditing}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
                        title="Done (Commit changes)"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Done</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={deleteActiveText}
                        className="p-1.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all cursor-pointer shrink-0"
                        title="Delete this text block"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Close (X) */}
                      <button
                        onClick={commitAndCloseEditing}
                        className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer shrink-0"
                        title="Close editor"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Bottom Row: Typography Controls (Font Size, Weight, Italic, Color, Family) */}
                    <div className="flex items-center flex-wrap gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-800/80 text-xs">
                      {/* Font Size decrease / input / increase */}
                      <div className="flex items-center bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200/80 dark:border-gray-700 p-0.5">
                        <button
                          onClick={() => {
                            const curSize = Math.round(state.editingText.fontSize / state.zoom);
                            updateActiveTextData({ fontSize: Math.max(6, curSize - 1) * state.zoom });
                          }}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 transition-colors cursor-pointer"
                          title="Decrease Font Size"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          value={Math.round(state.editingText.fontSize / state.zoom)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (!isNaN(val) && val > 0) {
                              updateActiveTextData({ fontSize: val * state.zoom });
                            }
                          }}
                          className="w-8 text-center bg-transparent font-mono text-[11px] font-bold text-gray-700 dark:text-gray-200 outline-none"
                          title="Font Size"
                        />
                        <button
                          onClick={() => {
                            const curSize = Math.round(state.editingText.fontSize / state.zoom);
                            updateActiveTextData({ fontSize: (curSize + 1) * state.zoom });
                          }}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 transition-colors cursor-pointer"
                          title="Increase Font Size"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-0.5" />

                      {/* Quick Bold Toggle */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          const weight = state.editingText?.fontWeight;
                          const isOriginalBold = weight === "bold" || 
                                                 weight === "semibold" || 
                                                 weight === "medium" || 
                                                 weight === "700" || 
                                                 weight === "600" || 
                                                 weight === "500" || 
                                                 (typeof weight === "number" && weight > 400);
                          const newWeight = isOriginalBold ? "normal" : "bold";
                          updateActiveTextData({ fontWeight: newWeight });
                        }}
                        className={`p-1.5 rounded-xl font-black transition-all cursor-pointer ${
                          (state.editingText.fontWeight === "bold" || 
                           state.editingText.fontWeight === "700" || 
                           (typeof state.editingText.fontWeight === "number" && state.editingText.fontWeight > 400))
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                        title="Toggle Bold"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>

                      {/* Quick Italic Toggle */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          const newStyle = state.editingText?.fontStyle === "italic" ? "normal" : "italic";
                          updateActiveTextData({ fontStyle: newStyle });
                        }}
                        className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                          state.editingText.fontStyle === "italic"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                        title="Toggle Italic"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>

                      <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-0.5" />

                      {/* Text Color Picker & Presets */}
                      <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 p-1 rounded-xl border border-gray-200/80 dark:border-gray-700">
                        <label className="relative cursor-pointer flex items-center justify-center w-5 h-5 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 shadow-xs" title="Custom Text Color">
                          <input
                            type="color"
                            value={state.editingText.color || "#000000"}
                            onChange={(e) => updateActiveTextData({ color: e.target.value })}
                            className="absolute -top-2 -left-2 w-10 h-10 opacity-0 cursor-pointer"
                          />
                          <span 
                            className="w-full h-full block" 
                            style={{ backgroundColor: state.editingText.color || "#000000" }} 
                          />
                        </label>
                        {/* Quick Presets */}
                        {["#000000", "#dc2626", "#2563eb", "#16a34a"].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => updateActiveTextData({ color: preset })}
                            className={`w-3.5 h-3.5 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                              (state.editingText.color || "#000000").toLowerCase() === preset.toLowerCase()
                                ? "ring-2 ring-blue-500 scale-105 border-white"
                                : "border-gray-300 dark:border-gray-600"
                            }`}
                            style={{ backgroundColor: preset }}
                            title={preset}
                          />
                        ))}
                      </div>

                      <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-0.5" />

                      {/* Font Family selector */}
                      <select
                        value={state.editingText.fontFamily || "sans-serif"}
                        onChange={(e) => updateActiveTextData({ fontFamily: e.target.value })}
                        className="text-[11px] font-medium bg-gray-50 dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 rounded-xl px-2 py-1 text-gray-700 dark:text-gray-200 outline-none cursor-pointer max-w-[110px] truncate"
                        title="Font Family"
                      >
                        <option value="sans-serif">Sans-serif</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="Times New Roman, serif">Times New Roman</option>
                        <option value="Courier New, monospace">Courier New</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="Helvetica, sans-serif">Helvetica</option>
                      </select>
                    </div>
                  </div>
                )}

                <AnimatePresence>
                  {state.isProcessing && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px] z-30"
                    >
                      <div className="flex flex-col items-center gap-5">
                        <div className="relative">
                          <div className="w-16 h-16 border-4 border-gray-100 border-t-[#ff4b4b] rounded-full animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-[#ff4b4b] animate-pulse" />
                          </div>
                        </div>
                        <p className="text-[10px] font-black text-[#ff4b4b] uppercase tracking-[0.3em] animate-pulse">
                          Optimizing View...
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

              </div>
              <div className="h-16 shrink-0" />
            </div>
          </div>
        </div>

        {/* Floating Bottom Page & Zoom Controller */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 sm:gap-2.5 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md px-3 sm:px-4 py-2 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.18)] border border-gray-200/90 dark:border-gray-800 ring-1 ring-black/5 animate-in fade-in slide-in-from-bottom-3 duration-300">
          {/* Previous Page Button */}
          <button
            onClick={() => {
              if (state.currentPage > 1) {
                userAdjustedZoomRef.current = true;
                setState((prev) => ({ ...prev, currentPage: prev.currentPage - 1 }));
                wrapperRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            disabled={state.currentPage <= 1 || state.isProcessing}
            className="p-1.5 sm:p-2 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
            title="Previous Page (PageUp)"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Page Indicator & Direct Jump */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200/70 dark:border-gray-700 text-xs font-bold text-gray-700 dark:text-gray-200">
            <span className="text-[10px] uppercase font-black tracking-wider text-gray-400">Page</span>
            <input
              type="number"
              min="1"
              max={state.pageOrder.length || 1}
              value={state.currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= state.pageOrder.length) {
                  userAdjustedZoomRef.current = true;
                  setState((prev) => ({ ...prev, currentPage: val }));
                  wrapperRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              className="w-10 text-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg py-0.5 font-mono text-xs font-black text-[#ff4b4b] outline-none focus:ring-1 focus:ring-[#ff4b4b]"
            />
            <span className="text-gray-400 font-medium">/</span>
            <span className="font-mono text-xs font-bold text-gray-500 dark:text-gray-400">
              {state.pageOrder.length || 1}
            </span>
          </div>

          {/* Next Page Button */}
          <button
            onClick={() => {
              if (state.currentPage < state.pageOrder.length) {
                userAdjustedZoomRef.current = true;
                setState((prev) => ({ ...prev, currentPage: prev.currentPage + 1 }));
                wrapperRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            disabled={state.currentPage >= state.pageOrder.length || state.isProcessing}
            className="p-1.5 sm:p-2 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
            title="Next Page (PageDown)"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-0.5 sm:mx-1" />

          {/* Zoom Out */}
          <button
            onClick={() => {
              userAdjustedZoomRef.current = true;
              setState((prev) => ({ ...prev, zoom: Math.max(0.3, Math.round((prev.zoom - 0.1) * 100) / 100) }));
            }}
            className="p-1.5 sm:p-2 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95 cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {/* Zoom Percentage */}
          <button
            onClick={() => {
              userAdjustedZoomRef.current = true;
              setState((prev) => ({ ...prev, zoom: 1 }));
            }}
            className="px-2 py-1 rounded-lg text-xs font-mono font-black text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer min-w-[50px] text-center"
            title="Click to reset to 100% Zoom"
          >
            {Math.round(state.zoom * 100)}%
          </button>

          {/* Zoom In */}
          <button
            onClick={() => {
              userAdjustedZoomRef.current = true;
              setState((prev) => ({ ...prev, zoom: Math.min(3.0, Math.round((prev.zoom + 0.1) * 100) / 100) }));
            }}
            className="p-1.5 sm:p-2 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95 cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-0.5 sm:mx-1 hidden sm:block" />

          {/* Fit Width */}
          <button
            onClick={() => {
              userAdjustedZoomRef.current = true;
              if (wrapperRef.current && originalDimensions.current.width > 0) {
                const widthScale = (wrapperRef.current.clientWidth - 64) / originalDimensions.current.width;
                setState((prev) => ({ ...prev, zoom: Math.max(0.3, Math.min(3.0, Math.round(widthScale * 100) / 100)) }));
              }
            }}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
            title="Fit to Page Width"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit Width</span>
          </button>

          {/* Fit Page */}
          <button
            onClick={() => {
              userAdjustedZoomRef.current = true;
              if (wrapperRef.current && originalDimensions.current.width > 0 && originalDimensions.current.height > 0) {
                const widthScale = (wrapperRef.current.clientWidth - 64) / originalDimensions.current.width;
                const heightScale = (wrapperRef.current.clientHeight - 64) / originalDimensions.current.height;
                const scale = Math.min(widthScale, heightScale);
                setState((prev) => ({ ...prev, zoom: Math.max(0.3, Math.min(3.0, Math.round(scale * 100) / 100)) }));
              }
            }}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
            title="Fit Full Page"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Fit Page</span>
          </button>

          {/* Mobile / Tablet Thumbnails Drawer Toggle */}
          <button
            onClick={() => setShowMobileThumbnails(prev => !prev)}
            className="flex lg:hidden items-center gap-1 px-2.5 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded-xl text-gray-700 dark:text-gray-200 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ml-1"
            title="View All Pages"
          >
            <Layers className="w-3.5 h-3.5 text-[#ff4b4b]" />
            <span>Pages</span>
          </button>
        </div>

        {/* Mobile Thumbnails Slide-Over Modal */}
        <AnimatePresence>
          {showMobileThumbnails && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end lg:hidden"
              onClick={() => setShowMobileThumbnails(false)}
            >
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="w-72 max-w-[85vw] h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col p-4 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#ff4b4b]" />
                    <span className="text-xs font-black uppercase tracking-widest text-gray-700 dark:text-gray-200">
                      All Pages ({state.pageOrder.length})
                    </span>
                  </div>
                  <button
                    onClick={() => setShowMobileThumbnails(false)}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto py-4 space-y-4 custom-scrollbar">
                  {state.pageOrder.map((id) => (
                    <div
                      key={`mobile-thumb-${id}`}
                      onClick={() => {
                        userAdjustedZoomRef.current = true;
                        setState((prev) => ({ ...prev, currentPage: id }));
                        setShowMobileThumbnails(false);
                        wrapperRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`p-2 rounded-2xl border-2 transition-all cursor-pointer ${
                        state.currentPage === id
                          ? "border-[#ff4b4b] bg-red-50/50 dark:bg-red-950/20 shadow-md"
                          : "border-gray-200 dark:border-gray-800 hover:border-gray-300 bg-gray-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase text-gray-500">Page {id}</span>
                        {state.currentPage === id && (
                          <span className="w-2 h-2 rounded-full bg-[#ff4b4b]" />
                        )}
                      </div>
                      <div className="w-full aspect-[1/1.4] bg-white rounded-lg shadow-sm overflow-hidden flex items-center justify-center border border-gray-100">
                        {state.thumbnails[id - 1] ? (
                          <img
                            src={state.thumbnails[id - 1]}
                            alt={`Thumbnail page ${id}`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-gray-300">
                            <FileText className="w-6 h-6" />
                            <span className="text-[9px] font-bold">Page {id}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global UI Overlays */}
        <input
          type="file"
          ref={imageInputRef}
          className="hidden"
          accept="image/*"
          onChange={addImage}
        />
        <input
          type="file"
          ref={replaceImageInputRef}
          className="hidden"
          accept="image/*"
          onChange={replaceSelectedImage}
        />

        <AnimatePresence>
          {state.showSearch && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.9 }}
              className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-white rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.25)] border border-gray-200 p-8 z-50 w-full max-w-lg ring-1 ring-black/5 backdrop-blur-md"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-50 rounded-2xl flex items-center justify-center shadow-inner">
                    <Search className="w-5 h-5 text-[#ff4b4b]" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider">
                      Search & Replace
                    </h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                      Smart Text Layer Editing
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setState((prev) => ({ ...prev, showSearch: false }))
                  }
                  className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] ml-1">
                    Text to find
                  </label>
                  <input
                    type="text"
                    value={state.searchQuery}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        searchQuery: e.target.value,
                      }))
                    }
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-[#ff4b4b]/10 focus:border-[#ff4b4b] transition-all"
                    placeholder="Type words to search..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] ml-1">
                    Replace with
                  </label>
                  <input
                    type="text"
                    value={state.replaceQuery}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        replaceQuery: e.target.value,
                      }))
                    }
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-[#ff4b4b]/10 focus:border-[#ff4b4b] transition-all"
                    placeholder="Enter new text..."
                  />
                </div>
                <button
                  onClick={handleSearchReplace}
                  className="w-full py-4 bg-[#1a1a1a] text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all active:scale-[0.98] shadow-xl hover:shadow-2xl"
                >
                  Confirm Batch Replace
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {state.isPasswordProtected && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-md bg-white p-8 sm:p-10 rounded-[2.5rem] shadow-2xl border border-gray-100 flex flex-col items-center"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-50 text-[#ff4b4b] rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-[#ff4b4b]" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-800 mb-2 uppercase tracking-tight text-center">
                Protected PDF File
              </h2>
              <p className="text-sm font-medium text-gray-500 text-center mb-6 px-4 leading-relaxed">
                This PDF is encrypted with a password. Please enter the password to unlock, view, and edit the document.
              </p>

              {passwordError && (
                <div className="w-full mb-5 p-3.5 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-ping" />
                  <span>{passwordError}</span>
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="w-full space-y-4">
                <div className="relative w-full">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={state.password}
                    onChange={(e) => {
                      setPasswordError("");
                      setState((prev) => ({ ...prev, password: e.target.value }));
                    }}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={`w-full pl-5 pr-12 py-4 bg-gray-50 border ${
                      passwordError ? "border-red-400 ring-2 ring-red-400/20" : "border-gray-200"
                    } rounded-2xl outline-none focus:ring-4 focus:ring-[#ff4b4b]/10 focus:border-[#ff4b4b] transition-all text-center text-lg font-bold tracking-widest placeholder:tracking-normal placeholder:font-medium placeholder:text-gray-400`}
                    placeholder="Enter PDF password"
                    autoFocus
                    disabled={isDecrypting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1 rounded-lg transition-colors cursor-pointer"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 text-center font-medium">
                  Passwords are case-sensitive. Both uppercase and lowercase formats are tested automatically.
                </p>

                <button
                  type="submit"
                  disabled={isDecrypting || !state.password.trim()}
                  className="w-full py-4 bg-[#ff4b4b] hover:bg-[#e63e3e] text-white rounded-2xl font-black uppercase text-xs tracking-wider transition-all active:scale-[0.98] shadow-lg shadow-[#ff4b4b]/25 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isDecrypting ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin text-white" />
                      <span>Unlocking Document...</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4" />
                      <span>Unlock & View PDF</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onReset}
                  className="w-full py-2.5 text-gray-400 text-xs font-bold uppercase tracking-wider hover:text-gray-600 transition-colors cursor-pointer"
                >
                  Cancel & Choose Another File
                </button>
              </form>
            </motion.div>
          </div>
        )}

        <style>{`
          .no-scrollbar::-webkit-scrollbar {
             display: none;
          }
          .no-scrollbar {
             -ms-overflow-style: none;
             scrollbar-width: none;
          }
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #e2e8f0;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #cbd5e1;
          }
        `}</style>
      </div>
    );
  },
);

const ToolButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`p-2 px-3 rounded-2xl flex flex-col items-center gap-1.5 transition-all group shrink-0 active:scale-95 ${active ? "bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5" : "hover:bg-white/60"}`}
    title={label}
  >
    <div
      className={`transition-colors duration-300 ${active ? "text-[#ff4b4b] scale-110" : "text-gray-400 group-hover:text-gray-700"}`}
    >
      {icon}
    </div>
    <span
      className={`text-[8px] font-black uppercase tracking-[0.1em] transition-colors duration-300 ${active ? "text-gray-800" : "text-gray-300 group-hover:text-gray-500"}`}
    >
      {label}
    </span>
  </button>
);

const PencilBrushIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l5 5" />
    <path d="M11 11l1 1" />
  </svg>
);
