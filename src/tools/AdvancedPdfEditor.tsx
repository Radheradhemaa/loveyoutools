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
    if (lastExportedUrl) {
      const link = document.createElement("a");
      link.href = lastExportedUrl;
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
      renderToolbar={() => null}
    >
      {({ file, state, onComplete, onReset }) => {
        useEffect(() => {
          if (state === "BEFORE") {
            setLastExportedUrl(null);
          }
        }, [state]);

        useEffect(() => {
          setLastExportedUrl(null);
          if (file && file[0]) {
            setOriginalFilename(file[0].name);
          }
        }, [file]);

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

const PdfEditorWorkspace = React.forwardRef(
  ({ initialFile, onComplete, onReset }: any, ref) => {
    const { setIsFocusMode } = useFocusMode();
    const [pdfFile, setPdfFile] = useState<File | null>(null);
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
        const newEditingText = { ...prev.editingText, ...updates };
        const newTextData = { ...prev.textData };
        const pageBlocks = [...(newTextData[prev.currentPage] || [])];
        const idx = pageBlocks.findIndex(b => b.id === prev.editingText.blockId);
        if (idx > -1) {
          pageBlocks[idx] = { ...pageBlocks[idx], ...updates };
        }
        newTextData[prev.currentPage] = pageBlocks;
        return { ...prev, textData: newTextData, editingText: newEditingText };
      });
    };

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvas = useRef<Canvas | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const pdfDocRef = useRef<any>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const originalDimensions = useRef({ width: 0, height: 0 });

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
              text.set({ backgroundColor: "rgba(0, 123, 255, 0.1)" });
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
      if (!pdfDocRef.current || !canvasRef.current) return;
      setState((prev) => ({ ...prev, isProcessing: true, editingText: null }));

      try {
        const page = await pdfDocRef.current.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1.0 });
        originalDimensions.current = {
          width: baseViewport.width,
          height: baseViewport.height,
        };

        if (fabricCanvas.current) {
          fabricCanvas.current.dispose();
        }

        const canvas = new Canvas(canvasRef.current, {
          width: baseViewport.width * state.zoom,
          height: baseViewport.height * state.zoom,
          backgroundColor: "transparent",
          imageSmoothingEnabled: true,
        });

        // Optimize for mobile and high DPI
        const dpr = window.devicePixelRatio || 1;
        const renderScale = dpr * 2;
        canvas.setZoom(state.zoom);

        fabricCanvas.current = canvas;

        const renderViewport = page.getViewport({ scale: renderScale });

        const tempCanvas = document.createElement("canvas");
        const context = tempCanvas.getContext("2d");
        if (context) {
          tempCanvas.width = renderViewport.width;
          tempCanvas.height = renderViewport.height;
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";

          await (page as any).render({
            canvasContext: context,
            viewport: renderViewport,
            annotationMode: 0, // Disable annotations overlay
            textLayerMode: 0,
          }).promise;

          const bgImage = await FabricImage.fromURL(
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
            data: { isBackground: true },
          });
          canvas.add(bgImage);
          canvas.sendObjectToBack(bgImage);
        }

        if (state.pageData[pageNum]) {
          await canvas.loadFromJSON(state.pageData[pageNum]);
          attachTextHandlers(canvas);
        } else {
          const textContent = await page.getTextContent();
          let items = textContent.items as any[];

          let validItems = items.filter((item) => item.str.trim().length > 0);

          // OCR Fallback for scanned PDFs
          if (validItems.length === 0) {
            try {
              const imgUrl = tempCanvas.toDataURL("image/png");
              const worker = await Tesseract.createWorker("eng");
              const ret = await worker.recognize(imgUrl);
              await worker.terminate();

              if (ret.data && ret.data.words) {
                // Reconstruct Fabric objects from OCR
                ret.data.words.forEach((word) => {
                  // Tesseract provides bounding box in the rendered tempCanvas scale (which is renderScale)
                  // So we must scale it down by renderScale
                  const left = word.bbox.x0 / renderScale;
                  const top = word.bbox.y0 / renderScale;
                  const width = (word.bbox.x1 - word.bbox.x0) / renderScale;
                  const height = (word.bbox.y1 - word.bbox.y0) / renderScale;
                  const fontSize = height; // approximate

                  // Push as simulated text item
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

          // Sort primarily by Y, then by X
          itemsWithCoords.sort((a, b) => {
            const yDiff = a.tx[5] - b.tx[5];
            if (Math.abs(yDiff) > a.fontSize * 0.5) {
              return yDiff;
            }
            return a.tx[4] - b.tx[4];
          });

          const groupedItems: any[] = [];
          let currentGroup: any = null;

          itemsWithCoords.forEach((item) => {
            if (!item.str || (!item.str.trim() && item.textWidth === 0)) return; // Skip truly empty items

            if (!currentGroup) {
              currentGroup = { ...item };
            } else {
              const yDiff = Math.abs(currentGroup.tx[5] - item.tx[5]);
              const isSameFont =
                currentGroup.fontName === item.fontName &&
                Math.abs(currentGroup.fontSize - item.fontSize) < 2;

              // Calculate horizontal space between objects
              const space =
                item.tx[4] - (currentGroup.tx[4] + currentGroup.textWidth);

              // If they are on the same line, have the same font, and aren't too far apart horizontally
              if (
                yDiff < currentGroup.fontSize * 0.5 &&
                isSameFont &&
                space < currentGroup.fontSize * 2
              ) {
                const needsSpace =
                  space > currentGroup.fontSize * 0.2 &&
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

            const fontName = item.fontName || "";
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
            // Strip modifiers
            cleanedFontName = cleanedFontName
              .replace(/-bold.*/i, "")
              .replace(/-italic.*/i, "")
              .replace(/-oblique.*/i, "")
              .replace(/mt.*/i, "")
              .replace(/ps.*/i, "");

            let resolvedFont = `"${cleanedFontName}", sans-serif`;
            if (
              fontNameLower.includes("arial") ||
              fontNameLower.includes("helvet") ||
              fontNameLower.includes("verdana")
            ) {
              resolvedFont = `"${cleanedFontName}", Arial, Helvetica, sans-serif`;
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
            }

            const textWidth = item.textWidth;
            const blockId = Math.random().toString(36).substring(7);
            
            extractedBlocks.push({
              id: blockId,
              text: item.str,
              left: x,
              top: y - fontSize, // baseline aligns to bottom of div if height = fontSize and line-height = 1
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
              originalTx4: x,
              originalTx5: y,
              isDeleted: false,
            });

            const whiteoutRect = new Rect({
              left: x - 3,
              top: y - fontSize - 2,
              width: textWidth + 6,
              height: fontSize + 6,
              fill: "#ffffff",
              visible: false, // will turn true when text layer is edited
              selectable: false,
              evented: false,
              data: { isWhiteout: true, blockId: blockId },
            });
            canvas.add(whiteoutRect);
          });
          
          setState(prev => ({
            ...prev,
            textData: {
              ...prev.textData,
              [pageNum]: extractedBlocks
            }
          }));

          attachTextHandlers(canvas);
        }

        canvas.on("object:modified", savePageState);
        canvas.on("object:added", savePageState);
        canvas.on("object:removed", savePageState);
        canvas.on("selection:created", (e) => {
          const obj = e.selected?.[0];
          const currentZoom = stateRef.current.zoom;
          const cssScaleX = canvas.getElement().clientWidth / canvas.getWidth();
          const cssScaleY =
            canvas.getElement().clientHeight / canvas.getHeight();
          setState((prev) => ({
            ...prev,
            selectedObject: obj,
            showFloatingMenu:
              obj && (obj.type === "i-text" || obj.type === "text"),
            floatingMenuPos: obj
              ? {
                  x: obj.left * currentZoom * cssScaleX,
                  y: (obj.top - 50) * currentZoom * cssScaleY,
                }
              : prev.floatingMenuPos,
          }));
        });

        canvas.on("selection:cleared", () => {
          setState((prev) => ({
            ...prev,
            selectedObject: null,
            showFloatingMenu: false,
          }));
        });

        canvas.on("mouse:down", (e) => {
          const currentState = stateRef.current;
          if (currentState.tool === "text" && !e.target) {
            const pointer = e.scenePoint;
            
            setState((prev) => {
              const newTextData = { ...prev.textData };
              const pageBlocks = [...(newTextData[prev.currentPage] || [])];
              const newBlock = {
                id: Math.random().toString(36).substring(7),
                text: "Double click to edit",
                left: pointer.x,
                top: pointer.y - 12,
                width: 150,
                height: 24,
                fontSize: 24,
                fontFamily: "Arial",
                fontWeight: "normal",
                fontStyle: "normal",
                color: currentState.isDarkMode ? "#ffffff" : "#000000",
                isOriginal: false,
                isDeleted: false,
              };
              pageBlocks.push(newBlock as any);
              newTextData[prev.currentPage] = pageBlocks;
              return { ...prev, textData: newTextData, tool: "select" };
            });
          }
        });

        canvas.renderAll();
      } catch (err) {
        console.error("Error rendering page:", err);
      } finally {
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
          textData: {},
          editingText: null,
        });
        loadPdf(file, "");
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
          textData: {},
          editingText: null,
        });
      }
    }, [initialFile]);

    const loadPdf = (file: File, password?: string) => {
      setState((prev) => ({
        ...prev,
        isProcessing: true,
        isPasswordProtected: false,
      }));
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const loadingTask = pdfjs.getDocument({
            data,
            password,
            cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
            cMapPacked: true,
          });
          const pdf = await loadingTask.promise;
          pdfDocRef.current = pdf;

          const order = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
          setState((prev) => ({ ...prev, pageOrder: order }));

          const newThumbnails = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 0.3 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await (page as any).render({
              canvasContext: canvas.getContext("2d")!,
              viewport,
            }).promise;
            newThumbnails.push(canvas.toDataURL());
          }

          let initialZoom = 1;
          if (containerRef.current) {
            const containerWidth = containerRef.current.clientWidth - 64; // accounting for p-8 (32px * 2)
            const firstPage = await pdf.getPage(1);
            const firstPageViewport = firstPage.getViewport({ scale: 1.0 });
            if (firstPageViewport.width > 0) {
              initialZoom = Math.min(
                2.0,
                Math.max(0.3, containerWidth / firstPageViewport.width),
              );
              // Round to nearest 0.1
              initialZoom = Math.floor(initialZoom * 10) / 10;
            }
          }

          setState((prev) => ({
            ...prev,
            thumbnails: newThumbnails,
            isProcessing: false,
            currentPage: 1,
            zoom: initialZoom,
            isPasswordProtected: false,
            textData: {},
            pageData: {},
            deletedPages: [],
            pageOrder: order,
            history: [],
            historyIndex: -1,
            editingText: null,
          }));

          renderPage(1);
        } catch (error: any) {
          if (error.name === "PasswordException") {
            setState((prev) => ({
              ...prev,
              isPasswordProtected: true,
              isProcessing: false,
            }));
          } else {
            console.error("Error loading PDF:", error);
            setState((prev) => ({ ...prev, isProcessing: false }));
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
          height: originalDimensions.current.height * state.zoom,
        });
        canvas.setZoom(state.zoom);
      }
    }, [state.zoom]);

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

      text.on("mousedblclick", () => {
        const currentState = stateRef.current;
        if (currentState.tool === "select" || currentState.tool === "text") {
          text.set({ visible: false });
          fabricCanvas.current?.renderAll();
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

      text.set({ visible: false });
      fabricCanvas.current.renderAll();
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

    const addShape = (type: "check" | "cross" | "sticky") => {
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
      if (!pdfFile) return;
      setState((prev) => ({ ...prev, isProcessing: true }));

      try {
        const existingPdfBytes = await pdfFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(existingPdfBytes, {
          ignoreEncryption: true,
        });
        const finalPdfDoc = await PDFDocument.create();
        const helveticaFont = await finalPdfDoc.embedFont(StandardFonts.Helvetica);
        const helveticaBoldFont = await finalPdfDoc.embedFont(StandardFonts.HelveticaBold);
        const helveticaObliqueFont = await finalPdfDoc.embedFont(StandardFonts.HelveticaOblique);
        const helveticaBoldObliqueFont = await finalPdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

        const fontCache: Record<string, any> = {};

        const detectFontUrl = (text: string, isRegularOrBold?: boolean): string | null => {
          // Hindi / Devanagari range is \u0900-\u097F
          if (/[\u0900-\u097F]/.test(text)) {
            return isRegularOrBold 
              ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Bold.ttf"
              : "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf";
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
              ? "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosansjp/NotoSansJP-Bold.ttf"
              : "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosansjp/NotoSansJP-Regular.ttf";
          }
          // General non-ASCII/non-Latin characters (Cyrillic, Greek, Hebrew, etc.)
          if (/[^\u0000-\u00FF]/.test(text)) {
            return isRegularOrBold
              ? "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf"
              : "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";
          }
          return null;
        };

        const activeDomTexts: Record<string, string> = {};
        document.querySelectorAll('.editable-text').forEach((el) => {
          const ta = el as HTMLTextAreaElement | HTMLSpanElement;
          const blockId = ta.getAttribute('data-block-id');
          if (blockId) {
            if ("value" in ta) {
                activeDomTexts[blockId] = ta.value;
            } else {
                activeDomTexts[blockId] = ta.textContent || "";
            }
          }
        });

        for (const pageNum of state.pageOrder) {
          if (state.deletedPages.includes(pageNum)) continue;

          const [copiedPage] = await finalPdfDoc.copyPages(pdfDoc, [
            pageNum - 1,
          ]);
          
          const pdfjsPage = await pdfDocRef.current.getPage(pageNum);
          const viewport = pdfjsPage.getViewport({ scale: 1.0 });
          const data = state.pageData[pageNum];

          if (data && data.objects) {

            for (const obj of data.objects) {
              if (obj.visible === false) continue;
              if (obj.type === "image" && !obj.selectable) continue;

              const fabricX = obj.left;
              const fabricY = obj.top;
              const [pdfX, pdfY] = viewport.convertToPdfPoint(fabricX, fabricY);

              if (obj.type === "i-text" || obj.type === "text") {
                // Handled via state.textData now
              } else if (obj.type === "image") {
                const imgBytes = await fetch(obj.src).then((res) =>
                  res.arrayBuffer(),
                );
                const embeddedImg = await finalPdfDoc.embedPng(imgBytes);
                copiedPage.drawImage(embeddedImg, {
                  x: pdfX,
                  y: pdfY - obj.height * obj.scaleY,
                  width: obj.width * obj.scaleX,
                  height: obj.height * obj.scaleY,
                });
              } else if (obj.type === "rect" || obj.type === "path") {
                let rectColor = { r: 1, g: 1, b: 1 };
                let strokeColor = { r: 0, g: 0, b: 0 };
                let strokeWidth = obj.strokeWidth || 0;
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

                if (obj.type === "rect" && obj.visible) {
                  copiedPage.drawRectangle({
                    x: pdfX,
                    y: pdfY - obj.height * obj.scaleY,
                    width: obj.width * obj.scaleX,
                    height: obj.height * obj.scaleY,
                    color: (obj.fill === "transparent" || obj.fill === "rgba(255, 255, 255, 0.01)") 
                      ? undefined : rgb(rectColor.r, rectColor.g, rectColor.b),
                    borderColor: obj.stroke ? rgb(strokeColor.r, strokeColor.g, strokeColor.b) : undefined,
                    borderWidth: strokeWidth,
                    opacity: opacity,
                  });
                } else if (obj.type === "path") {
                  let pathData = "";
                  if (Array.isArray(obj.path)) {
                    pathData = obj.path.map((p: any) => p.join(" ")).join(" ");
                  }
                  if (pathData) {
                    try {
                      copiedPage.drawSvgPath(pathData, {
                        x: pdfX,
                        y: pdfY,
                        scale: obj.scaleX || 1,
                        color: obj.fill ? rgb(rectColor.r, rectColor.g, rectColor.b) : undefined,
                        borderColor: obj.stroke ? rgb(strokeColor.r, strokeColor.g, strokeColor.b) : undefined,
                        borderWidth: strokeWidth,
                        opacity: opacity,
                      });
                    } catch (e) {
                      console.warn("Failed to draw SVG path for export", e);
                    }
                  }
                }
              }
            }
          }

          // Loop over HTML text overlays to add them to PDF
          const texts = state.textData[pageNum] || [];
          const runPageTexts = async () => {
             for (const textBlock of texts) {
             const finalTextBlockText = activeDomTexts[textBlock.id] ?? textBlock.text;
             const isModified = textBlock.isDeleted || 
                                finalTextBlockText !== textBlock.originalText || 
                                textBlock.color !== textBlock.originalColor || 
                                textBlock.fontSize !== (textBlock.originalFontSize || textBlock.fontSize) ||
                                textBlock.fontWeight !== (textBlock.originalFontWeight || textBlock.fontWeight) ||
                                textBlock.fontStyle !== (textBlock.originalFontStyle || textBlock.fontStyle);

             // If it's original text but has been modified, we must white out the original PDF text
             if (textBlock.isOriginal && isModified) {
                const padLeft = 3;
                const padRight = 3;
                const padBottom = 4;
                const padTop = 2;
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
                   color: rgb(1, 1, 1),
                });
             }

             if (textBlock.isDeleted) continue;

             // Only draw if it's new text OR original text that was modified
             if (!textBlock.isOriginal || isModified) {
               let fontToUse = helveticaFont;
               const isBold = textBlock.fontWeight === "bold" || textBlock.fontWeight > 500;

               // Load custom Unicode/language font dynamically if needed
               const customFontUrl = detectFontUrl(finalTextBlockText, isBold);
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
                 if (isBold && isItalic) fontToUse = helveticaBoldObliqueFont;
                 else if (isBold) fontToUse = helveticaBoldFont;
                 else if (isItalic) fontToUse = helveticaObliqueFont;
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
               
               // Restore baseline to originalTx5 if available (because top was shifted)
               const pdfBaselineY = textBlock.originalTx5 ?? (textBlock.top + textBlock.fontSize * 0.8);
               const [convertedX, convertedY] = viewport.convertToPdfPoint(
                  textBlock.left,
                  pdfBaselineY
               );
               let drawX = convertedX;
               const pageHeight = copiedPage.getHeight();


               // textBlock.top is physical Y coordinate (from top). PDF origin is bottom-left.
               // Baseline is approximately top + fontSize * 0.8. Since pdf Y is from bottom, we subtract this from pageHeight.
               let drawY = convertedY;

                try {
                  copiedPage.drawText(finalTextBlockText, {
                     x: drawX,
                     y: drawY,
                     size: textBlock.fontSize,
                     font: fontToUse,
                     color: rgb(r, g, b),
                  });
                } catch (drawError) {
                  console.warn("Failed drawing text with custom/selected font, trying fallback...", drawError);
                  // Clean up string to pure basic ASCII if it cannot be encoded at all
                  try {
                    const cleanedText = finalTextBlockText.replace(/[^\x00-\x7F]/g, "?");
                    copiedPage.drawText(cleanedText, {
                       x: drawX,
                       y: drawY,
                       size: textBlock.fontSize,
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

          finalPdfDoc.addPage(copiedPage);
        }

        const pdfBytes = await finalPdfDoc.save({
          useObjectStreams: state.compressionLevel > 0.5,
          addDefaultPage: false,
        });

        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
        });

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
            <div className="h-6 w-px bg-gray-200 mx-2" />
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-gray-500 hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200">
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

            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    zoom: Math.max(0.3, prev.zoom - 0.1),
                  }))
                }
                className="p-1.5 hover:bg-white rounded-lg shadow-none hover:shadow-sm text-gray-600 transition-all"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-black w-12 text-center text-gray-600">
                {Math.round(state.zoom * 100)}%
              </span>
              <button
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    zoom: Math.min(3.0, prev.zoom + 0.1),
                  }))
                }
                className="p-1.5 hover:bg-white rounded-lg shadow-none hover:shadow-sm text-gray-600 transition-all"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1" />

            <button
              onClick={exportPdf}
              disabled={state.isProcessing}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#1a1a1a] hover:bg-black text-white rounded-full font-black text-[10px] uppercase tracking-widest shadow-xl hover:shadow-2xl transition-all active:scale-95 disabled:opacity-50"
            >
              {state.isProcessing ? (
                <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download PDF
            </button>
          </div>
        </header>

        {/* Main Toolbar */}
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-center px-4 z-40 shrink-0 shadow-sm overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 bg-gray-50/50 p-1 rounded-2xl border border-gray-100/50">
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
                        renderPage(id);
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
            ref={containerRef}
            className="flex-1 overflow-auto bg-[#e9ecef] p-12 custom-scrollbar relative text-center whitespace-nowrap"
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
                    left: state.floatingMenuPos.x + 200, // Offset from page
                    top: state.floatingMenuPos.y + 150,
                    zIndex: 100,
                  }}
                  className="flex items-center gap-1 bg-white border border-gray-200 shadow-[0_20px_50px_rgba(0,0,0,0.2)] rounded-2xl p-2 ring-1 ring-black/5 backdrop-blur-md"
                >
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
                  <button
                    onClick={() => {
                      if (state.selectedObject) {
                        fabricCanvas.current?.remove(state.selectedObject);
                        fabricCanvas.current?.renderAll();
                        savePageState();
                      }
                    }}
                    className="p-2 rounded-xl hover:bg-red-50 text-red-500 transition-all flex items-center gap-2 px-3"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase">
                      Delete
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      if (state.selectedObject) {
                        state.selectedObject.clone((cloned: any) => {
                          cloned.set({
                            left: cloned.left + 10,
                            top: cloned.top + 10,
                          });
                          fabricCanvas.current?.add(cloned);
                          fabricCanvas.current?.renderAll();
                          savePageState();
                        });
                      }
                    }}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-all"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <div className="h-6 w-px bg-gray-200 mx-1" />
                  <button className="p-2 rounded-xl hover:bg-yellow-50 text-yellow-600 transition-all">
                    <Highlighter className="w-4 h-4" />
                  </button>
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

            <div className="inline-block min-w-fit relative group perspective-1000 whitespace-normal text-left">
              {/* Complex Layered Shadow */}
              <div className="absolute -inset-1 bg-gradient-to-tr from-gray-400/20 to-gray-200/20 rounded-lg blur-2xl opacity-50 group-hover:opacity-80 transition duration-1000"></div>

              <div className="relative bg-white shadow-[0_50px_100px_rgba(0,0,0,0.15)] rounded-sm transition-all duration-500 ring-1 ring-black/5 overflow-visible">
                <canvas ref={canvasRef} className="block" />
                
                {/* HTML Text Layer */}
                {state.textData[state.currentPage] && (
                  <div 
                    className="absolute z-10"
                    style={{
                      top: 0,
                      left: 0,
                      width: originalDimensions.current.width * state.zoom,
                      height: originalDimensions.current.height * state.zoom,
                      pointerEvents: state.tool === 'select' || state.tool === 'text' ? 'auto' : 'none'
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
                        <div key={block.id}>
                          {showWhiteout && (
                            <div
                              style={{
                                position: "absolute",
                                left: (block.left - 3) * state.zoom,
                                top: (block.top - 2) * state.zoom,
                                width: (block.width + 6) * state.zoom,
                                height: (block.fontSize + 6) * state.zoom,
                                backgroundColor: "#ffffff",
                                pointerEvents: "none",
                                zIndex: 5,
                              }}
                            />
                          )}

                          {!block.isDeleted && (
                            state.editingText?.blockId === block.id ? (
                              <textarea
                                autoFocus
                                spellCheck={false}
                                spellcheck="false"
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
                                className="editable-text absolute ring-1 ring-blue-400 bg-white z-50 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                style={{
                                  left: block.left * state.zoom,
                                  top: block.top * state.zoom,
                                  width: Math.max(block.width * state.zoom + 20, 100),
                                  height: Math.max(block.fontSize * state.zoom * 1.5, block.fontSize * state.zoom + 10),
                                  fontSize: block.fontSize * state.zoom,
                                  fontFamily: block.fontFamily,
                                  fontWeight: block.fontWeight,
                                  fontStyle: block.fontStyle,
                                  color: block.color,
                                  textDecoration: "none",
                                  textDecorationLine: "none",
                                  textDecorationColor: "transparent",
                                  border: "none",
                                  borderBottom: "none",
                                  padding: "2px 4px",
                                  margin: 0,
                                  lineHeight: 1,
                                  whiteSpace: "pre",
                                  transformOrigin: "top left",
                                  cursor: "text",
                                  outline: "none",
                                  boxShadow: "none",
                                  pointerEvents: "auto",
                                  resize: "none",
                                  overflow: "hidden",
                                  zIndex: 10,
                                }}
                                defaultValue={block.text}
                                onBlur={(e) => {
                                  const newText = e.target.value;
                                  setState(prev => {
                                    const newTextData = { ...prev.textData };
                                    const pageBlocks = [...(newTextData[state.currentPage] || [])];
                                    const idx = pageBlocks.findIndex(b => b.id === block.id);
                                    if (idx > -1) {
                                      pageBlocks[idx] = { ...pageBlocks[idx], text: newText };
                                    }
                                    newTextData[state.currentPage] = pageBlocks;
                                    return { ...prev, textData: newTextData, editingText: null };
                                  });
                                  if (fabricCanvas.current) {
                                    const rect = fabricCanvas.current.getObjects().find((o: any) => o.type === "rect" && o.data?.blockId === block.id);
                                    if (rect) {
                                      const isModifiedNow = block.isDeleted || 
                                                            newText !== block.originalText || 
                                                            block.color !== block.originalColor || 
                                                            block.fontSize !== (block.originalFontSize || block.fontSize) ||
                                                            block.fontWeight !== (block.originalFontWeight || block.fontWeight) ||
                                                            block.fontStyle !== (block.originalFontStyle || block.fontStyle);
                                      rect.set({ visible: isModifiedNow });
                                      fabricCanvas.current.renderAll();
                                    }
                                  }
                                }}
                              />
                            ) : (
                              <span
                                data-page-number={state.currentPage}
                                data-block-id={block.id}
                                spellCheck={false}
                                spellcheck="false"
                                data-gramm="false"
                                data-gramm_editor="false"
                                data-enable-grammarly="false"
                                data-ms-editor="false"
                                data-spellcheck="false"
                                className={`editable-text absolute transition-all duration-150 rounded-sm ${(state.tool === 'text' || !block.isOriginal) ? "hover:bg-blue-500/10 hover:ring-1 hover:ring-blue-400" : ""}`}
                                onClick={() => {
                                  if (state.tool === 'text' || !block.isOriginal) {
                                    setState(prev => ({
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
                                  left: block.left * state.zoom,
                                  top: block.top * state.zoom,
                                  width: block.width * state.zoom + 20, 
                                  height: block.fontSize * state.zoom * 1.5,
                                  fontSize: block.fontSize * state.zoom,
                                  fontFamily: block.fontFamily,
                                  fontWeight: block.fontWeight,
                                  fontStyle: block.fontStyle,
                                  color: isModified ? block.color : "transparent",
                                  textDecoration: "none",
                                  textDecorationLine: "none",
                                  textDecorationColor: "transparent",
                                  border: "none",
                                  borderBottom: "none",
                                  padding: 0,
                                  margin: 0,
                                  lineHeight: 1,
                                  whiteSpace: "pre",
                                  transformOrigin: "top left",
                                  cursor: (state.tool === 'text' || !block.isOriginal) ? "text" : "default",
                                  pointerEvents: (state.tool === 'text' || !block.isOriginal) ? "auto" : "none",
                                  background: "transparent",
                                  border: "none",
                                  display: "inline-block",
                                  zIndex: 10,
                                }}
                              >
                                {block.text}
                              </span>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {state.editingText && state.editingText.visible && (
                  <div
                    style={{
                      position: "absolute",
                      left: Math.max(state.editingText.left, 0),
                      top: Math.max(state.editingText.top - 50, 0),
                      zIndex: 1001,
                    }}
                    className="flex items-center gap-1 bg-white border border-gray-200 shadow-xl rounded-lg p-1"
                    onPointerDown={(e) => e.preventDefault()}
                  >
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
                      className={`p-1.5 rounded hover:bg-gray-100 ${(state.editingText.fontWeight === "bold" || state.editingText.fontWeight === "semibold" || state.editingText.fontWeight === "medium" || (typeof state.editingText.fontWeight === "number" && state.editingText.fontWeight > 400)) ? "bg-gray-200" : ""}`}
                      title="Bold"
                    >
                      <Bold className="w-4 h-4 text-gray-700" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        const newStyle = state.editingText?.fontStyle === "italic" ? "normal" : "italic";
                        updateActiveTextData({ fontStyle: newStyle });
                      }}
                      className={`p-1.5 rounded hover:bg-gray-100 ${state.editingText.fontStyle === "italic" ? "bg-gray-200" : ""}`}
                      title="Italic"
                    >
                      <Italic className="w-4 h-4 text-gray-700" />
                    </button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <input
                      type="color"
                      value={state.editingText.color || "#000000"}
                      onChange={(e) => updateActiveTextData({ color: e.target.value })}
                      className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                      title="Text Color"
                    />
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <input
                      type="number"
                      value={Math.round(state.editingText.fontSize / state.zoom)}
                      onChange={(e) => updateActiveTextData({ fontSize: Number(e.target.value) })}
                      className="w-12 text-xs border rounded p-1"
                      title="Font Size"
                    />
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        updateActiveTextData({ isDeleted: true });
                        setState(prev => ({ ...prev, editingText: null }));
                      }}
                      className="p-1.5 rounded hover:bg-red-50 text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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

            <div className="h-32 shrink-0" />
          </div>
        </div>

        {/* Global UI Overlays */}
        <input
          type="file"
          ref={imageInputRef}
          className="hidden"
          accept="image/*"
          onChange={addImage}
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
          <div className="fixed inset-0 bg-white/90 backdrop-blur-xl flex items-center justify-center z-[100]">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.2)] border border-gray-100 flex flex-col items-center ring-1 ring-black/5"
            >
              <div className="w-20 h-20 bg-red-50 text-[#ff4b4b] rounded-3xl flex items-center justify-center mb-8 shadow-inner animate-bounce">
                <Lock className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-tight">
                Encrypted PDF
              </h2>
              <p className="text-sm font-medium text-gray-400 text-center mb-10 px-6 leading-relaxed">
                This document is protected by industrial-grade encryption. Enter
                the administrative password.
              </p>
              <form
                onSubmit={handlePasswordSubmit}
                className="w-full space-y-5"
              >
                <input
                  type="password"
                  value={state.password}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, password: e.target.value }))
                  }
                  className="w-full px-6 py-5 bg-gray-50 border border-gray-200 rounded-3xl outline-none focus:ring-8 focus:ring-[#ff4b4b]/5 focus:border-[#ff4b4b] transition-all text-center text-xl font-black tracking-widest placeholder:tracking-normal placeholder:font-bold"
                  placeholder="••••••••"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full py-5 bg-[#ff4b4b] text-white rounded-3xl font-black uppercase text-xs tracking-[0.2em] hover:bg-[#e63e3e] transition-all active:scale-[0.97] shadow-2xl shadow-[#ff4b4b]/30"
                >
                  Authenticate & View
                </button>
                <button
                  onClick={onReset}
                  className="w-full py-3 text-gray-400 text-[10px] font-black uppercase tracking-[0.3em] hover:text-gray-600 transition-all hover:tracking-[0.4em]"
                >
                  Cancel Entry
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
