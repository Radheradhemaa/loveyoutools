import React, { useState, useMemo, useRef } from 'react';
import { 
  X, 
  Printer, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Scissors, 
  ChevronLeft, 
  ChevronRight, 
  Grid, 
  Sparkles,
  Layers,
  Sliders,
  Type
} from 'lucide-react';

export interface PaperSizeOption {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  category: 'standard' | 'photo' | 'label';
  desc: string;
}

export const PAPER_SIZES: PaperSizeOption[] = [
  { id: 'a4', name: 'A4', widthMm: 210, heightMm: 297, category: 'standard', desc: '210 × 297 mm (Most Popular)' },
  { id: 'letter', name: 'US Letter', widthMm: 215.9, heightMm: 279.4, category: 'standard', desc: '8.5 × 11 in (Standard US)' },
  { id: 'a3', name: 'A3', widthMm: 297, heightMm: 420, category: 'standard', desc: '297 × 420 mm (Large Poster)' },
  { id: 'a5', name: 'A5', widthMm: 148, heightMm: 210, category: 'standard', desc: '148 × 210 mm (Half A4 Sheet)' },
  { id: 'a6', name: 'A6', widthMm: 105, heightMm: 148, category: 'standard', desc: '105 × 148 mm (Postcard / Mini)' },
  { id: '4x6', name: '4 × 6 inch', widthMm: 101.6, heightMm: 152.4, category: 'photo', desc: 'Photo Paper / 4x6 Label' },
  { id: '5x7', name: '5 × 7 inch', widthMm: 127, heightMm: 177.8, category: 'photo', desc: 'Counter Display / Standee' },
  { id: 'square-50', name: '50 × 50 mm', widthMm: 50, heightMm: 50, category: 'label', desc: 'Square Thermal Sticker Roll' },
  { id: 'roll-50x25', name: '50 × 25 mm', widthMm: 50, heightMm: 25, category: 'label', desc: '2 × 1" Barcode / Price Sticker' },
  { id: 'roll-76x51', name: '76 × 51 mm', widthMm: 76.2, heightMm: 50.8, category: 'label', desc: '3 × 2" Shipping Box Label' },
  { id: 'custom', name: 'Custom Size', widthMm: 210, heightMm: 297, category: 'standard', desc: 'Set Custom Width × Height' }
];

interface PrintSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  itemImageSrc: string; // High-resolution data URL of the generated QR or Barcode
  itemType: 'qr' | 'barcode';
  initialQrValue?: string;
}

export default function PrintSheetModal({
  isOpen,
  onClose,
  title,
  itemImageSrc,
  itemType,
  initialQrValue = ''
}: PrintSheetModalProps) {
  // Paper & Sheet settings
  const [selectedPaperId, setSelectedPaperId] = useState<string>('a4');
  const [customPaperWidth, setCustomPaperWidth] = useState<number>(210);
  const [customPaperHeight, setCustomPaperHeight] = useState<number>(297);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // Copies & Layout settings
  const [layoutMode, setLayoutMode] = useState<'auto' | 'count' | 'grid'>('auto');
  const [copiesCount, setCopiesCount] = useState<number>(12);
  const [customGrid, setCustomGrid] = useState<{ cols: number; rows: number }>({ cols: 3, rows: 4 });

  // Physical Size of item on paper (in millimeters)
  const [itemSizeMm, setItemSizeMm] = useState<number>(itemType === 'qr' ? 38 : 50);
  const [barcodeHeightMm, setBarcodeHeightMm] = useState<number>(25);
  const [sheetMarginMm, setSheetMarginMm] = useState<number>(8);
  const [itemGapMm, setItemGapMm] = useState<number>(4);

  // Label & Card customization
  const [showHeader, setShowHeader] = useState<boolean>(false);
  const [headerText, setHeaderText] = useState<string>('SCAN ME');
  const [showFooter, setShowFooter] = useState<boolean>(false);
  const [footerText, setFooterText] = useState<string>(initialQrValue ? (initialQrValue.length > 25 ? initialQrValue.substring(0, 22) + '...' : initialQrValue) : '');
  const [showNumbering, setShowNumbering] = useState<boolean>(false);
  const [numberPrefix, setNumberPrefix] = useState<string>('#');
  const [numberStart, setNumberStart] = useState<number>(1);
  const [cutGuideStyle, setCutGuideStyle] = useState<'dashed' | 'solid' | 'box' | 'none'>('dashed');
  const [showScissors, setShowScissors] = useState<boolean>(true);

  // Preview & Export state
  const [previewZoom, setPreviewZoom] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const previewSheetRef = useRef<HTMLDivElement | null>(null);

  // Active Paper Dimensions (accounting for orientation)
  const activePaper = useMemo(() => {
    let w = 210;
    let h = 297;
    if (selectedPaperId === 'custom') {
      w = customPaperWidth;
      h = customPaperHeight;
    } else {
      const p = PAPER_SIZES.find(ps => ps.id === selectedPaperId);
      if (p) {
        w = p.widthMm;
        h = p.heightMm;
      }
    }

    if (orientation === 'landscape') {
      return { width: Math.max(w, h), height: Math.min(w, h) };
    }
    return { width: Math.min(w, h), height: Math.max(w, h) };
  }, [selectedPaperId, customPaperWidth, customPaperHeight, orientation]);

  // Card Dimensions calculation (item + text padding)
  const cardDimensions = useMemo(() => {
    const w = itemSizeMm;
    let h = itemType === 'qr' ? itemSizeMm : barcodeHeightMm;
    if (showHeader) h += 7; // extra mm for header text
    if (showFooter) h += 6; // extra mm for footer text
    if (showNumbering) h += 5; // extra mm for serial number
    return { width: w, height: h };
  }, [itemSizeMm, barcodeHeightMm, itemType, showHeader, showFooter, showNumbering]);

  // Grid Capacity calculation (how many fit on one page)
  const gridCapacity = useMemo(() => {
    const availW = activePaper.width - (sheetMarginMm * 2);
    const availH = activePaper.height - (sheetMarginMm * 2);

    if (availW <= 0 || availH <= 0) return { cols: 1, rows: 1, perPage: 1 };

    const cols = Math.max(1, Math.floor((availW + itemGapMm) / (cardDimensions.width + itemGapMm)));
    const rows = Math.max(1, Math.floor((availH + itemGapMm) / (cardDimensions.height + itemGapMm)));
    const perPage = cols * rows;

    return { cols, rows, perPage };
  }, [activePaper, sheetMarginMm, itemGapMm, cardDimensions]);

  // Effective layout parameters based on selected mode
  const effectiveLayout = useMemo(() => {
    if (layoutMode === 'auto') {
      return {
        cols: gridCapacity.cols,
        rows: gridCapacity.rows,
        perPage: gridCapacity.perPage,
        totalCopies: gridCapacity.perPage,
        totalPages: 1
      };
    } else if (layoutMode === 'grid') {
      const perPage = customGrid.cols * customGrid.rows;
      return {
        cols: customGrid.cols,
        rows: customGrid.rows,
        perPage,
        totalCopies: perPage,
        totalPages: 1
      };
    } else {
      // count mode
      const perPage = gridCapacity.perPage;
      const totalPages = Math.max(1, Math.ceil(copiesCount / perPage));
      return {
        cols: gridCapacity.cols,
        rows: gridCapacity.rows,
        perPage,
        totalCopies: copiesCount,
        totalPages
      };
    }
  }, [layoutMode, gridCapacity, customGrid, copiesCount]);

  // Items to render on the current page preview
  const currentPageItems = useMemo(() => {
    const startIndex = (currentPage - 1) * effectiveLayout.perPage;
    const countThisPage = Math.min(
      effectiveLayout.perPage,
      Math.max(0, effectiveLayout.totalCopies - startIndex)
    );

    return Array.from({ length: countThisPage }, (_, i) => ({
      index: startIndex + i,
      serialNum: numberStart + startIndex + i
    }));
  }, [currentPage, effectiveLayout, numberStart]);

  if (!isOpen) return null;

  // --- Print Handler using Browser Print Window ---
  const handlePrintSheet = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this website to print.');
      return;
    }

    const totalPages = effectiveLayout.totalPages;
    let pagesHtml = '';

    for (let p = 0; p < totalPages; p++) {
      const startIndex = p * effectiveLayout.perPage;
      const itemsInThisPage = Math.min(
        effectiveLayout.perPage,
        effectiveLayout.totalCopies - startIndex
      );

      let itemsHtml = '';
      for (let i = 0; i < itemsInThisPage; i++) {
        const itemIdx = startIndex + i;
        const serial = numberStart + itemIdx;

        let borderCss = 'border: none;';
        if (cutGuideStyle === 'dashed') borderCss = 'border: 1px dashed #999;';
        else if (cutGuideStyle === 'solid') borderCss = 'border: 1px solid #777;';
        else if (cutGuideStyle === 'box') borderCss = 'border: 1.5px solid #222; border-radius: 4mm;';

        itemsHtml += `
          <div class="print-card" style="${borderCss} width: ${cardDimensions.width}mm; height: ${cardDimensions.height}mm; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 1.5mm; overflow: hidden; page-break-inside: avoid;">
            ${showScissors && cutGuideStyle !== 'none' ? `<span style="position: absolute; top: 0.5mm; right: 0.5mm; font-size: 7px; color: #888;">✂</span>` : ''}
            ${showHeader && headerText ? `<div style="font-size: 8pt; font-weight: 800; text-transform: uppercase; margin-bottom: 1mm; text-align: center; color: #111; letter-spacing: 0.5px;">${headerText}</div>` : ''}
            <img src="${itemImageSrc}" style="width: ${itemSizeMm - 3}mm; height: ${itemType === 'qr' ? itemSizeMm - 3 : barcodeHeightMm}mm; object-fit: contain; image-rendering: pixelated;" />
            ${showFooter && footerText ? `<div style="font-size: 7pt; font-weight: 600; margin-top: 1mm; text-align: center; color: #333; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${footerText}</div>` : ''}
            ${showNumbering ? `<div style="font-size: 6.5pt; font-weight: 700; color: #555; margin-top: 0.5mm;">${numberPrefix}${serial}</div>` : ''}
          </div>
        `;
      }

      pagesHtml += `
        <div class="print-page" style="width: ${activePaper.width}mm; height: ${activePaper.height}mm; padding: ${sheetMarginMm}mm; box-sizing: border-box; page-break-after: always; display: grid; grid-template-columns: repeat(${effectiveLayout.cols}, ${cardDimensions.width}mm); grid-auto-rows: ${cardDimensions.height}mm; gap: ${itemGapMm}mm; justify-content: center; align-content: center; background: #fff;">
          ${itemsHtml}
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - Print Sheet (${effectiveLayout.totalCopies} Copies)</title>
          <style>
            @page {
              size: ${activePaper.width}mm ${activePaper.height}mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-page:last-child {
              page-break-after: auto;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // --- Download 300 DPI High-Resolution Sheet Image ---
  const handleDownloadSheetImage = async () => {
    setIsExporting(true);
    try {
      const dpi = 300;
      const mmToPx = (mm: number) => Math.round((mm / 25.4) * dpi);

      const canvasWidth = mmToPx(activePaper.width);
      const canvasHeight = mmToPx(activePaper.height);

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      // Crisp background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Load item image
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = itemImageSrc;
      });

      const cardW = mmToPx(cardDimensions.width);
      const cardH = mmToPx(cardDimensions.height);
      const gapPx = mmToPx(itemGapMm);
      const marginPx = mmToPx(sheetMarginMm);

      const cols = effectiveLayout.cols;
      const rows = effectiveLayout.rows;

      // Center the grid on the sheet
      const gridW = cols * cardW + (cols - 1) * gapPx;
      const gridH = rows * cardH + (rows - 1) * gapPx;
      const startX = Math.max(marginPx, (canvasWidth - gridW) / 2);
      const startY = Math.max(marginPx, (canvasHeight - gridH) / 2);

      const startIndex = (currentPage - 1) * effectiveLayout.perPage;
      const itemsInThisPage = Math.min(
        effectiveLayout.perPage,
        effectiveLayout.totalCopies - startIndex
      );

      for (let i = 0; i < itemsInThisPage; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (cardW + gapPx);
        const y = startY + row * (cardH + gapPx);
        const serial = numberStart + startIndex + i;

        // Draw cut guide lines if enabled
        if (cutGuideStyle === 'dashed') {
          ctx.strokeStyle = '#cccccc';
          ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
          ctx.setLineDash([Math.round(dpi / 15), Math.round(dpi / 20)]);
          ctx.strokeRect(x, y, cardW, cardH);
          ctx.setLineDash([]);
        } else if (cutGuideStyle === 'solid') {
          ctx.strokeStyle = '#999999';
          ctx.lineWidth = Math.max(1, Math.round(dpi / 150));
          ctx.strokeRect(x, y, cardW, cardH);
        } else if (cutGuideStyle === 'box') {
          ctx.strokeStyle = '#333333';
          ctx.lineWidth = Math.max(2, Math.round(dpi / 100));
          ctx.beginPath();
          const radius = mmToPx(3);
          ctx.roundRect(x, y, cardW, cardH, radius);
          ctx.stroke();
        }

        // Draw Header text
        let curY = y + mmToPx(2);
        if (showHeader && headerText) {
          ctx.fillStyle = '#111111';
          ctx.font = `bold ${mmToPx(3.2)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(headerText.toUpperCase(), x + cardW / 2, curY);
          curY += mmToPx(4.5);
        }

        // Draw QR/Barcode image
        const imgW = mmToPx(itemSizeMm - 3);
        const imgH = mmToPx(itemType === 'qr' ? itemSizeMm - 3 : barcodeHeightMm);
        const imgX = x + (cardW - imgW) / 2;
        ctx.drawImage(img, imgX, curY, imgW, imgH);
        curY += imgH + mmToPx(1.5);

        // Draw Footer text
        if (showFooter && footerText) {
          ctx.fillStyle = '#444444';
          ctx.font = `600 ${mmToPx(2.5)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(footerText, x + cardW / 2, curY);
          curY += mmToPx(3.5);
        }

        // Draw Serial Number
        if (showNumbering) {
          ctx.fillStyle = '#777777';
          ctx.font = `bold ${mmToPx(2.2)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(`${numberPrefix}${serial}`, x + cardW / 2, curY);
        }
      }

      const link = document.createElement('a');
      link.download = `${title.toLowerCase().replace(/\s+/g, '-')}-sheet-${selectedPaperId}-${effectiveLayout.totalCopies}copies-p${currentPage}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`Export failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface text-text-primary rounded-3xl border border-border shadow-2xl flex flex-col w-full max-w-6xl max-h-[94vh] overflow-hidden">
        
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-bg-secondary/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                Print Multiple Copies on Sheet
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                  Multi-Paper Size
                </span>
              </h2>
              <p className="text-xs text-text-muted">
                Print multiple {itemType === 'qr' ? 'QR codes' : 'barcodes'} on A4, Letter, stickers, or custom paper sizes.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Two Columns (Controls on Left, Real Sheet Preview on Right) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          
          {/* LEFT CONTROLS PANEL */}
          <div className="lg:col-span-5 p-5 border-r border-border overflow-y-auto custom-scrollbar space-y-5 bg-surface">
            
            {/* 1. Paper Size Selection */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-accent" /> Paper Size
              </label>
              
              <div className="grid grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                {PAPER_SIZES.map((paper) => (
                  <button
                    key={paper.id}
                    type="button"
                    onClick={() => setSelectedPaperId(paper.id)}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      selectedPaperId === paper.id
                        ? 'border-accent bg-accent/10 text-accent font-bold ring-1 ring-accent'
                        : 'border-border hover:bg-bg-secondary text-text-secondary'
                    }`}
                  >
                    <div className="text-xs font-bold leading-tight">{paper.name}</div>
                    <div className="text-[9px] text-text-muted truncate mt-0.5">{paper.desc}</div>
                  </button>
                ))}
              </div>

              {selectedPaperId === 'custom' && (
                <div className="grid grid-cols-2 gap-2 p-2.5 bg-bg-secondary/60 rounded-xl border border-border">
                  <div>
                    <label className="text-[10px] font-bold text-text-muted block mb-1">Width (mm)</label>
                    <input
                      type="number"
                      min="30"
                      max="1000"
                      value={customPaperWidth}
                      onChange={(e) => setCustomPaperWidth(Number(e.target.value))}
                      className="fi text-xs py-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text-muted block mb-1">Height (mm)</label>
                    <input
                      type="number"
                      min="30"
                      max="1000"
                      value={customPaperHeight}
                      onChange={(e) => setCustomPaperHeight(Number(e.target.value))}
                      className="fi text-xs py-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 2. Orientation */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-text-secondary">Orientation</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    orientation === 'portrait' ? 'bg-accent text-white border-accent' : 'border-border hover:bg-bg-secondary text-text-secondary'
                  }`}
                >
                  Portrait (Vertical)
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`flex-1 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    orientation === 'landscape' ? 'bg-accent text-white border-accent' : 'border-border hover:bg-bg-secondary text-text-secondary'
                  }`}
                >
                  Landscape (Horizontal)
                </button>
              </div>
            </div>

            {/* 3. Layout & Copies Mode */}
            <div className="space-y-2 pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                  <Grid className="w-3.5 h-3.5 text-accent" /> Copies & Layout
                </label>
                <span className="text-[11px] font-mono font-bold text-accent px-2 py-0.5 rounded-full bg-accent/10">
                  {effectiveLayout.totalCopies} Copies
                </span>
              </div>

              <div className="flex gap-1.5 p-1 bg-bg-secondary rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setLayoutMode('auto')}
                  className={`flex-1 py-1 rounded-lg text-xs font-bold transition-colors ${
                    layoutMode === 'auto' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Auto Fill Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('count')}
                  className={`flex-1 py-1 rounded-lg text-xs font-bold transition-colors ${
                    layoutMode === 'count' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Set Count
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('grid')}
                  className={`flex-1 py-1 rounded-lg text-xs font-bold transition-colors ${
                    layoutMode === 'grid' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Custom Grid
                </button>
              </div>

              {layoutMode === 'count' && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={copiesCount}
                      onChange={(e) => setCopiesCount(Number(e.target.value))}
                      className="flex-1 accent-accent"
                    />
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={copiesCount}
                      onChange={(e) => setCopiesCount(Math.max(1, Number(e.target.value)))}
                      className="w-16 fi text-xs py-1 text-center font-bold"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[1, 4, 6, 8, 12, 16, 20, 24, 30, 48].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCopiesCount(n)}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-bold ${
                          copiesCount === n ? 'bg-accent text-white border-accent' : 'border-border text-text-secondary hover:bg-bg-secondary'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {layoutMode === 'grid' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-text-muted block mb-1">Columns</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={customGrid.cols}
                      onChange={(e) => setCustomGrid({ ...customGrid, cols: Math.max(1, Number(e.target.value)) })}
                      className="fi text-xs py-1 text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text-muted block mb-1">Rows</label>
                    <input
                      type="number"
                      min="1"
                      max="15"
                      value={customGrid.rows}
                      onChange={(e) => setCustomGrid({ ...customGrid, rows: Math.max(1, Number(e.target.value)) })}
                      className="fi text-xs py-1 text-center font-bold"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 4. Physical Dimensions on Paper (mm) */}
            <div className="space-y-3 pt-3 border-t border-border">
              <label className="text-xs font-black uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-accent" /> Size & Spacing (mm)
              </label>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-text-secondary">
                    {itemType === 'qr' ? 'QR Code Size' : 'Barcode Width'}: {itemSizeMm}mm
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {(itemSizeMm / 25.4).toFixed(1)} inches
                  </span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="120"
                  step="1"
                  value={itemSizeMm}
                  onChange={(e) => setItemSizeMm(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <div className="flex flex-wrap gap-1">
                  {[25, 35, 45, 50, 60, 75].map((mm) => (
                    <button
                      key={mm}
                      type="button"
                      onClick={() => setItemSizeMm(mm)}
                      className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                        itemSizeMm === mm ? 'bg-accent text-white border-accent' : 'border-border text-text-secondary hover:bg-bg-secondary'
                      }`}
                    >
                      {mm}mm
                    </button>
                  ))}
                </div>
              </div>

              {itemType === 'barcode' && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-text-secondary">Barcode Height: {barcodeHeightMm}mm</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="1"
                    value={barcodeHeightMm}
                    onChange={(e) => setBarcodeHeightMm(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-text-muted mb-1">
                    <span>Sheet Margin: {sheetMarginMm}mm</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="25"
                    step="1"
                    value={sheetMarginMm}
                    onChange={(e) => setSheetMarginMm(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-text-muted mb-1">
                    <span>Item Gap: {itemGapMm}mm</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={itemGapMm}
                    onChange={(e) => setItemGapMm(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                </div>
              </div>
            </div>

            {/* 5. Cut Guides & Card Labels */}
            <div className="space-y-3 pt-3 border-t border-border">
              <label className="text-xs font-black uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-accent" /> Cutting Guides & Labels
              </label>

              {/* Cut Guide Line Style */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-text-muted block">Cutting Border Style</label>
                <div className="grid grid-cols-4 gap-1">
                  {(['dashed', 'solid', 'box', 'none'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setCutGuideStyle(style)}
                      className={`py-1 rounded-lg border text-[11px] font-bold capitalize transition-colors ${
                        cutGuideStyle === style ? 'bg-accent text-white border-accent' : 'border-border text-text-secondary hover:bg-bg-secondary'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
                {cutGuideStyle !== 'none' && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-text-muted">Display scissor cut marks (✂)</span>
                    <input
                      type="checkbox"
                      checked={showScissors}
                      onChange={(e) => setShowScissors(e.target.checked)}
                      className="accent-accent cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Header Text toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-secondary flex items-center gap-1">
                    <Type className="w-3 h-3 text-accent" /> Top Header Text
                  </span>
                  <input
                    type="checkbox"
                    checked={showHeader}
                    onChange={(e) => setShowHeader(e.target.checked)}
                    className="accent-accent cursor-pointer"
                  />
                </div>
                {showHeader && (
                  <input
                    type="text"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    placeholder="e.g. SCAN TO PAY, FREE WIFI"
                    className="fi text-xs py-1"
                  />
                )}
              </div>

              {/* Footer Text toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-secondary flex items-center gap-1">
                    <Type className="w-3 h-3 text-accent" /> Bottom Footer Text
                  </span>
                  <input
                    type="checkbox"
                    checked={showFooter}
                    onChange={(e) => setShowFooter(e.target.checked)}
                    className="accent-accent cursor-pointer"
                  />
                </div>
                {showFooter && (
                  <input
                    type="text"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="e.g. Table # or URL"
                    className="fi text-xs py-1"
                  />
                )}
              </div>

              {/* Sequential Numbering toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-text-secondary block">Sequential Numbering</span>
                    <span className="text-[10px] text-text-muted">Auto-number each copy (#1, #2, #3...)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={showNumbering}
                    onChange={(e) => setShowNumbering(e.target.checked)}
                    className="accent-accent cursor-pointer"
                  />
                </div>
                {showNumbering && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] font-bold text-text-muted block mb-1">Prefix</label>
                      <input
                        type="text"
                        value={numberPrefix}
                        onChange={(e) => setNumberPrefix(e.target.value)}
                        placeholder="#"
                        className="fi text-xs py-1 text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-text-muted block mb-1">Start At</label>
                      <input
                        type="number"
                        min="1"
                        value={numberStart}
                        onChange={(e) => setNumberStart(Number(e.target.value))}
                        className="fi text-xs py-1 text-center font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* RIGHT LIVE SHEET PREVIEW PANEL */}
          <div className="lg:col-span-7 flex flex-col bg-bg-secondary/40 min-h-0 overflow-hidden">
            
            {/* Preview Toolbar */}
            <div className="px-5 py-2.5 border-b border-border bg-surface/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-text-secondary flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>
                    {activePaper.width} × {activePaper.height} mm
                  </span>
                  <span className="text-[11px] text-text-muted font-normal">
                    ({effectiveLayout.cols} Cols × {effectiveLayout.rows} Rows • {effectiveLayout.perPage} / page)
                  </span>
                </span>
              </div>

              {/* Zoom Controls & Page Navigation */}
              <div className="flex items-center gap-2">
                {effectiveLayout.totalPages > 1 && (
                  <div className="flex items-center gap-1 mr-2 px-2 py-0.5 rounded-lg bg-bg-secondary text-xs font-bold">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="p-1 hover:text-accent disabled:opacity-30"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span>{currentPage} / {effectiveLayout.totalPages}</span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(effectiveLayout.totalPages, p + 1))}
                      disabled={currentPage >= effectiveLayout.totalPages}
                      className="p-1 hover:text-accent disabled:opacity-30"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-1 bg-bg-secondary rounded-lg p-0.5 border border-border">
                  <button
                    onClick={() => setPreviewZoom(z => Math.max(0.5, z - 0.1))}
                    className="p-1 text-text-muted hover:text-text-primary rounded"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono font-bold px-1.5 text-text-secondary">
                    {Math.round(previewZoom * 100)}%
                  </span>
                  <button
                    onClick={() => setPreviewZoom(z => Math.min(1.8, z + 0.1))}
                    className="p-1 text-text-muted hover:text-text-primary rounded"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPreviewZoom(1)}
                    className="p-1 text-text-muted hover:text-text-primary rounded"
                    title="Reset Zoom"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Sheet Viewport */}
            <div className="flex-1 p-6 overflow-auto custom-scrollbar flex items-center justify-center bg-zinc-800/10 dark:bg-black/40">
              
              {/* The Paper Sheet Container */}
              <div 
                ref={previewSheetRef}
                style={{
                  width: `${activePaper.width * 2.2 * previewZoom}px`,
                  height: `${activePaper.height * 2.2 * previewZoom}px`,
                  padding: `${sheetMarginMm * 2.2 * previewZoom}px`,
                  gridTemplateColumns: `repeat(${effectiveLayout.cols}, minmax(0, 1fr))`,
                  gap: `${itemGapMm * 2.2 * previewZoom}px`,
                }}
                className="bg-white text-black shadow-2xl rounded-sm border border-border/40 grid items-center justify-center transition-all duration-150 origin-center select-none"
              >
                {currentPageItems.map((item) => (
                  <div
                    key={item.index}
                    style={{
                      padding: `${1.5 * 2.2 * previewZoom}px`,
                      borderRadius: cutGuideStyle === 'box' ? `${3 * 2.2 * previewZoom}px` : 0,
                    }}
                    className={`flex flex-col items-center justify-center relative bg-white transition-all ${
                      cutGuideStyle === 'dashed'
                        ? 'border border-dashed border-zinc-400'
                        : cutGuideStyle === 'solid'
                        ? 'border border-solid border-zinc-600'
                        : cutGuideStyle === 'box'
                        ? 'border-2 border-zinc-900 shadow-xs'
                        : 'border-transparent'
                    }`}
                  >
                    {/* Tiny Scissor Indicator */}
                    {showScissors && cutGuideStyle !== 'none' && (
                      <span 
                        style={{ fontSize: `${7 * previewZoom}px` }} 
                        className="absolute top-0.5 right-0.5 text-zinc-400 select-none"
                      >
                        ✂
                      </span>
                    )}

                    {/* Optional Top Header */}
                    {showHeader && headerText && (
                      <span 
                        style={{ fontSize: `${8 * previewZoom}px`, marginBottom: `${1 * 2.2 * previewZoom}px` }} 
                        className="font-black tracking-wide text-zinc-900 uppercase text-center line-clamp-1 leading-tight"
                      >
                        {headerText}
                      </span>
                    )}

                    {/* The QR / Barcode image */}
                    <img
                      src={itemImageSrc}
                      alt={`Copy ${item.index + 1}`}
                      style={{
                        width: `${(itemSizeMm - 3) * 2.2 * previewZoom}px`,
                        height: `${(itemType === 'qr' ? itemSizeMm - 3 : barcodeHeightMm) * 2.2 * previewZoom}px`,
                        imageRendering: 'pixelated'
                      }}
                      className="object-contain"
                    />

                    {/* Optional Footer Text */}
                    {showFooter && footerText && (
                      <span 
                        style={{ fontSize: `${7 * previewZoom}px`, marginTop: `${1 * 2.2 * previewZoom}px` }} 
                        className="font-semibold text-zinc-700 text-center line-clamp-1 leading-tight max-w-full overflow-hidden"
                      >
                        {footerText}
                      </span>
                    )}

                    {/* Optional Serial Number */}
                    {showNumbering && (
                      <span 
                        style={{ fontSize: `${6.5 * previewZoom}px`, marginTop: `${0.5 * 2.2 * previewZoom}px` }} 
                        className="font-bold text-zinc-500 text-center"
                      >
                        {numberPrefix}{item.serialNum}
                      </span>
                    )}
                  </div>
                ))}
              </div>

            </div>

            {/* Bottom Export Actions */}
            <div className="p-4 border-t border-border bg-surface flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-text-muted flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>
                  Ready to print: <strong>{effectiveLayout.totalCopies} copies</strong> on <strong>{selectedPaperId.toUpperCase()}</strong> ({activePaper.width}×{activePaper.height} mm)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSheetImage}
                  disabled={isExporting}
                  className="btn bg-bg-secondary hover:bg-bg-secondary/80 text-text-primary border border-border px-4 py-2.5 text-xs font-bold gap-2 cursor-pointer disabled:opacity-50"
                  title="Download 300 DPI high-resolution sheet image"
                >
                  <Download className="w-4 h-4 text-accent" />
                  <span>{isExporting ? 'Generating...' : 'Download Sheet (300 DPI PNG)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintSheet}
                  className="btn bp px-5 py-2.5 text-xs font-black uppercase tracking-wider gap-2 shadow-lg shadow-accent/25 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Sheet Now</span>
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
