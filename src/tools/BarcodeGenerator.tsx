import { useState, useRef, useEffect } from 'react';
import JsBarcode from 'jsbarcode';
import { 
  Download, Type, Settings, Palette, Check, AlertTriangle, 
  Sparkles, Barcode as BarcodeIcon, Printer, Sliders, Info,
  Copy, CheckCheck
} from 'lucide-react';
import PrintSheetModal from './PrintSheetModal';

export type BarcodeFormat = 
  | 'CODE128' 
  | 'EAN13' 
  | 'UPC' 
  | 'EAN8' 
  | 'CODE39' 
  | 'ITF14' 
  | 'MSI' 
  | 'pharmacode' 
  | 'codabar';

export interface BarcodeFormatMeta {
  id: BarcodeFormat;
  name: string;
  defaultVal: string;
  description: string;
  example: string;
  patternHelp: string;
}

export const BARCODE_FORMATS: BarcodeFormatMeta[] = [
  { 
    id: 'CODE128', 
    name: 'Code 128 (Universal)', 
    defaultVal: 'PROD-849204-X', 
    description: 'High-density alphanumeric barcode. Best for packaging, inventory, and logistics.',
    example: 'PROD-849204-X',
    patternHelp: 'Accepts all standard 128 ASCII characters (letters, numbers, symbols).'
  },
  { 
    id: 'EAN13', 
    name: 'EAN-13 (International Retail)', 
    defaultVal: '5901234123457', 
    description: 'Standard 13-digit barcode used for retail products worldwide.',
    example: '5901234123457',
    patternHelp: 'Requires exactly 12 or 13 digits. 13th digit is auto-calculated checksum.'
  },
  { 
    id: 'UPC', 
    name: 'UPC-A (USA / Canada Retail)', 
    defaultVal: '123456789012', 
    description: 'Standard 12-digit barcode used across North America retail stores.',
    example: '123456789012',
    patternHelp: 'Requires exactly 11 or 12 digits. 12th digit is auto-calculated checksum.'
  },
  { 
    id: 'EAN8', 
    name: 'EAN-8 (Small Packages)', 
    defaultVal: '96385074', 
    description: 'Compact 8-digit retail barcode for small products (candies, cosmetics).',
    example: '96385074',
    patternHelp: 'Requires exactly 7 or 8 digits.'
  },
  { 
    id: 'CODE39', 
    name: 'Code 39 (Industrial & Military)', 
    defaultVal: 'CODE39-TEST', 
    description: 'Classic industrial format used in defense, automotive, and healthcare.',
    example: 'ITEM-980',
    patternHelp: 'Uppercase letters (A-Z), digits (0-9), and symbols (- . $ / + % SPACE).'
  },
  { 
    id: 'ITF14', 
    name: 'ITF-14 (Shipping Master Carton)', 
    defaultVal: '10012345678902', 
    description: '14-digit format printed directly onto corrugated shipping cartons.',
    example: '10012345678902',
    patternHelp: 'Requires exactly 14 digits.'
  },
  { 
    id: 'MSI', 
    name: 'MSI / Plessey (Warehouses)', 
    defaultVal: '1234567', 
    description: 'Numeric barcode widely used for warehouse shelving and retail inventory.',
    example: '1234567',
    patternHelp: 'Digits only (0-9).'
  },
  { 
    id: 'pharmacode', 
    name: 'Pharmacode (Pharma Packaging)', 
    defaultVal: '1234', 
    description: 'One-track barcode used as a packaging control system in pharmaceuticals.',
    example: '1234',
    patternHelp: 'Integer number between 3 and 131070.'
  },
  { 
    id: 'codabar', 
    name: 'Codabar (Libraries & Blood Banks)', 
    defaultVal: 'A12345678B', 
    description: 'Used in libraries, blood banks, and airbills.',
    example: 'A12345678B',
    patternHelp: 'Starts and ends with A, B, C, or D; numbers and - $ : / . + inside.'
  },
];

interface ColorPreset {
  id: string;
  name: string;
  fg: string;
  bg: string;
}

const COLOR_PRESETS: ColorPreset[] = [
  { id: 'classic', name: 'Classic B&W (Best Scan)', fg: '#000000', bg: '#ffffff' },
  { id: 'dark', name: 'Midnight Dark', fg: '#ffffff', bg: '#0f172a' },
  { id: 'corporate', name: 'Corporate Blue', fg: '#1d4ed8', bg: '#ffffff' },
  { id: 'emerald', name: 'Emerald Forest', fg: '#047857', bg: '#ffffff' },
  { id: 'crimson', name: 'Crimson Red', fg: '#b91c1c', bg: '#ffffff' },
  { id: 'sunset', name: 'Sunset Bronze', fg: '#c2410c', bg: '#fff7ed' },
];

export default function BarcodeGenerator() {
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>('CODE128');
  const [barcodeValue, setBarcodeValue] = useState('PROD-849204-X');
  const [barcodeFgColor, setBarcodeFgColor] = useState('#000000');
  const [barcodeBgColor, setBarcodeBgColor] = useState('#ffffff');
  const [barcodeIsTransparentBg, setBarcodeIsTransparentBg] = useState(false);
  const [barcodeBarWidth, setBarcodeBarWidth] = useState(2);
  const [barcodeHeight, setBarcodeHeight] = useState(80);
  const [barcodeMargin, setBarcodeMargin] = useState(10);
  const [barcodeDisplayValue, setBarcodeDisplayValue] = useState(true);
  const [barcodeCustomText, setBarcodeCustomText] = useState('');
  const [barcodeFont, setBarcodeFont] = useState('monospace');
  const [barcodeFontSize, setBarcodeFontSize] = useState(16);
  const [barcodeFontOptions, setBarcodeFontOptions] = useState<'bold' | ''>('bold');
  const [barcodeTextAlign, setBarcodeTextAlign] = useState<'center' | 'left' | 'right'>('center');
  const [barcodeTextPosition, setBarcodeTextPosition] = useState<'bottom' | 'top'>('bottom');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeDownloadFormat, setBarcodeDownloadFormat] = useState<'png' | 'svg' | 'jpeg'>('png');
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Print Sheet Modal State
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printModalItemImage, setPrintModalItemImage] = useState<string>('');

  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);

  const currentBarcodeMeta = BARCODE_FORMATS.find(f => f.id === barcodeFormat) || BARCODE_FORMATS[0];

  // Render Barcode on SVG with JsBarcode
  useEffect(() => {
    if (barcodeSvgRef.current) {
      try {
        const effectiveBarcodeBg = barcodeIsTransparentBg ? 'transparent' : barcodeBgColor;
        JsBarcode(barcodeSvgRef.current, barcodeValue || ' ', {
          format: barcodeFormat,
          lineColor: barcodeFgColor,
          background: effectiveBarcodeBg,
          width: barcodeBarWidth,
          height: barcodeHeight,
          displayValue: barcodeDisplayValue,
          text: barcodeCustomText.trim() ? barcodeCustomText : undefined,
          fontOptions: barcodeFontOptions,
          font: barcodeFont,
          textAlign: barcodeTextAlign,
          textPosition: barcodeTextPosition,
          textMargin: 4,
          fontSize: barcodeFontSize,
          margin: barcodeMargin,
          valid: (valid: boolean) => {
            if (!valid) {
              setBarcodeError('Invalid barcode data format');
            } else {
              setBarcodeError(null);
            }
          }
        });
        setBarcodeError(null);
      } catch (err: any) {
        setBarcodeError(err?.message || 'Invalid barcode format for this data');
      }
    }
  }, [
    barcodeFormat, 
    barcodeValue, 
    barcodeFgColor, 
    barcodeBgColor, 
    barcodeIsTransparentBg,
    barcodeBarWidth, 
    barcodeHeight, 
    barcodeMargin, 
    barcodeDisplayValue, 
    barcodeCustomText, 
    barcodeFont, 
    barcodeFontSize, 
    barcodeFontOptions, 
    barcodeTextAlign, 
    barcodeTextPosition
  ]);

  const handleBarcodeFormatChange = (fmt: BarcodeFormat) => {
    setBarcodeFormat(fmt);
    const meta = BARCODE_FORMATS.find(f => f.id === fmt);
    if (meta) {
      setBarcodeValue(meta.defaultVal);
    }
  };

  const handleAutoFixEan13 = () => {
    const raw = barcodeValue.replace(/\D/g, '');
    if (raw.length === 12 || raw.length === 13) {
      const base12 = raw.substring(0, 12);
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        const digit = parseInt(base12[i], 10);
        sum += (i % 2 === 0) ? digit : digit * 3;
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      setBarcodeValue(base12 + checkDigit.toString());
      setBarcodeError(null);
    }
  };

  const handleDownloadBarcode = () => {
    if (!barcodeSvgRef.current) return;

    if (barcodeDownloadFormat === 'svg') {
      const svgData = new XMLSerializer().serializeToString(barcodeSvgRef.current);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const a = document.createElement('a');
      a.href = svgUrl;
      a.download = `barcode-${barcodeFormat.toLowerCase()}-${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
    } else {
      const svgElement = barcodeSvgRef.current;
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const URL_OBJ = window.URL || window.webkitURL || window;
      const blobURL = URL_OBJ.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        const scale = 3;
        const canvas = document.createElement('canvas');
        canvas.width = image.width * scale;
        canvas.height = image.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;

        if (barcodeDownloadFormat === 'jpeg' || !barcodeIsTransparentBg) {
          ctx.fillStyle = barcodeBgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const mimeType = barcodeDownloadFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
        const url = canvas.toDataURL(mimeType, 0.98);
        const a = document.createElement('a');
        a.href = url;
        a.download = `barcode-${barcodeFormat.toLowerCase()}-${Date.now()}.${barcodeDownloadFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL_OBJ.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    }
  };

  const handlePrintBarcode = () => {
    if (!barcodeSvgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(barcodeSvgRef.current);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Barcode - ${barcodeValue}</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: system-ui, sans-serif;
            }
            .barcode-box {
              text-align: center;
              padding: 10px;
            }
            @media print {
              body { padding: 0; }
              @page { margin: 5mm; }
            }
          </style>
        </head>
        <body>
          <div class="barcode-box">
            ${svgData}
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); }
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleOpenPrintSheet = () => {
    if (!barcodeSvgRef.current) return;
    const svg = barcodeSvgRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const off = document.createElement('canvas');
      off.width = (img.width || 400) * scale;
      off.height = (img.height || 120) * scale;
      const ctx = off.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        if (!barcodeIsTransparentBg) {
          ctx.fillStyle = barcodeBgColor;
          ctx.fillRect(0, 0, off.width, off.height);
        }
        ctx.drawImage(img, 0, 0, off.width, off.height);
        setPrintModalItemImage(off.toDataURL('image/png'));
      } else {
        setPrintModalItemImage(url);
      }
      URL.revokeObjectURL(url);
      setPrintModalOpen(true);
    };
    img.src = url;
  };

  const handleCopyPayload = () => {
    if (!barcodeValue) return;
    navigator.clipboard.writeText(barcodeValue);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div className="tool-layout-container">
      {/* Left Sidebar */}
      <aside className="tool-sidebar">
        <div className="sidebar-header p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <BarcodeIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight">Barcode Settings</h2>
              <p className="text-[10px] text-text-muted">1D Barcodes for retail & logistics</p>
            </div>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-bold">
            {currentBarcodeMeta.name.split(' ')[0]}
          </span>
        </div>

        <div className="sidebar-content custom-scrollbar p-6 space-y-6">
          {/* Format Selector */}
          <div className="space-y-3">
            <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
              <BarcodeIcon className="w-4 h-4 text-accent" /> 1D Barcode Symbology
            </h3>

            <div className="grid grid-cols-1 gap-1.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
              {BARCODE_FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => handleBarcodeFormatChange(fmt.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 ${
                    barcodeFormat === fmt.id
                      ? 'border-accent bg-accent/5 ring-1 ring-accent text-text-primary'
                      : 'border-border bg-surface hover:border-accent/40 text-text-secondary'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold">{fmt.name}</div>
                    <div className="text-[10px] text-text-muted line-clamp-1">{fmt.description}</div>
                  </div>
                  {barcodeFormat === fmt.id && <Check className="w-4 h-4 text-accent shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Barcode Value Input */}
          <div className="pt-4 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-accent" /> Barcode Value
              </label>
              {(barcodeFormat === 'EAN13' || barcodeFormat === 'UPC') && (
                <button
                  type="button"
                  onClick={handleAutoFixEan13}
                  className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Auto Check Digit
                </button>
              )}
            </div>

            <input
              type="text"
              className="fi font-mono text-sm tracking-wider"
              value={barcodeValue}
              onChange={(e) => setBarcodeValue(e.target.value)}
              placeholder={currentBarcodeMeta.example}
            />

            {barcodeError ? (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Invalid Barcode Input</span>
                  <span className="text-[11px] opacity-90">{currentBarcodeMeta.patternHelp}</span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-text-muted flex items-center gap-1">
                <Info className="w-3 h-3 text-accent" /> {currentBarcodeMeta.patternHelp}
              </p>
            )}
          </div>

          {/* Bar Dimensions */}
          <div className="pt-4 border-t border-border space-y-3">
            <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
              <Sliders className="w-4 h-4 text-accent" /> Dimensions & Sizing
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="fg">
                <label className="fl text-xs font-bold">Bar Width</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setBarcodeBarWidth(w)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                        barcodeBarWidth === w 
                          ? 'bg-accent text-white border-accent' 
                          : 'border-border text-text-secondary hover:bg-bg-secondary'
                      }`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>

              <div className="fg">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-text-secondary">Height: {barcodeHeight}px</label>
                </div>
                <input 
                  type="range" 
                  min="30" max="160" step="5" 
                  value={barcodeHeight} 
                  onChange={(e) => setBarcodeHeight(Number(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            </div>

            <div className="fg">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-text-secondary">Margin: {barcodeMargin}px</label>
              </div>
              <input 
                type="range" 
                min="0" max="30" step="2" 
                value={barcodeMargin} 
                onChange={(e) => setBarcodeMargin(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          </div>

          {/* Human Readable Text Label Controls */}
          <div className="pt-4 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-text-secondary block">Display Text Label</span>
                <span className="text-[10px] text-text-muted">Print numbers beneath bars</span>
              </div>
              <button
                type="button"
                onClick={() => setBarcodeDisplayValue(!barcodeDisplayValue)}
                className={`relative w-10 h-5 rounded-full transition-colors ${barcodeDisplayValue ? 'bg-accent' : 'bg-border'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${barcodeDisplayValue ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {barcodeDisplayValue && (
              <div className="space-y-3 pt-2">
                <div className="fg">
                  <label className="fl">Custom Label Text (Optional)</label>
                  <input
                    type="text"
                    className="fi text-xs"
                    value={barcodeCustomText}
                    onChange={(e) => setBarcodeCustomText(e.target.value)}
                    placeholder="Leave blank to show barcode number"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="fg">
                    <label className="fl">Text Position</label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setBarcodeTextPosition('bottom')}
                        className={`flex-1 py-1 rounded-lg border text-xs font-bold ${barcodeTextPosition === 'bottom' ? 'bg-accent text-white border-accent' : 'border-border'}`}
                      >
                        Bottom
                      </button>
                      <button
                        type="button"
                        onClick={() => setBarcodeTextPosition('top')}
                        className={`flex-1 py-1 rounded-lg border text-xs font-bold ${barcodeTextPosition === 'top' ? 'bg-accent text-white border-accent' : 'border-border'}`}
                      >
                        Top
                      </button>
                    </div>
                  </div>

                  <div className="fg">
                    <label className="fl">Text Style</label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setBarcodeFontOptions(barcodeFontOptions === 'bold' ? '' : 'bold')}
                        className={`flex-1 py-1 rounded-lg border text-xs font-bold ${barcodeFontOptions === 'bold' ? 'bg-accent text-white border-accent' : 'border-border'}`}
                      >
                        Bold
                      </button>
                      <button
                        type="button"
                        onClick={() => setBarcodeFont(barcodeFont === 'monospace' ? 'sans-serif' : 'monospace')}
                        className="flex-1 py-1 rounded-lg border text-xs font-bold border-border hover:bg-bg-secondary"
                      >
                        {barcodeFont === 'monospace' ? 'Mono' : 'Sans'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="fg">
                    <div className="flex justify-between items-center mb-1">
                      <label className="fl text-[11px] mb-0">Font Size: {barcodeFontSize}px</label>
                    </div>
                    <input 
                      type="range" 
                      min="10" max="28" step="1" 
                      value={barcodeFontSize} 
                      onChange={(e) => setBarcodeFontSize(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </div>
                  <div className="fg">
                    <label className="fl text-[11px] mb-1">Alignment</label>
                    <div className="flex gap-1">
                      {(['left', 'center', 'right'] as const).map((align) => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => setBarcodeTextAlign(align)}
                          className={`flex-1 py-1 rounded-lg border text-[11px] font-bold capitalize transition-colors ${barcodeTextAlign === align ? 'bg-accent text-white border-accent' : 'border-border text-text-secondary hover:bg-bg-secondary'}`}
                        >
                          {align}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Barcode Color Customisation */}
          <div className="pt-4 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                <Palette className="w-4 h-4 text-accent" /> Barcode Colors
              </h3>
              <label className="flex items-center gap-1 text-[11px] font-bold text-accent cursor-pointer">
                <input
                  type="checkbox"
                  checked={barcodeIsTransparentBg}
                  onChange={(e) => setBarcodeIsTransparentBg(e.target.checked)}
                  className="accent-accent"
                />
                Transparent BG
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="fg">
                <label className="fl text-xs">Bars Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={barcodeFgColor}
                    onChange={(e) => setBarcodeFgColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-border"
                  />
                  <input
                    type="text"
                    value={barcodeFgColor}
                    onChange={(e) => setBarcodeFgColor(e.target.value)}
                    className="fi text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div className="fg">
                <label className="fl text-xs">Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    disabled={barcodeIsTransparentBg}
                    value={barcodeBgColor}
                    onChange={(e) => setBarcodeBgColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-border disabled:opacity-30"
                  />
                  <input
                    type="text"
                    disabled={barcodeIsTransparentBg}
                    value={barcodeIsTransparentBg ? 'Transparent' : barcodeBgColor}
                    onChange={(e) => setBarcodeBgColor(e.target.value)}
                    className="fi text-xs font-mono uppercase disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setBarcodeFgColor(p.fg);
                    setBarcodeBgColor(p.bg);
                    setBarcodeIsTransparentBg(false);
                  }}
                  className="px-2 py-1 rounded-lg border border-border text-[10px] font-bold text-text-secondary hover:border-accent hover:text-text-primary transition-all flex items-center gap-1.5"
                >
                  <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: p.fg }} />
                  <span>{p.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Bottom Actions */}
        <div className="sidebar-actions p-4 border-t border-border bg-surface flex flex-col gap-2">
          <div className="flex gap-2">
            {(['png', 'svg', 'jpeg'] as const).map((fmt) => (
              <button 
                key={fmt}
                onClick={() => setBarcodeDownloadFormat(fmt)} 
                className={`flex-1 py-1.5 rounded-xl border font-bold text-xs uppercase transition-all ${
                  barcodeDownloadFormat === fmt ? 'bg-accent text-white border-accent shadow-xs' : 'border-border hover:bg-bg-secondary text-text-secondary'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleDownloadBarcode} 
              disabled={!!barcodeError}
              className="btn bp gap-2 flex-1 py-3 text-xs font-black uppercase tracking-wider shadow-lg shadow-accent/20 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Download Barcode
            </button>
            <button
              onClick={handlePrintBarcode}
              disabled={!!barcodeError}
              title="Quick Print Label"
              className="p-3 rounded-xl border border-border bg-surface hover:bg-bg-secondary transition-colors cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-4 h-4 text-text-secondary" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleOpenPrintSheet}
            disabled={!!barcodeError}
            className="btn bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 gap-2 w-full py-2.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center"
          >
            <Printer className="w-4 h-4" /> Print Multiple Copies / Sheet
          </button>
        </div>
      </aside>

      {/* Right Preview */}
      <main className="tool-main-preview">
        <div className="preview-content-wrapper p-4 lg:p-8 flex flex-col gap-4">
          <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative touch-none bg-bg-secondary/30 rounded-2xl border border-border shadow-inner min-h-[460px]">
            
            {/* Top Toolbar in Preview */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
              <div className="flex items-center gap-2 pointer-events-auto">
                <span className="px-3 py-1 rounded-full bg-surface/90 backdrop-blur-sm border border-border text-xs font-bold text-text-primary shadow-2xs flex items-center gap-1.5">
                  <BarcodeIcon className="w-3.5 h-3.5 text-accent" />
                  <span>{currentBarcodeMeta.name}</span>
                </span>
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={handleOpenPrintSheet}
                  disabled={!!barcodeError}
                  className="px-3 py-1 rounded-full bg-surface/90 hover:bg-surface border border-border text-text-primary font-bold text-[11px] shadow-xs transition-all flex items-center gap-1.5 cursor-pointer hover:border-accent disabled:opacity-50"
                  title="Print multiple copies on A4, Letter, Stickers, etc."
                >
                  <Printer className="w-3.5 h-3.5 text-accent" />
                  <span>Print Copies</span>
                </button>
              </div>
            </div>

            {/* Barcode Preview SVG Container */}
            <div 
              className="p-8 rounded-2xl shadow-xl transition-all flex flex-col items-center justify-center relative overflow-hidden max-w-full"
              style={{ 
                backgroundColor: barcodeIsTransparentBg ? 'transparent' : barcodeBgColor,
                backgroundImage: barcodeIsTransparentBg ? 'repeating-conic-gradient(#cbd5e1 0% 25%, transparent 0% 50%) 50% / 16px 16px' : 'none'
              }}
            >
              <div className="overflow-x-auto max-w-full flex justify-center custom-scrollbar">
                <svg ref={barcodeSvgRef} className="max-w-full h-auto" />
              </div>
              {barcodeError && (
                <div className="mt-3 text-xs text-rose-500 font-bold bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20 text-center">
                  {barcodeError}
                </div>
              )}
            </div>

            {/* Diagnostics Bar */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border shadow-2xs font-mono text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: barcodeFgColor }} />
                <span>COLOR: {barcodeFgColor.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border shadow-2xs text-[11px] font-bold">
                <Settings className="w-3 h-3 text-accent" />
                <span>{barcodeBarWidth}px × {barcodeHeight}px</span>
              </div>
            </div>

            {/* Value Inspector */}
            <div className="mt-4 w-full max-w-md bg-surface p-3 rounded-xl border border-border shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                  <BarcodeIcon className="w-3 h-3 text-accent" />
                  Barcode Payload
                </span>
                <button
                  type="button"
                  onClick={handleCopyPayload}
                  className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1"
                >
                  {copiedPayload ? <CheckCheck className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copiedPayload ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="p-2 rounded-lg bg-bg-secondary text-[11px] font-mono text-text-secondary break-all max-h-16 overflow-y-auto custom-scrollbar">
                {barcodeValue || '<Empty>'}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Multiple Copies / Multi-Paper Size Sheet Printing Modal */}
      <PrintSheetModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="Barcode Print Sheet"
        itemImageSrc={printModalItemImage}
        itemType="barcode"
        initialQrValue={barcodeValue}
      />
    </div>
  );
}
