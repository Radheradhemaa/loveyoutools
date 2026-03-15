import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, ZoomIn, ZoomOut, MousePointer2, Type as TextIcon, Square, Circle as CircleIcon, Highlighter, Eraser, PenTool, Image as ImageIcon, ChevronLeft, ChevronRight, CheckSquare, Trash2, Settings, Search, X, Undo, Redo, Pipette } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import { Canvas, IText, Rect, Circle, Path, Image as FabricImage, StaticCanvas, Text as FabricText } from 'fabric';
import { PDFDocument, rgb, degrees } from 'pdf-lib';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const rgbToHex = (rgbStr: string) => {
  if (rgbStr.startsWith('#')) return rgbStr;
  const match = rgbStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return '#000000';
};

const parseColorToRgb = (colorStr: string | undefined | null) => {
  if (!colorStr || typeof colorStr !== 'string') return undefined;
  if (colorStr.startsWith('#')) {
    const r = parseInt(colorStr.slice(1, 3), 16) / 255;
    const g = parseInt(colorStr.slice(3, 5), 16) / 255;
    const b = parseInt(colorStr.slice(5, 7), 16) / 255;
    return rgb(r, g, b);
  } else if (colorStr.startsWith('rgb(')) {
    const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return rgb(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255);
    }
  }
  return undefined;
};

export default function AdvancedPdfEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [zoom, setZoom] = useState(1.5);
  const [loading, setLoading] = useState(false);
  const [activeTool, setActiveTool] = useState('select'); 
  const [pageData, setPageData] = useState<Record<number, any>>({});
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const isInitialRender = useRef<Record<number, boolean>>({});

  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  
  // History state for Undo/Redo
  const historyRef = useRef<Record<number, any>[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isHistoryAction = useRef(false);
  const [historyState, setHistoryState] = useState({ index: -1, length: 0 });
  
  // Password handling
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setPageNum(1);
      setZoom(1.5);
      setPageData({});
      isInitialRender.current = {};
      setThumbnails([]);
      historyRef.current = [];
      historyIndexRef.current = -1;
      setHistoryState({ index: -1, length: 0 });
      await loadPdf(selectedFile);
    }
  };

  const loadPdf = async (file: File, pwd?: string) => {
    setLoading(true);
    setNeedsPassword(false);
    setPasswordError('');
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({
        data: arrayBuffer,
        password: pwd,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
        cMapPacked: true,
      });
      
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      
      // Generate thumbnails
      generateThumbnails(pdf);
    } catch (error: any) {
      console.error('Error loading PDF:', error);
      if (error.name === 'PasswordException') {
        setNeedsPassword(true);
        if (pwd) setPasswordError('Incorrect password');
      } else {
        alert('Error loading PDF. Please try another file.');
      }
    } finally {
      setLoading(false);
    }
  };

  const generateThumbnails = async (pdf: pdfjs.PDFDocumentProxy) => {
    const thumbs: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) { // Limit to 20 for performance
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        // @ts-ignore
        await page.render({ canvasContext: context!, viewport }).promise;
        thumbs.push(canvas.toDataURL());
      } catch (e) {
        console.error("Error generating thumbnail for page", i);
      }
    }
    setThumbnails(thumbs);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file && password) {
      loadPdf(file, password);
    }
  };

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    setLoading(true);
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      setDimensions({ width: viewport.width, height: viewport.height });

      // Cancel any ongoing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      // @ts-ignore
      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;

      // Initialize or update Fabric canvas
      if (!fabricRef.current) {
        const fabricCanvas = new Canvas('fabric-canvas', {
          width: viewport.width,
          height: viewport.height,
          selection: true,
          preserveObjectStacking: true
        });
        
        fabricCanvas.on('selection:created', (e) => setSelectedObject(e.selected?.[0]));
        fabricCanvas.on('selection:updated', (e) => setSelectedObject(e.selected?.[0]));
        fabricCanvas.on('selection:cleared', () => setSelectedObject(null));
        
        fabricCanvas.on('object:modified', () => {
          savePageState();
        });

        fabricRef.current = fabricCanvas;
      } else {
        fabricRef.current.setDimensions({
          width: viewport.width,
          height: viewport.height
        });
        fabricRef.current.clear();
      }

      // Load existing data or detect text
      if (pageData[pageNum]) {
        await fabricRef.current.loadFromJSON(pageData[pageNum]);
      } else if (!isInitialRender.current[pageNum]) {
        // Smart Text Detection (Only on first visit)
        const textContent = await page.getTextContent();
        const styles = textContent.styles;
        
        const textItems = textContent.items.map((item: any) => {
          const tx = pdfjs.Util.transform(viewport.transform, item.transform);
          
          let color = '#000000';
          if (item.color) {
            if (Array.isArray(item.color) || item.color instanceof Uint8ClampedArray) {
              color = `rgb(${item.color[0]}, ${item.color[1]}, ${item.color[2]})`;
            } else if (typeof item.color === 'string') {
              color = item.color.startsWith('#') ? item.color : `#${item.color}`;
            }
          }

          const style = styles[item.fontName];
          let fontFamily = 'Inter, sans-serif';
          if (style && style.fontFamily) {
            fontFamily = style.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
          }

          return {
            text: item.str,
            x: tx[4],
            y: tx[5] - (item.height * zoom),
            width: item.width * zoom,
            height: item.height * zoom,
            fontSize: item.height * zoom,
            fontFamily: fontFamily,
            color: color
          };
        });

        textItems.forEach(item => {
          if (item.text.trim()) {
            const textId = Math.random().toString(36).substr(2, 9);
            const textObj = new IText(item.text, {
              left: item.x,
              top: item.y,
              fontSize: item.fontSize,
              fontFamily: item.fontFamily || 'Inter, sans-serif',
              fill: 'transparent',
              selectable: true,
              hasBorders: false,
              hasControls: true,
              data: { isOriginal: true, originalText: item.text, id: textId, originalColor: item.color }
            });
            
            textObj.on('editing:entered', () => {
              if (textObj.fill === 'transparent') {
                let maskColor = textObj.get('data')?.maskColor || 'white';
                
                // Auto-detect background color from the PDF canvas
                if (!textObj.get('data')?.maskColor && canvasRef.current) {
                  try {
                    const ctx = canvasRef.current.getContext('2d');
                    if (ctx) {
                      // Sample a pixel slightly above the text to avoid hitting the text itself
                      const x = Math.max(0, textObj.left || 0);
                      const y = Math.max(0, (textObj.top || 0) - 2);
                      const pixel = ctx.getImageData(x, y, 1, 1).data;
                      // Only use if it's not fully transparent
                      if (pixel[3] > 0) {
                        maskColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
                        textObj.set('data', { ...textObj.get('data'), maskColor });
                      }
                    }
                  } catch (e) {
                    console.error('Could not auto-detect background color', e);
                  }
                }

                const mask = new Rect({
                  left: textObj.left,
                  top: textObj.top,
                  width: textObj.width,
                  height: textObj.height,
                  fill: maskColor,
                  selectable: false,
                  evented: false,
                  data: { isMask: true, parentId: textId }
                });
                fabricRef.current?.add(mask);
                fabricRef.current?.sendObjectToBack(mask);
                textObj.set('fill', textObj.get('data')?.originalColor || 'black');
                fabricRef.current?.renderAll();
              }
            });

            textObj.on('editing:exited', () => {
              savePageState();
            });

            fabricRef.current?.add(textObj);
          }
        });
        
        isInitialRender.current[pageNum] = true;
        savePageState();
      }

      applyToolMode(activeTool);
      
    } catch (error: any) {
      if (error.name !== 'RenderingCancelledException') {
        console.error('Error rendering page:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [pdfDoc, pageNum, zoom, pageData, activeTool]);

  useEffect(() => {
    renderPage();
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [renderPage]);

  const savePageState = () => {
    if (fabricRef.current) {
      const json = fabricRef.current.toJSON(['data', 'selectable', 'evented', 'hasBorders', 'hasControls']);
      setPageData(prev => {
        const newData = { ...prev, [pageNum]: json };
        
        if (!isHistoryAction.current) {
          const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
          newHistory.push(newData);
          historyRef.current = newHistory;
          historyIndexRef.current = newHistory.length - 1;
          setHistoryState({ index: historyIndexRef.current, length: historyRef.current.length });
        }
        
        return newData;
      });
    }
  };

  const undo = async () => {
    if (historyIndexRef.current > 0) {
      isHistoryAction.current = true;
      const newIndex = historyIndexRef.current - 1;
      historyIndexRef.current = newIndex;
      setHistoryState({ index: newIndex, length: historyRef.current.length });
      
      const previousState = historyRef.current[newIndex];
      setPageData(previousState);
      
      if (previousState[pageNum] && fabricRef.current) {
        await fabricRef.current.loadFromJSON(previousState[pageNum]);
        fabricRef.current.renderAll();
      }
      
      setTimeout(() => { isHistoryAction.current = false; }, 100);
    }
  };

  const redo = async () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      isHistoryAction.current = true;
      const newIndex = historyIndexRef.current + 1;
      historyIndexRef.current = newIndex;
      setHistoryState({ index: newIndex, length: historyRef.current.length });
      
      const nextState = historyRef.current[newIndex];
      setPageData(nextState);
      
      if (nextState[pageNum] && fabricRef.current) {
        await fabricRef.current.loadFromJSON(nextState[pageNum]);
        fabricRef.current.renderAll();
      }
      
      setTimeout(() => { isHistoryAction.current = false; }, 100);
    }
  };

  const applyToolMode = (tool: string) => {
    if (!fabricRef.current) return;
    
    const canvas = fabricRef.current;
    canvas.isDrawingMode = tool === 'draw' || tool === 'signature';
    
    if (canvas.isDrawingMode) {
      canvas.freeDrawingBrush.color = tool === 'signature' ? '#000000' : '#ff0000';
      canvas.freeDrawingBrush.width = tool === 'signature' ? 2 : 3;
    }

    canvas.getObjects().forEach(obj => {
      if (obj.get('data')?.isMask) {
        obj.selectable = false;
        obj.evented = false;
      } else {
        obj.selectable = tool === 'select';
        obj.evented = tool === 'select';
      }
    });

    canvas.requestRenderAll();
  };

  useEffect(() => {
    applyToolMode(activeTool);
  }, [activeTool]);

  const addText = () => {
    if (!fabricRef.current) return;
    const text = new IText('New Text', {
      left: 100,
      top: 100,
      fontFamily: 'Inter, sans-serif',
      fontSize: 20 * zoom,
      fill: '#000000',
      data: { isNew: true }
    });
    fabricRef.current.add(text);
    fabricRef.current.setActiveObject(text);
    setActiveTool('select');
    savePageState();
  };

  const addRect = () => {
    if (!fabricRef.current) return;
    const rect = new Rect({
      left: 100,
      top: 100,
      width: 100 * zoom,
      height: 100 * zoom,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 2,
      data: { isNew: true }
    });
    fabricRef.current.add(rect);
    fabricRef.current.setActiveObject(rect);
    setActiveTool('select');
    savePageState();
  };

  const addCircle = () => {
    if (!fabricRef.current) return;
    const circle = new Circle({
      left: 100,
      top: 100,
      radius: 50 * zoom,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 2,
      data: { isNew: true }
    });
    fabricRef.current.add(circle);
    fabricRef.current.setActiveObject(circle);
    setActiveTool('select');
    savePageState();
  };

  const addHighlight = () => {
    if (!fabricRef.current) return;
    const rect = new Rect({
      left: 100,
      top: 100,
      width: 100 * zoom,
      height: 20 * zoom,
      fill: 'rgba(255, 255, 0, 0.3)',
      data: { isNew: true, isHighlight: true }
    });
    fabricRef.current.add(rect);
    fabricRef.current.setActiveObject(rect);
    setActiveTool('select');
    savePageState();
  };

  const addWhiteout = () => {
    if (!fabricRef.current) return;
    const rect = new Rect({
      left: 100,
      top: 100,
      width: 100 * zoom,
      height: 20 * zoom,
      fill: '#ffffff',
      data: { isNew: true, isWhiteout: true }
    });
    fabricRef.current.add(rect);
    fabricRef.current.setActiveObject(rect);
    setActiveTool('select');
    savePageState();
  };

  const addCheckbox = () => {
    if (!fabricRef.current) return;
    const rect = new Rect({
      left: 100,
      top: 100,
      width: 16 * zoom,
      height: 16 * zoom,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 1.5,
      data: { isNew: true, isCheckbox: true }
    });
    fabricRef.current.add(rect);
    fabricRef.current.setActiveObject(rect);
    setActiveTool('select');
    savePageState();
  };

  const addImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricRef.current) return;

    const reader = new FileReader();
    reader.onload = (f) => {
      const data = f.target?.result;
      FabricImage.fromURL(data as string).then((img) => {
        img.scaleToWidth(200 * zoom);
        img.set({
          left: 100,
          top: 100,
          data: { isNew: true }
        });
        fabricRef.current?.add(img);
        fabricRef.current?.setActiveObject(img);
        setActiveTool('select');
        savePageState();
      });
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const deleteSelected = () => {
    if (!fabricRef.current) return;
    const activeObjects = fabricRef.current.getActiveObjects();
    if (activeObjects.length) {
      activeObjects.forEach(obj => {
        // If it's an original text, remove its mask too
        if (obj.get('data')?.isOriginal) {
          const id = obj.get('data')?.id;
          const mask = fabricRef.current?.getObjects().find(o => o.get('data')?.isMask && o.get('data')?.parentId === id);
          if (mask) fabricRef.current?.remove(mask);
        }
        // If it's a mask, remove its parent text too
        if (obj.get('data')?.isMask) {
          const parentId = obj.get('data')?.parentId;
          const text = fabricRef.current?.getObjects().find(o => o.get('data')?.isOriginal && o.get('data')?.id === parentId);
          if (text) fabricRef.current?.remove(text);
        }
        fabricRef.current?.remove(obj);
      });
      fabricRef.current.discardActiveObject();
      setSelectedObject(null);
      savePageState();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if editing text
        if (fabricRef.current?.getActiveObject()?.isEditing) return;
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const globalReplace = () => {
    if (!findText || !replaceText || !fabricRef.current) return;
    
    let modified = false;
    fabricRef.current.getObjects().forEach(obj => {
      if ((obj instanceof IText || obj instanceof FabricText) && obj.text) {
        if (obj.text.includes(findText)) {
          obj.set('text', obj.text.replace(new RegExp(findText, 'g'), replaceText));
          
          // If it was transparent (original text), make it visible and add mask
          if (obj.fill === 'transparent') {
            const textId = obj.get('data')?.id;
            let maskColor = obj.get('data')?.maskColor || 'white';
            
            // Auto-detect background color from the PDF canvas
            if (!obj.get('data')?.maskColor && canvasRef.current) {
              try {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                  const x = Math.max(0, obj.left || 0);
                  const y = Math.max(0, (obj.top || 0) - 2);
                  const pixel = ctx.getImageData(x, y, 1, 1).data;
                  if (pixel[3] > 0) {
                    maskColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
                    obj.set('data', { ...obj.get('data'), maskColor });
                  }
                }
              } catch (e) {
                console.error('Could not auto-detect background color', e);
              }
            }

            const mask = new Rect({
              left: obj.left,
              top: obj.top,
              width: obj.width,
              height: obj.height,
              fill: maskColor,
              selectable: false,
              evented: false,
              data: { isMask: true, parentId: textId }
            });
            fabricRef.current?.add(mask);
            fabricRef.current?.sendObjectToBack(mask);
            obj.set('fill', obj.get('data')?.originalColor || 'black');
          }
          modified = true;
        }
      }
    });

    if (modified) {
      fabricRef.current.renderAll();
      savePageState();
    }
  };

  const updateSelectedObject = (props: any) => {
    if (!fabricRef.current || !selectedObject) return;
    selectedObject.set(props);
    fabricRef.current.renderAll();
    savePageState();
    setSelectedObject(fabricRef.current.getActiveObject()); // Trigger re-render
  };

  const exportPdf = async () => {
    if (!file) return;
    setLoading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();

      for (let pageNum = 1; pageNum <= pages.length; pageNum++) {
        const pageLib = pages[pageNum - 1];
        const { width, height } = pageLib.getSize();
        
        // Save current page state before export
        if (pageNum === pageNum && fabricRef.current) {
          pageData[pageNum] = fabricRef.current.toJSON(['data', 'selectable', 'evented', 'hasBorders', 'hasControls']);
        }

        const data = pageData[pageNum];
        if (!data) continue;

        const tempCanvas = new StaticCanvas(null, { width: dimensions.width, height: dimensions.height });
        await tempCanvas.loadFromJSON(data);
        
        const objects = tempCanvas.getObjects();
        const currentViewport = (await (await pdfjs.getDocument(arrayBuffer).promise).getPage(pageNum)).getViewport({ scale: zoom });
        const scaleX = width / currentViewport.width;
        const scaleY = height / currentViewport.height;

        for (const obj of objects) {
          if (obj instanceof IText || obj instanceof FabricText) {
            if (obj.fill === 'transparent') continue;

            const pdfX = obj.left! * scaleX;
            const pdfY = height - (obj.top! * scaleY) - (obj.fontSize! * scaleY);

            if (obj.get('data')?.isOriginal) {
              let maskColor = rgb(1, 1, 1);
              const customMaskColor = obj.get('data')?.maskColor;
              const parsedMask = parseColorToRgb(customMaskColor);
              if (parsedMask) maskColor = parsedMask;

              pageLib.drawRectangle({
                x: obj.left! * scaleX,
                y: height - (obj.top! * scaleY) - (obj.height! * scaleY),
                width: obj.width! * scaleX,
                height: obj.height! * scaleY,
                color: maskColor,
              });
            }

            let textColor = rgb(0, 0, 0);
            const parsedText = parseColorToRgb(obj.fill as string);
            if (parsedText) textColor = parsedText;

            // Try to use standard fonts if possible
            let font;
            const fontFamily = (obj.fontFamily || '').toLowerCase();
            if (fontFamily.includes('times')) {
              font = await pdfDoc.embedFont('Times-Roman');
            } else if (fontFamily.includes('courier')) {
              font = await pdfDoc.embedFont('Courier');
            } else if (fontFamily.includes('arial') || fontFamily.includes('sans')) {
              font = await pdfDoc.embedFont('Helvetica');
            }

            pageLib.drawText(obj.text || '', {
              x: pdfX,
              y: pdfY,
              size: obj.fontSize! * scaleY,
              color: textColor,
              opacity: obj.opacity || 1,
              font: font,
            });
          } else if (obj instanceof Rect) {
            if (obj.get('data')?.isMask) continue;

            let fillColor = parseColorToRgb(obj.fill as string);
            if (obj.fill === 'rgba(255, 255, 0, 0.3)') {
              fillColor = rgb(1, 1, 0);
            }

            let strokeColor = parseColorToRgb(obj.stroke as string);

            pageLib.drawRectangle({
              x: obj.left! * scaleX,
              y: height - (obj.top! * scaleY) - (obj.height! * scaleY),
              width: obj.width! * scaleX,
              height: obj.height! * scaleY,
              borderColor: strokeColor,
              borderWidth: obj.strokeWidth ? obj.strokeWidth * scaleX : 0,
              color: fillColor,
              opacity: obj.opacity || (obj.fill === 'rgba(255, 255, 0, 0.3)' ? 0.3 : 1)
            });
          } else if (obj instanceof Circle) {
            let fillColor = parseColorToRgb(obj.fill as string);
            let strokeColor = parseColorToRgb(obj.stroke as string);

            pageLib.drawCircle({
              x: (obj.left! + obj.radius!) * scaleX,
              y: height - (obj.top! + obj.radius!) * scaleY,
              size: obj.radius! * scaleX,
              borderColor: strokeColor,
              borderWidth: obj.strokeWidth ? obj.strokeWidth * scaleX : 0,
              color: fillColor,
              opacity: obj.opacity || 1
            });
          } else if (obj instanceof Path) {
            let strokeColor = parseColorToRgb(obj.stroke as string) || rgb(0, 0, 0);
            
            // Convert Fabric Path to SVG path data string
            const pathData = obj.path.map((p: any) => p.join(' ')).join(' ');
            
            try {
              pageLib.drawSvgPath(pathData, {
                x: obj.left! * scaleX,
                y: height - (obj.top! * scaleY),
                scale: scaleX,
                borderColor: strokeColor,
                borderWidth: obj.strokeWidth ? obj.strokeWidth * scaleX : 2,
              });
            } catch (e) {
              console.error('Error drawing SVG path in PDF:', e);
            }
          } else if (obj instanceof FabricImage) {
            const imgDataUrl = obj.toDataURL({});
            const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
            
            let pdfImage;
            if (imgDataUrl.includes('image/png')) {
              pdfImage = await pdfDoc.embedPng(imgBytes);
            } else {
              pdfImage = await pdfDoc.embedJpg(imgBytes);
            }

            pageLib.drawImage(pdfImage, {
              x: obj.left! * scaleX,
              y: height - (obj.top! * scaleY) - (obj.height! * obj.scaleY! * scaleY),
              width: obj.width! * obj.scaleX! * scaleX,
              height: obj.height! * obj.scaleY! * scaleY,
              opacity: obj.opacity || 1
            });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Error exporting PDF. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!file) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-text-primary mb-4">Advanced PDF Editor</h2>
          <p className="text-text-secondary">Edit text, add images, draw shapes, and fill forms directly in your browser.</p>
        </div>

        <div className="bg-surface border-2 border-dashed border-border rounded-2xl p-12 text-center hover:border-accent transition-colors">
          <Upload className="w-12 h-12 text-accent mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Upload PDF Document</h3>
          <p className="text-text-secondary mb-6">Drag and drop your PDF here, or click to browse</p>
          <label className="btn bp cursor-pointer inline-flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Select PDF File
            <input 
              type="file" 
              className="hidden" 
              accept=".pdf"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="max-w-md mx-auto mt-20 bg-surface border border-border rounded-2xl p-8 shadow-sm">
        <h2 className="text-2xl font-bold mb-4">Password Protected</h2>
        <p className="text-text-secondary mb-6">This PDF requires a password to open.</p>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter PDF password"
              className="fi w-full"
              autoFocus
            />
            {passwordError && <p className="text-error text-sm mt-1">{passwordError}</p>}
          </div>
          <button type="submit" className="btn bp w-full" disabled={loading}>
            {loading ? 'Opening...' : 'Unlock PDF'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[800px]">
      {/* Sidebar - Thumbnails */}
      <div className="hidden lg:flex flex-col bg-surface border border-border rounded-[14px] overflow-hidden">
        <div className="p-3 border-b border-border bg-bg-secondary font-semibold text-sm">
          Pages ({numPages})
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {thumbnails.length > 0 ? thumbnails.map((thumb, idx) => (
            <div 
              key={idx} 
              onClick={() => {
                savePageState();
                setPageNum(idx + 1);
              }}
              className={`cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${pageNum === idx + 1 ? 'border-accent shadow-md' : 'border-transparent hover:border-border'}`}
            >
              <img src={thumb} alt={`Page ${idx + 1}`} loading="lazy" className="w-full h-auto" />
              <div className="text-center text-xs py-1 bg-bg-secondary text-text-muted">
                {idx + 1}
              </div>
            </div>
          )) : (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              Loading thumbnails...
            </div>
          )}
        </div>
      </div>

      {/* Editor Main Area */}
      <div className="col-span-1 lg:col-span-2 flex flex-col bg-bg-secondary rounded-[14px] border border-border overflow-hidden">
        {/* Editor Toolbar */}
        <div className="bg-surface border-b border-border p-2 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1">
            <button 
              onClick={undo}
              disabled={historyState.index <= 0}
              className={`p-2 rounded-lg transition-all ${historyState.index <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-bg-secondary text-text-primary'}`}
              title="Undo"
            >
              <Undo size={18} />
            </button>
            <button 
              onClick={redo}
              disabled={historyState.index >= historyState.length - 1}
              className={`p-2 rounded-lg transition-all ${historyState.index >= historyState.length - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-bg-secondary text-text-primary'}`}
              title="Redo"
            >
              <Redo size={18} />
            </button>
            <div className="w-px h-6 bg-border mx-1"></div>
            <button 
              onClick={() => setActiveTool('select')}
              className={`p-2 rounded-lg transition-all ${activeTool === 'select' ? 'bg-accent text-white shadow-sm' : 'hover:bg-bg-secondary'}`}
              title="Select"
            >
              <MousePointer2 size={18} />
            </button>
            <button 
              onClick={addText}
              className={`p-2 rounded-lg transition-all ${activeTool === 'text' ? 'bg-accent text-white shadow-sm' : 'hover:bg-bg-secondary'}`}
              title="Add Text"
            >
              <TextIcon size={18} />
            </button>
            <label 
              className={`p-2 rounded-lg transition-all cursor-pointer ${activeTool === 'image' ? 'bg-accent text-white shadow-sm' : 'hover:bg-bg-secondary'}`}
              title="Add Image"
            >
              <ImageIcon size={18} />
              <input type="file" accept="image/*" className="hidden" onChange={addImage} />
            </label>
            <button 
              onClick={addRect}
              className={`p-2 rounded-lg transition-all ${activeTool === 'rect' ? 'bg-accent text-white shadow-sm' : 'hover:bg-bg-secondary'}`}
              title="Rectangle"
            >
              <Square size={18} />
            </button>
            <button 
              onClick={addCircle}
              className={`p-2 rounded-lg transition-all ${activeTool === 'circle' ? 'bg-accent text-white shadow-sm' : 'hover:bg-bg-secondary'}`}
              title="Circle"
            >
              <CircleIcon size={18} />
            </button>
            <button 
              onClick={addHighlight}
              className={`p-2 rounded-lg transition-all ${activeTool === 'highlight' ? 'bg-accent text-white shadow-sm' : 'hover:bg-bg-secondary'}`}
              title="Highlight"
            >
              <Highlighter size={18} />
            </button>
            <button 
              onClick={addWhiteout}
              className={`p-2 rounded-lg transition-all ${activeTool === 'whiteout' ? 'bg-accent text-white shadow-sm' : 'hover:bg-bg-secondary'}`}
              title="Whiteout (Erase)"
            >
              <Eraser size={18} />
            </button>
            <button 
              onClick={() => setActiveTool('draw')}
              className={`p-2 rounded-lg transition-all ${activeTool === 'draw' ? 'bg-accent text-white shadow-sm' : 'hover:bg-bg-secondary'}`}
              title="Draw"
            >
              <PenTool size={18} />
            </button>
            <button 
              onClick={() => setActiveTool('signature')}
              className={`p-2 rounded-lg transition-all ${activeTool === 'signature' ? 'bg-accent text-white shadow-sm' : 'hover:bg-bg-secondary'}`}
              title="Signature"
            >
              <span className="font-serif italic font-bold text-sm px-1">Sign</span>
            </button>
            <button 
              onClick={addCheckbox}
              className={`p-2 rounded-lg transition-all ${activeTool === 'checkbox' ? 'bg-accent text-white shadow-sm' : 'hover:bg-bg-secondary'}`}
              title="Checkbox"
            >
              <CheckSquare size={18} />
            </button>
          </div>
          
          <div className="flex items-center gap-1 border-l border-border pl-2">
            <button onClick={deleteSelected} className="p-2 text-error hover:bg-error/10 rounded-lg" title="Delete Selected">
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Editor Canvas Container */}
        <div className="flex-1 overflow-auto p-8 flex justify-center bg-stone-100 dark:bg-stone-900 pattern-grid relative" ref={containerRef}>
          <div className="relative shadow-2xl bg-white" style={{ width: dimensions.width || 'auto', height: dimensions.height || 'auto' }}>
            <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-none" />
            <canvas id="fabric-canvas" className="absolute top-0 left-0" />
            
            {loading && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent border-t-transparent"></div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="bg-surface border-t border-border p-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { savePageState(); setPageNum(Math.max(1, pageNum - 1)); }}
                disabled={pageNum <= 1}
                className="p-1 hover:bg-bg-secondary rounded disabled:opacity-50"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-medium">Page {pageNum} of {numPages}</span>
              <button 
                onClick={() => { savePageState(); setPageNum(Math.min(numPages, pageNum + 1)); }}
                disabled={pageNum >= numPages}
                className="p-1 hover:bg-bg-secondary rounded disabled:opacity-50"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            
            <div className="h-4 w-px bg-border"></div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="p-1 hover:bg-bg-secondary rounded">
                <ZoomOut size={18} />
              </button>
              <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-1 hover:bg-bg-secondary rounded">
                <ZoomIn size={18} />
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setFile(null)} className="btn bs text-sm py-1.5">Close</button>
            <button onClick={exportPdf} className="btn bp text-sm py-1.5 flex items-center gap-2">
              <Download size={16} /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Properties Sidebar */}
      <div className="col-span-1 bg-surface border border-border rounded-[14px] p-4 overflow-y-auto">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-accent" /> Editor Settings
        </h3>

        <div className="space-y-6">
          {/* Find & Replace */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
              <Search size={12} /> Find & Replace
            </label>
            <input 
              type="text" 
              placeholder="Find text..." 
              value={findText}
              onChange={e => setFindText(e.target.value)}
              className="fi text-sm"
            />
            <input 
              type="text" 
              placeholder="Replace with..." 
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              className="fi text-sm"
            />
            <button onClick={globalReplace} className="btn bs w-full text-xs py-2">Replace All</button>
          </div>

          {/* Object Properties */}
          {selectedObject && (
            <div className="space-y-4 p-4 bg-bg-secondary rounded-xl border border-border">
              <label className="text-[10px] font-bold uppercase tracking-widest text-accent flex items-center gap-2">
                <Settings size={12} /> Properties
              </label>
              
              {(selectedObject instanceof IText || selectedObject instanceof FabricText) && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] text-text-muted uppercase">Font Family</label>
                    <select 
                      value={selectedObject.fontFamily || 'Inter, sans-serif'}
                      onChange={e => updateSelectedObject({ fontFamily: e.target.value })}
                      className="fi text-xs h-8"
                    >
                      {![
                        'Inter, sans-serif', 'Times New Roman', 'Courier New', 'Arial', 'Georgia'
                      ].includes(selectedObject.fontFamily) && selectedObject.fontFamily && (
                        <option value={selectedObject.fontFamily}>{selectedObject.fontFamily}</option>
                      )}
                      <option value="Inter, sans-serif">Inter</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier</option>
                      <option value="Arial">Arial</option>
                      <option value="Georgia">Georgia</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-text-muted uppercase">Font Size</label>
                    <input 
                      type="number" 
                      value={Math.round(selectedObject.fontSize || 20)}
                      onChange={e => updateSelectedObject({ fontSize: parseInt(e.target.value) })}
                      className="fi text-xs h-8"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-text-muted uppercase">Text Color</label>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={typeof selectedObject.fill === 'string' ? rgbToHex(selectedObject.fill) : '#000000'}
                        onChange={e => updateSelectedObject({ fill: e.target.value })}
                        className="w-full h-8 rounded cursor-pointer"
                      />
                      {/* @ts-ignore */}
                      {window.EyeDropper && (
                        <button
                          onClick={async () => {
                            try {
                              // @ts-ignore
                              const eyeDropper = new window.EyeDropper();
                              const result = await eyeDropper.open();
                              updateSelectedObject({ fill: result.sRGBHex });
                            } catch (e) {
                              console.log('EyeDropper cancelled');
                            }
                          }}
                          className="p-1.5 bg-bg-secondary rounded border border-border hover:bg-surface flex-shrink-0"
                          title="Pick color from PDF"
                        >
                          <Pipette size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  {selectedObject.get('data')?.isOriginal && (
                    <div className="space-y-2">
                      <label className="text-[10px] text-text-muted uppercase">Mask Color (Background)</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          value={selectedObject.get('data')?.maskColor || '#ffffff'}
                          onChange={e => {
                            const data = selectedObject.get('data');
                            updateSelectedObject({ data: { ...data, maskColor: e.target.value } });
                            // Find existing mask and update it
                            const objects = fabricRef.current?.getObjects();
                            const mask = objects?.find(o => o.get('data')?.isMask && o.get('data')?.parentId === selectedObject.get('data')?.id);
                            if (mask) {
                              mask.set('fill', e.target.value);
                              fabricRef.current?.renderAll();
                            }
                          }}
                          className="w-full h-8 rounded cursor-pointer"
                        />
                        {/* @ts-ignore */}
                        {window.EyeDropper && (
                          <button
                            onClick={async () => {
                              try {
                                // @ts-ignore
                                const eyeDropper = new window.EyeDropper();
                                const result = await eyeDropper.open();
                                const newColor = result.sRGBHex;
                                const data = selectedObject.get('data');
                                updateSelectedObject({ data: { ...data, maskColor: newColor } });
                                const objects = fabricRef.current?.getObjects();
                                const mask = objects?.find(o => o.get('data')?.isMask && o.get('data')?.parentId === selectedObject.get('data')?.id);
                                if (mask) {
                                  mask.set('fill', newColor);
                                  fabricRef.current?.renderAll();
                                }
                              } catch (e) {
                                console.log('EyeDropper cancelled');
                              }
                            }}
                            className="p-1.5 bg-bg-secondary rounded border border-border hover:bg-surface flex-shrink-0"
                            title="Pick color from PDF"
                          >
                            <Pipette size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {(selectedObject instanceof Rect || selectedObject instanceof Circle) && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] text-text-muted uppercase">Fill Color</label>
                    <input 
                      type="color" 
                      value={typeof selectedObject.fill === 'string' ? rgbToHex(selectedObject.fill) : '#ffffff'}
                      onChange={e => updateSelectedObject({ fill: e.target.value })}
                      className="w-full h-8 rounded cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-text-muted uppercase">Stroke Color</label>
                    <input 
                      type="color" 
                      value={typeof selectedObject.stroke === 'string' ? rgbToHex(selectedObject.stroke) : '#000000'}
                      onChange={e => updateSelectedObject({ stroke: e.target.value })}
                      className="w-full h-8 rounded cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-text-muted uppercase">Stroke Width</label>
                    <input 
                      type="range" 
                      min="0" max="20" 
                      value={selectedObject.strokeWidth || 0}
                      onChange={e => updateSelectedObject({ strokeWidth: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </>
              )}

              {selectedObject instanceof Path && (
                <div className="space-y-2">
                  <label className="text-[10px] text-text-muted uppercase">Stroke Color</label>
                  <input 
                    type="color" 
                    value={typeof selectedObject.stroke === 'string' ? rgbToHex(selectedObject.stroke) : '#000000'}
                    onChange={e => updateSelectedObject({ stroke: e.target.value })}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] text-text-muted uppercase">Opacity</label>
                <input 
                  type="range" 
                  min="0" max="1" step="0.1"
                  value={selectedObject.opacity || 1}
                  onChange={e => updateSelectedObject({ opacity: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          )}

          {!selectedObject && (
            <div className="text-center p-6 bg-bg-secondary rounded-xl border border-border border-dashed">
              <MousePointer2 className="w-8 h-8 text-text-muted mx-auto mb-2" />
              <p className="text-sm text-text-secondary">Select an object to edit its properties</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
